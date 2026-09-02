# api/deps.py 
from typing import Generator, Optional, Union

from fastapi import Depends, HTTPException, status, Header
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import ValidationError
from sqlalchemy.orm import Session
from db.models.contractor_relationship import ContractorRelationship

from core.config import settings
from core.security.auth import decode_token
from db.session import SessionLocal
from db.models.user import User
from db.models.contractor import Contractor
import logging

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_current_user_or_contractor(
    db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)
) -> Union[User, Contractor]:
    """
    Enhanced dependency that returns either a User or Contractor based on token.
    Use this for endpoints that serve both user types.
    """
    logger.info(f"Authenticating user/contractor with token prefix: {token[:10]}...")
    try:
        logger.info("Decoding token...")
        payload = decode_token(token)
        logger.info(f"Token payload keys: {list(payload.keys())}")
        
        token_type = payload.get("type")
        user_type = payload.get("user_type")  # NEW: Check user type from token
        user_type_role = payload.get("user_type_role", user_type)
        logger.info(f"Token type: {token_type}, User type: {user_type}, Role: {user_type_role}")
        
        if token_type != "access":
            logger.warning(f"Invalid token type: {token_type}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Could not validate credentials",
            )
            
        user_id: str = payload.get("sub")
        logger.info(f"User ID from token: {user_id}")
        if user_id is None:
            logger.warning("No user ID in token")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Could not validate credentials",
            )
            
    except (JWTError, ValidationError) as e:
        logger.error(f"Token validation error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Could not validate credentials: {str(e)}",
        )
    
    # Route to correct user type based on token
    if user_type == "contractor":
        logger.info(f"Looking up contractor with ID: {user_id}")
        contractor = db.query(Contractor).filter(Contractor.id == user_id).first()
        if contractor is None:
            logger.warning(f"Contractor not found: {user_id}")
            raise HTTPException(status_code=404, detail="Contractor not found")
        
        if not contractor.can_login:
            logger.warning(f"Contractor cannot login: {contractor.email}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Contractor account is not in good standing"
            )
        
        logger.info(f"Authentication successful for contractor: {contractor.email}")
        return contractor
        
    else:  # company_user or legacy tokens without user_type
        logger.info(f"Looking up company user with ID: {user_id}")
        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            logger.warning(f"User not found: {user_id}")
            raise HTTPException(status_code=404, detail="User not found")
        
        if not user.can_login:
            logger.warning(f"User cannot login: {user.email}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is not in good standing"
            )
        
        logger.info(f"Authentication successful for user: {user.email}")
        return user

def get_current_user(
    db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)
) -> User:
    """
    Updated version of your existing function - now ONLY returns company Users.
    Maintains your existing logging style.
    """
    logger.info(f"Authenticating company user with token prefix: {token[:10]}...")
    try:
        logger.info("Decoding token...")
        payload = decode_token(token)
        logger.info(f"Token payload keys: {list(payload.keys())}")
        
        token_type = payload.get("type")
        user_type = payload.get("user_type")  # NEW: Check user type
        user_type_role = payload.get("user_type_role", user_type)
        logger.info(f"Token type: {token_type}, User type: {user_type}, Role: {user_type_role}")
        
        if token_type != "access":
            logger.warning(f"Invalid token type: {token_type}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Could not validate credentials",
            )
        
        # NEW: Block contractors from company-only endpoints
        if user_type == "contractor":
            logger.warning("Contractor attempted to access company-only endpoint")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This endpoint is only available to company users"
            )
            
        user_id: str = payload.get("sub")
        logger.info(f"User ID from token: {user_id}")
        if user_id is None:
            logger.warning("No user ID in token")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Could not validate credentials",
            )
    except (JWTError, ValidationError) as e:
        logger.error(f"Token validation error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Could not validate credentials: {str(e)}",
        )
    
    logger.info(f"Looking up user with ID: {user_id}")
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        logger.warning(f"User not found: {user_id}")
        raise HTTPException(status_code=404, detail="User not found")
    
    if not user.can_login:
        logger.warning(f"User cannot login: {user.email}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is not in good standing"
        )
    
    logger.info(f"Authentication successful for user: {user.email}")
    return user

def get_current_contractor(
    db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)
) -> Contractor:
    """
    New dependency that ONLY returns Contractors.
    Uses your existing logging style.
    """
    logger.info(f"Authenticating contractor with token prefix: {token[:10]}...")
    try:
        logger.info("Decoding token...")
        payload = decode_token(token)
        logger.info(f"Token payload keys: {list(payload.keys())}")
        
        token_type = payload.get("type")
        user_type = payload.get("user_type")
        user_type_role = payload.get("user_type_role", user_type)
        logger.info(f"Token type: {token_type}, User type: {user_type}, Role: {user_type_role}")
        
        if token_type != "access":
            logger.warning(f"Invalid token type: {token_type}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Could not validate credentials",
            )
        
        # Ensure this is a contractor
        if user_type != "contractor":
            logger.warning(f"Non-contractor attempted to access contractor endpoint: {user_type}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This endpoint is only available to contractors"
            )
            
        user_id: str = payload.get("sub")
        logger.info(f"Contractor ID from token: {user_id}")
        if user_id is None:
            logger.warning("No user ID in token")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Could not validate credentials",
            )
    except (JWTError, ValidationError) as e:
        logger.error(f"Token validation error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Could not validate credentials: {str(e)}",
        )
    
    logger.info(f"Looking up contractor with ID: {user_id}")
    contractor = db.query(Contractor).filter(Contractor.id == user_id).first()
    if contractor is None:
        logger.warning(f"Contractor not found: {user_id}")
        raise HTTPException(status_code=404, detail="Contractor not found")
    
    if not contractor.can_login:
        logger.warning(f"Contractor cannot login: {contractor.email}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Contractor account is not in good standing"
        )
    
    logger.info(f"Authentication successful for contractor: {contractor.email}")
    return contractor

