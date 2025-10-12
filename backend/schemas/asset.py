# app/schemas/asset.py - Asset Management Schemas (Updated with File Integration)
from typing import Optional, Dict, Any, List, Union
from datetime import datetime, date
from decimal import Decimal
from pydantic import BaseModel, validator, Field
from enum import Enum

# Enums for validation
class AssetCategory(str, Enum):
    equipment = "equipment"
    vehicle = "vehicle"
    tool = "tool"
    consumable = "consumable"
    infrastructure = "infrastructure"

class AssetType(str, Enum):
    physical = "physical"
    consumable = "consumable"

class AssetStatus(str, Enum):
    active = "active"
    maintenance = "maintenance"
    retired = "retired"
    disposed = "disposed"
    out_of_stock = "out_of_stock"

class MaintenanceType(str, Enum):
    scheduled = "scheduled"
    reactive = "reactive"
    emergency = "emergency"
    compliance = "compliance"

class MaintenanceStatus(str, Enum):
    scheduled = "scheduled"
    in_progress = "in_progress"
    completed = "completed"
    cancelled = "cancelled"

class CalibrationStatus(str, Enum):
    pass_status = "pass"
    fail = "fail"
    out_of_tolerance = "out_of_tolerance"

class StockMovementType(str, Enum):
    purchase = "purchase"
    usage = "usage"
    transfer = "transfer"
    adjustment = "adjustment"
    disposal = "disposal"

class CertificationScheme(str, Enum):
    organics = "organics"
    regenerative = "regenerative"
    biodynamic = "biodynamic"
    swnz = "swnz"

# Asset Schemas
class AssetBase(BaseModel):
    name: str
    description: Optional[str] = None
    category: AssetCategory
    subcategory: Optional[str] = None
    asset_type: AssetType
    
    # Technical specs
    make: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    year_manufactured: Optional[int] = None
    specifications: Optional[Dict[str, Any]] = None
    
    # Consumable-specific
    unit_of_measure: Optional[str] = None
    current_stock: Optional[Decimal] = Decimal('0.0')
    minimum_stock: Optional[Decimal] = None
    maximum_stock: Optional[Decimal] = None
    cost_per_unit: Optional[Decimal] = None
    
    # Compliance
    active_ingredient: Optional[str] = None
    concentration: Optional[str] = None
    application_rate_min: Optional[Decimal] = None
    application_rate_max: Optional[Decimal] = None
    withholding_period_days: Optional[int] = None
    certified_for: Optional[Dict[str, bool]] = Field(
        default_factory=dict,
        description="Certification schemes this consumable is approved for"
    )
    registration_number: Optional[str] = None
    registration_expiry: Optional[date] = None
    
    # Financial
    purchase_date: Optional[date] = None
    purchase_price: Optional[Decimal] = None
    current_value: Optional[Decimal] = None
    
    # Operational
    status: AssetStatus = AssetStatus.active
    location: Optional[str] = None
    requires_calibration: bool = False
    calibration_interval_days: Optional[int] = None
    requires_maintenance: bool = False
    maintenance_interval_hours: Optional[int] = None
    maintenance_interval_days: Optional[int] = None

class AssetCreate(AssetBase):
    asset_number: str
    
    @validator("asset_number")
    def validate_asset_number(cls, v):
        if not v or len(v.strip()) == 0:
            raise ValueError("Asset number is required")
        return v.strip()

class AssetUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[AssetCategory] = None
    subcategory: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    specifications: Optional[Dict[str, Any]] = None
    current_stock: Optional[Decimal] = None
    minimum_stock: Optional[Decimal] = None
    maximum_stock: Optional[Decimal] = None
    cost_per_unit: Optional[Decimal] = None
    status: Optional[AssetStatus] = None
    location: Optional[str] = None
    current_value: Optional[Decimal] = None
    requires_calibration: Optional[bool] = None
    calibration_interval_days: Optional[int] = None
    
