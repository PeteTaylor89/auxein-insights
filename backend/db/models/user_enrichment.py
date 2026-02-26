from sqlalchemy import Column, Integer, String, DateTime, ARRAY, ForeignKey, Numeric
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from db.base_class import Base


class UserEvent(Base):
    __tablename__ = "user_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("public_users.id"), nullable=False)
    event_type = Column(String(50), nullable=False)
    event_data = Column(JSONB, nullable=True)
    session_id = Column(String(100), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class UserProfile(Base):
    __tablename__ = "user_profiles"

    user_id = Column(Integer, ForeignKey("public_users.id", ondelete="CASCADE"), primary_key=True)

    # Engagement metrics
    total_sessions = Column(Integer, default=0, nullable=False)
    total_article_reads = Column(Integer, default=0, nullable=False)
    total_research_views = Column(Integer, default=0, nullable=False)
    total_comments = Column(Integer, default=0, nullable=False)
    total_likes = Column(Integer, default=0, nullable=False)
    avg_session_duration_sec = Column(Integer, default=0, nullable=False)
    last_active_at = Column(DateTime(timezone=True), nullable=True)

    # Behavioural signals
    most_viewed_regions = Column(ARRAY(String), nullable=True)
    most_used_metrics = Column(ARRAY(String), nullable=True)
    content_preferences = Column(ARRAY(String), nullable=True)
    engagement_score = Column(Numeric, default=0, nullable=False)

    # Segmentation
    segment = Column(String(50), nullable=True)

    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
