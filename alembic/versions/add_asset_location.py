"""Add spatial location columns to assets table.

Renames text `location` → `location_label`, adds PostGIS POINT and GEOMETRY
columns so assets can be mapped on GIS layers.

Revision ID: add_asset_location
Revises: r2_external_aliases
Create Date: 2026-04-02

"""
from alembic import op

revision = 'add_asset_location'
down_revision = 'r2_external_aliases'
branch_labels = None
depends_on = None


def upgrade():
    # Rename existing text location → location_label
    op.alter_column('assets', 'location', new_column_name='location_label')

    # Add PostGIS spatial columns
    op.execute("ALTER TABLE assets ADD COLUMN location_point geometry(POINT, 4326)")
    op.execute("ALTER TABLE assets ADD COLUMN location_geometry geometry(GEOMETRY, 4326)")

    # Spatial indexes for map queries
    op.execute("CREATE INDEX ix_assets_location_point ON assets USING GIST (location_point)")
    op.execute("CREATE INDEX ix_assets_location_geometry ON assets USING GIST (location_geometry)")


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_assets_location_geometry")
    op.execute("DROP INDEX IF EXISTS ix_assets_location_point")
    op.execute("ALTER TABLE assets DROP COLUMN IF EXISTS location_geometry")
    op.execute("ALTER TABLE assets DROP COLUMN IF EXISTS location_point")
    op.alter_column('assets', 'location_label', new_column_name='location')
