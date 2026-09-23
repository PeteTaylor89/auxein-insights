# backend_taste/core/security.py — password hashing, Taste's own tokens, slugs.
#
# F1. Everything here signs with TASTE_SECRET_KEY, never the main API's
# SECRET_KEY, and stamps `type: "taste_access"`, never `public_access`. Those two
# facts are what make the identity split real rather than decorative; config.py
# refuses to boot if the keys are the same.
import hashlib
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

from core.config import settings

# Same scheme as the main API on purpose: the backfill in migration 0005 copies
# `hashed_password` across verbatim, so the two must agree on the digest format
# or every migrated account silently cannot log in.
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

TOKEN_TYPE = "taste_access"
LEGACY_TOKEN_TYPE = "public_access"

# bcrypt hashes at most 72 bytes and ignores the rest. Left unchecked that is a
# silent truncation: "<72 chars><anything>" would authenticate. Rejected at the
# edge instead, so the limit is visible to the caller rather than a surprise.
MAX_PASSWORD_BYTES = 72
MIN_PASSWORD_LENGTH = 10

HANDLE_RE = re.compile(r"^[a-z0-9_]{3,30}$")

# Handles that must never belong to a person, because a URL like /admin or
# /settings would otherwise be ambiguous with a profile, and because an account
# called "support" is a phishing tool.
RESERVED_HANDLES = frozenset({
    "admin", "administrator", "root", "system", "support", "help", "staff",
    "auxein", "taste", "insights", "grow", "api", "www", "mail", "moderator",
    "mod", "official", "security", "billing", "settings", "account", "login",
    "logout", "signup", "register", "me", "you", "new", "edit", "delete",
    "public", "private", "share", "shares", "group", "groups", "user", "users",
    "null", "undefined", "anonymous", "deleted",
})


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: Optional[str]) -> bool:
    """Verify a password, tolerating an account that has none.

    A row backfilled from a Grow projection carries `hashed_password = NULL`.
    passlib raises on a None hash, so the check is explicit here — and it
    returns False rather than raising, because "this account cannot password
    login" is an answer, not an error.
    """
    if not hashed:
        return False
    try:
        return pwd_context.verify(plain, hashed)
    except ValueError:
        # Malformed digest in the database. Not a crash, and not a pass.
        return False


def password_problem(password: str) -> Optional[str]:
    """Return why this password is unusable, or None if it is fine."""
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"Password must be at least {MIN_PASSWORD_LENGTH} characters"
    if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        return f"Password must be at most {MAX_PASSWORD_BYTES} bytes"
    return None


def handle_problem(handle: str) -> Optional[str]:
    """Return why this handle is unusable, or None if it is fine."""
    if not HANDLE_RE.match(handle or ""):
        return "Handle must be 3-30 characters, lowercase letters, numbers or underscore"
    if handle in RESERVED_HANDLES:
        return "That handle is reserved"
    return None


def create_access_token(user_id: int, token_version: int) -> str:
    """A short-lived bearer token carrying the identity and its generation.

    `tv` is the point: it is compared against `users.token_version` on every
    request, so bumping that column (password change, sign-out-everywhere,
    suspension) invalidates every token already issued. Without it a suspension
    waits for the longest-lived token to expire.
    """
    now = datetime.now(timezone.utc)
    payload = {
        # `sub` is a string because the JWT spec says so and some libraries
        # enforce it; `user_id` is the int everything here actually reads.
        "sub": str(user_id),
        "user_id": user_id,
        "tv": token_version,
        "type": TOKEN_TYPE,
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_MINUTES),
    }
    return jwt.encode(payload, settings.TASTE_SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    """Decode a Taste token. Returns None on any failure — never raises.

    The caller turns None into a 401. Keeping the failure modes
    indistinguishable (bad signature, wrong type, expired, malformed) is
    deliberate: an attacker learns nothing from the difference.
    """
    try:
        payload = jwt.decode(token, settings.TASTE_SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None
    if payload.get("type") != TOKEN_TYPE:
        return None
    return payload


def decode_legacy_insights_token(token: str) -> Optional[int]:
    """Cutover only: read an Insights `public_access` token, return public_users.id.

    Enabled by TASTE_ACCEPT_LEGACY_TOKEN, which defaults to FALSE. It exists so
    the live SPA keeps working for the window between deploying this service and
    shipping the SPA's own sign-in. Delete this function, the setting and
    `settings.SECRET_KEY` together once that window closes.
    """
    if not settings.ACCEPT_LEGACY_INSIGHTS_TOKEN or not settings.SECRET_KEY:
        return None
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None
    if payload.get("type") != LEGACY_TOKEN_TYPE:
        return None
    user_id = payload.get("user_id")
    return int(user_id) if user_id is not None else None


def new_refresh_token() -> tuple:
    """Mint an opaque refresh token. Returns (token, sha256_hex).

    The plaintext goes to the client once and is never stored; only the digest
    is written to `taste.refresh_tokens`. A dumped database therefore yields no
    live sessions. sha256 rather than bcrypt because this is a 48-byte random
    string, not a human password — there is nothing to brute force, and refresh
    runs on every app start where a 100 ms KDF would be felt.
    """
    token = secrets.token_urlsafe(48)
    return token, hash_refresh_token(token)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_share_slug() -> str:
    """An unguessable slug. For a `link`-visibility row the slug IS the credential."""
    return secrets.token_urlsafe(16)


def new_opaque_token() -> str:
    """Email verification / password reset tokens."""
    return secrets.token_urlsafe(32)
