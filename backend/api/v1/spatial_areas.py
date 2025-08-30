# api/v1/spatial_areas.py (NEW FILE)
from typing import List, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from geoalchemy2.shape import to_shape, from_shape
from shapely.geometry import mapping, shape, Polygon
from api.deps import get_db, get_current_user
from db.models.user import User
from db.models.spatial_area import SpatialArea
from schemas.spatial_area import (
    SpatialAreaResponse, SpatialAreaCreate, SpatialAreaUpdate, 
    SpatialAreaWithChildren, SpatialAreaFilter
)
import logging
from datetime import datetime

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/geojson", response_model=dict)
def get_all_spatial_areas_geojson(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    area_type: Optional[str] = None,
    limit: int = 1000
):
    """
    Get all spatial areas as GeoJSON FeatureCollection for map display
    """
    query = db.query(SpatialArea).filter(SpatialArea.is_active == True)
    
    # Filter by company
    if current_user.company_id:
        query = query.filter(SpatialArea.company_id == current_user.company_id)
    
    # Filter by area type if specified
    if area_type:
        query = query.filter(SpatialArea.area_type == area_type)
    
    spatial_areas = query.limit(limit).all()
    
    features = []
    for area in spatial_areas:
        if area.geometry:
            try:
                shape_obj = to_shape(area.geometry)
                feature = {
                    "type": "Feature",
                    "geometry": mapping(shape_obj),
                    "properties": {
                        "id": area.id,
                        "area_type": area.area_type,
                        "name": area.name,
                        "description": area.description,
                        "area_hectares": float(area.area_hectares) if area.area_hectares else None,
                        "company_id": area.company_id,
                        "parent_area_id": area.parent_area_id,
                        "is_active": area.is_active,
                        "metadata": area.area_metadata,
                        "created_at": area.created_at.isoformat() if area.created_at else None
                    }
                }
                features.append(feature)
            except Exception as e:
                logger.error(f"Error processing spatial area {area.id} geometry: {e}")
                continue
    
    return {
        "type": "FeatureCollection",
        "features": features
    }

