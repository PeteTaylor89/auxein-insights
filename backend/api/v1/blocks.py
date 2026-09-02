# app/api/v1/blocks.py - Essential endpoints only
from typing import List, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException, Body, Query
from sqlalchemy.orm import Session
from geoalchemy2.shape import to_shape, from_shape
from shapely.geometry import mapping, shape, LineString, Polygon, MultiPolygon
from shapely.ops import split
from api.deps import get_db, get_current_user, get_current_user_or_contractor
from db.models.user import User
from db.models.contractor import Contractor
from db.models.contractor_relationship import ContractorRelationship
from db.models.property import Property
from db.models.block import VineyardBlock
from db.models.vineyard_row import VineyardRow
from schemas.block import (
    Block, BlockCreate, BlockUpdate,
    BlockImportRequest, BlockExportItem, BlockExportResponse,
    ImportResult, ImportRowError,
)
from services.property_service import get_visible_property_ids, verify_block_access
import logging
from datetime import datetime
from pyproj import Geod
from sqlalchemy import func, cast, or_, and_
from sqlalchemy.types import UserDefinedType
GEOD = Geod(ellps="WGS84")

logger = logging.getLogger(__name__)

router = APIRouter()

class Geography(UserDefinedType):
    """Custom type for PostGIS Geography casting"""
    def get_col_spec(self):
        return "GEOGRAPHY"

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
    actor=Depends(get_current_user_or_contractor),
    property_id: Optional[int] = Query(None),
    limit: int = 1000
):
    """
    Get all blocks as GeoJSON FeatureCollection for map display.

    Company users: scoped by visible properties with company_id fallback for
    unassigned blocks. Auxein admin sees everything.

    Contractors: scoped to blocks under properties owned by companies they
    have an active ContractorRelationship with. property_id is enforced to be
    one of those properties (rejected if the contractor has no claim on it),
    so the contractor map can't be coerced to leak a different property's data.
    """
    is_contractor = isinstance(actor, Contractor)

    if is_contractor:
        active_company_ids = [
            r.company_id for r in db.query(ContractorRelationship).filter(
                ContractorRelationship.contractor_id == actor.id,
                ContractorRelationship.status == "active",
            ).all()
        ]
        if not active_company_ids:
            return {"type": "FeatureCollection", "features": []}

        if property_id is not None:
            # Verify the contractor has access to this property
            prop = db.query(Property).filter(Property.id == property_id).first()
            if not prop or prop.owner_company_id not in active_company_ids:
                raise HTTPException(
                    status_code=403,
                    detail="No active relationship with this property's owner",
                )
            query = db.query(VineyardBlock).filter(VineyardBlock.property_id == property_id)
        else:
            # No specific property — return blocks across all accessible properties
            accessible_property_ids = [
                p.id for p in db.query(Property.id).filter(
                    Property.owner_company_id.in_(active_company_ids)
                ).all()
            ]
            if not accessible_property_ids:
                return {"type": "FeatureCollection", "features": []}
            query = db.query(VineyardBlock).filter(
                VineyardBlock.property_id.in_(accessible_property_ids)
            )
    else:
        current_user = actor
        is_admin = current_user.user_type == "auxein_admin"
        if is_admin:
            query = db.query(VineyardBlock)
        else:
            visible_ids = get_visible_property_ids(db, current_user)
            query = db.query(VineyardBlock).filter(
                or_(
                    VineyardBlock.property_id.in_(visible_ids) if visible_ids else False,
                    and_(
                        VineyardBlock.property_id.is_(None),
                        VineyardBlock.company_id == current_user.company_id
                    )
                )
            )
        if property_id is not None:
            query = query.filter(VineyardBlock.property_id == property_id)
    blocks = query.all()

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
                        "status": block.status,
                        "variety": block.variety,
                        "area": block.area,
                        "region": block.region,
                        "winery": block.winery,
                        "organic": block.organic,
                        "planted_date": str(block.planted_date) if block.planted_date else None,
                        "company_id": block.company_id,
                        "property_id": block.property_id,
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
    current_user: User = Depends(get_current_user),
    property_id: Optional[int] = Query(None),
):
    """
    Get blocks visible to the current user.
    Scoped by visible properties, with company_id fallback.
    """
    is_admin = current_user.user_type == "auxein_admin"
    if not is_admin and not current_user.company_id:
        return {"blocks": [], "message": "User has no company association"}

    if is_admin:
        query = db.query(VineyardBlock)
    else:
        visible_ids = get_visible_property_ids(db, current_user)
        query = db.query(VineyardBlock).filter(
            or_(
                VineyardBlock.property_id.in_(visible_ids) if visible_ids else False,
                and_(
                    VineyardBlock.property_id.is_(None),
                    VineyardBlock.company_id == current_user.company_id
                )
            )
        )
    if property_id is not None:
        query = query.filter(VineyardBlock.property_id == property_id)
    blocks = query.all()

    # Per-block actual row count (single aggregate query to avoid N+1)
    block_ids = [b.id for b in blocks]
    row_count_map = {}
    if block_ids:
        counts = db.query(
            VineyardRow.block_id, func.count(VineyardRow.id)
        ).filter(VineyardRow.block_id.in_(block_ids)).group_by(VineyardRow.block_id).all()
        row_count_map = {bid: c for bid, c in counts}

    # Convert SQLAlchemy objects to dictionaries
    block_list = []
    for block in blocks:
        block_dict = {
            "id": block.id,
            "block_name": block.block_name,
            "status": block.status,
            "variety": block.variety,
            "clone": block.clone,
            "rootstock": block.rootstock,
            "training_system": block.training_system,
            "planted_date": str(block.planted_date) if block.planted_date else None,
            "removed_date": str(block.removed_date) if block.removed_date else None,
            "row_spacing": block.row_spacing,
            "vine_spacing": block.vine_spacing,
            "row_start": block.row_start,
            "row_end": block.row_end,
            "row_count": row_count_map.get(block.id, 0),
            "area": block.area,
            "region": block.region,
            "swnz": block.swnz,
            "organic": block.organic,
            "biodynamic": block.biodynamic,
            "regenerative": block.regenerative,
            "winery": block.winery,
            "gi": block.gi,
            "elevation": block.elevation,
            "centroid_longitude": block.centroid_longitude,
            "centroid_latitude": block.centroid_latitude,
            "company_id": block.company_id,
            "property_id": block.property_id
        }
        block_list.append(block_dict)
    
    return {"blocks": block_list, "count": len(block_list)}

