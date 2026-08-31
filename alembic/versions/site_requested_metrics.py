"""What the client actually asked for at each site.

The BSI location list carries a tick per variable per site, and the ticks are
NOT derivable from anything else on the row. Measured on the 67-row sheet:

  * ET is wanted at 7 sites, all Regional — but NOT at Nelson AWS, which is
    Regional. Nelson's ET comes from Appleby.
  * Appleby is a Regional row whose ONLY tick is ET. Its temperature, GDD,
    rainfall, long-term average and water balance are all `*`.
  * Water balance is wanted at 7 sites too, and it is a DIFFERENT seven — it
    includes Nelson AWS and excludes Appleby.

So `site_type` cannot stand in for this. Deriving ET from `site_type = 'regional'`
would have computed it at Nelson AWS, which was not asked for, and the two
seven-row sets would have collapsed into one eight-row set that matches neither.

## Why the whole tick row, and not a boolean for ET

Storing `wants_et` would answer today's question and none of the next ones. The
sheet has fifteen variable columns and the client will reasonably expect a site
to show what they asked for at it — Appleby is the proof, since a page showing
it a GDD accumulation is showing a number nobody requested. The array costs
nothing and the alternative is a migration per column.

Everything else on the platform is still computed for every site: the ticks gate
what is REPORTED, not what is extracted, and the two are different questions.
ET is the exception, because it is the one figure whose cost scales with the
station interpolation behind it.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'site_requested_metrics'
down_revision = 'site_water_balance'
branch_labels = None
depends_on = None


def upgrade():
    # The client's own column names, lower-cased and underscored:
    # temperature, gdd, rain, et, lta_gdd, water_balance, variety, budburst,
    # flowering, brix_8, weekly_maturity, brix_21_5, yield, bacchus, gubler.
    #
    # NULL means "nobody said" — a Pro subscriber's own site, which has no
    # such list. An EMPTY array would mean "asked for nothing", which is a
    # different and much stranger statement.
    op.add_column('insights_site',
                  sa.Column('requested_metrics',
                            postgresql.ARRAY(sa.Text()), nullable=True))
    # Membership tests run per site per page render. GIN because the query is
    # `requested_metrics @> ARRAY['et']`, which a btree cannot serve.
    op.create_index('ix_insights_site_metrics', 'insights_site',
                    ['requested_metrics'], postgresql_using='gin')


def downgrade():
    op.drop_index('ix_insights_site_metrics', table_name='insights_site')
    op.drop_column('insights_site', 'requested_metrics')
