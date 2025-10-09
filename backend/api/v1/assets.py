# app/api/v1/assets.py - Assets API Router (Complete)
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_, or_
from typing import List, Optional, Union
from datetime import date, datetime, timedelta
import logging

from db.session import get_db
from db.models.asset import Asset, AssetMaintenance, AssetCalibration, StockMovement
from db.models.user import User
from db.models.contractor import Contractor
from db.models.company import Company
from schemas.asset import (
    AssetCreate, AssetUpdate, AssetResponse, AssetSummary, AssetStats,
    MaintenanceDue, CalibrationDue, ComplianceAlert, StockAlert, CertificationScheme
)
from api.deps import get_current_user, get_current_contractor, get_current_user_or_contractor

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/", response_model=AssetResponse, status_code=status.HTTP_201_CREATED)
def create_asset(
    asset_in: AssetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)  # Only company users can create assets
):
    """Create a new asset"""
    logger.info(f"Creating asset: {asset_in.name} for company {current_user.company_id}")
    
    # Check if asset number already exists for this company
    existing_asset = db.query(Asset).filter(
        Asset.company_id == current_user.company_id,
        Asset.asset_number == asset_in.asset_number
    ).first()
    
    if existing_asset:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Asset number already exists for this company"
        )
    
    # Create asset
    asset_data = asset_in.dict()
    asset = Asset(
        **asset_data,
        company_id=current_user.company_id,
        created_by=current_user.id
    )
    
    db.add(asset)
    db.commit()
    db.refresh(asset)

    logger.info(f"Asset {asset.id} created successfully by user {current_user.id}")
    return asset

@router.get("/", response_model=List[AssetResponse])
def list_assets(
    category: Optional[str] = None,
    asset_type: Optional[str] = None,
    status: Optional[str] = None,
    location: Optional[str] = None,
    requires_maintenance: Optional[bool] = None,
    requires_calibration: Optional[bool] = None,
    low_stock_only: bool = False,
    # NEW: Certification filtering
    certification_scheme: Optional[str] = None,
    certified_only: bool = False,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user_or_contractor: Union[User, Contractor] = Depends(get_current_user_or_contractor)
):
    """List assets with filtering options"""
    logger.info(f"Listing assets with filters - category: {category}, type: {asset_type}")
    
    # Get company_id based on user type
    if isinstance(current_user_or_contractor, User):
        company_id = current_user_or_contractor.company_id
    else:
        company_id = None
    
    query = db.query(Asset)
    
    # Filter by company for regular users
    if company_id:
        query = query.filter(Asset.company_id == company_id)
    
    # Apply filters
    if category:
        query = query.filter(Asset.category == category)
    if asset_type:
        query = query.filter(Asset.asset_type == asset_type)
    if status:
        query = query.filter(Asset.status == status)
    if location:
        query = query.filter(Asset.location.ilike(f"%{location}%"))
    if requires_maintenance is not None:
        query = query.filter(Asset.requires_maintenance == requires_maintenance)
    if requires_calibration is not None:
        query = query.filter(Asset.requires_calibration == requires_calibration)
    if low_stock_only:
        query = query.filter(
            and_(
                Asset.asset_type == "consumable",
                Asset.current_stock <= Asset.minimum_stock
            )
        )
    
    # NEW: Certification filtering
    if certification_scheme and certified_only:
        # Filter for consumables certified for the specified scheme
        query = query.filter(
            Asset.asset_type == "consumable",
            Asset.certified_for[certification_scheme].astext.cast(db.Boolean) == True
        )
    
    # Filter active assets only
    query = query.filter(Asset.is_active == True)
    
    # Apply pagination
    assets = query.offset(skip).limit(limit).all()

    logger.info(f"Retrieved {len(assets)} assets")
    return assets

