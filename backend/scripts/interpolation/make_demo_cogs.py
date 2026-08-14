"""Build demo COGs from the on-prem fixture, so WS3 has real rasters to build on.

The 15 golden dates in `backend/models/example data/` are the only complete
station-to-grid fixture we have that predates the database, and they span
1986-2000 at one date per year. That makes them a usable demo time series for
the frontend well before the real backfill exists — real New Zealand
temperature fields, real spatial structure, real station geometry, rather than
synthetic noise shaped like a contract.

Two modes:

  --source golden   re-wrap `docs/models/VCSN_gridded_output_*.csv` as COGs.
                    5 km, and these are the ON-PREM (legacy-engine) values, so
                    it is a format conversion with no modelling in it at all.

  --source fit      refit each date with the production `ridge` engine and
                    evaluate on the 500 m grid via `fastgrid`. This is what
                    production will actually serve, and it is the path worth
                    demoing. Takes about as long as the golden mode thanks to
                    the precomputed basis.

Both write `surfaces/<variable>/<granularity>/<YYYY>/<YYYY-MM-DD>.tif` under the
output root, matching the S3 key layout in SURFACE_CONTRACT_V2 §1.1, plus a
`manifest.json` the stub API can serve `/available` from directly.

    python backend/scripts/interpolation/make_demo_cogs.py --source fit
    python backend/scripts/interpolation/make_demo_cogs.py --source golden --out demo/
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts.interpolation import tps                                  # noqa: E402
from scripts.interpolation.fastgrid import GridBasis, estimate_bytes    # noqa: E402
from scripts.interpolation.raster import (DEFAULT_MAX_Z_ERROR,  # noqa: E402
                                          RasterTemplate, grid_from_csv, write_cog)

REPO = Path(__file__).resolve().parents[3]
EXAMPLES = REPO / "backend" / "models" / "example data"
GOLDEN = REPO / "docs" / "models"

# Carried over verbatim from Spline_Temp_V1.7.py via parity_check.py.
PROBLEM_STATIONS = [4677, 37002, 38102]
LAPSE_RATE = 0.6
VARIABLE = "temp_mean"
MODEL_VERSION = "tps-2.0.0-ridge"

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("demo")


def date_from_key(key: str) -> date:
    d, m, y = key.split("_")
    return date(int(y), int(m), int(d))


def load_station_values(key: str) -> tuple[pd.DataFrame, str]:
    """One date's station observations joined to the CLIFLO metadata."""
    values = pd.read_csv(EXAMPLES / f"{key}.csv")
    meta = pd.read_csv(EXAMPLES / "CLIFLO_RAW_Temp_Daily.csv")
    vc = values.columns[1]
    s = values.merge(meta, how="left", left_on="Station", right_on="Agent Number")
    s = s.replace({"-": np.nan, "-9999": np.nan})
    s = s.dropna(subset=["Longitude", "Latitude", vc])
    s = s[~s["Station"].isin(PROBLEM_STATIONS)]
    return s.rename(columns={"Latitude": "latitude", "Longitude": "longitude",
                             "Height": "elevation", "Station": "station_id"}), vc


def out_path(root: Path, valid: date, granularity: str = "daily") -> Path:
    return (root / "surfaces" / VARIABLE / granularity
            / f"{valid.year}" / f"{valid.isoformat()}.tif")


def run_golden(root: Path, keys: list[str]) -> list[dict]:
    """Re-wrap the on-prem 5 km output. Format conversion only."""
    written = []
    template = None
    for key in keys:
        df = pd.read_csv(GOLDEN / f"VCSN_gridded_output_{key}.csv")
        col = next(c for c in df.columns if c.startswith("Adjusted_"))
        if template is None:
            template = RasterTemplate.build(df["Latitude"].to_numpy(float),
                                            df["Longitude"].to_numpy(float))
            log.info("raster %d x %d @ %.4f deg (~%d m), %d land cells",
                     template.height, template.width, template.yres,
                     template.resolution_m, len(template.flat_index))
        valid = date_from_key(key)
        p = out_path(root, valid)
        write_cog(p, template.to_raster(df[col].to_numpy(float)), template,
                  tags={"variable": VARIABLE, "valid_at": valid.isoformat(),
                        "unit": "C", "granularity": "daily",
                        "resolution_m": template.resolution_m,
                        "model_version": "onprem-spline-temp-1.7",
                        "engine": "legacy", "contract_version": "v2",
                        "source": "on-prem golden fixture, format conversion only"})
        written.append({"valid_at": valid.isoformat(), "path": str(p.relative_to(root)),
                        "resolution_m": template.resolution_m, "cv_rmse": None,
                        "bytes": p.stat().st_size})
        log.info("  %s -> %s (%.1f MB)", key, p.name, p.stat().st_size / 1e6)
    return written


