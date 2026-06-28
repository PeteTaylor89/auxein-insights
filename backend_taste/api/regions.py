# backend_taste/api/regions.py
# Read-only wine-geography reference data for the origin typeahead. Global (not
# user-scoped); the client fetches once and filters in memory.
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from core.auth import get_current_taste_user
from db.base import get_db
from db.models import Region
from schemas import RegionOut

router = APIRouter()


@router.get("/regions", response_model=list[RegionOut])
def list_regions(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_taste_user),
    search: Optional[str] = None,
    country: Optional[str] = None,
    limit: int = Query(3000, le=5000),
):
    q = db.query(Region)
    if country:
        q = q.filter(Region.country_code == country)
    if search:
        q = q.filter(func.lower(Region.name).like(f"%{search.lower()}%"))
    return q.order_by(Region.level, Region.name).limit(limit).all()
