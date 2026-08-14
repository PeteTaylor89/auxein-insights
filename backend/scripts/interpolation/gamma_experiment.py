"""
Does inflating the dof charge in GCV help?

Ordinary GCV (gamma = 1) is known to under-smooth at moderate n: the criterion
is very flat near its minimum, so noise in RSS can drag the selected lambda a
long way. On the 15 golden dates the ridge engine lands at an effective dof of
91-94% of n on 4 of them - the spline spending nearly a degree of freedom per
station - and those are exactly the dates where it beats the legacy engine by
the least. The standard fix is to charge more per degree of freedom:

    V_gamma(lambda) = n * RSS / (n - gamma * edf)^2

This sweeps gamma and scores each value the same way SURFACE_CONTRACT_V1 says
accuracy must be measured: shuffled 10-fold CV with the smoothing parameter
re-selected inside every training fold.

Choosing gamma by minimising that same number over the same 15 dates would be
selection on the test set, so the script also reports a leave-one-date-out
estimate: gamma is picked on 14 dates and scored on the 15th. That is the number
to believe.

    python backend/scripts/interpolation/gamma_experiment.py
    python backend/scripts/interpolation/gamma_experiment.py --gammas 1.0,1.2,1.4
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts.interpolation.tps import (            # noqa: E402
    DEFAULT_LAMBDA_GRID, DEFAULT_LAPSE_RATE, DEFAULT_SCORING_FOLDS,
    DEFAULT_SCORING_SEED, RidgeTPS, ridge_basis, _shuffled_fold_ids,
    decluster, project_km,
)
from scripts.interpolation.parity_check import load_case, EXPECTED_DIR  # noqa: E402

GAMMAS = (1.0, 1.1, 1.2, 1.3, 1.4, 1.6, 1.8, 2.0, 2.5, 3.0)


def _fold_sweep(X_tr, y_tr, X_te, lambda_grid):
    """Every lambda's (edf, rss, n, prediction) off one eigendecomposition.

    Gamma only changes *which* lambda wins, so sweeping lambda once per fold
    makes the whole gamma sweep free.
    """
    Q2, R3, Q1, K, U, g, _ = ridge_basis(X_tr)
    b = U.T @ (Q2.T @ y_tr)
    cache = (Q2, R3, Q1, K, U, g, b)

    out = []
    for lam in lambda_grid:
        try:
            m = RidgeTPS(X_tr, y_tr, float(lam), _cache=cache)
        except np.linalg.LinAlgError:
            continue
        out.append((m, m(X_te)))
    return out


def run_case(date_key, gammas, lambda_grid, folds, seed,
             guard_edf=0.80, guard_gamma=1.1, verbose=True):
    stations, _grid, _expected, value_col = load_case(date_key)

    df = stations.dropna(subset=[value_col, "latitude", "longitude", "elevation"]).copy()
    df[value_col] = df[value_col].astype(float)
    df["elevation"] = df["elevation"].astype(float)
    df = df.loc[decluster(df, 0.5)[0]]

    lat = df["latitude"].to_numpy(float)
    lon = df["longitude"].to_numpy(float)
    y = (df[value_col] + df["elevation"] / 100.0 * DEFAULT_LAPSE_RATE).to_numpy(float)
    X = project_km(lat, lon, float(lat.mean()), float(lon.mean()))

    n = len(y)
    k = max(2, min(folds, n))
    fold_ids = _shuffled_fold_ids(n, k, seed)

    resid = {g: np.full(n, np.nan) for g in gammas}
    guard_resid = np.full(n, np.nan)
    guard_hits = 0
    for fold in range(k):
        te = fold_ids == fold
        tr = ~te
        if tr.sum() < 4:
            continue
        sweep = _fold_sweep(X[tr], y[tr], X[te], lambda_grid)
        if not sweep:
            continue
        for gamma in gammas:
            best = min(sweep, key=lambda mp: mp[0].criterion(gamma))
            resid[gamma][te] = y[te] - best[1]

        # Guarded rule: ordinary GCV, but if it spends more than `guard_edf` of
        # the available degrees of freedom, re-select with the inflated charge.
        # Targets the flat-criterion failure without paying for it on the dates
        # where ordinary GCV was already fine.
        best = min(sweep, key=lambda mp: mp[0].criterion(1.0))
        if best[0].edf / tr.sum() > guard_edf:
            best = min(sweep, key=lambda mp: mp[0].criterion(guard_gamma))
            guard_hits += 1
        guard_resid[te] = y[te] - best[1]

    # Full-data fit at each gamma, for the reported lambda / edf.
    full = _fold_sweep(X, y, X[:1], lambda_grid)

    row = {"date": date_key, "n": n}
    for gamma in gammas:
        r = resid[gamma]
        ok = np.isfinite(r)
        row[f"rmse_{gamma}"] = float(np.sqrt(np.mean(r[ok] ** 2))) if ok.any() else np.nan
        m = min(full, key=lambda mp: mp[0].criterion(gamma))[0]
        row[f"edf_{gamma}"] = m.edf / n
        row[f"lam_{gamma}"] = m.lam

    ok = np.isfinite(guard_resid)
    row["rmse_guard"] = float(np.sqrt(np.mean(guard_resid[ok] ** 2))) if ok.any() else np.nan
    row["guard_hits"] = guard_hits
    m = min(full, key=lambda mp: mp[0].criterion(1.0))[0]
    if m.edf / n > guard_edf:
        m = min(full, key=lambda mp: mp[0].criterion(guard_gamma))[0]
    row["edf_guard"] = m.edf / n

    if verbose:
        cells = "  ".join(f"g={g}: {row[f'rmse_{g}']:.3f}/{row[f'edf_{g}']:.0%}"
                          for g in gammas)
        print(f"{date_key} n={n:3d}  {cells}", flush=True)
    return row


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gammas", default=",".join(str(g) for g in GAMMAS))
    ap.add_argument("--folds", type=int, default=DEFAULT_SCORING_FOLDS)
    ap.add_argument("--seed", type=int, default=DEFAULT_SCORING_SEED)
    ap.add_argument("--guard-edf", type=float, default=0.80,
                    help="edf/n above which the guarded rule re-selects (default 0.80)")
    ap.add_argument("--guard-gamma", type=float, default=1.1,
                    help="gamma the guarded rule falls back to (default 1.1)")
    args = ap.parse_args()

    gammas = tuple(float(g) for g in args.gammas.split(","))
    keys = sorted(p.stem.replace("VCSN_gridded_output_", "")
                  for p in EXPECTED_DIR.glob("VCSN_gridded_output_*.csv"))

    df = pd.DataFrame([run_case(k, gammas, DEFAULT_LAMBDA_GRID, args.folds, args.seed,
                                args.guard_edf, args.guard_gamma)
                       for k in keys])

    print("\n" + "=" * 84)
    print("GAMMA SWEEP - shuffled 10-fold CV RMSE (degC), lambda re-selected per fold")
    print("=" * 84)
    print(f"  {'gamma':>6} {'median':>8} {'mean':>8} {'worst':>8} {'edf/n':>8} "
          f"{'vs g=1':>8}")
    base = df["rmse_1.0"].median() if "rmse_1.0" in df else np.nan
    for g in gammas:
        r, e = df[f"rmse_{g}"], df[f"edf_{g}"]
        delta = 100 * (r.median() - base) / base if np.isfinite(base) else np.nan
        print(f"  {g:>6} {r.median():8.3f} {r.mean():8.3f} {r.max():8.3f} "
              f"{e.median():8.0%} {delta:+7.1f}%")
    r, e = df["rmse_guard"], df["edf_guard"]
    delta = 100 * (r.median() - base) / base
    print(f"  {'guard':>6} {r.median():8.3f} {r.mean():8.3f} {r.max():8.3f} "
          f"{e.median():8.0%} {delta:+7.1f}%   "
          f"<- gamma={args.guard_gamma} only when edf/n > {args.guard_edf:.0%} "
          f"({int(df['guard_hits'].sum())} of {len(df) * args.folds} folds)")

    # Which dates was gamma=1 actually failing on?
    print("\n" + "=" * 84)
    print("THE UNDER-SMOOTHED DATES (edf > 80% of n at gamma=1)")
    print("=" * 84)
    bad = df[df["edf_1.0"] > 0.80]
    if len(bad):
        best_g = max(gammas)
        print(f"  {'date':>12} {'n':>4} {'edf g=1':>8} {'rmse g=1':>9} "
              f"{'edf g=' + str(best_g):>10} {'rmse':>7}")
        for _, r in bad.iterrows():
            print(f"  {r['date']:>12} {int(r['n']):4d} {r['edf_1.0']:8.0%} "
                  f"{r['rmse_1.0']:9.3f} {r[f'edf_{best_g}']:10.0%} "
                  f"{r[f'rmse_{best_g}']:7.3f}")
    else:
        print("  none")

    # Honest estimate: pick gamma on 14 dates, score on the 15th.
    print("\n" + "=" * 84)
    print("LEAVE-ONE-DATE-OUT (gamma chosen on 14 dates, scored on the held-out one)")
    print("=" * 84)
    candidates = list(gammas) + ["guard"]
    loo, picks = [], []
    for i in range(len(df)):
        others = df.drop(df.index[i])
        pick = min(candidates, key=lambda g: others[f"rmse_{g}"].median())
        picks.append(pick)
        loo.append(df.iloc[i][f"rmse_{pick}"])
    loo = np.array(loo)
    fixed1 = df["rmse_1.0"].to_numpy()
    guard = df["rmse_guard"].to_numpy()
    print(f"  picked: {sorted(set(map(str, picks)))}  "
          f"(most common {max(set(map(str, picks)), key=list(map(str, picks)).count)})")
    print(f"  {'':14} {'median':>8} {'mean':>8} {'worst':>8}")
    for name, arr in (("gamma = 1", fixed1), ("guarded", guard),
                      ("LOO-selected", loo)):
        print(f"  {name:14} {np.median(arr):8.3f} {arr.mean():8.3f} {arr.max():8.3f}")
    for name, arr in (("guarded", guard), ("LOO-selected", loo)):
        chg = 100 * (np.median(arr) - np.median(fixed1)) / np.median(fixed1)
        print(f"\n  {name} vs ordinary GCV: {chg:+.1f}% median, "
              f"{100 * (arr.mean() - fixed1.mean()) / fixed1.mean():+.1f}% mean, "
              f"{100 * (arr.max() - fixed1.max()) / fixed1.max():+.1f}% worst, "
              f"better on {(arr < fixed1).sum()}/{len(arr)} dates")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
