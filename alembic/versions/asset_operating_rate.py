"""An operating rate on equipment, so machinery time can be costed.

Revision ID: asset_operating_rate
Revises: task_costing_tables
Create Date: 2026-08-28

Two nullable columns on `assets`. Nullable is the point: an asset with no rate
is UNCOSTED, not free, and the costing service emits NULL rather than 0.00 for
it — a zero would read as "the tractor cost nothing" and quietly become part of
a total someone trusts.

`rate_basis` records where the figure came from. Today every rate is entered by
hand, but the raw material for deriving one is already in the model —
`depreciation_rate` against `current_value`, `fuel_efficiency_standard` in L/hr,
and a full AssetMaintenance cost history with `asset_hours_at_maintenance`. When
that derivation exists, the two kinds of number must be tellable apart: a
derived rate that moves when maintenance costs move is a different claim from
one a person typed and stands behind.

NOTE for whoever runs this: `settings.DATABASE_URL` resolves to the shared RDS
instance for local runs too, so these columns must exist BEFORE the model
declares them, or every ORM query against `assets` 500s locally while prod
stays fine.
"""
from alembic import op
import sqlalchemy as sa

revision = 'asset_operating_rate'
down_revision = 'task_costing_tables'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('assets', sa.Column('hourly_operating_rate', sa.Numeric(10, 2), nullable=True))
    op.add_column('assets', sa.Column('rate_basis', sa.String(20), nullable=True))
    op.create_check_constraint(
        'ck_assets_operating_rate_non_negative',
        'assets',
        'hourly_operating_rate IS NULL OR hourly_operating_rate >= 0',
    )


def downgrade():
    op.drop_constraint('ck_assets_operating_rate_non_negative', 'assets', type_='check')
    op.drop_column('assets', 'rate_basis')
    op.drop_column('assets', 'hourly_operating_rate')
