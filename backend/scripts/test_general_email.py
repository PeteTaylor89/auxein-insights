"""Dry-run an update email to the Insights list through the general template.

    # render only, writes an HTML file you can open in a browser
    backend/venv/Scripts/python.exe backend/scripts/test_general_email.py

    # ...and send ONE real email to yourself
    backend/venv/Scripts/python.exe backend/scripts/test_general_email.py \
        --test-send pete.taylor@auxein.co.nz

WHAT THIS DOES AND DOES NOT DO

It renders through `_render_campaign` - the SAME dispatch the real send uses,
so what you see is what the list would get, footer and all. It reports who
WOULD receive it using the real targeting query.

It cannot mass-send. There is no flag for it and no code path to it. The actual
send is `POST /admin/email/campaigns/{id}/send` from the admin UI, after a human
has looked at the draft. That is deliberate: a script that can mail 52 people is
a script that can mail 52 people by accident.

Nothing is written to the database. The campaign is built in memory and never
added to a session, so no draft appears in the admin list.

BEFORE THE REAL SEND
The general template is seeded INACTIVE and will not appear in the admin
dropdown until the backend carrying `render_general` is deployed and you run:

    UPDATE email_templates SET is_active = true WHERE template_type = 'general';
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv                                      # noqa: E402

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
os.environ.setdefault("AWS_REGION", "ap-southeast-2")

from api.v1.email_campaigns import _render_campaign                 # noqa: E402
from db.models.email_campaign import EmailCampaign, EmailTemplate    # noqa: E402
from db.models.public_user import PublicUser                        # noqa: E402
from db.session import SessionLocal                                 # noqa: E402
from services.email_service import email_service                    # noqa: E402


# ---------------------------------------------------------------------------
# THE EMAIL. This is the part to edit.
#
# Every claim below is something that is live and reachable today - the same
# rule the Pro page runs on. Do not add a line for anything still in a branch.
# ---------------------------------------------------------------------------

SUBJECT = "What is new in Auxein Insights"

PREVIEW_TEXT = (
    "National climate surfaces back to 1986, downscaled projections to 2100, "
    "and a page for every wine region."
)

INTRO = (
    "A short update on what has landed in Auxein Insights over the past few "
    "weeks."
)

BODY_HTML = """
<h2 style="margin: 0 0 10px 0; color: #2F2F2F; font-size: 18px;">The Climate Atlas</h2>
<p style="margin: 0 0 20px 0;">
  Every month from 1986 to the present is now on the map as a national
  climate surface at 500 m resolution - mean, minimum and maximum temperature,
  and rainfall. Scrub through the months, or step back a season at a time.
</p>

<h2 style="margin: 0 0 10px 0; color: #2F2F2F; font-size: 18px;">Projections to 2100</h2>
<p style="margin: 0 0 20px 0;">
  The Ministry for the Environment's 2024 downscaled projections sit alongside
  the measured record, on the same colour scale, with a 1986-2005 baseline you
  can flip against. Four emissions scenarios, four future periods. Because the
  scale is shared, the comparison actually means something.
</p>

<h2 style="margin: 0 0 10px 0; color: #2F2F2F; font-size: 18px;">A page for every region</h2>
<p style="margin: 0 0 20px 0;">
  Each wine region now has its own page carrying the current season, phenology
  and disease pressure, climate history back to 1986, and projections - all
  built from New Zealand's regional weather station network.
</p>

<p style="margin: 0 0 20px 0;">
  Everything above is free. Sign in to see the full history and projections
  for your region.
