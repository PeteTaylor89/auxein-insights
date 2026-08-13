"""Stage the 1986-2023 CLIFLO history off the network drive into one array per variable.

The on-prem pipeline stores one CSV per date per variable — 13,879 files each,
about 2 KB apiece, on `Z:` (a network drive). Enumerating a single one of those
directories takes minutes; opening 13,879 of them per variable, five variables
over, would dominate a run whose actual arithmetic now takes ~110 ms per day.

So read them once, in parallel, and write a dense matrix:

    values      (n_days, n_stations) float32, NaN where a station did not report
    station_ids (n_stations,)        int64
    dates       (n_days,)            ISO date strings

At 13,879 days x ~400 stations that is **22 MB per variable**. The whole
1986-2023 daily record for a variable loads instantly and a month is a slice,
so the run never touches `Z:` again and never groups anything at runtime.

Dense rather than tidy on purpose: the missing-data pattern is genuinely dense
(most stations report most days), a tidy frame of the same data is ~2.5 M rows
and needs a groupby per timestep, and NaN already means "did not report" to
`fit_surface`, which drops it.

    python backend/scripts/interpolation/consolidate_history.py --variables temp_mean,temp_min,temp_max
    python backend/scripts/interpolation/consolidate_history.py --variables rainfall --workers 32
"""
from __future__ import annotations

import argparse
import json
import logging
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("consolidate")

REPO = Path(__file__).resolve().parents[3]
DEFAULT_SOURCE = Path(r"Z:\Data\REGEN SPLINE V1.4\INPUT DATA")
DEFAULT_OUT = REPO / "scratchpad" / "climate_history" / "inputs"

# Carried over verbatim from Spline_Temp_V1.7.py via parity_check.py. These three
# were excluded by the original author and must stay excluded, or the history
# will not be comparable with the on-prem archive.
PROBLEM_STATIONS = [4677, 37002, 38102]

# Catalogue elevations that are physically impossible, corrected to the 500 m DEM.
# Station elevation detrends the observations and DEM elevation retrends the grid,
# so a mismatch is a bias baked straight into the surface at that location. These
# two are the only ones of the six >100 m mismatches that cannot be sub-grid
# averaging: 12715 sits in the inland Canterbury foothills with 3,737 days of
# record, and 39915 puts Auckland CBD 322 m above sea level. The other four
# (4138 Fiordland, 37835, 12636, 5893) look like genuine 500 m averaging and are
# deliberately left alone. National cv_rmse barely moves either way (0-0.8%, a
# robust median absorbs one bad station) — this is a LOCAL surface-quality fix.
ELEVATION_OVERRIDES = {12715: 813.0, 39915: 20.0}


def apply_elevation_overrides(stations: pd.DataFrame) -> pd.DataFrame:
    """Correct known-bad catalogue elevations in place, logging each hit."""
    for sid, dem in ELEVATION_OVERRIDES.items():
        hit = stations["station_id"] == sid
        if not hit.any():
            continue
        old = float(stations.loc[hit, "elevation"].iloc[0])
        if old == dem:
            continue
        stations.loc[hit, "elevation"] = dem
        log.warning("station %d elevation %.0f m -> %.0f m (DEM override)",
                    sid, old, dem)
    return stations

# variable -> (input folder, value column, station-metadata file)
VARIABLES = {
    "temp_mean": ("TEMP_DAILY_Tmean(C)_SPLINE_INPUTS", "Tmean(C)",
                  "CLIFLO_RAW_Temp_Daily.csv"),
    "temp_min":  ("TEMP_DAILY_Tmin(C)_SPLINE_INPUTS", "Tmin(C)",
                  "CLIFLO_RAW_Temp_Daily.csv"),
    "temp_max":  ("TEMP_DAILY_Tmax(C)_SPLINE_INPUTS", "Tmax(C)",
                  "CLIFLO_RAW_Temp_Daily.csv"),
    "rainfall":  ("PRECIPITATION_DAILY_Amount(mm)_SPLINE_INPUTS", "Amount(mm)",
                  "CLIFLO_RAW_Precipitation_Daily.csv"),
    "solar_rad": ("GLOBAL_RAD_DAILY_SPLINE_INPUTS", "Amount(MJ/m2)",
                  "CLIFLO_RAW_Global_Rad_Daily.csv"),
}

STATION_META_DIRS = [
    REPO / "backend" / "models" / "example data",
    Path(r"Z:\Data\Climate_Station_Data\New_Zealand\STATION_INFORMATION_CLIFLO"),
]

DATE_RE = re.compile(r"^(\d{2})_(\d{2})_(\d{4})\.csv$", re.I)


def parse_date(name: str) -> date | None:
    m = DATE_RE.match(name)
    if not m:
        return None
    d, mo, y = (int(g) for g in m.groups())
    try:
        return date(y, mo, d)
    except ValueError:                       # e.g. 30_02_1991 in a corrupt name
        log.warning("skipping %s: not a real date", name)
        return None


