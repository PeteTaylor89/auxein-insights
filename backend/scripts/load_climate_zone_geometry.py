#!/usr/bin/env python3
"""
scripts/load_climate_zone_geometry.py

Load shapefile geometry into the climate_zones table.

Expects one .shp file per zone in backend/data/Climate_Zones/,
named to match the zone's `name` column (e.g., Bendigo.shp → "Bendigo").

If a shapefile contains multiple features they are unioned into a single
MULTIPOLYGON. All input is reprojected to EPSG:4326 if needed.

Usage:
    python scripts/load_climate_zone_geometry.py
    python scripts/load_climate_zone_geometry.py --dry-run
    python scripts/load_climate_zone_geometry.py --zone Bendigo
"""

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pyogrio
from shapely import wkb
from shapely.ops import unary_union
from shapely.geometry import MultiPolygon
from geoalchemy2.shape import from_shape
from sqlalchemy import text

from db.session import SessionLocal
from db.models.climate import ClimateZone

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / "data" / "Climate_Zones"


def load_shapefile(shp_path):
    """Read a shapefile and return a single MULTIPOLYGON in EPSG:4326."""
    gdf = pyogrio.read_dataframe(str(shp_path))

    # Reproject to WGS84 if needed
    if gdf.crs and gdf.crs.to_epsg() != 4326:
        logger.info(f"  Reprojecting from {gdf.crs} → EPSG:4326")
        gdf = gdf.to_crs(epsg=4326)

    # Union all features into one geometry
    geom = unary_union(gdf.geometry.values)

    # Ensure MULTIPOLYGON
    if geom.geom_type == "Polygon":
        geom = MultiPolygon([geom])
    elif geom.geom_type != "MultiPolygon":
        raise ValueError(f"Unexpected geometry type: {geom.geom_type}")

    return geom


def main():
    parser = argparse.ArgumentParser(description="Load climate zone shapefiles into PostGIS")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be done without writing")
    parser.add_argument("--zone", type=str, help="Only load a specific zone (by name, e.g. 'Bendigo')")
    args = parser.parse_args()

    shapefiles = sorted(DATA_DIR.glob("*.shp"))
    if not shapefiles:
        logger.error(f"No .shp files found in {DATA_DIR}")
        sys.exit(1)

    if args.zone:
        shapefiles = [s for s in shapefiles if s.stem == args.zone]
        if not shapefiles:
            logger.error(f"No shapefile found for zone '{args.zone}' in {DATA_DIR}")
            sys.exit(1)

    logger.info(f"Found {len(shapefiles)} shapefile(s) in {DATA_DIR}")

    db = SessionLocal()
    updated = 0
    skipped = 0
    missing = 0

    try:
        for shp_path in shapefiles:
            zone_name = shp_path.stem  # e.g. "Bendigo"
            logger.info(f"Processing: {zone_name}")

            # Find matching zone by name
            zone = db.query(ClimateZone).filter(ClimateZone.name == zone_name).first()
            if not zone:
                logger.warning(f"  No climate_zone row with name='{zone_name}' — skipping")
                missing += 1
                continue

            try:
                geom = load_shapefile(shp_path)
            except Exception as e:
                logger.error(f"  Failed to read shapefile: {e}")
                skipped += 1
                continue

            n_parts = len(geom.geoms)
            area_deg = geom.area
            logger.info(f"  Zone: {zone.name} (slug={zone.slug}, id={zone.id})")
            logger.info(f"  Geometry: MULTIPOLYGON with {n_parts} part(s), area ~{area_deg:.6f} deg²")

            if args.dry_run:
                logger.info("  [DRY RUN] Would update geometry")
            else:
                zone.geometry = from_shape(geom, srid=4326)
                db.flush()
                logger.info("  ✓ Geometry updated")

            updated += 1

        if not args.dry_run:
            db.commit()
            logger.info(f"\nCommitted. Updated: {updated}, Skipped: {skipped}, No DB match: {missing}")
        else:
            logger.info(f"\n[DRY RUN] Would update: {updated}, Skipped: {skipped}, No DB match: {missing}")

    except Exception as e:
        db.rollback()
        logger.error(f"Transaction failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
