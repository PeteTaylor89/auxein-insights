"""empty message

Revision ID: 9524a73a24f3
Revises: 20250723_001
Create Date: 2025-07-24 14:40:55.907650

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '9524a73a24f3'
down_revision: Union[str, None] = '20250723_001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None



def upgrade() -> None:
    # Create visitors table
    op.create_table(
        'visitors',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('company_id', sa.Integer(), nullable=False),
        sa.Column('first_name', sa.String(length=50), nullable=False),
        sa.Column('last_name', sa.String(length=50), nullable=False),
        sa.Column('email', sa.String(length=100), nullable=True),
        sa.Column('phone', sa.String(length=20), nullable=True),
        sa.Column('emergency_contact_name', sa.String(length=100), nullable=True),
        sa.Column('emergency_contact_phone', sa.String(length=20), nullable=True),
        sa.Column('vehicle_registration', sa.String(length=20), nullable=True),
        sa.Column('driver_license', sa.String(length=50), nullable=True),
        sa.Column('company_representing', sa.String(length=100), nullable=True),
        sa.Column('position_title', sa.String(length=100), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, default=True),
        sa.Column('is_banned', sa.Boolean(), nullable=False, default=False),
        sa.Column('ban_reason', sa.Text(), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes on visitors table
    op.create_index(op.f('ix_visitors_id'), 'visitors', ['id'], unique=False)
    op.create_index(op.f('ix_visitors_email'), 'visitors', ['email'], unique=False)
    op.create_index(op.f('ix_visitors_company_id'), 'visitors', ['company_id'], unique=False)

    # Create visitor_visits table
    op.create_table(
        'visitor_visits',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('visitor_id', sa.Integer(), nullable=False),
        sa.Column('company_id', sa.Integer(), nullable=False),
        sa.Column('visit_date', sa.Date(), nullable=False, default=sa.text('CURRENT_DATE')),
        sa.Column('purpose', sa.String(length=200), nullable=False),
        sa.Column('expected_duration_hours', sa.Integer(), nullable=True),
        sa.Column('host_user_id', sa.Integer(), nullable=False),
        sa.Column('host_notified', sa.Boolean(), nullable=False, default=False),
        sa.Column('areas_accessed', sa.JSON(), nullable=False, default=list),
        sa.Column('restricted_areas', sa.JSON(), nullable=False, default=list),
        sa.Column('signed_in_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('signed_out_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('signed_in_by', sa.Integer(), nullable=True),
        sa.Column('signed_out_by', sa.Integer(), nullable=True),
        sa.Column('induction_completed', sa.Boolean(), nullable=False, default=False),
        sa.Column('induction_completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('induction_completed_by', sa.Integer(), nullable=True),
        sa.Column('ppe_provided', sa.JSON(), nullable=False, default=list),
        sa.Column('safety_briefing_given', sa.Boolean(), nullable=False, default=False),
        sa.Column('visit_notes', sa.Text(), nullable=True),
        sa.Column('incidents', sa.JSON(), nullable=False, default=list),
        sa.Column('weather_conditions', sa.String(length=100), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, default='planned'),
        sa.Column('cancelled_reason', sa.Text(), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['visitor_id'], ['visitors.id'], ),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ),
        sa.ForeignKeyConstraint(['host_user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['signed_in_by'], ['users.id'], ),
        sa.ForeignKeyConstraint(['signed_out_by'], ['users.id'], ),
        sa.ForeignKeyConstraint(['induction_completed_by'], ['users.id'], ),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes on visitor_visits table
    op.create_index(op.f('ix_visitor_visits_id'), 'visitor_visits', ['id'], unique=False)
    op.create_index(op.f('ix_visitor_visits_visitor_id'), 'visitor_visits', ['visitor_id'], unique=False)
    op.create_index(op.f('ix_visitor_visits_company_id'), 'visitor_visits', ['company_id'], unique=False)
    op.create_index(op.f('ix_visitor_visits_visit_date'), 'visitor_visits', ['visit_date'], unique=False)
    op.create_index(op.f('ix_visitor_visits_status'), 'visitor_visits', ['status'], unique=False)
    op.create_index(op.f('ix_visitor_visits_host_user_id'), 'visitor_visits', ['host_user_id'], unique=False)
    
    # Create composite indexes for common queries
    op.create_index('ix_visitor_visits_company_date', 'visitor_visits', ['company_id', 'visit_date'], unique=False)
    op.create_index('ix_visitor_visits_active_visits', 'visitor_visits', ['company_id', 'signed_in_at', 'signed_out_at'], unique=False)


def downgrade() -> None:
    # Drop indexes first
    op.drop_index('ix_visitor_visits_active_visits', table_name='visitor_visits')
    op.drop_index('ix_visitor_visits_company_date', table_name='visitor_visits')
    op.drop_index(op.f('ix_visitor_visits_host_user_id'), table_name='visitor_visits')
    op.drop_index(op.f('ix_visitor_visits_status'), table_name='visitor_visits')
    op.drop_index(op.f('ix_visitor_visits_visit_date'), table_name='visitor_visits')
    op.drop_index(op.f('ix_visitor_visits_company_id'), table_name='visitor_visits')
    op.drop_index(op.f('ix_visitor_visits_visitor_id'), table_name='visitor_visits')
    op.drop_index(op.f('ix_visitor_visits_id'), table_name='visitor_visits')
    
    op.drop_index(op.f('ix_visitors_company_id'), table_name='visitors')
    op.drop_index(op.f('ix_visitors_email'), table_name='visitors')
    op.drop_index(op.f('ix_visitors_id'), table_name='visitors')
    
    # Drop tables
    op.drop_table('visitor_visits')
    op.drop_table('visitors')