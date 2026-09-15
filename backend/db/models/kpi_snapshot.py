# db/models/kpi_snapshot.py — monthly platform KPI measurements.
#
# One row per (snapshot_date, metric_key). Written by the monthly job, the
# backfill script, and the manual-history seed. Read by GET /api/v1/admin/kpis.
#
# Scoped in docs/plans/KPI_DASHBOARD_SCOPE_2026-09-15.md.
from sqlalchemy import (
    Column, BigInteger, String, Date, Numeric, JSON, DateTime, UniqueConstraint, Index
)
from sqlalchemy.sql import func

from db.base_class import Base


class KpiSnapshot(Base):
    __tablename__ = "kpi_snapshots"

    id = Column(BigInteger, primary_key=True, index=True)

    # Always the 1st of a month. The value is the state AT that instant, so the
    # row dated 2026-09-01 describes the month that ended 31 August.
    snapshot_date = Column(Date, nullable=False)

    # e.g. 'insights.verified_users', 'grow.ha_managed'. A string rather than a
    # column per metric so adding a KPI is an INSERT, not a migration.
    metric_key = Column(String(64), nullable=False)

    # Numeric because hectares and percentages share this column with counts.
    #
    # For a STOCK metric this is the level at the snapshot. For a FLOW metric it
    # is the cumulative total to date, and `period_value` carries that month's
    # increment. A running total of a stock metric would re-count the same users
    # every month, which is why the two are not the same column.
    value = Column(Numeric(18, 4), nullable=False)
    period_value = Column(Numeric(18, 4), nullable=True)

    # The definition in force when the row was taken: which hectare source,
    # which MAU rule, which exclusions, and `source` = 'computed' | 'manual'.
    # Without it a definition change silently rewrites history.
    meta = Column(JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        # Makes every writer idempotent — a re-run upserts instead of duplicating.
        UniqueConstraint("snapshot_date", "metric_key", name="uq_kpi_snapshot"),
        Index("ix_kpi_snapshots_metric_date", "metric_key", "snapshot_date"),
    )

    def __repr__(self):
        return f"<KpiSnapshot {self.snapshot_date} {self.metric_key}={self.value}>"
