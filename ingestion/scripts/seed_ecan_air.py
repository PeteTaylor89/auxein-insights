#!/usr/bin/env python
"""Seed ECan air-quality met stations from the live open-data catalogue.

Reads two endpoints rather than a saved probe file, because the two facts we need
live in different places and neither alone is sufficient:

  method 180  station x monitor channel — the ONLY place lat/lon and the channel
              MonitorTypeCode appear. Tells us which sites have a thermometer.
  method  23  site list with `LatestDateTime` — tells us which of those are still
              alive. Five of the sixteen sites carrying a temperature channel in
              180 are decommissioned; 180 alone would seed all sixteen and leave
              the cron polling six-year-dead stations forever.

Selection rule: a temperature channel (MonitorTypeCode 169) **and** a
`LatestDateTime` at or after the backfill start. That admits Ashburton (closed
2025-11) and St Albans (closed 2020-11), which carry real history worth
backfilling, and excludes Lincoln (2010), Burnside (2010), Timaru Grey Rd (2006),
Waimate Stadium (2015) and Washdyke Flat Rd (2019), which do not reach 2020.

Stations are seeded ACTIVE even when stale — an empty incremental window costs
one request and logs NO_DATA, which is visible, whereas seeding them inactive
would put them out of reach of the backfill (`get_active_stations` filters on
`is_active`). Use the existing `scratchpad/deactivate_dead.py` afterwards if a
station stays silent. Staleness is printed below and recorded in `notes`.

Not set here: zone_id; elevation.
  NEXT: python ingestion/scripts/fill_elevation_from_dem.py --source ECAN_AIR

Usage: python ingestion/scripts/seed_ecan_air.py [--dry-run]
LICENCE: CC BY 4.0 — attribute Environment Canterbury.
"""
import argparse
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # ingestion/
from sqlalchemy import text

from config.ecan_air_sites import (
    API_BASE, BACKFILL_START, DATA_SOURCE, ENDPOINTS, MEASUREMENT_MAP, REGION,
    TEMP_MONITOR_TYPE_CODES,
)
from db_connection import get_ingestion_session

TEMP_CODE = "169"          # Temperature 2m; see TEMP_MONITOR_TYPE_CODES
STALE_AFTER_DAYS = 180


def slug(name: str) -> str:
    return "ECAN_AIR_" + re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_").upper()


def get_json(endpoint: str):
    url = f"{API_BASE}/{endpoint}/JSON"
    r = requests.get(url, timeout=120, headers={"User-Agent": "auxein-seed"})
    r.raise_for_status()
    payload = r.json()
    items = (payload.get("data") or {}).get("item")
    if items is None:
        return []
    return [items] if isinstance(items, dict) else items


def parse_latest(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def build_sites():
    channels = get_json(ENDPOINTS["channels"])
    sites = get_json(ENDPOINTS["sites"])

    latest = {}
    for s in sites:
        latest[str(s.get("SiteNo"))] = parse_latest(s.get("LatestDateTime"))

    floor = datetime.fromisoformat(BACKFILL_START).replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)

    by_station = {}
    for row in channels:
        code = str(row.get("StationCode"))
        entry = by_station.setdefault(code, {
            "name": row.get("StationName"),
            "location": row.get("StationLocation"),
            "city": row.get("StationCity"),
            "lat": row.get("StationLatitude"),
            "lon": row.get("StationLongitude"),
            "channels": set(),
            "has_temp": False,
        })
        entry["channels"].add(row.get("MonitorName"))
        if str(row.get("MonitorTypeCode")) == TEMP_CODE:
            entry["has_temp"] = True

    selected, rejected = {}, []
    for code, e in by_station.items():
        seen = latest.get(code)
        if not e["has_temp"]:
            continue
        if not e["lat"] or not e["lon"]:
            rejected.append((e["name"], "no coordinates"))
            continue
        if seen is None:
            rejected.append((e["name"], "no LatestDateTime"))
            continue
        if seen < floor:
            rejected.append((e["name"], f"record ends {seen:%Y-%m-%d}, before {BACKFILL_START}"))
            continue
        e["site_id"] = code
        e["latest"] = seen
        e["stale"] = (now - seen) > timedelta(days=STALE_AFTER_DAYS)
        selected[slug(e["name"])] = e
    return selected, rejected


