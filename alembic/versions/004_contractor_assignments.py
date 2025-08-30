"""Create contractor assignments table

Revision ID: 004_contractor_assignments
Revises: 003_contractor_movements
Create Date: 2024-01-15 10:45:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = '004_contractor_assignments'
down_revision = '003_contractor_movements'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table('contractor_assignments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('contractor_id', sa.Integer(), nullable=False),
        sa.Column('company_id', sa.Integer(), nullable=False),
        sa.Column('task_id', sa.Integer(), nullable=True),
        
        # Assignment details
        sa.Column('assignment_type', sa.String(length=30), nullable=False, default='specific_task'),
        sa.Column('work_description', sa.Text(), nullable=False),
        sa.Column('priority', sa.String(length=20), nullable=False, default='medium'),
        
        # Estimation
        sa.Column('estimated_hours', sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column('estimated_cost', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('estimated_completion_date', sa.Date(), nullable=True),
        
        # Scheduling
        sa.Column('scheduled_start', sa.DateTime(timezone=True), nullable=True),
        sa.Column('scheduled_end', sa.DateTime(timezone=True), nullable=True),
        sa.Column('actual_start', sa.DateTime(timezone=True), nullable=True),
        sa.Column('actual_end', sa.DateTime(timezone=True), nullable=True),
        
        # Location and scope
        sa.Column('blocks_involved', sa.JSON(), nullable=False, default=list),
        sa.Column('areas_involved', sa.JSON(), nullable=False, default=list),
        sa.Column('work_scope', sa.Text(), nullable=True),
        
        # Requirements
        sa.Column('required_certifications', sa.JSON(), nullable=False, default=list),
        sa.Column('required_equipment', sa.JSON(), nullable=False, default=list),
        sa.Column('required_weather_conditions', sa.JSON(), nullable=False, default=list),
        sa.Column('special_instructions', sa.Text(), nullable=True),
        sa.Column('safety_requirements', sa.JSON(), nullable=False, default=list),
        
        # Status
        sa.Column('status', sa.String(length=20), nullable=False, default='assigned'),
        sa.Column('completion_percentage', sa.Integer(), nullable=False, default=0),
        sa.Column('quality_check_required', sa.Boolean(), nullable=False, default=False),
        sa.Column('quality_check_completed', sa.Boolean(), nullable=False, default=False),
        
        # Results
        sa.Column('actual_hours_worked', sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column('actual_cost', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('materials_used', sa.JSON(), nullable=False, default=list),
        sa.Column('quality_rating', sa.Integer(), nullable=True),
        sa.Column('client_satisfaction', sa.Integer(), nullable=True),
        sa.Column('work_notes', sa.Text(), nullable=True),
        sa.Column('completion_photos', sa.JSON(), nullable=False, default=list),
        
        # Weather during work
        sa.Column('weather_during_work', sa.JSON(), nullable=False, default=dict),
        sa.Column('soil_conditions_during_work', sa.String(length=100), nullable=True),
        
        # Issues and delays
        sa.Column('issues_encountered', sa.JSON(), nullable=False, default=list),
        sa.Column('delays_encountered', sa.JSON(), nullable=False, default=list),
        sa.Column('change_requests', sa.JSON(), nullable=False, default=list),
        
        # Financial
        sa.Column('rate_type', sa.String(length=20), nullable=True),
        sa.Column('agreed_rate', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('currency', sa.String(length=3), nullable=False, default='NZD'),
        sa.Column('invoice_required', sa.Boolean(), nullable=False, default=True),
        sa.Column('invoice_generated', sa.Boolean(), nullable=False, default=False),
        sa.Column('payment_status', sa.String(length=20), nullable=False, default='pending'),
        
        # Recurring
        sa.Column('is_recurring', sa.Boolean(), nullable=False, default=False),
        sa.Column('recurrence_pattern', sa.String(length=50), nullable=True),
        sa.Column('next_occurrence', sa.Date(), nullable=True),
        sa.Column('parent_assignment_id', sa.Integer(), nullable=True),
        
        # Approval
        sa.Column('requires_approval', sa.Boolean(), nullable=False, default=False),
        sa.Column('approved_by', sa.Integer(), nullable=True),
        sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('rejection_reason', sa.Text(), nullable=True),
        
        # Metadata
        sa.Column('assigned_by', sa.Integer(), nullable=False),
        sa.Column('completed_by', sa.Integer(), nullable=True),
        sa.Column('cancelled_by', sa.Integer(), nullable=True),
        sa.Column('cancellation_reason', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['contractor_id'], ['contractors.id'], ),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ),
        sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ),
        sa.ForeignKeyConstraint(['parent_assignment_id'], ['contractor_assignments.id'], ),
        sa.ForeignKeyConstraint(['assigned_by'], ['users.id'], ),
        sa.ForeignKeyConstraint(['completed_by'], ['users.id'], ),
        sa.ForeignKeyConstraint(['approved_by'], ['users.id'], ),
        sa.ForeignKeyConstraint(['cancelled_by'], ['users.id'], )
    )
    
    # Create indexes
    op.create_index(op.f('ix_contractor_assignments_id'), 'contractor_assignments', ['id'], unique=False)
    op.create_index('ix_contractor_assignments_contractor_company', 'contractor_assignments', ['contractor_id', 'company_id'], unique=False)
    op.create_index('ix_contractor_assignments_status', 'contractor_assignments', ['status'], unique=False)

def downgrade():
    op.drop_table('contractor_assignments')