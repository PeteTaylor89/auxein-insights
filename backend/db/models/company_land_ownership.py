# File: app/db/models/company_land_ownership.py
# ==================================================

from sqlalchemy import Column, Integer, Numeric, String, Date, Boolean, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from db.base_class import Base

class CompanyLandOwnership(Base):
    __tablename__ = "company_land_ownership"
    
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey('companies.id', ondelete='CASCADE'), nullable=False, index=True)
    land_parcel_id = Column(Integer, ForeignKey('primary_parcels.id', ondelete='CASCADE'), nullable=False, index=True)
    
    # Ownership details
    ownership_type = Column(String(50), default='full', index=True)  # 'full', 'partial', 'leased', 'disputed'
    ownership_percentage = Column(Numeric(5,2), default=100.00)  # Changed from Decimal to Numeric
    ownership_start_date = Column(Date)
    ownership_end_date = Column(Date)
    
    # Verification
    verified = Column(Boolean, default=False, index=True)
    verification_method = Column(String(100))  # 'landonline', 'title_deed', 'manual', 'survey'
    notes = Column(Text)
    
    # Audit fields
    created_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), 
                       onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    company = relationship("Company", back_populates="land_ownerships")
    land_parcel = relationship("PrimaryParcel", back_populates="company_ownerships")
    created_by_user = relationship("User", foreign_keys=[created_by])
    
    def __repr__(self):
        return f"<CompanyLandOwnership(company_id={self.company_id}, parcel_id={self.land_parcel_id}, type='{self.ownership_type}')>"
    
    @property
    def is_full_ownership(self):
        return self.ownership_type == 'full' and self.ownership_percentage >= 100.00
    
    @property
    def is_current_ownership(self):
        """Check if ownership is currently valid"""
        now = datetime.now().date()
        
        # Check start date
        if self.ownership_start_date and self.ownership_start_date > now:
            return False
        
        # Check end date
        if self.ownership_end_date and self.ownership_end_date < now:
            return False
        
        return True
    
    def get_ownership_status(self):
        """Get human-readable ownership status"""
        if not self.verified:
            return "Unverified"
        
        if not self.is_current_ownership:
            return "Expired"
        
        if self.is_full_ownership:
            return "Full Owner"
        elif self.ownership_percentage > 50:
            return f"Majority Owner ({self.ownership_percentage}%)"
        else:
            return f"Partial Owner ({self.ownership_percentage}%)"