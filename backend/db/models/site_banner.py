# backend/db/models/site_banner.py
"""
Site-wide announcement banners for the landing page.
Managed by admins, displayed publicly to all users.
"""

import enum
from datetime import datetime
from typing import Optional
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, Enum, func
from sqlalchemy.orm import Mapped, mapped_column
from db.base_class import Base


class BannerType(str, enum.Enum):
    update = "update"
    coming_soon = "coming_soon"


class BannerAudience(str, enum.Enum):
    insights = "insights"
    grow = "grow"
    both = "both"


class SiteBanner(Base):
    __tablename__ = "site_banners"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    banner_type: Mapped[BannerType] = mapped_column(
        Enum(BannerType), nullable=False, default=BannerType.update
    )
    audience: Mapped[BannerAudience] = mapped_column(
        Enum(BannerAudience), nullable=False, default=BannerAudience.insights, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )
