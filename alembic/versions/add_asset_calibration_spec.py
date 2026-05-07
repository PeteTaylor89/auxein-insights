"""Add persistent calibration spec fields to assets.

Six nullable columns capture the asset's default calibration spec
(type/parameter/unit/target/tol_min/tol_max). When set, every new schedule for the
asset inherits these so field workers see the right tolerances on the mobile form.
The asset is the source of truth; event rows snapshot the spec for audit.

Prod safety:
  - All columns nullable, no defaults required.
  - Existing assets continue to work — their schedules just won't carry tolerances
    until an admin fills in the asset's spec.

Revision ID: add_asset_calibration_spec
Revises: add_calibration_schedules
Create Date: 2026-05-07
"""
from alembic import op
import sqlalchemy as sa


revision = 'add_asset_calibration_spec'
down_revision = 'add_calibration_schedules'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('assets', sa.Column('calibration_type', sa.String(50), nullable=True))
    op.add_column('assets', sa.Column('calibration_parameter_name', sa.String(100), nullable=True))
    op.add_column('assets', sa.Column('calibration_unit_of_measure', sa.String(20), nullable=True))
    op.add_column('assets', sa.Column('calibration_target_value', sa.Numeric(12, 4), nullable=True))
    op.add_column('assets', sa.Column('calibration_tolerance_min', sa.Numeric(12, 4), nullable=True))
    op.add_column('assets', sa.Column('calibration_tolerance_max', sa.Numeric(12, 4), nullable=True))


def downgrade():
    op.drop_column('assets', 'calibration_tolerance_max')
    op.drop_column('assets', 'calibration_tolerance_min')
    op.drop_column('assets', 'calibration_target_value')
    op.drop_column('assets', 'calibration_unit_of_measure')
    op.drop_column('assets', 'calibration_parameter_name')
    op.drop_column('assets', 'calibration_type')
