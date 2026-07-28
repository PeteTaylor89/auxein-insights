#!/usr/bin/env python
"""Fill NULL station elevations from the LINZ 8m DEM (via Open Topo Data).

Elevation is required as a covariate for the interpolation-surface model. New
council stations are seeded with NULL elevation; this backfills them from the
authoritative NZ 8m DEM (LINZ layer 51768) served point-queryable and keyless by
Open Topo Data as dataset `nzdem8m`.

  GET https://api.opentopodata.org/v1/nzdem8m?locations=lat,lon|lat,lon|...

Public API limits: ~1 req/s, 1000/day, 100 locations/request. We batch 100 and
sleep 1s between calls. Points outside DEM coverage (e.g. Chatham Is.) return a
null elevation and are left NULL (reported, not zeroed).

Usage:
    python ingestion/scripts/fill_elevation_from_dem.py --dry-run
    python ingestion/scripts/fill_elevation_from_dem.py
    python ingestion/scripts/fill_elevation_from_dem.py --source HBRC   # limit to one source
"""
import argparse
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # ingestion/
from db_connection import get_ingestion_session
from sqlalchemy import text

API = "https://api.opentopodata.org/v1/nzdem8m"
FALLBACK = "https://api.open-meteo.com/v1/elevation"  # Copernicus 90m, keyless
BATCH = 100
SLEEP = 1.1  # respect ~1 req/s public limit


def fetch_dem(points):
    """points: list of (lat, lon). Returns list of elevation floats (or None)."""
    locs = "|".join(f"{lat},{lon}" for lat, lon in points)
    r = requests.get(API, params={"locations": locs}, timeout=60)
    r.raise_for_status()
    data = r.json()
    if data.get("status") != "OK":
        raise RuntimeError(f"OpenTopoData status={data.get('status')}: {data.get('error')}")
    return [res.get("elevation") for res in data["results"]]


def fetch_fallback(points):
    """Open-Meteo batch elevation for points the DEM returned null for."""
    lats = ",".join(str(lat) for lat, _ in points)
    lons = ",".join(str(lon) for _, lon in points)
    r = requests.get(FALLBACK, params={"latitude": lats, "longitude": lons}, timeout=60)
    r.raise_for_status()
    return r.json().get("elevation", [])


def run(dry_run: bool, source: str | None):
    Session = get_ingestion_session()
    with Session() as s:
        sql = ("SELECT station_id, station_code, latitude, longitude, data_source "
               "FROM weather_stations "
               "WHERE elevation IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL")
        params = {}
        if source:
            sql += " AND data_source = :src"
            params["src"] = source
        sql += " ORDER BY station_id"
        rows = s.execute(text(sql), params).fetchall()

    print(f"Stations with NULL elevation{f' (source={source})' if source else ''}: {len(rows)}")
    if not rows:
        return

    filled = still_null = errors = fallback_used = 0
    for i in range(0, len(rows), BATCH):
        batch = rows[i:i + BATCH]
        pts = [(float(r[2]), float(r[3])) for r in batch]
        try:
            elevs = fetch_dem(pts)
        except Exception as e:
            errors += len(batch)
            print(f"  batch {i//BATCH+1}: DEM ERROR {e}")
            time.sleep(SLEEP)
            continue

        # fallback for any nulls (out of LINZ coverage)
        null_idx = [j for j, e in enumerate(elevs) if e is None]
        if null_idx:
            try:
                fb = fetch_fallback([pts[j] for j in null_idx])
                for k, j in enumerate(null_idx):
                    if k < len(fb) and fb[k] is not None:
                        elevs[j] = fb[k]
                        fallback_used += 1
            except Exception as e:
                print(f"  batch {i//BATCH+1}: fallback ERROR {e}")

        with Session() as s:
            for r, elev in zip(batch, elevs):
                if elev is None:
                    still_null += 1
                    print(f"  {r[1]}: no DEM coverage, left NULL")
                    continue
                if dry_run:
                    if filled < 8:
                        print(f"  [DRY] {r[1]} ({r[4]}): {round(elev, 1)} m")
                else:
                    s.execute(text("UPDATE weather_stations SET elevation=:e WHERE station_id=:id"),
                              {"e": round(float(elev), 1), "id": r[0]})
                filled += 1
            if not dry_run:
                s.commit()
        print(f"  batch {i//BATCH+1}/{(len(rows)+BATCH-1)//BATCH}: {len(batch)} points "
              f"({'dry-run' if dry_run else 'updated'})")
        time.sleep(SLEEP)

    print("\n" + "=" * 50)
    print("Elevation fill" + ("  [DRY RUN]" if dry_run else ""))
    print("=" * 50)
    print(f"  Filled            : {filled}  (of which {fallback_used} via Open-Meteo fallback)")
    print(f"  Left NULL (no cov): {still_null}")
    print(f"  Batch errors      : {errors}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--source", help="limit to one data_source, e.g. HBRC")
    run(ap.parse_args().dry_run, ap.parse_args().source)
