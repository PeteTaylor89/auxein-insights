"""Add row_id foreign keys to tasks and observations tables

Revision ID: 20250629_002
Revises: 20250629_001
Create Date: 2025-06-29 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20250629_002'
down_revision: Union[str, None] = '20250629_001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # Add row_id foreign key to tasks table (assuming it exists)
    try:
        op.add_column('tasks', sa.Column('row_id', sa.Integer(), nullable=True))
        op.create_foreign_key('fk_tasks_row_id', 'tasks', 'vineyard_rows', ['row_id'], ['id'])
    except Exception as e:
        print(f"Could not add row_id to tasks table: {e}")
    
    # Add row_id foreign key to observations table (assuming it exists)
    try:
        op.add_column('observations', sa.Column('row_id', sa.Integer(), nullable=True))
        op.create_foreign_key('fk_observations_row_id', 'observations', 'vineyard_rows', ['row_id'], ['id'])
    except Exception as e:
        print(f"Could not add row_id to observations table: {e}")


def downgrade():
    # Remove foreign keys and columns
    try:
        op.drop_constraint('fk_observations_row_id', 'observations', type_='foreignkey')
        op.drop_column('observations', 'row_id')
    except Exception as e:
        print(f"Could not remove row_id from observations table: {e}")
    
    try:
        op.drop_constraint('fk_tasks_row_id', 'tasks', type_='foreignkey')
        op.drop_column('tasks', 'row_id')
    except Exception as e:
        print(f"Could not remove row_id from tasks table: {e}")