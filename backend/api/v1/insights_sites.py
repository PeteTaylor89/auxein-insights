"""Pro sites — place a point, watch it populate, read it against its region.

The Pro claim is "your site, interpreted", and the interpretation is the
comparison: this cell against its OWN long-run normal, and against the wine
region it sits in. Both sides of that comparison come out of the same bands and
the same season definition (see `services/insights_site_service`), because a
comparison assembled two different ways measures the methods, not the places.

## Placement is refused rather than fudged

Three refusals, all 4xx with a code the client can act on:

* `off_land_mask` — the point is on a cell the 500 m surface treats as water.
  Common on the coast; the response carries the nearest land cell so the client
  can offer to move there instead of silently relocating the subscriber's site.
* `quota` — every entitled slot is occupied. The point subscription is priced
  per point and stacks, so the fix is another subscription, not an upgrade.
* `move_limit` — the site has used its moves for the year. Without this,
  "one point per subscription" is unenforceable.

## The baseline is ONE parameter applied to BOTH sides

`/monthly` and `/season` take a `baseline` and use it for the site normal AND
the regional normal. Letting them differ would be the easiest way to
manufacture an anomaly that is really just two different reference periods.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.entitlements import require_pro, site_quota
from db.models.insights_site import (
    InsightsSite, MOVES_PER_WINDOW, MOVE_WINDOW_DAYS,
)
from db.models.public_user import PublicUser
from db.session import get_db
from services import insights_site_service as svc
from services import insights_dashboard as dashboard
from services import workflow_dispatch

log = logging.getLogger(__name__)
router = APIRouter()

# WMO standard normal, and it sits wholly inside the 1986-2023 archive. Not
# 1986-2005: that is the r99p baseline, chosen for an extremes threshold, and
# reusing it as the everyday normal would quietly make every site look warmer
# than it is against a period that ends 20 years ago.
DEFAULT_BASELINE = "1991-2020"


class PlaceSiteRequest(BaseModel):
    latitude: float = Field(..., ge=-48.5, le=-33.0)
    longitude: float = Field(..., ge=165.0, le=180.0)
    label: Optional[str] = Field(None, max_length=80)


class SiteResponse(BaseModel):
    id: int
    label: Optional[str]
    latitude: float
    longitude: float
    status: str
    status_detail: Optional[str] = None
    slot_index: int
    zone_id: Optional[int] = None
    zone_name: Optional[str] = None
    zone_slug: Optional[str] = None
    populated_at: Optional[str] = None
    moves_used: int = 0
    moves_allowed: int = MOVES_PER_WINDOW
    company_id: Optional[int] = None


def _parse_baseline(baseline: str) -> tuple[int, int]:
    # `check_insights_sites.py` calls these router functions DIRECTLY — the venv
    # has no httpx — so an untouched `Query(...)` default arrives as a Query
    # object rather than the string it stands for. Resolve it here, once, rather
    # than making every direct caller pass a baseline it does not care about.
    if not isinstance(baseline, str):
        baseline = DEFAULT_BASELINE
    try:
        lo, hi = (int(p) for p in baseline.split("-"))
    except Exception:                                               # noqa: BLE001
        raise HTTPException(422, f"baseline must be 'YYYY-YYYY', got {baseline!r}")
    if hi <= lo:
        raise HTTPException(422, "baseline end must be after its start")
    return lo, hi


def _serialise(db: Session, site: InsightsSite) -> SiteResponse:
    zone = None
    if site.zone_id:
        zone = db.execute(text("SELECT name, slug FROM climate_zones WHERE id = :i"),
                          {"i": site.zone_id}).mappings().first()
    return SiteResponse(
        id=site.id, label=site.label, latitude=site.latitude,
        longitude=site.longitude, status=site.status,
        status_detail=site.status_detail, slot_index=site.slot_index,
        zone_id=site.zone_id,
        zone_name=zone["name"] if zone else None,
        zone_slug=zone["slug"] if zone else None,
        populated_at=site.populated_at.isoformat() if site.populated_at else None,
        moves_used=site.moves_used or 0, company_id=site.company_id,
    )


def _owned(db: Session, site_id: int, user: PublicUser) -> InsightsSite:
    site = db.query(InsightsSite).filter(InsightsSite.id == site_id).first()
    # 404 rather than 403 for someone else's site: confirming that an id exists
    # tells an outsider how many sites the platform has and who holds them.
    if not site or site.public_user_id != user.id:
        raise HTTPException(404, "No such site.")
    return site


@router.get("/sites")
def list_sites(db: Session = Depends(get_db),
               user: PublicUser = Depends(require_pro)):
    sites = (db.query(InsightsSite)
               .filter(InsightsSite.public_user_id == user.id)
               .order_by(InsightsSite.slot_index).all())
    quota = site_quota(user)
    return {
        "sites": [_serialise(db, s) for s in sites],
        # Stated explicitly and always, not only on refusal. "One point per
        # subscription" has to be visible BEFORE someone places, or the limit
        # reads as a bait-and-switch when they meet it.
        "quota": {"entitled": quota, "used": len(sites),
                  "remaining": max(0, quota - len(sites)),
                  "per_subscription": 1,
                  "note": "Each point subscription carries one saved site. "
                          "Additional subscriptions add further sites."},
        "moves": {"per_window": MOVES_PER_WINDOW, "window_days": MOVE_WINDOW_DAYS},
    }


@router.post("/sites", status_code=202)
def place_site(body: PlaceSiteRequest,
               background: BackgroundTasks = None,
               db: Session = Depends(get_db),
               user: PublicUser = Depends(require_pro)):
    """Claim a slot and queue the extraction. 202: the work has not happened yet."""
    held = (db.query(InsightsSite)
              .filter(InsightsSite.public_user_id == user.id).count())
    quota = site_quota(user)
    if held >= quota:
        raise HTTPException(402, {
            "code": "quota",
            "message": (f"Your subscription covers {quota} "
                        f"site{'' if quota == 1 else 's'} and "
                        f"{held} {'is' if held == 1 else 'are'} in use. "
                        "Each additional point is a separate subscription."),
            "entitled": quota, "used": held})

    try:
        cell = svc.resolve_cell(db, body.latitude, body.longitude)
    except svc.PlacementError as exc:
        raise HTTPException(422, {"code": exc.code, "message": exc.message,
                                  **exc.detail})

    used_slots = {s.slot_index for s in db.query(InsightsSite)
                  .filter(InsightsSite.public_user_id == user.id).all()}
    slot = next(i for i in range(quota + 1) if i not in used_slots)

    site = InsightsSite(
        public_user_id=user.id,
        company_id=svc.company_for(db, user.id),
        slot_index=slot,
        label=body.label,
        latitude=body.latitude, longitude=body.longitude,
        grid_row=cell["row"], grid_col=cell["col"], grid_key=cell["grid_key"],
        zone_id=svc.resolve_zone(db, body.latitude, body.longitude),
        status="populating",
    )
    db.add(site)
    db.commit()
    db.refresh(site)
    log.info("site %s placed by public_user %s", site.id, user.id)
    # Ask Actions to start now rather than at the next */5 sweep. AFTER the
    # response, because the customer should not wait on a call to GitHub, and
    # never blocking: `workflow_dispatch` swallows every failure and the site
    # stays queued for the sweep either way. `background` is None when the
    # router function is called directly (the acceptance suite), which is also
    # exactly when we do not want to fire a real workflow.
    if background is not None:
        background.add_task(workflow_dispatch.populate_site, site.id)
    return {
        "site": _serialise(db, site),
        # The message the UI shows while the job runs. Named here so the API and
        # the UI cannot drift into promising different things.
        "message": ("We're building the climate history for this site. "
                    "It usually takes a few minutes."),
    }


@router.patch("/sites/{site_id}")
def update_site(site_id: int, body: PlaceSiteRequest,
                background: BackgroundTasks = None,
                db: Session = Depends(get_db),
                user: PublicUser = Depends(require_pro)):
    """Rename and/or move. Moving re-queues the extraction and spends an allowance."""
    site = _owned(db, site_id, user)
    moved = (abs(body.latitude - site.latitude) > 1e-9
             or abs(body.longitude - site.longitude) > 1e-9)

    if body.label is not None:
        site.label = body.label

    if moved:
        try:
            svc.check_move_allowed(site)
            cell = svc.resolve_cell(db, body.latitude, body.longitude)
        except svc.PlacementError as exc:
            status = 429 if exc.code == "move_limit" else 422
            raise HTTPException(status, {"code": exc.code,
                                         "message": exc.message, **exc.detail})
        svc.record_move(site)
        site.latitude, site.longitude = body.latitude, body.longitude
        site.grid_row, site.grid_col = cell["row"], cell["col"]
        site.grid_key = cell["grid_key"]
        site.zone_id = svc.resolve_zone(db, body.latitude, body.longitude)
        # The existing rows stay until the new extraction succeeds — a moved
        # site showing its old record for a few minutes beats showing nothing.
        site.status = "populating"
        site.status_detail = None

    db.commit()
    db.refresh(site)
    # A move re-queues the extraction, so it needs the same head start as a
    # placement. A rename does not — nothing was re-queued.
    if moved and background is not None:
        background.add_task(workflow_dispatch.populate_site, site.id)
    return {"site": _serialise(db, site), "repopulating": moved}


@router.delete("/sites/{site_id}", status_code=204)
def delete_site(site_id: int, db: Session = Depends(get_db),
                user: PublicUser = Depends(require_pro)):
    """Release the slot. Cascades to the extracted rows."""
    db.delete(_owned(db, site_id, user))
    db.commit()


@router.get("/sites/{site_id}")
def get_site(site_id: int, db: Session = Depends(get_db),
             user: PublicUser = Depends(require_pro)):
    return {"site": _serialise(db, _owned(db, site_id, user))}


@router.get("/sites/{site_id}/season")
def site_season(site_id: int,
                metrics: Optional[str] = Query(None),
                db: Session = Depends(get_db),
                user: PublicUser = Depends(require_pro)):
    """Per-vintage site values beside the regional spread for the same metric.

    The zone side carries `mean` AND `p10`/`p90` — the spread across real
    vineyards in the region — because "warmer than the regional mean" is a much
    weaker statement than "outside the range 90% of the region sits in".
    """
    site = _owned(db, site_id, user)
    if site.status != "ready":
        raise HTTPException(409, {"code": site.status,
                                  "message": "This site is still populating."
                                  if site.status == "populating"
                                  else (site.status_detail or "Population failed.")})

    wanted = [m.strip() for m in metrics.split(",")] if metrics else None
    rows = db.execute(text("""
        SELECT s.vintage_year, s.metric, s.value, s.unit,
               z.mean AS zone_mean, z.p10 AS zone_p10, z.p90 AS zone_p90
          FROM insights_site_season s
          LEFT JOIN climate_zone_surface_season z
                 ON z.zone_id = :zid AND z.vintage_year = s.vintage_year
                AND z.metric = s.metric
         WHERE s.site_id = :sid
           AND (:all OR s.metric = ANY(:metrics))
         ORDER BY s.metric, s.vintage_year
    """), {"sid": site.id, "zid": site.zone_id,
           "all": wanted is None, "metrics": wanted or []}).mappings().all()

    series: dict = {}
    for r in rows:
        entry = series.setdefault(r["metric"], {"metric": r["metric"],
                                                "unit": r["unit"], "points": []})
        entry["points"].append({
            "vintage": r["vintage_year"], "value": r["value"],
            "zone_mean": r["zone_mean"], "zone_p10": r["zone_p10"],
            "zone_p90": r["zone_p90"],
        })
    return {
        "site": _serialise(db, site),
        "series": list(series.values()),
        "meta": {
            "season": "Sep-Apr, labelled by the ending (vintage) year",
            # A site is one cell and has no spread of its own; the zone's spread
            # is across planted cells. Saying so stops a reader treating the two
            # ranges as comparable quantities.
            "site_spread": "none — a site is a single 500 m cell",
            "zone_spread": "across planted cells, weighted by hectares",
            "regional_comparison": site.zone_id is not None,
            "omitted": ["r99p"],
            "omitted_reason": ("r99p needs the wet-day tail bands and is not yet "
                               "derived per site; showing it computed a different "
                               "way from the regional figure would compare "
                               "methods, not places."),
        },
    }


@router.get("/sites/{site_id}/dashboard")
def site_dashboard(site_id: int,
                   baseline: str = Query(DEFAULT_BASELINE),
                   db: Session = Depends(get_db),
                   user: PublicUser = Depends(require_pro)):
    """Everything a subscriber sees on opening their site.

    Two panels from two sources, kept apart on purpose — see
    `services/insights_dashboard`. The tiles are the site's own 1986-2023
    record; the season strip is station data at regional scale, because no live
    surface exists yet.
    """
    site = _owned(db, site_id, user)
    if site.status != "ready":
        raise HTTPException(409, {"code": site.status,
                                  "message": "This site is still populating."
                                  if site.status == "populating"
                                  else (site.status_detail or "Population failed.")})
    lo, hi = _parse_baseline(baseline)
    # The ORM row, not the serialised response — the builder needs `zone_id`
    # and the site's primary key, and a schema object is not the place to add
    # them just so this call type-checks.
    payload = dashboard.build(db, site, (lo, hi))
    payload["site"] = _serialise(db, site)
    return payload


@router.get("/sites/{site_id}/monthly")
def site_monthly(site_id: int,
                 variable: str = Query("temp_mean"),
                 statistic: str = Query("mean"),
                 baseline: str = Query(DEFAULT_BASELINE),
                 db: Session = Depends(get_db),
                 user: PublicUser = Depends(require_pro)):
    """Month-by-month at this site, against its own normal and its region's.

    One `baseline` drives both normals. Two reference periods would produce an
    anomaly that is an artefact of the periods rather than of the place.
    """
    site = _owned(db, site_id, user)
    if site.status != "ready":
        raise HTTPException(409, {"code": site.status,
                                  "message": "This site is still populating."})
    lo, hi = _parse_baseline(baseline)

    points = db.execute(text("""
        SELECT year, month, value FROM insights_site_monthly
         WHERE site_id = :sid AND variable = :v AND statistic = :s
         ORDER BY year, month
    """), {"sid": site.id, "v": variable, "s": statistic}).mappings().all()
    if not points:
        raise HTTPException(404, f"This site holds no {variable}/{statistic}.")

    site_normal = {r["month"]: r["avg"] for r in db.execute(text("""
        SELECT month, avg(value) AS avg FROM insights_site_monthly
         WHERE site_id = :sid AND variable = :v AND statistic = :s
           AND year BETWEEN :lo AND :hi AND value IS NOT NULL
         GROUP BY month
    """), {"sid": site.id, "v": variable, "s": statistic,
           "lo": lo, "hi": hi}).mappings().all()}

    zone_normal = {}
    if site.zone_id:
        zone_normal = {r["month"]: r["avg"] for r in db.execute(text("""
            SELECT month, avg(mean) AS avg FROM climate_zone_surface_monthly
             WHERE zone_id = :zid AND variable = :v AND statistic = :s
               AND year BETWEEN :lo AND :hi AND mean IS NOT NULL
             GROUP BY month
        """), {"zid": site.zone_id, "v": variable, "s": statistic,
               "lo": lo, "hi": hi}).mappings().all()}

    return {
        "site": _serialise(db, site),
        "variable": variable, "statistic": statistic,
        "points": [{"valid_at": f"{r['year']}-{r['month']:02d}",
                    "value": r["value"],
                    "site_normal": site_normal.get(r["month"]),
                    "zone_normal": zone_normal.get(r["month"]),
                    "anomaly": (r["value"] - site_normal[r["month"]]
                                if r["value"] is not None
                                and site_normal.get(r["month"]) is not None
                                else None)}
                   for r in points],
        "meta": {"baseline": baseline,
                 "baseline_applies_to": "both the site and the regional normal",
                 "regional_comparison": site.zone_id is not None,
                 "n_months": len(points)},
    }
