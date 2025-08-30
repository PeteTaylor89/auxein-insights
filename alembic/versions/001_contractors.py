"""Create contractors table

Revision ID: 001_contractors
Revises: subscription_system
Create Date: 2024-01-15 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '001_contractors'
down_revision = 'subscription_system'  # Replace with your latest revision
branch_labels = None
depends_on = None

def upgrade():
    # Create contractors table
    op.create_table('contractors',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('business_name', sa.String(length=200), nullable=False),
        sa.Column('business_number', sa.String(length=50), nullable=True),
        sa.Column('contact_person', sa.String(length=100), nullable=False),
        
        # Contact details
        sa.Column('email', sa.String(length=100), nullable=False),
        sa.Column('phone', sa.String(length=20), nullable=False),
        sa.Column('mobile', sa.String(length=20), nullable=True),
        sa.Column('address', sa.Text(), nullable=True),
        
        # Authentication
        sa.Column('hashed_password', sa.String(), nullable=False),
        sa.Column('is_contractor_verified', sa.Boolean(), nullable=False, default=False),
        sa.Column('last_login', sa.DateTime(timezone=True), nullable=True),
        sa.Column('failed_login_attempts', sa.Integer(), nullable=False, default=0),
        sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True),
        
        # Email verification
        sa.Column('verification_token', sa.String(length=255), nullable=True),
        sa.Column('verification_sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('verified_at', sa.DateTime(timezone=True), nullable=True),
        
        # Business details
        sa.Column('contractor_type', sa.String(length=50), nullable=False, default='individual'),
        sa.Column('specializations', sa.JSON(), nullable=False, default=list),
        sa.Column('equipment_owned', sa.JSON(), nullable=False, default=list),
        
        # Insurance tracking
        sa.Column('public_liability_insurer', sa.String(length=100), nullable=True),
        sa.Column('public_liability_policy_number', sa.String(length=100), nullable=True),
        sa.Column('public_liability_coverage_amount', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('public_liability_expiry', sa.Date(), nullable=True),
        
        sa.Column('professional_indemnity_insurer', sa.String(length=100), nullable=True),
        sa.Column('professional_indemnity_policy_number', sa.String(length=100), nullable=True),
        sa.Column('professional_indemnity_coverage_amount', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('professional_indemnity_expiry', sa.Date(), nullable=True),
        
        sa.Column('workers_comp_required', sa.Boolean(), nullable=False, default=False),
        sa.Column('workers_comp_insurer', sa.String(length=100), nullable=True),
        sa.Column('workers_comp_policy_number', sa.String(length=100), nullable=True),
        sa.Column('workers_comp_expiry', sa.Date(), nullable=True),
        
        sa.Column('equipment_insurance_insurer', sa.String(length=100), nullable=True),
        sa.Column('equipment_insurance_coverage_amount', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('equipment_insurance_expiry', sa.Date(), nullable=True),
        
        sa.Column('vehicle_insurance_insurer', sa.String(length=100), nullable=True),
        sa.Column('vehicle_insurance_policy_number', sa.String(length=100), nullable=True),
        sa.Column('vehicle_insurance_expiry', sa.Date(), nullable=True),
        
        # Document storage
        sa.Column('verification_documents', sa.JSON(), nullable=False, default=list),
        
        # Status and compliance
        sa.Column('is_active', sa.Boolean(), nullable=False, default=True),
        sa.Column('is_verified', sa.Boolean(), nullable=False, default=False),
        sa.Column('verification_level', sa.String(length=20), nullable=False, default='none'),
        
        # Biosecurity
        sa.Column('has_cleaning_protocols', sa.Boolean(), nullable=False, default=False),
        sa.Column('cleaning_equipment_owned', sa.JSON(), nullable=False, default=list),
        sa.Column('uses_approved_disinfectants', sa.Boolean(), nullable=False, default=False),
        sa.Column('works_multiple_regions', sa.Boolean(), nullable=False, default=False),
        sa.Column('works_with_high_risk_crops', sa.Boolean(), nullable=False, default=False),
        sa.Column('has_biosecurity_incidents', sa.Boolean(), nullable=False, default=False),
        sa.Column('last_biosecurity_training', sa.Date(), nullable=True),
        sa.Column('requires_movement_tracking', sa.Boolean(), nullable=False, default=True),
        sa.Column('min_days_between_properties', sa.Integer(), nullable=False, default=0),
        
        # Performance tracking
        sa.Column('total_jobs_completed', sa.Integer(), nullable=False, default=0),
        sa.Column('average_rating', sa.Numeric(precision=3, scale=2), nullable=False, default=0.0),
        sa.Column('last_active_date', sa.Date(), nullable=True),
        
        # Registration tracking
        sa.Column('registration_ip', sa.String(length=45), nullable=True),
        sa.Column('registration_source', sa.String(length=50), nullable=False, default='web_signup'),
        sa.Column('email_verified_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('profile_completed_at', sa.DateTime(timezone=True), nullable=True),
        
        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes
    op.create_index(op.f('ix_contractors_id'), 'contractors', ['id'], unique=False)
    op.create_index(op.f('ix_contractors_email'), 'contractors', ['email'], unique=True)
    op.create_unique_constraint('uq_contractors_business_number', 'contractors', ['business_number'])

def downgrade():
    op.drop_table('contractors')