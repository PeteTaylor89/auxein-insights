# app/schemas/asset.py - Asset Management Schemas (Updated with File Integration)
from typing import Optional, Dict, Any, List, Union
from datetime import datetime, date
from decimal import Decimal
from pydantic import BaseModel, validator, Field, computed_field, model_validator
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
    location_label: Optional[str] = None
    requires_calibration: bool = False
    calibration_interval_days: Optional[int] = None
    # Persistent calibration spec — populated when requires_calibration is true so each
    # scheduled calibration ticket carries the right tolerances without the user having
    # to re-enter them per cycle.
    calibration_type: Optional[str] = None
    calibration_parameter_name: Optional[str] = None
    calibration_unit_of_measure: Optional[str] = None
    calibration_target_value: Optional[Decimal] = None
    calibration_tolerance_min: Optional[Decimal] = None
    calibration_tolerance_max: Optional[Decimal] = None
    # Effective application width (metres) for tractor-mounted implements.
    # Paired with calibrated output rate at task time for coverage maps.
    swath_width_m: Optional[Decimal] = None
    requires_maintenance: bool = False
    maintenance_interval_hours: Optional[int] = None
    maintenance_interval_days: Optional[int] = None

class AssetCreate(AssetBase):
    asset_number: str
    property_id: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_geojson: Optional[Dict[str, Any]] = None  # GeoJSON for lines/polygons
    # When requires_calibration is True AND no `calibration_specs` array is
    # supplied, the legacy single-spec flow runs and an initial schedule is
    # spawned using the asset's inline calibration_* columns + this date
    # (defaults to today server-side).
    first_calibration_date: Optional[date] = None
    # New multi-spec path. When supplied, each entry becomes an asset_calibration_specs
    # row and an initial pending schedule is spawned per spec. Inline calibration_*
    # columns on the asset are ignored.
    calibration_specs: Optional[List["CalibrationSpecCreate"]] = None

    @validator("asset_number")
    def validate_asset_number(cls, v):
        if not v or len(v.strip()) == 0:
            raise ValueError("Asset number is required")
        return v.strip()

class AssetUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    property_id: Optional[int] = None
    category: Optional[AssetCategory] = None
    subcategory: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None  
    year_manufactured: Optional[int] = None  
    specifications: Optional[Dict[str, Any]] = None
    current_stock: Optional[Decimal] = None
    minimum_stock: Optional[Decimal] = None
    maximum_stock: Optional[Decimal] = None
    cost_per_unit: Optional[Decimal] = None
    status: Optional[AssetStatus] = None
    location_label: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_geojson: Optional[Dict[str, Any]] = None
    current_value: Optional[Decimal] = None
    requires_calibration: Optional[bool] = None
    calibration_interval_days: Optional[int] = None
    calibration_type: Optional[str] = None
    calibration_parameter_name: Optional[str] = None
    calibration_unit_of_measure: Optional[str] = None
    calibration_target_value: Optional[Decimal] = None
    calibration_tolerance_min: Optional[Decimal] = None
    calibration_tolerance_max: Optional[Decimal] = None
    swath_width_m: Optional[Decimal] = None
    active_ingredient: Optional[str] = None
    concentration: Optional[str] = None
    application_rate_min: Optional[Decimal] = None
    application_rate_max: Optional[Decimal] = None
    withholding_period_days: Optional[int] = None
    registration_number: Optional[str] = None
    registration_expiry: Optional[date] = None
    safety_data_sheet_url: Optional[str] = None
    hazard_classifications: Optional[Dict[str, Any]] = None
    certified_for: Optional[Dict[str, bool]] = None
    
    # Storage & Handling - THESE WERE MISSING!
    storage_requirements: Optional[Dict[str, Any]] = None
    batch_tracking_required: Optional[bool] = None
    expiry_tracking_required: Optional[bool] = None
    
    # Financial
    purchase_date: Optional[date] = None
    purchase_price: Optional[Decimal] = None
    
    # Maintenance
    requires_maintenance: Optional[bool] = None
    maintenance_interval_days: Optional[int] = None
    maintenance_interval_hours: Optional[int] = None
    
