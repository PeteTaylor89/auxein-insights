# db/models/file.py (renamed from image.py)
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, func, Index, Text
from sqlalchemy.orm import relationship

from db.base_class import Base

class File(Base):
    __tablename__ = "files"

    id = Column(Integer, primary_key=True, index=True)
    
    # Polymorphic association - replaces observation_id
    entity_type = Column(String(50), nullable=False)  # 'observation', 'contractor', 'incident', etc.
    entity_id = Column(Integer, nullable=False)       # ID of the related record
    
    # File details
    file_path = Column(String(255), nullable=False)
    file_name = Column(String(100), nullable=False)
    mime_type = Column(String(50))
    file_size = Column(Integer)
    
    # Optional metadata
    description = Column(Text, nullable=True)
    uploaded_at = Column(DateTime, default=func.now())
    
    # Composite index for efficient queries
    __table_args__ = (
        Index('ix_files_entity', 'entity_type', 'entity_id'),
    )
    
    def __repr__(self):
        return f"<File(id={self.id}, entity_type='{self.entity_type}', entity_id={self.entity_id}, filename='{self.file_name}')>"