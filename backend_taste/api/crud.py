# backend_taste/api/crud.py
# Generic per-entity CRUD router factory. Every entity gets the same five routes
# (list / detail / create / patch / soft-delete), generated once so the entities
# can't drift apart.
#
# F2 (2026-09-21): the owner filter that used to BE the authorisation model is
# now one clause inside `core.access`. Reads resolve through `visible_filter`
# (owner, plus live grants, plus public where the entity allows it); writes
# resolve through `require()`, which distinguishes view / comment / edit / owner.
#
# THIS FACTORY IS FOR AUTHENTICATED CALLERS ONLY. Anonymous reads live in
# api/public.py, by hand. Do not add an "anonymous" flag here — the owner filter
# being unconditional is what makes this file safe to generate.
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from core.access import require, visible_filter
from core.auth import get_current_user
from db.base import get_db
from db.models import User

# Columns the server assigns — never copied from a client body. `share_slug` is
# absent from client schemas too, but listing it here means a hand-built payload
# cannot smuggle one in either.
SERVER_FIELDS = {"id", "user_id", "created_at", "updated_at", "version", "deleted", "share_slug"}

# Foreign-key filters offered on every list endpoint; applied only when the model
# actually has that column (e.g. note_id on photos, wine_id on notes).
_FK_FILTERS = ("wine_id", "flight_id", "event_id", "note_id")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def make_crud_router(*, model, out_schema, create_schema, update_schema,
                    owner_optional: bool = False, after_write=None):
    """Build a CRUD APIRouter for one entity.

    `after_write(db, row, user)` runs inside the same transaction as a create or
    patch, before the commit. It exists for `wines`, which joins the canonical
    catalogue on save (F3). It must never raise — a failure in a secondary
    concern must not lose the row the user actually wrote — and the one
    implementation of it enforces that itself.

    owner_optional=True (templates): the entity has global builtin rows, which
    carry a NULL user_id and are visible to everyone but read-only. Post-0006
    those rows are also `visibility='public'`, and `visible_filter` matches on
    both — the flag survives as the switch for "this entity has builtins",
    because no other entity should union public rows into a personal list.
    """
    router = APIRouter()

    def scoped(q, user: User):
        return q.filter(visible_filter(model, user, include_public=owner_optional))

    def get_visible(db: Session, user: User, item_id: str, *, need: str = "view"):
        """Fetch a row and assert a role on it.

        Deliberately NOT scoped in the query: `require()` returns 404 for a row
        the caller cannot see, so the two paths agree, and fetching first lets
        the access decision explain itself (403 for "you may read but not
        write") instead of collapsing everything into "not found".
        """
        row = db.query(model).filter(model.id == item_id).first()
        require(db, model, row, user, need)
        return row

    @router.get("", response_model=list[out_schema])
    def list_items(
        db: Session = Depends(get_db),
        user: User = Depends(get_current_user),
        include_deleted: bool = False,
        skip: int = 0,
        limit: int = Query(500, le=2000),
        wine_id: Optional[str] = None,
        flight_id: Optional[str] = None,
        event_id: Optional[str] = None,
        note_id: Optional[str] = None,
    ):
        q = scoped(db.query(model), user)
        if not include_deleted:
            q = q.filter(model.deleted.is_(False))
        filters = {"wine_id": wine_id, "flight_id": flight_id, "event_id": event_id, "note_id": note_id}
        for field in _FK_FILTERS:
            val = filters[field]
            if val is not None and hasattr(model, field):
                q = q.filter(getattr(model, field) == val)
        return q.order_by(model.updated_at.desc()).offset(skip).limit(limit).all()

    @router.get("/{item_id}", response_model=out_schema)
    def get_item(item_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
        return get_visible(db, user, item_id)

    @router.post("", response_model=out_schema, status_code=201)
    def create_item(payload: create_schema, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
        # exclude_none, not a full dump: `visibility` is NOT NULL with a server
        # default and the Create schema defaults it to None, so a full dump
        # would insert a null into it. On create there is no prior value to
        # clear, so omitting a null loses nothing.
        data = payload.model_dump(exclude_none=True)
        item_id = data.pop("id")
        # Checked across the WHOLE table, not the caller's rows: ids are
        # client-generated UUIDs, and a collision with someone else's row must
        # fail loudly rather than 404 confusingly later.
        if db.query(model).filter(model.id == item_id).first() is not None:
            raise HTTPException(status_code=409, detail="id already exists")
        ts = _now()
        row = model(id=item_id, user_id=user.id, created_at=ts, updated_at=ts, version=1, deleted=False)
        assign(row, data)
        db.add(row)
        if after_write is not None:
            db.flush()  # the hook needs the row to have landed
            after_write(db, row, user)
        db.commit()
        db.refresh(row)
        return row

    @router.patch("/{item_id}", response_model=out_schema)
    def update_item(item_id: str, payload: update_schema, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
        row = get_visible(db, user, item_id, need="edit")
        data = payload.model_dump(exclude_unset=True)
        # A null here would violate the NOT NULL column. Clearing visibility is
        # not a meaningful request anyway — "no reach" is spelled 'private', and
        # changing reach goes through PUT /{type}/{id}/visibility so the slug is
        # minted or cleared with it.
        if "visibility" in data and data["visibility"] is None:
            data.pop("visibility")
        # Visibility is the owner's call, not an editor's. Someone granted
        # `edit` may change what the row says; publishing it to the world is a
        # different decision and belongs to whoever owns it (see api/shares.py).
        if "visibility" in data:
            require(db, model, row, user, "owner")
        assign(row, data)
        row.updated_at = _now()
        row.version = (row.version or 0) + 1
        if after_write is not None:
            after_write(db, row, user)
        db.commit()
        db.refresh(row)
        return row

    @router.delete("/{item_id}", status_code=204)
    def delete_item(item_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
        # Owner, not editor. An editor can rewrite a note; deleting someone
        # else's row is not an editing operation.
        row = get_visible(db, user, item_id, need="owner")
        row.deleted = True
        row.updated_at = _now()
        row.version = (row.version or 0) + 1
        db.commit()

    return router


def assign(row, data: dict) -> None:
    """Copy client-supplied fields onto the row.

    Nulls are applied, not skipped: a PATCH that explicitly sends null is the
    client CLEARING a field, and dropping it here would make that silently fail.
    Callers are responsible for not handing a null to a NOT NULL column — see
    `visibility` in create_item and update_item.
    """
    for k, v in data.items():
        if k not in SERVER_FIELDS and hasattr(row, k):
            setattr(row, k, v)
