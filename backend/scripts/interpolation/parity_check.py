"""
Golden-file parity check: does the ported TPS reproduce the on-prem model?

Defaults to `--engine legacy` on purpose. `ridge` is what production now fits
with, but this suite exists to guarantee the *port* is faithful, and only the
legacy engine can be. `--engine ridge` reports how far the production engine has
moved from the on-prem grids; `--engine both` runs the guarantee and the
comparison together.

The on-prem run left a complete fixture behind, so the port can be verified
against real output rather than trusted:

  inputs   backend/models/example data/{DD_MM_YYYY}.csv        station values
           backend/models/example data/CLIFLO_RAW_Temp_Daily.csv  station metadata
           backend/models/example data/VCDN_5km.csv            national 5 km grid
  expected docs/models/VCSN_gridded_output_{DD_MM_YYYY}.csv     Adjusted_Tmean(C)

Run:
    python backend/scripts/interpolation/parity_check.py
    python backend/scripts/interpolation/parity_check.py --date 01_01_1990
    python backend/scripts/interpolation/parity_check.py --all
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts.interpolation.tps import fit_surface, evaluate_on_grid  # noqa: E402

REPO = Path(__file__).resolve().parents[3]
EXAMPLES = REPO / "backend" / "models" / "example data"
EXPECTED_DIR = REPO / "docs" / "models"

# Carried over verbatim from Spline_Temp_V1.7.py.
PROBLEM_STATIONS = [4677, 37002, 38102]
LAPSE_RATE = 0.6
RMSE_TARGET = 0.4


def load_case(date_key: str):
    """Assemble one date's stations + grid + expected output."""
    values = pd.read_csv(EXAMPLES / f"{date_key}.csv")
    meta = pd.read_csv(EXAMPLES / "CLIFLO_RAW_Temp_Daily.csv")
    grid = pd.read_csv(EXAMPLES / "VCDN_5km.csv")
    expected = pd.read_csv(EXPECTED_DIR / f"VCSN_gridded_output_{date_key}.csv")

    value_col = values.columns[1]                      # e.g. "Tmean(C)"

    stations = values.merge(meta, how="left", left_on="Station", right_on="Agent Number")
    stations = stations.replace({"-": np.nan, "-9999": np.nan})
    stations = stations.dropna(subset=["Longitude", "Latitude", value_col])
    stations = stations[~stations["Station"].isin(PROBLEM_STATIONS)]
    stations = stations.rename(columns={
        "Latitude": "latitude", "Longitude": "longitude", "Height": "elevation",
    })

    grid = grid.rename(columns={
        "Latitude": "latitude", "Longitude": "longitude", "Elevation": "elevation",
    })
    return stations, grid, expected, value_col


def run_case(date_key: str, engine: str = "legacy", verbose: bool = True) -> dict:
    stations, grid, expected, value_col = load_case(date_key)

    t0 = time.time()
    fit = fit_surface(
        stations, value_col,
        lapse_rate=LAPSE_RATE,
        rmse_target=RMSE_TARGET,
        engine=engine,
    )
    predicted = evaluate_on_grid(fit, grid)
    elapsed = time.time() - t0

    expected_col = next(c for c in expected.columns if c.startswith("Adjusted_"))
    truth = expected[expected_col].to_numpy(dtype=float)

    if len(truth) != len(predicted):
        raise SystemExit(f"grid length mismatch: expected {len(truth)}, got {len(predicted)}")

    diff = predicted - truth
    finite = np.isfinite(diff)
    result = {
        "date": date_key,
        "engine": engine,
        "n_fit": fit.n_fit,
        "n_test": fit.n_test,
        "smoothing": fit.smoothing,
        "decluster_km": fit.decluster_km,
        "rmse": fit.rmse,
        "cv_rmse": fit.cv_rmse,
        "t_rmse": fit.t_rmse,
        "edf": fit.edf,
        "edf_frac": fit.edf_fraction,
        "max_abs_diff": float(np.nanmax(np.abs(diff[finite]))),
        "mean_abs_diff": float(np.nanmean(np.abs(diff[finite]))),
        "corr": float(np.corrcoef(predicted[finite], truth[finite])[0, 1]),
        "seconds": elapsed,
    }

    if verbose:
        print(f"\n=== {date_key} [{engine}] ===")
        print(f"  stations fit/holdout : {fit.n_fit} / {fit.n_test}")
        print(f"  smoothing            : {fit.smoothing:g}   decluster {fit.decluster_km} km"
              + (f"   signal {fit.edf:.0f} ({fit.edf_fraction:.0%} of n)"
                 if fit.edf is not None else ""))
        print(f"  fit RMSE             : {fit.rmse:.4f}   cv_RMSE {fit.cv_rmse:.4f}"
              + (f"   holdout t_RMSE {fit.t_rmse:.4f}" if fit.t_rmse is not None else ""))
        print(f"  grid cells           : {len(predicted):,}   ({elapsed:.1f}s)")
        print(f"  vs on-prem  max|diff|: {result['max_abs_diff']:.6f} degC")
        print(f"              mean|diff|: {result['mean_abs_diff']:.6f} degC")
        print(f"              corr      : {result['corr']:.8f}")
    return result


