"""Link a Grow property to its Insights site

A Grow property that wants weather, disease and phenology of its own needs a
point in the Insights surface archive — an `insights_site` row, with its grid
cell resolved and its 1986-2023 record extracted. This is the pointer between
the two.

## WHY THE POINTER LIVES ON `properties`

The Grow side does the reading. Every screen that needs this asks "what is the
site for the property I am looking at", never the reverse, and a property has at
most one site. A column here is one join; the alternative — parsing
`insights_site.external_ref` — is a string match in a hot path.

`insights_site.company_id` already references `companies.id`, so a column
crossing the Grow/Insights boundary is the existing precedent rather than a new
idea. What is new is the direction.

## WHY NOT REUSE `pro_site_quota`

`core/entitlements.py` puts 'grow' in PRO_TIERS, so a Grow user already passes
`require_pro` — but `site_quota()` reads `pro_site_quota`, which is 0 for them.
Pro by relationship, with no point. Rather than granting quota (which is a
priced, stacking point subscription and would make every Grow property a
billable Insights site), a Grow company gets an `insights_account` and its
properties become account sites. `ck_insights_site_one_owner` already allows
exactly that shape, `insights_account.company_id` already exists to name the
company, and membership of an active account is already a route to Pro. So the
commercial answer needs no schema beyond this one column.

## ON DELETE SET NULL, NOT CASCADE

Deleting a site must not delete the property. And a site outliving its property
is the right way round: the extracted climate record cost real compute and the
property may come back under a new id after a re-import.
"""
from alembic import op
import sqlalchemy as sa


# Keep under 32 characters — a longer slug silently rolls back the DDL.
revision = "property_insights_site"
down_revision = "budburst_chilling_forcing"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "properties",
        sa.Column("insights_site_id", sa.BigInteger(), nullable=True),
    )
    op.create_foreign_key(
        "fk_properties_insights_site",
        "properties", "insights_site",
        ["insights_site_id"], ["id"],
        ondelete="SET NULL",
    )
    # UNIQUE, not just indexed: two properties sharing one site would make
    # "whose weather is this" unanswerable, and the phenology shown on one
    # would silently be the other's.
    op.create_index(
        "uq_properties_insights_site",
        "properties", ["insights_site_id"],
        unique=True,
        postgresql_where=sa.text("insights_site_id IS NOT NULL"),
    )


def downgrade():
    op.drop_index("uq_properties_insights_site", table_name="properties")
    op.drop_constraint("fk_properties_insights_site", "properties",
                       type_="foreignkey")
    op.drop_column("properties", "insights_site_id")
