"""
backend/api/v1/regions.py

Public API endpoints for wine regions.
Requires public authentication.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from geoalchemy2.shape import to_shape
from shapely.geometry import mapping
import logging

from db.session import get_db
from db.models.wine_region import WineRegion
from api.v1.public_auth import get_current_public_user, PublicUser

logger = logging.getLogger(__name__)

router = APIRouter(tags=["regions"])


# ============================================================================
# SCHEMAS (Pydantic response models)
# ============================================================================

from pydantic import BaseModel
from typing import Any, Dict
from datetime import datetime


class RegionListItem(BaseModel):
    id: int
    name: str
    slug: str
    summary: Optional[str] = None
    total_planted_ha: Optional[float] = None
    bounds: Optional[Dict[str, float]] = None
    color: Optional[str] = None
    display_order: int
    
    class Config:
        from_attributes = True


class RegionDetail(BaseModel):
    id: int
    name: str
    slug: str
    summary: Optional[str] = None
    description: Optional[str] = None
    climate_summary: Optional[str] = None
    stats: Optional[Dict[str, Any]] = None
    bounds: Optional[Dict[str, float]] = None
    color: Optional[str] = None
    display_order: int
    created_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.get("", response_model=List[RegionListItem])
async def list_regions(
    current_user: PublicUser = Depends(get_current_public_user),
    db: Session = Depends(get_db)
):
    """
    Get list of all wine regions for sidebar/navigation.
    Returns basic info with bounds for fly-to functionality.
    """
    try:
        regions = db.query(WineRegion).filter(
            WineRegion.is_active == True
        ).order_by(WineRegion.display_order).all()
        
        result = []
        for region in regions:
            # Extract total_planted_ha from stats JSON
            total_ha = None
            if region.stats and isinstance(region.stats, dict):
                total_ha = region.stats.get('total_planted_ha')
            
            result.append(RegionListItem(
                id=region.id,
                name=region.name,
                slug=region.slug,
                summary=region.summary,
                total_planted_ha=total_ha,
                bounds=region.bounds,
                color=region.color,
                display_order=region.display_order
            ))
        
        return result
        
    except Exception as e:
        logger.error(f"Error listing regions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error fetching regions"
        )


@router.get("/geojson")
async def get_regions_geojson(
    current_user: PublicUser = Depends(get_current_public_user),
    db: Session = Depends(get_db)
):
    """
    Get all wine regions as GeoJSON FeatureCollection for map layer.
    """
    try:
        regions = db.query(WineRegion).filter(
            WineRegion.is_active == True,
            WineRegion.geometry.isnot(None)
        ).order_by(WineRegion.display_order).all()
        
        features = []
        for region in regions:
            try:
                # Convert PostGIS geometry to GeoJSON
                shape = to_shape(region.geometry)
                geometry = mapping(shape)
                
                # Extract stats for properties
                total_ha = None
                top_variety = None
                if region.stats and isinstance(region.stats, dict):
                    total_ha = region.stats.get('total_planted_ha')
                    varieties = region.stats.get('varieties', [])
                    if varieties and len(varieties) > 0:
                        top_variety = varieties[0].get('name')
                
                feature = {
                    "type": "Feature",
                    "id": region.id,
                    "geometry": geometry,
                    "properties": {
                        "id": region.id,
                        "name": region.name,
                        "slug": region.slug,
                        "summary": region.summary,
                        "total_planted_ha": total_ha,
                        "top_variety": top_variety,
                        "color": region.color or "#3b82f6",
                        "display_order": region.display_order
                    }
                }
                features.append(feature)
                
            except Exception as e:
                logger.warning(f"Error converting geometry for region {region.slug}: {e}")
                continue
        
        return {
            "type": "FeatureCollection",
            "features": features
        }
        
    except Exception as e:
        logger.error(f"Error fetching regions GeoJSON: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error fetching regions GeoJSON"
        )


@router.get("/{slug}", response_model=RegionDetail)
async def get_region_detail(
    slug: str,
    current_user: PublicUser = Depends(get_current_public_user),
    db: Session = Depends(get_db)
):
    """
    Get detailed information for a single wine region.
    Includes full stats with variety breakdown.
    """
    try:
        region = db.query(WineRegion).filter(
            WineRegion.slug == slug,
            WineRegion.is_active == True
        ).first()
        
        if not region:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Region '{slug}' not found"
            )
        
        return RegionDetail(
            id=region.id,
            name=region.name,
            slug=region.slug,
            summary=region.summary,
            description=region.description,
            climate_summary=region.climate_summary,
            stats=region.stats,
            bounds=region.bounds,
            color=region.color,
            display_order=region.display_order,
            created_at=region.created_at
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching region {slug}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error fetching region details"
        )


@router.get("/{slug}/bounds")
async def get_region_bounds(
    slug: str,
    current_user: PublicUser = Depends(get_current_public_user),
    db: Session = Depends(get_db)
):
    """
    Get bounding box for a region (for map fly-to).
    Returns: {min_lng, min_lat, max_lng, max_lat}
    """
    try:
        region = db.query(WineRegion).filter(
            WineRegion.slug == slug,
            WineRegion.is_active == True
        ).first()
        
        if not region:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Region '{slug}' not found"
            )
        
        if not region.bounds:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Bounds not available for region '{slug}'"
            )
        
        return region.bounds
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching bounds for {slug}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error fetching region bounds"
        )