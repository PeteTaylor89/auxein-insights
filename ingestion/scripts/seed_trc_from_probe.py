#!/usr/bin/env python
"""Seed the Taranaki Regional Council station set from the banked MapMarkers capture.

Consumes probes/taranaki_all.json — a per-measureID dump of the public MapMarkers
endpoint. TRC is a new source, so this is insert-dominated, but it UPSERTs by TRC
siteID so it is safe to re-run.

**Keyed on siteID, not on name.** One physical site appears once per measure it
carries (Stratford is siteID 1 under rainfall, air temp, wind speed and wind
direction), so the marker lists must be merged on siteID. Merging on `title` would
also silently collapse any two distinct sites that share a display name.

**The catalogue is regenerable again.** It was banked in `b748ca9` because Cloudflare
refused scripted clients during the 2026-08-05 pass; it serves the ingestion box
normally as of 2026-08-11. `--refresh` re-captures all 12 measure lists live and
rewrites the dump. Without it the committed dump is used as-is.

**Liveness is not judged here.** MapMarkers has no period-of-record field — a marker's
`description` carries only a wall-clock label like "Rainfall 06:00pm" with no date, so a
site that died two years ago still renders a marker. Dead sites surface on the first
`--dry-run` ingestion as stations returning zero records; deactivate them then. This is
the opposite of the Hilltop seeders, which CAN judge liveness from `DataSource/To`.

Not set here: zone_id; elevation (run fill_elevation_from_dem.py afterwards).

Usage:
    python ingestion/scripts/seed_trc_from_probe.py --dry-run
    python ingestion/scripts/seed_trc_from_probe.py --refresh
"""
import argparse
import json
import re
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # ingestion/
from db_connection import get_ingestion_session
from sources.trc import MEASUREMENT_MAP
from sqlalchemy import text

PROBES = Path(__file__).resolve().parent / "probes"
PROBE_FILE = PROBES / "taranaki_all.json"
DATA_SOURCE = "TRC"
REGION = "Taranaki"
BASE = "https://www.trc.govt.nz/environment/maps-and-data"
UA = {"User-Agent": "Auxein-Insights/1.0 (climate data ingestion; pete.taylor@auxein.co.nz)"}

# Every measureID the portal publishes, so --refresh re-captures the full dump rather
# than narrowing it to the weather subset. MEASUREMENT_MAP decides what gets seeded.
ALL_MEASURE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 18]


def slug(title):
    return "TRC_" + re.sub(r"[^A-Za-z0-9]+", "_", title).strip("_").upper()


def refresh_probe():
    """Re-capture every measure list from MapMarkers and rewrite the dump."""
    from datetime import datetime, timezone
    measures = {}
    for mid in ALL_MEASURE_IDS:
        r = requests.get(f"{BASE}/regional-overview/MapMarkers",
                         params={"measureID": mid}, headers=UA, timeout=60)
        r.raise_for_status()
        markers = r.json()
        # The measure's display name is not in the payload; keep whatever the banked
        # dump already recorded so --refresh never loses it.
        prior = {}
        if PROBE_FILE.exists():
            prior = json.loads(PROBE_FILE.read_text(encoding="utf-8")).get("measures", {})
        name = (prior.get(str(mid)) or {}).get("name") or f"measure_{mid}"
        measures[str(mid)] = {"name": name, "markers": markers}
        print(f"  measureID {mid:>2} ({name}): {len(markers)} markers")
    payload = {"source": "TARANAKI", "region": REGION, "base": BASE,
               "captured": datetime.now(timezone.utc).isoformat(), "measures": measures}
    PROBE_FILE.parent.mkdir(parents=True, exist_ok=True)
    PROBE_FILE.write_text(json.dumps(payload, indent=1), encoding="utf-8")
    print(f"  wrote {PROBE_FILE}")


