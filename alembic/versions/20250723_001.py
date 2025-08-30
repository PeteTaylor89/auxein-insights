
"""rename metadata to area_metadata

Revision ID: 20250723_001
Revises: 20250712_001  
Create Date: 2025-07-23 
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import geoalchemy2

revision = '20250723_001'
down_revision = '20250712_001'  
branch_labels = None
depends_on = None

def upgrade():
    # Add new columns to vineyard_blocks table
    op.add_column('vineyard_blocks', 
        sa.Column('biodynamic', sa.Boolean(), nullable=True, server_default='false'))
    op.add_column('vineyard_blocks', 
        sa.Column('regenerative', sa.Boolean(), nullable=True, server_default='false'))
    op.add_column('vineyard_blocks', 
        sa.Column('rootstock', sa.String(), nullable=True))
    
    # Add clonal_sections JSON column to vineyard_rows table
    op.add_column('vineyard_rows', 
        sa.Column('clonal_sections', sa.JSON(), nullable=True))
    
    # Create indexes for better performance on new boolean fields
    op.create_index(op.f('ix_vineyard_blocks_biodynamic'), 
                    'vineyard_blocks', ['biodynamic'], unique=False)
    op.create_index(op.f('ix_vineyard_blocks_regenerative'), 
                    'vineyard_blocks', ['regenerative'], unique=False)
    
    # Create a partial index for rows with multiple clones
    op.create_index(
        'ix_vineyard_rows_has_clonal_sections',
        'vineyard_rows',
        ['block_id'],
        unique=False,
        postgresql_where=sa.text('clonal_sections IS NOT NULL')
    )


def downgrade():
    # Remove indexes
    op.drop_index('ix_vineyard_rows_has_clonal_sections', table_name='vineyard_rows')
    op.drop_index(op.f('ix_vineyard_blocks_regenerative'), table_name='vineyard_blocks')
    op.drop_index(op.f('ix_vineyard_blocks_biodynamic'), table_name='vineyard_blocks')
    
    # Remove columns
    op.drop_column('vineyard_rows', 'clonal_sections')
    op.drop_column('vineyard_blocks', 'rootstock')
    op.drop_column('vineyard_blocks', 'regenerative')
    op.drop_column('vineyard_blocks', 'biodynamic')
