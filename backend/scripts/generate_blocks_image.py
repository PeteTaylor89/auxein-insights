"""
scripts/generate_blocks_image.py

Generate static PNG image overlay of all NZ vineyard blocks.
This image is served to users instead of raw GeoJSON to prevent geometry scraping.

Usage:
    python scripts/generate_blocks_image.py --output blocks-overlay.png
    python scripts/generate_blocks_image.py --varieties  # Generate per-variety images

Requirements:
    pip install mapbox pillow requests geopandas matplotlib
"""

import os
import sys
import argparse
import logging
from pathlib import Path
from datetime import datetime
import json

import requests
from PIL import Image
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.collections import PatchCollection
import geopandas as gpd
from shapely.geometry import shape
import numpy as np

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import create_engine, text
from core.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ============================================================================
# CONFIGURATION
# ============================================================================

# New Zealand bounding box
NZ_BOUNDS = {
    'min_lng': 166.0,
    'max_lng': 179.0,
    'min_lat': -47.5,
    'max_lat': -34.0
}

# Image dimensions (higher = better quality, but larger file)
IMAGE_WIDTH = 4096
IMAGE_HEIGHT = int(IMAGE_WIDTH * (NZ_BOUNDS['max_lat'] - NZ_BOUNDS['min_lat']) / 
                                  (NZ_BOUNDS['max_lng'] - NZ_BOUNDS['min_lng']))

# Variety color mapping (use recognizable wine colors)
VARIETY_COLORS = {
    'pinot noir': '#8B0000',        # Dark red
    'chardonnay': '#FFD700',        # Gold
    'sauvignon blanc': '#90EE90',   # Light green
    'pinot gris': '#DDA0DD',        # Plum
    'riesling': '#F0E68C',          # Khaki
    'merlot': '#800020',            # Burgundy
    'syrah': '#4B0082',             # Indigo
    'cabernet sauvignon': '#2F4F4F', # Dark slate
    'other': '#22c55e'              # Auxein green
}

# Default style
DEFAULT_COLOR = '#22c55e'      # Auxein brand green
DEFAULT_ALPHA = 0.6
OUTLINE_COLOR = '#065f46'      # Dark green
OUTLINE_WIDTH = 0.5


# ============================================================================
# DATABASE CONNECTION
# ============================================================================

def get_blocks_geojson(engine, variety_filter=None):
    """
    Fetch all vineyard blocks as GeoJSON.
    
    Args:
        engine: SQLAlchemy engine
        variety_filter: Optional variety name to filter (e.g., 'pinot noir')
    
    Returns:
        GeoJSON FeatureCollection dict
    """
    logger.info(f"Fetching blocks from database{f' (variety: {variety_filter})' if variety_filter else ''}...")
    
    query = """
        SELECT 
            id,
            block_name,
            variety,
            area,
            region,
            ST_AsGeoJSON(ST_Transform(geometry, 4326)) as geojson
        FROM vineyard_blocks
        WHERE 
            geometry IS NOT NULL
            AND ST_IsValid(geometry)
    """
    
    if variety_filter:
        query += f" AND LOWER(variety) = :variety"
    
    with engine.connect() as conn:
        if variety_filter:
            result = conn.execute(text(query), {"variety": variety_filter.lower()})
        else:
            result = conn.execute(text(query))
        
        features = []
        for row in result:
            geom = json.loads(row.geojson)
            features.append({
                'type': 'Feature',
                'geometry': geom,
                'properties': {
                    'id': row.id,
                    'block_name': row.block_name,
                    'variety': row.variety,
                    'area': row.area,
                    'region': row.region
                }
            })
        
        logger.info(f"Fetched {len(features)} blocks")
        
        return {
            'type': 'FeatureCollection',
            'features': features
        }


# ============================================================================
# IMAGE GENERATION
# ============================================================================

