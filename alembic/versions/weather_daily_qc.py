"""Audit table for the daily QC stage.

Revision ID: weather_daily_qc
Revises: surface_projection_run
Create Date: 2026-08-24

## Why the findings are recorded rather than just acted on

Every QC decision on this platform so far has been a one-off script whose
reasoning survives only in a docstring. 384,396 `stuck_rainfall_zero` rows and
97,663 `stuck_sensor` rows are already quarantined, and the rationale for them
lives in prose rather than beside the data. That is fine for a decision taken
once by a person; it is not fine for a check that runs every day and quarantines
automatically.

So each finding is a row: what was tested, what the value was, what the network
or the station's own record said it should be, and whether the pipeline acted.
Three things need that:

  * **Reversibility.** `action='quarantined'` rows name exactly which raw
    observations were flagged, so a bad rule can be undone precisely instead of
    by re-deriving what it might have touched.
  * **Recovery detection.** A quarantined station cannot announce that it is
    working again — its rows never reach the rollup, so it vanishes from the fit
    and stops being reported. A dated series of findings is what makes
    "station 473 stopped failing on 2026-09-14" observable at all.
  * **The rate is the alarm, not the finding.** One neighbour rejection is a
    thunderstorm; the same station every day is a broken sensor. That
    distinction only exists if yesterday's findings were kept.

`detail` is JSONB rather than columns because the checks are not
commensurable — a neighbour test carries distances and a robust z, a flatline
test carries a repeat count — and adding a check should not need a migration.
"""
from alembic import op
import sqlalchemy as sa


revision = 'weather_daily_qc'
down_revision = 'surface_projection_run'
branch_labels = None
depends_on = None


# 'reject' means the pipeline acted on it; 'flag' means it was recorded for a
# human and the value was left in place. Deliberately only two — a severity
# scale nobody can define the middle of gets used inconsistently.
SEVERITIES = ('reject', 'flag')
ACTIONS = ('quarantined', 'cleared', 'none')


def upgrade():
    op.create_table(
        'weather_daily_qc',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('station_id', sa.Integer(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        # 'temp_min' / 'temp_max' / 'temp_mean' / 'rainfall' — the DAILY column
        # judged, not the raw variable, because that is what a consumer reads.
        sa.Column('variable', sa.Text(), nullable=False),
        sa.Column('check_name', sa.Text(), nullable=False),
        sa.Column('severity', sa.Text(), nullable=False),
        sa.Column('value', sa.Float(precision=53), nullable=True),
        sa.Column('expected', sa.Float(precision=53), nullable=True),
        sa.Column('detail', sa.dialects.postgresql.JSONB(), nullable=True),
        sa.Column('action', sa.Text(), nullable=False, server_default='none'),
        sa.Column('run_id', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),

        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint(
            "severity IN ('reject', 'flag')",
            name='ck_weather_daily_qc_severity'),
        sa.CheckConstraint(
            "action IN ('quarantined', 'cleared', 'none')",
            name='ck_weather_daily_qc_action'),
    )

    # One row per (station, day, variable, check). Re-running QC over a window
    # must converge rather than accumulate duplicates — the daily job re-checks
    # the same days every time the weekly re-fit window overlaps.
    op.create_index(
        'uq_weather_daily_qc', 'weather_daily_qc',
        ['station_id', 'date', 'variable', 'check_name'], unique=True)
    # "what is failing lately, and how often" — the query the alarm is built on.
    op.create_index(
        'ix_weather_daily_qc_recent', 'weather_daily_qc',
        ['date', 'check_name'])
    op.create_index(
        'ix_weather_daily_qc_station', 'weather_daily_qc',
        ['station_id', 'date'])


def downgrade():
    op.drop_index('ix_weather_daily_qc_station', table_name='weather_daily_qc')
    op.drop_index('ix_weather_daily_qc_recent', table_name='weather_daily_qc')
    op.drop_index('uq_weather_daily_qc', table_name='weather_daily_qc')
    op.drop_table('weather_daily_qc')
