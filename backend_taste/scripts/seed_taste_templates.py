# backend_taste/scripts/seed_taste_templates.py
# Seed/refresh the global builtin CMS template (user_id NULL = visible to all,
# is_builtin = read-only) from the canonical cms-seed.json. Idempotent.
#
#   cd backend_taste && unset DATABASE_URL
#   ../backend/venv/Scripts/python.exe scripts/seed_taste_templates.py
#
import json
import os
import sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)          # backend_taste/
REPO = os.path.dirname(ROOT)          # repo root
sys.path.insert(0, ROOT)

from db.base import SessionLocal  # noqa: E402
from db.models import Template  # noqa: E402

CMS_JSON = os.path.join(REPO, "packages", "taste", "src", "templates", "cms-seed.json")


def main() -> None:
    with open(CMS_JSON, encoding="utf-8") as fh:
        seed = json.load(fh)

    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        row = db.query(Template).filter(Template.id == seed["id"]).first()
        if row is None:
            row = Template(id=seed["id"], created_at=now)
            db.add(row)
        row.user_id = None                 # global builtin
        row.name = seed["name"]
        row.kind = "cms"
        row.is_builtin = True
        row.sections = seed["sections"]
        row.version = seed.get("version", 1)
        row.updated_at = now
        row.deleted = False
        db.commit()
        n_sections = len(seed.get("sections", []))
        print(f"Seeded builtin template '{seed['name']}' (id={seed['id']}, v{row.version}, {n_sections} sections).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
