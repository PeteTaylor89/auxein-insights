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
from services import insights_site_views as views
from services import phenology_basis as basis
from services.insights_dashboard import PHENOLOGY_HARVEST_TARGETS
from services import site_water as water
from services import point_climate as pc
from services import workflow_dispatch
from scripts import hourly_aggregation as hourly
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
# drift apart — through the views module, which is where Grow reads it from too.
PRO_BASELINE = views.PRO_BASELINE


class PlaceSiteRequest(BaseModel):
    latitude: float = Field(..., ge=-48.5, le=-33.0)
    longitude: float = Field(..., ge=165.0, le=180.0)
    label: Optional[str] = Field(None, max_length=80)


# The response shape and these three helpers live in `insights_site_views`,
# because Grow's property-scoped `/climate/*` routes return the same site block,
# parse the same baseline and answer the same not-ready state. Re-exported under
# their original names: `check_insights_sites.py` calls these route functions
# directly and reads `SiteResponse` off this module.
SiteResponse = views.SiteResponse


def _parse_baseline(baseline: str) -> tuple[int, int]:
    # The scripts that call these router functions directly leave the
    # `Query(...)` default in place, so a non-string arrives here; the views
    # module resolves that. This only turns the refusal into the HTTP one.
    try:
        return views.parse_baseline(baseline)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


def _serialise(db: Session, site: InsightsSite) -> SiteResponse:
    return views.serialise_site(db, site)


def _require_ready(site: InsightsSite) -> None:
    """409 while the site cannot be read.

    Grow answers the same state with a 200 and `available: false`, because a
    property with no site is normal rather than broken — see
    `services/insights_site_views.not_ready`.
    """
    blocked = views.not_ready(site)
    if blocked:
        raise HTTPException(409, blocked)


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
    _require_ready(site)
    wanted = [m.strip() for m in metrics.split(",")] if metrics else None
    return {"site": _serialise(db, site), **views.seasons(db, site, wanted)}


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
    _require_ready(site)
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
    _require_ready(site)
    try:
        payload = views.monthly(db, site, variable, statistic,
                                _parse_baseline(baseline))
    except views.NoSuchBand as exc:
        raise HTTPException(404, str(exc)) from exc
    return {"site": _serialise(db, site), **payload}


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
    _require_ready(site)
    return {"site": _serialise(db, site), **views.projections(db, site, season)}


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


