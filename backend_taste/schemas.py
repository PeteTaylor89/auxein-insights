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

from pydantic import BaseModel, ConfigDict


class _Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    version: int = 1
    deleted: bool = False


# ---------------------------------------------------------------- template
class TemplateFields(BaseModel):
    name: Optional[str] = None
    kind: Optional[str] = None
    is_builtin: Optional[bool] = False
    sections: Optional[Any] = None


class TemplateCreate(TemplateFields):
    id: str


class TemplateUpdate(TemplateFields):
    pass


class TemplateOut(TemplateFields, _Out):
    user_id: Optional[int] = None


# ---------------------------------------------------------------- event
class EventFields(BaseModel):
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


class EventOut(EventFields, _Out):
    pass


# ---------------------------------------------------------------- wine
class WineFields(BaseModel):
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


class WineOut(WineFields, _Out):
    pass


# ---------------------------------------------------------------- note
class NoteFields(BaseModel):
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


class NoteOut(NoteFields, _Out):
    pass


# ---------------------------------------------------------------- flight
class FlightFields(BaseModel):
    event_id: Optional[str] = None
    name: Optional[str] = None
    blind: Optional[bool] = False
    general_notes: Optional[str] = None
    note_ids: Optional[List[str]] = None


class FlightCreate(FlightFields):
    id: str


class FlightUpdate(FlightFields):
    pass


class FlightOut(FlightFields, _Out):
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
