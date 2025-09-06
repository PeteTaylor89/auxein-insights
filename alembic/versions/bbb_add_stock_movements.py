
# alembic/versions/bbb_add_stock_movements.py
"""Add stock movements system

Revision ID: bbb_add_stock_movements
Revises: aaa_add_asset_calibrations
Create Date: 2024-01-15 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = 'bbb_add_stock_movements'
down_revision = 'aaa_add_asset_calibrations'
branch_labels = None
depends_on = None

def upgrade():
    # Create stock_movements table
    op.create_table('stock_movements',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('asset_id', sa.Integer(), sa.ForeignKey('assets.id'), nullable=False),
        sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id'), nullable=False),
        
        # Movement details
        sa.Column('movement_type', sa.String(20), nullable=False),
        sa.Column('movement_date', sa.Date(), nullable=False),
        sa.Column('quantity', sa.Numeric(12, 4), nullable=False),
        sa.Column('unit_cost', sa.Numeric(10, 4), nullable=True),
        sa.Column('total_cost', sa.Numeric(12, 2), nullable=True),
        
        # Batch tracking
        sa.Column('batch_number', sa.String(100), nullable=True),
        sa.Column('expiry_date', sa.Date(), nullable=True),
        sa.Column('supplier', sa.String(100), nullable=True),
        
        # Usage context
        sa.Column('task_id', sa.Integer(), sa.ForeignKey('tasks.id'), nullable=True),
        sa.Column('block_id', sa.Integer(), sa.ForeignKey('vineyard_blocks.id'), nullable=True),
        sa.Column('usage_rate', sa.Numeric(10, 4), nullable=True),
        sa.Column('area_treated', sa.Numeric(10, 4), nullable=True),
        
        # Stock levels
        sa.Column('stock_before', sa.Numeric(12, 4), nullable=True),
        sa.Column('stock_after', sa.Numeric(12, 4), nullable=True),
        
        # Documentation
        sa.Column('reference_number', sa.String(100), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        
        # File references
        sa.Column('document_file_ids', sa.JSON(), default=sa.text("'[]'::json")),
        sa.Column('photo_file_ids', sa.JSON(), default=sa.text("'[]'::json")),
        
        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
    )
    
    # Create indexes
    op.create_index('ix_stock_movements_id', 'stock_movements', ['id'])
    op.create_index('ix_stock_movements_asset_id', 'stock_movements', ['asset_id'])
    op.create_index('ix_stock_movements_company_id', 'stock_movements', ['company_id'])
    op.create_index('ix_stock_movements_movement_date', 'stock_movements', ['movement_date'])
    op.create_index('ix_stock_movements_movement_type', 'stock_movements', ['movement_type'])

def downgrade():
    op.drop_index('ix_stock_movements_movement_type', 'stock_movements')
    op.drop_index('ix_stock_movements_movement_date', 'stock_movements')
    op.drop_index('ix_stock_movements_company_id', 'stock_movements')
    op.drop_index('ix_stock_movements_asset_id', 'stock_movements')
    op.drop_index('ix_stock_movements_id', 'stock_movements')
    op.drop_table('stock_movements')

