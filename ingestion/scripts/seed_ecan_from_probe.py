#!/usr/bin/env python
"""Seed the full ECan (Canterbury) rainfall station set from probe_ecan.py and UPSERT.

Consumes probes/ecan_sites.json. Takes ECan from the 4 hand-picked sites in
`config/ecan_sites.py` to the whole published catalogue (~108). Canterbury was
the single biggest coverage gap in the network.

Rainfall only — the ECan open data portal publishes no temperature/climate
collection (see probe_ecan.py). Sites without WGS84 coordinates are skipped:
they cannot be placed on the interpolation grid or elevation-filled.

Existing rows are matched on `source_id` (the ECan SITE_NO), so the four
original stations keep their station_code, zone_id and elevation.

Not set here: zone_id; elevation (run fill_elevation_from_dem.py afterwards).
Usage: python ingestion/scripts/seed_ecan_from_probe.py [--dry-run]
LICENCE: CC BY 4.0 — attribute Environment Canterbury.
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # ingestion/
from db_connection import get_ingestion_session
from sqlalchemy import text

PROBES = Path(__file__).resolve().parent / "probes"
PROBE_FILE = PROBES / "ecan_sites.json"
DATA_SOURCE = "ECAN"
REGION = "Canterbury"
MEASUREMENT = "rainfall"


def slug(name):
    return "ECAN_" + re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_").upper()


def normalise_owner(owner):
    """The feed spells the council's own name three ways (ECan/Ecan/ECAN).

    Collapse those to one label so the genuinely third-party owners — CCC
    (Christchurch City Council) and ESNZ — stay countable and distinguishable.
    """
    o = (owner or "").strip()
    return "ECan" if o.lower() == "ecan" else o


def build_sites():
    payload = json.loads(PROBE_FILE.read_text(encoding="utf-8"))
    Session = get_ingestion_session()
    with Session() as s:
        rows = s.execute(text(
            "SELECT station_code, source_id FROM weather_stations WHERE data_source=:ds"),
            {"ds": DATA_SOURCE}).fetchall()
    # Existing rows are keyed by SITE_NO, which is stable across catalogue
    # refreshes; site names are not (the feed calls 229910 both "Pannets Road"
    # and "Pannetts Rd").
    existing = {r[1]: r[0] for r in rows}
    used_codes = set(existing.values())

    sites, skipped = {}, []
    for site_no, v in payload.get("sites", {}).items():
        if not v.get("lat") or not v.get("lon"):
            skipped.append(v.get("name") or site_no)
            continue
        code = existing.get(site_no)
        if not code:
            code = slug(v["name"] or site_no)
            base, n = code, 2
            while code in used_codes:
                code = f"{base}_{n}"; n += 1
        used_codes.add(code)
        sites[code] = {
            "site_no": site_no,
            "name": v["name"],
            "lat": float(v["lat"]),
            "lon": float(v["lon"]),
            "owner": normalise_owner(v.get("owner")),
            "area": v.get("area"),
            "is_existing": site_no in existing,
        }
    return sites, existing, skipped


UPSERT_UPDATE = text("""
    UPDATE weather_stations SET
        station_name=:name, source_id=:site_no, latitude=:lat, longitude=:lon,
        location=ST_SetSRID(ST_MakePoint(:lon,:lat),4326)::geography,
        region=:region, notes=CAST(:notes AS jsonb), is_active=true,
        updated_at=NOW()
    WHERE station_id=:sid
""")
UPSERT_INSERT = text("""
    INSERT INTO weather_stations
        (station_code, station_name, data_source, source_id, latitude, longitude,
         elevation, location, region, notes, is_active)
    VALUES (:code,:name,:ds,:site_no,:lat,:lon,NULL,
            ST_SetSRID(ST_MakePoint(:lon,:lat),4326)::geography,:region,
            CAST(:notes AS jsonb),true)
""")


def run(dry_run):
    sites, existing, skipped = build_sites()
    created = updated = errors = 0
    Session = get_ingestion_session()
    with Session() as s:
        for code, cfg in sorted(sites.items()):
            notes = json.dumps({
                "name": cfg["name"],
                "site_name": cfg["name"],
                "site_no": cfg["site_no"],
                "variables": [MEASUREMENT],
                "measurements": [MEASUREMENT],
                "owner": cfg["owner"],
                "area": cfg["area"],
            })
            p = {"code": code, "name": cfg["name"], "site_no": cfg["site_no"],
                 "lat": cfg["lat"], "lon": cfg["lon"], "region": REGION,
                 "notes": notes, "ds": DATA_SOURCE}
            try:
                row = s.execute(text(
                    "SELECT station_id FROM weather_stations "
                    "WHERE station_code=:c AND data_source=:ds"),
                    {"c": code, "ds": DATA_SOURCE}).fetchone()
                if row:
                    if not dry_run:
                        s.execute(UPSERT_UPDATE, {**p, "sid": row[0]}); s.commit()
                    updated += 1
                else:
                    if not dry_run:
                        s.execute(UPSERT_INSERT, p); s.commit()
                    created += 1
            except Exception as e:
                errors += 1; s.rollback(); print(f"    ERROR {code}: {e}")

    print("\n" + "=" * 60)
    print("ECan rainfall seed from probe" + ("  [DRY RUN]" if dry_run else ""))
    print("=" * 60)
    print(f"  Sites in catalogue with coords : {len(sites)}")
    print(f"  Skipped (no coordinates)       : {len(skipped)}"
          + (f" -> {', '.join(skipped)}" if skipped else ""))
    print(f"  -> UPDATE existing : {updated}   INSERT new: {created}   Errors: {errors}")
    owners = {}
    for cfg in sites.values():
        owners[cfg["owner"]] = owners.get(cfg["owner"], 0) + 1
    print(f"  Owners: {owners}")
    print("\n  NEXT: python ingestion/scripts/fill_elevation_from_dem.py --source ECAN")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    run(ap.parse_args().dry_run)
