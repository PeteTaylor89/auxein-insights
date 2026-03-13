# api/v1/properties.py - Property CRUD, management relationships, user property scopes (Phase A, Grow V1)
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from db.session import get_db
from db.models.user import User
from db.models.property import Property
from db.models.management_relationship import ManagementRelationship
from db.models.user_property_scope import UserPropertyScope
from db.models.block import VineyardBlock
from api.deps import get_current_user
from schemas.property import (
    PropertyCreate, PropertyUpdate, PropertyOut,
    ManagementRelationshipCreate, ManagementRelationshipOut,
    UserPropertyScopeCreate, UserPropertyScopeOut,
)
from services.property_service import get_visible_property_ids, is_owner_viewing

logger = logging.getLogger(__name__)
router = APIRouter()


# ==================== PROPERTY CRUD ====================

@router.get("/", response_model=List[PropertyOut])
def list_properties(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List properties visible to the current user."""
    if not current_user.has_permission("properties", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    visible_ids = get_visible_property_ids(db, current_user)
    if not visible_ids:
        return []

    properties = db.query(Property).filter(Property.id.in_(visible_ids)).all()

    # Enrich with active managing company id
    result = []
    for prop in properties:
        out = PropertyOut.model_validate(prop)
        active_rel = db.query(ManagementRelationship).filter(
            ManagementRelationship.property_id == prop.id,
            ManagementRelationship.is_active == True
        ).first()
        out.active_managing_company_id = active_rel.managing_company_id if active_rel else None
        result.append(out)

    return result


@router.post("/", response_model=PropertyOut, status_code=status.HTTP_201_CREATED)
def create_property(
    property_in: PropertyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new property. company_admin+ only."""
    if not current_user.has_permission("properties", "create"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    prop = Property(**property_in.model_dump())
    db.add(prop)
    db.commit()
    db.refresh(prop)

    logger.info(f"Property {prop.id} created by user {current_user.id}")
    return PropertyOut.model_validate(prop)


@router.get("/{property_id}", response_model=PropertyOut)
def get_property(
    property_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single property by ID."""
    if not current_user.has_permission("properties", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    visible_ids = get_visible_property_ids(db, current_user)
    if property_id not in visible_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")

    out = PropertyOut.model_validate(prop)
    active_rel = db.query(ManagementRelationship).filter(
        ManagementRelationship.property_id == prop.id,
        ManagementRelationship.is_active == True
    ).first()
    out.active_managing_company_id = active_rel.managing_company_id if active_rel else None
    return out


@router.patch("/{property_id}", response_model=PropertyOut)
def update_property(
    property_id: int,
    property_in: PropertyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a property. company_admin+ only. 403 if owner viewing."""
    if not current_user.has_permission("properties", "update"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    if is_owner_viewing(db, current_user, property_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This property is under external management. Contact the managing company to make changes."
        )

    visible_ids = get_visible_property_ids(db, current_user)
    if property_id not in visible_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")

    update_data = property_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(prop, field, value)

    db.commit()
    db.refresh(prop)
    logger.info(f"Property {prop.id} updated by user {current_user.id}")
    return PropertyOut.model_validate(prop)


@router.get("/{property_id}/blocks")
def get_property_blocks(
    property_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all blocks for a property."""
    if not current_user.has_permission("properties", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    visible_ids = get_visible_property_ids(db, current_user)
    if property_id not in visible_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    blocks = db.query(VineyardBlock).filter(VineyardBlock.property_id == property_id).all()
    return blocks


# ==================== MANAGEMENT RELATIONSHIPS ====================

@router.get("/{property_id}/management-history", response_model=List[ManagementRelationshipOut])
def get_management_history(
    property_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all management relationships for a property, ordered by start_date desc."""
    if not current_user.has_permission("properties", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    visible_ids = get_visible_property_ids(db, current_user)
    if property_id not in visible_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    relationships = db.query(ManagementRelationship).filter(
        ManagementRelationship.property_id == property_id
    ).order_by(ManagementRelationship.start_date.desc()).all()

    return relationships


@router.post("/{property_id}/management-relationships", response_model=ManagementRelationshipOut, status_code=status.HTTP_201_CREATED)
def create_management_relationship(
    property_id: int,
    rel_in: ManagementRelationshipCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Transfer management of a property to a new company. company_admin+ only."""
    if not current_user.has_permission("properties", "manage"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    visible_ids = get_visible_property_ids(db, current_user)
    if property_id not in visible_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    from services.management_service import transfer_management

    try:
        new_rel = transfer_management(
            db=db,
            property_id=property_id,
            new_managing_company_id=rel_in.managing_company_id,
            start_date=rel_in.start_date,
            contract_reference=rel_in.contract_reference,
            created_by_user_id=current_user.id,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return new_rel


# ==================== USER PROPERTY SCOPES (A9) ====================

@router.get("/users/{user_id}/property-scopes", response_model=List[UserPropertyScopeOut])
def get_user_property_scopes(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get property scopes for a user. If empty, user sees all company-managed properties."""
    if not current_user.has_permission("users", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    scopes = db.query(UserPropertyScope).filter(
        UserPropertyScope.user_id == user_id
    ).all()
    return scopes


@router.post("/users/{user_id}/property-scopes", response_model=UserPropertyScopeOut, status_code=status.HTTP_201_CREATED)
def add_user_property_scope(
    user_id: int,
    scope_in: UserPropertyScopeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a property to a user's scope. company_admin+ only."""
    if not current_user.has_permission("users", "update"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    # Verify property exists and is visible
    visible_ids = get_visible_property_ids(db, current_user)
    if scope_in.property_id not in visible_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Property not found or not accessible")

    # Check for duplicate
    existing = db.query(UserPropertyScope).filter(
        UserPropertyScope.user_id == user_id,
        UserPropertyScope.property_id == scope_in.property_id
    ).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Scope already exists")

    scope = UserPropertyScope(user_id=user_id, property_id=scope_in.property_id)
    db.add(scope)
    db.commit()
    db.refresh(scope)
    return scope


@router.delete("/users/{user_id}/property-scopes/{property_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_user_property_scope(
    user_id: int,
    property_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a property from a user's scope."""
    if not current_user.has_permission("users", "update"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    scope = db.query(UserPropertyScope).filter(
        UserPropertyScope.user_id == user_id,
        UserPropertyScope.property_id == property_id
    ).first()

    if not scope:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scope not found")

    db.delete(scope)
    db.commit()
