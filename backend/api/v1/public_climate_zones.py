"""
backend/api/v1/public_climate_zones.py

Public API endpoints for climate zone map layer.
- GeoJSON endpoint for rendering zone boundaries on the map
- Spatial query to find blocks within a climate zone
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import json
import logging

from db.session import get_db
from core.public_security import get_any_authenticated_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["climate-zones"])


@router.get("/geojson")
async def get_climate_zones_geojson(
    simplify: float = Query(
        0.002, ge=0, le=0.1,
        description="Geometry simplification tolerance in degrees"
    ),
    current_user=Depends(get_any_authenticated_user),
    db: Session = Depends(get_db)
):
    """
    Get all climate zones with geometry as GeoJSON FeatureCollection.
    Only returns zones that have boundary geometry populated.
    """
    try:
        if simplify > 0:
            geometry_sql = """
                ST_AsGeoJSON(
                    ST_SimplifyPreserveTopology(geometry, :tolerance)
                ) as geometry_json
            """
        else:
            geometry_sql = "ST_AsGeoJSON(geometry) as geometry_json"

        query = text(f"""
            SELECT
                cz.id,
                cz.name,
                cz.slug,
                cz.description,
                cz.region_id,
                cz.display_order,
                wr.name as region_name,
                {geometry_sql}
            FROM climate_zones cz
            LEFT JOIN wine_regions wr ON cz.region_id = wr.id
            WHERE cz.is_active = true AND cz.geometry IS NOT NULL
            ORDER BY cz.display_order
        """)

        results = db.execute(query, {"tolerance": simplify}).fetchall()

        features = []
        for row in results:
            geometry = None
            if row.geometry_json:
                try:
                    geometry = json.loads(row.geometry_json)
                except json.JSONDecodeError:
                    logger.warning(f"Invalid geometry for climate zone {row.slug}")
                    continue

            if not geometry:
                continue

            feature = {
                "type": "Feature",
                "id": row.id,
                "geometry": geometry,
                "properties": {
                    "id": row.id,
                    "name": row.name,
                    "slug": row.slug,
                    "description": row.description,
                    "region_id": row.region_id,
                    "region_name": row.region_name,
                }
            }
            features.append(feature)

        return {
            "type": "FeatureCollection",
            "features": features
        }

    except Exception as e:
        logger.error(f"Error fetching climate zones GeoJSON: {e}")
        raise HTTPException(status_code=500, detail="Failed to load climate zones")


@router.get("/{slug}/blocks")
async def get_blocks_in_climate_zone(
    slug: str,
    current_user=Depends(get_any_authenticated_user),
    db: Session = Depends(get_db)
):
    """
    Get block IDs that spatially intersect with a climate zone boundary.
    Used to highlight blocks on the map when a zone is clicked.
    """
    try:
        query = text("""
            SELECT ARRAY_AGG(vb.id) as block_ids
            FROM vineyard_blocks vb
            INNER JOIN climate_zones cz ON ST_Intersects(vb.geometry, cz.geometry)
            WHERE cz.slug = :slug
              AND cz.geometry IS NOT NULL
              AND vb.geometry IS NOT NULL
        """)

        result = db.execute(query, {"slug": slug}).fetchone()
        block_ids = result.block_ids if result and result.block_ids else []

        return {
            "zone_slug": slug,
            "block_ids": block_ids,
            "count": len(block_ids)
        }

    except Exception as e:
        logger.error(f"Error fetching blocks for zone {slug}: {e}")
        raise HTTPException(status_code=500, detail="Failed to query blocks")
