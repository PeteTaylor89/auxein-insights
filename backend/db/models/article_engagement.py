from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from db.base_class import Base


class ArticleComment(Base):
    __tablename__ = "article_comments"

    id = Column(Integer, primary_key=True, index=True)
    article_id = Column(Integer, ForeignKey("articles.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("public_users.id"), nullable=False)
    body = Column(Text, nullable=False)
    parent_id = Column(Integer, ForeignKey("article_comments.id", ondelete="CASCADE"), nullable=True)
    is_deleted = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Relationships
    article = relationship("Article", back_populates="comments")
    user = relationship("PublicUser", foreign_keys=[user_id])
    replies = relationship("ArticleComment", back_populates="parent", cascade="all, delete-orphan")
    parent = relationship("ArticleComment", back_populates="replies", remote_side=[id])


class ArticleLike(Base):
    __tablename__ = "article_likes"

    id = Column(Integer, primary_key=True, index=True)
    article_id = Column(Integer, ForeignKey("articles.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("public_users.id"), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    article = relationship("Article", back_populates="likes")
    user = relationship("PublicUser", foreign_keys=[user_id])

    __table_args__ = (
        UniqueConstraint("article_id", "user_id", name="uq_article_likes_article_user"),
    )
