"""F3 — canonical wine catalogue: identity logic, proposal queue, merges.

Runs against a REAL local Postgres. Identity assertions come first because
everything else rests on them: a wrong dedupe key silently merges two different
wines, which rewrites someone else's tasting history in a way nobody notices.
"""
import os, sys
sys.path.insert(0, os.getcwd())

import sqlalchemy as sa
from fastapi.testclient import TestClient

from core.wine_identity import dedupe_key, normalise_producer, similarity
from db.base import SessionLocal
from db.models import User, WineRef
from main import app

from core.config import settings  # noqa: E402
from tests_guard import require_scratch_db  # noqa: E402

# These fixtures TRUNCATE. Refuse anything that is not obviously disposable.
require_scratch_db(settings.DATABASE_URL)


results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))


# ---------------------------------------------------------------- pure identity
check("accents do not create a second wine",
      dedupe_key("Château Margaux", "Grand Vin", 2015) == dedupe_key("Chateau Margaux", "Grand Vin", 2015))
# The variants a person actually types. "dYquem" is NOT among them, and is not
# expected to match: punctuation becomes a SPACE, because "Saint-Emilion" is two
# words and "saintemilion" is not a name anyone searches for.
check("apostrophes and full stops are ignored",
      dedupe_key("Chateau d'Yquem", "Sauternes", 2011) == dedupe_key("Ch. d Yquem", "Sauternes", 2011))
check("...and the accented spelling matches too",
      dedupe_key("Château d'Yquem", "Sauternes", 2011) == dedupe_key("Chateau d'Yquem", "Sauternes", 2011))
check("INITIALS match whether or not they are punctuated",
      dedupe_key("J.M. Boillot", "Pommard", 2019) == dedupe_key("JM Boillot", "Pommard", 2019),
      normalise_producer("J.M. Boillot") + " vs " + normalise_producer("JM Boillot"))
check("...and spaced initials match too",
      dedupe_key("J M Boillot", "Pommard", 2019) == dedupe_key("JM Boillot", "Pommard", 2019))
check("a single leading letter is NOT treated as an initial",
      normalise_producer("Chateau d'Yquem") == "d yquem", normalise_producer("Chateau d'Yquem"))
check("case and spacing are ignored",
      dedupe_key("  CATENA   zapata ", "White Bones", 2024) == dedupe_key("Catena Zapata", "white bones", 2024))
check("a leading Domaine is dropped",
      normalise_producer("Domaine Leflaive") == normalise_producer("Leflaive"))
check("a leading Chateau is dropped",
      normalise_producer("Château Latour") == normalise_producer("Latour"))
check("only ONE leading noise word is dropped",
      normalise_producer("Le Clos du Roi") == "clos du roi",
      normalise_producer("Le Clos du Roi"))

# The false merges this module must refuse.
check("DIFFERENT VINTAGES are different wines",
      dedupe_key("Catena", "Malbec", 2020) != dedupe_key("Catena", "Malbec", 2021))
check("a missing vintage does NOT match every vintage",
      dedupe_key("Catena", "Malbec", None) != dedupe_key("Catena", "Malbec", 2021))
check("'Estate' is NOT stripped (it distinguishes real producers)",
      normalise_producer("Craggy Range Winery") != normalise_producer("Craggy Range"))
check("different labels from one producer stay distinct",
      dedupe_key("Catena Zapata", "White Bones", 2024) != dedupe_key("Catena Zapata", "White Stones", 2024))
check("region is NOT part of identity (same wine, different tree depth)",
      dedupe_key("Dampt", "Chablis", 2023, "fr__burgundy") == dedupe_key("Dampt", "Chablis", 2023, "fr__burgundy__chablis"))

check("similarity spots a dropped word", similarity("Catena Zapata White Bones", "Catena White Bones") >= 0.6)
check("similarity does not equate different labels",
      similarity("Catena Zapata White Bones", "Catena Zapata White Stones") < 1.0)

# ---------------------------------------------------------------- fixtures
db = SessionLocal()
for _t in ("wine_merge_log", "wine_proposal", "wine_ref", "shares", "notes", "wines",
           "flights", "events", "refresh_tokens", "users"):
    db.execute(sa.text("TRUNCATE taste.%s RESTART IDENTITY CASCADE" % _t))
db.commit()
db.close()

c = TestClient(app)
V1 = "/taste/v1"


def register(email, password="catalogue-pw-1", handle=None):
    r = c.post(V1 + "/auth/register", json={"email": email, "password": password, "handle": handle})
    return {"Authorization": "Bearer %s" % r.json().get("access_token", "")}


