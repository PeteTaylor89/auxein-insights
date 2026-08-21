#!/usr/bin/env python
"""Seed Waikato Regional Council weather stations from the KiWIS probe dump.

Reads `probes/waikato_kiwis.json`, produced by:

    python ingestion/scripts/probe_kiwis.py --host envdata.waikatoregion.govt.nz:8080 \
        --out waikato_kiwis.json

Reading a banked probe rather than the live API is deliberate — the same pattern as
`seed_wcrc_from_probe.py`. The selection is reviewable, re-runnable and diffable, and
it keeps ~70 catalogue requests out of the seeding path.

SELECTION — only relevant sites and parameters
----------------------------------------------
WRC's KiWIS carries 736 stations and 11,409 series, and the overwhelming majority
are water: level, discharge, groundwater, E. coli, nutrients, metals,
macroinvertebrate indices. A station is seeded only if it carries at least one
MAPPED MET series (see `config/waikato_sites.MEASUREMENT_MAP`) that is:

  * an OBSERVATION series, not a derived one. Excluded: LongTerm climatology,
    year/month/week totals, accumulators, manual observer flask/dip readings,
    migrated legacy files, and `.P2` second-stage series.
  * still reporting — `to` within 30 days.
  * at a station with coordinates.

**Training stations are excluded explicitly**, and this is not hypothetical:
`GW_Training_Master` and `GW_Training2..7` are SEVEN of the twelve barometric
pressure stations in the whole network, and `Doug_/Jess_/Tane_DP-Training2023` sit
under the sentinel `site_no=99999`. Seeding them would put staff training fixtures
into the national pressure field.

Note the liveness test runs on OBSERVATION series only. A KiWIS climatology series
reports `to` in the FUTURE (`60 - LongTermMonthMax` says 2026-12-01), so a naive
max-over-all-series makes every station look live — including one dead for 4,690
days. `probe_kiwis.py` already applies this rule; the check is repeated here so the
seeder cannot be fed a dump built by something that did not.

Not set here: zone_id; elevation.
  NEXT: python backend/scripts/fill_elevation_from_dem.py --source WRC

Usage: python ingestion/scripts/seed_waikato_from_probe.py [--dry-run] [--probe FILE]
LICENCE: CC BY 4.0 — attribute Waikato Regional Council.
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # ingestion/
from sqlalchemy import text

from config.waikato_sites import (
    DATA_SOURCE, EXPECTED_KIWIS_UNITS, MEASUREMENT_MAP, REGION,
)
from db_connection import get_ingestion_session

PROBES = Path(__file__).resolve().parent / "probes"
DEFAULT_PROBE = "waikato_kiwis.json"

TRAINING = re.compile(r"training", re.I)
SENTINEL_SITE_NO = "99999"

# Hamilton's air-quality cluster (site 1342) plus the standalone urban AQ sites.
# These carry real air temperature, but they are sited for population exposure, not
# climate: seven of the thirteen thermometers sit within ~9 km of Hamilton Aws, and
# four of those are low-cost Clarity Node sensors installed 2023-12.
#
# Flagged in notes.siting so the interpolation bias study can split on it rather
# than pooling them with screened stations — exactly the treatment ECAN_AIR's urban
# sites needed, where Woolston ran +1.34 degC on the urban heat island alone.
URBAN_AQ_SITES = {"1342"}
URBAN_AQ_NAMES = re.compile(r"clarity|bloodbank|bowling club|college|high school",
                            re.I)


def slug(name: str) -> str:
    return "WRC_" + re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_").upper()


def select(payload):
    """-> (selected {code: entry}, rejected [(name, reason)])"""
    selected, rejected = {}, []
    for station in payload["stations"]:
        name = station["station_name"]
        site_no = str(station["site_no"])

        if TRAINING.search(name) or site_no == SENTINEL_SITE_NO:
            rejected.append((name, "training fixture, not an instrument"))
            continue
        if not station["live"]:
            rejected.append((name, f"stale — last reported {station['stale_days']}d ago"))
            continue

        # Keep only series whose variable we actually map. probe_kiwis.py already
        # filters to MEASUREMENT_MAP, but a dump could predate a map change.
        wanted = {v for v, _ in MEASUREMENT_MAP.values()}
        series = {variable: spec for variable, spec in station["series"].items()
                  if variable in wanted}
        if not series:
            rejected.append((name, "no mapped met series"))
            continue
        if station.get("lat") is None or station.get("lon") is None:
            rejected.append((name, "no coordinates"))
            continue

        # Unit guard. A silent km/h-as-m/s swap is unrecoverable downstream — the
        # values stay plausible forever — so refuse the station rather than seed it.
        bad_units = [(v, spec.get("unit")) for v, spec in series.items()
                     if spec.get("unit")
                     and spec["unit"].strip().lower() != EXPECTED_KIWIS_UNITS[v].lower()]
        if bad_units:
            rejected.append((name, "UNIT MISMATCH — " + ", ".join(
                f"{v} is {u!r}, expected {EXPECTED_KIWIS_UNITS[v]!r}"
                for v, u in bad_units)))
            continue

        code = slug(name)
        if code in selected:
            # Names are unique across the live set today; if that ever changes,
            # fail loudly rather than silently overwriting a station.
            rejected.append((name, f"station_code collision on {code}"))
            continue
        selected[code] = {**station, "series": series}
    return selected, rejected


UPDATE_SQL = text("""
    UPDATE weather_stations SET
        station_name=:name, source_id=:source_id, latitude=:lat, longitude=:lon,
        location=ST_SetSRID(ST_MakePoint(:lon,:lat),4326)::geography,
        region=:region, notes=CAST(:notes AS jsonb), is_active=true,
        updated_at=NOW()
    WHERE station_id=:sid
