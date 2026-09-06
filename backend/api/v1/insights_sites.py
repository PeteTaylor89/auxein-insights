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

## And it is ONE period across the whole Pro page

Every panel — tiles, season strip, season-by-season, month-by-month and the
projections — reads the same 1986-2005 normal. See `PRO_BASELINE` below for
why that period and not the WMO one.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
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
from services import insights_site_baseline as site_baseline
from services import phenology_basis as basis
from services.insights_dashboard import PHENOLOGY_HARVEST_TARGETS
from services import site_water as water
from services import workflow_dispatch
from scripts.disease_service_v2 import BacchusModel

log = logging.getLogger(__name__)
router = APIRouter()

# 1986-2005, not the 1991-2020 WMO normal, and the reason is comparability
# rather than convention.
#
# 1. **The SSP projections are deltas measured off 1986-2005.** Applying one to
#    a 1991-2020 normal double-counts the warming between the two periods, so a
#    projections panel on this page is only arithmetically sound if the page's
#    normal is the period the deltas came from.
# 2. **The only DAILY climatology that exists is 1986-2005** —
#    `climate_zone_daily_baseline`, which is what a current-season curve is
#    plotted against. A season strip on one period beside tiles on another would
#    put two normals on one screen with no way to tell them apart.
# 3. `aggregate_zone_season` already defaults to 1986-2005 for r99p, and
#    `climate_zone_surface_season.baseline` records it, so the zone side of every
#    comparison was partly on this period already.
#
# The cost is real and is stated on the page rather than hidden: against a
# period ending in 2005, every site reads warmer than it would against
# 1991-2020. That is a true statement about a warming climate, but it is a
# visible change to numbers subscribers have already seen.
#
# Sourced from the baseline service so the API and the curve builder cannot
# drift apart.
PRO_BASELINE = f"{site_baseline.BASELINE_LO}-{site_baseline.BASELINE_HI}"


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
        baseline = PRO_BASELINE
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


def _is_member(db: Session, account_id: int, user_id: int) -> Optional[str]:
    """This user's role on that account, or None. Suspended accounts read None.

    A suspended account KEEPS its sites and its extracted history — suspension
    is not deletion — so the check has to be on the account's status here rather
    than on the rows existing.
    """
    return db.execute(text("""
        SELECT m.role
          FROM insights_account_member m
          JOIN insights_account a ON a.id = m.account_id
         WHERE m.account_id = :acc AND m.public_user_id = :uid
           AND a.status = 'active'
    """), {"acc": account_id, "uid": user_id}).scalar()


def _owned(db: Session, site_id: int, user: PublicUser) -> InsightsSite:
    """A site this caller may read: their own slot, or their account's.

    ACCOUNT SITES CARRY NO `public_user_id`. Before enterprise accounts existed
    this compared `site.public_user_id != user.id` and nothing else, which meant
    every account-owned site — all 67 of the first client's — 404'd for every
    caller including its own members. Every route in this file goes through
    here, so this one function is what makes them reachable.
    """
    site = db.query(InsightsSite).filter(InsightsSite.id == site_id).first()
    # 404 rather than 403 for someone else's site: confirming that an id exists
    # tells an outsider how many sites the platform has and who holds them.
    if not site:
        raise HTTPException(404, "No such site.")
    if site.public_user_id and site.public_user_id == user.id:
        return site
    if site.account_id and _is_member(db, site.account_id, user.id):
        return site
    raise HTTPException(404, "No such site.")


def _account(db: Session, slug: str, user: PublicUser) -> dict:
    """An account this caller belongs to, or 404. Never 403 — same reason."""
    row = db.execute(text("""
        SELECT a.id, a.slug, a.name, a.status, m.role
          FROM insights_account a
          JOIN insights_account_member m ON m.account_id = a.id
         WHERE a.slug = :slug AND m.public_user_id = :uid
           AND a.status = 'active'
    """), {"slug": slug, "uid": user.id}).mappings().first()
    if not row:
        raise HTTPException(404, "No such account.")
    return dict(row)


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
        metric = r["metric"]
        # Frost is the regional average and nothing else on this chart. The
        # site's own value and the planted spread are BOTH withheld: the value
        # because the surfaces cannot resolve cold-air pooling, the spread
        # because drawing a site inside or outside it is exactly the
        # site-versus-neighbour claim the model cannot support. See
        # `insights_site_service.FROST_METRICS`.
        regional_only = metric in svc.FROST_METRICS
        entry = series.setdefault(metric, {
            "metric": metric, "unit": r["unit"], "points": [],
            "regional_only": regional_only,
            "regional_only_reason": svc.FROST_DISCLAIMER if regional_only else None,
        })
        entry["points"].append({
            "vintage": r["vintage_year"],
            "value": None if regional_only else r["value"],
            "zone_mean": r["zone_mean"],
            "zone_p10": None if regional_only else r["zone_p10"],
            "zone_p90": None if regional_only else r["zone_p90"],
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
            # Not an omission — the metric IS here, at regional scale, which is
            # the scale it is defensible at. Listed separately from `omitted`
            # for that reason.
            "regional_only": sorted(svc.FROST_METRICS & set(series)),
            "regional_only_reason": svc.FROST_DISCLAIMER,
            "omitted": ["r99p"],
            "omitted_reason": ("r99p needs the wet-day tail bands and is not yet "
                               "derived per site; showing it computed a different "
                               "way from the regional figure would compare "
                               "methods, not places."),
        },
    }


@router.get("/sites/{site_id}/dashboard")
def site_dashboard(site_id: int,
                   baseline: str = Query(PRO_BASELINE),
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
                 baseline: str = Query(PRO_BASELINE),
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
        # The period ACTUALLY used, rebuilt from the parsed bounds rather than
        # echoing the parameter. They differ whenever the default is in play and
        # the caller is not FastAPI — `check_insights_sites` calls this function
        # directly, so an untouched `Query(...)` arrives as a Query object and
        # would be reported to the client as the baseline.
        "meta": {"baseline": f"{lo}-{hi}",
                 "baseline_applies_to": "both the site and the regional normal",
                 "regional_comparison": site.zone_id is not None,
                 "n_months": len(points)},
    }


