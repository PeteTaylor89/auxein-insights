"""Add base-10 GDD columns to climate_zone_daily, beside the base-0 pair.

`gdd_daily` / `gdd_cumulative` are BASE ZERO and stay that way. Phenology is
calibrated against them, and `phenology_service`, the region and site
dashboards, and `realtime_climate.adjust_gdd_to_sep1` all document and depend on
that. They are not a mistake to be corrected — they are one of two answers.

The other is the presentation metric a grower reads: growing degree days above
10 degC. Until now every consumer that wanted it recomputed
`sum(max(0, temp_mean - 10))` from the ZONE MEAN, and that under-counts. GDD is
convex, so the mean of the per-cell GDD is not the GDD of the mean cell, and the
gap is a systematic under-count at cool sites rather than noise. It is the same
error the season surfaces are careful to avoid.

`aggregate_zone_daily_surface.py` evaluates the base at every one of the zone's
planted cells and then weights, so the value stored here is the one the
recompute could not produce. That is the reason to store it rather than derive
it a fourth time.

Nullable, because a day whose zone row came from the station rollup has no
per-cell answer and must not pretend to.

Revision ID: zone_gdd10_columns
Revises: asset_operating_rate
Create Date: 2026-08-30
"""
from alembic import op
import sqlalchemy as sa

revision = 'zone_gdd10_columns'
down_revision = 'asset_operating_rate'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('climate_zone_daily',
                  sa.Column('gdd10_daily', sa.Numeric(), nullable=True))
    op.add_column('climate_zone_daily',
                  sa.Column('gdd10_cumulative', sa.Numeric(), nullable=True))


def downgrade():
    op.drop_column('climate_zone_daily', 'gdd10_cumulative')
    op.drop_column('climate_zone_daily', 'gdd10_daily')
