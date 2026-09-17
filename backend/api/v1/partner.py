"""The Partner Data API — `/api/v1/partner/*`.

Spec: `docs/Integrape Project/Auxein Partner Data API - Specification.md`.
Build scope and reasoning: `partner_api_build_scope.md`.

Seven sellable endpoints plus three that are always on. Nothing here computes a
climate number: every route re-shapes a query that already serves the Insights
product, so an export cannot disagree with the screen it came from.

## Four rules every route in this file obeys

1. **`null` is never coerced to zero.** An absent rainfall observation and a
   measured dry day are different facts, and B4.1 was exactly the bug of writing
   one as the other.
2. **Withheld metrics are filtered HERE as well as upstream.** The partner layer
   is a fourth door onto frost and the raster catalogue is a fifth; see
   `WITHHELD_SEASON_METRICS` and `WITHHELD_RASTER_STATISTICS`.
3. **Every response carries `meta.coverage`** — the real first and last date for
   that resource. Daily starts 2026-02-15 while monthly starts 1986-01, and a
   consumer sizing a backfill off the wrong one is wrong by forty years.
4. **Every route calls `ctx.metered(...)` and `log_request(...)`.** A route that
   forgets bills nothing and shows up as a zero-row request in the usage panel.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.partner_security import (
    PartnerContext, PartnerError, get_partner, log_request,
)
from db.models.partner import ALWAYS_ON, ENDPOINT_LABELS
from db.models.insights_site import InsightsSite
from db.models.public_user import PublicUser
from db.session import get_db
from services import insights_site_service as svc
from services import insights_site_baseline as site_baseline
from services import workflow_dispatch

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/partner", tags=["partner"])


# Frost, in all its spellings. Stored, computed, and NOT published at a point —
# the count is thresholded off a lapse-retrended Tmin field, and on frost nights
# the atmosphere inverts, so the lapse is wrong in SIGN on exactly the nights
# that make the count. See `project_insights_metric_definitions`.
#
# `insights_site_service.FROST_METRICS` is the same set for the season table;
# this constant exists because the monthly table spells them differently and a
# single miss publishes the number.
WITHHELD_SEASON_METRICS = frozenset(svc.FROST_METRICS)


def is_frost_metric(name: Optional[str]) -> bool:
    """True for ANY spelling of frost. A substring test, not a set membership.

    ## Why a substring and not an enumerated list

    `insights_site_service.FROST_METRICS` holds three spellings. The database
    holds six across three tables:

        early_frost_days   frost_days   frost_days_annual
        last_spring_frost_doy   first_frost_day   last_frost_day

    `frost_days_annual` exists ONLY in `climate_zone_surface_season` and is in
    none of the enumerated sets, so the first version of this endpoint published
    it with full min/max/p10/p90 spread and no disclaimer — caught in the
    2026-09-17 smoke test, before it reached anyone.

    That is the failure mode an allowlist-by-enumeration has here: the withdrawal
    is a decision about a QUANTITY, but the guard was written against a set of
    NAMES, and the names keep multiplying across tables nobody re-checks. A
    substring test fails safe — a new frost spelling is withheld by default and
    somebody has to deliberately widen this to publish one.
    """
    return bool(name) and "frost" in name.lower()
WITHHELD_MONTHLY_BANDS = frozenset({
    ("temp_min", "frost_days"),
    ("temp_min", "first_frost_day"),
    ("temp_min", "last_frost_day"),
})
# The raster catalogue is the FIFTH door onto the same withdrawal, and unlike
# the others these have real S3 keys sitting in `surface_run` right now.
WITHHELD_RASTER_STATISTICS = frozenset({
    "frost_days", "first_frost_day", "last_frost_day",
})

# `climate_history_monthly_surface` column prefix -> the variable name the API
# publishes. `frost_days` is DELIBERATELY ABSENT: the table carries
# `frost_days_mean` and `frost_days_sd` and this map is what keeps them out of
# every regional payload. Adding it here publishes the withdrawn metric.
#
# `gdd` is base 10 — the monthly surfaces accumulate base 10 while the daily
# series carries both bases. Named `gdd10` so the two cannot be conflated.
_REGION_MONTHLY_VARIABLES = (
    ("tmean", "temp_mean"),
    ("tmin", "temp_min"),
    ("tmax", "temp_max"),
    ("gdd", "gdd10"),
    ("rain", "rainfall"),
    ("rx1day", "rx1day"),
    ("solar", "solar_radiation"),
)

MAX_LIMIT = 5000
DEFAULT_LIMIT = 1000


def _envelope(data, resource: str, *, units: Optional[dict] = None,
              coverage: Optional[dict] = None, extra: Optional[dict] = None,
              next_cursor=None, limit: Optional[int] = None) -> dict:
    meta = {"resource": resource,
            "generated_at": datetime.now(timezone.utc).isoformat()}
    if units:
        meta["units"] = units
    if coverage:
        meta["coverage"] = coverage
    if extra:
        meta.update(extra)
    out = {"data": data, "meta": meta}
    if limit is not None:
        out["paging"] = {"limit": limit, "next_cursor": next_cursor}
    return out


def _parse_date(value: Optional[str], field: str) -> Optional[date]:
    """An ISO date, or a bare `YYYY-MM` month.

    Both, because the monthly resources are documented with month bounds
    (`from=1986-01`) while the daily ones take full dates. Requiring
    `1986-01-01` on a monthly query would make the published specification
    wrong, and the specification is the thing a partner builds against —
    the code moves, not the contract.

    A month resolves to its FIRST day, which is what every `make_date(year,
    month, 1)` comparison downstream already uses.
    """
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        pass
    try:
        year, month = value.split("-")
        return date(int(year), int(month), 1)
    except (ValueError, TypeError):
        raise PartnerError(
            422, "request.invalid",
            f"{field} must be an ISO date (YYYY-MM-DD) or a month (YYYY-MM).")


def _site_for(ctx: PartnerContext, site_id: int) -> InsightsSite:
    """One site belonging to this client, or the right refusal.

    Scoped by `external_ref` prefix is NOT how this works — a partner's sites are
    identified by `partner_client_id` on the row. Until that column exists the
    scope is the account, which is why `_client_account_id` is resolved once and
    every site query goes through here rather than querying `InsightsSite`
    directly. One place to get the tenancy right.
    """
    site = (ctx.db.query(InsightsSite)
            .filter(InsightsSite.id == site_id,
                    InsightsSite.account_id == _client_account_id(ctx))
            .first())
    if site is None:
        raise PartnerError(404, "data.unavailable",
                           "No such site on this account.")
    if site.status != "ready":
        if site.status == "populating":
            raise PartnerError(
                409, "site.not_ready",
                "This site is still being populated. Poll GET /sites until "
                "status is 'ready'.")
        raise PartnerError(409, "site.not_ready",
                           site.status_detail or "Population failed.")
    return site


def _client_account_id(ctx: PartnerContext) -> Optional[int]:
    """The `insights_account` a partner's sites live under.

    Partner sites are provisioned into an enterprise account so they reuse the
    whole existing extraction, portfolio and phenology path rather than growing
    a parallel one. The link is the client slug matching the account slug, which
    is set when the client is created.
    """
    row = ctx.db.execute(
        text("SELECT id FROM insights_account WHERE slug = :slug"),
        {"slug": ctx.client.slug}).first()
    return row[0] if row else None


def _serialise_site(db: Session, site: InsightsSite) -> dict:
    zone = None
    if site.zone_id:
        r = db.execute(text("SELECT slug, name FROM climate_zones WHERE id = :z"),
                       {"z": site.zone_id}).first()
        if r:
            zone = {"slug": r[0], "name": r[1]}
    return {
        "id": site.id,
        "external_ref": site.external_ref,
        "label": site.label,
        "status": site.status,
        "status_detail": site.status_detail,
        "latitude": site.latitude,
        "longitude": site.longitude,
        "elevation_m": site.elevation_m,
        "cell": {"grid_key": site.grid_key, "row": site.grid_row,
                 "col": site.grid_col},
        "zone": zone,
        "variety": site.variety,
        "variety_code": site.variety_code,
        # TRUE means we hold no model for the variety they named, so phenology
        # will be absent rather than defaulted. Surfaced on the site, not buried
        # in the phenology payload nobody fetched.
        "variety_supported": bool(site.variety_code) if site.variety else None,
        "site_type": site.site_type,
        "requested_at": site.requested_at.isoformat() if site.requested_at else None,
        "populated_at": site.populated_at.isoformat() if site.populated_at else None,
    }


# =========================================================================
# Always on — identifiers and status only, no measurements
# =========================================================================

@router.get("/meta/entitlements")
def entitlements(request: Request, ctx: PartnerContext = Depends(get_partner)):
    """What this key may do. A partner who can read this stops guessing at 403s."""
    account_id = _client_account_id(ctx)
    in_use = 0
    if account_id:
        in_use = ctx.db.execute(
            text("SELECT count(*) FROM insights_site WHERE account_id = :a"),
            {"a": account_id}).scalar() or 0
    lim = ctx.limits
    body = _envelope({
        "client": ctx.client.name,
        "environment": ctx.client.environment,
        "endpoints": ctx.granted_endpoints(),
        "endpoint_labels": {e: ENDPOINT_LABELS.get(e, e)
                            for e in ctx.granted_endpoints()},
        "always_on": list(ALWAYS_ON),
        "history_from": (ctx.client.history_from.isoformat()
                         if ctx.client.history_from else None),
        "site_cap": ctx.client.site_cap,
        "sites_in_use": in_use,
        "contract_end": (ctx.client.contract_end.isoformat()
                         if ctx.client.contract_end else None),
        "limits": {
            "requests_per_minute": lim.requests_per_minute if lim else None,
            "rows_per_day": lim.rows_per_day if lim else None,
            "objects_per_day": lim.objects_per_day if lim else None,
            "bytes_per_day": lim.bytes_per_day if lim else None,
            "raster_lag_days": lim.raster_lag_days if lim else 14,
        },
    }, "meta.entitlements")
    log_request(ctx, request, 200, "meta.entitlements")
    return body


@router.get("/sites")
def list_sites(request: Request,
               status: Optional[str] = Query(None),
               external_ref: Optional[str] = Query(None),
               updated_since: Optional[str] = Query(None),
               limit: int = Query(DEFAULT_LIMIT, le=MAX_LIMIT, ge=1),
               ctx: PartnerContext = Depends(get_partner)):
    """Every site on this account. **The only way to poll a 202 to `ready`.**"""
    account_id = _client_account_id(ctx)
    if account_id is None:
        log_request(ctx, request, 200, "site.list")
        return _envelope([], "site.list", limit=limit)

    q = ctx.db.query(InsightsSite).filter(InsightsSite.account_id == account_id)
    if status:
        q = q.filter(InsightsSite.status == status)
    if external_ref:
        q = q.filter(InsightsSite.external_ref == external_ref)
    if updated_since:
        since = _parse_date(updated_since, "updated_since")
        q = q.filter(InsightsSite.updated_at >= since)
    rows = q.order_by(InsightsSite.id).limit(limit).all()

    data = [_serialise_site(ctx.db, s) for s in rows]
    ctx.metered(rows=len(data))
    log_request(ctx, request, 200, "site.list")
    return _envelope(data, "site.list", limit=limit,
                     next_cursor=None if len(rows) < limit else rows[-1].id)


@router.get("/regions")
def list_regions(request: Request,
                 ctx: PartnerContext = Depends(get_partner)):
    """The zone catalogue. Walkable — `parent_slug` and `level` are carried."""
    rows = ctx.db.execute(text("""
        SELECT z.slug, z.name, z.zone_level, z.description,
               p.slug AS parent_slug, r.name AS region_name, r.slug AS region_slug
          FROM climate_zones z
          LEFT JOIN climate_zones p ON p.id = z.parent_zone_id
          LEFT JOIN wine_regions r  ON r.id = z.region_id
         ORDER BY z.name
    """)).mappings().all()
    data = [dict(r) for r in rows]
    ctx.metered(rows=len(data))
    log_request(ctx, request, 200, "region.list")
    return _envelope(data, "region.list")


# =========================================================================
# 1. site.create
# =========================================================================

class PlaceSite(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    external_ref: str = Field(..., min_length=1, max_length=120)
    label: Optional[str] = Field(None, max_length=80)
    variety: Optional[str] = Field(None, max_length=80)
    site_type: Optional[str] = Field(None, max_length=30)


@router.post("/sites", status_code=202)
def create_site(body: PlaceSite, request: Request, response: Response,
                ctx: PartnerContext = Depends(get_partner)):
    """Register a site and queue its extraction. **202 — the work has not happened yet.**

    The extraction reads several thousand S3 objects to build forty years at a
    new cell and takes roughly 90 seconds to a few minutes. A site read
    immediately after this returns 409 `site.not_ready`, never an empty 200 —
    those are different answers and a partner must be able to tell them apart.
    """
    ctx.require("site.create")
    account_id = _client_account_id(ctx)
    if account_id is None:
        raise PartnerError(403, "entitlement.resource",
                           "This account is not provisioned for sites.")

    # Their identifier is the join. A second row at one place is two answers to
    # one question, so this is a refusal and not an upsert.
    existing = (ctx.db.query(InsightsSite)
                .filter(InsightsSite.account_id == account_id,
                        InsightsSite.external_ref == body.external_ref)
                .first())
    if existing:
        raise PartnerError(
            409, "site.duplicate_ref",
            f"external_ref {body.external_ref!r} already exists as site "
            f"{existing.id}.")

    if ctx.client.site_cap is not None:
        in_use = ctx.db.execute(
            text("SELECT count(*) FROM insights_site WHERE account_id = :a"),
            {"a": account_id}).scalar() or 0
        if in_use >= ctx.client.site_cap:
            raise PartnerError(
                402, "entitlement.site_cap",
                f"This agreement covers {ctx.client.site_cap} sites and "
                f"{in_use} are in use.", kind="entitlement")

    try:
        cell = svc.resolve_cell(ctx.db, body.latitude, body.longitude)
    except svc.PlacementError as exc:
        # `detail` carries `nearest_land` when one was found within the search
        # rings. Passing it through is what lets a partner correct a coastal
        # coordinate themselves instead of filing a ticket — and it is why we
        # never silently relocate the site for them.
        raise PartnerError(422, "placement.refused",
                           f"{exc.message} {exc.detail}" if exc.detail
                           else exc.message)

    variety_code = None
    if body.variety:
        from services import variety_codes
        # `resolve` returns every variety it found, in order. We take the first
        # because a site is one phenology track; a string naming two varieties
        # is two sites, not one row with a winner picked arbitrarily. A variety
        # we hold no thresholds for leaves this NULL, which is the signal that
        # phenology will be absent rather than silently defaulted.
        resolution = variety_codes.resolve(ctx.db, body.variety)
        variety_code = resolution.codes[0] if resolution.codes else None

    site = InsightsSite(
        account_id=account_id,
        source="account",
        external_ref=body.external_ref,
        label=body.label,
        site_type=body.site_type,
        variety=body.variety,
        variety_code=variety_code,
        latitude=body.latitude, longitude=body.longitude,
        grid_row=cell["row"], grid_col=cell["col"], grid_key=cell["grid_key"],
        zone_id=svc.resolve_zone(ctx.db, body.latitude, body.longitude),
        status="populating",
    )
    ctx.db.add(site)
    ctx.db.commit()
    ctx.db.refresh(site)
    log.info("partner %s placed site %s (%s)", ctx.client.slug, site.id,
             body.external_ref)

    # Accelerator, never the mechanism: every failure in here is a no-op and the
    # scheduled sweep still finds the site. See `workflow_dispatch`.
    try:
        workflow_dispatch.populate_site(site.id)
    except Exception:
        log.exception("dispatch failed for site %s; the sweep will collect it",
                      site.id)

    data = _serialise_site(ctx.db, site)
    ctx.metered(rows=1)
    log_request(ctx, request, 202, "site.create")
    return _envelope(data, "site.create",
                     extra={"expected_ready_seconds": 120})


# =========================================================================
# 2. site.history
# =========================================================================

_DAILY_SQL = """
SELECT d.date, d.temp_min, d.temp_max, d.temp_mean, d.rainfall_mm,
       d.gdd_daily, d.gdd_cumulative, d.gdd10_daily, d.gdd10_cumulative,
       d.eto_mm, d.etc_mm, d.water_balance_mm, d.eto_method, d.model_version
  FROM insights_site_daily d
 WHERE d.site_id = :sid AND d.date >= :lo AND d.date <= :hi
 ORDER BY d.date
 LIMIT :lim