@router.get("/sites/{site_id}/projections")
def site_projections(site_id: int,
                     season: str = Query("ANN"),
                     db: Session = Depends(get_db),
                     user: PublicUser = Depends(require_pro)):
    """What this site looks like under each scenario, against its own baseline.

    The point-level answer to the question the region pages answer for a whole
    zone. `delta` is the number to read: it is `projected - baseline` at THIS
    cell, where the baseline is our own 1986-2005 normal sampled from the same
    raster family the projection was composed from.

    ## The zone figure is returned beside it, deliberately

    A projected delta is meaningless without something to size it against, and
    the honest comparison is the region the site sits in — measured at Fancrest
    on 2026-08-31, the site and Waipara agree to 0.03 degC across all sixteen
    scenario-periods, and that near-constant offset is the point being made:
    a site is not its region, but for a change signal it is very close to it,
    and a customer should be able to see that rather than be told it.

    ## SEPAPR is not available for temperature or rainfall

    Only `gdd10.cumulative` is published for the growing season. Everything else
    exists as ANN plus the four meteorological seasons, so the default here is
    ANN rather than the SEPAPR the rest of the site product uses. Asking for a
    season a band does not carry returns an empty list rather than an error —
    the caller is choosing from a menu this endpoint also supplies.
    """
    site = _owned(db, site_id, user)
    if site.status != "ready":
        raise HTTPException(409, {"code": site.status,
                                  "message": "This site is still populating."})

    rows = db.execute(text("""
        SELECT p.scenario, p.period, p.season, p.variable, p.statistic,
               p.baseline_value, p.projected_value, p.delta, p.unit,
               p.grid_key, zp.delta_mean AS zone_delta
          FROM insights_site_projection p
          LEFT JOIN climate_zone_projection zp
                 ON zp.zone_id   = :zid
                AND zp.scenario  = p.scenario
                AND zp.period    = p.period
                AND zp.season    = p.season
                AND zp.variable  = p.variable
                AND zp.statistic = p.statistic
         WHERE p.site_id = :sid AND p.season = :season
         ORDER BY p.variable, p.statistic, p.scenario, p.period
    """), {"sid": site.id, "zid": site.zone_id,
           "season": season}).mappings().all()

    # Every season this site actually holds, so the client builds its selector
    # from the data rather than from a hard-coded list that will disagree with
    # what is published the first time a band is added.
    seasons = [r[0] for r in db.execute(text(
        "SELECT DISTINCT season FROM insights_site_projection "
        "WHERE site_id = :sid ORDER BY season"), {"sid": site.id}).all()]

    # A row sampled before the site was moved describes the OLD cell. Saying so
    # is cheap; discovering it from a number that looks fine is not.
    stale = sorted({r["grid_key"] for r in rows
                    if r["grid_key"] and r["grid_key"] != site.grid_key})

    return {
        "site": _serialise(db, site),
        "season": season,
        "seasons": seasons,
        "baseline_period": "1986-2005",
        "stale_cells": stale,
        "points": [{
            "scenario": r["scenario"], "period": r["period"],
            "variable": r["variable"], "statistic": r["statistic"],
            "baseline": r["baseline_value"],
            "projected": r["projected_value"],
            "delta": r["delta"],
            "zone_delta": r["zone_delta"],
            "unit": r["unit"],
        } for r in rows],
    }


