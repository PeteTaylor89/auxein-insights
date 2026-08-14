"""Index ingestion_log for the admin summary and log views.

`ingestion_log` carried only its primary key on `log_id`, while every read path
against it filters on `logged_at` and usually also on `data_source`:

  - /api/v1/admin/weather/ingestion/summary  — GROUP BY data_source over a
    rolling window (~120k rows in 7 days, 268k rows in the table)
  - /api/v1/admin/weather/ingestion/logs     — filter + ORDER BY logged_at DESC
  - the retention cleanup                    — DELETE WHERE logged_at < cutoff

All three were sequential scans. The composite index serves the summary's
grouped filter, and the `logged_at DESC` index serves the paginated log view's
sort without a separate sort step.

Created CONCURRENTLY: the ingestion schedulers write to this table continuously,
and a plain CREATE INDEX takes a lock that would stall them for the duration.
That requires running outside a transaction, hence the autocommit block.

Revision ID: ingestion_log_idx
Revises: surface_index_tables
Create Date: 2026-08-14
"""
from alembic import op

revision = 'ingestion_log_idx'
down_revision = 'surface_index_tables'
branch_labels = None
depends_on = None


def upgrade():
    with op.get_context().autocommit_block():
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_ingestion_log_source_logged_at "
            "ON ingestion_log (data_source, logged_at DESC)"
        )
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_ingestion_log_logged_at "
            "ON ingestion_log (logged_at DESC)"
        )


def downgrade():
    with op.get_context().autocommit_block():
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_ingestion_log_logged_at")
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_ingestion_log_source_logged_at")
