# backend_taste/api/public.py — the anonymous read surface (F2).
#
# THIS FILE IS THE ONE THAT CAN LEAK EVERYTHING, so it is deliberately small,
# separate, and written out by hand.
#
# Two rules it exists to enforce:
#
# 1. It NEVER uses `make_crud_router`. That factory's owner filter is the only
#    thing standing between a user's rows and the internet; a public route built
#    on it is one forgotten argument away from serving the whole table.
#
# 2. It uses `get_optional_user`, not the default bearer dependency. `HTTPBearer()`
#    defaults to auto_error=True and raises 403 while RESOLVING the dependency —
#    before the route body runs — so a public route wired to the normal auth
#    dependency rejects every anonymous caller no matter what its body says.
#
# A row is served here only when it is reachable by slug AND its visibility still
# says so. Both conditions are in the same WHERE clause on purpose: making a row
# private clears its slug, but a query that trusted the slug alone would keep
# serving anything whose slug was ever published.
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import schemas as s
from core.auth import get_optional_user
from db.base import get_db
from db.models import SHAREABLE_MODELS, User

router = APIRouter()

# Only these visibilities are reachable without a login. 'private' is excluded
# for obvious reasons; 'group' is excluded because groups do not exist yet and a
# group row must not degrade to public while that is true.
PUBLICLY_READABLE = ("link", "public")

_OUT_SCHEMAS = {
    "template": s.TemplateOut,
    "event": s.EventOut,
    "wine": s.WineOut,
    "note": s.NoteOut,
    "flight": s.FlightOut,
}


@router.get("/public/{subject_type}/{slug}")
def read_by_slug(
    subject_type: str,
    slug: str,
    db: Session = Depends(get_db),
    viewer: Optional[User] = Depends(get_optional_user),
):
    """Read one shared row by its slug. Anonymous callers welcome.

    `viewer` is resolved but not required — it is here so a signed-in visitor
    following a share link is still recognisable for later features (attribution
    on a fork, a comment). Access does NOT depend on it.
    """
    model = SHAREABLE_MODELS.get(subject_type)
    out_schema = _OUT_SCHEMAS.get(subject_type)
    if model is None or out_schema is None:
        raise HTTPException(status_code=404, detail="Not found")

    row = (
        db.query(model)
        .filter(
            model.share_slug == slug,
            model.visibility.in_(PUBLICLY_READABLE),
            model.deleted.is_(False),
            # F4. In the same WHERE clause as the rest for the same reason: a
            # hidden row must stop resolving the moment it is hidden, and a
            # check that lives anywhere else is a check that can be skipped.
            model.hidden_at.is_(None),
        )
        .first()
    )
    if row is None:
        # 404 for every failure — wrong slug, revoked share, deleted row. A
        # distinct 403 would confirm that a slug was once valid.
        raise HTTPException(status_code=404, detail="Not found")

    return out_schema.model_validate(row)
