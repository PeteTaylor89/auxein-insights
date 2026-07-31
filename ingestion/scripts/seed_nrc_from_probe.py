#!/usr/bin/env python
"""Seed the NRC (Northland) RAINFALL station set from a probe_hilltop.py dump and UPSERT.

Consumes nrc_rain.json (probe_hilltop.py --agency nrc --collection Rainfall). V1 is
rainfall-only; NRC's multi-depth soil is deferred (data-model decision). Filters to live
sites, requires the 'Rainfall' measurement + coords, reuses existing codes by API name.

Not set here: zone_id; elevation (Pete adds manually). Region = 'Northland'.
Usage: python ingestion/scripts/seed_nrc_from_probe.py [--dry-run]
COMMERCIAL LICENCE: NRC written permission required — cleared 2026-07-30.
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
PROBE_FILE = PROBES / "nrc_rain.json"
LIVE_CUTOFF = "2026-04"
DATA_SOURCE = "NRC"
REGION = "Northland"
MEASUREMENT = "Rainfall"


def slug(name):
    return "NRC_" + re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_").upper()


def latest_to(datasources):
    tos = [d.get("to") for d in datasources if d.get("to")]
    return max(tos) if tos else ""


def build_sites():
    payload = json.loads(PROBE_FILE.read_text(encoding="utf-8"))
    Session = get_ingestion_session()
    with Session() as s:
        rows = s.execute(text(
            "SELECT station_code, source_id FROM weather_stations WHERE data_source=:ds"),
            {"ds": DATA_SOURCE}).fetchall()
    existing = {r[1]: r[0] for r in rows}
    used_codes = set(existing.values())

    sites, dead, skipped = {}, 0, 0
    for name, v in payload.get("sites", {}).items():
        if v.get("error"):
            continue
        has_rain = any(m.get("name") == MEASUREMENT
                       for ds in v.get("datasources", []) for m in ds.get("measurements", []))
        if not has_rain:
            skipped += 1
            continue
        if latest_to(v.get("datasources", []))[:7] < LIVE_CUTOFF:
            dead += 1
            continue
        if not v.get("lat") or not v.get("lon"):
            skipped += 1
            continue
        code = existing.get(name) or slug(name)
        if not existing.get(name):
            base, n = code, 2
            while code in used_codes:
                code = f"{base}_{n}"; n += 1
        used_codes.add(code)
        sites[code] = {"name": name, "lat": float(v["lat"]), "lon": float(v["lon"]),
                       "is_existing": name in existing}
    return sites, existing, dead, skipped


UPSERT_UPDATE = text("""
    UPDATE weather_stations SET
        station_name=:name, source_id=:name, latitude=:lat, longitude=:lon,
        location=ST_SetSRID(ST_MakePoint(:lon,:lat),4326)::geography,
        region=:region, notes=CAST(:notes AS jsonb), is_active=true
    WHERE station_id=:sid
""")
UPSERT_INSERT = text("""
    INSERT INTO weather_stations
        (station_code, station_name, data_source, source_id, latitude, longitude,
         elevation, location, region, notes, is_active)
    VALUES (:code,:name,:ds,:name,:lat,:lon,NULL,
            ST_SetSRID(ST_MakePoint(:lon,:lat),4326)::geography,:region,CAST(:notes AS jsonb),true)
""")


def run(dry_run):
    sites, existing, dead, skipped = build_sites()
    created = updated = errors = 0
    Session = get_ingestion_session()
    with Session() as s:
        for code, cfg in sorted(sites.items()):
            notes = json.dumps({"name": cfg["name"], "site_name": cfg["name"],
                                "measurements": [MEASUREMENT], "subregion": ""})
            p = {"code": code, "name": cfg["name"], "lat": cfg["lat"], "lon": cfg["lon"],
                 "region": REGION, "notes": notes, "ds": DATA_SOURCE}
            try:
                row = s.execute(text("SELECT station_id FROM weather_stations WHERE station_code=:c AND data_source=:ds"),
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
    print("NRC rainfall seed from probe" + ("  [DRY RUN]" if dry_run else ""))
    print("=" * 60)
    print(f"  Live rainfall sites to seed : {len(sites)}   (dead={dead}, skipped={skipped})")
    print(f"  -> UPDATE existing : {updated}   INSERT new: {created}   Errors: {errors}")
    for i, (code, cfg) in enumerate(sorted(sites.items())):
        if i >= 8:
            break
        print(f"    {code:40} ({cfg['lat']:.4f},{cfg['lon']:.4f})")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    run(ap.parse_args().dry_run)
