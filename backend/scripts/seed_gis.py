#!/usr/bin/env python3
"""
scripts/seed_gis.py

Seed Geographical Indications (GIs) from ESRI JSON files.

This script:
1. Reads ESRI JSON files from a specified directory
2. Converts ESRI geometry to PostGIS-compatible format
3. Extracts metadata (IP number, IPoNZ URL, etc.)
4. Links GIs to parent wine regions via spatial containment
5. Inserts into the database

Usage:
    python scripts/seed_gis.py --input-dir ./data/gis
    python scripts/seed_gis.py --input-dir ./data/gis --dry-run
    python scripts/seed_gis.py --input-file ./data/gis/kumeu.json

Expected ESRI JSON format:
{
    "features": [
        {
            "attributes": {
                "IP_Number": "1018",
                "GI_Name": "Auckland",
                "Registerlink": "https://...",
                "End_Date": null,
                "Notes": null
            },
            "geometry": {
                "rings": [[[lng, lat], ...]]
            }
        }
    ],
    "spatialReference": {"wkid": 4167}  // NZGD2000
}
"""

import os
import sys
import json
import argparse
import logging
import re
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from sqlalchemy.orm import Session
from db.session import SessionLocal
from db.models.geographical_indication import GeographicalIndication
from db.models.wine_region import WineRegion

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ============================================================================
# COORDINATE TRANSFORMATION
# ============================================================================

def transform_nzgd2000_to_wgs84(coords: List[List[float]]) -> List[List[float]]:
    """
    Transform coordinates from NZGD2000 (EPSG:4167) to WGS84 (EPSG:4326).
    
    For most practical purposes, NZGD2000 and WGS84 are nearly identical
    (difference of ~1m), so we can use the coordinates directly.
    For higher precision, use pyproj.
    """
    # NZGD2000 and WGS84 are practically identical for visualization purposes
    # The difference is typically less than 1 meter
    return coords


def esri_rings_to_geojson(rings: List[List[List[float]]], source_wkid: int = 4167) -> dict:
    """
    Convert ESRI polygon rings to GeoJSON Polygon/MultiPolygon.
    
    ESRI rings:
    - First ring is exterior (clockwise)
    - Subsequent rings are holes (counter-clockwise)
    
    GeoJSON:
    - Exterior ring is counter-clockwise
    - Holes are clockwise
    """
    if not rings or len(rings) == 0:
        return None
    
    # Transform coordinates if needed
    transformed_rings = []
    for ring in rings:
        transformed_ring = transform_nzgd2000_to_wgs84(ring)
        transformed_rings.append(transformed_ring)
    
    # For simplicity, treat as a single Polygon
    # If there are multiple exterior rings, we'd need more complex logic
    if len(transformed_rings) == 1:
        return {
            "type": "Polygon",
            "coordinates": transformed_rings
        }
    else:
        # Multiple rings - first is exterior, rest are holes
        return {
            "type": "Polygon",
            "coordinates": transformed_rings
        }


def ensure_multipolygon(geometry: dict) -> dict:
    """
    Ensure geometry is a MultiPolygon for database storage.
    """
    if geometry is None:
        return None
    
    if geometry["type"] == "Polygon":
        return {
            "type": "MultiPolygon",
            "coordinates": [geometry["coordinates"]]
        }
    elif geometry["type"] == "MultiPolygon":
        return geometry
    else:
        logger.warning(f"Unexpected geometry type: {geometry['type']}")
        return None


def calculate_bounds(geometry: dict) -> dict:
    """
    Calculate bounding box from GeoJSON geometry.
    """
    if geometry is None:
        return None
    
    from shapely.geometry import shape
    
    try:
        geom = shape(geometry)
        bounds = geom.bounds  # (minx, miny, maxx, maxy)
        
        return {
            "min_lng": bounds[0],
            "min_lat": bounds[1],
            "max_lng": bounds[2],
            "max_lat": bounds[3]
        }
    except Exception as e:
        logger.error(f"Error calculating bounds: {e}")
        return None


# ============================================================================
# ESRI JSON PARSING
# ============================================================================

def parse_esri_json(file_path: str) -> List[Dict[str, Any]]:
    """
    Parse an ESRI JSON file and extract GI features.
    
    Returns list of parsed GI records.
    """
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    gis = []
    source_wkid = data.get("spatialReference", {}).get("wkid", 4167)
    
    for feature in data.get("features", []):
        attrs = feature.get("attributes", {})
        geom = feature.get("geometry", {})
        
        # Extract attributes
        gi_name = attrs.get("GI_Name", "").strip()
        ip_number = attrs.get("IP_Number", "").strip()
        register_link = attrs.get("Registerlink", "").strip()
        end_date = attrs.get("End_Date")
        notes = attrs.get("Notes")
        
        if not gi_name:
            logger.warning(f"Skipping feature with no GI_Name in {file_path}")
            continue
        
        # Generate slug
        slug = generate_slug(gi_name)
        
        # Parse geometry
        rings = geom.get("rings", [])
        geometry = None
        if rings:
            geometry = esri_rings_to_geojson(rings, source_wkid)
            geometry = ensure_multipolygon(geometry)
        
        # Parse end date (renewal date)
        renewal_date = None
        if end_date:
            try:
                # ESRI dates are often in milliseconds since epoch
                if isinstance(end_date, (int, float)):
                    renewal_date = datetime.fromtimestamp(end_date / 1000).date()
                elif isinstance(end_date, str):
                    renewal_date = datetime.fromisoformat(end_date.replace('Z', '+00:00')).date()
            except Exception as e:
                logger.warning(f"Could not parse end_date '{end_date}': {e}")
        
        # Build IPoNZ URL if not provided
        if not register_link:
            register_link = f"https://www.iponz.govt.nz/about-ip/geographical-indications/register/{slug}"
        
        gis.append({
            "name": gi_name,
            "slug": slug,
            "ip_number": ip_number,
            "iponz_url": register_link,
            "renewal_date": renewal_date,
            "notes": notes,
            "geometry": geometry,
            "bounds": calculate_bounds(geometry) if geometry else None,
            "source_file": os.path.basename(file_path)
        })
    
    return gis


