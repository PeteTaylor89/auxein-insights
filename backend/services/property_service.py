# services/property_service.py - Property visibility & ownership helpers (Phase A, Grow V1)
from typing import List
from sqlalchemy.orm import Session
from fastapi import HTTPException
from db.models.property import Property
from db.models.management_relationship import ManagementRelationship
from db.models.user_property_scope import UserPropertyScope
from db.models.block import VineyardBlock
from db.models.user import User


OWNER_READONLY_MSG = (
    "This property is under external management. "
    "Contact the managing company to make changes."
)


def get_visible_property_ids(db: Session, current_user: User) -> List[int]:
    """
    Returns property IDs visible to the current user.

    Rules (in order):
    1. auxein_admin -> all properties
    2. company_manager/company_user with UserPropertyScope rows -> scoped to those properties
    3. company_admin/company_manager/company_user with NO scope rows ->
       all properties where their company is the active managing_company_id
       UNION all properties where their company is the owner_company_id
    4. contractor -> empty list (contractors access via task assignment, not property scope)
    """
    if current_user.user_type == "auxein_admin":
        return [row[0] for row in db.query(Property.id).all()]

    if current_user.user_type == "contractor":
        return []

    # Check for explicit property scoping
    scopes = db.query(UserPropertyScope.property_id).filter(
        UserPropertyScope.user_id == current_user.id
    ).all()

    if scopes:
        return [s[0] for s in scopes]

    # Default: all managed + all owned
    managed = db.query(ManagementRelationship.property_id).filter(
        ManagementRelationship.managing_company_id == current_user.company_id,
        ManagementRelationship.is_active == True
    ).all()

    owned = db.query(Property.id).filter(
        Property.owner_company_id == current_user.company_id
    ).all()

    return list({row[0] for row in managed} | {row[0] for row in owned})


def is_owner_viewing(db: Session, current_user: User, property_id: int) -> bool:
    """
    Returns True if the current user's company is the legal owner of the property
    but NOT the active managing company.

    This flag gates write operations: owners get read-only access to their properties
    when under external management. Enforced at endpoint level.
    """
    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        return False
    if prop.owner_company_id != current_user.company_id:
        return False

    active_manager = db.query(ManagementRelationship).filter(
        ManagementRelationship.property_id == property_id,
        ManagementRelationship.is_active == True
    ).first()

    if not active_manager:
        return False

    return active_manager.managing_company_id != current_user.company_id


def verify_block_access(
    db: Session, current_user: User, block_id: int, require_write: bool = False
) -> VineyardBlock:
    """
    Unified block access check supporting both company_id and property_id paths.

    Returns the block if access is granted.
    Raises 404 if block doesn't exist, 403 if access denied or owner read-only.
    """
    block = db.query(VineyardBlock).filter(VineyardBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")

    # auxein_admin bypasses all checks
    if current_user.user_type == "auxein_admin":
        return block

    # Check access via property path or legacy company_id
    has_access = False
    if block.property_id:
        visible_ids = get_visible_property_ids(db, current_user)
        if block.property_id in visible_ids:
            has_access = True
    if not has_access and block.company_id == current_user.company_id:
        has_access = True

    if not has_access:
        raise HTTPException(status_code=403, detail="Access denied")

    # Owner read-only gate on write operations
    if require_write and block.property_id:
        if is_owner_viewing(db, current_user, block.property_id):
            raise HTTPException(status_code=403, detail=OWNER_READONLY_MSG)

    return block
