# app/api/v1/vineyard_rows.py - Enhanced version
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from db.session import get_db
from db.models.vineyard_row import VineyardRow
from db.models.block import VineyardBlock
from schemas.vineyard_row import (
    VineyardRow as VineyardRowSchema,
    VineyardRowCreate,
    VineyardRowUpdate,
    VineyardRowWithBlock,
    VineyardRowFilter,
    BulkRowCreationRequest,
    BulkRowCreationResponse,
    ClonalSection
)
from utils.geometry_helpers import geojson_to_geometry
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

def generate_row_numbers(start: str, end: str, count: int) -> List[str]:
    """Generate row numbers between start and end"""
    try:
        start_num = int(start)
        end_num = int(end)
        if end_num - start_num + 1 != count:
            raise ValueError(f"Row count {count} doesn't match range {start}-{end}")
        return [str(i) for i in range(start_num, end_num + 1)]
    except ValueError:
        if len(start) == 1 and len(end) == 1 and start.isalpha() and end.isalpha():
            start_ord = ord(start.upper())
            end_ord = ord(end.upper())
            if end_ord - start_ord + 1 != count:
                raise ValueError(f"Row count {count} doesn't match range {start}-{end}")
            return [chr(i) for i in range(start_ord, end_ord + 1)]
        else:
            raise ValueError("Invalid row range format")

# NEW: Enhanced bulk creation endpoint
@router.post("/bulk-create", response_model=BulkRowCreationResponse)
def bulk_create_rows(
    request: BulkRowCreationRequest,
    db: Session = Depends(get_db)
):
    """
    Bulk create rows with variety and clone information.
    This endpoint creates multiple rows at once based on the provided range.
    """
    # Verify block exists
    block = db.query(VineyardBlock).filter(VineyardBlock.id == request.block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    
    # Check for existing rows
    existing_rows = db.query(VineyardRow).filter(VineyardRow.block_id == request.block_id).count()
    if existing_rows > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Block already has {existing_rows} rows. Delete existing rows first or use update endpoints."
        )
    
    # Generate row numbers
    try:
        row_numbers = generate_row_numbers(request.row_start, request.row_end, request.row_count)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    # Create rows
    created_rows = []
    for row_number in row_numbers:
        row_data = {
            "block_id": request.block_id,
            "row_number": row_number,
            "variety": request.variety or block.variety,
            "clone": request.clone or block.clone,
            "rootstock": request.rootstock or block.rootstock,
            "vine_spacing": request.vine_spacing or block.vine_spacing
        }
        
        db_row = VineyardRow(**row_data)
        db.add(db_row)
        created_rows.append(db_row)
    
    db.commit()
    
    # Refresh all rows to get IDs
    for row in created_rows:
        db.refresh(row)
    
    logger.info(f"Bulk created {len(created_rows)} rows for block {request.block_id}")
    
    return BulkRowCreationResponse(
        created_rows=len(created_rows),
        rows=created_rows,
        message=f"Successfully created {len(created_rows)} rows"
    )

# NEW: Update row with clonal sections
@router.put("/{row_id}/clonal-sections", response_model=VineyardRowSchema)
def update_row_clonal_sections(
    row_id: int,
    sections: List[ClonalSection],
    db: Session = Depends(get_db)
):
    """
    Update a row with multiple clonal sections.
    This allows specifying different clones/rootstocks for different parts of the row.
    """
    db_row = db.query(VineyardRow).filter(VineyardRow.id == row_id).first()
    if not db_row:
        raise HTTPException(status_code=404, detail="Row not found")
    
    # Validate sections don't overlap
    sections_sorted = sorted(sections, key=lambda x: x.start_vine)
    for i in range(len(sections_sorted) - 1):
        if sections_sorted[i].end_vine >= sections_sorted[i + 1].start_vine:
            raise HTTPException(
                status_code=400,
                detail=f"Overlapping sections: vines {sections_sorted[i].end_vine} and {sections_sorted[i + 1].start_vine}"
            )
    
    # Convert to dict for JSON storage
    db_row.clonal_sections = [section.model_dump() for section in sections]
    
    db.commit()
    db.refresh(db_row)
    return db_row

