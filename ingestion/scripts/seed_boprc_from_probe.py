#!/usr/bin/env python
"""Seed the Bay of Plenty station set from the AQUARIUS catalogue capture.

Consumes probes/aquarius_boprc.json (probe_aquarius.py --council boprc --datasets):
447 locations, all with WGS84 coordinates, 5,534 datasets.

*** THIS SCRIPT REFUSES TO WRITE WHILE THE PORTAL IS GATED. ***

BoP publishes catalogue metadata anonymously and closes every value path, so stations
seeded today could not be fed. That is the ECan 4-of-102 failure — 98 stations sitting
inert in `weather_stations`, dragging the freshness dashboard and the interpolation
network count — and at BoP's scale it would be worse. The guard is deliberate: run
`--dry-run` freely to see what WOULD be seeded, but a real write requires
`BoPRCIngestion.check_access()` to pass. `--force` overrides it and prints why that is
a bad idea; it exists for the case where access is granted through a path the check
does not recognise.

Selection rules (all measured from the 2026-08-11 capture — see sources/boprc.py):
  - Only parameters in MEASUREMENT_MAP; derived indices and river temperature dropped.
  - Qualifier must be raw or hourly (Primary / Operational / HourTotal / HourMean).
    FieldResult is manual water-quality spot sampling, not telemetry, and Day* are
    daily aggregates — both rejected.
  - Datasets republished from other councils (Operational_GDC, Operational_HBRC, ESNZ)
    are dropped: we already ingest those councils directly.
  - Any location within DEDUPE_METRES of an existing station from ANY source is
    reported as a probable duplicate. Coordinates, not names — the same gauge carries
    different labels at different councils.

Not set here: zone_id; elevation (run fill_elevation_from_dem.py afterwards).

Usage:
    python ingestion/scripts/seed_boprc_from_probe.py --dry-run
    python ingestion/scripts/seed_boprc_from_probe.py            # blocked while gated
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # ingestion/
from db_connection import get_ingestion_session
from sources.boprc import (BoPRCIngestion, MEASUREMENT_MAP, QUALIFIER_REJECT,
                           choose_dataset, parse_display_text, FOREIGN_AGENCY_RE)
from sqlalchemy import text

PROBES = Path(__file__).resolve().parent / "probes"
PROBE_FILE = PROBES / "aquarius_boprc.json"
DATA_SOURCE = "BOPRC"
REGION = "Bay of Plenty"

# Two gauges closer than this are treated as the same physical site.
DEDUPE_METRES = 150


def slug(name):
    return "BOPRC_" + re.sub(r"[^A-Za-z0-9]+", "_", name or "").strip("_").upper()[:44]


def build_sites():
    payload = json.loads(PROBE_FILE.read_text(encoding="utf-8"))
    locations = payload.get("locations") or []

    sites = {}
    rejected = {}          # qualifier -> count, for the report
    foreign = 0
    for loc in locations:
        datasets = loc.get("Datasets") or []
        chosen = {}
        for parameter in MEASUREMENT_MAP:
            ds = choose_dataset(datasets, parameter)
            if ds:
                chosen[parameter] = ds.get("DisplayText")
        # Tally what was thrown away, so the report explains the shrinkage.
        for ds in datasets:
            if ds.get("ParameterName") not in MEASUREMENT_MAP:
                continue
            _l, qual, _loc = parse_display_text(ds.get("DisplayText"))
            if qual and FOREIGN_AGENCY_RE.search(qual):
                foreign += 1
            elif qual in QUALIFIER_REJECT:
                rejected[qual] = rejected.get(qual, 0) + 1
        if not chosen:
            continue
        if not loc.get("LocX") or not loc.get("LocY"):
            continue
        sites[loc["LocationId"]] = {
            "name": loc.get("Location"),
            "identifier": loc.get("LocationIdentifier"),
            "lat": float(loc["LocY"]), "lon": float(loc["LocX"]),
            "datasets": chosen,
        }
    return sites, rejected, foreign, len(locations)


def find_duplicates(sites):
    """Locations sitting on top of an existing station from any source."""
    dupes = {}
    Session = get_ingestion_session()
    with Session() as s:
        for lid, cfg in sites.items():
            row = s.execute(text("""
                SELECT station_code, data_source,
                       ST_Distance(location, ST_SetSRID(ST_MakePoint(:lon,:lat),4326)::geography) AS m
                FROM weather_stations
                WHERE data_source <> :ds
                  AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(:lon,:lat),4326)::geography, :r)
                ORDER BY m LIMIT 1
            """), {"lon": cfg["lon"], "lat": cfg["lat"], "r": DEDUPE_METRES,
                   "ds": DATA_SOURCE}).fetchone()
            if row:
                dupes[lid] = (row[0], row[1], round(row[2]))
    return dupes


UPSERT_UPDATE = text("""
    UPDATE weather_stations SET
        station_name=:name, source_id=:source_id, latitude=:lat, longitude=:lon,
        location=ST_SetSRID(ST_MakePoint(:lon,:lat),4326)::geography,
        region=:region, notes=CAST(:notes AS jsonb), is_active=true, updated_at=NOW()
    WHERE station_id=:sid
