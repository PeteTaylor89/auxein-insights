# app/api/v1/blocks.py - Essential endpoints only
from typing import List, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from geoalchemy2.shape import to_shape, from_shape
from shapely.geometry import mapping, shape, LineString, Polygon, MultiPolygon
from shapely.ops import split
from api.deps import get_db, get_current_user
from db.models.user import User
from db.models.block import VineyardBlock
from schemas.block import Block, BlockCreate, BlockUpdate
import logging
from datetime import datetime
from services.blockchain_service import BlockchainService
from pyproj import Geod
GEOD = Geod(ellps="WGS84")

logger = logging.getLogger(__name__)

router = APIRouter()

def area_ha(geom) -> float:
    """Return area in hectares for a shapely Polygon/MultiPolygon (WGS84 lon/lat)."""
    if isinstance(geom, (Polygon, MultiPolygon)):
        # geometry_area_perimeter returns signed area in m^2 (negative for clockwise)
        area_m2, _ = GEOD.geometry_area_perimeter(geom)
        return abs(area_m2) / 10_000.0
    return 0.0

@router.get("/geojson", response_model=dict)
def get_all_blocks_geojson(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = 1000
):
    """
    Get all blocks as GeoJSON FeatureCollection for map display
    """
    blocks = db.query(VineyardBlock).all()
    
    features = []
    for block in blocks:
        if block.geometry:
            try:
                shape = to_shape(block.geometry)
                feature = {
                    "type": "Feature",
                    "geometry": mapping(shape),
                    "properties": {
                        "id": block.id,
                        "block_name": block.block_name,
                        "variety": block.variety,
                        "area": block.area,
                        "region": block.region,
                        "winery": block.winery,
                        "organic": block.organic,
                        "planted_date": str(block.planted_date) if block.planted_date else None,
                        "company_id": block.company_id,
                        "centroid_longitude": block.centroid_longitude,
                        "centroid_latitude": block.centroid_latitude
                    }
                }
                features.append(feature)
            except Exception as e:
                logger.error(f"Error processing block {block.id} geometry: {e}")
                continue
    
    return {
        "type": "FeatureCollection",
        "features": features
    }

