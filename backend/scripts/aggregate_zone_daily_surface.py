#!/usr/bin/env python3
"""Fill `climate_zone_daily` from the daily surfaces, through the zone mask.

    python backend/scripts/aggregate_zone_daily_surface.py --start 2026-08-01 --end 2026-08-29
    python backend/scripts/aggregate_zone_daily_surface.py --date 2026-08-29 --apply
    python backend/scripts/aggregate_zone_daily_surface.py --start ... --end ... --zone-id 2 --apply

Replaces `zone_aggregation.py`'s station IDW as the source of the four surface
variables. Written 2026-08-30.

## Why the station rollup had to go

`zone_aggregation.get_zones_with_stations` requires `MIN_STATIONS_FOR_ZONE = 2`
stations REPORTING TEMPERATURE that day, counted over the zone's subtree. On
2026-08-29 that left **8 of 23 zones with no row at all** — Auckland, Waiheke,
Ngaruroro, Gladstone, Martinborough, Bannockburn, Gibbston and South Coast.
Waiheke has zero stations and can never satisfy it; Gladstone and Bannockburn
have four each but only one reporting temperature.

Lowering the threshold is not the fix. At one station the zone value IS that
station, the outlier removal has nothing to compare against, and Waiheke still
gets nothing. The surface already covers every one of those zones: all 23 have
mask cells, 10,379 in total.

## What this computes

For each zone and day, the planted-hectare weighted mean over that zone's mask
cells of temp_min, temp_max, temp_mean and rainfall. Same mask, same weighting
and the same windowed-read approach as `aggregate_zone_monthly.py`, which is the
monthly version of this operation — the two are meant to agree.

## TWO GDD BASES, BOTH WANTED, AND THEY ANSWER DIFFERENT QUESTIONS

`gdd_daily` / `gdd_cumulative` are **base 0** and stay that way. Phenology is
calibrated against them, and `phenology_service`, the region and site dashboards
and the season adjustment in `realtime_climate` all document and depend on it.
Writing
base 10 into those columns moves every crossing date, silently. It was done on
2026-08-30 and reverted the same day.

`gdd10_daily` / `gdd10_cumulative` are **base 10** — the presentation metric a
grower reads.

**Both are evaluated PER CELL, which is the reason to store the base-10 one at
all.** GDD is convex in temperature, so `GDD(mean of cells)` is not
`mean of GDD(cell)`, and the gap is a systematic under-count at cool sites
rather than noise. Every consumer that wanted base 10 was recomputing
`sum(max(0, temp_mean - 10))` from the ZONE MEAN and inheriting that under-count.
Subtracting the base at each cell and weighting afterwards is the value the
recompute cannot produce.

For a DAILY value that is exact and needs no estimator — the normal-integral in
`aggregate_zone_monthly.gdd_normal` exists only because a MONTHLY total has to be
recovered from a mean and an sd. `GDD_BASE` is IMPORTED from that module rather
than restated so the two cannot drift apart.

## THE SEASON ACCUMULATES FROM 1 SEPTEMBER, NOT FROM THE VINTAGE BOUNDARY

`vintage_year` rolls on 1 July, but a vine's season does not. Both cumulatives
here start at **1 September** of the vintage's opening year and read 0 before it,
which is why every zone is 0 through July and August.

That deliberately differs from the historical base-0 column, which accumulated
from 1 July and was corrected to a September start downstream by subtracting a
climatological August-31 offset. Subtracting a BASELINE offset from an ACTUAL
season leaves a residual that is not zero at the season's start. Starting the sum
where the season starts removes the correction rather than tuning it.

## Humidity and solar are PRESERVED, never overwritten

The surface carries four variables. `climate_zone_daily` also has
`humidity_mean` and `solar_radiation`, which only the station rollup can
produce. The upsert therefore writes the four surface columns and leaves those
two exactly as they were — a zone that had humidity keeps it, and one that never
had any stays NULL. Blanking them would destroy the only copy.

## `gdd_cumulative` is RE-DERIVED for the whole vintage, not carried forward

The accumulator is recomputed from `gdd_daily` in a single window function over
every affected vintage, end to end. It never reads its own previous output.

Note this is the OPPOSITE rule to the disease accumulator, and deliberately so.
That one had to be date-bounded because it read its own previous state, so an
unbounded recompute pulled in later days, the newest value fed itself, and a
decay became a ratchet — 45% of the 2026 disease vintage was corrupt. Here there
is no self-reference to bound, and bounding would be the bug: a replay of an
older window would leave every later day in the vintage holding a cumulative
built from superseded daily values, silently.
"""
from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np                                                  # noqa: E402
from dotenv import load_dotenv                                      # noqa: E402
from sqlalchemy import text                                         # noqa: E402

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from db.session import SessionLocal                                 # noqa: E402
from scripts.aggregate_zone_monthly import GDD_BASE                 # noqa: E402
from scripts.zone_aggregation import get_vintage_year               # noqa: E402
from services import insights_site_service as svc                   # noqa: E402
from services import surface_store as store                         # noqa: E402

