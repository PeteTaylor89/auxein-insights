"""The read views of a site, once — for both the apps that ask for them.

Insights asks by SITE ID as a subscriber (`api/v1/insights_sites.py`); Grow asks
by PROPERTY ID as a company user (`api/v1/properties.py`, the `/climate/*`
routes). The question is identical and the answer must be, or the same customer
reads two different numbers for the same cell on two of our pages.

## Why the bodies moved here rather than Grow calling the Insights routes

A route function cannot be called from another route. Its parameter defaults are
`Query(...)` objects, resolved by FastAPI's dependency machinery and NOT by
Python, so an argument the caller omits arrives as a Query instance — which
reaches psycopg2 as `can't adapt type 'Query'`, a calling-convention fault that
reads like a database one. That bug cost an afternoon on 2026-09-10 in
`grow_season`, and `_parse_baseline` still carries a guard against the same
thing for the scripts that call routers directly.

The ownership check is the other half. Insights resolves a `PublicUser` against
`insights_site.public_user_id` or an account membership; Grow resolves a Grow
`User` against `get_visible_property_ids`. Neither can answer the other's
question, and neither belongs in a payload builder. So: the routers own auth,
this module owns the answer.

## Every function takes a SITE ROW and adds no `site` block

The caller adds its own. Insights returns its `SiteResponse`; Grow returns the
property beside it, because a Grow user identifies the place by property name
and has never seen a site id.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from db.models.insights_site import InsightsSite, MOVES_PER_WINDOW
from pydantic import BaseModel

from services import insights_site_service as svc
from services import insights_dashboard as dashboard
from services import insights_site_baseline as site_baseline

#: The one reference period for every panel. Sourced from the baseline service
#: so the API and the curve builder cannot drift. See the long note in
#: `api/v1/insights_sites.py` for why 1986-2005 and not the WMO 1991-2020.
PRO_BASELINE = f"{site_baseline.BASELINE_LO}-{site_baseline.BASELINE_HI}"


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


def parse_baseline(baseline: str) -> tuple[int, int]:
    """'YYYY-YYYY' -> bounds. Raises ValueError; the router maps it to a 422.

    A non-string means a caller that bypassed FastAPI and left the `Query(...)`
    default in place, so it resolves to the page baseline rather than blowing up
    somewhere further down.
    """
    if not isinstance(baseline, str):
        baseline = PRO_BASELINE
    try:
        lo, hi = (int(p) for p in baseline.split("-"))
    except Exception as exc:                                        # noqa: BLE001
        raise ValueError(f"baseline must be 'YYYY-YYYY', got {baseline!r}") from exc
    if hi <= lo:
        raise ValueError("baseline end must be after its start")
    return lo, hi


def serialise_site(db: Session, site: InsightsSite) -> SiteResponse:
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


def not_ready(site: InsightsSite) -> Optional[dict]:
    """`{code, message}` while a site cannot be read, else None.

    Insights raises this as a 409; Grow returns it inside a 200 with
    `available: false`, because a Grow user who has not created a site yet is in
    a normal state and every Grow panel is built to explain an absence.
    """
    if site.status == "ready":
        return None
    return {
        "code": site.status,
        "message": ("This site is still populating."
                    if site.status == "populating"
                    else (site.status_detail or "Population failed.")),
    }


# --- season by season --------------------------------------------------------


def seasons(db: Session, site: InsightsSite,
            metrics: Optional[list[str]] = None) -> dict:
    """Per-vintage site values beside the regional spread for the same metric.

    The zone side carries `mean` AND `p10`/`p90` — the spread across real
    vineyards in the region — because "warmer than the regional mean" is a much
    weaker statement than "outside the range 90% of the region sits in".
    """
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
           "all": metrics is None, "metrics": metrics or []}).mappings().all()

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


# --- month by month ----------------------------------------------------------


class NoSuchBand(Exception):
    """The site holds no rows for this variable/statistic pair."""


def monthly(db: Session, site: InsightsSite, variable: str, statistic: str,
            baseline: tuple[int, int]) -> dict:
    """Month-by-month at this site, against its own normal and its region's.

    One `baseline` drives both normals. Two reference periods would produce an
    anomaly that is an artefact of the periods rather than of the place.
    """
    lo, hi = baseline
    points = db.execute(text("""
        SELECT year, month, value FROM insights_site_monthly
         WHERE site_id = :sid AND variable = :v AND statistic = :s
         ORDER BY year, month
    """), {"sid": site.id, "v": variable, "s": statistic}).mappings().all()
    if not points:
        raise NoSuchBand(f"This site holds no {variable}/{statistic}.")

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
        # the caller is not FastAPI — `check_insights_sites` calls the route
        # function directly, so an untouched `Query(...)` would otherwise be
        # reported to the client as the baseline.
        "meta": {"baseline": f"{lo}-{hi}",
                 "baseline_applies_to": "both the site and the regional normal",
                 "regional_comparison": site.zone_id is not None,
                 "n_months": len(points)},
    }


# --- projections -------------------------------------------------------------


def projections(db: Session, site: InsightsSite, season: str = "ANN") -> dict:
    """What this site looks like under each scenario, against its own baseline.

    `delta` is the number to read: `projected - baseline` at THIS cell, where the
    baseline is our own 1986-2005 normal sampled from the same raster family the
    projection was composed from. The zone's delta is returned beside it because
    a projected delta is meaningless without something to size it against.

    Asking for a season a band does not carry returns an empty list rather than
    an error — the caller chooses from the `seasons` menu this also supplies.
    """
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
    seasons_held = [r[0] for r in db.execute(text(
        "SELECT DISTINCT season FROM insights_site_projection "
        "WHERE site_id = :sid ORDER BY season"), {"sid": site.id}).all()]

    # A row sampled before the site was moved describes the OLD cell. Saying so
    # is cheap; discovering it from a number that looks fine is not.
    #
    # NOTE (2026-09-23): `grid_key` is the RASTER's identity — `WxH@originx,
    # originy` — which is the same for every point on the same grid. So this
    # detects a re-projected archive, NOT a moved site. The cell is
    # `grid_row`/`grid_col`, and comparing those would need them stored per row.
    stale = sorted({r["grid_key"] for r in rows
                    if r["grid_key"] and r["grid_key"] != site.grid_key})

    # The region behind this site, and whether it has projections of its own to
    # send a reader on to. Country and industry come from the zone rather than
    # being assumed to be nz/wine, because the URL grammar on the Insights side
    # is /{country}/{industry}/{slug} and the platform now holds more than one.
    zone = None
    if site.zone_id:
        zone = db.execute(text("""
            SELECT z.id, z.name, z.slug,
                   lower(c.iso2) AS country, i.key AS industry,
                   EXISTS (SELECT 1 FROM climate_projections p
                            WHERE p.zone_id = z.id) AS regional_available
              FROM climate_zones z
              LEFT JOIN countries c ON c.id = z.country_id
              LEFT JOIN industries i ON i.id = z.industry_id
             WHERE z.id = :z
        """), {"z": site.zone_id}).mappings().first()

    return {
        "season": season,
        "seasons": seasons_held,
        "baseline_period": "1986-2005",
        "stale_cells": stale,
        "zone": dict(zone) if zone else None,
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


def season_series(db: Session, site: InsightsSite,
                  vintage: Optional[int] = None) -> dict:
    """This season day by day: the site, its own baseline, and its region.

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
        return {"vintage_year": vintage,
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