# Defined in `insights_site_views`, beside the query that uses them.
SEASON_SERIES_METRICS = views.SEASON_SERIES_METRICS


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
    _require_ready(site)
    return {"site": _serialise(db, site),
            **views.season_series(db, site, vintage)}


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
           p.flowering_date, p.veraison_date, p.harvest_210_date,
           -- Budburst. `endodormancy_date` travels with the date because the
           -- date is unreadable without it: forcing starts when chilling is
           -- satisfied and not before, so two sites with the same budburst
           -- date can have arrived by quite different routes.
           -- `variety_is_assumed` is not decoration — at a site with no
           -- recorded variety the cultivar spread is 5-20 days against a model
           -- RMSE of 4.9, so a row that cannot say which it is should not
           -- present the date as if it were measured.
           p.budburst_date, p.endodormancy_date,
           p.chill_units, p.forcing_units, p.variety_is_assumed,
           -- THE TARGET THE DATE IS PROJECTED AGAINST. Without it
           -- `forcing_units` is a number with no scale, and the whole column is
           -- a date with nothing behind it. Gibbston on 7 Sep 2026 sat at 283.9
           -- of 627.0 — 45% — and projected 18 October, forty-one days out;
           -- Seaview Awatere sat at 74% and projected twenty days out. Those
           -- are very different claims and the table showed them identically.
           bp.f_star AS forcing_target
      FROM insights_site_phenology p
      JOIN insights_site s ON s.id = p.site_id
      -- LEFT, not inner: the four GDD-only varieties (Cabernet franc, Cabernet
      -- Sauvignon, Grenache, Riesling) have no budburst calibration and must
      -- keep their flowering and veraison dates rather than vanish.
      LEFT JOIN budburst_parameters bp
             ON bp.variety_code = p.variety_code AND bp.is_active = true
     WHERE s.account_id = :acc AND p.vintage_year = :vintage
       -- THE SITE'S OWN VARIETY OR NOTHING. No fallback to the caller's
       -- choice, and none to Sauvignon blanc.
       --
       -- This clause used to read `CASE WHEN s.variety IS NULL THEN :variety
       -- ELSE s.variety_code END`, which handed a site that named no grape the
       -- selector's default. 37 of BSI's 67 rows were carrying Sauvignon blanc
       -- dates on that basis. Measured 2026-09-08 by running all five
       -- calibrated cultivars at each such site, the answer moves 5 to 20 days
       -- depending on which grape is assumed — against a published model RMSE
       -- of 4.9 days. The assumption was therefore the largest term in the
       -- number, and no marker on the row makes a date built that way useful.
       --
       -- A NULL `variety_code` is also two different situations, and both
       -- correctly yield nothing here: a met station with no vines, and a site
       -- whose grape is named but not coded — the four BSI Pinot gris sites,
       -- which once showed Sauvignon blanc dates under a Pinot gris heading.
       --
       -- CONSEQUENCE: `:variety` no longer selects anything. The endpoint still
       -- accepts it and the payload still lists `varieties`, but nothing in
       -- this query reads it.
       AND p.variety_code = s.variety_code
     ORDER BY p.site_id, p.estimate_date DESC
), dis AS (
    -- The newest scored day per site. `humidity_available` travels with it:
    -- a botrytis score computed without humidity is a different claim from one
    -- computed with it, and the row must not present them identically.
    SELECT DISTINCT ON (x.site_id)
           x.site_id, x.date AS disease_date,
           x.powdery_mildew_risk, x.downy_mildew_risk, x.botrytis_risk,
           x.pm_cumulative_index,
           -- BOTH botrytis numbers, because they are two quantities and the
           -- export has to name each one. `botrytis_risk` is banded off
           -- SEVERITY; the cumulative is a separate decayed accumulator and
           -- carrying only it is what put "moderate" beside 12.7 in a
           -- customer's spreadsheet.
           x.botrytis_severity, x.botrytis_cumulative, x.humidity_available,
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
       phen.budburst_date, phen.endodormancy_date,
       phen.chill_units, phen.forcing_units, phen.variety_is_assumed,
       phen.forcing_target,
       dis.disease_date, dis.powdery_mildew_risk, dis.downy_mildew_risk,
       dis.botrytis_risk, dis.pm_cumulative_index,
       dis.botrytis_severity, dis.botrytis_cumulative,
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
    """A float or Decimal at export precision. Anything else passes through.

    Booleans come out UPPERCASE because that is the only spelling Excel,
    Sheets and LibreOffice all parse as a real boolean — `True` and `true`
    both land as text, so a filter on "infection" silently matches nothing.
    The two exports used to disagree here (`True` from the portfolio, `true`
    from the daily record) which made the pair unconcatenable as well.
    """
    if value is None:
        return value
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
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

    # How far through the forcing requirement, 0-100. Guarded on the target
    # rather than on the accumulation: `forcing_units` is legitimately NULL
    # until endo-dormancy releases, and a site still chilling is 0% forced
    # rather than unknown — but a variety with no budburst calibration has no
    # denominator at all, and those two must not both print as a blank.
    budburst_pct = None
    if r["forcing_target"]:
        budburst_pct = _num(
            100.0 * float(r["forcing_units"] or 0) / float(r["forcing_target"]), 0)

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
            # BUDBURST IS A DIFFERENT MODEL, so it is nested rather than sitting
            # beside the GDD dates as if it were one more threshold. It runs
            # from a photoperiod trigger that moves with latitude, and its
            # units are chill-days and degree-days above a per-cultivar base —
            # none of which the `gdd` above is measured in.
            #
            # `variety_assumed` is carried into the payload because a date the
            # client cannot tell from a stand-in is worse than no date: at a
            # site with no recorded variety the spread across cultivars is
            # 5-20 days, against a published model RMSE of 4.9.
            "budburst": {
                "date": _iso(r["budburst_date"]),
                "endodormancy": _iso(r["endodormancy_date"]),
                "chill_units": _num(r["chill_units"], 1),
                "forcing_units": _num(r["forcing_units"], 0),
                "forcing_target": _num(r["forcing_target"], 0),
                # HOW FAR THROUGH THE FORCING, as a percentage, computed here so
                # the table, the CSV and anything else read the same figure.
                # This is the answer to "where does that date come from": a date
                # projected from 45% of the requirement is a forty-day
                # extrapolation on a fortnight's rate, and one projected from
                # 74% is not.
                "forcing_pct": budburst_pct,
                "variety_assumed": r["variety_is_assumed"],
            },
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
            # TWO NUMBERS, TWO NAMES. There was one key here, `botrytis_index`,
            # and it carried the CUMULATIVE while the word beside it was banded
            # off SEVERITY. On screen that was invisible (the table shows only
            # the word) but the CSV put them in adjacent columns, and 28 rows of
            # the current record export "moderate" next to an index under 20.
            # `_index` is gone rather than repointed: the name is the ambiguity.
            "botrytis_severity": _num(r["botrytis_severity"], 1),
            "botrytis_cumulative": _num(r["botrytis_cumulative"], 1),
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

    ## `variety` NO LONGER SELECTS ANYTHING

    It used to fill in for sites that named no grape, and 37 of BSI's 67 rows
    were carrying Sauvignon blanc dates on that basis. Running all five
    calibrated cultivars at each such site on 2026-09-08 moved the budburst
    answer by 5 to 20 days depending on which was assumed, against a published
    model RMSE of 4.9 — so the assumption was the largest term in the number.
    A site now gets its own variety's dates or none at all.

    The parameter and the `varieties` list are still returned so existing
    clients do not break, but nothing reads them. Remove the selector from the
    UI before treating this as finished.
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
    # BUDBURST COLUMNS CARRY THEIR OWN MODEL'S UNITS. `chill_days` and
    # `forcing_degree_days` are not the `gdd_base0` above by another name —
    # different origin, different base temperature, different accumulator — and
    # a spreadsheet that outlives this screen has nothing but the column name to
    # say so. `budburst_variety_assumed` rides with them for the same reason the
    # payload carries it: at a site with no recorded variety the answer moves
    # 5-20 days depending on which grape was guessed.
    ("budburst", lambda s: s["phenology"]["budburst"]["date"]),
    ("budburst_endodormancy", lambda s: s["phenology"]["budburst"]["endodormancy"]),
    ("budburst_chill_days", lambda s: s["phenology"]["budburst"]["chill_units"]),
    ("budburst_forcing_degree_days",
     lambda s: s["phenology"]["budburst"]["forcing_units"]),
    # THE TARGET AND THE PERCENTAGE TRAVEL WITH THE DATE. A spreadsheet outlives
    # the screen, and 284 degree-days means nothing without the 627 it is
    # counting toward. The percentage is how a reader tells a date projected
    # from most of the way home from one extrapolated forty days out.
    ("budburst_forcing_target", lambda s: s["phenology"]["budburst"]["forcing_target"]),
    ("budburst_forcing_pct", lambda s: s["phenology"]["budburst"]["forcing_pct"]),
    ("budburst_variety_assumed",
     lambda s: s["phenology"]["budburst"]["variety_assumed"]),
    ("flowering", lambda s: s["phenology"]["flowering"]),
    ("veraison", lambda s: s["phenology"]["veraison"]),
    ("harvest_210", lambda s: s["phenology"]["harvest_210"]),
    ("disease_date", lambda s: s["disease"]["date"]),
    ("powdery_risk", lambda s: s["disease"]["powdery"]),
    ("powdery_index", lambda s: s["disease"]["powdery_index"]),
    # THE MODEL IS IN THE COLUMN NAME. A spreadsheet outlives the screen it
    # came from, and "botrytis_risk" next to "bacchus_index" with no other
    # label is how a reader concludes they are two views of one model.
    # ...AND SO IS THE QUANTITY. `botrytis_gd_risk` is banded off severity, so
    # severity is the column that sits next to it; the cumulative follows under
    # its own name. A single "index" column between them was a reader's
    # invitation to check the word against the wrong number.
    ("botrytis_gd_risk", lambda s: s["disease"]["botrytis"]),
    ("botrytis_gd_severity", lambda s: s["disease"]["botrytis_severity"]),
    ("botrytis_gd_cumulative", lambda s: s["disease"]["botrytis_cumulative"]),
    # BACCHUS IS ONLY READABLE AGAINST ITS THRESHOLD. 0.86 means nothing on its
    # own and there are no bands to fall back on, so the threshold travels in
    # the file rather than living in the screen the file came from. Wet hours
    # are the input the number is made of, and the first thing anyone asks
    # after "why did this fire".
    ("bacchus_index", lambda s: s["bacchus"]["index"]),
    ("bacchus_threshold", lambda s: s["bacchus"]["threshold"]),
    ("bacchus_infection", lambda s: s["bacchus"]["infection"]),
    ("bacchus_wet_hours", lambda s: s["bacchus"]["wet_hours"]),
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


# --- enterprise accounts: where each site's hourly record comes from ---------
#
# THIS TAB IS ABOUT THE POINT PATH, AND ONLY THE POINT PATH.
#
# Two spatial paths feed a site and they are not interchangeable:
#
#   * The SURFACE path — temperature, rainfall, GDD, the long-term average and
#     both phenology models — reads this site's cell out of the national 500 m
#     raster. That raster is fitted over every station in the country at once,
#     so no station "feeds" one site and naming two would be a fiction.
#   * The POINT path — the hourly series, leaf wetness, and therefore all four
#     disease models — interpolates the stations near the site, in
#     `services/point_climate`. That IS a per-site station list, and it is what
#     this endpoint reports.
#
# Presenting this as "the data sources for this site" would misattribute
# three-quarters of the portfolio's columns, which is why the payload carries
# `paths` and the tab prints it.
#
# NOTHING HERE RE-RANKS OR RE-WEIGHTS. The neighbours come from
# `point_climate.nearest_stations_bulk` (the same `_rank` the disease pipeline
# reaches through `nearest_stations`), the caps are that module's constants, the
# weights are its IDW, the confidence is its `confidence_for`, and the variable
# spellings are `hourly_aggregation.VARIABLE_ALIASES`. A tab that names a
# station the models are not reading from is worse than no tab at all.

# The four legs, in the order they limit a disease score: humidity is the
# binding constraint (`confidence_for` says so), temperature is available almost
# everywhere, rainfall is capped hardest because convective rain is cellular,
# and wind only trims the drying term.
_STATION_LEGS = (
    ("temp", "Temperature", pc.MAX_TEMP_KM),
    ("rh", "Humidity", pc.MAX_HUMIDITY_KM),
    ("rain", "Rainfall", pc.MAX_RAIN_KM),
    ("wind", "Wind", pc.MAX_WIND_KM),
)

# How recently a station must have reported to count as feeding the site today.
# Seven days, not one: ECAN_AIR lands ~24.8 h behind and the morning chain is
# D-1, so a 24 h window would report half the South Island as silent every
# morning. Long enough to be stable, short enough that a dead gauge shows up.
STATION_WINDOW_DAYS = 7

# How many stations per leg the tab names. Two is the question people ask; the
# contributor COUNT beside it is what stops two from reading as all of them.
STATIONS_PER_LEG = 2


def _station_reports(db: Session, station_ids: list, since: datetime) -> dict:
    """{(station_id, leg): (n, last_at)} over the window.

    ONE query for every station on the account, not one per site — 67 sites
    share 143 neighbours, and the union is what the database should be asked
    about.

    `variable = ANY(...)` is in the WHERE clause and it is NOT cosmetic.
    `weather_data` is a view over 47 partitions; grouping first and classifying
    the variable afterwards measured 50 seconds, against 1.3 with the variable
    list constraining the scan. The timestamp bound is mandatory for the same
    reason.
    """
    if not station_ids:
        return {}
    # Flattened once, so the leg each spelling belongs to is still derived from
    # the same dict the hourly query builds its CASE arms from.
    leg_of = {spelling: leg
              for leg, spellings in hourly.VARIABLE_ALIASES.items()
              for spelling in spellings}
    rows = db.execute(text(f"""
        SELECT station_id, variable, count(*) AS n, max(timestamp) AS last_at
          FROM weather_data
         WHERE station_id = ANY(:ids)
           AND variable = ANY(:vars)
           AND timestamp >= :since
           AND {hourly.QUALITY_FILTER}
         GROUP BY station_id, variable
    """), {"ids": station_ids, "vars": list(leg_of), "since": since}).all()

    out = {}
    for station_id, variable, n, last_at in rows:
        key = (station_id, leg_of[variable])
        have = out.get(key)
        # A mast can report two spellings of one leg. Sum the records and keep
        # the later timestamp — treating the second spelling as its own leg
        # would double-count a station that simply changed its vocabulary.
        out[key] = (n if have is None else have[0] + n,
                    last_at if have is None or last_at > have[1] else have[1])
    return out


def _account_station_sites(db: Session, account_id: int,
                           per_leg: int = STATIONS_PER_LEG,
                           window_days: int = STATION_WINDOW_DAYS):
    """Every site on the account with the stations its hourly record is built
    from, per leg, nearest first. Returns (sites, generated_at)."""
    rows = db.execute(text("""
        SELECT s.id, s.label, s.external_ref, s.site_type, s.status,
               s.latitude, s.longitude, s.elevation_m, s.requested_metrics,
               z.name AS zone_name
          FROM insights_site s
          LEFT JOIN climate_zones z ON z.id = s.zone_id
         WHERE s.account_id = :acc
         ORDER BY z.name NULLS LAST, s.label
    """), {"acc": account_id}).mappings().all()

    now = datetime.now(timezone.utc)
    points = {r["id"]: (float(r["latitude"]), float(r["longitude"]))
              for r in rows}
    neighbours = pc.nearest_stations_bulk(db, points)

    station_ids = sorted({n.station_id
                          for group in neighbours.values() for n in group})
    reports = _station_reports(db, station_ids,
                               now - timedelta(days=window_days))
    meta = {r[0]: r for r in db.execute(text("""
        SELECT station_id, station_code, station_name, data_source, region
          FROM weather_stations WHERE station_id = ANY(:ids)
    """), {"ids": station_ids}).all()} if station_ids else {}

    sites = []
    for r in rows:
        legs = {}
        estimate = {}
        for leg, _label, cap in _STATION_LEGS:
            # Eligible = carries this leg, AND is inside THIS leg's cap. Both
            # tests matter: the two nearest stations to Appleby are rain gauges,
            # so ranking on distance alone would name stations that contribute
            # nothing to its humidity.
            eligible = [n for n in neighbours[r["id"]]
                        if (n.station_id, leg) in reports
                        and n.distance_km <= cap]
            weights = [1.0 / max(n.distance_km, pc.MIN_SEPARATION_KM) ** pc.IDW_POWER
                       for n in eligible]
            total = sum(weights)
            named = []
            for rank, (n, w) in enumerate(zip(eligible, weights), start=1):
                if rank > per_leg:
                    break
                _count, last_at = reports[(n.station_id, leg)]
                m = meta.get(n.station_id)
                named.append({
                    "rank": rank,
                    "station_id": n.station_id,
                    "code": m[1] if m else None,
                    "name": m[2] if m else None,
                    "source": m[3] if m else None,
                    "distance_km": _num(n.distance_km, 2),
                    "elevation_m": _num(n.elevation_m, 0),
                    # The share of the IDW weight this station carries, over
                    # EVERY eligible contributor rather than over the two shown.
                    # Cromwell's thermometer is 100% of its own leg while
                    # Martinborough's top gauge is 26% of eleven; a percentage
                    # normalised over the two named would print both near 100
                    # and hide the entire difference.
                    "weight_pct": _num(w / total * 100.0, 1) if total else None,
                    "last_report": last_at.isoformat() if last_at else None,
                    "hours_stale": _num(
                        (now - last_at).total_seconds() / 3600.0, 1)
                    if last_at else None,
                })
            legs[leg] = {
                "cap_km": cap,
                # HOW MANY, not how many are shown. A leg resting on one sensor
                # and a leg averaging eleven are different products, and the two
                # named rows look identical without this number.
                "contributors": len(eligible),
                "nearest_km": _num(eligible[0].distance_km, 2) if eligible else None,
                "stations": named,
            }
            estimate[f"{leg}_station_count"] = len(eligible)
            estimate[f"{leg}_nearest_km"] = (eligible[0].distance_km
                                             if eligible else None)

        sites.append({
            "site_id": r["id"],
            "label": r["label"],
            "external_ref": r["external_ref"],
            "site_type": r["site_type"],
            "status": r["status"],
            "zone_name": r["zone_name"],
            "latitude": _num(r["latitude"], 5),
            "longitude": _num(r["longitude"], 5),
            "elevation_m": _num(r["elevation_m"], 0),
            "requested_metrics": r["requested_metrics"],
            # `point_climate.confidence_for`, NOT a second rule. This is the
            # same word `insights_site_hourly.confidence` carries on every row
            # the disease models scored, so the tab and the record agree by
            # construction rather than by review.
            "confidence": pc.confidence_for(estimate),
            "legs": legs,
        })
    return sites, now


@router.get("/accounts/{slug}/stations")
def account_stations(slug: str,
                     per_leg: int = Query(STATIONS_PER_LEG, ge=1, le=6),
                     window_days: int = Query(STATION_WINDOW_DAYS, ge=1, le=90),
                     db: Session = Depends(get_db),
                     user: PublicUser = Depends(require_pro)):
    """Which stations feed each site's hourly record, per leg, nearest first.

    Resolved AT REQUEST TIME rather than read back from a table, and that is a
    deliberate limit rather than an omission. `insights_site_hourly` stores
    `*_station_count` and `*_nearest_km` but never the station IDENTITY, so the
    only honest answer available is "the network as it stands now". This
    endpoint cannot say which station produced last Tuesday's botrytis score,
    and the tab must not imply that it can.

    It is cheap to resolve: the neighbour set is a property of the site, not of
    the hour, which is why `PointInterpolator` also resolves it once and reuses
    it for every hour of a backfill.
    """
    account = _account(db, slug, user)
    sites, generated_at = _account_station_sites(db, account["id"],
                                                 per_leg, window_days)

    # Counted off the rows, so the footer and the table cannot disagree.
    distinct = {st["station_id"]
                for site in sites for leg in site["legs"].values()
                for st in leg["stations"]}
    return {
        "account": {"slug": account["slug"], "name": account["name"],
                    "role": account["role"]},
        "generated_at": generated_at.isoformat(),
        "window_days": window_days,
        "per_leg": per_leg,
        # The caps are the product decision on this page and belong in the
        # payload: a leg is empty because of one of these numbers, and a reader
        # cannot tell "no station" from "none close enough" without them.
        "caps_km": {leg: cap for leg, _label, cap in _STATION_LEGS},
        "legs": [{"key": leg, "label": label, "cap_km": cap}
                 for leg, label, cap in _STATION_LEGS],
        # What this page is and is not about. Rendered, not decorative.
        "paths": {
            "point": ("Hourly record, leaf wetness and all four disease models "
                      "— interpolated from the stations below."),
            "surface": ("Temperature, rainfall, GDD, the long-term average and "
                        "both phenology models — read from the national 500 m "
                        "surface, which is fitted over every station in the "
                        "country. No single station feeds those columns."),
        },
        "summary": {
            "sites": len(sites),
            "stations": len(distinct),
            # The three worth looking at, and each is a different failure. No
            # humidity in range means the disease models cannot score the site
            # at all; a single contributor means one sensor fault is a total
            # outage rather than a degradation.
            "no_humidity": sum(1 for s in sites
                               if not s["legs"]["rh"]["contributors"]),
            "single_contributor": sum(
                1 for s in sites
                if any(leg["contributors"] == 1 for leg in s["legs"].values())),
            "low_confidence": sum(1 for s in sites
                                  if s["confidence"] == "low"),
        },
        "sites": sites,
    }


# One row per site per leg per named station — FLAT, because a nested payload is
# not a spreadsheet. `site_id` and `variable` together are the key, and the file
# concatenates with itself across accounts.
_STATION_CSV_COLUMNS = [
    ("site_id", lambda s, leg, st: s["site_id"]),
    ("label", lambda s, leg, st: s["label"]),
    ("external_ref", lambda s, leg, st: s["external_ref"]),
    ("site_type", lambda s, leg, st: s["site_type"]),
    ("region", lambda s, leg, st: s["zone_name"]),
    ("site_latitude", lambda s, leg, st: s["latitude"]),
    ("site_longitude", lambda s, leg, st: s["longitude"]),
    ("site_elevation_m", lambda s, leg, st: s["elevation_m"]),
    ("confidence", lambda s, leg, st: s["confidence"]),
    ("variable", lambda s, leg, st: leg),
    ("cap_km", lambda s, leg, st: s["legs"][leg]["cap_km"]),
    # The count travels on EVERY row, not only the first. A spreadsheet gets
    # sorted, and a value that only makes sense next to the row above it is a
    # value that will eventually be read against the wrong site.
    ("contributors", lambda s, leg, st: s["legs"][leg]["contributors"]),
    ("nearest_km", lambda s, leg, st: s["legs"][leg]["nearest_km"]),
    ("rank", lambda s, leg, st: st and st["rank"]),
    ("station_id", lambda s, leg, st: st and st["station_id"]),
    ("station_code", lambda s, leg, st: st and st["code"]),
    ("station_name", lambda s, leg, st: st and st["name"]),
    ("data_source", lambda s, leg, st: st and st["source"]),
    ("distance_km", lambda s, leg, st: st and st["distance_km"]),
    ("station_elevation_m", lambda s, leg, st: st and st["elevation_m"]),
    ("weight_pct", lambda s, leg, st: st and st["weight_pct"]),
    ("last_report_utc", lambda s, leg, st: st and st["last_report"]),
    ("hours_stale", lambda s, leg, st: st and st["hours_stale"]),
]


@router.get("/accounts/{slug}/stations.csv")
def account_stations_csv(slug: str,
                         per_leg: int = Query(STATIONS_PER_LEG, ge=1, le=6),
                         window_days: int = Query(STATION_WINDOW_DAYS,
                                                  ge=1, le=90),
                         db: Session = Depends(get_db),
                         user: PublicUser = Depends(require_pro)):
    """The same rows as the tab, from the SAME builder.

    A LEG WITH NO STATION STILL WRITES A ROW, with the station columns empty.
    Dropping it would make "this site has no hygrometer in range" — the most
    actionable fact in the file — indistinguishable from a site that was never
    exported, and a reader has no way to notice the absence of a row.
    """
    import csv
    import io

    from fastapi.responses import StreamingResponse

    account = _account(db, slug, user)
    sites, _generated = _account_station_sites(db, account["id"],
                                               per_leg, window_days)

    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow([name for name, _ in _STATION_CSV_COLUMNS])
    for site in sites:
        for leg, _label, _cap in _STATION_LEGS:
            for station in (site["legs"][leg]["stations"] or [None]):
                writer.writerow([
                    "" if (v := get(site, leg, station)) is None
                    else _csv_number(v)
                    for _, get in _STATION_CSV_COLUMNS])
    buf.seek(0)

    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition":
                 f'attachment; filename="stations_{account["slug"]}.csv"'})


