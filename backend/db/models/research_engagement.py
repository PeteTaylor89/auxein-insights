from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from db.base_class import Base


class ResearchFile(Base):
    __tablename__ = "research_files"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("research_reports.id", ondelete="CASCADE"), nullable=False)
    section_id = Column(Integer, ForeignKey("research_sections.id", ondelete="SET NULL"), nullable=True)
    file_url = Column(Text, nullable=False)
    file_type = Column(String(20), nullable=False)
    file_name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    report = relationship("ResearchReport", back_populates="files")
    section = relationship("ResearchSection", back_populates="files")


class ResearchComment(Base):
    __tablename__ = "research_comments"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("research_reports.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("public_users.id"), nullable=False)
    body = Column(Text, nullable=False)
    parent_id = Column(Integer, ForeignKey("research_comments.id", ondelete="CASCADE"), nullable=True)
    is_deleted = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Relationships
    report = relationship("ResearchReport", back_populates="comments")
    user = relationship("PublicUser", foreign_keys=[user_id])
    replies = relationship("ResearchComment", back_populates="parent", cascade="all, delete-orphan")
    parent = relationship("ResearchComment", back_populates="replies", remote_side=[id])


class ResearchLike(Base):
    __tablename__ = "research_likes"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("research_reports.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("public_users.id"), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    report = relationship("ResearchReport", back_populates="likes")
    user = relationship("PublicUser", foreign_keys=[user_id])

    __table_args__ = (
        UniqueConstraint("report_id", "user_id", name="uq_research_likes_report_user"),
    )
