# backend/schemas/site_banner.py
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class BannerType(str, Enum):
    update = "update"
    coming_soon = "coming_soon"


class BannerAudience(str, Enum):
    insights = "insights"
    grow = "grow"
    both = "both"


class BannerCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    content: str = Field(..., min_length=1)
    banner_type: BannerType = BannerType.update
    audience: BannerAudience = BannerAudience.insights
    is_active: bool = True
    display_order: int = 0


class BannerUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    content: Optional[str] = Field(None, min_length=1)
    banner_type: Optional[BannerType] = None
    audience: Optional[BannerAudience] = None
    is_active: Optional[bool] = None
    display_order: Optional[int] = None


class BannerResponse(BaseModel):
    id: int
    title: str
    content: str
    banner_type: BannerType
    audience: BannerAudience
    is_active: bool
    display_order: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class BannerListResponse(BaseModel):
    banners: List[BannerResponse]
    total: int