# --- enterprise accounts: the measured equivalent of each site --------------
#
# A MEASURED STATION BESIDE THE MODELLED SITE, which is a different product from
# the portfolio and from the station network behind the disease models.
#
# Everything else on this account is estimated: the daily record comes from the
# 500 m surface, the hourly record is interpolated from neighbours. BSI asked for
# the other thing — the observed record of one real station as close as possible
# to each Regional site, to read the estimate against. So these numbers are
# nobody's model output. They are `weather_data_daily`, a station's own
# aggregated observations, and they are not adjusted toward the site in any way.
#
# WHICH IS WHY THE DISTANCE AND THE ELEVATION DIFFERENCE TRAVEL EVERYWHERE. The
# whole claim is "equivalent", and those two numbers are what bound it: at the
# engine's own 0.6 degC/100 m, Waipara West's borrowed thermometer sits 67 m
# below the site, which is ~0.4 degC before anything else is considered. A table
# that printed the reading without the separation would be asserting a
# measurement AT the site, which is exactly what this platform does not have.

# `weather_data_daily` column groups. The keys are `variable` on
# `insights_site_reference_station` and the CHECK constraint there is the same
# four.
#
# GDD RIDES WITH TEMPERATURE and cannot be its own pairing: a growing degree day
# is derived from that station's own min and max, so sourcing it from a
# different mast than the temperatures behind it would produce a column that
# contradicts the two next to it.
_REF_VARIABLES = {
    "temp": {
        "label": "Temperature",
        "probe": "temp_mean",
        "columns": ("temp_min", "temp_max", "temp_mean",
                    "gdd_base0", "gdd_base10"),
        "count": "temp_record_count",
    },
    "humidity": {
        "label": "Humidity",
        "probe": "humidity_mean",
        "columns": ("humidity_min", "humidity_max", "humidity_mean"),
        "count": "humidity_record_count",
    },
    "rainfall": {
        "label": "Rainfall",
        "probe": "rainfall_mm",
        "columns": ("rainfall_mm",),
        "count": "rainfall_record_count",
    },
    "solar": {
        "label": "Solar",
        "probe": "solar_radiation",
        "columns": ("solar_radiation",),
        "count": None,
    },
}

