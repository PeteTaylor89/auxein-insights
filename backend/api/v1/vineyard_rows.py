# app/api/v1/vineyard_rows.py - Enhanced version
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from db.session import get_db
from api.deps import get_current_user
from db.models.user import User
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
    RowRangeUpdateRequest,
    RowRangeUpdateResponse,
    ClonalSection,
    RowImportRequest,
    RowExportItem,
)
# The result shapes are shared with the blocks spreadsheet endpoints; one
# definition rather than two that drift.
from schemas.block import ImportResult, ImportRowError
from services.property_service import get_visible_property_ids
from utils.geometry_helpers import geojson_to_geometry
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

def _verify_block_access(db: Session, block_id: int, user: User) -> VineyardBlock:
    """Verify block exists and belongs to user's company. Returns block or raises."""
    block = db.query(VineyardBlock).filter(
        VineyardBlock.id == block_id,
        VineyardBlock.company_id == user.company_id
    ).first()
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    return block


def _verify_row_access(db: Session, row_id: int, user: User) -> VineyardRow:
    """Verify row exists and its block belongs to user's company. Returns row or raises."""
    row = db.query(VineyardRow).join(VineyardBlock).filter(
        VineyardRow.id == row_id,
        VineyardBlock.company_id == user.company_id
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Row not found")
    return row

# Ceiling on a single range request. Comfortably clears the ~300-row blocks
# growers actually have; anything past this is a typo (or an attempt to make the
# server expand a million-element list) rather than a genuine vineyard.
MAX_ROW_RANGE = 2000


def alpha_to_index(token: str) -> int:
    """Spreadsheet-column value of a letter row label — 1-based.

    A=1 … Z=26, AA=27 … AZ=52, BA=53 … ZZ=702. This is bijective base-26 (no
    zero digit), the same scheme Excel uses for columns, which is what growers
    labelling rows past Z expect.
    """
    n = 0
    for ch in token.upper():
        n = n * 26 + (ord(ch) - 64)
    return n


def index_to_alpha(index: int) -> str:
    """Inverse of alpha_to_index: 27 -> 'AA'."""
    out = ""
    while index > 0:
        index, rem = divmod(index - 1, 26)
        out = chr(65 + rem) + out
    return out


def expand_row_range(start: str, end: str) -> List[str]:
    """Expand an inclusive row range into its ordered row numbers.

    Two naming conventions, and both ends must use the same one:
      - plain integers, "1" to "50"
      - spreadsheet-style letters, "A" to "AZ" (A…Z, AA, AB… — 52 rows)

    Takes no count: the range itself is the source of truth. Reversed ranges are
    normalised rather than rejected — "20 to 1" plainly means the same twenty
    rows as "1 to 20".
    """
    s, e = str(start).strip(), str(end).strip()
    if not s or not e:
        raise ValueError("Row start and row end are both required")

    if s.lstrip("-").isdigit() and e.lstrip("-").isdigit():
        lo, hi = sorted((int(s), int(e)))
        if hi - lo + 1 > MAX_ROW_RANGE:
            raise ValueError(f"Row range is too large (max {MAX_ROW_RANGE} rows)")
        return [str(i) for i in range(lo, hi + 1)]

    if s.isalpha() and e.isalpha():
        lo, hi = sorted((alpha_to_index(s), alpha_to_index(e)))
        if hi - lo + 1 > MAX_ROW_RANGE:
            raise ValueError(f"Row range is too large (max {MAX_ROW_RANGE} rows)")
        return [index_to_alpha(i) for i in range(lo, hi + 1)]

    raise ValueError(
        "Row range must be numeric (e.g. 1 to 50) or letters (e.g. A to AZ), "
        "with both ends using the same convention"
    )


def generate_row_numbers(start: str, end: str, count: int) -> List[str]:
    """Expand a row range and assert it contains exactly `count` rows.

    Delegates to expand_row_range so bulk-create and the range-paint endpoint
    can never disagree about what a range means — they used to carry separate
    parsers, which is how one could accept a label the other rejected.
    """
    numbers = expand_row_range(start, end)
    if len(numbers) != count:
        raise ValueError(
            f"Row count {count} doesn't match range {start}-{end} "
            f"({len(numbers)} rows)"
        )
    return numbers


def _row_key(value) -> str:
    """Normalise a row number for comparison.

    Row numbers are free-text, so the same row can be stored as "1", "01" or
    " 1 " depending on who created it. Collapse numeric forms to their integer
    value and case-fold everything else, so a range paint doesn't silently skip
    rows that differ only in formatting.
    """
    token = str(value if value is not None else "").strip()
    if not token:
        return ""
    if token.lstrip("-").isdigit():
        return str(int(token))
    return token.upper()


def _natural_row_sort(value: str):
    """Sort key giving 1, 2, 10 rather than 1, 10, 2.

    Letter labels sort by their spreadsheet-column value, so Z (26) precedes
    AA (27) — comparing them as plain strings would put AA first. Numeric row
    numbers sort ahead of letters, which keeps mixed conventions from
    interleaving; anything else falls to the end alphabetically.
    """
    token = str(value or "").strip()
    if token.lstrip("-").isdigit():
        return (0, int(token), "")
    if token.isalpha():
        return (1, alpha_to_index(token), "")
    return (2, 0, token.upper())


# NEW: Enhanced bulk creation endpoint
@router.post("/bulk-create", response_model=BulkRowCreationResponse)
def bulk_create_rows(
    request: BulkRowCreationRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):

    """
    Bulk create rows with variety and clone information.
    This endpoint creates multiple rows at once based on the provided range.
    """
    # Verify block exists
    block = _verify_block_access(db, request.block_id, user)
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
            "vine_spacing": request.vine_spacing or block.vine_spacing,
            "row_length": request.row_length,
        }
        
        db_row = VineyardRow(**row_data)
        db.add(db_row)
        created_rows.append(db_row)
    
    db.commit()
    
    # Refresh all rows to get IDs
    for row in created_rows:
        db.refresh(row)
    
    block.row_start = str(request.row_start)
    block.row_end = str(request.row_end)
    block.row_count = request.row_count
    
    if request.vine_spacing is not None:
        block.vine_spacing = request.vine_spacing
    if request.variety is not None:
        block.variety = request.variety
    if request.clone is not None:
        block.clone = request.clone
    if request.rootstock is not None:
        block.rootstock = request.rootstock

    db.commit()

    logger.info(f"Bulk created {len(created_rows)} rows for block {request.block_id}")
    
    return BulkRowCreationResponse(
        created_rows=len(created_rows),
        rows=created_rows,
        message=f"Successfully created {len(created_rows)} rows"
    )


