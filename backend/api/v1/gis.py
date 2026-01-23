"""
backend/api/v1/gis.py

Public API endpoints for Geographical Indications (GIs).
Requires public authentication.

UPDATED: Uses ST_SimplifyPreserveTopology for GeoJSON endpoint to reduce
payload size and prevent worker timeouts on complex GI boundaries.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, text
import json
import logging

from db.session import get_db
from db.models.geographical_indication import GeographicalIndication
from db.models.wine_region import WineRegion
from api.v1.public_auth import get_current_public_user, PublicUser

logger = logging.getLogger(__name__)

router = APIRouter(tags=["geographical-indications"])


# ============================================================================
# SCHEMAS (Pydantic response models)
# ============================================================================

from pydantic import BaseModel
from typing import Any, Dict
from datetime import date, datetime


class GIListItem(BaseModel):
    id: int
    name: str
    slug: str
    ip_number: Optional[str] = None
    status: Optional[str] = None
    region_name: Optional[str] = None
    bounds: Optional[Dict[str, float]] = None
    color: Optional[str] = None
    
    class Config:
        from_attributes = True


class GIDetail(BaseModel):
    id: int
    name: str
    slug: str
    ip_number: Optional[str] = None
    iponz_url: Optional[str] = None
    status: Optional[str] = None
    registration_date: Optional[date] = None
    renewal_date: Optional[date] = None
    notes: Optional[str] = None
    region_id: Optional[int] = None
    region_name: Optional[str] = None
    bounds: Optional[Dict[str, float]] = None
    color: Optional[str] = None
    created_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.get("", response_model=List[GIListItem])
async def list_gis(
    region_slug: Optional[str] = Query(None, description="Filter by parent region slug"),
    current_user: PublicUser = Depends(get_current_public_user),
    db: Session = Depends(get_db)
):
    """
    Get list of all Geographical Indications.
    Optionally filter by parent wine region.
    """
    try:
        query = db.query(
            GeographicalIndication,
            WineRegion.name.label('region_name')
        ).outerjoin(
            WineRegion, 
            GeographicalIndication.region_id == WineRegion.id
        ).filter(
            GeographicalIndication.is_active == True
        )
        
        # Filter by region if specified
        if region_slug:
            query = query.filter(WineRegion.slug == region_slug)
        
        query = query.order_by(GeographicalIndication.display_order)
        results = query.all()
        
        return [
            GIListItem(
                id=gi.id,
                name=gi.name,
                slug=gi.slug,
                ip_number=gi.ip_number,
                status=gi.status,
                region_name=region_name,
                bounds=gi.bounds,
                color=gi.color
            )
            for gi, region_name in results
        ]
        
    except Exception as e:
        logger.error(f"Error listing GIs: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error fetching geographical indications"
        )


@router.get("/geojson")
async def get_gis_geojson(
    region_slug: Optional[str] = Query(None, description="Filter by parent region slug"),
    simplify: float = Query(
        0.002, 
        ge=0, 
        le=0.1, 
        description="Geometry simplification tolerance in degrees. 0.002 ≈ ~200m. Use 0 for full detail."
    ),
    current_user: PublicUser = Depends(get_current_public_user),
    db: Session = Depends(get_db)
):
    """
    Get all GIs as GeoJSON FeatureCollection for map layer.
    
    Geometries are simplified server-side using PostGIS ST_SimplifyPreserveTopology
    to reduce payload size and improve performance. Adjust 'simplify' parameter
    for more/less detail:
    - 0.001 = ~100m tolerance (more detail)
    - 0.002 = ~200m tolerance (default, good balance)
    - 0.005 = ~500m tolerance (faster, less detail)
    - 0 = full detail (may be slow for complex boundaries)
    """
    try:
        # Build the geometry expression based on simplification
        if simplify > 0:
            geometry_expr = f"ST_AsGeoJSON(ST_SimplifyPreserveTopology(gi.geometry, :tolerance))"
        else:
            geometry_expr = "ST_AsGeoJSON(gi.geometry)"
        
        # Build the WHERE clause
        where_clauses = ["gi.is_active = true", "gi.geometry IS NOT NULL"]
        params = {"tolerance": simplify}
        
        if region_slug:
            where_clauses.append("wr.slug = :region_slug")
            params["region_slug"] = region_slug
        
        where_sql = " AND ".join(where_clauses)
        
        query = text(f"""
            SELECT 
                gi.id,
                gi.name,
                gi.slug,
                gi.ip_number,
                gi.status,
                gi.iponz_url,
                gi.color,
                gi.display_order,
                wr.name as region_name,
                {geometry_expr} as geometry_json
            FROM geographical_indications gi
            LEFT JOIN wine_regions wr ON gi.region_id = wr.id
            WHERE {where_sql}
            ORDER BY gi.display_order
        """)
        
        results = db.execute(query, params).fetchall()
        
        features = []
        for row in results:
            # Parse the geometry JSON from PostGIS (already simplified)
            geometry = None
            if row.geometry_json:
                try:
                    geometry = json.loads(row.geometry_json)
                except json.JSONDecodeError:
                    logger.warning(f"Invalid geometry JSON for GI {row.slug}")
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
                    "ip_number": row.ip_number,
                    "status": row.status,
                    "iponz_url": row.iponz_url,
                    "region_name": row.region_name,
                    "color": row.color or "#8b5cf6"
                }
            }
            features.append(feature)
        
        logger.info(f"Returned {len(features)} GIs with simplify={simplify}")
        
        return {
            "type": "FeatureCollection",
            "features": features
        }
        
    except Exception as e:
        logger.error(f"Error fetching GIs GeoJSON: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error fetching GIs GeoJSON"
        )


@router.get("/{slug}", response_model=GIDetail)
async def get_gi_detail(
    slug: str,
    current_user: PublicUser = Depends(get_current_public_user),
    db: Session = Depends(get_db)
):
    """
    Get detailed information for a single Geographical Indication.
    Includes IPoNZ registration details.
    """
    try:
        result = db.query(
            GeographicalIndication,
            WineRegion.name.label('region_name')
        ).outerjoin(
            WineRegion,
            GeographicalIndication.region_id == WineRegion.id
        ).filter(
            GeographicalIndication.slug == slug,
            GeographicalIndication.is_active == True
        ).first()
        
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Geographical Indication '{slug}' not found"
            )
        
        gi, region_name = result
        
        return GIDetail(
            id=gi.id,
            name=gi.name,
            slug=gi.slug,
            ip_number=gi.ip_number,
            iponz_url=gi.iponz_url,
            status=gi.status,
            registration_date=gi.registration_date,
            renewal_date=gi.renewal_date,
            notes=gi.notes,
            region_id=gi.region_id,
            region_name=region_name,
            bounds=gi.bounds,
            color=gi.color,
            created_at=gi.created_at
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching GI {slug}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error fetching GI details"
        )


@router.get("/{slug}/bounds")
async def get_gi_bounds(
    slug: str,
    current_user: PublicUser = Depends(get_current_public_user),
    db: Session = Depends(get_db)
):
    """
    Get bounding box for a GI (for map fly-to).
    Returns: {min_lng, min_lat, max_lng, max_lat}
    """
    try:
        gi = db.query(GeographicalIndication).filter(
            GeographicalIndication.slug == slug,
            GeographicalIndication.is_active == True
        ).first()
        
        if not gi:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Geographical Indication '{slug}' not found"
            )
        
        if not gi.bounds:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Bounds not available for GI '{slug}'"
            )
        
        return gi.bounds
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching bounds for GI {slug}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error fetching GI bounds"
        )