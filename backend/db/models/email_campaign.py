from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, ARRAY, ForeignKey
from sqlalchemy.sql import func
from db.base_class import Base


class EmailTemplate(Base):
    __tablename__ = "email_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    template_type = Column(String(30), nullable=False)  # spotlight, roundup, data_alert
    subject_template = Column(Text, nullable=False)
    body_template = Column(Text, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


class EmailCampaign(Base):
    __tablename__ = "email_campaigns"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("email_templates.id"), nullable=False)
    subject = Column(String(255), nullable=False)
    body_html = Column(Text, nullable=False)
    body_preview_text = Column(String(200), nullable=True)
    intro_text = Column(Text, nullable=True)
    outro_text = Column(Text, nullable=True)

    # Content references
    article_ids = Column(ARRAY(Integer), nullable=True)
    research_ids = Column(ARRAY(Integer), nullable=True)

    # Segmentation
    target_regions = Column(ARRAY(String), nullable=True)
    target_tiers = Column(ARRAY(String), nullable=True)

    # Scheduling
    status = Column(String(20), default="draft", nullable=False)
    scheduled_at = Column(DateTime(timezone=True), nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)

    # Metrics
    recipients_count = Column(Integer, default=0, nullable=False)
    opens_count = Column(Integer, default=0, nullable=False)
    clicks_count = Column(Integer, default=0, nullable=False)
    unsubscribes_count = Column(Integer, default=0, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


class EmailSend(Base):
    __tablename__ = "email_sends"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("email_campaigns.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("public_users.id"), nullable=False)
    email_address = Column(String(255), nullable=False)

    status = Column(String(20), default="queued", nullable=False)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    opened_at = Column(DateTime(timezone=True), nullable=True)
    clicked_at = Column(DateTime(timezone=True), nullable=True)
    unsubscribed_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
