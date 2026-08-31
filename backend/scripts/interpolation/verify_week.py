#!/usr/bin/env python3
"""Score the PUBLISHED daily surfaces against the observations, end to end.

Everything else that reports accuracy here scores the *fit*: `cv_rmse` in
`surface_run`, `rmse` and `t_rmse` in `validation_stats.csv`, and the residual
harvest in `per_region_cv.py`. All of them stop at the station-space model. None
of them reads a raster.

That gap is not theoretical. The first `fastgrid` implementation called
`thin_plate_sq` with its output aliasing its input, so it evaluated
log(d2)^2 instead of d2*log(d2) — a different kernel — and EVERY published
surface was wrong while `cv_rmse`, `edf`, the smoothing and the station counts
stayed perfectly healthy, because those never pass through the grid basis. The
only symptom anyone noticed was a national mean of 31 degC on New Year's Day
1986. `fastgrid_check.py` now guards the basis against the reference evaluator,
but nothing guards the whole chain: basis -> projection -> lapse retrend ->
era offset -> float32 -> LERC compression -> COG -> S3 -> the bytes a customer
reads.

This closes that. It downloads the published COG, samples it at the station
coordinates, and compares against `weather_data_daily`. Nothing is re-fitted and
nothing is re-published; it is a read-and-compare over a window that already ran.

    python backend/scripts/interpolation/verify_week.py
    python backend/scripts/interpolation/verify_week.py --start 2026-08-23 --end 2026-08-29
    python backend/scripts/interpolation/verify_week.py --regions --out scratchpad/verify_week

## Three tiers, and only two of them are validation

Each station-day lands in exactly one tier, reproducing the split the fit made:

  fit       the station was in the fit. IN-SAMPLE. Its residual should be near
            `validation_stats.rmse` — this tier cannot tell you the surface is
            accurate, it tells you the raster is the surface that was fitted.
            That is the fastgrid check, and it is the reason this file exists.
  holdout   spatially declustered out of the fit (`tps.decluster`, 0.5 km).
            Genuinely independent, but small (13 temperature stations, 22 rain
            gauges) and by construction sited beside a fitting station, so it
            flatters remote terrain.
  screened  rejected by the neighbour outlier screen. NOT validation — these are
            the sensor faults, and a large residual here is the screen working.
            Reported so a screen that starts eating good stations is visible.

## Two corrections, without which the comparison is meaningless

**Elevation.** The raster holds the value at the GRID CELL's elevation, not the
station's. A 500 m cell in the Southern Alps can sit 200 m off a valley-floor
site, which at 0.6 degC/100 m is 1.2 degC of pure geometry. The station is
compared against the surface retrended to the STATION's elevation.

**The era offset.** Temperature publishes as `-db-adj`: the DB-era surface with
`DB - archive` SUBTRACTED, so it sits on the CLIFLO archive's scale. The station
observation is on the DB's scale. Subtracting one from the other without adding
the offset back would report the era correction as if it were model error — a
systematic, plausible-looking bias of the exact size of the thing we deliberately
did. Rainfall publishes uncorrected, so nothing is added back there.

## Exit code

0 when every variable's fit-tier RMSE is inside its gate, 1 otherwise, so this
can run unattended. The gates are deliberately loose: this is a "the pipeline
broke" alarm, not an accuracy target.
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.interpolation import tps                                  # noqa: E402
from scripts.interpolation.raster import RasterTemplate, grid_from_csv  # noqa: E402
from scripts.interpolation.run_history import LAPSE, UNITS, DEFAULT_GRID  # noqa: E402
from scripts.interpolation.consolidate_db import (                     # noqa: E402
    COLUMNS, RANGES, MAX_DTR, MIN_DAYS, LAT_RANGE, LON_RANGE)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                    datefmt="%H:%M:%S")
log = logging.getLogger("verify")
logging.getLogger("tps").setLevel(logging.ERROR)
# The era-offset COGs were rewritten after they were built, so GDAL reports
# "optimizations ... invalidated by later changes" on every single open. It is
# a layout note, not a read error, and it fires once per station-day.
logging.getLogger("rasterio._env").setLevel(logging.ERROR)

REPO = Path(__file__).resolve().parents[3]
OUT_DIR = REPO / "scratchpad" / "verify_week"

# `run_live.py` publishes temperature era-corrected and rainfall uncorrected.
# Read from there rather than restated, so a change to one cannot leave this
# comparing against the wrong scale.
from scripts.interpolation.run_live import (                           # noqa: E402
    MODEL_VERSION, MIN_STATIONS, COLD_FLOOR)

ERA_PREFIX = "_fields/era_offset"

# How far the fit-tier RMSE may drift before this reports failure. These are
# ALARM thresholds, not targets: roughly 3x the observed in-sample rmse
# (0.28 / 1.88 / 0.36 degC on 2026-08-29), which is wide enough that ordinary
# day-to-day variation never trips it and narrow enough that a broken grid path
# — which produced a 31 degC national mean, not a 1 degC drift — always does.
RMSE_GATE = {
    "temp_mean": 2.0,
    "temp_min": 3.5,
    "temp_max": 2.0,
    "rainfall": 8.0,          # mm, not a ratio: the published raster is in mm
}

# The staging window `run_live` fits from. A station must report MIN_DAYS within
# it to be staged at all, so scoring a 7-day window in isolation would count
# stations the fit never saw and the tiering would not reconcile.
DEFAULT_STAGE_DAYS = 120

OBS_QUERY = """
    SELECT w.station_id, w.date,
           w.temp_mean, w.temp_min, w.temp_max, w.rainfall_mm,
           d.latitude, d.longitude, d.elevation
      FROM weather_data_daily w
      JOIN devices d ON d.station_id = w.station_id
     WHERE w.date >= :start AND w.date <= :end
       AND d.latitude BETWEEN :lat_lo AND :lat_hi
       AND d.longitude BETWEEN :lon_lo AND :lon_hi
       AND d.latitude IS NOT NULL
       AND d.longitude IS NOT NULL
       AND d.elevation IS NOT NULL
