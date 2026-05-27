"""Add property_id FK to contractor_movements.

Contractor check-in is currently only company-level; the property the
contractor is actually working on lived in a "Property: X" prefix on the
notes string. That blocks any property-scoped behaviour driven by the
active check-in (map filtering, create-task pre-fill, geofence).

Nullable so existing rows stay valid. FK is SET NULL on property delete so
historical movement records survive a property being removed.

Revision ID: add_movement_property_fk
Revises: add_calibration_specs
Create Date: 2026-05-27
"""
from alembic import op
import sqlalchemy as sa


revision = 'add_movement_property_fk'
down_revision = 'add_calibration_specs'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'contractor_movements',
        sa.Column('property_id', sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        'fk_contractor_movements_property_id',
        'contractor_movements',
        'properties',
        ['property_id'],
        ['id'],
        ondelete='SET NULL',
    )
    op.create_index(
        'ix_contractor_movements_property_id',
        'contractor_movements',
        ['property_id'],
    )


def downgrade():
    op.drop_index('ix_contractor_movements_property_id', table_name='contractor_movements')
    op.drop_constraint('fk_contractor_movements_property_id', 'contractor_movements', type_='foreignkey')
    op.drop_column('contractor_movements', 'property_id')
