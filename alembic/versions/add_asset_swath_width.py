"""Add swath_width_m to assets.

A physical property of tractor-mounted implements (sprayers, spreaders) — the
effective application width in metres. Paired with the asset's calibrated
output rate (L/s) and the task's GPS-derived speed (m/s) at task time to
compute application rate per m² and build coverage maps.

Lives on the asset (not duplicated per calibration spec) because swath is a
physical property of the implement, independent of which substance is being
applied.

Numeric(6, 2) — realistic range is 0.5 to ~30 m; the column accommodates up
to 9999.99 m which is generous future-proofing.

Revision ID: add_asset_swath_width
Revises: add_contractor_reset_token
Create Date: 2026-05-27
"""
from alembic import op
import sqlalchemy as sa


revision = 'add_asset_swath_width'
down_revision = 'add_contractor_reset_token'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'assets',
        sa.Column('swath_width_m', sa.Numeric(6, 2), nullable=True),
    )


def downgrade():
    op.drop_column('assets', 'swath_width_m')
