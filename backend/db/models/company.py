# db/models/company.py - Updated for single tier subscription model
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, JSON, Numeric, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from db.base_class import Base

class Company(Base):
    __tablename__ = "companies"

    # Basic company info
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    address = Column(Text)
    company_number = Column(String, unique=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Multi-tenancy & routing
    slug = Column(String, unique=True, nullable=True, index=True)
    domain = Column(String, unique=True, nullable=True, index=True)
    subdomain = Column(String, unique=True, nullable=True, index=True)
    
    # Subscription reference - defaults to primary subscription
    subscription_id = Column(Integer, ForeignKey("subscriptions.id"), nullable=False)
    
    # Subscription status and billing
    subscription_status = Column(String, default="active", nullable=False)
    subscription_provider_id = Column(String, nullable=True)
    subscription_external_id = Column(String, nullable=True)
    billing_email = Column(String, nullable=True)
    
    # Company-specific vineyard info - THIS IS THE KEY PRICING FACTOR
    total_hectares = Column(Numeric(10, 2), default=0.0, nullable=False)
    
    # Trial information
    trial_start = Column(DateTime(timezone=True), nullable=True)
    trial_end = Column(DateTime(timezone=True), nullable=True)
    is_trial = Column(Boolean, default=False, nullable=False)
    
    # Subscription dates
    subscription_start = Column(DateTime(timezone=True), nullable=True)
    subscription_end = Column(DateTime(timezone=True), nullable=True)
    current_period_start = Column(DateTime(timezone=True), nullable=True)
    current_period_end = Column(DateTime(timezone=True), nullable=True)
    
    # Current billing amount (calculated from hectares)
    current_monthly_amount = Column(Numeric(10, 2), nullable=True)
    current_yearly_amount = Column(Numeric(10, 2), nullable=True)
    currency = Column(String, default="USD", nullable=False)
    billing_interval = Column(String, default="month", nullable=False)
    
    # Company settings and overrides (rarely needed in single tier)
    settings = Column(JSON, default=dict, nullable=False)
    feature_overrides = Column(JSON, default=dict, nullable=False)
    
    # Status and metadata
    is_active = Column(Boolean, default=True, nullable=False)
    created_by = Column(Integer, nullable=True)
    
    # Relationships - UPDATED with visitor relationships
    observation_runs = relationship("ObservationRun", cascade="all, delete-orphan")
    observation_spots = relationship("ObservationSpot", cascade="all, delete-orphan")
    observation_templates = relationship("ObservationTemplate", cascade="all, delete-orphan")
    subscription = relationship("Subscription", back_populates="companies")
    users = relationship("User", back_populates="company")
    blocks = relationship("VineyardBlock", back_populates="company")
    invitations = relationship("Invitation", back_populates="company")
    land_ownerships = relationship("CompanyLandOwnership", back_populates="company")
    spatial_areas = relationship("SpatialArea", back_populates="company")
    site_risks = relationship("SiteRisk", back_populates="company")
    risk_actions = relationship("RiskAction", back_populates="company")
    incidents = relationship("Incident", back_populates="company")
    visitors = relationship("Visitor", back_populates="company")
    visitor_visits = relationship("VisitorVisit", back_populates="company")
    training_modules = relationship("TrainingModule", back_populates="company")
    timesheets = relationship("TimesheetDay", back_populates="company", cascade="all, delete-orphan")
    assets = relationship("Asset", back_populates="company")
    task_templates = relationship(
        "TaskTemplate", 
        back_populates="company", 
        cascade="all, delete-orphan"
    )
    
    tasks = relationship(
        "Task", 
        back_populates="company", 
        cascade="all, delete-orphan"
    )
    contractor_relationships = relationship(
        "ContractorRelationship", 
        back_populates="company", 
        cascade="all, delete-orphan"
    )
    contractor_movements = relationship(
        "ContractorMovement", 
        foreign_keys="ContractorMovement.company_id",  # Specify which FK to use
        back_populates="company", 
        cascade="all, delete-orphan"
    )
    contractor_assignments = relationship(
        "ContractorAssignment", 
        back_populates="company", 
        cascade="all, delete-orphan"
    )


    def __repr__(self):
        return f"<Company(id={self.id}, name='{self.name}', hectares={self.total_hectares})>"
    
    # ===== SUBSCRIPTION & BILLING METHODS =====
    
    @property
    def is_subscription_active(self):
        """Check if subscription is in good standing"""
        return self.subscription_status in ["active", "trialing"]
    
    @property
    def is_on_trial(self):
        """Check if company is currently on trial"""
        if not self.trial_end:
            return False
        from datetime import datetime, timezone
        return self.is_trial and datetime.now(timezone.utc) < self.trial_end
    
    @property
    def days_until_trial_end(self):
        """Get days remaining in trial"""
        if not self.is_on_trial:
            return 0
        from datetime import datetime, timezone
        delta = self.trial_end - datetime.now(timezone.utc)
        return max(0, delta.days)
    
    @property
    def monthly_cost(self):
        """Get current monthly cost based on hectares"""
        return float(self.current_monthly_amount) if self.current_monthly_amount else 0.0
    
    @property
    def yearly_cost(self):
        """Get current yearly cost based on hectares"""
        return float(self.current_yearly_amount) if self.current_yearly_amount else 0.0
    
    @property
    def cost_per_hectare_monthly(self):
        """Get cost per hectare per month"""
        if not self.total_hectares or self.total_hectares == 0:
            return 0.0
        return self.monthly_cost / float(self.total_hectares)
    
    @property
    def yearly_savings(self):
        """Calculate yearly savings vs monthly billing"""
        monthly_annual = self.monthly_cost * 12
        return max(0, monthly_annual - self.yearly_cost)
    
    @property
    def yearly_savings_percentage(self):
        """Get yearly savings as percentage"""
        monthly_annual = self.monthly_cost * 12
        if monthly_annual == 0:
            return 0.0
        return (self.yearly_savings / monthly_annual) * 100
    
    # ===== FEATURE ACCESS (SIMPLIFIED FOR SINGLE TIER) =====
    
    def has_feature(self, feature_name: str) -> bool:
        """Check if company has access to a specific feature - simplified for single tier"""
        # In single tier model, check company-specific overrides first
        disabled_overrides = self.feature_overrides.get("disabled_features", [])
        if feature_name in disabled_overrides:
            return False
            
        # Check company-specific enabled overrides
        enabled_overrides = self.feature_overrides.get("enabled_features", [])
        if feature_name in enabled_overrides:
            return True
            
        # Default to subscription features (usually all enabled for primary subscription)
        if self.subscription:
            return self.subscription.has_feature(feature_name)
        
        return False
    
    def get_feature_config(self, feature_name: str, default=None):
        """Get configuration for a specific feature"""
        # Check company-specific overrides first
        company_config = self.feature_overrides.get("feature_config", {}).get(feature_name)
        if company_config is not None:
            return company_config
            
        # Then check subscription config
        if self.subscription:
            return self.subscription.get_feature_config(feature_name, default)
        
        return default
    
    # ===== USER & STORAGE LIMITS (UNLIMITED IN SINGLE TIER) =====
    
    def is_within_user_limit(self, current_user_count: int) -> bool:
        """Check if adding another user would exceed the limit - always True for single tier"""
        if not self.subscription:
            return True
        return self.subscription.can_add_users(current_user_count, 1)
    
    def can_add_users(self, current_user_count: int, additional_users: int = 1) -> bool:
        """Check if company can add more users - always True for single tier"""
        if not self.subscription:
            return True
        return self.subscription.can_add_users(current_user_count, additional_users)
    
    def can_add_storage(self, current_storage_gb: float, additional_gb: float) -> bool:
        """Check if company can add more storage - always True for single tier"""
        if not self.subscription:
            return True
        return self.subscription.can_add_storage(current_storage_gb, additional_gb)
    
    def can_invite_users(self, current_user_count: int, invite_count: int = 1) -> bool:
        """Check if company can invite users - always True for single tier"""
        if not self.subscription:
            return True
        return self.subscription.max_users == -1 or (current_user_count + invite_count) <= self.subscription.max_users
    
    # ===== PRICING CALCULATIONS =====
    
    def calculate_current_pricing(self):
        """Calculate and update current pricing based on subscription + hectares"""
        if not self.subscription:
            self.current_monthly_amount = 0
            self.current_yearly_amount = 0
            return
        
        hectares = float(self.total_hectares) if self.total_hectares else 0.0
        self.current_monthly_amount = self.subscription.calculate_monthly_price(hectares)
        self.current_yearly_amount = self.subscription.calculate_yearly_price(hectares)
    
    def calculate_pricing_for_hectares(self, hectares: float):
        """Calculate pricing for a different hectare amount"""
        if not self.subscription:
            return {"monthly": 0, "yearly": 0}
            
        return {
            "monthly": self.subscription.calculate_monthly_price(hectares),
            "yearly": self.subscription.calculate_yearly_price(hectares),
            "savings": self.subscription.get_yearly_savings(hectares),
            "savings_percentage": self.subscription.get_yearly_savings_percentage(hectares)
        }
    
    def update_hectares(self, new_hectares: float):
        """Update hectares and recalculate pricing"""
        self.total_hectares = new_hectares
        self.calculate_current_pricing()
    
    # ===== TRIAL MANAGEMENT =====
    
    def start_trial(self, trial_days: int = None):
        """Start a trial period for this company"""
        if not self.subscription or not self.subscription.trial_enabled:
            return False
        
        from datetime import datetime, timezone, timedelta
        days = trial_days if trial_days is not None else self.subscription.trial_days
        
        self.is_trial = True
        self.trial_start = datetime.now(timezone.utc)
        self.trial_end = self.trial_start + timedelta(days=days)
        self.subscription_status = "trialing"
        
        return True
    
    def end_trial(self, new_status: str = "active"):
        """End the trial period"""
        self.is_trial = False
        self.subscription_status = new_status
        # Keep trial dates for historical reference
    
    # ===== USER MANAGEMENT HELPERS =====
    
    def get_current_user_count(self, db_session) -> int:
        """Get current active user count"""
        from sqlalchemy import func
        from db.models.user import User
        
        return db_session.query(func.count(User.id)).filter(
            User.company_id == self.id,
            User.is_active == True
        ).scalar() or 0
    
    def get_user_limits_info(self, db_session) -> dict:
        """Get user limits info - simplified for unlimited users"""
        current_users = self.get_current_user_count(db_session)
        max_users = self.subscription.max_users if self.subscription else -1
        
        return {
            "current_users": current_users,
            "max_users": max_users,
            "remaining_slots": -1 if max_users == -1 else max(0, max_users - current_users),
            "is_unlimited": max_users == -1,
            "can_invite": True,  # Always true in single tier
            "usage_percentage": 0.0 if max_users == -1 else min(100.0, (current_users / max_users * 100)),
            "subscription_name": self.subscription.display_name if self.subscription else "Unknown"
        }
    
    # ===== BILLING & SUBSCRIPTION INFO =====
    
    def get_billing_summary(self) -> dict:
        """Get comprehensive billing summary"""
        return {
            "company_name": self.name,
            "total_hectares": float(self.total_hectares),
            "subscription_name": self.subscription.display_name if self.subscription else "Unknown",
            "monthly_cost": self.monthly_cost,
            "yearly_cost": self.yearly_cost,
            "cost_per_hectare_monthly": self.cost_per_hectare_monthly,
            "yearly_savings": self.yearly_savings,
            "yearly_savings_percentage": self.yearly_savings_percentage,
            "currency": self.currency,
            "billing_interval": self.billing_interval,
            "is_trial": self.is_on_trial,
            "days_remaining_trial": self.days_until_trial_end,
            "subscription_status": self.subscription_status,
            "unlimited_users": self.subscription.is_unlimited_users if self.subscription else False,
            "unlimited_storage": self.subscription.is_unlimited_storage if self.subscription else False
        }
    
    # ===== EXISTING METHODS (unchanged) =====
    
    def get_owned_parcels(self, verified_only=True):
        """Get all land parcels owned by this company"""
        ownerships = self.land_ownerships
        if verified_only:
            ownerships = [o for o in ownerships if o.verified]
        return [ownership.land_parcel for ownership in ownerships]
    
    def get_total_owned_area_hectares(self, verified_only=True):
        """Get total area of owned land in hectares"""
        parcels = self.get_owned_parcels(verified_only)
        total_area = 0
        for parcel in parcels:
            if parcel.calc_area:
                total_area += float(parcel.calc_area)
        return total_area / 10000  # Convert to hectares
    
    # ===== VISITOR-RELATED METHODS =====
    
    def get_active_visitors(self, db_session):
        """Get all visitors currently on site"""
        from db.models.visitor import VisitorVisit
        from datetime import date
        
        return db_session.query(VisitorVisit).filter(
            VisitorVisit.company_id == self.id,
            VisitorVisit.visit_date == date.today(),
            VisitorVisit.signed_in_at.isnot(None),
            VisitorVisit.signed_out_at.is_(None)
        ).all()
    
    def get_visitor_stats(self, db_session, days: int = 30):
        """Get visitor statistics for the company"""
        from db.models.visitor import Visitor, VisitorVisit
        from datetime import date, timedelta
        from sqlalchemy import func, and_
        
        start_date = date.today() - timedelta(days=days)
        
        total_visitors = db_session.query(func.count(Visitor.id)).filter(
            Visitor.company_id == self.id,
            Visitor.is_active == True
        ).scalar() or 0
        
        total_visits = db_session.query(func.count(VisitorVisit.id)).filter(
            VisitorVisit.company_id == self.id,
            VisitorVisit.visit_date >= start_date
        ).scalar() or 0
        
        active_visits = len(self.get_active_visitors(db_session))
        
        frequent_visitors = db_session.query(func.count(Visitor.id)).filter(
            Visitor.company_id == self.id,
            Visitor.id.in_(
                db_session.query(VisitorVisit.visitor_id)
                .filter(VisitorVisit.company_id == self.id)
                .group_by(VisitorVisit.visitor_id)
                .having(func.count(VisitorVisit.id) >= 3)
            )
        ).scalar() or 0
        
        return {
            "total_visitors": total_visitors,
            "total_visits": total_visits,
            "active_visits_today": active_visits,
            "frequent_visitors": frequent_visitors,
            "period_days": days
        }
    
    def has_visitor_access(self, feature_name: str = "visitor_management") -> bool:
        """Check if company has access to visitor management features - True in single tier"""
        return self.has_feature(feature_name)

    def has_training_access(self, feature_name: str = "training_modules") -> bool:
        """Check if company has access to training features - True in single tier"""
        return self.has_feature(feature_name)
    
    def get_training_stats(self, db_session, days: int = 30):
        """Get training statistics for the company"""
        from db.models.training_module import TrainingModule
        from db.models.training_record import TrainingRecord
        from datetime import date, timedelta
        from sqlalchemy import func, and_
        
        start_date = date.today() - timedelta(days=days)
        
        total_modules = db_session.query(func.count(TrainingModule.id)).filter(
            TrainingModule.company_id == self.id,
            TrainingModule.is_active == True
        ).scalar() or 0
        
        published_modules = db_session.query(func.count(TrainingModule.id)).filter(
            TrainingModule.company_id == self.id,
            TrainingModule.is_active == True,
            TrainingModule.published_at.isnot(None)
        ).scalar() or 0
        
        completions = db_session.query(func.count(TrainingRecord.id)).filter(
            TrainingRecord.module.has(TrainingModule.company_id == self.id),
            TrainingRecord.status == "completed",
            TrainingRecord.completed_at >= start_date
        ).scalar() or 0
        
        active_assignments = db_session.query(func.count(TrainingRecord.id)).filter(
            TrainingRecord.module.has(TrainingModule.company_id == self.id),
            TrainingRecord.status.in_(["assigned", "in_progress"])
        ).scalar() or 0
        
        return {
            "total_modules": total_modules,
            "published_modules": published_modules,
            "completions_this_period": completions,
            "active_assignments": active_assignments,
            "period_days": days
        }
    
    def get_auto_assign_modules(self, entity_type: str, user_role: str = None):
        """Get training modules that should be auto-assigned to entity type"""
        modules = []
        for module in self.training_modules:
            if module.is_published and module.can_be_assigned_to(entity_type, user_role):
                modules.append(module)
        return modules
    
    def assign_required_training(self, db_session, entity_type: str, entity_id: int, assigned_by_user_id: int = None):
        """Auto-assign required training modules to an entity"""
        from db.models.training_record import TrainingRecord
        
        auto_assign_modules = self.get_auto_assign_modules(entity_type)
        assigned_modules = []
        
        for module in auto_assign_modules:
            existing = db_session.query(TrainingRecord).filter(
                TrainingRecord.training_module_id == module.id,
                TrainingRecord.entity_type == entity_type,
                TrainingRecord.entity_id == entity_id
            ).first()
            
            if not existing:
                record = TrainingRecord(
                    training_module_id=module.id,
                    entity_type=entity_type,
                    entity_id=entity_id,
                    passing_score_required=module.passing_score,
                    assigned_by=assigned_by_user_id,
                    assignment_reason=f"auto_{entity_type}",
                    module_version=module.version
                )
                
                if module.valid_for_days:
                    from datetime import datetime, timezone, timedelta
                    record.expires_at = datetime.now(timezone.utc) + timedelta(days=module.valid_for_days)
                
                db_session.add(record)
                assigned_modules.append(module)
        
        return assigned_modules