# db/models/contractor.py - Contractor Model
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, JSON, Text, Date, Numeric
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from db.base_class import Base
from datetime import datetime, timezone, timedelta

class Contractor(Base):
    __tablename__ = "contractors"

    # Basic info
    id = Column(Integer, primary_key=True, index=True)
    business_name = Column(String(200), nullable=False)
    business_number = Column(String(50), unique=True, nullable=True)  # ABN/GST number
    contact_person = Column(String(100), nullable=False)
    
    # Contact details
    email = Column(String(100), nullable=False, index=True, unique=True)
    phone = Column(String(20), nullable=False)
    mobile = Column(String(20), nullable=True)
    address = Column(Text, nullable=True)
    
    # Authentication - contractors get their own login
    hashed_password = Column(String, nullable=False)
    is_contractor_verified = Column(Boolean, default=False)
    last_login = Column(DateTime(timezone=True), nullable=True)
    failed_login_attempts = Column(Integer, default=0)
    locked_until = Column(DateTime(timezone=True), nullable=True)
    
    # Email verification for contractors
    verification_token = Column(String(255), nullable=True)
    verification_sent_at = Column(DateTime(timezone=True), nullable=True)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    
    # Business details
    contractor_type = Column(String(50), nullable=False, default="individual")  # individual, company, partnership
    specializations = Column(JSON, default=list, nullable=False)  # ["pruning", "spraying", "harvesting", "pest_control"]
    equipment_owned = Column(JSON, default=list, nullable=False)  # Equipment they bring
    
    # COMPREHENSIVE INSURANCE TRACKING
    # Public Liability Insurance
    public_liability_insurer = Column(String(100), nullable=True)
    public_liability_policy_number = Column(String(100), nullable=True)
    public_liability_coverage_amount = Column(Numeric(12, 2), nullable=True)  # Coverage amount
    public_liability_expiry = Column(Date, nullable=True)
    
    # Professional Indemnity Insurance
    professional_indemnity_insurer = Column(String(100), nullable=True)
    professional_indemnity_policy_number = Column(String(100), nullable=True)
    professional_indemnity_coverage_amount = Column(Numeric(12, 2), nullable=True)
    professional_indemnity_expiry = Column(Date, nullable=True)
    
    # Workers Compensation (if they have employees)
    workers_comp_required = Column(Boolean, default=False)
    workers_comp_insurer = Column(String(100), nullable=True)
    workers_comp_policy_number = Column(String(100), nullable=True)
    workers_comp_expiry = Column(Date, nullable=True)
    
    # Equipment/Tools Insurance
    equipment_insurance_insurer = Column(String(100), nullable=True)
    equipment_insurance_coverage_amount = Column(Numeric(12, 2), nullable=True)
    equipment_insurance_expiry = Column(Date, nullable=True)
    
    # Vehicle Insurance (for work vehicles)
    vehicle_insurance_insurer = Column(String(100), nullable=True)
    vehicle_insurance_policy_number = Column(String(100), nullable=True)
    vehicle_insurance_expiry = Column(Date, nullable=True)
    
    # VERIFICATION DOCUMENTS STORAGE
    # Documents stored as file references with metadata
    verification_documents = Column(JSON, default=list, nullable=False)
    # Example structure:
    # [
    #   {
    #     "type": "insurance_certificate",
    #     "subtype": "public_liability",
    #     "file_path": "contractor_docs/123/insurance_cert_2024.pdf",
    #     "original_filename": "insurance_certificate.pdf",
    #     "uploaded_at": "2024-01-15T10:30:00Z",
    #     "expires_at": "2024-12-31",
    #     "verified_by": 15,  # user_id who verified
    #     "verified_at": "2024-01-16T09:00:00Z",
    #     "status": "approved"  # pending, approved, rejected, expired
    #   }
    # ]
    
    # Status and compliance
    is_active = Column(Boolean, default=True, nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)  # Overall verification status
    verification_level = Column(String(20), default="none", nullable=False)  # none, basic, full, premium
    
    # BIOSECURITY TRACKING
    # Equipment cleaning protocols
    has_cleaning_protocols = Column(Boolean, default=False, nullable=False)
    cleaning_equipment_owned = Column(JSON, default=list, nullable=False)  # ["pressure_washer", "disinfectant_sprayer"]
    uses_approved_disinfectants = Column(Boolean, default=False, nullable=False)
    
    # Biosecurity risk factors
    works_multiple_regions = Column(Boolean, default=False, nullable=False)
    works_with_high_risk_crops = Column(Boolean, default=False, nullable=False)  # grapes, kiwifruit, etc.
    has_biosecurity_incidents = Column(Boolean, default=False, nullable=False)
    last_biosecurity_training = Column(Date, nullable=True)
    
    # Movement tracking for biosecurity
    requires_movement_tracking = Column(Boolean, default=True, nullable=False)
    min_days_between_properties = Column(Integer, default=0, nullable=False)  # Quarantine period if needed
    
    # Performance tracking
    total_jobs_completed = Column(Integer, default=0, nullable=False)
    average_rating = Column(Numeric(3, 2), default=0.0, nullable=False)
    last_active_date = Column(Date, nullable=True)
    
    # Track registration details
    registration_ip = Column(String(45), nullable=True)
    registration_source = Column(String(50), default="web_signup")
    email_verified_at = Column(DateTime(timezone=True), nullable=True)
    profile_completed_at = Column(DateTime(timezone=True), nullable=True)

    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    company_relationships = relationship("ContractorRelationship", back_populates="contractor", cascade="all, delete-orphan")
    movements = relationship("ContractorMovement", back_populates="contractor", cascade="all, delete-orphan")
    assignments = relationship("ContractorAssignment", back_populates="contractor", cascade="all, delete-orphan")
    training_records = relationship("ContractorTraining", back_populates="contractor", cascade="all, delete-orphan")
    maintenance_performed = relationship("AssetMaintenance", foreign_keys="AssetMaintenance.performed_by_contractor_id")
    calibrations_performed = relationship("AssetCalibration", foreign_keys="AssetCalibration.calibrated_by_contractor_id")
    
    def __repr__(self):
        return f"<Contractor(id={self.id}, business_name='{self.business_name}', contact_person='{self.contact_person}')>"
    
    @property
    def full_contact_name(self):
        """Return the contact person's name"""
        return self.contact_person
    
    @property
    def is_account_locked(self):
        """Check if account is locked due to failed login attempts"""
        if not self.locked_until:
            return False
        return datetime.now(timezone.utc) < self.locked_until
    
    @property
    def can_login(self):
        """Check if contractor can login (active, verified, not locked)"""
        if not self.is_active:
            return False
        if not self.is_contractor_verified:
            return False
        if self.is_account_locked:
            return False
        return True
    
    @property
    def insurance_status(self):
        """Get overall insurance compliance status"""
        from datetime import date
        today = date.today()
        
        # Check required insurances
        public_liability_valid = (
            self.public_liability_expiry and 
            self.public_liability_expiry > today
        )
        
        # Workers comp only required if they have employees
        workers_comp_valid = (
            not self.workers_comp_required or 
            (self.workers_comp_expiry and self.workers_comp_expiry > today)
        )
        
        if public_liability_valid and workers_comp_valid:
            return "compliant"
        elif self.public_liability_expiry and self.public_liability_expiry > today:
            return "partial"
        else:
            return "non_compliant"
    
    @property
    def biosecurity_risk_level(self):
        """Calculate biosecurity risk level"""
        risk_score = 0
        
        if self.works_multiple_regions:
            risk_score += 2
        if self.works_with_high_risk_crops:
            risk_score += 2
        if self.has_biosecurity_incidents:
            risk_score += 3
        if not self.has_cleaning_protocols:
            risk_score += 2
        if not self.uses_approved_disinfectants:
            risk_score += 1
        
        # Check if biosecurity training is recent (within 12 months)
        if self.last_biosecurity_training:
            from datetime import date, timedelta
            if date.today() - self.last_biosecurity_training > timedelta(days=365):
                risk_score += 2
        else:
            risk_score += 3
        
        if risk_score >= 7:
            return "high"
        elif risk_score >= 4:
            return "medium"
        else:
            return "low"
    
    def get_active_company_relationships(self):
        """Get all active company relationships"""
        return [rel for rel in self.company_relationships if rel.status == "active"]

    def increment_failed_login(self):
        """Increment failed login attempts and lock account if necessary"""
        self.failed_login_attempts += 1
        
        # Lock account for 30 minutes after 5 failed attempts
        if self.failed_login_attempts >= 5:
            self.locked_until = datetime.now(timezone.utc) + timedelta(minutes=30)
    
    def reset_failed_login(self):
        """Reset failed login attempts on successful login"""
        self.failed_login_attempts = 0
        self.locked_until = None
    
    def update_last_login(self):
        """Update last login timestamp"""
        self.last_login = datetime.now(timezone.utc)
    """
    def add_verification_document(self, doc_type: str, subtype: str, file_path: str, 
                                original_filename: str, expires_at: str = None):
        
        if self.verification_documents is None:
            self.verification_documents = []
        
        document = {
            "type": doc_type,
            "subtype": subtype,
            "file_path": file_path,
            "original_filename": original_filename,
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": expires_at,
            "verified_by": None,
            "verified_at": None,
            "status": "pending"
        }
        
        self.verification_documents.append(document)
    """
    def get_specialization_display(self):
        """Get formatted specializations for display"""
        if not self.specializations:
            return "General contractor"
        return ", ".join(self.specializations)
    
    def can_work_for_company(self, company_id: int):
        """Check if contractor can work for a specific company"""
        for relationship in self.company_relationships:
            if (relationship.company_id == company_id and 
                relationship.status == "active"):
                return True
        return False

    @property
    def registration_status(self):
        if not self.is_contractor_verified:
            return "email_pending"
        elif not self.profile_completed_at:
            return "profile_incomplete" 
        elif not self.first_company_relationship:
            return "awaiting_company_connection"
        else:
            return "active"