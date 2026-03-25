# schemas/external_alias.py - External alias Pydantic schemas (Grow V1, Revision 2)
from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel, field_validator


class ExternalAliasBase(BaseModel):
    entity_type: str
    entity_id: int
    system_name: str
    external_id: str
    external_label: Optional[str] = None
    extra: Optional[dict[str, Any]] = None

    @field_validator('entity_type')
    @classmethod
    def validate_entity_type(cls, v):
        allowed = {'block', 'property', 'asset', 'user', 'station'}
        if v not in allowed:
            raise ValueError(f'entity_type must be one of {allowed}')
        return v


class ExternalAliasCreate(ExternalAliasBase):
    pass


class ExternalAliasUpdate(BaseModel):
    external_id: Optional[str] = None
    external_label: Optional[str] = None
    extra: Optional[dict[str, Any]] = None


class ExternalAliasOut(ExternalAliasBase):
    id: int
    company_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
