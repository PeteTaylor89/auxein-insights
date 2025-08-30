"""Safe flexible season management migration - checks existing columns

Revision ID: 20250629_005
Revises: 20250629_004
Create Date: 2025-06-29 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = '20250629_005'
down_revision: Union[str, None] = '20250629_004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def column_exists(table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table"""
    conn = op.get_bind()
    result = conn.execute(text(f"""
        SELECT COUNT(*) 
        FROM information_schema.columns 
        WHERE table_name = '{table_name}' 
        AND column_name = '{column_name}'
    """))
    return result.scalar() > 0


def index_exists(index_name: str) -> bool:
    """Check if an index exists"""
    conn = op.get_bind()
    result = conn.execute(text(f"""
        SELECT COUNT(*) 
        FROM pg_indexes 
        WHERE indexname = '{index_name}'
    """))
    return result.scalar() > 0


def foreign_key_exists(constraint_name: str) -> bool:
    """Check if a foreign key constraint exists"""
    conn = op.get_bind()
    result = conn.execute(text(f"""
        SELECT COUNT(*) 
        FROM information_schema.table_constraints 
        WHERE constraint_name = '{constraint_name}' 
        AND constraint_type = 'FOREIGN KEY'
    """))
    return result.scalar() > 0


def upgrade():
    # Safely add columns only if they don't exist
    columns_to_add = [
        ('company_id', sa.Column('company_id', sa.Integer(), nullable=True)),
        ('season_id', sa.Column('season_id', sa.String(), nullable=False, server_default='2025')),
        ('season_type', sa.Column('season_type', sa.String(), nullable=False, server_default='standard')),
        ('season_info', sa.Column('season_info', sa.JSON(), nullable=True)),
        ('created_by_assignment', sa.Column('created_by_assignment', sa.Boolean(), nullable=True, server_default='false')),
        ('assignment_user_id', sa.Column('assignment_user_id', sa.Integer(), nullable=True)),
        ('archived_at', sa.Column('archived_at', sa.DateTime(), nullable=True)),
        ('archived_by_user_id', sa.Column('archived_by_user_id', sa.Integer(), nullable=True)),
        ('archive_reason', sa.Column('archive_reason', sa.String(), nullable=True)),
    ]
    
    for column_name, column_def in columns_to_add:
        if not column_exists('blockchain_chains', column_name):
            print(f"Adding column: {column_name}")
            op.add_column('blockchain_chains', column_def)
        else:
            print(f"Column {column_name} already exists, skipping")
    
    # Safely add foreign key constraints
    foreign_keys = [
        ('fk_blockchain_chains_company_id', 'blockchain_chains', 'companies', ['company_id'], ['id']),
        ('fk_blockchain_chains_assignment_user_id', 'blockchain_chains', 'users', ['assignment_user_id'], ['id']),
        ('fk_blockchain_chains_archived_by_user_id', 'blockchain_chains', 'users', ['archived_by_user_id'], ['id']),
    ]
    
    for fk_name, source_table, target_table, source_cols, target_cols in foreign_keys:
        if not foreign_key_exists(fk_name):
            print(f"Adding foreign key: {fk_name}")
            try:
                op.create_foreign_key(fk_name, source_table, target_table, source_cols, target_cols)
            except Exception as e:
                print(f"Could not create foreign key {fk_name}: {e}")
        else:
            print(f"Foreign key {fk_name} already exists, skipping")
    
    # Safely add indexes
    indexes = [
        ('idx_block_season_active', 'blockchain_chains', ['vineyard_block_id', 'season_id', 'is_active']),
        ('idx_season_type', 'blockchain_chains', ['season_type']),
    ]
    
    for index_name, table_name, columns in indexes:
        if not index_exists(index_name):
            print(f"Adding index: {index_name}")
            op.create_index(index_name, table_name, columns)
        else:
            print(f"Index {index_name} already exists, skipping")


def downgrade():
    # Safe downgrade - only drop if exists
    
    # Drop indexes
    if index_exists('idx_season_type'):
        op.drop_index('idx_season_type', table_name='blockchain_chains')
    
    if index_exists('idx_block_season_active'):
        op.drop_index('idx_block_season_active', table_name='blockchain_chains')
    
    # Drop foreign keys
    fks_to_drop = [
        'fk_blockchain_chains_archived_by_user_id',
        'fk_blockchain_chains_assignment_user_id', 
        'fk_blockchain_chains_company_id'
    ]
    
    for fk_name in fks_to_drop:
        if foreign_key_exists(fk_name):
            try:
                op.drop_constraint(fk_name, 'blockchain_chains', type_='foreignkey')
            except Exception as e:
                print(f"Could not drop foreign key {fk_name}: {e}")
    
    # Drop columns
    columns_to_drop = [
        'archive_reason', 'archived_by_user_id', 'archived_at',
        'assignment_user_id', 'created_by_assignment', 'season_info',
        'season_type', 'season_id', 'company_id'
    ]
    
    for column_name in columns_to_drop:
        if column_exists('blockchain_chains', column_name):
            op.drop_column('blockchain_chains', column_name)