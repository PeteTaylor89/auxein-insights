"""The point disease path: per-site hourly climate and per-site disease pressure.

Mirrors `climate_zone_hourly` and `disease_pressure` one level down. The models
are identical — only the spatial source changes, from "average the stations
assigned to this zone" to "interpolate the stations near this point".

## Why a point path exists at all, and it is not accuracy

The argument is REACH. 130 hygrometers are invisible to the zone path because
they are assigned to no zone, and six zones rest on a single hygrometer, so one
sensor fault swings a whole region. Waiheke has no station and no zone disease at
all. Interpolation reaches several times the humidity network that zone
assignment does, without a worksheet.

## What is deliberately NOT mirrored

`climate_zone_hourly` carries `rh_min` / `rh_max` / `temp_min` / `temp_max`
across its member STATIONS. At a point there are no members — the value is one
interpolated estimate — so a min and a max would either restate the mean or
describe the neighbours rather than the site. Only what the models read is
stored, plus the provenance needed to judge it.

## The provenance columns are the point of this table

`*_station_count` and `*_nearest_km` are stored per variable, not per row,
because the three variables refuse at different distances and a row is routinely
complete for temperature and empty for humidity. A single "confidence" cannot
express that, and a reader who cannot see it will assume the humidity was
measured nearby.

Revision ID: site_hourly_disease
Revises: site_gdd_columns
Create Date: 2026-08-30
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'site_hourly_disease'
down_revision = 'site_gdd_columns'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'insights_site_hourly',
        sa.Column('site_id', sa.BigInteger(), nullable=False),
        sa.Column('timestamp_utc', sa.DateTime(timezone=True), nullable=False),
        sa.Column('timestamp_local', sa.DateTime(), nullable=True),
        sa.Column('vintage_year', sa.Integer(), nullable=True),

        sa.Column('temp_mean', sa.Float(), nullable=True),
        sa.Column('rh_mean', sa.Float(), nullable=True),
        sa.Column('dewpoint', sa.Float(), nullable=True),
        sa.Column('precipitation', sa.Float(), nullable=True),
        sa.Column('wind_mean', sa.Float(), nullable=True),

        sa.Column('is_wet_hour', sa.Boolean(), nullable=True),
        sa.Column('wetness_probability', sa.Float(), nullable=True),
        sa.Column('wetness_source', sa.String(20), nullable=True),
        sa.Column('hours_since_rain', sa.Integer(), nullable=True),

        sa.Column('temp_station_count', sa.Integer(), nullable=True),
        sa.Column('temp_nearest_km', sa.Float(), nullable=True),
        sa.Column('rh_station_count', sa.Integer(), nullable=True),
        sa.Column('rh_nearest_km', sa.Float(), nullable=True),
        sa.Column('rain_station_count', sa.Integer(), nullable=True),
        sa.Column('rain_nearest_km', sa.Float(), nullable=True),
        sa.Column('wind_station_count', sa.Integer(), nullable=True),

        sa.Column('confidence', sa.String(10), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('site_id', 'timestamp_utc'),
        sa.ForeignKeyConstraint(['site_id'], ['insights_site.id'],
                                ondelete='CASCADE'),
    )
    # The disease pass reads one site over a date range, and the wetness carry
    # walks it in order. Both are this index.
    op.create_index('ix_site_hourly_site_ts', 'insights_site_hourly',
                    ['site_id', 'timestamp_utc'])

    op.create_table(
        'insights_site_disease',
        sa.Column('site_id', sa.BigInteger(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('vintage_year', sa.Integer(), nullable=True),

        sa.Column('powdery_mildew_risk', sa.String(10), nullable=True),
        sa.Column('downy_mildew_risk', sa.String(10), nullable=True),
        sa.Column('botrytis_risk', sa.String(10), nullable=True),

        sa.Column('pm_daily_index', sa.Numeric(), nullable=True),
        sa.Column('pm_cumulative_index', sa.Numeric(), nullable=True),
        sa.Column('pm_favorable_hours', sa.Integer(), nullable=True),
        sa.Column('pm_lethal_hours', sa.Integer(), nullable=True),

        sa.Column('botrytis_severity', sa.Numeric(), nullable=True),
        sa.Column('botrytis_cumulative', sa.Numeric(), nullable=True),
        sa.Column('botrytis_wet_hours', sa.Integer(), nullable=True),
        sa.Column('botrytis_sporulation_index', sa.Numeric(), nullable=True),

        sa.Column('dm_primary_met', sa.Boolean(), nullable=True),
        sa.Column('dm_primary_score', sa.Numeric(), nullable=True),
        sa.Column('dm_goidanich_index', sa.Numeric(), nullable=True),

        sa.Column('growth_stage', sa.String(30), nullable=True),
        # False means the models ran WITHOUT humidity, which changes what the
        # botrytis and downy numbers mean. It is not a diagnostic flag.
        sa.Column('humidity_available', sa.Boolean(), nullable=True),
        sa.Column('hours_used', sa.Integer(), nullable=True),
        sa.Column('risk_factors', postgresql.JSONB(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('site_id', 'date'),
        sa.ForeignKeyConstraint(['site_id'], ['insights_site.id'],
                                ondelete='CASCADE'),
    )
    # `get_previous_state` orders by date within a vintage for one site.
    op.create_index('ix_site_disease_site_vintage_date', 'insights_site_disease',
                    ['site_id', 'vintage_year', 'date'])


def downgrade():
    op.drop_index('ix_site_disease_site_vintage_date',
                  table_name='insights_site_disease')
    op.drop_table('insights_site_disease')
    op.drop_index('ix_site_hourly_site_ts', table_name='insights_site_hourly')
    op.drop_table('insights_site_hourly')
