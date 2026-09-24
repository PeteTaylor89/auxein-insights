"""pipeline: a `meeting_booked` stage between contacted and demo

Revision ID: pipeline_meeting_stage
Revises: pipeline_deal_types
"""
from alembic import op


revision = "pipeline_meeting_stage"
down_revision = "pipeline_deal_types"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint("ck_grow_leads_stage", "grow_leads", type_="check")
    op.create_check_constraint(
        "ck_grow_leads_stage", "grow_leads",
        "stage IN ('new','contacted','meeting_booked','demo','trial','proposal','won','lost')",
    )


def downgrade():
    # Fails if any lead sits in 'meeting_booked' — move those first.
    op.drop_constraint("ck_grow_leads_stage", "grow_leads", type_="check")
    op.create_check_constraint(
        "ck_grow_leads_stage", "grow_leads",
        "stage IN ('new','contacted','demo','trial','proposal','won','lost')",
    )
