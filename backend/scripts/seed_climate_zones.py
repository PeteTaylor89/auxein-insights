#!/usr/bin/env python3
"""
scripts/seed_climate_zones.py

Seed the 20 climate zones with FK links to wine_regions.

Usage:
    python scripts/seed_climate_zones.py
    python scripts/seed_climate_zones.py --dry-run
    python scripts/seed_climate_zones.py --update  # Update existing zones
"""

import argparse
import logging
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from db.session import SessionLocal
from db.models.wine_region import WineRegion
from db.models.climate import ClimateZone

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ============================================================================
# CLIMATE ZONE DEFINITIONS
# ============================================================================
# Note: 'name' must match CSV filename exactly (e.g., "Auckland" -> "Auckland.csv")
#
# 20 zones total matching these CSV files:
#   Auckland, Awatere, Bannockburn, Bendigo, Central Otago, Gibbston,
#   Gimblett Bridge Pa, Gisborne, Gladstone, Hawkes Bay, Lower Wairau,
#   Martinborough, Nelson, Ngaruroro, North Canterbury, Northland,
#   Upper Wairau and Southern Valleys, Waiheke, Waipara, Waitaki

CLIMATE_ZONES = [
    # Auckland Region
    {
        "name": "Auckland",
        "slug": "auckland",
        "region_slug": "auckland",
        "description": "Auckland's wine climate zone encompasses West Auckland, including Kumeu and Henderson, known for producing excellent Chardonnay and aromatic varieties in a warm maritime climate.",
        "display_order": 1,
    },
    {
        "name": "Waiheke",
        "slug": "waiheke",
        "region_slug": "auckland",
        "description": "Waiheke Island enjoys a unique microclimate with lower rainfall and higher temperatures than mainland Auckland, ideal for Bordeaux-style reds and Syrah.",
        "display_order": 2,
    },
    
    # Northland
    {
        "name": "Northland",
        "slug": "northland",
        "region_slug": "northland",
        "description": "New Zealand's warmest wine region with subtropical influences. Suited to full-bodied reds and tropical-style whites.",
        "display_order": 3,
    },
    
    # Gisborne
    {
        "name": "Gisborne",
        "slug": "gisborne",
        "region_slug": "gisborne",
        "description": "The 'Chardonnay Capital of New Zealand' with fertile alluvial soils and a warm, sunny climate producing generous fruit-forward wines.",
        "display_order": 4,
    },
    
    # Hawke's Bay
    {
        "name": "Hawkes Bay",
        "slug": "hawkes-bay",
        "region_slug": "hawkes-bay",
        "description": "New Zealand's second-largest wine region with diverse terroirs from coastal to inland. Renowned for premium red blends and Chardonnay.",
        "display_order": 5,
    },
    {
        "name": "Gimblett Bridge Pa",
        "slug": "gimblett-bridge-pa",
        "region_slug": "hawkes-bay",
        "description": "A unique 800-hectare gravel bed with exceptional heat retention and drainage. New Zealand's premier site for Bordeaux varieties and Syrah.",
        "display_order": 6,
    },
    {
        "name": "Ngaruroro",
        "slug": "ngaruroro",
        "region_slug": "hawkes-bay",
        "description": "The Ngaruroro River valley provides diverse growing conditions with gravelly soils producing concentrated, structured wines.",
        "display_order": 7,
    },
    
    # Wairarapa
    {
        "name": "Gladstone",
        "slug": "gladstone",
        "region_slug": "wairarapa",
        "description": "A small sub-region north of Martinborough with slightly warmer conditions and free-draining river terraces suited to Pinot Noir and aromatics.",
        "display_order": 8,
    },
    {
        "name": "Martinborough",
        "slug": "martinborough",
        "region_slug": "wairarapa",
        "description": "Renowned for world-class Pinot Noir, Martinborough's dry, cool climate and free-draining gravelly soils produce elegant, Burgundian-style wines.",
        "display_order": 9,
    },
    
    # Nelson
    {
        "name": "Nelson",
        "slug": "nelson",
        "region_slug": "nelson",
        "description": "A boutique wine region with diverse microclimates producing outstanding Pinot Noir, Chardonnay, Sauvignon Blanc and aromatic varieties.",
        "display_order": 10,
    },
    
    # Marlborough
    {
        "name": "Lower Wairau",
        "slug": "lower-wairau",
        "region_slug": "marlborough",
        "description": "The heart of Marlborough's Sauvignon Blanc production with deep alluvial soils on the Wairau Plains. Produces vibrant, aromatic wines.",
        "display_order": 11,
    },
    {
        "name": "Awatere",
        "slug": "awatere",
        "region_slug": "marlborough",
        "description": "South of the Wairau Valley with a cooler, drier climate and stonier soils. Produces more mineral-driven, structured wines with intense aromatics.",
        "display_order": 12,
    },
    {
        "name": "Upper Wairau and Southern Valleys",
        "slug": "upper-wairau-southern-valleys",
        "region_slug": "marlborough",
        "description": "Higher elevation sites in the upper Wairau and southern valleys with cooler temperatures, producing wines with enhanced acidity and complexity.",
        "display_order": 13,
    },
    
    # North Canterbury
    {
        "name": "North Canterbury",
        "slug": "north-canterbury",
        "region_slug": "north-canterbury",
        "description": "A diverse region with limestone-rich soils and continental climate influences producing distinctive cool-climate wines.",
        "display_order": 14,
    },
    {
        "name": "Waipara",
        "slug": "waipara",
        "region_slug": "north-canterbury",
        "description": "Protected by hills from coastal winds, Waipara Valley has warm days and cool nights ideal for Pinot Noir, Riesling and Chardonnay.",
        "display_order": 15,
    },
    
    # Waitaki
    {
        "name": "Waitaki",
        "slug": "waitaki",
        "region_slug": "waitaki-valley",
        "description": "An emerging region with unique limestone soils and a cool, dry climate producing distinctive Pinot Noir and aromatic whites.",
        "display_order": 16,
    },
    
    # Central Otago
    {
        "name": "Central Otago",
        "slug": "central-otago",
        "region_slug": "central-otago",
        "description": "The world's southernmost wine region with a continental climate. Known for exceptional Pinot Noir with intense colour and concentrated fruit.",
        "display_order": 17,
    },
    {
        "name": "Bannockburn",
        "slug": "bannockburn",
        "region_slug": "central-otago",
        "description": "One of Central Otago's warmest sub-regions with schist soils and north-facing slopes producing powerful, concentrated Pinot Noir.",
        "display_order": 18,
    },
    {
        "name": "Bendigo",
        "slug": "bendigo",
        "region_slug": "central-otago",
        "description": "A warm, dry sub-region near Cromwell with excellent sun exposure and schist soils producing rich, structured Pinot Noir.",
        "display_order": 19,
    },
    {
        "name": "Gibbston",
        "slug": "gibbston",
        "region_slug": "central-otago",
        "description": "The highest and coolest of Central Otago's sub-regions, Gibbston Valley produces elegant, refined Pinot Noir with bright acidity.",
        "display_order": 20,
    },
]