UPDATE_SQL = text("""
    UPDATE weather_stations SET
        station_name=:name, source_id=:site_id, latitude=:lat, longitude=:lon,
        location=ST_SetSRID(ST_MakePoint(:lon,:lat),4326)::geography,
        region=:region, notes=CAST(:notes AS jsonb), is_active=true,
        updated_at=NOW()
    WHERE station_id=:sid
""")
INSERT_SQL = text("""
    INSERT INTO weather_stations
        (station_code, station_name, data_source, source_id, latitude, longitude,
         elevation, location, region, notes, is_active)
    VALUES (:code,:name,:ds,:site_id,:lat,:lon,NULL,
            ST_SetSRID(ST_MakePoint(:lon,:lat),4326)::geography,:region,
            CAST(:notes AS jsonb),true)
""")


def run(dry_run: bool):
    selected, rejected = build_sites()
    variables = sorted({v[0] for v in MEASUREMENT_MAP.values()})
    created = updated = errors = 0
    Session = get_ingestion_session()

    with Session() as s:
        for code, e in sorted(selected.items()):
            notes = json.dumps({
                "name": e["name"],
                "site_name": e["name"],
                "site_id": e["site_id"],
                "address": e["location"],
                "city": e["city"],
                "variables": variables,
                "measurements": variables,
                "channels": sorted(c for c in e["channels"] if c),
                "latest_seen": e["latest"].isoformat(),
                "network": "air_quality",
                # Carried so the interpolation bias study can separate these from
                # screened climate stations. These sites are placed for population
                # exposure — Riccarton Road is literally 122 Riccarton Road — and
                # the urban heat island is real at the Christchurch trio.
                "siting": "urban_air_quality",
                "licence": "CC BY 4.0 — Environment Canterbury",
            })
            params = {"code": code, "name": e["name"], "site_id": e["site_id"],
                      "lat": float(e["lat"]), "lon": float(e["lon"]),
                      "region": REGION, "notes": notes, "ds": DATA_SOURCE}
            try:
                row = s.execute(text(
                    "SELECT station_id FROM weather_stations "
                    "WHERE station_code=:c AND data_source=:ds"),
                    {"c": code, "ds": DATA_SOURCE}).fetchone()
                if row:
                    if not dry_run:
                        s.execute(UPDATE_SQL, {**params, "sid": row[0]}); s.commit()
                    updated += 1
                else:
                    if not dry_run:
                        s.execute(INSERT_SQL, params); s.commit()
                    created += 1
            except Exception as exc:
                errors += 1
                s.rollback()
                print(f"    ERROR {code}: {exc}")

    print("\n" + "=" * 66)
    print("ECan air-quality met seed" + ("  [DRY RUN]" if dry_run else ""))
    print("=" * 66)
    for code, e in sorted(selected.items()):
        flag = "  STALE" if e["stale"] else ""
        print(f"  {code:<34} {float(e['lat']):>9.4f} {float(e['lon']):>9.4f}  "
              f"last {e['latest']:%Y-%m-%d}{flag}")
    print(f"\n  Selected : {len(selected)}   "
          f"stale (>{STALE_AFTER_DAYS}d): {sum(1 for e in selected.values() if e['stale'])}")
    print(f"  -> UPDATE existing : {updated}   INSERT new: {created}   Errors: {errors}")
    if rejected:
        print(f"\n  Rejected ({len(rejected)}):")
        for name, why in sorted(rejected):
            print(f"    {name:<28} {why}")
    print(f"\n  Variables seeded: {', '.join(variables)}")
    print("\n  NEXT: python ingestion/scripts/fill_elevation_from_dem.py --source ECAN_AIR")
    print("  THEN: python ingestion/run_ingestion.py --source ecan_air "
          f"--period backfill --start {datetime.fromisoformat(BACKFILL_START):%d/%m/%Y}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    run(ap.parse_args().dry_run)
