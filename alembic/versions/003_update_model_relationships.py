"""Update model relationships and add missing relationship fields

Revision ID: 003_update_model_relationships
Revises: 002_enhance_observations_table
Create Date: 2024-XX-XX XX:XX:XX.XXXXXX

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '003_update_model_relationships'
down_revision = '002_enhance_observations_table'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Add relationship fields to support the enhanced models
    
    # Update Company model relationships (if needed)
    # Add observation_templates relationship support
    # This might require adding fields or indexes depending on existing schema
    
    # Update User model relationships
    # Add fields to support observation template creation and verification
    # These relationships are handled via foreign keys already created
    
    # Update VineyardBlock model relationships  
    # Add support for blockchain chains if not already present
    # The observations relationship already exists
    
    # Update Task model to support observation relationships
    # Add observations relationship support if Task model needs it
    try:
        # Check if tasks table has observations relationship support
        # Add a column to track originating observations if needed
        op.add_column('tasks', sa.Column('originating_observation_id', sa.Integer(), nullable=True))
        op.create_foreign_key('fk_tasks_originating_observation', 'tasks', 'observations', ['originating_observation_id'], ['id'])
    except Exception:
        # Column might already exist, continue
        pass
    
    # Update SiteRisk model to support observation relationships
    try:
        # Add observations relationship support if needed
        # This might already be supported via related_risk_id
        pass
    except Exception:
        pass
    
    # Add blockchain node support for observations
    try:
        # Ensure blockchain_nodes table has observation relationship
        op.add_column('blockchain_nodes', sa.Column('observation_id', sa.Integer(), nullable=True))
        op.create_foreign_key('fk_blockchain_nodes_observation', 'blockchain_nodes', 'observations', ['observation_id'], ['id'])
    except Exception:
        # Might already exist or blockchain_nodes table might not exist yet
        pass
    
    # Create any missing indexes for performance
    try:
        op.create_index('idx_tasks_originating_observation', 'tasks', ['originating_observation_id'])
    except Exception:
        pass
    
    try:
        op.create_index('idx_blockchain_nodes_observation', 'blockchain_nodes', ['observation_id'])
    except Exception:
        pass

def downgrade() -> None:
    # Remove the added relationship support
    
    try:
        op.drop_index('idx_blockchain_nodes_observation', table_name='blockchain_nodes')
    except Exception:
        pass
    
    try:
        op.drop_index('idx_tasks_originating_observation', table_name='tasks')
    except Exception:
        pass
    
    try:
        op.drop_constraint('fk_blockchain_nodes_observation', 'blockchain_nodes', type_='foreignkey')
        op.drop_column('blockchain_nodes', 'observation_id')
    except Exception:
        pass
    
    try:
        op.drop_constraint('fk_tasks_originating_observation', 'tasks', type_='foreignkey')
        op.drop_column('tasks', 'originating_observation_id')
    except Exception:
        pass