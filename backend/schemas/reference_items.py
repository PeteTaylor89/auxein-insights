# app/schemas/reference_items.py
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel
try:
    # Pydantic v2
    from pydantic import ConfigDict
    _CFG = {"from_attributes": True}
except Exception:
    # fallback for Pydantic v1 style
    ConfigDict = None
    _CFG = {}

class ReferenceItemBase(BaseModel):
    company_id: Optional[int] = None        # NULL => system/global
    category: str                           # e.g., "el_stage", "el_phase", "disease"
    key: str                                # e.g., "EL-35", "EL-PHASE-early"
    label: str                              # display name
    description: Optional[str] = None
    aliases: List[str] = []

class ReferenceItemCreate(ReferenceItemBase):
    pass

class ReferenceItemUpdate(BaseModel):
    label: Optional[str] = None
    description: Optional[str] = None
    aliases: Optional[List[str]] = None

class ReferenceItemOut(ReferenceItemBase):
    id: int
    is_active: bool = True
    created_at: datetime
    updated_at: Optional[datetime] = None

    # pydantic v2
    if ConfigDict:
        model_config = ConfigDict(**_CFG)
    else:
        # pydantic v1
        class Config:
            orm_mode = True
