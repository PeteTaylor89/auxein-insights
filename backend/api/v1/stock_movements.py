# app/api/v1/stock_movements.py - Stock Movements API Router
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, desc
from typing import List, Optional
from datetime import date, datetime, timedelta
from decimal import Decimal
import logging

from db.session import get_db
from db.models.asset import Asset, StockMovement
from db.models.user import User
from db.models.contractor import Contractor
from api.deps import get_current_user, get_current_contractor, get_current_user_or_contractor
from schemas import asset as schemas

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("", response_model=schemas.StockMovementResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=schemas.StockMovementResponse, status_code=status.HTTP_201_CREATED)
def create_stock_movement(
    movement_in: schemas.StockMovementCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new stock movement and update asset stock level"""
    logger.info(f"Creating stock movement for asset {movement_in.asset_id}")
    
    # Get the asset
    asset = db.query(Asset).filter(
        Asset.id == movement_in.asset_id,
        Asset.company_id == current_user.company_id
    ).first()
    
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found"
        )
    
    # Verify asset is a consumable
    if asset.asset_type != "consumable":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Stock movements only apply to consumable assets"
        )
    
    # Record stock before movement
    stock_before = asset.current_stock or Decimal('0.0')
    
    # Calculate total cost if unit cost provided
    total_cost = None
    if movement_in.unit_cost:
        total_cost = abs(movement_in.quantity) * movement_in.unit_cost
    
    # Create stock movement
    movement_data = movement_in.dict()
    movement = StockMovement(
        **movement_data,
        company_id=current_user.company_id,
        stock_before=stock_before,
        total_cost=total_cost,
        created_by=current_user.id
    )
    
    # Update asset stock level
    new_stock = stock_before + movement_in.quantity
    
    # Prevent negative stock
    if new_stock < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient stock. Current: {stock_before}, Requested: {abs(movement_in.quantity)}"
        )
    
    movement.stock_after = new_stock
    asset.current_stock = new_stock
    
    # Update asset status if out of stock
    if new_stock <= 0:
        asset.status = "out_of_stock"
    elif asset.status == "out_of_stock" and new_stock > 0:
        asset.status = "active"
    
    db.add(movement)
    db.commit()
    db.refresh(movement)
    
    logger.info(f"Stock movement {movement.id} created. Stock: {stock_before} -> {new_stock}")
    return movement

@router.get("", response_model=List[schemas.StockMovementResponse])
@router.get("/", response_model=List[schemas.StockMovementResponse])
def list_stock_movements(
    asset_id: Optional[int] = None,
    movement_type: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    task_id: Optional[int] = None,
    block_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List stock movements with filtering options"""
    logger.info(f"Listing stock movements with filters - asset_id: {asset_id}")
    
    query = db.query(StockMovement).filter(
        StockMovement.company_id == current_user.company_id
    )
    
    # Apply filters
    if asset_id:
        query = query.filter(StockMovement.asset_id == asset_id)
    if movement_type:
        query = query.filter(StockMovement.movement_type == movement_type)
    if date_from:
        query = query.filter(StockMovement.movement_date >= date_from)
    if date_to:
        query = query.filter(StockMovement.movement_date <= date_to)
    if task_id:
        query = query.filter(StockMovement.task_id == task_id)
    if block_id:
        query = query.filter(StockMovement.block_id == block_id)
    
    # Order by date descending (most recent first)
    query = query.order_by(desc(StockMovement.movement_date), desc(StockMovement.created_at))
    
    # Apply pagination
    movements = query.offset(skip).limit(limit).all()
    
    logger.info(f"Retrieved {len(movements)} stock movements")
    return movements

@router.get("/asset/{asset_id}", response_model=List[schemas.StockMovementResponse])
def get_asset_stock_history(
    asset_id: int,
    movement_type: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get stock movement history for a specific asset"""
    # Verify asset exists and belongs to company
    asset = db.query(Asset).filter(
        Asset.id == asset_id,
        Asset.company_id == current_user.company_id
    ).first()
    
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found"
        )
    
    query = db.query(StockMovement).filter(
        StockMovement.asset_id == asset_id,
        StockMovement.company_id == current_user.company_id
    )
    
    if movement_type:
        query = query.filter(StockMovement.movement_type == movement_type)
    
    movements = query.order_by(
        desc(StockMovement.movement_date),
        desc(StockMovement.created_at)
    ).limit(limit).all()
    
    return movements

@router.get("/summary/{asset_id}")
def get_stock_summary(
    asset_id: int,
    days: int = Query(default=30, description="Number of days to analyze"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get stock movement summary for an asset"""
    # Verify asset
    asset = db.query(Asset).filter(
        Asset.id == asset_id,
        Asset.company_id == current_user.company_id
    ).first()
    
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found"
        )
    
    cutoff_date = date.today() - timedelta(days=days)
    
    movements = db.query(StockMovement).filter(
        StockMovement.asset_id == asset_id,
        StockMovement.company_id == current_user.company_id,
        StockMovement.movement_date >= cutoff_date
    ).all()
    
    # Calculate summary statistics
    total_purchased = sum(m.quantity for m in movements if m.quantity > 0)
    total_used = abs(sum(m.quantity for m in movements if m.quantity < 0))
    total_adjustments = sum(
        m.quantity for m in movements if m.movement_type == 'adjustment'
    )
    
    purchase_count = len([m for m in movements if m.movement_type == 'purchase'])
    usage_count = len([m for m in movements if m.movement_type == 'usage'])
    
    total_cost = sum(
        m.total_cost for m in movements 
        if m.total_cost and m.movement_type == 'purchase'
    ) or Decimal('0.0')
    
    return {
        "asset_id": asset_id,
        "asset_name": asset.name,
        "current_stock": asset.current_stock,
        "unit_of_measure": asset.unit_of_measure,
        "period_days": days,
        "total_purchased": total_purchased,
        "total_used": total_used,
        "total_adjustments": total_adjustments,
        "purchase_count": purchase_count,
        "usage_count": usage_count,
        "total_cost": total_cost,
        "movement_count": len(movements)
    }

@router.get("/{movement_id}", response_model=schemas.StockMovementResponse)
def get_stock_movement(
    movement_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific stock movement by ID"""
    movement = db.query(StockMovement).filter(
        StockMovement.id == movement_id,
        StockMovement.company_id == current_user.company_id
    ).first()
    
    if not movement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stock movement not found"
        )
    
    return movement

@router.put("/{movement_id}", response_model=schemas.StockMovementResponse)
def update_stock_movement(
    movement_id: int,
    movement_update: schemas.StockMovementUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a stock movement (adjusts asset stock accordingly)"""
    movement = db.query(StockMovement).filter(
        StockMovement.id == movement_id,
        StockMovement.company_id == current_user.company_id
    ).first()
    
    if not movement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stock movement not found"
        )
    
    # Get the asset
    asset = db.query(Asset).filter(Asset.id == movement.asset_id).first()
    
    # If quantity is being updated, adjust asset stock
    update_data = movement_update.dict(exclude_unset=True)
    
    if 'quantity' in update_data:
        old_quantity = movement.quantity
        new_quantity = update_data['quantity']
        quantity_delta = new_quantity - old_quantity
        
        # Update asset stock
        new_asset_stock = (asset.current_stock or Decimal('0.0')) + quantity_delta
        
        if new_asset_stock < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot update: would result in negative stock ({new_asset_stock})"
            )
        
        asset.current_stock = new_asset_stock
        movement.stock_after = new_asset_stock
        
        # Update asset status
        if new_asset_stock <= 0:
            asset.status = "out_of_stock"
        elif asset.status == "out_of_stock" and new_asset_stock > 0:
            asset.status = "active"
    
    # Update movement attributes
    for key, value in update_data.items():
        setattr(movement, key, value)
    
    # Recalculate total cost if needed
    if movement.unit_cost and movement.quantity:
        movement.total_cost = abs(movement.quantity) * movement.unit_cost
    
    db.commit()
    db.refresh(movement)
    
    logger.info(f"Stock movement {movement_id} updated by user {current_user.id}")
    return movement

