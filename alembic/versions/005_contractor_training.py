"""Create contractor training table

Revision ID: 005_contractor_training
Revises: 004_contractor_assignments
Create Date: 2024-01-15 11:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = '005_contractor_training'
down_revision = '004_contractor_assignments'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table('contractor_training',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('contractor_id', sa.Integer(), nullable=False),
        sa.Column('training_module_id', sa.Integer(), nullable=False),
        
        # Assignment details
        sa.Column('assigned_by', sa.Integer(), nullable=False),
        sa.Column('assigned_date', sa.Date(), nullable=False, default=sa.text('CURRENT_DATE')),
        sa.Column('due_date', sa.Date(), nullable=True),
        sa.Column('priority', sa.String(length=20), nullable=False, default='medium'),
        
        # Context
        sa.Column('assignment_reason', sa.String(length=100), nullable=True),
        sa.Column('assigning_company_id', sa.Integer(), nullable=True),
        
        # Completion tracking
        sa.Column('status', sa.String(length=20), nullable=False, default='assigned'),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        
        # Performance
        sa.Column('attempts', sa.Integer(), nullable=False, default=0),
        sa.Column('max_attempts', sa.Integer(), nullable=False, default=3),
        sa.Column('time_spent_minutes', sa.Integer(), nullable=False, default=0),
        sa.Column('score', sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column('passing_score_required', sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column('passed', sa.Boolean(), nullable=True),
        
        # Attempt history
        sa.Column('attempt_history', sa.JSON(), nullable=False, default=list),
        
        # Company requirements
        sa.Column('required_by_companies', sa.JSON(), nullable=False, default=list),
        sa.Column('mandatory_for_work_types', sa.JSON(), nullable=False, default=list),
        sa.Column('must_complete_before_work', sa.Boolean(), nullable=False, default=False),
        
        # Renewal
        sa.Column('valid_until', sa.Date(), nullable=True),
        sa.Column('renewal_required', sa.Boolean(), nullable=False, default=True),
        sa.Column('renewal_notification_sent', sa.Boolean(), nullable=False, default=False),
        sa.Column('renewal_notification_date', sa.Date(), nullable=True),
        
        # Module version tracking
        sa.Column('module_version', sa.String(length=20), nullable=True),
        sa.Column('completed_module_version', sa.String(length=20), nullable=True),
        
        # Supervision
        sa.Column('requires_supervision', sa.Boolean(), nullable=False, default=False),
        sa.Column('supervisor_id', sa.Integer(), nullable=True),
        sa.Column('supervised_by', sa.Integer(), nullable=True),
        sa.Column('supervision_notes', sa.Text(), nullable=True),
        
        # Certification
        sa.Column('certificate_issued', sa.Boolean(), nullable=False, default=False),
        sa.Column('certificate_number', sa.String(length=100), nullable=True),
        sa.Column('certificate_file_path', sa.String(length=500), nullable=True),
        
        # Remedial training
        sa.Column('is_remedial', sa.Boolean(), nullable=False, default=False),
        sa.Column('remedial_reason', sa.String(length=200), nullable=True),
        sa.Column('original_training_id', sa.Integer(), nullable=True),
        
        # Progress
        sa.Column('modules_completed', sa.JSON(), nullable=False, default=list),
        sa.Column('current_module', sa.String(length=100), nullable=True),
        sa.Column('progress_percentage', sa.Integer(), nullable=False, default=0),
        sa.Column('last_activity', sa.DateTime(timezone=True), nullable=True),
        
        # Feedback
        sa.Column('contractor_feedback', sa.Text(), nullable=True),
        sa.Column('trainer_notes', sa.Text(), nullable=True),
        sa.Column('completion_notes', sa.Text(), nullable=True),
        
        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['contractor_id'], ['contractors.id'], ),
        sa.ForeignKeyConstraint(['training_module_id'], ['training_modules.id'], ),
        sa.ForeignKeyConstraint(['assigned_by'], ['users.id'], ),
        sa.ForeignKeyConstraint(['supervisor_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['supervised_by'], ['users.id'], ),
        sa.ForeignKeyConstraint(['assigning_company_id'], ['companies.id'], ),
        sa.ForeignKeyConstraint(['original_training_id'], ['contractor_training.id'], )
    )
    
    # Create indexes
    op.create_index(op.f('ix_contractor_training_id'), 'contractor_training', ['id'], unique=False)
    op.create_index('ix_contractor_training_contractor_module', 'contractor_training', ['contractor_id', 'training_module_id'], unique=False)
    op.create_index('ix_contractor_training_status', 'contractor_training', ['status'], unique=False)
    op.create_index('ix_contractor_training_due_date', 'contractor_training', ['due_date'], unique=False)

def downgrade():
    op.drop_table('contractor_training')