""")
INSERT_SQL = text("""
    INSERT INTO weather_stations
        (station_code, station_name, data_source, source_id, latitude, longitude,
         elevation, location, region, notes, is_active)
    VALUES (:code,:name,:ds,:source_id,:lat,:lon,NULL,
            ST_SetSRID(ST_MakePoint(:lon,:lat),4326)::geography,:region,
            CAST(:notes AS jsonb),true)
""")


def run(dry_run: bool, probe_path: Path):
    payload = json.loads(probe_path.read_text(encoding="utf-8"))
    selected, rejected = select(payload)
    created = updated = errors = 0
    Session = get_ingestion_session()

    with Session() as s:
        for code, e in sorted(selected.items()):
            site_no, station_no = str(e["site_no"]), str(e["station_no"])
            urban = site_no in URBAN_AQ_SITES or bool(URBAN_AQ_NAMES.search(e["station_name"]))
            notes = json.dumps({
                "name": e["station_name"],
                "site_name": e.get("site_name"),
                "site_no": site_no,
                "station_no": station_no,
                "station_id_kiwis": e.get("station_id"),
                "object_type": e.get("object_type"),
                "variables": sorted(e["series"]),
                "measurements": sorted(e["series"]),
                # The ts_id per variable, so the hourly cron never has to re-query
                # the catalogue. waikato.py falls back to resolving live if absent.
                "series": {v: {"ts_id": spec["ts_id"], "ts_name": spec["ts_name"],
                               "unit": dict((a, b) for a, b in MEASUREMENT_MAP.values()).get(v)
                               or spec.get("unit"),
                               "from": spec.get("from"), "to": spec.get("to")}
                           for v, spec in e["series"].items()},
                "record_start": min(spec.get("from") or "9999"
                                    for spec in e["series"].values()),
                "platform": "kiwis",
                **({"siting": "urban_air_quality"} if urban else {}),
                "licence": "CC BY 4.0 — Waikato Regional Council",
            })
            params = {"code": code, "name": e["station_name"],
                      "source_id": f"{site_no}/{station_no}",
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

    print("\n" + "=" * 78)
    print("Waikato (WRC) KiWIS seed" + ("  [DRY RUN]" if dry_run else ""))
    print("=" * 78)
    for code, e in sorted(selected.items()):
        start = min(spec.get("from") or "?" for spec in e["series"].values())
        flag = "  urban_AQ" if (str(e["site_no"]) in URBAN_AQ_SITES
                                or URBAN_AQ_NAMES.search(e["station_name"])) else ""
        print(f"  {code:<40} {float(e['lat']):>9.4f} {float(e['lon']):>9.4f}  "
              f"from {start}  {','.join(sorted(e['series']))}{flag}")

    print(f"\n  Rejected ({len(rejected)}):")
    for name, reason in sorted(rejected):
        print(f"    {name[:42]:42s} {reason}")

    counts = {}
    for e in selected.values():
        for v in e["series"]:
            counts[v] = counts.get(v, 0) + 1
    print(f"\n  Selected : {len(selected)} station(s) — "
          + ", ".join(f"{v} {n}" for v, n in sorted(counts.items(), key=lambda x: -x[1])))
    print(f"  -> UPDATE existing : {updated}   INSERT new: {created}   Errors: {errors}")
    if not dry_run:
        print("\n  NEXT: python backend/scripts/fill_elevation_from_dem.py --source WRC")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Seed WRC stations from the KiWIS probe")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--probe", default=DEFAULT_PROBE,
                   help="probe dump (bare name resolves into scripts/probes/)")
    args = p.parse_args()
    path = Path(args.probe)
    run(args.dry_run, path if path.is_absolute() else PROBES / path)