def promote_to_moderator(email):
    db = SessionLocal()
    db.query(User).filter(User.email == email).update({"role": "moderator", "token_version": 1})
    db.commit()
    db.close()


ALICE = register("cat-alice@example.com", handle="catalice")
BOB = register("cat-bob@example.com", handle="catbob")

# ---------------------------------------------------------------- propose on save
r = c.post(V1 + "/wines", json={"id": "w-a1", "producer": "Catena Zapata", "label": "White Bones",
                                "vintage": 2024}, headers=ALICE)
check("a plain user's wine saves", r.status_code == 201, r.text[:200])
check("...and is NOT auto-linked to a canonical row", r.json().get("wine_ref_id") is None, r.text[:200])

r = c.get(V1 + "/wine-proposals", headers=ALICE)
check("saving queued a proposal", r.status_code == 200 and len(r.json()) == 1, r.text[:200])
check("the proposal is pending", r.status_code == 200 and r.json()[0]["state"] == "pending")
prop_id = r.json()[0]["id"] if r.status_code == 200 and r.json() else None

r = c.get(V1 + "/wine-ref", headers=ALICE)
check("nothing reached the canonical table", r.status_code == 200 and r.json() == [], r.text[:200])

# Saving the same identity again must not queue it twice.
c.post(V1 + "/wines", json={"id": "w-a2", "producer": "catena  zapata", "label": "WHITE BONES",
                            "vintage": 2024}, headers=ALICE)
r = c.get(V1 + "/wine-proposals", headers=ALICE)
check("the same identity does not queue twice", len(r.json()) == 1, str(len(r.json())))

# ---------------------------------------------------------------- moderator gate
check("a plain user cannot accept a proposal",
      c.post(V1 + "/wine-proposals/%s/accept" % prop_id, headers=ALICE).status_code == 403)
check("a plain user cannot see someone else's queue",
      c.get(V1 + "/wine-proposals", headers=BOB).json() == [])
check("there is no route to write wine_ref directly",
      c.post(V1 + "/wine-ref", json={"producer": "Fake"}, headers=ALICE).status_code in (404, 405))

# Promoting bumps nothing, but re-logging in is the honest way to pick up a role
# change: the role is read from the user row on every request, so the old token
# would work too — this just makes the test say what it means.
promote_to_moderator("cat-bob@example.com")
BOB = {"Authorization": "Bearer %s" % c.post(
    V1 + "/auth/login", json={"email": "cat-bob@example.com", "password": "catalogue-pw-1"}
).json().get("access_token", "")}

r = c.get(V1 + "/wine-proposals", headers=BOB)
check("a moderator sees the whole queue", r.status_code == 200 and len(r.json()) == 1, r.text[:200])

# ---------------------------------------------------------------- accept + backlink
r = c.post(V1 + "/wine-proposals/%s/accept" % prop_id, headers=BOB)
check("accept creates the canonical row", r.status_code == 200, r.text[:200])
ref_id = r.json().get("id")
check("accepting a reviewed proposal marks it verified", r.json().get("verified") is True, r.text[:200])

r = c.get(V1 + "/wines/w-a1", headers=ALICE)
check("the wine that PROMPTED the proposal is now linked", r.json().get("wine_ref_id") == ref_id, r.text[:200])
r = c.get(V1 + "/wines/w-a2", headers=ALICE)
check("the DUPLICATE-identity wine is linked too (backlink)", r.json().get("wine_ref_id") == ref_id, r.text[:200])

check("re-accepting is refused", c.post(V1 + "/wine-proposals/%s/accept" % prop_id, headers=BOB).status_code == 409)

# A new wine with a known identity links immediately, no proposal.
r = c.post(V1 + "/wines", json={"id": "w-b1", "producer": "Château Catena Zapata", "label": "White Bones",
                                "vintage": 2024}, headers=BOB)
check("a known identity links on save with no queue", r.json().get("wine_ref_id") == ref_id, r.text[:200])

# ---------------------------------------------------------------- trusted auto-promote
r = c.post(V1 + "/wines", json={"id": "w-b2", "producer": "Felton Road", "label": "Block 3",
                                "vintage": 2022}, headers=BOB)
check("a moderator's new wine is canonical immediately", bool(r.json().get("wine_ref_id")), r.text[:200])
auto_ref = r.json().get("wine_ref_id")
r = c.get(V1 + "/wine-ref/%s" % auto_ref, headers=BOB)
check("...but is marked UNverified (nobody reviewed it)", r.json().get("verified") is False, r.text[:200])

