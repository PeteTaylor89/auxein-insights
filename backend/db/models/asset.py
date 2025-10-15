# db/models/asset.py - Updated Asset Management with File Integration
from sqlalchemy import Column, Integer, String, Text, Date, DateTime, Boolean, ForeignKey, JSON, Numeric
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from db.base_class import Base
from decimal import Decimal

class Asset(Base):
    __tablename__ = "assets"

    # Core identification
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    asset_number = Column(String(50), nullable=False)  # Company-specific asset ID
    name = Column(String(100), nullable=False)
    description = Column(Text)
    
    # Asset categorization - includes consumables
    category = Column(String(50), nullable=False)  # equipment, vehicle, tool, consumable, infrastructure
    subcategory = Column(String(50))  # tractor, sprayer, chemical, fertilizer, fuel, etc.
    asset_type = Column(String(20), nullable=False)  # physical, consumable
    
    # Technical specifications
    make = Column(String(50))
    model = Column(String(50))
    serial_number = Column(String(100))
    year_manufactured = Column(Integer)
    specifications = Column(JSON)  # Flexible specs storage
    
    # Consumable-specific fields
    unit_of_measure = Column(String(20))  # L, kg, units for consumables
    current_stock = Column(Numeric(12, 4), default=0)  # Current quantity
    minimum_stock = Column(Numeric(12, 4))  # Reorder level
    maximum_stock = Column(Numeric(12, 4))  # Maximum storage
    cost_per_unit = Column(Numeric(10, 4))  # Cost per unit
    
    # Consumable compliance (chemicals/fertilizers)
    active_ingredient = Column(String(200))
    concentration = Column(String(50))
    application_rate_min = Column(Numeric(10, 4))  # Min application rate per hectare
    application_rate_max = Column(Numeric(10, 4))  # Max application rate per hectare
    withholding_period_days = Column(Integer)  # Days before harvest
    certified_for = Column(JSON, default=dict)  # {"organics": true, "regenerative": false, "biodynamic": true, "swnz": true}

    # Registration and compliance
    registration_number = Column(String(100))  # ACVM number for chemicals
    registration_expiry = Column(Date)
    safety_data_sheet_url = Column(String(500))
    hazard_classifications = Column(JSON)  # List of hazard classes
    
    # Financial tracking
    purchase_date = Column(Date)
    purchase_price = Column(Numeric(12, 2))
    current_value = Column(Numeric(12, 2))
    depreciation_rate = Column(Numeric(5, 2))  # Annual percentage
    
    # Operational details
    status = Column(String(20), default="active")  # active, maintenance, retired, disposed, out_of_stock
    location = Column(String(100))  # Current storage/operation location
    requires_calibration = Column(Boolean, default=False)
    calibration_interval_days = Column(Integer)
    
    # Maintenance scheduling (for equipment)
    requires_maintenance = Column(Boolean, default=False)
    maintenance_interval_hours = Column(Integer)
    maintenance_interval_days = Column(Integer)
    
    # Usage tracking (for equipment)
    current_hours = Column(Numeric(10, 2), default=0)
    current_kilometers = Column(Numeric(10, 2), default=0)
    
    # Vehicle-specific compliance
    insurance_expiry = Column(Date)
    wof_due = Column(Date)  # Warrant of Fitness
    road_user_charges_due = Column(Date)
    
    # Storage and handling (mainly for consumables)
    storage_requirements = Column(JSON)  # Temperature, humidity, etc.
    batch_tracking_required = Column(Boolean, default=False)
    expiry_tracking_required = Column(Boolean, default=False)
    
    # Fuel efficiency tracking (for vehicles/equipment)
    fuel_type = Column(String(30))  # diesel, petrol, electric
    fuel_efficiency_standard = Column(Numeric(8, 2))  # L/hr or L/100km
    
    # File references - simplified to just store file IDs
    photo_file_ids = Column(JSON, default=list)  # ["file-uuid-1", "file-uuid-2"]
    document_file_ids = Column(JSON, default=list)  # ["file-uuid-3", "file-uuid-4"]
    manual_file_ids = Column(JSON, default=list)  # ["file-uuid-5"]
    
    # Timestamps and audit
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    created_by = Column(Integer, ForeignKey("users.id"))
    is_active = Column(Boolean, default=True)
    
    # Relationships
    company = relationship("Company", back_populates="assets")
    maintenance_records = relationship("AssetMaintenance", back_populates="asset", cascade="all, delete-orphan")
    calibration_records = relationship("AssetCalibration", back_populates="asset", cascade="all, delete-orphan")
    stock_movements = relationship("StockMovement", back_populates="asset", cascade="all, delete-orphan")
    task_usage = relationship("TaskAsset", back_populates="asset")
    
    def __repr__(self):
        return f"<Asset(id={self.id}, name='{self.name}', type='{self.asset_type}')>"
    
    # File management helper methods
    def get_files_by_category(self, db_session, category: str = None):
        """Get files associated with this asset"""
        from db.models.file import File
        query = db_session.query(File).filter(
            File.entity_type == "asset",
            File.entity_id == self.id,
            File.is_active == True
        )
        if category:
            query = query.filter(File.file_category == category)
        return query.all()
    
    def add_file_reference(self, file_id: str, file_category: str = "document"):
        """Add a file reference to the appropriate list"""
        if file_category == "photo":
            if not self.photo_file_ids:
                self.photo_file_ids = []
            if file_id not in self.photo_file_ids:
                self.photo_file_ids.append(file_id)
        elif file_category == "manual":
            if not self.manual_file_ids:
                self.manual_file_ids = []
            if file_id not in self.manual_file_ids:
                self.manual_file_ids.append(file_id)
        else:  # default to document
            if not self.document_file_ids:
                self.document_file_ids = []
            if file_id not in self.document_file_ids:
                self.document_file_ids.append(file_id)
    
    def remove_file_reference(self, file_id: str):
        """Remove a file reference from all lists"""
        if self.photo_file_ids and file_id in self.photo_file_ids:
            self.photo_file_ids.remove(file_id)
        if self.document_file_ids and file_id in self.document_file_ids:
            self.document_file_ids.remove(file_id)
        if self.manual_file_ids and file_id in self.manual_file_ids:
            self.manual_file_ids.remove(file_id)
    
    # Existing property methods
    @property
    def is_consumable(self):
        return self.asset_type == "consumable"
    
    @property
    def is_equipment(self):
        return self.asset_type == "physical"
    
    @property
    def needs_reorder(self):
        if not self.is_consumable or not self.minimum_stock:
            return False
        return self.current_stock <= self.minimum_stock
    
    @property
    def stock_status(self):
        if not self.is_consumable:
            return "not_applicable"
        
        if self.current_stock <= 0:
            return "out_of_stock"
        elif self.needs_reorder:
            return "low_stock"
        elif self.maximum_stock and self.current_stock >= self.maximum_stock:
            return "overstocked"
        else:
            return "adequate"
    
    @property
    def is_organic_certified(self):
        """Check if consumable is certified for organic use"""
        if not self.is_consumable or not self.certified_for:
            return False
        return self.certified_for.get('organics', False)
    
    @property
    def is_regenerative_certified(self):
        """Check if consumable is certified for regenerative agriculture"""
        if not self.is_consumable or not self.certified_for:
            return False
        return self.certified_for.get('regenerative', False)
    
    @property
    def is_biodynamic_certified(self):
        """Check if consumable is certified for biodynamic use"""
        if not self.is_consumable or not self.certified_for:
            return False
        return self.certified_for.get('biodynamic', False)
    
    @property
    def is_swnz_certified(self):
        """Check if consumable is certified for Sustainable Winegrowing NZ"""
        if not self.is_consumable or not self.certified_for:
            return False
        return self.certified_for.get('swnz', False)
    
    @property
    def certification_summary(self):
        """Get list of certifications this consumable is approved for"""
        if not self.is_consumable or not self.certified_for:
            return []
        
        cert_map = {
            'organics': 'Organic',
            'regenerative': 'Regenerative',
            'biodynamic': 'Biodynamic',
            'swnz': 'SWNZ'
        }
        
        return [cert_map[key] for key, value in self.certified_for.items() if value]


