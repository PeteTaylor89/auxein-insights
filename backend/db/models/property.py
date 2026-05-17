# db/models/property.py - Property entity (Grow V1, Revision 2)
from sqlalchemy import Column, Integer, String, Text, DateTime, Numeric, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry
from db.base_class import Base


class Property(Base):
    __tablename__ = "properties"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    owner_company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    address = Column(Text, nullable=True)
    legal_description = Column(Text, nullable=True)
    total_area_ha = Column(Numeric(10, 4), nullable=True)
    region = Column(String(100), nullable=True)
    grapelink_grower_id = Column(String(100), nullable=True)
    grapelink_property_code = Column(String(100), nullable=True)

    # Climate & weather (Revision 2)
    climate_zone_id = Column(Integer, ForeignKey("climate_zones.id"), nullable=True, index=True)
    forecast_latitude = Column(Numeric(10, 7), nullable=True)
    forecast_longitude = Column(Numeric(10, 7), nullable=True)

    # Boundary polygon for contractor geofencing (Grow V1, Revision 3).
    # POLYGON or MULTIPOLYGON in WGS84 (SRID 4326). NULL until an admin draws one.
    geometry = Column(Geometry('GEOMETRY', srid=4326), nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    owner_company = relationship(
        "Company",
        foreign_keys=[owner_company_id],
        back_populates="owned_properties"
    )
    climate_zone = relationship("ClimateZone", foreign_keys=[climate_zone_id])
    management_relationships = relationship(
        "ManagementRelationship",
        back_populates="property",
        order_by="ManagementRelationship.start_date"
    )
    blocks = relationship("VineyardBlock", back_populates="property")

    def __repr__(self):
        return f"<Property(id={self.id}, name='{self.name}', owner_company_id={self.owner_company_id})>"
