# backend_taste/schemas.py
# Pydantic v2 schemas, one block per entity. Convention per entity:
#   <Entity>Fields  — editable business fields, all optional (the client sends what
#                     it has). Shared by Create/Update so the field list lives once.
#   <Entity>Create  — Fields + required client-generated UUID `id`.
#   <Entity>Update  — Fields (all optional) for PATCH.
#   <Entity>Out     — Fields + server-owned id/timestamps/version/deleted (from ORM).
# Server owns id(assignment)/created_at/updated_at/version/deleted — never taken
# from the client body except `id` on create.
from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr


class _Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    version: int = 1
    deleted: bool = False


class _Shareable(BaseModel):
    """Read side of F2/F4. `share_slug` and the `hidden_*` fields are
    output-only — they are in SyncMixin._SERVER_COLS, so a client that sends one
    is ignored, not obeyed."""
    model_config = ConfigDict(from_attributes=True)
    visibility: str = "private"
    share_slug: Optional[str] = None
    # Serialised so the OWNER can be told their row was hidden and why. Nobody
    # else can read the row at all, so there is nothing leaked by carrying it.
    hidden_at: Optional[datetime] = None
    hidden_reason: Optional[str] = None


# ---------------------------------------------------------------- template
class TemplateFields(BaseModel):
    visibility: Optional[str] = None
    name: Optional[str] = None
    kind: Optional[str] = None
    is_builtin: Optional[bool] = False
    sections: Optional[Any] = None


class TemplateCreate(TemplateFields):
    id: str


class TemplateUpdate(TemplateFields):
    pass


class TemplateOut(TemplateFields, _Shareable, _Out):
    user_id: Optional[int] = None


# ---------------------------------------------------------------- event
class EventFields(BaseModel):
    visibility: Optional[str] = None
    name: Optional[str] = None
    date: Optional[str] = None
    location_text: Optional[str] = None
    host: Optional[str] = None
    attendees: Optional[Any] = None
    theme: Optional[str] = None
    general_notes: Optional[str] = None
    default_blind: Optional[bool] = False
    default_template_id: Optional[str] = None


class EventCreate(EventFields):
    id: str


class EventUpdate(EventFields):
    pass


class EventOut(EventFields, _Shareable, _Out):
    pass


# ---------------------------------------------------------------- wine
class WineFields(BaseModel):
    visibility: Optional[str] = None
    producer: Optional[str] = None
    label: Optional[str] = None
    vintage: Optional[int] = None
    variety: Optional[List[str]] = None
    geo_country: Optional[str] = None
    geo_region: Optional[str] = None
    geo_subregion_appellation: Optional[str] = None
    geo_vineyard: Optional[str] = None
    geo_ref_id: Optional[str] = None
    price: Optional[float] = None
    source: Optional[str] = None
    abv: Optional[float] = None


class WineCreate(WineFields):
    id: str


class WineUpdate(WineFields):
    pass


class WineOut(WineFields, _Shareable, _Out):
    # Server-owned (it is in SyncMixin._SERVER_COLS): a client that could choose
    # its own canonical id would be choosing someone else's wine. NULL is an
    # ordinary state — the row is complete without one.
    wine_ref_id: Optional[str] = None
    pass


# ---------------------------------------------------------------- note
class NoteFields(BaseModel):
    visibility: Optional[str] = None
    wine_id: Optional[str] = None
    event_id: Optional[str] = None
    template_id: Optional[str] = None
    template_version: Optional[int] = None
    template_snapshot: Optional[Any] = None
    values: Optional[Any] = None
    general_notes: Optional[str] = None
    tasted_at: Optional[str] = None
    blind: Optional[bool] = False
    revealed: Optional[bool] = False
    blind_conclusions: Optional[Any] = None
    score: Optional[float] = None
    flight_id: Optional[str] = None
    flight_position: Optional[int] = None
    glass_color: Optional[str] = None
    photos: Optional[Any] = None


class NoteCreate(NoteFields):
    id: str


class NoteUpdate(NoteFields):
    pass


class NoteOut(NoteFields, _Shareable, _Out):
    pass


# ---------------------------------------------------------------- flight
class FlightFields(BaseModel):
    visibility: Optional[str] = None
    event_id: Optional[str] = None
    name: Optional[str] = None
    blind: Optional[bool] = False
    general_notes: Optional[str] = None
    note_ids: Optional[List[str]] = None


class FlightCreate(FlightFields):
    id: str


class FlightUpdate(FlightFields):
    pass


class FlightOut(FlightFields, _Shareable, _Out):
    pass


# ---------------------------------------------------------------- photo
class PhotoFields(BaseModel):
    note_id: Optional[str] = None
    s3_key: Optional[str] = None
    status: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    taken_at: Optional[str] = None


class PhotoCreate(PhotoFields):
    id: str


class PhotoUpdate(PhotoFields):
    pass


class PhotoOut(PhotoFields, _Out):
    pass


# ---------------------------------------------------------------- vocab
class VocabFields(BaseModel):
    dimension: str
    group_label: Optional[str] = None
    term: str


