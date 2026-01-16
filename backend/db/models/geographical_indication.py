# db/models/geographical_indication.py
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, Date, func, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry
from db.base_class import Base


class GeographicalIndication(Base):
    __tablename__ = "geographical_indications"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    slug = Column(String(100), nullable=False, unique=True, index=True)
    
    # Boundary geometry (from ESRI GI files)
    geometry = Column(Geometry('MULTIPOLYGON', srid=4326), nullable=True)
    
    # Bounding box for fly-to functionality
    bounds = Column(JSONB, nullable=True)
    # Example: {"min_lng": 174.5, "min_lat": -36.9, "max_lng": 174.8, "max_lat": -36.6}
    
    # IPoNZ Registration Data
    ip_number = Column(String(20), nullable=True)
    iponz_url = Column(String(500), nullable=True)
    status = Column(String(50), default='Registered')
    registration_date = Column(Date, nullable=True)
    renewal_date = Column(Date, nullable=True)  # End_Date from ESRI file
    
    # Notes from ESRI file
    notes = Column(Text, nullable=True)
    
    # Parent region (optional, linked via spatial containment or manual)
    region_id = Column(Integer, ForeignKey("wine_regions.id"), nullable=True)
    
    # Display settings
    display_order = Column(Integer, default=0)
    color = Column(String(7), default='#8b5cf6')  # Purple for GIs
    is_active = Column(Boolean, default=True)
    
    # Timestamps
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # Relationships
    region = relationship("WineRegion", back_populates="geographical_indications")
    
    def __repr__(self):
        return f"<GeographicalIndication(id={self.id}, name='{self.name}', ip_number='{self.ip_number}')>"
    
    @property
    def is_registered(self):
        """Check if GI is currently registered"""
        return self.status == 'Registered'
    
    @property
    def iponz_display_url(self):
        """Get clean display URL for IPoNZ"""
        if self.iponz_url:
            return self.iponz_url
        elif self.slug:
            return f"https://www.iponz.govt.nz/about-ip/geographical-indications/register/{self.slug}"
        return None