# The four the surface publishes -> the column each lands in. Mirrors
# `insights_site_service.DAILY_VARIABLES`; imported rather than restated for the
# same reason the GDD base is.
VARIABLE_COLUMN = dict(svc.DAILY_VARIABLES)

# `climate_zone_daily.processing_method` is varchar(20) — the obvious
# "surface_mask_planted_ha" is 24 characters and fails at insert time.
PROCESSING_METHOD = "surface_planted_ha"

# The vine season opens 1 September. `vintage_year` rolls on 1 July, so the two
# do not coincide and the accumulation must key off this, not off the vintage.
SEASON_START_MONTH = 9
SEASON_START_DAY = 1


def load_mask(db, zone_id=None) -> tuple[dict, str]:
    """Per-zone mask cells, read windows and planted-hectare weights."""
    sql = """
        SELECT m.zone_id, m.row, m.col, m.planted_ha, m.grid_key, z.name
          FROM climate_zone_cell_mask m
          JOIN climate_zones z ON z.id = m.zone_id
    """
    params = {}
    if zone_id is not None:
        sql += " WHERE m.zone_id = :z"
        params["z"] = zone_id
    rows = db.execute(text(sql + " ORDER BY m.zone_id"), params).fetchall()
    if not rows:
        raise SystemExit("mask is empty - run build_zone_mask.py first")

    grid_keys = {r.grid_key for r in rows}
    if len(grid_keys) != 1:
        raise SystemExit(f"mask spans multiple grids {grid_keys} - refusing to run")

    grouped = defaultdict(list)
    for r in rows:
        grouped[r.zone_id].append(r)

    per_zone = {}
    for zid, recs in grouped.items():
        rr = np.array([r.row for r in recs], dtype=np.int64)
        cc = np.array([r.col for r in recs], dtype=np.int64)
        per_zone[zid] = {
            "name": recs[0].name,
            "row0": int(rr.min()), "row1": int(rr.max()) + 1,
            "col0": int(cc.min()), "col1": int(cc.max()) + 1,
            "rows": rr, "cols": cc,
            "w": np.array([r.planted_ha for r in recs], dtype=np.float64),
        }
    return per_zone, grid_keys.pop()


def read_cells(s3_key: str, per_zone: dict) -> dict:
    """Every zone's mask cells out of one COG, via per-zone windowed reads.

    One window per zone rather than one full read: each zone's mask is a small
    fixed box and the COG is internally tiled, so this is what the format is
    for. Reading the whole 2667x2856 raster to use a few hundred cells would be
    the same answer at many times the cost.
    """
    import rasterio
    from rasterio.windows import Window

    out = {}
    with store.gdal_env():
        with rasterio.open(store.object_url(s3_key)) as ds:
            nodata = ds.nodata
            for zid, z in per_zone.items():
                win = Window(z["col0"], z["row0"],
                             z["col1"] - z["col0"], z["row1"] - z["row0"])
                arr = ds.read(1, window=win)
                vals = arr[z["rows"] - z["row0"],
                           z["cols"] - z["col0"]].astype(np.float64)
                if nodata is not None:
                    vals[vals == nodata] = np.nan
                out[zid] = vals
    return out


def weighted_mean(vals: np.ndarray, w: np.ndarray):
    """Planted-hectare weighted mean over the cells that carry a value.

    Cells off the land mask come back NaN and are dropped along with their
    weight, so a coastal zone is the mean of its LAND cells rather than being
    dragged toward nothing.
    """
    good = np.isfinite(vals)
    if not good.any():
        return None, 0
    return float(np.average(vals[good], weights=w[good])), int(good.sum())


