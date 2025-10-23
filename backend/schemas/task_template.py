# app/schemas/task_template.py - Task Template Schemas
from typing import Optional, List, Dict, Any
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field, field_validator
from enum import Enum


class TaskCategory(str, Enum):
    """Main task categories matching database enum"""
    vineyard = "vineyard"
    land_management = "land_management"
    asset_management = "asset_management"
    compliance = "compliance"
    general = "general"


class TaskPriority(str, Enum):
    """Task priority levels"""
    low = "low"
    medium = "medium"
    high = "high"
    urgent = "urgent"


class TaskTemplateBase(BaseModel):
    """Base schema for task templates"""
    name: str = Field(..., min_length=1, max_length=200)
    task_category: TaskCategory
    task_subcategory: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    
    # Display settings
    icon: Optional[str] = Field(None, max_length=50)
    color: Optional[str] = Field(None, max_length=20, pattern=r'^#[0-9A-Fa-f]{6}$')
    
    # Default settings
    default_duration_hours: Optional[Decimal] = Field(None, ge=0, le=999.99)
    default_priority: TaskPriority = TaskPriority.medium
    
    # Execution requirements
    requires_gps_tracking: bool = False
    allows_partial_completion: bool = True
    
    # Asset requirements
    required_equipment_ids: Optional[List[int]] = Field(default_factory=list)
    optional_equipment_ids: Optional[List[int]] = Field(default_factory=list)
    
    # Consumable requirements - list of objects with asset_id, rate, unit
    required_consumables: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    
    # Field display
    quick_create_enabled: bool = True
    is_active: bool = True
    
    @field_validator('color')
    @classmethod
    def validate_color_format(cls, v: Optional[str]) -> Optional[str]:
        """Validate hex color format"""
        if v and not v.startswith('#'):
            return f"#{v}"
        return v
    
    @field_validator('required_consumables')
    @classmethod
    def validate_consumables(cls, v: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
        """Validate consumable structure"""
        if not v:
            return []
        
        for consumable in v:
            if not isinstance(consumable, dict):
                raise ValueError("Each consumable must be a dictionary")
            
            required_fields = ['asset_id', 'rate_per_hectare', 'unit']
            for field in required_fields:
                if field not in consumable:
                    raise ValueError(f"Consumable must include '{field}' field")
            
            if not isinstance(consumable['asset_id'], int):
                raise ValueError("asset_id must be an integer")
            
            if not isinstance(consumable['rate_per_hectare'], (int, float, Decimal)):
                raise ValueError("rate_per_hectare must be numeric")
            
            if not isinstance(consumable['unit'], str):
                raise ValueError("unit must be a string")
        
        return v


class TaskTemplateCreate(TaskTemplateBase):
    """Schema for creating a new task template"""
    pass


class TaskTemplateUpdate(BaseModel):
    """Schema for updating a task template"""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    task_category: Optional[TaskCategory] = None
    task_subcategory: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    
    icon: Optional[str] = Field(None, max_length=50)
    color: Optional[str] = Field(None, max_length=20)
    
    default_duration_hours: Optional[Decimal] = Field(None, ge=0, le=999.99)
    default_priority: Optional[TaskPriority] = None
    
    requires_gps_tracking: Optional[bool] = None
    allows_partial_completion: Optional[bool] = None
    
    required_equipment_ids: Optional[List[int]] = None
    optional_equipment_ids: Optional[List[int]] = None
    required_consumables: Optional[List[Dict[str, Any]]] = None
    
    quick_create_enabled: Optional[bool] = None
    is_active: Optional[bool] = None
    
    @field_validator('color')
    @classmethod
    def validate_color_format(cls, v: Optional[str]) -> Optional[str]:
        """Validate hex color format"""
        if v and not v.startswith('#'):
            return f"#{v}"
        return v


class TaskTemplateResponse(TaskTemplateBase):
    """Schema for task template responses"""
    id: int
    company_id: int
    created_at: datetime
    updated_at: datetime
    created_by: Optional[int] = None
    
    class Config:
        from_attributes = True


class TaskTemplateSummary(BaseModel):
    """Lightweight template info for dropdowns and references"""
    id: int
    name: str
    task_category: TaskCategory
    task_subcategory: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    default_priority: TaskPriority
    is_active: bool
    quick_create_enabled: bool
    
    class Config:
        from_attributes = True


class TaskTemplateFilter(BaseModel):
    """Filter schema for listing templates"""
    task_category: Optional[TaskCategory] = None
    task_subcategory: Optional[str] = None
    is_active: Optional[bool] = None
    quick_create_enabled: Optional[bool] = None
    requires_gps_tracking: Optional[bool] = None


class TaskTemplateWithUsage(TaskTemplateResponse):
    """Template with usage statistics"""
    task_count: int = 0  # Number of tasks created from this template
    last_used: Optional[datetime] = None  # When template was last used
    
    class Config:
        from_attributes = True