def seed_climate_zones(dry_run: bool = False, update: bool = False):
    """
    Seed climate zones into the database.
    
    Args:
        dry_run: If True, preview changes without inserting
        update: If True, update existing zones
    """
    db = SessionLocal()
    
    try:
        logger.info("Starting climate zones seeding...")
        logger.info(f"Total zones to process: {len(CLIMATE_ZONES)}")
        if update:
            logger.info("UPDATE mode: Will update existing zones")
        
        # Build region slug -> id mapping
        regions = db.query(WineRegion).all()
        region_map = {r.slug: r.id for r in regions}
        logger.info(f"Found {len(region_map)} wine regions")
        
        inserted = 0
        updated = 0
        skipped = 0
        
        for zone_data in CLIMATE_ZONES:
            slug = zone_data["slug"]
            region_slug = zone_data["region_slug"]
            
            # Get region ID
            region_id = region_map.get(region_slug)
            if not region_id:
                logger.warning(f"  Region '{region_slug}' not found for zone '{zone_data['name']}' - will insert without region FK")
            
            # Check if zone already exists
            existing = db.query(ClimateZone).filter(ClimateZone.slug == slug).first()
            
            if existing and not update:
                logger.info(f"  Zone '{slug}' already exists, skipping (use --update to modify)")
                skipped += 1
                continue
            
            if dry_run:
                if existing:
                    logger.info(f"  [DRY RUN] Would update zone: {zone_data['name']}")
                else:
                    logger.info(f"  [DRY RUN] Would insert zone: {zone_data['name']} (region: {region_slug})")
                continue
            
            if existing and update:
                # Update existing zone
                existing.name = zone_data["name"]
                existing.region_id = region_id
                existing.description = zone_data["description"]
                existing.display_order = zone_data["display_order"]
                db.commit()
                logger.info(f"  ✅ Updated zone: {zone_data['name']}")
                updated += 1
            else:
                # Create new zone
                zone = ClimateZone(
                    name=zone_data["name"],
                    slug=slug,
                    region_id=region_id,
                    description=zone_data["description"],
                    display_order=zone_data["display_order"],
                    is_active=True,
                )
                db.add(zone)
                db.commit()
                logger.info(f"  ✅ Inserted zone: {zone_data['name']} (region_id: {region_id})")
                inserted += 1
        
        logger.info(f"\n✅ Climate zones seeding complete!")
        logger.info(f"   Inserted: {inserted}, Updated: {updated}, Skipped: {skipped}")
        
    except Exception as e:
        logger.error(f"Error seeding climate zones: {e}")
        db.rollback()
        raise
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Seed climate zones data")
    parser.add_argument("--dry-run", action="store_true", help="Preview without inserting")
    parser.add_argument("--update", action="store_true", help="Update existing zones")
    args = parser.parse_args()
    
    seed_climate_zones(dry_run=args.dry_run, update=args.update)


if __name__ == "__main__":
    main()