class AssetResponse(AssetBase):
    id: int
    company_id: int
    property_id: Optional[int] = None
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

    # Spatial — serialized from PostGIS
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_geojson: Optional[Dict[str, Any]] = None

    # Computed properties
    stock_status: Optional[str] = None
    needs_reorder: Optional[bool] = None

    is_organic_certified: Optional[bool] = None
    is_regenerative_certified: Optional[bool] = None
    is_biodynamic_certified: Optional[bool] = None
    is_swnz_certified: Optional[bool] = None
    certification_summary: Optional[List[str]] = None

    storage_requirements: Optional[Dict[str, Any]] = None
    batch_tracking_required: Optional[bool] = None
    expiry_tracking_required: Optional[bool] = None
    hazard_classifications: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True

    @model_validator(mode='before')
    @classmethod
    def convert_spatial_fields(cls, data):
        """Convert PostGIS location_point/location_geometry to lat/lng and GeoJSON."""
        if hasattr(data, '__table__'):
            data_dict = {c.name: getattr(data, c.name) for c in data.__table__.columns}
            # Copy computed properties from ORM
            for attr in ('stock_status', 'needs_reorder', 'is_organic_certified',
                         'is_regenerative_certified', 'is_biodynamic_certified',
                         'is_swnz_certified', 'certification_summary',
                         'photo_file_ids', 'document_file_ids', 'manual_file_ids'):
                if hasattr(data, attr):
                    data_dict[attr] = getattr(data, attr)
        elif isinstance(data, dict):
            data_dict = data
        else:
            return data

        # Convert POINT → lat/lng
        if data_dict.get('location_point') is not None:
            try:
                from geoalchemy2.shape import to_shape
                pt = to_shape(data_dict['location_point'])
                data_dict['longitude'] = pt.x
                data_dict['latitude'] = pt.y
            except Exception:
                pass
        data_dict.pop('location_point', None)

        # Convert GEOMETRY → GeoJSON
        if data_dict.get('location_geometry') is not None:
            try:
                from geoalchemy2.shape import to_shape
                from shapely.geometry import mapping
                geom = to_shape(data_dict['location_geometry'])
                data_dict['location_geojson'] = mapping(geom)
            except Exception:
                pass
        data_dict.pop('location_geometry', None)

        return data_dict

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
    maintenance_type: Optional[str] = None
    maintenance_category: Optional[str] = None
    scheduled_date: Optional[date] = None
    completed_date: Optional[date] = None
    status: Optional[MaintenanceStatus] = None
    performed_by: Optional[str] = None
    performed_by_user_id: Optional[int] = None
    performed_by_contractor_id: Optional[int] = None
    labor_hours: Optional[Decimal] = None
    labor_cost: Optional[Decimal] = None
    parts_cost: Optional[Decimal] = None
    external_cost: Optional[Decimal] = None
    total_cost: Optional[Decimal] = None
    parts_used: Optional[List[Dict[str, Any]]] = None
    consumables_used: Optional[List[Dict[str, Any]]] = None
    asset_hours_at_maintenance: Optional[Decimal] = None
    asset_kilometers_at_maintenance: Optional[Decimal] = None
    condition_before: Optional[str] = None
    condition_after: Optional[str] = None
    next_due_date: Optional[date] = None
    next_due_hours: Optional[Decimal] = None
    next_due_kilometers: Optional[Decimal] = None
    compliance_certificate_number: Optional[str] = None
    compliance_expiry_date: Optional[date] = None
    compliance_status: Optional[str] = None
    notes: Optional[str] = None

class MaintenanceResponse(MaintenanceBase):
    id: int
    asset_id: int
    company_id: int
    completed_date: Optional[date] = None
    status: MaintenanceStatus
    
    # Execution details
    performed_by_user_id: Optional[int] = None
    performed_by_contractor_id: Optional[int] = None
    asset_hours_at_maintenance: Optional[Decimal] = None
    asset_kilometers_at_maintenance: Optional[Decimal] = None
    condition_before: Optional[str] = None
    condition_after: Optional[str] = None
    
    # Cost tracking
    labor_hours: Optional[Decimal] = None
    labor_cost: Optional[Decimal] = None
    parts_cost: Optional[Decimal] = None
    external_cost: Optional[Decimal] = None  # MISSING
    total_cost: Optional[Decimal] = None
    
    # Parts and materials
    parts_used: Optional[List[Dict[str, Any]]] = None  # MISSING
    consumables_used: Optional[List[Dict[str, Any]]] = None  # MISSING
    
    # Next maintenance
    next_due_date: Optional[date] = None
    next_due_hours: Optional[Decimal] = None  # MISSING
    next_due_kilometers: Optional[Decimal] = None  # MISSING
    
    # Compliance
    compliance_certificate_number: Optional[str] = None
    compliance_expiry_date: Optional[date] = None
    compliance_status: Optional[str] = None  # MISSING
    
    # Files
    photo_file_ids: List[str] = []
    document_file_ids: List[str] = []
    
    # Notes
    notes: Optional[str] = None
    
    # Timestamps
    created_at: datetime
    created_by: Optional[int] = None

    asset_name: Optional[str] = None

    class Config:
        from_attributes = True

# Calibration Spec Schemas (per-type spec stored in asset_calibration_specs)
class CalibrationSpecBase(BaseModel):
    calibration_type: str
    parameter_name: Optional[str] = None
    unit_of_measure: Optional[str] = None
    target_value: Optional[Decimal] = None
    tolerance_min: Optional[Decimal] = None
    tolerance_max: Optional[Decimal] = None
    interval_days: Optional[int] = None
    notes: Optional[str] = None


