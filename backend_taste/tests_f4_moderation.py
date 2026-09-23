"""F4 — reporting, hiding, suspension, the audit log, and durable rate limits.

Runs against a REAL local Postgres, because the whole point of the limiter is
that it lives in the database rather than in a process.
"""
import os, sys
from datetime import timedelta
sys.path.insert(0, os.getcwd())

import sqlalchemy as sa
from fastapi.testclient import TestClient

from core import ratelimit
from db.base import SessionLocal
from db.models import User
from main import app

from core.config import settings  # noqa: E402
from tests_guard import require_scratch_db  # noqa: E402

# These fixtures TRUNCATE. Refuse anything that is not obviously disposable.
require_scratch_db(settings.DATABASE_URL)

results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))


db = SessionLocal()
for _t in ("moderation_log", "report", "rate_limit", "wine_merge_log", "wine_proposal",
           "wine_ref", "shares", "notes", "wines", "flights", "events", "refresh_tokens", "users"):
    db.execute(sa.text("TRUNCATE taste.%s RESTART IDENTITY CASCADE" % _t))
db.commit()
db.close()

c = TestClient(app)
V1 = "/taste/v1"
PW = "moderation-pw-1"


def register(email, handle):
    r = c.post(V1 + "/auth/register", json={"email": email, "password": PW, "handle": handle})
    return {"Authorization": "Bearer %s" % r.json().get("access_token", "")}


def login(email):
    r = c.post(V1 + "/auth/login", json={"email": email, "password": PW})
    return {"Authorization": "Bearer %s" % r.json().get("access_token", "")}


def set_role(email, role):
    s = SessionLocal()
    s.query(User).filter(User.email == email).update({"role": role})
    s.commit()
    s.close()


OWNER = register("mod-owner@example.com", "modowner")
READER = register("mod-reader@example.com", "modreader")
register("mod-boss@example.com", "modboss")
set_role("mod-boss@example.com", "moderator")
BOSS = login("mod-boss@example.com")

# A public wine, plus one shared with the reader.
c.post(V1 + "/wines", json={"id": "w-pub", "producer": "Public Estate", "label": "Open"}, headers=OWNER)
r = c.put(V1 + "/visibility/wine/w-pub", json={"visibility": "public"}, headers=OWNER)
slug = r.json().get("share_slug")
c.post(V1 + "/wines", json={"id": "w-shared", "producer": "Shared Estate", "label": "Grant"}, headers=OWNER)
c.post(V1 + "/shares", json={"subject_type": "wine", "subject_id": "w-shared",
                             "grantee_handle": "modreader", "role": "view"}, headers=OWNER)

# ---------------------------------------------------------------- reporting
r = c.post(V1 + "/reports", json={"subject_type": "wine", "subject_id": "w-pub",
                                  "reason": "spam", "detail": "an advert"}, headers=READER)
check("any signed-in user can report", r.status_code == 201, r.text[:200])
report_id = r.json().get("id")

r2 = c.post(V1 + "/reports", json={"subject_type": "wine", "subject_id": "w-pub",
                                   "reason": "abuse"}, headers=READER)
check("reporting the same thing twice returns the open report, not an error",
      r2.status_code == 201 and r2.json().get("id") == report_id, r2.text[:200])

check("reporting something that does not exist is 404",
      c.post(V1 + "/reports", json={"subject_type": "wine", "subject_id": "nope",
                                    "reason": "spam"}, headers=READER).status_code == 404)
me_id = c.get(V1 + "/auth/me", headers=READER).json()["id"]
check("you cannot report yourself",
      c.post(V1 + "/reports", json={"subject_type": "user", "subject_id": str(me_id),
                                    "reason": "abuse"}, headers=READER).status_code == 422)
check("an invalid reason is refused",
      c.post(V1 + "/reports", json={"subject_type": "wine", "subject_id": "w-shared",
                                    "reason": "because"}, headers=READER).status_code == 422)
check("an invalid subject_type is refused",
      c.post(V1 + "/reports", json={"subject_type": "banana", "subject_id": "w-shared",
                                    "reason": "spam"}, headers=READER).status_code == 422)

check("a plain user cannot read the queue", c.get(V1 + "/reports", headers=READER).status_code == 403)
check("a plain user CAN see their own reports",
      len(c.get(V1 + "/reports/mine", headers=READER).json()) >= 1)
check("the reporter is not told WHICH moderator handled it",
      "reviewed_by" not in c.get(V1 + "/reports/mine", headers=READER).json()[0])

r = c.get(V1 + "/reports", headers=BOSS)
check("a moderator sees the queue", r.status_code == 200 and len(r.json()) >= 1, r.text[:200])
r = c.get(V1 + "/reports/%s/subject" % report_id, headers=BOSS)
check("a moderator can inspect the reported content", r.status_code == 200, r.text[:200])
check("...including how many reports it has", r.json().get("reports_total", 0) >= 1, r.text[:200])

