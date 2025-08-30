# ==================================================
# File: app/api/v1/parcels.py
# ==================================================

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query, Body
from sqlalchemy.orm import Session
from typing import Optional, List
from uuid import UUID
import os
import logging

from api.deps import get_db, get_current_user
from db.models.user import User
from db.models.primary_parcel import PrimaryParcel
from db.models.company_land_ownership import CompanyLandOwnership
from db.models.company import Company
from db.models.parcel_sync_log import ParcelSyncLog
from services.linz_parcels_service import LINZParcelsService
from services.parcel_sync_service import ParcelSyncService
from sqlalchemy import func, text
from geoalchemy2.shape import to_shape

logger = logging.getLogger(__name__)

router = APIRouter()

# Initialize LINZ service
LINZ_API_KEY = os.getenv("LINZ_API_KEY")
if not LINZ_API_KEY:
    logger.error("LINZ_API_KEY environment variable is required")
    raise ValueError("LINZ_API_KEY environment variable is required")

linz_service = LINZParcelsService(LINZ_API_KEY)

@router.get("/test-connection")
async def test_linz_connection(
    current_user: User = Depends(get_current_user)
):
    """Test connection to LINZ API"""
    try:
        result = await linz_service.test_connection()
        return result
    except Exception as e:
        logger.error(f"Error testing LINZ connection: {e}")
        raise HTTPException(status_code=500, detail=f"Connection test failed: {str(e)}")

