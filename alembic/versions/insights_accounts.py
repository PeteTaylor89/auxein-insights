"""Enterprise accounts: many sites, named users, and client-entered yield.

The Pro site model was built for a grower with one to three points, and it says
so in its own shape: `public_user_id` NOT NULL, `slot_index`, `moves_used`,
`move_window_start`, and a UNIQUE on (public_user_id, slot_index). A client with
67 monitored sites does not fit any of that — the sites are not one person's,
nobody moves them, and there is no quota to spend.

So an account is a FIRST-CLASS OWNER beside a user, not a user with a large
quota.

## Why not reuse `insights_site.company_id`

That column exists and it is deliberately NOT the owner. Its model docstring is
explicit: it is a LABEL, resolved through the one-way Grow SSO link at placement
and NULL for every direct Insights subscriber. Overloading it to mean "owner"
for some rows and "label" for others is the drift this codebase keeps writing
comments to prevent, and it would also tie an Insights-only client to a Grow
`companies` row it has no reason to have.

`insights_account` is therefore separate from `companies`, and the two can
coexist on one site: an account-owned site belonging to a client who is also a
Grow customer carries both.

## Exactly one owner, enforced

`public_user_id` becomes NULLABLE and a CHECK requires exactly one of
(public_user_id, account_id). Without the CHECK the interesting failure is not a
site with two owners — it is a site with NEITHER, which no query would return
and no page would show, and which would sit in the table paying for extraction
forever.

The existing UNIQUE (public_user_id, slot_index) is left alone. Postgres treats
NULLs as distinct in a unique index, so 67 account sites all carrying
(NULL, 0) coexist happily while the slot rule keeps holding for Pro users.

## `site_type` comes from the client's own worksheet

Regional, sub-regional and phenology sites are not a taxonomy we invented: the
client's list is organised that way and the three populations want different
things on screen — a regional station shows ET and water balance, a phenology
vineyard shows budburst through harvest. Storing it is what lets one dashboard
serve all three without a lookup table of exceptions.

## Yield is ENTERED, never modelled

There is no yield model on this platform and this table must not imply one. It
records what the client tells us, with who said so and when. It is the only
table in the site family whose values do not come from a surface, which is why
it carries `entered_by` — a number nobody can attribute is a number nobody will
trust six months later.
"""
from alembic import op
import sqlalchemy as sa

revision = 'insights_accounts'
down_revision = 'site_projection'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'insights_account',
        sa.Column('id', sa.BigInteger(), primary_key=True),
        sa.Column('name', sa.String(120), nullable=False),
        # Addressable in a URL. A client dashboard is a link somebody pastes to
        # a colleague, and /pro/accounts/17 is not that link.
        sa.Column('slug', sa.String(120), nullable=False, unique=True),
        # 'active' | 'suspended'. Suspension is not deletion: an account that
        # stops paying keeps its sites and its history, and gets them back on
        # renewal rather than being re-provisioned from a spreadsheet.
        sa.Column('status', sa.Text(), nullable=False,
                  server_default='active'),
        # The Grow tenant, where the client is also a Grow customer. NULL is
        # the normal case and carries no meaning beyond "not linked".
        sa.Column('company_id', sa.Integer(),
                  sa.ForeignKey('companies.id', ondelete='SET NULL'),
                  nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        'insights_account_member',
        sa.Column('account_id', sa.BigInteger(),
                  sa.ForeignKey('insights_account.id', ondelete='CASCADE'),
                  primary_key=True),
        sa.Column('public_user_id', sa.Integer(),
                  sa.ForeignKey('public_users.id', ondelete='CASCADE'),
                  primary_key=True),
        # 'owner' can manage membership; 'member' can read. Deliberately two
        # values and not a permission matrix — this is a reporting product, and
        # the only question is who may add a colleague.
        sa.Column('role', sa.Text(), nullable=False, server_default='member'),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
    )
    # The membership lookup runs on EVERY request a client user makes, from the
    # user's side. The primary key indexes (account_id, public_user_id), which
    # is the wrong order for that question.
    op.create_index('ix_account_member_user', 'insights_account_member',
                    ['public_user_id'])

    # --- insights_site gains an owner that is not a person -------------------
    op.add_column('insights_site',
                  sa.Column('account_id', sa.BigInteger(),
                            sa.ForeignKey('insights_account.id',
                                          ondelete='CASCADE'),
                            nullable=True))
    # 'pro_slot' — a subscriber placed it themselves, quota and move rules apply.
    # 'account'  — provisioned for a client, no quota and nobody moves it.
    op.add_column('insights_site',
                  sa.Column('source', sa.Text(), nullable=False,
                            server_default='pro_slot'))
    # 'regional' | 'sub_regional' | 'phenology'. NULL for a Pro slot, which has
    # no such distinction.
    op.add_column('insights_site',
                  sa.Column('site_type', sa.Text(), nullable=True))
    # The client's own identifier for the place. Their spreadsheet is the
    # system of record for what a site is called, and matching on our label
    # would break the first time somebody tidies a name.
    op.add_column('insights_site',
                  sa.Column('external_ref', sa.Text(), nullable=True))

    op.alter_column('insights_site', 'public_user_id', nullable=True)

    # Exactly one owner. The failure this guards is not two owners — it is
    # NEITHER, which no query returns, no page shows, and which would go on
    # being extracted nightly forever.
    op.create_check_constraint(
        'ck_insights_site_one_owner', 'insights_site',
        '(public_user_id IS NOT NULL AND account_id IS NULL) '
        'OR (public_user_id IS NULL AND account_id IS NOT NULL)')

    op.create_index('ix_insights_site_account', 'insights_site', ['account_id'])

    op.create_table(
        'insights_site_yield',
        sa.Column('site_id', sa.BigInteger(),
                  sa.ForeignKey('insights_site.id', ondelete='CASCADE'),
                  primary_key=True),
        # The HARVEST year, matching `insights_site_season.vintage_year` and the
        # Sep-Apr season everything else on this site is labelled by.
        sa.Column('vintage_year', sa.SmallInteger(), primary_key=True),
        sa.Column('variety_code', sa.Text(), nullable=False,
                  server_default='ALL', primary_key=True),
        sa.Column('value', sa.Float(), nullable=True),
        # Stored, never assumed. t/ha and kg/vine are both in normal use and a
        # column that silently means one of them is a number nobody can check.
        sa.Column('unit', sa.Text(), nullable=False, server_default='t/ha'),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('entered_by', sa.Integer(),
                  sa.ForeignKey('public_users.id', ondelete='SET NULL'),
                  nullable=True),
        sa.Column('entered_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
    )


def downgrade():
    op.drop_table('insights_site_yield')
    op.drop_index('ix_insights_site_account', table_name='insights_site')
    op.drop_constraint('ck_insights_site_one_owner', 'insights_site',
                       type_='check')
    # Back to NOT NULL is only safe once no account-owned site remains, and
    # dropping the table below is what guarantees that.
    op.execute("DELETE FROM insights_site WHERE public_user_id IS NULL")
    op.alter_column('insights_site', 'public_user_id', nullable=False)
    op.drop_column('insights_site', 'external_ref')
    op.drop_column('insights_site', 'site_type')
    op.drop_column('insights_site', 'source')
    op.drop_column('insights_site', 'account_id')
    op.drop_index('ix_account_member_user',
                  table_name='insights_account_member')
    op.drop_table('insights_account_member')
    op.drop_table('insights_account')
