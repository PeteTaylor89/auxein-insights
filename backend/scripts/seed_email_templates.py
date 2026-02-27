#!/usr/bin/env python3
"""
scripts/seed_email_templates.py

Seed the email_templates table with the 3 campaign template types:
  - Article Spotlight (single article feature)
  - Weekly Roundup (auto-composed roundup article, sent spotlight-style)
  - Climate Data Alert (data-triggered notification)

Usage:
    python scripts/seed_email_templates.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from db.session import SessionLocal
from db.models.email_campaign import EmailTemplate


TEMPLATES = [
    {
        "name": "Article Spotlight",
        "template_type": "spotlight",
        "subject_template": "{article_title} — Auxein Regional Intelligence",
        "body_template": "Single article feature email with hero image, title, excerpt, and read CTA.",
    },
    {
        "name": "Weekly Roundup",
        "template_type": "roundup",
        "subject_template": "Your Weekly Roundup — Auxein Regional Intelligence",
        "body_template": "Weekly roundup email pointing to an auto-composed roundup article. Uses spotlight layout.",
    },
    {
        "name": "Climate Data Alert",
        "template_type": "data_alert",
        "subject_template": "{alert_type} Alert for {region} — Auxein",
        "body_template": "Climate data trigger notification with metric highlight and dashboard link.",
    },
]


def seed():
    db = SessionLocal()
    try:
        created = 0
        for tmpl in TEMPLATES:
            existing = db.query(EmailTemplate).filter(
                EmailTemplate.template_type == tmpl["template_type"]
            ).first()
            if existing:
                print(f"  Template '{tmpl['name']}' already exists (id={existing.id}), skipping.")
                continue
            record = EmailTemplate(**tmpl)
            db.add(record)
            db.commit()
            db.refresh(record)
            print(f"  Created template '{record.name}' (id={record.id})")
            created += 1

        print(f"\nDone. {created} template(s) created.")
    finally:
        db.close()


if __name__ == "__main__":
    print("Seeding email templates...")
    seed()
