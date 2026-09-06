"""Bacchus botrytis risk index on insights_site_disease

BSI's site list asks for the "Bacchus Model" by name — 23 of their 67 sites
tick it. Nothing implemented it; the botrytis series was González-Domínguez
labelled "Botrytis (Bacchus)" in the UI. These columns hold the real one.

FIVE COLUMNS, NOT ONE, because Bacchus is scoped to a WET PERIOD and this table
is scoped to a DAY. A wet period running 22:00 to 06:00 is one infection event
across two rows, so the index and the dry-hour run have to be carried out of one
day and into the next; and the index a day ENDS on is not the risk that day
carried, because a reset can wipe a period that got most of the way there. So:

  bacchus_index      the index carried OUT of the day  (state, for the next day)
  bacchus_peak       the highest index reached DURING the day  (what to show)
  bacchus_infection  did it reach 1.0 during the day  (the event)
  bacchus_wet_hours  wet hours that contributed
  bacchus_dry_run    consecutive dry hours at the day's end  (state)

NUMERIC(7,4), not (5,2). The index is a sum of 1/I terms of order 0.01-0.07 and
the threshold is exactly 1.0; rounding to two places would lose a fifth of a wet
hour per hour and the accumulated error would decide infections.

Revision ID: bacchus_botrytis_index
Revises: invite_role_general
"""
from alembic import op
import sqlalchemy as sa

revision = "bacchus_botrytis_index"
down_revision = "invite_role_general"
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
    # NULLABLE, with no server default. A row scored before Bacchus existed did
    # not run the model, and that is not the same claim as an index of zero —
    # the same distinction the rest of this table already keeps for a day the
    # point models could not run.
    for name, type_ in COLUMNS:
        op.add_column("insights_site_disease", sa.Column(name, type_,
                                                         nullable=True))


def downgrade():
    for name, _ in reversed(COLUMNS):
        op.drop_column("insights_site_disease", name)
