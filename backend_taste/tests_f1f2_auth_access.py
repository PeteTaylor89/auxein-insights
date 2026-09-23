"""End-to-end exercise of F1 auth + F2 resolve_access against a real database."""
import os, sys
sys.path.insert(0, os.getcwd())
from fastapi.testclient import TestClient
from main import app

from core.config import settings  # noqa: E402
from tests_guard import require_scratch_db  # noqa: E402

# These fixtures TRUNCATE. Refuse anything that is not obviously disposable.
require_scratch_db(settings.DATABASE_URL)


# Self-cleaning: the suite registers fixed emails, so it must start from empty
# or every run after the first fails at "duplicate email".
import psycopg2
_con = psycopg2.connect(os.environ["LOCAL_DATABASE_URL"])
_cur = _con.cursor()
for _t in ("shares", "notes", "wines", "flights", "events", "photos", "vocab", "refresh_tokens", "users"):
    _cur.execute("TRUNCATE taste.%s RESTART IDENTITY CASCADE" % _t)
# Create the fixture row outright rather than assuming one is there, and touch
# ONLY it. The previous version deleted every other template to get a clean
# slate, which is fine on a scratch database and destroyed the seeded builtin
# grids the one time this was pointed at a dev database.
_cur.execute("DELETE FROM taste.templates WHERE id = 'tpl-builtin'")
_cur.execute("""INSERT INTO taste.templates
    (id, user_id, updated_at, version, deleted, name, is_builtin, visibility)
    VALUES ('tpl-builtin', NULL, now(), 1, false, 'fixture builtin', true, 'public')""")
_con.commit()
_con.close()

c = TestClient(app)
V1 = "/taste/v1"
results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))


def auth(tok):
    return {"Authorization": "Bearer %s" % tok}


# ---------------------------------------------------------------- F1 register
r = c.post(V1 + "/auth/register", json={"email": "Alice@Example.com", "password": "correct-horse-1", "handle": "alice"})
check("register 201", r.status_code == 201, r.text[:160])
alice = r.json() if r.status_code == 201 else {"access_token": "", "refresh_token": ""}
check("register returns a token pair", "access_token" in alice and "refresh_token" in alice)

r = c.post(V1 + "/auth/register", json={"email": "bob@example.com", "password": "correct-horse-2", "handle": "bob"})
bob = r.json() if r.status_code == 201 else {"access_token": "", "refresh_token": ""}
check("second register 201", r.status_code == 201, r.text[:160])

r = c.post(V1 + "/auth/register", json={"email": "alice@example.com", "password": "another-one-99"})
check("duplicate email 409 (no silent takeover)", r.status_code == 409, r.text[:120])

r = c.post(V1 + "/auth/register", json={"email": "x@example.com", "password": "short"})
check("short password 422", r.status_code == 422, r.text[:120])

r = c.post(V1 + "/auth/register", json={"email": "y@example.com", "password": "correct-horse-1", "handle": "admin"})
check("reserved handle 422", r.status_code == 422, r.text[:120])

r = c.post(V1 + "/auth/register", json={"email": "z@example.com", "password": "correct-horse-1", "handle": "alice"})
check("taken handle 409", r.status_code == 409, r.text[:120])

# ---------------------------------------------------------------- F1 login
r = c.post(V1 + "/auth/login", json={"email": "ALICE@example.com", "password": "correct-horse-1"})
check("login is case-insensitive on email", r.status_code == 200, r.text[:120])

r = c.post(V1 + "/auth/login", json={"email": "alice@example.com", "password": "wrong"})
check("wrong password 401", r.status_code == 401)
r2 = c.post(V1 + "/auth/login", json={"email": "nosuch@example.com", "password": "wrong"})
check("unknown email gives the SAME 401 body (no oracle)",
      r.status_code == r2.status_code and r.json() == r2.json(), "%s vs %s" % (r.text[:60], r2.text[:60]))

r = c.get(V1 + "/auth/me", headers=auth(alice["access_token"]))
check("me 200", r.status_code == 200, r.text[:120])
check("me email normalised to lowercase", r.json().get("email") == "alice@example.com")
check("me never exposes a password field", "hashed_password" not in r.json() and "password" not in r.json())

check("no token -> 403/401, never 200", c.get(V1 + "/auth/me").status_code in (401, 403))
check("garbage token -> 401", c.get(V1 + "/auth/me", headers=auth("not-a-token")).status_code == 401)

