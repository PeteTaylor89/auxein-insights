"""Add monthly frost-day columns to climate history + baseline.

Mirrors the Rx1day monthly columns: per-month frost-day counts (Tmin < 0) on
climate_history_monthly, plus the monthly normal on climate_baseline_monthly.

Revision ID: add_monthly_frost
Revises: add_climate_extremes
Create Date: 2026-06-12
"""
from alembic import op
import sqlalchemy as sa


revision = 'add_monthly_frost'
down_revision = 'add_climate_extremes'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('climate_history_monthly', sa.Column('frost_days_mean', sa.Numeric(6, 2), nullable=True))
    op.add_column('climate_history_monthly', sa.Column('frost_days_sd', sa.Numeric(6, 2), nullable=True))
    op.add_column('climate_baseline_monthly', sa.Column('frost_days_mean', sa.Numeric(6, 2), nullable=True))
    op.add_column('climate_baseline_monthly', sa.Column('frost_days_sd', sa.Numeric(6, 2), nullable=True))


def downgrade() -> None:
    op.drop_column('climate_baseline_monthly', 'frost_days_sd')
    op.drop_column('climate_baseline_monthly', 'frost_days_mean')
    op.drop_column('climate_history_monthly', 'frost_days_sd')
    op.drop_column('climate_history_monthly', 'frost_days_mean')