class VocabCreate(VocabFields):
    id: str


class VocabOut(VocabFields, _Out):
    pass


# ---------------------------------------------------------------- region (read-only)
class RegionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    parent_id: Optional[str] = None
    level: int = 0
    kind: Optional[str] = None
    name: str
    country_code: Optional[str] = None
    path: Optional[str] = None
    aliases: Optional[List[str]] = None
    gi_id: Optional[str] = None


# ---------------------------------------------------------------- auth (F1)
class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    display_name: Optional[str] = None
    # Optional at sign-up on purpose: a handle is public and near-permanent, and
    # making someone choose one before they have seen the product is how people
    # end up stuck with a handle they dislike. The app can prompt later.
    handle: Optional[str] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class MeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    handle: Optional[str] = None
    display_name: Optional[str] = None
    bio: Optional[str] = None
    avatar_s3_key: Optional[str] = None
    role: str = "user"
    status: str = "active"
    is_verified: bool = False
    created_at: Optional[datetime] = None


class MeUpdate(BaseModel):
    handle: Optional[str] = None
    display_name: Optional[str] = None
    bio: Optional[str] = None
    avatar_s3_key: Optional[str] = None


class PasswordChangeIn(BaseModel):
    current_password: Optional[str] = None
    new_password: str


class PasswordResetRequestIn(BaseModel):
    email: EmailStr


class PasswordResetIn(BaseModel):
    token: str
    new_password: str


class VerifyIn(BaseModel):
    token: str


# ---------------------------------------------------------------- shares (F2)
class ShareCreate(BaseModel):
    subject_type: str
    subject_id: str
    # A handle is the addressable name; a raw user id is not something a person
    # can type. Exactly one of the two must be supplied.
    grantee_handle: Optional[str] = None
    grantee_id: Optional[int] = None
    role: str = "view"
    expires_at: Optional[datetime] = None


class ShareOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    subject_type: str
    subject_id: str
    grantee_type: str
    grantee_id: int
    role: str
    granted_by: int
    created_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None


class VisibilityIn(BaseModel):
    visibility: str


# ---------------------------------------------------------------- catalogue (F3)
class WineRefOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    producer: str
    label: Optional[str] = None
    vintage: Optional[int] = None
    variety: Optional[Any] = None
    region_id: Optional[str] = None
    status: str = "active"
    merged_into_id: Optional[str] = None
    verified: bool = False
    created_at: Optional[datetime] = None
    # `dedupe_key` and the `*_norm` columns are deliberately NOT exposed. They
    # are matching internals; publishing them invites a client to compute its
    # own and decide two wines are the same, which is the one judgement this
    # service keeps for itself.


class WineProposalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    wine_id: Optional[str] = None
    proposed_by: int
    producer: str
    label: Optional[str] = None
    vintage: Optional[int] = None
    region_id: Optional[str] = None
    state: str
    resolved_ref_id: Optional[str] = None
    review_note: Optional[str] = None
    created_at: Optional[datetime] = None


class WineSuggestion(BaseModel):
    ref: WineRefOut
    score: float


class ReviewNote(BaseModel):
    note: Optional[str] = None


class DuplicateOf(BaseModel):
    ref_id: str


class MergeInto(BaseModel):
    into_id: str


class MergeResult(BaseModel):
    merged_into: str
    wines_moved: int


class WineMergeLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    action: str
    ref_id: str
    source_ref_id: Optional[str] = None
    proposal_id: Optional[int] = None
    actor_id: Optional[int] = None
    affected_wines: int = 0
    detail: Optional[Any] = None
    created_at: Optional[datetime] = None


# ---------------------------------------------------------------- moderation (F4)
class ReportCreate(BaseModel):
    subject_type: str
    subject_id: str
    reason: str
    detail: Optional[str] = None


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    subject_type: str
    subject_id: str
    reported_by: int
    reason: str
    detail: Optional[str] = None
    state: str
    review_note: Optional[str] = None
    created_at: Optional[datetime] = None
    # `reviewed_by` is deliberately NOT exposed. A reporter learning WHICH
    # moderator actioned their report turns a moderation decision into a person
    # to argue with.


class ResolveReport(BaseModel):
    state: str  # actioned | dismissed
    note: Optional[str] = None


class HideRequest(BaseModel):
    subject_type: str
    subject_id: str
    # Required, not optional: an unexplained hide is useless to the owner it is
    # shown to and to whoever reviews it later.
    reason: str
    report_id: Optional[int] = None


class UnhideRequest(BaseModel):
    subject_type: Optional[str] = None
    subject_id: Optional[str] = None
    reason: Optional[str] = None


class SuspendRequest(BaseModel):
    reason: str
    report_id: Optional[int] = None


class ModerationLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    action: str
    subject_type: str
    subject_id: str
    actor_id: int
    report_id: Optional[int] = None
    reason: Optional[str] = None
    detail: Optional[Any] = None
    created_at: Optional[datetime] = None
