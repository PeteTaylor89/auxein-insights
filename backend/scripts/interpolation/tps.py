"""
Thin-plate-spline climate surface interpolation.

Grew out of a port of the on-prem model (`backend/models/Spline_Temp_V1.7.py`),
restructured from "script over a folder of CSVs" into a library that the
production pipeline can call with data from the database and write COGs from.

Method, per variable per timestep:

  1. Lapse-detrend every station value to sea level:  adj = value + h/100 * L
  2. Decluster: collapse near-colocated stations to one for the fit; the
     duplicates become an independent test set (holdout for free, with no loss
     of spatial coverage).
  3. Choose the spline smoothing.
  4. Fit a 2D thin-plate spline of the detrended values.
  5. Evaluate on the target grid.
  6. Lapse-retrend to each grid cell's elevation:  value = adj - h/100 * L

TWO ENGINES share that skeleton and differ at steps 3-5:

  `ridge`   THE DEFAULT. Standard thin-plate smoothing spline in kilometres
            about the station centroid; roughness penalty chosen by minimising
            GCV, as ANUSPLIN does, with a guarded fallback when GCV's flat
            criterion under-smooths; no clip.

  `legacy`  scipy `Rbf` on raw degrees; smoothing by unshuffled k-fold CV over
            a log grid; predictions clipped to the observed range. This is the
            on-prem model, and `parity_check.py` asserts it still reproduces
            that model's gridded output to 2e-9 degC. Kept as the regression
            target for the port. Do not change it.

Why `ridge` is the default: scipy's `Rbf(smooth=...)` is *subtracted* from the
kernel diagonal, so for the sign-changing thin-plate kernel it is not a
normalised penalty and its effect depends on the coordinate units. In practice
the CV drives it to the floor of whatever grid it is given, the surface
interpolates its own stations (in-sample RMSE ~0.014 degC against ~1.3 degC out
of sample), and the hard clip exists to keep that from emitting 176 degC.
`ridge` regularises properly, so the clip becomes unnecessary and the effective
degrees of freedom land near ANUSPLIN's n/2 guidance. Measured over the 15
golden dates by shuffled 10-fold CV with the smoothing re-selected inside every
fold, it beats `legacy` on 15 of 15 dates: median 1.106 against 1.324 degC
(-13.8%), worst 1.334 against 1.585, and roughly 3x faster because one
eigendecomposition replaces 35 spline fits.

The two engines produce visibly different maps - mean |ridge - legacy| is
0.3-0.7 degC and is flat across elevation bands, so this is a broad smoothing
difference, not an edge case. See
`docs/plans/INTERPOLATION_BENCHMARK_2026-08-04.md`.

Elevation is handled by detrend/retrend rather than as a spline covariate. That
is the original author's choice and it is the better one — it keeps the spline
2D and well-conditioned while still carrying the dominant orographic signal.

NOTE ON PRECIPITATION: rainfall must NOT use a lapse rate (pass
`lapse_rate=0.0`). Orographic precipitation is a genuinely unsolved piece of
this pipeline — the on-prem precip model has no elevation handling at all. Until
that is settled, precip surfaces are plain 2D TPS with range clipping.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Callable, Optional, Sequence

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

EARTH_RADIUS_KM = 6371.0

# Defaults lifted from Spline_Temp_V1.7.py so behaviour matches out of the box.
DEFAULT_LAPSE_RATE = 0.6           # degC per 100 m
DEFAULT_SMOOTHING_GRID = np.logspace(-4, 0, 7)
DEFAULT_CV_FOLDS = 5
DEFAULT_DECLUSTER_KM = 0.5
DEFAULT_ESCALATION_KM = (2, 4, 6, 8, 10)

# How far from the output grid a station may sit and still earn its place in the
# fit. See `screen_relevance` for the measurements behind the 800 km.
DEFAULT_RELEVANCE_KM = 800.0

# Scoring (reported accuracy) is deliberately separate from smoothing selection.
# 10 shuffled folds: LOOCV is only ~2% better and costs n fits instead of 10.
DEFAULT_SCORING_FOLDS = 10
DEFAULT_SCORING_SEED = 20260802

# --- ridge engine ---------------------------------------------------------
# lambda is the roughness penalty of a standard thin-plate smoothing spline,
# entering as n*lambda on the kernel diagonal. Its natural scale depends on the
# coordinate units (km) and on n, both of which are fixed here, so one grid
# serves every variable. Boundary hits are logged rather than silently accepted.
DEFAULT_LAMBDA_GRID = np.logspace(-10, 6, 33)

# Inflation of the effective-dof charge in the GCV criterion (see
# `RidgeTPS.criterion`). Ordinary GCV by default: measured over the 15 golden
# dates, every fixed gamma > 1 is WORSE on median RMSE than gamma = 1.
#
# What does help is applying the inflation only when ordinary GCV has visibly
# failed - when it has spent more than GUARD_EDF of the available degrees of
# freedom. That is a pure tail fix: identical median, -2% mean, -10% worst.
# Both constants sit in the middle of a flat 5 x 4 sensitivity grid (thresholds
# 0.70-0.90, gammas 1.05-1.4); every cell beat plain GCV and none beat another
# by more than 0.4%, so nothing here is knife-edge. See gamma_experiment.py.
DEFAULT_GCV_GAMMA = 1.0
DEFAULT_GCV_GUARD_EDF = 0.80
DEFAULT_GCV_GUARD_GAMMA = 1.2

LEGACY_ENGINE = "legacy"
RIDGE_ENGINE = "ridge"


@dataclass
class SurfaceFit:
    """A fitted surface plus everything needed to score and reproduce it."""
    predict_adjusted: Callable[[np.ndarray], np.ndarray]
    smoothing: float
    lapse_rate: float
    observed_min: float
    observed_max: float
    rmse: float                      # residual over the fitted stations (optimistic)
    cv_rmse: float                   # k-fold CV over fitted stations - ALWAYS available
    snr: float
    n_fit: int
    n_test: int
    t_rmse: Optional[float]          # declustered holdout - often tiny n, may be None
    decluster_km: float
    fit_stations: pd.DataFrame = field(repr=False)
    test_stations: pd.DataFrame = field(repr=False)

    @property
    def degraded(self) -> bool:
        """True when the fit never reached its accuracy target."""
        return self._degraded

    _degraded: bool = False

    # Out-of-fold residual per fitted station, aligned to `fit_stations` rows and
    # NaN where a fold could not be scored. `cv_rmse` is its RMS; this is kept so
    # error can be attributed to REGIONS rather than only reported nationally.
    cv_residuals: Optional[np.ndarray] = field(default=None, repr=False)

    # `edf` and `gcv` are ridge-engine only; the legacy engine cannot compute them.
    engine: str = RIDGE_ENGINE
    edf: Optional[float] = None      # effective degrees of freedom (ANUSPLIN "signal")
    gcv: Optional[float] = None
    clipped: bool = False

    # The fitted model itself. Under `ridge` this carries the spline coefficients
    # `c` (one per fitted station, in `fit_stations` order) and `d` (the [1, x, y]
    # polynomial term), which `fastgrid` needs in order to evaluate a whole batch
    # of dates as a single GEMM against a precomputed basis. Under `legacy` it is
    # the scipy wrapper and exposes neither.
    model: object = None
    # Projection origin actually used, as (lat0, lon0). None under `legacy`, which
    # fits in raw degrees. A `fastgrid.GridBasis` is only valid for coefficients
    # fitted at its own origin — compare this against `GridBasis.lat0/lon0`.
    origin: Optional[tuple] = None

    @property
    def edf_fraction(self) -> Optional[float]:
        """Signal as a fraction of n. ANUSPLIN guidance: keep this below ~0.5."""
        return None if self.edf is None else self.edf / self.n_fit


def haversine_km(lat1, lon1, lat2, lon2):
    """Great-circle distance in km. Vectorised over numpy arrays."""
    dlat = np.radians(lat2 - lat1)
    dlon = np.radians(lon2 - lon1)
    a = (np.sin(dlat / 2.0) ** 2
         + np.cos(np.radians(lat1)) * np.cos(np.radians(lat2)) * np.sin(dlon / 2.0) ** 2)
    return EARTH_RADIUS_KM * 2.0 * np.arctan2(np.sqrt(a), np.sqrt(1.0 - a))


def _pairwise_km(lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    """Full pairwise haversine matrix.

    The original built this with scipy's `pdist` and a Python lambda, which
    calls back into Python once per pair. This broadcasts instead — same
    numbers, orders of magnitude faster once station counts reach ~1,000.
    """
    return haversine_km(lat[:, None], lon[:, None], lat[None, :], lon[None, :])


def screen_relevance(
    stations: pd.DataFrame,
    targets,
    *,
    max_km: float = DEFAULT_RELEVANCE_KM,
    lat_col: str = "latitude",
    lon_col: str = "longitude",
    chunk_size: int = 5_000,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Split stations into (kept, rejected) on distance to the output grid.

    A thin-plate spline has no notion of "too far away to be relevant". Every
    station enters the bordered system, and the linear polynomial term is
    fitted globally, so a station on the far side of an ocean still helps set
    the trend over the area actually being mapped.

    Whether that is good or bad is an empirical question, and it was measured
    (`island_experiment.py`, 26,644 held-out station-days over the rainfall
    network). The answer is that it depends entirely on distance, and not
    monotonically on "is it an island":

      Auckland Islands  367 km from the grid   KEEP - with Campbell, worth
      Campbell Island   598 km                 9.5% MAE in the southern band;
                                               they are the only stations south
                                               of the mainland and they turn the
                                               southern coast from an
                                               extrapolation edge into interior
      Chatham Islands   682 km                 KEEP - genuinely informative for
                                               eastern surfaces
      Raoul Island      983 km                 DROP - subtropical, 1,000 km out,
                                               measurably harmful (+0.08% MAE)

    Hence `max_km`, defaulting to 800 km: it sits in the 300 km gap between the
    furthest station that helps and the nearest that hurts. Any threshold in
    roughly 700-950 km selects exactly the same stations from the current
    network, so the constant is not knife-edge - but it IS calibrated against
    three offshore stations, which is a small sample. Re-measure it if the
    network gains stations in that band.

    Distance is measured to the nearest **target cell**, not to the nearest
    other station. Station-to-station distance would be circular (relevance
    defined by the very clustering being screened) and a bounding box does not
    work either - Raoul is closer to the mainland box than Campbell is, because
    a rectangle around New Zealand has no idea which corner is land.

    Rejections are returned rather than silently dropped, and logged, for the
    same reason `screen_climatology` does it: a pipeline that quietly deletes
    stations is how the on-prem model's escalation ladder came to throw away
    eleven genuine observations to flatter an in-sample statistic.

    `targets` is the output grid: an (N, 2) array of (lat, lon), or a DataFrame
    with latitude/longitude columns under any capitalisation.
    """
    if isinstance(targets, pd.DataFrame):
        cols = {c.lower(): c for c in targets.columns}
        try:
            t = targets[[cols["latitude"], cols["longitude"]]].to_numpy(float)
        except KeyError as exc:                                  # noqa: PERF203
            raise ValueError("targets DataFrame needs latitude and longitude "
                             f"columns; got {list(targets.columns)}") from exc
    else:
        t = np.asarray(targets, dtype=float)
    if t.ndim != 2 or t.shape[1] != 2:
        raise ValueError(f"targets must be (N, 2) of (lat, lon); got {t.shape}")

    lat = stations[lat_col].to_numpy(float)
    lon = stations[lon_col].to_numpy(float)

    # Chunked over targets, keeping a running minimum: the national 500 m grid
    # is 1.44M cells, and a dense (n_stations x n_cells) distance matrix at
    # ~1,000 stations would allocate tens of GB across haversine's intermediates.
    best = np.full(len(lat), np.inf)
    for lo in range(0, len(t), chunk_size):
        blk = t[lo:lo + chunk_size]
        d = haversine_km(lat[:, None], lon[:, None], blk[None, :, 0], blk[None, :, 1])
        np.minimum(best, d.min(axis=1), out=best)

    far = best > max_km
    kept = stations[~far].assign(distance_to_grid_km=best[~far])
    rejected = stations[far].assign(distance_to_grid_km=best[far],
                                    reject_reason="beyond_relevance_radius")
    if len(rejected):
        logger.warning(
            "relevance screening dropped %d of %d stations beyond %.0f km of the "
            "grid: %s", len(rejected), len(stations), max_km,
            [f"({r[lat_col]:.2f},{r[lon_col]:.2f}) {r.distance_to_grid_km:.0f}km"
             for _, r in rejected.iterrows()])
    return kept, rejected


