"""pipeline deal types: Grow, Insights Pro and enterprise in one pipeline

The Grow conversion pipeline becomes the sales pipeline. Still one table
(`grow_leads`, name kept), with `deal_type` as the badge:

  grow          every existing row; Insights marketing opt-ins, plus manual
  insights_pro  an upgrade to Insights Pro, raised from a direct enquiry —
                synced from `insights_pro_enquiry`, or added by hand
  enterprise    commercial contracts, always manual

Also: a `proposal` stage between trial and won, `value_nzd` (annual), the
Insights account an enterprise deal became, and `insights_pro_enquiry.
pipeline_lead_id` so each enquiry is synced exactly once.

The UNIQUE on public_user_id narrows to grow leads only. It is the Grow sync's
ON CONFLICT target; a subscriber who is also a Pro lead must not collide.

Revision ID: pipeline_deal_types
Revises: sat_scene_processed
"""
from alembic import op
import sqlalchemy as sa


revision = "pipeline_deal_types"
down_revision = "sat_scene_processed"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("grow_leads", sa.Column(
        "deal_type", sa.String(length=20), nullable=False, server_default="grow",
    ))
    op.add_column("grow_leads", sa.Column("value_nzd", sa.Numeric(12, 2), nullable=True))
    op.add_column("grow_leads", sa.Column(
        "insights_account_id", sa.BigInteger(),
        sa.ForeignKey("insights_account.id", ondelete="SET NULL"), nullable=True,
    ))
    op.create_check_constraint(
        "ck_grow_leads_deal_type", "grow_leads",
        "deal_type IN ('grow','insights_pro','enterprise')",
    )
    op.create_check_constraint(
        "ck_grow_leads_value", "grow_leads", "value_nzd IS NULL OR value_nzd >= 0",
    )

    op.drop_constraint("ck_grow_leads_stage", "grow_leads", type_="check")
    op.create_check_constraint(
        "ck_grow_leads_stage", "grow_leads",
        "stage IN ('new','contacted','demo','trial','proposal','won','lost')",
    )
    op.drop_constraint("ck_grow_leads_source", "grow_leads", type_="check")
    op.create_check_constraint(
        "ck_grow_leads_source", "grow_leads",
        "source IN ('insights','enquiry','referral','event','website','outbound','other')",
    )

    op.drop_constraint("uq_grow_leads_public_user", "grow_leads", type_="unique")
    op.create_index(
        "uq_grow_leads_grow_public_user", "grow_leads", ["public_user_id"],
        unique=True, postgresql_where=sa.text("deal_type = 'grow'"),
    )
    # The unique constraint was also the FK's index; the partial one only
    # covers grow rows.
    op.create_index("ix_grow_leads_public_user", "grow_leads", ["public_user_id"])
    op.create_index("ix_grow_leads_account", "grow_leads", ["insights_account_id"])
    op.create_index("ix_grow_leads_deal_type", "grow_leads", ["deal_type"])

    op.drop_constraint("ck_grow_lead_activities_kind", "grow_lead_activities", type_="check")
    op.create_check_constraint(
        "ck_grow_lead_activities_kind", "grow_lead_activities",
        "kind IN ('note','call','email','meeting','demo','stage','enquiry')",
    )

    op.add_column("insights_pro_enquiry", sa.Column(
        "pipeline_lead_id", sa.BigInteger(),
        sa.ForeignKey("grow_leads.id", ondelete="SET NULL"), nullable=True,
    ))
    op.create_index(
        "ix_pro_enquiry_pipeline_lead", "insights_pro_enquiry", ["pipeline_lead_id"],
    )


def downgrade():
    # Fails if any lead sits in 'proposal', has source 'enquiry', or any
    # activity is an 'enquiry' — move or delete those first.
    op.drop_index("ix_pro_enquiry_pipeline_lead", table_name="insights_pro_enquiry")
    op.drop_column("insights_pro_enquiry", "pipeline_lead_id")

    op.drop_constraint("ck_grow_lead_activities_kind", "grow_lead_activities", type_="check")
    op.create_check_constraint(
        "ck_grow_lead_activities_kind", "grow_lead_activities",
        "kind IN ('note','call','email','meeting','demo','stage')",
    )

    op.drop_index("ix_grow_leads_deal_type", table_name="grow_leads")
    op.drop_index("ix_grow_leads_account", table_name="grow_leads")
    op.drop_index("ix_grow_leads_public_user", table_name="grow_leads")
    op.drop_index("uq_grow_leads_grow_public_user", table_name="grow_leads")
    op.create_unique_constraint("uq_grow_leads_public_user", "grow_leads", ["public_user_id"])

    op.drop_constraint("ck_grow_leads_source", "grow_leads", type_="check")
    op.create_check_constraint(
        "ck_grow_leads_source", "grow_leads",
        "source IN ('insights','referral','event','website','outbound','other')",
    )
    op.drop_constraint("ck_grow_leads_stage", "grow_leads", type_="check")
    op.create_check_constraint(
        "ck_grow_leads_stage", "grow_leads",
        "stage IN ('new','contacted','demo','trial','won','lost')",
    )

    op.drop_constraint("ck_grow_leads_value", "grow_leads", type_="check")
    op.drop_constraint("ck_grow_leads_deal_type", "grow_leads", type_="check")
    op.drop_column("grow_leads", "insights_account_id")
    op.drop_column("grow_leads", "value_nzd")
    op.drop_column("grow_leads", "deal_type")
