"""A drawable, clickable region map for any (country, industry) scope.

Phase 4b of `docs/plans/COUNTRY_INDUSTRY_REGIONS_2026-08-24.md`.

Returns SVG path data, already projected, so the client is a dumb renderer and
the same component draws New Zealand today and Australia later. Nothing about
this endpoint or its component knows which country it is describing.

## Why the server projects, and not the client

If the payload were lon/lat, every client would have to agree on a projection
or the same data would render differently in the hero, in a share card and in
whatever comes next. Projecting once here makes the map a picture rather than a
dataset, and it lets the coordinates be ROUNDED TO INTEGERS — which is most of
why the payload is small enough to sit on the landing page at all.

The projection is equirectangular with a cos(latitude) correction on x. For a
locator map of one country it is indistinguishable from anything fancier, and
without the correction New Zealand renders about 25% too wide.

## Payload budget

The landing page is the highest-traffic URL on the domain, so this has a budget.
Measured for NZ wine: land 1,488 vertices, ten regions ~2,200. As integer SVG
path data that is roughly 30 KB, well under 10 KB gzipped. GeoJSON of the same
shapes is 75 KB, which is why this does not just proxy GeoJSON.

## Cached, because geometry does not change

Region boundaries change when someone runs a migration, not between requests.
The response is memoised per (country, industry, level) for the lifetime of the
process; a deploy clears it, which is the same cadence the geometry changes on.
"""
from __future__ import annotations

import json
import math
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from core import scope as scope_mod
from db.session import get_db

router = APIRouter()

# The drawing box. Height is fixed and width follows the country's aspect, so
# the client can size the SVG with CSS and never needs to know the shape.
TARGET_HEIGHT = 1000.0

# Simplification applied to the ZONE polygons at request time. The land outline
# is already simplified in the table; zones are small enough to do here, and
# doing it here means a zone edited in the admin appears without a rebuild.
ZONE_TOLERANCE = 0.01

_CACHE: dict[tuple, dict] = {}


class _Projector:
    """Lon/lat to SVG units for one country's bounding box.

    y is flipped because SVG counts down from the top and latitude counts up.
    Getting that wrong renders the country upside down, which is at least a
    loud failure rather than a quiet one.
    """

    def __init__(self, min_lon, min_lat, max_lon, max_lat):
        self.min_lon, self.min_lat = min_lon, min_lat
        self.max_lat = max_lat
        mean_lat = math.radians((min_lat + max_lat) / 2.0)
        self.kx = math.cos(mean_lat)
        span_lat = max(max_lat - min_lat, 1e-9)
        self.scale = TARGET_HEIGHT / span_lat
        self.width = round((max_lon - min_lon) * self.kx * self.scale, 1)
        self.height = TARGET_HEIGHT

    def xy(self, lon, lat):
        x = (lon - self.min_lon) * self.kx * self.scale
        y = (self.max_lat - lat) * self.scale
        return round(x), round(y)


def _rings_to_path(geom: dict, proj: _Projector) -> str:
    """One SVG `d` string for a (Multi)Polygon, holes included.

    Every ring is emitted, exterior and interior alike, and the client relies on
    the default `nonzero` fill rule to punch the holes out. A lake inside a
    region is rare here but Lake Taupo is not, and dropping interior rings would
    fill it in.
    """
    if not geom:
        return ""
    kind = geom.get("type")
    polys = (geom["coordinates"] if kind == "MultiPolygon"
             else [geom["coordinates"]] if kind == "Polygon" else [])

    out = []
    for poly in polys:
        for ring in poly:
            pts = []
            last = None
            for lon, lat in ring:
                p = proj.xy(lon, lat)
                # Rounding to integers collapses neighbouring vertices onto the
                # same pixel. Dropping the duplicates is most of the payload
                # saving and changes nothing that can be seen.
                if p != last:
                    pts.append(p)
                    last = p
            if len(pts) < 3:
                continue
            out.append("M" + " ".join(f"{x} {y}" for x, y in pts) + "Z")
    return "".join(out)


