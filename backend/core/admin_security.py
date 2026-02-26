# core/admin_security.py - Admin Authentication via is_admin flag
from fastapi import Depends, HTTPException, status
from db.models.public_user import PublicUser
from core.public_security import get_current_public_user


async def get_current_admin_user(
    current_user: PublicUser = Depends(get_current_public_user)
) -> PublicUser:
    """
    Dependency that ensures the current user is an admin.

    Admin status is determined by the is_admin field on PublicUser.
    Raises 403 if user is not an admin.
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


# Alias for cleaner imports
require_admin = get_current_admin_user