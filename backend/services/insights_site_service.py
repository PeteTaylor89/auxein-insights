"""Pro sites — placement rules and the per-cell extraction.

A Pro subscriber places ONE point and gets that cell's whole 1986-2023 record,
so it can be shown against its own long-run normal and against the wine zone it
sits in. This module owns both halves: what a placement is allowed to do, and
what the background job extracts once it is allowed.

## Extraction reads the same bands the ZONE tables aggregate

`aggregate_zone_monthly.BANDS` and `aggregate_zone_season.FROM_MONTHLY` are
imported rather than restated. The entire value of a Pro site is the comparison
against its region, and that comparison is only honest if both sides came from
the same bands, the same season definition and the same baseline. A second
hand-maintained list here would drift and the drift would look like a climate
signal.

## For ONE cell, the zone job's "Pass B" collapses into Pass A

`aggregate_zone_season` needs a second pass over the surfaces for `rx1day`,
`r99p` and the last spring frost, because `max` of zone means is not the zone
mean of per-cell maxima — the aggregation does not commute with the reduction.
**A site has no spatial aggregation**, so at a single cell the season maximum
genuinely IS the maximum of the monthly maxima, and all three metrics come
straight out of the monthly rows. That is a real simplification, not a corner
cut; it exists because the grain is different.

## Sampling is by (row, col), not by (lon, lat)

The cell is resolved ONCE at placement and stored. Re-sampling by coordinate on
every population would let a site drift to a neighbouring cell if the grid were
ever rebuilt, and a drift of one 500 m cell is invisible in the output but can
move a valley-floor site onto a hillside.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from db.models.insights_site import (
    InsightsSite, MOVES_PER_WINDOW, MOVE_WINDOW_DAYS,
)
from services import surface_store as store

log = logging.getLogger(__name__)

# Reference variable used to resolve a point to a cell and to test whether it is
# on the land mask at all. temp_mean because it is the densest-fitted variable
# and the one every site needs regardless of what else it charts.
REFERENCE_VARIABLE = "temp_mean"
REFERENCE_STATISTIC = "mean"

FIRST_VINTAGE, LAST_VINTAGE = 1987, 2023
SEASON_MONTHS = [(9, -1), (10, -1), (11, -1), (12, -1),
                 (1, 0), (2, 0), (3, 0), (4, 0)]


class PlacementError(Exception):
    """A placement that is refused for a reason the subscriber can act on."""

    def __init__(self, code: str, message: str, detail: Optional[dict] = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.detail = detail or {}


# --- placement ---------------------------------------------------------------

def resolve_cell(db: Session, lat: float, lon: float) -> dict:
    """Resolve a coordinate to a surface cell, or refuse it.

    **Refusing off-mask points at placement is deliberate.** A point over water
    would otherwise create a site that populates to 456 nulls and reports
    'ready' — an empty product with no explanation. It is not a rare edge case
    either: coastal vineyard cells genuinely fall outside the 500 m land mask,
    and in the vineyard register 25.3% of Northland's planted hectares sit on
    cells whose centre is water. So the refusal carries the distance to the
    nearest land cell, and the caller offers to move there.
    """
    row = db.execute(text("""
        SELECT s3_key, resolution_m, model_version
          FROM surface_run
         WHERE variable = :v AND granularity = 'monthly' AND statistic = :s
           AND status <> 'failed'
         ORDER BY valid_at DESC LIMIT 1
    """), {"v": REFERENCE_VARIABLE, "s": REFERENCE_STATISTIC}).mappings().first()
    if not row:
        raise PlacementError("no_archive",
                             "The climate surface archive is not available.")

    import rasterio
    with store.gdal_env():
        with rasterio.open(store.object_url(row["s3_key"])) as ds:
            nodata = ds.nodata
            r, c = ds.index(lon, lat)
            if not (0 <= r < ds.height and 0 <= c < ds.width):
                raise PlacementError(
                    "outside_coverage",
                    "That point is outside New Zealand.")
            value = float(ds.read(1, window=((r, r + 1), (c, c + 1)))[0][0])
            on_land = not (nodata is not None and value == nodata) and value == value
            grid_key = f"{ds.width}x{ds.height}@{ds.transform.c:.6f},{ds.transform.f:.6f}"

            nearest = None
            if not on_land:
                nearest = _nearest_land(ds, r, c, nodata)

    if not on_land:
        raise PlacementError(
            "off_land_mask",
            "That point sits on a cell the 500 m climate surface treats as "
            "water. Coastal sites often do.",
            {"nearest_land": nearest})

    return {"row": int(r), "col": int(c), "grid_key": grid_key,
            "resolution_m": int(row["resolution_m"])}


def _nearest_land(ds, r: int, c: int, nodata, max_rings: int = 8) -> Optional[dict]:
    """Nearest land cell within `max_rings` cells, as (lat, lon) plus distance.

    Bounded on purpose: beyond a few cells the "nearest land" is no longer the
    site the subscriber meant, and silently relocating a point kilometres away
    is worse than refusing it.
    """
    import numpy as np
    for ring in range(1, max_rings + 1):
        r0, r1 = max(0, r - ring), min(ds.height, r + ring + 1)
        c0, c1 = max(0, c - ring), min(ds.width, c + ring + 1)
        block = ds.read(1, window=((r0, r1), (c0, c1)))
        mask = block != nodata if nodata is not None else np.ones_like(block, bool)
        mask &= block == block
        if not mask.any():
            continue
        rr, cc = np.argwhere(mask)[0]
        gr, gc = r0 + int(rr), c0 + int(cc)
        lon, lat = ds.xy(gr, gc)
        return {"lat": float(lat), "lon": float(lon), "cells_away": ring}
    return None


def resolve_zone(db: Session, lat: float, lon: float) -> Optional[int]:
    """The wine zone containing the point, if any.

    Zones NEST, so a point in Lower Wairau is also in Marlborough. The SMALLEST
    containing zone wins — it is the closest regional analogue, and the parent
    is reachable from it. A site outside every zone is legitimate and returns
    None rather than being snapped to a nearby region.
    """
    return db.execute(text("""
        SELECT id FROM climate_zones
         WHERE geometry IS NOT NULL AND is_active = true
           AND ST_Contains(geometry, ST_SetSRID(ST_Point(:lon, :lat), 4326))
         ORDER BY ST_Area(geometry) ASC
         LIMIT 1
    """), {"lat": lat, "lon": lon}).scalar()


def company_for(db: Session, public_user_id: int) -> Optional[int]:
    """The Grow company behind an Insights account, if it has one.

    `public_users` has no company of its own; this walks the one-way SSO link.
    NULL for every direct Insights subscriber, which is most of them.
    """
    return db.execute(text("""
        SELECT u.company_id
          FROM public_users p JOIN users u ON u.id = p.grow_user_id
         WHERE p.id = :pid
    """), {"pid": public_user_id}).scalar()


def check_move_allowed(site: InsightsSite, now: Optional[datetime] = None) -> None:
    """Raise unless this site may be moved again in the current window.

    The window starts at the FIRST move rather than on a calendar boundary, so
    a subscriber who places in December is not handed a fresh allowance in
    January.
    """
    now = now or datetime.now(timezone.utc)
    start = site.move_window_start
    if start is None:
        return
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if now - start >= timedelta(days=MOVE_WINDOW_DAYS):
        return
    if (site.moves_used or 0) < MOVES_PER_WINDOW:
        return
    resets = start + timedelta(days=MOVE_WINDOW_DAYS)
    raise PlacementError(
        "move_limit",
        f"A site can be moved {MOVES_PER_WINDOW} times a year. This one's "
        f"allowance resets on {resets.date().isoformat()}.",
        {"moves_used": site.moves_used, "resets_on": resets.date().isoformat()})


def record_move(site: InsightsSite, now: Optional[datetime] = None) -> None:
    now = now or datetime.now(timezone.utc)
    start = site.move_window_start
    if start is not None and start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if start is None or now - start >= timedelta(days=MOVE_WINDOW_DAYS):
        site.move_window_start = now
        site.moves_used = 1
    else:
        site.moves_used = (site.moves_used or 0) + 1


# --- extraction ---------------------------------------------------------------

# Bands a SITE carries that a zone deliberately does not.
#
# `aggregate_zone_monthly` excludes the day-of-month bands because 0 means
# "never", so a weighted mean over cells averages "no frost" against "the 28th"
# and returns something that looks like a date and is not one. **That objection
# is about averaging, and a site averages nothing** — at one cell the frost date
# is exactly the date. So the site product can honestly carry a last-frost date
# where the regional product cannot, and this is one of the few places the two
# legitimately differ.
SITE_EXTRA_BANDS = {"temp_min": ["last_frost_day"]}


def _bands() -> dict:
    """The (variable -> statistics) map the zone tables aggregate.

    Imported from the zone job so the two sides of every comparison come from
    the same bands. `gdd10` is appended because the zone monthly table carries
    it as a derived statistic and a site must too, or the headline number on the
    Pro page has no regional counterpart.
    """
    import sys
    from pathlib import Path
    root = Path(__file__).resolve().parents[1]
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))
    from scripts.aggregate_zone_monthly import BANDS
    merged = {v: list(s) for v, s in BANDS.items()}
    for variable, extra in SITE_EXTRA_BANDS.items():
        merged.setdefault(variable, [])
        for stat in extra:
            if stat not in merged[variable]:
                merged[variable].append(stat)
    return merged


# Concurrent object reads. The extraction is ~7,700 separate S3 objects and is
# almost entirely LATENCY, not work: measured serially it managed ~13 read
# operations a second while burning 50s of CPU in 20 minutes of wall clock, so
# the process was asleep on the network for ~96% of the run.
#
# Each task opens its OWN dataset inside its OWN GDAL environment. rasterio
# datasets are not safe to share between threads, but independent handles are
# fine, and GDAL releases the GIL during the HTTP fetch — which is exactly the
# shape that thread pools help.
#
# 12 rather than more: every worker is a separate HTTPS connection to the same
# bucket, and the job runs beside the API on the same instance. The goal is to
# stop waiting on latency, not to saturate the NIC.
EXTRACT_WORKERS = int(os.getenv("INSIGHTS_SITE_WORKERS", "12"))


def _read_cell(rec: dict, row: int, col: int) -> Optional[float]:
    """One cell out of one surface object. Returns None for nodata."""
    import rasterio
    with store.gdal_env():
        with rasterio.open(store.object_url(rec["s3_key"])) as ds:
            nodata = ds.nodata
            v = float(ds.read(1, window=((row, row + 1), (col, col + 1)))[0][0])
    # NULL, never 0 — the surface genuinely has no value here.
    if (nodata is not None and v == nodata) or v != v:
        return None
    return v


def extract_monthly(db: Session, site: InsightsSite) -> list[tuple]:
    """Every (variable, statistic, year, month, value) at this site's cell.

    One windowed 1x1 read per surface object, ~7,700 of them, run concurrently
    (see EXTRACT_WORKERS). Each touches a single 512 px COG block, so it is tens
    of KB over the wire rather than a 30 MB raster — the cost is round trips,
    which is why they overlap.

    A single unreadable object is logged and skipped rather than failing the
    site: one missing month out of 456 is a hole the charts already handle,
    whereas failing the whole extraction over it hands a paying customer
    nothing. A cell that is unreadable EVERYWHERE is caught by the caller,
    which checks that anything at all came back with a value.
    """
    from concurrent.futures import ThreadPoolExecutor

    wanted = _bands()
    rows = [r for r in db.execute(text("""
        SELECT variable, statistic, valid_at, s3_key
          FROM surface_run
         WHERE granularity = 'monthly' AND status <> 'failed'
           AND variable = ANY(:vars)
         ORDER BY variable, statistic, valid_at
    """), {"vars": list(wanted)}).mappings().all()
        if r["statistic"] in wanted.get(r["variable"], ())]

    row_i, col_i = site.grid_row, site.grid_col

    def task(rec):
        try:
            return rec, _read_cell(rec, row_i, col_i)
        except Exception as exc:                                    # noqa: BLE001
            log.warning("site %s: %s unreadable: %s", site.id,
                        rec["s3_key"], exc)
            return rec, ...

    out: list[tuple] = []
    with ThreadPoolExecutor(max_workers=EXTRACT_WORKERS) as pool:
        for rec, value in pool.map(task, rows):
            if value is ...:
                continue
            valid = rec["valid_at"]
            out.append((site.id, rec["variable"], rec["statistic"],
                        valid.year, valid.month, value))
    return out


def derive_gdd10(monthly: dict) -> dict:
    """Monthly GDD base 10 at this cell, from its own mean and sd.

    Same normal-integral estimator as the zone job and the GDD surfaces; see
    `scripts/interpolation/gdd_season` for why `max(0, mu-10)` is not an
    acceptable substitute. Keyed (year, month) -> GDD.
    """
    import math
    from calendar import monthrange

    out = {}
    for (year, month), mu in monthly.get(("temp_mean", "mean"), {}).items():
        sd = monthly.get(("temp_mean", "sd"), {}).get((year, month))
        if mu is None or sd is None:
            continue
        sd = max(float(sd), 1e-6)
        z = (float(mu) - 10.0) / sd
        phi = math.exp(-0.5 * z * z) / math.sqrt(2.0 * math.pi)
        ndtr = 0.5 * (1.0 + math.erf(z / math.sqrt(2.0)))
        n_days = monthrange(year, month)[1]
        out[(year, month)] = n_days * ((float(mu) - 10.0) * ndtr + sd * phi)
    return out


# Season metrics a site publishes. Deliberately the zone vocabulary, so every
# number on the Pro page has a regional counterpart to sit against.
#
# **`r99p` is NOT here, and that is a decision rather than an omission.** The
# zone job derives it from the `wet_topN` bands pooled over a baseline period.
# Reproducing that faithfully is possible, but reproducing it *approximately*
# would be worse than leaving it out: the whole product claim is site-versus-
# region, and a site r99p computed by a different route than the zone r99p is a
# comparison of two methods dressed up as a comparison of two places. It goes in
# when it can share the zone job's code path.
SITE_SEASON_UNITS = {
    "gdd10": "GDD", "tmean": "C", "tmin": "C", "tmax": "C",
    "frost_days": "days", "early_frost_days": "days",
    "hot_days_25": "days", "hot_days_30": "days",
    "rain": "mm", "wet_days": "days",
    "rain_days_over_10mm": "days", "rain_days_over_25mm": "days",
    "max_dry_spell_within_month": "days",
    "rx1day": "mm", "last_spring_frost_doy": "day of year",
}


def derive_season(monthly: dict, gdd: dict) -> list[tuple]:
    """Season metrics at this cell, from its own monthly rows.

    `monthly` is {(variable, statistic): {(year, month): value}}.

    Every metric here comes out of the monthly rows — including `rx1day` and the
    last spring frost, which the ZONE job needs a second pass over the surfaces
    for. See the module docstring: max-of-means is not mean-of-maxima, but at a
    single cell there are no means to commute with, so the season maximum is
    simply the maximum of the monthly maxima.
    """
    from calendar import monthrange
    from datetime import date

    def series(variable, statistic):
        return monthly.get((variable, statistic), {})

    out: list[tuple] = []
    for vintage in range(FIRST_VINTAGE, LAST_VINTAGE + 1):
        span = [(vintage + off, m) for m, off in SEASON_MONTHS]

        def collect(variable, statistic):
            s = series(variable, statistic)
            got = [(y, m, s.get((y, m))) for y, m in span]
            return [(y, m, v) for y, m, v in got if v is not None]

        def total(variable, statistic):
            vals = collect(variable, statistic)
            # A partial season is not a season. Emitting a sum over 6 of 8
            # months would read as a low year rather than as missing data.
            return sum(v for _, _, v in vals) if len(vals) == len(span) else None

        def day_weighted_mean(variable, statistic):
            vals = collect(variable, statistic)
            if len(vals) != len(span):
                return None
            num = sum(v * monthrange(y, m)[1] for y, m, v in vals)
            den = sum(monthrange(y, m)[1] for y, m, _ in vals)
            return num / den if den else None

        def peak(variable, statistic):
            vals = collect(variable, statistic)
            return max(v for _, _, v in vals) if vals else None

        values = {
            "gdd10": (sum(gdd[(y, m)] for y, m in span if (y, m) in gdd)
                      if all((y, m) in gdd for y, m in span) else None),
            "tmean": day_weighted_mean("temp_mean", "mean"),
            "tmin": day_weighted_mean("temp_min", "mean"),
            "tmax": day_weighted_mean("temp_max", "mean"),
            "frost_days": total("temp_min", "frost_days"),
            "hot_days_25": total("temp_max", "days_over_25"),
            "hot_days_30": total("temp_max", "days_over_30"),
            "rain": total("rainfall", "sum"),
            "wet_days": total("rainfall", "wet_days"),
            "rain_days_over_10mm": total("rainfall", "days_over_10mm"),
            "rain_days_over_25mm": total("rainfall", "days_over_25mm"),
            "max_dry_spell_within_month": peak("rainfall", "max_dry_spell"),
            "rx1day": peak("rainfall", "max"),
        }

        # Frosts that hit budburst: September to November only.
        spring = [(vintage - 1, m) for m in (9, 10, 11)]
        fd = series("temp_min", "frost_days")
        got = [fd.get(k) for k in spring]
        values["early_frost_days"] = (sum(v for v in got if v is not None)
                                      if all(v is not None for v in got) else None)

        # The LAST spring frost, as a day of year. The band is a day-of-month
        # with 0 meaning "no frost that month", so the answer is the latest
        # month that had one — and a site with no spring frost at all emits NO
        # ROW rather than a 0 that would average in as 1 January.
        lfd = series("temp_min", "last_frost_day")
        last = None
        for y, m in spring:
            d = lfd.get((y, m))
            if d is not None and d > 0:
                last = date(y, m, min(int(d), monthrange(y, m)[1])).timetuple().tm_yday
        if last is not None:
            values["last_spring_frost_doy"] = last

        for metric, value in values.items():
            if value is None:
                continue
            out.append((None, vintage, metric, float(value),
                        SITE_SEASON_UNITS[metric], None))
    return out
