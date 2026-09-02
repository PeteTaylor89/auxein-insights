# app/schemas/block.py - Enhanced version
from typing import Optional, Dict, Any, Union, List
from datetime import date
from enum import Enum
from pydantic import BaseModel, Field
from .company import Company


class BlockStatus(str, Enum):
    developing = "developing"
    pre_production = "pre_production"
    producing = "producing"
    redeveloping = "redeveloping"
    replanting = "replanting"
    mothballed = "mothballed"
    retired = "retired"


class BlockBase(BaseModel):
    block_name: Optional[str] = None
    variety: Optional[str] = None
    clone: Optional[str] = None
    rootstock: Optional[str] = None  # NEW: Separated from clone
    planted_date: Optional[date] = None
    removed_date: Optional[date] = None
    row_spacing: Optional[float] = None
    vine_spacing: Optional[float] = None
    area: Optional[float] = None
    region: Optional[str] = None
    swnz: Optional[bool] = False
    organic: Optional[bool] = False
    biodynamic: Optional[bool] = False  # NEW
    regenerative: Optional[bool] = False  # NEW
    winery: Optional[str] = None
    gi: Optional[str] = None
    elevation: Optional[float] = None
    centroid_longitude: Optional[float] = None
    centroid_latitude: Optional[float] = None
    row_start: Optional[Union[int, str]] = None
    row_end: Optional[Union[int, str]] = None
    row_count: Optional[int] = None
    training_system: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[BlockStatus] = None
    company_id: Optional[int] = None
    property_id: Optional[int] = None

    class Config:
        from_attributes = True

class BlockCreate(BlockBase):
    company_id: int
    property_id: Optional[int] = None
    geometry: Optional[dict] = None

class BlockUpdate(BlockBase):
    property_id: Optional[int] = None

class Block(BlockBase):
    id: int
    company_id: int
    
    class Config:
        from_attributes = True

class BlockWithGeometry(Block):
    geometry_geojson: Optional[Dict[str, Any]] = None

class BlockWithCompany(Block):
    company: Company

class BlockFilter(BaseModel):
    variety: Optional[str] = None
    region: Optional[str] = None
    winery: Optional[str] = None
    organic: Optional[bool] = None
    biodynamic: Optional[bool] = None  # NEW
    regenerative: Optional[bool] = None  # NEW
    training_system: Optional[str] = None
    status: Optional[BlockStatus] = None
    company_id: Optional[int] = None


# ---------------------------------------------------------------------------
# Spreadsheet round-trip
# ---------------------------------------------------------------------------

class BlockImportRow(BaseModel):
    """One line of the blocks CSV.

    `block_name` is the key. There is no database id in the file: a primary key
    is meaningless to read in a spreadsheet and one stray edit would repoint a
    line at a different block. The consequence, enforced rather than worked
    around, is that a block with NO NAME cannot be reached from a CSV at all —
    it has nothing to match on. Those blocks are excluded from the export and
    have to be named on screen first.

    Blocks are UPDATE-ONLY. Geometry is drawn on the map and a CSV cannot supply
    it, so a spreadsheet that could create blocks would quietly build a register
    of shapeless ones.

    Optional fields are three-state and the distinction is load-bearing:
      - absent from the payload  -> that column was not in the user's sheet, leave it
      - present as null          -> the cell was blank, CLEAR the field
      - present with a value     -> set it
    `model_fields_set` is what separates the first two.
    """
    line_number: int = Field(..., description="Line number in the user's file, for error reporting")
    block_name: str
    variety: Optional[str] = None
    clone: Optional[str] = None
    rootstock: Optional[str] = None
    training_system: Optional[str] = None
    status: Optional[str] = None
    planted_date: Optional[date] = None
    removed_date: Optional[date] = None
    row_spacing: Optional[float] = None
    vine_spacing: Optional[float] = None
    row_start: Optional[str] = None
    row_end: Optional[str] = None
    area: Optional[float] = None
    region: Optional[str] = None
    gi: Optional[str] = None
    winery: Optional[str] = None
    elevation: Optional[float] = None
    swnz: Optional[bool] = None
    organic: Optional[bool] = None
    biodynamic: Optional[bool] = None
    regenerative: Optional[bool] = None
    notes: Optional[str] = None
    property_id: Optional[int] = None


class ImportRowError(BaseModel):
    line_number: int
    errors: List[str]


class ImportResult(BaseModel):
    """Shared result shape for the block and row spreadsheet endpoints."""
    created: int = 0
    updated: int = 0
    failed: int
    errors: List[ImportRowError] = Field(default_factory=list)
    # False when validation rejected the file and nothing was written.
    committed: bool


class BlockImportRequest(BaseModel):
    rows: List[BlockImportRow]
    # False (default) = all-or-nothing. A half-applied block register is harder
    # to clean up than a rejected file.
    skip_invalid: bool = False


class BlockExportItem(BaseModel):
    """A block as the spreadsheet sees it.

    Defined next to BlockImportRow deliberately. The export and the import must
    carry the SAME field set: a writable column missing from the export comes
    back as a blank cell, and a blank cell clears the field. That is silent
    data loss, and it is exactly what would have happened here — the existing
    /blocks/company response omits `notes`.

    `property` and `row_count` are read-only additions: a name instead of a
    property_id, and the block's real row count for orientation.
    """
    block_name: str
    variety: Optional[str] = None
    clone: Optional[str] = None
    rootstock: Optional[str] = None
    training_system: Optional[str] = None
    status: Optional[str] = None
    planted_date: Optional[date] = None
    removed_date: Optional[date] = None
    row_spacing: Optional[float] = None
    vine_spacing: Optional[float] = None
    row_start: Optional[str] = None
    row_end: Optional[str] = None
    area: Optional[float] = None
    region: Optional[str] = None
    gi: Optional[str] = None
    winery: Optional[str] = None
    elevation: Optional[float] = None
    swnz: Optional[bool] = None
    organic: Optional[bool] = None
    biodynamic: Optional[bool] = None
    regenerative: Optional[bool] = None
    notes: Optional[str] = None
    property_id: Optional[int] = None
    row_count: int = 0


class BlockExportResponse(BaseModel):
    blocks: List[BlockExportItem]
    # Blocks with no name cannot appear in a name-keyed file. Reported rather
    # than dropped in silence, so "22 blocks, 1 exported" is explainable on the
    # screen instead of looking like a bug.
    unnamed_count: int = 0
