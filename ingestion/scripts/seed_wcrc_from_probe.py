#!/usr/bin/env python
"""Seed the West Coast Regional Council station set from a probe_hilltop.py dump.

Consumes probes/wcrc_all.json (probe_hilltop.py --agency wcrc). WCRC is a new
source — nothing on the platform covers the West Coast today — so this is an
insert-dominated run, but it still UPSERTs by site name so it is safe to re-run.

**Rainfall-first network.** Of 121 probed sites only 59 carry any weather
series, and 58 of those are rain gauges (history to 1981); there are just 2 air
temperature, 2 wind and 1 solar/pressure site. The remaining ~62 sites are pure
river stage/flow and water-quality gauges, which are correctly skipped for
having no mapped weather measurement.

**Liveness is judged per weather series, not per site.** WCRC's river gauges
carry live Stage/Flow alongside a long-dead rain series; keying liveness off a
site's newest datasource (as the earlier HBRC/MDC seeds did) is exactly how
dead gauges got seeded and then had to be deactivated by hand. Here a site is
live only if a datasource carrying a *mapped weather measurement* is live.

Not set here: zone_id; elevation (run fill_elevation_from_dem.py afterwards).
Usage: python ingestion/scripts/seed_wcrc_from_probe.py [--dry-run]
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
PROBE_FILES = [PROBES / "wcrc_all.json"]
DATA_SOURCE = "WCRC"
REGION = "West Coast"
LIVE_CUTOFF = "2026-04"

# canonical variable -> candidate WCRC measurement names, best first.
#
# WCRC calls its rain series "Rainfall (raw)"; the bare "Rainfall" name is kept
# as a fallback in case some sites publish it.
#
# "BAM Air Temperature" is deliberately absent: it is the Beta Attenuation
# Monitor's internal cabinet temperature at an air-quality site, not an ambient
# screen reading, and ingesting it as `temp` would inject a warm bias into the
# temperature surface from an instrument that is not measuring the air.
MEASUREMENT_PREFERENCE = {
    "rainfall": ["Rainfall (raw)", "Rainfall"],
    "temp": ["Air Temperature"],
    "rh": ["Relative Humidity"],
    "wind_speed": ["Wind Speed"],
    "wind_direction": ["Wind Direction"],
    "solar_radiation": ["Solar Radiation"],
    "pressure": ["Barometric Pressure"],
}

ALL_WX_NAMES = {n for names in MEASUREMENT_PREFERENCE.values() for n in names}


def slug(name):
    return "WCRC_" + re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_").upper()


def load_probes():
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


def weather_latest_to(datasources):
    """Newest `to` across datasources that actually carry a mapped weather series.

    Deliberately ignores Stage/Flow/water-quality datasources — a river gauge
    with live flow and a rain sensor that died in 2003 must read as dead.
    """
    tos = []
    for ds in datasources:
        names = {m.get("name") for m in ds.get("measurements", [])}
        if names & ALL_WX_NAMES and ds.get("to"):
            tos.append(ds["to"])
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

    sites, dead, no_wx, no_coords = {}, 0, 0, 0
    for name, v in probed.items():
        measurements = choose_measurements(v["datasources"])
        if not measurements:
            no_wx += 1
            continue
        if weather_latest_to(v["datasources"])[:7] < LIVE_CUTOFF:
            dead += 1
            continue
        if not v.get("lat") or not v.get("lon"):
            no_coords += 1
            continue
        code = existing.get(name)
        if not code:
            code = slug(name)
            base, n = code, 2
            while code in used_codes:
                code = f"{base}_{n}"; n += 1
        used_codes.add(code)
        sites[code] = {"name": name, "lat": float(v["lat"]), "lon": float(v["lon"]),
                       "measurements": measurements}
    return sites, existing, dead, no_wx, no_coords


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
    sites, existing, dead, no_wx, no_coords = build_sites()
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
    print("WCRC seed from probe" + ("  [DRY RUN]" if dry_run else ""))
    print("=" * 60)
    print(f"  Live weather sites : {len(sites)}")
    print(f"    skipped: dead={dead}  no-weather-series={no_wx}  no-coords={no_coords}")
    print(f"  -> UPDATE existing : {updated}   INSERT new: {created}   Errors: {errors}")
    print("  Measurement coverage:")
    for m, c in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"    {c:4}  {m}")
    print("\n  NEXT: python ingestion/scripts/fill_elevation_from_dem.py --source WCRC")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    run(ap.parse_args().dry_run)
