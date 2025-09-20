# db/models/file.py - Centralized File Management
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from db.base_class import Base
import uuid

class File(Base):
    __tablename__ = "files"

    # Primary key as UUID string
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    
    # Entity relationship - what this file belongs to
    entity_type = Column(String(50), nullable=False, index=True)  # asset_maintenance, asset_calibration, etc.
    entity_id = Column(Integer, nullable=False, index=True)
    
    # File details
    original_filename = Column(String(255), nullable=False)
    stored_filename = Column(String(255), nullable=False)  # Generated filename
    file_path = Column(String(500), nullable=False)  # Full path including directory structure
    file_size = Column(Integer)  # Size in bytes
    mime_type = Column(String(100))
    
    # File organization and metadata
    file_category = Column(String(50))  # photo, document, certificate, invoice, manual, etc.
    description = Column(Text)
    tags = Column(JSON)  # ["urgent", "before", "after", "leak"]
    
    # Access and visibility
    is_public = Column(Boolean, default=False)  # Public within company
    requires_approval = Column(Boolean, default=False)  # For sensitive documents
    
    # File status
    upload_status = Column(String(20), default="uploaded")  # uploaded, processing, failed, deleted
    is_active = Column(Boolean, default=True)
    
    # Timestamps and audit
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())
    uploaded_by = Column(Integer, ForeignKey("users.id"))
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    deleted_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Relationships
    company = relationship("Company")
    uploader = relationship("User", foreign_keys=[uploaded_by])
    deleter = relationship("User", foreign_keys=[deleted_by])
    
    def __repr__(self):
        return f"<File(id='{self.id}', entity='{self.entity_type}:{self.entity_id}', filename='{self.original_filename}')>"
    
    @staticmethod
    def generate_stored_filename(entity_type: str, entity_id: int, original_filename: str, upload_date=None):
        """Generate a standardized stored filename"""
        from datetime import date
        if upload_date is None:
            upload_date = date.today()
        
        # Extract file extension
        file_ext = ""
        if "." in original_filename:
            file_ext = "." + original_filename.split(".")[-1].lower()
        
        # Generate UUID for uniqueness
        file_uuid = str(uuid.uuid4())[:8]
        
        # Format: entity_type_entityid_YYYYMMDD_uuid.ext
        stored_name = f"{entity_type}_{entity_id}_{upload_date.strftime('%Y%m%d')}_{file_uuid}{file_ext}"
        return stored_name

# Entity type constants for file management
class FileEntityTypes:
    """Constants for entity types that can have files"""
    
    # Asset Management
    ASSET = "asset"
    ASSET_MAINTENANCE = "asset_maintenance"
    ASSET_CALIBRATION = "asset_calibration"
    STOCK_MOVEMENT = "stock_movement"
    OBSERVATION_RUN = "observation_run"
    OBSERVATION_SPOT = "observation_spot"
    TASK = "task"
    TRAININGSLIDE = "training_slide"
    
    # Future integrations (commented out for now)
    # INCIDENT = "incident"
    # RISK_ASSESSMENT = "risk_assessment"
    # CONTRACTOR = "contractor"
    # VISITOR = "visitor"
    # TIMESHEET = "timesheet"
    # COMPANY = "company"
    # USER = "user"
