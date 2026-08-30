"""Add both GDD bases to insights_site_daily.

Mirrors `climate_zone_daily`: base 0 feeds phenology, base 10 is the metric a
grower reads. A Pro site is compared against its region on every panel, and that
comparison is only honest if both sides use the same base on the same dates.

## At a point there is no convexity problem, and that is the whole difference

The zone value has to subtract the base at every planted cell and weight
afterwards, because GDD is convex and the mean of per-cell GDD is not the GDD of
the mean cell. **A site is one cell.** There is no spatial aggregation left to
commute with, so `max(0, temp_mean - base)` on the extracted value is exact
rather than an approximation. Same reason the season surfaces need a normal
integral over a month and a daily surface does not.

Cumulatives accumulate from **1 September**, not from the 1 July vintage
boundary, matching the zone table.

Revision ID: site_gdd_columns
Revises: zone_gdd10_columns
Create Date: 2026-08-30
"""
from alembic import op
import sqlalchemy as sa

revision = 'site_gdd_columns'
down_revision = 'zone_gdd10_columns'
branch_labels = None
depends_on = None

COLUMNS = ('gdd_daily', 'gdd_cumulative', 'gdd10_daily', 'gdd10_cumulative')


def upgrade():
    for name in COLUMNS:
        op.add_column('insights_site_daily',
                      sa.Column(name, sa.Float(), nullable=True))


def downgrade():
    for name in reversed(COLUMNS):
        op.drop_column('insights_site_daily', name)