@router.get("/sites/{site_id}/phenology")
def site_phenology(site_id: int,
                   vintage: Optional[int] = Query(None),
                   db: Session = Depends(get_db),
                   user: PublicUser = Depends(require_pro)):
    """Phenology at THIS SITE's cell, with the region's figure beside it.

    Until 2026-08-31 the Pro page rendered `phenology_estimates`, which is keyed
    on `zone_id` — so a subscriber's own point showed their region's dates while
    looking site-specific. This reads `insights_site_phenology`, computed from
    the site's own accumulation against its own 1986-2005 baseline.

    ## The variety row shape is deliberately the zone payload's

    `_phenology_varieties` in `services/insights_dashboard` already defines what
    a variety row looks like and `PhenologyPanel` already renders it. Returning
    a different shape here would mean two renderers for one table, which drift.
    What is ADDED is a `zone` block per variety and a `spread` block per stage.

    ## The basis test runs here too, and on both sides

    `basis.classify` decides whether a date is fit to show. The service already
    refuses to STORE a projection made from no accumulation; this applies the
    second test — a date must land inside its own vintage — which depends on the
    season being asked about and so cannot be settled at write time.

    ## The spread is across THIS ACCOUNT's sites, never everyone's

    A client with 25 sites in the Marlborough zones has a real distribution to
    show. A lone Pro subscriber has none, and filling it from other subscribers'
    points would leak their placements, which are the thing they pay for.
    Absent is the correct answer for a single site.
    """
    site = _owned(db, site_id, user)
    if site.status != "ready":
        raise HTTPException(409, {"code": site.status,
                                  "message": "This site is still populating."})

    if vintage is None:
        vintage = db.execute(text(
            "SELECT max(vintage_year) FROM insights_site_phenology "
            "WHERE site_id = :sid"), {"sid": site.id}).scalar()
    if vintage is None:
        return {"site": _serialise(db, site), "scope": "site",
                "available": False,
                "reason": "This site has no phenology estimates yet.",
                "varieties": []}

    rows = db.execute(text("""
        SELECT DISTINCT ON (p.variety_code)
               p.variety_code, p.estimate_date, p.gdd_accumulated,
               p.current_stage, p.avg_daily_gdd,
               p.flowering_date, p.flowering_is_actual,
               p.veraison_date, p.veraison_is_actual,
               p.harvest_210_date, p.harvest_220_date,
               p.days_vs_baseline, p.gdd_vs_baseline, p.baseline_source,
               p.zone_gdd_accumulated, p.zone_flowering_date,
               p.zone_veraison_date, p.zone_harvest_210_date,
               t.variety_name, t.gdd_flowering, t.gdd_veraison
          FROM insights_site_phenology p
          LEFT JOIN phenology_thresholds t ON t.variety_code = p.variety_code
         WHERE p.site_id = :sid AND p.vintage_year = :v
         ORDER BY p.variety_code, p.estimate_date DESC
    """), {"sid": site.id, "v": vintage}).mappings().all()

    season_start, season_end = site_baseline.season_bounds(vintage)
    today = datetime.now(timezone.utc).date()

    # Sibling sites: same account, same zone, same vintage, latest estimate per
    # site. Scoped to the account for the reason in the docstring.
    siblings = []
    if site.account_id and site.zone_id:
        siblings = db.execute(text("""
            SELECT DISTINCT ON (p.site_id, p.variety_code)
                   p.site_id, p.variety_code, p.gdd_accumulated,
                   p.flowering_date, p.veraison_date, p.harvest_210_date
              FROM insights_site_phenology p
              JOIN insights_site s ON s.id = p.site_id
             WHERE s.account_id = :acc AND s.zone_id = :z
               AND p.vintage_year = :v
             ORDER BY p.site_id, p.variety_code, p.estimate_date DESC
        """), {"acc": site.account_id, "z": site.zone_id,
               "v": vintage}).mappings().all()

    def spread_for(variety: str, column: str) -> Optional[dict]:
        """Earliest / median / latest of one date across the account's sites.

        Three is the floor. A spread over two points is a pair, and printing one
        as a distribution invites a reader to see a range where there is only a
        difference.
        """
        values = sorted(r[column] for r in siblings
                        if r["variety_code"] == variety and r[column])
        if len(values) < 3:
            return None
        mid = values[len(values) // 2]
        return {"earliest": values[0].isoformat(),
                "median": mid.isoformat(),
                "latest": values[-1].isoformat(),
                "n_sites": len(values)}

    varieties, any_shown = [], False
    for r in rows:
        gdd = float(r["gdd_accumulated"]) if r["gdd_accumulated"] is not None else None
        stages_in = {
            "flowering": (r["flowering_date"], r["flowering_is_actual"],
                          "flowering_date"),
            "veraison": (r["veraison_date"], r["veraison_is_actual"],
                         "veraison_date"),
            "harvest_210": (r["harvest_210_date"], False, "harvest_210_date"),
            "harvest_220": (r["harvest_220_date"], False, None),
        }
        shown = {}
        for key, (value, is_actual, sib_col) in stages_in.items():
            status = basis.classify(value, is_actual, gdd,
                                    season_start, season_end)
            ok = basis.is_shown(status)
            any_shown = any_shown or ok
            shown[key] = {
                # The date travels ONLY when it is fit to show. A withheld date
                # left in the payload is a withheld date the next client renders.
                "date": value.isoformat() if (value and ok) else None,
                "is_actual": bool(is_actual),
                "status": status,
                "spread": spread_for(r["variety_code"], sib_col) if sib_col else None,
            }

        # Only the next stage carries a live prediction; everything past it says
        # what has to happen first. Applied HERE rather than in the panel so the
        # site page, the region page and the portfolio table cannot disagree
        # about how far the model can see.
        progress = basis.stage_progress(shown, today)
        for key, state in progress.items():
            if key in shown:
                shown[key].update(state)
                if state["role"] == "awaiting":
                    shown[key]["date"] = None
                    shown[key]["spread"] = None

        varieties.append({
            "code": r["variety_code"],
            "name": r["variety_name"] or r["variety_code"],
            "stage": r["current_stage"],
            "gdd": gdd,
            "gdd_flowering": float(r["gdd_flowering"]) if r["gdd_flowering"] else None,
            "gdd_veraison": float(r["gdd_veraison"]) if r["gdd_veraison"] else None,
            "days_vs_baseline": r["days_vs_baseline"],
            "gdd_vs_baseline": (float(r["gdd_vs_baseline"])
                                if r["gdd_vs_baseline"] is not None else None),
            "baseline_source": r["baseline_source"],
            "avg_daily_gdd": (float(r["avg_daily_gdd"])
                              if r["avg_daily_gdd"] is not None else None),
            # The region, already basis-tested when it was stored. A zone date
            # projected from zero accumulation is withheld on both sides, or a
            # blank site column beside a confident region column would read as
            # "this site is late".
            "zone": {
                "gdd": (float(r["zone_gdd_accumulated"])
                        if r["zone_gdd_accumulated"] is not None else None),
                "flowering": r["zone_flowering_date"].isoformat()
                if r["zone_flowering_date"] else None,
                "veraison": r["zone_veraison_date"].isoformat()
                if r["zone_veraison_date"] else None,
                "harvest_210": r["zone_harvest_210_date"].isoformat()
                if r["zone_harvest_210_date"] else None,
            },
            "stages": shown,
            "next_stage": basis.next_stage(progress),
        })

    return {
        "site": _serialise(db, site),
        "scope": "site",
        "available": bool(varieties),
        "vintage_year": vintage,
        "estimated_at": rows[0]["estimate_date"].isoformat() if rows else None,
        "harvest_targets": [{"sugar_g_l": g, "brix": b}
                            for g, b in PHENOLOGY_HARVEST_TARGETS],
        "predictions_available": any_shown,
        "predictions_reason": None if any_shown else basis.no_basis_reason(),
        "varieties": varieties,
    }


# --- the season in progress, as a curve --------------------------------------


# The three a grower actually watches, and the shape each one has to be drawn
# in. GDD and rainfall ACCUMULATE — the season's story is the running total
# pulling ahead of or behind the curve, and a daily bar chart of either tells
# nobody anything. Mean temperature does not accumulate: its daily value against
# a smooth climatology is the comparison, and a running mean would flatten the
# cold snap that is the whole reason to look.
SEASON_SERIES_METRICS = [
    ("gdd10", "Growing degree days", "GDD", True),
    ("tmean", "Mean temperature", "°C", False),
    ("rain", "Rainfall", "mm", True),
]


@router.get("/sites/{site_id}/season-series")
def site_season_series(site_id: int,
                       vintage: Optional[int] = Query(None),
                       db: Session = Depends(get_db),
                       user: PublicUser = Depends(require_pro)):
    """This season day by day: the site, its own baseline, and its region.

    The tiles above this on the page answer "how is the season going" with three
    numbers. They cannot answer "when did it go wrong", which is the next
    question every one of them provokes, and that needs the curve.

    ## TWO COMPARISONS, AND THEY ARE NOT THE SAME KIND OF STATEMENT

    * against **this site's own 1986-2005 baseline** — both sides are the same
      500 m cell, so the difference is this season and nothing else.
    * against **the region this season** — both sides are the same weather, so
      the difference is the site's position within its district.

    Mixing them on one chart would produce a gap that is part one and part the
    other, which is why the client shows one at a time. They are returned
    together because they cost one query each and switching between them is the
    thing a reader does most.

    ## Aligned on DATE, not on index

    Three sources with three different reasons to be short: the site's surface
    can have a hole, the zone rollup can miss a day, the baseline is missing 28
    February. Zipping three lists by position would slide one against another
    and draw a lag that does not exist. Every series is emitted against the same
    date axis with `null` where that source has nothing — and null stays null,
    because a zero on a rainfall chart is a dry day and on a GDD chart is a
    frost.
    """
    site = _owned(db, site_id, user)
    if site.status != "ready":
        raise HTTPException(409, {"code": site.status,
                                  "message": "This site is still populating."})

    if vintage is None:
        vintage = dashboard.current_vintage(datetime.now(timezone.utc).date())
    season_start, season_end = site_baseline.season_bounds(vintage)

    live = db.execute(text("""
        SELECT date, temp_mean, rainfall_mm, gdd10_cumulative
          FROM insights_site_daily
         WHERE site_id = :sid AND date BETWEEN :lo AND :hi
         ORDER BY date
    """), {"sid": site.id, "lo": season_start, "hi": season_end}).mappings().all()

    if not live:
        return {"site": _serialise(db, site), "vintage_year": vintage,
                "available": False,
                "reason": ("No daily surface has been read for this site yet "
                           "this season."),
                "metrics": [], "dates": [], "series": {}}

    # The axis ends where the SITE's record ends. Drawing the region three days
    # further than the site would show a gap closing that is only one series
    # being longer than the other.
    through = max(r["date"] for r in live)

    zone_rows = []
    if site.zone_id:
        zone_rows = db.execute(text("""
            SELECT date, temp_mean, rainfall_mm, gdd10_cumulative
              FROM climate_zone_daily
             WHERE zone_id = :z AND date BETWEEN :lo AND :hi
             ORDER BY date
        """), {"z": site.zone_id, "lo": season_start,
               "hi": through}).mappings().all()

    curve = site_baseline.build(db, site, vintage)
    base_by_date = ({d["date"]: d for d in curve["days"] if d.get("available")}
                    if curve else {})

    dates = [(season_start + timedelta(days=i)).isoformat()
             for i in range((through - season_start).days + 1)]

    def running(rows, field):
        """A running sum keyed by date. An absent day does NOT reset it."""
        out, total = {}, 0.0
        for r in rows:
            if r[field] is not None:
                total += float(r[field])
            out[r["date"].isoformat()] = total
        return out

    live_by = {r["date"].isoformat(): r for r in live}
    zone_by = {r["date"].isoformat(): r for r in zone_rows}
    live_rain = running(live, "rainfall_mm")
    zone_rain = running(zone_rows, "rainfall_mm")

    def pick(row, metric):
        if row is None:
            return None
        v = row["gdd10_cumulative"] if metric == "gdd10" else row["temp_mean"]
        return None if v is None else round(float(v), 2)

    BASE_FIELD = {"gdd10": "gdd10_cumulative", "tmean": "tmean",
                  "rain": "rain_cumulative"}

    series = {}
    for metric, label, unit, cumulative in SEASON_SERIES_METRICS:
        if metric == "rain":
            site_vals = [round(live_rain[d], 2) if d in live_rain else None
                         for d in dates]
            zone_vals = [round(zone_rain[d], 2) if d in zone_rain else None
                         for d in dates]
        else:
            site_vals = [pick(live_by.get(d), metric) for d in dates]
            zone_vals = [pick(zone_by.get(d), metric) for d in dates]

        base_vals = []
        for d in dates:
            day = base_by_date.get(d)
            v = None if day is None else day.get(BASE_FIELD[metric])
            base_vals.append(None if v is None else round(float(v), 2))

        series[metric] = {
            "label": label, "unit": unit, "cumulative": cumulative,
            "site": site_vals,
            # Absent, not empty, when there is nothing to compare against: a
            # zone with no daily climatology (South Coast) and a site outside
            # every zone both land here, and an all-null array would render as a
            # flat line at nothing rather than as no comparison at all.
            "baseline": base_vals if base_by_date else None,
            "zone": zone_vals if zone_rows else None,
        }

    zone = db.execute(text(
        "SELECT id, name, slug FROM climate_zones WHERE id = :z"),
        {"z": site.zone_id}).mappings().first() if zone_rows else None

    return {
        "site": _serialise(db, site),
        "vintage_year": vintage,
        "available": True,
        "baseline": PRO_BASELINE,
        "from": season_start.isoformat(),
        "to": season_end.isoformat(),
        "through": through.isoformat(),
        "zone": dict(zone) if zone else None,
        "metrics": [{"key": m, "label": l, "unit": u, "cumulative": c}
                    for m, l, u, c in SEASON_SERIES_METRICS],
        "dates": dates,
        "series": series,
        "note": ("Your own 500 m cell against its 1986-2005 record, or against "
                 "the region this season. The two answer different questions "
                 "and are never drawn together."),
    }


# --- enterprise accounts: the portfolio view ---------------------------------
#
# One client, 67 monitored sites. A per-site page answers "how is this block
# doing"; this answers the question a portfolio actually generates, which is
# "which of my sites needs looking at today". So it is one row per site with
# the headline of each model, sortable, rather than 67 dashboards.
#
# ONE QUERY, NOT 67. Every block below is a CTE over a small table keyed on
# site_id, joined once. The obvious implementation — loop the sites and reuse
# the single-site builders — is 67 round trips per page load, and it degrades
# with exactly the thing the client is paying for.

# Season-to-date and the long-term average both need the vintage. Sep-Apr,
# labelled by the harvest year, matching `insights_site_season.vintage_year`.
PORTFOLIO_BASELINE = (1986, 2005)

_PORTFOLIO_SQL = """
WITH season AS (
    -- Season to date at each site, from the daily record. The gate is the
    -- SAME 1 September the accumulators use, so a portfolio total and a site
    -- page cannot disagree about which days counted.
    SELECT d.site_id,
           max(d.date)                                    AS through,
           sum(d.rainfall_mm)                             AS rain_mm,
           avg(d.temp_mean)                               AS temp_mean,
           min(d.temp_min)                                AS temp_min,
           max(d.temp_max)                                AS temp_max,
           max(d.gdd10_cumulative)                        AS gdd10,
           count(*)                                       AS days
      FROM insights_site_daily d
      JOIN insights_site s ON s.id = d.site_id
     WHERE s.account_id = :acc
       AND d.date >= make_date(:vintage - 1, 9, 1)
       AND d.date <= make_date(:vintage, 4, 30)
     GROUP BY d.site_id
), lta AS (
    -- The LONG-TERM AVERAGE at each site: the mean of its own completed
    -- seasons over the baseline period. Not the zone's — the whole point of a
    -- per-site product is that Fancrest averages 1,040.9 GDD10 where its zone
    -- averages 1,147.8, and a portfolio measured against the zone would show
    -- every cool site as permanently behind.
    SELECT y.site_id,
           avg(y.value) FILTER (WHERE y.metric = 'gdd10') AS gdd10,
           avg(y.value) FILTER (WHERE y.metric = 'rain')  AS rain_mm,
           avg(y.value) FILTER (WHERE y.metric = 'tmean') AS temp_mean
      FROM insights_site_season y
      JOIN insights_site s ON s.id = y.site_id
     WHERE s.account_id = :acc
       AND y.vintage_year BETWEEN :lo AND :hi
     GROUP BY y.site_id
), phen AS (
    -- One variety per site, chosen by the caller. A portfolio row can carry one
    -- variety's dates and no more; the site page is where the other eight live.
    SELECT DISTINCT ON (p.site_id)
           p.site_id, p.variety_code, p.current_stage, p.gdd_accumulated,
           p.avg_daily_gdd, p.days_vs_baseline,
           p.flowering_date, p.veraison_date, p.harvest_210_date
      FROM insights_site_phenology p
      JOIN insights_site s ON s.id = p.site_id
     WHERE s.account_id = :acc AND p.vintage_year = :vintage
       -- THE SITE'S OWN VARIETY, falling back to the caller's choice only
       -- where the client named none. A portfolio that showed every row
       -- Sauvignon blanc would be telling a Pinot noir grower about someone
       -- else's grape, and the whole point of the variety column on their list
       -- is that they monitor different blocks for different things.
       -- NOT `COALESCE(s.variety_code, :variety)`. That substitutes the
       -- caller's default whenever the site's code is NULL, and NULL has two
       -- causes: a met station with no variety at all, and a site whose variety
       -- we cannot model. The four BSI Pinot gris sites are the second, and
       -- coalescing showed them Sauvignon blanc dates under a Pinot gris
       -- heading. A site that named a grape gets that grape or nothing.
       AND p.variety_code = CASE WHEN s.variety IS NULL THEN :variety
                                 ELSE s.variety_code END
     ORDER BY p.site_id, p.estimate_date DESC
), dis AS (
    -- The newest scored day per site. `humidity_available` travels with it:
    -- a botrytis score computed without humidity is a different claim from one
    -- computed with it, and the row must not present them identically.
    SELECT DISTINCT ON (x.site_id)
           x.site_id, x.date AS disease_date,
           x.powdery_mildew_risk, x.downy_mildew_risk, x.botrytis_risk,
           x.pm_cumulative_index, x.botrytis_cumulative, x.humidity_available,
           x.bacchus_peak, x.bacchus_infection, x.bacchus_wet_hours
      FROM insights_site_disease x
      JOIN insights_site s ON s.id = x.site_id
     WHERE s.account_id = :acc
     ORDER BY x.site_id, x.date DESC
)
SELECT s.id, s.label, s.external_ref, s.site_type, s.status,
       -- ALIASED. `phen` also selects `variety_code`, and a mappings row keeps
       -- the last column of a duplicated name — so the site's NULL was being
       -- read as the CTE's matched code and every Pinot gris site reported
       -- itself as modelled.
       s.variety, s.variety_code AS site_variety_code, s.requested_metrics,
       s.latitude, s.longitude, s.zone_id, z.name AS zone_name, z.slug AS zone_slug,
       season.through, season.days, season.rain_mm, season.temp_mean,
       season.temp_min, season.temp_max, season.gdd10,
       lta.gdd10 AS lta_gdd10, lta.rain_mm AS lta_rain_mm,
       lta.temp_mean AS lta_temp_mean,
       phen.variety_code, phen.current_stage, phen.gdd_accumulated,
       phen.avg_daily_gdd, phen.days_vs_baseline,
       phen.flowering_date, phen.veraison_date, phen.harvest_210_date,
       dis.disease_date, dis.powdery_mildew_risk, dis.downy_mildew_risk,
       dis.botrytis_risk, dis.pm_cumulative_index, dis.botrytis_cumulative,
       dis.humidity_available,
       dis.bacchus_peak, dis.bacchus_infection, dis.bacchus_wet_hours,
       y.value AS yield_value, y.unit AS yield_unit
  FROM insights_site s
  LEFT JOIN climate_zones z ON z.id = s.zone_id
  LEFT JOIN season ON season.site_id = s.id
  LEFT JOIN lta    ON lta.site_id    = s.id
  LEFT JOIN phen   ON phen.site_id   = s.id
  LEFT JOIN dis    ON dis.site_id    = s.id
  -- Client-entered, so it is joined rather than computed and may simply be
  -- absent. Nothing here models yield.
  LEFT JOIN insights_site_yield y
         ON y.site_id = s.id AND y.vintage_year = :vintage
        AND y.variety_code = 'ALL'
 WHERE s.account_id = :acc
 ORDER BY z.name NULLS LAST, s.label
"""


def _portfolio_rows(db: Session, account_id: int, vintage: int,
                    variety: str) -> list[dict]:
    lo, hi = PORTFOLIO_BASELINE
    return [dict(r) for r in db.execute(text(_PORTFOLIO_SQL), {
        "acc": account_id, "vintage": vintage, "variety": variety,
        "lo": lo, "hi": hi}).mappings().all()]


def _portfolio_sites(db: Session, account_id: int, vintage: int,
                     variety: str) -> list[dict]:
    """Shaped portfolio rows, baseline-to-date included.

    Both the JSON endpoint and the CSV go through here. They already shared
    `_portfolio_rows` and `_shape`; the to-date lookup is a third thing that
    would have to be repeated identically in two places, and the export
    disagreeing with the screen it came from is the failure this file has spent
    the most effort avoiding.
    """
    rows = _portfolio_rows(db, account_id, vintage, variety)
    lo, hi = PORTFOLIO_BASELINE
    to_date = site_baseline.totals_to_date(
        db, [(r["id"], r["zone_id"], r["through"]) for r in rows],
        vintage, lo, hi)
    return [_shape(r, vintage, to_date.get(r["id"])) for r in rows]


def _iso(value):
    return value.isoformat() if value is not None else None


# TWO DECIMAL PLACES, EVERYWHERE, AND IT IS A HONESTY RULE RATHER THAN A
# FORMATTING ONE.
#
# Every number in these exports is modelled: a temperature interpolated to a
# 500 m cell, a GDD integrated from a fitted mean and a spread, a disease index
# from a decay model. `Numeric` columns and Python floats will happily print
# `13.690000000000001` or `1.5178342`, and a spreadsheet full of seven-figure
# precision reads as a measurement. It is not one — the national cross-validated
# RMSE on temperature is on the order of 1 °C.
#
# So the export rounds to 2 dp and no further. Values the shaper has already
# rounded harder (GDD to whole numbers, rainfall to the millimetre) keep that;
# this is a ceiling on precision, not a floor.
CSV_DECIMALS = 2


def _csv_number(value):
    """A float or Decimal at export precision. Anything else passes through."""
    if isinstance(value, bool) or value is None:
        return value
    if isinstance(value, (int,)):
        return value
    if isinstance(value, (float, Decimal)):
        rounded = round(float(value), CSV_DECIMALS)
        # `-0.0` is a real float and prints as "-0", which reads as a measured
        # negative in a spreadsheet column of positives.
        return 0.0 if rounded == 0 else rounded
    return value


def _num(value, digits=1):
    """Rounded, or None. NEVER 0 for absent — that distinction is the product."""
    return None if value is None else round(float(value), digits)


def _next_phenology_stage(r: dict, vintage: int) -> Optional[dict]:
    """The one stage this row should show, with the word for what it is.

    Runs the SAME `phenology_basis` gate the site and region payloads run, off
    the four dates the portfolio query already selected. A fifth copy of "which
    date is trustworthy" living in a table renderer is how two screens start
    disagreeing about one model.
    """
    gdd = float(r["gdd_accumulated"]) if r["gdd_accumulated"] is not None else None
    season_start, season_end = site_baseline.season_bounds(vintage)
    today = datetime.now(timezone.utc).date()

    stages = {}
    for key, column in (("flowering", "flowering_date"),
                        ("veraison", "veraison_date"),
                        ("harvest_210", "harvest_210_date")):
        value = r[column]
        stages[key] = {
            "date": _iso(value),
            "is_actual": False,
            "status": basis.classify(value, False, gdd, season_start, season_end),
        }

    progress = basis.stage_progress(stages, today)
    key = basis.next_stage(progress)
    if key is None:
        # Either nothing is projectable yet, or every modelled stage is behind
        # us. Both are real states and neither is a date.
        return None
    return {"stage": key,
            "label": basis.STAGE_NAMES[key],
            "date": stages[key]["date"],
            "basis": progress[key]["basis"]}


def _shape(r: dict, vintage: int, to_date: Optional[dict] = None) -> dict:
    """One portfolio row.

    `to_date` is this site's BASELINE accumulated to the same day its live
    season reaches — see `insights_site_baseline.totals_to_date`. It is optional
    because a site with no zone baseline has none, and the row still renders.
    """
    # ONE DECIMAL PLACE across the whole GDD/rain group, because at the start of
    # a season whole numbers destroy it: on 2 September the season is 2.96 GDD,
    # the to-date average is 1.96 and the rain is 0.03 mm — rounded to units,
    # "3", "2" and "0", the last of which reads as no rain at all.
    #
    # THE DIFFERENCE CARRIES THE SAME PLACES AS ITS OPERANDS. A row reading
    # 3.0 against 1.6 with a whole-number "+1" beside it looks like arithmetic
    # that does not add up, and a reader cannot tell a rounding convention from
    # a bug. Late in the season these are all three-figure numbers and the tenth
    # is noise, but it is harmless noise; the alternative is a column that is
    # unreadable for the first two months of every vintage.
    season_gdd = _num(r["gdd10"], 1)
    lta_gdd = _num(r["lta_gdd10"], 1)
    td = to_date or {}
    lta_gdd_to_date = _num(td.get("gdd10"), 1)
    next_stage = _next_phenology_stage(r, vintage)
    return {
        "site_id": r["id"],
        "label": r["label"],
        "external_ref": r["external_ref"],
        "site_type": r["site_type"],
        "status": r["status"],
        "variety": r["variety"],
        # `variety` set with no phenology is the Pinot gris case: the client
        # asked for a grape `phenology_thresholds` does not carry.
        "variety_modelled": r["site_variety_code"] is not None,
        "latitude": r["latitude"], "longitude": r["longitude"],
        "zone_name": r["zone_name"], "zone_slug": r["zone_slug"],
        "season": {
            "through": _iso(r["through"]),
            "days": r["days"],
            "gdd10": season_gdd,
            "rain_mm": _num(r["rain_mm"], 1),
            "temp_mean": _num(r["temp_mean"]),
            "temp_min": _num(r["temp_min"]),
            "temp_max": _num(r["temp_max"]),
        },
        # WHOLE SEASON. What this site averages by 30 April, which is the
        # number a grower plans against — kept, but it is NOT what a
        # season-to-date figure should be subtracted from.
        "lta": {
            "gdd10": lta_gdd,
            "rain_mm": _num(r["lta_rain_mm"], 1),
            "temp_mean": _num(r["lta_temp_mean"]),
            "period": f"{PORTFOLIO_BASELINE[0]}-{PORTFOLIO_BASELINE[1]}",
        },
        # TO THE SAME DAY. The site's own 1986-2005 curve accumulated to the
        # day its live season reaches, so "ahead or behind" is a like-for-like
        # statement in September as well as in March.
        "lta_to_date": {
            "gdd10": lta_gdd_to_date,
            "rain_mm": _num(td.get("rain"), 1),
            "temp_mean": _num(td.get("tmean")),
            "through": td.get("through"),
            "day_of_season": td.get("day_of_season"),
            "period": f"{PORTFOLIO_BASELINE[0]}-{PORTFOLIO_BASELINE[1]}",
        },
        # The comparison a grower actually reads: am I ahead of my own normal.
        # Absent rather than zero when either side is missing — a site with no
        # long-term average is not a site running exactly to average.
        #
        # MEASURED AGAINST `lta_to_date`, NOT `lta`. Against the whole-season
        # average this read -1,038 on 2 September at every site on the account,
        # which is not a fact about any vineyard — it is the shape of the
        # calendar. `gdd10_season` keeps the old comparison for the one place it
        # is meaningful, a season that has actually finished.
        "vs_lta": {
            "gdd10": (None if season_gdd is None or lta_gdd_to_date is None
                      else round(season_gdd - lta_gdd_to_date, 1)),
            "gdd10_season": (None if season_gdd is None or lta_gdd is None
                             else round(season_gdd - lta_gdd, 1)),
            "rain_mm": (None if r["rain_mm"] is None or td.get("rain") is None
                        else round(float(r["rain_mm"]) - td["rain"], 1)),
            "basis": "to_date" if lta_gdd_to_date is not None else None,
            "days": r["days_vs_baseline"],
        },
        # ONE DATE, THE NEXT ONE. The table used to carry flowering, véraison
        # and 210 g/L side by side, which in early September means a picking
        # date extrapolated eight months forward from two days of season sitting
        # in the same row as a date three weeks out, indistinguishable.
        #
        # The individual dates stay in the payload — sorting and the CSV both
        # want them, and withholding a value the site page will show is a
        # different kind of inconsistency — but `next` is what the table renders.
        "phenology": {
            "variety": r["variety_code"],
            "stage": r["current_stage"],
            "gdd": _num(r["gdd_accumulated"], 0),
            "rate": _num(r["avg_daily_gdd"], 2),
            "flowering": _iso(r["flowering_date"]),
            "veraison": _iso(r["veraison_date"]),
            "harvest_210": _iso(r["harvest_210_date"]),
            "next": next_stage,
        },
        "disease": {
            "date": _iso(r["disease_date"]),
            # `powdery` IS Gubler: `UCDavisPMIndex` is the Gubler-Thomas index,
            # so the client's word for it and the mathematics agree.
            #
            # `botrytis` IS NOT BACCHUS, and used to be labelled as though it
            # were. It is González-Domínguez (2015); Bacchus is the separate
            # pair of fields below, and it is the model 23 of these sites
            # actually asked for. Two models, two names, never one word over
            # the other's numbers.
            "powdery": r["powdery_mildew_risk"],
            "powdery_index": _num(r["pm_cumulative_index"], 1),
            "botrytis": r["botrytis_risk"],
            "botrytis_index": _num(r["botrytis_cumulative"], 1),
            "downy": r["downy_mildew_risk"],
            # A score computed without humidity is a WEAKER claim, not the same
            # claim. The row says so rather than letting a colour imply parity.
            "humidity_available": r["humidity_available"],
        },
        # BACCHUS, ITS OWN BLOCK. Kept out of `disease` deliberately: that dict
        # is four keys that all mean "a risk word plus a 0-100 index", and
        # Bacchus is neither. It is an index against a threshold of exactly 1.0
        # and a yes/no infection event, so folding it in would invite exactly
        # the substitution this whole change is undoing.
        #
        # `requested` is the client's own tick from their site list. It decides
        # what the table SHOWS, not what gets computed — every site is scored.
        "bacchus": {
            "requested": "bacchus" in (r.get("requested_metrics") or []),
            "index": _num(r["bacchus_peak"], 2),
            "threshold": 1.0,
            "infection": r["bacchus_infection"],
            "wet_hours": r["bacchus_wet_hours"],
        },
        "yield": {"value": _num(r["yield_value"], 2), "unit": r["yield_unit"]},
        "vintage_year": vintage,
    }


@router.get("/accounts")
def list_accounts(db: Session = Depends(get_db),
                  user: PublicUser = Depends(require_pro)):
    """Accounts this caller is a named member of.

    Empty for most subscribers, and that is the normal case rather than an
    error — an account is an enterprise arrangement, not a tier.
    """
    rows = db.execute(text("""
        SELECT a.slug, a.name, m.role,
               (SELECT count(*) FROM insights_site s
                 WHERE s.account_id = a.id) AS site_count
          FROM insights_account a
          JOIN insights_account_member m ON m.account_id = a.id
         WHERE m.public_user_id = :uid AND a.status = 'active'
         ORDER BY a.name
    """), {"uid": user.id}).mappings().all()
    return {"accounts": [dict(r) for r in rows]}


@router.get("/accounts/{slug}/portfolio")
def account_portfolio(slug: str,
                      vintage: Optional[int] = Query(None),
                      variety: str = Query("SB"),
                      db: Session = Depends(get_db),
                      user: PublicUser = Depends(require_pro)):
    """Every site on one account, one row each, with each model's headline.

    ## Sorting and filtering are the CLIENT's job, not this endpoint's

    67 rows is a payload a browser sorts instantly and a server round-trips
    slowly. Sending the whole set once and letting the table sort means a
    re-sort costs nothing and works offline; it also means the CSV export and
    the table can never disagree about what "the current view" is.

    ## `variety` picks ONE variety's phenology

    A portfolio row has space for one set of dates. Sauvignon blanc is the
    default because it is the majority of New Zealand's planted area, not
    because it is right for every site — the selector is in the payload's
    `varieties` so the client offers what actually exists.
    """
    account = _account(db, slug, user)
    if vintage is None:
        vintage = dashboard.current_vintage(datetime.now(timezone.utc).date())

    sites = _portfolio_sites(db, account["id"], vintage, variety)
    varieties = [r[0] for r in db.execute(text(
        "SELECT DISTINCT variety_code FROM phenology_thresholds "
        "WHERE is_active = true ORDER BY variety_code")).all()]

    return {
        "account": {"slug": account["slug"], "name": account["name"],
                    "role": account["role"]},
        "vintage_year": vintage,
        "variety": variety,
        "varieties": varieties,
        "baseline_period": f"{PORTFOLIO_BASELINE[0]}-{PORTFOLIO_BASELINE[1]}",
        # Counted from the rows rather than queried again, so the summary and
        # the table can never disagree.
        "summary": {
            "sites": len(sites),
            "ready": sum(1 for s in sites if s["status"] == "ready"),
            "with_season": sum(1 for s in sites if s["season"]["days"]),
            "with_phenology": sum(1 for s in sites if s["phenology"]["stage"]),
            "with_disease": sum(1 for s in sites if s["disease"]["date"]),
            # How many sites ticked the Bacchus model on the client's own
            # site list. A count, in the footer, rather than a marker on
            # each of the 44 rows that did not.
            "bacchus_requested": sum(1 for s in sites
                                     if s["bacchus"]["requested"]),
            "bacchus_infections": sum(1 for s in sites
                                      if s["bacchus"]["infection"]),
        },
        "sites": sites,
    }


# Column order is the reading order of the dashboard, deliberately: a CSV whose
# columns are in a different order from the table it came from is a CSV somebody
# has to re-learn.
_CSV_COLUMNS = [
    ("site_id", lambda s: s["site_id"]),
    ("label", lambda s: s["label"]),
    ("external_ref", lambda s: s["external_ref"]),
    ("site_type", lambda s: s["site_type"]),
    ("region", lambda s: s["zone_name"]),
    ("latitude", lambda s: s["latitude"]),
    ("longitude", lambda s: s["longitude"]),
    ("season_through", lambda s: s["season"]["through"]),
    ("season_days", lambda s: s["season"]["days"]),
    ("gdd10", lambda s: s["season"]["gdd10"]),
    # BOTH long-term averages, named so they cannot be confused. `lta_gdd10` is
    # the whole season; `lta_gdd10_to_date` is the same curve accumulated to
    # `season_through`, and it is the one `gdd10_vs_lta` is measured against.
    ("lta_gdd10_to_date", lambda s: s["lta_to_date"]["gdd10"]),
    ("lta_gdd10_season", lambda s: s["lta"]["gdd10"]),
    ("gdd10_vs_lta", lambda s: s["vs_lta"]["gdd10"]),
    ("rain_mm", lambda s: s["season"]["rain_mm"]),
    ("lta_rain_mm_to_date", lambda s: s["lta_to_date"]["rain_mm"]),
    ("lta_rain_mm_season", lambda s: s["lta"]["rain_mm"]),
    ("temp_mean", lambda s: s["season"]["temp_mean"]),
    ("temp_min", lambda s: s["season"]["temp_min"]),
    ("temp_max", lambda s: s["season"]["temp_max"]),
    ("variety", lambda s: s["phenology"]["variety"]),
    ("stage", lambda s: s["phenology"]["stage"]),
    ("next_stage", lambda s: (s["phenology"]["next"] or {}).get("label")),
    ("next_stage_date", lambda s: (s["phenology"]["next"] or {}).get("date")),
    ("next_stage_basis", lambda s: (s["phenology"]["next"] or {}).get("basis")),
    ("gdd_base0", lambda s: s["phenology"]["gdd"]),
    ("flowering", lambda s: s["phenology"]["flowering"]),
    ("veraison", lambda s: s["phenology"]["veraison"]),
    ("harvest_210", lambda s: s["phenology"]["harvest_210"]),
    ("disease_date", lambda s: s["disease"]["date"]),
    ("powdery_risk", lambda s: s["disease"]["powdery"]),
    ("powdery_index", lambda s: s["disease"]["powdery_index"]),
    # THE MODEL IS IN THE COLUMN NAME. A spreadsheet outlives the screen it
    # came from, and "botrytis_risk" next to "bacchus_index" with no other
    # label is how a reader concludes they are two views of one model.
    ("botrytis_gd_risk", lambda s: s["disease"]["botrytis"]),
    ("botrytis_gd_index", lambda s: s["disease"]["botrytis_index"]),
    ("bacchus_index", lambda s: s["bacchus"]["index"]),
    ("bacchus_infection", lambda s: s["bacchus"]["infection"]),
    ("bacchus_requested", lambda s: s["bacchus"]["requested"]),
    ("downy_risk", lambda s: s["disease"]["downy"]),
    ("humidity_available", lambda s: s["disease"]["humidity_available"]),
    ("yield", lambda s: s["yield"]["value"]),
    ("yield_unit", lambda s: s["yield"]["unit"]),
]


@router.get("/accounts/{slug}/portfolio.csv")
def account_portfolio_csv(slug: str,
                          vintage: Optional[int] = Query(None),
                          variety: str = Query("SB"),
                          db: Session = Depends(get_db),
                          user: PublicUser = Depends(require_pro)):
    """The portfolio as CSV, built from the SAME rows the dashboard renders.

    Shares `_portfolio_rows` and `_shape` with the JSON endpoint rather than
    running its own query. A second query would drift from the first, and the
    drift would show up as a customer's spreadsheet disagreeing with the screen
    they exported it from — which is the one thing an export must never do.

    An ABSENT value is an empty cell, never 0. A spreadsheet is where a zero
    does the most damage: it averages, it charts, and it looks deliberate.
    """
    import csv
    import io

    from fastapi.responses import StreamingResponse

    account = _account(db, slug, user)
    if vintage is None:
        vintage = dashboard.current_vintage(datetime.now(timezone.utc).date())
    sites = _portfolio_sites(db, account["id"], vintage, variety)

    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow([name for name, _ in _CSV_COLUMNS])
    for s in sites:
        writer.writerow(["" if (v := get(s)) is None else _csv_number(v)
                         for _, get in _CSV_COLUMNS])
    buf.seek(0)

    stamp = f"{account['slug']}_{vintage}_{variety}"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition":
                 f'attachment; filename="portfolio_{stamp}.csv"'})


