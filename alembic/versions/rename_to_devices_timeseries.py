"""Rename weather_stations -> devices, weather_data -> timeseries_observations.

Phase 0.3 of DATA_INGESTION_PLATFORM_PLAN.md.

Pragmatic split from the original Phase 0 plan: **table rename only, no column
rename**. Creates passthrough back-compat views `weather_stations` /
`weather_data` so every existing caller (climate pipeline, ingestion classes,
admin_weather endpoints, SQLAlchemy models) keeps working unchanged.

Column renames (station_id -> id, station_code -> device_code, station_name ->
name, variable -> measurement_code) are deferred to a future migration once
callers have been audited. Keeping the old column names avoids ON CONFLICT
alias edge cases through updatable views, and lets us ship Phase 0 with zero
risk to Regional Insights.

Changes:
  - weather_stations -> devices (table rename; FKs from weather_data_daily and
    device_measurements auto-follow the rename in Postgres)
  - weather_data -> timeseries_observations (table rename)
  - PK + unique constraints follow the table (no rename needed; their names
    are left as-is, e.g. weather_stations_pkey, weather_data_pkey).
  - Views: weather_stations, weather_data (simple SELECT *; auto-updatable per
    PostgreSQL 9.3+ updatable view rules).

Revision ID: rename_to_devices_timeseries
Revises: add_data_platform_columns
Create Date: 2026-04-20
"""
from alembic import op


revision = 'rename_to_devices_timeseries'
down_revision = 'add_data_platform_columns'
branch_labels = None
depends_on = None


def upgrade():
    # ------------------------------------------------------------------
    # Physical table renames
    # ------------------------------------------------------------------
    op.rename_table('weather_stations', 'devices')
    op.rename_table('weather_data', 'timeseries_observations')

    # ------------------------------------------------------------------
    # Back-compat views (passthrough, auto-updatable)
    # ------------------------------------------------------------------
    # Simple SELECT * means Postgres treats these as updatable views:
    # INSERT / UPDATE / DELETE on the view routes to the underlying table,
    # and ON CONFLICT clauses resolve against the underlying constraints.
    op.execute("CREATE VIEW weather_stations AS SELECT * FROM devices;")
    op.execute("CREATE VIEW weather_data AS SELECT * FROM timeseries_observations;")


def downgrade():
    op.execute("DROP VIEW IF EXISTS weather_data;")
    op.execute("DROP VIEW IF EXISTS weather_stations;")

    op.rename_table('timeseries_observations', 'weather_data')
    op.rename_table('devices', 'weather_stations')
