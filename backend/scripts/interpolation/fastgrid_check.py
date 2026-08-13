"""Regression check: does `fastgrid` reproduce `tps.evaluate_on_grid` exactly?

`fastgrid` is a pure optimisation. It must agree with the straightforward
evaluator to floating-point noise, and if it ever does not, the straightforward
evaluator is right.

This suite exists because the first version of `fastgrid` did NOT agree, and
nothing else noticed. `thin_plate_sq` was called with its output aliasing its
input, so it computed log(d2)^2 instead of d2*log(d2) — a different kernel
entirely. Every surface came out wrong, while `cv_rmse`, `edf`, the station
count and the lambda were all perfectly healthy, because those come from `tps`
and never pass through the grid basis. The only visible symptom was a national
mean temperature of 31 degC on New Year's Day 1986.

So: the fit statistics cannot validate the grid path. This can.

    python backend/scripts/interpolation/fastgrid_check.py
    python backend/scripts/interpolation/fastgrid_check.py --grid 500m --dtype float32
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts.interpolation import tps                                # noqa: E402
from scripts.interpolation.fastgrid import GridBasis, thin_plate_sq  # noqa: E402
from scripts.interpolation.raster import RasterTemplate, grid_from_csv  # noqa: E402

REPO = Path(__file__).resolve().parents[3]
EXAMPLES = REPO / "backend" / "models" / "example data"
PROBLEM_STATIONS = [4677, 37002, 38102]
LAPSE = 0.6


def load(key):
    values = pd.read_csv(EXAMPLES / f"{key}.csv")
    meta = pd.read_csv(EXAMPLES / "CLIFLO_RAW_Temp_Daily.csv")
    vc = values.columns[1]
    s = values.merge(meta, how="left", left_on="Station", right_on="Agent Number")
    s = s.replace({"-": np.nan, "-9999": np.nan}).dropna(subset=["Longitude", "Latitude", vc])
    s = s[~s["Station"].isin(PROBLEM_STATIONS)]
    return s.rename(columns={"Latitude": "latitude", "Longitude": "longitude",
                             "Height": "elevation", "Station": "station_id"}), vc


def check_kernel() -> int:
    """The unit-level guard: fastgrid's kernel == tps's kernel."""
    rng = np.random.default_rng(7)
    A = rng.normal(scale=200, size=(500, 2))
    B = rng.normal(scale=200, size=(60, 2))
    d = tps._cdist(A, B)
    ref = tps._thin_plate(d)
    got = thin_plate_sq(d ** 2)
    err = np.abs(got - ref).max()
    print(f"  kernel phi(r) vs phi from d2 : max|diff| {err:.3e}")

    aliased = "not rejected"
    try:
        x = d ** 2
        thin_plate_sq(x, out=x)
    except ValueError:
        aliased = "rejected"
    print(f"  aliased out=d2               : {aliased}")
    ok = err < 1e-9 and aliased == "rejected"
    print(f"  -> {'PASS' if ok else 'FAIL'}")
    return 0 if ok else 1


def check_grid(grid_name: str, dtype, tol: float) -> int:
    grid_csv = EXAMPLES / ("VCDN_5km.csv" if grid_name == "5km" else "VCDN_500m.csv")
    grid = grid_from_csv(grid_csv)
    keys = sorted(p.stem for p in EXAMPLES.glob("01_01_*.csv"))
    frames = {k: load(k) for k in keys}
    union = (pd.concat([s[["station_id", "latitude", "longitude", "elevation"]]
                        for s, _ in frames.values()])
             .drop_duplicates("station_id").reset_index(drop=True))

    t = time.perf_counter()
    basis = GridBasis.build(grid, union, dtype=dtype)
    print(f"  basis: {basis.n_cells:,} x {basis.n_stations} "
          f"({np.dtype(dtype).name}, {basis.B.nbytes/1e9:.2f} GB) in "
          f"{time.perf_counter()-t:.1f}s; origin {basis.lat0:.4f},{basis.lon0:.4f}")

    worst = 0.0
    rows = []
    for key in keys:
        stations, vc = frames[key]
        fit = tps.fit_surface(stations, vc, lapse_rate=LAPSE, engine="ridge",
                              origin=(basis.lat0, basis.lon0))
        # reference: the ordinary chunked evaluator, same fit, same projection
        ref = tps.evaluate_on_grid(fit, grid)
        # fast: union-padded coefficients through the precomputed basis
        cols = basis.index_of(fit.fit_stations["station_id"].tolist())
        vec = basis.coefficient_vector(cols, fit.model.c, fit.model.d)
        got = basis.project(vec, lapse_rate=LAPSE)
        d = float(np.abs(got - ref).max())
        worst = max(worst, d)
        rows.append({"date": key, "n_fit": fit.n_fit, "cv_rmse": fit.cv_rmse,
                     "ref_mean": float(ref.mean()), "fast_mean": float(got.mean()),
                     "max_abs_diff": d})
    df = pd.DataFrame(rows)
    print(df.to_string(index=False, float_format=lambda v: f"{v:.6g}"))

    # A physical sanity floor, independent of the reference: the aliasing bug
    # produced a 31 degC national mean and would have passed any check that only
    # compared fast to fast.
    lo, hi = df["fast_mean"].min(), df["fast_mean"].max()
    plausible = 5.0 <= lo and hi <= 25.0
    print(f"\n  national mean across dates : {lo:.2f} .. {hi:.2f} degC "
          f"({'plausible' if plausible else 'IMPLAUSIBLE for a NZ daily mean'})")
    print(f"  worst |fast - reference|   : {worst:.3e} degC (tolerance {tol:g})")
    ok = worst <= tol and plausible
    print(f"  -> {'PASS' if ok else 'FAIL'}")
    return 0 if ok else 1


def check_raster(grid_name: str) -> int:
    """Round-trip land cells through the raster scatter without loss."""
    grid_csv = EXAMPLES / ("VCDN_5km.csv" if grid_name == "5km" else "VCDN_500m.csv")
    grid = grid_from_csv(grid_csv)
    t = RasterTemplate.build(grid["latitude"].to_numpy(float),
                             grid["longitude"].to_numpy(float))
    probe = np.arange(len(grid), dtype=np.float32)
    r = t.to_raster(probe)
    back = r.ravel()[t.flat_index]
    err = float(np.abs(back - probe).max())
    covered = int((r != -9999.0).sum())
    print(f"  raster {t.height} x {t.width} @ {t.yres:.4f} deg (~{t.resolution_m} m)")
    print(f"  land cells placed          : {covered:,} of {len(grid):,}")
    print(f"  scatter round-trip max err : {err:g}")
    ok = err == 0.0 and covered == len(grid)
    print(f"  -> {'PASS' if ok else 'FAIL'}")
    return 0 if ok else 1


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--grid", choices=["5km", "500m"], default="5km")
    ap.add_argument("--dtype", choices=["float32", "float64"], default="float64")
    ap.add_argument("--tolerance", type=float,
                    help="max |fast - reference| in degC "
                         "(default 1e-8 for float64, 0.05 for float32)")
    args = ap.parse_args()
    dtype = getattr(np, args.dtype)
    tol = args.tolerance if args.tolerance is not None else (
        1e-8 if dtype is np.float64 else 0.05)

    print("=" * 78); print("KERNEL"); print("=" * 78)
    rc = check_kernel()
    print(); print("=" * 78); print(f"RASTER SCATTER ({args.grid})"); print("=" * 78)
    rc |= check_raster(args.grid)
    print(); print("=" * 78)
    print(f"GRID EVALUATION ({args.grid}, {args.dtype}) vs tps.evaluate_on_grid")
    print("=" * 78)
    rc |= check_grid(args.grid, dtype, tol)
    print("\n" + ("ALL PASS" if rc == 0 else "FAILURES ABOVE"))
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