# --- time series: one site for the popup, every site for the export ----------
#
# The same builder serves the chart, the single-site CSV and the all-sites CSV.
# Three code paths producing three slightly different answers to "what did this
# site do" is how an export ends up disagreeing with the screen it came from.

_TIMESERIES_SQL = """
SELECT s.id AS site_id, s.label, s.external_ref, s.site_type, s.variety,
       z.name AS zone_name,
       d.date,
       d.temp_min, d.temp_max, d.temp_mean, d.rainfall_mm,
       d.gdd_daily, d.gdd_cumulative, d.gdd10_daily, d.gdd10_cumulative,
       d.eto_mm, d.etc_mm, d.water_balance_mm, d.eto_method,
       x.powdery_mildew_risk, x.botrytis_risk, x.downy_mildew_risk,
       x.pm_cumulative_index, x.botrytis_cumulative, x.botrytis_severity,
       x.humidity_available, x.bacchus_peak, x.bacchus_infection
  FROM insights_site s
  LEFT JOIN climate_zones z ON z.id = s.zone_id
  JOIN insights_site_daily d ON d.site_id = s.id
  -- LEFT, and it matters: disease needs humidity in range and 23 of the 67
  -- sites have no score. An inner join would drop those sites from the export
  -- entirely rather than showing their temperature and rainfall with an empty
  -- disease column.
  LEFT JOIN insights_site_disease x ON x.site_id = s.id AND x.date = d.date
 WHERE {scope}
   AND d.date >= :start AND d.date <= :end
 ORDER BY s.label, d.date
"""


