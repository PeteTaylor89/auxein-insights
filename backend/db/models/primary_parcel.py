# File: app/db/models/primary_parcel.py
# ==================================================

from sqlalchemy import Column, Integer, String, Numeric, Text, DateTime, Boolean, ARRAY
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry
from datetime import datetime, timezone
from db.base_class import Base

class PrimaryParcel(Base):
    __tablename__ = "primary_parcels"
    
    id = Column(Integer, primary_key=True, index=True)
    linz_id = Column(Integer, unique=True, nullable=False, index=True)
    appellation = Column(Text)
    affected_surveys = Column(ARRAY(Text))
    parcel_intent = Column(String(100), index=True)
    topology_type = Column(String(50))
    statutory_actions = Column(ARRAY(Text))
    land_district = Column(String(100), index=True)
    titles = Column(ARRAY(Text))
    survey_area = Column(Numeric(15,4))  # Changed from Decimal to Numeric
    calc_area = Column(Numeric(15,4))    # Changed from Decimal to Numeric
    
    # Geometry in both projections
    geometry = Column(Geometry('MULTIPOLYGON', srid=2193))  # NZTM2000
    geometry_wgs84 = Column(Geometry('MULTIPOLYGON', srid=4326))  # WGS84
    
    # Data management fields
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), 
                       onupdate=lambda: datetime.now(timezone.utc))
    last_synced_at = Column(DateTime)
    sync_batch_id = Column(UUID(as_uuid=True))
    is_active = Column(Boolean, default=True, index=True)
    
    # Relationships
    company_ownerships = relationship("CompanyLandOwnership", back_populates="land_parcel")
    
    def __repr__(self):
        return f"<PrimaryParcel(id={self.id}, linz_id={self.linz_id}, appellation='{self.appellation}')>"
    
    @property
    def area_hectares(self):
        """Convert calc_area from square meters to hectares"""
        if self.calc_area:
            return float(self.calc_area) / 10000
        return None
    
    @property
    def is_owned_by_companies(self):
        """Check if this parcel has any company ownership"""
        return len(self.company_ownerships) > 0
    
    def get_owning_companies(self):
        """Get list of companies that own this parcel"""
        return [ownership.company for ownership in self.company_ownerships if ownership.verified]