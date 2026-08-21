"""Pro sites — the site's own daily record, for a season in progress.

## Why a new table rather than a finer `insights_site_monthly`

`insights_site_monthly` is keyed (site, variable, statistic, year, month) and a
month there is an AGGREGATE: a mean, a sum, a count of days over a threshold. A
daily surface is none of those. It is the value itself, which is why
`surface_run.statistic` is NULL for daily and hourly rasters and non-NULL for
monthly ones (see `surface_index_tables`). Bending a statistic-keyed table
around rows that have no statistic would mean inventing one — `statistic='value'`
— and every query that groups by statistic would then have a special case in it.

So: one row per site per day, four real columns. The shape matches what the
surface actually produces.

## The re-fit is the reason this table exists in this shape

The live surface engine re-fits D-9 through D-3 every week, because
`daily_aggregation.py` keeps revising `weather_data_daily` for about three days
after the fact (`docs/plans/LIVE_SURFACE_ENGINE_2026-08-20.md` §2). **Values
already written here WILL change.** Two consequences are designed in:

* The primary key is (site_id, date) so an extraction is an UPSERT, never an
  insert. A second extraction of the same day corrects it instead of failing or
  duplicating.
* `model_version` is stored per row. The live era is `tps-2.0.0-ridge-db`
  against the archive's `tps-2.0.0-ridge`, and the two carry a measured
  provenance offset — tmean -0.27 °C, tmin +0.29, tmax -0.43. A season assembled
  from rows of mixed provenance without knowing it would be reporting that
  offset as weather. Storing the version makes the era of every day provable
  after the fact rather than inferred from its date.

## NULL is a missing day, never a zero

Same trap as `insights_site_monthly.value` and the B4.1 rainfall bug: a day the
surface has no value for is NULL. A zero-rainfall day and an absent day are
different facts, and a season total that silently treats the second as the first
under-reports rain for the rest of the season.

`extracted_at` is when the row was READ, not when the weather happened. It is
how a stale site is found after a re-fit.
"""
from alembic import op
import sqlalchemy as sa


revision = 'insights_site_daily'
down_revision = 'zone_order_global'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'insights_site_daily',
        sa.Column('site_id', sa.BigInteger(),
                  sa.ForeignKey('insights_site.id', ondelete='CASCADE'),
                  primary_key=True, nullable=False),
        sa.Column('date', sa.Date(), primary_key=True, nullable=False),

        # The four daily surfaces. NULL is a hole, never a zero.
        sa.Column('temp_min', sa.Float(), nullable=True),
        sa.Column('temp_max', sa.Float(), nullable=True),
        sa.Column('temp_mean', sa.Float(), nullable=True),
        sa.Column('rainfall_mm', sa.Float(), nullable=True),

        sa.Column('model_version', sa.Text(), nullable=True),
        sa.Column('extracted_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
    )

    # The season query is always "this site, this date range", so the primary
    # key already leads with the right column. This second index serves the
    # other direction: "which sites are stale for day D", which is what a
    # re-fit sweep asks.
    op.create_index('ix_insights_site_daily_date', 'insights_site_daily',
                    ['date'])


def downgrade():
    op.drop_index('ix_insights_site_daily_date',
                  table_name='insights_site_daily')
    op.drop_table('insights_site_daily')