def build_day(db, day: date, per_zone: dict) -> list[dict]:
    """One record per zone for `day`, or [] if the day has no surfaces."""
    surfaces = svc.daily_surfaces(db, day, day)
    by_variable = {s["variable"]: s["s3_key"] for s in surfaces}
    if not by_variable:
        return []

    # variable -> {zone_id: values at that zone's cells}
    sampled = {v: read_cells(key, per_zone) for v, key in by_variable.items()}

    records = []
    for zid, z in per_zone.items():
        rec = {"zone_id": zid, "date": day,
               "vintage_year": get_vintage_year(day),
               "cells_used": 0}
        for variable, column in VARIABLE_COLUMN.items():
            value, n = (None, 0)
            if variable in sampled:
                value, n = weighted_mean(sampled[variable][zid], z["w"])
            rec[column] = value
            rec["cells_used"] = max(rec["cells_used"], n)

        # GDD per cell, then weighted — never GDD of the weighted mean.
        # Base 0 for phenology, base 10 for presentation. Same cells, same
        # weights, two thresholds.
        rec["gdd_daily"] = None
        rec["gdd10_daily"] = None
        if "temp_mean" in sampled:
            cells = sampled["temp_mean"][zid]
            rec["gdd_daily"], _ = weighted_mean(
                np.maximum(0.0, cells), z["w"])
            rec["gdd10_daily"], _ = weighted_mean(
                np.maximum(0.0, cells - GDD_BASE), z["w"])

        if rec["cells_used"]:
            records.append(rec)
    return records


UPSERT = text("""
    INSERT INTO climate_zone_daily
        (zone_id, date, vintage_year, temp_min, temp_max, temp_mean,
         rainfall_mm, gdd_daily, gdd10_daily, station_count, stations_with_temp,
         stations_with_rain, confidence, processing_method, created_at)
    VALUES
        (:zone_id, :date, :vintage_year, :temp_min, :temp_max, :temp_mean,
         :rainfall_mm, :gdd_daily, :gdd10_daily, :cells_used, :cells_used,
         :cells_used, :confidence, :method, now())
    ON CONFLICT (zone_id, date) DO UPDATE SET
        vintage_year       = EXCLUDED.vintage_year,
        temp_min           = EXCLUDED.temp_min,
        temp_max           = EXCLUDED.temp_max,
        temp_mean          = EXCLUDED.temp_mean,
        rainfall_mm        = EXCLUDED.rainfall_mm,
        gdd_daily          = EXCLUDED.gdd_daily,
        gdd10_daily        = EXCLUDED.gdd10_daily,
        station_count      = EXCLUDED.station_count,
        stations_with_temp = EXCLUDED.stations_with_temp,
        stations_with_rain = EXCLUDED.stations_with_rain,
        confidence         = EXCLUDED.confidence,
        processing_method  = EXCLUDED.processing_method,
        created_at         = now()
    -- humidity_mean and solar_radiation are ABSENT from both lists on purpose.
    -- The surface cannot produce them and the station rollup is their only
    -- source, so an UPDATE that named them would blank the only copy.
""")


def confidence_for(cells: int) -> str:
    """Coverage, expressed on the same three-level scale the table already uses.

    The station rollup's thresholds (6 / 4 stations) mean nothing here, so these
    are cell counts. Waiheke's 116 cells and Marlborough's 3,440 are both a
    complete description of their zone — the floor exists to catch a mask that
    has been rebuilt badly, not to rank the regions against each other.
    """
    if cells >= 100:
        return "high"
    return "medium" if cells >= 25 else "low"


