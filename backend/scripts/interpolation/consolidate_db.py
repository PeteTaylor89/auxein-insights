"""Stage the live DB record (2020->present) into the same .npz contract as the history.

`consolidate_history.py` reads 13,878 CSVs per variable off `Z:` and writes a dense
`(n_days, n_stations)` matrix. This does the same job from `weather_data_daily`, and
deliberately emits the IDENTICAL keys:

    values      (n_days, n_stations) float32, NaN where a station did not report
    station_ids (n_stations,)        int64
    dates       (n_days,)            ISO date strings
    latitude / longitude / elevation (n_stations,) float64

so `run_history.py` runs against it unchanged — ridge/GCV, the lapse detrend/retrend,
`screen_relevance`, the LENZ ratio path and the whole band set carry over with no new
fitting code. That is the point: the era comparison is only meaningful if the two eras
go through the same estimator.

    python backend/scripts/interpolation/consolidate_db.py --variables temp_mean
    python backend/scripts/interpolation/consolidate_db.py --variables temp_min,temp_max,rainfall \
        --start 2020-01-01 --end 2026-08-19 --out scratchpad/live_surfaces/inputs

WRITE SOMEWHERE ELSE. The default output is `scratchpad/live_surfaces/inputs`, NOT the
history's `scratchpad/climate_history/inputs` — writing `temp_mean.npz` there would
silently replace the CLIFLO staging that the published v2 archive was built from, and
the two are not interchangeable.
"""
from __future__ import annotations

import argparse
import logging
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "backend"))

from sqlalchemy import text                                    # noqa: E402
from db.session import SessionLocal                            # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
from scripts.interpolation.runrecord import (             # noqa: E402
    RunRecord, _code_digest, _environment, _git_revision)

log = logging.getLogger("consolidate_db")

DEFAULT_OUT = REPO / "scratchpad" / "live_surfaces" / "inputs"
DEFAULT_START = "2020-01-01"

# fit variable -> weather_data_daily column
# Hashed into every run record. This is a READER over `weather_data_daily`;
# what shapes an .npz is the query and the exclusion list in this module.
CODE_MODULES = ("consolidate_db.py",)

COLUMNS = {
    "temp_mean": "temp_mean",
    "temp_min": "temp_min",
    "temp_max": "temp_max",
    "rainfall": "rainfall_mm",
}

# Physical plausibility, mirroring ingestion/sources/db_util.py VARIABLE_RANGES.
#
# Applied AGAIN here even though the ingest gate and the retrospective quarantine
# both ran, because the fit must never trust its input. A single -6,999 degC does not
# degrade a national thin-plate surface, it destroys that day's — and GCV will choose
# a smoothing that accommodates the outlier rather than rejecting it, so the damage
# is silent and spreads well beyond the bad station.
RANGES = {
    "temp_mean": (-30.0, 45.0),
    "temp_min": (-30.0, 45.0),
    "temp_max": (-30.0, 45.0),
    "rainfall": (0.0, 750.0),
}

# Maximum physically credible daily temperature range, degC. A day whose
# (temp_max - temp_min) exceeds this is dropped for ALL THREE temperature variables,
# because a single spike corrupts the day's min or max and drags the mean with it.
#
# This catches a THIRD failure class, distinct from the sentinels the range gate
# stops and the frozen sensors the pinned-value scan finds: a one-point spike inside
# an otherwise healthy day. HARV_GREYSTONE_01 (Waipara, 71 m) recorded temp_min
# -21.60 degC on 2020-12-17 — in summer, with that same day's max at 18.80 and mean
# at 14.16, from 149 records. -21.6 is legal to the range gate and the station is not
# stuck, but it would put a -21.6 degC December minimum into the Waipara cell.
#
# 30 degC is where the distribution genuinely thins: over 2020->present, 4,692
# station-days fall in 20-25 degC and 436 in 25-30 (inland and alpine sites, real),
# then only 49 exceed 30 — 0.0018% of temperature station-days.
MAX_DTR = 30.0