class AssetResponse(AssetBase):
    id: int
    company_id: int
    asset_number: str
    current_hours: Optional[Decimal] = None
    current_kilometers: Optional[Decimal] = None
    insurance_expiry: Optional[date] = None
    wof_due: Optional[date] = None
    photo_file_ids: List[str] = []
    document_file_ids: List[str] = []
    manual_file_ids: List[str] = []
    created_at: datetime
    updated_at: Optional[datetime] = None
    created_by: Optional[int] = None
    is_active: bool
    
    # Computed properties
    stock_status: Optional[str] = None
    needs_reorder: Optional[bool] = None
    
    is_organic_certified: Optional[bool] = None
    is_regenerative_certified: Optional[bool] = None
    is_biodynamic_certified: Optional[bool] = None
    is_swnz_certified: Optional[bool] = None
    certification_summary: Optional[List[str]] = None

    class Config:
        from_attributes = True

class CertificationFilter(BaseModel):
    """Filter consumables by certification"""
    scheme: Optional[CertificationScheme] = None
    certified_only: bool = True

class AssetSummary(BaseModel):
    """Lightweight asset info for dropdowns and references"""
    id: int
    name: str
    asset_number: str
    category: str
    asset_type: str
    status: str
    current_stock: Optional[Decimal] = None
    unit_of_measure: Optional[str] = None
    
    class Config:
        from_attributes = True

# Maintenance Schemas
class MaintenanceBase(BaseModel):
    maintenance_type: MaintenanceType
    maintenance_category: Optional[str] = None
    title: str
    description: Optional[str] = None
    scheduled_date: Optional[date] = None
    performed_by: Optional[str] = None
    performed_by_user_id: Optional[int] = None
    performed_by_contractor_id: Optional[int] = None

class MaintenanceCreate(MaintenanceBase):
    asset_id: int

class MaintenanceUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    scheduled_date: Optional[date] = None
    completed_date: Optional[date] = None
    status: Optional[MaintenanceStatus] = None
    performed_by: Optional[str] = None
    labor_hours: Optional[Decimal] = None
    labor_cost: Optional[Decimal] = None
    parts_cost: Optional[Decimal] = None
    external_cost: Optional[Decimal] = None
    total_cost: Optional[Decimal] = None
    parts_used: Optional[List[Dict[str, Any]]] = None
    condition_after: Optional[str] = None
    notes: Optional[str] = None

class MaintenanceResponse(MaintenanceBase):
    id: int
    asset_id: int
    company_id: int
    completed_date: Optional[date] = None
    status: MaintenanceStatus
    labor_hours: Optional[Decimal] = None
    labor_cost: Optional[Decimal] = None
    parts_cost: Optional[Decimal] = None
    total_cost: Optional[Decimal] = None
    condition_before: Optional[str] = None
    condition_after: Optional[str] = None
    next_due_date: Optional[date] = None
    compliance_certificate_number: Optional[str] = None
    compliance_expiry_date: Optional[date] = None
    photo_file_ids: List[str] = []
    document_file_ids: List[str] = []
    notes: Optional[str] = None
    created_at: datetime
    created_by: Optional[int] = None
    
    class Config:
        from_attributes = True

# Calibration Schemas
class CalibrationBase(BaseModel):
    calibration_type: str
    parameter_name: str
    unit_of_measure: str
    target_value: Optional[Decimal] = None
    measured_value: Decimal
    tolerance_min: Optional[Decimal] = None
    tolerance_max: Optional[Decimal] = None
    calibrated_by: str
    calibrated_by_user_id: Optional[int] = None
    calibrated_by_contractor_id: Optional[int] = None

class CalibrationCreate(CalibrationBase):
    asset_id: int
    calibration_date: Optional[date] = None
    
    @validator("calibration_date", pre=True, always=True)
    def set_calibration_date(cls, v):
        return v or date.today()

