"""Assert the invite path can produce a general_user, and that viewer is gone.

The role -> user_type mapping lived in four places and had already drifted:
the invite form offered "viewer", which every validator rejected with a 422,
so the option had never worked. This asserts the one remaining source of
truth in core/permissions.py is what every surface reads.

Pure import-level checks plus the pydantic validators. No database.

Run with the backend venv:
    backend/venv/Scripts/python.exe backend/scripts/check_invite_roles.py
"""
from __future__ import annotations
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "backend"))

from pydantic import ValidationError  # noqa: E402

from schemas.invitation import (  # noqa: E402
    ALLOWED_INVITATION_ROLES, InvitationCreate, InvitationUpdate,
    INVITATION_ROLE_PERMISSIONS,
)
from api.v1.admin import ASSIGNABLE_ROLES as ADMIN_ROLES  # noqa: E402
from core.permissions import (  # noqa: E402
    UserType, PERMISSIONS, has_permission,
    ROLE_TO_USER_TYPE, MOBILE_ONLY_USER_TYPES, ASSIGNABLE_ROLES, user_type_for_role,
)

ok = True
def check(label, cond, extra=""):
    global ok
    ok = ok and bool(cond)
    print(f"  {'PASS' if cond else 'FAIL'}  {label}{('  ' + str(extra)) if extra else ''}")

print("== the two lists agree ==")
check("every allowed role maps to a user_type",
      set(ALLOWED_INVITATION_ROLES) == set(ROLE_TO_USER_TYPE),
      f"{sorted(ALLOWED_INVITATION_ROLES)} vs {sorted(ROLE_TO_USER_TYPE)}")
check("every mapped user_type is a real UserType",
      all(v in {t.value for t in UserType} for v in ROLE_TO_USER_TYPE.values()),
      sorted(set(ROLE_TO_USER_TYPE.values())))
check("role permission map covers every allowed role",
      set(INVITATION_ROLE_PERMISSIONS) == set(ALLOWED_INVITATION_ROLES))

check("the admin role-change endpoint uses the same list",
      ADMIN_ROLES == ASSIGNABLE_ROLES, ADMIN_ROLES)
check("unknown role falls back to the NARROWEST tier",
      user_type_for_role("nonsense") == "company_user")
check("viewer is not assignable", "viewer" not in ASSIGNABLE_ROLES)
check("owner is not assignable", "owner" not in ASSIGNABLE_ROLES)

print("== general is accepted, viewer is not ==")
check("InvitationCreate accepts general",
      InvitationCreate(email="a@b.com", role="general").role == "general")
try:
    InvitationCreate(email="a@b.com", role="viewer")
    check("InvitationCreate rejects viewer", False)
except ValidationError:
    check("InvitationCreate rejects viewer", True)
try:
    InvitationUpdate(role="viewer")
    check("InvitationUpdate rejects viewer", False)
except ValidationError:
    check("InvitationUpdate rejects viewer", True)
check("InvitationUpdate accepts general", InvitationUpdate(role="general").role == "general")

print("== general resolves to the H&S account ==")
check("general -> general_user", ROLE_TO_USER_TYPE["general"] == "general_user")
check("general_user is mobile only", "general_user" in MOBILE_ONLY_USER_TYPES)
check("company_user is mobile only", "company_user" in MOBILE_ONLY_USER_TYPES)
check("manager is NOT mobile only", "company_manager" not in MOBILE_ONLY_USER_TYPES)

print("== the account it produces is still narrow ==")
# timesheets is deliberately NOT in this list from 2026-09-02: the H&S account
# records its own hours. It is asserted separately below, as a narrow grant
# rather than an absence, so widening it further is a failing check.
for mod in ("tasks", "observations", "assets", "costs", "reports"):
    if mod in PERMISSIONS:
        acts = [a for a in PERMISSIONS[mod] if has_permission("general_user", mod, a)]
        check(f"general_user has NO {mod} rights", not acts, acts)

granted = sorted(a for a in PERMISSIONS["timesheets"]
                 if has_permission("general_user", "timesheets", a))
check("general_user's timesheet rights are exactly create/read_own/submit",
      granted == ["create", "read_own", "submit"], granted)
for mod, act in (("site_attendance", "create"), ("visitors", "create"), ("risks", "create")):
    if mod in PERMISSIONS:
        check(f"general_user CAN {mod}:{act}", has_permission("general_user", mod, act))

print("== the LIVE invite email sender is the one wired up ==")
_inv = (REPO / "backend/api/v1/invitations.py").read_text(encoding="utf-8")
check("invitations.py uses core.email_utils.send_invitation_email",
      "from core.email_utils import send_invitation_email" in _inv)
check("core/email_templates.py's copy stays unused",
      "email_templates import send_invitation_email" not in _inv)

print("== the database constraint agrees ==")
import importlib.util as _ilu
_spec = _ilu.spec_from_file_location(
    "mig_invite_role_general", REPO / "alembic" / "versions" / "invite_role_general.py"
)
_mig = _ilu.module_from_spec(_spec)
_spec.loader.exec_module(_mig)
from db.models.invitation import Invitation  # noqa: E402

check("the migration allows exactly the assignable roles",
      set(_mig.NEW_ROLES) == set(ASSIGNABLE_ROLES),
      f"{sorted(_mig.NEW_ROLES)} vs {sorted(ASSIGNABLE_ROLES)}")
check("the migration drops owner and viewer",
      not ({"owner", "viewer"} & set(_mig.NEW_ROLES)))
_model_checks = [
    str(c.sqltext) for c in Invitation.__table__.constraints if hasattr(c, "sqltext")
]
check("the model mirrors the same list",
      _model_checks == [
          "role IN (" + ", ".join(f"'{r}'" for r in ASSIGNABLE_ROLES) + ")"
      ],
      _model_checks)

print()
print("ALL PASS" if ok else "FAILURES ABOVE")
sys.exit(0 if ok else 1)
