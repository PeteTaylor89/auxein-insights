#!/usr/bin/env python3
"""Crosswalk SYNOP_GTS stations to their GHCN-Daily station ids.

Only 7 of 54 SYNOP devices carried a `notes->>'ghcnd_id'`, which is why the
GHCN-Daily backfill only ever reached 6 stations. This resolves the rest.

**Do not derive the id from the WMO number.** Two id formats coexist
(`NZM000{wmo}` and `NZ000{wmo}0`), and the inventory's own trailing WMO column
is demonstrably wrong for several NZ rows — it files HOKITIKA AERODROME under
93781 (Christchurch) and KAITAIA under 93119 (Auckland Intl). Matching is
therefore done on geography, with the name kept alongside for eyeballing.

Usage:
    python scripts/crosswalk_ghcnd.py                 # report only (default)
    python scripts/crosswalk_ghcnd.py --apply         # write notes->>'ghcnd_id'
    python scripts/crosswalk_ghcnd.py --max-km 40     # widen the match radius
"""

import argparse
import json
import math
import sys
from pathlib import Path

import requests
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).parent.parent))
from db_connection import get_ingestion_session

GHCND_STATIONS_URL = "https://www.ncei.noaa.gov/pub/data/ghcn/daily/ghcnd-stations.txt"
DATA_SOURCE = 'SYNOP_GTS'

# Fixed-width column spans from NCEI's readme.txt (1-indexed, inclusive).
SPANS = {
    'id':   (1, 11),
    'lat':  (13, 20),
    'lon':  (22, 30),
    'elev': (32, 37),
    'name': (42, 71),
    'wmo':  (81, 85),
}

# Beyond this the pairing is not credible enough to write automatically.
DEFAULT_MAX_KM = 25.0


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def fetch_inventory(cache: Path) -> str:
    """The inventory is ~11 MB and changes rarely — cache it beside the script."""
    if cache.exists():
        print(f"Using cached inventory {cache} ({cache.stat().st_size:,} bytes)")
        return cache.read_text(encoding='utf-8', errors='replace')

    print(f"Fetching {GHCND_STATIONS_URL} ...")
    resp = requests.get(GHCND_STATIONS_URL, timeout=180)
    resp.raise_for_status()
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(resp.text, encoding='utf-8')
    print(f"  cached {len(resp.text):,} bytes to {cache}")
    return resp.text


def parse_nz_stations(txt: str) -> list:
    def field(line, key):
        s, e = SPANS[key]
        return line[s - 1:e].strip()

    out = []
    for line in txt.splitlines():
        if not line.startswith('NZ'):
            continue
        try:
            out.append({
                'ghcnd_id': field(line, 'id'),
                'lat': float(field(line, 'lat')),
                'lon': float(field(line, 'lon')),
                'elev': float(field(line, 'elev') or 'nan'),
                'name': field(line, 'name'),
                'wmo_claimed': field(line, 'wmo'),
            })
        except ValueError:
            print(f"  ! unparseable inventory row: {line[:60]}")
    return out


def load_synop_stations(session):
    rows = session.execute(text("""
        SELECT station_id, station_code, station_name, latitude, longitude,
               is_active, notes->>'ghcnd_id' AS existing
        FROM weather_stations
        WHERE data_source = :ds
        ORDER BY station_code
    """), {'ds': DATA_SOURCE}).fetchall()
    return [
        {
            'station_id': r[0], 'code': r[1], 'name': r[2],
            'lat': float(r[3]), 'lon': float(r[4]),
            'is_active': r[5], 'existing': r[6],
        }
        for r in rows if r[3] is not None and r[4] is not None
    ]


def match(nz_stations, synop, max_km):
    """Nearest-neighbour each GHCN-D station onto an ACTIVE SYNOP device.

    Direction matters: there are only ~15 NZ GHCN-D stations against 54 SYNOP
    devices, so we iterate the scarce side and let each claim its closest
    partner. A SYNOP device already claimed by a nearer GHCN-D station is not
    reassigned.

    Only active devices are candidates. `NoaaIngestion.get_stations()` filters
    on `is_active`, so an id written to a retired device would never be fetched
    — and worse, the retired ICAO-era duplicates sit metres from their live
    replacement (SYNOP_93780 "Christchurch Intl" vs the active SYNOP_93781
    "Christchurch Aero Aws"), so a plain nearest-neighbour hands the id to the
    dead one and the live station silently gets nothing. Inactive-only
    candidates are reported separately rather than written.
    """
    active = [s for s in synop if s['is_active']]
    inactive = [s for s in synop if not s['is_active']]

    # An id already held by any device — active or not — must never be issued
    # twice, or the same GHCN-D series lands under two station_ids.
    already_held = {s['existing'] for s in synop if s['existing']}

    claimed = {}
    unmatched = []

    pairs = []
    for g in nz_stations:
        best, best_km = None, float('inf')
        for s in active:
            km = haversine_km(g['lat'], g['lon'], s['lat'], s['lon'])
            if km < best_km:
                best, best_km = s, km
        # Nearest retired device, purely so the report can explain a miss.
        alt, alt_km = None, float('inf')
        for s in inactive:
            km = haversine_km(g['lat'], g['lon'], s['lat'], s['lon'])
            if km < alt_km:
                alt, alt_km = s, km
        pairs.append((best_km, g, best, alt, alt_km))

    for best_km, g, s, alt, alt_km in sorted(pairs, key=lambda p: p[0]):
        if s is None or best_km > max_km:
            unmatched.append((g, best_km, s, alt, alt_km))
            continue
        if s['code'] in claimed:
            unmatched.append((g, best_km, s, alt, alt_km))
            continue
        if g['ghcnd_id'] in already_held and s['existing'] != g['ghcnd_id']:
            unmatched.append((g, best_km, s, alt, alt_km))
            continue
        claimed[s['code']] = (g, best_km, s)

    return claimed, unmatched


