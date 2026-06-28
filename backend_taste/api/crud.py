# backend_taste/api/crud.py
# Generic per-entity CRUD router factory. Every entity gets the same five routes
# (list / detail / create / patch / soft-delete), all scoped to the authed taste
# user. Mirrors the explicit Grow/Insights routers but generated once so the six
# entities can't drift apart.
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from core.auth import get_current_taste_user
from db.base import get_db

# Columns the server assigns — never copied from a client body.
SERVER_FIELDS = {"id", "user_id", "created_at", "updated_at", "version", "deleted"}

# Foreign-key filters offered on every list endpoint; applied only when the model
# actually has that column (e.g. note_id on photos, wine_id on notes).
_FK_FILTERS = ("wine_id", "flight_id", "event_id", "note_id")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def make_crud_router(*, model, out_schema, create_schema, update_schema, owner_optional: bool = False):
    """Build a CRUD APIRouter for one entity.

    owner_optional=True (templates): rows with NULL user_id are global builtins —
    visible to everyone and read-only; users still create/edit their own rows.
    """
    router = APIRouter()

    def scoped(q, user_id: int):
        if owner_optional:
            return q.filter(or_(model.user_id == user_id, model.user_id.is_(None)))
        return q.filter(model.user_id == user_id)

    def get_owned(db: Session, user_id: int, item_id: str, *, for_write: bool = False):
        row = scoped(db.query(model).filter(model.id == item_id), user_id).first()
        if row is None:
            raise HTTPException(status_code=404, detail="Not found")
        if for_write and owner_optional and row.user_id is None:
            raise HTTPException(status_code=403, detail="Builtin is read-only; duplicate it to edit")
        return row

    def assign(row, data: dict) -> None:
        for k, v in data.items():
            if k not in SERVER_FIELDS and hasattr(row, k):
                setattr(row, k, v)

    @router.get("", response_model=list[out_schema])
    def list_items(
        db: Session = Depends(get_db),
        user_id: int = Depends(get_current_taste_user),
        include_deleted: bool = False,
        skip: int = 0,
        limit: int = Query(500, le=2000),
        wine_id: Optional[str] = None,
        flight_id: Optional[str] = None,
        event_id: Optional[str] = None,
        note_id: Optional[str] = None,
    ):
        q = scoped(db.query(model), user_id)
        if not include_deleted:
            q = q.filter(model.deleted.is_(False))
        filters = {"wine_id": wine_id, "flight_id": flight_id, "event_id": event_id, "note_id": note_id}
        for field in _FK_FILTERS:
            val = filters[field]
            if val is not None and hasattr(model, field):
                q = q.filter(getattr(model, field) == val)
        return q.order_by(model.updated_at.desc()).offset(skip).limit(limit).all()

    @router.get("/{item_id}", response_model=out_schema)
    def get_item(item_id: str, db: Session = Depends(get_db), user_id: int = Depends(get_current_taste_user)):
        return get_owned(db, user_id, item_id)

    @router.post("", response_model=out_schema, status_code=201)
    def create_item(payload: create_schema, db: Session = Depends(get_db), user_id: int = Depends(get_current_taste_user)):
        data = payload.model_dump()
        item_id = data.pop("id")
        if db.query(model).filter(model.id == item_id).first() is not None:
            raise HTTPException(status_code=409, detail="id already exists")
        ts = _now()
        row = model(id=item_id, user_id=user_id, created_at=ts, updated_at=ts, version=1, deleted=False)
        assign(row, data)
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    @router.patch("/{item_id}", response_model=out_schema)
    def update_item(item_id: str, payload: update_schema, db: Session = Depends(get_db), user_id: int = Depends(get_current_taste_user)):
        row = get_owned(db, user_id, item_id, for_write=True)
        assign(row, payload.model_dump(exclude_unset=True))
        row.updated_at = _now()
        row.version = (row.version or 0) + 1
        db.commit()
        db.refresh(row)
        return row

    @router.delete("/{item_id}", status_code=204)
    def delete_item(item_id: str, db: Session = Depends(get_db), user_id: int = Depends(get_current_taste_user)):
        row = get_owned(db, user_id, item_id, for_write=True)
        row.deleted = True
        row.updated_at = _now()
        row.version = (row.version or 0) + 1
        db.commit()

    return router
