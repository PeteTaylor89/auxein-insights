"""Add external_aliases table for third-party system ID mapping.

Grow V1 Revision 2: polymorphic alias table linking blocks, properties,
assets etc. to their IDs in external systems (GrapeLink, SWNZ, ACVM, etc.)

Revision ID: r2_external_aliases
Revises: r2_forecast_and_feed
Create Date: 2026-03-25

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers
revision = 'r2_external_aliases'
down_revision = 'r2_forecast_and_feed'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'external_aliases',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id'), nullable=False),
        sa.Column('entity_type', sa.String(50), nullable=False),
        sa.Column('entity_id', sa.Integer(), nullable=False),
        sa.Column('system_name', sa.String(100), nullable=False),
        sa.Column('external_id', sa.String(255), nullable=False),
        sa.Column('external_label', sa.String(255), nullable=True),
        sa.Column('metadata', JSONB, nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_index('ix_external_aliases_id', 'external_aliases', ['id'])
    op.create_index('ix_external_aliases_company', 'external_aliases', ['company_id'])
    op.create_index('ix_alias_entity', 'external_aliases', ['entity_type', 'entity_id'])
    op.create_index('ix_alias_system', 'external_aliases', ['company_id', 'system_name'])
    op.create_unique_constraint(
        'uq_alias_entity_system',
        'external_aliases',
        ['company_id', 'entity_type', 'entity_id', 'system_name']
    )


def downgrade():
    op.drop_table('external_aliases')
