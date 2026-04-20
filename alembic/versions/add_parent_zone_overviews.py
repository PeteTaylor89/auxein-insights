"""Add Marlborough + Wairarapa overview climate_zones; link sub-zones to parents.

Phase A.1 of DATA_INGESTION_PLATFORM_PLAN.md.

Fills the hierarchy gap identified in §2.5: two NZ wine regions
(marlborough, wairarapa) had no overview climate_zones row, so there was
nowhere for their sub-zones to roll up to. Inserts the two missing overview
rows (geometry sourced from wine_regions) and wires the existing sub-zones:

  - Marlborough  <- Lower Wairau, Awatere, Upper Wairau and Southern Valleys
  - Wairarapa    <- Gladstone, Martinborough

South Coast is intentionally left untouched — its current region linkage
looks anomalous (slug 'south-coast' under wine_regions 'marlborough') and
warrants a separate investigation outside this phase.

Prod safety (applies to currently-deployed old aggregation code):
  - Old aggregation does `JOIN weather_stations ws ON ws.zone_id = cz.id`
    — adding two new climate_zones rows with NO stations pointing at them
    has no effect on existing aggregates. Under MIN_STATIONS_FOR_ZONE=2,
    the new overview rows don't publish anything; climate_zone_daily gains
    no Marlborough / Wairarapa entries until the recursive CTE in
    zone_aggregation.py lands in prod.
  - parent_zone_id backfill on existing sub-zones is a no-op for old
    aggregation (it doesn't read parent_zone_id).

Revision ID: add_parent_zone_overviews
Revises: add_designation_columns
Create Date: 2026-04-20
"""
from alembic import op


revision = 'add_parent_zone_overviews'
down_revision = 'add_designation_columns'
branch_labels = None
depends_on = None


def upgrade():
    # ------------------------------------------------------------------
    # Align the id sequence to the current max id. The manually-inserted
    # 'south-coast' row pushed max(id) past the sequence's last_value, so a
    # plain INSERT ... SELECT would collide. Safe to run unconditionally.
    # ------------------------------------------------------------------
    op.execute("""
        SELECT setval(
            pg_get_serial_sequence('climate_zones', 'id'),
            COALESCE((SELECT MAX(id) FROM climate_zones), 1),
            true
        );
    """)

    # ------------------------------------------------------------------
    # Insert Marlborough overview zone (geometry copied from wine_regions).
    # ------------------------------------------------------------------
    op.execute("""
        INSERT INTO climate_zones
            (name, slug, region_id, description, geometry,
             display_order, is_active, zone_level, country_id)
        SELECT
            'Marlborough', 'marlborough', wr.id,
            'New Zealand''s largest wine region, dominated by Sauvignon Blanc '
            'production across the Wairau Valley, Awatere Valley and Southern '
            'Valleys sub-regions.',
            wr.geometry, 11, true, 'region',
            (SELECT id FROM countries WHERE iso2='NZ')
        FROM wine_regions wr WHERE wr.slug = 'marlborough'
        ON CONFLICT (slug) DO NOTHING;
    """)

    # Insert Wairarapa overview zone (geometry copied from wine_regions).
    op.execute("""
        INSERT INTO climate_zones
            (name, slug, region_id, description, geometry,
             display_order, is_active, zone_level, country_id)
        SELECT
            'Wairarapa', 'wairarapa', wr.id,
            'A small cool-climate region producing some of New Zealand''s '
            'finest Pinot Noir and aromatic whites across Gladstone and '
            'Martinborough.',
            wr.geometry, 8, true, 'region',
            (SELECT id FROM countries WHERE iso2='NZ')
        FROM wine_regions wr WHERE wr.slug = 'wairarapa'
        ON CONFLICT (slug) DO NOTHING;
    """)

    # ------------------------------------------------------------------
    # Link existing Marlborough sub-zones to their new parent.
    # ------------------------------------------------------------------
    op.execute("""
        UPDATE climate_zones c SET
            zone_level = 'sub_zone',
            parent_zone_id = p.id
        FROM climate_zones p
        WHERE p.slug = 'marlborough'
          AND c.slug IN ('lower-wairau','awatere','upper-wairau-southern-valleys');
    """)

    # Link existing Wairarapa sub-zones to their new parent.
    op.execute("""
        UPDATE climate_zones c SET
            zone_level = 'sub_zone',
            parent_zone_id = p.id
        FROM climate_zones p
        WHERE p.slug = 'wairarapa'
          AND c.slug IN ('gladstone','martinborough');
    """)


def downgrade():
    # Unlink sub-zones from parents (revert to 'region' with no parent).
    op.execute("""
        UPDATE climate_zones SET
            zone_level = 'region', parent_zone_id = NULL
        WHERE slug IN ('lower-wairau','awatere','upper-wairau-southern-valleys',
                       'gladstone','martinborough');
    """)
    op.execute("DELETE FROM climate_zones WHERE slug IN ('marlborough','wairarapa');")
