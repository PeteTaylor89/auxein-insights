# app/api/v1/maintenance.py - Maintenance API Router (Complete)
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_, or_, desc
from typing import List, Optional, Union
from datetime import date, datetime, timedelta
import logging

from db.session import get_db
from db.models.asset import Asset, AssetMaintenance
from db.models.user import User
from db.models.contractor import Contractor
from schemas.asset import (
    MaintenanceCreate, MaintenanceUpdate, MaintenanceResponse, MaintenanceDue
)
from api.deps import get_current_user, get_current_contractor, get_current_user_or_contractor

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("", response_model=MaintenanceResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=MaintenanceResponse, status_code=status.HTTP_201_CREATED)
def create_maintenance_record(
    maintenance_in: MaintenanceCreate,
    db: Session = Depends(get_db),
    current_user_or_contractor: Union[User, Contractor] = Depends(get_current_user_or_contractor)
):
    """Create a new maintenance record"""
    logger.info(f"Creating maintenance record for asset {maintenance_in.asset_id}")
    
    # Verify asset exists and get company_id
    asset = db.query(Asset).filter(Asset.id == maintenance_in.asset_id).first()
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
        created_by = user.id
    else:
        # Contractor can create maintenance records for assets they work with
        created_by = None
    
    # Create maintenance record
    maintenance_data = maintenance_in.dict()
    maintenance = AssetMaintenance(
        **maintenance_data,
        company_id=asset.company_id,
        created_by=created_by
        # REMOVED: status="scheduled" - let it use the status from maintenance_in
    )
    
    # Calculate total cost if cost components are provided
    if any(cost in maintenance_data for cost in ['labor_cost', 'parts_cost', 'external_cost']):
        total_cost = 0
        if maintenance.labor_cost:
            total_cost += float(maintenance.labor_cost)
        if maintenance.parts_cost:
            total_cost += float(maintenance.parts_cost)
        if maintenance.external_cost:
            total_cost += float(maintenance.external_cost)
        maintenance.total_cost = total_cost
    
    # Calculate next due date if this is scheduled maintenance
    if maintenance.maintenance_type == "scheduled" and asset.maintenance_interval_days:
        if maintenance.completed_date and maintenance.status == "completed":
            # If completed, calculate from completion date
            maintenance.next_due_date = maintenance.completed_date + timedelta(days=asset.maintenance_interval_days)
        elif maintenance.scheduled_date:
            # Otherwise calculate from scheduled date
            maintenance.next_due_date = maintenance.scheduled_date + timedelta(days=asset.maintenance_interval_days)
        else:
            maintenance.next_due_date = date.today() + timedelta(days=asset.maintenance_interval_days)
    
    db.add(maintenance)
    db.commit()
    db.refresh(maintenance)
    
    logger.info(f"Maintenance record {maintenance.id} created for asset {asset.id}")
    return maintenance

@router.get("", response_model=List[MaintenanceResponse])
@router.get("/", response_model=List[MaintenanceResponse])
def list_maintenance_records(
    asset_id: Optional[int] = None,
    maintenance_type: Optional[str] = None,
    status: Optional[str] = None,
    scheduled_from: Optional[date] = None,
    scheduled_to: Optional[date] = None,
    overdue_only: bool = False,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user_or_contractor: Union[User, Contractor] = Depends(get_current_user_or_contractor)
):
    """List maintenance records with filtering"""
    logger.info(f"Listing maintenance records with filters")
    
    query = db.query(AssetMaintenance).options(joinedload(AssetMaintenance.asset))
    
    # Filter by company for users
    if isinstance(current_user_or_contractor, User):
        user = current_user_or_contractor
        if user.role != "admin":
            query = query.filter(AssetMaintenance.company_id == user.company_id)
    
    # Apply filters
    if asset_id:
        query = query.filter(AssetMaintenance.asset_id == asset_id)
    if maintenance_type:
        query = query.filter(AssetMaintenance.maintenance_type == maintenance_type)
    if status:
        query = query.filter(AssetMaintenance.status == status)
    if scheduled_from:
        query = query.filter(AssetMaintenance.scheduled_date >= scheduled_from)
    if scheduled_to:
        query = query.filter(AssetMaintenance.scheduled_date <= scheduled_to)
    if overdue_only:
        today = date.today()
        query = query.filter(
            and_(
                AssetMaintenance.scheduled_date < today,
                AssetMaintenance.status.in_(["scheduled", "in_progress"])
            )
        )
    
    # Order by scheduled date
    query = query.order_by(desc(AssetMaintenance.scheduled_date))
    
    # Apply pagination
    maintenance_records = query.offset(skip).limit(limit).all()
 
    logger.info(f"Retrieved {len(maintenance_records)} maintenance records")
    return maintenance_records

