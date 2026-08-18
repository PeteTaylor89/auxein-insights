"""Pro sites — one saved point per subscription, with its own climate record.

The Pro product is "your site, interpreted": a subscriber places ONE point, and
the platform extracts that cell's whole 1986-2023 record from the surface
archive so it can be shown against its own long-run normal and against the
regional background it sits in.

## Ownership is `public_user_id`, and `company_id` is a label

`public_users` has no `company_id` — only `grow_user_id`, the one-way SSO link
to a Grow account. So the owner of a site is the PublicUser; `company_id` is
resolved through that link at placement and denormalised here for
identification and support, and it is NULL for every subscriber who is not also
a Grow customer. Keying on company alone would leave the whole direct-Insights
segment unidentifiable.

## Entitlement lives on the quota, not on the row count

`public_users.pro_site_quota` is how many points the subscription carries — one
per point subscription, and a subscriber may hold several. `slot_index`
identifies which of their slots a site occupies, so a second subscription adds a
slot rather than mutating the first. Uniqueness is (public_user_id, slot_index).

## Why the per-site tables carry no spread

`climate_zone_surface_monthly` stores mean/min/max/p10/p90 because a zone is
thousands of planted cells and the honest headline is the range across real
vineyards. **A site is ONE cell.** It has a value, not a distribution, so these
tables store a single `value` and any apparent spread would be invented. The
comparison a subscriber actually wants — their cell against the zone's spread —
is a join across the two tables, not a column here.

## The site's own baseline is DERIVED, not stored

A site's normal is an aggregate over its own monthly rows, which is 456 numbers
per variable — cheap enough to compute on read. Storing it would add a third
table that can silently disagree with the series it summarises.

Revision ID: insights_pro_sites
Revises: zone_surface_season
Create Date: 2026-08-18
"""
from alembic import op
import sqlalchemy as sa

revision = 'insights_pro_sites'
down_revision = 'zone_surface_season'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'public_users',
        # How many Pro points this subscriber may hold. 0 for everyone who has
        # not bought one — Pro tier alone does not imply a site, because the
        # point subscription is priced separately and stacks.
        sa.Column('pro_site_quota', sa.SmallInteger(), nullable=False,
                  server_default='0'),
    )

    op.create_table(
        'insights_site',
        sa.Column('id', sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column('public_user_id', sa.Integer(), nullable=False),
        # Denormalised from public_users.grow_user_id -> users.company_id at
        # placement. NULL for direct Insights subscribers. See module docstring.
        sa.Column('company_id', sa.Integer(), nullable=True),
        sa.Column('slot_index', sa.SmallInteger(), nullable=False,
                  server_default='0'),

        sa.Column('label', sa.String(length=80), nullable=True),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.Column('elevation_m', sa.Float(), nullable=True),

        # The surface cell the point resolves to. Stored so a re-population
        # cannot silently drift to a neighbouring cell if the grid is ever
        # rebuilt — `grid_key` names the grid these indices belong to.
        sa.Column('grid_row', sa.Integer(), nullable=True),
        sa.Column('grid_col', sa.Integer(), nullable=True),
        sa.Column('grid_key', sa.Text(), nullable=True),

        # The regional comparator, resolved once at placement. A site outside
        # every wine zone is legitimate (Pro is not wine-only), hence nullable —
        # such a site gets its own record with no regional background.
        sa.Column('zone_id', sa.Integer(), nullable=True),

        # populating | ready | failed
        sa.Column('status', sa.Text(), nullable=False,
                  server_default='populating'),
        sa.Column('status_detail', sa.Text(), nullable=True),
        sa.Column('requested_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column('populated_at', sa.DateTime(timezone=True), nullable=True),

        # A point is movable but not freely — otherwise "one point per
        # subscription" means nothing, since a subscriber could sample the whole
        # country one move at a time. Counted in a rolling window that starts at
        # the first move, not at a calendar boundary.
        sa.Column('moves_used', sa.SmallInteger(), nullable=False,
                  server_default='0'),
        sa.Column('move_window_start', sa.DateTime(timezone=True),
                  nullable=True),

        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),

        sa.ForeignKeyConstraint(['public_user_id'], ['public_users.id'],
                                ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'],
                                ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['zone_id'], ['climate_zones.id'],
                                ondelete='SET NULL'),
        sa.UniqueConstraint('public_user_id', 'slot_index',
                            name='uq_insights_site_user_slot'),
    )
    op.create_index('ix_insights_site_user', 'insights_site',
                    ['public_user_id'])
    op.create_index('ix_insights_site_company', 'insights_site', ['company_id'])
    # The populating queue. Partial, because 'ready' is the steady state and a
    # cron looking for work should not scan every site ever created.
    op.create_index('ix_insights_site_pending', 'insights_site',
                    ['requested_at'],
                    postgresql_where=sa.text("status = 'populating'"))

    op.create_table(
        'insights_site_monthly',
        sa.Column('site_id', sa.BigInteger(), nullable=False),
        sa.Column('variable', sa.Text(), nullable=False),
        sa.Column('statistic', sa.Text(), nullable=False),
        sa.Column('year', sa.SmallInteger(), nullable=False),
        sa.Column('month', sa.SmallInteger(), nullable=False),
        # ONE cell, so one number. No mean/min/p10/p90 — see module docstring.
        # NULL means the surface had no value there, and NEVER means zero; a
        # null-rainfall-written-as-zero bug has already bitten this platform.
        sa.Column('value', sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(['site_id'], ['insights_site.id'],
                                ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('site_id', 'variable', 'statistic',
                                'year', 'month'),
    )

    op.create_table(
        'insights_site_season',
        sa.Column('site_id', sa.BigInteger(), nullable=False),
        sa.Column('vintage_year', sa.SmallInteger(), nullable=False),
        sa.Column('metric', sa.Text(), nullable=False),
        sa.Column('value', sa.Float(), nullable=True),
        sa.Column('unit', sa.Text(), nullable=False),
        # Which baseline produced a baseline-dependent metric (r99p). NULL for
        # every metric that does not depend on one — same convention as
        # climate_zone_surface_season, so the two are directly comparable.
        sa.Column('baseline', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['site_id'], ['insights_site.id'],
                                ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('site_id', 'vintage_year', 'metric'),
    )


def downgrade():
    op.drop_table('insights_site_season')
    op.drop_table('insights_site_monthly')
    op.drop_index('ix_insights_site_pending', table_name='insights_site')
    op.drop_index('ix_insights_site_company', table_name='insights_site')
    op.drop_index('ix_insights_site_user', table_name='insights_site')
    op.drop_table('insights_site')
    op.drop_column('public_users', 'pro_site_quota')
