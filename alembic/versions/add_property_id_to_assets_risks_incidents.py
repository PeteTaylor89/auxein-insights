"""Add property_id FK to assets, site_risks, and incidents tables.

Revision ID: add_property_gating
Revises: add_task_gps_summaries
Create Date: 2026-04-17
"""
from alembic import op
import sqlalchemy as sa

revision = 'add_property_gating'
down_revision = 'add_task_gps_summaries'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('assets', sa.Column('property_id', sa.Integer(), sa.ForeignKey('properties.id'), nullable=True))
    op.create_index('ix_assets_property_id', 'assets', ['property_id'])

    op.add_column('site_risks', sa.Column('property_id', sa.Integer(), sa.ForeignKey('properties.id'), nullable=True))
    op.create_index('ix_site_risks_property_id', 'site_risks', ['property_id'])

    op.add_column('incidents', sa.Column('property_id', sa.Integer(), sa.ForeignKey('properties.id'), nullable=True))
    op.create_index('ix_incidents_property_id', 'incidents', ['property_id'])


def downgrade():
    op.drop_index('ix_incidents_property_id', table_name='incidents')
    op.drop_column('incidents', 'property_id')

    op.drop_index('ix_site_risks_property_id', table_name='site_risks')
    op.drop_column('site_risks', 'property_id')

    op.drop_index('ix_assets_property_id', table_name='assets')
    op.drop_column('assets', 'property_id')