def generate_slug(name: str) -> str:
    """
    Generate URL-friendly slug from GI name.
    """
    slug = name.lower()
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    slug = slug.strip('-')
    return slug


# ============================================================================
# REGION LINKING
# ============================================================================

def find_parent_region(db: Session, geometry: dict) -> Optional[int]:
    """
    Find the parent wine region that contains this GI geometry.
    Uses PostGIS ST_Contains for spatial matching.
    """
    if geometry is None:
        return None
    
    try:
        from shapely.geometry import shape
        
        geom = shape(geometry)
        centroid = geom.centroid
        
        # Query for region containing this centroid
        query = text("""
            SELECT id, name 
            FROM wine_regions 
            WHERE ST_Contains(geometry, ST_SetSRID(ST_Point(:lng, :lat), 4326))
            LIMIT 1
        """)
        
        result = db.execute(query, {"lng": centroid.x, "lat": centroid.y}).fetchone()
        
        if result:
            logger.info(f"  Found parent region: {result.name}")
            return result.id
        else:
            logger.info(f"  No parent region found for centroid ({centroid.x:.4f}, {centroid.y:.4f})")
            return None
            
    except Exception as e:
        logger.error(f"Error finding parent region: {e}")
        return None


# ============================================================================
# SEEDING FUNCTION
# ============================================================================

def seed_gis_from_file(db: Session, file_path: str, dry_run: bool = False) -> int:
    """
    Seed GIs from a single ESRI JSON file.
    Returns count of inserted records.
    """
    logger.info(f"Processing file: {file_path}")
    
    try:
        gis = parse_esri_json(file_path)
    except Exception as e:
        logger.error(f"Error parsing {file_path}: {e}")
        return 0
    
    inserted = 0
    
    for gi_data in gis:
        slug = gi_data["slug"]
        
        # Check if already exists
        existing = db.query(GeographicalIndication).filter(
            GeographicalIndication.slug == slug
        ).first()
        
        if existing:
            logger.info(f"  GI '{slug}' already exists, skipping...")
            continue
        
        # Find parent region
        region_id = find_parent_region(db, gi_data["geometry"])
        
        if dry_run:
            logger.info(f"  [DRY RUN] Would insert GI: {gi_data['name']} (IP: {gi_data['ip_number']})")
            continue
        
        # Create GI record
        gi = GeographicalIndication(
            name=gi_data["name"],
            slug=slug,
            ip_number=gi_data["ip_number"],
            iponz_url=gi_data["iponz_url"],
            status="Registered",
            renewal_date=gi_data["renewal_date"],
            notes=gi_data["notes"],
            region_id=region_id,
            bounds=gi_data["bounds"],
            color="#8b5cf6",
            is_active=True
        )
        
        # Add geometry
        if gi_data["geometry"]:
            from shapely.geometry import shape
            from geoalchemy2.shape import from_shape
            
            geom_shape = shape(gi_data["geometry"])
            gi.geometry = from_shape(geom_shape, srid=4326)
        
        db.add(gi)
        inserted += 1
        logger.info(f"  ✅ Inserted GI: {gi_data['name']}")
    
    return inserted


def seed_gis(input_dir: str = None, input_file: str = None, dry_run: bool = False):
    """
    Seed GIs from ESRI JSON files.
    
    Args:
        input_dir: Directory containing ESRI JSON files
        input_file: Single ESRI JSON file to process
        dry_run: If True, preview without inserting
    """
    db = SessionLocal()
    
    try:
        logger.info("Starting GI seeding...")
        total_inserted = 0
        
        if input_file:
            # Process single file
            total_inserted = seed_gis_from_file(db, input_file, dry_run)
        
        elif input_dir:
            # Process all JSON files in directory
            dir_path = Path(input_dir)
            
            if not dir_path.exists():
                logger.error(f"Directory not found: {input_dir}")
                return
            
            json_files = list(dir_path.glob("*.json"))
            
            if not json_files:
                logger.warning(f"No JSON files found in {input_dir}")
                return
            
            logger.info(f"Found {len(json_files)} JSON files to process")
            
            for json_file in sorted(json_files):
                inserted = seed_gis_from_file(db, str(json_file), dry_run)
                total_inserted += inserted
        
        else:
            logger.error("Must specify either --input-dir or --input-file")
            return
        
        if not dry_run:
            db.commit()
        
        logger.info(f"✅ GI seeding complete! Inserted {total_inserted} records.")
        
    except Exception as e:
        logger.error(f"Error seeding GIs: {e}")
        db.rollback()
        raise
    finally:
        db.close()


# ============================================================================
# MAIN
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description="Seed GIs from ESRI JSON files")
    parser.add_argument("--input-dir", help="Directory containing ESRI JSON files")
    parser.add_argument("--input-file", help="Single ESRI JSON file to process")
    parser.add_argument("--dry-run", action="store_true", help="Preview without inserting")
    
    args = parser.parse_args()
    
    if not args.input_dir and not args.input_file:
        parser.error("Must specify either --input-dir or --input-file")
    
    seed_gis(
        input_dir=args.input_dir,
        input_file=args.input_file,
        dry_run=args.dry_run
    )


if __name__ == "__main__":
    main()