# Stations outside the interpolation domain. All four are real SYNOP stations with
# good data; they are simply not on the grid the surface covers, and a station 700 km
# offshore contributes nothing but leverage at the domain edge.
#
#   171 Campbell Island   -52.55        175 Enderby/Auckland Is  -50.48
#   173 Chatham Islands   -176.48 E     194 Raoul Island         -29.25
#
# Enforced as a bounding box rather than an id list so a newly seeded offshore station
# is excluded automatically. The box is the NZ mainland + near-shore islands.
LAT_RANGE = (-48.0, -34.0)
LON_RANGE = (166.0, 179.5)

# A station must report at least this many days in the window to be staged at all.
# A station with three days of record contributes almost nothing to any monthly
# statistic but still costs a column in a dense matrix and, more importantly, shows up
# in `n_fit` as though it were carrying the fit.
MIN_DAYS = 30

# `{dtr_filter}` is empty for rainfall and the MAX_DTR clause for temperature.
QUERY = """
    SELECT w.station_id, w.date, w.{column} AS value,
           d.latitude, d.longitude, d.elevation
      FROM weather_data_daily w
      JOIN devices d ON d.station_id = w.station_id
     WHERE w.date >= :start AND w.date <= :end
       AND w.{column} IS NOT NULL
       {dtr_filter}
       AND d.latitude BETWEEN :lat_lo AND :lat_hi
       AND d.longitude BETWEEN :lon_lo AND :lon_hi
       AND d.latitude IS NOT NULL AND d.longitude IS NOT NULL
       AND d.elevation IS NOT NULL
"""