# ---------------------------------------------------------------- F1 refresh rotation
r = c.post(V1 + "/auth/refresh", json={"refresh_token": alice["refresh_token"]})
check("refresh 200", r.status_code == 200, r.text[:120])
rotated = r.json()
check("refresh rotates the refresh token", rotated["refresh_token"] != alice["refresh_token"])

r = c.post(V1 + "/auth/refresh", json={"refresh_token": alice["refresh_token"]})
check("replaying a rotated refresh token 401", r.status_code == 401)
r = c.post(V1 + "/auth/refresh", json={"refresh_token": rotated["refresh_token"]})
check("replay revokes the whole family (even the good token dies)", r.status_code == 401, r.text[:120])

# Alice needs a working session again.
alice = c.post(V1 + "/auth/login", json={"email": "alice@example.com", "password": "correct-horse-1"}).json()
A = auth(alice.get("access_token", ""))
B = auth(bob.get("access_token", ""))

# ---------------------------------------------------------------- F2 ownership
r = c.post(V1 + "/wines", json={"id": "wine-alice", "producer": "Alice Estate"}, headers=A)
check("create wine 201", r.status_code == 201, r.text[:200])
check("new row defaults to private", r.json().get("visibility") == "private", r.text[:160])

r = c.post(V1 + "/wines", json={"id": "wine-bob", "producer": "Bob Estate"}, headers=B)
check("bob creates his own wine", r.status_code == 201, r.text[:160])

r = c.get(V1 + "/wines", headers=A)
ids = [w["id"] for w in r.json()]
check("alice's list shows only her wine", ids == ["wine-alice"], str(ids))

check("alice cannot read bob's wine (404 not 403)",
      c.get(V1 + "/wines/wine-bob", headers=A).status_code == 404)
check("alice cannot patch bob's wine",
      c.patch(V1 + "/wines/wine-bob", json={"producer": "hijacked"}, headers=A).status_code == 404)
check("alice cannot delete bob's wine",
      c.delete(V1 + "/wines/wine-bob", headers=A).status_code == 404)

# ---------------------------------------------------------------- F2 share grants
r = c.post(V1 + "/shares", json={"subject_type": "wine", "subject_id": "wine-alice",
                                 "grantee_handle": "bob", "role": "view"}, headers=A)
check("grant view to bob 201", r.status_code == 201, r.text[:200])
share_id = (r.json() or {}).get("id", -1)

check("bob can now READ the shared wine", c.get(V1 + "/wines/wine-alice", headers=B).status_code == 200)
check("bob canNOT write it with view role",
      c.patch(V1 + "/wines/wine-alice", json={"producer": "nope"}, headers=B).status_code == 403)
r = c.get(V1 + "/wines", headers=B)
check("shared row appears in bob's list", sorted(w["id"] for w in r.json()) == ["wine-alice", "wine-bob"],
      str([w["id"] for w in r.json()]))

r = c.post(V1 + "/shares", json={"subject_type": "wine", "subject_id": "wine-alice",
                                 "grantee_handle": "bob", "role": "edit"}, headers=A)
check("re-grant updates in place, no duplicate row", r.status_code == 201 and (r.json() or {}).get("id") == share_id,
      r.text[:160])
check("bob can now edit", c.patch(V1 + "/wines/wine-alice", json={"producer": "Edited by Bob"},
                                  headers=B).status_code == 200)
check("an EDITOR still cannot delete",
      c.delete(V1 + "/wines/wine-alice", headers=B).status_code == 403)
r = c.patch(V1 + "/wines/wine-alice", json={"visibility": "public"}, headers=B)
check("an EDITOR cannot change visibility", r.status_code == 403, r.text[:160])
check("an EDITOR cannot re-share",
      c.post(V1 + "/shares", json={"subject_type": "wine", "subject_id": "wine-alice",
                                   "grantee_handle": "alice", "role": "view"}, headers=B).status_code in (403, 422))

check("bob cannot grant on a row he does not own",
      c.post(V1 + "/shares", json={"subject_type": "wine", "subject_id": "wine-bob",
                                   "grantee_handle": "nosuchuser", "role": "view"}, headers=B).status_code == 404)

# ---------------------------------------------------------------- F2 revoke
check("revoke 204", c.delete(V1 + "/shares/%s" % share_id, headers=A).status_code == 204)
check("bob loses access immediately", c.get(V1 + "/wines/wine-alice", headers=B).status_code == 404)