def load_sites():
    """Merge the per-measure marker lists into one dict keyed on siteID."""
    payload = json.loads(PROBE_FILE.read_text(encoding="utf-8"))
    sites, skipped_measures = {}, {}
    for mid_str, block in (payload.get("measures") or {}).items():
        mid = int(mid_str)
        if mid not in MEASUREMENT_MAP:
            skipped_measures[mid] = block.get("name") or f"measure_{mid}"
            continue
        for m in block.get("markers") or []:
            sid = m.get("siteID")
            if sid is None:
                continue
            entry = sites.setdefault(int(sid), {
                "title": m.get("title"), "lat": m.get("lat"), "lng": m.get("lng"),
                "measurements": set(),
            })
            entry["measurements"].add(mid)
            # Coordinates repeat across measures; keep the first non-empty pair.
            if not entry.get("lat") and m.get("lat"):
                entry["lat"], entry["lng"] = m.get("lat"), m.get("lng")
    return sites, skipped_measures, payload.get("captured")


UPSERT_UPDATE = text("""
    UPDATE weather_stations SET
        station_name=:name, source_id=:source_id, latitude=:lat, longitude=:lon,
        location=ST_SetSRID(ST_MakePoint(:lon,:lat),4326)::geography,
        region=:region, notes=CAST(:notes AS jsonb), is_active=true,
        updated_at=NOW()
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


def run(dry_run, refresh):
    if refresh:
        print("Refreshing MapMarkers capture...")
        refresh_probe()

    if not PROBE_FILE.exists():
        print(f"! missing probe dump {PROBE_FILE} — run with --refresh")
        return

    sites, skipped_measures, captured = load_sites()

    Session = get_ingestion_session()
    with Session() as s:
        rows = s.execute(text(
            "SELECT station_code, source_id FROM weather_stations WHERE data_source=:ds"),
            {"ds": DATA_SOURCE}).fetchall()
    existing_by_source_id = {r[1]: r[0] for r in rows}
    used_codes = set(existing_by_source_id.values())

    created = updated = errors = no_coords = 0
    counts = {}
    with Session() as s:
        for site_id, cfg in sorted(sites.items()):
            if not cfg.get("lat") or not cfg.get("lng"):
                no_coords += 1
                continue
            source_id = str(site_id)
            code = existing_by_source_id.get(source_id)
            if not code:
                code = slug(cfg["title"] or f"SITE_{site_id}")
                base, n = code, 2
                while code in used_codes:
                    code = f"{base}_{n}"; n += 1
            used_codes.add(code)

            measurements = sorted(cfg["measurements"])
            for mid in measurements:
                var = MEASUREMENT_MAP[mid][0]
                counts[var] = counts.get(var, 0) + 1

            notes = json.dumps({"name": cfg["title"], "site_name": cfg["title"],
                                "trc_site_id": site_id, "measurements": measurements})
            p = {"code": code, "name": cfg["title"], "source_id": source_id,
                 "lat": float(cfg["lat"]), "lon": float(cfg["lng"]),
                 "region": REGION, "notes": notes, "ds": DATA_SOURCE}
            try:
                row = s.execute(text(
                    "SELECT station_id FROM weather_stations "
                    "WHERE data_source=:ds AND source_id=:source_id"),
                    {"ds": DATA_SOURCE, "source_id": source_id}).fetchone()
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

    print("\n" + "=" * 60)
    print("TRC seed from probe" + ("  [DRY RUN]" if dry_run else ""))
    print("=" * 60)
    print(f"  Probe captured     : {captured}")
    print(f"  Weather sites      : {len(sites) - no_coords}   (skipped no-coords={no_coords})")
    print(f"  -> UPDATE existing : {updated}   INSERT new: {created}   Errors: {errors}")
    if skipped_measures:
        print("  Non-weather measures skipped:")
        for mid, name in sorted(skipped_measures.items()):
            print(f"    {mid:>3}  {name}")
    print("  Variable coverage:")
    for v, c in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"    {c:4}  {v}")
    print("\n  NEXT: python ingestion/scripts/fill_elevation_from_dem.py --source TRC")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--refresh", action="store_true",
                    help="re-capture MapMarkers live and rewrite the probe dump")
    a = ap.parse_args()
    run(a.dry_run, a.refresh)