# ---------------------------------------------------------------------------
# Spreadsheet round-trip
# ---------------------------------------------------------------------------

# Fields a CSV line may write. An allowlist rather than "whatever the schema
# carries": geometry, centroids and company_id must never become writable from
# a spreadsheet cell, and adding one here has to be a deliberate act.
#
# BlockExportItem carries exactly these plus the read-only extras. Keep the two
# in step — a writable field missing from the export comes back as a blank cell,
# and a blank cell CLEARS. That is silent data loss, and it is what would have
# happened had the export reused /blocks/company, which omits `notes`.
IMPORTABLE_BLOCK_FIELDS = (
    "variety", "clone", "rootstock", "training_system", "status",
    "planted_date", "removed_date", "row_spacing", "vine_spacing",
    "row_start", "row_end", "area", "region", "gi", "winery", "elevation",
    "swnz", "organic", "biodynamic", "regenerative", "notes", "property_id",
)

BLOCK_STATUS_VALUES = (
    "developing", "pre_production", "producing", "redeveloping",
    "replanting", "mothballed", "retired",
)


def _block_name_key(name):
    """Normalise a block name for matching: trimmed and case-folded.

    Returns None for a blank name — a block with no name has nothing to match
    on and is deliberately unreachable from a name-keyed file.
    """
    if name is None:
        return None
    key = str(name).strip().lower()
    return key or None


def _visible_blocks(db: Session, current_user: User):
    """Every block this user may edit, on the same rule as verify_block_access.

    The NULL-property branch matters: a company that owns no properties holds
    all its blocks with property_id NULL, and dropping that branch would show
    such a company an empty register.
    """
    if current_user.user_type == "auxein_admin":
        return db.query(VineyardBlock).all()

    visible_ids = get_visible_property_ids(db, current_user)
    conditions = [
        and_(
            VineyardBlock.property_id.is_(None),
            VineyardBlock.company_id == current_user.company_id,
        )
    ]
    if visible_ids:
        conditions.append(VineyardBlock.property_id.in_(visible_ids))
    return db.query(VineyardBlock).filter(or_(*conditions)).all()


