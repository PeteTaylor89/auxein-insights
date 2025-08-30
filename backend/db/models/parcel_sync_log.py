# ==================================================
# File: app/db/models/parcel_sync_log.py (FIXED)
# ==================================================

from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid
from db.base_class import Base

class ParcelSyncLog(Base):
    __tablename__ = "parcel_sync_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(UUID(as_uuid=True), unique=True, nullable=False, default=uuid.uuid4)
    sync_type = Column(String(50), index=True)  # 'full_refresh', 'incremental', 'manual'
    started_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    completed_at = Column(DateTime)
    status = Column(String(50), default='running', index=True)  # 'running', 'completed', 'failed', 'cancelled'
    total_records = Column(Integer)
    processed_records = Column(Integer, default=0)
    created_records = Column(Integer, default=0)
    updated_records = Column(Integer, default=0)
    deleted_records = Column(Integer, default=0)
    error_message = Column(Text)
    triggered_by = Column(Integer, ForeignKey('users.id'), index=True)
    sync_metadata = Column(JSONB)  # RENAMED from 'metadata' to 'sync_metadata'
    
    # Relationships
    triggered_by_user = relationship("User", foreign_keys=[triggered_by])
    
    def __repr__(self):
        return f"<ParcelSyncLog(id={self.id}, batch_id={self.batch_id}, status='{self.status}')>"
    
    @property
    def duration_seconds(self):
        """Calculate sync duration in seconds"""
        if self.completed_at and self.started_at:
            return (self.completed_at - self.started_at).total_seconds()
        elif self.started_at:
            return (datetime.now(timezone.utc) - self.started_at).total_seconds()
        return None
    
    @property
    def progress_percentage(self):
        """Calculate sync progress as percentage"""
        if self.total_records and self.total_records > 0:
            return (self.processed_records / self.total_records) * 100
        return 0
    
    @property
    def records_per_second(self):
        """Calculate processing rate"""
        duration = self.duration_seconds
        if duration and duration > 0 and self.processed_records:
            return self.processed_records / duration
        return None
    
    def is_running(self):
        return self.status == 'running'
    
    def is_completed(self):
        return self.status == 'completed'
    
    def is_failed(self):
        return self.status == 'failed'
    
    def add_metadata(self, key, value):
        """Helper method to add metadata"""
        if self.sync_metadata is None:
            self.sync_metadata = {}
        self.sync_metadata[key] = value
    
    def get_metadata(self, key, default=None):
        """Helper method to get metadata"""
        if self.sync_metadata:
            return self.sync_metadata.get(key, default)
        return default