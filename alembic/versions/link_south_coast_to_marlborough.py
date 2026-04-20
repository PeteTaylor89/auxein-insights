"""Link south-coast climate_zone to marlborough as a sub-zone.

Phase A.1 follow-up. South Coast is a legitimate Marlborough sub-zone; an
earlier migration intentionally skipped it pending confirmation. Confirmed
now — wire it into the hierarchy.

Prod safety: updates one row; old aggregation code ignores parent_zone_id so
no effect on current publishes. Under the new recursive-CTE aggregation,
South Coast stations (if any become active) would roll up into Marlborough.

Revision ID: link_south_coast_to_marl
Revises: add_parent_zone_overviews
Create Date: 2026-04-20
"""
from alembic import op


revision = 'link_south_coast_to_marl'
down_revision = 'add_parent_zone_overviews'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        UPDATE climate_zones c SET
            zone_level = 'sub_zone',
            parent_zone_id = p.id
        FROM climate_zones p
        WHERE p.slug = 'marlborough' AND c.slug = 'south-coast';
    """)


def downgrade():
    op.execute("""
        UPDATE climate_zones SET
            zone_level = 'region', parent_zone_id = NULL
        WHERE slug = 'south-coast';
    """)
