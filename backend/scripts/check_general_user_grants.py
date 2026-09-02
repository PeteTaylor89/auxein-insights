import sys
from pathlib import Path
REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "backend"))
from dotenv import load_dotenv
load_dotenv(REPO / ".env")

from core.permissions import PERMISSIONS, has_permission, UserType

ok = True
def check(label, cond, extra=""):
    global ok
    ok = ok and bool(cond)
    print(f"  {'PASS' if cond else 'FAIL'}  {label}{('  ' + str(extra)) if extra else ''}")

ALL = [t.value for t in UserType]

print("== incidents is now a real module ==")
check("incidents in the matrix", "incidents" in PERMISSIONS)
for t in ALL:
    if t == "auxein_admin" or t in ("company_admin","company_manager","company_user","contractor","general_user"):
        check(f"{t} can create an incident", has_permission(t, "incidents", "create"))
check("only managers+ read the whole register",
      [t for t in ALL if has_permission(t, "incidents", "read")]
      == ["auxein_admin", "company_admin", "company_manager"],
      [t for t in ALL if has_permission(t, "incidents", "read")])

print("== timesheets unlocked for general_user, but only their own ==")
check("general_user can create", has_permission("general_user", "timesheets", "create"))
check("general_user can read_own", has_permission("general_user", "timesheets", "read_own"))
check("general_user can submit", has_permission("general_user", "timesheets", "submit"))
check("general_user CANNOT read the company", not has_permission("general_user", "timesheets", "read"))
check("general_user CANNOT approve", not has_permission("general_user", "timesheets", "approve"))
check("general_user CANNOT update", not has_permission("general_user", "timesheets", "update"))
check("general_user CANNOT delete", not has_permission("general_user", "timesheets", "delete"))

print("== nothing else widened for general_user ==")
for mod in ("tasks", "observations", "assets", "costs", "reports"):
    acts = [a for a in PERMISSIONS.get(mod, {}) if has_permission("general_user", mod, a)]
    check(f"general_user still has NO {mod}", not acts, acts)

print("== no existing type lost anything ==")
# contractor and company_user must still hold everything they held for timesheets
for t in ("company_user", "contractor"):
    for a in ("create", "read_own", "submit"):
        check(f"{t} keeps timesheets:{a}", has_permission(t, "timesheets", a))

print("== the router deny no longer covers timesheets ==")
import main  # noqa: E402
denied = [r.path for r in main.app.routes
          if getattr(r, "path", "").startswith("/api/timesheets")]
check("timesheet routes exist", len(denied) > 0, f"{len(denied)} routes")
src = (REPO / "backend" / "main.py").read_text(encoding="utf-8")
i = src.index("timesheets.router")
window = src[i:i+220]
check("no deny_general_user on the timesheets router",
      "deny_general_user" not in window)

print()
print("ALL PASS" if ok else "FAILURES ABOVE")
sys.exit(0 if ok else 1)
