"""Build the climate zone cell mask — run once, reused by every future surface.

    python backend/scripts/build_zone_mask.py --reference-cog <path or s3 key>
    python backend/scripts/build_zone_mask.py --dry-run          # measure, write nothing

For each climate zone, clip the national vineyard register to the zone polygon
and work out how many planted hectares fall in each 500 m grid cell. The result
is `climate_zone_cell_mask`, and every zone statistic we ever publish is a
weighted mean over it.

## The rasterisation, and why it is not a plain one

A 500 m cell at -41 degrees is 18.9 ha; the average block is 4.95 ha. Rasterising
blocks directly at cell resolution therefore loses most of them (centre-based) or
over-weights slivers (all-touched). Instead each cell is split into
SUBCELL x SUBCELL sub-cells, the clipped blocks are rasterised onto that finer
grid, and the sub-cell hits are summed back to give each cell a FRACTION of
coverage. At the default 10 that is a 1% quantisation of cell area, which is far
finer than the ~500 m positional uncertainty of the surface itself.

Only the zone's bounding window is rasterised, never the national grid — the
sub-cell grid over all of New Zealand would be 762 M cells.

## Hectares, not fractions

Cell area varies with latitude, because the grid is geographic: 0.0045 degrees of
longitude is 378 m at Central Otago and 415 m at Northland. Area is computed per
raster ROW from that row's latitude, so a northern cell is not silently credited
with a southern cell's area.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np                                                  # noqa: E402
from sqlalchemy import text                                         # noqa: E402

from db.session import SessionLocal                                 # noqa: E402

# Blocks with a company are customer data. A public zone statistic is built from
# the national register only — see D1 in the plan. Changing this string changes
# what `climate_zone_mask_run.block_filter` records, deliberately.
BLOCK_FILTER = "company_id IS NULL"

# Sub-cells per cell per axis. At 40 a sub-cell is ~12.5 m x 9.5 m (0.012 ha),
# so cell coverage is quantised to 1/1600 and essentially every real block
# registers without the centroid fallback. Affordable only because each block is
# rasterised inside its own window rather than the zone's.
SUBCELL = 40
EARTH_M_PER_DEG = 111_320.0

DEFAULT_COG = ("scratchpad/climate_history/bucket/surfaces/v2/temp_mean/"
               "monthly/2020/temp_mean_monthly_202001_500m_mean.tif")


def grid_fingerprint(width: int, height: int, transform) -> str:
    """Stable identity for a raster geometry.

    Rounded to 1e-9 degrees (~0.1 mm) so that float formatting differences
    between GDAL versions do not invent a new grid, while any real change to
    origin or resolution does.
    """
    coeffs = ",".join(f"{v:.9f}" for v in tuple(transform)[:6])
    return f"{width}x{height}@{coeffs}"


_GEOD = None
_ROW_AREA_CACHE: dict[int, float] = {}


def _geod():
    global _GEOD
    if _GEOD is None:
        from pyproj import Geod
        _GEOD = Geod(ellps="WGS84")
    return _GEOD


def row_cell_area_ha(transform, row: int) -> float:
    """Ground area of one cell on the given raster row, in hectares.

    Geodesic on the WGS84 ellipsoid, not a spherical approximation. The
    spherical form is ~0.1% high at NZ latitudes, which cancels out of a
    weighted MEAN but not out of the planted-hectare figures this also
    produces — and those are checkable against PostGIS, so they should agree.
    Cached per row: every cell on a row has the same area.
    """
    if row in _ROW_AREA_CACHE:
        return _ROW_AREA_CACHE[row]
    top = transform.f + row * transform.e              # e is negative
    bottom = top + transform.e
    left = transform.c
    right = left + transform.a
    area, _ = _geod().polygon_area_perimeter(
        [left, right, right, left], [top, top, bottom, bottom])
    ha = abs(area) / 10_000.0
    _ROW_AREA_CACHE[row] = ha
    return ha


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--reference-cog", default=DEFAULT_COG,
                    help="any published 500 m surface; defines the grid")
    ap.add_argument("--subcell", type=int, default=SUBCELL)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--save-npz", metavar="PATH",
                    help="also write the mask locally, so a sense check can "
                         "sample surfaces through it without a 6-minute rebuild")
    args = ap.parse_args()

    import rasterio
    from rasterio.features import rasterize
    from rasterio.transform import Affine
    from shapely import wkb
    from shapely.geometry import mapping

    if not os.path.exists(args.reference_cog):
        print(f"reference COG not found: {args.reference_cog}")
        return 2

    with rasterio.open(args.reference_cog) as ds:
        width, height, transform, crs = ds.width, ds.height, ds.transform, ds.crs
    grid_key = grid_fingerprint(width, height, transform)
    res_m = int(round(abs(transform.e) * EARTH_M_PER_DEG))
    print(f"grid {width}x{height} @ ~{res_m} m   key {grid_key}")

    db = SessionLocal()
    try:
        zones = db.execute(text("""
            SELECT id, name, slug, zone_level
              FROM climate_zones
             WHERE geometry IS NOT NULL
             ORDER BY zone_level, name
        """)).fetchall()
        print(f"{len(zones)} zones with geometry\n")

        rows_out: list[tuple] = []
        totals = {"blocks": 0, "ha": 0.0, "cells": 0}
        distinct_blocks: set[int] = set()
        fallbacks = dropped = 0

        for zone in zones:
            # Clip each block to the zone so a block straddling a boundary
            # contributes its area to each side, not all of it to both.
            clipped = db.execute(text(f"""
                SELECT b.id,
                       ST_AsBinary(ST_Intersection(b.geometry, z.geometry)) AS geom
                  FROM vineyard_blocks b
                  JOIN climate_zones z ON z.id = :zid
                 WHERE b.geometry IS NOT NULL
                   AND b.{BLOCK_FILTER}
                   AND ST_Intersects(b.geometry, z.geometry)
            """), {"zid": zone.id}).fetchall()

            shapes = []
            for rec in clipped:
                if rec.geom is None:
                    continue
                geom = wkb.loads(bytes(rec.geom))
                if geom.is_empty or geom.area <= 0:
                    continue
                shapes.append((rec.id, geom))

            if not shapes:
                print(f"  {zone.name:<34} no blocks")
                continue

            # Window covering just this zone's blocks, snapped to whole cells
            # and clamped to the raster.
            xs = [g.bounds for _, g in shapes]
            west = min(b[0] for b in xs)
            south = min(b[1] for b in xs)
            east = max(b[2] for b in xs)
            north = max(b[3] for b in xs)

            col0 = max(0, int(math.floor((west - transform.c) / transform.a)))
            col1 = min(width, int(math.ceil((east - transform.c) / transform.a)) + 1)
            row0 = max(0, int(math.floor((north - transform.f) / transform.e)))
            row1 = min(height, int(math.ceil((south - transform.f) / transform.e)) + 1)
            if col1 <= col0 or row1 <= row0:
                print(f"  {zone.name:<34} window empty")
                continue

            n_cols, n_rows = col1 - col0, row1 - row0
            sub = args.subcell

            # Per-cell planted fraction, and a separate pass per block so a cell
            # can report how many distinct blocks touch it.
            frac = np.zeros((n_rows, n_cols), dtype=np.float64)
            counts = np.zeros((n_rows, n_cols), dtype=np.int32)

            for block_id, geom in shapes:
                # Rasterise each block inside ITS OWN window, not the zone's.
                # A 5 ha block spans about two cells; burning it across
                # Marlborough's whole window allocated a multi-megabyte array
                # per block and made a finer sub-grid unaffordable. Windowing
                # per block is what lets SUBCELL be large enough that few blocks
                # need the centroid fallback below.
                bw, bs, be, bn = geom.bounds
                bc0 = max(col0, int(math.floor((bw - transform.c) / transform.a)))
                bc1 = min(col1, int(math.ceil((be - transform.c) / transform.a)) + 1)
                br0 = max(row0, int(math.floor((bn - transform.f) / transform.e)))
                br1 = min(row1, int(math.ceil((bs - transform.f) / transform.e)) + 1)
                if bc1 <= bc0 or br1 <= br0:
                    dropped += 1
                    continue

                b_cols, b_rows = bc1 - bc0, br1 - br0
                block_transform = Affine(transform.a / sub, 0.0,
                                         transform.c + bc0 * transform.a,
                                         0.0, transform.e / sub,
                                         transform.f + br0 * transform.e)
                burned = rasterize(
                    [(mapping(geom), 1)],
                    out_shape=(b_rows * sub, b_cols * sub),
                    transform=block_transform,
                    fill=0, dtype="uint8", all_touched=False,
                )
                if not burned.any():
                    # Smaller than a sub-cell and missing every sub-cell centre.
                    # Dropping it would quietly lose the block, so place it at
                    # its centroid with its true area instead. Counted and
                    # reported: a silent fallback here would be indistinguishable
                    # from a broken transform.
                    cx, cy = geom.centroid.x, geom.centroid.y
                    c = int((cx - transform.c) / transform.a) - col0
                    r = int((cy - transform.f) / transform.e) - row0
                    if 0 <= r < n_rows and 0 <= c < n_cols:
                        area_ha = _geodesic_area_ha(geom)
                        frac[r, c] += area_ha / row_cell_area_ha(transform, r + row0)
                        counts[r, c] += 1
                        distinct_blocks.add(block_id)
                        fallbacks += 1
                    else:
                        dropped += 1
                    continue

                cell_hits = burned.reshape(b_rows, sub, b_cols, sub).sum(axis=(1, 3))
                r_off, c_off = br0 - row0, bc0 - col0
                frac[r_off:r_off + b_rows, c_off:c_off + b_cols] += \
                    cell_hits / float(sub * sub)
                counts[r_off:r_off + b_rows, c_off:c_off + b_cols] += \
                    (cell_hits > 0).astype(np.int32)
                distinct_blocks.add(block_id)

            # Blocks inside one zone do not overlap, but clipping and the
            # centroid fallback can push a cell marginally over 1.0.
            frac = np.clip(frac, 0.0, 1.0)

            hit_rows, hit_cols = np.nonzero(frac > 0)
            zone_ha = 0.0
            for r, c in zip(hit_rows, hit_cols):
                area_ha = frac[r, c] * row_cell_area_ha(transform, r + row0)
                if area_ha <= 0:
                    continue
                rows_out.append((zone.id, int(r + row0), int(c + col0),
                                 float(area_ha), int(counts[r, c]), grid_key))
                zone_ha += area_ha

            totals["cells"] += len(hit_rows)
            totals["ha"] += zone_ha
            print(f"  {zone.name:<34} {len(shapes):>5} blocks  "
                  f"{len(hit_rows):>5} cells  {zone_ha:>8.0f} ha")

        totals["blocks"] = len(distinct_blocks)
        print(f"\n{len(rows_out):,} mask rows, {totals['cells']:,} cells "
              f"(zones overlap, so cells are counted once per zone)")
        print(f"{totals['blocks']:,} distinct blocks, "
              f"{totals['ha']:,.0f} ha summed across zones (nested - not a total)")
        print(f"sub-cell misses placed at centroid: {fallbacks}; "
              f"blocks dropped outside the window: {dropped}")

        # Blocks that fall in no zone at all. Expected — the zone layer covers
        # wine regions, not the country — but it is the number that says whether
        # the zone polygons have a coverage hole, so it is reported rather than
        # left to be inferred from a total that does not add up.
        eligible = db.execute(text(
            f"SELECT count(*) FROM vineyard_blocks "
            f"WHERE geometry IS NOT NULL AND {BLOCK_FILTER}")).scalar()
        print(f"{eligible - totals['blocks']:,} of {eligible:,} reference blocks "
              f"fall outside every zone")

        if args.save_npz:
            zone_meta = {str(z.id): {"name": z.name, "slug": z.slug,
                                     "level": z.zone_level} for z in zones}
            np.savez_compressed(
                args.save_npz,
                zone_id=np.array([r[0] for r in rows_out], dtype=np.int32),
                row=np.array([r[1] for r in rows_out], dtype=np.int32),
                col=np.array([r[2] for r in rows_out], dtype=np.int32),
                planted_ha=np.array([r[3] for r in rows_out], dtype=np.float64),
                block_count=np.array([r[4] for r in rows_out], dtype=np.int32),
                grid_key=np.array(grid_key),
                zone_meta=np.array(json.dumps(zone_meta)),
            )
            print(f"saved mask to {args.save_npz}")

        if args.dry_run:
            print("\ndry run — nothing written to the database")
            return 0

        # Every value below is cast off numpy explicitly. Under numpy 2 a
        # np.float64 renders as "np.float64(80440.1)" when psycopg2 falls back
        # to repr, which reaches Postgres as a schema-qualified name and fails.
        from psycopg2.extras import execute_values
        raw = db.connection().connection
        with raw.cursor() as cur:
            cur.execute("DELETE FROM climate_zone_cell_mask")
            execute_values(cur, """
                INSERT INTO climate_zone_cell_mask
                    (zone_id, row, col, planted_ha, block_count, grid_key)
                VALUES %s
            """, rows_out, page_size=5000)

            cur.execute("DELETE FROM climate_zone_mask_run WHERE grid_key = %s",
                        (grid_key,))
            cur.execute("""
                INSERT INTO climate_zone_mask_run
                    (grid_key, width, height, resolution_m, transform, crs,
                     block_filter, block_count, planted_ha, zone_count,
                     cell_count, subcell_factor)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """, (grid_key, int(width), int(height), int(res_m),
                  json.dumps([float(v) for v in tuple(transform)[:6]]), str(crs),
                  BLOCK_FILTER, int(totals["blocks"]), float(totals["ha"]),
                  len(zones), len(rows_out), int(args.subcell)))
        db.commit()
        print("written")
        return 0
    finally:
        db.close()


def _geodesic_area_ha(geom) -> float:
    """Area in hectares for the centroid fallback, without a DB round trip."""
    # Clipping a block to a zone boundary can split it into a MultiPolygon.
    parts = getattr(geom, "geoms", [geom])
    total = 0.0
    for part in parts:
        lons, lats = part.exterior.coords.xy
        area, _ = _geod().polygon_area_perimeter(list(lons), list(lats))
        total += abs(area)
    return total / 10_000.0


if __name__ == "__main__":
    raise SystemExit(main())
