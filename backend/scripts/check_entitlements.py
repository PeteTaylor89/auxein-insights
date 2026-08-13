"""Exercise core/entitlements.py.

The Grow case is the reason this file exists. Grow SSO users are written with
subscription_tier='grow' and they are entitled to Pro; a `tier == "pro"` test
anywhere would lock a paying customer out silently, which is the kind of bug
nobody reports — they just leave. This asserts the intended behaviour so a
future refactor has to break a test rather than a customer.

Run with the backend venv:  backend/venv/Scripts/python.exe backend/scripts/check_entitlements.py
"""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "backend"))

from fastapi import HTTPException  # noqa: E402

from core.entitlements import (  # noqa: E402
    PRO_TIERS, is_pro, is_registered, require_pro, require_registration, tier_of,
)

ok = True


def check(label, cond, extra=""):
    global ok
    ok = ok and bool(cond)
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}{(' — ' + extra) if extra else ''}")


def user(tier, expires=None):
    return SimpleNamespace(id=1, subscription_tier=tier, pro_expires_at=expires)


def status_of(coro_fn, **kw):
    import asyncio
    try:
        asyncio.run(coro_fn(**kw))
        return 200
    except HTTPException as e:
        return e.status_code


NOW = datetime.now(timezone.utc)
PAST = NOW - timedelta(days=1)
FUTURE = NOW + timedelta(days=30)

print("=" * 70); print("1. tier normalisation"); print("=" * 70)
check("anonymous", tier_of(None) == "anonymous")
check("missing tier defaults to free", tier_of(user(None)) == "free")
check("case and whitespace tolerated", tier_of(user("  PRO ")) == "pro")

print()
print("=" * 70); print("2. is_pro"); print("=" * 70)
check("anonymous is not pro", not is_pro(None))
check("free is not pro", not is_pro(user("free")))
check("pro with no expiry is pro", is_pro(user("pro")))
check("pro with a future expiry is pro", is_pro(user("pro", FUTURE)))
check("EXPIRED pro is not pro", not is_pro(user("pro", PAST)))
# The load-bearing one.
check("GROW IS PRO", is_pro(user("grow")), "Grow customers must not hit a paywall")
check("grow ignores a stale expiry", is_pro(user("grow", PAST)),
      "Grow entitlement follows the Grow relationship, not an Insights billing date")
check("naive expiry does not crash the gate", is_pro(user("pro", FUTURE.replace(tzinfo=None))))
check("PRO_TIERS is exactly {pro, grow}", PRO_TIERS == frozenset({"pro", "grow"}), str(sorted(PRO_TIERS)))

print()
print("=" * 70); print("3. is_registered"); print("=" * 70)
check("anonymous is not registered", not is_registered(None))
check("free IS registered", is_registered(user("free")), "free is a tier, not a non-user")

print()
print("=" * 70); print("4. dependency status codes (contract §5.5)"); print("=" * 70)
check("require_registration 401 anonymous", status_of(require_registration, user=None) == 401)
check("require_registration 200 free", status_of(require_registration, user=user("free")) == 200)
check("require_pro 401 anonymous (offer sign-in, not upgrade)",
      status_of(require_pro, user=None) == 401)
check("require_pro 402 free (entitlement required)",
      status_of(require_pro, user=user("free")) == 402)
check("require_pro 402 expired pro", status_of(require_pro, user=user("pro", PAST)) == 402)
check("require_pro 200 pro", status_of(require_pro, user=user("pro")) == 200)
check("require_pro 200 GROW", status_of(require_pro, user=user("grow")) == 200)

print()
print("ALL PASS" if ok else "FAILURES ABOVE")
sys.exit(0 if ok else 1)
