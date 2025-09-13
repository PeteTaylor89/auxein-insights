#/db/models/reference_item_file.py

from sqlalchemy import Column, Integer, String, Text, Boolean, ForeignKey, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from db.base_class import Base

class ReferenceItemFile(Base):
    __tablename__ = "reference_item_files"

    id = Column(Integer, primary_key=True)
    reference_item_id = Column(Integer, ForeignKey("reference_items.id", ondelete="CASCADE"), nullable=False, index=True)
    file_id = Column(String(36), ForeignKey("files.id", ondelete="CASCADE"), nullable=False, index=True)

    caption = Column(Text, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    is_primary = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=True, onupdate=func.now())

    # relations
    reference_item = relationship("ReferenceItem", back_populates="files_assoc")
    file = relationship("File")