# ---------------------------------------------------------------- hiding
check("a plain user cannot hide anything",
      c.post(V1 + "/moderation/hide", json={"subject_type": "wine", "subject_id": "w-pub",
                                            "reason": "nope"}, headers=READER).status_code == 403)
check("a hide with no reason is refused",
      c.post(V1 + "/moderation/hide", json={"subject_type": "wine", "subject_id": "w-pub"},
             headers=BOSS).status_code == 422)

check("the public slug works before hiding", c.get(V1 + "/public/wine/%s" % slug).status_code == 200)

r = c.post(V1 + "/moderation/hide", json={"subject_type": "wine", "subject_id": "w-pub",
                                          "reason": "advertising", "report_id": report_id}, headers=BOSS)
check("hide 204", r.status_code == 204, r.text[:200])

check("the ANONYMOUS public link stops resolving", c.get(V1 + "/public/wine/%s" % slug).status_code == 404)
r = c.get(V1 + "/wines/w-pub", headers=OWNER)
check("the OWNER still sees their own hidden row", r.status_code == 200, r.text[:200])
check("...and is told why", r.json().get("hidden_reason") == "advertising", r.text[:200])
check("...and it still says it is public (unhiding must restore that)",
      r.json().get("visibility") == "public", r.text[:200])
check("a moderator can still see it", c.get(V1 + "/wines/w-pub", headers=BOSS).status_code == 200)
check("hiding twice is refused",
      c.post(V1 + "/moderation/hide", json={"subject_type": "wine", "subject_id": "w-pub",
                                            "reason": "again"}, headers=BOSS).status_code == 409)

# A hidden row must also drop out of a GRANTEE's reach, not just the public one.
check("the sharee can see the shared wine before it is hidden",
      c.get(V1 + "/wines/w-shared", headers=READER).status_code == 200)
c.post(V1 + "/moderation/hide", json={"subject_type": "wine", "subject_id": "w-shared",
                                      "reason": "abuse"}, headers=BOSS)
check("a GRANT does not survive hiding", c.get(V1 + "/wines/w-shared", headers=READER).status_code == 404)
ids = [w["id"] for w in c.get(V1 + "/wines", headers=READER).json()]
check("...and it leaves the sharee's list", "w-shared" not in ids, str(ids))
owner_ids = [w["id"] for w in c.get(V1 + "/wines", headers=OWNER).json()]
check("...but stays in the OWNER's list", "w-shared" in owner_ids, str(owner_ids))

r = c.post(V1 + "/moderation/unhide", json={"subject_type": "wine", "subject_id": "w-pub",
                                            "reason": "appealed"}, headers=BOSS)
check("unhide 204", r.status_code == 204, r.text[:200])
check("the public link works again", c.get(V1 + "/public/wine/%s" % slug).status_code == 200)
check("unhiding restored the ORIGINAL visibility, not private",
      c.get(V1 + "/wines/w-pub", headers=OWNER).json().get("visibility") == "public")

# ---------------------------------------------------------------- suspension
r = c.post(V1 + "/reports/%s/resolve" % report_id, json={"state": "actioned", "note": "hidden"}, headers=BOSS)
check("resolve 204", r.status_code == 204, r.text[:200])
check("resolving twice is refused",
      c.post(V1 + "/reports/%s/resolve" % report_id, json={"state": "dismissed"}, headers=BOSS).status_code == 409)

owner_id = c.get(V1 + "/auth/me", headers=OWNER).json()["id"]
boss_id = c.get(V1 + "/auth/me", headers=BOSS).json()["id"]

check("the owner's token works before suspension", c.get(V1 + "/auth/me", headers=OWNER).status_code == 200)
r = c.post(V1 + "/moderation/users/%s/suspend" % owner_id, json={"reason": "repeated spam"}, headers=BOSS)
check("suspend 204", r.status_code == 204, r.text[:200])
check("SUSPENSION kills the live access token", c.get(V1 + "/auth/me", headers=OWNER).status_code == 401)
check("a suspended user cannot log back in",
      c.post(V1 + "/auth/login", json={"email": "mod-owner@example.com", "password": PW}).status_code == 403)
check("a moderator cannot suspend themselves",
      c.post(V1 + "/moderation/users/%s/suspend" % boss_id, json={"reason": "oops"},
             headers=BOSS).status_code == 409)

set_role("mod-reader@example.com", "admin")
admin_id = c.get(V1 + "/auth/me", headers=login("mod-reader@example.com")).json()["id"]
check("a moderator cannot suspend an ADMIN",
      c.post(V1 + "/moderation/users/%s/suspend" % admin_id, json={"reason": "no"},
             headers=BOSS).status_code == 409)

