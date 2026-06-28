# POST /taste/sync — push the client outbox, pull deltas. Typed tables: each
# mutation routes to its entity's table. Conflict policy v1: last-write-wins by
# updated_at. Soft-delete propagates.
from datetime import datetime, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from core.auth import get_current_taste_user
from db.base import get_db
from db.models import ENTITY_MODELS

router = APIRouter()


def parse_iso(s: Optional[str]) -> datetime:
    """Parse a client ISO timestamp; tolerate a trailing 'Z' and naive values."""
    if not s:
        return datetime.now(timezone.utc)
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


class Mutation(BaseModel):
    entity: str
    op: str  # 'upsert' | 'delete'
    id: str
    payload: Optional[Any] = None
    updated_at: str
    version: int = 1


class SyncIn(BaseModel):
    outbox: List[Mutation] = []
    last_pulled_at: Optional[str] = None


@router.post("/sync")
def sync(body: SyncIn, db: Session = Depends(get_db), user_id: int = Depends(get_current_taste_user)):
    applied: List[str] = []
    # Rows touched in THIS batch (the outbox often has several mutations per id;
    # autoflush is off, so reuse the in-flight row instead of re-querying/-inserting).
    seen: dict = {}

    # ---- push ----
    for m in body.outbox:
        model = ENTITY_MODELS.get(m.entity)
        if model is None:
            continue
        incoming_ts = parse_iso(m.updated_at)
        key = (m.entity, m.id)
        existing = seen.get(key) or db.query(model).filter(model.id == m.id, model.user_id == user_id).first()

        # Last-write-wins: a strictly-newer server row wins; still ack the client.
        if existing is not None and existing.updated_at and existing.updated_at > incoming_ts:
            applied.append(m.id)
            continue

        payload = m.payload if isinstance(m.payload, dict) else {}
        deleted = m.op == "delete"
        if existing is None:
            existing = model(id=m.id)
            db.add(existing)
        # For a delete with no payload, apply({}) preserves the row's columns and
        # only flips the soft-delete flag.
        existing.apply(payload, user_id, incoming_ts, m.version, deleted)
        seen[key] = existing
        applied.append(m.id)

    db.commit()

    # ---- pull (everything changed since last_pulled_at, incl. deletes) ----
    since = parse_iso(body.last_pulled_at) if body.last_pulled_at else None
    pull: dict[str, list] = {}
    for entity, model in ENTITY_MODELS.items():
        q = db.query(model).filter(model.user_id == user_id)
        if since is not None:
            q = q.filter(model.updated_at > since)
        rows = q.all()
        if rows:
            pull[entity] = [r.to_client() for r in rows]

    return {"applied": applied, "pull": pull, "server_time": datetime.now(timezone.utc).isoformat()}
