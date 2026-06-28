# backend_taste/scripts/seed_taste_regions.py
# Seed/refresh the global taste.regions reference table from the canonical
# geo-seed.json (the frontend's single source of truth). Idempotent upsert by id.
#
#   cd backend_taste && unset DATABASE_URL
#   ../backend/venv/Scripts/python.exe scripts/seed_taste_regions.py
#
import json
import os
import re
import sys
from datetime import datetime, timezone

# Make `db` importable when run as `python scripts/seed_taste_regions.py`.
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)          # backend_taste/
REPO = os.path.dirname(ROOT)          # repo root
sys.path.insert(0, ROOT)

from db.base import SessionLocal  # noqa: E402
from db.models import Region  # noqa: E402

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
    with open(GEO_JSON, encoding="utf-8") as fh:
        rows = flatten(json.load(fh))

    db = SessionLocal()
    try:
        for r in rows:
            db.merge(Region(**r))   # upsert by PK
        db.commit()
        total = db.query(Region).count()
        print(f"Seeded {len(rows)} regions from {os.path.relpath(GEO_JSON, REPO)}; table now has {total}.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