"""

_DAILY_UNITS = {
    "temp_min": "C", "temp_max": "C", "temp_mean": "C", "rainfall_mm": "mm",
    "gdd_daily": "C.day", "gdd_cumulative": "C.day",
    "gdd10_daily": "C.day", "gdd10_cumulative": "C.day",
    "eto_mm": "mm", "etc_mm": "mm", "water_balance_mm": "mm",
}


@router.get("/sites/{site_id}/history")
def site_history(site_id: int, request: Request,
                 granularity: str = Query("daily",
                                          pattern="^(daily|monthly|season)$"),
                 from_: Optional[str] = Query(None, alias="from"),
                 to: Optional[str] = Query(None),
                 vintage: Optional[int] = Query(None),
                 limit: int = Query(DEFAULT_LIMIT, le=MAX_LIMIT, ge=1),
                 ctx: PartnerContext = Depends(get_partner)):
    """The extracted record at this site's cell, at one of three resolutions.

    Daily starts 2026-02-15; monthly reaches 1986-01. `meta.coverage` carries
    the real extent for whichever was asked for, because sizing a backfill off
    the wrong one is wrong by forty years.
    """
    ctx.require("site.history")
    site = _site_for(ctx, site_id)
    lo = _parse_date(from_, "from")
    hi = _parse_date(to, "to")
    ctx.check_history("site.history", lo)

    if granularity == "daily":
        if lo is None or hi is None:
            from services import site_water as water
            from services import insights_dashboard as dashboard
            v = vintage or dashboard.current_vintage(
                datetime.now(timezone.utc).date())
            dlo, dhi = water.season_bounds(v)
            lo, hi = lo or dlo, hi or dhi
        lo = ctx.clamp_from("site.history", lo)
        rows = ctx.db.execute(text(_DAILY_SQL),
                              {"sid": site.id, "lo": lo, "hi": hi,
                               "lim": limit}).mappings().all()
        data = [{k: (float(v) if isinstance(v, (int, float))
                     and not isinstance(v, bool) else v)
                 for k, v in dict(r).items()} for r in rows]
        for row, src in zip(data, rows):
            row["date"] = src["date"].isoformat()
        cov = ctx.db.execute(text(
            "SELECT min(date), max(date) FROM insights_site_daily "
            "WHERE site_id = :sid"), {"sid": site.id}).first()
        ctx.metered(rows=len(data))
        log_request(ctx, request, 200, "site.history")
        return _envelope(
            data, "site.history.daily", units=_DAILY_UNITS,
            coverage={"first": cov[0].isoformat() if cov and cov[0] else None,
                      "last": cov[1].isoformat() if cov and cov[1] else None},
            extra={"method": "surface",
                   "note": "null is absent, never zero. Recent days are "
                           "revised — upsert on (site_id, date)."},
            limit=limit)

    if granularity == "monthly":
        rows = ctx.db.execute(text("""
            SELECT variable, statistic, year, month, value
              FROM insights_site_monthly
             WHERE site_id = :sid
               AND (:lo IS NULL OR make_date(year, month, 1) >= :lo)
               AND (:hi IS NULL OR make_date(year, month, 1) <= :hi)
             ORDER BY year, month, variable, statistic
             LIMIT :lim
        """), {"sid": site.id, "lo": lo, "hi": hi, "lim": limit}).mappings().all()
        # The withheld frost bands are stored in this table. Filtered here
        # because the partner layer is a door the other three guards do not
        # cover.
        data = [dict(r) for r in rows if not is_frost_metric(r["statistic"])]
        cov = ctx.db.execute(text(
            "SELECT min(make_date(year, month, 1)), "
            "       max(make_date(year, month, 1)) "
            "  FROM insights_site_monthly WHERE site_id = :sid"),
            {"sid": site.id}).first()
        ctx.metered(rows=len(data))
        log_request(ctx, request, 200, "site.history")
        return _envelope(
            data, "site.history.monthly",
            coverage={"first": cov[0].isoformat() if cov and cov[0] else None,
                      "last": cov[1].isoformat() if cov and cov[1] else None},
            extra={"withheld": sorted(s for _, s in WITHHELD_MONTHLY_BANDS),
                   "withheld_reason": svc.FROST_DISCLAIMER},
            limit=limit)

    rows = ctx.db.execute(text("""
        SELECT vintage_year, metric, value, unit, baseline
          FROM insights_site_season
         WHERE site_id = :sid
           AND (:v IS NULL OR vintage_year = :v)
         ORDER BY vintage_year, metric
         LIMIT :lim
    """), {"sid": site.id, "v": vintage, "lim": limit}).mappings().all()
    data = [dict(r) for r in rows if not is_frost_metric(r["metric"])]
    ctx.metered(rows=len(data))
    log_request(ctx, request, 200, "site.history")
    return _envelope(
        data, "site.history.season",
        extra={"season": "Sep-Apr, labelled by the ending (vintage) year",
               "partial_seasons": "omitted — a partial season returns no row",
               "withheld": sorted(WITHHELD_SEASON_METRICS),
               "withheld_reason": svc.FROST_DISCLAIMER},
        limit=limit)


# =========================================================================
# 3. site.season — rolling, against the site's own baseline
# =========================================================================

@router.get("/sites/{site_id}/season")
def site_season(site_id: int, request: Request,
                vintage: Optional[int] = Query(None),
                ctx: PartnerContext = Depends(get_partner)):
    """Season to date, day by day, against this site's own 1986-2005 normal.

    The baseline is a HYBRID and `meta` says so: day-to-day shape from the
    region's daily climatology, level from this cell's own monthly normal.
    There is no daily 1986-2005 record at a single cell and there cannot be —
    the daily surfaces do not reach back that far.
    """
    ctx.require("site.season")
    site = _site_for(ctx, site_id)
    from services import insights_dashboard as dashboard
    v = vintage or dashboard.current_vintage(datetime.now(timezone.utc).date())

    curve = site_baseline.build(ctx.db, site, v)
    if curve is None:
        # A site outside every mapped zone legitimately has no baseline. A
        # regional stand-in would be a different claim wearing this one's name.
        raise PartnerError(
            404, "data.unavailable",
            "This site has no regional baseline — it sits outside every mapped "
            "climate zone.")

    from services import site_water as water
    lo, hi = water.season_bounds(v)
    today = datetime.now(timezone.utc).date()
    hi = min(hi, today)
    actual = ctx.db.execute(text("""
        SELECT date, gdd10_cumulative, rainfall_mm, temp_mean
          FROM insights_site_daily
         WHERE site_id = :sid AND date >= :lo AND date <= :hi
         ORDER BY date
    """), {"sid": site.id, "lo": lo, "hi": hi}).mappings().all()

    by_date = {d["date"]: d for d in curve["days"] if d.get("available")}
    days, rain_cum, tmean_sum = [], 0.0, []
    for r in actual:
        iso = r["date"].isoformat()
        base = by_date.get(iso)
        # NOT coerced: a missing rainfall day must not advance the cumulative as
        # if it were dry.
        if r["rainfall_mm"] is not None:
            rain_cum += float(r["rainfall_mm"])
        if r["temp_mean"] is not None:
            tmean_sum.append(float(r["temp_mean"]))
        days.append({
            "date": iso,
            "gdd10_cumulative": (float(r["gdd10_cumulative"])
                                 if r["gdd10_cumulative"] is not None else None),
            "gdd10_cumulative_baseline": (round(base["gdd10_cumulative"], 2)
                                          if base else None),
            "rain_cumulative": round(rain_cum, 2),
            "rain_cumulative_baseline": (round(base["rain_cumulative"], 2)
                                         if base and "rain_cumulative" in base
                                         else None),
            "tmean_to_date": (round(sum(tmean_sum) / len(tmean_sum), 2)
                              if tmean_sum else None),
            "tmean_to_date_baseline": (round(base["tmean_to_date"], 2)
                                       if base and base.get("tmean_to_date")
                                       is not None else None),
        })

    last = days[-1] if days else {}
    totals = {}
    if last:
        for key, unit in (("gdd10_cumulative", "C.day"),
                          ("rain_cumulative", "mm")):
            value = last.get(key)
            baseline = last.get(f"{key}_baseline")
            totals[key.replace("_cumulative", "")] = {
                "value": value, "baseline": baseline,
                "delta": (None if value is None or baseline is None
                          else round(value - baseline, 2)),
                "unit": unit,
            }

    ctx.metered(rows=len(days))
    log_request(ctx, request, 200, "site.season")
    return _envelope({
        "site_id": site.id,
        "external_ref": site.external_ref,
        "vintage": v,
        "baseline": curve["baseline"],
        "as_of": hi.isoformat(),
        "days": days,
        "season_to_date": totals,
        "meta": curve["meta"],
    }, "site.season")


# =========================================================================
# 4. region.history
# =========================================================================

@router.get("/regions/{slug}/history")
def region_history(slug: str, request: Request,
                   granularity: str = Query("monthly",
                                            pattern="^(monthly|season)$"),
                   from_: Optional[str] = Query(None, alias="from"),
                   to: Optional[str] = Query(None),
                   limit: int = Query(DEFAULT_LIMIT, le=MAX_LIMIT, ge=1),
                   ctx: PartnerContext = Depends(get_partner)):
    """Regional record from 1986, monthly or per vintage with spread."""
    ctx.require("region.history")
    zone = ctx.db.execute(
        text("SELECT id, name, slug FROM climate_zones WHERE slug = :s"),
        {"s": slug}).first()
    if zone is None:
        raise PartnerError(404, "data.unavailable", "No such region.")

    lo = _parse_date(from_, "from")
    hi = _parse_date(to, "to")
    ctx.check_history("region.history", lo)
    lo = ctx.clamp_from("region.history", lo)

    if granularity == "monthly":
        # `climate_history_monthly_surface` is WIDE — one row per (zone, month)
        # with a column per variable-statistic — while the site monthly resource
        # is keyed by (variable, statistic). Unpivoted here so a consumer writes
        # ONE parser for both, rather than discovering the regional shape is a
        # different schema after they have built against the site one.
        rows = ctx.db.execute(text("""
            SELECT year, month,
                   tmean_mean, tmean_sd, tmean_p10, tmean_p90,
                   tmin_mean, tmin_sd,
                   tmax_mean, tmax_sd,
                   gdd_mean, gdd_sd, gdd_p10, gdd_p90,
                   rain_mean, rain_sd, rain_p10, rain_p90,
                   rx1day_mean, rx1day_sd,
                   solar_mean, solar_sd
              FROM climate_history_monthly_surface
             WHERE zone_id = :z
               AND (:lo IS NULL OR make_date(year, month, 1) >= :lo)
               AND (:hi IS NULL OR make_date(year, month, 1) <= :hi)
             ORDER BY year, month
             LIMIT :lim
        """), {"z": zone[0], "lo": lo, "hi": hi, "lim": limit}).mappings().all()

        data = []
        for r in rows:
            for col_prefix, variable in _REGION_MONTHLY_VARIABLES:
                for stat in ("mean", "sd", "p10", "p90"):
                    col = f"{col_prefix}_{stat}"
                    if col not in r:
                        continue
                    value = r[col]
                    if value is None:
                        continue
                    data.append({
                        "variable": variable, "statistic": stat,
                        "year": r["year"], "month": r["month"],
                        "value": float(value),
                    })
        ctx.metered(rows=len(data))
        log_request(ctx, request, 200, "region.history")
        return _envelope(
            data, "region.history.monthly",
            extra={"method": "surface", "zone": zone[2],
                   # `frost_days_mean` / `_sd` are columns on this table and are
                   # NEVER selected above. Naming the omission here is what stops
                   # it reading as missing data.
                   "withheld": ["frost_days"],
                   "withheld_reason": svc.FROST_DISCLAIMER,
                   "sd_note": "sd is the spread across the zone's planted cells, "
                              "not a within-month spread of daily values"},
            limit=limit)

    rows = ctx.db.execute(text("""
        SELECT vintage_year, metric, unit, mean, min, max, p10, p90, coverage
          FROM climate_zone_surface_season
         WHERE zone_id = :z
         ORDER BY vintage_year, metric
         LIMIT :lim
    """), {"z": zone[0], "lim": limit}).mappings().all()
    data = []
    for r in rows:
        row = dict(r)
        # Frost survives at REGIONAL scale — the mean only. The spread is
        # withheld with the point value, because drawing a site inside or
        # outside it is exactly the claim the model cannot support.
        if is_frost_metric(row["metric"]):
            row["min"] = row["max"] = row["p10"] = row["p90"] = None
            row["regional_only"] = True
            row["regional_only_reason"] = svc.FROST_DISCLAIMER
        data.append(row)
    ctx.metered(rows=len(data))
    log_request(ctx, request, 200, "region.history")
    return _envelope(
        data, "region.history.season",
        extra={"zone": zone[2],
               "spread": "across planted cells, weighted by hectares",
               "coverage": "fraction of the zone's planted cells the metric "
                           "could be computed for"},
        limit=limit)


# =========================================================================
# 5. region.summary
# =========================================================================

@router.get("/regions/{slug}/summary")
def region_summary(slug: str, request: Request,
                   ctx: PartnerContext = Depends(get_partner)):
    """The current state of a region — the Insights regional page, as data.

    `registered=True` is passed deliberately. A partner key is not a consumer
    TIER, so the `_locked` placeholder blocks the public page shows anonymous
    visitors must never reach a partner payload: either the block is granted and
    populated, or the key does not hold `region.summary` at all.
    """
    ctx.require("region.summary")
    from services import insights_region_dashboard as region

    payload = region.build(ctx.db, slug, registered=True)
    if payload is None:
        raise PartnerError(404, "data.unavailable", "No such region.")

    # The Bacchus threshold is a model constant rather than a stored value, and
    # `index` is uninterpretable without it — the model publishes no bands to
    # fall back on.
    disease = payload.get("disease") or {}
    if disease.get("available"):
        from scripts.disease_service_v2 import BacchusModel
        disease["bacchus_threshold"] = BacchusModel.THRESHOLD
        disease["bacchus_note"] = (
            "Chart `peak`, not `index`. `index` is the state carried out of the "
            "day; a reset can wipe a wet period that got most of the way to the "
            "threshold.")

    ctx.metered(rows=1)
    log_request(ctx, request, 200, "region.summary")
    return _envelope(payload, "region.summary")


# =========================================================================
# 6 and 7. raster.daily / raster.monthly
# =========================================================================

_RASTER_SQL = """
SELECT id, variable, granularity, statistic, valid_at, resolution_m,
       model_version, cv_rmse, cv_rmse_max, cv_units,
       n_stations_fit, n_stations_test, n_stations_excluded,
       clipped, status, created_at, s3_key
  FROM surface_run
 WHERE granularity = :gran
   AND status = 'ok'
   AND (:variable IS NULL OR variable = :variable)
   AND (:statistic IS NULL OR statistic = :statistic)
   AND (:lo IS NULL OR valid_at >= :lo)
   AND valid_at <= :cutoff
 ORDER BY valid_at, variable, statistic
 LIMIT :lim
