"""Add data ingestion platform columns + backfills.

Phase 0.2 of DATA_INGESTION_PLATFORM_PLAN.md.

Additive only. No renames, no existing columns touched.

weather_stations:
  + device_class, country_id, data_source_id, company_id, property_id, asset_id,
    api_credential_ref, ingest_cadence_minutes, visibility,
    contributes_to_regional, is_high_resolution, timezone

climate_zones:
  + parent_zone_id (self-FK), zone_level, country_id
  Backfills: NZ country on all rows; zone_level='sub_zone' + parent_zone_id for
  the 7 known sub-zones (Waiheke, Gimblett Bridge Pa, Ngaruroro, Waipara,
  Bannockburn, Bendigo, Gibbston); 'region' for all others.

wine_regions:
  + country_id, parent_region_id (self-FK)
  Backfills: NZ country on all rows.

Regional Insights impact: none. No table rename, no existing column altered,
no existing query affected. The climate pipeline and all ingestion classes
continue to read the same columns they always have. New columns have safe
defaults.

Revision ID: add_data_platform_columns
Revises: add_data_platform_catalog
Create Date: 2026-04-20
"""
from alembic import op
import sqlalchemy as sa


revision = 'add_data_platform_columns'
down_revision = 'add_data_platform_catalog'
branch_labels = None
depends_on = None


def upgrade():
    # ==================================================================
    # weather_stations — additive columns
    # ==================================================================
    op.add_column('weather_stations',
        sa.Column('device_class', sa.String(50), nullable=False,
                  server_default='weather_station'))
    op.add_column('weather_stations',
        sa.Column('country_id', sa.Integer(),
                  sa.ForeignKey('countries.id'), nullable=True))
    op.add_column('weather_stations',
        sa.Column('data_source_id', sa.Integer(),
                  sa.ForeignKey('data_sources.id'), nullable=True))
    op.add_column('weather_stations',
        sa.Column('company_id', sa.Integer(),
                  sa.ForeignKey('companies.id'), nullable=True))
    op.add_column('weather_stations',
        sa.Column('property_id', sa.Integer(),
                  sa.ForeignKey('properties.id'), nullable=True))
    op.add_column('weather_stations',
        sa.Column('asset_id', sa.Integer(),
                  sa.ForeignKey('assets.id'), nullable=True))
    op.add_column('weather_stations',
        sa.Column('api_credential_ref', sa.String(200), nullable=True))
    op.add_column('weather_stations',
        sa.Column('ingest_cadence_minutes', sa.Integer(), nullable=False,
                  server_default='360'))
    op.add_column('weather_stations',
        sa.Column('visibility', sa.String(20), nullable=False,
                  server_default='public'))
    op.add_column('weather_stations',
        sa.Column('contributes_to_regional', sa.Boolean(), nullable=False,
                  server_default=sa.text('true')))
    op.add_column('weather_stations',
        sa.Column('is_high_resolution', sa.Boolean(), nullable=False,
                  server_default=sa.text('false')))
    op.add_column('weather_stations',
        sa.Column('timezone', sa.String(50), nullable=False,
                  server_default='Pacific/Auckland'))

    op.create_check_constraint(
        'ck_weather_stations_device_class', 'weather_stations',
        "device_class IN ('weather_station','pump','meter','frost_fan',"
        "'groundwater_bore','river_gauge','soil_probe','tank_sensor',"
        "'irrigation_controller')")
    op.create_check_constraint(
        'ck_weather_stations_visibility', 'weather_stations',
        "visibility IN ('public','private')")

    op.create_index('ix_weather_stations_country', 'weather_stations', ['country_id'])
    op.create_index('ix_weather_stations_data_source', 'weather_stations', ['data_source_id'])
    op.create_index('ix_weather_stations_company', 'weather_stations', ['company_id'])
    op.create_index('ix_weather_stations_property', 'weather_stations', ['property_id'])
    op.create_index('ix_weather_stations_asset', 'weather_stations', ['asset_id'])
    op.create_index('ix_weather_stations_device_class', 'weather_stations', ['device_class'])

    # ==================================================================
    # climate_zones — additive columns
    # ==================================================================
    op.add_column('climate_zones',
        sa.Column('parent_zone_id', sa.Integer(),
                  sa.ForeignKey('climate_zones.id'), nullable=True))
    op.add_column('climate_zones',
        sa.Column('zone_level', sa.String(20), nullable=False,
                  server_default='region'))
    op.add_column('climate_zones',
        sa.Column('country_id', sa.Integer(),
                  sa.ForeignKey('countries.id'), nullable=True))

    op.create_check_constraint(
        'ck_climate_zones_zone_level', 'climate_zones',
        "zone_level IN ('region','sub_zone')")

    op.create_index('ix_climate_zones_parent', 'climate_zones', ['parent_zone_id'])
    op.create_index('ix_climate_zones_country', 'climate_zones', ['country_id'])
    op.create_index('ix_climate_zones_level', 'climate_zones', ['zone_level'])

    # ==================================================================
    # wine_regions — additive columns
    # ==================================================================
    op.add_column('wine_regions',
        sa.Column('country_id', sa.Integer(),
                  sa.ForeignKey('countries.id'), nullable=True))
    op.add_column('wine_regions',
        sa.Column('parent_region_id', sa.Integer(),
                  sa.ForeignKey('wine_regions.id'), nullable=True))

    op.create_index('ix_wine_regions_country', 'wine_regions', ['country_id'])
    op.create_index('ix_wine_regions_parent', 'wine_regions', ['parent_region_id'])

    # ==================================================================
    # BACKFILL
    # ==================================================================

    # wine_regions → NZ
    op.execute("""
        UPDATE wine_regions
        SET country_id = (SELECT id FROM countries WHERE iso2='NZ')
        WHERE country_id IS NULL;
    """)

    # climate_zones → NZ
    op.execute("""
        UPDATE climate_zones
        SET country_id = (SELECT id FROM countries WHERE iso2='NZ')
        WHERE country_id IS NULL;
    """)

    # climate_zones → zone_level + parent_zone_id for the 7 known NZ sub-zones.
    # Mapping from backend/scripts/seed_climate_zones.py:
    #   Waiheke → Auckland
    #   Gimblett Bridge Pa, Ngaruroro → Hawkes Bay
    #   Waipara → North Canterbury
    #   Bannockburn, Bendigo, Gibbston → Central Otago
    # Marlborough sub-zones (Lower Wairau, Awatere, Upper Wairau and Southern
    # Valleys) and Wairarapa sub-zones (Gladstone, Martinborough) have no
    # overview row yet — they stay 'region' until Phase A inserts the parents.
    op.execute("""
        UPDATE climate_zones c SET
          zone_level = 'sub_zone',
          parent_zone_id = p.id
        FROM climate_zones p
        WHERE p.slug = 'auckland' AND c.slug = 'waiheke';
    """)
    op.execute("""
        UPDATE climate_zones c SET
          zone_level = 'sub_zone',
          parent_zone_id = p.id
        FROM climate_zones p
        WHERE p.slug = 'hawkes-bay' AND c.slug IN ('gimblett-bridge-pa','ngaruroro');
    """)
    op.execute("""
        UPDATE climate_zones c SET
          zone_level = 'sub_zone',
          parent_zone_id = p.id
        FROM climate_zones p
        WHERE p.slug = 'north-canterbury' AND c.slug = 'waipara';
    """)
    op.execute("""
        UPDATE climate_zones c SET
          zone_level = 'sub_zone',
          parent_zone_id = p.id
        FROM climate_zones p
        WHERE p.slug = 'central-otago'
          AND c.slug IN ('bannockburn','bendigo','gibbston');
    """)

    # weather_stations → NZ country + data_source_id FK + HARVEST credential ref.
    # Existing `data_source` string column is untouched; the FK runs alongside
    # until a later migration retires the string column.
    op.execute("""
        UPDATE weather_stations ws
        SET country_id = (SELECT id FROM countries WHERE iso2='NZ')
        WHERE country_id IS NULL;
    """)
    op.execute("""
        UPDATE weather_stations ws
        SET data_source_id = ds.id
        FROM data_sources ds
        WHERE ws.data_source = ds.code
          AND ws.data_source_id IS NULL;
    """)
    op.execute("""
        UPDATE weather_stations
        SET api_credential_ref = 'harvest/default'
        WHERE data_source = 'HARVEST' AND api_credential_ref IS NULL;
    """)

    # Drop the server_defaults for boolean/enum-ish columns after backfill so
    # application-level inserts must supply values explicitly (the defaults
    # have already served their backfill purpose).
    # Left in place intentionally for device_class, visibility,
    # contributes_to_regional, is_high_resolution, ingest_cadence_minutes,
    # timezone, zone_level — these are sensible insert defaults we want to keep.


