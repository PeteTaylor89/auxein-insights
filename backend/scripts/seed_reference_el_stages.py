# scripts/seed_reference_el_stages.py
"""
Seed EL stages (and phases) into reference_items.

Usage:
  # seed global/system items
  python scripts/seed_reference_el_stages.py

  # OR seed org-specific overrides
  python scripts/seed_reference_el_stages.py --company-id 9
"""
from __future__ import annotations
import sys
from pathlib import Path
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# --- ensure all dependent models are registered with SQLAlchemy ---
# Import the module that defines RiskAction BEFORE anything that triggers mapper configuration
import importlib
importlib.import_module("db.models.site_risk")   # defines RiskAction
importlib.import_module("db.models.company")     # defines Company (refs RiskAction)
# (Optional but safe) import other common models too:
for m in ("user", "block", "spatial_area", "file", "task", "reference_item"):
    try:
        importlib.import_module(f"db.models.{m}")
    except Exception:
        pass  # ignore if not present


import argparse
import logging
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

# DB session
from db.session import SessionLocal

# Models
from db.models.reference_item import ReferenceItem

# Your helper data
from utils.el_scale import EL_STAGES, EL_PHASES  # dicts from your existing helper

log = logging.getLogger("seed_el")
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")


def _get(db: Session, company_id: Optional[int], category: str, key: str) -> Optional[ReferenceItem]:
    q = select(ReferenceItem).where(
        ReferenceItem.category == category,
        ReferenceItem.key == key,
    )
    if company_id is None:
        q = q.where(ReferenceItem.company_id.is_(None))
    else:
        q = q.where(ReferenceItem.company_id == company_id)
    return db.execute(q).scalars().first()


def upsert_el_stages(db: Session, company_id: Optional[int] = None) -> tuple[int, int]:
    """Upsert EL stages into reference_items (category='el_stage')."""
    created, updated = 0, 0
    for code, info in sorted(EL_STAGES.items(), key=lambda kv: kv[0]):
        label = info.get("name") or info.get("label") or code
        description = info.get("description") or info.get("desc") or None
        aliases = info.get("aliases") or []

        row = _get(db, company_id, "el_stage", code)
        if row:
            changed = False
            if row.label != label:
                row.label = label; changed = True
            if row.description != description:
                row.description = description; changed = True
            if (row.aliases or []) != (aliases or []):
                row.aliases = aliases; changed = True
            if changed:
                db.add(row); updated += 1
        else:
            db.add(ReferenceItem(
                company_id=company_id,
                category="el_stage",
                key=code,
                label=label,
                description=description,
                aliases=aliases,
                is_active=True,
            ))
            created += 1
    db.commit()
    return created, updated


def upsert_el_phases(db: Session, company_id: Optional[int] = None) -> tuple[int, int]:
    """Upsert EL phases into reference_items (category='el_phase')."""
    created, updated = 0, 0
    for phase_key, info in sorted(EL_PHASES.items(), key=lambda kv: kv[0]):
        key = f"EL-PHASE-{phase_key}"
        label = info.get("name") or phase_key
        description = info.get("description") or None
        aliases = info.get("aliases") or []

        row = _get(db, company_id, "el_phase", key)
        if row:
            changed = False
            if row.label != label:
                row.label = label; changed = True
            if row.description != description:
                row.description = description; changed = True
            if (row.aliases or []) != (aliases or []):
                row.aliases = aliases; changed = True
            if changed:
                db.add(row); updated += 1
        else:
            db.add(ReferenceItem(
                company_id=company_id,
                category="el_phase",
                key=key,
                label=label,
                description=description,
                aliases=aliases,
                is_active=True,
            ))
            created += 1
    db.commit()
    return created, updated


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed EL stages/phases into reference_items.")
    parser.add_argument("--company-id", type=int, default=None,
                        help="Seed as org-specific overrides (default: None for global)")
    args = parser.parse_args()

    with SessionLocal() as db:
        log.info("Seeding EL stages (company_id=%s)", args.company_id)
        c, u = upsert_el_stages(db, company_id=args.company_id)
        log.info("EL stages: created=%d updated=%d", c, u)

        log.info("Seeding EL phases (company_id=%s)", args.company_id)
        c2, u2 = upsert_el_phases(db, company_id=args.company_id)
        log.info("EL phases: created=%d updated=%d", c2, u2)

    log.info("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