@router.get("/due", response_model=List[MaintenanceDue])
def get_maintenance_due(
    days_ahead: int = 30,
    include_overdue: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)  # Only company users for due maintenance
):
    """Get maintenance items that are due or coming due"""
    company_id = current_user.company_id
    today = date.today()
    future_date = today + timedelta(days=days_ahead)
    
    logger.info(f"Getting maintenance due for company {company_id}, {days_ahead} days ahead")
    
    # Base query for scheduled maintenance
    query = db.query(AssetMaintenance).options(joinedload(AssetMaintenance.asset)).filter(
        AssetMaintenance.company_id == company_id,
        AssetMaintenance.status.in_(["scheduled", "in_progress"])
    )
    
    if include_overdue:
        # Include overdue and upcoming
        query = query.filter(AssetMaintenance.scheduled_date <= future_date)
    else:
        # Only upcoming (not overdue)
        query = query.filter(
            and_(
                AssetMaintenance.scheduled_date >= today,
                AssetMaintenance.scheduled_date <= future_date
            )
        )
    
    maintenance_records = query.order_by(AssetMaintenance.scheduled_date).all()
    
    due_items = []
    for record in maintenance_records:
        if record.scheduled_date:
            days_overdue = (today - record.scheduled_date).days if record.scheduled_date < today else None
            
            # Determine priority
            if days_overdue and days_overdue > 0:
                priority = "high"
            elif record.scheduled_date <= today + timedelta(days=7):
                priority = "high"
            elif record.scheduled_date <= today + timedelta(days=14):
                priority = "medium"
            else:
                priority = "low"
            
            due_items.append(MaintenanceDue(
                asset_id=record.asset_id,
                asset_name=record.asset.name,
                maintenance_type=record.maintenance_type,
                due_date=record.scheduled_date,
                days_overdue=days_overdue,
                priority=priority
            ))
    
    logger.info(f"Found {len(due_items)} maintenance items due")
    return due_items

@router.get("/{maintenance_id}", response_model=MaintenanceResponse)
def get_maintenance_record(
    maintenance_id: int,
    db: Session = Depends(get_db),
    current_user_or_contractor: Union[User, Contractor] = Depends(get_current_user_or_contractor)
):
    """Get a specific maintenance record"""
    maintenance = db.query(AssetMaintenance).options(
        joinedload(AssetMaintenance.asset)
    ).filter(AssetMaintenance.id == maintenance_id).first()
    
    if not maintenance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Maintenance record not found"
        )
    
    # Check permissions
    if isinstance(current_user_or_contractor, User):
        user = current_user_or_contractor
        if user.role != "admin" and maintenance.company_id != user.company_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
    
    return maintenance

@router.put("/{maintenance_id}", response_model=MaintenanceResponse)
def update_maintenance_record(
    maintenance_id: int,
    maintenance_update: MaintenanceUpdate,
    db: Session = Depends(get_db),
    current_user_or_contractor: Union[User, Contractor] = Depends(get_current_user_or_contractor)
):
    """Update a maintenance record"""
    maintenance = db.query(AssetMaintenance).filter(AssetMaintenance.id == maintenance_id).first()
    if not maintenance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Maintenance record not found"
        )
    
    # Check permissions
    if isinstance(current_user_or_contractor, User):
        user = current_user_or_contractor
        if user.role != "admin" and maintenance.company_id != user.company_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
    
    # Update maintenance record
    update_data = maintenance_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(maintenance, key, value)
    
    # Calculate total cost if cost components are provided
    if any(cost in update_data for cost in ['labor_cost', 'parts_cost', 'external_cost']):
        total_cost = 0
        if maintenance.labor_cost:
            total_cost += float(maintenance.labor_cost)
        if maintenance.parts_cost:
            total_cost += float(maintenance.parts_cost)
        if maintenance.external_cost:
            total_cost += float(maintenance.external_cost)
        maintenance.total_cost = total_cost
    
    # If marking as completed, set completion date and calculate next due date
    if maintenance_update.status == "completed":
        if not maintenance.completed_date:
            maintenance.completed_date = date.today()
        
        # Calculate next scheduled maintenance
        asset = db.query(Asset).filter(Asset.id == maintenance.asset_id).first()
        if asset and asset.maintenance_interval_days:
            maintenance.next_due_date = maintenance.completed_date + timedelta(days=asset.maintenance_interval_days)
    
    db.commit()
    db.refresh(maintenance)
    
    logger.info(f"Maintenance record {maintenance_id} updated")
    return maintenance

@router.delete("/{maintenance_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_maintenance_record(
    maintenance_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)  # Only company users can delete
):
    """Delete a maintenance record"""
    maintenance = db.query(AssetMaintenance).filter(AssetMaintenance.id == maintenance_id).first()
    if not maintenance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Maintenance record not found"
        )
    
    # Check permissions
    if current_user.role != "admin" and maintenance.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    db.delete(maintenance)
    db.commit()
    
    logger.info(f"Maintenance record {maintenance_id} deleted by user {current_user.id}")
    return None

@router.get("/asset/{asset_id}", response_model=List[MaintenanceResponse])
def get_asset_maintenance_history(
    asset_id: int,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user_or_contractor: Union[User, Contractor] = Depends(get_current_user_or_contractor)
):
    """Get maintenance history for a specific asset"""
    # Verify asset exists and check permissions
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found"
        )
    
    if isinstance(current_user_or_contractor, User):
        user = current_user_or_contractor
        if user.role != "admin" and asset.company_id != user.company_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
    
    # Get maintenance history
    maintenance_records = db.query(AssetMaintenance).filter(
        AssetMaintenance.asset_id == asset_id
    ).order_by(desc(AssetMaintenance.scheduled_date)).limit(limit).all()
    
    return maintenance_records

