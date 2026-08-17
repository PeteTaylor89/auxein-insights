"""Add map_features — user-drawn points of interest for Maps V2

Revision ID: add_map_features
Revises: zone_cell_mask
Create Date: 2026-08-17

See docs/plans/MAP_POI_AND_PRINT.md Part A.

Purely additive — one new table, nothing existing changes behaviour. Safe to
apply independently of the blockchain drop it chains off.

Deliberately NOT a Postgres ENUM for feature_type: adding a POI type should be
a code change, not a migration plus an ALTER TYPE. Same reasoning as
vineyard_blocks.status being a plain VARCHAR(20).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from geoalchemy2 import Geometry

# revision identifiers, used by Alembic.
revision: str = 'add_map_features'
# Ordered BEFORE drop_blockchain_tables deliberately. The blockchain drop is the
# only migration here with a deployment precondition (its code removal must ship
# first), so it goes last — which makes `alembic upgrade add_map_features` a
# valid stopping point that gets this table in without touching blockchain.
down_revision: Union[str, None] = 'zone_cell_mask'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.create_table(
        'map_features',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('company_id', sa.Integer(), nullable=False),
        sa.Column('property_id', sa.Integer(), nullable=True),
        sa.Column('feature_type', sa.String(length=40), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('geometry', Geometry(geometry_type='GEOMETRY', srid=4326), nullable=False),
        sa.Column('style', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ),
        sa.ForeignKeyConstraint(['property_id'], ['properties.id'], ),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_map_features_id'), 'map_features', ['id'], unique=False)
    op.create_index(op.f('ix_map_features_company_id'), 'map_features', ['company_id'], unique=False)
    op.create_index(op.f('ix_map_features_property_id'), 'map_features', ['property_id'], unique=False)
    op.create_index(op.f('ix_map_features_feature_type'), 'map_features', ['feature_type'], unique=False)
    op.create_index('ix_map_features_company_active', 'map_features', ['company_id', 'is_active'], unique=False)
    # GiST on the geometry — geoalchemy2 does NOT create this automatically when
    # the table is built through alembic rather than metadata.create_all().
    op.create_index('ix_map_features_geometry', 'map_features', ['geometry'],
                    unique=False, postgresql_using='gist')


def downgrade():
    op.drop_index('ix_map_features_geometry', table_name='map_features')
    op.drop_index('ix_map_features_company_active', table_name='map_features')
    op.drop_index(op.f('ix_map_features_feature_type'), table_name='map_features')
    op.drop_index(op.f('ix_map_features_property_id'), table_name='map_features')
    op.drop_index(op.f('ix_map_features_company_id'), table_name='map_features')
    op.drop_index(op.f('ix_map_features_id'), table_name='map_features')
    op.drop_table('map_features')
