"""Drop the four blockchain traceability tables

Revision ID: drop_blockchain_tables
Revises: zone_cell_mask
Create Date: 2026-08-17

The blockchain module is removed — see docs/plans/BLOCKCHAIN_REMOVAL.md.

DO NOT RUN THIS UNTIL THE CODE REMOVAL IS DEPLOYED. Dropping first leaves live
code querying tables that no longer exist, which 500s block creation and company
assignment until the code deploy lands.

At the time of writing prod held: blockchain_chains 89, blockchain_nodes 89,
blockchain_events 0, fruit_received 0 — i.e. one genesis node per chain and
nothing ever appended. Take the pg_dump in the plan doc first if the option to
reintroduce matters.

The downgrade reproduces the LIVE schema as reflected from prod on 2026-08-17,
not the literal sum of migrations 003/004/005. That distinction matters:
`blockchain_chains` carries BOTH `season` (added by 004) and `season_id` (added
by 005), because 005 re-added the season columns under new names rather than
renaming them. Both are reproduced here.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'drop_blockchain_tables'
# Deliberately LAST in the chain. This is the only migration with a deployment
# precondition — the code removal must ship before the tables go — so keeping it
# at the tip means `alembic upgrade add_map_features` is a safe stopping point
# that applies everything else without touching blockchain.
#
# (It was originally written against surface_cv_units, but a parallel Insights
# session added zone_cell_mask off that same head on the same day, which gave
# alembic two heads and would have made `upgrade head` fail outright.)
down_revision: Union[str, None] = 'add_map_features'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # Drop in FK order: fruit_received and blockchain_events both point at
    # blockchain_nodes, which points at blockchain_chains.
    op.drop_table('fruit_received')
    op.drop_table('blockchain_events')
    op.drop_table('blockchain_nodes')
    op.drop_table('blockchain_chains')


def downgrade():
    # Recreates the tables and their indexes. It does NOT restore the rows —
    # for those, replay the pg_dump referenced in the plan doc.
    op.create_table(
        'blockchain_chains',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('chain_uuid', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('vineyard_block_id', sa.Integer(), nullable=False),
        sa.Column('chain_name', sa.String(), nullable=True),
        sa.Column('genesis_hash', sa.String(), nullable=False),
        sa.Column('current_head_hash', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('company_id', sa.Integer(), nullable=True),
        sa.Column('season', sa.String(), nullable=False, server_default='2025'),
        sa.Column('created_by_assignment', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('assignment_user_id', sa.Integer(), nullable=True),
        sa.Column('archived_at', sa.DateTime(), nullable=True),
        sa.Column('archived_by_user_id', sa.Integer(), nullable=True),
        sa.Column('archive_reason', sa.String(), nullable=True),
        sa.Column('season_id', sa.String(), nullable=False, server_default='2025'),
        sa.Column('season_type', sa.String(), nullable=False, server_default='standard'),
        sa.Column('season_info', sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(['vineyard_block_id'], ['vineyard_blocks.id'], ),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'],
                                name='fk_blockchain_chains_company_id'),
        sa.ForeignKeyConstraint(['assignment_user_id'], ['users.id'],
                                name='fk_blockchain_chains_assignment_user_id'),
        sa.ForeignKeyConstraint(['archived_by_user_id'], ['users.id'],
                                name='fk_blockchain_chains_archived_by_user_id'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('chain_uuid'),
    )
    op.create_index(op.f('ix_blockchain_chains_chain_uuid'), 'blockchain_chains', ['chain_uuid'], unique=False)
    op.create_index(op.f('ix_blockchain_chains_id'), 'blockchain_chains', ['id'], unique=False)
    op.create_index('idx_block_season_active', 'blockchain_chains',
                    ['vineyard_block_id', 'season_id', 'is_active'], unique=False)
    op.create_index('idx_season_type', 'blockchain_chains', ['season_type'], unique=False)

    op.create_table(
        'blockchain_nodes',
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
        sa.UniqueConstraint('node_uuid'),
    )
    op.create_index('idx_chain_sequence', 'blockchain_nodes', ['chain_id', 'sequence_number'], unique=False)
    op.create_index('idx_node_type_chain', 'blockchain_nodes', ['node_type', 'chain_id'], unique=False)
    op.create_index('idx_reference', 'blockchain_nodes', ['reference_type', 'reference_id'], unique=False)
    op.create_index(op.f('ix_blockchain_nodes_id'), 'blockchain_nodes', ['id'], unique=False)
    op.create_index(op.f('ix_blockchain_nodes_node_hash'), 'blockchain_nodes', ['node_hash'], unique=False)
    op.create_index(op.f('ix_blockchain_nodes_node_uuid'), 'blockchain_nodes', ['node_uuid'], unique=False)

    op.create_table(
        'blockchain_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('node_id', sa.Integer(), nullable=False),
        sa.Column('event_type', sa.String(), nullable=False),
        sa.Column('event_data', sa.JSON(), nullable=False),
        sa.Column('privacy_level', sa.String(), nullable=True),
        sa.Column('hashed_fields', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['node_id'], ['blockchain_nodes.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_blockchain_events_id'), 'blockchain_events', ['id'], unique=False)

    op.create_table(
        'fruit_received',
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
        sa.ForeignKeyConstraint(['vineyard_block_id'], ['vineyard_blocks.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('fruit_uuid'),
    )
    op.create_index(op.f('ix_fruit_received_fruit_uuid'), 'fruit_received', ['fruit_uuid'], unique=False)
    op.create_index(op.f('ix_fruit_received_id'), 'fruit_received', ['id'], unique=False)
    op.create_index(op.f('ix_fruit_received_provenance_hash'), 'fruit_received', ['provenance_hash'], unique=False)