@router.get("/company")
def get_company_spatial_areas(
    area_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get spatial areas that match the current user's company_id
    """
    if not current_user.company_id:
        return {"spatial_areas": [], "message": "User has no company association"}
    
    query = db.query(SpatialArea).filter(
        SpatialArea.company_id == current_user.company_id,
        SpatialArea.is_active == True
    )
    
    if area_type:
        query = query.filter(SpatialArea.area_type == area_type)
    
    spatial_areas = query.all()
    
    # Convert SQLAlchemy objects to dictionaries
    area_list = []
    for area in spatial_areas:
        area_dict = {
            "id": area.id,
            "area_type": area.area_type,
            "name": area.name,
            "description": area.description,
            "area_hectares": float(area.area_hectares) if area.area_hectares else None,
            "parent_area_id": area.parent_area_id,
            "company_id": area.company_id,
            "area_metadata": area.area_metadata,
            "is_active": area.is_active,
            "created_at": area.created_at,
            "updated_at": area.updated_at
        }
        area_list.append(area_dict)
    
    return {"spatial_areas": area_list, "count": len(area_list)}

@router.get("/{area_id}")
def get_spatial_area_by_id(
    area_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get detailed spatial area data by ID
    """
    area = db.query(SpatialArea).filter(SpatialArea.id == area_id).first()
    if not area:
        raise HTTPException(status_code=404, detail="Spatial area not found")
    
    # Check access permissions
    if current_user.company_id != area.company_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Build response with all area data
    result = {
        "id": area.id,
        "area_type": area.area_type,
        "name": area.name,
        "description": area.description,
        "area_hectares": float(area.area_hectares) if area.area_hectares else None,
        "parent_area_id": area.parent_area_id,
        "company_id": area.company_id,
        "area_metadata": area.area_metadata,
        "is_active": area.is_active,
        "created_at": area.created_at,
        "updated_at": area.updated_at,
        "geometry_geojson": None,
        "centroid": None
    }
    
    # Add geometry if available
    if area.geometry:
        try:
            shape_obj = to_shape(area.geometry)
            result["geometry_geojson"] = mapping(shape_obj)
            result["centroid"] = area.centroid
        except Exception as e:
            logger.error(f"Error converting geometry for area {area_id}: {e}")
    
    return result

@router.put("/{area_id}")
def update_spatial_area_data(
    area_id: int,
    area_update: SpatialAreaUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update spatial area data
    """
    area = db.query(SpatialArea).filter(SpatialArea.id == area_id).first()
    if not area:
        raise HTTPException(status_code=404, detail="Spatial area not found")
    
    # Check access permissions
    if current_user.company_id != area.company_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get update data, handling geometry separately
    update_data = area_update.dict(exclude_unset=True)
    geometry_data = update_data.pop('geometry', None)
    
    # Apply non-geometry updates
    for key, value in update_data.items():
        if hasattr(area, key):
            setattr(area, key, value)
    
    # Handle geometry update if provided
    if geometry_data:
        try:
            shapely_geom = shape(geometry_data)
            if not isinstance(shapely_geom, Polygon):
                raise ValueError("Geometry must be a Polygon")
            area.geometry = from_shape(shapely_geom, srid=4326)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid geometry: {str(e)}")
    
    try:
        db.commit()
        db.refresh(area)
        logger.info(f"Spatial area {area_id} updated successfully")
        
        return {
            "id": area.id,
            "area_type": area.area_type,
            "name": area.name,
            "description": area.description,
            "area_hectares": float(area.area_hectares) if area.area_hectares else None,
            "parent_area_id": area.parent_area_id,
            "company_id": area.company_id,
            "area_metadata": area.area_metadata,
            "is_active": area.is_active
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating spatial area {area_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating area: {str(e)}")

@router.post("/")
def create_spatial_area_with_polygon(
    spatialAreaData: SpatialAreaCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Create a new spatial area with polygon geometry
    """
    try:
        # Extract geometry data
        geometry_data = spatialAreaData.dict().pop("geometry", None)

        area_dict = spatialAreaData.dict(exclude={"geometry"})
        
        new_area = SpatialArea(**area_dict)
        
        # Set company_id from current user if not provided
        if not new_area.company_id and current_user.company_id:
            new_area.company_id = current_user.company_id
        
        # Process geometry
        try:
            shapely_geom = shape(geometry_data)
            if not isinstance(shapely_geom, Polygon):
                raise ValueError("Geometry must be a Polygon")
            new_area.geometry = from_shape(shapely_geom, srid=4326)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid geometry: {str(e)}")
        
        db.add(new_area)
        db.commit()
        db.refresh(new_area)
        
        logger.info(f"New spatial area created with ID: {new_area.id}")
        
        response_data = {
            "id": new_area.id,
            "area_type": new_area.area_type,
            "name": new_area.name,
            "company_id": new_area.company_id,
            "area_hectares": new_area.area_hectares,
            "message": "Spatial area created successfully"
        }
        

        return response_data
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating spatial area: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating area: {str(e)}")
        
@router.delete("/{area_id}")
def delete_spatial_area(
    area_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Soft delete a spatial area (mark as inactive)
    """
    area = db.query(SpatialArea).filter(SpatialArea.id == area_id).first()
    if not area:
        raise HTTPException(status_code=404, detail="Spatial area not found")
    
    # Check access permissions
    if current_user.company_id != area.company_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Soft delete by marking as inactive
    area.is_active = False
    
    try:
        db.commit()
        logger.info(f"Spatial area {area_id} soft deleted by user {current_user.id}")
        return {"message": "Spatial area deleted successfully"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting spatial area {area_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting area: {str(e)}")

@router.get("/")
def get_all_spatial_areas(
    skip: int = 0,
    limit: int = 100,
    area_type: Optional[str] = None,
    name_contains: Optional[str] = None,
    is_active: Optional[bool] = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get all spatial areas with filtering options
    """
    query = db.query(SpatialArea)
    
    # Filter by company (non-admin users)
    if current_user.role != "admin" and current_user.company_id:
        query = query.filter(SpatialArea.company_id == current_user.company_id)
    
    # Apply filters
    if area_type:
        query = query.filter(SpatialArea.area_type == area_type)
    if name_contains:
        query = query.filter(SpatialArea.name.ilike(f"%{name_contains}%"))
    if is_active is not None:
        query = query.filter(SpatialArea.is_active == is_active)
    
    return query.offset(skip).limit(limit).all()

@router.get("/types/summary")
def get_area_types_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get summary statistics by area type
    """
    from sqlalchemy import func
    
    query = db.query(
        SpatialArea.area_type,
        func.count(SpatialArea.id).label('count'),
        func.sum(SpatialArea.area_hectares).label('total_hectares')
    ).filter(SpatialArea.is_active == True)
    
    # Filter by company for non-admin users
    if current_user.role != "admin" and current_user.company_id:
        query = query.filter(SpatialArea.company_id == current_user.company_id)
    
    results = query.group_by(SpatialArea.area_type).all()
    
    summary = []
    for result in results:
        summary.append({
            "area_type": result.area_type,
            "count": result.count,
            "total_hectares": float(result.total_hectares) if result.total_hectares else 0.0
        })
    
    return {"summary": summary}

@router.get("/nearby/{area_id}")
def get_nearby_spatial_areas(
    area_id: int,
    distance_meters: int = 1000,
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get spatial areas near a specific area
    """
    # Get the reference area
    ref_area = db.query(SpatialArea).filter(SpatialArea.id == area_id).first()
    if not ref_area:
        raise HTTPException(status_code=404, detail="Reference area not found")
    
    # Use PostGIS to find nearby areas
    from sqlalchemy import text
    
    query = db.query(SpatialArea).filter(
        SpatialArea.id != area_id,
        SpatialArea.is_active == True,
        text(f"ST_DWithin(geometry, (SELECT geometry FROM spatial_areas WHERE id = {area_id}), {distance_meters})")
    )
    
    # Filter by company for non-admin users
    if current_user.role != "admin" and current_user.company_id:
        query = query.filter(SpatialArea.company_id == current_user.company_id)
    
    nearby_areas = query.limit(limit).all()
    
    return {
        "reference_area_id": area_id,
        "distance_meters": distance_meters,
        "nearby_areas": [
            {
                "id": area.id,
                "area_type": area.area_type,
                "name": area.name,
                "area_hectares": float(area.area_hectares) if area.area_hectares else None
            }
            for area in nearby_areas
        ]
    }

# Utility endpoints similar to blocks
@router.post("/validate-geometry")
def validate_spatial_area_geometry(
    geometry: Dict = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Validate geometry before creating spatial area
    """
    try:
        shapely_geom = shape(geometry)
        
        if not isinstance(shapely_geom, Polygon):
            return {"valid": False, "error": "Geometry must be a Polygon"}
        
        if not shapely_geom.is_valid:
            return {"valid": False, "error": "Invalid polygon geometry"}
        
        # Calculate area
        area_m2 = shapely_geom.area * 111319.9 * 111319.9  # Rough conversion
        area_hectares = area_m2 * 0.0001
        
        return {
            "valid": True,
            "estimated_area_hectares": round(area_hectares, 4),
            "perimeter_approximate": round(shapely_geom.length * 111319.9, 2)
        }
        
    except Exception as e:
        return {"valid": False, "error": str(e)}