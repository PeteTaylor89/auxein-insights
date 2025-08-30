"""Create blockchain DAG tables

Revision ID: 20250629_003
Revises: 20250629_002
Create Date: 2025-06-29 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '20250629_003'
down_revision: Union[str, None] = '20250629_002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # Create blockchain_chains table
    op.create_table('blockchain_chains',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('chain_uuid', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('vineyard_block_id', sa.Integer(), nullable=False),
        sa.Column('chain_name', sa.String(), nullable=True),
        sa.Column('genesis_hash', sa.String(), nullable=False),
        sa.Column('current_head_hash', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['vineyard_block_id'], ['vineyard_blocks.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('chain_uuid')
    )
    op.create_index(op.f('ix_blockchain_chains_chain_uuid'), 'blockchain_chains', ['chain_uuid'], unique=False)
    op.create_index(op.f('ix_blockchain_chains_id'), 'blockchain_chains', ['id'], unique=False)

    # Create blockchain_nodes table
    op.create_table('blockchain_nodes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('node_uuid', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('chain_id', sa.Integer(), nullable=False),
        sa.Column('node_type', sa.String(), nullable=False),
        sa.Column('reference_type', sa.String(), nullable=True),
        sa.Column('reference_id', sa.Integer(), nullable=True),
        sa.Column('parent_hashes', sa.JSON(), nullable=True),
        sa.Column('node_hash', sa.String(), nullable=False),
        sa.Column('blockchain_data', sa.JSON(), nullable=False),
        sa.Column('sequence_number', sa.Integer(), nullable=False),
        sa.Column('confirmed_at', sa.DateTime(), nullable=False),
        sa.Column('confirmed_by_user_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['chain_id'], ['blockchain_chains.id'], ),
        sa.ForeignKeyConstraint(['confirmed_by_user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('node_hash'),
        sa.UniqueConstraint('node_uuid')
    )
    op.create_index('idx_chain_sequence', 'blockchain_nodes', ['chain_id', 'sequence_number'], unique=False)
    op.create_index('idx_node_type_chain', 'blockchain_nodes', ['node_type', 'chain_id'], unique=False)
    op.create_index('idx_reference', 'blockchain_nodes', ['reference_type', 'reference_id'], unique=False)
    op.create_index(op.f('ix_blockchain_nodes_id'), 'blockchain_nodes', ['id'], unique=False)
    op.create_index(op.f('ix_blockchain_nodes_node_hash'), 'blockchain_nodes', ['node_hash'], unique=False)
    op.create_index(op.f('ix_blockchain_nodes_node_uuid'), 'blockchain_nodes', ['node_uuid'], unique=False)

    # Create blockchain_events table
    op.create_table('blockchain_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('node_id', sa.Integer(), nullable=False),
        sa.Column('event_type', sa.String(), nullable=False),
        sa.Column('event_data', sa.JSON(), nullable=False),
        sa.Column('privacy_level', sa.String(), nullable=True),
        sa.Column('hashed_fields', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['node_id'], ['blockchain_nodes.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_blockchain_events_id'), 'blockchain_events', ['id'], unique=False)

    # Create fruit_received table
    op.create_table('fruit_received',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('fruit_uuid', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('chain_id', sa.Integer(), nullable=False),
        sa.Column('vineyard_block_id', sa.Integer(), nullable=False),
        sa.Column('harvest_event_id', sa.Integer(), nullable=True),
        sa.Column('blockchain_node_id', sa.Integer(), nullable=False),
        sa.Column('harvest_date', sa.DateTime(), nullable=False),
        sa.Column('quantity_kg', sa.Float(), nullable=False),
        sa.Column('brix', sa.Float(), nullable=True),
        sa.Column('ph', sa.Float(), nullable=True),
        sa.Column('total_acidity', sa.Float(), nullable=True),
        sa.Column('quality_grade', sa.String(), nullable=True),
        sa.Column('defect_percentage', sa.Float(), nullable=True),
        sa.Column('provenance_hash', sa.String(), nullable=False),
        sa.Column('delivered_to', sa.String(), nullable=True),
        sa.Column('delivery_confirmed_at', sa.DateTime(), nullable=True),
        sa.Column('delivery_confirmed_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['blockchain_node_id'], ['blockchain_nodes.id'], ),
        sa.ForeignKeyConstraint(['chain_id'], ['blockchain_chains.id'], ),
        sa.ForeignKeyConstraint(['delivery_confirmed_by'], ['users.id'], ),
        # Note: harvest_events table may not exist yet, so this FK might need to be added later
        # sa.ForeignKeyConstraint(['harvest_event_id'], ['harvest_events.id'], ),
        sa.ForeignKeyConstraint(['vineyard_block_id'], ['vineyard_blocks.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('fruit_uuid')
    )
    op.create_index(op.f('ix_fruit_received_fruit_uuid'), 'fruit_received', ['fruit_uuid'], unique=False)
    op.create_index(op.f('ix_fruit_received_id'), 'fruit_received', ['id'], unique=False)
    op.create_index(op.f('ix_fruit_received_provenance_hash'), 'fruit_received', ['provenance_hash'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_fruit_received_provenance_hash'), table_name='fruit_received')
    op.drop_index(op.f('ix_fruit_received_id'), table_name='fruit_received')
    op.drop_index(op.f('ix_fruit_received_fruit_uuid'), table_name='fruit_received')
    op.drop_table('fruit_received')
    
    op.drop_index(op.f('ix_blockchain_events_id'), table_name='blockchain_events')
    op.drop_table('blockchain_events')
    
    op.drop_index(op.f('ix_blockchain_nodes_node_uuid'), table_name='blockchain_nodes')
    op.drop_index(op.f('ix_blockchain_nodes_node_hash'), table_name='blockchain_nodes')
    op.drop_index(op.f('ix_blockchain_nodes_id'), table_name='blockchain_nodes')
    op.drop_index('idx_reference', table_name='blockchain_nodes')
    op.drop_index('idx_node_type_chain', table_name='blockchain_nodes')
    op.drop_index('idx_chain_sequence', table_name='blockchain_nodes')
    op.drop_table('blockchain_nodes')
    
    op.drop_index(op.f('ix_blockchain_chains_id'), table_name='blockchain_chains')
    op.drop_index(op.f('ix_blockchain_chains_chain_uuid'), table_name='blockchain_chains')
    op.drop_table('blockchain_chains')