@router.get("")
def region_map(
    country: Optional[str] = Query(None, description="ISO2, defaults to NZ"),
    industry: Optional[str] = Query(None, description="Industry key, defaults to wine"),
    level: str = Query("region", pattern="^(region|all)$",
                       description="'region' draws the parent regions only; "
                                   "'all' includes sub-zones."),
    db: Session = Depends(get_db),
):
    """Land outline plus one clickable path per region, projected and rounded.

    A scope with no geometry returns `available: false` rather than 404 — an
    inactive country is a real page that should say "coming soon", and the map
    is the part of it that has nothing to draw.
    """
    sc = scope_mod.resolve(db, country, industry)
    key = (sc.country_id, sc.industry_id, level)
    if key in _CACHE:
        return _CACHE[key]

    land_row = db.execute(text("""
        SELECT ST_AsGeoJSON(geometry) AS gj,
               ST_XMin(geometry) AS min_lon, ST_YMin(geometry) AS min_lat,
               ST_XMax(geometry) AS max_lon, ST_YMax(geometry) AS max_lat
          FROM country_outline WHERE country_id = :c
    """), {"c": sc.country_id}).mappings().first()

    if not land_row:
        # No outline seeded for this country yet — Australia today.
        result = {
            "available": False,
            "reason": f"No map is available for {sc.country_name} yet.",
            "country": sc.country_iso2.lower(),
            "industry": sc.industry_key,
            "regions": [],
        }
        _CACHE[key] = result
        return result

    # The frame is the COUNTRY, not the regions. Framing on the regions would
    # zoom New Zealand to a ragged strip of vineyard districts and lose the
    # shape people recognise, which is the only reason a locator map works.
    proj = _Projector(land_row["min_lon"], land_row["min_lat"],
                      land_row["max_lon"], land_row["max_lat"])

    land_path = _rings_to_path(json.loads(land_row["gj"]), proj)

    level_filter = "" if level == "all" else "AND z.zone_level = 'region'"
    zones = db.execute(text(f"""
        SELECT z.slug, z.name, z.zone_level,
               ST_AsGeoJSON(ST_SimplifyPreserveTopology(
                   COALESCE(z.geometry_clipped, z.geometry), :tol)) AS gj,
               ST_X(z.label_point) AS lx, ST_Y(z.label_point) AS ly,
               EXISTS (SELECT 1 FROM climate_zone_daily d
                        WHERE d.zone_id = z.id) AS has_live
          FROM climate_zones z
         WHERE z.is_active
           AND z.country_id = :c AND z.industry_id = :i
           {level_filter}
         ORDER BY z.display_order, z.name
    """), {"c": sc.country_id, "i": sc.industry_id,
           "tol": ZONE_TOLERANCE}).mappings().all()

    regions = []
    for z in zones:
        d = _rings_to_path(json.loads(z["gj"]), proj) if z["gj"] else ""
        if not d:
            continue
        label = None
        if z["lx"] is not None and z["ly"] is not None:
            lx, ly = proj.xy(z["lx"], z["ly"])
            label = {"x": lx, "y": ly}
        regions.append({
            "slug": z["slug"],
            "name": z["name"],
            "level": z["zone_level"],
            "d": d,
            "label": label,
            # Same distinction the region dropdown makes: a region without a
            # live season still has history and projections and is still worth
            # visiting, it just gets a quieter treatment.
            "has_live_data": bool(z["has_live"]),
        })

    result = {
        "available": True,
        "country": sc.country_iso2.lower(),
        "country_name": sc.country_name,
        "industry": sc.industry_key,
        "industry_name": sc.industry_name,
        "width": proj.width,
        "height": proj.height,
        "land": land_path,
        "regions": regions,
    }
    _CACHE[key] = result
    return result
