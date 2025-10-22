# db/models/spatial_area.py - FIXED version
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, JSON, Numeric
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from geoalchemy2 import Geometry
from db.base_class import Base

class SpatialArea(Base):
    __tablename__ = "spatial_areas"
    
    id = Column(Integer, primary_key=True, index=True)
    area_type = Column(String(50), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    geometry = Column(Geometry('POLYGON', srid=4326), nullable=False)
    parent_area_id = Column(Integer, ForeignKey('spatial_areas.id'), nullable=True)
    company_id = Column(Integer, ForeignKey('companies.id'), nullable=False)
    area_metadata = Column(JSON, default=dict, nullable=False)  
    area_hectares = Column(Numeric, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    company = relationship("Company", back_populates="spatial_areas")
    parent_area = relationship("SpatialArea", remote_side=[id], back_populates="child_areas")
    child_areas = relationship("SpatialArea", back_populates="parent_area")
    tasks = relationship(
        "Task", 
        back_populates="spatial_area", 
        cascade="all, delete-orphan",
        foreign_keys="[Task.spatial_area_id]"
    )
    
    @property
    def geometry_geojson(self):
        """Get geometry as GeoJSON for API responses"""
        if self.geometry:
            try:
                from geoalchemy2.shape import to_shape
                from shapely.geometry import mapping
                geom = to_shape(self.geometry)
                return mapping(geom)
            except:
                return None
        return None
    
    @property
    def centroid(self):
        """Get centroid coordinates"""
        if self.geometry:
            try:
                from geoalchemy2.shape import to_shape
                geom = to_shape(self.geometry)
                centroid = geom.centroid
                return {"lat": centroid.y, "lng": centroid.x}
            except:
                return None
        return None
    
    def __repr__(self):
        return f"<SpatialArea(id={self.id}, type='{self.area_type}', name='{self.name}')>"