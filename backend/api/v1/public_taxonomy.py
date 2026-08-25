"""Public country and industry registry — the two axes the site is scoped by.

Phase 1 of `docs/plans/COUNTRY_INDUSTRY_REGIONS_2026-08-24.md`.

These replace two hardcoded frontend lists: the `INDUSTRIES` array in
`components/home/IndustryChips.jsx`, and the implicit assumption of New Zealand
that runs through 16 files. Both endpoints return `is_active` so the client
never again hardcodes what is available — a pill or a switcher entry becomes
live by flipping a boolean in the database, not by shipping a bundle.

**Public and unauthenticated on purpose.** They feed the URL resolver
(`/nz/wine/marlborough`), which has to work for an anonymous crawler or the
region pages forfeit the organic search value that is the whole reason they
exist. No auth dependency is declared at all — note that adding an `HTTPBearer`
here, even an "optional" one, would 403 every anonymous request before the
handler ran (`auto_error=True` fires during dependency resolution).

Ordering is `display_order` then name, so the client renders in the order the
database intends and does not re-sort.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from db.session import get_db

router = APIRouter()


class CountryOut(BaseModel):
    """One country the site can be scoped to.

    `hemisphere`, `vintage_start_month` and `season_start_month` are exposed
    because the client formats season labels ("2025-26") and axis ranges from
    them. Without those the frontend re-derives a Southern Hemisphere
    convention it has no business knowing.
    """
    id: int
    iso2: str
    # Exposed so the client can recognise an ISO3 alias in the URL
    # (`/aus/wine`) and redirect to the canonical ISO2 address.
    iso3: Optional[str] = None
    name: str
    hemisphere: str
    vintage_start_month: int
    season_start_month: int
    default_timezone: str
    is_active: bool

    class Config:
        from_attributes = True


class IndustryOut(BaseModel):
    """One primary industry.

    `icon` names a lucide-react export (`Grape`, `Leaf`, ...) so the chips keep
    their glyphs without a second source of truth. `is_active` false means the
    chip renders as pending and links to the contact form.
    """
    id: int
    key: str
    name: str
    icon: Optional[str] = None
    is_active: bool

    class Config:
        from_attributes = True


class CountriesResponse(BaseModel):
    countries: List[CountryOut]


class IndustriesResponse(BaseModel):
    industries: List[IndustryOut]


@router.get("/countries", response_model=CountriesResponse)
def list_countries(
    active_only: bool = Query(
        False,
        description="Return only countries with data. The switcher uses this; "
                    "admin tooling wants the full list."),
    db: Session = Depends(get_db),
):
    """Every country in the registry, in display order.

    Australia is present but inactive — it exists so the Australian ingest work
    has a `country_id` to attach to without needing a migration first.
    """
    rows = db.execute(text("""
        SELECT id, iso2, iso3, name, hemisphere, vintage_start_month,
               season_start_month, default_timezone, is_active
          FROM countries
         WHERE (:active_only = false OR is_active = true)
         ORDER BY display_order, name
    """), {"active_only": active_only}).mappings().all()

    return CountriesResponse(countries=[CountryOut(**r) for r in rows])


@router.get("/industries", response_model=IndustriesResponse)
def list_industries(
    active_only: bool = Query(
        False,
        description="Return only industries with data. The pills want the full "
                    "list — a pending industry is a lead, not noise."),
    db: Session = Depends(get_db),
):
    """Every industry, in display order. Wine is the only active one."""
    rows = db.execute(text("""
        SELECT id, key, name, icon, is_active
          FROM industries
         WHERE (:active_only = false OR is_active = true)
         ORDER BY display_order, name
    """), {"active_only": active_only}).mappings().all()

    return IndustriesResponse(industries=[IndustryOut(**r) for r in rows])


@router.get("/resolve", response_model=dict)
def resolve_scope(
    country: str = Query(..., description="ISO2, case-insensitive, e.g. 'nz'"),
    industry: str = Query(..., description="Industry key, e.g. 'wine'"),
    db: Session = Depends(get_db),
):
    """Validate a `/{country}/{industry}/...` URL prefix in one round trip.

    The router needs to know three things before it can render: do these exist,
    are they both active, and what are their ids. Asking for the two full lists
    and intersecting them client-side works but means the 404 decision is made
    after two requests have resolved, which shows a flash of the wrong page.

    404 when either is unknown — an unknown scope is a genuinely missing page
    and should be crawled as one. A KNOWN but inactive pair is **200 with
    `active: false`**, not 404: Australia is a real place we intend to cover,
    and the right response is a "coming soon" page that can rank, not a hole.
    """
    row = db.execute(text("""
        SELECT c.id   AS country_id,  c.iso2, c.name AS country_name,
               c.is_active AS country_active,
               i.id   AS industry_id, i.key,  i.name AS industry_name,
               i.is_active AS industry_active
          FROM countries c
          CROSS JOIN industries i
         WHERE lower(c.iso2) = lower(:country)
           AND lower(i.key)  = lower(:industry)
    """), {"country": country, "industry": industry}).mappings().first()

    if not row:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown scope: country '{country}', industry '{industry}'")

    return {
        "country": {
            "id": row["country_id"],
            "iso2": row["iso2"],
            "name": row["country_name"],
            "is_active": row["country_active"],
        },
        "industry": {
            "id": row["industry_id"],
            "key": row["key"],
            "name": row["industry_name"],
            "is_active": row["industry_active"],
        },
        "active": bool(row["country_active"] and row["industry_active"]),
    }
