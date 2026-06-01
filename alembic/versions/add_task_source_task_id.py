"""Add tasks.source_task_id (spray multi-block clone lineage).

Completed-task clones generated for blocks a single spray track covered beyond
the origin task's assigned block point back to the origin via source_task_id.
Labour/stock stay on the origin; clones are coverage records — reports exclude
rows where source_task_id IS NOT NULL to avoid double-counting.

Revision ID: add_task_source_task_id
Revises: add_spray_coverage
Create Date: 2026-06-01
"""
from alembic import op
import sqlalchemy as sa


revision = 'add_task_source_task_id'
down_revision = 'add_spray_coverage'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'tasks',
        sa.Column('source_task_id', sa.Integer(), sa.ForeignKey('tasks.id', ondelete='SET NULL'), nullable=True),
    )
    op.create_index('ix_tasks_source_task_id', 'tasks', ['source_task_id'])


def downgrade() -> None:
    op.drop_index('ix_tasks_source_task_id', table_name='tasks')
    op.drop_column('tasks', 'source_task_id')