r = c.post(V1 + "/moderation/users/%s/unsuspend" % owner_id, json={"reason": "appeal upheld"}, headers=BOSS)
check("unsuspend 204", r.status_code == 204, r.text[:200])
check("the reinstated user can sign in again",
      c.post(V1 + "/auth/login", json={"email": "mod-owner@example.com", "password": PW}).status_code == 200)

# ---------------------------------------------------------------- the log
r = c.get(V1 + "/moderation/log", headers=BOSS)
# Re-login: the owner was suspended and reinstated, which bumped token_version,
# so their old token is dead. Testing the ROLE gate needs a live token, or a 401
# would pass for the wrong reason.
OWNER = login("mod-owner@example.com")
check("the log is moderator-only", c.get(V1 + "/moderation/log", headers=OWNER).status_code == 403)
actions = [e["action"] for e in r.json()]
for act in ("hide", "unhide", "suspend", "unsuspend"):
    check("the log records '%s'" % act, act in actions, str(actions))
check("every entry names who acted", all(e["actor_id"] for e in r.json()))
check("a hide entry carries its reason",
      any(e["action"] == "hide" and e["reason"] == "advertising" for e in r.json()), str(r.json())[:200])
check("the log is filterable by actor",
      len(c.get(V1 + "/moderation/log?actor_id=%s" % boss_id, headers=BOSS).json()) == len(r.json()))

r = c.get(V1 + "/reports", headers=BOSS)
c.post(V1 + "/reports", json={"subject_type": "wine", "subject_id": "w-pub", "reason": "other"}, headers=BOSS)
pend = [p for p in c.get(V1 + "/reports", headers=BOSS).json() if p["state"] == "open"]
if pend:
    c.post(V1 + "/reports/%s/resolve" % pend[0]["id"], json={"state": "dismissed", "note": "fine"}, headers=BOSS)
    acts = [e["action"] for e in c.get(V1 + "/moderation/log", headers=BOSS).json()]
    check("a DISMISSAL is logged too (a reporting pattern must be visible)", "dismiss" in acts, str(acts))

# ---------------------------------------------------------------- durable limiter
ratelimit.clear("unit:test")
check("the limiter allows up to the limit",
      all(ratelimit.hit("unit:test", limit=3, window=timedelta(minutes=5)) for _ in range(3)))
check("...and refuses the next", ratelimit.hit("unit:test", limit=3, window=timedelta(minutes=5)) is False)
check("the count is DURABLE (a fresh connection sees it)",
      ratelimit.peek("unit:test", window=timedelta(minutes=5)) == 4)
ratelimit.clear("unit:test")
check("clear resets it", ratelimit.peek("unit:test", window=timedelta(minutes=5)) == 0)

# The trap this design exists for: a FAILED login raises, its request session is
# discarded, and a counter written on that session would roll back — leaving a
# login limiter that only counts successes.
s = SessionLocal()
s.execute(sa.text("DELETE FROM taste.rate_limit"))
s.commit()
s.close()
for _ in range(3):
    c.post(V1 + "/auth/login", json={"email": "mod-owner@example.com", "password": "wrong"})
s = SessionLocal()
n = s.execute(sa.text("SELECT count FROM taste.rate_limit WHERE bucket = :b"),
              {"b": "login:mod-owner@example.com"}).scalar()
s.close()
check("FAILED logins are counted despite the request rolling back", n == 3, "count=%s" % n)

codes = [c.post(V1 + "/auth/login", json={"email": "mod-owner@example.com",
                                          "password": "wrong"}).status_code for _ in range(8)]
check("the lockout eventually returns 429", 429 in codes, str(codes))
# THE ASSERTION THAT FOUND THE BUG. If the limiter is consulted only on the
# failure path, an attacker's wrong guesses get 429s while the CORRECT guess
# still succeeds — the lockout stops nothing it exists to stop.
r = c.post(V1 + "/auth/login", json={"email": "mod-owner@example.com", "password": PW})
check("a CORRECT password is refused while locked out", r.status_code == 429, str(r.status_code))

# And the lockout must be escapable, or a mistyped password is a permanent
# lockout for the legitimate owner.
ratelimit.clear("login:mod-owner@example.com")
check("clearing the bucket lets the real owner back in",
      c.post(V1 + "/auth/login", json={"email": "mod-owner@example.com",
                                       "password": PW}).status_code == 200)
check("a successful login CLEARS its own bucket (a mistyped password is not a debt)",
      ratelimit.peek("login:mod-owner@example.com", window=timedelta(minutes=15)) == 0)

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
