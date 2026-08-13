"""Precomputed grid basis — the thing that makes a 40-year daily backfill possible.

`tps.evaluate_on_grid` costs 10.7 s per surface on the national 500 m grid
(1,438,684 land cells, ~190 stations, measured on an i5-8400). At 29,220
surfaces — daily temperature and rainfall from 1986 — that is **88 hours**, and
essentially all of it is wasted:

    _cdist       (build the distance matrix)   4.7 s
    _thin_plate  (r^2 log r over 273M entries) 5.7 s
    K @ c        (the actual prediction)       0.1 s   <-- 1%

The kernel block Phi(grid, stations) depends only on grid coordinates and
station coordinates. It does not depend on the observed values, on lambda, or on
the date. Every one of those 29,220 surfaces rebuilds a matrix identical to the
one before it, to do 0.1 s of arithmetic with it.

So build it once:

    grid_pred = Phi(G, X) @ c + [1, x, y] @ d  ==  B @ [c; d]

with `B = [Phi(G, X_union) | 1 | x | y]` of shape (M, n+3). Each date then costs
one matrix-vector product, and a *batch* of dates costs one GEMM — which is
compute-bound and hits BLAS peak, where a lone matvec is bandwidth-bound and
does not. Measured on the same machine at 500 m:

    batch    1 date     58.4 ms/surface     14.8 GFLOP/s
    batch    8 dates    27.5 ms/surface     31.4 GFLOP/s
    batch   32 dates    13.3 ms/surface     64.8 GFLOP/s
    batch  128 dates     4.9 ms/surface    176.3 GFLOP/s
    batch  365 dates     2.8 ms/surface    304.9 GFLOP/s

10.7 s to 2.8 ms is a factor of ~3,800 on the evaluation, which moves the whole
job's bottleneck onto the per-date *fit* (~140 ms) and then onto writing the
files. Batch a year at a time: the basis is read once per batch, so small
batches waste bandwidth re-reading a 1.7 GB array.

TWO PROPERTIES MAKE THIS EXACT RATHER THAN AN APPROXIMATION.

**1. Union columns with zero-padded coefficients.** Different dates have
different stations reporting. Rather than one basis per station set, build one
basis over the *union* of every station in the run and zero the coefficients of
those not reporting:

    sum_{j in union} Phi_ij * c_padded_j  ==  sum_{j in subset} Phi_ij * c_j

because c_padded is zero off the subset. Verified against the existing
`evaluate_on_grid` on five golden dates: worst difference **3.2e-11 degC**. The
cost is arithmetic on zero columns — at a 297-station union against 151-196
reporting, about 35% waste, which is nothing against a 3,800x saving.

**2. A fixed projection origin.** `tps.project_km` scales longitude by
cos(lat0), so an origin that moves with the reporting stations' centroid changes
the metric, and hence the distances, and hence B. Pinning the origin (default:
the grid centroid) is therefore a real change to the model, not a refactor, and
it was measured over the 15 golden dates:

    surface difference   mean 0.011 degC, max 0.72 degC on one date (1994)
    cv_rmse              median 1.1055 -> 1.1055  (-0.01%)

Accuracy is unmoved. The single date with a large max difference is the flat-GCV
behaviour already documented in `INTERPOLATION_BENCHMARK_2026-08-04.md`: the
criterion is nearly flat near its optimum, so a small coordinate change can tip
the argmin to a neighbouring lambda. Both choices score the same (cv_rmse 1.2021
vs 1.2018), so this is two equally good surfaces, not a better and a worse one.

A fixed origin is arguably the more correct choice for a climate series anyway.
With a per-date centroid, the projection wobbles according to which stations
happened to report that morning, so a difference between two years carries a
projection artefact on top of the climate signal. Comparability across dates is
the entire point of a 40-year archive.

FLOAT32. Storing B in float32 halves memory and roughly doubles GEMM
throughput. Measured against float64 over the 15 golden dates at 5 km: max
0.023 degC, mean 0.0006, p99 0.005. That is ~2% of the 1.28 degC cv_rmse the
surfaces actually carry, so it is defensible — but it is not free, and float64
costs nothing noticeable while the per-date fit dominates. **Use float64 while
it fits and float32 only when it does not**, which at 1.44M cells means about
1,000 stations (11.5 GB against 5.8 GB). `estimate_bytes` tells you which.

The `centre` option subtracts each row's mean kernel value. This is free and
exact — the thin-plate side condition P^T c = 0 forces sum_j c_j = 0, so a
per-row constant contributes nothing — and it shrinks the dynamic range, which
improves float32 mean error by ~22% and p99 by ~20%. It does not improve the
worst case, which comes from accumulation over ~300 terms rather than from
range.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Sequence

import numpy as np
import pandas as pd

from .tps import DEFAULT_LAPSE_RATE, project_km

logger = logging.getLogger(__name__)

# Read the basis once per batch, not once per surface. 365 keeps a year of
# float32 output at 2.1 GB on the 500 m grid, which is the largest that leaves
# headroom on a 16 GB machine. See the table in the module docstring.
DEFAULT_BATCH = 365


def thin_plate_sq(d2: np.ndarray, out: Optional[np.ndarray] = None) -> np.ndarray:
    """phi(r) = r^2 log(r) computed from *squared* distances as 0.5 d2 log(d2).

    Two savings over `tps._thin_plate`, which takes r and is the hot loop at
    grid scale:

    * no `sqrt` over the whole matrix — the kernel is a function of d2 alone,
      and the sqrt in `tps._cdist` exists only because that helper returns
      distances;
    * no boolean fancy-indexing. `out[nz] = r[nz]**2 * log(r[nz])` materialises
      a compacted copy of every masked operand; at 273M entries each of those
      is 2.2 GB. `np.log(..., where=)` writes into a provided buffer instead.

    `out` MUST NOT alias `d2`: the product needs `d2` and `log(d2)` live at the
    same time, so writing the log over the input silently computes log(d2)^2 —
    a different, much flatter kernel that still fits and still reports healthy
    statistics, because the published `cv_rmse` is computed by `tps` and never
    touches this function. It only corrupts the grid. Aliasing is rejected
    rather than tolerated for exactly that reason.
    """
    if out is d2:
        raise ValueError(
            "out must not alias d2: the product needs both d2 and log(d2), so "
            "writing the log over the input computes log(d2)^2 instead")
    if out is None:
        out = np.empty_like(d2)
    np.maximum(d2, 0.0, out=d2)
    nz = d2 > 0
    np.log(d2, out=out, where=nz)
    np.multiply(d2, out, out=out)
    out *= 0.5
    out[~nz] = 0.0
    return out


def estimate_bytes(n_cells: int, n_stations: int, dtype=np.float64) -> int:
    """Bytes a basis will occupy. Check this before building one."""
    return int(n_cells) * (int(n_stations) + 3) * np.dtype(dtype).itemsize


@dataclass
class GridBasis:
    """`[Phi(grid, union_stations) | 1 | x | y]`, built once, reused per date.

    `station_ids` gives the column order: column j holds the kernel against
    station `station_ids[j]`. `index_of` maps a date's reporting stations onto
    those columns.
    """

    B: np.ndarray                    # (M, n+3), possibly a read-only memmap
    station_ids: np.ndarray          # (n,) union station identifiers
    lat0: float
    lon0: float
    elevation: np.ndarray            # (M,) for the lapse retrend
    latitude: np.ndarray             # (M,) kept for rasterisation
    longitude: np.ndarray            # (M,)
    centred: bool = True

    @property
    def n_cells(self) -> int:
        return self.B.shape[0]

    @property
    def n_stations(self) -> int:
        return self.B.shape[1] - 3

    def index_of(self, ids: Sequence) -> np.ndarray:
        """Column positions for `ids`. Raises if any station is not in the union."""
        lookup = {v: i for i, v in enumerate(self.station_ids.tolist())}
        try:
            return np.array([lookup[v] for v in ids], dtype=np.intp)
        except KeyError as exc:
            raise KeyError(
                f"station {exc.args[0]!r} is not in the basis union; rebuild the "
                f"basis over every station the run can use") from exc

    # -- construction -----------------------------------------------------
    @classmethod
    def build(
        cls,
        grid: pd.DataFrame,
        stations: pd.DataFrame,
        *,
        id_col: str = "station_id",
        lat_col: str = "latitude",
        lon_col: str = "longitude",
        elevation_col: str = "elevation",
        origin: Optional[tuple[float, float]] = None,
        dtype=np.float64,
        chunk_size: int = 100_000,
        centre: bool = True,
        out: Optional[np.ndarray] = None,
    ) -> "GridBasis":
        """Build the basis. O(M x n) once; everything downstream is a GEMM.

        `origin` defaults to the *grid* centroid rather than the station
        centroid, deliberately: the grid is the one thing that does not change
        between dates, so an origin derived from it is stable for the life of
        the archive.

        `out` accepts a preallocated array — pass `np.lib.format.open_memmap`
        to build straight to disk when the basis will not fit in RAM.
        """
        for name, df, cols in (("grid", grid, (lat_col, lon_col, elevation_col)),
                               ("stations", stations, (id_col, lat_col, lon_col))):
            missing = set(cols) - set(df.columns)
            if missing:
                raise ValueError(f"{name} is missing columns: {sorted(missing)}")

        glat = grid[lat_col].to_numpy(float)
        glon = grid[lon_col].to_numpy(float)
        gelev = grid[elevation_col].to_numpy(float)
        if not (np.isfinite(glat).all() and np.isfinite(glon).all()
                and np.isfinite(gelev).all()):
            raise ValueError("grid contains non-finite latitude/longitude/elevation; "
                             "drop those cells before building a basis")

        ids = stations[id_col].to_numpy()
        if len(np.unique(ids)) != len(ids):
            raise ValueError("stations contains duplicate ids; the union must be unique")
        slat = stations[lat_col].to_numpy(float)
        slon = stations[lon_col].to_numpy(float)

        lat0, lon0 = origin if origin is not None else (float(glat.mean()), float(glon.mean()))
        S = project_km(slat, slon, lat0, lon0)
        M, n = len(glat), len(ids)

        need = estimate_bytes(M, n, dtype)
        logger.info("building grid basis: %s cells x %s stations = %.2f GB (%s)",
                    f"{M:,}", n, need / 1e9, np.dtype(dtype).name)

        B = np.empty((M, n + 3), dtype=dtype) if out is None else out
        if B.shape != (M, n + 3):
            raise ValueError(f"out has shape {B.shape}, expected {(M, n + 3)}")

        s2 = (S ** 2).sum(1)
        for lo in range(0, M, chunk_size):
            hi = min(lo + chunk_size, M)
            G = project_km(glat[lo:hi], glon[lo:hi], lat0, lon0)
            d2 = (G ** 2).sum(1)[:, None] + s2[None, :] - 2.0 * (G @ S.T)
            K = thin_plate_sq(d2)          # must not write over d2 — see above
            if centre:
                K -= K.mean(axis=1, keepdims=True)
            B[lo:hi, :n] = K
            B[lo:hi, n] = 1.0
            B[lo:hi, n + 1:] = G

        return cls(B=B, station_ids=ids, lat0=lat0, lon0=lon0, elevation=gelev,
                   latitude=glat, longitude=glon, centred=centre)

    # -- persistence ------------------------------------------------------
    def save(self, directory: str | Path) -> Path:
        """Write to `directory` as a .npy plus sidecars, ready to memmap.

        Worth doing when several processes share one basis: each maps the same
        file read-only rather than holding its own multi-GB copy.
        """
        d = Path(directory)
        d.mkdir(parents=True, exist_ok=True)
        np.save(d / "basis.npy", self.B)
        np.savez(d / "geometry.npz", station_ids=self.station_ids,
                 elevation=self.elevation, latitude=self.latitude,
                 longitude=self.longitude)
        (d / "meta.json").write_text(json.dumps({
            "lat0": self.lat0, "lon0": self.lon0, "centred": self.centred,
            "n_cells": int(self.n_cells), "n_stations": int(self.n_stations),
            "dtype": np.dtype(self.B.dtype).name,
        }, indent=2))
        return d

    @classmethod
    def load(cls, directory: str | Path, mmap_mode: Optional[str] = "r") -> "GridBasis":
        d = Path(directory)
        meta = json.loads((d / "meta.json").read_text())
        geom = np.load(d / "geometry.npz", allow_pickle=True)
        return cls(B=np.load(d / "basis.npy", mmap_mode=mmap_mode),
                   station_ids=geom["station_ids"], lat0=meta["lat0"],
                   lon0=meta["lon0"], elevation=geom["elevation"],
                   latitude=geom["latitude"], longitude=geom["longitude"],
                   centred=meta["centred"])

    # -- evaluation -------------------------------------------------------
    def coefficient_vector(self, columns: np.ndarray, c: np.ndarray,
                           d: np.ndarray) -> np.ndarray:
        """Scatter one date's (c, d) into a union-width column vector."""
        v = np.zeros(self.n_stations + 3, dtype=self.B.dtype)
        v[columns] = c
        v[self.n_stations:] = d
        return v

    def project(self, coeffs: np.ndarray, *, retrend: bool = True,
                lapse_rate: float = DEFAULT_LAPSE_RATE) -> np.ndarray:
        """`B @ coeffs`, then lapse-retrend to each cell's elevation.

        `coeffs` is (n+3,) for one surface or (n+3, D) for a batch. Pass a batch
        — see the throughput table in the module docstring; a lone matvec runs
        at a twentieth of the GEMM's rate because it is bandwidth-bound.
        """
        coeffs = np.asarray(coeffs)
        if coeffs.shape[0] != self.n_stations + 3:
            raise ValueError(f"coeffs has {coeffs.shape[0]} rows, expected "
                             f"{self.n_stations + 3}")
        out = self.B @ coeffs.astype(self.B.dtype, copy=False)
        if retrend:
            shift = (self.elevation / 100.0 * lapse_rate).astype(out.dtype)
            out -= shift[:, None] if out.ndim == 2 else shift
        return out
