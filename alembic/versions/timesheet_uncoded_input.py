"""Make the timesheet day total derived, and uncoded hours the input.

No DDL — the columns already exist. What changes is which of them a person
writes and which the system computes.

Before: `day_hours` was typed by the user and `uncoded_hours` was the leftover,
`day_hours - entry_hours`. That inverted the order a day actually happens in.
Hours arrive by completing tasks, through the day, AFTER any total was declared,
so every completion was checked against a number typed hours earlier and
`recalc_hours` raised "Task allocations cannot exceed day total" the moment the
day ran longer than planned.

That raise landed mid-write: `create_entry` flushed the TimeEntry before
recalculating, and `complete_task` catches and logs the exception, so the entry
committed while `uncoded_hours` and `effective_total_hours` kept their old
values. The visible result was a day listing six hours of task entries under a
two-hour total.

After: `uncoded_hours` is the only figure entered, and
`effective_total_hours = entry_hours + uncoded_hours`, with `day_hours` kept as
a stored mirror so reports and submitted history need no changes.

This migration only re-derives the stored aggregates so the invariant holds on
rows written under the old rule. `uncoded_hours` is already the right number on
a consistent row, so it is preserved as the user's intent; where the two
disagreed the coded hours win, because those have entries behind them and a
declared total has nothing.

Revision ID: timesheet_uncoded_input
Revises: add_map_feature_types
Create Date: 2026-08-19
"""
from alembic import op
import sqlalchemy as sa


revision = 'timesheet_uncoded_input'
down_revision = 'add_map_feature_types'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    # entry_hours is the sum of the entries. Recompute it rather than trusting
    # it: the failure above could leave it stale, and it is the one figure with
    # rows behind it.
    conn.execute(sa.text("""
        UPDATE timesheet_days d
           SET entry_hours = COALESCE((
                   SELECT ROUND(SUM(e.hours)::numeric, 2)
                     FROM time_entries e
                    WHERE e.timesheet_day_id = d.id
               ), 0.00)
    """))

    # Uncoded stays as the user's own figure, floored at zero. A NULL day_hours
    # meant "no total declared", which under the new rule is simply no uncoded
    # time.
    conn.execute(sa.text("""
        UPDATE timesheet_days
           SET uncoded_hours = GREATEST(COALESCE(uncoded_hours, 0.00), 0.00)
    """))

    # The total is now derived, and day_hours mirrors it.
    conn.execute(sa.text("""
        UPDATE timesheet_days
           SET effective_total_hours = LEAST(entry_hours + uncoded_hours, 24.00),
               day_hours             = LEAST(entry_hours + uncoded_hours, 24.00)
    """))


def downgrade():
    # The old rule read the same columns, just in the other direction, so
    # restoring it means recomputing uncoded as the leftover of the total.
    conn = op.get_bind()
    conn.execute(sa.text("""
        UPDATE timesheet_days
           SET uncoded_hours = GREATEST(COALESCE(day_hours, entry_hours) - entry_hours, 0.00),
               effective_total_hours = COALESCE(day_hours, entry_hours)
    """))
