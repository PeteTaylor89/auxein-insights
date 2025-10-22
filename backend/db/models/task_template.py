# db/models/task_template.py
from __future__ import annotations
import enum
from datetime import datetime
from typing import Optional, List, TYPE_CHECKING

from sqlalchemy import Column, Integer, String, Text, Boolean, ForeignKey, Numeric, JSON, DateTime, func, Enum
from sqlalchemy.orm import relationship, Mapped, mapped_column

from db.base_class import Base

if TYPE_CHECKING:
    from db.models.task import Task
    from db.models.company import Company
    from db.models.user import User


class TaskCategory(str, enum.Enum):
    """Main task categories"""
    vineyard = "vineyard"
    land_management = "land_management"
    asset_management = "asset_management"
    compliance = "compliance"
    general = "general"


class TaskTemplate(Base):
    """Reusable task definitions for quick task creation"""
    __tablename__ = "task_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Template identity
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    task_category: Mapped[TaskCategory] = mapped_column(Enum(TaskCategory), nullable=False, index=True)
    task_subcategory: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # "pruning", "spraying", "mowing"
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Display settings
    icon: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # Icon identifier for UI
    color: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # Color coding (#hex)
    
    # Default settings
    default_duration_hours: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    default_priority: Mapped[str] = mapped_column(String(20), default="medium", nullable=False)  # low, medium, high, urgent
    
    # Execution requirements
    requires_gps_tracking: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    allows_partial_completion: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    
    # Asset requirements (JSON arrays of asset IDs)
    required_equipment_ids: Mapped[Optional[dict]] = mapped_column(JSON, default=list, nullable=True)  # [1, 5, 12]
    optional_equipment_ids: Mapped[Optional[dict]] = mapped_column(JSON, default=list, nullable=True)  # [3, 8]
    
    # Consumable requirements (JSON array of objects)
    # Format: [{"asset_id": 15, "rate_per_hectare": 2.5, "unit": "L"}]
    required_consumables: Mapped[Optional[dict]] = mapped_column(JSON, default=list, nullable=True)
    
    # Field display
    quick_create_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)  # Show in quick task menu
    
    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    
    # Metadata
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    created_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    # Relationships
    company = relationship("Company", back_populates="task_templates")
    creator = relationship("User", foreign_keys=[created_by])
    tasks: Mapped[List["Task"]] = relationship("Task", back_populates="template")
    
    def __repr__(self):
        return f"<TaskTemplate(id={self.id}, name='{self.name}', category='{self.task_category}')>"
    
    def to_task_defaults(self) -> dict:
        """Convert template to default task values"""
        return {
            "title": self.name,
            "task_category": self.task_category,
            "task_subcategory": self.task_subcategory,
            "description": self.description,
            "estimated_hours": self.default_duration_hours,
            "priority": self.default_priority,
            "requires_gps_tracking": self.requires_gps_tracking,
        }