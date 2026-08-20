"""Clip the wine zone polygons to the coast, and give them a label anchor.

The zone boundaries are administrative and regional-council derived: several run
out over the sea, so on the Atlas a region reads as including open water. That
is a cartographic defect only — every zone STATISTIC comes from
`climate_zone_cell_mask`, which is built from the vineyard register and never
saw the polygon — so clipping changes what is drawn and nothing that is
measured.

Two columns rather than an edit in place:

* `climate_zones.geometry` stays the authority. It is what
  `insights_site_service.resolve_zone` matches a Pro site against, and a point
  on a coastal cell whose centre the 500 m surface treats as water must still
  resolve to its region. Clipping the authoritative geometry would make that
  point regionless.
* `geometry_clipped` is derived, disposable and rebuildable from `nz_land` by
  re-running `backend/scripts/fetch_nz_coastline.py`. `/zones` COALESCEs to
  `geometry` so a zone that has never been clipped still draws.

`nz_land` holds LINZ *NZ Coastlines and Islands Polygons (Topo 1:50k)*, layer
51153, fetched per zone envelope rather than nationally — the national layer is
every rock in the EEZ and we need the strip under 23 wine regions. Licensed
CC BY 4.0; the Atlas carries the attribution.

Revision ID: zone_coastal_clip
Revises: surface_season_granularity
Create Date: 2026-08-19
"""
from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry

revision = 'zone_coastal_clip'
down_revision = 'surface_season_granularity'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'nz_land',
        sa.Column('id', sa.Integer, primary_key=True),
        # The WFS feature id, e.g. 'layer-51153.481873'. Unique so a re-fetch
        # of an overlapping envelope converges instead of stacking duplicate
        # islands, which would slow every ST_Intersection for no gain.
        sa.Column('feature_id', sa.String(64), nullable=False, unique=True),
        sa.Column('source', sa.String(64), nullable=False,
                  server_default='linz-51153'),
        sa.Column('name', sa.String(255)),
        # MULTIPOLYGON because the source emits both, and one column that
        # sometimes holds POLYGON and sometimes MULTIPOLYGON cannot be typed.
        sa.Column('geom', Geometry('MULTIPOLYGON', srid=4326), nullable=False),
        sa.Column('fetched_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
    )
    # geoalchemy2 creates the GiST index on `geom` itself — adding one here
    # would be the duplicate that `drop_dup_geom_index` already had to remove
    # once.

    op.add_column('climate_zones',
                  sa.Column('geometry_clipped',
                            Geometry('MULTIPOLYGON', srid=4326),
                            nullable=True))


def downgrade():
    op.drop_column('climate_zones', 'geometry_clipped')
    op.drop_table('nz_land')
