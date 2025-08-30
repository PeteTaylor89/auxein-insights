"""add_company_support

Revision ID: 6fbc24f09e13
Revises: 848feb1504bd
Create Date: 2025-05-19 10:22:18.167024

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '[generated_revision_id]'  # This will be auto-generated
down_revision: Union[str, None] = '848feb1504bd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema to add company support."""
    
    # Step 1: Create companies table
    op.create_table(
        'companies',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('address', sa.Text(), nullable=True),
        sa.Column('company_number', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes for companies table
    op.create_index(op.f('ix_companies_id'), 'companies', ['id'], unique=False)
    op.create_index(op.f('ix_companies_company_number'), 'companies', ['company_number'], unique=True)
    
    # Step 2: Add company_id to users table
    op.add_column('users', sa.Column('company_id', sa.Integer(), nullable=True))
    
    # Step 3: Add company_id to vineyard_blocks table  
    op.add_column('vineyard_blocks', sa.Column('company_id', sa.Integer(), nullable=True))
    
    # Step 4: Add company_id to tasks table
    op.add_column('tasks', sa.Column('company_id', sa.Integer(), nullable=True))
    
    # Step 5: Add company_id to observations table
    op.add_column('observations', sa.Column('company_id', sa.Integer(), nullable=True))
    
    # Step 6: Create foreign key constraints
    op.create_foreign_key(
        'fk_users_company_id', 
        'users', 
        'companies', 
        ['company_id'], 
        ['id'], 
        ondelete='SET NULL'
    )
    
    op.create_foreign_key(
        'fk_vineyard_blocks_company_id', 
        'vineyard_blocks', 
        'companies', 
        ['company_id'], 
        ['id'], 
        ondelete='CASCADE'
    )
    
    op.create_foreign_key(
        'fk_tasks_company_id', 
        'tasks', 
        'companies', 
        ['company_id'], 
        ['id'], 
        ondelete='CASCADE'
    )
    
    op.create_foreign_key(
        'fk_observations_company_id', 
        'observations', 
        'companies', 
        ['company_id'], 
        ['id'], 
        ondelete='CASCADE'
    )
    
    # Step 7: Create indexes for foreign keys (for performance)
    op.create_index(op.f('ix_users_company_id'), 'users', ['company_id'], unique=False)
    op.create_index(op.f('ix_vineyard_blocks_company_id'), 'vineyard_blocks', ['company_id'], unique=False)
    op.create_index(op.f('ix_tasks_company_id'), 'tasks', ['company_id'], unique=False)
    op.create_index(op.f('ix_observations_company_id'), 'observations', ['company_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema to remove company support."""
    
    # Step 1: Drop indexes
    op.drop_index(op.f('ix_observations_company_id'), table_name='observations')
    op.drop_index(op.f('ix_tasks_company_id'), table_name='tasks')
    op.drop_index(op.f('ix_vineyard_blocks_company_id'), table_name='vineyard_blocks')
    op.drop_index(op.f('ix_users_company_id'), table_name='users')
    
    # Step 2: Drop foreign key constraints
    op.drop_constraint('fk_observations_company_id', 'observations', type_='foreignkey')
    op.drop_constraint('fk_tasks_company_id', 'tasks', type_='foreignkey')
    op.drop_constraint('fk_vineyard_blocks_company_id', 'vineyard_blocks', type_='foreignkey')
    op.drop_constraint('fk_users_company_id', 'users', type_='foreignkey')
    
    # Step 3: Drop company_id columns
    op.drop_column('observations', 'company_id')
    op.drop_column('tasks', 'company_id')
    op.drop_column('vineyard_blocks', 'company_id')
    op.drop_column('users', 'company_id')
    
    # Step 4: Drop companies table
    op.drop_index(op.f('ix_companies_company_number'), table_name='companies')
    op.drop_index(op.f('ix_companies_id'), table_name='companies')
    op.drop_table('companies')