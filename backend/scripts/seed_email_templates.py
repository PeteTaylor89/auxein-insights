#!/usr/bin/env python3
"""
scripts/seed_email_templates.py

Seed the email_templates table with the 3 campaign template types:
  - Article Spotlight (single article feature)
  - Weekly Roundup (auto-composed roundup article, sent spotlight-style)
  - Climate Data Alert (data-triggered notification)

Usage:
    python scripts/seed_email_templates.py
    python scripts/seed_email_templates.py --update   # also fix existing rows

## Why `--update` exists

Seeding SKIPPED anything already present, which is right for a first run and
wrong for everything after it. The subject lines live in this file and in the
`email_templates` table, and once seeded the two could drift apart with nothing
to notice: on 2026-08-25 the file was corrected to say "Auxein Insights" while
prod kept sending "Auxein Regional Intelligence", a product name that no longer
exists, in every campaign subject line.

`--update` rewrites the subject and body of an existing row from this file, so
the file is the source of truth rather than merely the initial value. It leaves
`name` and `template_type` alone - those are how a row is identified, and a
campaign already pointing at one must keep pointing at it.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from db.session import SessionLocal
from db.models.email_campaign import EmailTemplate


TEMPLATES = [
    {
        "name": "Article Spotlight",
        "template_type": "spotlight",
        "subject_template": "{article_title} - Auxein Insights",
        "body_template": "Single article feature email with hero image, title, excerpt, and read CTA.",
    },
    {
        "name": "Weekly Roundup",
        "template_type": "roundup",
        "subject_template": "Your weekly roundup - Auxein Insights",
        "body_template": "Weekly roundup email pointing to an auto-composed roundup article. Uses spotlight layout.",
    },
    {
        "name": "Climate Data Alert",
        "template_type": "data_alert",
        "subject_template": "{alert_type} alert for {region} - Auxein Insights",
        "body_template": "Climate data trigger notification with metric highlight and dashboard link.",
    },
]


def seed(update: bool = False):
    db = SessionLocal()
    try:
        created = 0
        updated = 0
        for tmpl in TEMPLATES:
            existing = db.query(EmailTemplate).filter(
                EmailTemplate.template_type == tmpl["template_type"]
            ).first()
            if existing:
                if not update:
                    print(f"  Template '{tmpl['name']}' already exists "
                          f"(id={existing.id}), skipping.")
                    continue
                changes = []
                for field in ("subject_template", "body_template"):
                    if getattr(existing, field) != tmpl[field]:
                        changes.append(field)
                        setattr(existing, field, tmpl[field])
                if not changes:
                    print(f"  Template '{tmpl['name']}' (id={existing.id}) "
                          f"already matches.")
                    continue
                db.commit()
                print(f"  Updated template '{tmpl['name']}' (id={existing.id}): "
                      f"{', '.join(changes)}")
                print(f"      subject -> {existing.subject_template}")
                updated += 1
                continue
            record = EmailTemplate(**tmpl)
            db.add(record)
            db.commit()
            db.refresh(record)
            print(f"  Created template '{record.name}' (id={record.id})")
            created += 1

        print(f"\nDone. {created} created, {updated} updated.")
    finally:
        db.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--update", action="store_true",
                    help="rewrite subject/body on rows that already exist")
    args = ap.parse_args()
    print("Seeding email templates...")
    seed(update=args.update)
