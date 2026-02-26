from sqlalchemy import Column, Integer, String, DateTime, Text, ARRAY, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from db.base_class import Base


class ResearchReport(Base):
    __tablename__ = "research_reports"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    slug = Column(String(255), unique=True, nullable=False, index=True)
    abstract = Column(Text, nullable=False)
    authors = Column(ARRAY(String), nullable=False)
    status = Column(String(20), default="draft", nullable=False)
    published_at = Column(DateTime(timezone=True), nullable=True)
    version = Column(String(20), default="1.0", nullable=False)
    regions = Column(ARRAY(String), nullable=True)
    tags = Column(ARRAY(String), nullable=True)
    funding_acknowledgement = Column(Text, nullable=True)
    citation_text = Column(Text, nullable=True)

    # SEO fields
    seo_title = Column(String(70), nullable=True)
    meta_description = Column(String(160), nullable=True)
    canonical_url = Column(Text, nullable=True)
    focus_keywords = Column(ARRAY(String), nullable=True)
    og_image_url = Column(Text, nullable=True)
    structured_data = Column(JSONB, nullable=True)

    # Access control
    content_access_tier = Column(String(10), default="free", nullable=False)

    # Engagement counters
    like_count = Column(Integer, default=0, nullable=False)
    comment_count = Column(Integer, default=0, nullable=False)
    view_count = Column(Integer, default=0, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Relationships
    sections = relationship("ResearchSection", back_populates="report", cascade="all, delete-orphan", order_by="ResearchSection.sort_order")
    files = relationship("ResearchFile", back_populates="report", cascade="all, delete-orphan")
    comments = relationship("ResearchComment", back_populates="report", cascade="all, delete-orphan")
    likes = relationship("ResearchLike", back_populates="report", cascade="all, delete-orphan")


class ResearchSection(Base):
    __tablename__ = "research_sections"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("research_reports.id", ondelete="CASCADE"), nullable=False)
    sort_order = Column(Integer, nullable=False)
    title = Column(String(255), nullable=False)
    section_type = Column(String(20), nullable=False)  # text, chart, table, map, image, file
    content = Column(JSONB, nullable=False)
    caption = Column(Text, nullable=True)
    content_access_tier = Column(String(10), nullable=True)  # NULL inherits from report

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Relationships
    report = relationship("ResearchReport", back_populates="sections")
    files = relationship("ResearchFile", back_populates="section")
