# backend/schemas/enrichment.py - Pydantic schemas for User Enrichment API
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


class EventCreate(BaseModel):
    event_type: str = Field(..., max_length=50)
    event_data: Optional[Dict[str, Any]] = None
    session_id: Optional[str] = Field(None, max_length=100)


class EventBatchCreate(BaseModel):
    events: List[EventCreate] = Field(..., max_length=50)


class UserProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    user_id: int
    total_sessions: int = 0
    total_article_reads: int = 0
    total_research_views: int = 0
    total_comments: int = 0
    total_likes: int = 0
    avg_session_duration_sec: int = 0
    last_active_at: Optional[datetime] = None
    most_viewed_regions: Optional[List[str]] = None
    most_used_metrics: Optional[List[str]] = None
    content_preferences: Optional[List[str]] = None
    engagement_score: float = 0
    segment: Optional[str] = None
    updated_at: datetime


class UserProfileListItem(BaseModel):
    user_id: int
    email: str
    full_name: str
    user_type: Optional[str] = None
    region_of_interest: Optional[str] = None
    subscription_tier: str = "free"
    engagement_score: float = 0
    segment: Optional[str] = None
    total_sessions: int = 0
    last_active_at: Optional[datetime] = None


class UserProfileListResponse(BaseModel):
    items: List[UserProfileListItem]
    total: int
    page: int
    page_size: int


class SegmentCount(BaseModel):
    segment: str
    count: int


class ContentPerformanceItem(BaseModel):
    content_type: str
    content_id: int
    title: str
    view_count: int = 0
    like_count: int = 0
    comment_count: int = 0
    segment_breakdown: Dict[str, int] = {}
