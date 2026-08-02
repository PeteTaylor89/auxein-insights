"""
Thin-plate-spline climate surface interpolation.

A faithful port of the on-prem model (`backend/models/Spline_Temp_V1.7.py`),
restructured from "script over a folder of CSVs" into a library that the
production pipeline can call with data from the database and write COGs from.

The science is unchanged and deliberately so — it is already validated, and
`parity_check.py` asserts this port reproduces the original's gridded output.

Method, per variable per timestep:

  1. Lapse-detrend every station value to sea level:  adj = value + h/100 * L
  2. Decluster: collapse near-colocated stations to one for the fit; the
     duplicates become an independent test set (holdout for free, with no loss
     of spatial coverage).
  3. Choose the spline smoothing by k-fold CV over a log grid.
  4. Fit a 2D thin-plate spline on (lon, lat) of the detrended values.
  5. Evaluate on the target grid, clip to the observed detrended range.
  6. Lapse-retrend to each grid cell's elevation:  value = adj - h/100 * L

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

# Scoring (reported accuracy) is deliberately separate from smoothing selection.
# 10 shuffled folds: LOOCV is only ~2% better and costs n fits instead of 10.
DEFAULT_SCORING_FOLDS = 10
DEFAULT_SCORING_SEED = 20260802


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
    X: np.ndarray, y: np.ndarray, smoothing: float, k: int, seed: int
) -> float:
    """Out-of-fold RMSE using spatially-random folds, with the production clip.

    This is the number we publish. It is computed separately from smoothing
    selection so that changing how we *measure* a surface never changes the
    surface itself.

    Two details matter, both established empirically in cv_experiment.py:

    * **Folds must be shuffled.** The station table is ordered geographically
      (measured fold compactness 0.49 vs 1.0 for random), so unshuffled folds
      excise contiguous regions and score the spline on extrapolating across a
      hole it would never face in production. That inflated RMSE by ~28%.
    * **Predictions must be clipped**, exactly as `fit_surface` does. A
      near-singular thin-plate system can otherwise emit absurd excursions
      (one date produced 176 degC) that production would never serve.
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
            model = _fit_rbf(X[train], y[train], smoothing)
            pred = model(X[test][:, 0], X[test][:, 1])
            resid[test] = y[test] - np.clip(pred, y[train].min(), y[train].max())
        except Exception:
            continue

    ok = np.isfinite(resid)
    return float(np.sqrt(np.mean(resid[ok] ** 2))) if ok.any() else float("nan")


def _fit_rbf(X: np.ndarray, y: np.ndarray, smoothing: float):
    """Thin-plate RBF on (lon, lat).

    Uses scipy's legacy `Rbf` deliberately: it is what the validated on-prem
    model used, and parity is asserted against that model's output. `Rbf` is
    deprecated and scales poorly (dense N x N solve, dense N_eval x N
    evaluation), so `RBFInterpolator` is the intended successor — but only once
    a parity comparison justifies the switch. See parity_check.py --engine.
    """
    from scipy.interpolate import Rbf
    return Rbf(X[:, 0], X[:, 1], y, function="thin_plate", smooth=smoothing)


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
) -> SurfaceFit:
    """Fit one surface from station observations.

    `rmse_target` enables the original's adaptive escalation: if the fit RMSE
    exceeds the target, progressively decluster harder (moving more stations
    into the holdout) and refit until it passes or the escalation ladder is
    exhausted. Pass None to fit once at `decluster_km`.

    The target is variable-specific — 0.4 degC suits temperature and is
    meaningless for rainfall — so it has no default.
    """
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

    thresholds = [decluster_km]
    if rmse_target is not None:
        thresholds += list(escalation_km)

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

        X = fit_df[[lon_col, lat_col]].to_numpy(dtype=float)
        y = fit_df[adj_col].to_numpy(dtype=float)

        # Smoothing selection keeps the original's unshuffled folds so that this
        # port reproduces the on-prem surfaces bit-for-bit (parity_check.py).
        smoothing, _ = _select_smoothing(X, y, smoothing_grid, cv_folds)
        model = _fit_rbf(X, y, smoothing)

        # Reported accuracy is measured properly: shuffled folds + production clip.
        cv_rmse = _cv_rmse_shuffled(X, y, smoothing, scoring_folds, scoring_seed)

        fitted = model(X[:, 0], X[:, 1])
        rmse = float(np.sqrt(np.mean((y - fitted) ** 2)))
        signal = float(np.mean(y))
        snr = signal / rmse if rmse > 0 else float("inf")

        observed_min = float(np.min(y))
        observed_max = float(np.max(y))

        def _predict(points: np.ndarray, _m=model, _lo=observed_min, _hi=observed_max):
            """Evaluate the spline in detrended space, clipped to observed range."""
            pts = np.asarray(points, dtype=float)
            return np.clip(_m(pts[:, 0], pts[:, 1]), _lo, _hi)

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
            snr=snr,
            n_fit=len(fit_df),
            n_test=len(holdout),
            t_rmse=t_rmse,
            decluster_km=threshold,
            fit_stations=fit_df,
            test_stations=holdout,
        )

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
    chunk_size: int = 250_000,
) -> np.ndarray:
    """Evaluate a fitted surface onto grid cells, returning real-space values.

    Chunked because the dense RBF evaluation matrix is (n_cells x n_stations);
    at the national 500 m grid (1.44M cells) an unchunked call would allocate
    tens of GB.
    """
    pts = grid[[lon_col, lat_col]].to_numpy(dtype=float)
    elev = grid[elevation_col].to_numpy(dtype=float)

    out = np.empty(len(grid), dtype=float)
    for start in range(0, len(grid), chunk_size):
        stop = min(start + chunk_size, len(grid))
        out[start:stop] = fit.predict_adjusted(pts[start:stop])

    # lapse-retrend to each cell's elevation
    return out - elev / 100.0 * fit.lapse_rate
