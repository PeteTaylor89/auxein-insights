"""Reference station per site per variable — the measured equivalent

BSI asked for an "equivalent measured site" as close as possible to each of
their eight Regional sites: a real station whose observed daily record they can
read beside the modelled one. That pairing is an EDITORIAL DECISION, not a
computation, which is why it is stored rather than derived. `nearest_stations`
already answers "what is closest"; it cannot answer "which one does the client
consider equivalent", and re-deriving the pairing on every request would let it
move under them the day a new gauge is commissioned.

## KEYED PER VARIABLE, and that is the whole design

`(site_id, variable)` is the primary key, so exactly one station supplies each
variable at each site and the database enforces it. Keying on
`(site_id, station_id)` instead would have needed an array of variables per row,
a uniqueness rule Postgres cannot express over array elements, and a validation
script nobody runs.

Two things on BSI's own list are unexpressible any other way:

* **A mast is not a station here.** Councils register each SENSOR as its own
  station: CODC Cromwell is station 144 (temp), 145 (humidity), 146 (precip) and
  147 (radiation), one physical mast at 212 m, four `station_id`s. "One to one"
  holds at the mast, never at the row.
* **A nominated mast can be missing a variable outright.** GREYSTONE BASE has
  precipitation, humidity and radiation and NO thermometer — Greystone's
  thermometers are all on blocks at 60-82 m while BASE sits at 120 m. So Waipara
  West's temperature is borrowed from block B4 and marked `fill`, and the screen
  and the export both name the station that actually supplied each cell.

`role` is what keeps that honest. A `fill` value is a different claim from a
`primary` one — it comes from a different mast at a different elevation — and a
table that showed them identically would be asserting the client's nominated
station measured something it does not measure.

## THE STATION FK POINTS AT `devices`, NOT `weather_stations`

`weather_stations` IS A VIEW. The Phase 0.2 rename moved the real table to
`devices` and left a compatibility view behind — its primary key is still called
`weather_stations_pkey`, which is how well it hides. Postgres refuses a foreign
key to a view outright:

    psycopg2.errors.WrongObjectType:
    referenced relation "weather_stations" is not a table

This is the second object in this schema to be a view under a table's name;
`weather_data` is the other, and that one is 47 partitions deep. `devices` is
what `weather_data_daily` and `device_measurements` already reference, so this
matches them.

The ORM models deliberately do NOT match: `insights_site.py`,
`realtime_climate.py` and `data_platform.py` all declare
`ForeignKey('weather_stations.station_id')`, because SQLAlchemy resolves that
against its own metadata — where the view is a mapped table — and never checks
it against the database. The declaration and the constraint therefore name
different relations on purpose, and the one that is enforced is this one.

## Why RESTRICT on the station

Deleting a station that a client's reference pairing depends on should fail
loudly. The alternative leaves the pairing pointing at nothing, which surfaces
as an empty column on a customer's screen rather than as an error anybody sees.

Revision ID: site_reference_station
Revises: admin_projects
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "site_reference_station"
down_revision = "admin_projects"
branch_labels = None
depends_on = None


# The column GROUPS of `weather_data_daily`, not its columns. `temp` carries
# temp_min/temp_max/temp_mean AND gdd_base0/gdd_base10, because a growing degree
# day is computed from that station's own temperatures and cannot come from a
# different mast than the temperatures it was derived from.
VARIABLES = ("temp", "humidity", "rainfall", "solar")
ROLES = ("primary", "fill")


def upgrade():
    op.create_table(
        "insights_site_reference_station",
        sa.Column("site_id", sa.BigInteger(), nullable=False),
        sa.Column("variable", sa.Text(), nullable=False),
        sa.Column("station_id", sa.Integer(), nullable=False),
        # 'primary' = the mast the client nominated. 'fill' = borrowed because
        # the nominated mast does not measure this at all.
        sa.Column("role", sa.Text(), nullable=False,
                  server_default="primary"),
        # Why this station and not another. Written by the seed script and shown
        # in the tooltip, so the reason travels with the decision instead of
        # living in whoever made it.
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("site_id", "variable",
                                name="pk_site_reference_station"),
        sa.ForeignKeyConstraint(["site_id"], ["insights_site.id"],
                                ondelete="CASCADE"),
        # `devices`, NOT `weather_stations` — see the module docstring. The
        # latter is a view and Postgres rejects the constraint outright.
        sa.ForeignKeyConstraint(["station_id"], ["devices.station_id"],
                                ondelete="RESTRICT"),
        sa.CheckConstraint(
            "variable IN ('temp', 'humidity', 'rainfall', 'solar')",
            name="ck_site_ref_variable"),
        sa.CheckConstraint("role IN ('primary', 'fill')",
                           name="ck_site_ref_role"),
    )
    # The export walks every pairing on an account and joins daily rows by
    # station. Without this the station side of that join is a seq scan on a
    # table that will grow a row per site per variable for every client.
    op.create_index("ix_site_ref_station", "insights_site_reference_station",
                    ["station_id"])


def downgrade():
    op.drop_index("ix_site_ref_station",
                  table_name="insights_site_reference_station")
    op.drop_table("insights_site_reference_station")
