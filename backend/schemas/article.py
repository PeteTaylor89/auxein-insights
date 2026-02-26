# backend/schemas/article.py - Pydantic schemas for Articles API
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


# --- Public responses ---

class ArticleListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    slug: str
    excerpt: Optional[str] = None
    featured_image_url: Optional[str] = None
    featured_image_alt: Optional[str] = None
    thumbnail_url: Optional[str] = None
    author_name: Optional[str] = None
    status: str
    published_at: Optional[datetime] = None
    tags: Optional[List[str]] = None
    region_tags: Optional[List[str]] = None
    content_access_tier: str = "free"
    like_count: int = 0
    comment_count: int = 0
    view_count: int = 0
    created_at: datetime


class ArticleDetail(ArticleListItem):
    body: dict  # Tiptap JSON
    seo_title: Optional[str] = None
    meta_description: Optional[str] = None
    canonical_url: Optional[str] = None
    focus_keywords: Optional[List[str]] = None
    og_image_url: Optional[str] = None
    structured_data: Optional[dict] = None
    author_id: Optional[int] = None
    user_has_liked: bool = False


class ArticleListResponse(BaseModel):
    items: List[ArticleListItem]
    total: int
    page: int
    page_size: int


# --- Admin create/update ---

class ArticleCreate(BaseModel):
    title: str = Field(..., max_length=255)
    slug: Optional[str] = Field(None, max_length=255)
    body: dict
    excerpt: Optional[str] = None
    featured_image_url: Optional[str] = None
    featured_image_alt: Optional[str] = None
    thumbnail_url: Optional[str] = None
    tags: Optional[List[str]] = None
    region_tags: Optional[List[str]] = None
    status: str = "draft"
    published_at: Optional[datetime] = None
    content_access_tier: str = "free"
    seo_title: Optional[str] = Field(None, max_length=70)
    meta_description: Optional[str] = Field(None, max_length=160)
    canonical_url: Optional[str] = None
    focus_keywords: Optional[List[str]] = None
    og_image_url: Optional[str] = None
    structured_data: Optional[dict] = None


class ArticleUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=255)
    slug: Optional[str] = Field(None, max_length=255)
    body: Optional[dict] = None
    excerpt: Optional[str] = None
    featured_image_url: Optional[str] = None
    featured_image_alt: Optional[str] = None
    thumbnail_url: Optional[str] = None
    tags: Optional[List[str]] = None
    region_tags: Optional[List[str]] = None
    status: Optional[str] = None
    published_at: Optional[datetime] = None
    content_access_tier: Optional[str] = None
    seo_title: Optional[str] = Field(None, max_length=70)
    meta_description: Optional[str] = Field(None, max_length=160)
    canonical_url: Optional[str] = None
    focus_keywords: Optional[List[str]] = None
    og_image_url: Optional[str] = None
    structured_data: Optional[dict] = None


# --- Comments ---

class CommentCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=2000)
    parent_id: Optional[int] = None


class CommentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    article_id: int
    user_id: int
    user_name: Optional[str] = None
    body: str
    parent_id: Optional[int] = None
    is_deleted: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None
    replies: List["CommentResponse"] = []
