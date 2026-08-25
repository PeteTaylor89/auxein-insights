#!/usr/bin/env python3
"""Worksheet for assigning weather stations to climate zones.

Only **105 of 932** stations carry a `zone_id`, and four zones have none at all.
That assignment is what decides which stations feed `climate_zone_hourly` and
therefore disease pressure, so it is currently the binding constraint on the
whole regional product — not station count, and not code.

This does not assign anything. It produces the evidence for a human to.

## Distance is measured to PLANTED CELLS, not to the zone polygon

A zone polygon is a region boundary, not a description of where vines are.
Marlborough's spans the Sounds and the inland ranges: its unweighted polygon
mean runs **3.77 degC colder** than the same zone measured over its actual
plantings, which is why `climate_zone_cell_mask` exists. Ranking candidate
stations by distance to a polygon centroid would repeat that mistake in a
different place — it would favour a station in the middle of the Sounds over one
sitting in the Wairau vineyards.

So every distance here is to the nearest cell that actually contains vines, and
each candidate also carries the planted hectares within 10 km of it, which is
the honest answer to "how much vineyard would this station speak for".

## HUMIDITY IS THE COLUMN TO READ

Powdery mildew, Botrytis and downy mildew all run off dewpoint and leaf wetness
derived from RH. A zone with thermometers and no hygrometer cannot produce a
disease figure worth publishing — Upper Wairau & Southern Valleys has four
assigned stations and **no humidity at all**. So `has_rh` is called out
separately from `has_temp`, and the summary reports what each zone would GAIN
rather than only what is near it.

## The QC columns are there so a broken sensor is not assigned

`qc_rejects` / `qc_flags` come from `weather_daily_qc`. Station 100 sat in zone
12 feeding **0.0% RH** into Awatere's disease pressure for three months; a
station with a live reject history should not be adopted into another zone
without looking at why.

## Assignment rolls UP the zone tree

`climate_zones.parent_zone_id` makes sub-zones nest, and the hourly rollup
resolves each station to its root. Assigning a station to Awatere therefore also
feeds Marlborough. `current_zone` shows where a station already sits so an
existing assignment is not silently moved.

Usage:
    python scripts/zone_assignment_worksheet.py
    python scripts/zone_assignment_worksheet.py --zone 12 --radius-km 40
"""
from __future__ import annotations

import argparse
import csv
import logging
import re
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

logger = logging.getLogger("zone_worksheet")

DEFAULT_RADIUS_KM = 50.0
# Planted hectares within this distance of a station — "what it speaks for".
REPRESENTS_KM = 10.0
# A variable counts as reported only if it appears on this many days recently;
# one stray row is not a working sensor.
RECENT_DAYS = 30
MIN_DAYS_TO_COUNT = 5

EARTH_R = 6371.0


def parse_grid_key(key: str) -> tuple[float, float, float, float]:
    """(west, north, xres, yres) from the mask's stamped geotransform.

    The key looks like
    `2667x2856@0.004500000,0.000000000,166.472750000,0.000000000,-0.004500000,-34.425250000`
    — dimensions, then the six GDAL affine terms. Parsed rather than hardcoded
    so a regridded mask cannot silently be read against the old geometry.
    """
    m = re.match(r"(\d+)x(\d+)@(.+)$", key)
    if not m:
        raise ValueError(f"unrecognised grid_key: {key!r}")
    a, b, c, d, e, f = (float(x) for x in m.group(3).split(","))
    return c, f, abs(a), abs(e)


def cell_lonlat(row, col, west, north, xres, yres):
    """Cell centre. The mask stores row/col, and a corner is not a location."""
    return west + (col + 0.5) * xres, north - (row + 0.5) * yres


