# db/models/insights_pro.py — the commercial side of Insights Pro.
#
# Two tables created by migration `insights_pro_commerce` (2026-08-20): the
# pricing calculator's usage log, and the enquiry list that replaced a mailto.
#
# Neither stores an IP address. See the migration for why.
from sqlalchemy import (
    Column, Integer, SmallInteger, String, Text, Numeric, DateTime, ForeignKey,
    CheckConstraint, Index, text,
)
from sqlalchemy.orm import relationship

from db.base_class import Base


class InsightsPricingQuote(Base):
    """One run of the /pro pricing calculator.

    Written on the server from the visitor's INPUTS. The client never posts a
    total — see `api/v1/insights_pro.py` — because a table meant to answer
    "what are people quoting themselves" is worthless if a stranger can choose
    the numbers in it.
    """
    __tablename__ = 'insights_pricing_quote'

    id = Column(Integer, primary_key=True, index=True)

    # NULL for the anonymous majority. ON DELETE SET NULL: a deleted account
    # de-identifies its quotes rather than erasing that they happened.
    public_user_id = Column(
        Integer, ForeignKey('public_users.id', ondelete='SET NULL'),
        nullable=True,
    )

    # Inputs.
    hectares = Column(Numeric(10, 2), nullable=False)
    sites = Column(SmallInteger, nullable=False)

    # Server-computed outputs.
    #
    # TWO COMPARISONS, NOT ONE. Grow's one-off setup fee moves the crossover
    # from 7.06 ha to 4.12 ha, so between those two figures Pro is cheaper in
    # year one while Grow is cheaper every year after. `cheaper` is the ONGOING
    # verdict and `cheaper_first_year` is the year-one one; recording only one
    # would silently pick a side across that whole band.
    pro_annual_ex_gst = Column(Numeric(12, 2), nullable=False)

    # Grow's RECURRING annual cost, setup excluded. Meaning unchanged since the
    # first migration, so old rows stay comparable with new ones.
    grow_annual_ex_gst = Column(Numeric(12, 2), nullable=False)
    grow_setup_ex_gst = Column(Numeric(10, 2), nullable=False, server_default='0')
    grow_first_year_ex_gst = Column(Numeric(12, 2), nullable=False, server_default='0')

    cheaper = Column(String(8), nullable=False)          # ongoing: pro|grow|equal
    difference_ex_gst = Column(Numeric(12, 2), nullable=False)
    cheaper_first_year = Column(String(8), nullable=False, server_default='equal')
    difference_first_year_ex_gst = Column(Numeric(12, 2), nullable=False, server_default='0')

    # The rates in force at the time. A price change must not silently rewrite
    # what every historical row meant.
    pro_rate_ex_gst = Column(Numeric(10, 2), nullable=False)
    grow_rate_ex_gst = Column(Numeric(10, 2), nullable=False)

    session_key = Column(String(64), nullable=True)

    created_at = Column(DateTime(timezone=True),
                        server_default=text('NOW()'), nullable=False)

    user = relationship('PublicUser', foreign_keys=[public_user_id])

    __table_args__ = (
        CheckConstraint("cheaper IN ('pro','grow','equal')",
                        name='ck_pricing_quote_cheaper'),
        CheckConstraint("cheaper_first_year IN ('pro','grow','equal')",
                        name='ck_pricing_quote_cheaper_yr1'),
        CheckConstraint('hectares >= 0', name='ck_pricing_quote_hectares'),
        CheckConstraint('sites >= 0', name='ck_pricing_quote_sites'),
        Index('ix_pricing_quote_created', text('created_at DESC')),
        Index('ix_pricing_quote_user', 'public_user_id'),
    )

    def __repr__(self):
        return (f"<InsightsPricingQuote(id={self.id}, ha={self.hectares}, "
                f"sites={self.sites}, cheaper={self.cheaper!r})>")


class InsightsProEnquiry(Base):
    """Somebody asking for Insights Pro.

    There is no self-serve purchase — access is arranged and invoiced through
    Xero — so this table IS the funnel. `status` exists so it can be worked;
    without it this would be a write-only log that nobody opens twice.
    """
    __tablename__ = 'insights_pro_enquiry'

    STATUSES = ('new', 'contacted', 'converted', 'declined')

    id = Column(Integer, primary_key=True, index=True)

    # Set when the enquiry came from a signed-in visitor. The form still
    # carries its own name and email, because the person enquiring is not
    # necessarily the person the account belongs to.
    public_user_id = Column(
        Integer, ForeignKey('public_users.id', ondelete='SET NULL'),
        nullable=True,
    )

    name = Column(String(120), nullable=False)
    email = Column(String(254), nullable=False)
    phone = Column(String(40), nullable=True)
    business = Column(String(160), nullable=True)
    region = Column(String(120), nullable=True)
    hectares = Column(Numeric(10, 2), nullable=True)
    sites = Column(SmallInteger, nullable=True)
    message = Column(Text, nullable=True)

    source = Column(String(32), nullable=False, server_default='pro_page')
    status = Column(String(16), nullable=False, server_default='new')

    created_at = Column(DateTime(timezone=True),
                        server_default=text('NOW()'), nullable=False)
    updated_at = Column(DateTime(timezone=True),
                        server_default=text('NOW()'), nullable=False)

    user = relationship('PublicUser', foreign_keys=[public_user_id])

    __table_args__ = (
        CheckConstraint("status IN ('new','contacted','converted','declined')",
                        name='ck_pro_enquiry_status'),
        Index('ix_pro_enquiry_created', text('created_at DESC')),
        Index('ix_pro_enquiry_status', 'status'),
    )

    def __repr__(self):
        return f"<InsightsProEnquiry(id={self.id}, email={self.email!r}, status={self.status!r})>"
