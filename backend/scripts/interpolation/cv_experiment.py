"""
Does the fold structure explain the high CV RMSE?

Hypothesis under test: the on-prem model uses an UNSHUFFLED 5-fold CV. If the
station table happens to be ordered geographically, each fold removes a
spatially contiguous block -- punching a regional hole in the network and
forcing the spline to extrapolate across it. That would inflate CV RMSE for
reasons that have nothing to do with the surface's real accuracy.

Compared here, at a FIXED smoothing per date (so fold structure is the only
variable):

  unshuffled  5-fold   20%  removed per fold   <- what the model does today
  shuffled    5-fold   20%
  shuffled   10-fold   10%
  shuffled   20-fold    5%
  LOOCV                one station

Also reports how spatially clustered the unshuffled folds actually are, and
LOOCV error as a function of distance-to-nearest-station -- which is the number
that should really drive per-point confidence.

    python backend/scripts/interpolation/cv_experiment.py
    python backend/scripts/interpolation/cv_experiment.py --all
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts.interpolation.tps import (            # noqa: E402
    _fit_rbf, _select_smoothing, decluster, haversine_km, _pairwise_km,
    DEFAULT_SMOOTHING_GRID, DEFAULT_LAPSE_RATE,
)
from scripts.interpolation.parity_check import load_case, EXPECTED_DIR  # noqa: E402

RNG_SEED = 20260802


def _cv_rmse(X, y, smoothing, fold_assignments, clip=True):
    """Pooled out-of-fold RMSE at a fixed smoothing.

    `clip` mirrors production: `fit_surface` clips every prediction to the
    observed range of the data it was fitted on. Without it, a near-singular
    thin-plate system can emit physically impossible excursions that production
    would never actually serve -- so an unclipped CV overstates the error.
    """
    resid = np.full(len(y), np.nan)
    for fold in np.unique(fold_assignments):
        test = fold_assignments == fold
        train = ~test
        if train.sum() < 4:
            continue
        try:
            model = _fit_rbf(X[train], y[train], smoothing)
            pred = model(X[test][:, 0], X[test][:, 1])
            if clip:
                pred = np.clip(pred, y[train].min(), y[train].max())
            resid[test] = y[test] - pred
        except Exception:
            continue
    ok = np.isfinite(resid)
    return float(np.sqrt(np.mean(resid[ok] ** 2))), resid


def _contiguous_folds(n, k):
    """Unshuffled KFold assignment, as sklearn does it."""
    return np.floor(np.arange(n) / (n / k)).astype(int).clip(0, k - 1)


def _shuffled_folds(n, k, rng):
    idx = rng.permutation(n)
    folds = np.empty(n, dtype=int)
    folds[idx] = np.arange(n) % k
    return folds


def _fold_compactness(lat, lon, folds):
    """Mean pairwise distance within folds, relative to the whole network.

    Ratio well below 1.0 means folds are geographically clustered -- i.e. each
    fold removes a contiguous region rather than a scattered sample.
    """
    overall = _pairwise_km(lat, lon)
    overall_mean = overall[np.triu_indices_from(overall, k=1)].mean()
    within = []
    for f in np.unique(folds):
        sel = folds == f
        if sel.sum() < 2:
            continue
        sub = overall[np.ix_(sel, sel)]
        within.append(sub[np.triu_indices_from(sub, k=1)].mean())
    return float(np.mean(within) / overall_mean)


def run_case(date_key: str, verbose=True):
    stations, _grid, _expected, value_col = load_case(date_key)

    df = stations.dropna(subset=[value_col, "latitude", "longitude", "elevation"]).copy()
    df[value_col] = df[value_col].astype(float)
    df["elevation"] = df["elevation"].astype(float)
    adj = df[value_col] + df["elevation"] / 100.0 * DEFAULT_LAPSE_RATE

    # Fit on the declustered set, exactly as the model does.
    fit_idx, _hold_idx = decluster(df, 0.5)
    df = df.loc[fit_idx]
    adj = adj.loc[fit_idx]

    X = df[["longitude", "latitude"]].to_numpy(dtype=float)
    y = adj.to_numpy(dtype=float)
    lat = df["latitude"].to_numpy(dtype=float)
    lon = df["longitude"].to_numpy(dtype=float)
    n = len(df)

    smoothing, _ = _select_smoothing(X, y, DEFAULT_SMOOTHING_GRID, 5)
    rng = np.random.default_rng(RNG_SEED)

    schemes = {
        "unshuffled_5": _contiguous_folds(n, 5),
        "shuffled_5": _shuffled_folds(n, 5, rng),
        "shuffled_10": _shuffled_folds(n, 10, rng),
        "shuffled_20": _shuffled_folds(n, 20, rng),
        "loocv": np.arange(n),
    }

    row = {"date": date_key, "n": n, "smoothing": smoothing,
           "compactness_unshuffled": _fold_compactness(lat, lon, schemes["unshuffled_5"]),
           "compactness_shuffled": _fold_compactness(lat, lon, schemes["shuffled_5"])}

    loo_resid = None
    for name, folds in schemes.items():
        rmse, resid = _cv_rmse(X, y, smoothing, folds)
        row[name] = rmse
        if name == "loocv":
            loo_resid = resid

    # LOOCV error vs distance to nearest OTHER station -- the basis for a
    # defensible per-point confidence rather than one global figure.
    dist = _pairwise_km(lat, lon)
    np.fill_diagonal(dist, np.inf)
    nearest = dist.min(axis=1)
    row["_nearest"] = nearest
    row["_loo_resid"] = loo_resid

    if verbose:
        print(f"\n=== {date_key} ===  n={n}  smoothing={smoothing:g}")
        print(f"  fold compactness  unshuffled {row['compactness_unshuffled']:.3f}"
              f"   shuffled {row['compactness_shuffled']:.3f}   (1.0 = spatially random)")
        for name in schemes:
            print(f"  {name:14s} RMSE {row[name]:.3f} degC")
    return row


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default="01_01_1986")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()

    keys = (sorted(p.stem.replace("VCSN_gridded_output_", "")
                   for p in EXPECTED_DIR.glob("VCSN_gridded_output_*.csv"))
            if args.all else [args.date])

    rows = [run_case(k) for k in keys]
    df = pd.DataFrame(rows)
    cols = ["date", "n", "compactness_unshuffled", "compactness_shuffled",
            "unshuffled_5", "shuffled_5", "shuffled_10", "shuffled_20", "loocv"]

    print("\n" + "=" * 100)
    print("FOLD-STRUCTURE COMPARISON (RMSE, degC)")
    print("=" * 100)
    print(df[cols].to_string(index=False))

    print("\nACROSS DATES (median is the honest summary - means are outlier-sensitive):")
    print(f"  {'scheme':14s} {'median':>8s} {'mean':>8s} {'worst':>8s}")
    for c in ["unshuffled_5", "shuffled_5", "shuffled_10", "shuffled_20", "loocv"]:
        print(f"  {c:14s} {df[c].median():8.3f} {df[c].mean():8.3f} {df[c].max():8.3f}")
    print(f"\n  fold compactness: unshuffled {df['compactness_unshuffled'].mean():.3f}"
          f"  vs shuffled {df['compactness_shuffled'].mean():.3f}")

    # Pooled LOOCV error vs distance-to-nearest-station.
    nearest = np.concatenate([r["_nearest"] for r in rows])
    resid = np.concatenate([r["_loo_resid"] for r in rows])
    ok = np.isfinite(resid)
    nearest, resid = nearest[ok], resid[ok]
    bins = [0, 5, 10, 20, 40, 80, np.inf]
    print("\n" + "=" * 100)
    print("LOOCV ERROR vs DISTANCE TO NEAREST STATION (pooled)")
    print("=" * 100)
    print(f"{'distance band':>16}  {'n':>6}  {'RMSE':>8}  {'mean bias':>10}")
    for lo, hi in zip(bins[:-1], bins[1:]):
        sel = (nearest >= lo) & (nearest < hi)
        if sel.sum() == 0:
            continue
        label = f"{lo:g}-{hi:g} km" if np.isfinite(hi) else f">{lo:g} km"
        print(f"{label:>16}  {sel.sum():6d}  {np.sqrt(np.mean(resid[sel]**2)):8.3f}"
              f"  {np.mean(resid[sel]):10.3f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
