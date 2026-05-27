"""Add asset_calibration_specs table.

Today the Asset row stores a single calibration spec inline (calibration_type +
parameter/unit/target/tolerance_min/tolerance_max + interval_days). That limits
each asset to one auto-respawning calibration type, even though the schedule
table happily supports multiple via the partial unique index on
(asset_id, calibration_type) WHERE status='pending'.

This table normalises the spec into its own row per type, so:
- A sprayer can hold both a `pressure` spec (every 30 days) AND a
  `spray_output_rate` spec (every 90 days), and BOTH auto-respawn.
- The auto-respawn handler in create_calibration_record looks up the spec by
  (asset_id, calibration_type) to know the next interval + spec snapshot.
- Schedules and event rows continue to carry their own snapshot of the spec
  so historical events stay stable if a spec is later edited.

The legacy columns on `assets` (`calibration_type`, `calibration_parameter_name`,
…, `calibration_interval_days`) stay in place for one release as a fallback,
populated for assets that haven't migrated. They'll be dropped once the multi-
spec UI has been beta-tested and confirmed correct.

Backfill: every asset with requires_calibration=True AND calibration_type set
gets a single spec row copied from its existing columns.

Revision ID: add_calibration_specs
Revises: add_asset_swath_width
Create Date: 2026-05-27
"""
from alembic import op
import sqlalchemy as sa


revision = 'add_calibration_specs'
down_revision = 'add_asset_swath_width'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'asset_calibration_specs',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('asset_id', sa.Integer(), sa.ForeignKey('assets.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id'), nullable=False, index=True),
        sa.Column('calibration_type', sa.String(length=50), nullable=False),
        sa.Column('parameter_name', sa.String(length=100), nullable=True),
        sa.Column('unit_of_measure', sa.String(length=20), nullable=True),
        sa.Column('target_value', sa.Numeric(12, 4), nullable=True),
        sa.Column('tolerance_min', sa.Numeric(12, 4), nullable=True),
        sa.Column('tolerance_max', sa.Numeric(12, 4), nullable=True),
        sa.Column('interval_days', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now(), nullable=True),
    )
    op.create_index(
        'ix_asset_calibration_specs_active_unique',
        'asset_calibration_specs',
        ['asset_id', 'calibration_type'],
        unique=True,
        postgresql_where=sa.text('is_active'),
    )

    # Backfill: copy each asset's inline spec to a row in the new table.
    op.execute("""
        INSERT INTO asset_calibration_specs (
            asset_id, company_id, calibration_type,
            parameter_name, unit_of_measure,
            target_value, tolerance_min, tolerance_max,
            interval_days, is_active
        )
        SELECT
            id, company_id, calibration_type,
            calibration_parameter_name, calibration_unit_of_measure,
            calibration_target_value, calibration_tolerance_min, calibration_tolerance_max,
            calibration_interval_days, TRUE
        FROM assets
        WHERE requires_calibration = TRUE
          AND calibration_type IS NOT NULL
          AND calibration_type <> ''
    """)


def downgrade():
    op.drop_index('ix_asset_calibration_specs_active_unique', table_name='asset_calibration_specs')
    op.drop_table('asset_calibration_specs')
