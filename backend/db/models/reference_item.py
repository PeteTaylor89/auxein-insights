#db/models/reference_item.py

from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from db.base_class import Base

class ReferenceItem(Base):
    """
    System/org catalog entries (EL stages, diseases, pests, etc.) with optional images.
    category: EL_STAGE | DISEASE | PEST | (DEFICIENCY, BENEFICIAL later)
    key:     e.g. 'EL-27', 'powdery_mildew'
    """
    __tablename__ = "reference_items"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=True)  # NULL = system

    category = Column(String(30), nullable=False, index=True)
    key = Column(String(80), nullable=False, index=True)
    label = Column(String(160), nullable=False)
    description = Column(Text, nullable=True)
    aliases = Column(JSON, nullable=False, default=list)

    # Image/file integration (use your file service)
    icon_file_id = Column(String(36), nullable=True)      # points to File.id (UUID string)
    photo_file_ids = Column(JSON, nullable=False, default=list)

    source_url = Column(String(500), nullable=True)
    license = Column(String(200), nullable=True)
    attribution = Column(Text, nullable=True)

    parent_id = Column(Integer, ForeignKey("reference_items.id"), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)

    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    parent = relationship("ReferenceItem", remote_side=[id])
    creator = relationship("User")
    files_assoc = relationship(
        "ReferenceItemFile",
        back_populates="reference_item",
        cascade="all, delete-orphan",
        order_by="ReferenceItemFile.sort_order.asc()",
    )
