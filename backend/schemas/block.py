# app/schemas/block.py - Enhanced version
from typing import Optional, Dict, Any, Union, List
from datetime import date
from pydantic import BaseModel
from .company import Company

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
    company_id: Optional[int] = None

    class Config:
        from_attributes = True

class BlockCreate(BlockBase):
    company_id: int
    geometry: Optional[dict] = None

class BlockUpdate(BlockBase):
    pass

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
    company_id: Optional[int] = None

