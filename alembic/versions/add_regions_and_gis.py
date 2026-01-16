"""Add wine_regions and geographical_indications tables

Revision ID: add_regions_and_gis
Revises: [YOUR_PREVIOUS_REVISION]
Create Date: 2026-01-16

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from geoalchemy2 import Geometry


# revision identifiers, used by Alembic.
revision: str = 'add_regions_and_gis'
down_revision: Union[str, None] = 'add_public_auth'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()
    
    # Create wine_regions table if it doesn't exist
    if 'wine_regions' not in existing_tables:
        op.create_table(
            'wine_regions',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('name', sa.String(length=100), nullable=False),
            sa.Column('slug', sa.String(length=100), nullable=False),
            sa.Column('geometry', Geometry('MULTIPOLYGON', srid=4326), nullable=True),
            sa.Column('bounds', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column('summary', sa.Text(), nullable=True),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('climate_summary', sa.Text(), nullable=True),
            sa.Column('stats', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column('display_order', sa.Integer(), default=0),
            sa.Column('color', sa.String(length=7), default='#3b82f6'),
            sa.Column('is_active', sa.Boolean(), default=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
            sa.PrimaryKeyConstraint('id')
        )
    
    # Create indexes for wine_regions (using if_not_exists)
    op.create_index('idx_wine_regions_slug', 'wine_regions', ['slug'], unique=True, if_not_exists=True)
    op.create_index('idx_wine_regions_geometry', 'wine_regions', ['geometry'], postgresql_using='gist', if_not_exists=True)
    op.create_index('idx_wine_regions_active', 'wine_regions', ['is_active'], if_not_exists=True)
    
    # Create geographical_indications table if it doesn't exist
    if 'geographical_indications' not in existing_tables:
        op.create_table(
            'geographical_indications',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('name', sa.String(length=100), nullable=False),
            sa.Column('slug', sa.String(length=100), nullable=False),
            sa.Column('geometry', Geometry('MULTIPOLYGON', srid=4326), nullable=True),
            sa.Column('bounds', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column('ip_number', sa.String(length=20), nullable=True),
            sa.Column('iponz_url', sa.String(length=500), nullable=True),
            sa.Column('status', sa.String(length=50), default='Registered'),
            sa.Column('registration_date', sa.Date(), nullable=True),
            sa.Column('renewal_date', sa.Date(), nullable=True),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('region_id', sa.Integer(), nullable=True),
            sa.Column('display_order', sa.Integer(), default=0),
            sa.Column('color', sa.String(length=7), default='#8b5cf6'),
            sa.Column('is_active', sa.Boolean(), default=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
            sa.PrimaryKeyConstraint('id'),
            sa.ForeignKeyConstraint(['region_id'], ['wine_regions.id'], ondelete='SET NULL')
        )
    
    # Create indexes for geographical_indications (using if_not_exists)
    op.create_index('idx_gis_slug', 'geographical_indications', ['slug'], unique=True, if_not_exists=True)
    op.create_index('idx_gis_geometry', 'geographical_indications', ['geometry'], postgresql_using='gist', if_not_exists=True)
    op.create_index('idx_gis_region_id', 'geographical_indications', ['region_id'], if_not_exists=True)
    op.create_index('idx_gis_ip_number', 'geographical_indications', ['ip_number'], if_not_exists=True)
    op.create_index('idx_gis_active', 'geographical_indications', ['is_active'], if_not_exists=True)


def downgrade():
    # Drop geographical_indications table and indexes
    op.drop_index('idx_gis_active', table_name='geographical_indications', if_exists=True)
    op.drop_index('idx_gis_ip_number', table_name='geographical_indications', if_exists=True)
    op.drop_index('idx_gis_region_id', table_name='geographical_indications', if_exists=True)
    op.drop_index('idx_gis_geometry', table_name='geographical_indications', if_exists=True)
    op.drop_index('idx_gis_slug', table_name='geographical_indications', if_exists=True)
    op.drop_table('geographical_indications')
    
    # Drop wine_regions table and indexes
    op.drop_index('idx_wine_regions_active', table_name='wine_regions', if_exists=True)
    op.drop_index('idx_wine_regions_geometry', table_name='wine_regions', if_exists=True)
    op.drop_index('idx_wine_regions_slug', table_name='wine_regions', if_exists=True)
    op.drop_table('wine_regions')
