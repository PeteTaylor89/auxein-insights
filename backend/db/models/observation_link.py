#db/models/observation_link.py

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from db.base_class import Base

class ObservationTaskLink(Base):
    __tablename__ = "observation_task_links"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)

    observation_run_id = Column(Integer, ForeignKey("observation_runs.id", ondelete="CASCADE"), nullable=True)
    observation_spot_id = Column(Integer, ForeignKey("observation_spots.id", ondelete="CASCADE"), nullable=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)

    link_reason = Column(String(120), nullable=True)  # e.g., "disease_threshold_exceeded"
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    run = relationship("ObservationRun")
    spot = relationship("ObservationSpot")
    task = relationship("Task")
