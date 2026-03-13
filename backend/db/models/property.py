# db/models/property.py - Property entity (Phase A, Grow V1)
from sqlalchemy import Column, Integer, String, Text, DateTime, Numeric, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
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
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    owner_company = relationship(
        "Company",
        foreign_keys=[owner_company_id],
        back_populates="owned_properties"
    )
    management_relationships = relationship(
        "ManagementRelationship",
        back_populates="property",
        order_by="ManagementRelationship.start_date"
    )
    blocks = relationship("VineyardBlock", back_populates="property")

    def __repr__(self):
        return f"<Property(id={self.id}, name='{self.name}', owner_company_id={self.owner_company_id})>"
