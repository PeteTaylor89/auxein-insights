from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry

from db.base_class import Base

class Observation(Base):
    __tablename__ = "observations"

    id = Column(Integer, primary_key=True, index=True)
    block_id = Column(Integer, ForeignKey("vineyard_blocks.id", ondelete="CASCADE"))
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    observation_type = Column(String(50), nullable=False)
    notes = Column(Text)
    location = Column(Geometry(geometry_type='POINT', srid=4326))
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    row_id = Column(Integer, ForeignKey("vineyard_rows.id"), nullable=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)

    # Relationships
    block = relationship("VineyardBlock", back_populates="observations")
    creator = relationship("User", back_populates="observations")
    company = relationship("Company", back_populates="observations")
    row = relationship("VineyardRow", back_populates="observations")
    files = relationship(
        "File",
        primaryjoin="and_(Observation.id == foreign(remote(File.entity_id)), "
                   "File.entity_type == 'observation')",
        cascade="all, delete-orphan",
        viewonly=False  # Allow modifications
    )
    