@router.delete("/{movement_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_stock_movement(
    movement_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a stock movement and reverse its effect on asset stock"""
    movement = db.query(StockMovement).filter(
        StockMovement.id == movement_id,
        StockMovement.company_id == current_user.company_id
    ).first()
    
    if not movement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stock movement not found"
        )
    
    # Get the asset
    asset = db.query(Asset).filter(Asset.id == movement.asset_id).first()
    
    # Reverse the stock movement
    new_stock = (asset.current_stock or Decimal('0.0')) - movement.quantity
    
    if new_stock < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete: would result in negative stock ({new_stock})"
        )
    
    asset.current_stock = new_stock
    
    # Update asset status
    if new_stock <= 0:
        asset.status = "out_of_stock"
    elif asset.status == "out_of_stock" and new_stock > 0:
        asset.status = "active"
    
    # Delete the movement
    db.delete(movement)
    db.commit()
    
    logger.info(f"Stock movement {movement_id} deleted, stock reversed to {new_stock}")
    return None

@router.post("/bulk", response_model=List[schemas.StockMovementResponse])
def create_bulk_stock_movements(
    movements_in: List[schemas.StockMovementCreate],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create multiple stock movements in a single transaction"""
    if len(movements_in) > 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 100 movements per bulk operation"
        )
    
    created_movements = []
    
    try:
        for movement_in in movements_in:
            # Get the asset
            asset = db.query(Asset).filter(
                Asset.id == movement_in.asset_id,
                Asset.company_id == current_user.company_id
            ).first()
            
            if not asset:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Asset {movement_in.asset_id} not found"
                )
            
            if asset.asset_type != "consumable":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Asset {asset.id} is not a consumable"
                )
            
            # Record stock before
            stock_before = asset.current_stock or Decimal('0.0')
            
            # Calculate total cost
            total_cost = None
            if movement_in.unit_cost:
                total_cost = abs(movement_in.quantity) * movement_in.unit_cost
            
            # Create movement
            movement = StockMovement(
                **movement_in.dict(),
                company_id=current_user.company_id,
                stock_before=stock_before,
                total_cost=total_cost,
                created_by=current_user.id
            )
            
            # Update stock
            new_stock = stock_before + movement_in.quantity
            
            if new_stock < 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Insufficient stock for asset {asset.id}"
                )
            
            movement.stock_after = new_stock
            asset.current_stock = new_stock
            
            # Update status
            if new_stock <= 0:
                asset.status = "out_of_stock"
            elif asset.status == "out_of_stock" and new_stock > 0:
                asset.status = "active"
            
            db.add(movement)
            created_movements.append(movement)
        
        db.commit()
        
        for movement in created_movements:
            db.refresh(movement)
        
        logger.info(f"Created {len(created_movements)} stock movements in bulk")
        return created_movements
        
    except Exception as e:
        db.rollback()
        logger.error(f"Bulk stock movement creation failed: {str(e)}")
        raise

@router.get("/task/{task_id}", response_model=List[schemas.StockMovementResponse])
def get_task_stock_movements(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all stock movements associated with a task"""
    movements = db.query(StockMovement).filter(
        StockMovement.task_id == task_id,
        StockMovement.company_id == current_user.company_id
    ).order_by(desc(StockMovement.movement_date)).all()
    
    return movements

@router.get("/block/{block_id}", response_model=List[schemas.StockMovementResponse])
def get_block_stock_movements(
    block_id: int,
    days: int = Query(default=90, description="Number of days to look back"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all stock movements for a specific block"""
    cutoff_date = date.today() - timedelta(days=days)
    
    movements = db.query(StockMovement).filter(
        StockMovement.block_id == block_id,
        StockMovement.company_id == current_user.company_id,
        StockMovement.movement_date >= cutoff_date
    ).order_by(desc(StockMovement.movement_date)).all()
    
    return movements