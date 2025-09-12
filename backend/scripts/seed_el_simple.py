# backend/scripts/seed_el_simple.py
"""
Seed EL stages (and phases) into reference_items using raw SQL (no ORM imports).

Usage:
  # uses DATABASE_URL or SQLALCHEMY_DATABASE_URL if set
  python -m scripts.seed_el_simple

  # or pass a URL explicitly
  python -m scripts.seed_el_simple --url postgresql+psycopg2://user:pass@host:5432/dbname

  # seed org overrides instead of global
  python -m scripts.seed_el_simple --company-id 9
"""
from __future__ import annotations
import os, json, argparse
from typing import Optional, Dict, Any, Tuple
from sqlalchemy import create_engine, text

# bring project's "backend" onto path if needed
import sys
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[1].parent  # repo root
load_dotenv(ROOT_DIR / ".env")  # silently no-ops if file missing
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# source data only (no ORM)
from utils.el_scale import EL_STAGES, EL_PHASES  # expects dicts

UPSERT_SQL = """
INSERT INTO reference_items (company_id, category, key, label, description, aliases, is_active)
VALUES (:company_id, :category, :key, :label, :description, CAST(:aliases AS JSONB), TRUE)
ON CONFLICT (company_id, category, key)
DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  aliases = EXCLUDED.aliases,
  is_active = TRUE;
"""

EXISTING_KEYS_SQL = """
SELECT key
FROM reference_items
WHERE category = :category
  AND (company_id IS NOT DISTINCT FROM :company_id)
"""

def seed_category(conn, category: str, items: Dict[str, Dict[str, Any]], company_id: Optional[int]) -> Tuple[int, int]:
    existing = set(
        r[0]
        for r in conn.execute(text(EXISTING_KEYS_SQL), {"category": category, "company_id": company_id})
    )
    created = updated = 0
    for code, info in sorted(items.items(), key=lambda kv: kv[0]):
        label = info.get("name") or info.get("label") or code
        desc = info.get("description") or info.get("desc")
        aliases = info.get("aliases") or []
        params = {
            "company_id": company_id,
            "category": category,
            "key": code,
            "label": label,
            "description": desc,
            "aliases": json.dumps(aliases),
        }
        conn.execute(text(UPSERT_SQL), params)
        if code in existing:
            updated += 1
        else:
            created += 1
    return created, updated

def main():
    parser = argparse.ArgumentParser(description="Seed EL stages/phases into reference_items (raw SQL).")
    parser.add_argument("--url", default=os.getenv("DATABASE_URL") or os.getenv("SQLALCHEMY_DATABASE_URL"),
                        help="SQLAlchemy DB URL. If omitted, uses DATABASE_URL/SQLALCHEMY_DATABASE_URL.")
    parser.add_argument("--company-id", type=int, default=None, help="Org override (None = global/system)")
    args = parser.parse_args()

    if not args.url:
        print("ERROR: No DB URL. Set DATABASE_URL / SQLALCHEMY_DATABASE_URL or pass --url.")
        return 1

    engine = create_engine(args.url, future=True)

    with engine.begin() as conn:
        print(f"Seeding EL stages (company_id={args.company_id}) …")
        c1, u1 = seed_category(conn, "el_stage", EL_STAGES, args.company_id)
        print(f"EL stages: created={c1} updated={u1}")

        print(f"Seeding EL phases (company_id={args.company_id}) …")
        # make EL_PHASES look like EL_STAGES shape
        phase_items = {
            f"EL-PHASE-{k}": {
                "name": v.get("name") or k,
                "description": v.get("description"),
                "aliases": v.get("aliases") or []
            }
            for k, v in EL_PHASES.items()
        }
        c2, u2 = seed_category(conn, "el_phase", phase_items, args.company_id)
        print(f"EL phases: created={c2} updated={u2}")

    print("Done.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
