# GET /taste/bootstrap — hydrate everything live for the user, from the typed tables.
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from core.auth import get_current_taste_user
from db.base import get_db
from db.models import ENTITY_MODELS

router = APIRouter()


@router.get("/bootstrap")
def bootstrap(db: Session = Depends(get_db), user_id: int = Depends(get_current_taste_user)):
    entities: dict[str, list] = {}
    for entity, model in ENTITY_MODELS.items():
        rows = db.query(model).filter(model.user_id == user_id, model.deleted.is_(False)).all()
        if rows:
            entities[entity] = [r.to_client() for r in rows]
    return {"entities": entities, "server_time": datetime.now(timezone.utc).isoformat()}
