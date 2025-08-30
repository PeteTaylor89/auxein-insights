"""Add vineyard row fields and create vineyard_rows table

Revision ID: 20250629_001
Revises: e85fe4556199
Create Date: 2025-06-29 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20250629_001'
down_revision: Union[str, None] = 'e85fe4556199'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # Add new columns to vineyard_blocks table
    op.add_column('vineyard_blocks', sa.Column('row_start', sa.String(), nullable=True))
    op.add_column('vineyard_blocks', sa.Column('row_end', sa.String(), nullable=True))
    op.add_column('vineyard_blocks', sa.Column('row_count', sa.Integer(), nullable=True))
    op.add_column('vineyard_blocks', sa.Column('training_system', sa.String(), nullable=True))
    
    # Create vineyard_rows table
    op.create_table('vineyard_rows',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('block_id', sa.Integer(), nullable=False),
        sa.Column('row_number', sa.String(), nullable=True),
        sa.Column('row_length', sa.Float(), nullable=True),
        sa.Column('vine_spacing', sa.Float(), nullable=True),
        sa.Column('variety', sa.String(), nullable=True),
        sa.Column('clone', sa.String(), nullable=True),
        sa.Column('rootstock', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['block_id'], ['vineyard_blocks.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_vineyard_rows_id'), 'vineyard_rows', ['id'], unique=False)


def downgrade():
    # Drop vineyard_rows table
    op.drop_index(op.f('ix_vineyard_rows_id'), table_name='vineyard_rows')
    op.drop_table('vineyard_rows')
    
    # Remove columns from vineyard_blocks table
    op.drop_column('vineyard_blocks', 'training_system')
    op.drop_column('vineyard_blocks', 'row_count')
    op.drop_column('vineyard_blocks', 'row_end')
    op.drop_column('vineyard_blocks', 'row_start')