#!/usr/bin/env python
"""Generate the TDC (Tasman + Nelson) station set from probe_hilltop.py dumps and UPSERT.

Consumes tdc_webweather.json + ncc_met.json + tdc_rain.json. Same shape as the other
seed_*_from_probe.py generators, with TWO TDC-specific twists:

  1. VARIANT DE-DUP: TDC/Nelson expose several names for one variable
     (Air Temperature (continuous) vs (Hourly); Wind Speed (10 min) vs (hourly);
     Relative Humidity variants). We keep at most ONE name per canonical variable
     per site, preferring the order in MEASUREMENT_VAR, so a station never carries
     two names for one var (which would double-write on ingest).

  2. PRESERVE EXISTING MEASUREMENTS: the probed collections don't include solar,
     but existing stations (e.g. Motueka Sportspark) have 'Solar Radiation'. For a
     matched existing station we UNION its current notes->measurements with the
     probe-found ones before de-duping, so nothing already configured is lost.

Not set here: zone_id; elevation (fill_elevation_from_dem.py --source TDC).
Usage: python ingestion/scripts/seed_tdc_from_probe.py [--dry-run]
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # ingestion/
from db_connection import get_ingestion_session
from sqlalchemy import text

REPO = Path(__file__).resolve().parents[2]
PROBE_FILES = [REPO / "tdc_webweather.json", REPO / "ncc_met.json", REPO / "tdc_rain.json"]
LIVE_CUTOFF = "2026-04"
REGION = "Nelson"
DATA_SOURCE = "TDC"

# Ordered (name, canonical_var), preferred variant FIRST. Must match tdc.py's map.
MEASUREMENT_VAR = [
    ("Air Temperature (continuous)", "temp"),
    ("Air Temperature (Hourly)", "temp"),
    ("Relative Humidity (Hourly)", "rh"),
    ("Relative humidity", "rh"),
    ("Relative Humidity", "rh"),
    ("Rainfall", "rainfall"),
    ("Solar Radiation", "solar_radiation"),
    ("Wind Speed (10 min)", "wind_speed"),
    ("Wind Speed (hourly)", "wind_speed"),
    ("Wind Direction (10 min)", "wind_direction"),
    ("Wind Direction (hourly)", "wind_direction"),
    ("Barometric Pressure", "pressure"),
]
KNOWN_SET = {n for n, _ in MEASUREMENT_VAR}
ANCHOR_VARS = {"rainfall", "temp", "rh"}

# RESTRICTED per the TDC access agreement (see config/tdc_sites.py) — do NOT ingest
# without explicit TDC permission. Richmond Racecourse is flagged restricted.
EXCLUDE_SITES = {"HY Richmond Weather at Race Course"}


def dedup_by_var(name_set):
    """Keep one measurement name per canonical var, by MEASUREMENT_VAR priority."""
    taken, out = set(), []
    for name, var in MEASUREMENT_VAR:
        if name in name_set and var not in taken:
            out.append(name); taken.add(var)
    return out, {var for _, var in MEASUREMENT_VAR if _ in name_set}


def slug(name):
    return "TDC_" + re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_").upper()


def latest_to(datasources):
    tos = [d.get("to") for d in datasources if d.get("to")]
    return max(tos) if tos else ""


def load_probe(path):
    if not path.exists():
        print(f"  ! missing probe dump: {path.name} (skipping)")
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    out = {}
    for name, v in payload.get("sites", {}).items():
        if v.get("error"):
            continue
        meas = {m.get("name") for ds in v.get("datasources", [])
                for m in ds.get("measurements", []) if m.get("name") in KNOWN_SET}
        out[name] = {"lat": v.get("lat"), "lon": v.get("lon"),
                     "measurements": meas, "latest": latest_to(v.get("datasources", []))}
    return out


def build_sites():
    Session = get_ingestion_session()
    with Session() as s:
        rows = s.execute(text(
            "SELECT station_code, source_id, notes->'measurements' FROM weather_stations "
            "WHERE data_source=:ds"), {"ds": DATA_SOURCE}).fetchall()
    existing = {r[1]: r[0] for r in rows}                       # source_id -> code
    existing_meas = {r[1]: set(r[2] or []) for r in rows}       # source_id -> current names
    used_codes = set(existing.values())

    merged = {}
    for path in PROBE_FILES:
        for name, v in load_probe(path).items():
            if name in merged:
                merged[name]["measurements"] |= v["measurements"]
                if v.get("lat"):
                    merged[name]["lat"], merged[name]["lon"] = v["lat"], v["lon"]
                merged[name]["latest"] = max(merged[name]["latest"], v["latest"])
            else:
                merged[name] = dict(v)

    sites, dead, skipped, excluded, warnings = {}, 0, 0, 0, []
    for name, v in merged.items():
        if name in EXCLUDE_SITES:
            excluded += 1
            continue
        if not v["latest"] or v["latest"][:7] < LIVE_CUTOFF:
            dead += 1
            continue
        names = set(v["measurements"])
        if name in existing_meas:                 # PRESERVE existing (e.g. solar)
            names |= (existing_meas[name] & KNOWN_SET)
        meas, vars_present = dedup_by_var(names)
        if not (vars_present & ANCHOR_VARS):
            skipped += 1
            continue
        if not v.get("lat") or not v.get("lon"):
            skipped += 1
            warnings.append(f"missing coords, skipped: {name}")
            continue
        code = existing.get(name)
        if not code:
            code = slug(name)
            base, n = code, 2
            while code in used_codes:
                code = f"{base}_{n}"; n += 1
        used_codes.add(code)
        sites[code] = {"site_name": name, "name": name, "measurements": meas,
                       "region": REGION, "lat": float(v["lat"]), "lon": float(v["lon"]),
                       "is_existing": name in existing}
    return sites, existing, dead, skipped, excluded, warnings


UPSERT_UPDATE = text("""
    UPDATE weather_stations SET
        station_name=:name, source_id=:site_name, latitude=:lat, longitude=:lon,
        location=ST_SetSRID(ST_MakePoint(:lon,:lat),4326)::geography,
        elevation=COALESCE(:elevation, elevation),
        region=:region, notes=CAST(:notes AS jsonb), is_active=true
    WHERE station_id=:sid
