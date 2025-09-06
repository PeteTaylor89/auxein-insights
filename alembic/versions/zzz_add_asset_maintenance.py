
# alembic/versions/zzz_add_asset_maintenance.py
"""Add asset maintenance system

Revision ID: zzz_add_asset_maintenance
Revises: yyy_add_asset_management
Create Date: 2024-01-15 11:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = 'zzz_add_asset_maintenance'
down_revision = 'yyy_add_asset_management'
branch_labels = None
depends_on = None

def upgrade():
    # Create asset_maintenance table
    op.create_table('asset_maintenance',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('asset_id', sa.Integer(), sa.ForeignKey('assets.id'), nullable=False),
        sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id'), nullable=False),
        
        # Maintenance details
        sa.Column('maintenance_type', sa.String(20), nullable=False),
        sa.Column('maintenance_category', sa.String(50), nullable=True),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        
        # Scheduling
        sa.Column('scheduled_date', sa.Date(), nullable=True),
        sa.Column('completed_date', sa.Date(), nullable=True),
        sa.Column('due_hours', sa.Numeric(10, 2), nullable=True),
        sa.Column('due_kilometers', sa.Numeric(10, 2), nullable=True),
        
        # Execution tracking
        sa.Column('status', sa.String(20), default='scheduled'),
        sa.Column('performed_by', sa.String(100), nullable=True),
        sa.Column('performed_by_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('performed_by_contractor_id', sa.Integer(), sa.ForeignKey('contractors.id'), nullable=True),
        
        # Cost tracking
        sa.Column('labor_hours', sa.Numeric(8, 2), nullable=True),
        sa.Column('labor_cost', sa.Numeric(10, 2), nullable=True),
        sa.Column('parts_cost', sa.Numeric(10, 2), nullable=True),
        sa.Column('external_cost', sa.Numeric(10, 2), nullable=True),
        sa.Column('total_cost', sa.Numeric(10, 2), nullable=True),
        
        # Parts and materials
        sa.Column('parts_used', sa.JSON(), nullable=True),
        sa.Column('consumables_used', sa.JSON(), nullable=True),
        
        # Asset condition
        sa.Column('asset_hours_at_maintenance', sa.Numeric(10, 2), nullable=True),
        sa.Column('asset_kilometers_at_maintenance', sa.Numeric(10, 2), nullable=True),
        sa.Column('condition_before', sa.String(20), nullable=True),
        sa.Column('condition_after', sa.String(20), nullable=True),
        
        # Next maintenance
        sa.Column('next_due_date', sa.Date(), nullable=True),
        sa.Column('next_due_hours', sa.Numeric(10, 2), nullable=True),
        sa.Column('next_due_kilometers', sa.Numeric(10, 2), nullable=True),
        
        # Compliance
        sa.Column('compliance_certificate_number', sa.String(100), nullable=True),
        sa.Column('compliance_expiry_date', sa.Date(), nullable=True),
        sa.Column('compliance_status', sa.String(20), nullable=True),
        
        # File references
        sa.Column('photo_file_ids', sa.JSON(), default=sa.text("'[]'::json")),
        sa.Column('document_file_ids', sa.JSON(), default=sa.text("'[]'::json")),
        
        # Notes and timestamps
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
    )
    
    # Create indexes
    op.create_index('ix_asset_maintenance_id', 'asset_maintenance', ['id'])
    op.create_index('ix_asset_maintenance_asset_id', 'asset_maintenance', ['asset_id'])
    op.create_index('ix_asset_maintenance_company_id', 'asset_maintenance', ['company_id'])
    op.create_index('ix_asset_maintenance_scheduled_date', 'asset_maintenance', ['scheduled_date'])
    op.create_index('ix_asset_maintenance_status', 'asset_maintenance', ['status'])

def downgrade():
    op.drop_index('ix_asset_maintenance_status', 'asset_maintenance')
    op.drop_index('ix_asset_maintenance_scheduled_date', 'asset_maintenance')
    op.drop_index('ix_asset_maintenance_company_id', 'asset_maintenance')
    op.drop_index('ix_asset_maintenance_asset_id', 'asset_maintenance')
    op.drop_index('ix_asset_maintenance_id', 'asset_maintenance')
    op.drop_table('asset_maintenance')

