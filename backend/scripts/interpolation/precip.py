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
    """

    __slots__ = ("_path", "_ds", "_to_raster", "_nodata", "_fallback", "n_stations")

    def __init__(self, path, *, fallback=None, src_crs: str = "EPSG:4326"):
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

    def _valid(self, v: np.ndarray) -> np.ndarray:
        ok = np.isfinite(v) & (v > 0) & (v < 1e30)
        if self._nodata is not None:
            ok &= v != self._nodata
        return ok

    def __call__(self, points_deg: np.ndarray) -> np.ndarray:
        p = np.asarray(points_deg, dtype=float)
        xs, ys = self._to_raster.transform(p[:, 0], p[:, 1])
        out = np.array([v[0] for v in self._ds.sample(list(zip(xs, ys)), 1)],
                       dtype=float)
        bad = ~self._valid(out)
        if bad.any():
            out[bad] = self._nearest_valid(xs[bad], ys[bad])
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
