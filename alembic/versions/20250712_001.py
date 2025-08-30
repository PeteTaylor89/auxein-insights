
"""rename metadata to area_metadata

Revision ID: 20250712_001
Revises: 20250703_003  
Create Date: 2025-07-03 11:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import geoalchemy2

revision = '20250712_001'
down_revision = '20250703_003'  
branch_labels = None
depends_on = None

def upgrade():
    # Create site_risks table
    op.create_table('site_risks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('company_id', sa.Integer(), nullable=False),
        sa.Column('risk_title', sa.String(length=200), nullable=False),
        sa.Column('risk_description', sa.Text(), nullable=False),
        sa.Column('risk_category', sa.String(length=50), nullable=False),
        sa.Column('risk_type', sa.String(length=50), nullable=False),
        sa.Column('location', geoalchemy2.Geometry(geometry_type='POINT', srid=4326), nullable=True),
        sa.Column('area', geoalchemy2.Geometry(geometry_type='POLYGON', srid=4326), nullable=True),
        sa.Column('location_description', sa.String(length=500), nullable=True),
        sa.Column('inherent_likelihood', sa.Integer(), nullable=False),
        sa.Column('inherent_severity', sa.Integer(), nullable=False),
        sa.Column('inherent_risk_score', sa.Integer(), nullable=False),
        sa.Column('inherent_risk_level', sa.String(length=20), nullable=False),
        sa.Column('residual_likelihood', sa.Integer(), nullable=True),
        sa.Column('residual_severity', sa.Integer(), nullable=True),
        sa.Column('residual_risk_score', sa.Integer(), nullable=True),
        sa.Column('residual_risk_level', sa.String(length=20), nullable=True),
        sa.Column('status', sa.String(length=30), nullable=False, default='active'),
        sa.Column('owner_id', sa.Integer(), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=False),
        sa.Column('review_frequency_days', sa.Integer(), nullable=True),
        sa.Column('last_reviewed', sa.DateTime(timezone=True), nullable=True),
        sa.Column('next_review_due', sa.DateTime(timezone=True), nullable=True),
        sa.Column('potential_consequences', sa.Text(), nullable=True),
        sa.Column('existing_controls', sa.Text(), nullable=True),
        sa.Column('regulatory_requirements', sa.Text(), nullable=True),
        sa.Column('custom_fields', sa.JSON(), nullable=False, default={}),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )

    # Create risk_actions table
    op.create_table('risk_actions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('risk_id', sa.Integer(), nullable=False),
        sa.Column('company_id', sa.Integer(), nullable=False),
        sa.Column('action_title', sa.String(length=200), nullable=False),
        sa.Column('action_description', sa.Text(), nullable=False),
        sa.Column('action_type', sa.String(length=50), nullable=False),
        sa.Column('control_type', sa.String(length=50), nullable=False),
        sa.Column('priority', sa.String(length=20), nullable=False, default='medium'),
        sa.Column('urgency', sa.String(length=20), nullable=False, default='medium'),
        sa.Column('assigned_to', sa.Integer(), nullable=True),
        sa.Column('responsible_person', sa.Integer(), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=30), nullable=False, default='planned'),
        sa.Column('target_start_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('target_completion_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('actual_start_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('actual_completion_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('estimated_cost', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('actual_cost', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('currency', sa.String(length=3), nullable=False, default='NZD'),
        sa.Column('progress_percentage', sa.Integer(), nullable=False, default=0),
        sa.Column('completion_notes', sa.Text(), nullable=True),
        sa.Column('effectiveness_rating', sa.Integer(), nullable=True),
        sa.Column('effectiveness_notes', sa.Text(), nullable=True),
        sa.Column('effectiveness_reviewed_by', sa.Integer(), nullable=True),
        sa.Column('effectiveness_reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expected_likelihood_reduction', sa.Integer(), nullable=True),
        sa.Column('expected_severity_reduction', sa.Integer(), nullable=True),
        sa.Column('task_id', sa.Integer(), nullable=True),
        sa.Column('auto_create_task', sa.Boolean(), nullable=False, default=True),
        sa.Column('requires_verification', sa.Boolean(), nullable=False, default=False),
        sa.Column('verification_completed', sa.Boolean(), nullable=False, default=False),
        sa.Column('verification_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('verified_by', sa.Integer(), nullable=True),
        sa.Column('verification_notes', sa.Text(), nullable=True),
        sa.Column('is_recurring', sa.Boolean(), nullable=False, default=False),
        sa.Column('recurrence_frequency_days', sa.Integer(), nullable=True),
        sa.Column('next_due_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('parent_action_id', sa.Integer(), nullable=True),
        sa.Column('custom_fields', sa.JSON(), nullable=False, default={}),
        sa.Column('tags', sa.JSON(), nullable=False, default=[]),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )

    # Create incidents table
    op.create_table('incidents',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('company_id', sa.Integer(), nullable=False),
        sa.Column('incident_number', sa.String(length=50), nullable=False),
        sa.Column('incident_title', sa.String(length=200), nullable=False),
        sa.Column('incident_description', sa.Text(), nullable=False),
        sa.Column('incident_type', sa.String(length=50), nullable=False),
        sa.Column('severity', sa.String(length=30), nullable=False),
        sa.Column('category', sa.String(length=50), nullable=False),
        sa.Column('is_notifiable', sa.Boolean(), nullable=False, default=False),
        sa.Column('notifiable_type', sa.String(length=50), nullable=True),
        sa.Column('worksafe_notified', sa.Boolean(), nullable=False, default=False),
        sa.Column('worksafe_notification_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('worksafe_reference', sa.String(length=100), nullable=True),
        sa.Column('incident_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('discovered_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('location_description', sa.String(length=500), nullable=False),
        sa.Column('location', geoalchemy2.Geometry(geometry_type='POINT', srid=4326), nullable=True),
        sa.Column('reported_by', sa.Integer(), nullable=False),
        sa.Column('injured_person_name', sa.String(length=200), nullable=True),
        sa.Column('injured_person_role', sa.String(length=100), nullable=True),
        sa.Column('injured_person_company', sa.String(length=200), nullable=True),
        sa.Column('witness_details', sa.Text(), nullable=True),
        sa.Column('injury_type', sa.String(length=100), nullable=True),
        sa.Column('body_part_affected', sa.String(length=100), nullable=True),
        sa.Column('medical_treatment_required', sa.Boolean(), nullable=False, default=False),
        sa.Column('medical_provider', sa.String(length=200), nullable=True),
        sa.Column('time_off_work', sa.Boolean(), nullable=False, default=False),
        sa.Column('estimated_time_off_days', sa.Integer(), nullable=True),
        sa.Column('property_damage_cost', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('environmental_impact', sa.Text(), nullable=True),
        sa.Column('investigation_required', sa.Boolean(), nullable=False, default=True),
        sa.Column('investigation_status', sa.String(length=30), nullable=False, default='pending'),
        sa.Column('investigator_id', sa.Integer(), nullable=True),
        sa.Column('investigation_due_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('investigation_completed_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('investigation_findings', sa.Text(), nullable=True),
        sa.Column('immediate_causes', sa.JSON(), nullable=False, default=[]),
        sa.Column('root_causes', sa.JSON(), nullable=False, default=[]),
        sa.Column('contributing_factors', sa.JSON(), nullable=False, default=[]),
        sa.Column('related_risk_id', sa.Integer(), nullable=True),
        sa.Column('new_risk_created', sa.Boolean(), nullable=False, default=False),
        sa.Column('immediate_actions_taken', sa.Text(), nullable=True),
        sa.Column('corrective_actions_required', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=30), nullable=False, default='open'),
        sa.Column('closed_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('closed_by', sa.Integer(), nullable=True),
        sa.Column('closure_reason', sa.Text(), nullable=True),
        sa.Column('lessons_learned', sa.Text(), nullable=True),
        sa.Column('communication_required', sa.Boolean(), nullable=False, default=False),
        sa.Column('communication_completed', sa.Boolean(), nullable=False, default=False),
        sa.Column('evidence_collected', sa.Boolean(), nullable=False, default=False),
        sa.Column('photos_taken', sa.Boolean(), nullable=False, default=False),
        sa.Column('reviewed_by', sa.Integer(), nullable=True),
        sa.Column('reviewed_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('approved_by', sa.Integer(), nullable=True),
        sa.Column('approved_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('custom_fields', sa.JSON(), nullable=False, default={}),
        sa.Column('tags', sa.JSON(), nullable=False, default=[]),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('incident_number')
    )

def downgrade():
    op.drop_table('incidents')
    op.drop_table('risk_actions')
    op.drop_table('site_risks')