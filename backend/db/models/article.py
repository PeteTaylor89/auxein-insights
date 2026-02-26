from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, ARRAY, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from db.base_class import Base


class Article(Base):
    __tablename__ = "articles"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    slug = Column(String(255), unique=True, nullable=False, index=True)
    body = Column(JSONB, nullable=False)
    excerpt = Column(Text, nullable=True)
    featured_image_url = Column(Text, nullable=True)
    featured_image_alt = Column(String(255), nullable=True)
    author_id = Column(Integer, ForeignKey("public_users.id"), nullable=True)
    status = Column(String(20), default="draft", nullable=False)
    published_at = Column(DateTime(timezone=True), nullable=True)
    tags = Column(ARRAY(String), nullable=True)
    region_tags = Column(ARRAY(String), nullable=True)

    # SEO fields
    seo_title = Column(String(70), nullable=True)
    meta_description = Column(String(160), nullable=True)
    canonical_url = Column(Text, nullable=True)
    focus_keywords = Column(ARRAY(String), nullable=True)
    og_image_url = Column(Text, nullable=True)
    thumbnail_url = Column(Text, nullable=True)
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
    author = relationship("PublicUser", foreign_keys=[author_id])
    comments = relationship("ArticleComment", back_populates="article", cascade="all, delete-orphan")
    likes = relationship("ArticleLike", back_populates="article", cascade="all, delete-orphan")
