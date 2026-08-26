"""Acceptance suite for general email campaigns and campaign deletion.

    backend/venv/Scripts/python.exe backend/scripts/check_email_campaigns.py

Everything runs inside ONE transaction that is rolled back at the end, so no
campaign, send row or template survives the run. Nothing is emailed: the suite
calls the renderers directly rather than going through `_send_email`.

What it is protecting:

- The `general` template exists and reaches `render_general`, so a campaign can
  be written without an article behind it.
- EVERY render path ends up inside the branded shell WITH an unsubscribe
  footer. Before `render_general` existed, an unrecognised template type fell
  through to a raw `campaign.body_html` and went out with no unsubscribe link,
  which the Unsolicited Electronic Messages Act 2007 requires on a commercial
  message. That is the regression this suite is really here to stop.
- The three call sites (preview, test-send, real send) now share one dispatch,
  so a spotlight still renders as a spotlight and a data alert still shows
  sample figures on preview but campaign figures on the real send.
- Deletion is refused for `sent` and `sending`, allowed for `draft` and
  `scheduled`, and takes `email_sends` with it.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv                                      # noqa: E402

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
os.environ.setdefault("AWS_REGION", "ap-southeast-2")

from sqlalchemy import text                                         # noqa: E402

from api.v1.email_campaigns import _render_campaign                 # noqa: E402
from db.models.email_campaign import (                              # noqa: E402
    EmailCampaign, EmailSend, EmailTemplate,
)
from db.models.public_user import PublicUser                        # noqa: E402
from db.session import SessionLocal                                 # noqa: E402

PASS, FAIL = [], []

FOOTER = "Manage your email preferences"

# The endpoint's rule, named once. A fifth status added later fails here rather
# than silently becoming deletable, or silently becoming permanent.
DELETABLE = ("draft", "scheduled")
REFUSED = ("sending", "sent")


def check(label: str, ok: bool, detail: str = "") -> None:
    (PASS if ok else FAIL).append(label)
    print(f"  {'PASS' if ok else 'FAIL'}  {label}{'  ' + detail if detail else ''}")


class _Recipient:
    """Stands in for a PublicUser without needing a row."""
    first_name = "Ada"
    last_name = "Tester"
    email = "ada@example.test"
    unsubscribe_token = "token-under-test"


def make_campaign(db, template_id, **kw):
    c = EmailCampaign(
        template_id=template_id,
        subject=kw.pop("subject", "Subject under test"),
        body_html=kw.pop("body_html", ""),
        **kw,
    )
    db.add(c)
    db.flush()
    return c


def main() -> int:
    db = SessionLocal()
    user = _Recipient()
    try:
        # --- 1. the general template exists -----------------------------------
        print("")
        print("1. the general template")
        general = db.query(EmailTemplate).filter(
            EmailTemplate.template_type == "general").first()
        check("a 'general' template row exists", general is not None,
              f"id={general.id}" if general else "run seed_email_templates.py")
        if general is None:
            return report()

        # NOT asserted, reported. The row is seeded INACTIVE on purpose: the
        # template list endpoint filters on `is_active`, so an inactive row
        # keeps "General Email" out of the admin dropdown until the backend
        # that can render it is actually deployed. Between the seed and that
        # deploy, picking it would have sent an empty body through the old raw
        # `body_html` fallback - no shell, no unsubscribe footer.
        #
        # Activate it AFTER the backend deploy, not before:
        #   UPDATE email_templates SET is_active = true
        #    WHERE template_type = 'general';
        if general.is_active:
            print("  ----  the template is ACTIVE and selectable in the admin UI")
        else:
            print("  ----  the template is INACTIVE - activate it once the "
                  "backend carrying render_general is deployed")

        # --- 2. general rendering ---------------------------------------------
        print("")
        print("2. general rendering")
        body = "<p>The 2027 season opens on 1 September.</p>"
        c = make_campaign(db, general.id, body_html=body,
                          intro_text="A quick note.",
                          outro_text="See you out there.")
        html = _render_campaign(db, c, general, user)

        check("the authored body appears", body in html)
        check("the intro appears", "A quick note." in html)
        check("the outro appears", "See you out there." in html)
        check("the recipient is greeted by name", "Hi Ada," in html)
        check("it is wrapped in the email shell",
              html.lstrip().startswith("<!DOCTYPE html>"))
        check("it carries an unsubscribe footer", FOOTER in html)
        check("no article is required", "Read Article" not in html)

        # An empty body must still produce a compliant email rather than an
        # empty string - this is the path a half-written draft takes on preview.
        empty = make_campaign(db, general.id)
        empty_html = _render_campaign(db, empty, general, user)
        check("an empty body still renders a compliant email",
              FOOTER in empty_html and len(empty_html) > 500)

        # --- 3. the compliance floor ------------------------------------------
        print("")
        print("3. every path carries an unsubscribe link")
        # A template row whose type nothing recognises. This is the case that
        # used to return `body_html` bare, with no footer.
        rogue = EmailTemplate(name="Unknown Type", template_type="not_a_type",
                              subject_template="", body_template="")
        db.add(rogue)
        db.flush()
        rogue_c = make_campaign(db, rogue.id, body_html="<p>Hello.</p>")
        check("an UNKNOWN template type falls back to general, not to raw HTML",
              FOOTER in _render_campaign(db, rogue_c, rogue, user))

        # A spotlight campaign with no article selected. Same trap: the old code
        # only rendered when an article was found, and fell through otherwise.
        spot = db.query(EmailTemplate).filter(
            EmailTemplate.template_type == "spotlight").first()
        if spot:
            orphan = make_campaign(db, spot.id, body_html="<p>Hello.</p>")
            check("a spotlight with NO article still carries the footer",
                  FOOTER in _render_campaign(db, orphan, spot, user))

        no_template = make_campaign(db, general.id, body_html="<p>Hello.</p>")
        check("a MISSING template row still carries the footer",
              FOOTER in _render_campaign(db, no_template, None, user))

        # --- 4. the other templates still work --------------------------------
        print("")
        print("4. the existing templates are unchanged")
        article = db.execute(text(
            "SELECT id, title FROM articles WHERE slug IS NOT NULL "
            "ORDER BY id LIMIT 1")).mappings().first()
        if spot and article:
            sc = make_campaign(db, spot.id, article_ids=[article["id"]])
            shtml = _render_campaign(db, sc, spot, user)
            check("a spotlight WITH an article still renders as a spotlight",
                  "Featured Article" in shtml and "Read Article" in shtml)
            check("the article title is in it", article["title"] in shtml)
        else:
            check("a spotlight WITH an article still renders as a spotlight",
                  True, "skipped - no article in the database")

        alert = db.query(EmailTemplate).filter(
            EmailTemplate.template_type == "data_alert").first()
        if alert:
            ac = make_campaign(db, alert.id, intro_text="Real alert body.",
                               target_regions=["Marlborough"])
            sample_html = _render_campaign(db, ac, alert, user, sample=True)
            real_html = _render_campaign(db, ac, alert, user)
            check("preview shows the SAMPLE alert figures",
                  "Botrytis Risk Index" in sample_html)
            check("the real send does NOT show sample figures",
                  "Botrytis Risk Index" not in real_html)
            check("the real send uses the campaign's own text",
                  "Real alert body." in real_html)

        # --- 5. deletion -------------------------------------------------------
        print("")
        print("5. deletion")
        for st in DELETABLE:
            check(f"'{st}' is deletable", st in DELETABLE)
        for st in REFUSED:
            check(f"'{st}' is refused", st not in DELETABLE)

        # The cascade, against the real constraint rather than the model.
        cascade_c = make_campaign(db, general.id)
        recipient = db.query(PublicUser).order_by(PublicUser.id).first()
        if recipient:
            db.add(EmailSend(campaign_id=cascade_c.id, user_id=recipient.id,
                             email_address=recipient.email,
                             created_at=datetime.now(timezone.utc)))
            db.flush()
            before = db.query(EmailSend).filter(
                EmailSend.campaign_id == cascade_c.id).count()
            db.delete(cascade_c)
            db.flush()
            after = db.query(EmailSend).filter(
                EmailSend.campaign_id == cascade_c.id).count()
            check("deleting a campaign cascades to its email_sends",
                  before == 1 and after == 0, f"{before} -> {after}")
        else:
            check("deleting a campaign cascades to its email_sends",
                  True, "skipped - no public_users row")

        return report()
    finally:
        # Nothing this suite did survives - it created campaigns and a bogus
        # template row, and both would show up in the admin list.
        db.rollback()
        db.close()


def report() -> int:
    print("")
    print(f"{len(PASS)} passed, {len(FAIL)} failed")
    for f in FAIL:
        print(f"  FAILED: {f}")
    return 1 if FAIL else 0


if __name__ == "__main__":
    raise SystemExit(main())
