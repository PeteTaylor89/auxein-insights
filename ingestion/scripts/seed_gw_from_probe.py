#!/usr/bin/env python
"""Seed the full Greater Wellington station set from probe_hilltop.py dumps and UPSERT.

Consumes probes/gw_climate.json + probes/gw_rain.json (probe_hilltop.py --agency gw
--collection Climate|Rainfall). Takes GW from the 4 hand-picked Wairarapa sites in
`config/gw_sites.py` to the whole live network (~91 usable of 95 probed).

**One series per variable per site.** GW publishes air temperature at several
sensor heights plus a national standardised "(Lawa)" series, and wind likewise.
`gw.py`'s measurement_map translates all of those to the same canonical variable,
so if a site's notes listed two of them both would write the same
(station, timestamp, variable) key and race. MEASUREMENT_PREFERENCE below picks
exactly one, favouring the standardised series, then standard screen height.

Derived series ("- Daily Average", "1hr Average", "(24hr Mov Avg)", "(km/hr)",
"(Validated Data)") are deliberately not candidates — the aggregation layer
recomputes those, so ingesting them would double-count.

Not set here: zone_id; elevation (run fill_elevation_from_dem.py afterwards).
Usage: python ingestion/scripts/seed_gw_from_probe.py [--dry-run]
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
PROBE_FILES = [PROBES / "gw_climate.json", PROBES / "gw_rain.json"]
DATA_SOURCE = "GW"
REGION = "Wellington"
LIVE_CUTOFF = "2026-04"

# canonical variable -> candidate GW measurement names, best first.
# "(Lawa)" is the national standardised series; otherwise prefer standard screen
# height (~1.2-2 m) for temperature and the WMO 10 m mast for wind.
MEASUREMENT_PREFERENCE = {
    "temp": ["Air Temperature (Lawa)", "Air Temperature", "Air Temperature (1.2m)",
             "Air Temperature (2m)", "Air Temperature (3m)", "Air Temperature (10m)"],
    "rh": ["Relative Humidity"],
    "rainfall": ["Rainfall"],
    "solar_radiation": ["Solar Radiation"],
    "pressure": ["Barometric Pressure"],
    "wind_speed": ["Wind Speed (Lawa)", "Wind Speed (10m)", "Wind Speed"],
    "wind_direction": ["Wind Direction (Lawa)", "Wind Direction (10m)", "Wind Direction"],
    "wind_gust": ["Max Wind Gust (10m)"],
    "soil_temp": ["Soil Temperature 10cm", "Soil Temperature"],
    "soil_moisture_vwc": ["Soil Moisture Content"],
}


def slug(name):
    return "GW_" + re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_").upper()


def load_probes():
    """Merge the Climate and Rainfall dumps; a site can appear in both."""
    sites = {}
    for path in PROBE_FILES:
        if not path.exists():
            print(f"  ! missing probe dump {path.name} — skipping")
            continue
        payload = json.loads(path.read_text(encoding="utf-8"))
        for name, v in payload.get("sites", {}).items():
            if v.get("error"):
                continue
            if name in sites:
                sites[name]["datasources"].extend(v.get("datasources", []))
            else:
                sites[name] = {"lat": v.get("lat"), "lon": v.get("lon"),
                               "datasources": list(v.get("datasources", []))}
    return sites


def latest_to(datasources):
    tos = [d.get("to") for d in datasources if d.get("to")]
    return max(tos) if tos else ""


def choose_measurements(datasources):
    """Pick at most one measurement name per canonical variable."""
    available = set()
    for ds in datasources:
        for m in ds.get("measurements", []):
            available.add(m.get("name"))

    chosen = []
    for _canon, candidates in MEASUREMENT_PREFERENCE.items():
        for cand in candidates:
            if cand in available:
                chosen.append(cand)
                break
    return chosen


def build_sites():
    probed = load_probes()
    Session = get_ingestion_session()
    with Session() as s:
        rows = s.execute(text(
            "SELECT station_code, source_id FROM weather_stations WHERE data_source=:ds"),
            {"ds": DATA_SOURCE}).fetchall()
    existing = {r[1]: r[0] for r in rows}
    used_codes = set(existing.values())

    sites, dead, skipped = {}, 0, 0
    for name, v in probed.items():
        measurements = choose_measurements(v["datasources"])
        if not measurements:
            skipped += 1
            continue
        if latest_to(v["datasources"])[:7] < LIVE_CUTOFF:
            dead += 1
            continue
        if not v.get("lat") or not v.get("lon"):
            skipped += 1
            continue
        code = existing.get(name)
        if not code:
            code = slug(name)
            base, n = code, 2
            while code in used_codes:
                code = f"{base}_{n}"; n += 1
        used_codes.add(code)
        sites[code] = {"name": name, "lat": float(v["lat"]), "lon": float(v["lon"]),
                       "measurements": measurements, "is_existing": name in existing}
    return sites, existing, dead, skipped


UPSERT_UPDATE = text("""
    UPDATE weather_stations SET
        station_name=:name, source_id=:name, latitude=:lat, longitude=:lon,
        location=ST_SetSRID(ST_MakePoint(:lon,:lat),4326)::geography,
        region=:region, notes=CAST(:notes AS jsonb), is_active=true,
        updated_at=NOW()
    WHERE station_id=:sid
""")
UPSERT_INSERT = text("""
    INSERT INTO weather_stations
        (station_code, station_name, data_source, source_id, latitude, longitude,
         elevation, location, region, notes, is_active)
    VALUES (:code,:name,:ds,:name,:lat,:lon,NULL,
            ST_SetSRID(ST_MakePoint(:lon,:lat),4326)::geography,:region,
            CAST(:notes AS jsonb),true)
""")


def run(dry_run):
    sites, existing, dead, skipped = build_sites()
    created = updated = errors = 0
    Session = get_ingestion_session()
    with Session() as s:
        for code, cfg in sorted(sites.items()):
            notes = json.dumps({"name": cfg["name"], "site_name": cfg["name"],
                                "measurements": cfg["measurements"]})
            p = {"code": code, "name": cfg["name"], "lat": cfg["lat"], "lon": cfg["lon"],
                 "region": REGION, "notes": notes, "ds": DATA_SOURCE}
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

    counts = {}
    for cfg in sites.values():
        for m in cfg["measurements"]:
            counts[m] = counts.get(m, 0) + 1

    print("\n" + "=" * 60)
    print("GW seed from probe" + ("  [DRY RUN]" if dry_run else ""))
    print("=" * 60)
    print(f"  Live sites to seed : {len(sites)}   (dead={dead}, skipped={skipped})")
    print(f"  -> UPDATE existing : {updated}   INSERT new: {created}   Errors: {errors}")
    print("  Measurement coverage:")
    for m, c in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"    {c:4}  {m}")
    print("\n  NEXT: python ingestion/scripts/fill_elevation_from_dem.py --source GW")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    run(ap.parse_args().dry_run)
