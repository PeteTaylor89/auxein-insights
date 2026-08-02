"""
Golden-file parity check: does the ported TPS reproduce the on-prem model?

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


def run_case(date_key: str, verbose: bool = True) -> dict:
    stations, grid, expected, value_col = load_case(date_key)

    t0 = time.time()
    fit = fit_surface(
        stations, value_col,
        lapse_rate=LAPSE_RATE,
        rmse_target=RMSE_TARGET,
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
        "n_fit": fit.n_fit,
        "n_test": fit.n_test,
        "smoothing": fit.smoothing,
        "decluster_km": fit.decluster_km,
        "rmse": fit.rmse,
        "cv_rmse": fit.cv_rmse,
        "t_rmse": fit.t_rmse,
        "max_abs_diff": float(np.nanmax(np.abs(diff[finite]))),
        "mean_abs_diff": float(np.nanmean(np.abs(diff[finite]))),
        "corr": float(np.corrcoef(predicted[finite], truth[finite])[0, 1]),
        "seconds": elapsed,
    }

    if verbose:
        print(f"\n=== {date_key} ===")
        print(f"  stations fit/holdout : {fit.n_fit} / {fit.n_test}")
        print(f"  smoothing            : {fit.smoothing:g}   decluster {fit.decluster_km} km")
        print(f"  fit RMSE             : {fit.rmse:.4f}"
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
    ap.add_argument("--tolerance", type=float, default=0.01,
                    help="max acceptable |difference| in degC (default 0.01)")
    args = ap.parse_args()

    if args.all:
        keys = sorted(p.stem.replace("VCSN_gridded_output_", "")
                      for p in EXPECTED_DIR.glob("VCSN_gridded_output_*.csv"))
    else:
        keys = [args.date]

    rows = [run_case(k) for k in keys]
    df = pd.DataFrame(rows)

    print("\n" + "=" * 78)
    print("PARITY SUMMARY")
    print("=" * 78)
    print(df[["date", "n_fit", "n_test", "rmse", "cv_rmse", "t_rmse",
              "max_abs_diff", "corr", "seconds"]].to_string(index=False))

    worst = df["max_abs_diff"].max()
    print(f"\nworst max|diff| across {len(df)} date(s): {worst:.6f} degC "
          f"(tolerance {args.tolerance})")
    if worst <= args.tolerance:
        print("PASS - port reproduces the on-prem model within tolerance.")
        return 0
    print("FAIL - port diverges from the on-prem model. Do not proceed to production.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
