"""Record the wind the leaf-wetness estimator was given.

Revision ID: zone_hourly_wind
Revises: weather_qc_run
Create Date: 2026-08-27

Wind becomes an input to `estimate_leaf_wetness` as a DRYING term, and
`climate_zone_hourly` had no wind column at all. Without one the wetness
probability on every row would depend on a value nothing recorded — the same
class of gap `weather_qc_run` was created to close, one table over.

Two columns rather than one:

  * `wind_mean` — the zone-average hourly wind in m/s. Every ingest source that
    reports wind already reports it in m/s (checked across all twelve: means
    1.9-5.9, p95 4.8-15.1), so no unit conversion is involved and none should be
    introduced.

  * `wind_station_count` — how many stations that average came from, which is
    NOT `station_count`. Wind coverage is narrower than temperature and wider
    than humidity (157 stations against 242 and 163 nationally), so a single
    count cannot describe the row. A zone whose wind comes from one anemometer
    30 km away and a zone with six on site must be distinguishable after the
    fact, because the drying term moves the wetness estimate and from there the
    botrytis and downy indices.

**Both are nullable and the estimator degrades to its previous behaviour when
wind is absent** — that is deliberate. 26 of the 46 zoned stations carry wind
and six zones have none at all, so a NOT NULL column would either block those
zones or invent a number for them. NULL means "no anemometer", and it must not
be read as "calm": zero wind is the condition that MAXIMISES dew, so defaulting
a missing value to 0.0 would systematically over-predict wetness in exactly the
zones with the least evidence.
"""
from alembic import op
import sqlalchemy as sa


revision = 'zone_hourly_wind'
down_revision = 'weather_qc_run'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('climate_zone_hourly',
                  sa.Column('wind_mean', sa.Numeric(), nullable=True))
    op.add_column('climate_zone_hourly',
                  sa.Column('wind_station_count', sa.Integer(), nullable=True))


def downgrade():
    op.drop_column('climate_zone_hourly', 'wind_station_count')
    op.drop_column('climate_zone_hourly', 'wind_mean')
