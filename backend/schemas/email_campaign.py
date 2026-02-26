# backend/schemas/email_campaign.py - Pydantic schemas for Email Campaigns API
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


class EmailTemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    template_type: str
    subject_template: str
    body_template: str
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None


class CampaignCreate(BaseModel):
    template_id: int
    subject: str = Field(..., max_length=255)
    body_html: str
    body_preview_text: Optional[str] = Field(None, max_length=200)
    intro_text: Optional[str] = None
    outro_text: Optional[str] = None
    article_ids: Optional[List[int]] = None
    research_ids: Optional[List[int]] = None
    target_regions: Optional[List[str]] = None
    target_tiers: Optional[List[str]] = None


class CampaignUpdate(BaseModel):
    subject: Optional[str] = Field(None, max_length=255)
    body_html: Optional[str] = None
    body_preview_text: Optional[str] = Field(None, max_length=200)
    intro_text: Optional[str] = None
    outro_text: Optional[str] = None
    article_ids: Optional[List[int]] = None
    research_ids: Optional[List[int]] = None
    target_regions: Optional[List[str]] = None
    target_tiers: Optional[List[str]] = None


class CampaignResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    template_id: int
    subject: str
    body_html: str
    body_preview_text: Optional[str] = None
    intro_text: Optional[str] = None
    outro_text: Optional[str] = None
    article_ids: Optional[List[int]] = None
    research_ids: Optional[List[int]] = None
    target_regions: Optional[List[str]] = None
    target_tiers: Optional[List[str]] = None
    status: str
    scheduled_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    recipients_count: int = 0
    opens_count: int = 0
    clicks_count: int = 0
    unsubscribes_count: int = 0
    created_at: datetime
    updated_at: Optional[datetime] = None


class CampaignListResponse(BaseModel):
    items: List[CampaignResponse]
    total: int
    page: int
    page_size: int


class CampaignStatsResponse(BaseModel):
    campaign_id: int
    subject: str
    status: str
    recipients_count: int
    opens_count: int
    clicks_count: int
    unsubscribes_count: int
    open_rate: float = 0.0
    click_rate: float = 0.0
    sent_at: Optional[datetime] = None


class CampaignSendRequest(BaseModel):
    scheduled_at: Optional[datetime] = None  # None = send now


class EmailPreferencesUpdate(BaseModel):
    newsletter_opt_in: Optional[bool] = None
    marketing_opt_in: Optional[bool] = None
    research_opt_in: Optional[bool] = None
    frequency_preference: Optional[str] = None
    preferred_regions: Optional[List[str]] = None


class EmailPreferencesResponse(BaseModel):
    newsletter_opt_in: bool
    marketing_opt_in: bool
    research_opt_in: bool
    frequency_preference: str = "weekly"
    preferred_regions: Optional[List[str]] = None