@router.patch("/by-block/{block_id}/range", response_model=RowRangeUpdateResponse)
def update_rows_in_range(
    block_id: int,
    payload: RowRangeUpdateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """
    Apply variety/clone/rootstock/spacing/length to an inclusive range of
    EXISTING rows on a block.

    Unlike /bulk-create this creates nothing and refuses nothing when rows are
    already present — it is the tool for a block that is already set up and now
    needs rows 21-40 switched to a different clone. Run it once per range to
    build up a mixed-clone block.

    Only fields present in the request body are written, so painting a clone
    over a range leaves each row's rootstock and spacing untouched.
    """
    _verify_block_access(db, block_id, user)

    try:
        target_numbers = expand_row_range(payload.row_start, payload.row_end)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # exclude_unset draws the line between "not mentioned" (leave alone) and
    # "explicitly sent as null" (clear it) — the whole point of a range paint is
    # that it doesn't disturb attributes you didn't name.
    updates = payload.model_dump(exclude_unset=True)
    updates.pop("row_start", None)
    updates.pop("row_end", None)
    if not updates:
        raise HTTPException(
            status_code=400,
            detail="No fields to update. Provide at least one of: variety, clone, rootstock, vine_spacing, row_length.",
        )

    target_keys = {_row_key(n) for n in target_numbers}
    block_rows = db.query(VineyardRow).filter(VineyardRow.block_id == block_id).all()
    matched = [r for r in block_rows if _row_key(r.row_number) in target_keys]

    if not matched:
        raise HTTPException(
            status_code=404,
            detail=f"No rows on this block fall in the range {payload.row_start}-{payload.row_end}",
        )

    for row in matched:
        for field, value in updates.items():
            setattr(row, field, value)

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Row range update failed for block {block_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update rows")

    matched_keys = {_row_key(r.row_number) for r in matched}
    missing = [n for n in target_numbers if _row_key(n) not in matched_keys]

    logger.info(
        f"Range-updated {len(matched)} rows on block {block_id} "
        f"({payload.row_start}-{payload.row_end}); fields={sorted(updates)}"
    )

    return RowRangeUpdateResponse(
        updated_rows=len(matched),
        row_numbers=sorted((str(r.row_number) for r in matched), key=_natural_row_sort),
        missing_row_numbers=missing,
        message=f"Updated {len(matched)} row{'s' if len(matched) != 1 else ''}",
    )

# NEW: Update row with clonal sections
@router.put("/{row_id}/clonal-sections", response_model=VineyardRowSchema)
def update_row_clonal_sections(
    row_id: int,
    sections: List[ClonalSection],
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):

    """
    Update a row with multiple clonal sections.
    This allows specifying different clones/rootstocks for different parts of the row.
    """
    db_row = _verify_row_access(db, row_id, user)
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
# ---------------------------------------------------------------------------
# Spreadsheet round-trip
# ---------------------------------------------------------------------------

# Fields a CSV line may write. `block_id` and `row_number` are the key and are
# handled separately; geometry and clonal_sections are deliberately absent —
# both are structured, neither survives a spreadsheet cell, and no row in the
# database currently carries either.
IMPORTABLE_ROW_FIELDS = (
    "row_length", "vine_spacing", "variety", "clone", "rootstock",
)


def _row_key(row_number):
    """Normalise a row label for matching: trimmed and case-folded.

    Row labels are strings because they can be alphabetic (A..Z, AA..AZ) as
    well as numeric. "a12" and "A12" are the same row to a grower, so matching
    exactly would create a duplicate beside the one they meant to edit.
    """
    if row_number is None:
        return None
    key = str(row_number).strip().lower()
    return key or None


def _visible_block_ids(db: Session, current_user: User):
    """Blocks this user may work with, on the same rule as verify_block_access.

    The NULL-property branch is not optional: a company that owns no properties
    holds every block with property_id NULL, and omitting it would tell them
    they have no vineyard.
    """
    if current_user.user_type == "auxein_admin":
        return None  # no narrowing

    visible_ids = get_visible_property_ids(db, current_user)
    conditions = [
        and_(
            VineyardBlock.property_id.is_(None),
            VineyardBlock.company_id == current_user.company_id,
        )
    ]
    if visible_ids:
        conditions.append(VineyardBlock.property_id.in_(visible_ids))
    return {b.id for b in db.query(VineyardBlock.id).filter(or_(*conditions)).all()}


@router.get("/export", response_model=List[RowExportItem])
def export_rows(
    block_id: Optional[int] = Query(None, description="Limit to one block"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Every row this user can edit, with its block NAMED rather than numbered.

    A separate endpoint from `GET /` because that one caps at `limit=1000` and
    a real register is already larger — Greystone holds 1281 rows. An export
    that silently stopped at 1000 would diff the missing 281 as "not in this
    list", and ticking "skip invalid" would then quietly drop them.

    Rows whose block has no name are excluded: the file names the block, so a
    row under a nameless block has nothing to sit beside. Name the block first.

    Declared before /{row_id} so "export" is never parsed as an id.
    """
    q = (
        db.query(VineyardRow, VineyardBlock)
        .join(VineyardBlock, VineyardBlock.id == VineyardRow.block_id)
    )

    allowed = _visible_block_ids(db, current_user)
    if allowed is not None:
        if not allowed:
            return []
        q = q.filter(VineyardRow.block_id.in_(allowed))

    if block_id is not None:
        q = q.filter(VineyardRow.block_id == block_id)

    items = []
    for row, block in q.all():
        if not (block.block_name or "").strip():
            continue
        items.append(RowExportItem(
            block_id=block.id,
            block_name=block.block_name,
            row_number=row.row_number,
            row_length=row.row_length,
            vine_spacing=row.vine_spacing,
            variety=row.variety,
            clone=row.clone,
            rootstock=row.rootstock,
            vine_count=row.vine_count,
        ))

    # Block first, then natural row order — the order a person reads a vineyard,
    # and the order the file should come back in.
    items.sort(key=lambda i: ((i.block_name or "").lower(), _natural_row_sort(i.row_number)))
    return items


@router.post("/import", response_model=ImportResult)
def import_rows(
    payload: RowImportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create and update vineyard rows from a parsed CSV.

    The key is `block_id` + `row_number`. The user's file names the block; the
    web client resolves that name against the blocks they can see and sends the
    id. This endpoint re-checks that scope rather than trusting it — client-side
    resolution is what makes an out-of-scope block unnameable, not what enforces
    it.

    Rows CREATE as well as update, unlike blocks. A row needs no geometry to be
    useful (none in the database has any), so a spreadsheet can legitimately
    bring a block's whole row set into existence — which is the point for a
    property being onboarded.

    NOTHING IS EVER DELETED HERE. A row missing from the file is untouched;
    deleting rows goes through the row tools on the block screen, where the
    consequences are visible.

    Declared before /{row_id} routes so "import" is never parsed as an id.
    """
    if not payload.rows:
        raise HTTPException(status_code=400, detail="No rows to import")

    if not current_user.has_permission("blocks", "update"):
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to edit vineyard rows",
        )

    allowed = _visible_block_ids(db, current_user)
    requested_block_ids = {r.block_id for r in payload.rows}

    blocks = db.query(VineyardBlock).filter(VineyardBlock.id.in_(requested_block_ids)).all()
    blocks_by_id = {b.id: b for b in blocks}

    # Every existing row in the blocks this file touches, in one query.
    existing = (
        db.query(VineyardRow)
        .filter(VineyardRow.block_id.in_(requested_block_ids))
        .all()
    ) if requested_block_ids else []

    by_key = {}
    ambiguous = set()
    for r in existing:
        key = (r.block_id, _row_key(r.row_number))
        if key[1] is None:
            continue
        if key in by_key:
            ambiguous.add(key)
        else:
            by_key[key] = r

    errors = []
    creates = []
    updates = []
    seen = {}

    for row in payload.rows:
        problems = []
        provided = row.model_fields_set
        fields = {f: getattr(row, f) for f in IMPORTABLE_ROW_FIELDS if f in provided}

        block = blocks_by_id.get(row.block_id)
        if block is None:
            problems.append(f"block {row.block_id} does not exist")
        elif allowed is not None and row.block_id not in allowed:
            problems.append("that block is not one you can edit")

        label = (row.row_number or "").strip()
        key_part = _row_key(label)
        if key_part is None:
            problems.append("row_number is required — it is how this line finds its row")

        target = None
        if not problems:
            key = (row.block_id, key_part)
            if key in seen:
                problems.append(
                    f"row '{label}' in this block also appears on line {seen[key]} of this file"
                )
            if key in ambiguous:
                problems.append(
                    f"more than one row in this block is already called '{label}' — fix that first"
                )
            else:
                target = by_key.get(key)

        if problems:
            errors.append(ImportRowError(line_number=row.line_number, errors=problems))
            continue

        seen[(row.block_id, key_part)] = row.line_number
        if target is not None:
            updates.append((row, target, fields))
        else:
            creates.append((row, fields))

    if errors and not payload.skip_invalid:
        return ImportResult(created=0, updated=0, failed=len(errors), errors=errors, committed=False)

    for row, fields in creates:
        db.add(VineyardRow(
            block_id=row.block_id,
            row_number=(row.row_number or "").strip(),
            **fields,
        ))

    for row, existing_row, fields in updates:
        for field, value in fields.items():
            setattr(existing_row, field, value)

    db.commit()

    logger.info(
        f"Row CSV sync for company {current_user.company_id} by user {current_user.id}: "
        f"{len(creates)} created, {len(updates)} updated, {len(errors)} skipped"
    )
    return ImportResult(
        created=len(creates), updated=len(updates), failed=len(errors),
        errors=errors, committed=True,
    )


@router.get("/", response_model=List[VineyardRowSchema])
def get_all_rows(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    variety: Optional[str] = None,
    clone: Optional[str] = None,
    rootstock: Optional[str] = None,
    block_id: Optional[int] = None,
    has_geometry: Optional[bool] = None,
    has_multiple_clones: Optional[bool] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):

    """Get all vineyard rows with optional filtering"""
    query = db.query(VineyardRow).join(VineyardBlock).filter(
        VineyardBlock.company_id == user.company_id
    )
    
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
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):

    """Get the clone/rootstock information at a specific vine position in a row"""
    row = _verify_row_access(db, row_id, user)
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
def get_row_stats_by_block(block_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Get enhanced statistics for rows in a block"""
    block = _verify_block_access(db, block_id, user)
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
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):

    """Create a complete set of rows for a block based on block's row_start, row_end, and row_count."""
    block = _verify_block_access(db, block_id, user)
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
def get_rows_by_block(block_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Get all rows for a specific block"""
    block = _verify_block_access(db, block_id, user)
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    
    rows = db.query(VineyardRow).filter(VineyardRow.block_id == block_id).order_by(VineyardRow.row_number).all()
    return rows

@router.get("/{row_id}", response_model=VineyardRowWithBlock)
def get_row(row_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Get a specific row with block details"""
    row = _verify_row_access(db, row_id, user)
    if not row:
        raise HTTPException(status_code=404, detail="Row not found")
    return row

@router.post("/", response_model=VineyardRowSchema)
def create_row(
    row: VineyardRowCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Create a single vineyard row"""
    block = _verify_block_access(db, row.block_id, user)
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
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Update a vineyard row"""
    db_row = _verify_row_access(db, row_id, user)
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
def delete_row(row_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Delete a vineyard row"""
    db_row = _verify_row_access(db, row_id, user)
    if not db_row:
        raise HTTPException(status_code=404, detail="Row not found")
    
    db.delete(db_row)
    db.commit()
    return {"message": "Row deleted successfully"}

@router.delete("/by-block/{block_id}")
def delete_all_rows_by_block(block_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Delete all rows for a specific block"""
    block = _verify_block_access(db, block_id, user)
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    
    deleted_count = db.query(VineyardRow).filter(VineyardRow.block_id == block_id).delete()
    db.commit()
    
    return {"message": f"Deleted {deleted_count} rows from block {block_id}"}

@router.put("/{row_id}/geometry", response_model=VineyardRowSchema)
def update_row_geometry(
    row_id: int,
    geometry: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Update only the geometry of a specific row"""
    db_row = _verify_row_access(db, row_id, user)
    if not db_row:
        raise HTTPException(status_code=404, detail="Row not found")
    
    db_row.geometry = geojson_to_geometry(geometry)
    
    db.commit()
    db.refresh(db_row)
    return db_row

@router.delete("/{row_id}/geometry") 
def remove_row_geometry(
    row_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):

    """Remove geometry from a specific row"""
    db_row = _verify_row_access(db, row_id, user)
    if not db_row:
        raise HTTPException(status_code=404, detail="Row not found")
    
    db_row.geometry = None
    
    db.commit()
    return {"message": "Geometry removed successfully"}