def main():
    ap = argparse.ArgumentParser(description="Parity-check the TPS port against on-prem output")
    ap.add_argument("--date", default="01_01_1986", help="date key, e.g. 01_01_1986")
    ap.add_argument("--all", action="store_true", help="run every date with a golden file")
    ap.add_argument("--engine", default="legacy", choices=["legacy", "ridge", "both"],
                    help="legacy reproduces on-prem and is the parity guarantee; "
                         "ridge is the production default; both runs each and "
                         "compares (this flag defaults to legacy)")
    ap.add_argument("--tolerance", type=float, default=0.01,
                    help="max acceptable |difference| in degC (default 0.01)")
    args = ap.parse_args()

    if args.all:
        keys = sorted(p.stem.replace("VCSN_gridded_output_", "")
                      for p in EXPECTED_DIR.glob("VCSN_gridded_output_*.csv"))
    else:
        keys = [args.date]

    engines = ["legacy", "ridge"] if args.engine == "both" else [args.engine]
    rows = [run_case(k, engine=e) for e in engines for k in keys]
    df = pd.DataFrame(rows)

    cols = ["date", "n_fit", "rmse", "cv_rmse", "t_rmse", "edf_frac",
            "max_abs_diff", "corr", "seconds"]

    for engine in engines:
        sub = df[df["engine"] == engine]
        print("\n" + "=" * 88)
        print(f"{engine.upper()} ENGINE vs ON-PREM GRIDDED OUTPUT")
        print("=" * 88)
        print(sub[cols].to_string(index=False))

    legacy = df[df["engine"] == "legacy"]
    ridge = df[df["engine"] == "ridge"]

    if len(ridge):
        print("\n" + "=" * 88)
        print("ACCURACY (cv_rmse: shuffled 10-fold, smoothing re-selected per fold)")
        print("=" * 88)
        print(f"  {'':10s} {'median':>8s} {'mean':>8s} {'worst':>8s}")
        for name, sub in (("legacy", legacy), ("ridge", ridge)):
            if len(sub):
                print(f"  {name:10s} {sub['cv_rmse'].median():8.3f} "
                      f"{sub['cv_rmse'].mean():8.3f} {sub['cv_rmse'].max():8.3f}")
        if len(legacy) == len(ridge) and len(legacy):
            a = legacy.set_index("date")["cv_rmse"]
            b = ridge.set_index("date")["cv_rmse"]
            chg = 100 * (b - a) / a
            print(f"\n  ridge vs legacy: median {chg.median():+.1f}%  "
                  f"best {chg.min():+.1f}%  worst {chg.max():+.1f}%  "
                  f"(better on {(chg < 0).sum()}/{len(chg)} dates)")
        print(f"\n  signal (edf) as a fraction of n: median {ridge['edf_frac'].median():.0%}"
              f"  - ANUSPLIN guidance is below ~50%")
        print(f"  divergence from on-prem: mean|diff| {ridge['mean_abs_diff'].mean():.3f} degC, "
              f"max {ridge['max_abs_diff'].max():.3f} degC")
        print("  Divergence is the point, not a failure: the ridge engine is a different\n"
              "  model. The on-prem grids stay the regression target for `legacy` only.")

    if not len(legacy):
        return 0

    worst = legacy["max_abs_diff"].max()
    print(f"\nlegacy worst max|diff| across {len(legacy)} date(s): {worst:.6f} degC "
          f"(tolerance {args.tolerance})")
    if worst <= args.tolerance:
        print("PASS - legacy engine still reproduces the on-prem model within tolerance.")
        return 0
    print("FAIL - legacy engine diverges from the on-prem model. Do not proceed to production.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
