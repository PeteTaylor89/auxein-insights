"""Create performance indexes for contractor tables

Revision ID: 007_contractor_indexes
Revises: 006_contractor_tasks
Create Date: 2024-01-15 11:30:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = '007_contractor_indexes'
down_revision = '006_contractor_tasks'
branch_labels = None
depends_on = None

def upgrade():
    # Contractors table indexes
    op.create_index('ix_contractors_business_name', 'contractors', ['business_name'], unique=False)
    op.create_index('ix_contractors_contractor_type', 'contractors', ['contractor_type'], unique=False)
    op.create_index('ix_contractors_is_active', 'contractors', ['is_active'], unique=False)
    op.create_index('ix_contractors_verification_level', 'contractors', ['verification_level'], unique=False)
    op.create_index('ix_contractors_created_at', 'contractors', ['created_at'], unique=False)
    
    # Contractor relationships indexes
    op.create_index('ix_contractor_relationships_status', 'contractor_relationships', ['status'], unique=False)
    op.create_index('ix_contractor_relationships_relationship_type', 'contractor_relationships', ['relationship_type'], unique=False)
    op.create_index('ix_contractor_relationships_last_worked', 'contractor_relationships', ['last_worked_date'], unique=False)
    
    # Contractor movements indexes
    op.create_index('ix_contractor_movements_departure', 'contractor_movements', ['departure_datetime'], unique=False)
    op.create_index('ix_contractor_movements_risk_level', 'contractor_movements', ['biosecurity_risk_level'], unique=False)
    op.create_index('ix_contractor_movements_equipment_cleaned', 'contractor_movements', ['equipment_cleaned'], unique=False)
    
    # Contractor assignments indexes
    op.create_index('ix_contractor_assignments_scheduled_start', 'contractor_assignments', ['scheduled_start'], unique=False)
    op.create_index('ix_contractor_assignments_priority', 'contractor_assignments', ['priority'], unique=False)
    op.create_index('ix_contractor_assignments_payment_status', 'contractor_assignments', ['payment_status'], unique=False)
    
    # Composite indexes for common queries
    op.create_index('ix_contractor_movements_active_visits', 'contractor_movements', 
                   ['company_id', 'departure_datetime'], unique=False)
    op.create_index('ix_contractor_assignments_active_work', 'contractor_assignments', 
                   ['contractor_id', 'status', 'scheduled_start'], unique=False)
    op.create_index('ix_contractor_training_active_assignments', 'contractor_training', 
                   ['contractor_id', 'status', 'due_date'], unique=False)

def downgrade():
    # Drop all the indexes we created
    op.drop_index('ix_contractors_business_name', table_name='contractors')
    op.drop_index('ix_contractors_contractor_type', table_name='contractors')
    op.drop_index('ix_contractors_is_active', table_name='contractors')
    op.drop_index('ix_contractors_verification_level', table_name='contractors')
    op.drop_index('ix_contractors_created_at', table_name='contractors')
    
    op.drop_index('ix_contractor_relationships_status', table_name='contractor_relationships')
    op.drop_index('ix_contractor_relationships_relationship_type', table_name='contractor_relationships')
    op.drop_index('ix_contractor_relationships_last_worked', table_name='contractor_relationships')
    
    op.drop_index('ix_contractor_movements_departure', table_name='contractor_movements')
    op.drop_index('ix_contractor_movements_risk_level', table_name='contractor_movements')
    op.drop_index('ix_contractor_movements_equipment_cleaned', table_name='contractor_movements')
    
    op.drop_index('ix_contractor_assignments_scheduled_start', table_name='contractor_assignments')
    op.drop_index('ix_contractor_assignments_priority', table_name='contractor_assignments')
    op.drop_index('ix_contractor_assignments_payment_status', table_name='contractor_assignments')
    
    op.drop_index('ix_contractor_movements_active_visits', table_name='contractor_movements')
    op.drop_index('ix_contractor_assignments_active_work', table_name='contractor_assignments')
    op.drop_index('ix_contractor_training_active_assignments', table_name='contractor_training')