def main():
    ap = argparse.ArgumentParser(description='Crosswalk SYNOP stations to GHCN-Daily ids')
    ap.add_argument('--apply', action='store_true',
                    help='write notes->>ghcnd_id (default is report only)')
    ap.add_argument('--max-km', type=float, default=DEFAULT_MAX_KM,
                    help=f'max pairing distance in km (default {DEFAULT_MAX_KM})')
    ap.add_argument('--cache', type=str,
                    default=str(Path(__file__).parent / 'probes' / 'ghcnd-stations.txt'),
                    help='local cache path for the NCEI inventory')
    args = ap.parse_args()

    txt = fetch_inventory(Path(args.cache))
    nz = parse_nz_stations(txt)
    print(f"\nGHCN-Daily NZ stations in inventory: {len(nz)}")
    for g in nz:
        print(f"  {g['ghcnd_id']:12} {g['lat']:>9.4f} {g['lon']:>10.4f} "
              f"{g['elev']:>7.1f}m  {g['name']:32} (wmo col: {g['wmo_claimed']})")

    Session = get_ingestion_session()
    with Session() as session:
        synop = load_synop_stations(session)
        print(f"\nSYNOP_GTS devices with coordinates: {len(synop)}")

        claimed, unmatched = match(nz, synop, args.max_km)

        print(f"\n{'='*78}\nMATCHES ({len(claimed)})\n{'='*78}")
        print(f"{'SYNOP CODE':16}{'SYNOP NAME':28}{'GHCN-D ID':13}{'GHCN-D NAME':22}{'km':>6}  status")
        to_write = []
        for code, (g, km, s) in sorted(claimed.items()):
            if s['existing'] == g['ghcnd_id']:
                status = 'already set'
            elif s['existing']:
                status = f"CONFLICT (has {s['existing']})"
            else:
                status = 'NEW'
                to_write.append((s['station_id'], code, g['ghcnd_id']))
            flag = '' if s['is_active'] else ' [inactive]'
            print(f"{code:16}{s['name'][:27]:28}{g['ghcnd_id']:13}"
                  f"{g['name'][:21]:22}{km:6.1f}  {status}{flag}")

        if unmatched:
            print(f"\n{'='*78}\nUNMATCHED ({len(unmatched)}) — no ACTIVE device within "
                  f"{args.max_km:.0f} km, or the pairing was already taken\n{'='*78}")
            for g, km, s, alt, alt_km in unmatched:
                near = f"nearest active {s['code']} @ {km:.1f} km" if s else 'no active candidate'
                line = f"  {g['ghcnd_id']:13}{g['name']:32} {near}"
                # A retired device sitting on top of an unmatched GHCN-D station
                # is a reactivation candidate, not a dead end.
                if alt is not None and alt_km < args.max_km:
                    line += f"  | retired {alt['code']} ({alt['name'][:24]}) @ {alt_km:.1f} km"
                print(line)

        print(f"\nNew ids to write: {len(to_write)}")
        if not args.apply:
            print("Report only — re-run with --apply to write.")
            return

        for station_id, code, ghcnd_id in to_write:
            session.execute(text("""
                UPDATE weather_stations
                SET notes = jsonb_set(
                        COALESCE(notes, '{}'::jsonb),
                        '{ghcnd_id}', to_jsonb(CAST(:gid AS text)), true),
                    updated_at = NOW()
                WHERE station_id = :sid
            """), {'gid': ghcnd_id, 'sid': station_id})
            print(f"  [ok] {code} -> {ghcnd_id}")
        session.commit()
        print(f"\nWrote {len(to_write)} ghcnd_id values.")


if __name__ == '__main__':
    main()