class AssetMaintenance(Base):
    __tablename__ = "asset_maintenance"
    
    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    
    # Maintenance details
    maintenance_type = Column(String(20), nullable=False)  # scheduled, reactive, emergency, compliance
    maintenance_category = Column(String(50))  # service, repair, inspection, wof, registration
    title = Column(String(200), nullable=False)
    description = Column(Text)
    
    # Scheduling
    scheduled_date = Column(Date)
    completed_date = Column(Date)
    due_hours = Column(Numeric(10, 2))
    due_kilometers = Column(Numeric(10, 2))
    
    # Execution tracking
    status = Column(String(20), default="scheduled")  # scheduled, in_progress, completed, cancelled
    performed_by = Column(String(100))
    performed_by_user_id = Column(Integer, ForeignKey("users.id"))
    performed_by_contractor_id = Column(Integer, ForeignKey("contractors.id"))
    
    # Cost tracking
    labor_hours = Column(Numeric(8, 2))
    labor_cost = Column(Numeric(10, 2))
    parts_cost = Column(Numeric(10, 2))
    external_cost = Column(Numeric(10, 2))
    total_cost = Column(Numeric(10, 2))
    
    # Parts and materials used
    parts_used = Column(JSON)
    consumables_used = Column(JSON)  # References to consumable assets used
    
    # Asset condition
    asset_hours_at_maintenance = Column(Numeric(10, 2))
    asset_kilometers_at_maintenance = Column(Numeric(10, 2))
    condition_before = Column(String(20))
    condition_after = Column(String(20))
    
    # Next maintenance prediction
    next_due_date = Column(Date)
    next_due_hours = Column(Numeric(10, 2))
    next_due_kilometers = Column(Numeric(10, 2))
    
    # Compliance-specific fields
    compliance_certificate_number = Column(String(100))  # WOF number, etc.
    compliance_expiry_date = Column(Date)
    compliance_status = Column(String(20))  # pass, fail, conditional
    
    # File references
    photo_file_ids = Column(JSON, default=list)  # Before/after photos
    document_file_ids = Column(JSON, default=list)  # Invoices, certificates, reports
    
    # Notes
    notes = Column(Text)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    created_by = Column(Integer, ForeignKey("users.id"))
    
    # Relationships
    asset = relationship("Asset", back_populates="maintenance_records")
    company = relationship("Company")
    
    @property
    def asset_name(self):
        """Get asset name from relationship"""
        return self.asset.name if self.asset else None

    def get_files_by_category(self, db_session, category: str = None):
        """Get files associated with this maintenance record"""
        from db.models.file import File
        query = db_session.query(File).filter(
            File.entity_type == "asset_maintenance",
            File.entity_id == self.id,
            File.is_active == True
        )
        if category:
            query = query.filter(File.file_category == category)
        return query.all()


