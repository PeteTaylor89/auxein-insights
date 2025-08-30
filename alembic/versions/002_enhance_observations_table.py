"""Enhance observations table with new fields and structure

Revision ID: 002_enhance_observations_table
Revises: 001_create_observation_templates
Create Date: 2024-XX-XX XX:XX:XX.XXXXXX

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from geoalchemy2 import Geometry

# revision identifiers, used by Alembic.
revision = '002_enhance_observations_table'
down_revision = '001_create_observation_templates'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # First, clear existing test data
    op.execute("DELETE FROM observations")
    
    # Drop existing indexes that might conflict
    try:
        op.drop_index('ix_observations_id', table_name='observations')
    except:
        pass
    
    # Add new columns to observations table
    op.add_column('observations', sa.Column('observation_category', sa.String(length=50), nullable=True))
    op.add_column('observations', sa.Column('observation_subtype', sa.String(length=50), nullable=True))
    op.add_column('observations', sa.Column('template_id', sa.Integer(), nullable=True))
    op.add_column('observations', sa.Column('observation_data', sa.JSON(), nullable=False, server_default='{}'))
    op.add_column('observations', sa.Column('measurements', sa.JSON(), nullable=True))
    
    # EL Scale specific fields
    op.add_column('observations', sa.Column('el_stage', sa.String(length=10), nullable=True))
    op.add_column('observations', sa.Column('el_stage_percentage', sa.Float(), nullable=True))
    op.add_column('observations', sa.Column('el_stage_secondary', sa.String(length=10), nullable=True))
    op.add_column('observations', sa.Column('el_stage_secondary_percentage', sa.Float(), nullable=True))
    
    # Integration fields
    op.add_column('observations', sa.Column('related_risk_id', sa.Integer(), nullable=True))
    op.add_column('observations', sa.Column('related_task_id', sa.Integer(), nullable=True))
    op.add_column('observations', sa.Column('blockchain_node_id', sa.Integer(), nullable=True))
    
    # Workflow and priority fields
    op.add_column('observations', sa.Column('status', sa.String(length=20), nullable=False, server_default='active'))
    op.add_column('observations', sa.Column('severity_level', sa.String(length=20), nullable=True))
    op.add_column('observations', sa.Column('requires_action', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('observations', sa.Column('action_deadline', sa.Date(), nullable=True))
    op.add_column('observations', sa.Column('priority_score', sa.Integer(), nullable=True))
    
    # Quality assurance fields
    op.add_column('observations', sa.Column('confidence_level', sa.String(length=20), nullable=True))
    op.add_column('observations', sa.Column('sample_size', sa.String(length=50), nullable=True))
    op.add_column('observations', sa.Column('weather_conditions', sa.String(length=100), nullable=True))
    
    # Enhanced location fields
    op.add_column('observations', sa.Column('location_description', sa.String(length=200), nullable=True))
    op.add_column('observations', sa.Column('area_affected', Geometry(geometry_type='POLYGON', srid=4326), nullable=True))
    
    # System admin fields
    op.add_column('observations', sa.Column('assigned_by_system_admin', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('observations', sa.Column('original_assignee_company_id', sa.Integer(), nullable=True))
    
    # Audit fields
    op.add_column('observations', sa.Column('verified_by', sa.Integer(), nullable=True))
    op.add_column('observations', sa.Column('verified_at', sa.DateTime(), nullable=True))
    op.add_column('observations', sa.Column('compliance_checked', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('observations', sa.Column('compliance_notes', sa.Text(), nullable=True))
    
    # Follow-up fields
    op.add_column('observations', sa.Column('follow_up_required', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('observations', sa.Column('follow_up_date', sa.Date(), nullable=True))
    op.add_column('observations', sa.Column('follow_up_notes', sa.Text(), nullable=True))
    
    # Timing field
    op.add_column('observations', sa.Column('observation_date', sa.DateTime(), nullable=True))
    
    # Update the observation_type column to be nullable (we'll migrate data later)
    op.alter_column('observations', 'observation_type', nullable=True)
    
    # Create foreign key constraints for new relationships
    op.create_foreign_key('fk_observations_template', 'observations', 'observation_templates', ['template_id'], ['id'])
    op.create_foreign_key('fk_observations_risk', 'observations', 'site_risks', ['related_risk_id'], ['id'])
    op.create_foreign_key('fk_observations_task', 'observations', 'tasks', ['related_task_id'], ['id'])
    op.create_foreign_key('fk_observations_blockchain', 'observations', 'blockchain_nodes', ['blockchain_node_id'], ['id'])
    op.create_foreign_key('fk_observations_verifier', 'observations', 'users', ['verified_by'], ['id'])
    op.create_foreign_key('fk_observations_original_company', 'observations', 'companies', ['original_assignee_company_id'], ['id'])
    
    # Migrate existing data from observation_type to observation_category
    op.execute("""
        UPDATE observations 
        SET observation_category = CASE 
            WHEN observation_type = 'disease' THEN 'disease'
            WHEN observation_type = 'pests' THEN 'plant_health'
            WHEN observation_type = 'irrigation' THEN 'irrigation'
            WHEN observation_type = 'weather' THEN 'weather'
            WHEN observation_type = 'development' THEN 'plant_growth'
            WHEN observation_type = 'general' THEN 'general'
            ELSE 'general'
        END
        WHERE observation_category IS NULL
    """)
    
    # Make observation_category NOT NULL after migration
    op.alter_column('observations', 'observation_category', nullable=False)
    
    # Create new indexes for performance
    op.create_index('idx_observation_category_company', 'observations', ['observation_category', 'company_id'])
    op.create_index('idx_observation_date_block', 'observations', ['observation_date', 'block_id'])
    op.create_index('idx_observation_status_priority', 'observations', ['status', 'severity_level'])
    op.create_index('idx_el_stage_block', 'observations', ['el_stage', 'block_id'])
    op.create_index('idx_requires_action', 'observations', ['requires_action', 'action_deadline'])
    op.create_index('idx_system_admin_assignment', 'observations', ['assigned_by_system_admin', 'company_id'])
    op.create_index('idx_follow_up', 'observations', ['follow_up_required', 'follow_up_date'])
    
    # Recreate the main ID index
    op.create_index(op.f('ix_observations_id'), 'observations', ['id'])

def downgrade() -> None:
    # Drop new indexes
    op.drop_index(op.f('ix_observations_id'), table_name='observations')
    op.drop_index('idx_follow_up', table_name='observations')
    op.drop_index('idx_system_admin_assignment', table_name='observations')
    op.drop_index('idx_requires_action', table_name='observations')
    op.drop_index('idx_el_stage_block', table_name='observations')
    op.drop_index('idx_observation_status_priority', table_name='observations')
    op.drop_index('idx_observation_date_block', table_name='observations')
    op.drop_index('idx_observation_category_company', table_name='observations')
    
    # Drop foreign key constraints
    op.drop_constraint('fk_observations_original_company', 'observations', type_='foreignkey')
    op.drop_constraint('fk_observations_verifier', 'observations', type_='foreignkey')
    op.drop_constraint('fk_observations_blockchain', 'observations', type_='foreignkey')
    op.drop_constraint('fk_observations_task', 'observations', type_='foreignkey')
    op.drop_constraint('fk_observations_risk', 'observations', type_='foreignkey')
    op.drop_constraint('fk_observations_template', 'observations', type_='foreignkey')
    
    # Drop new columns
    op.drop_column('observations', 'observation_date')
    op.drop_column('observations', 'follow_up_notes')
    op.drop_column('observations', 'follow_up_date')
    op.drop_column('observations', 'follow_up_required')
    op.drop_column('observations', 'compliance_notes')
    op.drop_column('observations', 'compliance_checked')
    op.drop_column('observations', 'verified_at')
    op.drop_column('observations', 'verified_by')
    op.drop_column('observations', 'original_assignee_company_id')
    op.drop_column('observations', 'assigned_by_system_admin')
    op.drop_column('observations', 'area_affected')
    op.drop_column('observations', 'location_description')
    op.drop_column('observations', 'weather_conditions')
    op.drop_column('observations', 'sample_size')
    op.drop_column('observations', 'confidence_level')
    op.drop_column('observations', 'priority_score')
    op.drop_column('observations', 'action_deadline')
    op.drop_column('observations', 'requires_action')
    op.drop_column('observations', 'severity_level')
    op.drop_column('observations', 'status')
    op.drop_column('observations', 'blockchain_node_id')
    op.drop_column('observations', 'related_task_id')
    op.drop_column('observations', 'related_risk_id')
    op.drop_column('observations', 'el_stage_secondary_percentage')
    op.drop_column('observations', 'el_stage_secondary')
    op.drop_column('observations', 'el_stage_percentage')
    op.drop_column('observations', 'el_stage')
    op.drop_column('observations', 'measurements')
    op.drop_column('observations', 'observation_data')
    op.drop_column('observations', 'template_id')
    op.drop_column('observations', 'observation_subtype')
    op.drop_column('observations', 'observation_category')
    
    # Restore observation_type to NOT NULL
    op.alter_column('observations', 'observation_type', nullable=False)