# Optional: Client type validation helper
def validate_client_type(
    required_client_type: str,
    client_type: Optional[str] = Header(None, alias="x-client-type")
):
    """
    Helper to validate client type (web vs mobile).
    Args:
        required_client_type: "web" | "mobile" | "any"
        client_type: Client type from header
    """
    if required_client_type == "any":
        return True
    
    if not client_type:
        client_type = "web"  # Default assumption
    
    logger.info(f"Validating client type - required: {required_client_type}, actual: {client_type}")
    
    if required_client_type != client_type:
        logger.warning(f"Client type mismatch - required: {required_client_type}, got: {client_type}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"This endpoint is only available to {required_client_type} clients"
        )
    
    return True

def validate_contractor_relationship(
    contractor: Contractor, company_id: int, db: Session
) -> ContractorRelationship:
    """
    Validate contractor has an active, current relationship with the given company.
    Returns the ContractorRelationship or raises 403.
    """
    relationship = db.query(ContractorRelationship).filter(
        ContractorRelationship.contractor_id == contractor.id,
        ContractorRelationship.company_id == company_id,
        ContractorRelationship.status == "active"
    ).first()

    if not relationship:
        logger.warning(
            f"Contractor {contractor.id} has no active relationship with company {company_id}"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No active relationship with this company"
        )

    if not relationship.can_work_today:
        logger.warning(
            f"Contractor {contractor.id} relationship with company {company_id} "
            f"is not current: {relationship.contract_status}"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Contractor relationship is not current: {relationship.contract_status}"
        )

    return relationship


def require_permission(module: str, action: str):
    """
    FastAPI dependency factory for permission checking.
    Returns the authenticated user/contractor if they have the required permission.
    Raises 403 if not.

    Usage:
        @router.post("/tasks")
        def create_task(current_user = Depends(require_permission("tasks", "create"))):
            ...
    """
    def _check(
        current_entity: Union[User, Contractor] = Depends(get_current_user_or_contractor)
    ) -> Union[User, Contractor]:
        user_type = current_entity.user_type
        if not current_entity.has_permission(module, action):
            logger.warning(
                f"Permission denied: {user_type} attempted {module}.{action}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {module}.{action} not allowed for {user_type}"
            )
        return current_entity
    return _check


def deny_user_types(*denied: str):
    """Refuse whole routers to named user types.

    Applied at `include_router` time rather than per endpoint, because the
    alternative does not hold. `general_user` was added on 2026-09-01 and a
    sweep of every parameterless GET route found 26 answering 200 to it —
    asset stats, stock alerts, maintenance due, task templates, spray
    coverages. None of those endpoints was wrong before: they scope by company
    and property and simply never check a permission module, which was fine for
    the five types that existed when they were written.

    Patching them one by one leaves the NEXT endpoint in those routers open, and
    nobody adding one will remember. A router-level deny closes the area and
    stays closed.

    It only ever refuses the types named, so no existing type can regress.

    **Resolves through `get_current_user_or_contractor`, NOT `get_current_user`.**
    The latter deliberately BLOCKS contractors, and six of the routers this is
    applied to (tasks, assets, maintenance, calibrations, stock_movements,
    contractor_management) serve them through the contractor-tolerant resolver.
    Using the strict one here would have 403'd every contractor out of the whole
    contractor app, which is the exact opposite of "no existing type regresses".
    A Contractor object has no `user_type`, so getattr defaults it to a value
    that is never in the denied list.
    """
    def _check(actor=Depends(get_current_user_or_contractor)):
        if getattr(actor, "user_type", "contractor") in denied:
            logger.warning(
                f"Blocked {actor.user_type} from a router it has no access to"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Not available for {actor.user_type} accounts",
            )
        return actor
    return _check


def require_company_user_permission(module: str, action: str):
    """
    Same as require_permission but only allows company users (not contractors).
    Use for endpoints that should never be accessible to contractors.

    Usage:
        @router.delete("/users/{id}")
        def delete_user(current_user = Depends(require_company_user_permission("users", "delete"))):
            ...
    """
    def _check(
        current_user: User = Depends(get_current_user)
    ) -> User:
        if not current_user.has_permission(module, action):
            logger.warning(
                f"Permission denied: {current_user.user_type} attempted {module}.{action}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {module}.{action} not allowed for {current_user.user_type}"
            )
        return current_user
    return _check