# ---------------------------------------------------------------- merge
r = c.post(V1 + "/wines", json={"id": "w-a3", "producer": "Felton Rd", "label": "Block Three",
                                "vintage": 2022}, headers=ALICE)
r = c.get(V1 + "/wine-proposals", headers=BOB)
misspelt = [p for p in r.json() if p["state"] == "pending"]
check("a near-miss identity queues separately (no fuzzy auto-merge)", len(misspelt) == 1, str(r.json()))

if misspelt:
    r = c.get(V1 + "/wine-proposals/%s/suggestions" % misspelt[0]["id"], headers=BOB)
    check("suggestions are offered to the reviewer", r.status_code == 200, r.text[:200])

    r = c.post(V1 + "/wine-proposals/%s/accept" % misspelt[0]["id"], headers=BOB)
    second_ref = r.json().get("id")
    check("the reviewer can still accept it as its own row", r.status_code == 200 and second_ref != auto_ref)

    r = c.get(V1 + "/wine-ref/%s/usage" % second_ref, headers=BOB)
    check("usage reports the blast radius before a merge", r.json().get("wines") == 1, r.text[:200])

    r = c.post(V1 + "/wine-ref/%s/merge" % second_ref, json={"into_id": auto_ref}, headers=BOB)
    check("merge moves the personal wines", r.status_code == 200 and r.json().get("wines_moved") == 1, r.text[:200])

    r = c.get(V1 + "/wines/w-a3", headers=ALICE)
    check("the merged wine now points at the target", r.json().get("wine_ref_id") == auto_ref, r.text[:200])

    r = c.get(V1 + "/wine-ref/%s" % second_ref, headers=BOB)
    check("an old link RESOLVES FORWARD rather than 404ing", r.status_code == 200 and r.json().get("id") == auto_ref,
          r.text[:200])

    r = c.get(V1 + "/wine-ref", headers=BOB)
    check("a merged row is hidden from search", all(w["id"] != second_ref for w in r.json()))

    check("merging into itself is refused",
          c.post(V1 + "/wine-ref/%s/merge" % auto_ref, json={"into_id": auto_ref}, headers=BOB).status_code == 409)
    check("a merge that would make a CYCLE is refused",
          c.post(V1 + "/wine-ref/%s/merge" % auto_ref, json={"into_id": second_ref}, headers=BOB).status_code == 409)

    r = c.get(V1 + "/wine-ref/%s/log" % auto_ref, headers=BOB)
    check("the merge is in the audit log", r.status_code == 200 and any(e["action"] == "merged" for e in r.json()),
          r.text[:200])

# ---------------------------------------------------------------- reject / duplicate
c.post(V1 + "/wines", json={"id": "w-a4", "producer": "Typo Winery", "label": "asdf", "vintage": 2001}, headers=ALICE)
pend = [p for p in c.get(V1 + "/wine-proposals", headers=BOB).json() if p["state"] == "pending"]
if pend:
    r = c.post(V1 + "/wine-proposals/%s/reject" % pend[0]["id"], json={"note": "not a real wine"}, headers=BOB)
    check("reject 204", r.status_code == 204, r.text[:160])
    r = c.get(V1 + "/wines/w-a4", headers=ALICE)
    check("a rejected proposal leaves the personal wine intact and unlinked",
          r.status_code == 200 and r.json().get("wine_ref_id") is None, r.text[:200])

c.post(V1 + "/wines", json={"id": "w-a5", "producer": "Catena Zapata Bodega", "label": "White Bones ",
                            "vintage": 2024}, headers=ALICE)
pend = [p for p in c.get(V1 + "/wine-proposals", headers=BOB).json() if p["state"] == "pending"]
if pend:
    r = c.post(V1 + "/wine-proposals/%s/duplicate" % pend[0]["id"], json={"ref_id": ref_id}, headers=BOB)
    check("duplicate 204", r.status_code == 204, r.text[:160])
    r = c.get(V1 + "/wines/w-a5", headers=ALICE)
    check("marking duplicate LINKS the proposer's wine", r.json().get("wine_ref_id") == ref_id, r.text[:200])

# ---------------------------------------------------------------- isolation
check("a catalogue failure cannot lose the wine (no producer)",
      c.post(V1 + "/wines", json={"id": "w-a6", "label": "no producer"}, headers=ALICE).status_code == 201)
check("a client cannot set wine_ref_id itself",
      c.patch(V1 + "/wines/w-a6", json={"wine_ref_id": ref_id}, headers=ALICE).json().get("wine_ref_id") is None)

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
