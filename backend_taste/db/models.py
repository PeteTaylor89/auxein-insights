# backend_taste/db/models.py
# Generic sync store. The PWA's Dexie is the system of record at capture; this
# table is a durable, last-write-wins relay keyed by the client UUID. One row per
# client record; the full row travels in `payload` (JSONB) so the server stays
# agnostic to the evolving template/note shape. All rows live in schema `taste`.
from sqlalchemy import Boolean, Column, DateTime, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB

from db.base import Base

# Sync-tracked entity kinds (geoRegions is reference data, seed-shipped, not synced).
ENTITIES = {"template", "event", "wine", "note", "flight", "photo"}


class Record(Base):
    __tablename__ = "records"
    __table_args__ = (
        Index("ix_taste_records_user_entity", "user_id", "entity"),
        Index("ix_taste_records_user_updated", "user_id", "updated_at"),
        {"schema": "taste"},
    )

    id = Column(String, primary_key=True)  # client-generated UUIDv4
    entity = Column(String, nullable=False)
    user_id = Column(Integer, nullable=False)  # loose ref to public_users.id (no FK)
    payload = Column(JSONB, nullable=False)  # the full client row
    updated_at = Column(DateTime(timezone=True), nullable=False)  # drives LWW
    version = Column(Integer, nullable=False, default=1)
    deleted = Column(Boolean, nullable=False, default=False)