def reaccumulate(db, vintages: set[int], zone_ids) -> int:
    """Re-derive `gdd_cumulative` across each affected vintage, in one pass.

    THE WHOLE VINTAGE, DELIBERATELY UNBOUNDED — and that is safe here for a
    reason worth stating, because the opposite rule applies elsewhere.

    The disease accumulator had to be date-bounded because it READ ITS OWN
    PREVIOUS OUTPUT: with no bound a recompute pulled in days after the target,
    the newest value fed itself, and a decay became a ratchet. This reads only
    `gdd_daily` and derives the running total in a single window function, so
    there is no self-reference to bound.

    Bounding it would actually be the bug. A replay of an older window would
    leave every later day in that vintage holding a cumulative computed from
    superseded daily values, silently. Recomputing the vintage end to end makes
    a replay idempotent by construction, which is the property that matters.
    """
    result = db.execute(text("""
        WITH scoped AS (
            SELECT id, zone_id, vintage_year, date,
                   -- Before 1 September the season has not opened, so the day
                   -- contributes nothing. make_date uses the vintage's OPENING
                   -- year, which is vintage_year - 1.
                   CASE WHEN date >= make_date(vintage_year - 1, :m, :d)
                        THEN coalesce(gdd_daily, 0) ELSE 0 END   AS g0,
                   CASE WHEN date >= make_date(vintage_year - 1, :m, :d)
                        THEN coalesce(gdd10_daily, 0) ELSE 0 END AS g10
              FROM climate_zone_daily
             WHERE vintage_year = ANY(CAST(:vintages AS int[]))
               AND (:all_zones OR zone_id = ANY(CAST(:zones AS int[])))
        ), running AS (
            SELECT id,
                   sum(g0)  OVER w AS cum,
                   sum(g10) OVER w AS cum10
              FROM scoped
            WINDOW w AS (PARTITION BY zone_id, vintage_year ORDER BY date
                         ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
        )
        UPDATE climate_zone_daily d
           SET gdd_cumulative   = running.cum,
               gdd10_cumulative = running.cum10
          FROM running
         WHERE d.id = running.id
           AND (d.gdd_cumulative   IS DISTINCT FROM running.cum
             OR d.gdd10_cumulative IS DISTINCT FROM running.cum10)
    """), {"vintages": sorted(vintages),
           "all_zones": zone_ids is None,
           "zones": zone_ids or [],
           "m": SEASON_START_MONTH, "d": SEASON_START_DAY})
    return result.rowcount


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--date", help="single day, YYYY-MM-DD")
    ap.add_argument("--start")
    ap.add_argument("--end")
    ap.add_argument("--zone-id", type=int, help="one zone, else all 23")
    ap.add_argument("--apply", action="store_true",
                    help="write; without it nothing is committed")
    args = ap.parse_args()

    if args.date:
        start = end = date.fromisoformat(args.date)
    elif args.start and args.end:
        start, end = date.fromisoformat(args.start), date.fromisoformat(args.end)
    else:
        raise SystemExit("give --date, or both --start and --end")
    if end < start:
        raise SystemExit(f"empty window: {start} to {end}")

    from scripts.interpolation.raster import _configure_proj
    _configure_proj()

    db = SessionLocal()
    try:
        per_zone, grid_key = load_mask(db, args.zone_id)
        total_cells = sum(len(z["rows"]) for z in per_zone.values())
        print(f"{total_cells:,} mask cells over {len(per_zone)} zones")
        print(f"grid {grid_key}")
        print(f"window {start} .. {end}   GDD base {GDD_BASE:g}\n")

        written = 0
        vintages: set[int] = set()
        days_without_surfaces = []
        day = start
        while day <= end:
            records = build_day(db, day, per_zone)
            if not records:
                days_without_surfaces.append(day)
                day += timedelta(days=1)
                continue
            for rec in records:
                rec["confidence"] = confidence_for(rec["cells_used"])
                rec["method"] = PROCESSING_METHOD
                vintages.add(rec["vintage_year"])
                if args.apply:
                    db.execute(UPSERT, rec)
            written += len(records)
            sample = records[0]
            print(f"  {day}  {len(records):2} zones   "
                  f"e.g. {per_zone[sample['zone_id']]['name'][:18]:20} "
                  f"tmean {_f(sample['temp_mean'])} "
                  f"rain {_f(sample['rainfall_mm'])} "
                  f"gdd0 {_f(sample['gdd_daily'])} "
                  f"gdd10 {_f(sample['gdd10_daily'])}")
            day += timedelta(days=1)

        if days_without_surfaces:
            print(f"\n{len(days_without_surfaces)} day(s) had no daily surface "
                  f"and were skipped: {days_without_surfaces[0]}"
                  f"{' .. ' + str(days_without_surfaces[-1]) if len(days_without_surfaces) > 1 else ''}")

        print(f"\n{written} zone-days "
              f"{'written' if args.apply else 'would be written'}")

        if args.apply and written:
            touched = reaccumulate(db, vintages,
                                   [args.zone_id] if args.zone_id else None)
            print(f"gdd/gdd10 cumulative re-derived from "
                  f"{SEASON_START_DAY:02d}-{SEASON_START_MONTH:02d}: "
                  f"{touched} row(s) changed across vintage(s) {sorted(vintages)}")
            db.commit()
            print("committed")
        elif not args.apply:
            db.rollback()
            print("dry run - nothing written. Re-run with --apply.")
        return 0
    finally:
        db.close()


def _f(v) -> str:
    return "  n/a" if v is None else f"{v:5.2f}"


if __name__ == "__main__":
    raise SystemExit(main())
