"""Admit `season` as a surface granularity.

The GDD surfaces (`gdd10`, `gdd0`) are growing-season accumulations, Sep-Apr,
labelled by vintage. `surface_run` was written when the archive held only
instants (daily/hourly/monthly) and one all-time reduction (records), and three
CHECK constraints encode that vocabulary. All three refuse a season row, and
they refuse it at INSERT — which is exactly what they are for, and is how this
turned up rather than a table quietly accepting rows nothing could interpret.

1. `ck_surface_run_granularity` simply did not list it.

2. `ck_surface_run_statistic_by_granularity` splits granularities into those
   keyed by statistic and those not. Season IS keyed by statistic — `cumulative`
   for the running accumulation and `sum` for the season total — so it joins the
   monthly/records side.

3. `ck_surface_run_period_start` said `period_start IS NOT NULL` **iff**
   granularity is `records`. That was really asserting "a row covers a PERIOD
   rather than an instant", with `records` the only period there was. A season
   is the second one: it runs from a stated September to the following April,
   and without both bounds "the 2020 season" silently changes meaning if the
   season definition is ever revised. So the rule generalises rather than gaining
   an exception — period_start is set exactly for the granularities that span a
   period.

Revision ID: surface_season_granularity
Revises: insights_pro_sites
Create Date: 2026-08-18
"""
from alembic import op

revision = 'surface_season_granularity'
down_revision = 'insights_pro_sites'
branch_labels = None
depends_on = None

PERIOD_GRANULARITIES = "('records', 'season')"


def upgrade():
    op.drop_constraint('ck_surface_run_granularity', 'surface_run',
                       type_='check')
    op.create_check_constraint(
        'ck_surface_run_granularity', 'surface_run',
        "granularity IN ('daily', 'hourly', 'monthly', 'records', 'season')")

    op.drop_constraint('ck_surface_run_statistic_by_granularity', 'surface_run',
                       type_='check')
    op.create_check_constraint(
        'ck_surface_run_statistic_by_granularity', 'surface_run',
        "(granularity IN ('daily', 'hourly') AND statistic IS NULL) OR "
        "(granularity IN ('monthly', 'records', 'season') "
        "AND statistic IS NOT NULL)")

    op.drop_constraint('ck_surface_run_period_start', 'surface_run',
                       type_='check')
    op.create_check_constraint(
        'ck_surface_run_period_start', 'surface_run',
        f"(granularity IN {PERIOD_GRANULARITIES}) = (period_start IS NOT NULL)")


def downgrade():
    # Season rows cannot satisfy the narrower constraints, so they go first.
    # Silently leaving them would make the downgrade fail on a table that looks
    # fine until the constraint is re-added.
    op.execute("DELETE FROM surface_run WHERE granularity = 'season'")

    op.drop_constraint('ck_surface_run_period_start', 'surface_run',
                       type_='check')
    op.create_check_constraint(
        'ck_surface_run_period_start', 'surface_run',
        "(granularity = 'records') = (period_start IS NOT NULL)")

    op.drop_constraint('ck_surface_run_statistic_by_granularity', 'surface_run',
                       type_='check')
    op.create_check_constraint(
        'ck_surface_run_statistic_by_granularity', 'surface_run',
        "(granularity IN ('daily', 'hourly') AND statistic IS NULL) OR "
        "(granularity IN ('monthly', 'records') AND statistic IS NOT NULL)")

    op.drop_constraint('ck_surface_run_granularity', 'surface_run',
                       type_='check')
    op.create_check_constraint(
        'ck_surface_run_granularity', 'surface_run',
        "granularity IN ('daily', 'hourly', 'monthly', 'records')")
