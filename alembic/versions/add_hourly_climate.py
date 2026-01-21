"""Add climate_zone_hourly table for disease models

Revision ID: add_hourly_climate
Revises: realtime_climate_001
Create Date: 2026-01-21

NOTE: This migration adds hourly climate data aggregation needed for 
peer-reviewed disease pressure models (UC Davis PM Index, González-Domínguez 
Botrytis, Goidanich Downy Mildew).
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'add_hourly_climate'
down_revision: str = 'realtime_climate_001'
branch_labels = None
depends_on = None


def upgrade():
    # =========================================================================
    # 1. Create climate_zone_hourly table
    # =========================================================================
    op.create_table(
        'climate_zone_hourly',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        # FIXED: Use 'climate_zones.id' (plural) to match existing schema
        sa.Column('zone_id', sa.Integer(), sa.ForeignKey('climate_zones.id'), nullable=False),
        sa.Column('timestamp_utc', sa.DateTime(), nullable=False),
        sa.Column('timestamp_local', sa.DateTime(), nullable=False),
        sa.Column('vintage_year', sa.Integer(), nullable=False),
        
        # Temperature (°C)
        sa.Column('temp_mean', sa.Numeric(5, 2)),
        sa.Column('temp_min', sa.Numeric(5, 2)),
        sa.Column('temp_max', sa.Numeric(5, 2)),
        
        # Humidity (%)
        sa.Column('rh_mean', sa.Numeric(5, 2)),
        sa.Column('rh_min', sa.Numeric(5, 2)),
        sa.Column('rh_max', sa.Numeric(5, 2)),
        
        # Precipitation (mm)
        sa.Column('precipitation', sa.Numeric(6, 2), server_default='0'),
        
        # Derived: Dewpoint (°C) - calculated from temp and RH
        sa.Column('dewpoint', sa.Numeric(5, 2)),
        
        # Derived: Wetness indicators for disease models
        sa.Column('is_wet_hour', sa.Boolean(), server_default='false'),
        sa.Column('wetness_probability', sa.Numeric(3, 2)),  # 0.00-1.00
        sa.Column('wetness_source', sa.String(20)),  # 'rain', 'humidity', 'dewpoint', 'post_rain'
        sa.Column('hours_since_rain', sa.Integer()),
        
        # Data quality
        sa.Column('station_count', sa.Integer()),
        sa.Column('confidence', sa.String(10)),  # 'high', 'medium', 'low'
        
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
    )
    
    # Indices
    op.create_unique_constraint(
        'uq_climate_zone_hourly', 'climate_zone_hourly', 
        ['zone_id', 'timestamp_utc']
    )
    op.create_index(
        'ix_zone_hourly_lookup', 'climate_zone_hourly',
        ['zone_id', 'timestamp_local']
    )
    op.create_index(
        'ix_zone_hourly_vintage', 'climate_zone_hourly',
        ['zone_id', 'vintage_year']
    )
    # Index for wetness queries (disease models)
    op.create_index(
        'ix_zone_hourly_wet', 'climate_zone_hourly',
        ['zone_id', 'timestamp_local'],
        postgresql_where=sa.text('is_wet_hour = true')
    )
    
    # =========================================================================
    # 2. Add columns to disease_pressure for peer-reviewed model outputs
    # =========================================================================
    # Rather than relying solely on JSONB, add explicit columns for key metrics
    # This allows proper querying, indexing, and schema documentation
    
    # Powdery Mildew - UC Davis Risk Index
    op.add_column('disease_pressure', 
        sa.Column('pm_daily_index', sa.Numeric(5, 2)))
    op.add_column('disease_pressure', 
        sa.Column('pm_cumulative_index', sa.Numeric(5, 2)))
    op.add_column('disease_pressure', 
        sa.Column('pm_favorable_hours', sa.Integer()))
    op.add_column('disease_pressure', 
        sa.Column('pm_lethal_hours', sa.Integer()))
    
    # Botrytis - González-Domínguez Model
    op.add_column('disease_pressure', 
        sa.Column('botrytis_severity', sa.Numeric(5, 2)))
    op.add_column('disease_pressure', 
        sa.Column('botrytis_cumulative', sa.Numeric(5, 2)))
    op.add_column('disease_pressure', 
        sa.Column('botrytis_wet_hours', sa.Integer()))
    op.add_column('disease_pressure', 
        sa.Column('botrytis_sporulation_index', sa.Numeric(5, 2)))
    
    # Downy Mildew - 3-10 Rule + Goidanich Index
    op.add_column('disease_pressure', 
        sa.Column('dm_primary_met', sa.Boolean(), server_default='false'))
    op.add_column('disease_pressure', 
        sa.Column('dm_primary_score', sa.Numeric(5, 2)))
    op.add_column('disease_pressure', 
        sa.Column('dm_goidanich_index', sa.Numeric(5, 2)))
    
    # Growth stage context (affects disease susceptibility)
    op.add_column('disease_pressure', 
        sa.Column('growth_stage', sa.String(30)))
    
    # Vintage year for easier querying
    op.add_column('disease_pressure', 
        sa.Column('vintage_year', sa.Integer()))


def downgrade():
    # Remove disease_pressure columns
    op.drop_column('disease_pressure', 'vintage_year')
    op.drop_column('disease_pressure', 'growth_stage')
    op.drop_column('disease_pressure', 'dm_goidanich_index')
    op.drop_column('disease_pressure', 'dm_primary_score')
    op.drop_column('disease_pressure', 'dm_primary_met')
    op.drop_column('disease_pressure', 'botrytis_sporulation_index')
    op.drop_column('disease_pressure', 'botrytis_wet_hours')
    op.drop_column('disease_pressure', 'botrytis_cumulative')
    op.drop_column('disease_pressure', 'botrytis_severity')
    op.drop_column('disease_pressure', 'pm_lethal_hours')
    op.drop_column('disease_pressure', 'pm_favorable_hours')
    op.drop_column('disease_pressure', 'pm_cumulative_index')
    op.drop_column('disease_pressure', 'pm_daily_index')
    
    # Drop hourly table
    op.drop_index('ix_zone_hourly_wet', table_name='climate_zone_hourly')
    op.drop_index('ix_zone_hourly_vintage', table_name='climate_zone_hourly')
    op.drop_index('ix_zone_hourly_lookup', table_name='climate_zone_hourly')
    op.drop_constraint('uq_climate_zone_hourly', 'climate_zone_hourly', type_='unique')
    op.drop_table('climate_zone_hourly')