def run_fit(root: Path, keys: list[str], grid_csv: Path, dtype) -> list[dict]:
    """Refit with the ridge engine and evaluate at the grid's own resolution."""
    grid = grid_from_csv(grid_csv)
    template = RasterTemplate.build(grid["latitude"].to_numpy(float),
                                    grid["longitude"].to_numpy(float))
    log.info("raster %d x %d @ %.4f deg (~%d m), %d land cells",
             template.height, template.width, template.yres,
             template.resolution_m, len(template.flat_index))

    frames = {k: load_station_values(k) for k in keys}
    union = (pd.concat([s[["station_id", "latitude", "longitude", "elevation"]]
                        for s, _ in frames.values()])
             .drop_duplicates("station_id").reset_index(drop=True))
    log.info("union of %d stations across %d dates (per-date %d-%d)",
             len(union), len(keys), min(len(s) for s, _ in frames.values()),
             max(len(s) for s, _ in frames.values()))
    log.info("basis will be %.2f GB (%s)",
             estimate_bytes(len(grid), len(union), dtype) / 1e9,
             np.dtype(dtype).name)

    t0 = time.perf_counter()
    basis = GridBasis.build(grid, union, dtype=dtype)
    log.info("basis built in %.1f s; origin %.4f, %.4f",
             time.perf_counter() - t0, basis.lat0, basis.lon0)

    # --- fit every date, collecting coefficients into one matrix -------------
    t0 = time.perf_counter()
    coeffs = np.zeros((basis.n_stations + 3, len(keys)), dtype=basis.B.dtype)
    stats = []
    for j, key in enumerate(keys):
        stations, vc = frames[key]
        fit = tps.fit_surface(stations, vc, lapse_rate=LAPSE_RATE, engine="ridge",
                              origin=(basis.lat0, basis.lon0))
        cols = basis.index_of(fit.fit_stations["station_id"].tolist())
        coeffs[:, j] = basis.coefficient_vector(cols, fit.model.c, fit.model.d)
        stats.append({"valid_at": date_from_key(key).isoformat(),
                      "cv_rmse": fit.cv_rmse, "n_fit": fit.n_fit,
                      "edf_fraction": fit.edf_fraction, "lam": fit.smoothing})
    t_fit = time.perf_counter() - t0
    log.info("%d fits in %.1f s (%.0f ms each)", len(keys), t_fit,
             1000 * t_fit / len(keys))

    # --- one GEMM for every surface -----------------------------------------
    t0 = time.perf_counter()
    values = basis.project(coeffs, lapse_rate=LAPSE_RATE)
    t_gemm = time.perf_counter() - t0
    log.info("projected %d surfaces in %.2f s (%.1f ms each)", len(keys), t_gemm,
             1000 * t_gemm / len(keys))

    written = []
    t0 = time.perf_counter()
    for j, (key, st) in enumerate(zip(keys, stats)):
        valid = date_from_key(key)
        p = out_path(root, valid)
        write_cog(p, template.to_raster(values[:, j]), template,
                  max_z_error=DEFAULT_MAX_Z_ERROR[VARIABLE],
                  tags={"variable": VARIABLE, "valid_at": valid.isoformat(),
                        "unit": "C", "granularity": "daily",
                        "resolution_m": template.resolution_m,
                        "model_version": MODEL_VERSION, "engine": "ridge",
                        "contract_version": "v2", "lapse_rate_c_per_100m": LAPSE_RATE,
                        "cv_rmse": round(st["cv_rmse"], 4), "n_stations": st["n_fit"],
                        "projection_origin": f"{basis.lat0:.5f},{basis.lon0:.5f}"})
        written.append({**st, "path": str(p.relative_to(root)),
                        "resolution_m": template.resolution_m,
                        "bytes": p.stat().st_size})
        log.info("  %s -> %s (%.1f MB, cv_rmse %.3f)", key, p.name,
                 p.stat().st_size / 1e6, st["cv_rmse"])
    log.info("wrote %d COGs in %.1f s", len(keys), time.perf_counter() - t0)
    return written


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", choices=["golden", "fit"], default="fit")
    ap.add_argument("--grid", default=str(EXAMPLES / "VCDN_500m.csv"),
                    help="grid CSV for --source fit (default: the 500 m grid)")
    ap.add_argument("--out", default=str(REPO / "scratchpad" / "demo_surfaces"))
    ap.add_argument("--dtype", choices=["float32", "float64"], default="float64")
    ap.add_argument("--limit", type=int, help="only the first N dates")
    args = ap.parse_args()

    keys = sorted((p.stem for p in EXAMPLES.glob("01_01_*.csv")),
                  key=lambda k: date_from_key(k))
    if args.limit:
        keys = keys[:args.limit]
    root = Path(args.out)

    t0 = time.perf_counter()
    if args.source == "golden":
        written = run_golden(root, keys)
    else:
        written = run_fit(root, keys, Path(args.grid), getattr(np, args.dtype))
    elapsed = time.perf_counter() - t0

    res = written[0]["resolution_m"]
    manifest = {
        "variable": VARIABLE, "unit": "C", "granularity": "daily",
        "contract_version": "v2", "source": args.source,
        "model_version": MODEL_VERSION if args.source == "fit" else "onprem-spline-temp-1.7",
        "first": written[0]["valid_at"], "last": written[-1]["valid_at"],
        "resolutions": [res],
        # The fixture is one date per year, so almost everything between them is
        # a gap. That is a feature for the stub: contract 5.3 requires the
        # time-scrubber to grey out missing dates, and this forces the issue.
        "gaps": [f"{a['valid_at']}/{b['valid_at']}"
                 for a, b in zip(written, written[1:])],
        "surfaces": written,
    }
    (root / "manifest.json").write_text(json.dumps(manifest, indent=2))
    total = sum(w["bytes"] for w in written)
    log.info("%d surfaces, %.1f MB total, %.1f s -> %s",
             len(written), total / 1e6, elapsed, root)
    log.info("manifest: %s", root / "manifest.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
