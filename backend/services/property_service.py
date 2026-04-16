# services/property_service.py - Property visibility & access helpers (Grow V1, Revision 2)
from typing import List
from sqlalchemy.orm import Session
from fastapi import HTTPException
from db.models.property import Property
from db.models.management_relationship import ManagementRelationship
from db.models.user_property_scope import UserPropertyScope
from db.models.block import VineyardBlock
from db.models.user import User


def get_visible_property_ids(db: Session, current_user: User) -> List[int]:
    """
    Returns property IDs visible to the current user.

    Rules (in order):
    1. auxein_admin -> all properties
    2. contractor -> empty list (access via task assignment, not property scope)
    3. company_admin -> all properties where company is active manager OR owner
       (scopes ignored — admins always see everything in their company)
    4. company_manager/company_user with UserPropertyScope rows -> scoped only
    5. company_manager/company_user with NO scope rows -> all managed + owned
    """
    if current_user.user_type == "auxein_admin":
        return [row[0] for row in db.query(Property.id).all()]

    if current_user.user_type == "contractor":
        return []

    # company_admin always sees all company properties (scopes ignored)
    if current_user.user_type == "company_admin":
        return _get_all_company_property_ids(db, current_user.company_id)

    # company_manager/company_user: check for explicit scoping
    scopes = db.query(UserPropertyScope.property_id).filter(
        UserPropertyScope.user_id == current_user.id
    ).all()

    if scopes:
        return [s[0] for s in scopes]

    # No scopes = see all managed + owned (backward compatible)
    return _get_all_company_property_ids(db, current_user.company_id)


def _get_all_company_property_ids(db: Session, company_id: int) -> List[int]:
    """Get all property IDs where company is active manager OR owner."""
    managed = db.query(ManagementRelationship.property_id).filter(
        ManagementRelationship.managing_company_id == company_id,
        ManagementRelationship.is_active == True
    ).all()

    owned = db.query(Property.id).filter(
        Property.owner_company_id == company_id
    ).all()

    return list({row[0] for row in managed} | {row[0] for row in owned})


def verify_block_access(
    db: Session, current_user: User, block_id: int, require_write: bool = False
) -> VineyardBlock:
    """
    Unified block access check supporting both company_id and property_id paths.

    Returns the block if access is granted.
    Raises 404 if block doesn't exist, 403 if access denied.
    """
    block = db.query(VineyardBlock).filter(VineyardBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")

    # auxein_admin bypasses all checks
    if current_user.user_type == "auxein_admin":
        return block

    # Property-scoped: must be in user's visible properties.
    # Legacy fallback (company_id match) only applies when block has no property_id.
    has_access = False
    if block.property_id:
        visible_ids = get_visible_property_ids(db, current_user)
        if block.property_id in visible_ids:
            has_access = True
    else:
        if block.company_id == current_user.company_id:
            has_access = True

    if not has_access:
        raise HTTPException(status_code=403, detail="Access denied")

    return block