class AssetCalibration(Base):
    __tablename__ = "asset_calibrations"
    
    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    
    # Calibration details
    calibration_type = Column(String(50), nullable=False)  # flow_rate, pressure, fuel_efficiency, etc.
    calibration_date = Column(Date, nullable=False)
    due_date = Column(Date)
    next_due_date = Column(Date)
    
    # Calibration parameters
    parameter_name = Column(String(100), nullable=False)
    unit_of_measure = Column(String(20), nullable=False)
    target_value = Column(Numeric(12, 4))
    measured_value = Column(Numeric(12, 4))
    tolerance_min = Column(Numeric(12, 4))
    tolerance_max = Column(Numeric(12, 4))
    
    # Results and compliance
    status = Column(String(20), nullable=False)  # pass, fail, out_of_tolerance
    within_tolerance = Column(Boolean, default=False)
    adjustment_made = Column(Boolean, default=False)
    adjustment_details = Column(Text)
    
    # Environmental conditions during calibration
    temperature = Column(Numeric(5, 2))
    humidity = Column(Numeric(5, 2))
    weather_conditions = Column(String(100))
    
    # Personnel and certification
    calibrated_by = Column(String(100), nullable=False)
    calibrated_by_user_id = Column(Integer, ForeignKey("users.id"))
    calibrated_by_contractor_id = Column(Integer, ForeignKey("contractors.id"))
    certification_number = Column(String(100))
    
    # Reference standards and equipment used
    reference_standards = Column(JSON)
    calibration_equipment = Column(JSON)
    
    # Fuel efficiency specific fields
    fuel_consumption_liters = Column(Numeric(10, 4))
    operating_hours = Column(Numeric(8, 2))
    distance_covered_km = Column(Numeric(10, 2))
    calculated_efficiency = Column(Numeric(8, 4))  # L/hr or L/100km
    
    # File references
    photo_file_ids = Column(JSON, default=list)  # Calibration setup photos
    certificate_file_ids = Column(JSON, default=list)  # Calibration certificates
    test_result_file_ids = Column(JSON, default=list)  # Detailed test results
    
    # Notes and regulatory compliance
    notes = Column(Text)
    regulatory_requirement = Column(String(100))
    compliance_status = Column(String(20), default="compliant")
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    created_by = Column(Integer, ForeignKey("users.id"))
    
    # Relationships
    asset = relationship("Asset", back_populates="calibration_records")
    company = relationship("Company")
    
    def get_files_by_category(self, db_session, category: str = None):
        """Get files associated with this calibration record"""
        from db.models.file import File
        query = db_session.query(File).filter(
            File.entity_type == "asset_calibration",
            File.entity_id == self.id,
            File.is_active == True
        )
        if category:
            query = query.filter(File.file_category == category)
        return query.all()


