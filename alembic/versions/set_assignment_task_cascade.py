"""Flip contractor_assignments.task_id FK from SET NULL → CASCADE.

The previous SET NULL migration kept assignments alive when a task got
deleted, just nulling out task_id. That turned out to be the wrong UX:
contractors saw the assignments as "ghost tasks" in their backlog
(rendered using work_description as a fallback title) without any way to
distinguish them from legitimate self-created general work.

CASCADE is the right call here: a contractor assignment that's tied to a
specific task should disappear when that task does. Self-created general-
work assignments (task_id NULL from creation) are untouched — CASCADE
only fires when the FK side actually references a deleted row.

Revision ID: set_assignment_task_cascade
Revises: set_assignment_task_setnull
Create Date: 2026-05-29
"""
from alembic import op
import sqlalchemy as sa


revision = 'set_assignment_task_cascade'
down_revision = 'set_assignment_task_setnull'
branch_labels = None
depends_on = None


def upgrade():
    # Drop the SET NULL FK installed by the previous migration. Use catalog
    # lookup in case the constraint name diverged at some point.
    op.execute("""
        DO $$
        DECLARE r record;
        BEGIN
            FOR r IN SELECT conname FROM pg_constraint
                     WHERE conrelid = 'contractor_assignments'::regclass
                       AND contype = 'f'
                       AND confrelid = 'tasks'::regclass
            LOOP
                EXECUTE 'ALTER TABLE contractor_assignments DROP CONSTRAINT ' || quote_ident(r.conname);
            END LOOP;
        END $$;
    """)

    op.create_foreign_key(
        'fk_contractor_assignments_task_id_cascade',
        source_table='contractor_assignments',
        referent_table='tasks',
        local_cols=['task_id'],
        remote_cols=['id'],
        ondelete='CASCADE',
    )


def downgrade():
    op.drop_constraint(
        'fk_contractor_assignments_task_id_cascade',
        'contractor_assignments',
        type_='foreignkey',
    )
    op.create_foreign_key(
        'fk_contractor_assignments_task_id_set_null',
        source_table='contractor_assignments',
        referent_table='tasks',
        local_cols=['task_id'],
        remote_cols=['id'],
        ondelete='SET NULL',
    )