@router.get("/export", response_model=BlockExportResponse)
def export_blocks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Every block this user can edit, in the shape the spreadsheet uses.

    A separate endpoint rather than reusing /blocks/company, for one specific
    reason: that response omits `notes`, and an export missing a writable
    column comes back as a blank cell that CLEARS it. Defining the export
    alongside IMPORTABLE_BLOCK_FIELDS keeps the two from drifting apart.

    Unnamed blocks are excluded and counted. `block_name` is the key, so a
    nameless block cannot appear in the file — reporting the count lets the UI
    say "22 blocks, 1 exported" instead of looking broken.

    Declared before /{block_id} so "export" is never parsed as an id.
    """
    blocks = _visible_blocks(db, current_user)

    named = [b for b in blocks if _block_name_key(b.block_name) is not None]
    unnamed = len(blocks) - len(named)

    # One aggregate rather than a count per block.
    row_counts = {}
    if named:
        counts = db.query(
            VineyardRow.block_id, func.count(VineyardRow.id)
        ).filter(VineyardRow.block_id.in_([b.id for b in named])).group_by(VineyardRow.block_id).all()
        row_counts = {bid: c for bid, c in counts}

    items = [
        BlockExportItem(
            block_name=b.block_name,
            row_count=row_counts.get(b.id, 0),
            **{f: getattr(b, f) for f in IMPORTABLE_BLOCK_FIELDS},
        )
        for b in named
    ]
    items.sort(key=lambda i: (i.block_name or "").lower())

    return BlockExportResponse(blocks=items, unnamed_count=unnamed)


@router.post("/import", response_model=ImportResult)
def import_blocks(
    payload: BlockImportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update blocks from a parsed CSV. UPDATE ONLY — this never creates one.

    A block without geometry is not a block anyone can work with: it does not
    appear on the map, it cannot be split, and nothing spatial resolves against
    it. A CSV cannot supply geometry, so allowing creation here would build a
    register of shapeless entries that look real in a list and are absent
    everywhere else. Blocks are drawn on the map; the spreadsheet edits their
    attributes.

    Lines are matched on `block_name`, case-insensitively and trimmed. Two
    consequences are enforced rather than smoothed over:

      - A block with no name cannot be reached. It has nothing to match on.
        Name it on screen and it joins the next export.
      - Two blocks sharing a name are ambiguous, and the line is refused rather
        than applied to whichever came back first.

    NOTHING IS EVER DELETED HERE. A block missing from the file is untouched.

    Declared before /{block_id} routes so "import" is never parsed as an id.
    """
    if not payload.rows:
        raise HTTPException(status_code=400, detail="No rows to import")

    if not current_user.has_permission("blocks", "update"):
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to update blocks",
        )

    blocks = _visible_blocks(db, current_user)
    by_name = {}
    ambiguous = set()
    for b in blocks:
        key = _block_name_key(b.block_name)
        if key is None:
            continue
        if key in by_name:
            ambiguous.add(key)
        else:
            by_name[key] = b

    visible_properties = get_visible_property_ids(db, current_user)
    is_admin = current_user.user_type == "auxein_admin"

    errors = []
    updates = []
    seen = {}

    for row in payload.rows:
        problems = []
        provided = row.model_fields_set
        fields = {f: getattr(row, f) for f in IMPORTABLE_BLOCK_FIELDS if f in provided}

        name = (row.block_name or "").strip()
        key = _block_name_key(name)
        target = None

        if key is None:
            problems.append("block_name is required — it is how this line finds its block")
        else:
            if key in seen:
                problems.append(
                    f"block_name '{name}' also appears on line {seen[key]} of this file"
                )
            if key in ambiguous:
                problems.append(
                    f"more than one of your blocks is called '{name}' — rename one on the "
                    "Blocks screen before editing either from a spreadsheet"
                )
            else:
                target = by_name.get(key)
                if target is None:
                    problems.append(
                        f"no block called '{name}' — a spreadsheet can edit blocks but not "
                        "create them, because it cannot draw the boundary. Check the spelling, "
                        "or add the block on the map first"
                    )

        if "status" in provided and row.status is not None and row.status not in BLOCK_STATUS_VALUES:
            problems.append(
                f"status '{row.status}' must be one of: {', '.join(BLOCK_STATUS_VALUES)}"
            )

        # property_id is three-state: absent leaves it, null makes the block
        # unassigned, a value must name a property this user can actually see.
        if (
            "property_id" in provided
            and row.property_id is not None
            and not is_admin
            and row.property_id not in visible_properties
        ):
            problems.append(f"property_id {row.property_id} is not accessible")

        if problems:
            errors.append(ImportRowError(line_number=row.line_number, errors=problems))
            continue

        seen[key] = row.line_number
        updates.append((row, target, fields))

    if errors and not payload.skip_invalid:
        return ImportResult(created=0, updated=0, failed=len(errors), errors=errors, committed=False)

    for row, block, fields in updates:
        for field, value in fields.items():
            setattr(block, field, value)

    db.commit()

    logger.info(
        f"Block CSV sync for company {current_user.company_id} by user {current_user.id}: "
        f"{len(updates)} updated, {len(errors)} skipped"
    )
    return ImportResult(
        created=0, updated=len(updates), failed=len(errors), errors=errors, committed=True
    )


