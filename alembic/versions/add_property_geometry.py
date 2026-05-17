"""Add nullable geometry column to properties for boundary polygons.

V1 contractor geofencing primitive: a property can carry a POLYGON or
MULTIPOLYGON outline used by the mobile contractor app to detect when a
contractor enters the property. SRID 4326 (WGS84) matches the rest of the
PostGIS schema (blocks, spatial_areas).

Prod safety:
  - Column is nullable; existing properties carry NULL until an admin draws a
    boundary on the new Maps V2 drawing UI (Sprint 3).
  - GIST spatial index added so future point-in-polygon queries are cheap.

Revision ID: add_property_geometry
Revises: add_banner_audience
Create Date: 2026-05-17
"""
from alembic import op
import sqlalchemy as sa
import geoalchemy2  # noqa: F401  (registers geometry types with sqlalchemy)


revision = 'add_property_geometry'
down_revision = 'add_banner_audience'
branch_labels = None
depends_on = None


def upgrade():
    # Use raw SQL so we can be idempotent (IF NOT EXISTS) — useful on the
    # shared dev DB where this migration may have been part-applied.
    op.execute("""
        ALTER TABLE properties
        ADD COLUMN IF NOT EXISTS geometry geometry(GEOMETRY, 4326);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_properties_geometry
        ON properties USING GIST (geometry);
    """)


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_properties_geometry;")
    op.execute("ALTER TABLE properties DROP COLUMN IF EXISTS geometry;")