""")
UPSERT_INSERT = text("""
    INSERT INTO weather_stations
        (station_code, station_name, data_source, source_id, latitude, longitude,
         elevation, location, region, notes, is_active)
    VALUES (:code,:name,:ds,:source_id,:lat,:lon,NULL,
            ST_SetSRID(ST_MakePoint(:lon,:lat),4326)::geography,:region,
            CAST(:notes AS jsonb),true)
""")


def run(dry_run, force):
    if not PROBE_FILE.exists():
        print(f"! missing {PROBE_FILE} — run "
              f"probe_aquarius.py --council boprc --datasets")
        return

    ok, detail = BoPRCIngestion().check_access()
    print(f"BoP value-path access: {'OPEN' if ok else 'GATED'} — {detail}\n")

    sites, rejected, foreign, n_locations = build_sites()
    dupes = find_duplicates(sites)

    counts = {}
    for cfg in sites.values():
        for parameter in cfg["datasets"]:
            v = MEASUREMENT_MAP[parameter][0]
            counts[v] = counts.get(v, 0) + 1

    print("=" * 64)
    print("BoP seed from AQUARIUS catalogue" + ("  [DRY RUN]" if dry_run else ""))
    print("=" * 64)
    print(f"  Locations in capture   : {n_locations}")
    print(f"  Carrying usable weather: {len(sites)}")
    print(f"  Probable duplicates    : {len(dupes)} (within {DEDUPE_METRES} m of an existing station)")
    for lid, (code, src, m) in sorted(dupes.items())[:10]:
        print(f"      {sites[lid]['name'][:34]:34} ~{m:>4} m from {src}:{code}")
    if len(dupes) > 10:
        print(f"      ... and {len(dupes) - 10} more")
    print(f"  Datasets dropped as foreign republishing: {foreign}")
    if rejected:
        print("  Datasets dropped by qualifier:")
        for q, c in sorted(rejected.items(), key=lambda kv: -kv[1]):
            print(f"      {c:>4}  {q:26} {QUALIFIER_REJECT.get(q,'')}")
    print("  Variable coverage (usable sites):")
    for v, c in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"      {c:>4}  {v}")

    if not ok and not force:
        print()
        print("  ** NOT SEEDING ** the BoP value path is gated, so these stations could")
        print("     not be fed. Seeding them would add inert rows to weather_stations,")
        print("     inflate the network count the interpolation reports, and show up as")
        print("     permanently stale on the freshness check.")
        print("     Re-run once `python ingestion/sources/boprc.py --check-access` says OPEN.")
        print("     Override with --force only if access was granted by some other path.")
        return
    if dry_run:
        print("\n  [DRY RUN] no rows written.")
        return
    if not ok and force:
        print("\n  !! --force with a GATED portal: seeding stations that cannot be fed.")

    created = updated = errors = 0
    Session = get_ingestion_session()
    used_codes = set()
    with Session() as s:
        rows = s.execute(text(
            "SELECT station_code, source_id FROM weather_stations WHERE data_source=:ds"),
            {"ds": DATA_SOURCE}).fetchall()
        existing = {r[1]: r[0] for r in rows}
        used_codes.update(existing.values())

        for lid, cfg in sorted(sites.items()):
            source_id = str(lid)
            code = existing.get(source_id)
            if not code:
                code = slug(cfg["name"])
                base, n = code, 2
                while code in used_codes:
                    code = f"{base}_{n}"; n += 1
            used_codes.add(code)
            notes = json.dumps({
                "name": cfg["name"], "site_name": cfg["name"],
                "location_identifier": cfg["identifier"],
                "aquarius_location_id": lid,
                # Store the resolved DisplayText per parameter: the ingestion client
                # needs the exact dataset, not just the parameter name, because one
                # parameter can exist at several aggregations on the same location.
                "datasets": cfg["datasets"],
                "measurements": sorted(cfg["datasets"]),
            })
            p = {"code": code, "name": cfg["name"], "source_id": source_id,
                 "lat": cfg["lat"], "lon": cfg["lon"], "region": REGION,
                 "notes": notes, "ds": DATA_SOURCE}
            try:
                row = s.execute(text(
                    "SELECT station_id FROM weather_stations "
                    "WHERE data_source=:ds AND source_id=:source_id"),
                    {"ds": DATA_SOURCE, "source_id": source_id}).fetchone()
                if row:
                    s.execute(UPSERT_UPDATE, {**p, "sid": row[0]}); s.commit(); updated += 1
                else:
                    s.execute(UPSERT_INSERT, p); s.commit(); created += 1
            except Exception as e:
                errors += 1; s.rollback(); print(f"    ERROR {code}: {e}")

    print(f"\n  -> UPDATE existing : {updated}   INSERT new: {created}   Errors: {errors}")
    print("\n  NEXT: python ingestion/scripts/fill_elevation_from_dem.py --source BOPRC")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true",
                    help="seed even though the value path is gated (not recommended)")
    a = ap.parse_args()
    run(a.dry_run, a.force)
