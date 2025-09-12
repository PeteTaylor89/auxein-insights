#db/models/observation_plan.py

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from db.base_class import Base

class ObservationPlan(Base):
    __tablename__ = "observation_plans"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    template_id = Column(Integer, ForeignKey("observation_templates.id"), nullable=False)
    template_version = Column(Integer, nullable=False)

    name = Column(String(160), nullable=False)
    instructions = Column(Text, nullable=True)

    # Due window (use tz-aware like your other models)
    due_start_at = Column(DateTime(timezone=True), nullable=True)
    due_end_at = Column(DateTime(timezone=True), nullable=True)
    # Optional recurrence rule (RFC5545-style string)
    rrule = Column(Text, nullable=True)

    priority = Column(String(20), nullable=True)  # low|normal|high
    status = Column(String(20), nullable=False, default="scheduled")  # scheduled|in_progress|completed|cancelled|missed

    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Rels
    template = relationship("ObservationTemplate")
    targets = relationship("ObservationPlanTarget", back_populates="plan", cascade="all, delete-orphan")
    assignees = relationship("ObservationPlanAssignee", back_populates="plan", cascade="all, delete-orphan")
    runs = relationship("ObservationRun", back_populates="plan")

class ObservationPlanTarget(Base):
    __tablename__ = "observation_plan_targets"

    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, ForeignKey("observation_plans.id", ondelete="CASCADE"), nullable=False)
    block_id = Column(Integer, ForeignKey("vineyard_blocks.id", ondelete="CASCADE"), nullable=False)
    # Keep rows flexible: store labels or expand to row_ids later
    row_labels = Column(JSON, nullable=False, default=list)  # e.g. ["X","Y","Z"] or ["1","2","3"]
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=True)  # optional link to an asset (sprayer/fan/zone)
    sample_size = Column(Integer, nullable=True)  # e.g., vines to sample per target
    notes = Column(Text, nullable=True)

    plan = relationship("ObservationPlan", back_populates="targets")
    block = relationship("VineyardBlock")

class ObservationPlanAssignee(Base):
    __tablename__ = "observation_plan_assignees"

    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, ForeignKey("observation_plans.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    plan = relationship("ObservationPlan", back_populates="assignees")
    user = relationship("User")
