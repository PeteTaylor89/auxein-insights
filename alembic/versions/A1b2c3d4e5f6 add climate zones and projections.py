"""Add wine_regions and geographical_indications tables

Revision ID: a1b2c3d4e5f6
Revises: [add_regions_and_gis]
Create Date: 2026-01-16

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from geoalchemy2 import Geometry


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'add_regions_and_gis'
branch_labels = None
depends_on = None
def upgrade() -> None:
    # =========================================================================
    # 1. CLIMATE ZONES
    # =========================================================================
    op.create_table(
        'climate_zones',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('region_id', sa.Integer(), nullable=True),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('slug', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('display_order', sa.Integer(), server_default='0'),
        sa.Column('is_active', sa.Boolean(), server_default='true'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('NOW()')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['region_id'], ['wine_regions.id'], name='fk_climate_zones_region'),
        sa.UniqueConstraint('slug', name='uq_climate_zones_slug'),
    )
    op.create_index('idx_climate_zones_region', 'climate_zones', ['region_id'])
    op.create_index('idx_climate_zones_slug', 'climate_zones', ['slug'])
    
    # =========================================================================
    # 2. CLIMATE HISTORY MONTHLY
    # =========================================================================
    op.create_table(
        'climate_history_monthly',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('zone_id', sa.Integer(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('month', sa.Integer(), nullable=False),
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('vintage_year', sa.Integer(), nullable=False),
        # Temperature
        sa.Column('tmean_mean', sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column('tmean_sd', sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column('tmin_mean', sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column('tmin_sd', sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column('tmax_mean', sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column('tmax_sd', sa.Numeric(precision=6, scale=2), nullable=True),
        # GDD
        sa.Column('gdd_mean', sa.Numeric(precision=8, scale=2), nullable=True),
        sa.Column('gdd_sd', sa.Numeric(precision=8, scale=2), nullable=True),
        # Rainfall
        sa.Column('rain_mean', sa.Numeric(precision=8, scale=2), nullable=True),
        sa.Column('rain_sd', sa.Numeric(precision=8, scale=2), nullable=True),
        # Solar
        sa.Column('solar_mean', sa.Numeric(precision=8, scale=2), nullable=True),
        sa.Column('solar_sd', sa.Numeric(precision=8, scale=2), nullable=True),
        # Metadata
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('NOW()')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['zone_id'], ['climate_zones.id'], name='fk_climate_history_zone'),
        sa.UniqueConstraint('zone_id', 'date', name='uq_climate_history_zone_date'),
    )
    op.create_index('idx_climate_history_zone_vintage', 'climate_history_monthly', ['zone_id', 'vintage_year'])
    op.create_index('idx_climate_history_zone_month', 'climate_history_monthly', ['zone_id', 'month'])
    
    # =========================================================================
    # 3. CLIMATE BASELINE MONTHLY
    # =========================================================================
    op.create_table(
        'climate_baseline_monthly',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('zone_id', sa.Integer(), nullable=False),
        sa.Column('month', sa.Integer(), nullable=False),
        # Baseline values
        sa.Column('tmean', sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column('tmax', sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column('tmin', sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column('rain', sa.Numeric(precision=8, scale=2), nullable=True),
        sa.Column('gdd', sa.Numeric(precision=8, scale=2), nullable=True),
        # Metadata
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('NOW()')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['zone_id'], ['climate_zones.id'], name='fk_climate_baseline_zone'),
        sa.UniqueConstraint('zone_id', 'month', name='uq_baseline_zone_month'),
    )
    
    # =========================================================================
    # 4. CLIMATE PROJECTIONS
    # =========================================================================
    op.create_table(
        'climate_projections',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('zone_id', sa.Integer(), nullable=False),
        sa.Column('ssp', sa.String(length=10), nullable=False),
        sa.Column('period', sa.String(length=20), nullable=False),
        sa.Column('month', sa.Integer(), nullable=False),
        # Tmean projections
        sa.Column('tmean_delta', sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column('tmean_delta_sd', sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column('tmean_projected', sa.Numeric(precision=6, scale=2), nullable=True),
        # Tmax projections
        sa.Column('tmax_delta', sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column('tmax_delta_sd', sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column('tmax_projected', sa.Numeric(precision=6, scale=2), nullable=True),
        # Tmin projections
        sa.Column('tmin_delta', sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column('tmin_delta_sd', sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column('tmin_projected', sa.Numeric(precision=6, scale=2), nullable=True),
        # Rain projections
        sa.Column('rain_delta', sa.Numeric(precision=8, scale=2), nullable=True),
        sa.Column('rain_delta_sd', sa.Numeric(precision=8, scale=2), nullable=True),
        sa.Column('rain_projected', sa.Numeric(precision=8, scale=2), nullable=True),
        # GDD projections
        sa.Column('gdd_baseline', sa.Numeric(precision=8, scale=2), nullable=True),
        sa.Column('gdd_projected', sa.Numeric(precision=8, scale=2), nullable=True),
        # Metadata
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('NOW()')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['zone_id'], ['climate_zones.id'], name='fk_climate_projections_zone'),
        sa.UniqueConstraint('zone_id', 'ssp', 'period', 'month', name='uq_projection'),
    )
    op.create_index('idx_projections_zone_ssp', 'climate_projections', ['zone_id', 'ssp'])
    op.create_index('idx_projections_zone_period', 'climate_projections', ['zone_id', 'period'])


def downgrade() -> None:
    # Drop in reverse order due to foreign key dependencies
    op.drop_table('climate_projections')
    op.drop_table('climate_baseline_monthly')
    op.drop_table('climate_history_monthly')
    op.drop_table('climate_zones')
