"""Create contractor movements table

Revision ID: 003_contractor_movements
Revises: 002_contractor_relationships
Create Date: 2024-01-15 10:30:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = '003_contractor_movements'
down_revision = '002_contractor_relationships'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table('contractor_movements',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('contractor_id', sa.Integer(), nullable=False),
        sa.Column('company_id', sa.Integer(), nullable=False),
        
        # Movement details
        sa.Column('arrival_datetime', sa.DateTime(timezone=True), nullable=False),
        sa.Column('departure_datetime', sa.DateTime(timezone=True), nullable=True),
        sa.Column('purpose', sa.String(length=200), nullable=False),
        
        # Location tracking
        sa.Column('blocks_visited', sa.JSON(), nullable=False, default=list),
        sa.Column('areas_accessed', sa.JSON(), nullable=False, default=list),
        sa.Column('equipment_brought', sa.JSON(), nullable=False, default=list),
        
        # Previous location tracking
        sa.Column('previous_company_id', sa.Integer(), nullable=True),
        sa.Column('previous_location_name', sa.String(length=200), nullable=True),
        sa.Column('previous_location_type', sa.String(length=50), nullable=True),
        sa.Column('days_since_last_location', sa.Integer(), nullable=True),
        sa.Column('last_location_departure', sa.DateTime(timezone=True), nullable=True),
        
        # Biosecurity compliance
        sa.Column('equipment_cleaned', sa.Boolean(), nullable=False, default=False),
        sa.Column('cleaning_method', sa.String(length=200), nullable=True),
        sa.Column('cleaning_products_used', sa.JSON(), nullable=False, default=list),
        sa.Column('cleaning_verified_by', sa.Integer(), nullable=True),
        sa.Column('cleaning_verified_at', sa.DateTime(timezone=True), nullable=True),
        
        # Risk assessment
        sa.Column('biosecurity_risk_level', sa.String(length=20), nullable=False, default='low'),
        sa.Column('risk_factors', sa.JSON(), nullable=False, default=list),
        sa.Column('risk_mitigation_measures', sa.JSON(), nullable=False, default=list),
        
        # Vehicle and transport
        sa.Column('vehicle_registration', sa.String(length=20), nullable=True),
        sa.Column('vehicle_cleaned', sa.Boolean(), nullable=False, default=False),
        sa.Column('trailer_present', sa.Boolean(), nullable=False, default=False),
        sa.Column('trailer_registration', sa.String(length=20), nullable=True),
        
        # Work performed
        sa.Column('tasks_assigned', sa.JSON(), nullable=False, default=list),
        sa.Column('tasks_completed', sa.JSON(), nullable=False, default=list),
        sa.Column('observations_created', sa.JSON(), nullable=False, default=list),
        sa.Column('work_summary', sa.Text(), nullable=True),
        sa.Column('hours_worked', sa.Numeric(precision=5, scale=2), nullable=True),
        
        # Environmental conditions
        sa.Column('weather_conditions', sa.String(length=100), nullable=True),
        sa.Column('temperature_celsius', sa.Numeric(precision=4, scale=1), nullable=True),
        sa.Column('soil_conditions', sa.String(length=100), nullable=True),
        sa.Column('wind_conditions', sa.String(length=50), nullable=True),
        
        # Safety and incidents
        sa.Column('safety_briefing_given', sa.Boolean(), nullable=False, default=False),
        sa.Column('ppe_provided', sa.JSON(), nullable=False, default=list),
        sa.Column('incidents_occurred', sa.JSON(), nullable=False, default=list),
        sa.Column('emergency_contacts_updated', sa.Boolean(), nullable=False, default=False),
        
        # Check-in/out tracking
        sa.Column('checked_in_by', sa.Integer(), nullable=False),
        sa.Column('checked_out_by', sa.Integer(), nullable=True),
        sa.Column('check_in_notes', sa.Text(), nullable=True),
        sa.Column('check_out_notes', sa.Text(), nullable=True),
        
        # Status
        sa.Column('status', sa.String(length=20), nullable=False, default='in_progress'),
        sa.Column('completion_notes', sa.Text(), nullable=True),
        
        # Metadata
        sa.Column('logged_by', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['contractor_id'], ['contractors.id'], ),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ),
        sa.ForeignKeyConstraint(['previous_company_id'], ['companies.id'], ),
        sa.ForeignKeyConstraint(['checked_in_by'], ['users.id'], ),
        sa.ForeignKeyConstraint(['checked_out_by'], ['users.id'], ),
        sa.ForeignKeyConstraint(['cleaning_verified_by'], ['users.id'], ),
        sa.ForeignKeyConstraint(['logged_by'], ['users.id'], )
    )
    
    # Create indexes
    op.create_index(op.f('ix_contractor_movements_id'), 'contractor_movements', ['id'], unique=False)
    op.create_index('ix_contractor_movements_contractor_company', 'contractor_movements', ['contractor_id', 'company_id'], unique=False)
    op.create_index('ix_contractor_movements_arrival', 'contractor_movements', ['arrival_datetime'], unique=False)

def downgrade():
    op.drop_table('contractor_movements')