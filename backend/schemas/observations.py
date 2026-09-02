# app/schemas/observations.py
from __future__ import annotations
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime, date
from pydantic import BaseModel, Field, conint, confloat, computed_field, model_validator
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
    observation_type: str = Field(alias="type")
    field_schema: List[Dict[str, Any]] = Field(alias="fields_json")

    created_at: datetime
    updated_at: Optional[datetime] = None

    if ConfigDict:
        model_config = ConfigDict(from_attributes=True, populate_by_name=True)
    else:
        class Config:
            orm_mode = True
            allow_population_by_field_name = True

# ----- Runs and Spots -----

class ObservationRunBase(BaseModel):
    company_id: int
    template_id: int
    block_id: Optional[int] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    summary_stats: Optional[Dict[str, Any]] = None  # mean, stdev, confidence, etc.

class ObservationRunCreate(ObservationRunBase):
    created_by: Optional[int] = None
    # Scheduling fields. Setting scheduled_date without started_at puts the
    # run in the "Scheduled" state (observed_at_start stays NULL on insert).
    scheduled_date: Optional[date] = None
    assigned_to_user_id: Optional[int] = None
    instructions: Optional[str] = None
    name: Optional[str] = None  # caller-supplied display name; create_run auto-fills if absent

class ObservationRunUpdate(BaseModel):
    status: Optional[ObservationRunStatus] = None
    completed_at: Optional[datetime] = None
    summary_stats: Optional[Dict[str, Any]] = None
    scheduled_date: Optional[date] = None
    assigned_to_user_id: Optional[int] = None
    instructions: Optional[str] = None

class ObservationRunOut(ObservationRunBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime]
    created_by: Optional[int] = None  # Keep as user ID
    template_name: Optional[str] = None
    template_type: Optional[str] = None  # e.g. phenology, bud_count, bunch_count — gates the Insights link
    creator_name: Optional[str] = None  # This will contain "FirstName LastName"

    # Pass through the observation dates
    observed_at_start: Optional[datetime] = None
    observed_at_end: Optional[datetime] = None

    # Block name from vineyard_blocks
    block_name: Optional[str] = None

    # Scheduling fields surfaced for the Management table
    scheduled_date: Optional[date] = None
    assigned_to_user_id: Optional[int] = None
    assigned_to_user_name: Optional[str] = None
    instructions: Optional[str] = None

    # Spot count for display
    spots_count: Optional[int] = None

    # Which count metric this run records, resolved server-side from the
    # template — bud_count, shoot_count, flower_set, bunch_count, or None for a
    # run that counts nothing. Resolved HERE rather than mapped in each client:
    # a company's own template carries `type='other'` and is matched by field
    # name, which a client cannot do without the field list.
    count_metric: Optional[str] = None

    # Computed status field. Scheduled = neither timestamp set; In progress =
    # started not ended; Complete = both set. UI palette keys off this exact
    # set so don't rename without updating the StatusBadge map.
    @computed_field
    @property
    def status(self) -> str:
        if self.observed_at_start and self.observed_at_end:
            return "complete"
        elif self.observed_at_start and not self.observed_at_end:
            return "in progress"
        else:
            return "scheduled"

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
    document_file_ids: List[str] = Field(default_factory=list)

class ObservationSpotCreate(BaseModel):
    """Body schema for POST /observation-runs/{run_id}/spots.
    run_id and company_id come from the URL path and auth respectively."""
    block_id: Optional[int] = None
    row_id: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    observed_at: datetime
    values: Dict[str, Any] = Field(default_factory=dict)
    notes: Optional[str] = None
    status: SpotStatus = "recorded"
    photo_file_ids: List[str] = Field(default_factory=list)
    video_file_ids: List[str] = Field(default_factory=list)
    document_file_ids: List[str] = Field(default_factory=list)
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
    document_file_ids: Optional[List[str]] = None

class ObservationSpotOut(ObservationSpotBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime]
    created_by: Optional[int] = None
    values: Dict[str, Any] = Field(default_factory=dict, alias="data_json")

    @model_validator(mode='before')
    @classmethod
    def _project_gps_to_latlng(cls, data: Any) -> Any:
        # ORM stores location in `gps` POINT column; pydantic expects scalar lat/lng.
        # Without this, from_attributes reads non-existent attrs and returns None.
        gps = None
        if hasattr(data, 'gps'):
            gps = getattr(data, 'gps')
        elif isinstance(data, dict):
            gps = data.get('gps')

        if gps is None:
            return data

        try:
            from geoalchemy2.shape import to_shape
            pt = to_shape(gps)
            lat = pt.y
            lng = pt.x
        except Exception:
            return data

        if isinstance(data, dict):
            data.setdefault('latitude', lat)
            data.setdefault('longitude', lng)
            return data

        # ORM instance — build dict so pydantic can fill both gps-derived + other attrs
        try:
            from sqlalchemy import inspect as sa_inspect
            mapper = sa_inspect(data).mapper
            payload = {c.key: getattr(data, c.key) for c in mapper.column_attrs}
        except Exception:
            return data
        payload['latitude'] = lat
        payload['longitude'] = lng
        return payload

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


