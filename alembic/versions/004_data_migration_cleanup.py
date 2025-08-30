"""Data migration and cleanup for enhanced observations

Revision ID: 004_data_migration_cleanup
Revises: 003_update_model_relationships
Create Date: 2024-XX-XX XX:XX:XX.XXXXXX

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import table, column
from sqlalchemy import String, Integer, DateTime, Boolean

# revision identifiers, used by Alembic.
revision = '004_data_migration_cleanup'
down_revision = '003_update_model_relationships'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Create a table reference for data migration
    observations_table = table('observations',
        column('id', Integer),
        column('observation_type', String),
        column('observation_category', String),
        column('status', String),
        column('requires_action', Boolean),
        column('priority_score', Integer),
        column('observation_data', sa.JSON),
        column('created_at', DateTime)
    )
    
    # Ensure all existing observations have proper default values
    op.execute("""
        UPDATE observations 
        SET observation_data = '{}' 
        WHERE observation_data IS NULL
    """)
    
    op.execute("""
        UPDATE observations 
        SET status = 'active' 
        WHERE status IS NULL
    """)
    
    op.execute("""
        UPDATE observations 
        SET requires_action = false 
        WHERE requires_action IS NULL
    """)
    
    # Calculate initial priority scores for existing observations
    op.execute("""
        UPDATE observations 
        SET priority_score = 5
        WHERE priority_score IS NULL
    """)
    
    # Set observation_date to created_at for existing observations where null
    op.execute("""
        UPDATE observations 
        SET observation_date = created_at 
        WHERE observation_date IS NULL
    """)
    
    # Create default system templates
    # This will be done via API call after deployment, but we can prepare the structure
    
    # Clean up old observation_type column data if needed
    # Keep it for now in case rollback is needed
    
    # Add any necessary data validation
    op.execute("""
        UPDATE observations 
        SET observation_category = 'general'
        WHERE observation_category IS NULL OR observation_category = ''
    """)
    
    # Ensure company_id is properly set (should already be from existing data)
    
    # Add check constraints for data integrity
    op.create_check_constraint(
        'ck_observations_el_stage_format',
        'observations',
        "el_stage IS NULL OR el_stage ~ '^EL-[0-9]{1,2}$'"
    )
    
    op.create_check_constraint(
        'ck_observations_el_percentage_range',
        'observations',
        "el_stage_percentage IS NULL OR (el_stage_percentage >= 0 AND el_stage_percentage <= 100)"
    )
    
    op.create_check_constraint(
        'ck_observations_secondary_el_percentage_range',
        'observations',
        "el_stage_secondary_percentage IS NULL OR (el_stage_secondary_percentage >= 0 AND el_stage_secondary_percentage <= 100)"
    )
    
    op.create_check_constraint(
        'ck_observations_priority_score_range',
        'observations',
        "priority_score IS NULL OR (priority_score >= 1 AND priority_score <= 10)"
    )
    
    # Add check constraint for observation category values
    op.create_check_constraint(
        'ck_observations_category_values',
        'observations',
        """observation_category IN (
            'phenology', 'plant_health', 'plant_growth', 'pre_harvest',
            'hazard_safety', 'compliance', 'biosecurity', 'disease',
            'land_management', 'maintenance', 'weather', 'irrigation', 'general'
        )"""
    )
    
    op.create_check_constraint(
        'ck_observations_status_values',
        'observations',
        "status IN ('active', 'archived', 'flagged', 'requires_review')"
    )
    
    op.create_check_constraint(
        'ck_observations_severity_values',
        'observations',
        "severity_level IS NULL OR severity_level IN ('low', 'medium', 'high', 'critical')"
    )
    
    op.create_check_constraint(
        'ck_observations_confidence_values',
        'observations',
        "confidence_level IS NULL OR confidence_level IN ('low', 'medium', 'high')"
    )

def downgrade() -> None:
    # Remove check constraints
    op.drop_constraint('ck_observations_confidence_values', 'observations', type_='check')
    op.drop_constraint('ck_observations_severity_values', 'observations', type_='check')
    op.drop_constraint('ck_observations_status_values', 'observations', type_='check')
    op.drop_constraint('ck_observations_category_values', 'observations', type_='check')
    op.drop_constraint('ck_observations_priority_score_range', 'observations', type_='check')
    op.drop_constraint('ck_observations_secondary_el_percentage_range', 'observations', type_='check')
    op.drop_constraint('ck_observations_el_percentage_range', 'observations', type_='check')
    op.drop_constraint('ck_observations_el_stage_format', 'observations', type_='check')
    
    # Note: We don't reverse the data migrations in downgrade as they could cause data loss
    # The schema changes in the previous migrations handle the structural rollback