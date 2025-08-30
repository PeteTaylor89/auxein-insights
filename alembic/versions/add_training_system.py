"""empty message

Revision ID: add_training_system
Revises: 9524a73a24f3
Create Date: 2025-01-15 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'add_training_system'
down_revision = '9524a73a24f3'
branch_labels = None
depends_on = None


def upgrade():
    # Create training_modules table
    op.create_table('training_modules',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('company_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('category', sa.String(length=100), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('is_required', sa.Boolean(), nullable=False),
        sa.Column('has_questionnaire', sa.Boolean(), nullable=False),
        sa.Column('passing_score', sa.Integer(), nullable=False),
        sa.Column('max_attempts', sa.Integer(), nullable=False),
        sa.Column('valid_for_days', sa.Integer(), nullable=True),
        sa.Column('auto_assign_visitors', sa.Boolean(), nullable=False),
        sa.Column('auto_assign_contractors', sa.Boolean(), nullable=False),
        sa.Column('required_for_roles', sa.JSON(), nullable=False),
        sa.Column('estimated_duration_minutes', sa.Integer(), nullable=False),
        sa.Column('version', sa.String(length=20), nullable=False),
        sa.Column('created_by', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_training_modules_id'), 'training_modules', ['id'], unique=False)
    
    # Create training_slides table
    op.create_table('training_slides',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('training_module_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('content', sa.Text(), nullable=True),
        sa.Column('bullet_points', sa.JSON(), nullable=False),
        sa.Column('order', sa.Integer(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('auto_advance', sa.Boolean(), nullable=False),
        sa.Column('auto_advance_seconds', sa.Integer(), nullable=True),
        sa.Column('slide_type', sa.String(length=50), nullable=False),
        sa.Column('background_color', sa.String(length=7), nullable=True),
        sa.Column('text_color', sa.String(length=7), nullable=True),
        sa.Column('estimated_read_time_seconds', sa.Integer(), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('image_url', sa.String(length=500), nullable=True),
        sa.Column('image_alt_text', sa.String(length=200), nullable=True),
        sa.Column('image_caption', sa.String(length=300), nullable=True),
        sa.Column('image_position', sa.String(length=20), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['training_module_id'], ['training_modules.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_training_slides_id'), 'training_slides', ['id'], unique=False)
    
    # Create training_questions table
    op.create_table('training_questions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('training_module_id', sa.Integer(), nullable=False),
        sa.Column('question_text', sa.Text(), nullable=False),
        sa.Column('explanation', sa.Text(), nullable=True),
        sa.Column('order', sa.Integer(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('is_required', sa.Boolean(), nullable=False),
        sa.Column('question_type', sa.String(length=50), nullable=False),
        sa.Column('points', sa.Integer(), nullable=False),
        sa.Column('randomize_options', sa.Boolean(), nullable=False),
        sa.Column('allow_multiple_answers', sa.Boolean(), nullable=False),
        sa.Column('difficulty_level', sa.String(length=20), nullable=False),
        sa.Column('tags', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['training_module_id'], ['training_modules.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_training_questions_id'), 'training_questions', ['id'], unique=False)
    
    # Create training_question_options table
    op.create_table('training_question_options',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('training_question_id', sa.Integer(), nullable=False),
        sa.Column('option_text', sa.Text(), nullable=False),
        sa.Column('explanation', sa.Text(), nullable=True),
        sa.Column('order', sa.Integer(), nullable=False),
        sa.Column('is_correct', sa.Boolean(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('option_type', sa.String(length=20), nullable=False),
        sa.Column('image_url', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['training_question_id'], ['training_questions.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_training_question_options_id'), 'training_question_options', ['id'], unique=False)
    
    # Create training_records table
    op.create_table('training_records',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('training_module_id', sa.Integer(), nullable=False),
        sa.Column('entity_type', sa.String(length=20), nullable=False),
        sa.Column('entity_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('current_attempt', sa.Integer(), nullable=False),
        sa.Column('best_score', sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column('passing_score_required', sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column('assigned_by', sa.Integer(), nullable=True),
        sa.Column('assigned_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('assignment_reason', sa.String(length=100), nullable=True),
        sa.Column('time_spent_minutes', sa.Integer(), nullable=False),
        sa.Column('slides_viewed', sa.JSON(), nullable=False),
        sa.Column('certificate_issued', sa.Boolean(), nullable=False),
        sa.Column('certificate_url', sa.String(length=500), nullable=True),
        sa.Column('validation_code', sa.String(length=50), nullable=True),
        sa.Column('module_version', sa.String(length=20), nullable=True),
        sa.Column('user_agent', sa.String(length=500), nullable=True),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['assigned_by'], ['users.id'], ),
        sa.ForeignKeyConstraint(['training_module_id'], ['training_modules.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_training_records_id'), 'training_records', ['id'], unique=False)
    
    # Create training_attempts table
    op.create_table('training_attempts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('training_record_id', sa.Integer(), nullable=False),
        sa.Column('attempt_number', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('time_spent_minutes', sa.Integer(), nullable=False),
        sa.Column('slides_viewed', sa.JSON(), nullable=False),
        sa.Column('slides_time_spent', sa.JSON(), nullable=False),
        sa.Column('questions_answered', sa.Integer(), nullable=False),
        sa.Column('questions_correct', sa.Integer(), nullable=False),
        sa.Column('total_points_earned', sa.Numeric(precision=8, scale=2), nullable=False),
        sa.Column('total_points_possible', sa.Numeric(precision=8, scale=2), nullable=False),
        sa.Column('final_score', sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column('passed', sa.Boolean(), nullable=False),
        sa.Column('passing_score_required', sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column('user_agent', sa.String(length=500), nullable=True),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('device_info', sa.JSON(), nullable=False),
        sa.Column('completion_notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['training_record_id'], ['training_records.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_training_attempts_id'), 'training_attempts', ['id'], unique=False)
    
    # Create training_responses table
    op.create_table('training_responses',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('training_attempt_id', sa.Integer(), nullable=False),
        sa.Column('training_question_id', sa.Integer(), nullable=False),
        sa.Column('selected_option_ids', sa.JSON(), nullable=False),
        sa.Column('response_text', sa.Text(), nullable=True),
        sa.Column('is_correct', sa.Boolean(), nullable=False),
        sa.Column('points_earned', sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column('points_possible', sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column('time_spent_seconds', sa.Integer(), nullable=False),
        sa.Column('attempt_count', sa.Integer(), nullable=False),
        sa.Column('question_text_snapshot', sa.Text(), nullable=True),
        sa.Column('options_snapshot', sa.JSON(), nullable=True),
        sa.Column('answered_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['training_attempt_id'], ['training_attempts.id'], ),
        sa.ForeignKeyConstraint(['training_question_id'], ['training_questions.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_training_responses_id'), 'training_responses', ['id'], unique=False)
    
    # Add indexes for performance
    op.create_index('ix_training_modules_company_id', 'training_modules', ['company_id'])
    op.create_index('ix_training_slides_module_id_order', 'training_slides', ['training_module_id', 'order'])
    op.create_index('ix_training_questions_module_id_order', 'training_questions', ['training_module_id', 'order'])
    op.create_index('ix_training_question_options_question_id_order', 'training_question_options', ['training_question_id', 'order'])
    op.create_index('ix_training_records_entity', 'training_records', ['entity_type', 'entity_id'])
    op.create_index('ix_training_records_module_status', 'training_records', ['training_module_id', 'status'])
    op.create_index('ix_training_attempts_record_id', 'training_attempts', ['training_record_id'])
    op.create_index('ix_training_responses_attempt_id', 'training_responses', ['training_attempt_id'])


def downgrade():
    # Drop indexes first
    op.drop_index('ix_training_responses_attempt_id', table_name='training_responses')
    op.drop_index('ix_training_attempts_record_id', table_name='training_attempts')
    op.drop_index('ix_training_records_module_status', table_name='training_records')
    op.drop_index('ix_training_records_entity', table_name='training_records')
    op.drop_index('ix_training_question_options_question_id_order', table_name='training_question_options')
    op.drop_index('ix_training_questions_module_id_order', table_name='training_questions')
    op.drop_index('ix_training_slides_module_id_order', table_name='training_slides')
    op.drop_index('ix_training_modules_company_id', table_name='training_modules')
    
    # Drop tables in reverse order (respecting foreign keys)
    op.drop_index(op.f('ix_training_responses_id'), table_name='training_responses')
    op.drop_table('training_responses')
    
    op.drop_index(op.f('ix_training_attempts_id'), table_name='training_attempts')
    op.drop_table('training_attempts')
    
    op.drop_index(op.f('ix_training_records_id'), table_name='training_records')
    op.drop_table('training_records')
    
    op.drop_index(op.f('ix_training_question_options_id'), table_name='training_question_options')
    op.drop_table('training_question_options')
    
    op.drop_index(op.f('ix_training_questions_id'), table_name='training_questions')
    op.drop_table('training_questions')
    
    op.drop_index(op.f('ix_training_slides_id'), table_name='training_slides')
    op.drop_table('training_slides')
    
    op.drop_index(op.f('ix_training_modules_id'), table_name='training_modules')
    op.drop_table('training_modules')