def downgrade():
    # wine_regions
    op.drop_index('ix_wine_regions_parent', table_name='wine_regions')
    op.drop_index('ix_wine_regions_country', table_name='wine_regions')
    op.drop_column('wine_regions', 'parent_region_id')
    op.drop_column('wine_regions', 'country_id')

    # climate_zones
    op.drop_index('ix_climate_zones_level', table_name='climate_zones')
    op.drop_index('ix_climate_zones_country', table_name='climate_zones')
    op.drop_index('ix_climate_zones_parent', table_name='climate_zones')
    op.drop_constraint('ck_climate_zones_zone_level', 'climate_zones', type_='check')
    op.drop_column('climate_zones', 'country_id')
    op.drop_column('climate_zones', 'zone_level')
    op.drop_column('climate_zones', 'parent_zone_id')

    # weather_stations
    op.drop_index('ix_weather_stations_device_class', table_name='weather_stations')
    op.drop_index('ix_weather_stations_asset', table_name='weather_stations')
    op.drop_index('ix_weather_stations_property', table_name='weather_stations')
    op.drop_index('ix_weather_stations_company', table_name='weather_stations')
    op.drop_index('ix_weather_stations_data_source', table_name='weather_stations')
    op.drop_index('ix_weather_stations_country', table_name='weather_stations')
    op.drop_constraint('ck_weather_stations_visibility', 'weather_stations', type_='check')
    op.drop_constraint('ck_weather_stations_device_class', 'weather_stations', type_='check')
    op.drop_column('weather_stations', 'timezone')
    op.drop_column('weather_stations', 'is_high_resolution')
    op.drop_column('weather_stations', 'contributes_to_regional')
    op.drop_column('weather_stations', 'visibility')
    op.drop_column('weather_stations', 'ingest_cadence_minutes')
    op.drop_column('weather_stations', 'api_credential_ref')
    op.drop_column('weather_stations', 'asset_id')
    op.drop_column('weather_stations', 'property_id')
    op.drop_column('weather_stations', 'company_id')
    op.drop_column('weather_stations', 'data_source_id')
    op.drop_column('weather_stations', 'country_id')
    op.drop_column('weather_stations', 'device_class')
