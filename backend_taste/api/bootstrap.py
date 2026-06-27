# GET /taste/bootstrap — hydrate everything live for the user (Story 6.2).
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from core.auth import get_current_taste_user
from db.base import get_db
from db.models import Record

router = APIRouter()


@router.get("/bootstrap")
def bootstrap(db: Session = Depends(get_db), user_id: int = Depends(get_current_taste_user)):
    rows = (
        db.query(Record)
        .filter(Record.user_id == user_id, Record.deleted.is_(False))
        .all()
    )
    entities: dict[str, list] = {}
    for r in rows:
        entities.setdefault(r.entity, []).append(r.payload)
    return {"entities": entities, "server_time": datetime.now(timezone.utc).isoformat()}