@router.get("/{block_id}")
def get_block_by_id(
    block_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get detailed block data by ID
    """
    block = verify_block_access(db, current_user, block_id)

    # Build response with all block data
    result = {
        "id": block.id,
        "block_name": block.block_name,
        "status": block.status,
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
        "biodynamic": block.biodynamic,
        "regenerative": block.regenerative,
        "winery": block.winery,
        "gi": block.gi,
        "elevation": block.elevation,
        "centroid_longitude": block.centroid_longitude,
        "centroid_latitude": block.centroid_latitude,
        "company_id": block.company_id,
        "property_id": block.property_id,
        "geometry_geojson": None,
        "row_start": block.row_start,
        "row_end": block.row_end,
        "row_count": block.row_count,
        "training_system": block.training_system,
        "rootstock": block.rootstock,
        "notes": block.notes,
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
    block = verify_block_access(db, current_user, block_id, require_write=True)

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
        
        # Mirrors the writable surface of BlockUpdate. Keep the two in step —
        # a field that can be written but not read back reads to the caller as
        # a silently dropped save.
        return {
            "id": block.id,
            "block_name": block.block_name,
            "variety": block.variety,
            "clone": block.clone,
            "rootstock": block.rootstock,
            "planted_date": block.planted_date,
            "removed_date": block.removed_date,
            "row_spacing": block.row_spacing,
            "vine_spacing": block.vine_spacing,
            "row_start": block.row_start,
            "row_end": block.row_end,
            "row_count": block.row_count,
            "training_system": block.training_system,
            "notes": block.notes,
            "status": block.status,
            "area": block.area,
            "region": block.region,
            "swnz": block.swnz,
            "organic": block.organic,
            "biodynamic": block.biodynamic,
            "regenerative": block.regenerative,
            "winery": block.winery,
            "gi": block.gi,
            "elevation": block.elevation,
            "centroid_longitude": block.centroid_longitude,
            "centroid_latitude": block.centroid_latitude,
            "company_id": block.company_id,
            "property_id": block.property_id,
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating block {block_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating block: {str(e)}")

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

        # A10: Default property_id if user has exactly one visible property
        if not new_block.property_id:
            visible_ids = get_visible_property_ids(db, current_user)
            if len(visible_ids) == 1:
                new_block.property_id = visible_ids[0]
        
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

        return {
            "id": new_block.id,
            "block_name": new_block.block_name,
            "variety": new_block.variety,
            "area": new_block.area,
            "company_id": new_block.company_id,
            "message": "Block created successfully",
        }

    except Exception as e:
        db.rollback()
        logger.error(f"Error creating block: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating block: {str(e)}")

@router.patch("/{block_id}/assign-company")
def assign_block_to_company(
    block_id: int,
    assignment_data: Dict[str, int] = Body(..., example={"company_id": 1}),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Assign a block to a company (admin only)
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

        db.commit()
        db.refresh(block)

        return {
            "id": block.id,
            "block_name": block.block_name,
            "company_id": block.company_id,
            "previous_company_id": old_company_id,
            "message": f"Block successfully assigned to {new_company_id}",
        }

    except Exception as e:
        db.rollback()
        logger.error(f"Error assigning block {block_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error assigning block: {str(e)}")

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
    # Get the original block (with access check)
    original_block = verify_block_access(db, current_user, block_id, require_write=True)

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
            db.flush()  # get new_block.id for the response summary
            new_blocks.append(new_block)

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

@router.put("/{block_id}/geometry")
def update_block_geometry(
    block_id: int,
    payload: Dict = Body(..., example={
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[174.0, -41.0],[174.1,-41.0],[174.1,-41.1],[174.0,-41.1],[174.0,-41.0]]]
        }
    }),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update a block's polygon geometry (GeoJSON), recompute area (ha), and centroid.
    """
    # --- Load & check block
    block = verify_block_access(db, current_user, block_id, require_write=True)

    # --- Validate input
    geometry = payload.get("geometry")
    if not geometry or geometry.get("type") != "Polygon":
        raise HTTPException(status_code=400, detail="Valid Polygon GeoJSON 'geometry' is required")

    try:
        # Convert GeoJSON -> shapely
        shp = shape(geometry)  # Polygon
        if shp.is_empty or not shp.is_valid:
            raise HTTPException(status_code=400, detail="Invalid polygon geometry")

        # Compute area (ha) using WGS84-aware helper
        new_area_ha = area_ha(shp)  # authoritative area

        # Compute centroid (lon/lat)
        centroid = shp.centroid
        centroid_lon, centroid_lat = centroid.x, centroid.y

        # Persist
        block.geometry = from_shape(shp, srid=4326)  # WGS84 storage
        block.area = float(new_area_ha)
        block.centroid_longitude = float(centroid_lon)
        block.centroid_latitude = float(centroid_lat)

        db.commit()
        db.refresh(block)

        # Return lightweight result
        return {
            "id": block.id,
            "area": block.area,
            "centroid_longitude": block.centroid_longitude,
            "centroid_latitude": block.centroid_latitude,
            "message": "Block geometry updated"
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating geometry for block {block_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update block geometry")
