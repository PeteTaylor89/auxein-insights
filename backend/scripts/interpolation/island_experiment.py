"""Do the offshore island stations belong in the national rainfall fit?

Three stations in the network sit hundreds to thousands of kilometres from the
mainland: Campbell Island (-52.55, 169.15), the Auckland Islands (-50.48,
166.30) and Raoul Island (-29.25, -177.93). A thin-plate spline has no notion of
"too far to be relevant" - every station constrains the surface, and the linear
polynomial term in the bordered system is fitted globally, so a remote point can
tilt the whole national trend.

Raoul carried a second, separate problem, FIXED 2026-08-05 in `project_km`.
That projection had no antimeridian wrapping:

    x = (lon - lon0) * 111.320 * cos(lat0)

Raoul is at 177.93 **west**. Against a network centroid near 173 east that
arithmetic placed it at x = -29,369 km - roughly 30,000 km to the west of New
Zealand, when it physically sits ~756 km to the east.

`project_km` now wraps, so **arm C is a no-op against arm A on current code** and
is retained only as the record of what the bug cost. Re-running it should show
the two arms agreeing to ~1e-9 mm; if they diverge materially, the wrap has
regressed. Not bit-exact, because pre-wrapping the column also moves the
centroid `lon0` by ~56 km - and a thin-plate spline is invariant to a shift of
origin, so that difference cancels to floating-point noise rather than to zero.

So "exclude the islands" conflates two hypotheses, and this script separates
them by running three arms:

    A  baseline     all stations, exactly as `precip_bakeoff.py` ran them
    B  no islands   the three offshore stations dropped from fit + climatology
    C  wrapped      islands kept, longitudes wrapped continuously about the
                    centroid so Raoul lands east instead of 30,000 km west

If B beats A but C also beats A by a similar margin, the damage was the
projection bug and the islands themselves are harmless. If B beats C, the
isolation is the problem and no projection fix rescues them.

THE TEST SET IS IDENTICAL IN ALL THREE ARMS - mainland stations only. The
islands are never scored, only ever fitted. Scoring them would confound the
comparison: dropping three high-error stations from the test set would improve
the mean without telling us anything about the surface over land.

    python backend/scripts/interpolation/island_experiment.py
    python backend/scripts/interpolation/island_experiment.py --days 30 --folds 5
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
    RAW, SQRT, RATIO, WET_DAY_MM, ClimatologySurface, NZ_DAILY_MAX_MM,
    fit_precip_surface, screen_climatology,
)
from scripts.interpolation.tps import project_km, ridge_basis  # noqa: E402

DATA = Path(__file__).resolve().parents[3] / "scratchpad" / "precip_data"
SEED = 20260804          # same seed as precip_bakeoff.py, so folds line up
METHODS = (RAW, SQRT, RATIO)

# The NZ mainland bounding box. Anything outside it is offshore.
#
# Distance-to-nearest-peer was the obvious classifier and it is WRONG: station
# 187 on the Taranaki coast is 179 km from its nearest neighbour purely because
# Taranaki has no council feed yet, so an isolation test flags a perfectly
# ordinary mainland station as an island. Dropping it in the exclusion arm
# would confound the very thing being measured. Geography, not spacing.
MAINLAND_LAT = (-47.5, -34.0)
MAINLAND_LON = (166.0, 179.0)


def wrap_lon(lon: np.ndarray, lon0: float) -> np.ndarray:
    """Longitudes made continuous about `lon0`, so the antimeridian is not a cut."""
    return lon0 + ((np.asarray(lon, float) - lon0 + 180.0) % 360.0) - 180.0


def great_circle_km(lat1, lon1, lat2, lon2):
    """Pairwise great-circle distance - correct across the antimeridian, unlike
    the projection, which is the point of using it to classify."""
    la1, lo1 = np.radians(lat1)[:, None], np.radians(lon1)[:, None]
    la2, lo2 = np.radians(lat2)[None, :], np.radians(lon2)[None, :]
    a = np.sin((la1 - la2) / 2) ** 2 + np.cos(la1) * np.cos(la2) * np.sin((lo1 - lo2) / 2) ** 2
    return 6371.0 * 2 * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def classify(clim: pd.DataFrame) -> pd.Series:
    """True where a station lies outside the NZ mainland bounding box."""
    lat, lon = clim["latitude"], clim["longitude"]
    return ~(lat.between(*MAINLAND_LAT) & lon.between(*MAINLAND_LON))


def load():
    clim = pd.read_csv(DATA / "station_climatology.csv")
    clim["mar_mm"] = clim["mean_daily_mm"] * 365.25
    days = pd.read_csv(DATA / "sample_days.csv", parse_dates=["date"])
    kept, _ = screen_climatology(clim)
    kept = kept.reset_index(drop=True)
    days = days[days["station_id"].isin(kept["station_id"])]
    days = days[days["rainfall_mm"].between(0, NZ_DAILY_MAX_MM)]
    return kept, days


def run_arm(name, mainland, islands, days_by_date, dates, folds, wrapped):
    """One arm. Returns per-prediction rows over the mainland test stations."""
    stations = mainland if islands is None else pd.concat([mainland, islands], ignore_index=True)
    if wrapped:
        lon0 = float(stations["longitude"].mean())
        stations = stations.assign(longitude=wrap_lon(stations["longitude"].to_numpy(float), lon0))

    rows = []
    for fold in range(folds):
        # Folds are defined on the mainland only; islands are training-only.
        test = stations[(stations["fold"] == fold) & (~stations["is_island"])]
        train = stations[(stations["fold"] != fold) | (stations["is_island"])]
        if not len(test):
            continue

        clim_surface = ClimatologySurface(train)
        tr_lat = train["latitude"].to_numpy(float)
        tr_lon = train["longitude"].to_numpy(float)
        Xtr = project_km(tr_lat, tr_lon, float(tr_lat.mean()), float(tr_lon.mean()))
        basis = ridge_basis(Xtr)

        for date in dates:
            obs = days_by_date.get(date)
            if obs is None:
                continue
            tr = train.assign(rain=train["station_id"].map(obs)).dropna(subset=["rain"])
            te = test.assign(rain=test["station_id"].map(obs)).dropna(subset=["rain"])
            if len(tr) < 20 or len(te) == 0:
                continue
            use_basis = basis if len(tr) == len(train) else None
            te_pts = te[["longitude", "latitude"]].to_numpy(float)

            for method in METHODS:
                try:
                    s = fit_precip_surface(tr, "rain", method=method,
                                           climatology=clim_surface, basis=use_basis)
                    pred = s.predict(te_pts)
                except Exception as exc:                        # noqa: BLE001
                    print(f"  [{name}] fold {fold} {pd.Timestamp(date).date()} "
                          f"{method}: {exc}")
                    continue
                rows.append(pd.DataFrame({
                    "arm": name, "method": method, "date": date,
                    "station_id": te["station_id"].to_numpy(),
                    "obs": te["rain"].to_numpy(float), "pred": pred,
                    "elevation": te["elevation"].to_numpy(float),
                }))
    return pd.concat(rows, ignore_index=True) if rows else pd.DataFrame()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=60, help="sample days (0 = all)")
    ap.add_argument("--folds", type=int, default=10)
    args = ap.parse_args()

    clim, days = load()
    clim["is_island"] = classify(clim)
    islands = clim[clim["is_island"]].copy()
    mainland = clim[~clim["is_island"]].copy()

    print(f"stations: {len(clim)} usable -> {len(mainland)} mainland, "
          f"{len(islands)} offshore (outside lat {MAINLAND_LAT}, lon {MAINLAND_LON})")
    lon0 = float(clim["longitude"].mean())
    for _, r in islands.iterrows():
        x = project_km(np.array([r.latitude]), np.array([r.longitude]),
                       float(clim["latitude"].mean()), lon0)[0][0]
        print(f"  station {int(r.station_id):4d}  ({r.latitude:7.2f}, {r.longitude:8.2f})  "
              f"MAR {r.mar_mm:6,.0f} mm   projected x = {x:11,.0f} km")

    dates = sorted(days["date"].unique())
    if args.days:
        step = max(1, len(dates) // args.days)
        dates = dates[::step][:args.days]
    print(f"days: {len(dates)} ({pd.Timestamp(dates[0]).date()} to "
          f"{pd.Timestamp(dates[-1]).date()}), {args.folds}-fold by station\n")

    # Fold assignment over the mainland only, fixed seed, shared by all arms.
    rng = np.random.default_rng(SEED)
    order = rng.permutation(len(mainland))
    fold_of = np.empty(len(mainland), int)
    fold_of[order] = np.arange(len(mainland)) % args.folds
    mainland = mainland.assign(fold=fold_of)
    islands = islands.assign(fold=-1)

    by_day = {d: g.set_index("station_id")["rainfall_mm"] for d, g in days.groupby("date")}

    # Raoul sits north of the mainland box, Campbell and the Auckland Islands
    # south of it. They are separated because they fail differently: Raoul is
    # the misprojected one, the southern pair are the only stations anchoring
    # the surface below Southland.
    southern = islands[islands["latitude"] < MAINLAND_LAT[0]]
    northern = islands[islands["latitude"] > MAINLAND_LAT[1]]

    arms = [
        ("A baseline", islands, False),
        ("B no islands", None, False),
        ("C wrapped", islands, True),
        ("D no Raoul", southern, False),
        ("E no southern", northern, False),
    ]
    out, t0 = [], time.time()
    for name, isl, wrapped in arms:
        r = run_arm(name, mainland, isl, by_day, dates, args.folds, wrapped)
        out.append(r)
        print(f"  {name:14s} done ({time.time() - t0:.0f}s)", flush=True)

    r = pd.concat(out, ignore_index=True)
    r["err"] = r["pred"] - r["obs"]
    r["abs"] = r["err"].abs()

    n_per = len(r) // (len(arms) * len(METHODS))
    print("\n" + "=" * 96)
    print(f"ISLAND EXCLUSION - mainland test stations only, {n_per:,} held-out "
          f"station-days per arm/method")
    print("=" * 96)
    print(f"  {'method':7} {'arm':14} {'MAE':>8} {'RMSE':>9} {'bias':>8} "
          f"{'MAE wet-wet':>12} {'p99 |err|':>10} {'max |err|':>10}   vs baseline")
    for method in METHODS:
        base = None
        for name, _, _ in arms:
            s = r[(r["method"] == method) & (r["arm"] == name)]
            if not len(s):
                continue
            ww = s[(s["obs"] >= WET_DAY_MM) & (s["pred"] >= WET_DAY_MM)]
            mae = s["abs"].mean()
            if base is None:
                base = mae
            delta = "" if name.startswith("A") else f"   ({100 * (mae - base) / base:+.2f}%)"
            print(f"  {method:7} {name:14} {mae:8.4f} "
                  f"{np.sqrt((s['err'] ** 2).mean()):9.4f} {s['err'].mean():8.4f} "
                  f"{ww['abs'].mean():12.4f} {s['abs'].quantile(0.99):10.3f} "
                  f"{s['abs'].max():10.2f}{delta}")
        print()

    # Where does any difference actually land? If the islands tilt the national
    # trend, the effect should be largest at the ends of the country.
    print("=" * 96)
    print("EFFECT BY LATITUDE BAND  (MAE, sqrt method)")
    print("=" * 96)
    s = r[r["method"] == SQRT].merge(
        clim[["station_id", "latitude"]], on="station_id", how="left")
    bands = pd.cut(s["latitude"], [-47.5, -44, -41, -38, -34],
                   labels=["-47.5..-44 (Sth)", "-44..-41", "-41..-38", "-38..-34 (Nth)"])
    tab = s.assign(band=bands).pivot_table(index="band", columns="arm",
                                           values="abs", aggfunc="mean", observed=False)
    n = s.assign(band=bands).groupby("band", observed=False).size()
    print(tab.assign(n=n).round(4).to_string())

    out_csv = DATA / "island_experiment_results.csv"
    r.to_csv(out_csv, index=False)
    print(f"\nper-prediction results -> {out_csv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