def decluster(
    df: pd.DataFrame,
    threshold_km: float,
    lat_col: str = "latitude",
    lon_col: str = "longitude",
) -> tuple[pd.Index, pd.Index]:
    """Split stations into (fit, holdout) by spatial declustering.

    Stations within `threshold_km` of each other form a cluster; the first
    member is kept for fitting and the rest are held out. Near-colocated
    stations would otherwise ill-condition the spline while contributing no new
    spatial information — so this both stabilises the fit and yields an
    independent test set at no cost in coverage.

    Returns (fit_index, holdout_index) as pandas indices into `df`.
    """
    if len(df) == 0:
        return df.index, df.index

    lat = df[lat_col].to_numpy(dtype=float)
    lon = df[lon_col].to_numpy(dtype=float)
    dist = _pairwise_km(lat, lon)
    adjacency = dist <= threshold_km

    # Connected components via BFS on the boolean adjacency matrix. The original
    # used networkx; this drops the dependency and is equivalent because the
    # matrix is small, symmetric, and already materialised.
    n = len(df)
    component = np.full(n, -1, dtype=int)
    current = 0
    for seed in range(n):
        if component[seed] != -1:
            continue
        stack = [seed]
        component[seed] = current
        while stack:
            node = stack.pop()
            for nbr in np.flatnonzero(adjacency[node] & (component == -1)):
                component[nbr] = current
                stack.append(nbr)
        current += 1

    keep_positions = []
    for comp_id in range(current):
        members = np.flatnonzero(component == comp_id)
        if members.size:
            keep_positions.append(members[0])

    keep_mask = np.zeros(n, dtype=bool)
    keep_mask[keep_positions] = True
    return df.index[keep_mask], df.index[~keep_mask]


