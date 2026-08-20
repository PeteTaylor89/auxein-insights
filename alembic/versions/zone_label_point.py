"""Store where a zone's name should be drawn.

Labelling a multi-part zone by its largest polygon looked right until Auckland
was measured: its biggest land part is 51.9 km2 out in the gulf and the Kumeu
side is 49.0 km2, so a 6% margin put the word "Auckland" on the wrong island.
Area is the wrong tiebreak for a wine region — the name belongs where the vines
are.

The anchor is therefore the part carrying the most REFERENCE vineyard area
(`vineyard_blocks WHERE company_id IS NULL`, the same national register the zone
cell mask is built from, so no customer geometry is involved), falling back to
the largest part for a zone with no registered blocks. That is several
intersections per part and Marlborough has 238 of them, so it is computed once
by `fetch_nz_coastline.py` rather than on every Atlas load.

NULL means never computed; `/zones` falls back to a point on the largest part.

Revision ID: zone_label_point
Revises: zone_coastal_clip
Create Date: 2026-08-19
"""
from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry

revision = 'zone_label_point'
down_revision = 'zone_coastal_clip'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('climate_zones',
                  sa.Column('label_point', Geometry('POINT', srid=4326),
                            nullable=True))


def downgrade():
    op.drop_column('climate_zones', 'label_point')
