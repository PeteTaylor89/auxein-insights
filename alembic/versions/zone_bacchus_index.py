"""Bacchus botrytis risk index on disease_pressure (the ZONE path)

The point twin of `bacchus_botrytis_index`, which put these five columns on
`insights_site_disease` in August. The model itself has been sitting in
`backend/scripts/disease_service_v2.py` — the ZONE service — since that work:
defined there, imported from there by `populate_site_disease.py`, and never
once called by its own file. This migration and the accompanying change to
`run_disease_service` close that.

## Why the zone path wants it at all, given the point path has it

The point path only reaches sites somebody has placed. A region has a disease
picture whether or not anyone is subscribed to a point inside it, and the
regional overview is the thing a partner integration reads first. Running three
models regionally and four at a point also makes the two grains quietly
non-comparable, which is worse than either answer alone.

## FIVE COLUMNS, NOT ONE — unchanged from the point migration

Bacchus is scoped to a WET PERIOD and this table is scoped to a DAY. A wet
period running 22:00 to 06:00 is one infection event across two rows, so the
index and the dry-hour run have to be carried out of one day and into the next;
and the index a day ENDS on is not the risk that day carried, because a reset
can wipe a period that got most of the way there.

  bacchus_index      the index carried OUT of the day  (state, for the next day)
  bacchus_peak       the highest index reached DURING the day  (what to show)
  bacchus_infection  did it CROSS 1.0 during the day  (the event)
  bacchus_wet_hours  wet hours that contributed
  bacchus_dry_run    consecutive dry hours at the day's end  (state)

NUMERIC(7,4), not (5,2), for the same reason as the point table: the index is a
sum of 1/I terms of order 0.01-0.07 against a threshold of exactly 1.0, and two
decimal places would lose a fifth of a wet hour per hour until the accumulated
rounding decided infections. The two tables MUST agree on precision or a zone
and a site at the same place stop being comparable at the fourth place.

## Nullable, with no server default

A day scored before this model existed did not run it. That is not the same
claim as an index of zero, and `disease_pressure` already holds ~40 seasons of
rows that predate it. The same distinction the point table keeps.

Revision ID: zone_bacchus_index
Revises: kpi_snapshots
Create Date: 2026-09-16
"""
from alembic import op
import sqlalchemy as sa

revision = "zone_bacchus_index"
down_revision = "kpi_snapshots"
branch_labels = None
depends_on = None


COLUMNS = (
    ("bacchus_index", sa.Numeric(7, 4)),
    ("bacchus_peak", sa.Numeric(7, 4)),
    ("bacchus_infection", sa.Boolean()),
    ("bacchus_wet_hours", sa.Integer()),
    ("bacchus_dry_run", sa.Integer()),
)


def upgrade():
    for name, type_ in COLUMNS:
        op.add_column("disease_pressure", sa.Column(name, type_, nullable=True))


def downgrade():
    for name, _ in reversed(COLUMNS):
        op.drop_column("disease_pressure", name)
