# backend_taste/core/auth.py — identity, from Taste's OWN user table and token.
#
# F1 (2026-09-21). This used to decode the Insights `public_access` JWT with the
# shared SECRET_KEY and return `public_users.id` as a loose int — no Taste user
# row, no way to revoke, and an Insights token was automatically a Taste token.
# Taste now signs and verifies its own tokens against `taste.users`.
#
# `get_current_taste_user` is kept, returning an int, because five modules
# already depend on that exact signature. It is now a thin wrapper over
# `get_current_user`, so those call sites gained the status and token_version
# checks without being touched.
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from core import security
from db.base import get_db
from db.models import User

security_scheme = HTTPBearer()

# The OPTIONAL scheme, for routes that must also serve signed-out callers.
# HTTPBearer() defaults to auto_error=True and raises 403 while RESOLVING the
# dependency — before the function body runs — so an endpoint using the default
# scheme rejects every anonymous request no matter what its body says. The whole
# public-share surface depends on this one being auto_error=False.
optional_scheme = HTTPBearer(auto_error=False)

_UNAUTH = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def _user_from_token(db: Session, token: str) -> Optional[User]:
    """Resolve a bearer token to a live, permitted user. None if it fails at any step."""
    payload = security.decode_access_token(token)

    if payload is not None:
        user = db.query(User).filter(User.id == payload.get("user_id")).first()
        if user is None:
            return None
        # The generation check. A token minted before a password change,
        # sign-out-everywhere or suspension carries a stale `tv` and dies here
        # rather than living out its remaining lifetime.
        if payload.get("tv") != user.token_version:
            return None
    else:
        # Cutover window only (TASTE_ACCEPT_LEGACY_TOKEN, default false): an
        # Insights token resolves through the provenance column recorded by
        # migration 0005. A legacy token carries no `tv`, so it cannot be
        # revoked — which is one more reason the window should be short.
        external_id = security.decode_legacy_insights_token(token)
        if external_id is None:
            return None
        user = db.query(User).filter(
            User.external_auth_id == external_id,
            User.external_auth_source == "insights",
        ).first()
        if user is None:
            return None

    # Checked here rather than at login, so suspending an account takes effect on
    # the next request instead of the next sign-in.
    if user.status != "active":
        return None
    return user


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> User:
    """The authenticated Taste user. 401 on anything less."""
    user = _user_from_token(db, credentials.credentials)
    if user is None:
        raise _UNAUTH
    return user


def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_scheme),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """The authenticated user, or None for an anonymous caller.

    Never raises. A route using this must serve a signed-out visitor, and a
    present-but-invalid token is treated as anonymous rather than as an error —
    a public share link should not break because a stale token is cached.
    """
    if credentials is None:
        return None
    return _user_from_token(db, credentials.credentials)


def get_current_taste_user(user: User = Depends(get_current_user)) -> int:
    """Back-compatible shim: the authenticated user's id.

    Kept so `api/crud.py`, `vocab.py`, `photos.py`, `bootstrap.py` and `sync.py`
    keep working unchanged. New code should depend on `get_current_user` and
    take the row, which carries role, status and handle.
    """
    return user.id


def require_admin(user: User = Depends(get_current_user)) -> User:
    """Gate for the moderation and admin surfaces (F4/F5)."""
    if user.role not in ("admin", "moderator"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not permitted")
    return user