"""


def _rasters(ctx: PartnerContext, request: Request, granularity: str,
             endpoint: str, variable: Optional[str], statistic: Optional[str],
             from_: Optional[str], to: Optional[str], include_url: bool,
             limit: int):
    """Shared body for the two raster endpoints. They differ only in extent."""
    ctx.require(endpoint)
    lo = _parse_date(from_, "from")
    hi = _parse_date(to, "to")
    ctx.check_history(endpoint, lo)
    lo = ctx.clamp_from(endpoint, lo)

    if is_frost_metric(statistic):
        # The same error a genuinely absent layer raises. A withheld metric must
        # not advertise itself to anyone probing the URL space.
        raise PartnerError(404, "data.withheld",
                           "This layer is not published.")

    # The refit REWRITES daily objects at the same S3 key, so anything inside
    # the lag window is not final.
    cutoff = ctx.raster_cutoff()
    if hi:
        cutoff = min(cutoff, hi)

    rows = ctx.db.execute(text(_RASTER_SQL), {
        "gran": granularity, "variable": variable, "statistic": statistic,
        "lo": lo, "cutoff": cutoff, "lim": limit,
    }).mappings().all()

    data, total_bytes = [], 0
    for r in rows:
        if is_frost_metric(r["statistic"]):
            continue
        item = {
            "id": r["id"], "variable": r["variable"],
            "granularity": r["granularity"], "statistic": r["statistic"],
            "valid_at": r["valid_at"].isoformat(),
            "resolution_m": r["resolution_m"],
            "model_version": r["model_version"],
            "cv_rmse": r["cv_rmse"],
            # Rainfall is fitted in RATIO space, so its cv_rmse is dimensionless
            # (~0.0025) and must never be rendered as millimetres.
            "cv_units": r["cv_units"],
            "n_stations_fit": r["n_stations_fit"],
            "n_stations_test": r["n_stations_test"],
            "clipped": r["clipped"], "status": r["status"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        }
        if include_url:
            from services import surface_store as store
            signed = store.presign(r["s3_key"])
            item["url"] = signed["url"]
            item["url_expires_at"] = signed["expires_at"]
            item["bytes"] = signed.get("bytes")
            # `etag`, not `checksum`: for a single-part upload it is the MD5 and
            # for a multipart it is not, so it is named for what it actually is.
            # It still does the job that matters here — telling a consumer the
            # object at a key they already hold has been REPLACED by the refit.
            item["etag"] = signed.get("etag")
            total_bytes += signed.get("bytes") or 0
        data.append(item)

    # MINTING is what costs, not downloading — otherwise the cap is
    # unenforceable. `include_url=false` browses the catalogue for free.
    if include_url:
        ctx.metered(objects=len(data), nbytes=total_bytes)
    else:
        ctx.metered(rows=len(data))

    lim = ctx.limits
    used = {"objects_remaining_today": None, "bytes_remaining_today": None}
    if lim:
        from core.partner_security import _usage_today
        u = _usage_today(ctx.db, ctx.credential.id)
        if lim.objects_per_day is not None:
            used["objects_remaining_today"] = max(
                0, lim.objects_per_day - u["objects"] - len(data))
        if lim.bytes_per_day is not None:
            used["bytes_remaining_today"] = max(
                0, lim.bytes_per_day - u["bytes"] - total_bytes)

    log_request(ctx, request, 200, endpoint)
    return _envelope(
        data, f"raster.{granularity}",
        extra={**used,
               "released_through": cutoff.isoformat(),
               "lag_days": lim.raster_lag_days if lim else 14,
               "cv_units_note": "rainfall is fitted in ratio space; its "
                                "cv_rmse is dimensionless, never millimetres",
               "unclipped": "values exist beyond the coast and the land mask; "
                            "read nodata as absent"},
        limit=limit)


@router.get("/rasters/daily")
def rasters_daily(request: Request,
                  variable: Optional[str] = Query(None),
                  from_: Optional[str] = Query(None, alias="from"),
                  to: Optional[str] = Query(None),
                  include_url: bool = Query(True),
                  limit: int = Query(200, le=1000, ge=1),
                  ctx: PartnerContext = Depends(get_partner)):
    """Daily GeoTIFF catalogue and signed objects. Coverage from 2026-02-15."""
    return _rasters(ctx, request, "daily", "raster.daily", variable, None,
                    from_, to, include_url, limit)


@router.get("/rasters/monthly")
def rasters_monthly(request: Request,
                    variable: Optional[str] = Query(None),
                    statistic: Optional[str] = Query(None),
                    from_: Optional[str] = Query(None, alias="from"),
                    to: Optional[str] = Query(None),
                    include_url: bool = Query(True),
                    limit: int = Query(200, le=1000, ge=1),
                    ctx: PartnerContext = Depends(get_partner)):
    """Monthly GeoTIFF catalogue and signed objects. Coverage from 1986-01."""
    return _rasters(ctx, request, "monthly", "raster.monthly", variable,
                    statistic, from_, to, include_url, limit)
