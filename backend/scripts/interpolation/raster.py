"""Scatter interpolated land cells onto a regular raster and write COGs.

Both national grids are regular in lat/lon, and both are land-masked:

    VCDN_5km    11,491 cells    0.0500 deg    257 x 241 =    61,937   18.6% land
    VCDN_500m 1,438,684 cells   0.0045 deg   2854 x 2667 = 7,611,618  18.9% land

Two things follow.

**Interpolate the land cells, not the raster.** Evaluating the full 500 m
rectangle would be 5.3x the work for cells that are all ocean. The spline is
evaluated on the 1.44M land cells and scattered into the rectangle afterwards,
with NoData everywhere else — which is also what makes `GridBasis` fit in
memory at all.

**The scatter is a precomputed index.** Grid geometry never changes, so the
land-cell-to-raster-offset mapping is computed once by `RasterTemplate.build`
and then reused for every surface in the archive: a flat `np.put`, no search.

Written as COG (GDAL's own driver, so tiling, overviews and the layout the
format requires are handled rather than approximated). Contract §2 pins the
rest — see `docs/plans/SURFACE_CONTRACT_V2.md`.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

NODATA = np.float32(-9999.0)


def _configure_proj() -> None:
    """Point PROJ and GDAL at rasterio's own data, not another install's.

    This workstation has a PostGIS 3.5 install that sets machine-level
    `PROJ_LIB` and `GDAL_DATA`. Those win over rasterio's bundled copies, and
    the PostGIS `proj.db` is an older schema:

        PROJ: proj_create_from_database: ...postgis-3.5\\proj\\proj.db contains
        DATABASE.LAYOUT.VERSION.MINOR = 2 whereas a number >= 6 is expected.

    Every CRS lookup then fails, so the COG comes out without a usable spatial
    reference — and it fails as a log line from GDAL, not an exception, which
    is the dangerous part: the file is written and looks fine until something
    downstream tries to reproject it.

    Overridden here rather than in a shell profile so a run cannot silently
    depend on how the terminal was launched. Set `AUXEIN_KEEP_PROJ_ENV=1` if
    you deliberately want the system PROJ.
    """
    if os.environ.get("AUXEIN_KEEP_PROJ_ENV"):
        return
    try:
        import rasterio
    except ImportError:
        return
    base = Path(rasterio.__file__).parent
    for var, sub in (("PROJ_LIB", "proj_data"), ("PROJ_DATA", "proj_data"),
                     ("GDAL_DATA", "gdal_data")):
        bundled = base / sub
        if bundled.is_dir() and os.environ.get(var) != str(bundled):
            if os.environ.get(var):
                logger.debug("overriding %s=%s with rasterio's %s",
                             var, os.environ[var], bundled)
            os.environ[var] = str(bundled)


def _infer_step(values: np.ndarray, label: str) -> float:
    """Cell size from the distinct coordinates, rejecting irregular grids."""
    uniq = np.unique(np.round(values, 9))
    if len(uniq) < 2:
        raise ValueError(f"{label} has fewer than two distinct values")
    diffs = np.diff(uniq)
    step = float(np.median(diffs))
    # A land mask leaves gaps in the sequence, so only reject when a spacing is
    # not a near-integer multiple of the step — that is what irregular means here.
    mult = diffs / step
    if np.abs(mult - np.round(mult)).max() > 1e-3:
        raise ValueError(f"{label} is not on a regular lattice (step {step:g}, "
                         f"worst residual {np.abs(mult - np.round(mult)).max():.3g})")
    return step


@dataclass
class RasterTemplate:
    """Geometry of the output raster plus the land-cell scatter index."""

    height: int
    width: int
    west: float                  # outer edge of the leftmost column
    north: float                 # outer edge of the top row
    xres: float                  # degrees per column, positive
    yres: float                  # degrees per row, positive (north-up)
    flat_index: np.ndarray       # (n_land,) offsets into a flattened raster

    @property
    def transform(self):
        _configure_proj()
        from rasterio.transform import from_origin
        return from_origin(self.west, self.north, self.xres, self.yres)

    @property
    def resolution_m(self) -> int:
        """Nominal metres per cell, from the latitude step. 0.0045 deg -> 500 m."""
        return int(round(self.yres * 110_574 / 10.0) * 10)

    @classmethod
    def build(cls, latitude: np.ndarray, longitude: np.ndarray) -> "RasterTemplate":
        lat = np.asarray(latitude, float)
        lon = np.asarray(longitude, float)
        xres = _infer_step(lon, "longitude")
        yres = _infer_step(lat, "latitude")

        west, east = lon.min(), lon.max()
        south, north = lat.min(), lat.max()
        width = int(round((east - west) / xres)) + 1
        height = int(round((north - south) / yres)) + 1

        col = np.round((lon - west) / xres).astype(np.int64)
        row = np.round((north - lat) / yres).astype(np.int64)
        if col.min() < 0 or col.max() >= width or row.min() < 0 or row.max() >= height:
            raise ValueError("land cells fall outside the derived raster bounds")

        flat = row * width + col
        if len(np.unique(flat)) != len(flat):
            raise ValueError("two land cells map to the same raster pixel; the "
                             "grid is finer than the inferred cell size")

        return cls(height=height, width=width,
                   west=west - xres / 2.0, north=north + yres / 2.0,
                   xres=xres, yres=yres, flat_index=flat)

    def to_raster(self, values: np.ndarray, nodata: float = NODATA) -> np.ndarray:
        """Scatter (n_land,) land values into a (height, width) float32 raster."""
        values = np.asarray(values)
        if values.shape[0] != len(self.flat_index):
            raise ValueError(f"expected {len(self.flat_index):,} land values, "
                             f"got {values.shape[0]:,}")
        out = np.full(self.height * self.width, nodata, dtype=np.float32)
        np.put(out, self.flat_index, values.astype(np.float32, copy=False))
        return out.reshape(self.height, self.width)


# Quantisation tolerance per variable, in the variable's own unit. These are
# LERC's `max_z_error`: the codec guarantees no cell moves further than this.
#
# Chosen against the accuracy the surfaces actually carry, not against float32.
# Temperature publishes cv_rmse ~1.1 degC, so 0.01 degC is under 1% of the
# stated uncertainty and about a seventh of the 0.078 degC ambiguity already
# present in the 500 m grid's duplicated cells. Rainfall's MAE is ~1.9 mm and
# 27.9 mm on heavy-rain days, so 0.05 mm is likewise far inside the noise.
#
# Measured on a national 500 m temperature surface (2856 x 2667, 18.8% land):
#
#   DEFLATE predictor=3  float32  lossless  5.50 MB   934 ms   161 GB archive
#   ZSTD    predictor=3  float32  lossless  5.19 MB   699 ms   152 GB
#   int16 x0.01 + ZSTD            0.005     2.30 MB   433 ms    67 GB
#   LERC_DEFLATE 0.001            0.001     2.92 MB   507 ms    85 GB
#   LERC_DEFLATE 0.01             0.01      2.05 MB   460 ms    60 GB   <-- default
#
# int16 writes and reads marginally faster, but it needs a per-variable
# scale/offset (rainfall at 0.01 mm overflows int16 above 327 mm) and every
# consumer has to apply it. LERC carries its own tolerance and works unchanged
# across variables.
DEFAULT_MAX_Z_ERROR = {"temp_mean": 0.01, "temp_min": 0.01, "temp_max": 0.01,
                       "rainfall": 0.05, "rh": 0.05, "pet": 0.01}


def write_cog(
    path: str | Path,
    raster: np.ndarray,
    template: RasterTemplate,
    *,
    nodata: float = NODATA,
    compress: str = "LERC_DEFLATE",
    max_z_error: Optional[float] = 0.01,
    predictor: int = 3,
    tags: Optional[dict] = None,
    overview_levels=(2, 4, 8, 16),
) -> Path:
    """Write one surface as a Cloud-Optimised GeoTIFF in EPSG:4326.

    Defaults to LERC at a 0.01-unit tolerance — see `DEFAULT_MAX_Z_ERROR` for
    the measurements. Pass `compress="DEFLATE", max_z_error=None` for a
    bit-exact float32 file; that costs 2.7x the bytes and twice the write time,
    and buys precision two orders of magnitude below the published cv_rmse.

    `predictor=3` (float) or `2` (integer) applies only to the lossless codecs;
    LERC ignores it.

    `tags` become GeoTIFF metadata. Contract §2.1 requires the provenance set
    (variable, valid_at, model_version, cv_rmse, resolution_m, ...) to travel
    inside the file, so a COG pulled from S3 in isolation still says what it is
    and how accurate it claims to be. The quantisation is recorded alongside,
    because a consumer differencing two surfaces should know the floor.
    """
    _configure_proj()
    import rasterio

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    lossy = compress.upper().startswith("LERC")
    profile = {
        "driver": "COG", "dtype": "float32", "nodata": nodata,
        "width": template.width, "height": template.height, "count": 1,
        "crs": "EPSG:4326", "transform": template.transform,
        "compress": compress,
        "blocksize": 512, "overview_resampling": "average",
        "overview_count": len(overview_levels),
    }
    if lossy:
        if max_z_error is None:
            raise ValueError("LERC needs an explicit max_z_error")
        profile["max_z_error"] = max_z_error
    else:
        profile["predictor"] = predictor

    meta = dict(tags or {})
    meta["quantisation"] = f"lerc_max_z_error={max_z_error}" if lossy else "lossless_float32"

    with rasterio.open(path, "w", **profile) as dst:
        dst.write(raster, 1)
        dst.update_tags(**{k: str(v) for k, v in meta.items()})
    return path


def grid_from_csv(path: str | Path, *, dedupe: bool = True,
                  decimals: int = 6) -> pd.DataFrame:
    """Load a VCDN grid CSV into the column names the interpolation code uses.

    `VCDN_500m.csv` contains **8,740 duplicated cells** — 17,480 of its
    1,438,684 rows share a coordinate with exactly one other row, leaving
    1,429,944 distinct cells (0.6% redundancy). It looks like a coastline
    digitising artefact: they cluster in the Marlborough Sounds and around
    Wellington, where an overlapping polygon boundary would double-count.

    The duplicates are not identical. They carry *different elevations* —
    median 1 m apart, worst 13 m — so at 0.6 degC/100 m they disagree about the
    retrended temperature of the same square by up to 0.078 degC (median 0.006).
    Small, but it means the value in the output raster would otherwise be
    decided by row order.

    `dedupe` therefore collapses them on rounded coordinates, averaging the
    elevation, which bounds the error at half the disagreement (worst 0.039
    degC) instead of leaving it to chance. It also removes 0.6% of the work.
    Pass `dedupe=False` to see the raw file; `RasterTemplate.build` will then
    reject it, which is the intended behaviour — a silent last-write-wins is
    the failure mode this codebase keeps having to design against.
    """
    g = pd.read_csv(path)
    g = g.rename(columns={"Latitude": "latitude", "Longitude": "longitude",
                          "Elevation": "elevation"})
    keep = ["latitude", "longitude", "elevation"]
    missing = set(keep) - set(g.columns)
    if missing:
        raise ValueError(f"{path} is missing columns {sorted(missing)}")
    g = g.dropna(subset=keep).reset_index(drop=True)

    if dedupe:
        before = len(g)
        key = [g["latitude"].round(decimals), g["longitude"].round(decimals)]
        grouped = g.groupby(key, sort=False, as_index=False).agg(
            latitude=("latitude", "first"), longitude=("longitude", "first"),
            elevation=("elevation", "mean"), _n=("elevation", "size"),
            _lo=("elevation", "min"), _hi=("elevation", "max"))
        n_dup = int((grouped["_n"] > 1).sum())
        if n_dup:
            worst = float((grouped["_hi"] - grouped["_lo"]).max())
            logger.warning(
                "grid %s: collapsed %d duplicated cells (%d -> %d rows, %.1f%%); "
                "elevation disagreement up to %.0f m == %.3f degC at 0.6/100m, "
                "resolved by averaging",
                Path(path).name, n_dup, before, len(grouped),
                100 * (before - len(grouped)) / before, worst, worst / 100 * 0.6)
        g = grouped[keep].reset_index(drop=True)
    return g
