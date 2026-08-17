"""Climate zone cell mask — which surface cells a zone's vineyards occupy.

Wine climate zone statistics are block-intersected, not polygon-area-weighted
(D-C in `INSIGHTS_SITE_MAP_2026-08-13.md`). A zone that is 80% mountain and 20%
planted valley must report the valley, so the zone's number comes from the cells
its vineyards actually sit on.

That intersection is expensive and completely static, so it is computed once and
stored here. Every surface published afterwards — a new variable, a re-run, the
projections — samples through this same mask, which is what makes zone figures
comparable across all of them.

## Why `planted_ha` and not a boolean

The average reference block is 4.95 ha; a 500 m cell at -41 degrees is
501 m x 378 m = 18.9 ha. **Blocks are roughly a quarter the size of a cell.** So
a binary mask has no good rule: "cell centre inside a block" discards most blocks
outright, and "any touch" scores a 25 m corner clip the same as a fully planted
cell. Storing planted hectares makes the zone statistic a weighted mean over
planted area, which is both defensible and the literal reading of D-C.

## Why `grid_key`

The mask is row/col indices into one specific raster geometry. If the grid ever
changes — a different resolution, a different origin, a re-projected archive —
these indices silently point at the wrong ground, and every zone statistic stays
plausible while being wrong. `grid_key` fingerprints size + transform so a
consumer can assert the surface it is reading is the grid the mask was built for,
and fail loudly instead.

Revision ID: zone_cell_mask
Revises: surface_cv_units
Create Date: 2026-08-17
"""
from alembic import op
import sqlalchemy as sa

revision = 'zone_cell_mask'
down_revision = 'surface_cv_units'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'climate_zone_cell_mask',
        sa.Column('zone_id', sa.Integer(), nullable=False),
        sa.Column('row', sa.Integer(), nullable=False),
        sa.Column('col', sa.Integer(), nullable=False),
        # Vineyard hectares inside this cell AND inside this zone. Zones nest,
        # so the same cell can appear under a sub-zone and its parent with
        # different values; that is correct and the rows must never be summed
        # across zones.
        sa.Column('planted_ha', sa.Float(), nullable=False),
        sa.Column('block_count', sa.Integer(), nullable=False),
        sa.Column('grid_key', sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(['zone_id'], ['climate_zones.id'],
                                ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('zone_id', 'row', 'col'),
    )
    # The read pattern is "give me every cell for this zone", always.
    op.create_index('ix_zone_cell_mask_zone', 'climate_zone_cell_mask',
                    ['zone_id'])

    op.create_table(
        'climate_zone_mask_run',
        sa.Column('grid_key', sa.Text(), primary_key=True),
        sa.Column('width', sa.Integer(), nullable=False),
        sa.Column('height', sa.Integer(), nullable=False),
        sa.Column('resolution_m', sa.Integer(), nullable=False),
        # The six affine coefficients and the CRS, so the grid can be
        # reconstructed and checked without opening a raster.
        sa.Column('transform', sa.Text(), nullable=False),
        sa.Column('crs', sa.Text(), nullable=False),
        # Which blocks went in. Recorded because "reference blocks only" is a
        # privacy decision (D1), and a later run that quietly included customer
        # geometry must be distinguishable from this one.
        sa.Column('block_filter', sa.Text(), nullable=False),
        sa.Column('block_count', sa.Integer(), nullable=False),
        sa.Column('planted_ha', sa.Float(), nullable=False),
        sa.Column('zone_count', sa.Integer(), nullable=False),
        sa.Column('cell_count', sa.Integer(), nullable=False),
        sa.Column('subcell_factor', sa.Integer(), nullable=False),
        sa.Column('built_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
    )


def downgrade():
    op.drop_table('climate_zone_mask_run')
    op.drop_index('ix_zone_cell_mask_zone', table_name='climate_zone_cell_mask')
    op.drop_table('climate_zone_cell_mask')
