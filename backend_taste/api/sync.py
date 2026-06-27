# POST /taste/sync — push the client outbox, pull deltas (Story 6.2).
# Conflict policy v1: last-write-wins by updated_at. Soft-delete propagates.
from datetime import datetime, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from core.auth import get_current_taste_user
from db.base import get_db
from db.models import ENTITIES, Record

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

    # ---- push ----
    for m in body.outbox:
        if m.entity not in ENTITIES:
            continue
        incoming_ts = parse_iso(m.updated_at)
        existing = db.query(Record).filter(Record.id == m.id, Record.user_id == user_id).first()

        # Last-write-wins: a strictly-newer server row wins; still ack the client.
        if existing and existing.updated_at and existing.updated_at > incoming_ts:
            applied.append(m.id)
            continue

        deleted = m.op == "delete"
        payload = m.payload if m.payload is not None else (existing.payload if existing else {})
        if existing:
            existing.entity = m.entity
            existing.payload = payload
            existing.updated_at = incoming_ts
            existing.version = m.version
            existing.deleted = deleted
        else:
            db.add(
                Record(
                    id=m.id,
                    entity=m.entity,
                    user_id=user_id,
                    payload=payload,
                    updated_at=incoming_ts,
                    version=m.version,
                    deleted=deleted,
                )
            )
        applied.append(m.id)

    db.commit()

    # ---- pull (everything changed since last_pulled_at, incl. deletes) ----
    q = db.query(Record).filter(Record.user_id == user_id)
    if body.last_pulled_at:
        q = q.filter(Record.updated_at > parse_iso(body.last_pulled_at))

    pull: dict[str, list] = {}
    for r in q.all():
        data = dict(r.payload) if isinstance(r.payload, dict) else {"_payload": r.payload}
        # Overlay the authoritative sync fields so the client applies LWW correctly.
        data["id"] = r.id
        data["updated_at"] = r.updated_at.isoformat() if r.updated_at else None
        data["version"] = r.version
        data["deleted"] = r.deleted
        pull.setdefault(r.entity, []).append(data)

    return {"applied": applied, "pull": pull, "server_time": datetime.now(timezone.utc).isoformat()}
