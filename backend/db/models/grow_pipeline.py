# db/models/grow_pipeline.py — the Grow conversion pipeline.
#
# Leads being worked from first contact to a Grow sign-up (or not). Two ways in:
# Insights subscribers who ticked Marketing are pulled in automatically, and
# anyone else — a referral, someone met at a field day — is added by hand.
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
from sqlalchemy.sql import func

from db.base_class import Base

LEAD_STAGES = ("new", "contacted", "demo", "trial", "won", "lost")
CLOSED_STAGES = ("won", "lost")
LEAD_SOURCES = ("insights", "referral", "event", "website", "outbound", "other")
LOST_REASONS = ("price", "timing", "not_a_fit", "competitor", "no_response", "other")
ACTIVITY_KINDS = ("note", "call", "email", "meeting", "demo", "stage")


class GrowLead(Base):
    __tablename__ = "grow_leads"

    id = Column(BigInteger, primary_key=True, index=True)

    # Set only for leads pulled in from Insights. UNIQUE is what makes the sync
    # idempotent — the insert is ON CONFLICT DO NOTHING against it — and SET
    # NULL keeps the lead and its history if the subscriber deletes their
    # account.
    public_user_id = Column(
        Integer, ForeignKey("public_users.id", ondelete="SET NULL"),
        nullable=True, unique=True,
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
            "stage IN ('new','contacted','demo','trial','won','lost')",
            name="ck_grow_leads_stage",
        ),
        CheckConstraint(
            "source IN ('insights','referral','event','website','outbound','other')",
            name="ck_grow_leads_source",
        ),
        CheckConstraint(
            "lost_reason IS NULL OR lost_reason IN "
            "('price','timing','not_a_fit','competitor','no_response','other')",
            name="ck_grow_leads_lost_reason",
        ),
        Index("ix_grow_leads_stage", "stage"),
    )

    def __repr__(self):
        return f"<GrowLead {self.id} {self.stage} {self.email!r}>"


class GrowLeadActivity(Base):
    """One touch on a lead: a call, an email, a meeting, a note.

    Stage changes are written here too (kind='stage'), by the API rather than
    the user, so the timeline shows when a lead moved as well as why.
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
            "kind IN ('note','call','email','meeting','demo','stage')",
            name="ck_grow_lead_activities_kind",
        ),
    )

    def __repr__(self):
        return f"<GrowLeadActivity {self.id} lead={self.lead_id} {self.kind}>"
