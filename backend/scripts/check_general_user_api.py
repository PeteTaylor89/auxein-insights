"""What can a general_user actually REACH over HTTP?

The permission matrix says one thing; the wired-up app is what ships. This
drives the real FastAPI app with a general_user identity and asserts that the
endpoints they must not reach answer 403 — not 200, and not 500.

No database is touched: `get_db` is overridden with a session on a transaction
that is rolled back, and most of these are refused before any query runs.
"""
import os
import sys

sys.path.insert(0, "A:/auxein-insights-V0.1/backend")

from dotenv import load_dotenv  # noqa: E402

load_dotenv("A:/auxein-insights-V0.1/.env")

import sqlalchemy as sa                 # noqa: E402
from sqlalchemy.orm import Session      # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from main import app                    # noqa: E402
from api.deps import get_db, get_current_user, get_current_user_or_contractor  # noqa: E402
from db.models.user import User         # noqa: E402

engine = sa.create_engine(os.environ["LOCAL_DATABASE_URL"])
connection = engine.connect()
outer = connection.begin()
session = Session(bind=connection, join_transaction_mode="create_savepoint")

failures = []


def check(label, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {label}{'  ' + detail if detail else ''}")
    if not ok:
        failures.append(label)


class FakeUser(User):
    """A real User instance, never persisted — `has_permission` is what matters."""


def as_user(user_type):
    u = User()
    u.id = 999001
    u.company_id = 11
    u.user_type = user_type
    u.email = "scratch@example.com"
    u.first_name = "Scratch"
    u.last_name = "User"
    u.is_active = True
    return u


CURRENT = {"user": as_user("general_user")}

app.dependency_overrides[get_db] = lambda: session
app.dependency_overrides[get_current_user] = lambda: CURRENT["user"]
# The router-level deny resolves through the contractor-tolerant dependency
# (it has to — six of the closed routers serve contractors), so this must be
# overridden too or the closed routers answer 401 and prove nothing.
app.dependency_overrides[get_current_user_or_contractor] = lambda: CURRENT["user"]
client = TestClient(app, raise_server_exceptions=False)

# (method, path, must be refused?)
FORBIDDEN = [
    ("GET", "/api/tasks/tasks"),
    ("GET", "/api/v1/reports/tasks/summary"),
    ("GET", "/api/v1/reports/counts/summary"),
    ("GET", "/api/v1/reports/costs/summary"),
    ("GET", "/api/v1/costs/settings"),
    ("GET", "/api/v1/costs/rates/staff"),
    ("GET", "/api/v1/site-attendance/on-site"),
    ("GET", "/api/observations/api/observation-runs"),
]

# Endpoints a general_user MUST reach. Granted 2026-09-02: the H&S account
# records its own hours. Listing them explicitly means re-adding a router deny
# or dropping the type from the matrix fails here rather than silently taking a
# feature away again.
ALLOWED = [
    ("GET", "/api/timesheets/days"),
    # The incident and risk forms load this to build their property picker. A
    # 403 here is invisible on the phone: the list stays empty, no picker
    # renders, and the failure surfaces two screens later as a refused save.
    ("GET", "/api/v1/properties/"),
]

print("=== endpoints a general_user MUST NOT reach")
for method, path in FORBIDDEN:
    res = client.request(method, path)
    # 403 is the right answer. 404 is acceptable only if the route genuinely
    # does not exist — which would mean this test is checking nothing, so it is
    # reported rather than passed.
    if res.status_code == 404:
        check(f"{method} {path}", False, "404 — route not found, so this proves nothing")
    else:
        check(f"{method} {path} refused", res.status_code == 403,
              f"got {res.status_code}")

print("=== endpoints a general_user MUST reach")
for method, path in ALLOWED:
    res = client.request(method, path)
    check(f"{method} {path} allowed", res.status_code != 403, f"got {res.status_code}")

print("\n=== the same endpoints, as company_admin (the test must be able to FAIL)")
CURRENT["user"] = as_user("company_admin")
reachable = 0
for method, path in FORBIDDEN:
    res = client.request(method, path)
    if res.status_code != 403:
        reachable += 1
print(f"    {reachable} of {len(FORBIDDEN)} answer something other than 403 for an admin")
check("an admin is NOT blanket-refused", reachable > 0,
      "if an admin is refused everything too, the 403s above mean nothing")

print("\n=== endpoints a general_user MUST reach")
CURRENT["user"] = as_user("general_user")
ALLOWED = [
    ("GET", "/api/v1/site-attendance/status"),
    ("GET", "/api/v1/site-attendance/me"),
]
for method, path in ALLOWED:
    res = client.request(method, path)
    # 200 ideally; a 500 from the half-migrated local database is not a
    # permission failure, so only a 403 is a real miss here.
    check(f"{method} {path} not refused", res.status_code != 403,
          f"got {res.status_code}")

app.dependency_overrides.clear()
session.close()
outer.rollback()
connection.close()
engine.dispose()

print("")
print("ALL GOOD" if not failures else f"FAILURES: {failures}")
sys.exit(1 if failures else 0)
