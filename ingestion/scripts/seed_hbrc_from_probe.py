#!/usr/bin/env python
"""Generate the HBRC station set from probe_hilltop.py JSON dumps and UPSERT it.

Consumes hbrc_climate.json + hbrc_rain.json (produced by probe_hilltop.py), filters
to live sites, maps each site's measurements to the canonical set our ingestion
knows, and upserts into weather_stations.

SAFETY — station-code preservation:
  Existing HBRC stations must keep their station_code so the upsert UPDATEs them
  rather than creating duplicates. We match a probe site to an existing DB station
  by API site name (== weather_stations.source_id) and reuse that code. Only
  genuinely new sites get a generated HBRC_<SLUG> code.

Not set here: zone_id (new stations are unzoned — interpolation model supersedes
zone aggregation) and elevation (populated separately from the LINZ 8m DEM).

Usage:
    python ingestion/scripts/seed_hbrc_from_probe.py --dry-run
    python ingestion/scripts/seed_hbrc_from_probe.py
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # ingestion/
from db_connection import get_ingestion_session
from sqlalchemy import text

REPO = Path(__file__).resolve().parents[2]
CLIMATE_JSON = REPO / "hbrc_climate.json"
RAIN_JSON = REPO / "hbrc_rain.json"
LIVE_CUTOFF = "2026-04"  # matches probe_hilltop default; sites stale before this are dead
REGION = "Hawke's Bay"

# The HBRC API measurement names we actually ingest (must match hbrc.py measurement_map
# keys). Ordered for stable, readable config output.
KNOWN_MEASUREMENTS = [
    "Average Air Temperature",
    "Average Humidity",
    "Rainfall",
    "Solar Radiation",
    "PET Hourly",
    "Average Wind Speed",
    "Average Wind Direction",
    "Maximum Wind Speed",
    "Soil Temperature 100mm",
    "Soil Moisture",
]
KNOWN_SET = set(KNOWN_MEASUREMENTS)


def slug(name: str) -> str:
    s = re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_").upper()
    return f"HBRC_{s}"


def latest_to(datasources) -> str:
    tos = [d.get("to") for d in datasources if d.get("to")]
    return max(tos) if tos else ""


def load_probe(path: Path) -> dict:
    """site_name -> {lat, lon, measurements:set, latest}"""
    if not path.exists():
        print(f"  ! missing probe dump: {path.name} (skipping)")
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    out = {}
    for name, v in payload.get("sites", {}).items():
        if v.get("error"):
            continue
        latest = latest_to(v.get("datasources", []))
        meas = set()
        for ds in v.get("datasources", []):
            for m in ds.get("measurements", []):
                mn = m.get("name")
                if mn in KNOWN_SET:
                    meas.add(mn)
        out[name] = {"lat": v.get("lat"), "lon": v.get("lon"),
                     "measurements": meas, "latest": latest}
    return out


def build_sites():
    Session = get_ingestion_session()
    with Session() as s:
        existing = {row[1]: row[0] for row in s.execute(text(
            "SELECT station_code, source_id FROM weather_stations WHERE data_source='HBRC'"
        )).fetchall()}  # source_id (API site name) -> station_code
        existing_codes = set(existing.values())

    climate = load_probe(CLIMATE_JSON)
    rain = load_probe(RAIN_JSON)

    # Merge: a site can appear in both (climate sites also log rainfall). Union the
    # measurement sets; climate coords win if present.
    merged = {}
    for src in (rain, climate):  # climate second so its coords/measurements take precedence
        for name, v in src.items():
            if name in merged:
                merged[name]["measurements"] |= v["measurements"]
                if v.get("lat"):
                    merged[name]["lat"], merged[name]["lon"] = v["lat"], v["lon"]
                merged[name]["latest"] = max(merged[name]["latest"], v["latest"])
            else:
                merged[name] = dict(v)

    sites, dead, skipped, warnings = {}, 0, 0, []
    used_codes = set(existing_codes)
    for name, v in merged.items():
        if not v["latest"] or v["latest"][:7] < LIVE_CUTOFF:
            dead += 1
            continue
        if not v["measurements"]:
            skipped += 1
            warnings.append(f"no known measurements, skipped: {name}")
            continue
        if not v.get("lat") or not v.get("lon"):
            skipped += 1
            warnings.append(f"missing coords, skipped: {name}")
            continue
        # code: reuse existing (match by API site name) else generate a unique one
        code = existing.get(name)
        if not code:
            code = slug(name)
            base, n = code, 2
            while code in used_codes:
                code = f"{base}_{n}"; n += 1
        used_codes.add(code)
        meas = [m for m in KNOWN_MEASUREMENTS if m in v["measurements"]]
        sites[code] = {
            "site_name": name,
            "name": name,
            "measurements": meas,
            "region": REGION,
            "lat": float(v["lat"]),
            "lon": float(v["lon"]),
            "is_existing": name in existing,
        }
    return sites, existing, dead, skipped, warnings


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
        (:code, :name, 'HBRC', :site_name, :lat, :lon, NULL,
         ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
         :region, CAST(:notes AS jsonb), true)
""")


def run(dry_run: bool):
    sites, existing, dead, skipped, warnings = build_sites()
    created = updated = errors = 0
    Session = get_ingestion_session()
    with Session() as s:
        for code, cfg in sorted(sites.items()):
            notes = json.dumps({"name": cfg["name"], "site_name": cfg["site_name"],
                                "measurements": cfg["measurements"], "subregion": ""})
            params = {"code": code, "name": cfg["name"], "site_name": cfg["site_name"],
                      "lat": cfg["lat"], "lon": cfg["lon"], "elevation": None,
                      "region": cfg["region"], "notes": notes}
            try:
                row = s.execute(text(
                    "SELECT station_id FROM weather_stations WHERE station_code=:c AND data_source='HBRC'"
                ), {"c": code}).fetchone()
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

    n_climate = sum(1 for c in sites.values() if len(c["measurements"]) > 1)
    n_rain = len(sites) - n_climate
    print("\n" + "=" * 62)
    print("HBRC seed from probe" + ("  [DRY RUN]" if dry_run else ""))
    print("=" * 62)
    print(f"  Live sites to seed : {len(sites)}  ({n_climate} multi-var climate, {n_rain} rainfall-only)")
    print(f"  Dead (excluded)    : {dead}")
    print(f"  Skipped (no meas/coords): {skipped}")
    print(f"  -> UPDATE existing : {updated}")
    print(f"  -> INSERT new      : {created}")
    print(f"  Errors             : {errors}")
    # Verify every pre-existing DB station was matched (update), not duplicated
    matched_existing = sum(1 for c in sites.values() if c["is_existing"])
    print(f"  Existing DB HBRC stations matched: {matched_existing} / {len(existing)}")
    if matched_existing < len(existing):
        unmatched = set(existing) - {c["site_name"] for c in sites.values()}
        print(f"  ! existing NOT matched (left untouched): {sorted(unmatched)}")
    if warnings:
        print(f"\n  Warnings ({len(warnings)}):")
        for w in warnings[:25]:
            print(f"    - {w}")
    # sample of new climate stations
    print("\n  Sample new climate stations (code -> measurements):")
    shown = 0
    for code, cfg in sorted(sites.items()):
        if not cfg["is_existing"] and len(cfg["measurements"]) > 1:
            print(f"    {code}: {cfg['measurements']}")
            shown += 1
            if shown >= 6:
                break


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    run(ap.parse_args().dry_run)
