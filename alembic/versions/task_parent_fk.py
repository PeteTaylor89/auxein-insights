"""Add parent_task_id self-FK to tasks, for repair roll-ups.

From the Greystone beta feedback (Vineyard Maintenance & Repairs): a repair
noted at row or block level — broken wires being the example — should roll up
automatically into one bigger task to track and action, rather than creating a
separate task for every block.

Modelled as a self-FK rather than a separate Repair entity (Pete's call,
2026-08-05). A repair IS a task: it already needs status, assignment,
scheduling, photos and permissions, all of which Task implements. A parallel
entity would duplicate every one of them. This mirrors the existing
source_task_id self-FK on the same table.

ondelete='SET NULL' — deleting the roll-up must NOT cascade into the individual
repairs. They become unparented and remain actionable on their own.

Reporting note: a roll-up parent and its children both live in `tasks`, so any
count that must not double-report should either exclude rows with a non-null
parent_task_id or exclude the parents. Same care as source_task_id.

Revision ID: task_parent_fk
Revises: block_notes_col
Create Date: 2026-08-05
"""
from alembic import op
import sqlalchemy as sa


revision = 'task_parent_fk'
down_revision = 'block_notes_col'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('tasks', sa.Column('parent_task_id', sa.Integer(), nullable=True))
    op.create_index('ix_tasks_parent_task_id', 'tasks', ['parent_task_id'])
    op.create_foreign_key(
        'fk_tasks_parent_task_id',
        'tasks', 'tasks',
        ['parent_task_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_tasks_parent_task_id', 'tasks', type_='foreignkey')
    op.drop_index('ix_tasks_parent_task_id', table_name='tasks')
    op.drop_column('tasks', 'parent_task_id')
