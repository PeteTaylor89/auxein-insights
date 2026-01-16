# db/models/wine_region.py
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, func, Float
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry
from db.base_class import Base


class WineRegion(Base):
    __tablename__ = "wine_regions"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    slug = Column(String(100), nullable=False, unique=True, index=True)
    
    # Boundary geometry (from LINZ council boundaries)
    geometry = Column(Geometry('MULTIPOLYGON', srid=4326), nullable=True)
    
    # Bounding box for fly-to functionality
    bounds = Column(JSONB, nullable=True)
    # Example: {"min_lng": 173.5, "min_lat": -42.0, "max_lng": 174.5, "max_lat": -41.0}
    
    # Content
    summary = Column(Text, nullable=True)  # Short 1-2 sentences for popup
    description = Column(Text, nullable=True)  # Full description
    climate_summary = Column(Text, nullable=True)
    
    # Stats from NZWine (JSONB for flexibility)
    stats = Column(JSONB, nullable=True)
    """
    Example structure:
    {
        "year": 2024,
        "total_planted_ha": 29190.50,
        "varieties": [
            {"name": "Sauvignon Blanc", "area_ha": 25891.29, "percentage": 83.33},
            {"name": "Pinot Noir", "area_ha": 2427.27, "percentage": 7.81},
            ...
        ],
        "top_5_varieties": ["Sauvignon Blanc", "Pinot Noir", "Pinot Gris", "Chardonnay", "Riesling"],
        "variety_count": 45,
        "source": "NZ Winegrowers Annual Report 2024"
    }
    """
    
    # Display settings
    display_order = Column(Integer, default=0)
    color = Column(String(7), default='#3b82f6')  # Hex color for map
    is_active = Column(Boolean, default=True)
    
    # Timestamps
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # Relationships
    geographical_indications = relationship(
        "GeographicalIndication",
        back_populates="region",
        cascade="all, delete-orphan"
    )
    
    def __repr__(self):
        return f"<WineRegion(id={self.id}, name='{self.name}')>"
    
    @property
    def top_variety(self):
        """Get the top variety for this region"""
        if self.stats and 'varieties' in self.stats and len(self.stats['varieties']) > 0:
            return self.stats['varieties'][0]
        return None
    
    @property
    def total_planted_ha(self):
        """Get total planted hectares"""
        if self.stats and 'total_planted_ha' in self.stats:
            return self.stats['total_planted_ha']
        return 0