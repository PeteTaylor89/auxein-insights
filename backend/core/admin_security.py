# core/admin_security.py - Admin Authentication via Email Domain
from fastapi import Depends, HTTPException, status
from db.models.public_user import PublicUser
from core.public_security import get_current_public_user

ADMIN_DOMAIN = "auxein.co.nz"


def is_admin_email(email: str) -> bool:
    """Check if email belongs to admin domain."""
    if not email:
        return False
    return email.lower().endswith(f"@{ADMIN_DOMAIN}")


async def get_current_admin_user(
    current_user: PublicUser = Depends(get_current_public_user)
) -> PublicUser:
    """
    Dependency that ensures the current user is an admin.
    
    Admin status is determined by email domain (@auxein.co.nz).
    Raises 403 if user is not an admin.
    """
    if not is_admin_email(current_user.email):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


# Alias for cleaner imports
require_admin = get_current_admin_user