def _select_smoothing(
    X: np.ndarray,
    y: np.ndarray,
    smoothing_grid: Sequence[float],
    cv_folds: int,
) -> tuple[float, float]:
    """Pick the smoothing factor minimising k-fold CV MSE.

    Returns (best_smoothing, best_mean_mse).
    """
    from sklearn.model_selection import KFold

    n_splits = max(2, min(cv_folds, len(X)))
    kf = KFold(n_splits=n_splits)          # unshuffled, as in the original -> deterministic

    best_s, best_mse = float(smoothing_grid[0]), np.inf
    for s in smoothing_grid:
        fold_mse = []
        for train_idx, test_idx in kf.split(X):
            if len(train_idx) < 3:
                continue
            try:
                model = _fit_rbf(X[train_idx], y[train_idx], float(s))
                pred = model(X[test_idx][:, 0], X[test_idx][:, 1])
            except Exception:            # singular system at this smoothing
                fold_mse.append(np.inf)
                continue
            fold_mse.append(float(np.mean((y[test_idx] - pred) ** 2)))
        mean_mse = float(np.mean(fold_mse)) if fold_mse else np.inf
        if mean_mse < best_mse:
            best_s, best_mse = float(s), mean_mse
    return best_s, best_mse


def _shuffled_fold_ids(n: int, k: int, seed: int) -> np.ndarray:
    """Spatially-random fold assignment."""
    rng = np.random.default_rng(seed)
    idx = rng.permutation(n)
    folds = np.empty(n, dtype=int)
    folds[idx] = np.arange(n) % k
    return folds


