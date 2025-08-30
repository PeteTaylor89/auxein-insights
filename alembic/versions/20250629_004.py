"""Add season and company tracking to blockchain chains

Revision ID: 20250629_004
Revises: 20250629_003
Create Date: 2025-06-29 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20250629_004'
down_revision: Union[str, None] = '20250629_003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # Add new columns to blockchain_chains
    op.add_column('blockchain_chains', sa.Column('company_id', sa.Integer(), nullable=True))
    op.add_column('blockchain_chains', sa.Column('season', sa.String(), nullable=False, server_default='2025'))
    op.add_column('blockchain_chains', sa.Column('created_by_assignment', sa.Boolean(), nullable=True, server_default='false'))
    op.add_column('blockchain_chains', sa.Column('assignment_user_id', sa.Integer(), nullable=True))
    op.add_column('blockchain_chains', sa.Column('archived_at', sa.DateTime(), nullable=True))
    op.add_column('blockchain_chains', sa.Column('archived_by_user_id', sa.Integer(), nullable=True))
    op.add_column('blockchain_chains', sa.Column('archive_reason', sa.String(), nullable=True))
    
    # Add foreign key constraints
    op.create_foreign_key('fk_blockchain_chains_company_id', 'blockchain_chains', 'companies', ['company_id'], ['id'])
    op.create_foreign_key('fk_blockchain_chains_assignment_user_id', 'blockchain_chains', 'users', ['assignment_user_id'], ['id'])
    op.create_foreign_key('fk_blockchain_chains_archived_by_user_id', 'blockchain_chains', 'users', ['archived_by_user_id'], ['id'])
    
    # Add index for block/season/active lookup
    op.create_index('idx_block_season_active', 'blockchain_chains', ['vineyard_block_id', 'season', 'is_active'])
    
    # Update VineyardBlock to support multiple blockchain chains
    # Add relationship in model: blockchain_chains = relationship("BlockchainChain", back_populates="vineyard_block")


def downgrade():
    # Remove index
    op.drop_index('idx_block_season_active', table_name='blockchain_chains')
    
    # Remove foreign key constraints
    op.drop_constraint('fk_blockchain_chains_archived_by_user_id', 'blockchain_chains', type_='foreignkey')
    op.drop_constraint('fk_blockchain_chains_assignment_user_id', 'blockchain_chains', type_='foreignkey')
    op.drop_constraint('fk_blockchain_chains_company_id', 'blockchain_chains', type_='foreignkey')
    
    # Remove columns
    op.drop_column('blockchain_chains', 'archive_reason')
    op.drop_column('blockchain_chains', 'archived_by_user_id')
    op.drop_column('blockchain_chains', 'archived_at')
    op.drop_column('blockchain_chains', 'assignment_user_id')
    op.drop_column('blockchain_chains', 'created_by_assignment')
    op.drop_column('blockchain_chains', 'season')
    op.drop_column('blockchain_chains', 'company_id')