# ---------------------------------------------------------------- F2 visibility + slug
check("bob cannot set visibility on alice's row",
      c.put(V1 + "/visibility/wine/wine-alice", json={"visibility": "public"}, headers=B).status_code == 404)

r = c.put(V1 + "/visibility/wine/wine-alice", json={"visibility": "link"}, headers=A)
check("owner sets link visibility 200", r.status_code == 200, r.text[:200])
slug = (r.json() or {}).get("share_slug") or "no-slug-minted"
check("a slug was minted", bool(slug) and len(slug) >= 16, str(slug))

r = c.put(V1 + "/visibility/wine/wine-alice", json={"visibility": "group"}, headers=A)
check("group visibility refused while groups do not exist", r.status_code == 422, r.text[:140])
r = c.put(V1 + "/visibility/wine/wine-alice", json={"visibility": "nonsense"}, headers=A)
check("invalid visibility 422", r.status_code == 422)

# ---------------------------------------------------------------- F2 anonymous public route
r = c.get(V1 + "/public/wine/%s" % slug)
check("ANONYMOUS read by slug 200 (no Authorization header at all)", r.status_code == 200, r.text[:200])
check("anonymous response carries the row", r.status_code == 200 and r.json().get("id") == "wine-alice")

check("anonymous with a wrong slug 404", c.get(V1 + "/public/wine/deadbeefdeadbeef").status_code == 404)
check("anonymous cannot reach a PRIVATE row by slug-shaped id",
      c.get(V1 + "/public/wine/wine-bob").status_code == 404)
check("anonymous cannot list wines", c.get(V1 + "/wines").status_code in (401, 403))
check("anonymous cannot read a wine by id", c.get(V1 + "/wines/wine-alice").status_code in (401, 403))

r = c.put(V1 + "/visibility/wine/wine-alice", json={"visibility": "private"}, headers=A)
check("making it private clears the slug", r.json().get("share_slug") is None, r.text[:140])
check("the OLD share URL stops working immediately",
      c.get(V1 + "/public/wine/%s" % slug).status_code == 404)

# ---------------------------------------------------------------- F1 revocation
me_before = c.get(V1 + "/auth/me", headers=A).status_code
c.post(V1 + "/auth/logout-all", headers=A)
me_after = c.get(V1 + "/auth/me", headers=A).status_code
check("logout-all kills the live ACCESS token, not just refresh",
      me_before == 200 and me_after == 401, "%s -> %s" % (me_before, me_after))

alice = c.post(V1 + "/auth/login", json={"email": "alice@example.com", "password": "correct-horse-1"}).json()
A = auth(alice.get("access_token", ""))
r = c.post(V1 + "/auth/password", json={"current_password": "wrong", "new_password": "brand-new-pw-1"}, headers=A)
check("password change requires the current one", r.status_code == 403, r.text[:120])
r = c.post(V1 + "/auth/password", json={"current_password": "correct-horse-1", "new_password": "brand-new-pw-1"}, headers=A)
check("password change 204", r.status_code == 204, r.text[:120])
check("changing the password kills existing sessions",
      c.get(V1 + "/auth/me", headers=A).status_code == 401)
check("the new password works",
      c.post(V1 + "/auth/login", json={"email": "alice@example.com", "password": "brand-new-pw-1"}).status_code == 200)

# ---------------------------------------------------------------- builtin templates
alice = c.post(V1 + "/auth/login", json={"email": "alice@example.com", "password": "brand-new-pw-1"}).json()
A = auth(alice.get("access_token", ""))
r = c.get(V1 + "/templates", headers=A)
check("builtin (NULL-owner, public) template still visible to everyone",
      any(t["id"] == "tpl-builtin" for t in r.json()), str([t["id"] for t in r.json()]))
check("builtin is read-only",
      c.patch(V1 + "/templates/tpl-builtin", json={"name": "hijack"}, headers=A).status_code in (403, 404))

# ---------------------------------------------------------------- report
print()
width = max(len(n) for n, _, _ in results)
fails = 0
for name, ok, detail in results:
    if not ok:
        fails += 1
    print("  %-*s  %s%s" % (width, name, "PASS" if ok else "FAIL", ("   <- " + detail) if not ok and detail else ""))
print()
print("%s/%s passed" % (len(results) - fails, len(results)))
sys.exit(1 if fails else 0)
