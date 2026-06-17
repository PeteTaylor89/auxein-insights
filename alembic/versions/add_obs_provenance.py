"""Add observation provenance columns + SYNOP/NOAA data sources.

Phase B0 of NOAA_NCEI_INGESTION_SCOPE.md — groundwork for the two-tier
provisional (SYNOP) -> authoritative (NOAA/NIWA) ingestion.

Adds to the real observations table `timeseries_observations`:
  - source        VARCHAR(20)  — provenance tag (SYNOP | GHCNH | GHCND | ...)
  - quality_flags JSONB        — raw per-source flags (COR, derived, GHCN attrs)
  - quality_rank  SMALLINT     — promotion lifecycle: 1=PROVISIONAL, 2=CONFIRMED,
                                 3=AUTHORITATIVE. Default 3 so existing rows
                                 (council Hilltop + Harvest) are authoritative
                                 and a provisional SYNOP row can never overwrite
                                 them (see upsert-with-precedence in §9.6).

The `weather_data` back-compat view is recreated as SELECT * so callers that
write through the view can also write the new columns.

Seeds:
  - data_sources: SYNOP_GTS, NOAA_GHCND, NOAA_GHCNH (no credentials, global).
  - measurement_catalog: pressure_msl (the only SYNOP variable not already
    present; temp/rh/rainfall/pressure/wind_speed/wind_direction/dewpoint exist).

Prod-safety (§1a): every ADD COLUMN is nullable or has a constant default, so
in PostgreSQL 11+ they are metadata-only (no table rewrite, no long lock) and
the currently deployed backend keeps inserting unchanged.

Revision ID: add_obs_provenance
Revises: add_monthly_frost
Create Date: 2026-06-17
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = 'add_obs_provenance'
down_revision = 'add_monthly_frost'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # Provenance columns on the real observations table.
    # NB: the physical table is `timeseries_observations`; `weather_data`
    # is a SELECT * back-compat view (see rename_to_devices_timeseries).
    # ------------------------------------------------------------------
    op.add_column('timeseries_observations',
                  sa.Column('source', sa.String(20), nullable=True))
    op.add_column('timeseries_observations',
                  sa.Column('quality_flags', postgresql.JSONB, nullable=True))
    op.add_column('timeseries_observations',
                  sa.Column('quality_rank', sa.SmallInteger(),
                            nullable=False, server_default=sa.text('3')))

    # Recreate the passthrough view so the new columns are visible to callers
    # that write/read through `weather_data`. CREATE OR REPLACE re-expands * to
    # the current column set (new columns appended at the end — allowed).
    op.execute("CREATE OR REPLACE VIEW weather_data AS SELECT * FROM timeseries_observations;")

    # ------------------------------------------------------------------
    # data_sources — SYNOP (live, Unidata IDD) + NOAA NCEI (authoritative)
    # ------------------------------------------------------------------
    op.execute("""
        INSERT INTO data_sources (code, name, kind, api_pattern, base_url, requires_credentials, country_id, notes)
        VALUES
          ('SYNOP_GTS', 'WMO SYNOP (Unidata IDD / GTS)', 'weather', 'ldm', NULL, false, NULL,
           'Near-real-time FM-12 SYNOP via Unidata IDS|DDPLUS feed. Provisional tier (quality_rank=1), promoted by NOAA reconcile.'),
          ('NOAA_GHCND', 'NOAA NCEI GHCN-Daily', 'weather', 'rest',
           'https://www.ncei.noaa.gov/access/services/data/v1', false, NULL,
           'Authoritative daily summaries (TMAX/TMIN/PRCP). Deep history; ~2-week lag. Backfill from 2022-01-01.'),
          ('NOAA_GHCNH', 'NOAA NCEI GHCN-hourly', 'weather', 'rest',
           'https://www.ncei.noaa.gov/access/services/data/v1', false, NULL,
           'Authoritative hourly (temp/RH/dewpoint/wind/pressure). Reconciliation + backfill source from 2025-09-01.')
        ON CONFLICT (code) DO NOTHING;
    """)

    # ------------------------------------------------------------------
    # measurement_catalog — only pressure_msl is new (rest already seeded)
    # ------------------------------------------------------------------
    op.execute("""
        INSERT INTO measurement_catalog
          (code, display_name, canonical_unit, value_type, rollup_method, domain, display_order, description)
        VALUES
          ('pressure_msl', 'Mean Sea-Level Pressure', 'hPa', 'continuous', 'mean', 'weather', 55,
           'Pressure reduced to mean sea level (SYNOP 4PPPP group).')
        ON CONFLICT (code) DO NOTHING;
    """)


def downgrade() -> None:
    op.execute("DELETE FROM measurement_catalog WHERE code = 'pressure_msl';")
    op.execute("DELETE FROM data_sources WHERE code IN ('SYNOP_GTS','NOAA_GHCND','NOAA_GHCNH');")

    # Drop the new columns, then refresh the view to match.
    op.drop_column('timeseries_observations', 'quality_rank')
    op.drop_column('timeseries_observations', 'quality_flags')
    op.drop_column('timeseries_observations', 'source')
    op.execute("CREATE OR REPLACE VIEW weather_data AS SELECT * FROM timeseries_observations;")