def _timeseries(db: Session, scope_sql: str, params: dict) -> list[dict]:
    return [dict(r) for r in db.execute(
        text(_TIMESERIES_SQL.format(scope=scope_sql)), params).mappings().all()]


def _ts_window(start: Optional[str], end: Optional[str],
               vintage: Optional[int]) -> tuple[date, date]:
    """The window to read, from either explicit dates or a whole season.

    Defaults to the CURRENT SEASON rather than to everything. The daily record
    is short today but will not stay short, and a default of "all of it" is a
    default that gets slower every day without anyone choosing it.
    """
    if start and end:
        lo, hi = date.fromisoformat(start), date.fromisoformat(end)
        if hi < lo:
            raise HTTPException(422, "end is before start")
        return lo, hi
    v = vintage or dashboard.current_vintage(datetime.now(timezone.utc).date())
    return water.season_bounds(v)


@router.get("/sites/{site_id}/timeseries")
def site_timeseries(site_id: int,
                    start: Optional[str] = Query(None),
                    end: Optional[str] = Query(None),
                    vintage: Optional[int] = Query(None),
                    db: Session = Depends(get_db),
                    user: PublicUser = Depends(require_pro)):
    """Daily temperature, rainfall, GDD, ET and disease at one site.

    What the portfolio's popup chart draws. Returned as parallel arrays rather
    than a list of objects: a chart wants columns, and 240 days x 15 fields as
    objects is several times the payload for the same numbers.

    NULL IS PRESERVED as null, never coerced to 0. A gap in the disease series
    is a day the model could not run, and a chart that plots it as zero draws a
    reassuring trough where there is no information at all.
    """
    site = _owned(db, site_id, user)
    lo, hi = _ts_window(start, end, vintage)
    rows = _timeseries(db, "s.id = :sid",
                       {"sid": site.id, "start": lo, "end": hi})

    def col(name):
        return [None if r[name] is None else float(r[name]) for r in rows]

    # The site's own long-term GDD curve, on the SAME dates as the live series.
    #
    # Only on this endpoint, never inside `_timeseries`. The account CSV runs
    # that builder across 67 sites and would pay for 67 baseline curves to write
    # a column nothing in a spreadsheet plots; here it is one site and it is the
    # difference between "your season has 340 GDD" and "your season has 340 GDD
    # and usually has 290 by now", which is the only version of that number a
    # grower can act on.
    gdd_baseline = None
    v = vintage or dashboard.current_vintage(datetime.now(timezone.utc).date())
    curve = site_baseline.build(db, site, v)
    if curve:
        by_date = {d["date"]: d for d in curve["days"] if d.get("available")}
        gdd_baseline = []
        for r in rows:
            day = by_date.get(r["date"].isoformat())
            gdd_baseline.append(None if day is None
                                else round(day["gdd10_cumulative"], 2))
        # A window that misses the curve entirely — an explicit start/end
        # outside the season — has nothing to draw, and an array of nulls would
        # render as a flat line at zero rather than as no baseline.
        if not any(x is not None for x in gdd_baseline):
            gdd_baseline = None

    return {
        "site": _serialise(db, site),
        "gdd10_baseline": gdd_baseline,
        "baseline_period": PRO_BASELINE,
        "variety": site.variety,
        "start": lo.isoformat(), "end": hi.isoformat(),
        "days": len(rows),
        "dates": [r["date"].isoformat() for r in rows],
        "temp_min": col("temp_min"),
        "temp_max": col("temp_max"),
        "temp_mean": col("temp_mean"),
        "rain_mm": col("rainfall_mm"),
        "gdd10_cumulative": col("gdd10_cumulative"),
        "eto_mm": col("eto_mm"),
        "etc_mm": col("etc_mm"),
        "water_balance_mm": col("water_balance_mm"),
        # THE WORD AND THE NUMBER MUST BE THE SAME QUANTITY.
        #
        # `botrytis_risk` is banded off SEVERITY (20/50/75); the chart drew
        # `botrytis_cumulative` and captioned it with the POWDERY bands
        # (30/50/60). So a day reading "high" in the table plotted at 25.8
        # and the tooltip called it "low" — one day, two quantities, three
        # answers. Severity now travels with the word it produces, and the
        # cumulative stays as its own separately-named series.
        "powdery_risk": [r["powdery_mildew_risk"] for r in rows],
        "botrytis_risk": [r["botrytis_risk"] for r in rows],
        "powdery_index": col("pm_cumulative_index"),
        "botrytis_severity": col("botrytis_severity"),
        "botrytis_index": col("botrytis_cumulative"),
        # BACCHUS, ON ITS OWN SCALE. The other two indices run 0-100; this one
        # is a fraction of an infection period and crosses at 1.0, so it cannot
        # share their axis and the chart must not put it there.
        "bacchus_index": col("bacchus_peak"),
        "bacchus_threshold": BacchusModel.THRESHOLD,
        "bacchus_infection": [r["bacchus_infection"] for r in rows],
        # ET is only computed where the client asked for it, so a site with an
        # entirely empty ET series has not failed — it was not requested.
        "has_et": any(v is not None for v in col("eto_mm")),
        "eto_method": next((r["eto_method"] for r in rows
                            if r["eto_method"]), None),
    }


