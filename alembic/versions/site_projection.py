"""Per-site climate projections: the same surfaces the zone table samples, at one cell.

`climate_zone_projection` answers "what does Martinborough look like under
ssp245 by 2050". A Pro customer bought a POINT, and the whole pitch of the paid
tier is that it answers that question at their site rather than at their region.
This is the point-level twin, keyed on `insights_site.id`.

## The delta is against OUR baseline, sampled at the SAME cell

`delta = projected - baseline`, where baseline is the 1986-2005 normal at this
site's own cell. That is not a preference, it is arithmetic: the projection
surfaces were composed as `our_normal + MfE_change`, so subtracting our normal
is what recovers the change MfE actually published. Subtract anything else and
the composition is double-counted.

Where the ZONE job gets its baseline from `climate_zone_monthly` aggregated over
1986-2005, this samples the 36 `kind='baseline'` rasters that
`surface_projection_run` has carried since 2026-08-25. Same provenance, same
grid, and at a point it is exact rather than an area mean.

`surface_projection_run.baseline_median` is NOT used, here or in the zone job.
It is a NATIONAL median, and a national median is the wrong baseline for Central
Otago.

## Why the baseline is stored per row and not joined at read time

The delta is the number a customer reads, and it is meaningless without the
baseline it was taken from. Storing both means a row is self-describing and a
later re-composition of the surfaces cannot silently change the delta of a row
that was never re-sampled. It costs one float per row.

## No p10/p90, unlike the zone table

Those columns are the spread ACROSS the cells of a zone. A site is one cell, so
the honest value is absent, not zero and not a repeat of the mean. Model spread
would be a genuinely useful number here and is a different thing entirely —
`delta_p5` and `delta_p95` exist on `surface_projection_run` as national
figures, and pinning them to a point needs the per-model rasters we do not hold.

## Warming levels are included

`wl1.5`, `wl2` and `wl3` sit alongside the `fp*` periods. Nothing renders them
yet, exactly as at zone level — they cost nothing now and a re-run later.
"""
from alembic import op
import sqlalchemy as sa

revision = 'site_projection'
down_revision = 'site_hourly_disease'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'insights_site_projection',
        sa.Column('id', sa.BigInteger(), primary_key=True),
        sa.Column('site_id', sa.BigInteger(),
                  sa.ForeignKey('insights_site.id', ondelete='CASCADE'),
                  nullable=False),

        # The scenario/period pair as `surface_projection_run` keys them. Kept
        # as text rather than an enum for the reason the zone table did: MfE
        # publishes new periods and a migration to add one to an enum is a
        # table rewrite on a table nothing gains from being strict about.
        sa.Column('scenario', sa.Text(), nullable=False),
        sa.Column('period', sa.Text(), nullable=False),
        # SEPAPR is the growing season and the one the product shows. ANN and
        # the four meteorological seasons are stored because they are already
        # published; the client picks.
        sa.Column('season', sa.Text(), nullable=False),
        sa.Column('variable', sa.Text(), nullable=False),
        sa.Column('statistic', sa.Text(), nullable=False),

        # NULL where the cell is off the land mask on that raster. Never 0 —
        # a projected rainfall of zero and no value at this cell are different
        # facts, and the whole site product depends on that distinction.
        sa.Column('baseline_value', sa.Float(), nullable=True),
        sa.Column('projected_value', sa.Float(), nullable=True),
        # NULL when either side is NULL. A delta computed against a missing
        # baseline would be the projected absolute wearing a change's label.
        sa.Column('delta', sa.Float(), nullable=True),

        sa.Column('unit', sa.Text(), nullable=True),
        sa.Column('model_version', sa.Text(), nullable=True),
        sa.Column('rule', sa.Text(), nullable=True),
        # The cell this was read at, carried so a row can be checked against
        # the site's current placement. A site can be MOVED; a row sampled
        # before the move describes the old cell and must not be shown as if
        # it described the new one.
        sa.Column('grid_key', sa.Text(), nullable=True),
        sa.Column('extracted_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
    )

    # UPSERT key. Re-running the populate must correct a row rather than add a
    # second one: the surfaces are re-composed occasionally and a duplicate
    # would leave two different answers to the same question with nothing to
    # say which is current.
    op.create_unique_constraint(
        'uq_site_projection_cell', 'insights_site_projection',
        ['site_id', 'scenario', 'period', 'season', 'variable', 'statistic'])

    # The read path is always "everything for this site", then filtered in the
    # client across scenarios for one variable. 612 rows a site is small enough
    # that one index on site_id carries every query the page makes.
    op.create_index('ix_site_projection_site', 'insights_site_projection',
                    ['site_id'])


def downgrade():
    op.drop_index('ix_site_projection_site',
                  table_name='insights_site_projection')
    op.drop_constraint('uq_site_projection_cell', 'insights_site_projection',
                       type_='unique')
    op.drop_table('insights_site_projection')
