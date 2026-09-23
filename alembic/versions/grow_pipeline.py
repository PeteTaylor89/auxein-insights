"""grow conversion pipeline: leads and their activity log

Two new tables, additive only. Nothing is backfilled here — Insights marketing
opt-ins are pulled in by the API on first load of the pipeline page, so the
same code path seeds the table and keeps it current.

Revision ID: grow_pipeline
Revises: partner_api
"""
from alembic import op
import sqlalchemy as sa


revision = "grow_pipeline"
down_revision = "partner_api"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "grow_leads",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "public_user_id", sa.Integer(),
            sa.ForeignKey("public_users.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("source", sa.String(length=20), nullable=False, server_default="other"),
        sa.Column("contact_name", sa.String(length=200), nullable=True),
        sa.Column("email", sa.String(length=200), nullable=True),
        sa.Column("phone", sa.String(length=50), nullable=True),
        sa.Column("company_name", sa.String(length=200), nullable=True),
        sa.Column("region", sa.String(length=100), nullable=True),
        sa.Column("hectares", sa.Numeric(8, 2), nullable=True),
        sa.Column("stage", sa.String(length=20), nullable=False, server_default="new"),
        sa.Column("stage_changed_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lost_reason", sa.String(length=20), nullable=True),
        sa.Column("next_action", sa.String(length=300), nullable=True),
        sa.Column("next_action_on", sa.Date(), nullable=True),
        sa.Column(
            "grow_company_id", sa.Integer(),
            sa.ForeignKey("companies.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column(
            "owner_user_id", sa.Integer(),
            sa.ForeignKey("public_users.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.CheckConstraint(
            "stage IN ('new','contacted','demo','trial','won','lost')",
            name="ck_grow_leads_stage",
        ),
        sa.CheckConstraint(
            "source IN ('insights','referral','event','website','outbound','other')",
            name="ck_grow_leads_source",
        ),
        sa.CheckConstraint(
            "lost_reason IS NULL OR lost_reason IN "
            "('price','timing','not_a_fit','competitor','no_response','other')",
            name="ck_grow_leads_lost_reason",
        ),
        # The sync's ON CONFLICT target. Postgres allows many NULLs under a
        # unique constraint, so manual leads are unaffected.
        sa.UniqueConstraint("public_user_id", name="uq_grow_leads_public_user"),
    )
    op.create_index("ix_grow_leads_stage", "grow_leads", ["stage"])
    # Every FK indexed — an unindexed FK turns a parent delete into a seq scan
    # per row.
    op.create_index("ix_grow_leads_company", "grow_leads", ["grow_company_id"])
    op.create_index("ix_grow_leads_owner", "grow_leads", ["owner_user_id"])

    op.create_table(
        "grow_lead_activities",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "lead_id", sa.BigInteger(),
            sa.ForeignKey("grow_leads.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("kind", sa.String(length=20), nullable=False, server_default="note"),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("occurred_on", sa.Date(), nullable=False),
        sa.Column("from_stage", sa.String(length=20), nullable=True),
        sa.Column("to_stage", sa.String(length=20), nullable=True),
        sa.Column(
            "author_user_id", sa.Integer(),
            sa.ForeignKey("public_users.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.CheckConstraint(
            "kind IN ('note','call','email','meeting','demo','stage')",
            name="ck_grow_lead_activities_kind",
        ),
    )
    op.create_index("ix_grow_lead_activities_lead", "grow_lead_activities", ["lead_id"])
    op.create_index("ix_grow_lead_activities_author", "grow_lead_activities", ["author_user_id"])


def downgrade():
    op.drop_index("ix_grow_lead_activities_author", table_name="grow_lead_activities")
    op.drop_index("ix_grow_lead_activities_lead", table_name="grow_lead_activities")
    op.drop_table("grow_lead_activities")

    op.drop_index("ix_grow_leads_owner", table_name="grow_leads")
    op.drop_index("ix_grow_leads_company", table_name="grow_leads")
    op.drop_index("ix_grow_leads_stage", table_name="grow_leads")
    op.drop_table("grow_leads")
