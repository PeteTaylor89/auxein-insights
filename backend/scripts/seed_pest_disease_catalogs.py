# backend/scripts/seed_pest_disease_catalogs.py
"""
Seed the system (company_id=NULL) pest, disease and biosecurity catalogues from
`services/pest_catalog.py` — the one list the reports also read.

    python -m scripts.seed_pest_disease_catalogs            # DRY RUN: prints the plan
    python -m scripts.seed_pest_disease_catalogs --write    # applies it

What a write does:
  * upserts every item into `pest`, `disease` or `biosecurity_agent`;
  * DEACTIVATES (never deletes) a system row whose key now lives in another
    category — e.g. BMSB leaves `pest` for `biosecurity_agent`. Recorded values
    keep their labels, the pickers stop offering it in the wrong place.

Rewritten 2026-09-24. Two faults in the old version:
  1. `ON CONFLICT (company_id, category, key)` never fires for a system row:
     company_id is NULL and NULLs are distinct in a unique index, so every run
     INSERTED a fresh copy of every item. This matches first, then updates or
     inserts, and reports any duplicates already there.
  2. It read DATABASE_URL and ignored ENV, so on a machine set up like the API
     (ENV + RDS_*) it aimed at a database nothing reads. It now uses the app's
     own resolver and prints the target before doing anything.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

ROOT_DIR = Path(__file__).resolve().parents[1].parent
BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(ROOT_DIR / ".env")
sys.path.insert(0, str(BACKEND_DIR))

from core.config import get_database_url  # noqa: E402
from services.pest_catalog import CATALOG  # noqa: E402

FIND_SQL = """
SELECT id, is_active, label FROM reference_items
WHERE company_id IS NULL AND category = :category AND key = :key
ORDER BY id
"""

UPDATE_SQL = """
UPDATE reference_items
SET label = :label, description = :description,
    aliases = CAST(:aliases AS JSONB), is_active = TRUE, updated_at = now()
WHERE company_id IS NULL AND category = :category AND key = :key
"""

INSERT_SQL = """
INSERT INTO reference_items (company_id, category, key, label, description, aliases, photo_file_ids, is_active)
VALUES (NULL, :category, :key, :label, :description, CAST(:aliases AS JSONB), '[]'::jsonb, TRUE)
"""

# System rows in a catalogue category that the list places somewhere else.
MISPLACED_SQL = """
SELECT id, category, key FROM reference_items
WHERE company_id IS NULL AND is_active AND category = :category AND key = ANY(:keys)
"""

DEACTIVATE_SQL = "UPDATE reference_items SET is_active = FALSE, updated_at = now() WHERE id = ANY(:ids)"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--write", action="store_true", help="Apply the plan (default is a dry run).")
    args = parser.parse_args()

    url = get_database_url()
    print(f"Target: {url.split('@')[-1] if '@' in url else url}")
    print("Mode:   WRITE" if args.write else "Mode:   DRY RUN (pass --write to apply)")

    engine = create_engine(url, future=True)
    inserts, updates, duplicates, to_deactivate = [], [], [], []

    with engine.begin() as conn:
        for category, items in CATALOG.items():
            for it in items:
                params = {
                    "category": category, "key": it["key"], "label": it["label"],
                    "description": it["description"] or "",
                    "aliases": json.dumps(it["aliases"]),
                }
                found = conn.execute(text(FIND_SQL), params).fetchall()
                if len(found) > 1:
                    duplicates.append((category, it["key"], len(found)))
                if found:
                    updates.append((category, it["key"]))
                    if args.write:
                        conn.execute(text(UPDATE_SQL), params)
                else:
                    inserts.append((category, it["key"]))
                    if args.write:
                        conn.execute(text(INSERT_SQL), params)

        for category in CATALOG:
            elsewhere = [it["key"] for other, items in CATALOG.items() if other != category for it in items]
            rows = conn.execute(text(MISPLACED_SQL), {"category": category, "keys": elsewhere}).fetchall()
            to_deactivate.extend(rows)
        # A dry run has issued only SELECTs, so there is nothing to roll back.
        if args.write and to_deactivate:
            conn.execute(text(DEACTIVATE_SQL), {"ids": [r.id for r in to_deactivate]})

    print(f"\nInsert {len(inserts)}:")
    for c, k in inserts:
        print(f"  + {c:18} {k}")
    print(f"Update {len(updates)} (label, description, aliases; reactivated)")
    print(f"Deactivate {len(to_deactivate)} (moved to another category):")
    for r in to_deactivate:
        print(f"  - {r.category:18} {r.key}  (id {r.id})")
    if duplicates:
        print(f"\nDUPLICATE system rows already present ({len(duplicates)} keys) — left in place, all updated:")
        for c, k, n in duplicates:
            print(f"  ! {c:18} {k} x{n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
