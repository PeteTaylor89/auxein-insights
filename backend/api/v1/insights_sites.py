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
from services import workflow_dispatch

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