class StockMovement(Base):
    __tablename__ = "stock_movements"
    
    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False)  # Must be consumable
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    
    # Movement details
    movement_type = Column(String(20), nullable=False)  # purchase, usage, transfer, adjustment, disposal
    movement_date = Column(Date, nullable=False)
    quantity = Column(Numeric(12, 4), nullable=False)  # Positive for in, negative for out
    unit_cost = Column(Numeric(10, 4))
    total_cost = Column(Numeric(12, 2))
    
    # Batch tracking
    batch_number = Column(String(100))
    expiry_date = Column(Date)
    supplier = Column(String(100))
    
    # Usage context
    task_id = Column(Integer, ForeignKey("tasks.id"))  # If used in a task
    block_id = Column(Integer, ForeignKey("vineyard_blocks.id"))  # Where used
    usage_rate = Column(Numeric(10, 4))  # Application rate per hectare
    area_treated = Column(Numeric(10, 4))  # Hectares treated
    
    # Stock levels after movement
    stock_before = Column(Numeric(12, 4))
    stock_after = Column(Numeric(12, 4))
    
    # Documentation
    reference_number = Column(String(100))  # Invoice, job number, etc.
    notes = Column(Text)
    
    # File references
    document_file_ids = Column(JSON, default=list)  # Invoices, delivery notes, receipts
    photo_file_ids = Column(JSON, default=list)  # Photos of delivery, storage, etc.
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by = Column(Integer, ForeignKey("users.id"))
    
    # Relationships
    asset = relationship("Asset", back_populates="stock_movements")
    company = relationship("Company")
    task = relationship("Task")
    
    def get_files_by_category(self, db_session, category: str = None):
        """Get files associated with this stock movement"""
        from db.models.file import File
        query = db_session.query(File).filter(
            File.entity_type == "stock_movement",
            File.entity_id == self.id,
            File.is_active == True
        )
        if category:
            query = query.filter(File.file_category == category)
        return query.all()


class TaskAsset(Base):
    """Junction table for many-to-many relationship between tasks and assets"""
    __tablename__ = "task_assets"
    
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False)
    
    # Asset role in task
    role = Column(String(30), default="primary")  # primary, secondary, consumable
    is_required = Column(Boolean, default=True)
    
    # Planned usage
    planned_quantity = Column(Numeric(12, 4))  # For consumables
    planned_hours = Column(Numeric(8, 2))  # For equipment
    planned_rate = Column(Numeric(10, 4))  # Application rate
    
    # Actual usage (populated during/after task)
    actual_quantity = Column(Numeric(12, 4))
    actual_hours = Column(Numeric(8, 2))
    actual_rate = Column(Numeric(10, 4))
    
    # Calibration requirements
    requires_calibration = Column(Boolean, default=False)
    calibration_completed = Column(Boolean, default=False)
    calibration_id = Column(Integer, ForeignKey("asset_calibrations.id"))
    
    # Notes
    notes = Column(Text)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    task = relationship("Task", back_populates="task_assets")
    asset = relationship("Asset", back_populates="task_usage")
    calibration = relationship("AssetCalibration")