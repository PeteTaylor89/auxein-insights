# app/schemas/observations.py
from __future__ import annotations
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime, date
from pydantic import BaseModel, Field, conint, confloat, validator, computed_field
try:
    from pydantic import ConfigDict
    _CFG = {"from_attributes": True}
except Exception:
    ConfigDict = None
    _CFG = {}

# ---- Enums / literals kept simple to avoid mismatch with DB strings ----
ObservationRunStatus = Literal["draft", "in_progress", "completed", "cancelled"]
SpotStatus = Literal["recorded", "void"]
ObservationType = Literal[
    "phenology", "bud_count", "flower_count", "pre_veraison_yield",
    "maturity_sampling", "post_veraison_yield", "growth", "photo_video",
    "disease", "pest", "maintenance", "biosecurity", "compliance",
    "hazard", "land_management", "weather", "lab_sampling", "irrigation_schedule",
    "other"
]

FieldType = Literal[
    "number", "integer", "decimal", "text", "textarea", "boolean",
    "select", "multiselect", "date", "time", "datetime", "json"
]

class TemplateField(BaseModel):
    name: str
    label: str
    type: FieldType
    required: bool = False
    help_text: Optional[str] = None
    unit: Optional[str] = None
    options: Optional[List[Dict[str, Any]]] = None  # for select types
    default: Optional[Any] = None
    min_value: Optional[confloat(strict=False)] = None
    max_value: Optional[confloat(strict=False)] = None
    # allow conditional logic in UI later
    visibility_rules: Optional[Dict[str, Any]] = None

class ObservationTemplateBase(BaseModel):
    name: str
    description: Optional[str] = None
    observation_type: ObservationType
    field_schema: List[TemplateField] = Field(default_factory=list)
    is_active: bool = True

class ObservationTemplateCreate(ObservationTemplateBase):
    company_id: int

class ObservationTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    observation_type: Optional[ObservationType] = None
    field_schema: Optional[List[TemplateField]] = None
    is_active: Optional[bool] = None

class ObservationTemplateOut(BaseModel):
    id: int
    name: str
    company_id: Optional[int] = None
    observation_type: str = Field(alias="type")  # or "type_key"
    schema: Dict[str, Any] = Field(alias="fields_json")

    created_at: datetime
    updated_at: Optional[datetime]

    @validator("schema", pre=True)
    def _coerce_schema(cls, v):
        if isinstance(v, list):
            return {"fields": v}
        if isinstance(v, dict):
            return v
        raise TypeError("schema must be a dict or list")

    class Config:
        orm_mode = True
        allow_population_by_field_name = True

# ----- Plans (scheduled templates to do) -----

class PlanTarget(BaseModel):
    block_id: Optional[int] = None
    row_id: Optional[int] = None
    row_start: Optional[str] = None  # e.g., "x"
    row_end: Optional[str] = None    # e.g., "z"
    required_spots: Optional[conint(ge=1)] = None
    extra: Optional[Dict[str, Any]] = None

class ObservationPlanBase(BaseModel):
    company_id: int
    template_id: int
    name: str
    description: Optional[str] = None
    scheduled_for: Optional[date] = None
    auto_block_selection: bool = False
    targets: List[PlanTarget] = Field(default_factory=list)
    instructions: Optional[str] = None
    is_active: bool = True

class ObservationPlanCreate(ObservationPlanBase):
    assignee_user_ids: List[int] = Field(default_factory=list)

class ObservationPlanUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    scheduled_for: Optional[date] = None
    auto_block_selection: Optional[bool] = None
    targets: Optional[List[PlanTarget]] = None
    instructions: Optional[str] = None
    is_active: Optional[bool] = None
    assignee_user_ids: Optional[List[int]] = None

class ObservationPlanOut(BaseModel):
    id: int
    company_id: int
    template_id: int
    template_name: Optional[str] = None
    template_version: int
    name: str
    instructions: Optional[str] = None
    # if you want to echo inputs like description/scheduled_for, add them as real columns later
    status: str
    priority: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    # relations serialized from ORM:
    targets: List[PlanTargetOut] = Field(default_factory=list)
    assignees: List[PlanAssigneeOut] = Field(default_factory=list)
    runs_count: int = 0
    latest_run_started_at: Optional[datetime] = None

    if ConfigDict:
        model_config = ConfigDict(**_CFG)
    else:
        class Config:
            orm_mode = True
# ----- Runs and Spots -----

class ObservationRunBase(BaseModel):
    company_id: int
    template_id: int
    plan_id: Optional[int] = None
    block_id: Optional[int] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    summary_stats: Optional[Dict[str, Any]] = None  # mean, stdev, confidence, etc.

class ObservationRunCreate(ObservationRunBase):
    created_by: Optional[int] = None

class ObservationRunUpdate(BaseModel):
    status: Optional[ObservationRunStatus] = None
    completed_at: Optional[datetime] = None
    summary_stats: Optional[Dict[str, Any]] = None

class ObservationRunOut(ObservationRunBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime]
    created_by: Optional[int] = None  # Keep as user ID
    plan_name: Optional[str] = None
    creator_name: Optional[str] = None  # This will contain "FirstName LastName"
    
    # Pass through the observation dates
    observed_at_start: Optional[datetime] = None
    observed_at_end: Optional[datetime] = None
    
    # Block name from vineyard_blocks
    block_name: Optional[str] = None
    
    # Computed status field
    @computed_field
    @property
    def status(self) -> str:
        if self.observed_at_start and self.observed_at_end:
            return "complete"
        elif self.observed_at_start and not self.observed_at_end:
            return "in progress"
        else:
            return "not started"
    
    class Config:
        from_attributes = True

class ObservationSpotBase(BaseModel):
    company_id: int
    run_id: int
    block_id: Optional[int] = None
    row_id: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    observed_at: datetime
    values: Dict[str, Any] = Field(default_factory=dict)  # matches template fields
    notes: Optional[str] = None
    status: SpotStatus = "recorded"
    photo_file_ids: List[str] = Field(default_factory=list)  # stored as IDs in files table
    video_file_ids: List[str] = Field(default_factory=list)

class ObservationSpotCreate(ObservationSpotBase):
    created_by: Optional[int] = None

class ObservationSpotUpdate(BaseModel):
    block_id: Optional[int] = None
    row_id: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    observed_at: Optional[datetime] = None
    values: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None
    status: Optional[SpotStatus] = None
    photo_file_ids: Optional[List[str]] = None
    video_file_ids: Optional[List[str]] = None

class ObservationSpotOut(ObservationSpotBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime]
    created_by: Optional[int] = None
    values: Dict[str, Any] = Field(default_factory=dict, alias="data_json")
    
    class Config:
        from_attributes = True
        allow_population_by_field_name = True

# ----- Task Link -----

class ObservationTaskLinkCreate(BaseModel):
    run_id: Optional[int] = None
    spot_id: Optional[int] = None
    task_id: int
    reason: Optional[str] = None

class ObservationTaskLinkOut(ObservationTaskLinkCreate):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class PlanAssigneeOut(BaseModel):
    id: int
    user_id: int
    if ConfigDict:
        model_config = ConfigDict(**_CFG)
    else:
        class Config:
            orm_mode = True

class PlanTargetOut(BaseModel):
    id: int
    block_id: int
    row_labels: List[str] = Field(default_factory=list)   # <- matches DB JSON column
    asset_id: Optional[int] = None
    sample_size: Optional[int] = None
    notes: Optional[str] = None
    if ConfigDict:
        model_config = ConfigDict(**_CFG)
    else:
        class Config:
            orm_mode = True