def _cv_rmse_shuffled(
    X: np.ndarray,
    y: np.ndarray,
    refit: Callable[[np.ndarray, np.ndarray], Callable[[np.ndarray], np.ndarray]],
    k: int,
    seed: int,
    clip: bool = True,
) -> tuple:
    """Out-of-fold RMSE using spatially-random folds.

    Returns `(rmse, resid)`. The per-station residual vector was always computed
    here and thrown away; it is returned because it is the only route to a
    PER-REGION accuracy figure. One national number is dominated by the Southern
    Alps and understates flat, well-instrumented country. `resid` is aligned to
    the rows of `X`/`y`, i.e. to `SurfaceFit.fit_stations`, and is NaN where a
    fold could not be scored.

    Note the residuals are the same in detrended and real space: the lapse
    adjustment is additive and applied to observation and prediction alike, so
    `y - pred` is unchanged by it. For a ratio-fitted variable (rainfall) they
    are in RATIO units, and converting to mm means multiplying each station's
    residual by that station's own climatology - not by any single scale factor.

    This is the number we publish. It is computed separately from smoothing
    selection so that changing how we *measure* a surface never changes the
    surface itself. `refit` retrains on each fold's training set, so the
    smoothing parameter is re-selected inside the fold and nothing leaks.

    Two details matter, both established empirically in cv_experiment.py:

    * **Folds must be shuffled.** The station table is ordered geographically
      (measured fold compactness 0.49 vs 1.0 for random), so unshuffled folds
      excise contiguous regions and score the spline on extrapolating across a
      hole it would never face in production. That inflated RMSE by ~28%.
    * **Predictions must be clipped when production clips.** The legacy engine
      near-interpolates and can emit absurd excursions (one date produced
      176 degC) that production would never serve, so scoring it without the
      clip overstates its error. The ridge engine needs no clip.
    """
    n = len(y)
    k = max(2, min(k, n))
    folds = _shuffled_fold_ids(n, k, seed)

    resid = np.full(n, np.nan)
    for fold in range(k):
        test = folds == fold
        train = ~test
        if train.sum() < 4:
            continue
        try:
            pred = refit(X[train], y[train])(X[test])
            if clip:
                pred = np.clip(pred, y[train].min(), y[train].max())
            resid[test] = y[test] - pred
        except Exception:
            continue

    ok = np.isfinite(resid)
    rmse = float(np.sqrt(np.mean(resid[ok] ** 2))) if ok.any() else float("nan")
    return rmse, resid


def _fit_rbf(X: np.ndarray, y: np.ndarray, smoothing: float):
    """Thin-plate RBF on (lon, lat).

    Uses scipy's legacy `Rbf` deliberately, and must keep doing so: it is what
    the on-prem model used, and `parity_check.py` asserts this reproduces that
    model's output to 2e-9 degC. Swapping in `RBFInterpolator` here would break
    that guarantee for no gain — the `ridge` engine, not a different scipy
    class, is the successor, and it is now the default. This path exists only to
    keep the regression target alive.
    """
    from scipy.interpolate import Rbf
    return Rbf(X[:, 0], X[:, 1], y, function="thin_plate", smooth=smoothing)


# ---------------------------------------------------------------------------
# Ridge + GCV engine
#
# What the legacy engine calls "smoothing" is scipy's `Rbf(smooth=...)`, which
# is *subtracted* from the kernel diagonal:
#
#     A = self._init_function(r) - eye(N) * smooth
#
# For the thin-plate kernel r^2*log(r), whose sign flips at r = 1, that means
# whether `smooth` damps or amplifies depends on the numeric scale of the
# coordinates. It is not a normalised penalty, and measured over the 15 golden
# dates the CV always drives it to the floor of whatever grid it is given - the
# surface ends up interpolating its own stations (in-sample RMSE ~0.014 degC
# against ~1.27 degC out of sample) and needs a hard clip to stay physical.
#
# This engine does what ANUSPLIN does instead: a standard thin-plate smoothing
# spline with a roughness penalty n*lambda on the kernel diagonal, lambda chosen
# by minimising GCV, fitted in metric coordinates.
# ---------------------------------------------------------------------------


def project_km(
    lat: np.ndarray, lon: np.ndarray, lat0: float, lon0: float
) -> np.ndarray:
    """Local equirectangular projection to kilometres about (lat0, lon0).

    Thin-plate splines are isotropic: they assume a unit step in x means the
    same thing as a unit step in y. Degrees violate that badly here - at -41
    latitude one degree of longitude is ~84 km against ~111 km for latitude, so
    fitting in degrees imposes a 32% east-west stretch with no physical basis.

    Equirectangular rather than NZTM deliberately: over a single country it
    agrees with a proper projection to well within the station spacing, and it
    keeps the production pipeline free of a pyproj dependency. `lat0/lon0` are
    the data centroid, so this holds for regional runs and for AU.

    Longitude differences are wrapped to (-180, 180], because New Zealand's
    network straddles the antimeridian. Raoul Island reports 177.93 **west**;
    unwrapped, against a centroid near 173 east, it projected to x = -29,371 km
    - about 30,000 km west of the country, when it physically sits ~756 km east.

    A station that far out is not corrupted so much as *erased*: at that range
    its kernel contribution is constant-plus-linear across the whole fitting
    domain, which the spline's own polynomial term already spans, so the
    bordered system absorbs it into the trend and the observation stops
    informing the surface. Measured over the rainfall network the national MAE
    effect was under 0.1% - Raoul has nothing to say about New Zealand rainfall
    either way. The Chatham Islands are the case that matters: ~870 km east,
    genuinely informative for eastern surfaces, and they would have been
    discarded by the same arithmetic without any error being raised.

    The wrap is the identity whenever `|lon - lon0| < 180`, so it cannot change
    any fit whose stations lie on one side of the antimeridian.

    Precondition: `lon0` must be within 180 degrees of the data. A naive
    `lon.mean()` satisfies this for any network clustered on one side, including
    NZ's - Raoul drags the mean by ~0.7 degrees, and the spline is invariant to
    a shift of origin anyway. It would NOT hold for a network genuinely split
    across the antimeridian, which would need a circular mean.
    """
    dlon = (np.asarray(lon, dtype=float) - lon0 + 180.0) % 360.0 - 180.0
    x = dlon * 111.320 * np.cos(np.radians(lat0))
    y = (np.asarray(lat, dtype=float) - lat0) * 110.574
    return np.column_stack([x, y])


