# db/models/vineyard_row.py - Enhanced version
from sqlalchemy import Column, Integer, String, Float, DateTime, func, ForeignKey, JSON
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry
from db.base_class import Base

class VineyardRow(Base):
    __tablename__ = "vineyard_rows"
    
    id = Column(Integer, primary_key=True, index=True)
    block_id = Column(Integer, ForeignKey("vineyard_blocks.id"), nullable=False)
    row_number = Column(String, nullable=True)
    row_length = Column(Float, nullable=True)  
    vine_spacing = Column(Float, nullable=True)
    variety = Column(String, nullable=True)
    clone = Column(String, nullable=True)
    rootstock = Column(String, nullable=True)
    clonal_sections = Column(JSON, nullable=True)  # Store array of {start_vine: int, end_vine: int, clone: str, rootstock: str}
    geometry = Column(Geometry('LINESTRING', srid=4326), nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # Relationships
    block = relationship("VineyardBlock", back_populates="rows")
    tasks = relationship("Task", back_populates="row")
    observation_spots = relationship("ObservationSpot", back_populates="row", cascade="all, delete-orphan")
    
    # Calculated property
    @property
    def vine_count(self):
        """Calculate vine count from row length and vine spacing"""
        if self.row_length and self.vine_spacing and self.vine_spacing > 0:
            return int(self.row_length / self.vine_spacing)
        return None
    
    # NEW: Property to check if row has multiple clones
    @property
    def has_multiple_clones(self):
        """Check if this row has multiple clonal sections"""
        return bool(self.clonal_sections and len(self.clonal_sections) > 0)
    
    # NEW: Get clone info at specific vine position
    def get_clone_at_position(self, vine_number):
        """Get clone/rootstock info at a specific vine position"""
        if not self.clonal_sections:
            return {"clone": self.clone, "rootstock": self.rootstock}
        
        for section in self.clonal_sections:
            if section.get("start_vine", 0) <= vine_number <= section.get("end_vine", float("inf")):
                return {
                    "clone": section.get("clone", self.clone),
                    "rootstock": section.get("rootstock", self.rootstock)
                }
        
        return {"clone": self.clone, "rootstock": self.rootstock}
    
    # Geometry helper properties (unchanged)
    @property
    def start_point(self):
        """Get the start point coordinates of the row"""
        if self.geometry:
            try:
                from geoalchemy2.shape import to_shape
                line = to_shape(self.geometry)
                return {"lat": line.coords[0][1], "lng": line.coords[0][0]}
            except:
                return None
        return None
    
    @property
    def end_point(self):
        """Get the end point coordinates of the row"""
        if self.geometry:
            try:
                from geoalchemy2.shape import to_shape
                line = to_shape(self.geometry)
                return {"lat": line.coords[-1][1], "lng": line.coords[-1][0]}
            except:
                return None
        return None
    
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