"""Per-zone monthly statistics sampled through the vineyard cell mask.

One row per (zone, variable, statistic, month): the surface aggregated over the
cells that zone's vineyards actually occupy, weighted by planted hectares.

## Why this is a table and not a query

The archive is fixed — 1986-2023, republished only under a new `model_version` —
so these numbers can never change without a deliberate re-run. Sampling COGs from
S3 on each request would put seconds of range reads behind a map click to
recompute a constant. 23 zones x 456 months x ~12 bands is ~126 k rows, which
answers instantly and can be indexed.

## The `statistic` column carries DERIVED bands, not just published ones

`gdd10` is stored here even though no COG contains it. Growing degree days are
**convex in the mean temperature**, so computing them from a zone's mean
temperature is not the same as averaging the per-cell GDD, and the difference is
systematic rather than noise. GDD therefore has to be evaluated per cell — from
that cell's monthly `mean` and `sd` — and only then aggregated. Doing that here,
once, is what lets the seasonal roll-up be a plain sum.

## Aggregates, and what they mean

`mean` is weighted by `planted_ha`: the value at the average planted hectare, not
the average cell. `min`/`max`/`p10`/`p90` describe the spread ACROSS CELLS
containing vineyard — the coolest and warmest planted parts of the zone. They are
not cell extremes over the whole zone polygon, which for a region like
Marlborough would be a mountain nobody plants.

`n_cells` and `planted_ha` travel with every row because a zone with 24 cells
does not earn the same confidence language as one with 3,440.

Revision ID: zone_surface_monthly
Revises: drop_dup_geom_index
Create Date: 2026-08-17
"""
from alembic import op
import sqlalchemy as sa

revision = 'zone_surface_monthly'
# Chained onto the live tip, not onto zone_cell_mask. A parallel Grow session is
# adding migrations to this same repo and database on the same day; branching off
# an older revision gives alembic two heads and makes `upgrade head` fail for
# both of us.
down_revision = 'drop_dup_geom_index'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'climate_zone_surface_monthly',
        sa.Column('id', sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column('zone_id', sa.Integer(), nullable=False),
        sa.Column('variable', sa.Text(), nullable=False),
        sa.Column('statistic', sa.Text(), nullable=False),
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('month', sa.Integer(), nullable=False),
        sa.Column('mean', sa.Float(), nullable=True),
        sa.Column('min', sa.Float(), nullable=True),
        sa.Column('max', sa.Float(), nullable=True),
        sa.Column('p10', sa.Float(), nullable=True),
        sa.Column('p90', sa.Float(), nullable=True),
        sa.Column('n_cells', sa.Integer(), nullable=False),
        sa.Column('planted_ha', sa.Float(), nullable=False),
        # Which grid the mask was built against. A surface re-run on a different
        # grid must not be silently mixed with these rows.
        sa.Column('grid_key', sa.Text(), nullable=False),
        sa.Column('model_version', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['zone_id'], ['climate_zones.id'],
                                ondelete='CASCADE'),
        sa.UniqueConstraint('zone_id', 'variable', 'statistic', 'year', 'month',
                            name='uq_zone_surface_monthly'),
    )
    # The read pattern is a season or a run of years for one zone and one band.
    op.create_index('ix_zone_surface_monthly_series',
                    'climate_zone_surface_monthly',
                    ['zone_id', 'variable', 'statistic', 'year', 'month'])


def downgrade():
    op.drop_index('ix_zone_surface_monthly_series',
                  table_name='climate_zone_surface_monthly')
    op.drop_table('climate_zone_surface_monthly')