def stage(db, variable: str, start: date, end: date, out_dir: Path,
          exclude: set | None = None) -> dict:
    exclude = exclude or set()
    column = COLUMNS[variable]
    log.info("%s: reading weather_data_daily.%s %s -> %s", variable, column, start, end)

    # Only temperature gets the DTR screen; rainfall has no min/max pair.
    dtr_filter = ("AND (w.temp_max - w.temp_min) <= :max_dtr" if variable.startswith("temp")
                  else "")
    df = pd.read_sql(
        text(QUERY.format(column=column, dtr_filter=dtr_filter)), db.connection(),
        params={"start": start, "end": end, "max_dtr": MAX_DTR,
                "lat_lo": LAT_RANGE[0], "lat_hi": LAT_RANGE[1],
                "lon_lo": LON_RANGE[0], "lon_hi": LON_RANGE[1]}
               if dtr_filter else
               {"start": start, "end": end,
                "lat_lo": LAT_RANGE[0], "lat_hi": LAT_RANGE[1],
                "lon_lo": LON_RANGE[0], "lon_hi": LON_RANGE[1]})
    if df.empty:
        raise SystemExit(f"{variable}: no rows in {start}..{end}")
    log.info("%s: %d station-days, %d stations", variable, len(df), df.station_id.nunique())

    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    lo, hi = RANGES[variable]
    bad = df["value"].isna() | (df["value"] < lo) | (df["value"] > hi)
    if bad.any():
        # Print the worst offenders rather than a count: a range screen that silently
        # eats 5% of a variable is the failure this whole exercise exists to avoid.
        worst = df.loc[bad, "value"]
        log.warning("%s: %d value(s) outside %s..%s dropped (min %s, max %s, %d station(s))",
                    variable, int(bad.sum()), lo, hi,
                    worst.min(), worst.max(), df.loc[bad, "station_id"].nunique())
        df = df.loc[~bad]

    counts = df.groupby("station_id").size()
    thin = counts[counts < MIN_DAYS]
    if len(thin):
        log.info("%s: dropping %d station(s) with < %d days", variable, len(thin), MIN_DAYS)
        df = df[~df.station_id.isin(thin.index)]

    if exclude:
        before = df.station_id.nunique()
        df = df[~df.station_id.isin(exclude)]
        dropped = before - df.station_id.nunique()
        log.info("%s: excluded %d station(s) by request: %s",
                 variable, dropped, sorted(exclude))

    # A window SHORTER than MIN_DAYS drops every station by construction, and
    # the empty frame then dies twenty lines later on an opaque
    # "arrays used as indices must be of integer type". Say what actually
    # happened, because the fix is to widen the window rather than to debug the
    # indexing.
    if df.empty:
        span = (end - start).days + 1
        raise SystemExit(
            f"{variable}: every station was dropped. The requested window is "
            f"{span} day(s) and MIN_DAYS is {MIN_DAYS}, so no station can "
            f"qualify. Stage a window of at least {MIN_DAYS} days and select "
            f"the days you need downstream.")

    station_ids = np.sort(df.station_id.unique())
    dates = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    date_idx = {d: i for i, d in enumerate(dates)}
    col_idx = {s: i for i, s in enumerate(station_ids)}

    values = np.full((len(dates), len(station_ids)), np.nan, dtype=np.float32)
    rows = df["date"].map(date_idx).to_numpy()
    cols = df["station_id"].map(col_idx).to_numpy()
    values[rows, cols] = df["value"].to_numpy(dtype=np.float32)

    cat = (df[["station_id", "latitude", "longitude", "elevation"]]
           .drop_duplicates("station_id").set_index("station_id").loc[station_ids])

    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{variable}.npz"
    np.savez_compressed(
        path,
        values=values, station_ids=station_ids.astype(np.int64),
        dates=np.array([d.isoformat() for d in dates]),
        latitude=cat["latitude"].to_numpy(float),
        longitude=cat["longitude"].to_numpy(float),
        elevation=cat["elevation"].to_numpy(float))

    per_day = np.isfinite(values).sum(axis=1)
    stats = {
        "variable": variable, "path": str(path),
        "n_days": len(dates), "n_stations": len(station_ids),
        "reporting_per_day_median": float(np.median(per_day)),
        "reporting_per_day_min": int(per_day.min()),
        "days_with_zero": int((per_day == 0).sum()),
        "value_min": float(np.nanmin(values)), "value_max": float(np.nanmax(values)),
        "mb": path.stat().st_size / 1e6,
    }
    log.info("%s: %d days x %d stations, median %d reporting/day (min %d), "
             "range %.2f..%.2f, %.1f MB",
             variable, stats["n_days"], stats["n_stations"],
             stats["reporting_per_day_median"], stats["reporting_per_day_min"],
             stats["value_min"], stats["value_max"], stats["mb"])
    if stats["days_with_zero"]:
        log.error("%s: %d day(s) with NO stations reporting — the fit cannot run on those",
                  variable, stats["days_with_zero"])
    return stats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--variables", default="temp_mean",
                    help="comma-separated: " + ",".join(COLUMNS))
    ap.add_argument("--start", default=DEFAULT_START)
    ap.add_argument("--end", default=date.today().isoformat())
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--exclude", default="",
                    help="comma-separated station_ids to drop from the fit. "
                         "The production temperature basis excludes 1019 "
                         "(WRC_THAMES_HIGH_SCHOOL): its annual bias is only "
                         "+0.44 degC so it passes any threshold, but its error "
                         "is SEASONAL (Jan -3.89, winter +1.0) and it sits "
                         "isolated on the Coromandel with no neighbour to "
                         "dilute it. A stationary offset field cannot absorb a "
                         "seasonal error, and it alone halved the "
                         "effectiveness of the national era correction.")
    args = ap.parse_args()

    variables = [v.strip() for v in args.variables.split(",") if v.strip()]
    exclude = {int(x) for x in args.exclude.split(",") if x.strip()}
    unknown = [v for v in variables if v not in COLUMNS]
    if unknown:
        raise SystemExit(f"unknown variable(s): {unknown}; known: {sorted(COLUMNS)}")

    start = date.fromisoformat(args.start)
    end = date.fromisoformat(args.end)
    out_dir = Path(args.out)

    # `--exclude` is load-bearing provenance, not a convenience flag: the
    # production temperature basis drops station 1019 (Thames), and an .npz
    # cannot tell you whether it was built with or without it.
    record = RunRecord(out_dir)
    record.open({
        "started_at": datetime.now(timezone.utc).isoformat(),
        "engine": "consolidate_db", "argv": sys.argv,
        "parameters": {"variables": variables, "start": args.start,
                       "end": args.end, "out": str(out_dir),
                       "excluded_station_ids": sorted(exclude)},
        "sources": {"table": "weather_data_daily", "kind": "live DB"},
        "code": {"digest": _code_digest(CODE_MODULES), "git": _git_revision()},
        "environment": _environment()})

    db = SessionLocal()
    try:
        staged = [stage(db, v, start, end, out_dir, exclude=exclude)
                  for v in variables]
    finally:
        db.close()
    record.close({s["variable"]: s for s in staged}, copy=())


if __name__ == "__main__":
    main()