def _thin_plate(r: np.ndarray) -> np.ndarray:
    """phi(r) = r^2 log(r), with phi(0) = 0."""
    out = np.zeros_like(r)
    nz = r > 0
    out[nz] = r[nz] ** 2 * np.log(r[nz])
    return out


def _cdist(A: np.ndarray, B: np.ndarray) -> np.ndarray:
    """Euclidean distances, via the |a|^2 + |b|^2 - 2ab expansion.

    Deliberately not the broadcast form `A[:, None, :] - B[None, :, :]`: that
    materialises an (n_eval, n_nodes, 2) intermediate, which at a 250k-cell grid
    chunk against 600 stations is 2.4 GB before anything useful happens.
    """
    d2 = ((A ** 2).sum(1)[:, None] + (B ** 2).sum(1)[None, :] - 2.0 * (A @ B.T))
    return np.sqrt(np.maximum(d2, 0.0))


class RidgeTPS:
    """Thin-plate smoothing spline with a GCV-selected roughness penalty.

    Solves the standard bordered system

        (K + n*lambda*I) c + P d = y
        P^T c = 0

    with K[i,j] = phi(|x_i - x_j|) and P = [1, x, y].

    The whole lambda grid is evaluated from one eigendecomposition. Writing
    P = [Q1 Q2] [R; 0] and substituting c = Q2 z reduces the system to

        (Q2^T K Q2 + n*lambda*I) z = Q2^T y

    so with G = Q2^T K Q2 = U diag(g) U^T computed once, every lambda costs O(n).
    Two identities fall out and are used below:

        residual = y - fitted = n*lambda*c
        trace(I - A) = n*lambda * sum_j 1/(g_j + n*lambda)

    which give RSS and the effective degrees of freedom - ANUSPLIN's "signal" -
    without ever forming the n x n influence matrix.
    """

    __slots__ = ("X", "c", "d", "lam", "smoothing", "edf", "gcv", "rss", "n")

    def __init__(self, X: np.ndarray, y: np.ndarray, lam: float, _cache=None):
        n = len(y)
        Q2, R3, Q1, K, U, g, b = _cache if _cache is not None else ridge_basis(X)
        if b is None:                      # standalone fit, outside the grid search
            b = U.T @ (Q2.T @ y)

        nl = n * lam
        zz = b / (g + nl)
        c = Q2 @ (U @ zz)
        w = y - K @ c - nl * c
        d = np.linalg.solve(R3, Q1.T @ w)

        self.X, self.c, self.d, self.lam, self.n = X, c, d, float(lam), n
        self.smoothing = float(lam)        # the engine-neutral name
        self.rss = float(nl * nl * float(zz @ zz))
        tr_i_minus_a = float(nl * np.sum(1.0 / (g + nl)))
        self.edf = float(n - tr_i_minus_a)
        self.gcv = (n * self.rss / tr_i_minus_a ** 2
                    if tr_i_minus_a > 1e-9 else float("inf"))

    def criterion(self, gamma: float = 1.0) -> float:
        """GCV with the effective dof inflated by `gamma`.

            V_gamma(lambda) = n * RSS / (n - gamma * edf)^2

        `gamma = 1` is ordinary GCV, since n - edf == trace(I - A). Larger gamma
        charges more for each degree of freedom the spline spends, which pulls
        the selected lambda up. Ordinary GCV is known to under-smooth at moderate
        n - its criterion is very flat near the optimum, so noise in RSS can put
        the minimum a long way along the lambda axis.
        """
        if gamma == 1.0:
            return self.gcv
        denom = self.n - gamma * self.edf
        return self.n * self.rss / denom ** 2 if denom > 1e-9 else float("inf")

    def __call__(self, Xe: np.ndarray) -> np.ndarray:
        Xe = np.asarray(Xe, dtype=float)
        return (_thin_plate(_cdist(Xe, self.X)) @ self.c
                + np.column_stack([np.ones(len(Xe)), Xe]) @ self.d)


def ridge_basis(X: np.ndarray):
    """One-off O(n^3) work shared across every lambda."""
    n = len(X)
    K = _thin_plate(_cdist(X, X))
    P = np.column_stack([np.ones(n), X])
    Q, R = np.linalg.qr(P, mode="complete")
    Q1, Q2, R3 = Q[:, :3], Q[:, 3:], R[:3, :3]
    G = Q2.T @ K @ Q2
    g, U = np.linalg.eigh(0.5 * (G + G.T))
    return Q2, R3, Q1, K, U, g, None


