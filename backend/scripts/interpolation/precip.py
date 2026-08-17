"""
Rainfall surface interpolation via a climatological ratio.

Temperature interpolates well as a plain 2D spline because its spatial field is
smooth and its one large systematic gradient - elevation - is removed by a lapse
rate before fitting. Rainfall has neither property. Its field is dominated by
orography in a way no single lapse rate captures: on any given wet day the West
Coast can take 100 mm while Canterbury, 60 km east across the divide, takes
none. A spline fitted to raw depth has to invent that discontinuity from the
station values alone, and it cannot.

NIWA solved this for VCSN and published the result. Tait et al. (2006) fit their
daily rainfall spline with the **1951-80 mean annual rainfall surface** as the
covariate - a hand-drawn, expert-guided contour map - and showed it reduces error
more than using elevation does. HOTRUNZ (Neal et al., 2022) does the same thing
in a different formulation, interpolating anomalies against a baseline
climatology rather than raw values.

This module implements that idea in the ratio form:

    ratio(station, day) = rainfall(station, day) / MAR(station)
    interpolate ratio spatially
    rainfall(cell, day) = ratio(cell, day) * MAR(cell)

The climatology carries the orography. A rain-shadow boundary that the daily
spline could never resolve from ~500 stations is already baked into MAR, which
is estimated from years of record rather than one day of it. What the daily
spline then has to interpolate is the *departure* from the long-run pattern,
which is genuinely smoother.

We have no hand-drawn map, so MAR is estimated from our own station records and
interpolated in log space - see `ClimatologySurface` for why log.

WHAT THIS DOES NOT DO: rainfall never uses a lapse rate. Elevation enters only
through MAR. Dry-day handling is a separate, still-open problem - see
`WET_DAY_MM` and the `pop_threshold` option.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional, Sequence

import numpy as np
import pandas as pd

from scripts.interpolation.tps import (
    DEFAULT_GCV_GAMMA, DEFAULT_GCV_GUARD_EDF, DEFAULT_GCV_GUARD_GAMMA,
    DEFAULT_LAMBDA_GRID, fit_ridge_gcv, project_km, ridge_basis,
)

logger = logging.getLogger(__name__)

DAYS_PER_YEAR = 365.25

# A day is "wet" above this, matching Tait et al. (2012) so our contingency
# table is directly comparable to theirs.
WET_DAY_MM = 1.0

# Physical screening bounds for New Zealand.
#
# These are not tidiness - the network genuinely contains stations reporting a
# cumulative counter as though it were an interval depth, which produces station
# mean annual rainfalls in the hundreds of thousands of millimetres. One such
# station in the fit will drag a whole region's surface with it.
#
# Driest inhabited NZ (Alexandra, Central Otago) is ~330 mm/yr; wettest recorded
# (Cropp River, Hokitika catchment) is ~11,500 mm/yr with individual years above
# 14,000. NZ's highest recorded daily fall is 758 mm, also at Cropp.
NZ_MAR_MIN_MM = 250.0
NZ_MAR_MAX_MM = 15_000.0
NZ_DAILY_MAX_MM = 800.0

MIN_CLIMATOLOGY_DAYS = 365

# --- climatology conditioning ----------------------------------------------
# How an external climatology raster is prepared before the ratio method uses
# it. See `RasterClimatology` for the two LENZ defects these exist to remove.
#
# `DEFAULT_TARGET_RES_M` area-averages the raster onto the surface grid instead
# of point-sampling it. Nearest-neighbour sampling of a 100 m raster onto 500 m
# cells discarded 24 of every 25 source cells and aliased hardest exactly where
# the gradient is steepest. Measured cost: +0.04% MAE. It is a correctness fix
# and is on unconditionally.
#
# `DEFAULT_SMOOTH_KM` then low-passes. This one is NOT free and the number is a
# judgement, so the measurement it rests on is written out in full below rather
# than left in a scratch log.
#
# Measured 2026-08-17 by `precip_bakeoff.py`'s own fold structure — 158 days,
# 10-fold by station, 71,337 held-out station-days per arm — against the
# production point-sampled arm. Artifact columns are the Taranaki 5-10 km octant
# anisotropy and the Fox/Franz plateau ratio described in `RasterClimatology`.
#
#   MAR variant     Taranaki aniso   Fox plateau   MAR max    MAE cost
#   point (was)              1.79         3.46      11,121       (base)
#   block only               1.79         3.46      11,121      -0.01%
#   log 1 km                 1.70         3.28      10,728      +0.19%
#   log 2 km                 1.55         2.82      10,266      +0.67%
#   log 3 km  <- chosen      1.42         gone       9,631      +1.14%
#   log 5 km                 1.32         gone       8,260      +2.22%
#   log 8 km                 1.23         gone       7,302      +4.28%
#
# 3 km is the smallest setting that removes the Fox/Franz plateau outright while
# taking Taranaki most of the way to the ~1.1-1.3 a symmetric cone implies. It
# costs 1.14% of a covariate worth 11.2% over `raw`, and it BUYS back the two
# things this method is weakest at: all-day bias -0.184 -> -0.096 and heavy-rain
# (>=40 mm) bias -18.81 -> -18.55 mm. 5 km reaches physical isotropy but cuts
# MAR max to 8,260, distorting a genuine Southern Alps maximum (Cropp River
# really does take ~11,500 mm/yr), so it trades a real signal for a cosmetic win.
#
# Log space, not linear, because rainfall is multiplicative — the same reason
# `ClimatologySurface` fits in log space. It won at every sigma tested:
# +0.19/+0.67/+1.14 against linear's +0.25/+0.83/+1.41 at 1/2/3 km.
#
# Setting this to 0 restores the raw raster and reprints its fitting artefacts
# into every surface. That is a defensible choice only if someone has decided
# the artefacts are real; nothing measured so far supports that.
#
# **THE BAKE-OFF CANNOT SEE THE WHOLE EFFECT, so do not tune this on MAE alone.**
# Those figures are scored at station locations, where a climatology shift
# appears in numerator and denominator and largely cancels. On the GRID it does
# not: smoothing both sides of `grid_MAR / station_MAR` costs 4.7% of the
# national rainfall level, because gauges sit in sheltered locally-dry spots and
# a low-pass lifts station MAR +3.01% while grid MAR falls -0.66%. Production
# therefore smooths the GRID SIDE ONLY — see `run_history.run`'s docstring.
# Any future change here must be checked against the national grid level too.
DEFAULT_TARGET_RES_M = 500
DEFAULT_SMOOTH_KM = 3.0


# ---------------------------------------------------------------------------
# Climatology
# ---------------------------------------------------------------------------


def station_climatology(
    daily: pd.DataFrame,
    *,
    station_col: str = "station_id",
    value_col: str = "rainfall_mm",
    min_days: int = MIN_CLIMATOLOGY_DAYS,
) -> pd.DataFrame:
    """Per-station mean annual rainfall from a daily record.

    MAR is `mean daily depth x 365.25` rather than a mean of complete calendar
    years: almost no station in this network has a clean run of whole years, and
    scaling the daily mean uses every observation instead of discarding partial
    years. It assumes missing days are missing at random, which is not exactly
    true - telemetry outages cluster in storms - so `n_days` is returned for the
    caller to weight or gate on.
    """
    d = daily.dropna(subset=[value_col])
    g = d.groupby(station_col)[value_col]
    out = pd.DataFrame({
        "n_days": g.size(),
        "mean_daily_mm": g.mean(),
        "max_daily_mm": g.max(),
        "wet_day_frac": d.assign(_w=(d[value_col] >= WET_DAY_MM).astype(float))
                          .groupby(station_col)["_w"].mean(),
    })
    out["mar_mm"] = out["mean_daily_mm"] * DAYS_PER_YEAR
    return out[out["n_days"] >= min_days].reset_index()


def screen_climatology(
    clim: pd.DataFrame,
    *,
    mar_min: float = NZ_MAR_MIN_MM,
    mar_max: float = NZ_MAR_MAX_MM,
    daily_max: float = NZ_DAILY_MAX_MM,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Split stations into (usable, rejected) on physical plausibility.

    Returns the rejected rows with a `reject_reason` so a bad feed is visible
    rather than silently dropped. Screening is deliberately done on the
    *climatology*, not on individual days: a station whose whole record is a
    running total announces itself in its mean, and rejecting it once is far
    safer than trying to repair single values.
    """
    reason = pd.Series("", index=clim.index, dtype=object)
    reason[clim["mar_mm"] < mar_min] = "mar_below_nz_minimum"
    reason[clim["mar_mm"] > mar_max] = "mar_above_nz_maximum"
    reason[clim["max_daily_mm"] > daily_max] = "daily_above_nz_record"
    bad = reason != ""
    rejected = clim[bad].assign(reject_reason=reason[bad])
    if len(rejected):
        logger.warning("climatology screening rejected %d of %d stations: %s",
                       len(rejected), len(clim),
                       rejected["reject_reason"].value_counts().to_dict())
    return clim[~bad].copy(), rejected


