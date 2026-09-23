# backend_taste/api/shares.py — grant, revoke and set the reach of a row (F2).
#
# Mounted at /taste/v1. Every route is authed; only an OWNER may change who can
# see their row. An editor can change the row's contents and cannot change its
# audience — that distinction is the whole reason `require(..., "owner")` and
# not `require(..., "edit")` appears below.
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import schemas as s
from core import security
from core.access import require, subject_type_for
from core.auth import get_current_user
from db.base import get_db
from db.models import SHAREABLE_MODELS, Share, User

router = APIRouter()

VALID_ROLES = ("view", "comment", "edit")
VALID_VISIBILITY = ("private", "link", "group", "public")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _model_for(subject_type: str):
    model = SHAREABLE_MODELS.get(subject_type)
    if model is None:
        raise HTTPException(status_code=422, detail=f"'{subject_type}' is not shareable")
    return model


def _load(db: Session, subject_type: str, subject_id: str):
    model = _model_for(subject_type)
    row = db.query(model).filter(model.id == subject_id, model.deleted.is_(False)).first()
    return model, row


@router.post("/shares", response_model=s.ShareOut, status_code=201)
def create_share(body: s.ShareCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.role not in VALID_ROLES:
        raise HTTPException(status_code=422, detail=f"role must be one of {VALID_ROLES}")

    model, row = _load(db, body.subject_type, body.subject_id)
    # 404 for a row the caller cannot see, so this route cannot be used to test
    # whether an id exists.
    require(db, model, row, user, "owner")

    if (body.grantee_handle is None) == (body.grantee_id is None):
        raise HTTPException(status_code=422, detail="Supply exactly one of grantee_handle or grantee_id")

    if body.grantee_handle is not None:
        grantee = db.query(User).filter(User.handle == body.grantee_handle.strip().lower()).first()
    else:
        grantee = db.query(User).filter(User.id == body.grantee_id).first()
    if grantee is None or grantee.status != "active":
        raise HTTPException(status_code=404, detail="No such user")
    if grantee.id == user.id:
        raise HTTPException(status_code=422, detail="You already own this")

    existing = db.query(Share).filter(
        Share.subject_type == body.subject_type,
        Share.subject_id == body.subject_id,
        Share.grantee_type == "user",
        Share.grantee_id == grantee.id,
    ).first()

    if existing is not None:
        # Update in place rather than insert. The unique constraint would reject
        # a second row anyway, and re-granting should not be able to leave a
        # stale grant behind that a later revoke misses.
        existing.role = body.role
        existing.expires_at = body.expires_at
        existing.revoked_at = None
        existing.granted_by = user.id
        db.commit()
        db.refresh(existing)
        return existing

    share = Share(
        subject_type=body.subject_type,
        subject_id=body.subject_id,
        grantee_type="user",
        grantee_id=grantee.id,
        role=body.role,
        granted_by=user.id,
        expires_at=body.expires_at,
    )
    db.add(share)
    db.commit()
    db.refresh(share)
    return share


@router.get("/shares", response_model=list[s.ShareOut])
def list_shares(
    subject_type: Optional[str] = None,
    subject_id: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = Query(200, le=1000),
):
    """Grants ON one of my rows, or — with no subject — every grant made TO me."""
    q = db.query(Share).filter(Share.revoked_at.is_(None))

    if subject_type and subject_id:
        model, row = _load(db, subject_type, subject_id)
        require(db, model, row, user, "owner")
        q = q.filter(Share.subject_type == subject_type, Share.subject_id == subject_id)
    else:
        q = q.filter(Share.grantee_type == "user", Share.grantee_id == user.id)

    return q.order_by(Share.created_at.desc()).limit(limit).all()


@router.delete("/shares/{share_id}", status_code=204)
def revoke_share(share_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    share = db.query(Share).filter(Share.id == share_id).first()
    if share is None:
        raise HTTPException(status_code=404, detail="Not found")

    model, row = _load(db, share.subject_type, share.subject_id)
    # The owner can revoke; so can the grantee, because declining access someone
    # gave you should not require asking them.
    if not (share.grantee_type == "user" and share.grantee_id == user.id):
        require(db, model, row, user, "owner")

    # Soft, so an audit can still answer "who had access in March".
    share.revoked_at = _now()
    db.commit()


# Literal first segment on purpose. A route beginning with a wildcard sits at
# the same level as /templates, /notes, /auth and /public, and the first
# matching pattern wins — so a leading wildcard is a shadowing bug waiting for
# someone to add an entity whose name happens to fit.
@router.put("/visibility/{subject_type}/{subject_id}")
def set_visibility(
    subject_type: str,
    subject_id: str,
    body: s.VisibilityIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Set a row's own reach, minting or clearing its slug as a side effect."""
    if body.visibility not in VALID_VISIBILITY:
        raise HTTPException(status_code=422, detail=f"visibility must be one of {VALID_VISIBILITY}")
    if body.visibility == "group":
        # Accepting it would create rows that no code can resolve, and a row the
        # owner believes is shared but which nobody can open is worse than a refusal.
        raise HTTPException(status_code=422, detail="Group visibility needs groups (S1), which do not exist yet")

    model, row = _load(db, subject_type, subject_id)
    require(db, model, row, user, "owner")
    subject_type_for(model)  # guard: refuses an entity wired up without being declared shareable

    row.visibility = body.visibility
    if body.visibility == "private":
        # Dropping the slug is what makes "make it private again" actually
        # revoke the old URL rather than merely hide the row from listings.
        row.share_slug = None
    elif not row.share_slug:
        row.share_slug = security.new_share_slug()
    row.updated_at = _now()
    row.version = (row.version or 0) + 1
    db.commit()
    return {"visibility": row.visibility, "share_slug": row.share_slug}
