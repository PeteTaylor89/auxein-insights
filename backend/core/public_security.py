# core/public_security.py - JWT Security Helpers for Public Auth
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
import secrets

from core.config import settings
from api.deps import get_db

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT settings
SECRET_KEY = settings.SECRET_KEY
ALGORITHM = settings.ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days for public users

# Bearer token scheme
security = HTTPBearer()

# The OPTIONAL bearer scheme, for endpoints that must also serve anonymous
# callers. `HTTPBearer()` defaults to `auto_error=True`, which raises **403
# Not authenticated** when the Authorization header is absent — and it raises it
# while RESOLVING the dependency, before the function body runs. So an endpoint
# declaring `Depends(get_optional_public_user)` rejected every signed-out
# request with a 403, and that function's own `if credentials is None: return
# None` branch was unreachable in production. `auto_error=False` hands the body
# a None instead, which is what the whole free tier depends on.
optional_security = HTTPBearer(auto_error=False)

def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a JWT access token.
    
    Args:
        data: Dictionary with user data (typically user_id and email)
        expires_delta: Optional custom expiration time
    
    Returns:
        Encoded JWT token string
    """
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "public_access"  # Distinguish from main app tokens
    })
    
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str) -> dict:
    """
    Decode and verify a JWT access token.
    
    Args:
        token: JWT token string
    
    Returns:
        Dictionary with token payload
    
    Raises:
        HTTPException: If token is invalid or expired
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        
        # Verify this is a public access token
        if payload.get("type") != "public_access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        return payload
    
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

def generate_verification_token() -> str:
    """Generate a secure random token for email verification"""
    return secrets.token_urlsafe(32)

def generate_reset_token() -> str:
    """Generate a secure random token for password reset"""
    return secrets.token_urlsafe(32)

async def get_current_public_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """
    Dependency to get the current authenticated public user.
    
    Args:
        credentials: Bearer token from request header
        db: Database session
    
    Returns:
        PublicUser object
    
    Raises:
        HTTPException: If user not found or not authenticated
    """
    from db.models.public_user import PublicUser
    
    # Decode token
    payload = decode_access_token(credentials.credentials)
    
    # Extract user_id from token
    user_id: int = payload.get("user_id")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Get user from database
    user = db.query(PublicUser).filter(PublicUser.id == user_id).first()
    
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check if user can login (active and verified)
    if not user.can_login:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is not active or not verified",
        )
    
    # Update last_active timestamp whenever user makes an authenticated request
    user.update_last_active()
    db.commit()
    
    return user

async def get_any_authenticated_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """
    Flexible dependency that accepts EITHER a Pro app token (type: "access")
    or a public token (type: "public_access").

    Returns the user object (User or PublicUser) or raises 401.
    Used for read-only data endpoints (regions/GIs GeoJSON) that should
    be accessible from both the Pro app and the Insights app.
    """
    import logging
    logger = logging.getLogger(__name__)
    from db.models.public_user import PublicUser
    from db.models.user import User

    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as e:
        logger.warning(f"[get_any_authenticated_user] JWT decode failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_type = payload.get("type")
    logger.info(f"[get_any_authenticated_user] token_type={token_type}, keys={list(payload.keys())}")

    if token_type == "public_access":
        # Public user token
        user_id = payload.get("user_id")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token: no user_id")
        user = db.query(PublicUser).filter(PublicUser.id == user_id).first()
        if user is None or not user.can_login:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Public user not found or inactive")
        return user

    elif token_type == "access":
        # Pro app token — subject is user ID
        sub = payload.get("sub")
        logger.info(f"[get_any_authenticated_user] Pro token sub={sub}")
        if sub is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token: no sub")
        user = db.query(User).filter(User.id == int(sub)).first()
        if user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Pro user not found: {sub}")
        if user.user_type == "contractor":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Contractors cannot access Insights",
            )
        return user

    else:
        logger.warning(f"[get_any_authenticated_user] Unknown token type: {token_type}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token type: {token_type}",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_insights_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    """
    Canonical Insights gate. Resolves EITHER token type to a single PublicUser
    identity, so all downstream Insights code stays single-table:

      - public_access token  -> the PublicUser directly
      - access token (Grow)  -> the matching PublicUser (by verified email)

    One-way by construction: Grow routes use get_current_user(), which rejects
    public_access tokens, so Insights subscribers never gain Grow access.

    A Grow token is resolved (and lazily provisioned) to a linked projection row
    by ensure_insights_profile — link by grow_user_id, else adopt by email, else
    create. So every Grow user gets an Insights identity on first crossing.
    """
    from db.models.public_user import PublicUser
    from db.models.user import User
    from services.insights_profile import ensure_insights_profile

    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_type = payload.get("type")

    # --- Insights-native subscriber ---
    if token_type == "public_access":
        user_id = payload.get("user_id")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token: no user_id")
        public_user = db.query(PublicUser).filter(PublicUser.id == user_id).first()
        if public_user is None or not public_user.can_login:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Public user not found or inactive")
        public_user.update_last_active()
        db.commit()
        return public_user

    # --- Grow user crossing into Insights ---
    if token_type == "access":
        sub = payload.get("sub")
        if sub is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token: no sub")
        grow_user = db.query(User).filter(User.id == int(sub)).first()
        if grow_user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Grow user not found")
        if grow_user.user_type == "contractor":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Contractors cannot access Insights",
            )

        # Link / adopt / create the projection row, then return it.
        public_user = ensure_insights_profile(db, grow_user)
        public_user.update_last_active()
        db.commit()
        return public_user

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=f"Invalid token type: {token_type}",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_optional_public_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security),
    db: Session = Depends(get_db)
):
    """
    Dependency to optionally get the current authenticated public user.
    Returns None if no valid token provided.
    
    Useful for endpoints that work differently for authenticated vs anonymous users.
    """
    if credentials is None:
        return None
    
    try:
        return await get_current_public_user(credentials, db)
    except HTTPException:
        return None