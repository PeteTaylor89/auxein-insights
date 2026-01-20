"""Add wine_regions and geographical_indications tables

Revision ID: realtime_climate_001
Revises: [a1b2c3d4e5f6]
Create Date: 2026-01-16

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision: str = 'realtime_climate_001'
down_revision: str = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    # =========================================================================
    # 1. Add zone_id to weather_stations
    # =========================================================================
    op.add_column(
        'weather_stations',
        sa.Column('zone_id', sa.Integer(), sa.ForeignKey('climate_zones.id'), nullable=True)
    )
    op.create_index('idx_weather_stations_zone', 'weather_stations', ['zone_id'])
    
    # =========================================================================
    # 2. Create weather_data_daily table
    # =========================================================================
    op.create_table(
        'weather_data_daily',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('station_id', sa.Integer(), sa.ForeignKey('weather_stations.station_id'), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        
        # Temperature (°C)
        sa.Column('temp_min', sa.Numeric(6, 2)),
        sa.Column('temp_max', sa.Numeric(6, 2)),
        sa.Column('temp_mean', sa.Numeric(6, 2)),
        
        # Humidity (%)
        sa.Column('humidity_min', sa.Numeric(5, 2)),
        sa.Column('humidity_max', sa.Numeric(5, 2)),
        sa.Column('humidity_mean', sa.Numeric(5, 2)),
        
        # Rainfall (mm) - sum for the day
        sa.Column('rainfall_mm', sa.Numeric(8, 2)),
        
        # Solar radiation (MJ/m²) - sum for the day
        sa.Column('solar_radiation', sa.Numeric(8, 2)),
        
        # GDD calculations
        sa.Column('gdd_base0', sa.Numeric(6, 2)),
        sa.Column('gdd_base10', sa.Numeric(6, 2)),
        
        # Data quality
        sa.Column('temp_record_count', sa.Integer()),
        sa.Column('humidity_record_count', sa.Integer()),
        sa.Column('rainfall_record_count', sa.Integer()),
        
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
        
        sa.UniqueConstraint('station_id', 'date', name='uq_weather_data_daily_station_date'),
    )
    op.create_index('idx_weather_data_daily_station_date', 'weather_data_daily', ['station_id', sa.text('date DESC')])
    op.create_index('idx_weather_data_daily_date', 'weather_data_daily', ['date'])
    
    # =========================================================================
    # 3. Create climate_zone_daily table
    # =========================================================================
    op.create_table(
        'climate_zone_daily',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('zone_id', sa.Integer(), sa.ForeignKey('climate_zones.id'), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('vintage_year', sa.Integer(), nullable=False),
        
        # Temperature (°C)
        sa.Column('temp_min', sa.Numeric(6, 2)),
        sa.Column('temp_max', sa.Numeric(6, 2)),
        sa.Column('temp_mean', sa.Numeric(6, 2)),
        
        # Humidity (%)
        sa.Column('humidity_mean', sa.Numeric(5, 2)),
        
        # Rainfall (mm)
        sa.Column('rainfall_mm', sa.Numeric(8, 2)),
        
        # Solar radiation (MJ/m²)
        sa.Column('solar_radiation', sa.Numeric(8, 2)),
        
        # GDD calculations (base 0 for phenology)
        sa.Column('gdd_daily', sa.Numeric(6, 2)),
        sa.Column('gdd_cumulative', sa.Numeric(8, 2)),
        
        # Station coverage
        sa.Column('station_count', sa.Integer()),
        sa.Column('stations_with_temp', sa.Integer()),
        sa.Column('stations_with_humidity', sa.Integer()),
        sa.Column('stations_with_rain', sa.Integer()),
        
        # Confidence
        sa.Column('confidence', sa.String(10)),
        sa.Column('processing_method', sa.String(20)),
        
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
        
        sa.UniqueConstraint('zone_id', 'date', name='uq_climate_zone_daily_zone_date'),
    )
    op.create_index('idx_climate_zone_daily_zone_date', 'climate_zone_daily', ['zone_id', sa.text('date DESC')])
    op.create_index('idx_climate_zone_daily_vintage', 'climate_zone_daily', ['zone_id', 'vintage_year'])
    
    # =========================================================================
    # 4. Create climate_zone_daily_baseline table
    # =========================================================================
    op.create_table(
        'climate_zone_daily_baseline',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('zone_id', sa.Integer(), sa.ForeignKey('climate_zones.id'), nullable=False),
        sa.Column('day_of_vintage', sa.Integer(), nullable=False),
        
        # Temperature
        sa.Column('tmean_avg', sa.Numeric(6, 2)),
        sa.Column('tmean_sd', sa.Numeric(6, 2)),
        sa.Column('tmin_avg', sa.Numeric(6, 2)),
        sa.Column('tmin_sd', sa.Numeric(6, 2)),
        sa.Column('tmax_avg', sa.Numeric(6, 2)),
        sa.Column('tmax_sd', sa.Numeric(6, 2)),
        
        # GDD
        sa.Column('gdd_base0_avg', sa.Numeric(6, 2)),
        sa.Column('gdd_base0_sd', sa.Numeric(6, 2)),
        sa.Column('gdd_base10_avg', sa.Numeric(6, 2)),
        sa.Column('gdd_base10_sd', sa.Numeric(6, 2)),
        
        # Cumulative GDD (for phenology comparison)
        sa.Column('gdd_base0_cumulative_avg', sa.Numeric(8, 2)),
        sa.Column('gdd_base0_cumulative_sd', sa.Numeric(8, 2)),
        
        # Rainfall
        sa.Column('rain_avg', sa.Numeric(8, 2)),
        sa.Column('rain_sd', sa.Numeric(8, 2)),
        
        # Solar
        sa.Column('solar_avg', sa.Numeric(8, 2)),
        sa.Column('solar_sd', sa.Numeric(8, 2)),
        
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
        
        sa.UniqueConstraint('zone_id', 'day_of_vintage', name='uq_baseline_zone_doy'),
        sa.CheckConstraint('day_of_vintage BETWEEN 1 AND 366', name='ck_baseline_doy_range'),
    )
    op.create_index('idx_baseline_zone_doy', 'climate_zone_daily_baseline', ['zone_id', 'day_of_vintage'])
    
    # =========================================================================
    # 5. Create phenology_thresholds table
    # =========================================================================
    op.create_table(
        'phenology_thresholds',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('variety_code', sa.String(20), nullable=False, unique=True),
        sa.Column('variety_name', sa.String(100), nullable=False),
        
        # GDD thresholds (base 0)
        sa.Column('gdd_flowering', sa.Numeric(8, 2)),
        sa.Column('gdd_veraison', sa.Numeric(8, 2)),
        
        # Harvest thresholds at different sugar levels
        sa.Column('gdd_harvest_170', sa.Numeric(8, 2)),
        sa.Column('gdd_harvest_180', sa.Numeric(8, 2)),
        sa.Column('gdd_harvest_190', sa.Numeric(8, 2)),
        sa.Column('gdd_harvest_200', sa.Numeric(8, 2)),
        sa.Column('gdd_harvest_210', sa.Numeric(8, 2)),
        sa.Column('gdd_harvest_220', sa.Numeric(8, 2)),
        
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
    )
    
    # =========================================================================
    # 6. Create phenology_estimates table
    # =========================================================================
    op.create_table(
        'phenology_estimates',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('zone_id', sa.Integer(), sa.ForeignKey('climate_zones.id'), nullable=False),
        sa.Column('variety_code', sa.String(20), nullable=False),
        sa.Column('vintage_year', sa.Integer(), nullable=False),
        sa.Column('estimate_date', sa.Date(), nullable=False),
        
        # Current status
        sa.Column('gdd_accumulated', sa.Numeric(8, 2)),
        sa.Column('current_stage', sa.String(30)),
        
        # Stage dates
        sa.Column('flowering_date', sa.Date()),
        sa.Column('flowering_is_actual', sa.Boolean(), default=False),
        sa.Column('veraison_date', sa.Date()),
        sa.Column('veraison_is_actual', sa.Boolean(), default=False),
        
        # Harvest predictions
        sa.Column('harvest_170_date', sa.Date()),
        sa.Column('harvest_180_date', sa.Date()),
        sa.Column('harvest_190_date', sa.Date()),
        sa.Column('harvest_200_date', sa.Date()),
        sa.Column('harvest_210_date', sa.Date()),
        sa.Column('harvest_220_date', sa.Date()),
        
        # Comparison
        sa.Column('days_vs_baseline', sa.Integer()),
        sa.Column('gdd_vs_baseline', sa.Numeric(8, 2)),
        
        # Confidence
        sa.Column('confidence', sa.String(10)),
        
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
        
        sa.UniqueConstraint('zone_id', 'variety_code', 'vintage_year', 'estimate_date', 
                          name='uq_phenology_zone_variety_vintage_date'),
    )
    op.create_index('idx_phenology_zone_vintage', 'phenology_estimates', 
                   ['zone_id', 'vintage_year', sa.text('estimate_date DESC')])
    
    # =========================================================================
    # 7. Create disease_pressure table
    # =========================================================================
    op.create_table(
        'disease_pressure',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('zone_id', sa.Integer(), sa.ForeignKey('climate_zones.id'), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        
        # Risk levels
        sa.Column('downy_mildew_risk', sa.String(10)),
        sa.Column('powdery_mildew_risk', sa.String(10)),
        sa.Column('botrytis_risk', sa.String(10)),
        
        # Contributing factors
        sa.Column('risk_factors', JSONB),
        
        # Recommendations
        sa.Column('recommendations', sa.Text()),
        
        # Data quality
        sa.Column('humidity_available', sa.Boolean(), default=False),
        
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
        
        sa.UniqueConstraint('zone_id', 'date', name='uq_disease_zone_date'),
    )
    op.create_index('idx_disease_zone_date', 'disease_pressure', ['zone_id', sa.text('date DESC')])


def downgrade():
    # Drop tables in reverse order
    op.drop_table('disease_pressure')
    op.drop_table('phenology_estimates')
    op.drop_table('phenology_thresholds')
    op.drop_table('climate_zone_daily_baseline')
    op.drop_table('climate_zone_daily')
    op.drop_table('weather_data_daily')
    
    # Remove zone_id from weather_stations
    op.drop_index('idx_weather_stations_zone', table_name='weather_stations')
    op.drop_column('weather_stations', 'zone_id')