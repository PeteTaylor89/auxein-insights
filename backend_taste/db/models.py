# backend_taste/db/models.py
# Typed tables, one per entity, all in schema `taste`. The PWA's Dexie is still the
# system of record at capture; the server mirrors each client row into real columns
# (scalars promoted to typed columns, nested/variable data kept as JSONB) so the DB
# is queryable. The sync wire protocol is unchanged — payload in, columns out.
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.inspection import inspect as sqla_inspect

from db.base import Base

SCHEMA = {"schema": "taste"}


def parse_dt(value: Any) -> Optional[datetime]:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


class SyncMixin:
    """Common sync columns + generic payload<->columns mapping.

    Column names match the client row field names exactly, so applying a payload
    and serialising back is a straight per-column copy. created_at/updated_at are
    real timestamps (updated_at drives LWW); other date-like fields (tasted_at,
    event.date, photo.taken_at) stay strings to round-trip the client verbatim.
    """

    id = Column(String, primary_key=True)
    user_id = Column(Integer, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True))
    updated_at = Column(DateTime(timezone=True), nullable=False)
    version = Column(Integer, nullable=False, default=1)
    deleted = Column(Boolean, nullable=False, default=False)

    # Columns the server owns — never taken from the client payload directly.
    _SERVER_COLS = {"id", "user_id", "updated_at", "version", "deleted"}
    _DT_COLS = {"created_at", "updated_at"}

    def apply(self, payload: Dict[str, Any], user_id: int, updated_at: datetime, version: int, deleted: bool) -> None:
        cols = {c.key for c in sqla_inspect(type(self)).columns}
        for key in cols - self._SERVER_COLS:
            if key in payload:
                val = payload[key]
                if key in self._DT_COLS:
                    val = parse_dt(val)
                setattr(self, key, val)
        self.user_id = user_id
        self.updated_at = updated_at
        self.version = version
        self.deleted = deleted

    def to_client(self) -> Dict[str, Any]:
        out: Dict[str, Any] = {}
        for c in sqla_inspect(type(self)).columns:
            if c.key == "user_id":
                continue
            val = getattr(self, c.key)
            if isinstance(val, datetime):
                val = val.isoformat()
            out[c.key] = val
        return out


class Template(SyncMixin, Base):
    __tablename__ = "templates"
    __table_args__ = SCHEMA
    name = Column(String)
    kind = Column(String)
    is_builtin = Column(Boolean, default=False)
    sections = Column(JSONB)


class Event(SyncMixin, Base):
    __tablename__ = "events"
    __table_args__ = SCHEMA
    name = Column(String)
    date = Column(String)
    location_text = Column(String)
    host = Column(String)
    attendees = Column(JSONB)
    theme = Column(String)
    general_notes = Column(String)
    default_blind = Column(Boolean, default=False)
    default_template_id = Column(String)


class Wine(SyncMixin, Base):
    __tablename__ = "wines"
    __table_args__ = SCHEMA
    producer = Column(String)
    label = Column(String)
    vintage = Column(Integer)
    variety = Column(JSONB)
    geo_country = Column(String)
    geo_region = Column(String)
    geo_subregion_appellation = Column(String)
    geo_vineyard = Column(String)
    geo_ref_id = Column(String)
    price = Column(Float)
    source = Column(String)
    abv = Column(Float)


class Note(SyncMixin, Base):
    __tablename__ = "notes"
    __table_args__ = SCHEMA
    wine_id = Column(String, index=True)
    event_id = Column(String, index=True)
    template_id = Column(String)
    template_version = Column(Integer)
    template_snapshot = Column(JSONB)
    values = Column(JSONB)
    general_notes = Column(String)
    tasted_at = Column(String)
    blind = Column(Boolean, default=False)
    revealed = Column(Boolean, default=False)
    blind_conclusions = Column(JSONB)
    score = Column(Float)
    flight_id = Column(String, index=True)
    flight_position = Column(Integer)
    glass_color = Column(String)
    photos = Column(JSONB)


class Flight(SyncMixin, Base):
    __tablename__ = "flights"
    __table_args__ = SCHEMA
    event_id = Column(String, index=True)
    name = Column(String)
    blind = Column(Boolean, default=False)
    general_notes = Column(String)
    note_ids = Column(JSONB)


class Photo(SyncMixin, Base):
    __tablename__ = "photos"
    __table_args__ = SCHEMA
    note_id = Column(String, index=True)
    s3_key = Column(String)
    status = Column(String)
    width = Column(Integer)
    height = Column(Integer)
    taken_at = Column(String)


# Wire entity name -> model. Order matters for bootstrap/pull (templates/wines
# before the notes that reference them).
ENTITY_MODELS = {
    "template": Template,
    "event": Event,
    "wine": Wine,
    "flight": Flight,
    "note": Note,
    "photo": Photo,
}

ENTITIES = set(ENTITY_MODELS)
