"""Reference ET, crop ET and a running water balance at each site.

## There is no measured ET to store, so this stores an ESTIMATE and says so

HBRC publishes PET at 18 Hawke's Bay stations and it is the only ET on the
platform. It is also unusable: measured 2026-08-31, the 2025 annual totals come
to 2.8-6.9 mm per station against a true Hawke's Bay ETo of roughly 900-1,100 mm,
and January dailies read 0.0165-0.17 mm where they should read about 5. The
cadence is right — 365 rows a year — so this is a SPOT VALUE WHERE A TOTAL
BELONGS, sampled around NZ midnight when PET is near zero. That is the Hilltop
`Interval`-without-`Method` trap `ingestion/sources/hilltop_util.py` documents by
name, and `evapotranspiration` is already in its `CUMULATIVE_VARIABLES`.

So every value in these three columns is modelled. `eto_method` records which
model, per row, because the day that ingest is fixed there will be a reason to
run a measured series alongside the estimate and the two must never be confused.

## Hargreaves-Samani, and why not something better

FAO-56 equation 52 needs daily minimum and maximum temperature plus the site's
latitude and the day of year. Every one of those exists at all 68 sites, from
the daily surfaces. Penman-Monteith is the reference method and needs net
radiation, wind and humidity; radiation reaches 37 stations, humidity refuses
past 30 km at a point, and neither covers the network. FAO-56 names Hargreaves
as the recommended substitute in exactly that situation.

## Three columns, not one, because they answer different questions

`eto_mm` is the REFERENCE crop. It is the comparable, publishable number and the
one that belongs in an export next to anyone else's ET.

`etc_mm` is `eto_mm` multiplied by a vineyard crop coefficient that varies
through the season. It is what a vine actually uses, and it is the right input
to a balance — but it carries an assumption about canopy, and a single column
would hide that assumption inside a number that looks measured.

`water_balance_mm` is the running total of rainfall minus `etc_mm` from
1 September. A RUNNING DEFICIT WITH NO SOIL STORE: it is not clamped at field
capacity and not floored at wilting point, because a bucket needs a plant
available water figure per site and we have none. It therefore overstates stress
on a soil that has already dried out, and understates recovery after rain on one
that has not. Stated on the page rather than modelled away.
"""
from alembic import op
import sqlalchemy as sa

revision = 'site_water_balance'
down_revision = 'site_phenology'
branch_labels = None
depends_on = None


def upgrade():
    # Reference evapotranspiration, mm/day. NULL where the day has no
    # temperature range to estimate from — never 0, which would read as a day
    # the vine used no water.
    op.add_column('insights_site_daily',
                  sa.Column('eto_mm', sa.Float(), nullable=True))
    # Crop ET: eto_mm x the vineyard Kc for that day of the season.
    op.add_column('insights_site_daily',
                  sa.Column('etc_mm', sa.Float(), nullable=True))
    # Running sum of (rainfall - etc) from 1 September. Negative means the
    # season has lost more than it has received.
    op.add_column('insights_site_daily',
                  sa.Column('water_balance_mm', sa.Float(), nullable=True))
    # WHICH MODEL PRODUCED IT. Not decoration: the moment the HBRC ingest is
    # repaired there will be measured PET for part of the network, and a column
    # that cannot tell an estimate from a measurement is a column that will
    # eventually present one as the other.
    op.add_column('insights_site_daily',
                  sa.Column('eto_method', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('insights_site_daily', 'eto_method')
    op.drop_column('insights_site_daily', 'water_balance_mm')
    op.drop_column('insights_site_daily', 'etc_mm')
    op.drop_column('insights_site_daily', 'eto_mm')
