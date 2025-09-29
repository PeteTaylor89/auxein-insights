#db/models/observation_run.py

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry
from db.base_class import Base

class ObservationRun(Base):
    __tablename__ = "observation_runs"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)

    plan_id = Column(Integer, ForeignKey("observation_plans.id"), nullable=True)
    template_id = Column(Integer, ForeignKey("observation_templates.id"), nullable=False)
    template_version = Column(Integer, nullable=False)
    
    block_id = Column(Integer, ForeignKey("vineyard_blocks.id", ondelete="CASCADE"), nullable=True)

    name = Column(String(160), nullable=False)
    observed_at_start = Column(DateTime(timezone=True), nullable=True)
    observed_at_end = Column(DateTime(timezone=True), nullable=True)

    # Attachments & tags follow your JSON array conventions
    photo_file_ids = Column(JSON, nullable=False, default=list)
    document_file_ids = Column(JSON, nullable=False, default=list)
    tags = Column(JSON, nullable=False, default=list)

    # Server-computed rollups on completion (mean/sd/ci/coverage/yield/confidence/assumptions)
    summary_json = Column(JSON, nullable=False, default=dict)

    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    plan = relationship("ObservationPlan", back_populates="runs")
    template = relationship("ObservationTemplate")
    spots = relationship("ObservationSpot", back_populates="run", cascade="all, delete-orphan")
    creator = relationship("User")
    block = relationship("VineyardBlock")

class ObservationSpot(Base):
    __tablename__ = "observation_spots"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)

    run_id = Column(Integer, ForeignKey("observation_runs.id", ondelete="CASCADE"), nullable=False)
    observed_at = Column(DateTime(timezone=True), nullable=True)

    block_id = Column(Integer, ForeignKey("vineyard_blocks.id", ondelete="CASCADE"), nullable=True)
    row_id = Column(Integer, ForeignKey("vineyard_rows.id"), nullable=True)

    # SRID 4326 POINT, consistent with your other spatial models
    gps = Column(Geometry(geometry_type='POINT', srid=4326), nullable=True)

    # The answers from the template's fields (minimal, typed in app)
    data_json = Column(JSON, nullable=False, default=dict)

    # Optional media per-spot
    photo_file_ids = Column(JSON, nullable=False, default=list)
    video_file_ids = Column(JSON, nullable=False, default=list)  
    document_file_ids = Column(JSON, nullable=False, default=list)

    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    run = relationship("ObservationRun", back_populates="spots")
    block = relationship("VineyardBlock")
    row = relationship("VineyardRow")
    creator = relationship("User")
