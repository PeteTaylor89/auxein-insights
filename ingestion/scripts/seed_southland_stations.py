#!/usr/bin/env python
"""Seed the Environment Southland (ES) station set live from the ES JSON portal and UPSERT.

Unlike the Hilltop councils, ES is not probed via probe_hilltop.py — this generator hits
sites.ashx directly for each weather dataset, so it IS the probe + seeder in one.

Per site it:
  - reprojects NZTM easting/northing (EPSG:2193) -> WGS84 lat/lon (ES gives projected coords);
  - collects the `field` strings that map to a canonical weather variable
    (via southland.canonical_for_field), DE-DUPING to one field per variable per site
    (prefers base sensor over height/depth variants; shallowest soil depth);
  - honours DataOwnership (skips sites flagged `1` = third-party owned);
  - filters to live sites by the site-level `dataTo`.

Datasets fetched: air (temp/rh/wind/solar), rainfall, soil-temperature (carries BOTH
soil temp and soil moisture fields). Sites appearing in several datasets are merged.

Not set here: zone_id (deliberate — interpolation model supersedes zones); elevation
(Pete adds manually). Region = 'Southland'.

Usage: python ingestion/scripts/seed_southland_stations.py [--dry-run]
COMMERCIAL LICENCE: ES written permission required — cleared 2026-07-30.
"""
import argparse
import json
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

import requests
import urllib3
import pyproj

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # ingestion/
from db_connection import get_ingestion_session
from sources.southland import canonical_for_field
from sqlalchemy import text

urllib3.disable_warnings()

BASE = "https://envdata.es.govt.nz"
UA = {"User-Agent": "Mozilla/5.0 (compatible; AuxeinIngest/1.0)"}
DATASETS = ["air", "rainfall", "soil-temperature"]
DATA_SOURCE = "SOUTHLAND"
REGION = "Southland"
LIVE_CUTOFF_DAYS = 90                          # site 'dataTo' must be within this many days
_TX = pyproj.Transformer.from_crs("EPSG:2193", "EPSG:4326", always_xy=True)


def slug(name):
    return "ES_" + re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_").upper()


def reproject(easting, northing):
    lon, lat = _TX.transform(float(easting), float(northing))
    return round(lat, 6), round(lon, 6)


def parse_datato(s):
    """ES dataTo is 'DD/MM/YYYY HH:MM'."""
    try:
        return datetime.strptime(s.strip(), "%d/%m/%Y %H:%M")
    except (ValueError, AttributeError):
        return None


def _pref(field):
    """Sort key so the preferred field per variable wins: base sensor before variants,
    shallowest soil depth first."""
    depth = 0
    m = re.search(r"\((\d+)\s*cm\)", field, re.I)
    if m:
        depth = int(m.group(1))
    return ("(" in field, depth, len(field))


def fetch_dataset(f):
    r = requests.get(f"{BASE}/services/sites.ashx?f={f}.xml", headers=UA, timeout=60, verify=False)
    r.raise_for_status()
    return r.json().get("sites", [])


def build_sites():
    Session = get_ingestion_session()
    with Session() as s:
        rows = s.execute(text(
            "SELECT station_code, source_id FROM weather_stations WHERE data_source=:ds"),
            {"ds": DATA_SOURCE}).fetchall()
    existing = {r[1]: r[0] for r in rows}                       # source_id (name) -> code
    used_codes = set(existing.values())

    merged = {}                                                # name -> {lat,lon,fields:set,latest,owned}
    third_party = dead = 0
    cutoff = datetime.now() - timedelta(days=LIVE_CUTOFF_DAYS)

    for f in DATASETS:
        for site in fetch_dataset(f):
            name = site.get("name")
            if not name:
                continue
            # DataOwnership: skip third-party-owned sites
            owner = next((fl.get("value") for fl in site.get("fields", [])
                          if (fl.get("text") or "").lower() == "dataownership"), "0")
            if str(owner).strip() == "1":
                third_party += 1
                continue
            dt = parse_datato(site.get("dataTo"))
            if not dt or dt < cutoff:
                dead += 1
                continue
            # collect mappable field strings
            fields = [fl["field"] for fl in site.get("fields", [])
                      if fl.get("field") and canonical_for_field(fl["field"])]
            if not fields:
                continue
            try:
                lat, lon = reproject(site["easting"], site["northing"])
            except (KeyError, TypeError, ValueError):
                continue
            m = merged.setdefault(name, {"lat": lat, "lon": lon, "fields": set(), "latest": dt})
            m["fields"].update(fields)
            m["latest"] = max(m["latest"], dt)

    # dedup one field per canonical variable per site, by preference
    sites = {}
    for name, v in merged.items():
        chosen, taken = [], set()
        for fld in sorted(v["fields"], key=_pref):
            var = canonical_for_field(fld)[0]
            if var in taken:
                continue
            taken.add(var)
            chosen.append(fld)
        code = existing.get(name) or slug(name)
        if not existing.get(name):
            base, n = code, 2
            while code in used_codes:
                code = f"{base}_{n}"; n += 1
        used_codes.add(code)
        sites[code] = {"name": name, "lat": v["lat"], "lon": v["lon"],
                       "measurements": chosen, "vars": sorted(taken),
                       "is_existing": name in existing}
    return sites, existing, third_party, dead


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
    sites, existing, third_party, dead = build_sites()
    created = updated = errors = 0
    Session = get_ingestion_session()
    with Session() as s:
        for code, cfg in sorted(sites.items()):
            notes = json.dumps({"name": cfg["name"], "site_name": cfg["name"],
                                "measurements": cfg["measurements"], "subregion": ""})
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

    n_rich = sum(1 for c in sites.values() if len(c["measurements"]) > 1)
    print("\n" + "=" * 60)
    print("Southland seed from live ES portal" + ("  [DRY RUN]" if dry_run else ""))
    print("=" * 60)
    print(f"  Live sites to seed : {len(sites)}  ({n_rich} multi-var, {len(sites)-n_rich} single-var)")
    print(f"  Skipped: dead={dead}  third-party-owned={third_party}")
    print(f"  -> UPDATE existing : {updated}   INSERT new: {created}   Errors: {errors}")
    print("\n  Sample stations:")
    for i, (code, cfg) in enumerate(sorted(sites.items())):
        if i >= 12:
            break
        print(f"    {code:34} {str(cfg['vars'])}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    run(ap.parse_args().dry_run)
