# db/models/grow_pipeline.py — the sales pipeline.
#
# Leads being worked from first contact to a sale (or not). One table for three
# kinds of deal, told apart by `deal_type` (the table keeps its original name):
#   grow          a Grow sign-up. Insights subscribers who ticked Marketing are
#                 pulled in automatically; anyone else is added by hand.
#   insights_pro  an upgrade to Insights Pro. Only ever raised by a direct
#                 enquiry: synced from `insights_pro_enquiry`, or added by hand
#                 for one that came by phone or email.
#   enterprise    a commercial contract. Always added by hand.
#
# Platform data, SHARED across admins, unlike the planner: a lead belongs to the
# business, not to whoever typed it. `owner_user_id` records who is working it,
# it does not scope who can see it.
#
# Read and written by /api/v1/admin/pipeline/*.
from sqlalchemy import (
    Column, Integer, BigInteger, String, Text, Date, Numeric, DateTime,
    ForeignKey, CheckConstraint, Index
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func, text

from db.base_class import Base

DEAL_TYPES = ("grow", "insights_pro", "enterprise")
LEAD_STAGES = ("new", "contacted", "demo", "trial", "proposal", "won", "lost")
CLOSED_STAGES = ("won", "lost")
LEAD_SOURCES = ("insights", "enquiry", "referral", "event", "website", "outbound", "other")
LOST_REASONS = ("price", "timing", "not_a_fit", "competitor", "no_response", "other")
# 'stage' and 'enquiry' are written by the API, never logged by hand.
ACTIVITY_KINDS = ("note", "call", "email", "meeting", "demo", "stage", "enquiry")


class GrowLead(Base):
    __tablename__ = "grow_leads"

    id = Column(BigInteger, primary_key=True, index=True)

    deal_type = Column(String(20), nullable=False, server_default="grow")

    # The Insights subscriber behind the lead: the opt-in a grow lead was
    # pulled from, or the signed-in visitor who sent a Pro enquiry. UNIQUE for
    # grow leads only (a partial index) — that is the Grow sync's ON CONFLICT
    # target — so the same subscriber can also be a Pro lead. SET NULL keeps
    # the lead and its history if the subscriber deletes their account.
    public_user_id = Column(
        Integer, ForeignKey("public_users.id", ondelete="SET NULL"),
        nullable=True,
    )

    source = Column(String(20), nullable=False, server_default="other")

    # Contact details are a SNAPSHOT for Insights leads, copied at sync time and
    # editable afterwards. The subscriber's profile is often thin (no company,
    # no name) and the pipeline is where the real details get written down.
    contact_name = Column(String(200), nullable=True)
    email = Column(String(200), nullable=True)
    phone = Column(String(50), nullable=True)
    company_name = Column(String(200), nullable=True)
    region = Column(String(100), nullable=True)
    hectares = Column(Numeric(8, 2), nullable=True)

    # What the deal is worth a year, NZD. Optional: a Grow lead's value is
    # often unknown until the demo.
    value_nzd = Column(Numeric(12, 2), nullable=True)

    stage = Column(String(20), nullable=False, server_default="new")
    stage_changed_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    # Stamped on entering won/lost and cleared on reopening. From day one,
    # because "how many converted in August" is unanswerable after the fact
    # without it — see the Grow `tasks` table.
    closed_at = Column(DateTime(timezone=True), nullable=True)
    lost_reason = Column(String(20), nullable=True)

    # The one thing to do next, and when. DATE, not a timestamp: a follow-up is
    # a calendar day, and a timestamp drags the UTC/NZ question into "overdue".
    next_action = Column(String(300), nullable=True)
    next_action_on = Column(Date, nullable=True)

    # The Grow company this lead became. Set when marking won; SET NULL so a
    # deleted company does not take the sales history with it.
    grow_company_id = Column(
        Integer, ForeignKey("companies.id", ondelete="SET NULL"), nullable=True,
    )

    # The Insights enterprise account an enterprise deal became.
    insights_account_id = Column(
        BigInteger, ForeignKey("insights_account.id", ondelete="SET NULL"), nullable=True,
    )

    owner_user_id = Column(
        Integer, ForeignKey("public_users.id", ondelete="SET NULL"), nullable=True,
    )

    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False,
                        server_default=func.now(), onupdate=func.now())

    activities = relationship(
        "GrowLeadActivity",
        back_populates="lead",
        cascade="all, delete-orphan",
        order_by="GrowLeadActivity.created_at.desc()",
    )

    __table_args__ = (
        CheckConstraint(
            "deal_type IN ('grow','insights_pro','enterprise')",
            name="ck_grow_leads_deal_type",
        ),
        CheckConstraint(
            "stage IN ('new','contacted','demo','trial','proposal','won','lost')",
            name="ck_grow_leads_stage",
        ),
        CheckConstraint(
            "source IN ('insights','enquiry','referral','event','website','outbound','other')",
            name="ck_grow_leads_source",
        ),
        CheckConstraint("value_nzd IS NULL OR value_nzd >= 0", name="ck_grow_leads_value"),
        CheckConstraint(
            "lost_reason IS NULL OR lost_reason IN "
            "('price','timing','not_a_fit','competitor','no_response','other')",
            name="ck_grow_leads_lost_reason",
        ),
        Index("ix_grow_leads_stage", "stage"),
        Index("ix_grow_leads_deal_type", "deal_type"),
        Index("uq_grow_leads_grow_public_user", "public_user_id", unique=True,
              postgresql_where=text("deal_type = 'grow'")),
    )

    def __repr__(self):
        return f"<GrowLead {self.id} {self.deal_type} {self.stage} {self.email!r}>"


class GrowLeadActivity(Base):
    """One touch on a lead: a call, an email, a meeting, a note.

    Stage changes are written here too (kind='stage'), by the API rather than
    the user, so the timeline shows when a lead moved as well as why. So is a
    repeat Pro enquiry from someone already in the pipeline (kind='enquiry').
    """
    __tablename__ = "grow_lead_activities"

    id = Column(BigInteger, primary_key=True, index=True)

    lead_id = Column(
        BigInteger, ForeignKey("grow_leads.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    kind = Column(String(20), nullable=False, server_default="note")
    body = Column(Text, nullable=True)

    # The day it happened, which is not always the day it was typed up.
    occurred_on = Column(Date, nullable=False)

    from_stage = Column(String(20), nullable=True)
    to_stage = Column(String(20), nullable=True)

    author_user_id = Column(
        Integer, ForeignKey("public_users.id", ondelete="SET NULL"), nullable=True,
    )

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    lead = relationship("GrowLead", back_populates="activities")

    __table_args__ = (
        CheckConstraint(
            "kind IN ('note','call','email','meeting','demo','stage','enquiry')",
            name="ck_grow_lead_activities_kind",
        ),
    )

    def __repr__(self):
        return f"<GrowLeadActivity {self.id} lead={self.lead_id} {self.kind}>"
