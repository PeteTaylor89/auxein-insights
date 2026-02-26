# backend/schemas/research.py - Pydantic schemas for Research API
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


# --- Sections ---

class ResearchSectionCreate(BaseModel):
    title: str = Field(..., max_length=255)
    section_type: str  # text, chart, table, map, image, file
    content: dict  # JSONB
    caption: Optional[str] = None
    content_access_tier: Optional[str] = None  # NULL inherits from report


class ResearchSectionUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=255)
    section_type: Optional[str] = None
    content: Optional[dict] = None
    caption: Optional[str] = None
    content_access_tier: Optional[str] = None


class ResearchSectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    report_id: int
    sort_order: int
    title: str
    section_type: str
    content: dict
    caption: Optional[str] = None
    content_access_tier: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class SectionOrderItem(BaseModel):
    id: int
    sort_order: int


class SectionReorderRequest(BaseModel):
    sections: List[SectionOrderItem]


# --- Files ---

class ResearchFileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    report_id: int
    section_id: Optional[int] = None
    file_url: str
    file_type: str
    file_name: str
    description: Optional[str] = None
    created_at: datetime


# --- Reports ---

class ResearchListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    slug: str
    abstract: str
    authors: List[str]
    status: str
    published_at: Optional[datetime] = None
    version: str = "1.0"
    regions: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    content_access_tier: str = "free"
    like_count: int = 0
    comment_count: int = 0
    view_count: int = 0
    created_at: datetime


class ResearchDetail(ResearchListItem):
    funding_acknowledgement: Optional[str] = None
    citation_text: Optional[str] = None
    seo_title: Optional[str] = None
    meta_description: Optional[str] = None
    canonical_url: Optional[str] = None
    focus_keywords: Optional[List[str]] = None
    og_image_url: Optional[str] = None
    structured_data: Optional[dict] = None
    sections: List[ResearchSectionResponse] = []
    files: List[ResearchFileResponse] = []
    user_has_liked: bool = False


class ResearchListResponse(BaseModel):
    items: List[ResearchListItem]
    total: int
    page: int
    page_size: int


class ResearchCreate(BaseModel):
    title: str = Field(..., max_length=255)
    slug: Optional[str] = Field(None, max_length=255)
    abstract: str
    authors: List[str]
    status: str = "draft"
    published_at: Optional[datetime] = None
    version: str = "1.0"
    regions: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    funding_acknowledgement: Optional[str] = None
    citation_text: Optional[str] = None
    content_access_tier: str = "free"
    seo_title: Optional[str] = Field(None, max_length=70)
    meta_description: Optional[str] = Field(None, max_length=160)
    canonical_url: Optional[str] = None
    focus_keywords: Optional[List[str]] = None
    og_image_url: Optional[str] = None
    structured_data: Optional[dict] = None


class ResearchUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=255)
    slug: Optional[str] = Field(None, max_length=255)
    abstract: Optional[str] = None
    authors: Optional[List[str]] = None
    status: Optional[str] = None
    published_at: Optional[datetime] = None
    version: Optional[str] = None
    regions: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    funding_acknowledgement: Optional[str] = None
    citation_text: Optional[str] = None
    content_access_tier: Optional[str] = None
    seo_title: Optional[str] = Field(None, max_length=70)
    meta_description: Optional[str] = Field(None, max_length=160)
    canonical_url: Optional[str] = None
    focus_keywords: Optional[List[str]] = None
    og_image_url: Optional[str] = None
    structured_data: Optional[dict] = None


# --- Comments (same pattern as articles) ---

class ResearchCommentCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=2000)
    parent_id: Optional[int] = None


class ResearchCommentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    report_id: int
    user_id: int
    user_name: Optional[str] = None
    body: str
    parent_id: Optional[int] = None
    is_deleted: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None
    replies: List["ResearchCommentResponse"] = []
