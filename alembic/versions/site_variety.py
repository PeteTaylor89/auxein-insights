"""The variety a site is monitored for, and a stable key built from it.

The BSI list carries a variety on all 30 of its phenology rows — Sauvignon
blanc 10, Pinot noir 9, Chardonnay 5, Pinot gris 4, Merlot 2 — and `*` on the
37 met-station rows. Phenology is a per-variety model, so a site monitored for
Pinot noir and one monitored for Sauvignon blanc at the same coordinates are
two different answers, not one duplicated row.

## This also fixes the positional key

`external_ref` was `TYPE|LOCATION|N`, where N counted occurrences in SHEET
ORDER, because eleven location names repeat and Location alone is not unique.
That worked but was fragile: re-sorting the sheet or inserting a row renumbers
everything below it, and the next import reads as a pile of moves.

The variety is what was actually distinguishing those rows. Two of the three
same-coordinate pairs found at import are variety pairs — Patutahi is
Chardonnay and Sauvignon blanc, Bridge Pa is Merlot and Sauvignon blanc — and
they were never duplicates at all. `TYPE|LOCATION|VARIETY` is therefore both
meaningful and stable under re-ordering, which the ordinal never was.

## Pinot gris cannot be modelled yet

`phenology_thresholds` holds nine varieties and Pinot gris is not among them.
Four BSI sites are monitored for it. The variety is stored anyway — the client
asked for it and that fact should not be lost because our model is short a row —
and the phenology service simply produces nothing for those sites until
thresholds exist. Storing it is what makes the gap visible instead of silently
substituting a variety nobody chose.
"""
from alembic import op
import sqlalchemy as sa

revision = 'site_variety'
down_revision = 'site_requested_metrics'
branch_labels = None
depends_on = None


def upgrade():
    # The client's own words, e.g. 'Pinot gris'. Kept verbatim rather than
    # normalised: it is what they asked for and it has to survive a variety we
    # cannot yet model.
    op.add_column('insights_site',
                  sa.Column('variety', sa.Text(), nullable=True))
    # Resolved to `phenology_thresholds.variety_code`, or NULL where no
    # threshold row exists. NULL here with `variety` set is the signal that a
    # site wants a variety the model does not carry.
    op.add_column('insights_site',
                  sa.Column('variety_code', sa.String(10), nullable=True))


def downgrade():
    op.drop_column('insights_site', 'variety_code')
    op.drop_column('insights_site', 'variety')
