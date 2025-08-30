# migrations/versions/xxx_create_spatial_areas.py
"""create spatial areas table

Revision ID: 20250703_002
Revises: 20250703_001  # Previous geometry migration
Create Date: 2025-07-03 11:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry

revision = '20250703_002'
down_revision = '20250703_001'  # Replace with your actual previous revision
branch_labels = None
depends_on = None

def upgrade():
    # Create spatial_areas table
    op.create_table(
        'spatial_areas',
        sa.Column('id', sa.Integer, primary_key=True, index=True),
        sa.Column('area_type', sa.String(50), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('geometry', Geometry('POLYGON', srid=4326), nullable=False),
        sa.Column('parent_area_id', sa.Integer, sa.ForeignKey('spatial_areas.id'), nullable=True),
        sa.Column('company_id', sa.Integer, sa.ForeignKey('companies.id'), nullable=False),
        sa.Column('metadata', sa.JSON, nullable=False, default={}),
        sa.Column('is_active', sa.Boolean, default=True, nullable=False),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now(), onupdate=sa.func.now())
    )
    
    # Add check constraint for area_type
    op.execute('''
        ALTER TABLE spatial_areas 
        ADD CONSTRAINT check_area_type 
        CHECK (area_type IN (
            'paddock', 'orchard', 'plantation_forestry', 'native_forest',
            'infrastructure_zone', 'waterway', 'wetland', 
            'conservation_area', 'waste_management'
        ))
    ''')
    
    # Add spatial index
    op.execute('CREATE INDEX idx_spatial_areas_geom ON spatial_areas USING GIST (geometry)')
    
    # Add area calculation function
    op.execute('''
        ALTER TABLE spatial_areas 
        ADD COLUMN area_hectares DECIMAL 
        GENERATED ALWAYS AS (ST_Area(geometry::geography) / 10000) STORED
    ''')
    
    # Add indexes for performance
    op.create_index('idx_spatial_areas_type', 'spatial_areas', ['area_type'])
    op.create_index('idx_spatial_areas_company', 'spatial_areas', ['company_id'])
    op.create_index('idx_spatial_areas_parent', 'spatial_areas', ['parent_area_id'])

def downgrade():
    op.drop_index('idx_spatial_areas_parent')
    op.drop_index('idx_spatial_areas_company')
    op.drop_index('idx_spatial_areas_type')
    op.execute('DROP INDEX IF EXISTS idx_spatial_areas_geom')
    op.drop_table('spatial_areas')