# How far back the coverage figure looks. A year, so a seasonal instrument and a
# dead one are distinguishable — a gauge that stopped in March reads as complete
# over any window short enough to sit inside its good period.
REFERENCE_COVERAGE_DAYS = 365


def _reference_pairings(db: Session, account_id: int) -> list[dict]:
    """The stored pairing for every site on the account, with what it can give.

    Distance is computed here rather than stored. A station does not move, but a
    SITE does — a Pro point may be relocated twice a year — and a stored distance
    would then describe a pairing that no longer exists while looking authoritative.
    """
    rows = db.execute(text("""
        SELECT s.id AS site_id, s.label, s.external_ref, s.site_type,
               s.latitude, s.longitude, s.elevation_m,
               z.name AS zone_name,
               f.variable, f.station_id, f.role, f.note,
               w.station_code, w.station_name, w.data_source,
               w.latitude AS st_lat, w.longitude AS st_lon,
               w.elevation AS st_elev
          FROM insights_site s
          JOIN insights_site_reference_station f ON f.site_id = s.id
          JOIN weather_stations w ON w.station_id = f.station_id
          LEFT JOIN climate_zones z ON z.id = s.zone_id
         WHERE s.account_id = :acc
         ORDER BY z.name NULLS LAST, s.label
    """), {"acc": account_id}).mappings().all()
    if not rows:
        return []

    # Coverage in ONE query over every station involved, not one per pairing.
    station_ids = sorted({r["station_id"] for r in rows})
    probes = ", ".join(
        f"count(*) FILTER (WHERE {v['probe']} IS NOT NULL) AS have_{k}"
        for k, v in _REF_VARIABLES.items())
    # Keyed by NAME, not position: `.mappings()` rows are RowMapping, and `r[0]`
    # raises rather than returning the first column.
    cover = {r["station_id"]: r for r in db.execute(text(f"""
        SELECT station_id, {probes}, count(*) AS days,
               min(date) AS first_date, max(date) AS last_date
          FROM weather_data_daily
         WHERE station_id = ANY(:ids) AND date >= :since
         GROUP BY station_id
    """), {"ids": station_ids,
           "since": date.today() - timedelta(days=REFERENCE_COVERAGE_DAYS)}
    ).mappings().all()}
    # The whole record, unbounded, so the UI can say how far back a download can
    # reach. Separate from the coverage window on purpose: one answers "is this
    # instrument alive", the other "how much history is there".
    span = {r[0]: (r[1], r[2]) for r in db.execute(text("""
        SELECT station_id, min(date), max(date)
          FROM weather_data_daily WHERE station_id = ANY(:ids)
         GROUP BY station_id
    """), {"ids": station_ids}).all()}

    sites: dict = {}
    for r in rows:
        site = sites.setdefault(r["site_id"], {
            "site_id": r["site_id"],
            "label": r["label"],
            "external_ref": r["external_ref"],
            "site_type": r["site_type"],
            "zone_name": r["zone_name"],
            "latitude": _num(r["latitude"], 5),
            "longitude": _num(r["longitude"], 5),
            "elevation_m": _num(r["elevation_m"], 0),
            "variables": {},
        })
        c = cover.get(r["station_id"])
        s = span.get(r["station_id"])
        window = (c["days"] if c else 0)
        have = (c[f"have_{r['variable']}"] if c else 0)
        st_elev = (float(r["st_elev"]) if r["st_elev"] is not None else None)
        site_elev = (float(r["elevation_m"])
                     if r["elevation_m"] is not None else None)
        site["variables"][r["variable"]] = {
            "label": _REF_VARIABLES[r["variable"]]["label"],
            "station_id": r["station_id"],
            "code": r["station_code"],
            "name": r["station_name"],
            "source": r["data_source"],
            # `fill` means the client's nominated mast does not measure this and
            # a different one was used. It is a different claim and the note
            # says which station and why.
            "role": r["role"],
            "note": r["note"],
            "distance_km": _num(pc.haversine_km(
                float(r["latitude"]), float(r["longitude"]),
                float(r["st_lat"]), float(r["st_lon"])), 2),
            "elevation_m": st_elev,
            # SIGNED, station minus site. The sign is the whole value: a
            # thermometer BELOW the site reads warm, one above reads cool, and
            # an absolute difference cannot say which way the bias runs.
            "elevation_delta_m": (None if st_elev is None or site_elev is None
                                  else round(st_elev - site_elev)),
            "days_with_data": have,
            "days_in_window": window,
            "coverage_pct": _num(have / window * 100.0, 1) if window else None,
            "record_first": s[0].isoformat() if s else None,
            "record_last": s[1].isoformat() if s else None,
        }
    return list(sites.values())


