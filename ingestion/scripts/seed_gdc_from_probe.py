#!/usr/bin/env python
"""Generate the GDC station set from probe_hilltop.py JSON dumps and UPSERT it.

Consumes gdc_climate.json + gdc_weather.json + gdc_rain.json (from probe_hilltop.py),
dedupes sites across collections, filters to live + weather-relevant, maps to the
canonical measurement set, and upserts into weather_stations.

Same shape as seed_mdc_from_probe.py. GDC specifics: wind is km/hr (scaled to m/s in
gdc.py), rainfall to 1946, no solar/soil. ANCHOR filter keeps genuine weather/rain
sites. Existing GDC stations are matched by API site-name to reuse their code.

Not set here: zone_id (interpolation supersedes zone aggregation) and elevation
(filled separately: fill_elevation_from_dem.py --source GDC).

Usage:
    python ingestion/scripts/seed_gdc_from_probe.py --dry-run
    python ingestion/scripts/seed_gdc_from_probe.py
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
PROBE_FILES = [PROBES / "gdc_climate.json", PROBES / "gdc_weather.json", PROBES / "gdc_rain.json"]
LIVE_CUTOFF = "2026-04"
REGION = "Gisborne"
DATA_SOURCE = "GDC"

# Canonical GDC measurement names we ingest (must match gdc.py measurement_map keys).
KNOWN_MEASUREMENTS = [
    "Air Temperature",
    "Relative Humidity",
    "Rainfall",
    "Average Wind Speed",
    "Average Wind Direction",
    "Maximum Wind Speed",
    "Barometric Pressure (hPa)",
]
KNOWN_SET = set(KNOWN_MEASUREMENTS)
# A site must carry at least one ANCHOR var to be a genuine weather/rain site.
ANCHOR = {"Rainfall", "Air Temperature", "Relative Humidity"}


def slug(name: str) -> str:
    s = re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_").upper()
    return f"GDC_{s}"


def latest_to(datasources) -> str:
    tos = [d.get("to") for d in datasources if d.get("to")]
    return max(tos) if tos else ""


def load_probe(path: Path) -> dict:
    if not path.exists():
        print(f"  ! missing probe dump: {path.name} (skipping)")
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    out = {}
    for name, v in payload.get("sites", {}).items():
        if v.get("error"):
            continue
        meas = set()
        for ds in v.get("datasources", []):
            for m in ds.get("measurements", []):
                if m.get("name") in KNOWN_SET:
                    meas.add(m["name"])
        out[name] = {"lat": v.get("lat"), "lon": v.get("lon"),
                     "measurements": meas, "latest": latest_to(v.get("datasources", []))}
    return out


def build_sites():
    Session = get_ingestion_session()
    with Session() as s:
        existing = {row[1]: row[0] for row in s.execute(text(
            "SELECT station_code, source_id FROM weather_stations WHERE data_source=:ds"
        ), {"ds": DATA_SOURCE}).fetchall()}  # source_id -> code
        existing_codes = set(existing.values())

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

    sites, dead, skipped_noanchor, skipped_other, warnings = {}, 0, 0, 0, []
    used_codes = set(existing_codes)
    for name, v in merged.items():
        if not v["latest"] or v["latest"][:7] < LIVE_CUTOFF:
            dead += 1
            continue
        if not (v["measurements"] & ANCHOR):
            skipped_noanchor += 1
            continue
        if not v.get("lat") or not v.get("lon"):
            skipped_other += 1
            warnings.append(f"missing coords, skipped: {name}")
            continue
        code = existing.get(name)
        if not code:
            code = slug(name)
            base, n = code, 2
            while code in used_codes:
                code = f"{base}_{n}"; n += 1
        used_codes.add(code)
        meas = [m for m in KNOWN_MEASUREMENTS if m in v["measurements"]]
        sites[code] = {"site_name": name, "name": name, "measurements": meas,
                       "region": REGION, "lat": float(v["lat"]), "lon": float(v["lon"]),
                       "is_existing": name in existing}
    return sites, existing, dead, skipped_noanchor, skipped_other, warnings


UPSERT_UPDATE = text("""
    UPDATE weather_stations SET
        station_name = :name, source_id = :site_name,
        latitude = :lat, longitude = :lon,
        location = ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
        elevation = COALESCE(:elevation, elevation),
        region = :region, notes = CAST(:notes AS jsonb), is_active = true
    WHERE station_id = :sid
""")
UPSERT_INSERT = text("""
    INSERT INTO weather_stations
        (station_code, station_name, data_source, source_id, latitude, longitude,
         elevation, location, region, notes, is_active)
    VALUES
        (:code, :name, :ds, :site_name, :lat, :lon, NULL,
         ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
         :region, CAST(:notes AS jsonb), true)
""")


def run(dry_run: bool):
    sites, existing, dead, skip_anchor, skip_other, warnings = build_sites()
    created = updated = errors = 0
    Session = get_ingestion_session()
    with Session() as s:
        for code, cfg in sorted(sites.items()):
            notes = json.dumps({"name": cfg["name"], "site_name": cfg["site_name"],
                                "measurements": cfg["measurements"], "subregion": ""})
            params = {"code": code, "name": cfg["name"], "site_name": cfg["site_name"],
                      "lat": cfg["lat"], "lon": cfg["lon"], "elevation": None,
                      "region": cfg["region"], "notes": notes, "ds": DATA_SOURCE}
            try:
                row = s.execute(text(
                    "SELECT station_id FROM weather_stations WHERE station_code=:c AND data_source=:ds"
                ), {"c": code, "ds": DATA_SOURCE}).fetchone()
                if row:
                    if not dry_run:
                        s.execute(UPSERT_UPDATE, {**params, "sid": row[0]}); s.commit()
                    updated += 1
                else:
                    if not dry_run:
                        s.execute(UPSERT_INSERT, params); s.commit()
                    created += 1
            except Exception as e:
                errors += 1; s.rollback()
                warnings.append(f"ERROR {code}: {e}")

    n_rich = sum(1 for c in sites.values() if len(c["measurements"]) > 1)
    matched = sum(1 for c in sites.values() if c["is_existing"])
    print("\n" + "=" * 62)
    print("GDC seed from probe" + ("  [DRY RUN]" if dry_run else ""))
    print("=" * 62)
    print(f"  Live weather sites to seed : {len(sites)}  ({n_rich} multi-var, {len(sites)-n_rich} single-var)")
    print(f"  Dead (excluded)            : {dead}")
    print(f"  Skipped (no anchor var)    : {skip_anchor}")
    print(f"  Skipped (missing coords)   : {skip_other}")
    print(f"  -> UPDATE existing         : {updated}")
    print(f"  -> INSERT new              : {created}")
    print(f"  Errors                     : {errors}")
    print(f"  Existing DB GDC matched    : {matched} / {len(existing)}")
    if matched < len(existing):
        unmatched = set(existing) - {c["site_name"] for c in sites.values()}
        print(f"  ! existing NOT matched (left untouched): {sorted(unmatched)}")
    if warnings:
        print(f"\n  Warnings ({len(warnings)}):")
        for w in warnings[:25]:
            print(f"    - {w}")
    print("\n  Sample new multi-var stations:")
    shown = 0
    for code, cfg in sorted(sites.items()):
        if not cfg["is_existing"] and len(cfg["measurements"]) > 1:
            print(f"    {code}: {cfg['measurements']}")
            shown += 1
            if shown >= 8:
                break


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    run(ap.parse_args().dry_run)
