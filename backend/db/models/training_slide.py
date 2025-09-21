# db/models/training_slide.py - Training Slide Model with Files Integration
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from db.base_class import Base

class TrainingSlide(Base):
    __tablename__ = "training_slides"

    # Basic slide info
    id = Column(Integer, primary_key=True, index=True)
    training_module_id = Column(Integer, ForeignKey("training_modules.id"), nullable=False)
    
    # Slide content
    title = Column(String(200), nullable=False)
    content = Column(Text, nullable=True)  # Main text content (optional if image is primary)
    bullet_points = Column(JSON, default=list, nullable=False)  # List of bullet point strings
    
    # Image metadata (actual images stored via files API)
    image_alt_text = Column(String(200), nullable=True)  # Alt text for accessibility
    image_caption = Column(String(300), nullable=True)  # Optional caption below image
    image_position = Column(String(20), default="top", nullable=False)  # "top", "bottom", "left", "right"
    
    # Slide ordering and display
    order = Column(Integer, nullable=False, default=1)  # Order within the module
    
    # Slide configuration
    is_active = Column(Boolean, default=True, nullable=False)
    auto_advance = Column(Boolean, default=False, nullable=False)  # Auto advance after X seconds
    auto_advance_seconds = Column(Integer, default=10, nullable=True)  # If auto_advance is True
    
    # Future enhancement fields (for V2+)
    slide_type = Column(String(50), default="text", nullable=False)  # "text", "image", "video" for future
    background_color = Column(String(7), nullable=True)  # Hex color for slide background
    text_color = Column(String(7), nullable=True)  # Hex color for text
    
    # Metadata
    estimated_read_time_seconds = Column(Integer, default=30, nullable=False)
    notes = Column(Text, nullable=True)  # Internal notes for module creators
    
    # Audit fields
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    module = relationship("TrainingModule", back_populates="slides")
    
    def __repr__(self):
        return f"<TrainingSlide(id={self.id}, title='{self.title}', module_id={self.training_module_id}, order={self.order})>"
    
    # ===== FILE INTEGRATION PROPERTIES =====
    
    @property
    def slide_image(self):
        """Get the primary image for this slide (if any)"""
        from db.models.file import File
        from db.session import SessionLocal
        
        db = SessionLocal()
        try:
            return db.query(File).filter(
                File.entity_type == "training_slide",
                File.entity_id == self.id,
                File.file_category == "photo",
                File.is_active == True
            ).first()
        finally:
            db.close()
    
    @property
    def slide_images(self):
        """Get all images for this slide"""
        from db.models.file import File
        from db.session import SessionLocal
        
        db = SessionLocal()
        try:
            return db.query(File).filter(
                File.entity_type == "training_slide",
                File.entity_id == self.id,
                File.file_category == "photo",
                File.is_active == True
            ).order_by(File.uploaded_at.desc()).all()
        finally:
            db.close()
    
    @property
    def image_url(self):
        """Get the URL for the primary slide image (backward compatibility)"""
        image = self.slide_image
        return f"/api/v1/files/{image.id}" if image else None
    
    @property
    def has_image(self):
        """Check if slide has an image"""
        return self.slide_image is not None
    
    @property
    def image_download_url(self):
        """Get the download URL for the primary slide image"""
        image = self.slide_image
        return f"/api/v1/files/{image.id}/download" if image else None
    
    def get_image_info(self):
        """Get formatted image information for API responses"""
        image = self.slide_image
        if not image:
            return None
            
        return {
            "id": image.id,
            "url": f"/api/v1/files/{image.id}",
            "download_url": f"/api/v1/files/{image.id}/download",
            "filename": image.original_filename,
            "alt_text": self.image_alt_text,
            "caption": self.image_caption,
            "position": self.image_position,
            "file_size": image.file_size,
            "uploaded_at": image.uploaded_at
        }
    
    # ===== EXISTING SLIDE METHODS (UPDATED) =====
    
    @property
    def bullet_points_count(self):
        """Get number of bullet points in this slide"""
        return len(self.bullet_points) if self.bullet_points else 0
    
    @property
    def has_content(self):
        """Check if slide has meaningful content"""
        return bool(self.title and (self.content or self.bullet_points or self.has_image))
    
    @property
    def is_image_primary(self):
        """Check if image is the primary content (minimal text)"""
        return self.has_image and not self.content and len(self.bullet_points or []) <= 2
    
    @property
    def word_count(self):
        """Estimate word count for reading time calculation"""
        content_words = len(self.content.split()) if self.content else 0
        bullet_words = sum(len(bullet.split()) for bullet in self.bullet_points) if self.bullet_points else 0
        return content_words + bullet_words
    
    def add_bullet_point(self, text: str):
        """Add a bullet point to the slide"""
        if not self.bullet_points:
            self.bullet_points = []
        self.bullet_points.append(text.strip())
    
    def remove_bullet_point(self, index: int):
        """Remove a bullet point by index"""
        if self.bullet_points and 0 <= index < len(self.bullet_points):
            self.bullet_points.pop(index)
    
    def update_bullet_point(self, index: int, text: str):
        """Update a bullet point by index"""
        if self.bullet_points and 0 <= index < len(self.bullet_points):
            self.bullet_points[index] = text.strip()
    
    def reorder_bullet_points(self, new_order: list):
        """Reorder bullet points based on new index order"""
        if self.bullet_points and len(new_order) == len(self.bullet_points):
            self.bullet_points = [self.bullet_points[i] for i in new_order]
    
    def calculate_read_time(self, words_per_minute: int = 200):
        """Calculate estimated reading time based on content"""
        words = self.word_count
        seconds = max(10, int((words / words_per_minute) * 60))  # Minimum 10 seconds
        self.estimated_read_time_seconds = seconds
        return seconds
    
    def get_formatted_content(self):
        """Get content formatted for display with image info"""
        formatted = {
            "title": self.title,
            "content": self.content,
            "bullet_points": self.bullet_points or [],
            "image": self.get_image_info(),  # Now uses files API
            "estimated_time": self.estimated_read_time_seconds,
            "order": self.order
        }
        return formatted
    
    # ===== DEPRECATED METHODS (FOR MIGRATION) =====
    # These methods are kept for backward compatibility during migration
    
    def set_image(self, url: str, alt_text: str = None, caption: str = None, position: str = "top"):
        """DEPRECATED: Set image for the slide (kept for migration only)"""
        # This method is now deprecated - images should be uploaded via files API
        # Keeping for migration scripts only
        self.image_alt_text = alt_text or f"Image for slide: {self.title}"
        self.image_caption = caption
        if position in ["top", "bottom", "left", "right"]:
            self.image_position = position
    
    def remove_image(self):
        """Remove image metadata from the slide (actual file removal handled by files API)"""
        self.image_alt_text = None
        self.image_caption = None
        self.image_position = "top"
    
    # ===== FILE MANAGEMENT HELPERS =====
    
    def update_image_metadata(self, alt_text: str = None, caption: str = None, position: str = None):
        """Update image metadata (alt text, caption, position)"""
        if alt_text is not None:
            self.image_alt_text = alt_text
        if caption is not None:
            self.image_caption = caption
        if position and position in ["top", "bottom", "left", "right"]:
            self.image_position = position
    
    def get_all_files(self):
        """Get all files associated with this slide (for future expansion)"""
        from db.models.file import File
        from db.session import SessionLocal
        
        db = SessionLocal()
        try:
            return db.query(File).filter(
                File.entity_type == "training_slide",
                File.entity_id == self.id,
                File.is_active == True
            ).order_by(File.uploaded_at.desc()).all()
        finally:
            db.close()