class ClimatologySurface:
    """Mean annual rainfall interpolated to arbitrary points.

    Fitted in **log space**, for two reasons. MAR is strictly positive and a
    spline on raw values will happily predict negative rainfall in a gap between
    a wet and a dry station. And NZ rainfall gradients are multiplicative rather
    than additive - crossing the divide multiplies MAR by roughly five - so a
    log-space spline needs far less curvature to represent them, which is
    exactly what a roughness-penalised fit rewards.

    This stands in for NIWA's hand-drawn 1951-80 contour map. Ours is estimated
    from a few years of our own record, so it is noisier and shorter, but it is
    reproducible and it updates as the network grows.

    Predictions are clamped to the training range in log space. A thin-plate
    spline carries a linear polynomial term that grows without bound outside the
    convex hull of its data, and `exp` turns a modest linear excursion into an
    astronomical one - unclamped, this produced a station MAR of 1e20 mm. That
    is a different failure from the temperature engine's old range clip, which
    was compensating for an *unregularised* fit oscillating between stations:
    here the fit is properly penalised and the amplifier is the back-transform.
    Clamping in the space where the nonlinearity lives is the fix.
    """

    __slots__ = ("_model", "_lat0", "_lon0", "_lo", "_hi", "n_stations")

    def __init__(
        self,
        stations: pd.DataFrame,
        *,
        mar_col: str = "mar_mm",
        lat_col: str = "latitude",
        lon_col: str = "longitude",
        lambda_grid: Sequence[float] = DEFAULT_LAMBDA_GRID,
    ):
        df = stations.dropna(subset=[mar_col, lat_col, lon_col])
        df = df[df[mar_col] > 0]
        if len(df) < 4:
            raise ValueError(f"need >= 4 stations for a climatology, got {len(df)}")

        lat = df[lat_col].to_numpy(float)
        lon = df[lon_col].to_numpy(float)
        self._lat0, self._lon0 = float(lat.mean()), float(lon.mean())
        X = project_km(lat, lon, self._lat0, self._lon0)
        log_mar = np.log(df[mar_col].to_numpy(float))
        self._model = fit_ridge_gcv(X, log_mar, lambda_grid)
        self._lo = max(float(log_mar.min()), np.log(NZ_MAR_MIN_MM))
        self._hi = min(float(log_mar.max()), np.log(NZ_MAR_MAX_MM))
        self.n_stations = len(df)

    def __call__(self, points_deg: np.ndarray) -> np.ndarray:
        """MAR in mm at (lon, lat) points."""
        p = np.asarray(points_deg, dtype=float)
        X = project_km(p[:, 1], p[:, 0], self._lat0, self._lon0)
        return np.exp(np.clip(self._model(X), self._lo, self._hi))


