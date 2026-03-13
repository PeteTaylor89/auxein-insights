"""Add properties, management_relationships, user_property_scopes tables
and property_id FK on vineyard_blocks.

Grow V1 Phase A foundation: Property entity layer between Company and
VineyardBlock. ManagementRelationship tracks which company manages a
property (with partial unique index enforcing one active manager).
UserPropertyScope enables VMC staff property-level scoping.

Revision ID: add_properties_and_management
Revises: add_user_type_to_users
Create Date: 2026-03-13

"""
from alembic import op
import sqlalchemy as sa

revision: str = 'add_properties_and_management'
down_revision: str = 'add_user_type_to_users'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- 1. properties table ---
    op.create_table(
        'properties',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('owner_company_id', sa.Integer(), sa.ForeignKey('companies.id'), nullable=True),
        sa.Column('address', sa.Text(), nullable=True),
        sa.Column('legal_description', sa.Text(), nullable=True),
        sa.Column('total_area_ha', sa.Numeric(10, 4), nullable=True),
        sa.Column('region', sa.String(100), nullable=True),
        sa.Column('grapelink_grower_id', sa.String(100), nullable=True),
        sa.Column('grapelink_property_code', sa.String(100), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_properties_id', 'properties', ['id'])
    op.create_index('ix_properties_owner_company_id', 'properties', ['owner_company_id'])

    # --- 2. management_relationships table ---
    op.create_table(
        'management_relationships',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('property_id', sa.Integer(), sa.ForeignKey('properties.id'), nullable=False),
        sa.Column('managing_company_id', sa.Integer(), sa.ForeignKey('companies.id'), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=True),
        sa.Column('contract_reference', sa.String(255), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('TRUE')),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_management_relationships_id', 'management_relationships', ['id'])

    # Partial unique index: one active manager per property
    op.execute("""
        CREATE UNIQUE INDEX idx_one_active_manager
        ON management_relationships (property_id)
        WHERE is_active = TRUE
    """)

    # --- 3. user_property_scopes table ---
    op.create_table(
        'user_property_scopes',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('property_id', sa.Integer(), sa.ForeignKey('properties.id'), nullable=False),
        sa.UniqueConstraint('user_id', 'property_id', name='uq_user_property'),
    )
    op.create_index('ix_user_property_scopes_user_id', 'user_property_scopes', ['user_id'])
    op.create_index('ix_user_property_scopes_property_id', 'user_property_scopes', ['property_id'])

    # --- 4. Add property_id FK to vineyard_blocks ---
    op.add_column('vineyard_blocks', sa.Column('property_id', sa.Integer(), sa.ForeignKey('properties.id'), nullable=True))
    op.create_index('ix_vineyard_blocks_property_id', 'vineyard_blocks', ['property_id'])


def downgrade() -> None:
    # Reverse order
    op.drop_index('ix_vineyard_blocks_property_id', table_name='vineyard_blocks')
    op.drop_column('vineyard_blocks', 'property_id')

    op.drop_index('ix_user_property_scopes_property_id', table_name='user_property_scopes')
    op.drop_index('ix_user_property_scopes_user_id', table_name='user_property_scopes')
    op.drop_table('user_property_scopes')

    op.execute("DROP INDEX IF EXISTS idx_one_active_manager")
    op.drop_index('ix_management_relationships_id', table_name='management_relationships')
    op.drop_table('management_relationships')

    op.drop_index('ix_properties_owner_company_id', table_name='properties')
    op.drop_index('ix_properties_id', table_name='properties')
    op.drop_table('properties')