# Enhanced get all rows with new filters
@router.get("/", response_model=List[VineyardRowSchema])
def get_all_rows(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    variety: Optional[str] = None,
    clone: Optional[str] = None,
    rootstock: Optional[str] = None,
    block_id: Optional[int] = None,
    has_geometry: Optional[bool] = None,
    has_multiple_clones: Optional[bool] = None,  # NEW
    db: Session = Depends(get_db)
):
    """Get all vineyard rows with optional filtering"""
    query = db.query(VineyardRow)
    
    if variety:
        query = query.filter(VineyardRow.variety == variety)
    if clone:
        query = query.filter(VineyardRow.clone == clone)
    if rootstock:
        query = query.filter(VineyardRow.rootstock == rootstock)
    if block_id:
        query = query.filter(VineyardRow.block_id == block_id)
    
    if has_geometry is not None:
        if has_geometry:
            query = query.filter(VineyardRow.geometry.isnot(None))
        else:
            query = query.filter(VineyardRow.geometry.is_(None))
    
    # NEW: Filter for rows with multiple clones
    if has_multiple_clones is not None:
        if has_multiple_clones:
            query = query.filter(VineyardRow.clonal_sections.isnot(None))
        else:
            query = query.filter(VineyardRow.clonal_sections.is_(None))
    
    return query.offset(skip).limit(limit).all()