# One row per site per date. WIDE, because that is what opens readably in a
# spreadsheet and it is what was asked for. Adding a variable changes this
# header, which is the trade a wide format makes.
_TS_COLUMNS = [
    ("site_id", "site_id"), ("site", "label"), ("external_ref", "external_ref"),
    ("site_type", "site_type"), ("region", "zone_name"), ("variety", "variety"),
    ("date", "date"),
    ("temp_min", "temp_min"), ("temp_max", "temp_max"),
    ("temp_mean", "temp_mean"), ("rain_mm", "rainfall_mm"),
    ("gdd10_daily", "gdd10_daily"), ("gdd10_cumulative", "gdd10_cumulative"),
    ("gdd_base0_cumulative", "gdd_cumulative"),
    ("eto_mm", "eto_mm"), ("etc_mm", "etc_mm"),
    ("water_balance_mm", "water_balance_mm"), ("eto_method", "eto_method"),
    ("powdery_risk", "powdery_mildew_risk"),
    ("powdery_index", "pm_cumulative_index"),
    ("botrytis_risk", "botrytis_risk"),
    ("botrytis_index", "botrytis_cumulative"),
    ("downy_risk", "downy_mildew_risk"),
    ("humidity_available", "humidity_available"),
]


def _ts_csv(rows: list[dict], filename: str):
    """Rows to a CSV response. Absent stays EMPTY, never 0.

    A spreadsheet is where a zero does the most damage: it averages, it charts,
    and it looks deliberate. An empty ET column on a site that was never asked
    for ET must not read as a site that used no water.
    """
    import csv
    import io

    from fastapi.responses import StreamingResponse

    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow([name for name, _ in _TS_COLUMNS])
    for r in rows:
        out = []
        for _, key in _TS_COLUMNS:
            v = r[key]
            if v is None:
                out.append("")
            elif isinstance(v, date):
                out.append(v.isoformat())
            elif isinstance(v, bool):
                out.append("true" if v else "false")
            else:
                out.append(_csv_number(v))
        w.writerow(out)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/sites/{site_id}/timeseries.csv")
