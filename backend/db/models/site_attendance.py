# db/models/site_attendance.py — who is on a property, right now.
#
# A THIRD register alongside VisitorVisit and ContractorMovement, and
# deliberately so. Those two describe people who do not work here: a visitor has
# a host and an induction, a contractor has equipment declarations and a
# relationship. Staff attendance has none of that and needs something neither
# has — a cheap, high-frequency, open-ended "I am here now" that a person
# records for themselves, every day, in one tap.
#
# Reusing either would have meant a nullable subject column and a guard on every
# existing query in two live compliance surfaces. The site-access report already
# merges two sources; merging three is a small change in one place.
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, ForeignKey, Numeric, Index, func, text,
)
from sqlalchemy.orm import relationship

from db.base_class import Base


class SiteAttendance(Base):
    """One presence on one property: signed on, and eventually signed off.

    `signed_out_at IS NULL` means ON SITE. That is the whole query behind "who
    is here", and it is why the partial unique index below matters more than it
    looks: without it, a double-tap or an offline replay leaves a person signed
    in twice and the headcount is wrong in a way nobody notices until it is
    being read off in an evacuation.
    """
    __tablename__ = "site_attendance"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"),
                     nullable=False, index=True)
    # The property, not the block. Sign-on is about being on a SITE — which gate
    # you came through and who to account for in an evacuation — and asking a
    # person to pick a block to walk onto a property would be the friction that
    # stops them bothering.
    property_id = Column(Integer, ForeignKey("properties.id", ondelete="CASCADE"),
                         nullable=False, index=True)

    signed_in_at = Column(DateTime(timezone=True), nullable=False,
                          server_default=func.now())
    #: NULL means still on site.
    signed_out_at = Column(DateTime(timezone=True), nullable=True)

    # Where they were when they signed on, if the phone knew. Optional on
    # purpose: a sign-on that fails because GPS is slow under canopy is a
    # sign-on that does not happen.
    sign_in_latitude = Column(Numeric(10, 7), nullable=True)
    sign_in_longitude = Column(Numeric(10, 7), nullable=True)
    sign_out_latitude = Column(Numeric(10, 7), nullable=True)
    sign_out_longitude = Column(Numeric(10, 7), nullable=True)

    notes = Column(Text, nullable=True)
    # 'self' — the normal case — or 'auto_switch' / 'manager' when someone else
    # or something else closed it, so a shift that was closed FOR a person is
    # tellable from one they closed themselves.
    signed_out_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"),
                              nullable=True)
    sign_out_reason = Column(String(20), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", foreign_keys=[user_id])
    # `assigned_property`, not `property` — the attribute name would shadow the
    # builtin and break the `@property` below it, which is exactly what it did.
    # asset.py, incident.py and map_feature.py all use this name already.
    assigned_property = relationship("Property", foreign_keys=[property_id])

    __table_args__ = (
        # "Who is on site" is this query, so it gets the index.
        Index("ix_site_attendance_open", "company_id", "signed_out_at"),
        # A person's own history, newest first.
        Index("ix_site_attendance_user_time", "user_id", "signed_in_at"),
        # AT MOST ONE open attendance per person, enforced by the database.
        # A double tap, a retry, or an offline replay would otherwise leave
        # someone signed in twice and the headcount silently wrong — a number
        # that only ever gets read carefully during an evacuation. Declared here
        # as well as in the migration so the model describes the real schema.
        Index(
            "uq_site_attendance_open", "user_id",
            unique=True,
            postgresql_where=text("signed_out_at IS NULL"),
        ),
    )

    @property
    def is_on_site(self) -> bool:
        return self.signed_out_at is None

    def __repr__(self) -> str:
        state = "on site" if self.is_on_site else "signed out"
        return (f"<SiteAttendance(user={self.user_id}, property={self.property_id}, "
                f"{state})>")
