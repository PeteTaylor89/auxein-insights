"""The partner key and the public JWT must be mutually unacceptable.

Referenced by `core/partner_security` and by the build scope. This is the one
part of the partner auth that must not be casual, so it gets its own file.

## Why this is worth a test rather than a code comment

`get_current_public_user` reads `user_id` straight out of the token claims. A
credential that carried a well-chosen claim set is exactly the kind of thing
that ends up authenticating somewhere nobody intended, and the failure mode is
silent — a token that works in the wrong place does not raise, it succeeds.

Both directions are asserted because they fail differently and could regress
independently:

* A partner key reaching a public dependency must fail token DECODING.
* A public JWT reaching the partner dependency must fail SHAPE matching, before
  a database round trip — `prefix_of` returns None, so the key is never looked
  up and a JWT can never collide with a stored prefix.

Run: `pytest backend/tests/test_partner_auth_isolation.py`
"""
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

os.environ.setdefault("SECRET_KEY", "test-secret-not-a-real-key")
os.environ.setdefault("PARTNER_KEY_PEPPER", "test-pepper-not-a-real-pepper")

from services import partner_keys  # noqa: E402


def _public_jwt() -> str:
    """A token of the shape `get_current_public_user` accepts."""
    from core.public_security import create_access_token
    return create_access_token({"user_id": 1, "type": "public_access"})


# --- direction 1: a partner key must not authenticate a public user ---------

def test_partner_key_is_not_a_valid_public_token():
    from jose import JWTError
    from fastapi import HTTPException
    from core.public_security import decode_access_token

    key = partner_keys.issue("live")["key"]
    with pytest.raises((HTTPException, JWTError)):
        decode_access_token(key)


# --- direction 2: a public JWT must not authenticate a partner --------------

def test_public_jwt_is_rejected_before_any_lookup():
    """`prefix_of` returns None, so the JWT never reaches the database.

    This is the property that matters: rejection happens on SHAPE, so there is
    no query whose result could be coerced into a match.
    """
    assert partner_keys.prefix_of(_public_jwt()) is None


@pytest.mark.parametrize("junk", [
    "", "Bearer", "not-a-key", "auxp_live_", "auxp_", "auxp_prod_abcdefgh",
    "AUXP_LIVE_abcdefghijkl", "auxp_live_short",
])
def test_malformed_keys_are_rejected_on_shape(junk):
    assert partner_keys.prefix_of(junk) is None


# --- the key primitives -----------------------------------------------------

def test_issued_key_round_trips():
    minted = partner_keys.issue("live")
    assert minted["key"].startswith("auxp_live_")
    assert partner_keys.verify_key(minted["key"], minted["key_hash"])
    assert partner_keys.prefix_of(minted["key"]) == minted["key_prefix"]
    # The stored prefix must not be enough to authenticate with.
    assert not partner_keys.verify_key(minted["key_prefix"], minted["key_hash"])


def test_a_different_key_does_not_verify():
    a, b = partner_keys.issue("live"), partner_keys.issue("live")
    assert not partner_keys.verify_key(a["key"], b["key_hash"])


def test_environments_are_distinguishable():
    assert partner_keys.issue("test")["key"].startswith("auxp_test_")
    with pytest.raises(ValueError):
        partner_keys.issue("staging")


def test_hash_is_not_the_key_and_is_stable():
    minted = partner_keys.issue("live")
    assert minted["key"] not in minted["key_hash"]
    assert partner_keys.hash_key(minted["key"]) == minted["key_hash"]


def test_verify_never_raises_on_garbage():
    """The auth path must not turn a malformed key into a 500."""
    assert partner_keys.verify_key("\x00\xff", "not-a-hash") is False