def generate_image_matplotlib(geojson_data, output_path, variety_colors=False):
    """
    Generate PNG image using matplotlib.
    
    Args:
        geojson_data: GeoJSON FeatureCollection
        output_path: Output file path
        variety_colors: If True, color blocks by variety
    """
    logger.info(f"Generating image: {output_path}")
    
    # Convert to GeoDataFrame
    gdf = gpd.GeoDataFrame.from_features(geojson_data['features'])
    gdf = gdf.set_crs('EPSG:4326')
    
    if gdf.empty:
        logger.warning("No blocks to render!")
        return
    
    # Create figure with exact bounds
    fig, ax = plt.subplots(1, 1, figsize=(IMAGE_WIDTH/300, IMAGE_HEIGHT/300), dpi=300)
    ax.set_xlim(NZ_BOUNDS['min_lng'], NZ_BOUNDS['max_lng'])
    ax.set_ylim(NZ_BOUNDS['min_lat'], NZ_BOUNDS['max_lat'])
    ax.set_aspect('equal')
    
    # Remove axes
    ax.axis('off')
    
    # Set transparent background
    fig.patch.set_alpha(0)
    ax.patch.set_alpha(0)
    
    if variety_colors:
        # Color by variety
        for variety, color in VARIETY_COLORS.items():
            variety_blocks = gdf[gdf['variety'].str.lower() == variety]
            if not variety_blocks.empty:
                variety_blocks.plot(
                    ax=ax,
                    color=color,
                    alpha=DEFAULT_ALPHA,
                    edgecolor=OUTLINE_COLOR,
                    linewidth=OUTLINE_WIDTH
                )
                logger.info(f"  Rendered {len(variety_blocks)} {variety} blocks")
        
        # Other varieties
        other_blocks = gdf[~gdf['variety'].str.lower().isin(VARIETY_COLORS.keys())]
        if not other_blocks.empty:
            other_blocks.plot(
                ax=ax,
                color=VARIETY_COLORS['other'],
                alpha=DEFAULT_ALPHA,
                edgecolor=OUTLINE_COLOR,
                linewidth=OUTLINE_WIDTH
            )
            logger.info(f"  Rendered {len(other_blocks)} other variety blocks")
    else:
        # Single color for all blocks
        gdf.plot(
            ax=ax,
            color=DEFAULT_COLOR,
            alpha=DEFAULT_ALPHA,
            edgecolor=OUTLINE_COLOR,
            linewidth=OUTLINE_WIDTH
        )
        logger.info(f"  Rendered {len(gdf)} blocks")
    
    # Save with transparency
    plt.tight_layout(pad=0)
    plt.savefig(
        output_path,
        format='png',
        dpi=300,
        transparent=True,
        bbox_inches='tight',
        pad_inches=0
    )
    plt.close()
    
    logger.info(f"✅ Image saved: {output_path}")
    
    # Report file size
    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    logger.info(f"   File size: {size_mb:.2f} MB")


def generate_variety_images(engine, output_dir):
    """
    Generate separate images for each variety.
    
    Args:
        engine: SQLAlchemy engine
        output_dir: Output directory for images
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    logger.info("Generating per-variety images...")
    
    for variety, color in VARIETY_COLORS.items():
        if variety == 'other':
            continue
        
        geojson = get_blocks_geojson(engine, variety_filter=variety)
        
        if geojson['features']:
            output_path = output_dir / f"blocks-{variety.replace(' ', '-')}.png"
            generate_image_matplotlib(geojson, output_path, variety_colors=False)
        else:
            logger.warning(f"No blocks found for variety: {variety}")
    
    logger.info(f"✅ All variety images generated in: {output_dir}")


# ============================================================================
# METADATA GENERATION
# ============================================================================

def generate_metadata(geojson_data, output_path):
    """
    Generate metadata JSON file with image info.
    
    Args:
        geojson_data: GeoJSON FeatureCollection
        output_path: Output JSON path
    """
    metadata = {
        'generated_at': datetime.now().isoformat(),
        'total_blocks': len(geojson_data['features']),
        'bounds': NZ_BOUNDS,
        'image_dimensions': {
            'width': IMAGE_WIDTH,
            'height': IMAGE_HEIGHT
        },
        'coordinates': [
            [NZ_BOUNDS['min_lng'], NZ_BOUNDS['max_lat']],  # NW
            [NZ_BOUNDS['max_lng'], NZ_BOUNDS['max_lat']],  # NE
            [NZ_BOUNDS['max_lng'], NZ_BOUNDS['min_lat']],  # SE
            [NZ_BOUNDS['min_lng'], NZ_BOUNDS['min_lat']]   # SW
        ]
    }
    
    with open(output_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    logger.info(f"✅ Metadata saved: {output_path}")


# ============================================================================
# MAIN
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description='Generate static PNG overlay of NZ vineyard blocks'
    )
    parser.add_argument(
        '--output',
        default='blocks-overlay.png',
        help='Output PNG file path (default: blocks-overlay.png)'
    )
    parser.add_argument(
        '--varieties',
        action='store_true',
        help='Generate separate images for each variety'
    )
    parser.add_argument(
        '--variety-colors',
        action='store_true',
        help='Use variety-based colors in single image'
    )
    parser.add_argument(
        '--output-dir',
        default='output',
        help='Output directory for variety images (default: output/)'
    )
    
    args = parser.parse_args()
    
    # Create database engine
    logger.info(f"Connecting to database: {settings.DATABASE_URL.split('@')[1]}")
    engine = create_engine(settings.DATABASE_URL)
    
    try:
        if args.varieties:
            # Generate per-variety images
            generate_variety_images(engine, args.output_dir)
        else:
            # Generate single image
            geojson = get_blocks_geojson(engine)
            generate_image_matplotlib(geojson, args.output, variety_colors=args.variety_colors)
            
            # Generate metadata
            metadata_path = args.output.replace('.png', '-metadata.json')
            generate_metadata(geojson, metadata_path)
        
        logger.info("✅ Image generation complete!")
        logger.info("\nNext steps:")
        logger.info("1. Upload image(s) to CDN (S3/CloudFront)")
        logger.info("2. Update frontend to use image overlay")
        logger.info("3. Test click queries against live data")
        
    except Exception as e:
        logger.error(f"❌ Error generating image: {str(e)}")
        raise
    finally:
        engine.dispose()


if __name__ == '__main__':
    main()