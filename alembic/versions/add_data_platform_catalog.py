"""Add data ingestion platform catalog tables.

Phase 0.1 of DATA_INGESTION_PLATFORM_PLAN.md — foundation tables only.

Adds:
  - countries (with NZ seeded)
  - data_sources (with existing 7 providers seeded)
  - measurement_catalog (with weather + hydrology + operational variables seeded)
  - ingestion_credentials (empty; harvest/default seeded as legacy fallback)
  - device_measurements (empty; populated per-device in later phases)

Non-destructive: no existing tables, columns, or rows touched. Regional Insights
and all current ingestion classes keep running unchanged on this migration.

Revision ID: add_data_platform_catalog
Revises: add_property_gating
Create Date: 2026-04-20
"""
from alembic import op
import sqlalchemy as sa


revision = 'add_data_platform_catalog'
down_revision = 'add_property_gating'
branch_labels = None
depends_on = None


def upgrade():
    # ------------------------------------------------------------------
    # countries
    # ------------------------------------------------------------------
    op.create_table(
        'countries',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('iso2', sa.String(2), nullable=False),
        sa.Column('iso3', sa.String(3), nullable=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('hemisphere', sa.String(1), nullable=False),
        sa.Column('vintage_start_month', sa.Integer(), nullable=False),
        sa.Column('default_timezone', sa.String(50), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('display_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
        sa.CheckConstraint("hemisphere IN ('N','S')", name='ck_countries_hemisphere'),
        sa.CheckConstraint('vintage_start_month BETWEEN 1 AND 12', name='ck_countries_vintage_month'),
        sa.UniqueConstraint('iso2', name='uq_countries_iso2'),
    )
    op.create_index('ix_countries_iso2', 'countries', ['iso2'])

    # ------------------------------------------------------------------
    # data_sources
    # ------------------------------------------------------------------
    op.create_table(
        'data_sources',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('code', sa.String(50), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('kind', sa.String(50), nullable=False),
        sa.Column('api_pattern', sa.String(50), nullable=True),
        sa.Column('base_url', sa.Text(), nullable=True),
        sa.Column('requires_credentials', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('country_id', sa.Integer(), sa.ForeignKey('countries.id'), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
        sa.CheckConstraint(
            "kind IN ('weather','hydrology','operational','alerts','mixed')",
            name='ck_data_sources_kind',
        ),
        sa.UniqueConstraint('code', name='uq_data_sources_code'),
    )
    op.create_index('ix_data_sources_code', 'data_sources', ['code'])
    op.create_index('ix_data_sources_country', 'data_sources', ['country_id'])

    # ------------------------------------------------------------------
    # measurement_catalog (varchar PK by 'code' for join convenience)
    # ------------------------------------------------------------------
    op.create_table(
        'measurement_catalog',
        sa.Column('code', sa.String(50), primary_key=True),
        sa.Column('display_name', sa.String(100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('canonical_unit', sa.String(20), nullable=False),
        sa.Column('value_type', sa.String(20), nullable=False),
        sa.Column('rollup_method', sa.String(20), nullable=False),
        sa.Column('domain', sa.String(50), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('display_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
        sa.CheckConstraint(
            "value_type IN ('continuous','cumulative','boolean','categorical')",
            name='ck_measurement_value_type',
        ),
        sa.CheckConstraint(
            "rollup_method IN ('mean','sum','last','max','min','any_true')",
            name='ck_measurement_rollup',
        ),
    )
    op.create_index('ix_measurement_catalog_domain', 'measurement_catalog', ['domain'])

    # ------------------------------------------------------------------
    # ingestion_credentials (empty; AWS Secrets Manager ARNs populated later)
    # ------------------------------------------------------------------
    op.create_table(
        'ingestion_credentials',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('provider', sa.String(50), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('secret_arn', sa.Text(), nullable=True),
        sa.Column('env_var_fallback', sa.String(100), nullable=True),
        sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id'), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('rotated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
        sa.UniqueConstraint('provider', 'name', name='uq_ingestion_credentials_provider_name'),
    )
    op.create_index('ix_ingestion_credentials_provider', 'ingestion_credentials', ['provider'])
    op.create_index('ix_ingestion_credentials_company', 'ingestion_credentials', ['company_id'])

    # ------------------------------------------------------------------
    # device_measurements (FK to weather_stations.station_id for now;
    # will follow the table rename in a later migration)
    # ------------------------------------------------------------------
    op.create_table(
        'device_measurements',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            'device_id', sa.Integer(),
            sa.ForeignKey('weather_stations.station_id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column(
            'measurement_code', sa.String(50),
            sa.ForeignKey('measurement_catalog.code'),
            nullable=False,
        ),
        sa.Column('source_measurement_name', sa.String(200), nullable=True),
        sa.Column('unit', sa.String(20), nullable=True),
        sa.Column('is_primary', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
        sa.UniqueConstraint('device_id', 'measurement_code', name='uq_device_measurements_device_code'),
    )
    op.create_index('ix_device_measurements_device', 'device_measurements', ['device_id'])
    op.create_index('ix_device_measurements_code', 'device_measurements', ['measurement_code'])

    # ------------------------------------------------------------------
    # SEED DATA
    # ------------------------------------------------------------------

    # countries — NZ only for now; AU lands in Phase E
    op.execute("""
        INSERT INTO countries (iso2, iso3, name, hemisphere, vintage_start_month, default_timezone, display_order)
        VALUES ('NZ', 'NZL', 'New Zealand', 'S', 7, 'Pacific/Auckland', 1)
        ON CONFLICT (iso2) DO NOTHING;
    """)

    # data_sources — existing 7 providers
    op.execute("""
        INSERT INTO data_sources (code, name, kind, api_pattern, base_url, requires_credentials, country_id, notes)
        VALUES
          ('HARVEST', 'Harvest Electronics', 'weather', 'rest',
           'https://live.harvest.com/api.php', true, NULL,
           'Commercial telemetry — multi-country; devices are timeseries (weather, pumps, fans, meters).'),
          ('ECAN', 'Environment Canterbury', 'weather', 'rest', NULL, false,
           (SELECT id FROM countries WHERE iso2='NZ'), 'Regional council public data.'),
          ('MDC', 'Marlborough District Council', 'weather', 'hilltop', NULL, false,
           (SELECT id FROM countries WHERE iso2='NZ'), 'Hilltop API.'),
          ('GW', 'Greater Wellington Regional Council', 'weather', 'hilltop', NULL, false,
           (SELECT id FROM countries WHERE iso2='NZ'), 'Hilltop API.'),
          ('HBRC', 'Hawke''s Bay Regional Council', 'weather', 'hilltop', NULL, false,
           (SELECT id FROM countries WHERE iso2='NZ'), 'Hilltop API.'),
          ('TDC', 'Tasman District Council', 'weather', 'hilltop',
           'http://envdata.tasman.govt.nz/data.hts', false,
           (SELECT id FROM countries WHERE iso2='NZ'), 'Hilltop API; backfill site-by-site per TDC.'),
          ('GDC', 'Gisborne District Council', 'weather', 'hilltop', NULL, false,
           (SELECT id FROM countries WHERE iso2='NZ'),
           'Hilltop API; single climate station limits zone aggregation.')
        ON CONFLICT (code) DO NOTHING;
    """)

    # measurement_catalog — weather core (matches current variable strings) +
    # hydrology + operational placeholders for future device classes
    op.execute("""
        INSERT INTO measurement_catalog
          (code, display_name, canonical_unit, value_type, rollup_method, domain, display_order, description)
        VALUES
          -- WEATHER (codes chosen to match existing weather_data.variable values)
          ('temp',              'Air Temperature',       'C',       'continuous', 'mean',     'weather',   10, 'Instantaneous air temperature.'),
          ('rh',                'Relative Humidity',     'percent', 'continuous', 'mean',     'weather',   20, 'Relative humidity 0-100%.'),
          ('rainfall',          'Rainfall',              'mm',      'cumulative', 'sum',      'weather',   30, 'Rainfall depth per interval.'),
          ('solar_radiation',   'Solar Radiation',       'W/m2',    'continuous', 'mean',     'weather',   40, 'Shortwave incoming radiation.'),
          ('pressure',          'Barometric Pressure',   'hPa',     'continuous', 'mean',     'weather',   50, 'Atmospheric pressure.'),
          ('wind_speed',        'Wind Speed',            'm/s',     'continuous', 'mean',     'weather',   60, 'Wind speed.'),
          ('wind_direction',    'Wind Direction',        'deg',     'continuous', 'mean',     'weather',   70, 'Wind direction (0-360).'),
          ('dewpoint',          'Dew Point',             'C',       'continuous', 'mean',     'weather',   80, 'Dew point temperature (may be derived).'),
          ('leaf_wetness',      'Leaf Wetness',          'percent', 'continuous', 'mean',     'weather',   90, 'Leaf wetness sensor output.'),
          ('soil_moisture_vwc', 'Soil Moisture (VWC)',   'percent', 'continuous', 'mean',     'weather',  100, 'Volumetric water content.'),
          ('soil_temp',         'Soil Temperature',      'C',       'continuous', 'mean',     'weather',  110, 'Soil temperature.'),
          ('evapotranspiration','Reference ET',          'mm',      'cumulative', 'sum',      'weather',  120, 'Reference evapotranspiration (ET0).'),
          -- HYDROLOGY
          ('river_level',       'River Level',           'm',       'continuous', 'mean',     'hydrology', 210, 'River / stream stage.'),
          ('river_flow',        'River Flow',            'm3/s',    'continuous', 'mean',     'hydrology', 220, 'River discharge.'),
          ('groundwater_level', 'Groundwater Level',     'm',       'continuous', 'mean',     'hydrology', 230, 'Bore / piezometer water level.'),
          ('water_ph',          'Water pH',              'pH',      'continuous', 'mean',     'quality',   310, 'Water pH.'),
          ('water_ec',          'Water EC',              'uS/cm',   'continuous', 'mean',     'quality',   320, 'Water electrical conductivity.'),
          -- OPERATIONAL (irrigation / frost / metering)
          ('pump_flow',         'Pump Flow Rate',        'L/s',     'continuous', 'mean',     'irrigation',410, 'Instantaneous pump flow.'),
          ('pump_runtime',      'Pump Runtime',          'hours',   'cumulative', 'sum',      'irrigation',420, 'Accumulated pump runtime.'),
          ('pump_pressure',     'Pump Pressure',         'kPa',     'continuous', 'mean',     'irrigation',430, 'Pump discharge pressure.'),
          ('pump_on',           'Pump On',               'bool',    'boolean',    'any_true', 'irrigation',440, 'Pump running state (1/0).'),
          ('frost_fan_on',      'Frost Fan On',          'bool',    'boolean',    'any_true', 'frost',     510, 'Frost fan running state (1/0).'),
          ('frost_fan_runtime', 'Frost Fan Runtime',     'hours',   'cumulative', 'sum',      'frost',     520, 'Accumulated frost fan runtime.'),
          ('tank_level',        'Tank Level',            'percent', 'continuous', 'mean',     'irrigation',610, 'Storage tank level.'),
          ('meter_consumption', 'Meter Consumption',     'm3',      'cumulative', 'sum',      'irrigation',620, 'Water meter consumption total.')
        ON CONFLICT (code) DO NOTHING;
    """)

    # ingestion_credentials — seed one placeholder row for back-compat fallback.
    # Existing ingestion keeps using HARVEST_API_KEY env var until Phase B wires
    # AWS Secrets Manager. The env_var_fallback column captures that for later.
    op.execute("""
        INSERT INTO ingestion_credentials (provider, name, secret_arn, env_var_fallback, company_id, notes)
        VALUES ('HARVEST', 'harvest/default', NULL, 'HARVEST_API_KEY', NULL,
                'Legacy shared Harvest key; resolved via env var fallback until Secrets Manager is wired.')
        ON CONFLICT (provider, name) DO NOTHING;
    """)


def downgrade():
    op.drop_index('ix_device_measurements_code', table_name='device_measurements')
    op.drop_index('ix_device_measurements_device', table_name='device_measurements')
    op.drop_table('device_measurements')

    op.drop_index('ix_ingestion_credentials_company', table_name='ingestion_credentials')
    op.drop_index('ix_ingestion_credentials_provider', table_name='ingestion_credentials')
    op.drop_table('ingestion_credentials')

    op.drop_index('ix_measurement_catalog_domain', table_name='measurement_catalog')
    op.drop_table('measurement_catalog')

    op.drop_index('ix_data_sources_country', table_name='data_sources')
    op.drop_index('ix_data_sources_code', table_name='data_sources')
    op.drop_table('data_sources')

    op.drop_index('ix_countries_iso2', table_name='countries')
    op.drop_table('countries')
