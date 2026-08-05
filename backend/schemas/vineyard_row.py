# app/schemas/vineyard_row.py - Enhanced version
from typing import Optional, Union, Dict, Any, List
from pydantic import BaseModel, computed_field, field_validator
from .block import Block

class ClonalSection(BaseModel):
    """Represents a section of a row with specific clone/rootstock"""
    start_vine: int
    end_vine: int
    clone: Optional[str] = None
    rootstock: Optional[str] = None

class VineyardRowBase(BaseModel):
    row_number: Optional[Union[int, str]] = None
    row_length: Optional[float] = None
    vine_spacing: Optional[float] = None
    variety: Optional[str] = None
    clone: Optional[str] = None
    rootstock: Optional[str] = None
    block_id: Optional[int] = None
    geometry: Optional[Dict[str, Any]] = None
    clonal_sections: Optional[List[ClonalSection]] = None  # NEW

    class Config:
        from_attributes = True

class VineyardRowCreate(VineyardRowBase):
    block_id: int

class VineyardRowUpdate(VineyardRowBase):
    pass

class VineyardRow(VineyardRowBase):
    id: int
    block_id: int
    start_point: Optional[Dict[str, float]] = None
    end_point: Optional[Dict[str, float]] = None
    has_multiple_clones: Optional[bool] = None  # NEW
    
    @computed_field
    @property
    def vine_count(self) -> Optional[int]:
        """Calculate vine count from row length and vine spacing"""
        if self.row_length and self.vine_spacing and self.vine_spacing > 0:
            return int(self.row_length / self.vine_spacing)
        return None
    
    class Config:
        from_attributes = True
    
    @classmethod
    def model_validate(cls, obj, strict=None, from_attributes=None, context=None):
        if hasattr(obj, '__dict__'):
            data = {}
            for column in obj.__table__.columns:
                data[column.name] = getattr(obj, column.name)
            
            data['geometry'] = obj.geometry_geojson
            data['start_point'] = obj.start_point
            data['end_point'] = obj.end_point
            data['has_multiple_clones'] = obj.has_multiple_clones
            
            return super().model_validate(data, strict=strict, from_attributes=True, context=context)
        return super().model_validate(obj, strict=strict, from_attributes=from_attributes, context=context)

class VineyardRowWithBlock(VineyardRow):
    block: Block

class VineyardRowFilter(BaseModel):
    block_id: Optional[int] = None
    variety: Optional[str] = None
    clone: Optional[str] = None
    rootstock: Optional[str] = None
    row_number: Optional[Union[int, str]] = None
    has_geometry: Optional[bool] = None
    has_multiple_clones: Optional[bool] = None  # NEW

# NEW: Bulk row creation schemas
class BulkRowCreationBase(BaseModel):
    """Base schema for bulk row creation from block data"""
    variety: Optional[str] = None
    clone: Optional[str] = None
    rootstock: Optional[str] = None
    vine_spacing: Optional[float] = None

class BulkRowCreationRequest(BaseModel):
    """Request schema for bulk row creation"""
    block_id: int
    row_start: Union[int, str]
    row_end: Union[int, str]
    row_count: int
    variety: Optional[str] = None
    clone: Optional[str] = None
    rootstock: Optional[str] = None
    vine_spacing: Optional[float] = None
    # Without row_length the rows are created with a null vine_count, because
    # vine_count is derived from row_length / vine_spacing. Callers that know
    # the run length should pass it so the vines-per-row figure is live from
    # the moment the rows exist.
    row_length: Optional[float] = None

    @field_validator('row_count')
    def row_count_positive(cls, v):
        if v <= 0:
            raise ValueError('Row count must be positive')
        return v

class BulkRowCreationResponse(BaseModel):
    """Response schema for bulk row creation"""
    created_rows: int
    rows: List[VineyardRow]
    message: str


class RowRangeUpdateRequest(BaseModel):
    """Apply attributes to an inclusive range of EXISTING rows in one call.

    The beta's "big one": a 40-row block planted to two clones took 40 individual
    row edits. This paints rows 1-20 in one request and 21-40 in another.

    Only fields explicitly present in the request body are written — omitting
    `rootstock` leaves each row's existing rootstock alone rather than nulling
    it. To deliberately clear a field, send it as null.
    """
    row_start: Union[int, str]
    row_end: Union[int, str]
    variety: Optional[str] = None
    clone: Optional[str] = None
    rootstock: Optional[str] = None
    vine_spacing: Optional[float] = None
    row_length: Optional[float] = None


class RowRangeUpdateResponse(BaseModel):
    """Response schema for a row-range update"""
    updated_rows: int
    row_numbers: List[str]
    # Row numbers inside the requested range that have no row record on the
    # block. Surfaced rather than swallowed so a typo'd range doesn't look
    # like a successful no-op.
    missing_row_numbers: List[str]
    message: str