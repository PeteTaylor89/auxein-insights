"""The router-level deny must refuse general_user and NOBODY else.

Asserted directly rather than by sweeping 900 routes: the guard is one function,
and what matters about it is (a) who it refuses and (b) that it resolves through
the CONTRACTOR-TOLERANT dependency.

(b) is the one that nearly shipped a disaster. `get_current_user` explicitly
raises for contractors, and tasks/assets/maintenance/calibrations/
stock_movements/contractor_management all serve contractors through
`get_current_user_or_contractor`. A deny wired to the strict resolver would have
403'd every contractor out of the entire contractor app.
"""
import inspect
import sys

sys.path.insert(0, "A:/auxein-insights-V0.1/backend")

from fastapi import HTTPException  # noqa: E402
from fastapi.routing import APIRoute  # noqa: E402

import api.deps as deps            # noqa: E402
from db.models.user import User    # noqa: E402
from db.models.contractor import Contractor  # noqa: E402

failures = []


def check(label, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {label}{'  ' + detail if detail else ''}")
    if not ok:
        failures.append(label)


guard = deps.deny_user_types("general_user")

# --- (b) which dependency does it resolve through? ---------------------
sig = inspect.signature(guard)
param = list(sig.parameters.values())[0]
resolver = param.default.dependency
check("the guard resolves through get_current_user_or_contractor",
      resolver is deps.get_current_user_or_contractor,
      getattr(resolver, "__name__", str(resolver)))
check("and NOT through get_current_user (which raises for contractors)",
      resolver is not deps.get_current_user)

# --- (a) who does it refuse? -------------------------------------------
def as_user(user_type):
    u = User()
    u.id = 1
    u.user_type = user_type
    return u


for role in ("auxein_admin", "company_admin", "company_manager", "company_user"):
    try:
        guard(as_user(role))
        check(f"{role} passes", True)
    except HTTPException as exc:
        check(f"{role} passes", False, f"refused with {exc.status_code}")

# A Contractor object has no `user_type` at all — the guard must not explode on
# it, and must let it through.
try:
    guard(Contractor())
    check("a Contractor object passes", True)
except HTTPException as exc:
    check("a Contractor object passes", False, f"refused with {exc.status_code}")
except AttributeError as exc:
    check("a Contractor object passes", False, f"AttributeError: {exc}")

try:
    guard(as_user("general_user"))
    check("general_user is REFUSED", False, "it passed")
except HTTPException as exc:
    check("general_user is REFUSED", exc.status_code == 403, f"status {exc.status_code}")

# --- the guard is actually attached to the routers ---------------------
from main import app  # noqa: E402

# Routers closed to general_user wholesale. `/api/timesheets` was here until
# 2026-09-02 and is deliberately NOT any more: the H&S account records its own
# hours, and the per-endpoint `timesheets` permission checks already hold it to
# read_own/submit. A router-level deny would be a blunter second copy of a rule
# enforced correctly one level down.
DENIED_PREFIXES = [
    "/api/tasks", "/api/assets", "/api/maintenance", "/api/calibrations",
    "/api/stock-movements", "/api/observations",
    "/api/v1/reports", "/api/v1/costs", "/api/training", "/api/vineyard_rows",
]

# Deliberately open to general_user. Asserted so that re-adding a deny here is a
# failing check rather than a silent lockout of a feature we chose to grant.
OPEN_PREFIXES = ["/api/timesheets"]
attached = 0
unguarded = []
for r in app.routes:
    if not isinstance(r, APIRoute):
        continue
    if not r.path.startswith(tuple(DENIED_PREFIXES)):
        continue
    names = [
        getattr(d.dependency, "__qualname__", "")
        for d in (r.dependencies or [])
    ]
    if any("deny_user_types" in n for n in names):
        attached += 1
    else:
        unguarded.append(r.path)

check("the deny is attached to every route in the closed routers",
      not unguarded, f"{attached} guarded, {len(unguarded)} not: {sorted(set(unguarded))[:6]}")

wrongly_closed = []
for r in app.routes:
    if not isinstance(r, APIRoute) or not r.path.startswith(tuple(OPEN_PREFIXES)):
        continue
    names = [getattr(d.dependency, "__qualname__", "") for d in (r.dependencies or [])]
    if any("deny_user_types" in n for n in names):
        wrongly_closed.append(r.path)

check("the routers we chose to OPEN carry no deny",
      not wrongly_closed, sorted(set(wrongly_closed))[:6])

print("")
print("ALL GOOD" if not failures else f"FAILURES: {failures}")
sys.exit(1 if failures else 0)
