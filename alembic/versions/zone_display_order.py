"""Make each region's own zone sort first within its region.

Revision ID: zone_display_order
Revises: timesheet_uncoded_input
Create Date: 2026-08-20

WHAT WAS ACTUALLY WRONG
Less than it looked. `wine_regions.display_order` is already a correct
north-to-south run (Northland 1 ... Central Otago 11) and is left untouched
here — including "Waikato / Bay of Plenty" at 3, which has no active zones and
would have been clobbered by a blanket rewrite.

The real defect was in the query: `/zones` ordered by `climate_zones.
display_order` ALONE, ignoring the region's. Zone display_order is close to
insertion sequence (1..21), so the list came out in creation order — which put
South Coast, a Marlborough sub-zone added last, at the bottom under Central
Otago, and Northland after Auckland. That is fixed in public_climate.py and
realtime_climate.py by ordering on the region first.

WHAT STILL NEEDED DATA
Ordering by region alone is not enough, because within a region the values are
not meaningful and in two cases collide outright:

    Wairarapa    Gladstone 8, Wairarapa 8, Martinborough 9
    Marlborough  Lower Wairau 11, Marlborough 11, Awatere 12, Upper Wairau 13,
                 South Coast 21

The region picker renders each region's own zone as the group header and the
rest indented beneath it, so it has to be able to tell which is which. With
duplicate values the tiebreak falls to name, and "Gladstone" and "Lower Wairau"
become the headers for Wairarapa and Marlborough. Both of those are sub-zones.

So: the region-level zone gets 0 and its sub-zones follow alphabetically. Zone
values restart per region because the region's own order is what separates the
groups.

Keyed by slug rather than derived by matching zone name to region name, because
two would not match: the "waitaki" zone sits in the "waitaki-valley" region, and
the zone "Hawkes Bay" is missing the apostrophe its region "Hawke's Bay" has.

Data only — `climate_zones.display_order` already exists.
"""
from alembic import op
import sqlalchemy as sa

revision = 'zone_display_order'
# NOT zone_label_point. That was the head when this work started, but a
# parallel Grow session has since landed add_map_feature_types and
# timesheet_uncoded_input on top of it. Chaining from the older revision would
# fork the history into two heads rather than extending it.
down_revision = 'timesheet_uncoded_input'
branch_labels = None
depends_on = None


# (slug, order within its region). 0 is the region's own zone.
ZONE_ORDER = [
    ('northland', 0),

    ('auckland', 0),
    ('waiheke', 1),

    ('gisborne', 0),

    ('hawkes-bay', 0),
    ('gimblett-bridge-pa', 1),
    ('ngaruroro', 2),

    ('wairarapa', 0),
    ('gladstone', 1),
    ('martinborough', 2),

    ('nelson', 0),

    ('marlborough', 0),
    ('awatere', 1),
    ('lower-wairau', 2),
    ('south-coast', 3),
    ('upper-wairau-southern-valleys', 4),

    ('north-canterbury', 0),
    ('waipara', 1),

    ('waitaki-valley', 0),
    ('waitaki', 0),

    ('central-otago', 0),
    ('bannockburn', 1),
    ('bendigo', 2),
    ('gibbston', 3),
]


def upgrade():
    conn = op.get_bind()
    # Only the slugs named above are touched. A blanket UPDATE would reset any
    # zone added by another session between this being written and applied,
    # and silently move it to the top of its region.
    for slug, order in ZONE_ORDER:
        conn.execute(sa.text(
            "UPDATE climate_zones SET display_order = :order WHERE slug = :slug"
        ), {'order': order, 'slug': slug})


def downgrade():
    # The previous values were insertion sequence, which carried no meaning and
    # is not worth reconstructing row by row. Restoring the ordering as it
    # behaved before means falling back to id order, which is what a single
    # shared value produces.
    conn = op.get_bind()
    conn.execute(sa.text("UPDATE climate_zones SET display_order = 0"))