def haversine_km(lat1, lon1, lat2, lon2):
    p = np.pi / 180.0
    dlat = (lat2 - lat1) * p
    dlon = (lon2 - lon1) * p
    a = (np.sin(dlat / 2.0) ** 2
         + np.cos(lat1 * p) * np.cos(lat2 * p) * np.sin(dlon / 2.0) ** 2)
    return 2 * EARTH_R * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--zone", type=int, help="one zone id, else every zone")
    ap.add_argument("--radius-km", type=float, default=DEFAULT_RADIUS_KM)
    ap.add_argument("--out", type=Path,
                    default=Path("scratchpad/zone_assignment_worksheet.csv"))
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
    from sqlalchemy import text
    from db.session import SessionLocal

    db = SessionLocal()
    try:
        zones = {r["id"]: dict(r) for r in db.execute(text("""
            SELECT id, name, slug, parent_zone_id, zone_level
              FROM climate_zones WHERE is_active ORDER BY id
        """)).mappings()}

        # A station assigned to a sub-zone ALSO feeds its parent: the hourly
        # rollup resolves every station to its root zone. Reporting only direct
        # assignments makes Marlborough — 31,062 planted hectares, the largest
        # zone in the country — read as "NO STATIONS" when its four sub-zones
        # carry eight between them. `effective` is what disease actually sees.
        children: dict = {}
        for zid, z in zones.items():
            pid = z["parent_zone_id"]
            if pid:
                children.setdefault(pid, []).append(zid)

        def descendants(zid: int) -> set:
            out, stack = {zid}, list(children.get(zid, []))
            while stack:
                c = stack.pop()
                if c in out:
                    continue
                out.add(c)
                stack.extend(children.get(c, []))
            return out

        stations = [dict(r) for r in db.execute(text("""
            SELECT station_id, station_name, data_source, latitude, longitude,
                   coalesce(elevation, 0) AS elevation, zone_id, is_active
              FROM weather_stations
             WHERE latitude IS NOT NULL AND longitude IS NOT NULL
               AND is_active
        """)).mappings()]
        if not stations:
            logger.error("no active stations with coordinates")
            return 1

        s_lat = np.array([float(s["latitude"]) for s in stations])
        s_lon = np.array([float(s["longitude"]) for s in stations])

        # What each station actually reports, recently. A station listed as
        # active that stopped sending a month ago is not a candidate.
        recent = {}
        for r in db.execute(text(f"""
            SELECT station_id,
                   count(*) FILTER (WHERE temp_mean IS NOT NULL)     AS temp_days,
                   count(*) FILTER (WHERE humidity_mean IS NOT NULL) AS rh_days,
                   count(*) FILTER (WHERE rainfall_mm IS NOT NULL)   AS rain_days
              FROM weather_data_daily
             WHERE date > current_date - {RECENT_DAYS}
             GROUP BY station_id
        """)).mappings():
            recent[r["station_id"]] = dict(r)

        qc = {}
        for r in db.execute(text("""
            SELECT station_id,
                   count(*) FILTER (WHERE severity = 'reject') AS rejects,
                   count(*) FILTER (WHERE severity = 'flag')   AS flags
              FROM weather_daily_qc GROUP BY station_id
        """)).mappings():
            qc[r["station_id"]] = dict(r)

        mask = [dict(r) for r in db.execute(text("""
            SELECT zone_id, row, col, planted_ha, grid_key
              FROM climate_zone_cell_mask
        """)).mappings()]
        if not mask:
            logger.error("climate_zone_cell_mask is empty — run build_zone_mask.py")
            return 1
        west, north, xres, yres = parse_grid_key(mask[0]["grid_key"])

        by_zone: dict = {}
        for c in mask:
            lon, lat = cell_lonlat(c["row"], c["col"], west, north, xres, yres)
            by_zone.setdefault(c["zone_id"], []).append(
                (lat, lon, float(c["planted_ha"])))

        targets = [args.zone] if args.zone else sorted(zones)
        rows_out = []
        summary = []

        for zid in targets:
            z = zones.get(zid)
            if z is None:
                logger.warning("zone %s not active, skipping", zid)
                continue
            cells = by_zone.get(zid)
            if not cells:
                summary.append((zid, z["name"], 0, 0, 0, 0.0, None))
                continue

            c_lat = np.array([c[0] for c in cells])
            c_lon = np.array([c[1] for c in cells])
            c_ha = np.array([c[2] for c in cells])

            # Distance from every station to every planted cell of this zone.
            d = haversine_km(c_lat[None, :], c_lon[None, :],
                             s_lat[:, None], s_lon[:, None])
            nearest = d.min(axis=1)
            represents = np.array([c_ha[d[i] <= REPRESENTS_KM].sum()
                                   for i in range(len(stations))])

            order = np.argsort(nearest)
            assigned = have_rh = 0
            best_rh_gain = None

            for i in order:
                if nearest[i] > args.radius_km:
                    break
                st = stations[i]
                rec = recent.get(st["station_id"], {})
                temp_days = int(rec.get("temp_days") or 0)
                rh_days = int(rec.get("rh_days") or 0)
                rain_days = int(rec.get("rain_days") or 0)
                has_temp = temp_days >= MIN_DAYS_TO_COUNT
                has_rh = rh_days >= MIN_DAYS_TO_COUNT
                q = qc.get(st["station_id"], {})

                cur = st["zone_id"]
                if cur == zid:
                    status = "ASSIGNED"
                    assigned += 1
                    if has_rh:
                        have_rh += 1
                elif cur is None:
                    status = "unassigned"
                else:
                    status = f"in zone {cur} ({zones.get(cur, {}).get('name', '?')})"

                if (status == "unassigned" and has_rh
                        and best_rh_gain is None):
                    best_rh_gain = (st["station_id"], st["station_name"],
                                    round(float(nearest[i]), 1))

                rows_out.append({
                    "zone_id": zid,
                    "zone": z["name"],
                    "parent_zone_id": z["parent_zone_id"] or "",
                    "station_id": st["station_id"],
                    "station_name": st["station_name"],
                    "source": st["data_source"],
                    "km_to_nearest_vines": round(float(nearest[i]), 2),
                    "planted_ha_within_10km": round(float(represents[i]), 1),
                    "elevation_m": int(st["elevation"] or 0),
                    "current_zone": status,
                    "has_temp": int(has_temp),
                    "has_rh": int(has_rh),
                    "has_rain": int(rain_days >= MIN_DAYS_TO_COUNT),
                    "temp_days_30": temp_days,
                    "rh_days_30": rh_days,
                    "rain_days_30": rain_days,
                    "qc_rejects": int(q.get("rejects") or 0),
                    "qc_flags": int(q.get("flags") or 0),
                    "latitude": round(float(st["latitude"]), 5),
                    "longitude": round(float(st["longitude"]), 5),
                })

            fam = descendants(zid)
            eff = [st for st in stations if st["zone_id"] in fam]
            eff_rh = sum(1 for st in eff
                         if (recent.get(st["station_id"], {}).get("rh_days") or 0)
                         >= MIN_DAYS_TO_COUNT)
            summary.append((zid, z["name"], len(cells), assigned, have_rh,
                            float(c_ha.sum()), best_rh_gain,
                            len(eff), eff_rh, bool(children.get(zid))))

        args.out.parent.mkdir(parents=True, exist_ok=True)
        with args.out.open("w", newline="", encoding="utf-8") as fh:
            if rows_out:
                w = csv.DictWriter(fh, fieldnames=list(rows_out[0].keys()))
                w.writeheader()
                w.writerows(rows_out)

        logger.info("\n%-4s %-32s %8s %11s %11s  %s",
                    "zone", "name", "vine_ha", "direct n/rh", "effect n/rh",
                    "nearest unassigned station WITH humidity")
        logger.info("-" * 124)
        for (zid, name, ncells, assigned, have_rh, ha, gain,
             eff_n, eff_rh, is_parent) in summary:
            gain_txt = ("-- none in range --" if gain is None
                        else f"{gain[0]} {gain[1][:28]} ({gain[2]} km)")
            # Judged on EFFECTIVE coverage, because that is what feeds disease.
            # A parent zone with no direct station is fine when its sub-zones
            # carry them — Marlborough is exactly that case.
            if eff_n == 0:
                mark = "  <== NO STATIONS"
            elif eff_rh == 0:
                mark = "  <== NO HUMIDITY"
            else:
                mark = ""
            logger.info("%-4d %-32s %8.0f %5d /%-5d %5d /%-5d  %s%s",
                        zid, name[:32], ha, assigned, have_rh, eff_n, eff_rh,
                        gain_txt, mark)
        logger.info("\n  direct = assigned to this zone itself")
        logger.info("  effect = direct plus every sub-zone, which is what the "
                    "hourly rollup — and therefore disease — actually sees")
        logger.info("\n%d candidate rows -> %s", len(rows_out), args.out)
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
