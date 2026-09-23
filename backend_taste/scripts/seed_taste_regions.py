# backend_taste/scripts/seed_taste_regions.py
# Seed/refresh the global taste.regions reference table from the canonical
# geo-seed.json. Reference data: not user-scoped, never soft-deleted.
#
# DRY-RUN BY DEFAULT. Pass --apply to write.
#
#   cd backend_taste
#   ../backend/venv/Scripts/python.exe scripts/seed_taste_regions.py --prod           # plan
#   ../backend/venv/Scripts/python.exe scripts/seed_taste_regions.py --prod --apply   # write
#
# ids are derived from the hierarchy (`parent__slug(name)`), so a rename or a
# re-parent in geo-seed.json silently orphans every wine whose geo_ref_id points
# at the old id. The dry run prints exactly that risk: any id present in the DB
# but absent from the new seed is reported as ORPHANED before you commit.
#
import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)          # backend_taste/
REPO = os.path.dirname(ROOT)          # repo root
sys.path.insert(0, ROOT)


def _use_prod_db() -> str:
    """Point this run at the shared RDS, built from the repo .env RDS_* vars."""
    from dotenv import load_dotenv

    load_dotenv(os.path.join(REPO, ".env"))
    host, user = os.getenv("RDS_ENDPOINT"), os.getenv("RDS_USER")
    pwd, name = os.getenv("RDS_PASSWORD"), os.getenv("RDS_DATABASE")
    port = os.getenv("RDS_PORT", "5432")
    if not all([host, user, pwd, name]):
        sys.exit("--prod needs RDS_ENDPOINT/RDS_USER/RDS_PASSWORD/RDS_DATABASE in the repo .env")
    os.environ["DATABASE_URL"] = f"postgresql://{user}:{pwd}@{host}:{port}/{name}"
    os.environ["LOCAL_DATABASE_URL"] = ""
    return f"{host}/{name}"


if "--prod" in sys.argv:
    print(f"*** TARGET: {_use_prod_db()} (shared RDS) ***")

from db.base import SessionLocal  # noqa: E402
from db.models import Region  # noqa: E402
from sqlalchemy import text  # noqa: E402

GEO_JSON = os.path.join(REPO, "packages", "taste", "src", "templates", "geo-seed.json")
LEVEL_KIND = {0: "country", 1: "region", 2: "subregion", 3: "vineyard"}


def slugify(label: str) -> str:
    # Mirrors the frontend slugify: lower, non-alnum -> '_', trim underscores.
    s = re.sub(r"[^a-z0-9]+", "_", (label or "").lower())
    return re.sub(r"^_+|_+$", "", s)


def flatten(file: dict) -> list[dict]:
    rows: list[dict] = []

    def walk(node: dict, parent_id, level: int, country_code, path_prefix: str):
        name = node["name"]
        nid = slugify(name) if parent_id is None else f"{parent_id}__{slugify(name)}"
        path = name if not path_prefix else f"{path_prefix} > {name}"
        rows.append({
            "id": nid,
            "parent_id": parent_id,
            "level": level,
            "kind": LEVEL_KIND.get(level, "region"),
            "name": name,
            "country_code": country_code,
            "path": path,
            "aliases": node.get("aliases"),
            # Wikidata QID where one matched — the stable external handle the
            # future map layer resolves geometry against. lat/lon sit in the JSON
            # but have no column yet; adding them is a migration, not a seed.
            "gi_id": node.get("gi_id"),
        })
        for child in node.get("children", []) or []:
            walk(child, nid, level + 1, country_code, path)

    for country in file.get("countries", []):
        code = country.get("code")
        cid = slugify(code or country["name"])
        rows.append({
            "id": cid, "parent_id": None, "level": 0, "kind": "country",
            "name": country["name"], "country_code": code, "path": country["name"],
            "aliases": country.get("aliases"), "gi_id": None,
        })
        for child in country.get("children", []) or []:
            walk(child, cid, 1, code, country["name"])
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write to the DB (default: dry run)")
    ap.add_argument("--prod", action="store_true", help="target the shared RDS")
    args = ap.parse_args()

    with open(GEO_JSON, encoding="utf-8") as fh:
        seed = json.load(fh)
    rows = flatten(seed)
    new_ids = {r["id"] for r in rows}

    db = SessionLocal()
    try:
        existing = {r[0] for r in db.execute(text("select id from taste.regions"))}
        adds = new_ids - existing
        updates = new_ids & existing
        orphaned = existing - new_ids

        print(f"geo-seed v{seed.get('version')} : {len(rows)} rows, "
              f"{len(seed.get('countries', []))} countries")
        print(f"  new      : {len(adds)}")
        print(f"  refreshed: {len(updates)}")
        print(f"  in DB but NOT in the seed: {len(orphaned)}")
        if orphaned:
            # These are the ids that would strand a wine's geo_ref_id.
            refs = dict(db.execute(text(
                "select geo_ref_id, count(*) from taste.wines "
                "where deleted=false and geo_ref_id = any(:ids) group by 1"
            ), {"ids": list(orphaned)}).all())
            for oid in sorted(orphaned):
                n = refs.get(oid, 0)
                flag = f"  <-- {n} WINE(S) POINT AT THIS" if n else ""
                print(f"      {oid}{flag}")
            if any(refs.values()):
                print("\n  NOTE: rows are never deleted by this script, so those wines keep")
                print("        resolving. But the seed no longer regenerates those ids.")

        if not args.apply:
            print("\nDry run - nothing written. Re-run with --apply.")
            return

        # Batched upsert, NOT db.merge() per row. merge() issues a SELECT per row:
        # 1513 round trips to ap-southeast-2 is minutes of silence, and the engine's
        # pool_recycle=300 can drop the connection mid-run — which looks exactly
        # like "it did nothing". One statement per chunk instead.
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        table = Region.__table__
        chunk = 500
        done = 0
        for i in range(0, len(rows), chunk):
            batch = rows[i:i + chunk]
            stmt = pg_insert(table).values(batch)
            stmt = stmt.on_conflict_do_update(
                index_elements=[table.c.id],
                set_={c: stmt.excluded[c] for c in
                      ("parent_id", "level", "kind", "name", "country_code", "path", "aliases", "gi_id")},
            )
            db.execute(stmt)
            done += len(batch)
            print(f"  upserted {done}/{len(rows)}...", flush=True)
        db.commit()
        total = db.query(Region).count()
        print(f"\nCommitted. taste.regions now has {total} rows.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
