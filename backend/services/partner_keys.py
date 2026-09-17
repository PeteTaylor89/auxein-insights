"""Issue and verify partner API keys.

## The shape of a key

    auxp_live_7f3a2c9e4b1d8a6f0e5c...
    ^^^^ ^^^^ ^^^^^^^^
    |    |    `-- first 8 chars of the secret: together with the environment
    |    |        this is `key_prefix`, the indexed LOOKUP
    |    `------- environment: live | test
    `----------- product prefix, so a leaked key is greppable in a repo scan
                 and identifiable in a support ticket without holding it

`key_prefix` is stored as `auxp_live_7f3a2c9e` — enough to find the row, useless
for authenticating. The remainder is never stored in any form that can be
reversed.

## Why HMAC-SHA256 and not bcrypt, argon2 or scrypt

A slow KDF protects a LOW-ENTROPY secret — a human-chosen password — by making
each guess expensive. This secret is 32 bytes from `secrets.token_urlsafe`, so
it is 256 bits of uniform randomness and cannot be guessed at any speed a KDF
would change.

What a KDF WOULD do is run on every single request. bcrypt at its default cost
is ~100 ms; the partner queries it guards mostly return in single-digit
milliseconds. It would make the API an order of magnitude slower than the work
it protects, and it would hand anyone with a valid key a trivial way to pin the
workers.

So the hash is `HMAC-SHA256(pepper, key)`, compared with
`hmac.compare_digest`. Microseconds, constant time, and safe for a secret of
this entropy. GitHub and Stripe hash their tokens the same way and for the same
reason.

**The pepper is not in the database.** A dump of `partner_credential` is
therefore not enough to verify a key against, which is the property a bare
SHA-256 would not give us.

## The pepper, and one coupling worth knowing about

`PARTNER_KEY_PEPPER` if set. Otherwise it is DERIVED from `SECRET_KEY`, which
means **rotating `SECRET_KEY` invalidates every partner key**. That is an
acceptable fallback for a dev box and a bad surprise in production, so
production should set `PARTNER_KEY_PEPPER` explicitly and never change it.
`pepper_is_derived()` exists so the admin page can say which is in force.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
from typing import Optional

log = logging.getLogger(__name__)

PRODUCT_PREFIX = "auxp"
# 32 bytes -> a 43-character urlsafe string. 256 bits of entropy.
SECRET_BYTES = 32
# How much of the secret goes into the lookup prefix. Eight characters of
# base64url is 48 bits — collision-free in practice for a table that will hold
# hundreds of rows, and the column is UNIQUE so a collision fails loudly at
# insert rather than silently authenticating the wrong client.
PREFIX_CHARS = 8

ENVIRONMENTS = ("live", "test")


def pepper_is_derived() -> bool:
    """True when we fell back to SECRET_KEY. Surfaced in the admin page."""
    return not os.getenv("PARTNER_KEY_PEPPER")


def _pepper() -> bytes:
    explicit = os.getenv("PARTNER_KEY_PEPPER")
    if explicit:
        return explicit.encode("utf-8")
    # Derived, not reused: a distinct label means the value that hashes keys is
    # not the same bytes that sign JWTs, even though it is bound to their
    # lifetime. See the module docstring for the coupling this creates.
    from core.config import settings
    if not settings.SECRET_KEY:
        raise RuntimeError(
            "PARTNER_KEY_PEPPER is unset and SECRET_KEY is empty — partner "
            "keys cannot be issued or verified.")
    return hmac.new(settings.SECRET_KEY.encode("utf-8"),
                    b"auxein-partner-key-v1", hashlib.sha256).digest()


def hash_key(key: str) -> str:
    """The stored form. Hex HMAC-SHA256 under the server pepper."""
    return hmac.new(_pepper(), key.encode("utf-8"), hashlib.sha256).hexdigest()


def verify_key(key: str, stored_hash: str) -> bool:
    """Constant-time comparison. Never `==`.

    A plain `==` on a hex digest short-circuits on the first differing byte and
    leaks, through timing, how much of a guess was right. It is a small leak and
    an entirely avoidable one.
    """
    try:
        return hmac.compare_digest(hash_key(key), stored_hash)
    except Exception:  # a malformed key must not raise out of the auth path
        return False


def prefix_of(key: str) -> Optional[str]:
    """The lookup prefix for a presented key, or None if it is not our shape.

    Returning None rather than raising lets the dependency answer a plain
    `auth.invalid_key` for junk, without a traceback per bad request.
    """
    parts = key.split("_", 2)
    if len(parts) != 3:
        return None
    product, env, secret = parts
    if product != PRODUCT_PREFIX or env not in ENVIRONMENTS:
        return None
    if len(secret) < PREFIX_CHARS:
        return None
    return f"{product}_{env}_{secret[:PREFIX_CHARS]}"


def issue(environment: str = "live") -> dict:
    """Mint a new key. The plaintext is returned ONCE and never stored.

    Returns everything the caller needs to persist the row plus the `key` to
    show the human exactly once. The caller is responsible for never logging it.
    """
    if environment not in ENVIRONMENTS:
        raise ValueError(f"environment must be one of {ENVIRONMENTS}")
    secret = secrets.token_urlsafe(SECRET_BYTES)
    key = f"{PRODUCT_PREFIX}_{environment}_{secret}"
    return {
        "key": key,
        "key_prefix": f"{PRODUCT_PREFIX}_{environment}_{secret[:PREFIX_CHARS]}",
        "key_last4": secret[-4:],
        "key_hash": hash_key(key),
    }
