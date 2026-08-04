#!/usr/bin/env python
"""Seed the Horizons (Manawatu-Whanganui) station set from a probe_hilltop.py dump.

Consumes probes/horizons_all.json (probe_hilltop.py --agency horizons). Horizons
is by far the largest network probed — **1,066 sites** — but only ~116 carry a
live weather series; the rest are hydrology, water-quality and air-quality.

**Horizons publishes more derived/QA noise than any other council**, so the
selection here is exclusion-heavy. Only ONE series per canonical variable per
site is chosen, because horizons.py's measurement_map sends several names to the
same canonical variable and two of them on one site would race on the same
(station, timestamp, variable) key.

Deliberately NOT candidates:
  - roll-ups the aggregation layer recomputes: `Rainfall Total (6 min|15 Min|
    1 Hour|1 Day)`, `Moving Total (1 Hour)`, `* (Hourly Average)`,
    `Hourly *`, `* Daily Min|Max|Mean`, `* (hourly vector average)`
  - QA/modelled/derived: `NEMS - *`, `Modelling Rainfall`, `* (backup)`,
    `* (Inc Total)`, `* (Temp Corrected)`, `* (Period)`,
    `* (Linear Correction)`, `* (closed gaps)`, `* (Modelled)`,
    `* (Field Deviation)`, `* (Validated Data)`, `Rainfall (NIWA)`,
    `Rainfall *hr ARI`, `cosine/sine of Wind Direction`, `* SD (*)`
  - instrument internals, not ambient: `Enclosure Temperature`,
    `Board Temperature`, `ADP Temperature`, `PM 10/2.5 Flow Temperature`,
    `Voltage`, `Campbell *`
  - `Water Temperature*` — river temperature, not a weather variable
  - `Wind Speed` — unit-inconsistent across sites (m/s / km/hr / mm/s); see
    the note in horizons.py. `Average Wind Speed` (uniformly m/s) is used.
  - `Total Solar Flux` (MJ/m2) — an accumulation, not an instantaneous rate.
  - `Maximum Wind Speed (VM)` — km/h variant of a series we take in m/s.

Not set here: zone_id; elevation (run fill_elevation_from_dem.py afterwards).
Usage: python ingestion/scripts/seed_horizons_from_probe.py [--dry-run]
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
PROBE_FILES = [PROBES / "horizons_all.json"]
DATA_SOURCE = "HORIZONS"
REGION = "Manawatu-Whanganui"
LIVE_CUTOFF = "2026-04"

# canonical variable -> candidate Horizons measurement names, best first.
# Names here must ALSO exist in horizons.py's measurement_map or the station
# would be seeded with a measurement the client silently skips.
MEASUREMENT_PREFERENCE = {
    "rainfall": ["Rainfall"],
    "temp": ["Air Temperature (1.5m)", "Air Temperature",
             "Air Temperature (5m)", "Air Temperature (10m)"],
    "rh": ["Relative Humidity"],
    "pressure": ["Atmospheric Pressure"],
    "wind_speed": ["Average Wind Speed"],
    "wind_direction": ["Wind Direction"],
    "wind_gust": ["Maximum Wind Speed", "Maximum Gust"],
    "soil_temp": ["Soil Temperature"],
    "soil_moisture_vwc": ["Soil Moisture"],
    "solar_radiation": ["Solar Flux Density"],
}
# `Dew Point Temperature` is deliberately absent: Horizons serves it as a
# DERIVED virtual measurement computed from `Air Temperature (1.5m)`, so on any
# site lacking that exact series it errors out ("No data for Air Temperature
# (1.5m)") rather than returning dew point. We ingest temp and RH, from which
# dew point is recoverable downstream — same reason every other derived series
# here is excluded.

ALL_WX_NAMES = {n for names in MEASUREMENT_PREFERENCE.values() for n in names}


def slug(name):
    return "HORIZONS_" + re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_").upper()


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
    """Newest `to` across datasources carrying a mapped weather series only.

    Horizons sites routinely pair a live river/AQ datasource with a retired met
    sensor; judging liveness off the site's newest datasource would seed dead
    met sites (the mistake that later cost HBRC/MDC a hand-deactivation round).
    """
    tos = []
    for ds in datasources:
        names = {m.get("name") for m in ds.get("measurements", [])}
        if names & ALL_WX_NAMES and ds.get("to"):
            tos.append(ds["to"])
    return max(tos) if tos else ""


def earliest_from(datasources):
    """Earliest `from` across live weather datasources — for the depth report."""
    frs = []
    for ds in datasources:
        names = {m.get("name") for m in ds.get("measurements", [])}
        if names & ALL_WX_NAMES and ds.get("from"):
            frs.append(ds["from"])
    return min(frs) if frs else ""


def choose_measurements(datasources):
    """Pick at most one measurement per canonical variable, QUALIFIED by datasource.

    Returns strings of the form `Measurement Name [DataSource Name]`.

    Horizons spreads the same measurement across many datasources, and Hilltop's
    default datasource resolution is unreliable here: it either refuses
    ("There is more than one data source with the Average Wind Speed measurement
    and no default is assigned") or silently resolves to a datasource holding no
    data for that site ("No data for Rainfall [SCADA Rainfall]"). Both failures
    return zero rows rather than an exception, so an unqualified request looks
    like an empty station instead of a bug.

    Qualifying the measurement fixes it, so the datasource name is chosen here
    (at seed time, where the probe metadata lives) and stored in notes.
    Where several live datasources carry the same measurement, the one with the
    newest `to` wins.
    """
    # measurement name -> (datasource name, to) for the freshest live carrier
    best = {}
    for ds in datasources:
        ds_name, ds_to = ds.get("datasource"), ds.get("to") or ""
        if not ds_name:
            continue
        for m in ds.get("measurements", []):
            n = m.get("name")
            if n is None:
                continue
            if n not in best or ds_to > best[n][1]:
                best[n] = (ds_name, ds_to)

    chosen = []
    for _canon, candidates in MEASUREMENT_PREFERENCE.items():
        for cand in candidates:
            if cand in best:
                chosen.append(f"{cand} [{best[cand][0]}]")
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
                       "measurements": measurements,
                       "earliest": earliest_from(v["datasources"])[:4]}
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

    counts, depth = {}, {}
    for cfg in sites.values():
        for m in cfg["measurements"]:
            counts[m] = counts.get(m, 0) + 1
        depth[cfg["earliest"]] = depth.get(cfg["earliest"], 0) + 1

    print("\n" + "=" * 60)
    print("HORIZONS seed from probe" + ("  [DRY RUN]" if dry_run else ""))
    print("=" * 60)
    print(f"  Live weather sites : {len(sites)}")
    print(f"    skipped: dead={dead}  no-weather-series={no_wx}  no-coords={no_coords}")
    print(f"  -> UPDATE existing : {updated}   INSERT new: {created}   Errors: {errors}")
    print("  Measurement coverage:")
    for m, c in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"    {c:4}  {m}")
    print("  Depth (earliest year of any live weather series):")
    for y, c in sorted(depth.items()):
        print(f"    {y or '?':4}: {c:4} sites")
    print("\n  NOTE: Horizons' public Hilltop is a SCADA telemetry file, not an")
    print("        archive — there is no data before 2022. Backfill from 2022.")
    print("\n  NEXT: python ingestion/scripts/fill_elevation_from_dem.py --source HORIZONS")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    run(ap.parse_args().dry_run)
