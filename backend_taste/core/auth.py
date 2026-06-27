# backend_taste/core/auth.py — identity from the existing Insights public JWT.
# Validates the signature with the shared SECRET_KEY and returns public_users.id
# as a loose int. No Taste user table, no cross-schema FK, no public_users query
# (the signature is trust enough) — keeps Taste fully decoupled from Insights.
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from core.config import settings

security = HTTPBearer()


def get_current_taste_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> int:
    """Decode the public JWT → public_users.id. Raises 401 on any failure."""
    try:
        payload = jwt.decode(credentials.credentials, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if payload.get("type") != "public_access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    user_id = payload.get("user_id")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token: no user_id")
    return int(user_id)
