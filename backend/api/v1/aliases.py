# api/v1/aliases.py - External alias CRUD endpoints (Grow V1, Revision 2)
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from db.session import get_db
from db.models.user import User
from db.models.external_alias import ExternalAlias
from api.deps import get_current_user
from schemas.external_alias import ExternalAliasCreate, ExternalAliasUpdate, ExternalAliasOut

logger = logging.getLogger(__name__)
router = APIRouter()


def get_alias(
    db: Session, company_id: int, entity_type: str, entity_id: int, system_name: str
) -> Optional[str]:
    """Utility: look up a single external_id. Returns None if not found."""
    row = db.query(ExternalAlias.external_id).filter(
        ExternalAlias.company_id == company_id,
        ExternalAlias.entity_type == entity_type,
        ExternalAlias.entity_id == entity_id,
        ExternalAlias.system_name == system_name,
    ).first()
    return row[0] if row else None


def get_aliases_for_entity(
    db: Session, company_id: int, entity_type: str, entity_id: int
) -> List[ExternalAlias]:
    """Utility: get all aliases for a specific entity."""
    return db.query(ExternalAlias).filter(
        ExternalAlias.company_id == company_id,
        ExternalAlias.entity_type == entity_type,
        ExternalAlias.entity_id == entity_id,
    ).all()


# ==================== LIST ====================

@router.get("/", response_model=List[ExternalAliasOut])
def list_aliases(
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[int] = Query(None),
    system_name: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List external aliases for the current user's company. Filterable."""
    if not current_user.has_permission("settings", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    query = db.query(ExternalAlias).filter(
        ExternalAlias.company_id == current_user.company_id
    )

    if entity_type:
        query = query.filter(ExternalAlias.entity_type == entity_type)
    if entity_id is not None:
        query = query.filter(ExternalAlias.entity_id == entity_id)
    if system_name:
        query = query.filter(ExternalAlias.system_name == system_name)

    return query.order_by(ExternalAlias.entity_type, ExternalAlias.entity_id).offset(skip).limit(limit).all()


# ==================== CREATE ====================

@router.post("/", response_model=ExternalAliasOut, status_code=status.HTTP_201_CREATED)
def create_alias(
    alias_in: ExternalAliasCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new external alias. company_admin only."""
    if not current_user.has_permission("settings", "update"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    # Check for duplicate
    existing = db.query(ExternalAlias).filter(
        ExternalAlias.company_id == current_user.company_id,
        ExternalAlias.entity_type == alias_in.entity_type,
        ExternalAlias.entity_id == alias_in.entity_id,
        ExternalAlias.system_name == alias_in.system_name,
    ).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Alias already exists for {alias_in.entity_type}:{alias_in.entity_id} in {alias_in.system_name}"
        )

    alias = ExternalAlias(
        company_id=current_user.company_id,
        entity_type=alias_in.entity_type,
        entity_id=alias_in.entity_id,
        system_name=alias_in.system_name,
        external_id=alias_in.external_id,
        external_label=alias_in.external_label,
        extra=alias_in.extra,
    )
    db.add(alias)
    db.commit()
    db.refresh(alias)

    logger.info(f"Alias created: {alias.entity_type}:{alias.entity_id} -> {alias.system_name}:{alias.external_id}")
    return alias


# ==================== UPDATE ====================

@router.patch("/{alias_id}", response_model=ExternalAliasOut)
def update_alias(
    alias_id: int,
    alias_update: ExternalAliasUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an external alias. company_admin only."""
    if not current_user.has_permission("settings", "update"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    alias = db.query(ExternalAlias).filter(
        ExternalAlias.id == alias_id,
        ExternalAlias.company_id == current_user.company_id,
    ).first()

    if not alias:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alias not found")

    update_data = alias_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(alias, field, value)

    db.commit()
    db.refresh(alias)
    return alias


# ==================== DELETE ====================

@router.delete("/{alias_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_alias(
    alias_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete an external alias. company_admin only."""
    if not current_user.has_permission("settings", "update"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    alias = db.query(ExternalAlias).filter(
        ExternalAlias.id == alias_id,
        ExternalAlias.company_id == current_user.company_id,
    ).first()

    if not alias:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alias not found")

    db.delete(alias)
    db.commit()
    return None