@router.get("/company")
def get_company_blocks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get blocks that match the current user's company_id
    """
    if not current_user.company_id:
        return {"blocks": [], "message": "User has no company association"}
    
    blocks = db.query(VineyardBlock).filter(
        VineyardBlock.company_id == current_user.company_id
    ).all()
    
    # Convert SQLAlchemy objects to dictionaries
    block_list = []
    for block in blocks:
        block_dict = {
            "id": block.id,
            "block_name": block.block_name,
            "variety": block.variety,
            "clone": block.clone,
            "planted_date": str(block.planted_date) if block.planted_date else None,
            "removed_date": str(block.removed_date) if block.removed_date else None,
            "row_spacing": block.row_spacing,
            "vine_spacing": block.vine_spacing,
            "area": block.area,
            "region": block.region,
            "swnz": block.swnz,
            "organic": block.organic,
            "winery": block.winery,
            "gi": block.gi,
            "elevation": block.elevation,
            "centroid_longitude": block.centroid_longitude,
            "centroid_latitude": block.centroid_latitude,
            "company_id": block.company_id
        }
        block_list.append(block_dict)
    
    return {"blocks": block_list, "count": len(block_list)}

@router.get("/{block_id}")
def get_block_by_id(
    block_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get detailed block data by ID
    """
    block = db.query(VineyardBlock).filter(VineyardBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    
    # Build response with all block data
    result = {
        "id": block.id,
        "block_name": block.block_name,
        "variety": block.variety,
        "clone": block.clone,
        "planted_date": block.planted_date,
        "removed_date": block.removed_date,
        "row_spacing": block.row_spacing,
        "vine_spacing": block.vine_spacing,
        "area": block.area,
        "region": block.region,
        "swnz": block.swnz,
        "organic": block.organic,
        "winery": block.winery,
        "gi": block.gi,
        "elevation": block.elevation,
        "centroid_longitude": block.centroid_longitude,
        "centroid_latitude": block.centroid_latitude,
        "company_id": block.company_id,
        "geometry_geojson": None,
        "row_start": block.row_start,
        "row_end": block.row_end,
        "row_count": block.row_count,
        "training_system": block.training_system,
        "rootstock": block.rootstock,
    }
    
    # Add geometry if available
    if block.geometry:
        try:
            shape = to_shape(block.geometry)
            result["geometry_geojson"] = mapping(shape)
        except Exception as e:
            logger.error(f"Error converting geometry for block {block_id}: {e}")
    
    return result

@router.put("/{block_id}")
def update_block_data(
    block_id: int,
    block_update: BlockUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update non-spatial block data
    """
    block = db.query(VineyardBlock).filter(VineyardBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    
    # Get update data, excluding geometry
    update_data = block_update.dict(exclude_unset=True)
    if 'geometry' in update_data:
        del update_data['geometry']
    
    # Apply updates
    for key, value in update_data.items():
        if hasattr(block, key):
            setattr(block, key, value)
    
    try:
        db.commit()
        db.refresh(block)
        logger.info(f"Block {block_id} updated successfully")
        
        return {
            "id": block.id,
            "block_name": block.block_name,
            "variety": block.variety,
            "clone": block.clone,
            "planted_date": block.planted_date,
            "removed_date": block.removed_date,
            "row_spacing": block.row_spacing,
            "vine_spacing": block.vine_spacing,
            "area": block.area,
            "region": block.region,
            "swnz": block.swnz,
            "organic": block.organic,
            "winery": block.winery,
            "gi": block.gi,
            "elevation": block.elevation,
            "centroid_longitude": block.centroid_longitude,
            "centroid_latitude": block.centroid_latitude,
            "company_id": block.company_id
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating block {block_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating block: {str(e)}")

@router.post("/{block_id}/create-blockchain")
def manually_create_blockchain(
    block_id: int,
    blockchain_request: Dict = Body(default={"season_type": "standard"}),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Manually create a blockchain chain for a block (admin only)
    """
    # Check admin permissions
    if current_user.email != "pete.taylor@auxein.co.nz":
        raise HTTPException(
            status_code=403,
            detail="Only system administrators can manually create blockchain chains"
        )
    
    # Verify block exists
    block = db.query(VineyardBlock).filter(VineyardBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    
    if not block.company_id:
        raise HTTPException(status_code=400, detail="Block must be assigned to a company first")
    
    season_type = blockchain_request.get("season_type", "standard")
    
    try:
        # Check if chain already exists
        existing_chain = BlockchainService.get_active_chain_for_block(db, block_id)
        if existing_chain:
            return {
                "message": "Blockchain chain already exists",
                "chain_id": existing_chain.id,
                "season_id": existing_chain.season_id
            }
        
        # Create new chain
        chain = BlockchainService.auto_create_chain_on_assignment(
            db, block_id, block.company_id, current_user.id, season_type
        )
        
        return {
            "message": "Blockchain chain created successfully",
            "chain_id": chain.id,
            "season_id": chain.season_id,
            "season_type": chain.season_type,
            "genesis_hash": chain.genesis_hash[:16] + "..."
        }
        
    except Exception as e:
        logger.error(f"Manual blockchain creation failed for block {block_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Blockchain creation failed: {str(e)}")

# Also enhance your create_block endpoint to auto-create blockchain:

@router.post("/")
def create_block_with_polygon(
    block_data: BlockCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        # Extract geometry data before creating model instance
        geometry_data = block_data.dict().pop("geometry", None)
        
        # Create new block with remaining data
        new_block = VineyardBlock(**block_data.dict(exclude={"geometry"}))
        
        # Set company_id from current user if not provided
        if not new_block.company_id and current_user.company_id:
            new_block.company_id = current_user.company_id
        
        # Process geometry if provided
        if geometry_data:
            from shapely.geometry import shape
            from geoalchemy2.shape import from_shape
            
            # Convert GeoJSON to shapely geometry
            shapely_geom = shape(geometry_data)
            
            # Convert shapely to database geometry (assuming SRID 4326/WGS84)
            new_block.geometry = from_shape(shapely_geom, srid=4326)
        
        db.add(new_block)
        db.commit()
        db.refresh(new_block)
        
        logger.info(f"New block created with ID: {new_block.id}")
        
        # AUTO-CREATE BLOCKCHAIN if block has company
        blockchain_created = False
        blockchain_info = {}
        
        if new_block.company_id:
            try:
                chain = BlockchainService.auto_create_chain_on_assignment(
                    db, new_block.id, new_block.company_id, current_user.id, "standard"
                )
                blockchain_created = True
                blockchain_info = {
                    "chain_id": chain.id,
                    "season_id": chain.season_id,
                    "genesis_hash": chain.genesis_hash[:16] + "..."
                }
                logger.info(f"Auto-created blockchain chain {chain.id} for new block {new_block.id}")
            except Exception as e:
                logger.error(f"Blockchain creation failed for new block {new_block.id}: {e}")
        
        response = {
            "id": new_block.id,
            "block_name": new_block.block_name,
            "variety": new_block.variety,
            "area": new_block.area,
            "company_id": new_block.company_id,
            "message": "Block created successfully",
            "blockchain_created": blockchain_created
        }
        
        if blockchain_info:
            response["blockchain_info"] = blockchain_info
        
        return response
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating block: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating block: {str(e)}")

@router.patch("/{block_id}/assign-company")
def assign_block_to_company(
    block_id: int,
    assignment_data: Dict[str, int] = Body(..., example={"company_id": 1, "season_type": "standard"}),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Assign a block to a company (admin only) and auto-create blockchain chain
    """
    # Check admin permissions - only pete.taylor@auxein.co.nz can assign
    if current_user.email != "pete.taylor@auxein.co.nz":
        raise HTTPException(
            status_code=403,
            detail="Only system administrators can assign blocks to companies"
        )
    
    # Get the block
    block = db.query(VineyardBlock).filter(VineyardBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    
    # Get the company_id from request body
    new_company_id = assignment_data.get("company_id")
    season_type = assignment_data.get("season_type", "standard")  # Optional season type
    
    if not new_company_id:
        raise HTTPException(status_code=400, detail="Company ID is required")
       
    # Check if block is already assigned to this company
    if block.company_id == new_company_id:
        raise HTTPException(
            status_code=400, 
            detail="Block is already assigned to this company"
        )
    
    try:
        # Log the ownership change
        old_company_id = block.company_id
        logger.info(
            f"Admin {current_user.id} assigning block {block_id} "
            f"from company {old_company_id} to company {new_company_id}"
        )
        
        # Update the block's company_id
        block.company_id = new_company_id
        
        # AUTO-CREATE BLOCKCHAIN CHAIN
        blockchain_created = False
        blockchain_info = {}
        
        try:
            if old_company_id is None:
                # First time assignment - create new blockchain chain
                logger.info(f"Creating new blockchain chain for block {block_id}")
                chain = BlockchainService.auto_create_chain_on_assignment(
                    db, block_id, new_company_id, current_user.id, season_type
                )
                blockchain_created = True
                blockchain_info = {
                    "chain_id": chain.id,
                    "season_id": chain.season_id,
                    "season_type": chain.season_type,
                    "genesis_hash": chain.genesis_hash[:16] + "..."
                }
                logger.info(f"Created blockchain chain {chain.id} for block {block_id}")
                
            elif old_company_id != new_company_id:
                # Reassignment - archive old chain and create new one
                logger.info(f"Reassigning block {block_id} from company {old_company_id} to {new_company_id}")
                chain = BlockchainService.handle_company_reassignment(
                    db, block_id, old_company_id, new_company_id, current_user.id
                )
                blockchain_created = True
                blockchain_info = {
                    "chain_id": chain.id,
                    "season_id": chain.season_id,
                    "season_type": chain.season_type,
                    "genesis_hash": chain.genesis_hash[:16] + "...",
                    "reassignment": True
                }
                logger.info(f"Created new blockchain chain {chain.id} after reassignment")
                
        except Exception as blockchain_error:
            # Log blockchain error but don't fail the assignment
            logger.error(f"Blockchain creation failed for block {block_id}: {str(blockchain_error)}")
            blockchain_info = {"error": str(blockchain_error)}
        
        db.commit()
        db.refresh(block)
        
        # Enhanced response with blockchain info
        response = {
            "id": block.id,
            "block_name": block.block_name,
            "company_id": block.company_id,
            "previous_company_id": old_company_id,
            "message": f"Block successfully assigned to {new_company_id}",
            "blockchain_created": blockchain_created
        }
        
        # Add blockchain info to response
        if blockchain_info:
            response["blockchain_info"] = blockchain_info
        
        return response
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error assigning block {block_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error assigning block: {str(e)}")

# Also add these new endpoints to your blocks.py file:

@router.get("/{block_id}/blockchain-status")
def get_block_blockchain_status(
    block_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get blockchain status for a vineyard block
    """
    # Verify block exists
    block = db.query(VineyardBlock).filter(VineyardBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    
    # Get active blockchain chain
    try:
        chain = BlockchainService.get_active_chain_for_block(db, block_id)
        
        if not chain:
            return {
                "block_id": block_id,
                "has_blockchain": False,
                "message": "No active blockchain chain found"
            }
        
        # Get chain statistics
        node_count = len(chain.nodes) if chain.nodes else 0
        
        return {
            "block_id": block_id,
            "has_blockchain": True,
            "chain_id": chain.id,
            "season_id": chain.season_id,
            "season_type": chain.season_type,
            "node_count": node_count,
            "created_at": chain.created_at.isoformat(),
            "genesis_hash": chain.genesis_hash[:16] + "...",
            "is_active": chain.is_active,
            "company_id": chain.company_id
        }
        
    except Exception as e:
        logger.error(f"Error getting blockchain status for block {block_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Could not retrieve blockchain status")

@router.post("/{block_id}/split")
def split_block(
    block_id: int,
    split_data: Dict = Body(..., example={
        "split_line": {
            "type": "LineString",
            "coordinates": [[174.0, -41.0], [174.1, -41.1]]
        }
    }),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Split a block into two blocks using a line
    """
    # Get the original block
    original_block = db.query(VineyardBlock).filter(VineyardBlock.id == block_id).first()
    if not original_block:
        raise HTTPException(status_code=404, detail="Block not found")
    
       # Check permissions (allow same-company; optionally allow admins)
    is_admin = getattr(current_user, "is_admin", False) or \
               ("admin" in (getattr(current_user, "roles", []) or []))
    if not is_admin and original_block.company_id != current_user.company_id:
        raise HTTPException(
            status_code=403,
            detail="You can only split blocks owned by your company"
        )

    # Get the split line from request
    split_line_geojson = split_data.get("split_line")
    if not split_line_geojson:
        raise HTTPException(status_code=400, detail="Split line geometry required")

    try:
        # Convert geometries to shapely objects
        block_shape = to_shape(original_block.geometry)  # Polygon/MultiPolygon
        line_shape = shape(split_line_geojson if "type" in split_line_geojson else {"type":"Feature","geometry":split_line_geojson})

        # Perform the split (shapely.ops.split)
        split_parts = split(block_shape, line_shape)

        if not split_parts or len(split_parts.geoms) < 2:
            raise HTTPException(status_code=400, detail="Split did not produce multiple parts")

        # Build list of parts with areas (m^2)
        parts = []
        for geom in split_parts.geoms:
            # Ignore zero/near-zero slivers
            if geom.area <= 0:
                continue
            parts.append(geom)
        if len(parts) < 2:
            raise HTTPException(status_code=422, detail="Split resulted in invalid or zero-area parts")

        # Choose the largest part to become the UPDATED original block
        parts_sorted = sorted(parts, key=lambda g: g.area, reverse=True)
        largest = parts_sorted[0]
        children = parts_sorted[1:]

        original_block.geometry = from_shape(largest, srid=4326)
        largest_centroid = largest.centroid
        original_block.centroid_longitude = float(largest_centroid.x)
        original_block.centroid_latitude  = float(largest_centroid.y)

        original_block.area = area_ha(largest)

        db.add(original_block)

        # OPTIONALLY: copy naming scheme for the new child(ren)
        def child_name(base: str, index: int) -> str:
            # e.g., "BlockName (Split B)", "BlockName (Split C)" etc.
            suffix = chr(ord('A') + index)  # A, B, C...
            return f"{base} (Split {suffix})"

        new_blocks = []
        for idx, geom in enumerate(children):
            new_block = VineyardBlock(
                block_name = child_name(original_block.block_name or "Block", idx),
                variety = original_block.variety,
                clone = original_block.clone,
                rootstock = getattr(original_block, "rootstock", None),
                planted_date = original_block.planted_date,
                removed_date = None,
                row_spacing = original_block.row_spacing,
                vine_spacing = original_block.vine_spacing,
                area = area_ha(geom),  # <-- set geodesic area (ha)
                region = original_block.region,
                swnz = original_block.swnz,
                organic = original_block.organic,
                winery = original_block.winery,
                gi = original_block.gi,
                elevation = original_block.elevation,
                centroid_longitude = float(geom.centroid.x),
                centroid_latitude = float(geom.centroid.y),
                company_id = original_block.company_id,
                geometry = from_shape(geom, srid=4326)
            )
            db.add(new_block)
            db.flush()  # get new_block.id for chain creation
            new_blocks.append(new_block)

        try:
            existing_chain = BlockchainService.get_active_chain_for_block(db, original_block.id)
        except Exception:
            existing_chain = None

        if existing_chain:
            season_type = getattr(existing_chain, "season_type", "standard")
            for nb in new_blocks:
                BlockchainService.auto_create_chain_on_assignment(
                    db, nb.id, nb.company_id, current_user.id, season_type
                )

        db.commit()

        # Build response summary
        response_blocks = [{
            "id": nb.id,
            "block_name": nb.block_name,
            "company_id": nb.company_id
        } for nb in new_blocks]

        return {
            "message": f"Block split successfully into {1 + len(new_blocks)} parts",
            "updated_block_id": original_block.id,
            "new_blocks": response_blocks
        }

    except HTTPException:
        # passthrough
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error splitting block {block_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error splitting block: {str(e)}")
