# backend_taste/scripts/seed_taste_templates.py
# Seed/refresh the global builtin templates (user_id NULL = visible to all,
# is_builtin = read-only) from their canonical *-seed.json files.
#
# DRY-RUN BY DEFAULT. Pass --apply to write. This mirrors the Grow-side lesson
# where a bare re-run of a system-template seed created duplicates: here the
# upsert is keyed on the seed's fixed `id`, so a re-run updates in place rather
# than inserting, but the default still shows you the plan before it writes.
#
#   cd backend_taste
#   ../backend/venv/Scripts/python.exe scripts/seed_taste_templates.py --prod           # plan
#   ../backend/venv/Scripts/python.exe scripts/seed_taste_templates.py --prod --apply   # write
#
# Optional: --only mw | --only cms
# Without --prod it uses whatever DATABASE_URL/LOCAL_DATABASE_URL the env gives
# (the repo .env points LOCAL_DATABASE_URL at localhost).
#
import argparse
import json
import os
import sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)          # backend_taste/
REPO = os.path.dirname(ROOT)          # repo root
sys.path.insert(0, ROOT)


def _use_prod_db() -> str:
    """Point this run at the shared RDS, built from the repo .env RDS_* vars.

    Deliberately opt-in via --prod. backend_taste/core/config.py prefers
    LOCAL_DATABASE_URL, which the repo .env sets to localhost, so without this
    the script targets a local DB that may not exist. An automatic fallback to
    prod is exactly the footgun to avoid here — make it typed, and print it.
    """
    from dotenv import load_dotenv

    load_dotenv(os.path.join(REPO, ".env"))
    host, user = os.getenv("RDS_ENDPOINT"), os.getenv("RDS_USER")
    pwd, name = os.getenv("RDS_PASSWORD"), os.getenv("RDS_DATABASE")
    port = os.getenv("RDS_PORT", "5432")
    if not all([host, user, pwd, name]):
        sys.exit("--prod needs RDS_ENDPOINT/RDS_USER/RDS_PASSWORD/RDS_DATABASE in the repo .env")
    os.environ["DATABASE_URL"] = f"postgresql://{user}:{pwd}@{host}:{port}/{name}"
    os.environ["LOCAL_DATABASE_URL"] = ""   # config.py prefers this; must be blank
    return f"{host}/{name}"


# --prod must be resolved BEFORE db.base is imported (it builds the engine at
# import time from the settings snapshot).
if "--prod" in sys.argv:
    print(f"*** TARGET: {_use_prod_db()} (shared RDS) ***")

from db.base import SessionLocal  # noqa: E402
from db.models import Template  # noqa: E402

TEMPLATE_DIR = os.path.join(REPO, "packages", "taste", "src", "templates")

# (slug, filename, kind)
SEEDS = [
    ("cms", "cms-seed.json", "cms"),
    ("mw", "mw-seed.json", "mw"),
]


def load(filename: str) -> dict:
    with open(os.path.join(TEMPLATE_DIR, filename), encoding="utf-8") as fh:
        return json.load(fh)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write to the DB (default: dry run)")
    ap.add_argument("--only", choices=[s[0] for s in SEEDS], help="seed just one template")
    ap.add_argument("--prod", action="store_true", help="target the shared RDS (see _use_prod_db)")
    args = ap.parse_args()

    wanted = [s for s in SEEDS if not args.only or s[0] == args.only]
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        for slug, filename, kind in wanted:
            seed = load(filename)
            row = db.query(Template).filter(Template.id == seed["id"]).first()
            n_sections = len(seed.get("sections", []))
            n_fields = sum(len(s.get("fields", [])) for s in seed.get("sections", []))
            new_version = seed.get("version", 1)

            if row is None:
                action = "CREATE"
                detail = f"v{new_version}"
            else:
                action = "UPDATE"
                detail = f"v{row.version} -> v{new_version}"
                if row.version == new_version and not row.deleted:
                    action = "REFRESH"  # same version; re-writes sections in place

            print(
                f"[{'apply' if args.apply else 'dry-run'}] {action:7} {seed['id']:26} "
                f"{seed['name']:16} {detail:14} {n_sections} sections / {n_fields} fields"
            )

            if not args.apply:
                continue

            if row is None:
                row = Template(id=seed["id"], created_at=now)
                db.add(row)
            row.user_id = None                 # global builtin
            row.name = seed["name"]
            row.kind = kind
            row.is_builtin = True
            row.sections = seed["sections"]
            row.version = new_version
            row.updated_at = now
            row.deleted = False

        if args.apply:
            db.commit()
            print("Committed.")
        else:
            # ASCII only: the Windows console is cp1252 and mangles an em-dash.
            print("\nDry run - nothing written. Re-run with --apply.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