# Every CLIFLO metadata export we can find, in precedence order. A station's
# coordinates come from the first file that lists it.
ALL_META_FILES = ["CLIFLO_RAW_Temp_Daily.csv", "CLIFLO_RAW_Precipitation_Daily.csv",
                  "CLIFLO_RAW_Global_Rad_Daily.csv", "CLIFLO_RAW_Temp_Hourly.csv",
                  "CLIFLO_RAW_Wind_Max_Gust_Daily.csv", "CLIFLO_RAW_Wind_Run_Daily.csv",
                  "CLIFLO_RAW_10cm_Ground_Temp_Hourly.csv"]


def _read_meta_file(p: Path) -> Optional[pd.DataFrame]:
    df = pd.read_csv(p).replace({"-": np.nan, "-9999": np.nan})
    need = {"Agent Number", "Latitude", "Longitude", "Height"}
    if need - set(df.columns):
        return None
    out = df.rename(columns={"Agent Number": "station_id", "Latitude": "latitude",
                             "Longitude": "longitude", "Height": "elevation"})
    out = out[["station_id", "latitude", "longitude", "elevation"]].dropna()
    out["station_id"] = pd.to_numeric(out["station_id"], errors="coerce")
    out = out.dropna(subset=["station_id"])
    out["station_id"] = out["station_id"].astype(np.int64)
    for c in ("latitude", "longitude", "elevation"):
        out[c] = out[c].astype(float)
    return out.drop_duplicates("station_id", keep="first")


def load_station_metadata(filename: str) -> pd.DataFrame:
    """Union every CLIFLO catalogue, with `filename` taking precedence.

    A single catalogue is not enough. `CLIFLO_RAW_Temp_Daily.csv` lists 474
    stations, but the 1986-2023 temperature record contains observations from 43
    stations it does not cover — including agent 1002, which appears in the very
    first row of a typical input file. The local and network copies are
    byte-identical, so this is not a stale-file problem: the export simply does
    not span the full period.

    The on-prem model dropped those observations silently (`merge(how='left')`
    then `dropna`), which is why `parity_check.py` still reproduces its grids
    exactly. Recovering them is therefore a **deliberate divergence from the
    archive**, taken because station density is the dominant lever on surface
    quality — the benchmark's own conclusion was that density should beat every
    algorithmic change on its list combined.

    Most are recoverable because the same station appears in another variable's
    catalogue: precipitation covers 8 of the 43, global radiation 27, hourly
    temperature 6.
    """
    frames, sources = [], []
    ordered = [filename] + [f for f in ALL_META_FILES if f != filename]
    for name in ordered:
        for base in STATION_META_DIRS:
            p = base / name
            try:
                if not p.exists():
                    continue
            except OSError:                  # network drive unavailable
                continue
            df = _read_meta_file(p)
            if df is None or df.empty:
                continue
            frames.append(df)
            sources.append(f"{name}({len(df)})")
            break                            # first location wins for this file

    if not frames:
        raise FileNotFoundError(f"no usable CLIFLO metadata found in {STATION_META_DIRS}")

    primary = len(frames[0])
    out = pd.concat(frames, ignore_index=True).drop_duplicates("station_id", keep="first")
    log.info("station metadata: %s -> %d unique stations (%+d beyond %s)",
             ", ".join(sources), len(out), len(out) - primary, filename)
    out = apply_elevation_overrides(out.reset_index(drop=True))
    return out


def read_one(path: Path, value_col: str):
    """One date's file -> (station_ids, values). Returns None if unreadable."""
    try:
        df = pd.read_csv(path, usecols=lambda c: c in ("Station", value_col))
    except Exception as exc:                                     # noqa: BLE001
        log.warning("unreadable %s: %s", path.name, exc)
        return None
    if "Station" not in df.columns or value_col not in df.columns:
        log.warning("%s missing Station/%s", path.name, value_col)
        return None
    df = df.replace({"-": np.nan, "-9999": np.nan})
    sid = pd.to_numeric(df["Station"], errors="coerce")
    val = pd.to_numeric(df[value_col], errors="coerce")
    ok = sid.notna() & val.notna()
    return sid[ok].astype(np.int64).to_numpy(), val[ok].astype(np.float64).to_numpy()