class CalibrationSpecCreate(CalibrationSpecBase):
    # Optional — defaults to today server-side. Lets the user stagger the first
    # calibration date per spec (e.g. pressure due immediately, output rate in 7d).
    first_due_date: Optional[date] = None


class CalibrationSpecUpdate(BaseModel):
    calibration_type: Optional[str] = None
    parameter_name: Optional[str] = None
    unit_of_measure: Optional[str] = None
    target_value: Optional[Decimal] = None
    tolerance_min: Optional[Decimal] = None
    tolerance_max: Optional[Decimal] = None
    interval_days: Optional[int] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class CalibrationSpecResponse(CalibrationSpecBase):
    id: int
    asset_id: int
    company_id: int
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Resolve the forward reference on AssetCreate (declared earlier with
# `Optional[List["CalibrationSpecCreate"]]`) now that CalibrationSpecCreate exists.
try:
    AssetCreate.model_rebuild()
except Exception:
    pass


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
    notes: Optional[str] = None
    # When set, this calibration event resolves the given pending schedule. The endpoint
    # will mark that schedule as completed and auto-create a new pending schedule for the
    # next cycle (asset interval on pass, 7-day recheck on fail).
    schedule_id: Optional[int] = None

    @validator("calibration_date", pre=True, always=True)
    def set_calibration_date(cls, v):
        return v or date.today()

class CalibrationUpdate(BaseModel):
    calibration_date: Optional[date] = None
    status: Optional[str] = None  # pass, fail, out_of_tolerance
    within_tolerance: Optional[bool] = None
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
    asset_name: Optional[str] = None

    class Config:
        from_attributes = True

# Calibration Schedule Schemas (forward-looking tickets)
class CalibrationScheduleResponse(BaseModel):
    id: int
    asset_id: int
    company_id: int
    calibration_type: str
    parameter_name: Optional[str] = None
    unit_of_measure: Optional[str] = None
    target_value: Optional[Decimal] = None
    tolerance_min: Optional[Decimal] = None
    tolerance_max: Optional[Decimal] = None
    due_date: date
    status: str
    completed_calibration_id: Optional[int] = None
    completed_at: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime
    created_by: Optional[int] = None
    asset_name: Optional[str] = None

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

# ---------------------------------------------------------------------------
# CSV import (Greystone beta: bulk-load the equipment register)
# ---------------------------------------------------------------------------

class AssetImportRow(BaseModel):
    """One parsed CSV row.

    Deliberately a narrow subset of AssetCreate — the spatial, calibration and
    compliance fields are not things anyone sensibly types into a spreadsheet,
    and accepting them here would mean validating geometry from a CSV cell.

    `asset_number` carries the round-trip. It is the key the user already owns
    and is already unique per company, so a line whose number matches an
    existing asset UPDATES it and one with a new number creates it. Database ids
    deliberately never appear in the file: a primary key is meaningless to read
    in a spreadsheet, and one stray edit would repoint a line at a different
    record with nothing to notice it. The trade is that renumbering in the sheet
    reads as a new asset rather than a rename — renaming belongs on screen, and
    the client's change preview shows the addition before anything is written.

    Optional fields are three-state, and the distinction is load-bearing:
      - absent from the payload  -> that column was not in the user's sheet, leave it
      - present as null          -> the cell was blank, CLEAR the field
      - present with a value     -> set it
    `model_fields_set` is what separates the first two, so never read these with
    a plain getattr default.
    """
    line_number: int = Field(..., description="Line number in the user's file, for error reporting")
    asset_number: str
    name: str
    category: AssetCategory
    asset_type: AssetType
    description: Optional[str] = None
    subcategory: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    year_manufactured: Optional[int] = None
    unit_of_measure: Optional[str] = None
    current_stock: Optional[Decimal] = None
    minimum_stock: Optional[Decimal] = None
    cost_per_unit: Optional[Decimal] = None
    status: Optional[AssetStatus] = None
    property_id: Optional[int] = None
    location_label: Optional[str] = None


class AssetImportRequest(BaseModel):
    rows: List[AssetImportRow]
    # False (default) = all-or-nothing. A partially loaded asset register is
    # harder to clean up than a rejected file.
    skip_invalid: bool = False


class AssetImportError(BaseModel):
    line_number: int
    errors: List[str]


class AssetImportResult(BaseModel):
    # Created and updated are reported separately: on a re-upload of an edited
    # export the user needs to see that nothing was duplicated.
    created: int = 0
    updated: int = 0
    failed: int
    errors: List[AssetImportError] = Field(default_factory=list)
    # False when validation rejected the file and nothing was written.
    committed: bool