""")
UPSERT_INSERT = text("""
    INSERT INTO weather_stations
        (station_code, station_name, data_source, source_id, latitude, longitude,
         elevation, location, region, notes, is_active)
    VALUES (:code,:name,:ds,:site_name,:lat,:lon,NULL,
            ST_SetSRID(ST_MakePoint(:lon,:lat),4326)::geography,:region,CAST(:notes AS jsonb),true)
""")


def run(dry_run):
    sites, existing, dead, skipped, excluded, warnings = build_sites()
    created = updated = errors = 0
    Session = get_ingestion_session()
    with Session() as s:
        for code, cfg in sorted(sites.items()):
            notes = json.dumps({"name": cfg["name"], "site_name": cfg["site_name"],
                                "measurements": cfg["measurements"], "subregion": ""})
            p = {"code": code, "name": cfg["name"], "site_name": cfg["site_name"],
                 "lat": cfg["lat"], "lon": cfg["lon"], "elevation": None,
                 "region": cfg["region"], "notes": notes, "ds": DATA_SOURCE}
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
                errors += 1; s.rollback(); warnings.append(f"ERROR {code}: {e}")

    n_rich = sum(1 for c in sites.values() if len(c["measurements"]) > 1)
    matched = sum(1 for c in sites.values() if c["is_existing"])
    print("\n" + "=" * 60)
    print("TDC seed from probe" + ("  [DRY RUN]" if dry_run else ""))
    print("=" * 60)
    print(f"  Live sites to seed : {len(sites)}  ({n_rich} multi-var, {len(sites)-n_rich} single-var)")
    print(f"  Dead: {dead}   Skipped: {skipped}   Restricted-excluded: {excluded}")
    print(f"  -> UPDATE existing : {updated}   INSERT new: {created}   Errors: {errors}")
    print(f"  Existing DB TDC matched: {matched} / {len(existing)}")
    if matched < len(existing):
        print(f"  ! existing NOT matched (left untouched): {sorted(set(existing) - {c['site_name'] for c in sites.values()})}")
    for w in warnings[:20]:
        print("    - " + w)
    print("\n  Sample multi-var stations:")
    shown = 0
    for code, cfg in sorted(sites.items()):
        if len(cfg["measurements"]) > 1:
            print(f"    {code} ({'exist' if cfg['is_existing'] else 'new'}): {cfg['measurements']}")
            shown += 1
            if shown >= 8:
                break


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    run(ap.parse_args().dry_run)