def consolidate(variable: str, source: Path, out_dir: Path, workers: int) -> dict:
    folder, value_col, meta_file = VARIABLES[variable]
    src = source / folder
    if not src.is_dir():
        raise FileNotFoundError(f"no input folder {src}")

    log.info("[%s] enumerating %s (slow on a network drive)...", variable, src)
    t0 = time.perf_counter()
    files = [(parse_date(p.name), p) for p in src.iterdir() if p.suffix.lower() == ".csv"]
    files = sorted((d, p) for d, p in files if d is not None)
    log.info("[%s] %d dated files in %.1fs (%s .. %s)", variable, len(files),
             time.perf_counter() - t0, files[0][0], files[-1][0])

    log.info("[%s] reading with %d threads...", variable, workers)
    t0 = time.perf_counter()
    with ThreadPoolExecutor(max_workers=workers) as ex:
        parsed = list(ex.map(lambda dp: read_one(dp[1], value_col), files))
    log.info("[%s] read %d files in %.1fs", variable, len(files), time.perf_counter() - t0)

    dates = [d for (d, _), r in zip(files, parsed) if r is not None]
    parsed = [r for r in parsed if r is not None]
    if not parsed:
        raise RuntimeError(f"[{variable}] no readable input files")

    meta = load_station_metadata(meta_file)
    known = set(meta["station_id"].tolist())

    seen = {}
    for sids, _ in parsed:
        for s in np.unique(sids):
            seen[int(s)] = seen.get(int(s), 0) + 1

    excluded = sorted(s for s in seen if s in PROBLEM_STATIONS)
    unknown = sorted(s for s in seen if s not in known and s not in PROBLEM_STATIONS)
    keep = sorted(s for s in seen if s in known and s not in PROBLEM_STATIONS)
    if excluded:
        log.info("[%s] excluding %d PROBLEM_STATIONS: %s", variable, len(excluded), excluded)
    if unknown:
        log.warning("[%s] %d station ids have observations but NO metadata "
                    "(dropped): %s%s", variable, len(unknown), unknown[:12],
                    " ..." if len(unknown) > 12 else "")

    station_ids = np.array(keep, dtype=np.int64)
    pos = {s: i for i, s in enumerate(keep)}
    values = np.full((len(parsed), len(keep)), np.nan, dtype=np.float32)
    for row, (sids, vals) in enumerate(parsed):
        cols = np.array([pos.get(int(s), -1) for s in sids])
        m = cols >= 0
        values[row, cols[m]] = vals[m]

    cat = meta[meta["station_id"].isin(keep)].set_index("station_id").loc[keep].reset_index()

    out_dir.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        out_dir / f"{variable}.npz",
        values=values, station_ids=station_ids,
        dates=np.array([d.isoformat() for d in dates]),
        latitude=cat["latitude"].to_numpy(float),
        longitude=cat["longitude"].to_numpy(float),
        elevation=cat["elevation"].to_numpy(float))

    per_day = np.isfinite(values).sum(1)
    summary = {
        "variable": variable, "value_col": value_col, "source": str(src),
        "n_days": len(dates), "first": dates[0].isoformat(), "last": dates[-1].isoformat(),
        "n_stations": len(keep), "n_excluded_problem": len(excluded),
        "n_unknown_dropped": len(unknown), "unknown_ids": unknown[:50],
        "stations_per_day_min": int(per_day.min()),
        "stations_per_day_median": int(np.median(per_day)),
        "stations_per_day_max": int(per_day.max()),
        "days_under_4_stations": int((per_day < 4).sum()),
        "fill_fraction": float(np.isfinite(values).mean()),
        "value_min": float(np.nanmin(values)), "value_max": float(np.nanmax(values)),
    }
    (out_dir / f"{variable}.json").write_text(json.dumps(summary, indent=2))

    log.info("[%s] %d days x %d stations, %.0f%% filled, %.1f MB",
             variable, len(dates), len(keep), 100 * summary["fill_fraction"],
             (out_dir / f"{variable}.npz").stat().st_size / 1e6)
    log.info("[%s] stations/day: min %d, median %d, max %d%s", variable,
             summary["stations_per_day_min"], summary["stations_per_day_median"],
             summary["stations_per_day_max"],
             f"  ** {summary['days_under_4_stations']} days below the 4-station "
             f"minimum and cannot be fitted **" if summary["days_under_4_stations"] else "")
    log.info("[%s] values %.1f .. %.1f", variable, summary["value_min"], summary["value_max"])
    return summary


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", default=str(DEFAULT_SOURCE))
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--variables", default="temp_mean,temp_min,temp_max")
    ap.add_argument("--workers", type=int, default=24,
                    help="I/O bound on a network drive, so threads help a lot")
    args = ap.parse_args()

    wanted = [v.strip() for v in args.variables.split(",") if v.strip()]
    bad = [v for v in wanted if v not in VARIABLES]
    if bad:
        raise SystemExit(f"unknown variables {bad}; have {sorted(VARIABLES)}")

    t0 = time.perf_counter()
    out = Path(args.out)
    summaries = [consolidate(v, Path(args.source), out, args.workers) for v in wanted]
    log.info("done in %.1f min -> %s", (time.perf_counter() - t0) / 60, out)
    for s in summaries:
        log.info("  %-10s %s..%s  %d days  %d stations",
                 s["variable"], s["first"], s["last"], s["n_days"], s["n_stations"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
