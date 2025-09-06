# alembic/versions/yyy_add_asset_management.py
"""Add asset management system

Revision ID: yyy_add_asset_management
Revises: xxx_add_file_management
Create Date: 2024-01-15 10:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = 'yyy_add_asset_management'
down_revision = 'xxx_add_file_management'
branch_labels = None
depends_on = None

def upgrade():
    # Create assets table
    op.create_table('assets',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id'), nullable=False),
        sa.Column('asset_number', sa.String(50), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        
        # Asset categorization
        sa.Column('category', sa.String(50), nullable=False),
        sa.Column('subcategory', sa.String(50), nullable=True),
        sa.Column('asset_type', sa.String(20), nullable=False),
        
        # Technical specifications
        sa.Column('make', sa.String(50), nullable=True),
        sa.Column('model', sa.String(50), nullable=True),
        sa.Column('serial_number', sa.String(100), nullable=True),
        sa.Column('year_manufactured', sa.Integer(), nullable=True),
        sa.Column('specifications', sa.JSON(), nullable=True),
        
        # Consumable-specific fields
        sa.Column('unit_of_measure', sa.String(20), nullable=True),
        sa.Column('current_stock', sa.Numeric(12, 4), default=0),
        sa.Column('minimum_stock', sa.Numeric(12, 4), nullable=True),
        sa.Column('maximum_stock', sa.Numeric(12, 4), nullable=True),
        sa.Column('cost_per_unit', sa.Numeric(10, 4), nullable=True),
        
        # Consumable compliance
        sa.Column('active_ingredient', sa.String(200), nullable=True),
        sa.Column('concentration', sa.String(50), nullable=True),
        sa.Column('application_rate_min', sa.Numeric(10, 4), nullable=True),
        sa.Column('application_rate_max', sa.Numeric(10, 4), nullable=True),
        sa.Column('withholding_period_days', sa.Integer(), nullable=True),
        
        # Registration and compliance
        sa.Column('registration_number', sa.String(100), nullable=True),
        sa.Column('registration_expiry', sa.Date(), nullable=True),
        sa.Column('safety_data_sheet_url', sa.String(500), nullable=True),
        sa.Column('hazard_classifications', sa.JSON(), nullable=True),
        
        # Financial tracking
        sa.Column('purchase_date', sa.Date(), nullable=True),
        sa.Column('purchase_price', sa.Numeric(12, 2), nullable=True),
        sa.Column('current_value', sa.Numeric(12, 2), nullable=True),
        sa.Column('depreciation_rate', sa.Numeric(5, 2), nullable=True),
        
        # Operational details
        sa.Column('status', sa.String(20), default='active'),
        sa.Column('location', sa.String(100), nullable=True),
        sa.Column('requires_calibration', sa.Boolean(), default=False),
        sa.Column('calibration_interval_days', sa.Integer(), nullable=True),
        sa.Column('requires_maintenance', sa.Boolean(), default=False),
        sa.Column('maintenance_interval_hours', sa.Integer(), nullable=True),
        sa.Column('maintenance_interval_days', sa.Integer(), nullable=True),
        
        # Usage tracking
        sa.Column('current_hours', sa.Numeric(10, 2), default=0),
        sa.Column('current_kilometers', sa.Numeric(10, 2), default=0),
        
        # Vehicle-specific compliance
        sa.Column('insurance_expiry', sa.Date(), nullable=True),
        sa.Column('wof_due', sa.Date(), nullable=True),
        sa.Column('road_user_charges_due', sa.Date(), nullable=True),
        
        # Storage and handling
        sa.Column('storage_requirements', sa.JSON(), nullable=True),
        sa.Column('batch_tracking_required', sa.Boolean(), default=False),
        sa.Column('expiry_tracking_required', sa.Boolean(), default=False),
        
        # Fuel efficiency
        sa.Column('fuel_type', sa.String(30), nullable=True),
        sa.Column('fuel_efficiency_standard', sa.Numeric(8, 2), nullable=True),
        
        # File references
        sa.Column('photo_file_ids', sa.JSON(), default=sa.text("'[]'::json")),
        sa.Column('document_file_ids', sa.JSON(), default=sa.text("'[]'::json")),
        sa.Column('manual_file_ids', sa.JSON(), default=sa.text("'[]'::json")),
        
        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('is_active', sa.Boolean(), default=True),
    )
    
    # Create indexes for assets
    op.create_index('ix_assets_id', 'assets', ['id'])
    op.create_index('ix_assets_company_id', 'assets', ['company_id'])
    op.create_index('ix_assets_asset_number', 'assets', ['asset_number'])
    op.create_index('ix_assets_category', 'assets', ['category'])
    op.create_index('ix_assets_asset_type', 'assets', ['asset_type'])
    
    # Unique constraint for asset_number per company
    op.create_unique_constraint('uq_assets_company_asset_number', 'assets', ['company_id', 'asset_number'])

def downgrade():
    op.drop_constraint('uq_assets_company_asset_number', 'assets')
    op.drop_index('ix_assets_asset_type', 'assets')
    op.drop_index('ix_assets_category', 'assets')
    op.drop_index('ix_assets_asset_number', 'assets')
    op.drop_index('ix_assets_company_id', 'assets')
    op.drop_index('ix_assets_id', 'assets')
    op.drop_table('assets')
