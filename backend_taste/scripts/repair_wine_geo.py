#!/usr/bin/env python
"""Repair wines whose whole geography path was written into `geo_country`.

Before 2026-07-03 the GeoPicker wrote the region's full path into `geo_country`
and left the other three fields empty, so a wine reads:

    geo_country = "France > Burgundy > Chablis"   geo_region = ""   ...

Measured on prod 2026-09-21: 27 rows affected, 26 of which still carry a correct
`geo_ref_id`, and all 64 geo_ref_ids in the table resolve against taste.regions.
So the repair is mostly a re-derivation from canonical data rather than a guess.

TWO SOURCES, in order of trust:
  1. `geo_ref_id` -> `taste.regions.path`. Authoritative: the region tree is
     server-owned and was not affected by the bug.
  2. Splitting the jammed string on " > ". Used only where there is no ref id.
     Weaker, because it trusts the very field the bug corrupted, but the string
     IS the path and splitting it is exactly what should have happened.

Never overwrites a non-empty field. If a row somehow has both the jammed country
AND a real region, the repair skips it and says so rather than choosing.

Dry run by default, matching the seed scripts:
    ../backend/venv/Scripts/python.exe scripts/repair_wine_geo.py            # plan, local
    ../backend/venv/Scripts/python.exe scripts/repair_wine_geo.py --prod     # plan, RDS
    ../backend/venv/Scripts/python.exe scripts/repair_wine_geo.py --prod --apply
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

SEPARATOR = " > "


def _use_prod_db() -> str:
    """Point this run at the shared RDS, built from the repo .env RDS_* vars.

    Opt-in and printed, for the same reason as the seed scripts: backend_taste
    prefers LOCAL_DATABASE_URL, so an unqualified run must not be able to touch
    prod by accident.
    """
    from dotenv import load_dotenv

    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "..", ".env"))
    host, user = os.getenv("RDS_ENDPOINT"), os.getenv("RDS_USER")
    pwd, name = os.getenv("RDS_PASSWORD"), os.getenv("RDS_DATABASE")
    port = os.getenv("RDS_PORT", "5432")
    if not all([host, user, pwd, name]):
        sys.exit("--prod needs RDS_ENDPOINT/RDS_USER/RDS_PASSWORD/RDS_DATABASE in the repo .env")
    url = f"postgresql://{user}:{pwd}@{host}:{port}/{name}"
    os.environ["DATABASE_URL"] = url
    os.environ.pop("LOCAL_DATABASE_URL", None)
    return f"{host}:{port}/{name}"


# Must be resolved BEFORE db.base is imported (it builds the engine at import).
if "--prod" in sys.argv:
    print(f"*** TARGET: {_use_prod_db()} (shared RDS) ***")

from sqlalchemy.orm import load_only  # noqa: E402

from db.base import SessionLocal  # noqa: E402
from db.models import Region, Wine  # noqa: E402

# Only the columns this repair reads or writes. Two reasons, and both matter:
# a bare `db.query(Wine)` selects EVERY mapped column, so it fails outright on a
# database that has not yet had 0005-0007 (`wine_ref_id` does not exist there) —
# which would make this script depend on migration order for no reason. It is
# also the house rule about not selecting columns you do not need.
_REPAIR_COLS = (
    Wine.id, Wine.geo_country, Wine.geo_region,
    Wine.geo_subregion_appellation, Wine.geo_vineyard, Wine.geo_ref_id,
)


def split_path(path: str) -> list:
    return [part.strip() for part in path.split(SEPARATOR) if part.strip()]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true", help="write to the DB (default: dry run)")
    ap.add_argument("--prod", action="store_true", help="target the shared RDS")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        candidates = (
            db.query(Wine)
            .options(load_only(*_REPAIR_COLS))
            .filter(Wine.deleted.is_(False), Wine.geo_country.like("%" + SEPARATOR.strip() + "%"))
            .order_by(Wine.id)
            .all()
        )
        print(f"\n{len(candidates)} wine(s) with a path in geo_country\n")

        planned, skipped = 0, 0
        for wine in candidates:
            # Refuse to choose between two populated fields.
            if (wine.geo_region or "").strip() or (wine.geo_subregion_appellation or "").strip():
                print(f"  SKIP  {wine.id}  already has discrete fields; not overwriting")
                skipped += 1
                continue

            parts, source = [], None
            if wine.geo_ref_id:
                region = (
                    db.query(Region)
                    .options(load_only(Region.id, Region.path))
                    .filter(Region.id == wine.geo_ref_id)
                    .first()
                )
                if region is not None and region.path:
                    parts, source = split_path(region.path), "regions.path"

            if not parts:
                parts, source = split_path(wine.geo_country or ""), "split(geo_country)"

            if not parts:
                print(f"  SKIP  {wine.id}  nothing to derive from")
                skipped += 1
                continue

            country = parts[0] if len(parts) > 0 else ""
            region_name = parts[1] if len(parts) > 1 else ""
            subregion = parts[2] if len(parts) > 2 else ""
            vineyard = parts[3] if len(parts) > 3 else ""

            print(f"  FIX   {wine.id}  [{source}]")
            print(f"          country={wine.geo_country!r} -> {country!r}")
            if region_name:
                print(f"          region -> {region_name!r}")
            if subregion:
                print(f"          subregion -> {subregion!r}")
            if vineyard:
                print(f"          vineyard -> {vineyard!r}")

            if args.apply:
                wine.geo_country = country
                wine.geo_region = region_name
                wine.geo_subregion_appellation = subregion
                # Only fill the vineyard if the path actually has one; the field
                # may legitimately hold something the path does not.
                if vineyard and not (wine.geo_vineyard or "").strip():
                    wine.geo_vineyard = vineyard
                # `updated_at`/`version` are deliberately NOT bumped. This is a
                # repair of a write that already happened, not a new edit, and
                # bumping them would make every affected wine look freshly
                # changed in every client that sorts by it.
            planned += 1

        print(f"\n{planned} to repair, {skipped} skipped")
        if args.apply:
            db.commit()
            print("Committed.")
        else:
            print("Dry run — nothing written. Re-run with --apply to write.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