@router.post("/sync/test")
async def test_small_sync(
    limit: int = Query(100, ge=10, le=1000, description="Number of parcels to sync for testing"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Test sync with a small number of parcels"""
    
    if current_user.role not in ["admin", "owner"]:
        raise HTTPException(
            status_code=403,
            detail="Only administrators can trigger sync operations"
        )
    
    sync_service = ParcelSyncService(db, linz_service)
    result = await sync_service.test_small_sync(limit)
    
    return result

@router.post("/sync/full-refresh")
async def trigger_full_parcel_sync(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Trigger a full refresh of all parcel data"""
    
    # Check if user has permission (admin only)
    if current_user.role not in ["admin", "owner"]:
        raise HTTPException(
            status_code=403,
            detail="Only administrators can trigger parcel synchronization"
        )
    
    # Check if a sync is already running
    active_sync = db.query(ParcelSyncLog).filter(
        ParcelSyncLog.status == "running"
    ).first()
    
    if active_sync:
        raise HTTPException(
            status_code=409,
            detail=f"A sync is already running (started at {active_sync.started_at})"
        )
    
    # Test LINZ connection first
    try:
        connection_test = await linz_service.test_connection()
        if not connection_test["success"]:
            raise HTTPException(
                status_code=502,
                detail=f"LINZ API connection failed: {connection_test['error']}"
            )
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to connect to LINZ API: {str(e)}"
        )
    
    # Start background sync
    async def run_sync():
        try:
            sync_service = ParcelSyncService(db, linz_service)
            await sync_service.full_refresh_sync(current_user.id)
        except Exception as e:
            logger.error(f"Background sync failed: {e}")
    
    background_tasks.add_task(run_sync)
    
    return {
        "message": "Parcel synchronization started",
        "total_parcels_available": connection_test["total_parcels"],
        "note": "This process will run in the background and may take several hours"
    }

@router.get("/sync/status")
def get_sync_status(
    batch_id: Optional[UUID] = Query(None, description="Specific batch ID to check"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get status of parcel synchronization"""
    
    # Get sync status using the service
    sync_service = ParcelSyncService(db, linz_service)
    status = sync_service.get_sync_status(batch_id)
    
    if not status:
        return {"message": "No synchronization has been performed yet"}
    
    return status

@router.get("/sync/history")
def get_sync_history(
    limit: int = Query(10, ge=1, le=50, description="Number of sync logs to return"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get history of parcel synchronizations"""
    
    if current_user.role not in ["admin", "owner"]:
        raise HTTPException(
            status_code=403,
            detail="Only administrators can view sync history"
        )
    
    sync_logs = db.query(ParcelSyncLog).order_by(
        ParcelSyncLog.started_at.desc()
    ).limit(limit).all()
    
    history = []
    for log in sync_logs:
        history.append({
            "batch_id": log.batch_id,
            "sync_type": log.sync_type,
            "status": log.status,
            "started_at": log.started_at,
            "completed_at": log.completed_at,
            "duration_seconds": log.duration_seconds,
            "progress_percentage": log.progress_percentage,
            "total_records": log.total_records,
            "processed_records": log.processed_records,
            "created_records": log.created_records,
            "updated_records": log.updated_records,
            "deleted_records": log.deleted_records,
            "error_message": log.error_message,
            "triggered_by": log.triggered_by
        })
    
    return {"sync_history": history, "count": len(history)}

@router.get("/geojson")
def get_parcels_geojson(
    bbox: Optional[str] = Query(None, description="Bounding box: west,south,east,north"),
    limit: int = Query(1000, ge=1, le=10000, description="Maximum features to return"),
    company_owned_only: bool = Query(False, description="Only return parcels owned by user's company"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get parcels as GeoJSON for map display"""
    
    query = db.query(PrimaryParcel).filter(PrimaryParcel.is_active == True)
    
    # Apply company filter if requested
    if company_owned_only and current_user.company_id:
        query = query.join(CompanyLandOwnership).filter(
            CompanyLandOwnership.company_id == current_user.company_id,
            CompanyLandOwnership.verified == True
        )
    
    # Apply bounding box filter if provided
    if bbox:
        try:
            west, south, east, north = map(float, bbox.split(','))
            bbox_geom = func.ST_MakeEnvelope(west, south, east, north, 4326)
            query = query.filter(
                func.ST_Intersects(PrimaryParcel.geometry_wgs84, bbox_geom)
            )
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Invalid bbox format. Use: west,south,east,north"
            )
    
    # Apply limit
    parcels = query.limit(limit).all()
    
    features = []
    for parcel in parcels:
        if parcel.geometry_wgs84:
            try:
                shape_obj = to_shape(parcel.geometry_wgs84)
                
                # Check if parcel is owned by user's company
                is_owned = False
                if current_user.company_id:
                    # Remove this duplicate import line too
                    ownership = db.query(CompanyLandOwnership).filter(
                        CompanyLandOwnership.land_parcel_id == parcel.id,
                        CompanyLandOwnership.company_id == current_user.company_id,
                        CompanyLandOwnership.verified == True
                    ).first()
                    is_owned = ownership is not None
                
                feature = {
                    "type": "Feature",
                    "geometry": shape_obj.__geo_interface__,
                    "properties": {
                        "id": parcel.id,
                        "linz_id": parcel.linz_id,
                        "appellation": parcel.appellation,
                        "parcel_intent": parcel.parcel_intent,
                        "land_district": parcel.land_district,
                        "survey_area": float(parcel.survey_area) if parcel.survey_area else None,
                        "calc_area": float(parcel.calc_area) if parcel.calc_area else None,
                        "area_hectares": parcel.area_hectares,
                        "last_synced": parcel.last_synced_at.isoformat() if parcel.last_synced_at else None,
                        "is_owned_by_user_company": is_owned,
                        "topology_type": parcel.topology_type,
                        "assigned_company_id": None,
                        "assigned_company_name": None,
                        "has_assignment": False
                    }
                }
                
                # Add company assignment info to properties
                ownership = db.query(CompanyLandOwnership).filter(
                    CompanyLandOwnership.land_parcel_id == parcel.id,
                    CompanyLandOwnership.verified == True
                ).first()
                
                if ownership:
                    company = db.query(Company).filter(Company.id == ownership.company_id).first()
                    feature["properties"]["assigned_company_id"] = ownership.company_id
                    feature["properties"]["assigned_company_name"] = company.name if company else None
                    feature["properties"]["has_assignment"] = True
                
                features.append(feature)

            except Exception as e:
                logger.error(f"Error processing parcel {parcel.id} geometry: {e}")
                continue
    
    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "count": len(features),
            "limit": limit,
            "bbox": bbox,
            "company_owned_only": company_owned_only
        }
    }
    
@router.get("/company/{company_id}/geojson")
def get_company_parcels_geojson(
    company_id: int,
    bbox: Optional[str] = Query(None, description="Bounding box: west,south,east,north"),
    limit: int = Query(1000, ge=1, le=10000, description="Maximum features to return"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get parcels assigned to a specific company as GeoJSON
    """
    # Verify company exists
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    # Build query for company's parcels
    query = db.query(PrimaryParcel).join(CompanyLandOwnership).filter(
        CompanyLandOwnership.company_id == company_id,
        CompanyLandOwnership.verified == True,
        PrimaryParcel.is_active == True
    )
    
    # Apply bounding box filter if provided
    if bbox:
        try:
            west, south, east, north = map(float, bbox.split(','))
            bbox_geom = func.ST_MakeEnvelope(west, south, east, north, 4326)
            query = query.filter(
                func.ST_Intersects(PrimaryParcel.geometry_wgs84, bbox_geom)
            )
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Invalid bbox format. Use: west,south,east,north"
            )
    
    # Apply limit
    parcels = query.limit(limit).all()
    
    features = []
    for parcel in parcels:
        if parcel.geometry_wgs84:
            try:
                shape_obj = to_shape(parcel.geometry_wgs84)
                
                # Get ownership details
                ownership = db.query(CompanyLandOwnership).filter(
                    CompanyLandOwnership.land_parcel_id == parcel.id,
                    CompanyLandOwnership.company_id == company_id
                ).first()
                
                feature = {
                    "type": "Feature",
                    "geometry": shape_obj.__geo_interface__,
                    "properties": {
                        "id": parcel.id,
                        "linz_id": parcel.linz_id,
                        "appellation": parcel.appellation,
                        "parcel_intent": parcel.parcel_intent,
                        "land_district": parcel.land_district,
                        "survey_area": float(parcel.survey_area) if parcel.survey_area else None,
                        "calc_area": float(parcel.calc_area) if parcel.calc_area else None,
                        "area_hectares": parcel.area_hectares,
                        "last_synced": parcel.last_synced_at.isoformat() if parcel.last_synced_at else None,
                        "topology_type": parcel.topology_type,
                        "assigned_company_id": company_id,
                        "assigned_company_name": company.name,
                        "has_assignment": True,
                        "is_owned_by_user_company": True,
                        "ownership_type": ownership.ownership_type if ownership else "full",
                        "ownership_percentage": float(ownership.ownership_percentage) if ownership else 100.0
                    }
                }
                features.append(feature)

            except Exception as e:
                logger.error(f"Error processing parcel {parcel.id} geometry: {e}")
                continue
    
    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "count": len(features),
            "limit": limit,
            "bbox": bbox,
            "company_id": company_id,
            "company_name": company.name
        }
    }

@router.get("/stats")
def get_parcel_statistics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get statistics about stored parcels"""
    
    # Basic parcel counts
    total_parcels = db.query(func.count(PrimaryParcel.id)).scalar() or 0
    active_parcels = db.query(func.count(PrimaryParcel.id)).filter(
        PrimaryParcel.is_active == True
    ).scalar() or 0
    
    # Company ownership stats
    company_owned_count = 0
    if current_user.company_id:
        from db.models.company_land_ownership import CompanyLandOwnership
        company_owned_count = db.query(func.count(CompanyLandOwnership.id)).filter(
            CompanyLandOwnership.company_id == current_user.company_id,
            CompanyLandOwnership.verified == True
        ).scalar() or 0
    
    # Get latest sync info
    latest_sync = db.query(ParcelSyncLog).order_by(
        ParcelSyncLog.started_at.desc()
    ).first()
    
    # Get parcels by land district (top 10)
    district_stats = db.query(
        PrimaryParcel.land_district,
        func.count(PrimaryParcel.id).label('count')
    ).filter(
        PrimaryParcel.is_active == True
    ).group_by(PrimaryParcel.land_district).order_by(
        func.count(PrimaryParcel.id).desc()
    ).limit(10).all()
    
    # Get parcels by intent (top 10)
    intent_stats = db.query(
        PrimaryParcel.parcel_intent,
        func.count(PrimaryParcel.id).label('count')
    ).filter(
        PrimaryParcel.is_active == True
    ).group_by(PrimaryParcel.parcel_intent).order_by(
        func.count(PrimaryParcel.id).desc()
    ).limit(10).all()
    
    # Calculate total area
    total_area_result = db.query(func.sum(PrimaryParcel.calc_area)).filter(
        PrimaryParcel.is_active == True,
        PrimaryParcel.calc_area.isnot(None)
    ).scalar()
    total_area_hectares = float(total_area_result) / 10000 if total_area_result else 0
    
    return {
        "total_parcels": total_parcels,
        "active_parcels": active_parcels,
        "inactive_parcels": total_parcels - active_parcels,
        "company_owned_parcels": company_owned_count,
        "total_area_hectares": round(total_area_hectares, 2),
        "last_sync": {
            "date": latest_sync.completed_at if latest_sync and latest_sync.completed_at else None,
            "status": latest_sync.status if latest_sync else None,
            "records_processed": latest_sync.processed_records if latest_sync else 0,
            "batch_id": str(latest_sync.batch_id) if latest_sync else None
        },
        "by_land_district": [
            {"district": district or "Unknown", "count": count} 
            for district, count in district_stats
        ],
        "by_parcel_intent": [
            {"intent": intent or "Unknown", "count": count}
            for intent, count in intent_stats
        ]
    }

@router.get("/search")
def search_parcels(
    q: str = Query(..., min_length=3, description="Search query"),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Search parcels by appellation, land district, or LINZ ID"""
    
    # Build search query
    search_pattern = f"%{q}%"
    
    query = db.query(PrimaryParcel).filter(
        PrimaryParcel.is_active == True
    )
    
    # Try to parse as LINZ ID first
    try:
        linz_id = int(q)
        query = query.filter(PrimaryParcel.linz_id == linz_id)
    except ValueError:
        # Search by text fields
        query = query.filter(
            func.or_(
                PrimaryParcel.appellation.ilike(search_pattern),
                PrimaryParcel.land_district.ilike(search_pattern),
                PrimaryParcel.parcel_intent.ilike(search_pattern)
            )
        )
    
    parcels = query.limit(limit).all()
    
    results = []
    for parcel in parcels:
        # Check if owned by user's company
        is_owned = False
        if current_user.company_id:
            from db.models.company_land_ownership import CompanyLandOwnership
            ownership = db.query(CompanyLandOwnership).filter(
                CompanyLandOwnership.land_parcel_id == parcel.id,
                CompanyLandOwnership.company_id == current_user.company_id,
                CompanyLandOwnership.verified == True
            ).first()
            is_owned = ownership is not None
        
        results.append({
            "id": parcel.id,
            "linz_id": parcel.linz_id,
            "appellation": parcel.appellation,
            "land_district": parcel.land_district,
            "parcel_intent": parcel.parcel_intent,
            "area_hectares": parcel.area_hectares,
            "is_owned_by_user_company": is_owned,
            "centroid_latitude": float(parcel.geometry_wgs84.centroid.y) if parcel.geometry_wgs84 else None,
            "centroid_longitude": float(parcel.geometry_wgs84.centroid.x) if parcel.geometry_wgs84 else None
        })
    
    return {
        "results": results,
        "count": len(results),
        "query": q,
        "limit": limit
    }

@router.get("/{parcel_id}")
def get_parcel_details(
    parcel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get detailed information about a specific parcel"""
    
    parcel = db.query(PrimaryParcel).filter(
        PrimaryParcel.id == parcel_id,
        PrimaryParcel.is_active == True
    ).first()
    
    if not parcel:
        raise HTTPException(status_code=404, detail="Parcel not found")
    
    # Check ownership
    ownership_info = None
    if current_user.company_id:
        from db.models.company_land_ownership import CompanyLandOwnership
        ownership = db.query(CompanyLandOwnership).filter(
            CompanyLandOwnership.land_parcel_id == parcel.id,
            CompanyLandOwnership.company_id == current_user.company_id
        ).first()
        
        if ownership:
            ownership_info = {
                "ownership_type": ownership.ownership_type,
                "ownership_percentage": float(ownership.ownership_percentage),
                "verified": ownership.verified,
                "verification_method": ownership.verification_method,
                "ownership_start_date": ownership.ownership_start_date,
                "ownership_end_date": ownership.ownership_end_date,
                "notes": ownership.notes
            }
    
    # Get geometry as GeoJSON if available
    geometry_geojson = None
    if parcel.geometry_wgs84:
        try:
            shape_obj = to_shape(parcel.geometry_wgs84)
            geometry_geojson = shape_obj.__geo_interface__
        except Exception as e:
            logger.warning(f"Error converting geometry for parcel {parcel_id}: {e}")
    
    return {
        "id": parcel.id,
        "linz_id": parcel.linz_id,
        "appellation": parcel.appellation,
        "affected_surveys": parcel.affected_surveys,
        "parcel_intent": parcel.parcel_intent,
        "topology_type": parcel.topology_type,
        "statutory_actions": parcel.statutory_actions,
        "land_district": parcel.land_district,
        "titles": parcel.titles,
        "survey_area": float(parcel.survey_area) if parcel.survey_area else None,
        "calc_area": float(parcel.calc_area) if parcel.calc_area else None,
        "area_hectares": parcel.area_hectares,
        "created_at": parcel.created_at,
        "updated_at": parcel.updated_at,
        "last_synced_at": parcel.last_synced_at,
        "geometry_geojson": geometry_geojson,
        "ownership": ownership_info
    }

@router.post("/{parcel_id}/assign-company")
def assign_parcel_to_company(
    parcel_id: int,
    assignment_data: dict = Body(..., example={
        "company_id": 1,
        "ownership_type": "full",
        "ownership_percentage": 100.0,
        "verification_method": "manual",
        "notes": "Assigned via admin interface"
    }),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Assign a parcel to a company (admin only)
    """
    # Check admin permissions
    if current_user.email != "pete.taylor@auxein.co.nz":
        raise HTTPException(
            status_code=403,
            detail="Only system administrators can assign parcels to companies"
        )
    
    # Verify parcel exists
    parcel = db.query(PrimaryParcel).filter(
        PrimaryParcel.id == parcel_id,
        PrimaryParcel.is_active == True
    ).first()
    if not parcel:
        raise HTTPException(status_code=404, detail="Parcel not found")
    
    # Verify company exists
    company_id = assignment_data.get("company_id")
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    # Check if assignment already exists
    existing_assignment = db.query(CompanyLandOwnership).filter(
        CompanyLandOwnership.land_parcel_id == parcel_id,
        CompanyLandOwnership.company_id == company_id
    ).first()
    
    if existing_assignment:
        raise HTTPException(
            status_code=409,
            detail="Company is already assigned to this parcel"
        )
    
    try:
        # Create new ownership record
        ownership = CompanyLandOwnership(
            company_id=company_id,
            land_parcel_id=parcel_id,
            ownership_type=assignment_data.get("ownership_type", "full"),
            ownership_percentage=assignment_data.get("ownership_percentage", 100.0),
            verified=True,  # Auto-verify admin assignments
            verification_method=assignment_data.get("verification_method", "manual"),
            notes=assignment_data.get("notes"),
            created_by=current_user.id
        )
        
        db.add(ownership)
        db.commit()
        db.refresh(ownership)
        
        logger.info(f"Parcel {parcel_id} assigned to company {company_id} by admin {current_user.id}")
        
        return {
            "id": ownership.id,
            "parcel_id": parcel_id,
            "company_id": company_id,
            "company_name": company.name,
            "ownership_type": ownership.ownership_type,
            "ownership_percentage": float(ownership.ownership_percentage),
            "verified": ownership.verified,
            "message": f"Parcel successfully assigned to {company.name}"
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error assigning parcel {parcel_id} to company {company_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error assigning parcel: {str(e)}")

@router.get("/company/{company_id}")
def get_parcels_by_company(
    company_id: int,
    include_geometry: bool = Query(False, description="Include full geometry data"),
    verified_only: bool = Query(True, description="Only return verified ownerships"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get all parcels assigned to a specific company
    """
    # Verify company exists
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    # Build query for company's parcels
    query = db.query(PrimaryParcel).join(CompanyLandOwnership).filter(
        CompanyLandOwnership.company_id == company_id,
        PrimaryParcel.is_active == True
    )
    
    if verified_only:
        query = query.filter(CompanyLandOwnership.verified == True)
    
    parcels = query.all()
    
    results = []
    for parcel in parcels:
        # Get ownership details
        ownership = db.query(CompanyLandOwnership).filter(
            CompanyLandOwnership.land_parcel_id == parcel.id,
            CompanyLandOwnership.company_id == company_id
        ).first()
        
        parcel_data = {
            "id": parcel.id,
            "linz_id": parcel.linz_id,
            "appellation": parcel.appellation,
            "land_district": parcel.land_district,
            "parcel_intent": parcel.parcel_intent,
            "area_hectares": parcel.area_hectares,
            "ownership": {
                "ownership_type": ownership.ownership_type,
                "ownership_percentage": float(ownership.ownership_percentage),
                "verified": ownership.verified,
                "verification_method": ownership.verification_method,
                "assigned_date": ownership.created_at
            }
        }
        
        # Include geometry if requested
        if include_geometry and parcel.geometry_wgs84:
            try:
                shape_obj = to_shape(parcel.geometry_wgs84)
                parcel_data["geometry_geojson"] = shape_obj.__geo_interface__
            except Exception as e:
                logger.warning(f"Error converting geometry for parcel {parcel.id}: {e}")
        
        results.append(parcel_data)
    
    return {
        "company_id": company_id,
        "company_name": company.name,
        "parcels": results,
        "count": len(results),
        "verified_only": verified_only
    }

@router.delete("/{parcel_id}/company-assignment")
def remove_parcel_company_assignment(
    parcel_id: int,
    company_id: int = Query(..., description="Company ID to remove assignment for"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Remove company assignment from a parcel (admin only)
    """
    # Check admin permissions
    if current_user.email != "pete.taylor@auxein.co.nz":
        raise HTTPException(
            status_code=403,
            detail="Only system administrators can remove parcel assignments"
        )
    
    # Find the ownership record
    ownership = db.query(CompanyLandOwnership).filter(
        CompanyLandOwnership.land_parcel_id == parcel_id,
        CompanyLandOwnership.company_id == company_id
    ).first()
    
    if not ownership:
        raise HTTPException(
            status_code=404,
            detail="No assignment found between this parcel and company"
        )
    
    try:
        # Get company name for response
        company = db.query(Company).filter(Company.id == company_id).first()
        company_name = company.name if company else f"Company {company_id}"
        
        db.delete(ownership)
        db.commit()
        
        logger.info(f"Parcel {parcel_id} assignment removed from company {company_id} by admin {current_user.id}")
        
        return {
            "parcel_id": parcel_id,
            "company_id": company_id,
            "company_name": company_name,
            "message": f"Assignment removed from {company_name}"
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error removing assignment for parcel {parcel_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error removing assignment: {str(e)}")