@router.get("/accounts/{slug}/reference")
def account_reference(slug: str,
                      db: Session = Depends(get_db),
                      user: PublicUser = Depends(require_pro)):
    """Each site's measured equivalent: one station per variable, and its reach.

    Returns nothing for an account with no pairings, and that is not an error —
    the pairing is a curated decision seeded per client, so most accounts
    correctly have none.
    """
    account = _account(db, slug, user)
    sites = _reference_pairings(db, account["id"])
    fills = sum(1 for s in sites for v in s["variables"].values()
                if v["role"] == "fill")
    return {
        "account": {"slug": account["slug"], "name": account["name"],
                    "role": account["role"]},
        "coverage_days": REFERENCE_COVERAGE_DAYS,
        "variables": [{"key": k, "label": v["label"]}
                      for k, v in _REF_VARIABLES.items()],
        # What these numbers ARE, carried in the payload so the endpoint and the
        # screen cannot end up making different claims.
        "basis": ("Observed daily aggregates from the station itself, not "
                  "adjusted toward the site. Every other number on this "
                  "account is modelled — the daily record from the 500 m "
                  "surface, the hourly record interpolated from neighbours."),
        "summary": {
            "sites": len(sites),
            "stations": len({v["station_id"] for s in sites
                             for v in s["variables"].values()}),
            # How many variables are NOT coming from the nominated mast. The
            # number a reader needs before trusting the word "equivalent".
            "filled": fills,
        },
        "sites": sites,
    }


