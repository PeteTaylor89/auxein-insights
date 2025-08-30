"""Create observation templates table

Revision ID: 001_create_observation_templates
Revises: migrate_images_to_files
Create Date: 2024-08-29 

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '001_create_observation_templates'
down_revision = 'migrate_images_to_files'  
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Create observation_templates table
    op.create_table('observation_templates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('template_name', sa.String(length=100), nullable=False),
        sa.Column('template_description', sa.Text(), nullable=True),
        sa.Column('observation_category', sa.String(length=50), nullable=False),
        sa.Column('observation_subtype', sa.String(length=50), nullable=True),
        sa.Column('default_fields', sa.JSON(), nullable=False, server_default='{}'),
        sa.Column('required_fields', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('measurement_fields', sa.JSON(), nullable=True),
        sa.Column('validation_rules', sa.JSON(), nullable=True),
        sa.Column('is_system_template', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('usage_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('company_id', sa.Integer(), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=False),
        sa.Column('blockchain_eligible', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('can_create_risk', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('can_create_task', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes
    op.create_index('idx_category_company', 'observation_templates', ['observation_category', 'company_id'])
    op.create_index('idx_system_active', 'observation_templates', ['is_system_template', 'is_active'])
    op.create_index('idx_company_active', 'observation_templates', ['company_id', 'is_active'])
    op.create_index(op.f('ix_observation_templates_id'), 'observation_templates', ['id'])

def downgrade() -> None:
    # Drop indexes
    op.drop_index(op.f('ix_observation_templates_id'), table_name='observation_templates')
    op.drop_index('idx_company_active', table_name='observation_templates')
    op.drop_index('idx_system_active', table_name='observation_templates')
    op.drop_index('idx_category_company', table_name='observation_templates')
    
    # Drop table
    op.drop_table('observation_templates')