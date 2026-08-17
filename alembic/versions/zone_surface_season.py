"""Growing-season statistics per climate zone, sampled through the vineyard mask.

Season is **Sep-Apr**, labelled by the ENDING year, matching the `vintage_year`
convention already used by `climate_zone_season_stats`. The archive covers
1986-01..2023-12, so there are 37 complete seasons, vintages 1987..2023.

## Narrow, not wide

One row per (zone, vintage, metric) rather than a column per metric, matching
`climate_zone_surface_monthly`. A new metric is then a new row and not a
migration, and one aggregation path serves every metric. The API pivots.

Each row carries the spread across planted cells — `mean` weighted by planted
hectares, plus `min`/`max`/`p10`/`p90` — because the honest headline for a zone
is the mean *and* the range across real vineyards in it, not a single number.

## `baseline` exists because one metric depends on a period we have not agreed

`r99p` is rainfall from days above the 99th percentile of baseline wet-day
rainfall, so its value depends on which baseline is chosen — and the frontend
currently uses 1986-2005 while `SeasonExtremesBaseline` says 1987-2006. Rather
than block the whole roll-up on that, the baseline is a parameter and the row
records which one produced it. Re-running under the other baseline is then a
visible change rather than a silent one. It is NULL for every metric that does
not depend on a baseline.

Revision ID: zone_surface_season
Revises: zone_surface_monthly
Create Date: 2026-08-17
"""
from alembic import op
import sqlalchemy as sa

revision = 'zone_surface_season'
down_revision = 'zone_surface_monthly'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'climate_zone_surface_season',
        sa.Column('id', sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column('zone_id', sa.Integer(), nullable=False),
        sa.Column('vintage_year', sa.Integer(), nullable=False),
        sa.Column('metric', sa.Text(), nullable=False),
        sa.Column('mean', sa.Float(), nullable=True),
        sa.Column('min', sa.Float(), nullable=True),
        sa.Column('max', sa.Float(), nullable=True),
        sa.Column('p10', sa.Float(), nullable=True),
        sa.Column('p90', sa.Float(), nullable=True),
        sa.Column('unit', sa.Text(), nullable=False),
        # Share of planted cells the metric actually applies to. A zone where
        # only 30% of cells saw a spring frost must not report its mean last
        # frost date as if it were universal.
        sa.Column('coverage', sa.Float(), nullable=True),
        sa.Column('n_cells', sa.Integer(), nullable=False),
        sa.Column('planted_ha', sa.Float(), nullable=False),
        sa.Column('baseline', sa.Text(), nullable=True),
        sa.Column('grid_key', sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(['zone_id'], ['climate_zones.id'],
                                ondelete='CASCADE'),
        sa.UniqueConstraint('zone_id', 'vintage_year', 'metric',
                            name='uq_zone_surface_season'),
    )
    op.create_index('ix_zone_surface_season_series',
                    'climate_zone_surface_season',
                    ['zone_id', 'metric', 'vintage_year'])


def downgrade():
    op.drop_index('ix_zone_surface_season_series',
                  table_name='climate_zone_surface_season')
    op.drop_table('climate_zone_surface_season')
