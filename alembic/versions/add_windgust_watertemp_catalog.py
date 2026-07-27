"""Add wind_gust + water_temp to measurement_catalog.

Phase 1 of the HBRC ingestion expansion (docs/plans/INGESTION_EXPANSION_2026-07-16.md).

Two new canonical measurement codes needed for the HBRC breadth work:

  - wind_gust  : peak wind speed (HBRC 'Maximum Wind Speed'). Distinct from
                 wind_speed (mean) — rolls up by MAX, not MEAN. Frost-fan +
                 spray-window relevance.
  - water_temp : river/stream water temperature, carried by the HBRC hydrology
                 gauges in the HBRC_Rainfall collection alongside Stage/Flow.
                 The catalog already has river_level/river_flow but no water
                 temperature code.

NOT added here (deliberately):
  - pet / evapotranspiration : the catalog ALREADY seeds 'evapotranspiration'
    (Reference ET, mm). HBRC 'PET Hourly' maps to that existing code — no new
    row. The prior discovery doc's call to mint a 'pet' code was superseded.
  - soil depth codes : HBRC climate soil is single-depth (Soil Temperature
    100mm / Soil Moisture) and reuses the existing soil_temp / soil_moisture_vwc
    codes. Multi-depth sources (Northland, MDC Soil) will introduce suffixed
    codes (soil_temp_200mm, ...) in a later phase.

Additive + idempotent: ON CONFLICT (code) DO NOTHING. No existing rows, columns,
or ingestion behaviour touched. Nothing reads these codes until Phase 2/3 seed
device_measurements rows against them.

Revision ID: catalog_windgust_watertemp
Revises: grow_insights_link
Create Date: 2026-07-21
"""
from alembic import op


# Kept well under the 32-char alembic_version.version_num limit (26 chars).
revision = 'catalog_windgust_watertemp'
down_revision = 'grow_insights_link'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        INSERT INTO measurement_catalog
          (code, display_name, canonical_unit, value_type, rollup_method, domain, display_order, description)
        VALUES
          ('wind_gust',  'Wind Gust',          'm/s', 'continuous', 'max',  'weather',   75,
           'Peak (maximum) wind speed over the interval.'),
          ('water_temp', 'Water Temperature',  'C',   'continuous', 'mean', 'hydrology', 240,
           'River / stream water temperature.')
        ON CONFLICT (code) DO NOTHING;
    """)


def downgrade() -> None:
    op.execute("DELETE FROM measurement_catalog WHERE code IN ('wind_gust', 'water_temp');")