# The daily assembly. Every variable group is joined SEPARATELY, because each one
# may come from a different station — that is the entire point of keying the
# pairing per variable, and a single join would silently collapse Cromwell's four
# masts into whichever one the planner reached first.
#
# `days` is built from the union of the pairing's own stations rather than from a
# generated date series: a day no station reported is a day with nothing to show,
# and manufacturing the row would fill a spreadsheet with blank dates that look
# like outages at the site.
_REFERENCE_DAILY_SQL = """
WITH ref AS (
    SELECT f.site_id, f.variable, f.station_id
      FROM insights_site_reference_station f
      JOIN insights_site s ON s.id = f.site_id
     WHERE s.account_id = :acc
), days AS (
    SELECT DISTINCT r.site_id, w.date
      FROM ref r
      JOIN weather_data_daily w ON w.station_id = r.station_id
     WHERE w.date >= :start AND w.date <= :end
)
SELECT d.site_id, s.label, s.external_ref, s.site_type, z.name AS zone_name,
       d.date,
       t.temp_min, t.temp_max, t.temp_mean,
       t.gdd_base0, t.gdd_base10, t.temp_record_count,
       rt.station_id AS temp_station_id, wt.station_code AS temp_station,
       h.humidity_min, h.humidity_max, h.humidity_mean,
       h.humidity_record_count,
       rh.station_id AS humidity_station_id, wh.station_code AS humidity_station,
       p.rainfall_mm, p.rainfall_record_count,
       rp.station_id AS rainfall_station_id, wp.station_code AS rainfall_station,
       sr.solar_radiation,
       rs.station_id AS solar_station_id, ws.station_code AS solar_station
  FROM days d
  JOIN insights_site s ON s.id = d.site_id
  LEFT JOIN climate_zones z ON z.id = s.zone_id

  LEFT JOIN ref rt ON rt.site_id = d.site_id AND rt.variable = 'temp'
  LEFT JOIN weather_stations wt ON wt.station_id = rt.station_id
  LEFT JOIN weather_data_daily t
         ON t.station_id = rt.station_id AND t.date = d.date

  LEFT JOIN ref rh ON rh.site_id = d.site_id AND rh.variable = 'humidity'
  LEFT JOIN weather_stations wh ON wh.station_id = rh.station_id
  LEFT JOIN weather_data_daily h
         ON h.station_id = rh.station_id AND h.date = d.date

  LEFT JOIN ref rp ON rp.site_id = d.site_id AND rp.variable = 'rainfall'
  LEFT JOIN weather_stations wp ON wp.station_id = rp.station_id
  LEFT JOIN weather_data_daily p
         ON p.station_id = rp.station_id AND p.date = d.date

  LEFT JOIN ref rs ON rs.site_id = d.site_id AND rs.variable = 'solar'
  LEFT JOIN weather_stations ws ON ws.station_id = rs.station_id
  LEFT JOIN weather_data_daily sr
         ON sr.station_id = rs.station_id AND sr.date = d.date

 ORDER BY s.label, d.date
"""


