from sqlalchemy import Column, Integer, String, Text, Date, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship

from db.base_class import Base

class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    block_id = Column(Integer, ForeignKey("vineyard_blocks.id", ondelete="CASCADE"), nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_to = Column(Integer, ForeignKey("users.id"))
    assigned_contractor_id = Column(Integer, ForeignKey("contractors.id"), nullable=True)  # New field
    title = Column(String(100), nullable=False)
    description = Column(Text)
    priority = Column(String(20))
    status = Column(String(20))
    due_date = Column(Date)
    completion_date = Column(Date)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    row_id = Column(Integer, ForeignKey("vineyard_rows.id"), nullable=True)

    # Relationships
    block = relationship("VineyardBlock", back_populates="tasks")
    creator = relationship("User", foreign_keys=[created_by], back_populates="tasks_created")
    assignee = relationship("User", foreign_keys=[assigned_to], back_populates="tasks_assigned")
    row = relationship("VineyardRow", back_populates="tasks")
    risk_action = relationship("RiskAction", back_populates="task", uselist=False)
    assigned_contractor = relationship("Contractor")  # New relationship
    contractor_assignments = relationship("ContractorAssignment", back_populates="task")
    time_entries = relationship("TimeEntry", back_populates="task", cascade="all, delete-orphan")
    task_assets = relationship("TaskAsset", back_populates="task", cascade="all, delete-orphan")
    observation_links = relationship("ObservationTaskLink", back_populates="task", cascade="all, delete-orphan")

@property
def primary_assets(self):
    return [ta.asset for ta in self.task_assets if ta.role == "primary"]

@property 
def consumable_assets(self):
    return [ta.asset for ta in self.task_assets if ta.role == "consumable"]