class CalibrationUpdate(BaseModel):
    measured_value: Optional[Decimal] = None
    adjustment_made: Optional[bool] = None
    adjustment_details: Optional[str] = None
    temperature: Optional[Decimal] = None
    humidity: Optional[Decimal] = None
    weather_conditions: Optional[str] = None
    notes: Optional[str] = None

class CalibrationResponse(CalibrationBase):
    id: int
    asset_id: int
    company_id: int
    calibration_date: date
    due_date: Optional[date] = None
    next_due_date: Optional[date] = None
    status: CalibrationStatus
    within_tolerance: bool
    adjustment_made: bool
    adjustment_details: Optional[str] = None
    temperature: Optional[Decimal] = None
    humidity: Optional[Decimal] = None
    fuel_consumption_liters: Optional[Decimal] = None
    operating_hours: Optional[Decimal] = None
    calculated_efficiency: Optional[Decimal] = None
    photo_file_ids: List[str] = []
    certificate_file_ids: List[str] = []
    test_result_file_ids: List[str] = []
    notes: Optional[str] = None
    created_at: datetime
    created_by: Optional[int] = None
    
    class Config:
        from_attributes = True

# Stock Movement Schemas
class StockMovementBase(BaseModel):
    movement_type: StockMovementType
    movement_date: date
    quantity: Decimal
    unit_cost: Optional[Decimal] = None
    batch_number: Optional[str] = None
    expiry_date: Optional[date] = None
    supplier: Optional[str] = None
    reference_number: Optional[str] = None
    notes: Optional[str] = None

class StockMovementCreate(StockMovementBase):
    asset_id: int
    task_id: Optional[int] = None
    block_id: Optional[int] = None
    usage_rate: Optional[Decimal] = None
    area_treated: Optional[Decimal] = None
    
    @validator("quantity")
    def validate_quantity(cls, v):
        if v == 0:
            raise ValueError("Quantity cannot be zero")
        return v

class StockMovementUpdate(BaseModel):
    movement_date: Optional[date] = None
    quantity: Optional[Decimal] = None
    unit_cost: Optional[Decimal] = None
    reference_number: Optional[str] = None
    notes: Optional[str] = None

class StockMovementResponse(StockMovementBase):
    id: int
    asset_id: int
    company_id: int
    total_cost: Optional[Decimal] = None
    task_id: Optional[int] = None
    block_id: Optional[int] = None
    usage_rate: Optional[Decimal] = None
    area_treated: Optional[Decimal] = None
    stock_before: Optional[Decimal] = None
    stock_after: Optional[Decimal] = None
    document_file_ids: List[str] = []
    photo_file_ids: List[str] = []
    created_at: datetime
    created_by: Optional[int] = None
    
    class Config:
        from_attributes = True

# Dashboard and Summary Schemas
class AssetStats(BaseModel):
    """Asset statistics for dashboard"""
    total_assets: int
    equipment_count: int
    consumable_count: int
    assets_needing_maintenance: int
    assets_needing_calibration: int
    low_stock_consumables: int
    compliance_alerts: int

class MaintenanceDue(BaseModel):
    """Maintenance due items"""
    asset_id: int
    asset_name: str
    maintenance_type: str
    due_date: Optional[date] = None
    days_overdue: Optional[int] = None
    priority: str  # high, medium, low

class CalibrationDue(BaseModel):
    """Calibration due items"""
    asset_id: int
    asset_name: str
    calibration_type: str
    last_calibration: Optional[date] = None
    due_date: Optional[date] = None
    days_overdue: Optional[int] = None

class ComplianceAlert(BaseModel):
    """Compliance alerts"""
    asset_id: int
    asset_name: str
    alert_type: str  # registration_expiry, wof_due, insurance_expiry, etc.
    due_date: date
    days_until_due: int
    severity: str  # critical, warning, info

class StockAlert(BaseModel):
    """Stock level alerts"""
    asset_id: int
    asset_name: str
    current_stock: Decimal
    minimum_stock: Decimal
    unit_of_measure: str
    stock_status: str  # out_of_stock, low_stock, adequate