def _reference_window(vintage: Optional[int], start, end):
    """The date range, defaulting to the season the portfolio is showing.

    1 September to 30 April, the SAME gate the accumulators use, so a reference
    export and a portfolio row cover the same days and a client comparing them
    is comparing places rather than calendars.
    """
    if start and end:
        return start, end
    if vintage is None:
        vintage = dashboard.current_vintage(datetime.now(timezone.utc).date())
    return (start or date(vintage - 1, 9, 1),
            end or min(date(vintage, 4, 30), date.today()))


def _reference_daily_rows(db: Session, account_id: int, start, end):
    return [dict(r) for r in db.execute(
        text(_REFERENCE_DAILY_SQL),
        {"acc": account_id, "start": start, "end": end}).mappings().all()]


@router.get("/accounts/{slug}/reference-daily")
def account_reference_daily(slug: str,
                            vintage: Optional[int] = Query(None),
                            start: Optional[date] = Query(None),
                            end: Optional[date] = Query(None),
                            site_id: Optional[int] = Query(None),
                            db: Session = Depends(get_db),
                            user: PublicUser = Depends(require_pro)):
    """The measured daily record, one row per site per date.

    `site_id` narrows to one site, which is what the screen asks for — a client
    reads one site's days at a time, and shipping eight sites' worth to render
    one is ~3,000 rows to draw 380.
    """
    account = _account(db, slug, user)
    lo, hi = _reference_window(vintage, start, end)
    rows = _reference_daily_rows(db, account["id"], lo, hi)
    if site_id is not None:
        rows = [r for r in rows if r["site_id"] == site_id]
    return {
        "account": {"slug": account["slug"], "name": account["name"]},
        "start": lo.isoformat(),
        "end": hi.isoformat(),
        "rows": [{
            "site_id": r["site_id"], "label": r["label"],
            "date": r["date"].isoformat(),
            "temp_min": _num(r["temp_min"], 1),
            "temp_max": _num(r["temp_max"], 1),
            "temp_mean": _num(r["temp_mean"], 1),
            "gdd_base10": _num(r["gdd_base10"], 1),
            "gdd_base0": _num(r["gdd_base0"], 1),
            "humidity_min": _num(r["humidity_min"], 1),
            "humidity_max": _num(r["humidity_max"], 1),
            "humidity_mean": _num(r["humidity_mean"], 1),
            "rainfall_mm": _num(r["rainfall_mm"], 1),
            "solar_radiation": _num(r["solar_radiation"], 1),
            # THE RECORD COUNTS TRAVEL WITH THE VALUES. A daily mean built from
            # three readings and one built from 144 are not the same number, and
            # nothing else on the row can tell them apart. A partial day is the
            # most common way an observed series quietly disagrees with a
            # modelled one.
            "temp_records": r["temp_record_count"],
            "humidity_records": r["humidity_record_count"],
            "rainfall_records": r["rainfall_record_count"],
        } for r in rows],
    }


