"""
Assumption A3: does a climatological ratio beat a plain spline on raw depth?

Compares four daily-rainfall methods over ~158 sample days spanning 2020-2026,
scored by 10-fold cross-validation **by station** and reported with the same
statistics Tait et al. (2012) used to validate VCSN, so the two are comparable:

    MAE all days                         Tait: 2.6 mm
    MAE on wet-wet days (both >= 1 mm)   Tait: 6.9 mm, median bias +0.3 mm
    MAE below / above 500 m elevation    Tait: 2-4 mm / 5-15 mm (bias-corrected)
    dry/wet contingency                  Tait: 5.0% false wet, 5.4% false dry

THE LEAKAGE TRAP, and why the folds are by station:

The ratio method divides each station's daily depth by that station's mean
annual rainfall. If a held-out station's own MAR is used to reconstruct its
prediction, years of its own record leak into its own test score and the method
looks far better than it is. So every fold refits the climatology from the
training stations only, and the held-out station's MAR is *interpolated* from
its neighbours exactly as an ungauged grid cell's would be.

Folds are by station rather than by station-day for the same reason: a station
in the test set for one day and the training set for the next would leak through
the climatology regardless.

    python backend/scripts/interpolation/precip_bakeoff.py
    python backend/scripts/interpolation/precip_bakeoff.py --days 40 --folds 5
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts.interpolation.precip import (            # noqa: E402
    METHODS, RATIO, RATIO_SQRT, WET_DAY_MM, ClimatologySurface,
    NZ_DAILY_MAX_MM, RasterClimatology, fit_precip_surface, screen_climatology,
)
from scripts.interpolation.tps import (            # noqa: E402
    DEFAULT_RELEVANCE_KM, project_km, ridge_basis, screen_relevance,
)

DATA = Path(__file__).resolve().parents[3] / "scratchpad" / "precip_data"
SEED = 20260804


GRID = Path(__file__).resolve().parents[2] / "models" / "example data" / "VCDN_5km.csv"

# LENZ / NZEnvDS total annual precipitation (Landcare Research, CC BY 4.0).
LENZ = (Path(__file__).resolve().parents[3] / "docs" / "models"
        / "lris-nzenvds-total-annual-precipitation-v10-GTiff" / "precip_ann_uc.tif")

# (arm name, underlying method, which climatology, leaks the held-out MAR?)
#
# `fit`  = ClimatologySurface refitted from the TRAINING stations each fold
# `lenz` = the external LENZ raster, identical every fold
# `true` = the held-out station's own MAR — the ceiling, never achievable
ARMS = [
    ("raw",             "raw",        None,   False),
    ("sqrt",            "sqrt",       None,   False),
    ("ratio",           RATIO,        "fit",  False),
    ("ratio_sqrt",      RATIO_SQRT,   "fit",  False),
    ("ratio_lenz",      RATIO,        "lenz", False),
    ("ratio_sqrt_lenz", RATIO_SQRT,   "lenz", False),
    ("ratio_true",      RATIO,        "fit",  True),
    ("ratio_sqrt_true", RATIO_SQRT,   "fit",  True),
]


def load():
    clim = pd.read_csv(DATA / "station_climatology.csv")
    clim["mar_mm"] = clim["mean_daily_mm"] * 365.25
    days = pd.read_csv(DATA / "sample_days.csv", parse_dates=["date"])

    # Drop stations too far from the grid to inform it. On the current network
    # this removes Raoul Island alone, at 983 km; the southern islands and the
    # Chathams are inside the radius and stay. See `screen_relevance`.
    clim, too_far = screen_relevance(clim, pd.read_csv(GRID))
    if len(too_far):
        print(f"relevance: dropped {len(too_far)} station(s) beyond "
              f"{DEFAULT_RELEVANCE_KM:.0f} km of the grid "
              f"({', '.join(f'{int(r.station_id)} at {r.distance_to_grid_km:.0f} km'
                            for _, r in too_far.iterrows())})")

    kept, rejected = screen_climatology(clim)
    print(f"stations: {len(clim)} with >=365 days of record")
    if len(rejected):
        print(f"  screened out {len(rejected)}:")
        for reason, n in rejected["reject_reason"].value_counts().items():
            ex = rejected[rejected["reject_reason"] == reason].iloc[0]
            print(f"    {reason:26s} {n:3d}  e.g. station {int(ex['station_id'])} "
                  f"MAR {ex['mar_mm']:,.0f} mm, max daily {ex['max_daily_mm']:,.0f} mm")
    print(f"  {len(kept)} usable")

    days = days[days["station_id"].isin(kept["station_id"])]
    days = days[days["rainfall_mm"].between(0, NZ_DAILY_MAX_MM)]
    return kept.reset_index(drop=True), days


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=0, help="cap sample days (0 = all)")
    ap.add_argument("--folds", type=int, default=10)
    ap.add_argument("--pop-threshold", type=float, default=None,
                    help="also test a wet/dry mask at this interpolated probability")
    ap.add_argument("--mar-smooth-km", type=float, default=0.0,
                    help="condition the LENZ raster before use, as production "
                         "does. Default 0 keeps the unconditioned raster this "
                         "script's published table was measured on")
    args = ap.parse_args()

    clim, days = load()
    dates = sorted(days["date"].unique())
    if args.days:
        step = max(1, len(dates) // args.days)
        dates = dates[::step][:args.days]
    print(f"days: {len(dates)}  ({pd.Timestamp(dates[0]).date()} to "
          f"{pd.Timestamp(dates[-1]).date()})\n")

    rng = np.random.default_rng(SEED)
    order = rng.permutation(len(clim))
    fold_of = np.empty(len(clim), int)
    fold_of[order] = np.arange(len(clim)) % args.folds
    clim = clim.assign(fold=fold_of)

    by_day = {d: g.set_index("station_id")["rainfall_mm"] for d, g in days.groupby("date")}

    arms = [a for a in ARMS if a[2] != "lenz"] if not LENZ.exists() else ARMS
    if not LENZ.exists():
        print(f"WARNING: no LENZ raster at {LENZ}; skipping the lenz arms\n")
    lenz_surface = None
    methods = [a[0] for a in arms]
    rows = []
    t0 = time.time()

    for fold in range(args.folds):
        train = clim[clim["fold"] != fold]
        test = clim[clim["fold"] == fold]

        # Climatology from TRAINING stations only, then read off at the held-out
        # locations - the held-out station's own MAR is never used.
        clim_surface = ClimatologySurface(train)
        test_pts = test[["longitude", "latitude"]].to_numpy(float)
        mar_hat = clim_surface(test_pts)

        # LENZ is external and identical every fold — it is not refitted, because
        # it was never fitted to our data in the first place. `fallback` covers
        # the handful of coastal points outside its mask.
        #
        # `smooth_km` is pinned EXPLICITLY rather than left to the default. The
        # 2026-08-06 table in this docstring was measured on the unconditioned
        # raster, and `RasterClimatology`'s default changed on 2026-08-17, so
        # inheriting it would silently stop reproducing the published numbers.
        # `--mar-smooth-km` switches this arm to the production conditioning.
        if any(a[2] == "lenz" for a in arms) and lenz_surface is None:
            lenz_surface = RasterClimatology(
                LENZ, fallback=ClimatologySurface(clim),
                smooth_km=args.mar_smooth_km,
                target_res_m=(500 if args.mar_smooth_km else None))
        mar_lenz = lenz_surface(test_pts) if lenz_surface is not None else None
        surfaces = {"fit": clim_surface, "lenz": lenz_surface}

        # The eigendecomposition depends only on coordinates, so it is computed
        # once per fold and reused for every day and every method.
        tr_lat = train["latitude"].to_numpy(float)
        tr_lon = train["longitude"].to_numpy(float)
        Xtr = project_km(tr_lat, tr_lon, float(tr_lat.mean()), float(tr_lon.mean()))
        basis = ridge_basis(Xtr)

        for date in dates:
            obs_all = by_day.get(date)
            if obs_all is None:
                continue
            tr = train.assign(rain=train["station_id"].map(obs_all)).dropna(subset=["rain"])
            te = test.assign(rain=test["station_id"].map(obs_all)).dropna(subset=["rain"])
            if len(tr) < 20 or len(te) == 0:
                continue

            # basis is only valid for the full training set; if any station is
            # missing this day, refit the basis for the subset.
            use_basis = basis if len(tr) == len(train) else None

            te_pts = te[["longitude", "latitude"]].to_numpy(float)
            in_te = test["station_id"].isin(te["station_id"]).to_numpy()
            te_mar = mar_hat[in_te]
            te_lenz = mar_lenz[in_te] if mar_lenz is not None else np.nan

            for name, fit_method, which, leak in arms:
                # `*_true` arms deliberately leak the held-out station's own MAR.
                # They are not candidate methods - they measure the ceiling the
                # ratio approach would reach given a perfect climatology, which
                # is what separates "the idea is wrong" from "our climatology is
                # not good enough". Never report them as achievable.
                try:
                    s = fit_precip_surface(
                        tr, "rain", method=fit_method,
                        climatology=surfaces.get(which),
                        pop_threshold=args.pop_threshold, basis=use_basis)
                    pred = s.predict(te_pts, climatology_mm=(
                        te["mar_mm"].to_numpy(float) if leak else None))
                except Exception as exc:                       # noqa: BLE001
                    print(f"  fold {fold} {pd.Timestamp(date).date()} {name}: {exc}")
                    continue
                rows.append(pd.DataFrame({
                    "date": date, "method": name,
                    "station_id": te["station_id"].to_numpy(),
                    "obs": te["rain"].to_numpy(float), "pred": pred,
                    "elevation": te["elevation"].to_numpy(float),
                    "mar_true": te["mar_mm"].to_numpy(float), "mar_hat": te_mar,
                    "mar_lenz": te_lenz,
                }))
        print(f"  fold {fold + 1}/{args.folds} done  ({time.time() - t0:.0f}s)", flush=True)

    r = pd.concat(rows, ignore_index=True)
    r["err"] = r["pred"] - r["obs"]
    r["abs"] = r["err"].abs()

    print("\n" + "=" * 92)
    print(f"PRECIP BAKE-OFF - {len(dates)} days, {args.folds}-fold by station, "
          f"{len(r) // len(methods):,} held-out station-days per method")
    print("=" * 92)
    print(f"  {'method':12} {'MAE all':>9} {'MAE wet-wet':>12} {'RMSE':>8} "
          f"{'bias':>8} {'MAE<500m':>9} {'MAE>=500m':>10}")
    base = None
    for m in methods:
        s = r[r["method"] == m]
        ww = s[(s["obs"] >= WET_DAY_MM) & (s["pred"] >= WET_DAY_MM)]
        lo, hi = s[s["elevation"] < 500], s[s["elevation"] >= 500]
        mae = s["abs"].mean()
        if base is None:
            base = mae
        print(f"  {m:12} {mae:9.3f} {ww['abs'].mean():12.3f} "
              f"{np.sqrt((s['err'] ** 2).mean()):8.3f} {s['err'].mean():8.3f} "
              f"{lo['abs'].mean():9.3f} {hi['abs'].mean():10.3f}"
              f"{'' if m == methods[0] else f'   ({100 * (mae - base) / base:+.0f}%)'}")

    print("\n" + "=" * 92)
    print("DRY/WET CONTINGENCY  (% of station-days, threshold 1 mm)")
    print("=" * 92)
    print(f"  {'method':12} {'both dry':>9} {'false wet':>10} {'false dry':>10} "
          f"{'both wet':>9} {'MAE both wet':>13}")
    for m in methods:
        s = r[r["method"] == m]
        ow, pw = s["obs"] >= WET_DAY_MM, s["pred"] >= WET_DAY_MM
        n = len(s)
        bw = s[ow & pw]
        print(f"  {m:12} {100 * (~ow & ~pw).mean():8.1f}% {100 * (~ow & pw).mean():9.1f}% "
              f"{100 * (ow & ~pw).mean():9.1f}% {100 * (ow & pw).mean():8.1f}% "
              f"{bw['abs'].mean():13.3f}")
    print(f"\n  Tait et al. 2012 for VCSN, same statistics: 5.0% false wet, "
          f"5.4% false dry,\n  6.9 mm MAE on both-wet days (2.6 mm over all days).")

    print("\n" + "=" * 92)
    print("HEAVY RAIN  (observed >= 40 mm - Tait's heavy-rain band)")
    print("=" * 92)
    print(f"  {'method':12} {'n':>7} {'MAE':>8} {'bias':>8}")
    for m in methods:
        s = r[(r["method"] == m) & (r["obs"] >= 40)]
        if len(s):
            print(f"  {m:12} {len(s):7d} {s['abs'].mean():8.2f} {s['err'].mean():8.2f}")
    print("  Tait: 8-12 mm below 500 m, 10-40 mm above.")

    # Is the interpolated climatology itself any good? It is the load-bearing
    # input for the ratio methods, so its own error bounds what they can achieve.
    cs = r[r["method"] == "ratio"].drop_duplicates("station_id")
    print("\n" + "=" * 92)
    print("CLIMATOLOGY QUALITY (held-out MAR vs the station's own record)")
    print("=" * 92)
    print(f"  {'source':10} {'n':>5} {'median':>8} {'p90':>8} {'max':>8} "
          f"{'log-sd':>8} {'mult. scatter':>14}")
    for label, col in (("fitted", "mar_hat"), ("LENZ", "mar_lenz")):
        if col not in cs or cs[col].isna().all():
            continue
        sub = cs[cs[col].notna() & (cs[col] > 0)]
        err = np.abs(sub[col] - sub["mar_true"]) / sub["mar_true"]
        lr = np.log(sub[col]) - np.log(sub["mar_true"])
        print(f"  {label:10} {len(sub):5d} {100*err.median():7.1f}% "
              f"{100*err.quantile(0.9):7.1f}% {100*err.max():7.0f}% "
              f"{lr.std():8.3f} {100*(np.exp(lr.std())-1):13.1f}%")
    print("\n  Multiplicative scatter, not median error, is the operative number: a")
    print("  uniform scale error in MAR cancels exactly in the ratio method (divide")
    print("  by it, multiply back), so only spatially-varying relative error hurts.")
    print("  Tait et al. 2006 report ~15% RMSE on NZ mean annual rainfall, up to 50%")
    print("  in high-elevation catchments, against a hand-drawn expert map.")
    print("\n  The gap between `ratio` and `ratio_true` above IS the climatology-error")
    print("  tax. If `ratio_lenz` closes most of it, LENZ is good enough to ship.")

    out = DATA / "bakeoff_results.csv"
    r.to_csv(out, index=False)
    print(f"\nper-prediction results -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
