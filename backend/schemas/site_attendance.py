# backend/schemas/site_attendance.py — signing on and off a property.
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field


class SignInRequest(BaseModel):
    property_id: int
    latitude: Optional[Decimal] = None
    longitude: Optional[Decimal] = None
    notes: Optional[str] = None
    #: Close an open attendance somewhere else and open one here.
    #: Without it, signing on while already on another property is REFUSED —
    #: the client has to have seen where they were before moving them.
    switch: bool = False


class SignOutRequest(BaseModel):
    latitude: Optional[Decimal] = None
    longitude: Optional[Decimal] = None
    notes: Optional[str] = None


class AttendanceOut(BaseModel):
    id: int
    user_id: int
    user_name: Optional[str] = None
    property_id: int
    property_name: Optional[str] = None
    signed_in_at: datetime
    signed_out_at: Optional[datetime] = None
    on_site: bool = False
    #: Whole minutes on site — elapsed if still here, total if signed out.
    minutes: Optional[int] = None
    notes: Optional[str] = None
    sign_out_reason: Optional[str] = None

    class Config:
        from_attributes = True


class PropertyOption(BaseModel):
    """A property this person can sign on to, ordered for a one-tap choice."""
    id: int
    name: str
    #: How many people are on it now — a cheap sanity check that you are
    #: picking the site the rest of the crew picked.
    on_site_count: int = 0
    #: True for the property this person signed on to last. The client puts it
    #: first, which is what makes the common case one tap.
    is_recent: bool = False


class AttendanceStatus(BaseModel):
    """Everything the sign-on screen needs, in one request.

    One call on purpose: the screen has to be usable in a gateway with one bar
    of signal, and three round trips is three chances to fail.
    """
    current: Optional[AttendanceOut] = None
    properties: List[PropertyOption] = Field(default_factory=list)


class OnSiteSummary(BaseModel):
    """Who is on site now, for a manager."""
    total: int = 0
    by_property: List["OnSitePropertyRow"] = Field(default_factory=list)
    people: List[AttendanceOut] = Field(default_factory=list)


class OnSitePropertyRow(BaseModel):
    property_id: Optional[int] = None
    property_name: Optional[str] = None
    count: int = 0


OnSiteSummary.model_rebuild()