# One row per site per date. The station CODE is on every row rather than in a
# header, because a spreadsheet gets sorted and filtered and a provenance that
# only makes sense next to the row above it will be read against the wrong site.
_REFERENCE_CSV_COLUMNS = [
    ("site_id", lambda r: r["site_id"]),
    ("label", lambda r: r["label"]),
    ("external_ref", lambda r: r["external_ref"]),
    ("site_type", lambda r: r["site_type"]),
    ("region", lambda r: r["zone_name"]),
    ("date", lambda r: r["date"]),
    ("temp_station", lambda r: r["temp_station"]),
    ("temp_min_c", lambda r: r["temp_min"]),
    ("temp_max_c", lambda r: r["temp_max"]),
    ("temp_mean_c", lambda r: r["temp_mean"]),
    ("temp_records", lambda r: r["temp_record_count"]),
    ("gdd_base0", lambda r: r["gdd_base0"]),
    ("gdd_base10", lambda r: r["gdd_base10"]),
    ("humidity_station", lambda r: r["humidity_station"]),
    ("humidity_min_pct", lambda r: r["humidity_min"]),
    ("humidity_max_pct", lambda r: r["humidity_max"]),
    ("humidity_mean_pct", lambda r: r["humidity_mean"]),
    ("humidity_records", lambda r: r["humidity_record_count"]),
    ("rainfall_station", lambda r: r["rainfall_station"]),
    ("rainfall_mm", lambda r: r["rainfall_mm"]),
    ("rainfall_records", lambda r: r["rainfall_record_count"]),
    ("solar_station", lambda r: r["solar_station"]),
    # The unit is in the column name. A bare `solar_radiation` in a spreadsheet
    # invites the reader to assume MJ/m2, which is what the convention would be
    # and what this column is not.
    ("solar_mean_w_m2", lambda r: r["solar_radiation"]),
]


@router.get("/accounts/{slug}/reference-daily.csv")
def account_reference_daily_csv(slug: str,
                                vintage: Optional[int] = Query(None),
                                start: Optional[date] = Query(None),
                                end: Optional[date] = Query(None),
                                db: Session = Depends(get_db),
                                user: PublicUser = Depends(require_pro)):
    """The measured daily record as CSV, from the SAME query the screen reads.

    THE STATION COLUMN IS NOT OPTIONAL. Four of these columns can come from four
    different masts at one site, and a file that named none of them would be
    four instruments presented as one weather station. `temp_station` next to
    `temp_mean_c` is what makes the file defensible a year after it was sent.

    An absent value is an empty cell, never 0 — a day the gauge did not report
    and a dry day are different facts, and a spreadsheet is where that
    distinction does the most damage.
    """
    import csv
    import io

    from fastapi.responses import StreamingResponse

    account = _account(db, slug, user)
    lo, hi = _reference_window(vintage, start, end)
    rows = _reference_daily_rows(db, account["id"], lo, hi)

    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow([name for name, _ in _REFERENCE_CSV_COLUMNS])
    for r in rows:
        writer.writerow(["" if (v := get(r)) is None else _csv_number(v)
                         for _, get in _REFERENCE_CSV_COLUMNS])
    buf.seek(0)

    stamp = f"{account['slug']}_{lo.isoformat()}_{hi.isoformat()}"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition":
                 f'attachment; filename="reference_daily_{stamp}.csv"'})


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
       x.humidity_available,
       x.bacchus_peak, x.bacchus_infection, x.bacchus_wet_hours
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
    rows = [dict(r) for r in db.execute(
        text(_TIMESERIES_SQL.format(scope=scope_sql)), params).mappings().all()]
    # The threshold is a model constant, not a stored value, but it has to reach
    # the export: `bacchus_index = 0.86` is uninterpretable without it and the
    # model publishes no bands to fall back on. Set here rather than in the
    # column list so the one place that knows it stays `BacchusModel`.
    for row in rows:
        row["bacchus_threshold"] = (BacchusModel.THRESHOLD
                                    if row["bacchus_peak"] is not None else None)
    return rows


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
        "botrytis_cumulative": col("botrytis_cumulative"),
        # BACCHUS, ON ITS OWN SCALE. The other two indices run 0-100; this one
        # is a fraction of an infection period and crosses at 1.0, so it cannot
        # share their axis and the chart must not put it there.
        "bacchus_index": col("bacchus_peak"),
        "bacchus_threshold": BacchusModel.THRESHOLD,
        "bacchus_infection": [r["bacchus_infection"] for r in rows],
        "bacchus_wet_hours": col("bacchus_wet_hours"),
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
    # SAME NAMES AS THE PORTFOLIO CSV. Somebody who exports the summary and the
    # daily record is reconciling one against the other, and two spellings of
    # the same quantity is the whole reason this pass exists. `botrytis_risk` /
    # `botrytis_index` said neither which model nor which number.
    ("botrytis_gd_risk", "botrytis_risk"),
    ("botrytis_gd_severity", "botrytis_severity"),
    ("botrytis_gd_cumulative", "botrytis_cumulative"),
    # BACCHUS WAS ENTIRELY ABSENT from this export while being a column on the
    # portfolio and a line on the chart — so the one file with a day-by-day
    # record could not show the day an infection period completed. It is the
    # file a grower would actually take a spray decision from.
    ("bacchus_index", "bacchus_peak"),
    ("bacchus_threshold", "bacchus_threshold"),
    ("bacchus_infection", "bacchus_infection"),
    ("bacchus_wet_hours", "bacchus_wet_hours"),
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
            else:
                # Shared with the portfolio export, booleans included, so the
                # two files spell the same value the same way.
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
