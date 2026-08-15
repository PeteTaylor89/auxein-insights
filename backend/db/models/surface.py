"""Climate surface index models — SURFACE_CONTRACT_V2 §3.

The rasters live on S3 as Cloud Optimized GeoTIFFs. Postgres holds only the
index and the validation statistics, so one query locates any surface and
reports how accurate it is. **Nothing here stores pixels.**

Tables created by `alembic/versions/surface_index_tables.py`; `cv_units` added
by `surface_cv_units.py`. The constraint reasoning lives in those migrations and
is not repeated here — but two shapes are load-bearing enough to restate,
because they look like mistakes otherwise:

* `SurfaceRun.statistic` is NULL for daily/hourly and required for
  monthly/records, so uniqueness is enforced by two PARTIAL indexes rather than
  one constraint. Postgres treats NULLs as distinct, so a plain unique
  constraint over a nullable column would never collide on daily rows.

* `SurfaceValidationStats` has **no FK to SurfaceRun** and is not a child of it.
  Its grain is one FIT — (variable, valid_on, resolution_m, model_version) —
  whereas a single month of temp_min is ~14 rasters produced from ~30 daily
  fits. A per-raster FK would duplicate identical statistics fourteen times and
  still have no single row to point at.
"""

from sqlalchemy import (
    Column, BigInteger, Integer, Text, Boolean, Float, Date, DateTime, func
)

from db.base_class import Base


class SurfaceRun(Base):
    """One produced raster object on S3.

    A row is an *object*, not a fit: `temp_min` for 2020-07 is ten rows sharing
    a `valid_at` and differing only by `statistic`.
    """
    __tablename__ = 'surface_run'

    id = Column(BigInteger, primary_key=True, autoincrement=True)

    variable = Column(Text, nullable=False)
    granularity = Column(Text, nullable=False)     # daily|hourly|monthly|records
    statistic = Column(Text, nullable=True)        # NULL only for daily/hourly

    # daily -> midnight UTC; monthly -> first instant of the month;
    # records -> the END of the covered period.
    valid_at = Column(DateTime(timezone=True), nullable=False)
    # Only set for `records`. Without both bounds "all-time" silently changes
    # meaning every time the archive is extended.
    period_start = Column(DateTime(timezone=True), nullable=True)

    resolution_m = Column(Integer, nullable=False)
    model_version = Column(Text, nullable=False)
    engine = Column(Text, nullable=True)

    s3_key = Column(Text, nullable=False)
    s3_key_sd = Column(Text, nullable=True)

    n_stations_fit = Column(Integer, nullable=True)
    n_stations_test = Column(Integer, nullable=True)
    n_stations_excluded = Column(Integer, nullable=True)
    relevance_km = Column(Float, nullable=True)

    smoothing = Column(Float, nullable=True)
    edf = Column(Float, nullable=True)
    edf_frac = Column(Float, nullable=True)

    # Summary of the fits behind this object, so /point and /available answer
    # from one row without a join. For daily the two agree; for monthly they do
    # not, and the max is the honest one to show beside a monthly extreme.
    cv_rmse = Column(Float, nullable=True)
    cv_rmse_max = Column(Float, nullable=True)
    # 'C' | 'mm' | 'ratio'. Rainfall is fitted in ratio space, so its cv_rmse is
    # DIMENSIONLESS (~0.0025) and must never be rendered as millimetres.
    cv_units = Column(Text, nullable=True)

    clipped = Column(Boolean, nullable=True)
    status = Column(Text, nullable=False, server_default='ok')  # ok|degraded|failed
    created_at = Column(DateTime(timezone=True), server_default=func.now(),
                        nullable=False)

    def __repr__(self) -> str:
        return (f"<SurfaceRun {self.variable}/{self.granularity}"
                f"/{self.statistic} {self.valid_at}>")


class SurfaceValidationStats(Base):
    """Out-of-sample accuracy for one FIT — one variable on one day.

    Mirrors `validation_stats.csv` from `run_history.py` row for row.
    """
    __tablename__ = 'surface_validation_stats'

    id = Column(BigInteger, primary_key=True, autoincrement=True)

    variable = Column(Text, nullable=False)
    valid_on = Column(Date, nullable=False)
    resolution_m = Column(Integer, nullable=False)
    model_version = Column(Text, nullable=False)

    n_fit = Column(Integer, nullable=True)
    n_test = Column(Integer, nullable=True)

    # THE published number: shuffled 10-fold CV, lambda re-selected inside each
    # fold, with production's clip applied. Contract §3.3.
    cv_rmse = Column(Float, nullable=True)
    # In-sample residual. NEVER publish it — it measures how hard the surface
    # smoothed, not how right it is. At the CV-selected smoothing the spline
    # near-interpolates its own training points, so this reads ~0.02 degC.
    rmse = Column(Float, nullable=True)
    # Declustered holdout; only meaningful at n_test >= 10, which is rare.
    t_rmse = Column(Float, nullable=True)
    # Retained for schema stability only. mean(y)/rmse is origin-dependent — the
    # same surface in Kelvin scores ~15x higher. Use edf_frac instead.
    snr = Column(Float, nullable=True)
    mae = Column(Float, nullable=True)
    bias = Column(Float, nullable=True)
    r2 = Column(Float, nullable=True)
    max_abs_error = Column(Float, nullable=True)

    edf = Column(Float, nullable=True)
    lam = Column(Float, nullable=True)

    # See SurfaceRun.cv_units.
    cv_units = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(),
                        nullable=False)

    def __repr__(self) -> str:
        return f"<SurfaceValidationStats {self.variable} {self.valid_on}>"
