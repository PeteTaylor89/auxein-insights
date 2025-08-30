"""Create contractor relationships table

Revision ID: 002_contractor_relationships
Revises: 001_contractors
Create Date: 2024-01-15 10:15:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = '002_contractor_relationships'
down_revision = '001_contractors'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table('contractor_relationships',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('contractor_id', sa.Integer(), nullable=False),
        sa.Column('company_id', sa.Integer(), nullable=False),
        
        # Relationship details
        sa.Column('relationship_type', sa.String(length=30), nullable=False, default='contractor'),
        sa.Column('status', sa.String(length=20), nullable=False, default='active'),
        
        # Contract terms
        sa.Column('hourly_rate', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('daily_rate', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('preferred_payment_terms', sa.String(length=50), nullable=True),
        sa.Column('currency', sa.String(length=3), nullable=False, default='NZD'),
        
        # Access and permissions
        sa.Column('blocks_access', sa.JSON(), nullable=False, default=list),
        sa.Column('areas_restricted', sa.JSON(), nullable=False, default=list),
        sa.Column('can_create_observations', sa.Boolean(), nullable=False, default=True),
        sa.Column('can_update_tasks', sa.Boolean(), nullable=False, default=True),
        sa.Column('requires_supervision', sa.Boolean(), nullable=False, default=False),
        
        # Contract period
        sa.Column('contract_start', sa.Date(), nullable=True),
        sa.Column('contract_end', sa.Date(), nullable=True),
        sa.Column('auto_renew', sa.Boolean(), nullable=False, default=False),
        
        # Performance
        sa.Column('jobs_completed_for_company', sa.Integer(), nullable=False, default=0),
        sa.Column('company_rating', sa.Numeric(precision=3, scale=2), nullable=False, default=0.0),
        sa.Column('last_worked_date', sa.Date(), nullable=True),
        sa.Column('total_hours_worked', sa.Numeric(precision=8, scale=2), nullable=False, default=0.0),
        sa.Column('total_amount_paid', sa.Numeric(precision=12, scale=2), nullable=False, default=0.0),
        
        # Emergency contact override
        sa.Column('emergency_contact_name', sa.String(length=100), nullable=True),
        sa.Column('emergency_contact_phone', sa.String(length=20), nullable=True),
        
        # Work preferences
        sa.Column('preferred_work_types', sa.JSON(), nullable=False, default=list),
        sa.Column('work_restrictions', sa.JSON(), nullable=False, default=list),
        sa.Column('company_notes', sa.String(length=1000), nullable=True),
        sa.Column('contractor_notes', sa.String(length=1000), nullable=True),
        
        # Training
        sa.Column('required_training_modules', sa.JSON(), nullable=False, default=list),
        sa.Column('completed_training_modules', sa.JSON(), nullable=False, default=list),
        
        # Termination
        sa.Column('terminated_by', sa.Integer(), nullable=True),
        sa.Column('termination_date', sa.Date(), nullable=True),
        sa.Column('termination_reason', sa.String(length=500), nullable=True),
        
        # Metadata
        sa.Column('created_by', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['contractor_id'], ['contractors.id'], ),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
        sa.ForeignKeyConstraint(['terminated_by'], ['users.id'], )
    )
    
    # Create indexes
    op.create_index(op.f('ix_contractor_relationships_id'), 'contractor_relationships', ['id'], unique=False)
    op.create_index('ix_contractor_relationships_contractor_company', 'contractor_relationships', ['contractor_id', 'company_id'], unique=False)

def downgrade():
    op.drop_table('contractor_relationships')