"""Phenology at a POINT, and the regional figure beside it.

`phenology_estimates` is keyed on `zone_id`, and the Pro site page has been
reading it through `site.zone_id` since it shipped — so a subscriber's own
point has been showing their REGION's flowering and harvest dates. It looks
site-specific and it is not.

This is the point-level twin. Same estimator, same thresholds table, same
Sep-1/Oct-1 offsets; the only thing that changes is where the GDD comes from.

## Why the point answer differs enough to matter

A site's own accumulation is not its region's. `insights_site_baseline` has the
measured example: Waipara's zone Sep-Apr GDD10 baseline is 1,147.8 while
Fancrest, inside that zone, averages 1,040.9 — a 9% deficit that runs every
season. Carried into a phenology model that projects a date by dividing a GDD
shortfall by a daily rate, a 9% error in accumulation is a date error of days to
weeks, in the direction that matters most near harvest.

## THE ZONE FIGURE IS STORED BESIDE THE SITE FIGURE, NOT JOINED AT READ TIME

`zone_*_date` columns carry what the regional model said for the same variety,
vintage and estimate date. Two reasons, and neither is convenience:

  * the zone model runs on its own schedule and overwrites its rows, so a join
    at read time compares today's site estimate against whatever the zone
    happens to hold now, and the two silently drift apart
  * the comparison IS the product here. A grower's question is not "when will I
    flower", it is "am I ahead of or behind the district", and a stored pair can
    be trusted to be the same estimate date on both sides.

## The spread across sites is NOT stored

Where an account has many sites in one zone — the BSI list has 25 across the
Marlborough zones — a genuine spread can be computed across them. That is
derived at read time, deliberately: it depends on which sites exist, so a stored
percentile would go stale the moment a site is added or removed, and would do it
silently.

## `is_actual` is carried but nothing writes it yet

`phenology_estimates` has `flowering_is_actual` / `veraison_is_actual` for an
observed date overriding a modelled one. The same columns exist here because the
30 vineyard sites on the BSI list are exactly the places where somebody walks
the rows and knows the real date. Nothing writes them yet; the column being
present is what makes that an insert rather than a migration later.
"""
from alembic import op
import sqlalchemy as sa

revision = 'site_phenology'
down_revision = 'insights_accounts'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'insights_site_phenology',
        sa.Column('site_id', sa.BigInteger(),
                  sa.ForeignKey('insights_site.id', ondelete='CASCADE'),
                  primary_key=True),
        sa.Column('variety_code', sa.String(10), primary_key=True),
        # The HARVEST year. Rolls on 1 July, matching `phenology_estimates` and
        # `get_vintage_year` — NOT the 1 September the accumulation starts on.
        # Those are two different rules and both are load-bearing.
        sa.Column('vintage_year', sa.SmallInteger(), primary_key=True),
        sa.Column('estimate_date', sa.Date(), primary_key=True),

        # Base 0, accumulated from 1 SEPTEMBER. `insights_site_daily.
        # gdd_cumulative` already starts there, so unlike the zone job this
        # needs no Aug-31 offset subtracted — see the service.
        sa.Column('gdd_accumulated', sa.Numeric(8, 2), nullable=True),
        # Base 0 from 1 OCTOBER, which is what the harvest thresholds are
        # calibrated against. A single accumulation cannot serve both.
        sa.Column('gdd_from_oct1', sa.Numeric(8, 2), nullable=True),
        sa.Column('current_stage', sa.String(30), nullable=True),
        # Mean daily GDD over the trailing 14 days. Stored because every
        # projected date below is a division by it, and a date whose rate cannot
        # be inspected cannot be argued with.
        sa.Column('avg_daily_gdd', sa.Numeric(6, 2), nullable=True),

        sa.Column('flowering_date', sa.Date(), nullable=True),
        sa.Column('flowering_is_actual', sa.Boolean(), nullable=False,
                  server_default=sa.false()),
        sa.Column('veraison_date', sa.Date(), nullable=True),
        sa.Column('veraison_is_actual', sa.Boolean(), nullable=False,
                  server_default=sa.false()),
        sa.Column('harvest_170_date', sa.Date(), nullable=True),
        sa.Column('harvest_180_date', sa.Date(), nullable=True),
        sa.Column('harvest_190_date', sa.Date(), nullable=True),
        sa.Column('harvest_200_date', sa.Date(), nullable=True),
        sa.Column('harvest_210_date', sa.Date(), nullable=True),
        sa.Column('harvest_220_date', sa.Date(), nullable=True),

        # Against the SITE's own 1986-2005 baseline, not the zone's. That is the
        # whole point of computing this at a point.
        sa.Column('days_vs_baseline', sa.Integer(), nullable=True),
        sa.Column('gdd_vs_baseline', sa.Numeric(8, 2), nullable=True),
        # NULL when the site has no zone (three of the BSI sites), or the zone
        # has no daily baseline (zone 21, South Coast). Absent, never zero.
        sa.Column('baseline_source', sa.Text(), nullable=True),

        # What the REGIONAL model said, for the same variety, vintage and
        # estimate date. Stored, not joined — see the module docstring.
        sa.Column('zone_id', sa.Integer(),
                  sa.ForeignKey('climate_zones.id', ondelete='SET NULL'),
                  nullable=True),
        sa.Column('zone_gdd_accumulated', sa.Numeric(8, 2), nullable=True),
        sa.Column('zone_flowering_date', sa.Date(), nullable=True),
        sa.Column('zone_veraison_date', sa.Date(), nullable=True),
        sa.Column('zone_harvest_210_date', sa.Date(), nullable=True),

        sa.Column('confidence', sa.String(20), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
    )

    # The page asks "the latest estimate per variety for this site and vintage",
    # which is a DISTINCT ON over this order.
    op.create_index('ix_site_phenology_latest', 'insights_site_phenology',
                    ['site_id', 'vintage_year', 'variety_code',
                     sa.text('estimate_date DESC')])


def downgrade():
    op.drop_index('ix_site_phenology_latest',
                  table_name='insights_site_phenology')
    op.drop_table('insights_site_phenology')