@router.get("/summary", response_model=List[AssetSummary])
def get_assets_summary(
    category: Optional[str] = None,
    asset_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user_or_contractor: Union[User, Contractor] = Depends(get_current_user_or_contractor)
):
    """Get lightweight asset summary for dropdowns and selection"""
    if isinstance(current_user_or_contractor, User):
        company_id = current_user_or_contractor.company_id
    else:
        company_id = None
    
    query = db.query(Asset).filter(Asset.is_active == True)
    
    if company_id:
        query = query.filter(Asset.company_id == company_id)
    if category:
        query = query.filter(Asset.category == category)
    if asset_type:
        query = query.filter(Asset.asset_type == asset_type)
    
    assets = query.all()
    return assets

@router.get("/stats", response_model=AssetStats)
def get_asset_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)  # Only company users have asset stats
):
    """Get asset statistics for dashboard"""
    company_id = current_user.company_id
    logger.info(f"Getting asset stats for company {company_id}")
    
    # Total assets
    total_assets = db.query(func.count(Asset.id)).filter(
        Asset.company_id == company_id,
        Asset.is_active == True
    ).scalar() or 0
    
    # Equipment vs consumables
    equipment_count = db.query(func.count(Asset.id)).filter(
        Asset.company_id == company_id,
        Asset.asset_type == "physical",
        Asset.is_active == True
    ).scalar() or 0
    
    consumable_count = db.query(func.count(Asset.id)).filter(
        Asset.company_id == company_id,
        Asset.asset_type == "consumable",
        Asset.is_active == True
    ).scalar() or 0
    
    # Assets needing maintenance (simplified check)
    assets_needing_maintenance = db.query(func.count(Asset.id)).filter(
        Asset.company_id == company_id,
        Asset.requires_maintenance == True,
        Asset.is_active == True
    ).scalar() or 0
    
    # Assets needing calibration (simplified check)
    assets_needing_calibration = db.query(func.count(Asset.id)).filter(
        Asset.company_id == company_id,
        Asset.requires_calibration == True,
        Asset.is_active == True
    ).scalar() or 0
    
    # Low stock consumables
    low_stock_consumables = db.query(func.count(Asset.id)).filter(
        Asset.company_id == company_id,
        Asset.asset_type == "consumable",
        Asset.current_stock <= Asset.minimum_stock,
        Asset.is_active == True
    ).scalar() or 0
    
    # Compliance alerts (WOF, registration, insurance due within 30 days)
    today = date.today()
    thirty_days_from_now = today + timedelta(days=30)
    compliance_alerts = db.query(func.count(Asset.id)).filter(
        Asset.company_id == company_id,
        Asset.is_active == True,
        or_(
            and_(Asset.wof_due.isnot(None), Asset.wof_due <= thirty_days_from_now),
            and_(Asset.registration_expiry.isnot(None), Asset.registration_expiry <= thirty_days_from_now),
            and_(Asset.insurance_expiry.isnot(None), Asset.insurance_expiry <= thirty_days_from_now)
        )
    ).scalar() or 0
    
    return AssetStats(
        total_assets=total_assets,
        equipment_count=equipment_count,
        consumable_count=consumable_count,
        assets_needing_maintenance=assets_needing_maintenance,
        assets_needing_calibration=assets_needing_calibration,
        low_stock_consumables=low_stock_consumables,
        compliance_alerts=compliance_alerts
    )