def fit_ridge_gcv(
    X: np.ndarray,
    y: np.ndarray,
    lambda_grid: Sequence[float] = DEFAULT_LAMBDA_GRID,
    gamma: float = DEFAULT_GCV_GAMMA,
    guard_edf: Optional[float] = DEFAULT_GCV_GUARD_EDF,
    guard_gamma: float = DEFAULT_GCV_GUARD_GAMMA,
    basis=None,
) -> RidgeTPS:
    """Fit at the lambda minimising GCV. `X` must already be in kilometres.

    `gamma` inflates the dof charge (see `RidgeTPS.criterion`).

    `guard_edf` re-selects with `guard_gamma` whenever the first choice spends
    more than that fraction of the available degrees of freedom. GCV's criterion
    is very flat near its optimum, so on a minority of timesteps noise in RSS
    drags the minimum out to a near-interpolating lambda; this catches exactly
    that case and leaves the rest alone. Pass None to disable.

    `basis` is a pre-computed `ridge_basis(X)`. The O(n^3) eigendecomposition
    depends only on the station *coordinates*, so a caller fitting many
    timesteps over one fixed station set - a backfill, or a cross-validation
    fold - should compute it once and pass it in. `X` must be the same array.
    """
    n = len(X)
    if n < 4:
        raise ValueError(f"need at least 4 points for a ridge TPS, got {n}")

    Q2, R3, Q1, K, U, g, _ = basis if basis is not None else ridge_basis(X)
    b = U.T @ (Q2.T @ y)
    cache = (Q2, R3, Q1, K, U, g, b)

    models = []
    for i, lam in enumerate(lambda_grid):
        try:
            models.append((i, RidgeTPS(X, y, float(lam), _cache=cache)))
        except np.linalg.LinAlgError:
            continue

    if not models:                         # pathological - fall back to heavy smoothing
        return RidgeTPS(X, y, float(lambda_grid[-1]), _cache=cache)

    def _pick(gam):
        scored = [(m.criterion(gam), i, m) for i, m in models]
        scored = [s for s in scored if np.isfinite(s[0])]
        return min(scored, key=lambda s: s[0])[1:] if scored else (None, None)

    best_i, best = _pick(gamma)
    if best is None:
        return RidgeTPS(X, y, float(lambda_grid[-1]), _cache=cache)

    if guard_edf is not None and best.edf > guard_edf * n:
        guarded_i, guarded = _pick(guard_gamma)
        if guarded is not None:
            logger.debug("GCV spent %.0f%% of n; re-selecting at gamma=%g "
                         "(lambda %g -> %g, signal %.0f%% -> %.0f%%)",
                         100 * best.edf / n, guard_gamma, best.lam, guarded.lam,
                         100 * best.edf / n, 100 * guarded.edf / n)
            best_i, best = guarded_i, guarded

    if best_i in (0, len(lambda_grid) - 1):
        logger.warning("GCV selected lambda=%g at the edge of the grid; "
                       "the optimum may lie outside it", best.lam)
    return best


# ---------------------------------------------------------------------------


class _LegacySurface:
    """scipy `Rbf` behind the same call signature the ridge engine uses."""

    __slots__ = ("model", "smoothing", "edf", "gcv", "lam")

    def __init__(self, model, smoothing: float):
        self.model, self.smoothing = model, float(smoothing)
        self.edf = self.gcv = self.lam = None

    def __call__(self, pts: np.ndarray) -> np.ndarray:
        pts = np.asarray(pts, dtype=float)
        return self.model(pts[:, 0], pts[:, 1])


def _engine_refit(
    engine: str,
    *,
    smoothing_grid: Sequence[float],
    cv_folds: int,
    lambda_grid: Sequence[float],
    gamma: float = DEFAULT_GCV_GAMMA,
    guard_edf: Optional[float] = DEFAULT_GCV_GUARD_EDF,
    guard_gamma: float = DEFAULT_GCV_GUARD_GAMMA,
) -> Callable[[np.ndarray, np.ndarray], Callable[[np.ndarray], np.ndarray]]:
    """Build the `refit(X, y) -> predict(X)` closure for one engine.

    Used for both the production fit and for scoring, so cross-validation
    re-selects the smoothing parameter inside every fold.
    """
    if engine == LEGACY_ENGINE:
        def refit(X, y):
            smoothing, _ = _select_smoothing(X, y, smoothing_grid, cv_folds)
            return _LegacySurface(_fit_rbf(X, y, smoothing), smoothing)
        return refit

    if engine == RIDGE_ENGINE:
        def refit(X, y):
            return fit_ridge_gcv(X, y, lambda_grid, gamma, guard_edf, guard_gamma)
        return refit

    raise ValueError(f"unknown engine {engine!r}; expected "
                     f"{LEGACY_ENGINE!r} or {RIDGE_ENGINE!r}")


