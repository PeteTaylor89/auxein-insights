"""Make zone display_order sort correctly WITHOUT the region join too.

Revision ID: zone_order_global
Revises: insights_pro_setup_fee
Create Date: 2026-08-20

FIXES A LIVE REGRESSION THAT `zone_display_order` CAUSED.

That migration set `climate_zones.display_order` to a zone's position WITHIN
its region — 0 for the region's own zone, then 1, 2, 3 for its sub-zones. Read
by the new query (`ORDER BY wine_regions.display_order, climate_zones.
display_order`) that is correct.

Read by the OLD query, which orders on the zone column alone, it is nonsense:
every region's 0 sorts first, then every region's 1, and so on. The DB migration
went to production immediately while the code that reads it did not, so
insights.auxein.co.nz spent the afternoon listing Northland, then Waitaki, then
Auckland, then Marlborough.

The fix is to stop the two orderings disagreeing rather than to race a deploy.
Encoding the region's rank in the zone's own value makes a single-column sort
produce the same answer as the two-column one:

    display_order = wine_regions.display_order * 100 + position within region

So Northland is 100, Auckland 200 and Waiheke 201, Marlborough 800 and its
sub-zones 801-804. Both queries now return north-to-south with sub-zones under
their parent, and the deploy stops being urgent.

The gap of 100 is not decoration: it leaves room for 99 sub-zones per region,
which is more headroom than the largest region needs by a factor of twenty.

`zone_display_order` is deliberately NOT amended. It has already run against
production; rewriting an applied migration means the file no longer describes
what happened, and the next person to read the history is owed the truth.
"""
from alembic import op
import sqlalchemy as sa

revision = 'zone_order_global'
down_revision = 'insights_pro_setup_fee'
branch_labels = None
depends_on = None


# Derived from wine_regions.display_order, which is already a correct
# north-to-south run and is not touched here.
REGION_RANK = {
    'northland': 1,
    'auckland': 2,
    'waikato-bay-of-plenty': 3,     # no active zones, held for ordering
    'gisborne': 4,
    'hawkes-bay': 5,
    'wairarapa': 6,
    'nelson': 7,
    'marlborough': 8,
    'north-canterbury': 9,
    'waitaki-valley': 10,
    'central-otago': 11,
}

# (zone slug, region slug, position within region). 0 is the region's own zone.
ZONES = [
    ('northland', 'northland', 0),

    ('auckland', 'auckland', 0),
    ('waiheke', 'auckland', 1),

    ('gisborne', 'gisborne', 0),

    ('hawkes-bay', 'hawkes-bay', 0),
    ('gimblett-bridge-pa', 'hawkes-bay', 1),
    ('ngaruroro', 'hawkes-bay', 2),

    ('wairarapa', 'wairarapa', 0),
    ('gladstone', 'wairarapa', 1),
    ('martinborough', 'wairarapa', 2),

    ('nelson', 'nelson', 0),

    ('marlborough', 'marlborough', 0),
    ('awatere', 'marlborough', 1),
    ('lower-wairau', 'marlborough', 2),
    ('south-coast', 'marlborough', 3),
    ('upper-wairau-southern-valleys', 'marlborough', 4),

    ('north-canterbury', 'north-canterbury', 0),
    ('waipara', 'north-canterbury', 1),

    ('waitaki', 'waitaki-valley', 0),

    ('central-otago', 'central-otago', 0),
    ('bannockburn', 'central-otago', 1),
    ('bendigo', 'central-otago', 2),
    ('gibbston', 'central-otago', 3),
]

REGION_STRIDE = 100


def upgrade():
    conn = op.get_bind()
    for zone_slug, region_slug, position in ZONES:
        order = REGION_RANK[region_slug] * REGION_STRIDE + position
        conn.execute(sa.text(
            "UPDATE climate_zones SET display_order = :order WHERE slug = :slug"
        ), {'order': order, 'slug': zone_slug})


def downgrade():
    # Back to the within-region values zone_display_order set, which is the
    # state this revision was applied on top of.
    conn = op.get_bind()
    for zone_slug, _region_slug, position in ZONES:
        conn.execute(sa.text(
            "UPDATE climate_zones SET display_order = :order WHERE slug = :slug"
        ), {'order': position, 'slug': zone_slug})