</p>
"""

OUTRO = (
    "As always, reply to this email if something looks wrong - the station "
    "network is a work in progress and we would rather hear about it."
)


def build_campaign(template_id: int) -> EmailCampaign:
    """In memory only. Never added to a session, so no draft is created."""
    return EmailCampaign(
        template_id=template_id,
        subject=SUBJECT,
        body_html=BODY_HTML,
        body_preview_text=PREVIEW_TEXT,
        intro_text=INTRO,
        outro_text=OUTRO,
    )


class _Preview:
    """A stand-in recipient, so no real unsubscribe token is rendered."""
    first_name = "Sam"
    last_name = "Preview"
    email = "preview@example.test"
    unsubscribe_token = "preview-only-not-a-real-token"


def audience(db):
    """The real targeting query from `send_campaign`, untargeted."""
    q = db.query(PublicUser).filter(
        PublicUser.is_active == True,          # noqa: E712
        PublicUser.is_verified == True,        # noqa: E712
        PublicUser.newsletter_opt_in == True,  # noqa: E712
    )
    total = q.count()
    by_tier = {}
    for u in q.all():
        by_tier[u.subscription_tier or "none"] = \
            by_tier.get(u.subscription_tier or "none", 0) + 1
    return total, by_tier


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--test-send", metavar="EMAIL",
                    help="send ONE real email to this address")
    ap.add_argument("--out", default=None,
                    help="where to write the rendered HTML "
                         "(default: general_email_preview.html beside this script)")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        template = db.query(EmailTemplate).filter(
            EmailTemplate.template_type == "general").first()
        if template is None:
            print("FAIL  no 'general' template row - run seed_email_templates.py")
            return 1

        print("")
        print(f"Template   id={template.id}  {template.name}  "
              f"active={template.is_active}")
        if not template.is_active:
            print("           INACTIVE - it will not appear in the admin dropdown")
            print("           until the backend with render_general is deployed and")
            print("           you run the UPDATE in this file's docstring.")

        campaign = build_campaign(template.id)
        html = _render_campaign(db, campaign, template, _Preview())

        # --- what the list looks like ---------------------------------------
        total, by_tier = audience(db)
        print("")
        print(f"Subject    {SUBJECT}")
        print(f"Preview    {PREVIEW_TEXT}")
        print(f"Audience   {total} recipients "
              f"(active, verified, newsletter opted in)")
        for tier, n in sorted(by_tier.items(), key=lambda kv: -kv[1]):
            print(f"           {n:>4}  {tier}")

        # --- sanity on the rendered output ----------------------------------
        print("")
        checks = [
            ("wrapped in the email shell", html.lstrip().startswith("<!DOCTYPE html>")),
            ("carries an unsubscribe footer", "Manage your email preferences" in html),
            ("the body made it in", "The Climate Atlas" in html),
            ("the intro made it in", INTRO[:30] in html),
            ("the outro made it in", OUTRO[:30] in html),
            ("no real unsubscribe token is exposed",
             "preview-only-not-a-real-token" not in html),
        ]
        for label, ok in checks:
            print(f"  {'PASS' if ok else 'FAIL'}  {label}")
        if any(not ok for _, ok in checks):
            return 1

        out = Path(args.out) if args.out else \
            Path(__file__).resolve().parent / "general_email_preview.html"
        out.write_text(html, encoding="utf-8")
        print("")
        print(f"Rendered   {out}")
        print(f"           {len(html):,} bytes - open it in a browser")

        # --- the one real send ----------------------------------------------
        if args.test_send:
            print("")
            if not email_service.send_emails:
                print("SKIPPED    SEND_EMAILS is not true in .env - nothing sent")
                return 0
            ok = email_service._send_email(
                to_email=args.test_send,
                subject=f"[TEST] {SUBJECT}",
                html_content=html,
            )
            print(f"{'SENT' if ok else 'FAILED'}       one test email to "
                  f"{args.test_send}")
            print("           subject is prefixed [TEST] so it cannot be "
                  "confused with the real thing")
            return 0 if ok else 1

        print("")
        print("No email sent. Add --test-send YOUR@ADDRESS to send one to "
              "yourself.")
        print("The real send to all "
              f"{total} recipients is done from the admin UI, not from here.")
        return 0
    finally:
        # Read-only, but be explicit - nothing here should ever commit.
        db.rollback()
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
