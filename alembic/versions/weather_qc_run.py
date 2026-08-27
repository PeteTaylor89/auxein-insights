"""One row per QC invocation, so a clean run is distinguishable from no run.

Revision ID: weather_qc_run
Revises: projection_baseline_kind
Create Date: 2026-08-27

## The gap this closes

`weather_daily_qc` records FINDINGS. A run that checks 3,700 station-days and
finds nothing writes no row at all, so "the checks ran and the network was
clean" and "the checks never ran" are the same observation: silence.

That is not hypothetical. QC has been riding the six-hourly rollup workflow
since 2026-08-25 and only EIGHT run ids exist in the findings table, because the
scheduler fires four times a day and most passes find nothing. There was no way
to tell which of those slots executed.

It is also the exact failure class this platform has now paid for three times:
`ingestion_log` marking a run SUCCESS with 3 of 4 variables fetched, the
incremental clamp that left permanent gaps, and the rollup that was blind to a
newly-seeded source's backfill. In every case the record described what was
FOUND and never what was ATTEMPTED.

## Three things only a run row can say

  * **The abort left no trace at all.** `--max-reject-rate` exists so a broken
    rule cannot take the whole network's surface down with it, and when it
    trips the stage returns non-zero having written NOTHING — no findings, no
    quarantine, no record that a check ran and refused to act. That is the one
    outcome most in need of a record, and it was the one outcome with none.

  * **A check that fired zero times.** `checks` lists every check this build can
    emit. Without it, a check silently removed in a refactor looks identical to
    a check that is passing, forever.

  * **The window, not just the day.** Each pass re-checks a lookback window and
    the rows it writes are keyed by the day judged, not the day run. Coverage —
    "has every day of the last fortnight actually been examined" — is only
    answerable from the runs.

## Opened before the work, closed after

A row is inserted with `status='running'` BEFORE the first day is fetched, and
updated on the way out. A process killed mid-pass therefore leaves a `running`
row, which is itself the evidence it did not finish. This mirrors the immutable
run records the interpolation engines already write.

## Dry runs are deliberately not recorded

`--apply` is the pipeline path; without it the stage writes nothing and changes
nothing, so there is no event to account for. A dry run is a person at a
terminal reading the log, not a scheduled pass whose silence needs explaining.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = 'weather_qc_run'
down_revision = 'projection_baseline_kind'
branch_labels = None
depends_on = None


# 'running'  — opened, not yet closed. A row left here means the pass died.
# 'complete' — every day checked and the findings acted on.
# 'aborted'  — the reject-rate guard tripped; findings computed, nothing acted.
# 'failed'   — raised. `error` carries the exception.
STATUSES = ('running', 'complete', 'aborted', 'failed')


def upgrade():
    op.create_table(
        'weather_qc_run',
        sa.Column('run_id', sa.Text(), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.Text(), nullable=False,
                  server_default='running'),

        # The window JUDGED, which is not the day the pass ran. Findings are
        # keyed by the day they describe, so coverage can only be reconstructed
        # from these two columns.
        sa.Column('window_start', sa.Date(), nullable=False),
        sa.Column('window_end', sa.Date(), nullable=False),

        # Denominator for the reject rate, and the honest measure of how much
        # of the network a pass actually saw. A pass over a window where the
        # rollup had not yet run examines very little and should not look the
        # same as a full one.
        sa.Column('n_station_days', sa.Integer(), nullable=True),

        sa.Column('n_findings', sa.Integer(), nullable=True),
        sa.Column('n_reject', sa.Integer(), nullable=True),
        sa.Column('n_flag', sa.Integer(), nullable=True),

        # What the pass DID, as opposed to what it found. Zero quarantined rows
        # against a positive n_reject means the guard tripped.
        sa.Column('n_quarantined_rows', sa.Integer(), nullable=True),
        sa.Column('n_cleared_rows', sa.Integer(), nullable=True),
        # Late-arriving observations caught by a standing quarantine window.
        # A quarantine is a one-time UPDATE; this is the number that would have
        # silently undone one.
        sa.Column('n_late_enforced', sa.Integer(), nullable=True),

        sa.Column('reject_rate', sa.Float(precision=53), nullable=True),
        sa.Column('max_reject_rate', sa.Float(precision=53), nullable=True),
        sa.Column('reaggregated', sa.Boolean(), nullable=True),

        # Every check this build can emit, and how many times each fired.
        # A check present with a count of zero is passing; a check ABSENT was
        # removed or renamed, and those must not look alike.
        sa.Column('checks', postgresql.JSONB(), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),

        sa.PrimaryKeyConstraint('run_id'),
        sa.CheckConstraint(
            "status IN ('running', 'complete', 'aborted', 'failed')",
            name='ck_weather_qc_run_status'),
    )

    # "what happened lately" — every dashboard query starts here.
    op.create_index('ix_weather_qc_run_started', 'weather_qc_run',
                    [sa.text('started_at DESC')])
    # "was this day ever examined" — the coverage question.
    op.create_index('ix_weather_qc_run_window', 'weather_qc_run',
                    ['window_start', 'window_end'])


def downgrade():
    op.drop_index('ix_weather_qc_run_window', table_name='weather_qc_run')
    op.drop_index('ix_weather_qc_run_started', table_name='weather_qc_run')
    op.drop_table('weather_qc_run')
