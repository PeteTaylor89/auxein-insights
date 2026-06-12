"""Add climate extreme metrics — seasonal stats/baseline, projection extremes, Rx1day.

Seasonal extremes (FD, spring frost, last frost, TX30, R99p) per zone/season and
their 1987-2006 baseline; projected extremes per SSP/period; and monthly Rx1day
(max 1-day rainfall) columns on the existing monthly history + baseline tables.

Revision ID: add_climate_extremes
Revises: add_task_source_task_id
Create Date: 2026-06-12
"""
from alembic import op
import sqlalchemy as sa


revision = 'add_climate_extremes'
down_revision = 'add_task_source_task_id'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- Rx1day columns on existing monthly tables ---
    op.add_column('climate_history_monthly', sa.Column('rx1day_mean', sa.Numeric(8, 2), nullable=True))
    op.add_column('climate_history_monthly', sa.Column('rx1day_sd', sa.Numeric(8, 2), nullable=True))
    op.add_column('climate_baseline_monthly', sa.Column('rx1day_mean', sa.Numeric(8, 2), nullable=True))
    op.add_column('climate_baseline_monthly', sa.Column('rx1day_sd', sa.Numeric(8, 2), nullable=True))

    # --- Per-season seasonal extreme stats ---
    op.create_table(
        'climate_zone_season_stats',
        sa.Column('id', sa.BigInteger(), primary_key=True),
        sa.Column('zone_id', sa.Integer(), sa.ForeignKey('climate_zones.id'), nullable=False),
        sa.Column('vintage_year', sa.Integer(), nullable=False),
        sa.Column('last_frost_doy', sa.Numeric(6, 2), nullable=True),
        sa.Column('last_frost_date', sa.String(10), nullable=True),
        sa.Column('early_frost_mean', sa.Numeric(6, 2), nullable=True),
        sa.Column('early_frost_sd', sa.Numeric(6, 2), nullable=True),
        sa.Column('frost_days_mean', sa.Numeric(6, 2), nullable=True),
        sa.Column('frost_days_sd', sa.Numeric(6, 2), nullable=True),
        sa.Column('hot_days30_mean', sa.Numeric(6, 2), nullable=True),
        sa.Column('hot_days30_sd', sa.Numeric(6, 2), nullable=True),
        sa.Column('r99p_mean', sa.Numeric(8, 2), nullable=True),
        sa.Column('r99p_sd', sa.Numeric(8, 2), nullable=True),
        sa.Column('source', sa.String(12), nullable=False, server_default='modelled'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint('zone_id', 'vintage_year', name='uq_season_stats_zone_vintage'),
    )
    op.create_index('idx_season_stats_zone_vintage', 'climate_zone_season_stats', ['zone_id', 'vintage_year'])

    # --- Seasonal extreme baseline (1987-2006 normal) ---
    op.create_table(
        'climate_zone_season_baseline',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('zone_id', sa.Integer(), sa.ForeignKey('climate_zones.id'), nullable=False),
        sa.Column('baseline_period', sa.String(20), nullable=True),
        sa.Column('last_frost_doy_mean', sa.Numeric(6, 2), nullable=True),
        sa.Column('last_frost_doy_sd', sa.Numeric(6, 2), nullable=True),
        sa.Column('last_frost_date', sa.String(10), nullable=True),
        sa.Column('early_frost_mean', sa.Numeric(6, 2), nullable=True),
        sa.Column('early_frost_sd', sa.Numeric(6, 2), nullable=True),
        sa.Column('frost_days_mean', sa.Numeric(6, 2), nullable=True),
        sa.Column('frost_days_sd', sa.Numeric(6, 2), nullable=True),
        sa.Column('hot_days30_mean', sa.Numeric(6, 2), nullable=True),
        sa.Column('hot_days30_sd', sa.Numeric(6, 2), nullable=True),
        sa.Column('r99p_mean', sa.Numeric(8, 2), nullable=True),
        sa.Column('r99p_sd', sa.Numeric(8, 2), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint('zone_id', name='uq_season_baseline_zone'),
    )

    # --- Projected seasonal extremes per SSP/period ---
    op.create_table(
        'climate_projection_extremes',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('zone_id', sa.Integer(), sa.ForeignKey('climate_zones.id'), nullable=False),
        sa.Column('ssp', sa.String(10), nullable=False),
        sa.Column('period', sa.String(20), nullable=False),
        sa.Column('frost_days_baseline', sa.Numeric(8, 2), nullable=True),
        sa.Column('frost_days_delta', sa.Numeric(8, 2), nullable=True),
        sa.Column('frost_days_projected', sa.Numeric(8, 2), nullable=True),
        sa.Column('spring_frost_baseline', sa.Numeric(8, 2), nullable=True),
        sa.Column('spring_frost_delta', sa.Numeric(8, 2), nullable=True),
        sa.Column('spring_frost_projected', sa.Numeric(8, 2), nullable=True),
        sa.Column('hot_days30_baseline', sa.Numeric(8, 2), nullable=True),
        sa.Column('hot_days30_delta', sa.Numeric(8, 2), nullable=True),
        sa.Column('hot_days30_projected', sa.Numeric(8, 2), nullable=True),
        sa.Column('r99p_baseline', sa.Numeric(8, 2), nullable=True),
        sa.Column('r99p_delta', sa.Numeric(8, 2), nullable=True),
        sa.Column('r99p_projected', sa.Numeric(8, 2), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint('zone_id', 'ssp', 'period', name='uq_projection_extremes'),
    )
    op.create_index('idx_projection_extremes_zone', 'climate_projection_extremes', ['zone_id'])


def downgrade() -> None:
    op.drop_index('idx_projection_extremes_zone', table_name='climate_projection_extremes')
    op.drop_table('climate_projection_extremes')
    op.drop_table('climate_zone_season_baseline')
    op.drop_index('idx_season_stats_zone_vintage', table_name='climate_zone_season_stats')
    op.drop_table('climate_zone_season_stats')
    op.drop_column('climate_baseline_monthly', 'rx1day_sd')
    op.drop_column('climate_baseline_monthly', 'rx1day_mean')
    op.drop_column('climate_history_monthly', 'rx1day_sd')
    op.drop_column('climate_history_monthly', 'rx1day_mean')