def fit_surface(
    stations: pd.DataFrame,
    value_col: str,
    *,
    lat_col: str = "latitude",
    lon_col: str = "longitude",
    elevation_col: str = "elevation",
    lapse_rate: float = DEFAULT_LAPSE_RATE,
    smoothing_grid: Sequence[float] = DEFAULT_SMOOTHING_GRID,
    cv_folds: int = DEFAULT_CV_FOLDS,
    decluster_km: float = DEFAULT_DECLUSTER_KM,
    rmse_target: Optional[float] = None,
    escalation_km: Sequence[float] = DEFAULT_ESCALATION_KM,
    scoring_folds: int = DEFAULT_SCORING_FOLDS,
    scoring_seed: int = DEFAULT_SCORING_SEED,
    engine: str = RIDGE_ENGINE,
    lambda_grid: Sequence[float] = DEFAULT_LAMBDA_GRID,
    gcv_gamma: float = DEFAULT_GCV_GAMMA,
    gcv_guard_edf: Optional[float] = DEFAULT_GCV_GUARD_EDF,
    gcv_guard_gamma: float = DEFAULT_GCV_GUARD_GAMMA,
    clip: Optional[bool] = None,
    origin: Optional[tuple] = None,
) -> SurfaceFit:
    """Fit one surface from station observations.

    `engine` selects the solver:

    * ``"ridge"`` (default) - standard thin-plate smoothing spline in
      kilometres, penalty chosen by minimising GCV, no clip.
    * ``"legacy"`` - scipy `Rbf` on raw degrees, smoothing chosen by unshuffled
      k-fold CV, predictions clipped to the observed range. This is the on-prem
      model, and `parity_check.py` asserts it still reproduces it.

    `clip` overrides the engine default (ridge does not clip, legacy does).

    `rmse_target` under the **ridge** engine only sets the `degraded` flag, and
    is compared against `cv_rmse`. Under **legacy** it additionally enables the
    original's adaptive escalation: if the *in-sample* RMSE exceeds the target,
    progressively decluster harder — moving more stations into the holdout —
    and refit until it passes or the ladder is exhausted.

    That escalation is why it is off under ridge. On the golden dates it fires
    twice, and both times "succeeds" by deleting real stations until the spline
    can interpolate what is left: 01_01_1991 drops from 179 stations to 168 and
    its in-sample RMSE from 0.913 to 0.002, while its out-of-sample error does
    not improve at all. GCV controls smoothness directly, so the lever is not
    needed.

    The target is variable-specific — 0.4 degC suits temperature and is
    meaningless for rainfall — so it has no default.

    `origin` pins the (lat0, lon0) of the kilometre projection instead of taking
    the fitted stations' centroid. Pass the same origin for every date in a run
    — `fastgrid.GridBasis` requires it, and it keeps a multi-date series in one
    coordinate system. Measured over the 15 golden dates, pinning it to the grid
    centroid leaves cv_rmse unchanged (median 1.1055 either way). Ignored under
    `legacy`, which fits in raw degrees.
    """
    if engine not in (LEGACY_ENGINE, RIDGE_ENGINE):
        raise ValueError(f"unknown engine {engine!r}; expected "
                         f"{LEGACY_ENGINE!r} or {RIDGE_ENGINE!r}")
    if clip is None:
        clip = engine == LEGACY_ENGINE

    required = {value_col, lat_col, lon_col, elevation_col}
    missing = required - set(stations.columns)
    if missing:
        raise ValueError(f"stations is missing required columns: {sorted(missing)}")

    df = stations.dropna(subset=[value_col, lat_col, lon_col, elevation_col]).copy()
    df[value_col] = df[value_col].astype(float)
    df[elevation_col] = df[elevation_col].astype(float)
    if len(df) < 4:
        raise ValueError(f"need at least 4 usable stations to fit, got {len(df)}")

    # 1. lapse-detrend to sea level
    adj_col = f"_adj_{value_col}"
    df[adj_col] = df[value_col] + df[elevation_col] / 100.0 * lapse_rate

    # The ridge engine fits once: GCV, not station deletion, controls smoothness.
    thresholds = [decluster_km]
    if rmse_target is not None and engine == LEGACY_ENGINE:
        thresholds += list(escalation_km)

    refit = _engine_refit(engine, smoothing_grid=smoothing_grid,
                          cv_folds=cv_folds, lambda_grid=lambda_grid,
                          gamma=gcv_gamma, guard_edf=gcv_guard_edf,
                          guard_gamma=gcv_guard_gamma)

    holdout = df.iloc[0:0]
    result = None

    for threshold in thresholds:
        fit_idx, hold_idx = decluster(df, threshold, lat_col=lat_col, lon_col=lon_col)
        fit_df = df.loc[fit_idx]
        # Holdout accumulates as we escalate, matching the original's behaviour.
        holdout = df.loc[hold_idx]

        if len(fit_df) < 4:
            logger.warning("declustering at %.1f km left %d stations; stopping escalation",
                           threshold, len(fit_df))
            break

        pts_deg = fit_df[[lon_col, lat_col]].to_numpy(dtype=float)   # (lon, lat)
        y = fit_df[adj_col].to_numpy(dtype=float)

        # The legacy engine fits in raw degrees, because that is what the on-prem
        # model did and parity is asserted against it. The ridge engine fits in
        # kilometres about the station centroid - a thin-plate spline is isotropic
        # and degrees are not (see project_km).
        if engine == RIDGE_ENGINE:
            # `origin` pins the projection so that every date in a run shares one
            # metric. Without it the origin follows the reporting stations'
            # centroid, so the coordinate system wobbles with which stations
            # happened to report — harmless for a single surface, but it means a
            # difference between two dates carries a projection artefact, and it
            # blocks the precomputed-basis path in `fastgrid` entirely.
            lat0, lon0 = origin if origin is not None else (
                float(fit_df[lat_col].mean()), float(fit_df[lon_col].mean()))
            used_origin = (lat0, lon0)

            def to_model(p, _la=lat0, _lo=lon0):
                p = np.asarray(p, dtype=float)
                return project_km(p[:, 1], p[:, 0], _la, _lo)
        else:
            used_origin = None                 # legacy fits in raw degrees

            def to_model(p):
                return np.asarray(p, dtype=float)

        X = to_model(pts_deg)

        # Smoothing selection: legacy keeps the original's unshuffled folds so
        # that this port reproduces the on-prem surfaces bit-for-bit
        # (parity_check.py); ridge minimises GCV, as ANUSPLIN does.
        model = refit(X, y)
        smoothing = model.smoothing

        # Reported accuracy: shuffled folds, smoothing re-selected inside each
        # fold, and the production clip applied only if production clips.
        cv_rmse, cv_residuals = _cv_rmse_shuffled(X, y, refit, scoring_folds,
                                                  scoring_seed, clip=clip)

        fitted = model(X)
        rmse = float(np.sqrt(np.mean((y - fitted) ** 2)))
        # NOTE: `snr` is mean(y)/rmse, which is origin-dependent - the same
        # surface in Kelvin scores ~15x higher. `edf` is the diagnostic that
        # means something; ANUSPLIN guidance is to keep it below ~n/2.
        signal = float(np.mean(y))
        snr = signal / rmse if rmse > 0 else float("inf")

        observed_min = float(np.min(y))
        observed_max = float(np.max(y))

        def _predict(points: np.ndarray, _m=model, _t=to_model,
                     _lo=observed_min, _hi=observed_max, _clip=clip):
            """Evaluate the spline in detrended space, given (lon, lat) degrees."""
            out = _m(_t(points))
            return np.clip(out, _lo, _hi) if _clip else out

        # Independent score against the declustered holdout, in real (retrended) space.
        t_rmse = None
        if len(holdout):
            h_pts = holdout[[lon_col, lat_col]].to_numpy(dtype=float)
            h_pred_adj = _predict(h_pts)
            h_pred = h_pred_adj - holdout[elevation_col].to_numpy(dtype=float) / 100.0 * lapse_rate
            h_obs = holdout[value_col].to_numpy(dtype=float)
            ok = ~np.isnan(h_obs) & ~np.isnan(h_pred)
            if ok.any():
                t_rmse = float(np.sqrt(np.mean((h_obs[ok] - h_pred[ok]) ** 2)))

        result = SurfaceFit(
            predict_adjusted=_predict,
            smoothing=smoothing,
            lapse_rate=lapse_rate,
            observed_min=observed_min,
            observed_max=observed_max,
            rmse=rmse,
            cv_rmse=cv_rmse,
            cv_residuals=cv_residuals,
            snr=snr,
            n_fit=len(fit_df),
            n_test=len(holdout),
            t_rmse=t_rmse,
            decluster_km=threshold,
            fit_stations=fit_df,
            test_stations=holdout,
            engine=engine,
            edf=model.edf,
            gcv=model.gcv,
            clipped=clip,
            model=model,
            origin=used_origin,
        )

        if engine == RIDGE_ENGINE:
            if model.edf is not None and model.edf > 0.5 * len(fit_df):
                logger.info("signal %.0f of %d stations (%.0f%%) - above ANUSPLIN's "
                            "n/2 guidance; surface is fitting fine structure",
                            model.edf, len(fit_df), 100 * model.edf / len(fit_df))
            if rmse_target is not None and cv_rmse > rmse_target:
                result._degraded = True
                logger.warning("cv_rmse %.4f above target %.4f - marking degraded",
                               cv_rmse, rmse_target)
            return result

        if rmse_target is None or rmse <= rmse_target:
            return result

        logger.info("RMSE %.4f above target %.4f at %.1f km; escalating declustering",
                    rmse, rmse_target, threshold)

    if result is not None and rmse_target is not None and result.rmse > rmse_target:
        result._degraded = True
        logger.warning("surface did not reach RMSE target %.4f (best %.4f) - marking degraded",
                       rmse_target, result.rmse)
    return result


def evaluate_on_grid(
    fit: SurfaceFit,
    grid: pd.DataFrame,
    *,
    lat_col: str = "latitude",
    lon_col: str = "longitude",
    elevation_col: str = "elevation",
    chunk_size: int = 50_000,
) -> np.ndarray:
    """Evaluate a fitted surface onto grid cells, returning real-space values.

    Chunked because the dense evaluation matrix is (n_cells x n_stations); at
    the national 500 m grid (1.44M cells) an unchunked call would allocate tens
    of GB. Both engines materialise a distance matrix *and* a same-sized kernel
    matrix per chunk, so at the ~1,000-station target 50k cells is about 800 MB
    of transient allocation - the old 250k default was four times that.
    """
    pts = grid[[lon_col, lat_col]].to_numpy(dtype=float)
    elev = grid[elevation_col].to_numpy(dtype=float)

    out = np.empty(len(grid), dtype=float)
    for start in range(0, len(grid), chunk_size):
        stop = min(start + chunk_size, len(grid))
        out[start:stop] = fit.predict_adjusted(pts[start:stop])

    # lapse-retrend to each cell's elevation
    return out - elev / 100.0 * fit.lapse_rate