@router.get("/compliance-alerts", response_model=List[ComplianceAlert])
def get_compliance_alerts(
    days_ahead: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get compliance alerts (WOF, registration, insurance expiring soon)"""
    company_id = current_user.company_id
    today = date.today()
    cutoff_date = today + timedelta(days=days_ahead)
    
    alerts = []
    
    # Query assets with upcoming expiries
    assets = db.query(Asset).filter(
        Asset.company_id == company_id,
        Asset.is_active == True,
        or_(
            and_(Asset.wof_due.isnot(None), Asset.wof_due <= cutoff_date),
            and_(Asset.registration_expiry.isnot(None), Asset.registration_expiry <= cutoff_date),
            and_(Asset.insurance_expiry.isnot(None), Asset.insurance_expiry <= cutoff_date)
        )
    ).all()
    
    for asset in assets:
        # Check WOF
        if asset.wof_due and asset.wof_due <= cutoff_date:
            days_until = (asset.wof_due - today).days
            severity = "critical" if days_until <= 7 else "warning" if days_until <= 14 else "info"
            alerts.append(ComplianceAlert(
                asset_id=asset.id,
                asset_name=asset.name,
                alert_type="wof_due",
                due_date=asset.wof_due,
                days_until_due=days_until,
                severity=severity
            ))
        
        # Check registration
        if asset.registration_expiry and asset.registration_expiry <= cutoff_date:
            days_until = (asset.registration_expiry - today).days
            severity = "critical" if days_until <= 7 else "warning" if days_until <= 14 else "info"
            alerts.append(ComplianceAlert(
                asset_id=asset.id,
                asset_name=asset.name,
                alert_type="registration_expiry",
                due_date=asset.registration_expiry,
                days_until_due=days_until,
                severity=severity
            ))
        
        # Check insurance
        if asset.insurance_expiry and asset.insurance_expiry <= cutoff_date:
            days_until = (asset.insurance_expiry - today).days
            severity = "critical" if days_until <= 7 else "warning" if days_until <= 14 else "info"
            alerts.append(ComplianceAlert(
                asset_id=asset.id,
                asset_name=asset.name,
                alert_type="insurance_expiry",
                due_date=asset.insurance_expiry,
                days_until_due=days_until,
                severity=severity
            ))
    
    return sorted(alerts, key=lambda x: x.days_until_due)

@router.get("/stock-alerts", response_model=List[StockAlert])
def get_stock_alerts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get stock level alerts for consumables"""
    company_id = current_user.company_id
    
    # Query consumables with stock issues
    consumables = db.query(Asset).filter(
        Asset.company_id == company_id,
        Asset.asset_type == "consumable",
        Asset.is_active == True,
        or_(
            Asset.current_stock <= 0,
            Asset.current_stock <= Asset.minimum_stock
        )
    ).all()
    
    alerts = []
    for asset in consumables:
        if asset.current_stock <= 0:
            stock_status = "out_of_stock"
        elif asset.minimum_stock and asset.current_stock <= asset.minimum_stock:
            stock_status = "low_stock"
        else:
            stock_status = "adequate"
        
        if stock_status != "adequate":
            alerts.append(StockAlert(
                asset_id=asset.id,
                asset_name=asset.name,
                current_stock=asset.current_stock,
                minimum_stock=asset.minimum_stock or 0,
                unit_of_measure=asset.unit_of_measure or "units",
                stock_status=stock_status
            ))
    
    return alerts

@router.get("/{asset_id}", response_model=AssetResponse)
def get_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user_or_contractor: Union[User, Contractor] = Depends(get_current_user_or_contractor)
):
    """Get a specific asset by ID"""
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found"
        )
    
    # Check permissions
    if isinstance(current_user_or_contractor, User):
        user = current_user_or_contractor
        if user.role != "admin" and asset.company_id != user.company_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
    
    return asset

