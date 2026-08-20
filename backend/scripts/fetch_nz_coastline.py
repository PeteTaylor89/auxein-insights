"""Fetch the LINZ coastline under the wine zones, and clip the zones to it.

The wine zone polygons are administrative. Several of them run out over open
water — Marlborough across Cloudy Bay, Auckland and Waiheke across the gulf —
so the Atlas overlay draws a region that includes sea, and two neighbouring
zones can appear to overlap where both extend offshore.

This is **cartography only**. Every published zone statistic comes from
`climate_zone_cell_mask`, which is built from the vineyard register and never
reads the polygon, so nothing measured moves when the outline is trimmed. That
is also why the clip is written to a SEPARATE column: `climate_zones.geometry`
stays authoritative, because `insights_site_service.resolve_zone` matches a Pro
site against it and a coastal site must still resolve to its region even when
the 500 m surface treats its own cell as water.

Source: LINZ *NZ Coastlines and Islands Polygons (Topo 1:50k)*, layer 51153,
CC BY 4.0. Fetched per zone envelope rather than nationally — the national layer
is every rock in the EEZ, and what is needed is the strip under 23 regions.

    python backend/scripts/fetch_nz_coastline.py --dry-run
    python backend/scripts/fetch_nz_coastline.py
    python backend/scripts/fetch_nz_coastline.py --zone marlborough --refetch

Idempotent: land features upsert on the WFS feature id, and the clip is
recomputed from whatever `nz_land` holds. Re-running after adding a zone
converges rather than duplicating.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Iterator, Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

log = logging.getLogger("coastline")

LAYER = "layer-51153"
WFS_HOST = "https://data.linz.govt.nz"
PAGE = 1000
# WFS 2.0.0 with an EPSG:4326 urn puts LATITUDE first in the bbox. The GeoJSON
# that comes back is lon/lat as usual, so the two orders differ within a single
# request — and getting it backwards returns an empty set, not an error.
BBOX_CRS = "urn:ogc:def:crs:EPSG::4326"
# ~5 km. A coastal feature straddling the envelope edge has to come back whole;
# anything extra is discarded by the intersection anyway.
PAD_DEG = 0.05
REQUEST_DELAY_S = 0.3


def connect():
    from dotenv import load_dotenv
    root = Path(__file__).resolve().parents[2]
    load_dotenv(root / ".env")
    import psycopg2
    host = os.getenv("RDS_ENDPOINT")
    if not host:
        raise SystemExit("RDS_ENDPOINT is not set; cannot reach the database")
    return psycopg2.connect(
        host=host, port=os.getenv("RDS_PORT", "5432"),
        user=os.environ["RDS_USER"], password=os.environ["RDS_PASSWORD"],
        dbname=os.environ["RDS_DATABASE"], connect_timeout=20)


def api_key() -> str:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
    key = os.getenv("LINZ_API_KEY")
    if not key:
        raise SystemExit("LINZ_API_KEY is not set; the coastline cannot be fetched")
    return key


def wfs_page(key: str, bbox: tuple, start: int) -> dict:
    """One page of land features intersecting `bbox` (south, west, north, east)."""
    south, west, north, east = bbox
    params = {
        "service": "WFS", "version": "2.0.0", "request": "GetFeature",
        "typeNames": LAYER, "outputFormat": "application/json",
        "srsName": "EPSG:4326",
        "count": str(PAGE), "startIndex": str(start),
        "bbox": f"{south},{west},{north},{east},{BBOX_CRS}",
    }
    url = f"{WFS_HOST}/services;key={key}/wfs?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=180) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_envelope(key: str, bbox: tuple) -> Iterator[dict]:
    start = 0
    while True:
        page = wfs_page(key, bbox, start)
        feats = page.get("features") or []
        for f in feats:
            yield f
        if len(feats) < PAGE:
            return
        start += PAGE
        time.sleep(REQUEST_DELAY_S)


def zone_rows(cur, slugs: Optional[list]) -> list:
    cur.execute("""
        SELECT z.id, z.slug, z.name,
               ST_YMin(z.geometry), ST_XMin(z.geometry),
               ST_YMax(z.geometry), ST_XMax(z.geometry),
               z.geometry_clipped IS NOT NULL AS clipped
          FROM climate_zones z
         WHERE z.geometry IS NOT NULL AND z.is_active = true
           AND (%s::text[] IS NULL OR z.slug = ANY(%s::text[]))
         ORDER BY z.display_order
    """, (slugs, slugs))
    return cur.fetchall()


def store_features(cur, features: list) -> int:
    """Upsert land polygons. Returns how many were new."""
    new = 0
    for f in features:
        geom = f.get("geometry")
        if not geom or geom.get("type") not in ("Polygon", "MultiPolygon"):
            continue
        props = f.get("properties") or {}
        cur.execute("""
            INSERT INTO nz_land (feature_id, source, name, geom)
            VALUES (%s, %s, %s,
                    ST_Multi(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326))))
            ON CONFLICT (feature_id) DO NOTHING
        """, (f.get("id"), "linz-51153", props.get("name"), json.dumps(geom)))
        new += cur.rowcount
    return new


def clip_zone(cur, zone_id: int):
    """Intersect one zone with the land it overlaps.

    Areas come back through the geography cast, in square metres, so Northland
    and Central Otago are comparable rather than being degrees of latitude.
    """
    cur.execute("""
        WITH land AS (
            SELECT ST_Union(l.geom) AS geom, count(*) AS n
              FROM nz_land l, climate_zones z
             WHERE z.id = %(id)s
               AND l.geom && z.geometry
               AND ST_Intersects(l.geom, z.geometry)
        )
        UPDATE climate_zones z
           SET geometry_clipped = ST_Multi(ST_CollectionExtract(
                   ST_MakeValid(ST_Intersection(ST_MakeValid(z.geometry),
                                                land.geom)), 3))
          FROM land
         WHERE z.id = %(id)s AND land.geom IS NOT NULL
        RETURNING ST_Area(z.geometry::geography),
                  ST_Area(z.geometry_clipped::geography),
                  land.n
    """, {"id": zone_id})
    row = cur.fetchone()
    return row if row else (0.0, 0.0, 0)


# `company_id IS NULL` is the national reference register; blocks with a company
# are customer data. Same filter `build_zone_mask.BLOCK_FILTER` uses, and it must
# stay the same one — a label placed from customer geometry would leak which
# zones a company farms.
BLOCK_FILTER = "b.company_id IS NULL"


def place_label(cur, zone_id: int):
    """Choose where the zone's name is drawn, and store it.

    Rank the zone's land parts by how many REGISTERED VINEYARD BLOCKS sit on
    each, not by area, and fall back to area for a zone with no blocks. Auckland
    is why area alone fails: its largest land part is 51.9 km2 out in the gulf
    against 49.0 km2 at Kumeu, a 6% margin that puts the label on the wrong
    island.

    Blocks inside a SUB-ZONE are excluded from the parent's ranking. Auckland
    again: 280 of its 417 registered blocks are on Waiheke, which is its own
    zone with its own label, so counting them would write "Auckland" across
    Waiheke and leave the mainland unlabelled. A parent's name belongs where its
    own distinct vineyards are.

    The `&&` before every `ST_Intersects` is load-bearing, not decoration.
    Marlborough dumps to 238 parts; without the bounding-box test first this
    query ran for over 200 seconds on that zone alone.
    """
    cur.execute(f"""
        WITH parts AS (
            SELECT (ST_Dump(COALESCE(geometry_clipped, geometry))).geom AS geom
              FROM climate_zones WHERE id = %(id)s
        ),
        kids AS (
            SELECT ST_Union(geometry) AS geom
              FROM climate_zones
             WHERE parent_zone_id = %(id)s AND geometry IS NOT NULL
        ),
        blk AS (
            SELECT b.geometry
              FROM vineyard_blocks b, climate_zones z
             WHERE z.id = %(id)s
               AND {BLOCK_FILTER}
               AND b.geometry IS NOT NULL
               AND b.geometry && z.geometry
               AND ST_Intersects(b.geometry, z.geometry)
               AND NOT EXISTS (
                     SELECT 1 FROM kids
                      WHERE kids.geom IS NOT NULL
                        AND b.geometry && kids.geom
                        AND ST_Intersects(b.geometry, kids.geom))
        ),
        ranked AS (
            SELECT p.geom, count(blk.geometry) AS blocks
              FROM parts p
              LEFT JOIN blk
                ON blk.geometry && p.geom AND ST_Intersects(blk.geometry, p.geom)
             GROUP BY p.geom
             ORDER BY blocks DESC, ST_Area(p.geom) DESC
             LIMIT 1
        )
        UPDATE climate_zones z
           SET label_point = ST_PointOnSurface(ranked.geom)
          FROM ranked
         WHERE z.id = %(id)s
        RETURNING ST_Y(z.label_point), ST_X(z.label_point), ranked.blocks
    """, {"id": zone_id})
    row = cur.fetchone()
    return row if row else (None, None, 0)


def main(argv: Optional[list] = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--zone", action="append", dest="zones",
                   help="restrict to one zone slug (repeatable)")
    p.add_argument("--refetch", action="store_true",
                   help="query LINZ again even for zones already clipped")
    p.add_argument("--dry-run", action="store_true",
                   help="fetch and report, write nothing")
    p.add_argument("--labels-only", action="store_true",
                   help="skip the fetch and the clip, recompute label anchors")
    p.add_argument("-v", "--verbose", action="store_true")
    args = p.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s")

    key = api_key()
    cn = connect()
    cn.autocommit = False
    cur = cn.cursor()

    cur.execute("SELECT to_regclass('public.nz_land')")
    if cur.fetchone()[0] is None:
        raise SystemExit(
            "nz_land does not exist - apply the `zone_coastal_clip` migration first")

    zones = zone_rows(cur, args.zones)
    if not zones:
        raise SystemExit("no matching active zones with geometry")

    log.info("%d zone(s)", len(zones))
    total_new = 0

    for zid, slug, name, ymin, xmin, ymax, xmax, clipped in ([] if args.labels_only else zones):
        if clipped and not args.refetch:
            log.info("%-22s already clipped - skipping the fetch "
                     "(--refetch to force)", slug)
            continue
        bbox = (ymin - PAD_DEG, xmin - PAD_DEG, ymax + PAD_DEG, xmax + PAD_DEG)
        feats = list(fetch_envelope(key, bbox))
        new = 0 if args.dry_run else store_features(cur, feats)
        total_new += new
        log.info("%-22s %5d land features in envelope, %4d new",
                 slug, len(feats), new)
        time.sleep(REQUEST_DELAY_S)

    if args.dry_run:
        cn.rollback()
        log.info("dry run - nothing written")
        return 0

    # Clip every zone in scope, including ones whose fetch was skipped: the
    # envelopes overlap, so a neighbour's fetch can supply land this one needs.
    for row in ([] if args.labels_only else zones):
        zid, slug = row[0], row[1]
        before, after, n = clip_zone(cur, zid)
        if not n:
            log.warning("%-22s no land features intersect it - left unclipped, "
                        "/zones falls back to the raw geometry", slug)
            continue
        lost = (1 - after / before) * 100 if before else 0.0
        log.info("%-22s %8.1f km2 -> %8.1f km2  (%5.1f%% was sea, %d land parts)",
                 slug, before / 1e6, after / 1e6, lost, n)

    # Anchors last: they are chosen on the CLIPPED outline, so they have to be
    # recomputed whenever the clip moves or the label drifts offshore with it.
    for row in zones:
        zid, slug = row[0], row[1]
        lat, lon, blocks = place_label(cur, zid)
        if lat is None:
            log.warning("%-22s no label anchor - /zones falls back to the "
                        "largest part at request time", slug)
        else:
            log.info("%-22s label at %.3f, %.3f  (%d own blocks on that part)",
                     slug, lat, lon, blocks)

    cn.commit()
    log.info("done - %d new land features stored", total_new)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