"""

RUN_QUERY = """
    SELECT valid_at::date AS day, variable, model_version, s3_key,
           n_stations_fit, n_stations_test, cv_rmse, cv_units
      FROM surface_run
     WHERE granularity = 'daily'
       AND statistic IS NULL
       AND valid_at::date BETWEEN :start AND :end
       AND variable = ANY(:variables)
     ORDER BY day, variable
"""


def load_observations(db, start: date, end: date) -> pd.DataFrame:
    """Every candidate station-day in the staging window, one row per day."""
    from sqlalchemy import text

    df = pd.read_sql(
        text(OBS_QUERY), db.connection(),
        params={"start": start, "end": end,
                "lat_lo": LAT_RANGE[0], "lat_hi": LAT_RANGE[1],
                "lon_lo": LON_RANGE[0], "lon_hi": LON_RANGE[1]})
    if df.empty:
        raise SystemExit(f"no weather_data_daily rows in {start}..{end}")
    for c in ("temp_mean", "temp_min", "temp_max", "rainfall_mm",
              "latitude", "longitude", "elevation"):
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df["date"] = pd.to_datetime(df["date"]).dt.date
    log.info("staged %d station-days over %d stations, %s..%s",
             len(df), df.station_id.nunique(), start, end)
    return df


def staged_frame(obs: pd.DataFrame, variable: str) -> pd.DataFrame:
    """Apply `consolidate_db`'s screens for one variable.

    Reproduced rather than imported because `consolidate_db.stage` writes an
    .npz and returns a matrix; what is needed here is the long frame. The
    screens themselves ARE imported, so they cannot drift.
    """
    column = COLUMNS[variable]
    df = obs.dropna(subset=[column]).copy()
    df["value"] = df[column]

    if variable.startswith("temp"):
        # `consolidate_db` applies the DTR screen as a SQL WHERE, which also
        # drops any row where temp_min or temp_max is NULL — NULL fails the
        # comparison. Reproduced exactly: a row with a mean but no min is not
        # staged, however tempting it looks.
        dtr = df["temp_max"] - df["temp_min"]
        df = df[dtr.notna() & (dtr <= MAX_DTR)]

    lo, hi = RANGES[variable]
    df = df[(df["value"] >= lo) & (df["value"] <= hi)]

    counts = df.groupby("station_id").size()
    keep = counts[counts >= MIN_DAYS].index
    dropped = int(counts.size - len(keep))
    if dropped:
        log.info("[%s] %d station(s) below MIN_DAYS=%d in the staging window",
                 variable, dropped, MIN_DAYS)
    df = df[df.station_id.isin(keep)]

    # Column order in the staged matrix is sorted station_id, and `decluster`
    # keeps the FIRST member of each cluster — so the order decides which of a
    # colocated pair fits and which is held out. Sorting here is what makes the
    # reproduced split the same split.
    return df.sort_values(["date", "station_id"]).reset_index(drop=True)


def tier_day(frame: pd.DataFrame, variable: str,
             screen_outliers: bool) -> pd.DataFrame:
    """Label one day's stations fit / holdout / screened, as `run_live` would.

    No fit is run. The outlier screen depends only on the values and the
    neighbour geometry, and `decluster` only on the coordinates, so the split is
    reproducible without touching the estimator — which also means this check
    stays honest if the estimator changes.
    """
    df = frame.reset_index(drop=True)
    out = pd.Series("fit", index=df.index, dtype=object)

    if screen_outliers and variable != "rainfall":
        kept, dropped = tps.screen_outliers(
            df, "value", z_cutoff=tps.DEFAULT_OUTLIER_Z,
            min_abs=tps.DEFAULT_OUTLIER_MIN_ABS,
            min_abs_cold=COLD_FLOOR.get(variable),
            lapse_rate=LAPSE[variable])
        out.loc[dropped.index] = "screened"
        df = kept

    if len(df) >= MIN_STATIONS:
        _, hold_idx = tps.decluster(df, tps.DEFAULT_DECLUSTER_KM)
        out.loc[hold_idx] = "holdout"

    return frame.assign(tier=out.to_numpy())


def build_grid_elevation(grid_csv: Path) -> tuple[RasterTemplate, np.ndarray]:
    """The DEM the surfaces were retrended onto, as a (height, width) raster.

    Sampled with the raster's own transform rather than a nearest-neighbour
    search over the 1.43M-row CSV, so the elevation comes from EXACTLY the cell
    rasterio samples the surface from. A KD-tree would pick a neighbouring cell
    at a boundary and quietly introduce the error this correction exists to
    remove.
    """
    grid = grid_from_csv(grid_csv)
    template = RasterTemplate.build(grid["latitude"].to_numpy(float),
                                    grid["longitude"].to_numpy(float))
    elev = template.to_raster(grid["elevation"].to_numpy(float), nodata=np.nan)
    log.info("grid %d x %d at %d m, %d land cells",
             template.height, template.width, template.resolution_m,
             len(template.flat_index))
    return template, elev


def sample_grid(template: RasterTemplate, raster: np.ndarray,
                lon: np.ndarray, lat: np.ndarray) -> np.ndarray:
    """Nearest-cell lookup matching `rasterio.DatasetReader.sample` exactly.

    rasterio floors into the transform; `RasterTemplate.build` rounds to cell
    CENTRES and stores the outer edge, so flooring against `west`/`north` picks
    the same cell. Off-raster points come back NaN rather than wrapping.
    """
    col = np.floor((lon - template.west) / template.xres).astype(np.int64)
    row = np.floor((template.north - lat) / template.yres).astype(np.int64)
    ok = ((col >= 0) & (col < template.width)
          & (row >= 0) & (row < template.height))
    out = np.full(len(lon), np.nan, dtype=float)
    out[ok] = raster[row[ok], col[ok]]
    return out


def era_key(variable: str, month: int) -> str:
    return f"{ERA_PREFIX}/{variable}/offset_{variable}_m{month:02d}.tif"


def score(obs: pd.DataFrame, runs: pd.DataFrame, variables: list[str],
          template: RasterTemplate, elev: np.ndarray,
          screen_outliers: bool, era: bool) -> tuple[pd.DataFrame, list[dict]]:
    """One row per station-day: prediction, observation, residual, tier."""
    from services import surface_store as store

    rows: list[pd.DataFrame] = []
    checks: list[dict] = []
    era_cache: dict[str, np.ndarray] = {}

    for variable in variables:
        staged = staged_frame(obs, variable)
        lapse = LAPSE[variable]
        want = runs[runs.variable == variable]

        for day, published in want.groupby("day"):
            row = published.iloc[0]
            frame = staged[staged.date == day]
            if len(frame) < MIN_STATIONS:
                log.warning("[%s] %s only %d staged stations — skipped",
                            variable, day, len(frame))
                continue

            frame = tier_day(frame, variable, screen_outliers)
            lon = frame["longitude"].to_numpy(float)
            lat = frame["latitude"].to_numpy(float)

            sampled = store.sample(row["s3_key"], list(zip(lon, lat)))
            surface = np.array([np.nan if v is None else float(v)
                                for v in sampled], dtype=float)

            cell_elev = sample_grid(template, elev, lon, lat)
            st_elev = frame["elevation"].to_numpy(float)
            # Retrend from the cell's elevation to the station's. `lapse` is
            # positive degC per 100 m of DESCENT, so a station below its cell
            # is warmer.
            adjust = lapse * (cell_elev - st_elev) / 100.0

            offset = np.zeros(len(frame))
            if era and variable != "rainfall":
                # Sampled per day, not cached per field: the station set changes
                # from day to day, so a cache keyed on the month would silently
                # apply one day's offsets to another day's stations.
                key = era_key(variable, day.month)
                offset = np.array([np.nan if v is None else float(v)
                                   for v in store.sample(key,
                                                         list(zip(lon, lat)))])
                # Published = fitted - offset (the field is DB minus archive),
                # so putting the raster back on the DB's scale ADDS it.
                if key not in era_cache:
                    era_cache[key] = offset
                    log.info("[%s] era offset %s: median %+.3f degC over %d "
                             "stations", variable, Path(key).name,
                             float(np.nanmedian(offset)), len(offset))

            pred = surface + adjust + offset
            obs_v = frame["value"].to_numpy(float)

            rows.append(pd.DataFrame({
                "variable": variable, "date": day,
                "station_id": frame["station_id"].to_numpy(),
                "latitude": lat, "longitude": lon,
                "station_elev": st_elev, "cell_elev": cell_elev,
                "tier": frame["tier"].to_numpy(),
                "surface": surface, "elev_adjust": adjust,
                "era_offset": offset, "predicted": pred,
                "observed": obs_v, "residual": pred - obs_v,
                "model_version": row["model_version"],
                "s3_key": row["s3_key"]}))

            # The published counts are the only independent statement of what
            # the fit actually used. If the reproduced split disagrees, the
            # tiering below is describing a different run and must not be
            # trusted — say so rather than print a confident wrong number.
            n_fit = int((frame.tier == "fit").sum())
            n_test = int((frame.tier == "holdout").sum())
            checks.append({
                "variable": variable, "date": day,
                "n_fit": n_fit, "published_n_fit": int(row["n_stations_fit"]),
                "n_test": n_test, "published_n_test": int(row["n_stations_test"]),
                "n_screened": int((frame.tier == "screened").sum()),
                "agrees": n_fit == int(row["n_stations_fit"])
                          and n_test == int(row["n_stations_test"])})

    if not rows:
        raise SystemExit("nothing scored — no published surface matched a "
                         "staged day in the window")
    return pd.concat(rows, ignore_index=True), checks


def summarise_tiers(resid: pd.DataFrame) -> pd.DataFrame:
    def stats(g, variable, tier):
        e = g["residual"].dropna().to_numpy()
        if not len(e):
            return None
        return {"variable": variable, "tier": tier,
                "n_station_days": len(e), "n_stations": g.station_id.nunique(),
                "bias": float(np.mean(e)), "mae": float(np.mean(np.abs(e))),
                "rmse": float(np.sqrt(np.mean(e ** 2))),
                "p95_abs": float(np.percentile(np.abs(e), 95)),
                "worst_abs": float(np.max(np.abs(e))),
                "unit": UNITS[variable]}

    out = []
    for variable, g in resid.groupby("variable"):
        for tier in ("fit", "holdout", "screened"):
            s = stats(g[g.tier == tier], variable, tier)
            if s:
                out.append(s)
        s = stats(g[g.tier != "screened"], variable, "ALL (fit+holdout)")
        if s:
            out.append(s)
    return pd.DataFrame(out)


def summarise_days(resid: pd.DataFrame) -> pd.DataFrame:
    """RMSE per variable per day. A single broken day is invisible in a week."""
    v = resid[resid.tier != "screened"]
    out = (v.groupby(["variable", "date"])["residual"]
            .agg(n="count",
                 bias=lambda e: float(np.mean(e)),
                 rmse=lambda e: float(np.sqrt(np.mean(e ** 2))))
            .reset_index())
    return out


# A station may sit this far from the smoothed surface, persistently, before it
# is worth a human's attention. Not an error bound: a genuine frost hollow or a
# sheltered valley floor reads colder than any national spline, and that is the
# surface being honest about a 500 m cell rather than the station being wrong.
BIAS_FLAG = {"temp_mean": 1.0, "temp_min": 1.5, "temp_max": 1.0, "rainfall": 3.0}

# Rainfall additionally needs a RELATIVE test. An absolute millimetre threshold
# ranks by how wet a place is, not by how wrong the surface is: the first
# version of this flagged 27 gauges and 20 of them were West Coast and Southern
# Alps sites where a 30 mm miss on a 200 mm day is the orographic structure a
# 500 m spline cannot resolve, which is a known limitation and not a finding.
# Requiring the bias to be a large FRACTION of the station's own rainfall puts
# the blocked funnel and the mis-sited gauge back at the top, where they belong.
RAIN_REL_FLAG = 0.35

# Rows printed per variable. The full list goes to the CSV either way — this
# only stops one variable's tail from burying another variable's head.
SHOW_PER_VARIABLE = 12


def summarise_stations(resid: pd.DataFrame, min_days: int = 4) -> pd.DataFrame:
    """Stations the published surface disagrees with in the SAME DIRECTION daily.

    A one-day excursion is weather, an instrument glitch, or the spline. A bias
    that holds every day for a week is neither — it is a station whose readings
    the surface cannot reconcile with its neighbours, and the neighbour outlier
    screen will never see it: that screen fires at 8 degC (15 on a cold
    temp_min), so a thermometer reading 2.8 degC cold sails through it every
    single day while quietly pulling its own cell.

    This is a SHORTLIST FOR A HUMAN, not a verdict. Three things produce the
    same signature and only one is a fault:
      * a bad or badly-sited sensor — a bore thermometer, an air-quality
        cabinet, a gauge under a tree
      * wrong metadata in `devices` — an elevation or coordinate that puts the
        station in the wrong cell
      * a real microclimate the 500 m surface cannot resolve
    """
    rows = []
    for (variable, sid), g in resid[resid.tier != "screened"].groupby(
            ["variable", "station_id"]):
        e = g["residual"].dropna()
        if len(e) < min_days:
            continue
        bias = float(e.mean())
        if abs(bias) < BIAS_FLAG[variable]:
            continue
        mean_obs = float(g["observed"].mean())
        rel = abs(bias) / max(abs(mean_obs), 1.0)
        if variable == "rainfall" and rel < RAIN_REL_FLAG:
            continue
        same_sign = float((np.sign(e) == np.sign(bias)).mean())
        rows.append({
            "variable": variable, "station_id": int(sid), "n_days": len(e),
            "bias": bias, "rmse": float(np.sqrt(np.mean(e.to_numpy() ** 2))),
            "mean_observed": mean_obs, "rel_bias": rel,
            "same_sign": same_sign,
            "station_elev": float(g["station_elev"].iloc[0]),
            "cell_elev": float(g["cell_elev"].iloc[0]),
            "latitude": float(g["latitude"].iloc[0]),
            "longitude": float(g["longitude"].iloc[0]),
            "unit": UNITS[variable]})
    out = pd.DataFrame(rows)
    if out.empty:
        return out
    # Persistent means persistent. A station that is 3 degC out on one day and
    # 3 degC the other way on another has a mean bias near zero and never
    # reaches here, but one that straddles the threshold on a mixed record
    # would — so require the sign to hold on most days too.
    out = out[out.same_sign >= 0.8]
    return out.reindex(out.bias.abs().sort_values(ascending=False).index)


def label_stations(db, ids: list[int]) -> pd.DataFrame:
    """Station code, name and source, so the shortlist names real instruments."""
    from sqlalchemy import text

    if not ids:
        return pd.DataFrame(columns=["station_id", "station_code",
                                     "station_name", "data_source", "region"])
    return pd.read_sql(
        text("SELECT station_id, station_code, station_name, data_source, "
             "region FROM devices WHERE station_id = ANY(:ids)"),
        db.connection(), params={"ids": ids})


def show(title: str, df: pd.DataFrame, floatfmt: str = "%.3f") -> None:
    print(f"\n{title}")
    print("-" * len(title))
    with pd.option_context("display.width", 160,
                           "display.max_rows", 200,
                           "display.float_format", lambda v: floatfmt % v):
        print(df.to_string(index=False))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    today = date.today()
    ap.add_argument("--start", default=str(today - timedelta(days=8)),
                    help="first day to score (default D-8)")
    ap.add_argument("--end", default=str(today - timedelta(days=2)),
                    help="last day to score (default D-2, the publish target)")
    ap.add_argument("--variables", default="temp_mean,temp_min,temp_max,rainfall")
    ap.add_argument("--grid", default=str(DEFAULT_GRID))
    ap.add_argument("--stage-days", type=int, default=DEFAULT_STAGE_DAYS,
                    help="staging window the fit drew its station set from")
    ap.add_argument("--regions", action="store_true",
                    help="per-zone breakdown (needs geopandas + pyogrio)")
    ap.add_argument("--no-era", action="store_true",
                    help="do NOT add the era offset back. The temperature "
                         "residuals then carry the era correction as bias.")
    ap.add_argument("--no-outlier-screen", action="store_true",
                    help="do not reproduce the neighbour screen; every station "
                         "is then treated as fitted")
    ap.add_argument("--out", default=str(OUT_DIR))
    args = ap.parse_args()

    start = date.fromisoformat(args.start)
    end = date.fromisoformat(args.end)
    variables = [v.strip() for v in args.variables.split(",") if v.strip()]
    unknown = set(variables) - set(COLUMNS)
    if unknown:
        raise SystemExit(f"unknown variable(s): {sorted(unknown)}")
    if end < start:
        raise SystemExit("--end is before --start")

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    from sqlalchemy import text
    from db.session import SessionLocal

    db = SessionLocal()
    try:
        runs = pd.read_sql(text(RUN_QUERY), db.connection(),
                           params={"start": start, "end": end,
                                   "variables": variables})
        if runs.empty:
            raise SystemExit(
                f"no daily surfaces indexed for {start}..{end}. Nothing was "
                "published for this window, which is itself the finding.")
        runs["day"] = pd.to_datetime(runs["day"]).dt.date

        expected = len(pd.date_range(start, end)) * len(variables)
        if len(runs) != expected:
            have = runs.groupby("variable")["day"].agg(["count", "min", "max"])
            log.warning("%d of %d expected (variable, day) surfaces are "
                        "indexed — the gaps are a finding, not an error here",
                        len(runs), expected)
            print(have.to_string())

        obs = load_observations(db, start - timedelta(days=args.stage_days), end)
        template, elev = build_grid_elevation(Path(args.grid))
        resid, checks = score(obs, runs, variables, template, elev,
                              screen_outliers=not args.no_outlier_screen,
                              era=not args.no_era)
        suspect = summarise_stations(resid)
        if not suspect.empty:
            suspect = suspect.merge(
                label_stations(db, [int(s) for s in suspect.station_id.unique()]),
                on="station_id", how="left")
    finally:
        db.close()

    stamp = f"{start:%Y%m%d}_{end:%Y%m%d}"
    resid.to_csv(out_dir / f"residuals_{stamp}.csv", index=False)
    if not suspect.empty:
        suspect.to_csv(out_dir / f"suspect_stations_{stamp}.csv", index=False)

    chk = pd.DataFrame(checks)
    disagreeing = chk[~chk.agrees]
    if len(disagreeing):
        log.warning("the reproduced fit/holdout split disagrees with "
                    "surface_run on %d of %d (variable, day) pairs — treat the "
                    "TIERS below as approximate; the residuals themselves are "
                    "unaffected", len(disagreeing), len(chk))
        show("SPLIT RECONCILIATION — disagreements only", disagreeing)
    else:
        log.info("fit/holdout split reconciles with surface_run on all %d "
                 "(variable, day) pairs", len(chk))

    tiers = summarise_tiers(resid)
    show(f"PUBLISHED SURFACE vs OBSERVATIONS  {start} .. {end}", tiers)
    print("\n  fit      = in-sample. Guards the grid/publish path, not accuracy.")
    print("  holdout  = declustered out of the fit. Independent, small, and "
          "sited beside a fitting station.")
    print("  screened = rejected by the outlier screen. A large residual here "
          "is the screen working.")

    show("PER DAY (fit + holdout)", summarise_days(resid))

    if suspect.empty:
        print("\nNo station shows a persistent one-directional bias over the "
              "window.")
    else:
        cols = ["variable", "station_id", "station_code", "data_source",
                "region", "n_days", "bias", "mean_observed", "rel_bias",
                "rmse", "same_sign", "station_elev", "cell_elev", "unit"]
        head = (suspect.groupby("variable", group_keys=False)
                       .head(SHOW_PER_VARIABLE))
        hidden = len(suspect) - len(head)
        show(f"PERSISTENTLY DISAGREEING STATIONS — a shortlist, not a verdict"
             f"{f' (top {SHOW_PER_VARIABLE} per variable; {hidden} more in the CSV)' if hidden else ''}",
             head[[c for c in cols if c in head.columns]])
        print("\n  bias > 0: the surface reads HIGHER than the station.")
        print("  The outlier screen cannot see these — it fires at 8 degC "
              "(15 on a cold temp_min).")
        print("  A frost hollow produces the same signature as a bad sensor. "
              "Check the instrument before believing either.")

    off_mask = int(resid["surface"].isna().sum())
    if off_mask:
        worst = resid[resid["surface"].isna()][["variable", "date", "station_id",
                                                "latitude", "longitude"]]
        log.warning("%d station-day(s) sampled OFF the land mask — a station "
                    "with coordinates outside the grid, or a hole in the "
                    "raster", off_mask)
        show("OFF-MASK SAMPLES", worst.head(20))

    if args.regions:
        from scripts.interpolation.per_region_cv import assign_regions, summarise
        stations = (resid[["station_id", "latitude", "longitude"]]
                    .drop_duplicates("station_id"))
        members = assign_regions(stations)
        for variable, g in resid[resid.tier != "screened"].groupby("variable"):
            show(f"PER ZONE — {variable}",
                 summarise(g[["station_id", "residual"]].dropna(),
                           members, UNITS[variable]))

    gates = []
    for variable in variables:
        fit_rows = resid[(resid.variable == variable) & (resid.tier == "fit")]
        e = fit_rows["residual"].dropna().to_numpy()
        if not len(e):
            gates.append({"variable": variable, "rmse": None,
                          "gate": RMSE_GATE[variable], "pass": False,
                          "note": "no fit-tier residuals"})
            continue
        rmse = float(np.sqrt(np.mean(e ** 2)))
        gates.append({"variable": variable, "rmse": rmse,
                      "gate": RMSE_GATE[variable],
                      "pass": rmse <= RMSE_GATE[variable], "note": ""})
    gate_df = pd.DataFrame(gates)
    show("GATES — fit-tier RMSE against the alarm threshold", gate_df)

    summary = {
        "start": str(start), "end": str(end), "variables": variables,
        "era_offset_added_back": not args.no_era,
        "n_station_days": int(len(resid)),
        "split_reconciles": bool(chk["agrees"].all()),
        "off_mask_samples": off_mask,
        "tiers": tiers.to_dict("records"),
        "gates": gate_df.to_dict("records"),
        "suspect_stations": ([] if suspect.empty
                             else suspect.to_dict("records")),
        "model_versions": {v: MODEL_VERSION[v] for v in variables},
    }
    (out_dir / f"summary_{stamp}.json").write_text(json.dumps(summary, indent=2,
                                                              default=str))
    print(f"\nwrote {out_dir / f'residuals_{stamp}.csv'}")
    print(f"wrote {out_dir / f'summary_{stamp}.json'}")

    failed = gate_df[~gate_df["pass"].astype(bool)]
    if len(failed):
        log.error("%d variable(s) outside the gate: %s", len(failed),
                  ", ".join(failed["variable"]))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
