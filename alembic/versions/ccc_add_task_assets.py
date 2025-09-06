
# alembic/versions/ccc_add_task_assets.py
"""Add task-asset relationships

Revision ID: ccc_add_task_assets
Revises: bbb_add_stock_movements
Create Date: 2024-01-15 12:30:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = 'ccc_add_task_assets'
down_revision = 'bbb_add_stock_movements'
branch_labels = None
depends_on = None

def upgrade():
    # Create task_assets table
    op.create_table('task_assets',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('task_id', sa.Integer(), sa.ForeignKey('tasks.id'), nullable=False),
        sa.Column('asset_id', sa.Integer(), sa.ForeignKey('assets.id'), nullable=False),
        
        # Asset role
        sa.Column('role', sa.String(30), default='primary'),
        sa.Column('is_required', sa.Boolean(), default=True),
        
        # Planned usage
        sa.Column('planned_quantity', sa.Numeric(12, 4), nullable=True),
        sa.Column('planned_hours', sa.Numeric(8, 2), nullable=True),
        sa.Column('planned_rate', sa.Numeric(10, 4), nullable=True),
        
        # Actual usage
        sa.Column('actual_quantity', sa.Numeric(12, 4), nullable=True),
        sa.Column('actual_hours', sa.Numeric(8, 2), nullable=True),
        sa.Column('actual_rate', sa.Numeric(10, 4), nullable=True),
        
        # Calibration
        sa.Column('requires_calibration', sa.Boolean(), default=False),
        sa.Column('calibration_completed', sa.Boolean(), default=False),
        sa.Column('calibration_id', sa.Integer(), sa.ForeignKey('asset_calibrations.id'), nullable=True),
        
        # Notes
        sa.Column('notes', sa.Text(), nullable=True),
        
        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )
    
    # Create indexes
    op.create_index('ix_task_assets_id', 'task_assets', ['id'])
    op.create_index('ix_task_assets_task_id', 'task_assets', ['task_id'])
    op.create_index('ix_task_assets_asset_id', 'task_assets', ['asset_id'])
    
    # Unique constraint to prevent duplicate task-asset combinations
    op.create_unique_constraint('uq_task_assets_task_asset', 'task_assets', ['task_id', 'asset_id'])

def downgrade():
    op.drop_constraint('uq_task_assets_task_asset', 'task_assets')
    op.drop_index('ix_task_assets_asset_id', 'task_assets')
    op.drop_index('ix_task_assets_task_id', 'task_assets')
    op.drop_index('ix_task_assets_id', 'task_assets')
    op.drop_table('task_assets')