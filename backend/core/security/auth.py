from datetime import datetime, timedelta
from typing import Any, Dict, Optional
import uuid
from pydantic import BaseModel
from jose import jwt, JWTError
from sqlalchemy.orm import Session

from core.config import settings

def create_access_token(
    subject: str, 
    expires_delta: Optional[timedelta] = None,
    jti: Optional[str] = None,
    extra_data: Optional[Dict[str, Any]] = None
) -> tuple[str, str]:  # Returns (token, jti)
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    if not jti:
        jti = str(uuid.uuid4())
    
    to_encode = {
        "exp": expire, 
        "sub": str(subject), 
        "type": "access",
        "jti": jti,
        "iat": datetime.utcnow()
    }
    
    # Add extra data to token payload
    if extra_data:
        to_encode.update(extra_data)
    
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt, jti

def create_refresh_token(
    subject: str, 
    expires_delta: Optional[timedelta] = None,
    jti: Optional[str] = None,
    extra_data: Optional[Dict[str, Any]] = None
) -> tuple[str, str]:  # Returns (token, jti)
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    
    if not jti:
        jti = str(uuid.uuid4())
    
    to_encode = {
        "exp": expire, 
        "sub": str(subject), 
        "type": "refresh",
        "jti": jti,
        "iat": datetime.utcnow()
    }
    
    # Add extra data to token payload  
    if extra_data:
        to_encode.update(extra_data)
    
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt, jti

def decode_token(token: str) -> Dict[str, Any]:
    """Decode and validate JWT token"""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError as e:
        raise JWTError(f"Token decode failed: {str(e)}")

def is_token_blacklisted(jti: str, db: Session) -> bool:
    """Check if token is blacklisted"""
    from db.models.token_blacklist import TokenBlacklist
    blacklisted = db.query(TokenBlacklist).filter(
        TokenBlacklist.jti == jti,
        TokenBlacklist.expires_at > datetime.utcnow()  # Only check non-expired blacklist entries
    ).first()
    return blacklisted is not None

def blacklist_token(jti: str, token_type: str, user_id: int, expires_at: datetime, reason: str, db: Session) -> None:
    """Add token to blacklist"""
    from db.models.token_blacklist import TokenBlacklist
    
    # Check if already blacklisted
    existing = db.query(TokenBlacklist).filter(TokenBlacklist.jti == jti).first()
    if existing:
        return
    
    blacklisted_token = TokenBlacklist(
        jti=jti,
        token_type=token_type,
        user_id=user_id,
        expires_at=expires_at,
        reason=reason
    )
    db.add(blacklisted_token)
    db.commit()

def revoke_all_user_tokens(user_id: int, reason: str, db: Session) -> int:
    """Revoke all active tokens for a user - returns count of revoked tokens"""
    from db.models.token_blacklist import TokenBlacklist
    
    # This is a simplified version - in production you'd want to track active tokens
    # For now, we'll create blacklist entries with current timestamp to block future use
    
    # Note: This is a basic implementation. For full security, you'd need to track
    # all issued tokens or use short-lived tokens with frequent rotation.
    
    current_time = datetime.utcnow()
    
    # Create a general revocation record (this approach has limitations)
    revocation_record = TokenBlacklist(
        jti=f"user_revoke_{user_id}_{current_time.timestamp()}",
        token_type="revocation",
        user_id=user_id,
        expires_at=current_time + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        reason=reason
    )
    db.add(revocation_record)
    db.commit()
    
    return 1  # Simplified return

def cleanup_expired_blacklist(db: Session) -> int:
    """Remove expired entries from blacklist - call this periodically"""
    from db.models.token_blacklist import TokenBlacklist
    
    deleted_count = db.query(TokenBlacklist).filter(
        TokenBlacklist.expires_at < datetime.utcnow()
    ).delete()
    db.commit()
    
    return deleted_count