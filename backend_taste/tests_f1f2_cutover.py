"""The two paths the main suite does not reach: the legacy cutover token, and suspension."""
import os, sys
from datetime import datetime, timedelta, timezone
sys.path.insert(0, os.getcwd())

from jose import jwt
from fastapi.testclient import TestClient

from core.config import settings
from main import app

from core.config import settings  # noqa: E402
from tests_guard import require_scratch_db  # noqa: E402

# These fixtures TRUNCATE. Refuse anything that is not obviously disposable.
require_scratch_db(settings.DATABASE_URL)

from db.base import SessionLocal
from db.models import User

INSIGHTS_SECRET = "the-main-api-secret-pretend"
c = TestClient(app)
V1 = "/taste/v1"
results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))


def auth(tok):
    return {"Authorization": "Bearer %s" % tok}


def insights_token(user_id, ttype="public_access", key=INSIGHTS_SECRET):
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": str(user_id), "user_id": user_id, "type": ttype,
         "iat": now, "exp": now + timedelta(hours=1)},
        key, algorithm="HS256")


db = SessionLocal()
for t in ("shares", "refresh_tokens", "users"):
    db.execute(__import__("sqlalchemy").text("TRUNCATE taste.%s RESTART IDENTITY CASCADE" % t))
db.commit()

# A user migrated from Insights: provenance recorded by migration 0005.
u = User(email="migrated@example.com", hashed_password=None, external_auth_id=77,
         external_auth_source="insights", token_version=1)
db.add(u)
db.commit()
db.refresh(u)
taste_id = u.id
db.close()

legacy = insights_token(77)

# ---- flag OFF (the default) -------------------------------------------------
settings.ACCEPT_LEGACY_INSIGHTS_TOKEN = False
settings.SECRET_KEY = INSIGHTS_SECRET
r = c.get(V1 + "/auth/me", headers=auth(legacy))
check("DEFAULT: an Insights token is NOT a Taste token", r.status_code == 401, r.text[:120])

# ---- an Insights token can never be forged into a Taste token ---------------
forged = insights_token(taste_id, ttype="taste_access", key=INSIGHTS_SECRET)
r = c.get(V1 + "/auth/me", headers=auth(forged))
check("a taste_access token signed with the INSIGHTS key is rejected", r.status_code == 401, r.text[:120])

# ---- flag ON (the cutover window) -------------------------------------------
settings.ACCEPT_LEGACY_INSIGHTS_TOKEN = True
r = c.get(V1 + "/auth/me", headers=auth(legacy))
check("CUTOVER ON: legacy token resolves via external_auth_id", r.status_code == 200, r.text[:160])
check("...and resolves to the TASTE id, not the Insights id",
      r.status_code == 200 and r.json().get("id") == taste_id, r.text[:160])

r = c.get(V1 + "/auth/me", headers=auth(insights_token(999)))
check("CUTOVER ON: unknown external id still 401", r.status_code == 401, r.text[:120])

r = c.get(V1 + "/auth/me", headers=auth(insights_token(77, key="some-other-secret")))
check("CUTOVER ON: wrong signature still 401", r.status_code == 401, r.text[:120])

# ---- suspension takes effect on the NEXT REQUEST ----------------------------
db = SessionLocal()
user = db.query(User).filter(User.id == taste_id).first()
user.hashed_password = __import__("core.security", fromlist=["x"]).hash_password("a-real-password-1")
db.commit()
db.close()

pair = c.post(V1 + "/auth/login", json={"email": "migrated@example.com", "password": "a-real-password-1"})
check("an account with a password can log in", pair.status_code == 200, pair.text[:160])
tok = pair.json().get("access_token", "")
check("live token works before suspension", c.get(V1 + "/auth/me", headers=auth(tok)).status_code == 200)

db = SessionLocal()
db.query(User).filter(User.id == taste_id).update({"status": "suspended"})
db.commit()
db.close()

check("SUSPENSION kills a LIVE access token on the next request",
      c.get(V1 + "/auth/me", headers=auth(tok)).status_code == 401)
r = c.post(V1 + "/auth/login", json={"email": "migrated@example.com", "password": "a-real-password-1"})
check("a suspended account cannot log back in", r.status_code == 403, r.text[:120])
settings.ACCEPT_LEGACY_INSIGHTS_TOKEN = True
check("a suspended account's legacy token is dead too",
      c.get(V1 + "/auth/me", headers=auth(legacy)).status_code == 401)

width = max(len(n) for n, _, _ in results)
fails = 0
print()
for name, ok, detail in results:
    if not ok:
        fails += 1
    print("  %-*s  %s%s" % (width, name, "PASS" if ok else "FAIL", ("   <- " + detail) if not ok and detail else ""))
print()
print("%s/%s passed" % (len(results) - fails, len(results)))
sys.exit(1 if fails else 0)