def site_timeseries_csv(site_id: int,
                        start: Optional[str] = Query(None),
                        end: Optional[str] = Query(None),
                        vintage: Optional[int] = Query(None),
                        db: Session = Depends(get_db),
                        user: PublicUser = Depends(require_pro)):
    """One site's daily record, same columns as the all-sites export.

    Deliberately the SAME column set: somebody who exports one site to look at
    it and then exports the whole account should not have to reconcile two
    layouts, and a per-site format that drops the site columns cannot be
    concatenated with anything.
    """
    site = _owned(db, site_id, user)
    lo, hi = _ts_window(start, end, vintage)
    rows = _timeseries(db, "s.id = :sid",
                       {"sid": site.id, "start": lo, "end": hi})
    slug = (site.label or f"site{site.id}").lower()
    slug = "".join(c if c.isalnum() else "_" for c in slug)[:40]
    return _ts_csv(rows, f"{slug}_{lo:%Y%m%d}_{hi:%Y%m%d}.csv")


@router.get("/accounts/{slug}/timeseries.csv")
def account_timeseries_csv(slug: str,
                           start: Optional[str] = Query(None),
                           end: Optional[str] = Query(None),
                           vintage: Optional[int] = Query(None),
                           db: Session = Depends(get_db),
                           user: PublicUser = Depends(require_pro)):
    """Every site on the account, one row per site per date.

    A whole season across 67 sites is roughly 16,000 rows — small enough to
    stream in one response and to open in a spreadsheet, which is why the window
    defaults to a season rather than to the whole record.
    """
    account = _account(db, slug, user)
    lo, hi = _ts_window(start, end, vintage)
    rows = _timeseries(db, "s.account_id = :acc",
                       {"acc": account["id"], "start": lo, "end": hi})
    return _ts_csv(rows, f"{account['slug']}_daily_{lo:%Y%m%d}_{hi:%Y%m%d}.csv")
