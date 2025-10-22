# alembic/versions/add_task_management_system.py
"""add task management system

Revision ID: task_management
Revises: <add_certified_for_field>
Create Date: 2025-01-XX XX:XX:XX.XXXXXX

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'task_management'
down_revision = 'add_certified_for_field'  # Replace with your latest migration
branch_labels = None
depends_on = None

def upgrade():
    # ==========================================
    # 1. CREATE TASK_TEMPLATES TABLE
    # ==========================================
    op.create_table(
        'task_templates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('company_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('task_category', sa.String(length=50), nullable=False),
        sa.Column('task_subcategory', sa.String(length=100), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('icon', sa.String(length=50), nullable=True),
        sa.Column('color', sa.String(length=20), nullable=True),
        sa.Column('default_duration_hours', sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column('default_priority', sa.String(length=20), nullable=False, server_default='medium'),
        sa.Column('requires_gps_tracking', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('allows_partial_completion', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('required_equipment_ids', sa.JSON(), nullable=True),
        sa.Column('optional_equipment_ids', sa.JSON(), nullable=True),
        sa.Column('required_consumables', sa.JSON(), nullable=True),
        sa.Column('quick_create_enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_task_templates_id', 'task_templates', ['id'])
    op.create_index('ix_task_templates_company_id', 'task_templates', ['company_id'])
    op.create_index('ix_task_templates_task_category', 'task_templates', ['task_category'])

    # ==========================================
    # 2. DROP OLD TASKS TABLE IF EXISTS
    # ==========================================
    op.execute("""
        DO $$ 
        BEGIN
            -- Drop dependent views/triggers first if they exist
            DROP VIEW IF EXISTS task_summary CASCADE;
            
            -- Drop the old tasks table
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tasks') THEN
                DROP TABLE tasks CASCADE;
            END IF;
        END $$;
    """)

    # ==========================================
    # 3. CREATE NEW TASKS TABLE
    # ==========================================
    op.create_table(
        'tasks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('company_id', sa.Integer(), nullable=False),
        sa.Column('template_id', sa.Integer(), nullable=True),
        sa.Column('task_number', sa.String(length=50), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('task_category', sa.String(length=50), nullable=False),
        sa.Column('task_subcategory', sa.String(length=100), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        
        # Location fields (hybrid approach)
        sa.Column('block_id', sa.Integer(), nullable=True),
        sa.Column('spatial_area_id', sa.Integer(), nullable=True),
        sa.Column('location_type', sa.String(length=50), nullable=True),
        sa.Column('location_id', sa.Integer(), nullable=True),
        sa.Column('location_notes', sa.Text(), nullable=True),
        
        # Scheduling
        sa.Column('scheduled_start_date', sa.Date(), nullable=True),
        sa.Column('scheduled_end_date', sa.Date(), nullable=True),
        sa.Column('scheduled_start_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('priority', sa.String(length=20), nullable=False, server_default='medium'),
        
        # Status
        sa.Column('status', sa.String(length=20), nullable=False, server_default='draft'),
        
        # Execution tracking
        sa.Column('actual_start_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('actual_end_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('paused_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('total_pause_duration_minutes', sa.Integer(), nullable=False, server_default='0'),
        
        # Progress tracking
        sa.Column('progress_percentage', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('rows_completed', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('rows_total', sa.Integer(), nullable=True),
        sa.Column('area_completed_hectares', sa.Numeric(precision=10, scale=4), nullable=True),
        sa.Column('area_total_hectares', sa.Numeric(precision=10, scale=4), nullable=True),
        
        # Time tracking
        sa.Column('estimated_hours', sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column('actual_hours', sa.Numeric(precision=6, scale=2), nullable=False, server_default='0.00'),
        
        # GPS tracking
        sa.Column('requires_gps_tracking', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('gps_tracking_active', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('total_distance_meters', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('area_covered_hectares', sa.Numeric(precision=10, scale=4), nullable=True),
        
        # Completion
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_by', sa.Integer(), nullable=True),
        sa.Column('completion_notes', sa.Text(), nullable=True),
        sa.Column('completion_photos', sa.JSON(), nullable=True),
        
        # Related entities
        sa.Column('related_observation_run_id', sa.Integer(), nullable=True),
        sa.Column('related_maintenance_id', sa.Integer(), nullable=True),
        sa.Column('related_calibration_id', sa.Integer(), nullable=True),
        
        # Metadata
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('created_by', sa.Integer(), nullable=True),
        
        # Cancellation
        sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('cancelled_by', sa.Integer(), nullable=True),
        sa.Column('cancellation_reason', sa.Text(), nullable=True),
        
        # Additional
        sa.Column('weather_conditions', sa.JSON(), nullable=True),
        sa.Column('tags', sa.JSON(), nullable=True),
        
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['template_id'], ['task_templates.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['block_id'], ['vineyard_blocks.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['spatial_area_id'], ['spatial_areas.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['completed_by'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['cancelled_by'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['related_observation_run_id'], ['observation_runs.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['related_maintenance_id'], ['asset_maintenance.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['related_calibration_id'], ['asset_calibrations.id'], ondelete='SET NULL'),
        sa.CheckConstraint('progress_percentage >= 0 AND progress_percentage <= 100', name='ck_task_progress_range'),
        sa.CheckConstraint('rows_completed >= 0', name='ck_task_rows_completed_nonneg'),
        sa.CheckConstraint('actual_hours >= 0', name='ck_task_actual_hours_nonneg'),
        sa.CheckConstraint('total_pause_duration_minutes >= 0', name='ck_task_pause_duration_nonneg'),
    )
    
    # Create indexes for tasks table
    op.create_index('ix_tasks_id', 'tasks', ['id'])
    op.create_index('ix_tasks_company_id', 'tasks', ['company_id'])
    op.create_index('ix_tasks_task_number', 'tasks', ['task_number'], unique=True)
    op.create_index('ix_tasks_task_category', 'tasks', ['task_category'])
    op.create_index('ix_tasks_block_id', 'tasks', ['block_id'])
    op.create_index('ix_tasks_spatial_area_id', 'tasks', ['spatial_area_id'])
    op.create_index('ix_tasks_scheduled_start_date', 'tasks', ['scheduled_start_date'])
    op.create_index('ix_tasks_priority', 'tasks', ['priority'])
    op.create_index('ix_tasks_status', 'tasks', ['status'])
    op.create_index('ix_tasks_created_at', 'tasks', ['created_at'])
    op.create_index('ix_tasks_created_by', 'tasks', ['created_by'])
    
    # Composite indexes
    op.create_index('ix_task_company_status_date', 'tasks', ['company_id', 'status', 'scheduled_start_date'])
    op.create_index('ix_task_block_status', 'tasks', ['block_id', 'status'])
    op.create_index('ix_task_spatial_area_status', 'tasks', ['spatial_area_id', 'status'])

    # ==========================================
    # 4. CREATE TASK_ASSIGNMENTS TABLE
    # ==========================================
    op.create_table(
        'task_assignments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('task_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('assigned_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('assigned_by', sa.Integer(), nullable=True),
        sa.Column('role', sa.String(length=50), nullable=False, server_default='assignee'),
        sa.Column('is_primary', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='assigned'),
        sa.Column('accepted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('declined_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('decline_reason', sa.Text(), nullable=True),
        sa.Column('estimated_hours', sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column('actual_hours', sa.Numeric(precision=5, scale=2), nullable=False, server_default='0.00'),
        sa.Column('notified_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('reminder_sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['assigned_by'], ['users.id'], ondelete='SET NULL'),
        sa.UniqueConstraint('task_id', 'user_id', name='uq_task_user_assignment'),
    )
    op.create_index('ix_task_assignments_id', 'task_assignments', ['id'])
    op.create_index('ix_task_assignments_task_id', 'task_assignments', ['task_id'])
    op.create_index('ix_task_assignments_user_id', 'task_assignments', ['user_id'])
    op.create_index('ix_task_assignments_status', 'task_assignments', ['status'])
    op.create_index('ix_task_assignment_user_status', 'task_assignments', ['user_id', 'status'])

    # ==========================================
    # 5. CREATE TASK_ROWS TABLE
    # ==========================================
    op.create_table(
        'task_rows',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('task_id', sa.Integer(), nullable=False),
        sa.Column('vineyard_row_id', sa.Integer(), nullable=True),
        sa.Column('row_number', sa.String(length=20), nullable=True),
        sa.Column('block_id', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='pending'),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_by', sa.Integer(), nullable=True),
        sa.Column('start_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('end_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('duration_minutes', sa.Integer(), nullable=True),
        sa.Column('percentage_complete', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('issues_found', sa.Text(), nullable=True),
        sa.Column('quality_rating', sa.Integer(), nullable=True),
        sa.Column('skip_reason', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['vineyard_row_id'], ['vineyard_rows.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['block_id'], ['vineyard_blocks.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['completed_by'], ['users.id'], ondelete='SET NULL'),
        sa.UniqueConstraint('task_id', 'vineyard_row_id', name='uq_task_vineyard_row'),
        sa.CheckConstraint('percentage_complete >= 0 AND percentage_complete <= 100', name='ck_task_row_percentage_range'),
        sa.CheckConstraint('quality_rating IS NULL OR (quality_rating >= 1 AND quality_rating <= 5)', name='ck_task_row_quality_range'),
    )
    op.create_index('ix_task_rows_id', 'task_rows', ['id'])
    op.create_index('ix_task_rows_task_id', 'task_rows', ['task_id'])
    op.create_index('ix_task_rows_vineyard_row_id', 'task_rows', ['vineyard_row_id'])
    op.create_index('ix_task_rows_status', 'task_rows', ['status'])
    op.create_index('ix_task_row_task_status', 'task_rows', ['task_id', 'status'])

    # ==========================================
    # 6. CREATE TASK_GPS_TRACKS TABLE
    # ==========================================
    op.create_table(
        'task_gps_tracks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('task_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('timestamp', sa.DateTime(timezone=True), nullable=False),
        sa.Column('latitude', sa.Numeric(precision=10, scale=7), nullable=False),
        sa.Column('longitude', sa.Numeric(precision=10, scale=7), nullable=False),
        sa.Column('altitude', sa.Numeric(precision=8, scale=2), nullable=True),
        sa.Column('accuracy', sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column('speed', sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column('heading', sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column('segment_id', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('device_id', sa.String(length=100), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_task_gps_tracks_id', 'task_gps_tracks', ['id'])
    op.create_index('ix_task_gps_tracks_task_id', 'task_gps_tracks', ['task_id'])
    op.create_index('ix_task_gps_tracks_timestamp', 'task_gps_tracks', ['timestamp'])
    op.create_index('ix_task_gps_task_timestamp', 'task_gps_tracks', ['task_id', 'timestamp'])
    op.create_index('ix_task_gps_task_segment', 'task_gps_tracks', ['task_id', 'segment_id'])

    # ==========================================
    # 7. UPDATE TIME_ENTRIES TABLE (CHECK IF COLUMNS EXIST)
    # ==========================================
    # Check and add task_id if it doesn't exist
    op.execute("""
        DO $$ 
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'time_entries' AND column_name = 'task_id'
            ) THEN
                ALTER TABLE time_entries ADD COLUMN task_id INTEGER;
                ALTER TABLE time_entries ADD CONSTRAINT fk_time_entries_task_id 
                    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL;
                CREATE INDEX ix_time_entries_task_id ON time_entries(task_id);
            END IF;
        END $$;
    """)
    
    # Check and add entry_source if it doesn't exist
    op.execute("""
        DO $$ 
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'time_entries' AND column_name = 'entry_source'
            ) THEN
                ALTER TABLE time_entries ADD COLUMN entry_source VARCHAR(20) NOT NULL DEFAULT 'manual_timesheet';
            END IF;
        END $$;
    """)

    # ==========================================
    # 8. UPDATE TASK_ASSETS TABLE (CHECK IF COLUMNS EXIST)
    # ==========================================
    op.execute("""
        DO $$ 
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'task_assets' AND column_name = 'pre_task_check_completed') THEN
                ALTER TABLE task_assets ADD COLUMN pre_task_check_completed BOOLEAN NOT NULL DEFAULT false;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'task_assets' AND column_name = 'pre_task_check_notes') THEN
                ALTER TABLE task_assets ADD COLUMN pre_task_check_notes TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'task_assets' AND column_name = 'pre_task_check_at') THEN
                ALTER TABLE task_assets ADD COLUMN pre_task_check_at TIMESTAMP WITH TIME ZONE;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'task_assets' AND column_name = 'post_task_reading') THEN
                ALTER TABLE task_assets ADD COLUMN post_task_reading NUMERIC(10, 2);
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'task_assets' AND column_name = 'post_task_notes') THEN
                ALTER TABLE task_assets ADD COLUMN post_task_notes TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'task_assets' AND column_name = 'post_task_recorded_at') THEN
                ALTER TABLE task_assets ADD COLUMN post_task_recorded_at TIMESTAMP WITH TIME ZONE;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'task_assets' AND column_name = 'usage_started_at') THEN
                ALTER TABLE task_assets ADD COLUMN usage_started_at TIMESTAMP WITH TIME ZONE;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'task_assets' AND column_name = 'usage_ended_at') THEN
                ALTER TABLE task_assets ADD COLUMN usage_ended_at TIMESTAMP WITH TIME ZONE;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'task_assets' AND column_name = 'batch_number') THEN
                ALTER TABLE task_assets ADD COLUMN batch_number VARCHAR(100);
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'task_assets' AND column_name = 'expiry_date') THEN
                ALTER TABLE task_assets ADD COLUMN expiry_date DATE;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'task_assets' AND column_name = 'actual_cost') THEN
                ALTER TABLE task_assets ADD COLUMN actual_cost NUMERIC(10, 2);
            END IF;
        END $$;
    """)


def downgrade():
    # Remove in reverse order
    
    # 8. Remove columns from task_assets (conditionally)
    op.execute("""
        DO $$ 
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'task_assets' AND column_name = 'actual_cost') THEN
                ALTER TABLE task_assets DROP COLUMN actual_cost;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'task_assets' AND column_name = 'expiry_date') THEN
                ALTER TABLE task_assets DROP COLUMN expiry_date;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'task_assets' AND column_name = 'batch_number') THEN
                ALTER TABLE task_assets DROP COLUMN batch_number;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'task_assets' AND column_name = 'usage_ended_at') THEN
                ALTER TABLE task_assets DROP COLUMN usage_ended_at;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'task_assets' AND column_name = 'usage_started_at') THEN
                ALTER TABLE task_assets DROP COLUMN usage_started_at;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'task_assets' AND column_name = 'post_task_recorded_at') THEN
                ALTER TABLE task_assets DROP COLUMN post_task_recorded_at;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'task_assets' AND column_name = 'post_task_notes') THEN
                ALTER TABLE task_assets DROP COLUMN post_task_notes;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'task_assets' AND column_name = 'post_task_reading') THEN
                ALTER TABLE task_assets DROP COLUMN post_task_reading;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'task_assets' AND column_name = 'pre_task_check_at') THEN
                ALTER TABLE task_assets DROP COLUMN pre_task_check_at;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'task_assets' AND column_name = 'pre_task_check_notes') THEN
                ALTER TABLE task_assets DROP COLUMN pre_task_check_notes;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'task_assets' AND column_name = 'pre_task_check_completed') THEN
                ALTER TABLE task_assets DROP COLUMN pre_task_check_completed;
            END IF;
        END $$;
    """)
    
    # 7. Remove columns from time_entries (conditionally)
    op.execute("""
        DO $$ 
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'time_entries' AND column_name = 'entry_source') THEN
                ALTER TABLE time_entries DROP COLUMN entry_source;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'time_entries' AND column_name = 'task_id') THEN
                DROP INDEX IF EXISTS ix_time_entries_task_id;
                ALTER TABLE time_entries DROP CONSTRAINT IF EXISTS fk_time_entries_task_id;
                ALTER TABLE time_entries DROP COLUMN task_id;
            END IF;
        END $$;
    """)
    
    # 6. Drop task_gps_tracks
    op.drop_index('ix_task_gps_task_segment', 'task_gps_tracks')
    op.drop_index('ix_task_gps_task_timestamp', 'task_gps_tracks')
    op.drop_index('ix_task_gps_tracks_timestamp', 'task_gps_tracks')
    op.drop_index('ix_task_gps_tracks_task_id', 'task_gps_tracks')
    op.drop_index('ix_task_gps_tracks_id', 'task_gps_tracks')
    op.drop_table('task_gps_tracks')
    
    # 5. Drop task_rows
    op.drop_index('ix_task_row_task_status', 'task_rows')
    op.drop_index('ix_task_rows_status', 'task_rows')
    op.drop_index('ix_task_rows_vineyard_row_id', 'task_rows')
    op.drop_index('ix_task_rows_task_id', 'task_rows')
    op.drop_index('ix_task_rows_id', 'task_rows')
    op.drop_table('task_rows')
    
    # 4. Drop task_assignments
    op.drop_index('ix_task_assignment_user_status', 'task_assignments')
    op.drop_index('ix_task_assignments_status', 'task_assignments')
    op.drop_index('ix_task_assignments_user_id', 'task_assignments')
    op.drop_index('ix_task_assignments_task_id', 'task_assignments')
    op.drop_index('ix_task_assignments_id', 'task_assignments')
    op.drop_table('task_assignments')
    
    # 3. Drop tasks
    op.drop_index('ix_task_spatial_area_status', 'tasks')
    op.drop_index('ix_task_block_status', 'tasks')
    op.drop_index('ix_task_company_status_date', 'tasks')
    op.drop_index('ix_tasks_created_by', 'tasks')
    op.drop_index('ix_tasks_created_at', 'tasks')
    op.drop_index('ix_tasks_status', 'tasks')
    op.drop_index('ix_tasks_priority', 'tasks')
    op.drop_index('ix_tasks_scheduled_start_date', 'tasks')
    op.drop_index('ix_tasks_spatial_area_id', 'tasks')
    op.drop_index('ix_tasks_block_id', 'tasks')
    op.drop_index('ix_tasks_task_category', 'tasks')
    op.drop_index('ix_tasks_task_number', 'tasks')
    op.drop_index('ix_tasks_company_id', 'tasks')
    op.drop_index('ix_tasks_id', 'tasks')
    op.drop_table('tasks')
    
    # 1. Drop task_templates
    op.drop_index('ix_task_templates_task_category', 'task_templates')
    op.drop_index('ix_task_templates_company_id', 'task_templates')
    op.drop_index('ix_task_templates_id', 'task_templates')
    op.drop_table('task_templates')