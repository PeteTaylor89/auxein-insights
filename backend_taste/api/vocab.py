# backend_taste/api/vocab.py
# Per-user tasting vocabulary. Terms the user adds while tasting (varieties, regions,
# aroma/taste descriptors) are stored here so their pickers grow and sync across
# devices. Content-deduped: one row per (user, dimension, group_label, term) — the
# client can POST freely without creating duplicates. Not part of the legacy sync
# entity set; REST-only.
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

import schemas as s
from core.auth import get_current_taste_user
from db.base import get_db
from db.models import Vocab

router = APIRouter()


def _now() -> datetime:
    return datetime.now(timezone.utc)


@router.get("/vocab", response_model=list[s.VocabOut])
def list_vocab(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_taste_user),
    dimension: Optional[str] = None,
    group_label: Optional[str] = None,
):
    q = db.query(Vocab).filter(Vocab.user_id == user_id, Vocab.deleted.is_(False))
    if dimension is not None:
        q = q.filter(Vocab.dimension == dimension)
    if group_label is not None:
        q = q.filter(Vocab.group_label == group_label)
    return q.order_by(Vocab.dimension, Vocab.term).all()


@router.post("/vocab", response_model=s.VocabOut, status_code=201)
def add_vocab(
    payload: s.VocabCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_taste_user),
):
    term = (payload.term or "").strip()
    if not term:
        raise HTTPException(status_code=422, detail="term required")
    group_label = payload.group_label
    group_filter = Vocab.group_label.is_(None) if group_label is None else Vocab.group_label == group_label

    # One row per (user, dimension, group, term) — case-insensitive. Revive a
    # previously-removed term rather than creating a duplicate.
    existing = (
        db.query(Vocab)
        .filter(
            Vocab.user_id == user_id,
            Vocab.dimension == payload.dimension,
            group_filter,
            func.lower(Vocab.term) == term.lower(),
        )
        .first()
    )
    ts = _now()
    if existing is not None:
        if existing.deleted:
            existing.deleted = False
            existing.updated_at = ts
            existing.version = (existing.version or 0) + 1
            db.commit()
            db.refresh(existing)
        return existing

    row = Vocab(
        id=payload.id,
        user_id=user_id,
        dimension=payload.dimension,
        group_label=group_label,
        term=term,
        created_at=ts,
        updated_at=ts,
        version=1,
        deleted=False,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/vocab/{item_id}", status_code=204)
def delete_vocab(
    item_id: str,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_taste_user),
):
    row = db.query(Vocab).filter(Vocab.id == item_id, Vocab.user_id == user_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    row.deleted = True
    row.updated_at = _now()
    row.version = (row.version or 0) + 1
    db.commit()
