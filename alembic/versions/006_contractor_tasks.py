"""Add contractor assignment to tasks table

Revision ID: 006_contractor_tasks
Revises: 005_contractor_training
Create Date: 2024-01-15 11:15:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = '006_contractor_tasks'
down_revision = '005_contractor_training'
branch_labels = None
depends_on = None

def upgrade():
    # Add contractor assignment field to tasks table
    op.add_column('tasks', sa.Column('assigned_contractor_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_tasks_assigned_contractor', 'tasks', 'contractors', ['assigned_contractor_id'], ['id'])
    
    # Create index for contractor tasks
    op.create_index('ix_tasks_assigned_contractor', 'tasks', ['assigned_contractor_id'], unique=False)

def downgrade():
    op.drop_index('ix_tasks_assigned_contractor', table_name='tasks')
    op.drop_constraint('fk_tasks_assigned_contractor', 'tasks', type_='foreignkey')
    op.drop_column('tasks', 'assigned_contractor_id')

