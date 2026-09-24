# backend/scripts/refine_pest_disease_template.py
"""
Refine the live system "Pests & Diseases" template's own option list.

    python -m scripts.refine_pest_disease_template            # DRY RUN: prints the change
    python -m scripts.refine_pest_disease_template --write    # applies it

The template (type `pest_disease`, company_id NULL — id 12 on prod) does not
read the catalogues: its `pest_or_disease` select carries 30 static options,
each `{type, status, report_immediately, value, label, description}`. So the
catalogue seed cannot refine it; this does (Pete, 2026-09-24):

  * REMOVES the options with `status = biosecurity_alert`. Exotics are recorded
    on the Biosecurity template, which sits beside this one on mobile and reads
    the `biosecurity_agent` catalogue. A write refuses if any spot has recorded
    one of the removed values — a label would be lost from the form.
  * ADDS bronze beetle, grapevine scale and wasps, in step with
    `services/pest_catalog.py`.
  * Bumps `version`, as `seed_system_templates.py` does on update.

Idempotent: a second run finds nothing to remove or add.
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

FIELD = "pest_or_disease"

NEW_OPTIONS = [
    {"type": "pest", "status": "present", "report_immediately": False,
     "value": "bronze_beetle", "label": "Bronze beetle (Eucolaspis brunnea)",
     "description": "Small bronze beetles; shot-hole feeding on leaves and scarring on young berries, "
                    "worst near pasture margins in spring."},
    {"type": "pest", "status": "present", "report_immediately": False,
     "value": "grapevine_scale", "label": "Grapevine scale (Parthenolecanium persicae)",
     "description": "Brown domed soft scales on canes and trunk; honeydew and sooty mould; "
                    "a vector of leafroll virus."},
    {"type": "pest", "status": "present", "report_immediately": False,
     "value": "wasps", "label": "Wasps (Vespula spp.)",
     "description": "German and common wasps feeding on ripe or damaged berries pre-harvest; "
                    "opens fruit to sour rot and is a hazard to pickers."},
]

FIND_SQL = """
SELECT id, name, version, fields_json FROM observation_templates
WHERE company_id IS NULL AND type = 'pest_disease'
ORDER BY id
"""

USED_SQL = """
SELECT s.data_json::json ->> :field AS value, count(*) AS n
FROM observation_spots s JOIN observation_runs r ON r.id = s.run_id
WHERE r.template_id = :tid AND s.data_json::json ->> :field = ANY(:values)
GROUP BY 1
"""

UPDATE_SQL = """
UPDATE observation_templates
SET fields_json = :fields, version = version + 1, updated_at = now()
WHERE id = :tid AND version = :version
"""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--write", action="store_true", help="Apply the change (default is a dry run).")
    args = parser.parse_args()

    url = get_database_url()
    print(f"Target: {url.split('@')[-1] if '@' in url else url}")
    print("Mode:   WRITE" if args.write else "Mode:   DRY RUN (pass --write to apply)")

    engine = create_engine(url, future=True)
    with engine.begin() as conn:
        rows = conn.execute(text(FIND_SQL)).fetchall()
        if len(rows) != 1:
            print(f"Expected exactly one system pest_disease template, found {len(rows)}: "
                  f"{[(r.id, r.name) for r in rows]}. Nothing done.")
            return 1
        tpl = rows[0]
        fields = tpl.fields_json if isinstance(tpl.fields_json, list) else json.loads(tpl.fields_json)
        field = next((f for f in fields if isinstance(f, dict) and f.get("name") == FIELD), None)
        if field is None or not isinstance(field.get("options"), list):
            print(f"Template {tpl.id} has no static `{FIELD}` options. Nothing done.")
            return 1

        options = field["options"]
        removed = [o for o in options if o.get("status") == "biosecurity_alert"]
        existing = {o.get("value") for o in options}
        added = [o for o in NEW_OPTIONS if o["value"] not in existing]

        print(f"\nTemplate {tpl.id} {tpl.name!r}, version {tpl.version}, {len(options)} options")
        print(f"Remove {len(removed)}:")
        for o in removed:
            print(f"  - {o.get('value'):24} {o.get('label')}")
        print(f"Add {len(added)}:")
        for o in added:
            print(f"  + {o['value']:24} {o['label']}")

        used = conn.execute(text(USED_SQL), {
            "field": FIELD, "tid": tpl.id, "values": [o.get("value") for o in removed],
        }).fetchall() if removed else []
        if used:
            print("\nRecorded spots use removed values — refusing to remove them:")
            for u in used:
                print(f"  ! {u.value}: {u.n} spot(s)")
            return 1

        if not removed and not added:
            print("\nNothing to change.")
            return 0

        kept = [o for o in options if o.get("status") != "biosecurity_alert"]
        # New pests go after the last existing pest, so the picker stays grouped.
        last_pest = max((i for i, o in enumerate(kept) if o.get("type") == "pest"), default=len(kept) - 1)
        field["options"] = kept[:last_pest + 1] + added + kept[last_pest + 1:]
        print(f"\nResult: {len(field['options'])} options, version {tpl.version} -> {tpl.version + 1}")

        if args.write:
            res = conn.execute(text(UPDATE_SQL), {
                "fields": json.dumps(fields), "tid": tpl.id, "version": tpl.version,
            })
            if res.rowcount != 1:
                raise SystemExit("Template changed underneath this run (version moved). Rolled back.")
            print("Written.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
