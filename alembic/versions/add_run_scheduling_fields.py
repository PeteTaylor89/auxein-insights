"""Add scheduling fields directly to observation_runs.

Observations are being collapsed from a two-layer (Plan + Run) model to a
single Run-as-the-work-unit model. To preserve the lifecycle (Scheduled →
In Progress → Complete) we add the scheduling fields the Plan layer used to
hold directly onto the Run.

After this batch ships and is field-tested, the Plan tables become legacy
and can be dropped in a separate migration (along with their endpoints,
schemas, and UI). For now they stay, untouched, so direct-URL access still
works for any historic Plan a user bookmarked.

The backfill copies plan-side context onto runs that already linked to a
plan: due_start_at::date → scheduled_date, first assignee's user_id →
assigned_to_user_id, plan.instructions → instructions. Standalone runs
(plan_id IS NULL — ad-hoc Quick Obs) get NULLs.

Revision ID: add_run_scheduling_fields
Revises: add_movement_property_fk
Create Date: 2026-05-29
"""
from alembic import op
import sqlalchemy as sa


revision = 'add_run_scheduling_fields'
down_revision = 'add_movement_property_fk'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'observation_runs',
        sa.Column('scheduled_date', sa.Date(), nullable=True),
    )
    op.add_column(
        'observation_runs',
        sa.Column('assigned_to_user_id', sa.Integer(), nullable=True),
    )
    op.add_column(
        'observation_runs',
        sa.Column('instructions', sa.Text(), nullable=True),
    )
    op.create_foreign_key(
        'fk_observation_runs_assigned_to_user_id',
        source_table='observation_runs',
        referent_table='users',
        local_cols=['assigned_to_user_id'],
        remote_cols=['id'],
        ondelete='SET NULL',
    )
    op.create_index(
        'ix_observation_runs_assigned_to_user_id',
        'observation_runs',
        ['assigned_to_user_id'],
    )
    op.create_index(
        'ix_observation_runs_scheduled_date',
        'observation_runs',
        ['scheduled_date'],
    )

    # Backfill from observation_plans for runs that have a plan_id set.
    # scheduled_date — cast due_start_at (timestamptz) down to a date.
    # instructions — straight copy.
    # assigned_to_user_id — pick any one assignee from the plan; this is a
    # one-shot bridge for historic data, not a precise migration of intent.
    op.execute("""
        UPDATE observation_runs r
        SET
            scheduled_date = COALESCE(r.scheduled_date, (p.due_start_at AT TIME ZONE 'UTC')::date),
            instructions   = COALESCE(r.instructions, p.instructions)
        FROM observation_plans p
        WHERE r.plan_id = p.id
    """)
    op.execute("""
        UPDATE observation_runs r
        SET assigned_to_user_id = a.user_id
        FROM (
            SELECT DISTINCT ON (plan_id) plan_id, user_id
            FROM observation_plan_assignees
            ORDER BY plan_id, id
        ) a
        WHERE r.plan_id = a.plan_id
          AND r.assigned_to_user_id IS NULL
    """)


def downgrade():
    op.drop_index('ix_observation_runs_scheduled_date', table_name='observation_runs')
    op.drop_index('ix_observation_runs_assigned_to_user_id', table_name='observation_runs')
    op.drop_constraint(
        'fk_observation_runs_assigned_to_user_id',
        'observation_runs',
        type_='foreignkey',
    )
    op.drop_column('observation_runs', 'instructions')
    op.drop_column('observation_runs', 'assigned_to_user_id')
    op.drop_column('observation_runs', 'scheduled_date')