# NEW: Get clone information at specific position
@router.get("/{row_id}/clone-at-vine/{vine_number}")
def get_clone_at_vine_position(
    row_id: int,
    vine_number: int,
    db: Session = Depends(get_db)
):
    """Get the clone/rootstock information at a specific vine position in a row"""
    row = db.query(VineyardRow).filter(VineyardRow.id == row_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Row not found")
    
    if row.vine_count and vine_number > row.vine_count:
        raise HTTPException(
            status_code=400,
            detail=f"Vine number {vine_number} exceeds row vine count of {row.vine_count}"
        )
    
    clone_info = row.get_clone_at_position(vine_number)
    
    return {
        "row_id": row_id,
        "vine_number": vine_number,
        "clone": clone_info["clone"],
        "rootstock": clone_info["rootstock"],
        "has_multiple_clones": row.has_multiple_clones
    }

# Enhanced statistics endpoint
@router.get("/stats/by-block/{block_id}")
def get_row_stats_by_block(block_id: int, db: Session = Depends(get_db)):
    """Get enhanced statistics for rows in a block"""
    block = db.query(VineyardBlock).filter(VineyardBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    
    rows = db.query(VineyardRow).filter(VineyardRow.block_id == block_id).all()
    
    if not rows:
        return {
            "block_id": block_id,
            "total_rows": 0,
            "total_vines": 0,
            "average_vine_spacing": None,
            "average_row_length": None,
            "varieties": [],
            "clones": [],
            "rootstocks": [],
            "rows_with_geometry": 0,
            "rows_with_multiple_clones": 0,
            "geometry_coverage_percentage": 0
        }
    
    total_vines = sum(row.vine_count or 0 for row in rows)
    vine_spacings = [row.vine_spacing for row in rows if row.vine_spacing]
    row_lengths = [row.row_length for row in rows if row.row_length]
    varieties = list(set(row.variety for row in rows if row.variety))
    clones = list(set(row.clone for row in rows if row.clone))
    rootstocks = list(set(row.rootstock for row in rows if row.rootstock))
    
    rows_with_geometry = sum(1 for row in rows if row.geometry is not None)
    rows_with_multiple_clones = sum(1 for row in rows if row.has_multiple_clones)
    geometry_coverage = (rows_with_geometry / len(rows)) * 100 if rows else 0
    
    return {
        "block_id": block_id,
        "total_rows": len(rows),
        "total_vines": total_vines,
        "average_vine_spacing": sum(vine_spacings) / len(vine_spacings) if vine_spacings else None,
        "average_row_length": sum(row_lengths) / len(row_lengths) if row_lengths else None,
        "varieties": varieties,
        "clones": clones,
        "rootstocks": rootstocks,
        "rows_with_geometry": rows_with_geometry,
        "rows_with_multiple_clones": rows_with_multiple_clones,
        "geometry_coverage_percentage": round(geometry_coverage, 1)
    }

# Existing endpoints remain unchanged but inherit new model capabilities
@router.post("/create-row-set/{block_id}", response_model=List[VineyardRowSchema])
def create_row_set(
    block_id: int,
    db: Session = Depends(get_db)
):
    """Create a complete set of rows for a block based on block's row_start, row_end, and row_count."""
    block = db.query(VineyardBlock).filter(VineyardBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    
    if not all([block.row_start, block.row_end, block.row_count]):
        raise HTTPException(
            status_code=400, 
            detail="Block must have row_start, row_end, and row_count populated"
        )
    
    existing_rows = db.query(VineyardRow).filter(VineyardRow.block_id == block_id).count()
    if existing_rows > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Block already has {existing_rows} rows. Delete existing rows first."
        )
    
    try:
        row_numbers = generate_row_numbers(block.row_start, block.row_end, block.row_count)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    created_rows = []
    for row_number in row_numbers:
        row_data = VineyardRowCreate(
            block_id=block_id,
            row_number=row_number,
            variety=block.variety,
            clone=block.clone,
            rootstock=block.rootstock,  # Now uses separate rootstock field
            vine_spacing=block.vine_spacing
        )
        
        db_row = VineyardRow(**row_data.model_dump())
        db.add(db_row)
        created_rows.append(db_row)
    
    db.commit()
    
    for row in created_rows:
        db.refresh(row)
    
    return created_rows

# Keep all other existing endpoints as they are...
@router.get("/by-block/{block_id}", response_model=List[VineyardRowSchema])
def get_rows_by_block(block_id: int, db: Session = Depends(get_db)):
    """Get all rows for a specific block"""
    block = db.query(VineyardBlock).filter(VineyardBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    
    rows = db.query(VineyardRow).filter(VineyardRow.block_id == block_id).order_by(VineyardRow.row_number).all()
    return rows

@router.get("/{row_id}", response_model=VineyardRowWithBlock)
def get_row(row_id: int, db: Session = Depends(get_db)):
    """Get a specific row with block details"""
    row = db.query(VineyardRow).filter(VineyardRow.id == row_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Row not found")
    return row

@router.post("/", response_model=VineyardRowSchema)
def create_row(
    row: VineyardRowCreate,
    db: Session = Depends(get_db)
):
    """Create a single vineyard row"""
    block = db.query(VineyardBlock).filter(VineyardBlock.id == row.block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    
    if row.row_number:
        existing_row = db.query(VineyardRow).filter(
            and_(
                VineyardRow.block_id == row.block_id,
                VineyardRow.row_number == row.row_number
            )
        ).first()
        if existing_row:
            raise HTTPException(
                status_code=400,
                detail=f"Row number {row.row_number} already exists in this block"
            )
    
    geometry = geojson_to_geometry(row.geometry) if row.geometry else None
    
    row_data = row.model_dump(exclude={'geometry'})
    db_row = VineyardRow(**row_data, geometry=geometry)
    
    db.add(db_row)
    db.commit()
    db.refresh(db_row)
    return db_row

@router.patch("/{row_id}", response_model=VineyardRowSchema)
def update_row(
    row_id: int,
    row_update: VineyardRowUpdate,
    db: Session = Depends(get_db)
):
    """Update a vineyard row"""
    db_row = db.query(VineyardRow).filter(VineyardRow.id == row_id).first()
    if not db_row:
        raise HTTPException(status_code=404, detail="Row not found")
    
    if row_update.row_number and row_update.row_number != db_row.row_number:
        existing_row = db.query(VineyardRow).filter(
            and_(
                VineyardRow.block_id == db_row.block_id,
                VineyardRow.row_number == row_update.row_number,
                VineyardRow.id != row_id
            )
        ).first()
        if existing_row:
            raise HTTPException(
                status_code=400,
                detail=f"Row number {row_update.row_number} already exists in this block"
            )
    
    update_data = row_update.model_dump(exclude_unset=True, exclude={'geometry'})
    for field, value in update_data.items():
        setattr(db_row, field, value)
    
    if row_update.geometry is not None:
        db_row.geometry = geojson_to_geometry(row_update.geometry)
    
    db.commit()
    db.refresh(db_row)
    return db_row

@router.delete("/{row_id}")
def delete_row(row_id: int, db: Session = Depends(get_db)):
    """Delete a vineyard row"""
    db_row = db.query(VineyardRow).filter(VineyardRow.id == row_id).first()
    if not db_row:
        raise HTTPException(status_code=404, detail="Row not found")
    
    db.delete(db_row)
    db.commit()
    return {"message": "Row deleted successfully"}

@router.delete("/by-block/{block_id}")
def delete_all_rows_by_block(block_id: int, db: Session = Depends(get_db)):
    """Delete all rows for a specific block"""
    block = db.query(VineyardBlock).filter(VineyardBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    
    deleted_count = db.query(VineyardRow).filter(VineyardRow.block_id == block_id).delete()
    db.commit()
    
    return {"message": f"Deleted {deleted_count} rows from block {block_id}"}

@router.put("/{row_id}/geometry", response_model=VineyardRowSchema)
def update_row_geometry(
    row_id: int,
    geometry: dict,
    db: Session = Depends(get_db)
):
    """Update only the geometry of a specific row"""
    db_row = db.query(VineyardRow).filter(VineyardRow.id == row_id).first()
    if not db_row:
        raise HTTPException(status_code=404, detail="Row not found")
    
    db_row.geometry = geojson_to_geometry(geometry)
    
    db.commit()
    db.refresh(db_row)
    return db_row

@router.delete("/{row_id}/geometry") 
def remove_row_geometry(
    row_id: int,
    db: Session = Depends(get_db)
):
    """Remove geometry from a specific row"""
    db_row = db.query(VineyardRow).filter(VineyardRow.id == row_id).first()
    if not db_row:
        raise HTTPException(status_code=404, detail="Row not found")
    
    db_row.geometry = None
    
    db.commit()
    return {"message": "Geometry removed successfully"}