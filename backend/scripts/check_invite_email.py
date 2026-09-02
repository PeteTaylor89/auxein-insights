"""Render the invitation email for every role. No SMTP, nothing sent.

Two things this guards:

1. The lede no longer names the role ("...to join Acme as a General..."). The
   role badge was noise for the reader and wrong for `general`, which is an
   account type rather than a job title.
2. A mobile-only account is told to verify in a browser and then use the APP.
   `user` and `general` are refused at /auth/login on web, so "log in to the
   website" sends them to a 403 with no explanation. The branch is resolved
   from core.permissions, not a second list, so the email cannot promise
   access the API refuses.

Run with the backend venv:
    backend/venv/Scripts/python.exe backend/scripts/check_invite_email.py
"""
from __future__ import annotations
import sys
from pathlib import Path
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "backend"))

from dotenv import load_dotenv  # noqa: E402
load_dotenv(REPO / ".env")

from core import email_utils  # noqa: E402
from core.permissions import ASSIGNABLE_ROLES, MOBILE_ONLY_USER_TYPES, user_type_for_role  # noqa: E402

ok = True
def check(label, cond, extra=""):
    global ok
    ok = ok and bool(cond)
    print(f"  {'PASS' if cond else 'FAIL'}  {label}{('  ' + str(extra)) if extra else ''}")


captured = {}
def fake_send(to_email, subject, html_content, text_content=None, brand=None):
    captured["subject"] = subject
    captured["html"] = html_content
    captured["text"] = text_content or ""
    return True


def render(role, **kw):
    captured.clear()
    with patch.object(email_utils.email_service, "send_email", fake_send):
        email_utils.send_invitation_email(
            email="someone@example.invalid",
            inviter_name="Ada Lovelace",
            company_name="Greystone Wines",
            role=role,
            invitation_token="tok",
            **kw,
        )
    return captured


print("== every assignable role renders ==")
for role in ASSIGNABLE_ROLES:
    c = render(role)
    check(f"{role}: html and text produced", bool(c.get("html")) and bool(c.get("text")))
    check(f"{role}: no unrendered f-string braces in html",
          "{" not in c["html"].split("<style>")[0] if "<style>" in c["html"] else True)

print("== the lede no longer names the role ==")
for role in ASSIGNABLE_ROLES:
    c = render(role)
    lede_ok = "has invited you to join" in c["html"] and "as a " not in c["html"].split("Next Steps")[0]
    check(f"{role}: html lede drops the role clause", lede_ok)
    check(f"{role}: text lede drops the role clause", "as a " not in c["text"])
    check(f"{role}: company still named", "Greystone Wines" in c["html"])
    check(f"{role}: inviter still named", "Ada Lovelace" in c["html"])

print("== mobile-only roles are told browser-then-app ==")
for role in ASSIGNABLE_ROLES:
    c = render(role)
    mobile_only = user_type_for_role(role) in MOBILE_ONLY_USER_TYPES
    says_app = "mobile app" in c["html"] and "website is for managers" in c["html"]
    check(f"{role} (mobile_only={mobile_only}): app-only wording {'present' if mobile_only else 'absent'}",
          says_app == mobile_only)
    check(f"{role}: told to verify in a browser first",
          "web browser" in c["html"] and "web browser" in c["text"])

print("== the setup link is always there ==")
for role in ASSIGNABLE_ROLES:
    c = render(role)
    check(f"{role}: accept-invitation link present",
          "/accept-invitation?token=tok" in c["html"] and "/accept-invitation?token=tok" in c["text"])

print("== the dead duplicate is still dead ==")
src = (REPO / "backend/api/v1/invitations.py").read_text(encoding="utf-8")
check("invitations.py imports the email_utils sender",
      "from core.email_utils import send_invitation_email" in src)
check("and NOT the email_templates one",
      "from core.email_templates import send_invitation_email" not in src)

print()
print("ALL PASS" if ok else "FAILURES ABOVE")
sys.exit(0 if ok else 1)
