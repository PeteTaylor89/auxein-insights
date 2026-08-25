"""Per-zone projections, sampled from the MfE projection surfaces.

Revision ID: zone_projection_table
Revises: merge_qc_and_map
Create Date: 2026-08-24

`docs/plans/INSIGHTS_REFINEMENTS_2026-08-24b.md` §7.

## Why not just use `climate_projections`

That table is the ZONE-level product produced off the old engine: 3 scenarios x
3 periods x 12 months per zone, with no seasonal arm and no per-cell basis. The
new `surface_projection_run` surfaces are 500 m fields composed onto our own
1986-2005 normals, so a region can now be sampled through its **planted-cell
mask** exactly the way its history is — same mask, same weighting, same
estimator. A region and a site inside it will finally be projected off the same
thing.

`climate_projections` stays until this path is proven in the UI.

## Grain

One row per (zone, scenario, period, season, variable, statistic). All three
scenarios, all six periods — the three calendar ones and the three warming
levels — and every season including `SEPAPR`, which is the growing season and
the only one the product should lead with.

Warming levels are stored even though nothing displays them: they are already
published, they cost nothing here, and they would cost a full re-run later.

## `baseline_mean` is OURS

The projected surfaces were built as `our_normal + MfE_change`, so the delta is
recovered by subtracting **this zone's own 1986-2005 normal** out of the
archive. `surface_projection_run.baseline_median` is a NATIONAL median and is
the wrong baseline for any individual region — nothing reads it.

`delta_mean` is stored rather than computed on read so that the arithmetic
happens once, next to the aggregation that knows which baseline window applies.
It is NULL for any band with no archive equivalent, which is honest and lets the
row exist anyway.
"""
from alembic import op
import sqlalchemy as sa


revision = 'zone_projection_table'
down_revision = 'merge_qc_and_map'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'climate_zone_projection',
        sa.Column('id', sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column('zone_id', sa.Integer(),
                  sa.ForeignKey('climate_zones.id', ondelete='CASCADE'),
                  nullable=False),

        sa.Column('scenario', sa.Text(), nullable=False),   # ssp126|ssp245|ssp370
        sa.Column('period', sa.Text(), nullable=False),     # fp*|wl*
        sa.Column('season', sa.Text(), nullable=False),     # ANN|DJF|MAM|JJA|SON|SEPAPR
        sa.Column('variable', sa.Text(), nullable=False),
        sa.Column('statistic', sa.Text(), nullable=False),

        # Ours, from the archive. NULL when the band has no archive equivalent.
        sa.Column('baseline_mean', sa.Float(), nullable=True),
        sa.Column('projected_mean', sa.Float(), nullable=False),
        sa.Column('delta_mean', sa.Float(), nullable=True),

        # Spread over the zone's planted cells, weighted by planted hectares —
        # the same estimator the historical roll-up uses, so the two are
        # comparable rather than merely similar.
        sa.Column('p10', sa.Float(), nullable=True),
        sa.Column('p90', sa.Float(), nullable=True),

        sa.Column('n_cells', sa.Integer(), nullable=True),
        sa.Column('planted_ha', sa.Float(), nullable=True),

        sa.Column('unit', sa.Text(), nullable=True),
        sa.Column('model_version', sa.Text(), nullable=True),
        # additive | multiplicative | season_resolved — how MfE's change field
        # was composed onto our normal. Carried so a reader can tell what kind
        # of claim the number is.
        sa.Column('rule', sa.Text(), nullable=True),
        sa.Column('grid_key', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('NOW()')),
    )

    op.create_unique_constraint(
        'uq_zone_projection',
        'climate_zone_projection',
        ['zone_id', 'scenario', 'period', 'season', 'variable', 'statistic'])

    # The read path: "this region, this scenario and period, every band".
    op.create_index('ix_zone_projection_lookup', 'climate_zone_projection',
                    ['zone_id', 'scenario', 'period', 'season'])


def downgrade():
    op.drop_index('ix_zone_projection_lookup',
                  table_name='climate_zone_projection')
    op.drop_constraint('uq_zone_projection', 'climate_zone_projection',
                       type_='unique')
    op.drop_table('climate_zone_projection')
