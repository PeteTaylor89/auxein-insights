
# alembic/versions/aaa_add_asset_calibrations.py
"""Add asset calibration system

Revision ID: aaa_add_asset_calibrations
Revises: zzz_add_asset_maintenance
Create Date: 2024-01-15 11:30:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = 'aaa_add_asset_calibrations'
down_revision = 'zzz_add_asset_maintenance'
branch_labels = None
depends_on = None

def upgrade():
    # Create asset_calibrations table
    op.create_table('asset_calibrations',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('asset_id', sa.Integer(), sa.ForeignKey('assets.id'), nullable=False),
        sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id'), nullable=False),
        
        # Calibration details
        sa.Column('calibration_type', sa.String(50), nullable=False),
        sa.Column('calibration_date', sa.Date(), nullable=False),
        sa.Column('due_date', sa.Date(), nullable=True),
        sa.Column('next_due_date', sa.Date(), nullable=True),
        
        # Parameters
        sa.Column('parameter_name', sa.String(100), nullable=False),
        sa.Column('unit_of_measure', sa.String(20), nullable=False),
        sa.Column('target_value', sa.Numeric(12, 4), nullable=True),
        sa.Column('measured_value', sa.Numeric(12, 4), nullable=False),
        sa.Column('tolerance_min', sa.Numeric(12, 4), nullable=True),
        sa.Column('tolerance_max', sa.Numeric(12, 4), nullable=True),
        
        # Results
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('within_tolerance', sa.Boolean(), default=False),
        sa.Column('adjustment_made', sa.Boolean(), default=False),
        sa.Column('adjustment_details', sa.Text(), nullable=True),
        
        # Environmental conditions
        sa.Column('temperature', sa.Numeric(5, 2), nullable=True),
        sa.Column('humidity', sa.Numeric(5, 2), nullable=True),
        sa.Column('weather_conditions', sa.String(100), nullable=True),
        
        # Personnel
        sa.Column('calibrated_by', sa.String(100), nullable=False),
        sa.Column('calibrated_by_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('calibrated_by_contractor_id', sa.Integer(), sa.ForeignKey('contractors.id'), nullable=True),
        sa.Column('certification_number', sa.String(100), nullable=True),
        
        # Equipment and standards
        sa.Column('reference_standards', sa.JSON(), nullable=True),
        sa.Column('calibration_equipment', sa.JSON(), nullable=True),
        
        # Fuel efficiency specific
        sa.Column('fuel_consumption_liters', sa.Numeric(10, 4), nullable=True),
        sa.Column('operating_hours', sa.Numeric(8, 2), nullable=True),
        sa.Column('distance_covered_km', sa.Numeric(10, 2), nullable=True),
        sa.Column('calculated_efficiency', sa.Numeric(8, 4), nullable=True),
        
        # File references
        sa.Column('photo_file_ids', sa.JSON(), default=sa.text("'[]'::json")),
        sa.Column('certificate_file_ids', sa.JSON(), default=sa.text("'[]'::json")),
        sa.Column('test_result_file_ids', sa.JSON(), default=sa.text("'[]'::json")),
        
        # Compliance and notes
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('regulatory_requirement', sa.String(100), nullable=True),
        sa.Column('compliance_status', sa.String(20), default='compliant'),
        
        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
    )
    
    # Create indexes
    op.create_index('ix_asset_calibrations_id', 'asset_calibrations', ['id'])
    op.create_index('ix_asset_calibrations_asset_id', 'asset_calibrations', ['asset_id'])
    op.create_index('ix_asset_calibrations_company_id', 'asset_calibrations', ['company_id'])
    op.create_index('ix_asset_calibrations_calibration_date', 'asset_calibrations', ['calibration_date'])
    op.create_index('ix_asset_calibrations_next_due_date', 'asset_calibrations', ['next_due_date'])

def downgrade():
    op.drop_index('ix_asset_calibrations_next_due_date', 'asset_calibrations')
    op.drop_index('ix_asset_calibrations_calibration_date', 'asset_calibrations')
    op.drop_index('ix_asset_calibrations_company_id', 'asset_calibrations')
    op.drop_index('ix_asset_calibrations_asset_id', 'asset_calibrations')
    op.drop_index('ix_asset_calibrations_id', 'asset_calibrations')
    op.drop_table('asset_calibrations')