class RasterClimatology:
    """MAR read from an external raster instead of fitted from our own stations.

    Built for the LENZ / NZEnvDS `Total annual precipitation v1.0` layer
    (Landcare Research, CC BY 4.0, 100 m, EPSG:27200), which is the digitised
    descendant of the 1951-80 expert rainfall mapping that Tait et al. (2006)
    used. It is the closest thing available to the climatology their method
    assumes, and unlike `ClimatologySurface` it is not estimated from the same
    few years of record we are trying to interpolate.

    Interface-compatible with `ClimatologySurface`, so it drops into
    `fit_precip_surface(climatology=...)` unchanged.

    **On leakage.** This is much weaker than the `*_true` arms, which use a
    held-out station's own test-period record, but it is not zero: LENZ was
    built from 1950-80 gauges, and some of those physical sites are still in our
    network today. So a LENZ arm may carry a little of a held-out station's own
    long-run rainfall. It cannot carry anything about the *days* being scored,
    which is what the fold structure protects. Treat a LENZ result as an
    achievable method, but not as fully independent validation.

    **On era.** LENZ is 1950-1980; our observations are 2020 onward. That gap is
    inherent to the method — Tait interpolated 1960-2004 daily rainfall against a
    1951-80 map — and it is why the ratio, not the absolute level, is what
    matters: a uniform scale error in MAR cancels exactly when you divide by it
    and multiply back.

    **ON CONDITIONING — why the raster is not used as shipped.** LENZ is a fitted
    surface descended from a 1:2,000,000 hand-drawn contour map, and at 100 m it
    carries structure that is an artefact of that fitting rather than observed
    orography. Two were measured on 2026-08-17:

      Mt Taranaki   an X-shaped caustic radiating from the summit. Rainfall on a
                    near-symmetric cone must be close to isotropic about it, yet
                    the 5-10 km annulus is 1.79x wetter in its wettest octant
                    than its driest, and the maximum sits NE when the moisture-
                    bearing flow is W/SW. At a FIXED elevation band MAR still
                    scatters 23%, so it is not a coherent function of the cone.

      Fox / Franz   a saturated plateau above ~10,000 mm/yr: the gradient inside
                    the zone is 3.0x GENTLER than on its rim. A real orographic
                    maximum is steepest near its peak, never flat-topped.

    Because the ratio method multiplies the fitted field by MAR, both defects are
    reprinted into every daily surface at full amplitude — and where stations are
    sparse the fitted ratio is locally flat, so the output there is little more
    than a rescaled copy of the climatology (measured corr 0.96-0.9995).

    So MAR is conditioned before use, by two steps that `smooth_km` controls:

      1. AREA-AVERAGE to `target_res_m`. A 500 m cell's mean annual rainfall is
         the mean over its footprint, not whichever 100 m pip the cell centre
         lands on. Point sampling discarded 24 of every 25 source cells. Measured
         cost in the bake-off: **+0.04% MAE — free**, so this is unconditional.
      2. GAUSSIAN LOW-PASS at `smooth_km`, in log space by default for the same
         multiplicative reason `ClimatologySurface` fits in log space.

    The ratio method needs MAR for the broad orographic structure the gauge
    network misses; it does not need 100 m detail, and 100 m detail is precisely
    where the defects live. Low-passing therefore discards the scales the method
    could never justify. It is not free beyond step 1 — see `DEFAULT_SMOOTH_KM`
    for the measured trade.
    """

    __slots__ = ("_path", "_ds", "_to_raster", "_nodata", "_fallback", "n_stations",
                 "_grid", "_inv", "smooth_km", "target_res_m", "log_space")

    def __init__(self, path, *, fallback=None, src_crs: str = "EPSG:4326",
                 smooth_km: float = DEFAULT_SMOOTH_KM,
                 target_res_m: Optional[int] = DEFAULT_TARGET_RES_M,
                 log_space: bool = True):
        from scripts.interpolation.raster import _configure_proj
        _configure_proj()
        import rasterio
        from pyproj import Transformer

        self._path = str(path)
        self._ds = rasterio.open(self._path)
        self._nodata = self._ds.nodata
        self._to_raster = Transformer.from_crs(src_crs, self._ds.crs, always_xy=True)
        self._fallback = fallback
        self.n_stations = 0                  # not station-derived; kept for symmetry
        self.smooth_km = float(smooth_km or 0.0)
        self.target_res_m = target_res_m
        self.log_space = bool(log_space)

        self._grid = None                    # conditioned array, or None to read raw
        self._inv = None
        if target_res_m or self.smooth_km:
            self._grid, self._inv = self._condition()

    # -- conditioning -------------------------------------------------------

    def _condition(self):
        """Area-average onto `target_res_m`, then low-pass at `smooth_km`.

        Both steps are NaN-aware (normalised convolution) so the coastline does
        not bleed zeros inland and the land mask is preserved exactly.
        """
        from rasterio.windows import Window
        from scipy.ndimage import gaussian_filter

        ds = self._ds
        native_m = abs(ds.transform.a)
        factor = max(1, int(round((self.target_res_m or native_m) / native_m)))
        H, W = (ds.height // factor) * factor, (ds.width // factor) * factor
        h5, w5 = H // factor, W // factor

        out = np.full((h5, w5), np.nan)
        step = max(factor, (2500 // factor) * factor)
        for r0 in range(0, H, step):
            nrows = min(step, H - r0)
            a = ds.read(1, window=Window(0, r0, W, nrows)).astype(float)
            a[~self._valid(a)] = np.nan
            ok = np.isfinite(a)
            rb = nrows // factor
            num = np.where(ok, a, 0.0).reshape(rb, factor, w5, factor).sum(axis=(1, 3))
            den = ok.reshape(rb, factor, w5, factor).sum(axis=(1, 3))
            out[r0 // factor: r0 // factor + rb] = np.where(
                den > 0, num / np.maximum(den, 1), np.nan)

        res_km = (native_m * factor) / 1000.0
        if self.smooth_km > 0:
            src = np.log(out) if self.log_space else out
            valid = np.isfinite(src).astype(float)
            filled = np.where(np.isfinite(src), src, 0.0)
            sig = self.smooth_km / res_km
            num = gaussian_filter(filled, sig, mode="nearest")
            den = gaussian_filter(valid, sig, mode="nearest")
            sm = np.where(den > 1e-3, num / np.maximum(den, 1e-9), np.nan)
            out = np.exp(sm) if self.log_space else sm
            out[~valid.astype(bool)] = np.nan     # keep the original land mask

        transform = ds.transform * ds.transform.scale(factor, factor)
        v = out[np.isfinite(out)]
        logger.info(
            "climatology conditioned: %d m -> %d m area average%s; "
            "%d valid cells, %.0f-%.0f mm/yr",
            int(native_m), int(native_m * factor),
            (f", gaussian {self.smooth_km:g} km"
             f"{' (log space)' if self.log_space else ''}")
            if self.smooth_km else "",
            v.size, v.min(), v.max())
        return out, ~transform

    def _valid(self, v: np.ndarray) -> np.ndarray:
        ok = np.isfinite(v) & (v > 0) & (v < 1e30)
        if self._nodata is not None:
            ok &= v != self._nodata
        return ok

    def _sample_grid(self, xs, ys) -> np.ndarray:
        """Read the conditioned in-memory grid at projected coordinates."""
        cols, rows = self._inv * (np.asarray(xs), np.asarray(ys))
        r = np.floor(rows).astype(int)
        c = np.floor(cols).astype(int)
        h, w = self._grid.shape
        inside = (r >= 0) & (r < h) & (c >= 0) & (c < w)
        out = np.full(len(r), np.nan)
        out[inside] = self._grid[r[inside], c[inside]]
        return out

    def _nearest_valid_grid(self, xs, ys, max_cells: int = 12) -> np.ndarray:
        """Nearest finite cell of the conditioned grid. `max_cells` is in
        conditioned cells, so 12 at 500 m is the same 6 km reach that 60 cells
        at 100 m gave."""
        cols, rows = self._inv * (np.asarray(xs), np.asarray(ys))
        h, w = self._grid.shape
        got = np.full(len(rows), np.nan)
        for i, (rf, cf) in enumerate(zip(rows, cols)):
            row, col = int(np.floor(rf)), int(np.floor(cf))
            for rad in (1, 4, max_cells):
                r0, r1 = max(0, row - rad), min(h, row + rad + 1)
                c0, c1 = max(0, col - rad), min(w, col + rad + 1)
                if r0 >= r1 or c0 >= c1:
                    continue
                blk = self._grid[r0:r1, c0:c1]
                ok = np.isfinite(blk)
                if not ok.any():
                    continue
                rr, cc = np.nonzero(ok)
                d2 = (rr + r0 - row) ** 2 + (cc + c0 - col) ** 2
                got[i] = blk[rr[d2.argmin()], cc[d2.argmin()]]
                break
        return got

    def __call__(self, points_deg: np.ndarray) -> np.ndarray:
        p = np.asarray(points_deg, dtype=float)
        xs, ys = self._to_raster.transform(p[:, 0], p[:, 1])
        if self._grid is not None:
            out = self._sample_grid(xs, ys)
        else:
            out = np.array([v[0] for v in self._ds.sample(list(zip(xs, ys)), 1)],
                           dtype=float)
        bad = ~self._valid(out)
        if bad.any():
            out[bad] = (self._nearest_valid_grid(xs[bad], ys[bad])
                        if self._grid is not None
                        else self._nearest_valid(xs[bad], ys[bad]))
        still = ~self._valid(out)
        if still.any():
            if self._fallback is None:
                raise ValueError(f"{still.sum()} point(s) fall outside the "
                                 f"climatology raster and no fallback was given")
            out[still] = self._fallback(p[still])
        return out

    def _nearest_valid(self, xs, ys, max_cells: int = 60) -> np.ndarray:
        """Nearest finite cell within `max_cells` — for coastal points that land
        just off the mask. NaN where none is found, so the fallback can take over."""
        from rasterio.windows import Window
        res = abs(self._ds.transform.a)
        got = np.full(len(xs), np.nan)
        for i, (x, y) in enumerate(zip(xs, ys)):
            row, col = self._ds.index(x, y)
            for rad in (5, 20, max_cells):
                r0, c0 = max(0, row - rad), max(0, col - rad)
                win = Window(c0, r0, 2 * rad + 1, 2 * rad + 1)
                try:
                    blk = self._ds.read(1, window=win, boundless=True,
                                        fill_value=self._nodata)
                except Exception:                                # noqa: BLE001
                    break
                ok = self._valid(blk)
                if not ok.any():
                    continue
                rr, cc = np.nonzero(ok)
                d2 = (rr + r0 - row) ** 2 + (cc + c0 - col) ** 2
                got[i] = blk[rr[d2.argmin()], cc[d2.argmin()]]
                break
        _ = res
        return got

    def close(self):
        self._ds.close()


# ---------------------------------------------------------------------------
# Daily surfaces
# ---------------------------------------------------------------------------

RAW = "raw"                 # what Spline_Precip_V1.py does today
SQRT = "sqrt"               # variance-stabilising transform, no covariate
RATIO = "ratio"             # Tait et al. 2006, in ratio form
RATIO_SQRT = "ratio_sqrt"   # both
METHODS = (RAW, SQRT, RATIO, RATIO_SQRT)


@dataclass
class PrecipSurface:
    """A fitted daily rainfall surface. Call `predict` with (lon, lat) degrees."""
    method: str
    n_fit: int
    smoothing: float
    edf: float
    _model: object = field(repr=False)
    _lat0: float = field(repr=False)
    _lon0: float = field(repr=False)
    _scale: float = field(repr=False)
    _y_hi: float = field(repr=False)
    _climatology: Optional[ClimatologySurface] = field(repr=False, default=None)
    _pop_model: object = field(repr=False, default=None)
    _pop_threshold: Optional[float] = field(repr=False, default=None)

    def predict(self, points_deg: np.ndarray,
                climatology_mm: Optional[np.ndarray] = None) -> np.ndarray:
        """Rainfall in mm at (lon, lat) points.

        `climatology_mm` overrides the fitted climatology surface at these
        points. In production it is never passed — the whole point is that an
        ungauged cell has no MAR of its own. It exists so `precip_bakeoff.py`
        can measure the method's ceiling by deliberately leaking the held-out
        station's true MAR, which separates "the ratio idea is wrong" from "our
        climatology is not good enough yet".
        """
        p = np.asarray(points_deg, dtype=float)
        X = project_km(p[:, 1], p[:, 0], self._lat0, self._lon0)

        # Clamp in the TRANSFORMED space, before any back-transform. Squaring or
        # multiplying by a climatology turns an out-of-hull linear excursion into
        # a physically impossible depth; bounding the spline's own output to the
        # range it was fitted on is what stops that. Unlike the temperature
        # engine's old clip this is not propping up an unregularised fit - it
        # bounds a back-transform the penalty cannot see.
        z = np.clip(self._model(X), 0.0, self._y_hi) * self._scale

        if self.method in (SQRT, RATIO_SQRT):
            z = np.square(z)
        if self.method in (RATIO, RATIO_SQRT):
            z = z * (self._climatology(p) if climatology_mm is None
                     else np.asarray(climatology_mm, dtype=float))

        out = np.clip(z, 0.0, NZ_DAILY_MAX_MM)   # non-negative, and physical

        if self._pop_model is not None:
            dry = (self._pop_model(X) * 1.0) < self._pop_threshold
            out = np.where(dry, 0.0, out)
        return out


def fit_precip_surface(
    stations: pd.DataFrame,
    value_col: str,
    *,
    method: str = RATIO,
    climatology: Optional[ClimatologySurface] = None,
    mar_col: str = "mar_mm",
    lat_col: str = "latitude",
    lon_col: str = "longitude",
    lambda_grid: Sequence[float] = DEFAULT_LAMBDA_GRID,
    gcv_gamma: float = DEFAULT_GCV_GAMMA,
    gcv_guard_edf: Optional[float] = DEFAULT_GCV_GUARD_EDF,
    gcv_guard_gamma: float = DEFAULT_GCV_GUARD_GAMMA,
    pop_threshold: Optional[float] = None,
    basis=None,
) -> PrecipSurface:
    """Fit one day's rainfall surface.

    `method`:
      `raw`        spline on depth. The current behaviour, kept as the baseline.
      `sqrt`       spline on sqrt(depth), squared back. Daily rainfall is heavily
                   right-skewed; the transform stabilises variance and, with the
                   non-negativity clamp, stops the fit predicting negative rain.
      `ratio`      spline on depth / MAR, multiplied back by MAR at the target.
      `ratio_sqrt` both.

    `climatology` is required for the ratio methods. **It must be fitted from
    the same stations as this surface** - in cross-validation, from the training
    fold only. Using a held-out station's own MAR leaks years of its record into
    its own prediction and will make the method look far better than it is.

    `pop_threshold`, if set, additionally interpolates a wet/dry indicator and
    zeroes cells whose interpolated probability of rain falls below it.

    `basis` is a pre-computed `ridge_basis` over the same station coordinates —
    see `fit_ridge_gcv`. Fitting a year of days over one station set, that turns
    an O(n^3) per day into O(n^3) once.
    """
    if method not in METHODS:
        raise ValueError(f"unknown method {method!r}; expected one of {METHODS}")
    if method in (RATIO, RATIO_SQRT) and climatology is None:
        raise ValueError(f"method {method!r} requires a climatology")

    need = [value_col, lat_col, lon_col] + ([mar_col] if method in (RATIO, RATIO_SQRT) else [])
    df = stations.dropna(subset=need).copy()
    if len(df) < 4:
        raise ValueError(f"need >= 4 stations to fit, got {len(df)}")

    lat = df[lat_col].to_numpy(float)
    lon = df[lon_col].to_numpy(float)
    lat0, lon0 = float(lat.mean()), float(lon.mean())
    X = project_km(lat, lon, lat0, lon0)

    y = np.maximum(df[value_col].to_numpy(float), 0.0)
    if method in (RATIO, RATIO_SQRT):
        y = y / df[mar_col].to_numpy(float)
    if method in (SQRT, RATIO_SQRT):
        y = np.sqrt(y)

    # Standardise before fitting. lambda enters as n*lambda on a kernel whose
    # scale is set by the coordinates, so the optimal lambda moves with the
    # variance of y - and y here ranges from ~0.008 (ratio) to ~100 (raw mm)
    # depending on method and day. Without this, one fixed lambda grid would sit
    # off the end of the search for some of them.
    scale = float(np.std(y))
    if not np.isfinite(scale) or scale <= 0:
        scale = 1.0

    if basis is None:
        basis = ridge_basis(X)
    ys = y / scale
    model = fit_ridge_gcv(X, ys, lambda_grid, gcv_gamma,
                          gcv_guard_edf, gcv_guard_gamma, basis=basis)
    y_hi = float(ys.max()) if len(ys) else 0.0

    pop_model = None
    if pop_threshold is not None:
        wet = (df[value_col].to_numpy(float) >= WET_DAY_MM).astype(float)
        pop_model = fit_ridge_gcv(X, wet, lambda_grid, gcv_gamma,
                                  gcv_guard_edf, gcv_guard_gamma, basis=basis)

    return PrecipSurface(
        method=method, n_fit=len(df), smoothing=model.lam, edf=model.edf,
        _model=model, _lat0=lat0, _lon0=lon0, _scale=scale, _y_hi=y_hi,
        _climatology=climatology, _pop_model=pop_model,
        _pop_threshold=pop_threshold,
    )