@router.get("/consumables/by-certification", response_model=List[AssetResponse])
def get_consumables_by_certification(
    scheme: str = Query(..., description="Certification scheme: organics, regenerative, biodynamic, swnz"),
    include_uncertified: bool = False,
    low_stock_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get consumables filtered by certification scheme"""
    company_id = current_user.company_id
    
    query = db.query(Asset).filter(
        Asset.company_id == company_id,
        Asset.asset_type == "consumable",
        Asset.is_active == True
    )
    
    if not include_uncertified:
        # Only show items certified for this scheme
        query = query.filter(
            Asset.certified_for[scheme].astext.cast(db.Boolean) == True
        )
    
    if low_stock_only:
        query = query.filter(Asset.current_stock <= Asset.minimum_stock)
    
    consumables = query.all()
    
    logger.info(f"Retrieved {len(consumables)} consumables for scheme: {scheme}")
    return consumables

@router.get("/consumables/certification-summary")
def get_certification_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get summary of consumables by certification scheme"""
    company_id = current_user.company_id
    
    consumables = db.query(Asset).filter(
        Asset.company_id == company_id,
        Asset.asset_type == "consumable",
        Asset.is_active == True
    ).all()
    
    summary = {
        "organics": 0,
        "regenerative": 0,
        "biodynamic": 0,
        "swnz": 0,
        "total_consumables": len(consumables)
    }
    
    for consumable in consumables:
        if consumable.certified_for:
            for scheme, certified in consumable.certified_for.items():
                if certified and scheme in summary:
                    summary[scheme] += 1
    
    return summary

@router.put("/{asset_id}", response_model=AssetResponse)
def update_asset(
    asset_id: int,
    asset_update: AssetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)  # Only company users can update
):
    """Update an asset"""
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found"
        )
    
    # Check permissions
    if current_user.role != "admin" and asset.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    # Update asset attributes
    update_data = asset_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(asset, key, value)
    
    db.commit()
    db.refresh(asset)
    
    logger.info(f"Asset {asset_id} updated by user {current_user.id}")
    return asset

@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)  # Only company users can delete
):
    """Soft delete an asset"""
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found"
        )
    
    # Check permissions
    if current_user.role != "admin" and asset.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    # Soft delete
    asset.is_active = False
    asset.status = "disposed"
    
    db.commit()
    logger.info(f"Asset {asset_id} deleted by user {current_user.id}")
    
    return None

@router.get("/category/{category}", response_model=List[AssetSummary])
def get_assets_by_category(
    category: str,
    db: Session = Depends(get_db),
    current_user_or_contractor: Union[User, Contractor] = Depends(get_current_user_or_contractor)
):
    """Get assets by category"""
    if isinstance(current_user_or_contractor, User):
        company_id = current_user_or_contractor.company_id
    else:
        company_id = None
    
    query = db.query(Asset).filter(
        Asset.category == category,
        Asset.is_active == True
    )
    
    if company_id:
        query = query.filter(Asset.company_id == company_id)
    
    assets = query.all()
    return assets

@router.get("/consumables/low-stock", response_model=List[AssetResponse])
def get_low_stock_consumables(
    certification_scheme: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get consumables with low stock levels, optionally filtered by certification"""
    query = db.query(Asset).filter(
        Asset.company_id == current_user.company_id,
        Asset.asset_type == "consumable",
        Asset.current_stock <= Asset.minimum_stock,
        Asset.is_active == True
    )
    
    # NEW: Filter by certification if specified
    if certification_scheme:
        query = query.filter(
            Asset.certified_for[certification_scheme].astext.cast(db.Boolean) == True
        )
    
    consumables = query.all()
    
    return consumables

@router.post("/{asset_id}/files/{file_id}")
def associate_file_with_asset(
    asset_id: int,
    file_id: str,
    file_category: str = "document",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Associate an existing file with an asset"""
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found"
        )
    
    # Check permissions
    if current_user.role != "admin" and asset.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    # Verify file exists and belongs to same company
    from db.models.file import File
    file = db.query(File).filter(
        File.id == file_id,
        File.company_id == asset.company_id,
        File.is_active == True
    ).first()
    
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found or access denied"
        )
    
    # Add file reference to asset
    asset.add_file_reference(file_id, file_category)
    
    db.commit()
    logger.info(f"File {file_id} associated with asset {asset_id}")
    
    return {"message": "File associated successfully"}

@router.delete("/{asset_id}/files/{file_id}")
def remove_file_from_asset(
    asset_id: int,
    file_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Remove file association from asset"""
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found"
        )
    
    # Check permissions
    if current_user.role != "admin" and asset.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    # Remove file reference
    asset.remove_file_reference(file_id)
    
    db.commit()
    logger.info(f"File {file_id} removed from asset {asset_id}")
    
    return {"message": "File association removed successfully"}