# db/models/user.py - User Model with Simplified Roles (CLEANED)
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, JSON, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from db.base_class import Base
from datetime import datetime, timezone, timedelta

class User(Base):
    __tablename__ = "users"

    # Basic user info
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    first_name = Column(String(50))
    last_name = Column(String(50))
    
    # Simplified role system - only 3 roles
    role = Column(String(20), nullable=False, default="user")  # admin, manager, user
    
    # Company relationship
    company_id = Column(Integer, ForeignKey("companies.id"))
    
    # Account status and verification
    is_active = Column(Boolean, default=True, nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)
    is_suspended = Column(Boolean, default=False, nullable=False)
    
    # Profile enhancements
    avatar_url = Column(String(500), nullable=True)
    phone = Column(String(20), nullable=True)
    bio = Column(Text, nullable=True)
    timezone = Column(String(50), default="UTC", nullable=False)
    language = Column(String(10), default="en", nullable=False)
    
    # User preferences - JSON field for flexibility
    preferences = Column(JSON, default=dict, nullable=False)
    
    # Security and tracking
    last_login = Column(DateTime(timezone=True), nullable=True)
    login_count = Column(Integer, default=0, nullable=False)
    failed_login_attempts = Column(Integer, default=0, nullable=False)
    locked_until = Column(DateTime(timezone=True), nullable=True)
    
    # Email verification
    verification_token = Column(String(255), nullable=True)
    verification_sent_at = Column(DateTime(timezone=True), nullable=True)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    
    # Password reset
    reset_token = Column(String(255), nullable=True)
    reset_token_expires = Column(DateTime(timezone=True), nullable=True)
    
    # Invitation/Admin fields
    invited_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    invited_at = Column(DateTime(timezone=True), nullable=True)
    accepted_invite_at = Column(DateTime(timezone=True), nullable=True)

    # Timestamps
    deleted_at = Column(DateTime(timezone=True), nullable=True)  # Soft delete

    # Relationships - SIMPLIFIED (commented out problematic ones)
    company = relationship("Company", back_populates="users")
    tasks_created = relationship("Task", foreign_keys="Task.created_by", back_populates="creator")
    tasks_assigned = relationship("Task", foreign_keys="Task.assigned_to", back_populates="assignee")
    observations = relationship("Observation", back_populates="creator")
    owned_risks = relationship("SiteRisk", foreign_keys="SiteRisk.owner_id", back_populates="owner")
    created_risks = relationship("SiteRisk", foreign_keys="SiteRisk.created_by", back_populates="creator")
    assigned_risk_actions = relationship("RiskAction", foreign_keys="RiskAction.assigned_to", back_populates="assignee")
    responsible_risk_actions = relationship("RiskAction", foreign_keys="RiskAction.responsible_person", back_populates="responsible")
    created_risk_actions = relationship("RiskAction", foreign_keys="RiskAction.created_by", back_populates="creator")
    reported_incidents = relationship("Incident", foreign_keys="Incident.reported_by", back_populates="reporter")
    investigated_incidents = relationship("Incident", foreign_keys="Incident.investigator_id", back_populates="investigator")
    sent_invitations = relationship("Invitation", foreign_keys="[Invitation.invited_by]", back_populates="inviter")
    contractor_relationships_created = relationship("ContractorRelationship", foreign_keys="ContractorRelationship.created_by", back_populates="creator")
    contractor_assignments_created = relationship("ContractorAssignment", foreign_keys="ContractorAssignment.assigned_by", back_populates="assigner")
    contractor_assignments_completed = relationship("ContractorAssignment", foreign_keys="ContractorAssignment.completed_by", back_populates="completer")
    contractor_assignments_approved = relationship("ContractorAssignment", foreign_keys="ContractorAssignment.approved_by", back_populates="approver")
    contractor_training_assigned = relationship("ContractorTraining", foreign_keys="ContractorTraining.assigned_by", back_populates="assigner")
    contractor_movements_logged = relationship("ContractorMovement", foreign_keys="ContractorMovement.logged_by", back_populates="logger")
    contractor_movements_checked_in = relationship("ContractorMovement", foreign_keys="ContractorMovement.checked_in_by", back_populates="checked_in_by_user")
    contractor_movements_checked_out = relationship("ContractorMovement", foreign_keys="ContractorMovement.checked_out_by", back_populates="checked_out_by_user")


    
    def __repr__(self):
        return f"<User(id={self.id}, email='{self.email}', role='{self.role}', company_id={self.company_id})>"
    
    @property
    def full_name(self):
        """Return the user's full name if available, otherwise username"""
        if self.first_name and self.last_name:
            return f"{self.first_name} {self.last_name}"
        elif self.first_name:
            return self.first_name
        else:
            return self.username
    
    @property
    def is_account_locked(self):
        """Check if account is locked due to failed login attempts"""
        if not self.locked_until:
            return False
        return datetime.now(timezone.utc) < self.locked_until
    
    @property
    def can_login(self):
        """Check if user can login (active, verified, not suspended, not locked)"""
        if not self.is_active:
            return False
        if not self.is_verified:
            return False
        if self.is_suspended:
            return False
        if self.is_account_locked:
            return False
        return True
    
    def has_permission(self, permission: str) -> bool:
        """Check if user has a specific permission based on simplified role"""
        role_permissions = {
            "admin": [
                "manage_company", "manage_users", "manage_billing", 
                "manage_blocks", "manage_observations", "manage_tasks", "manage_risks",
                "view_analytics", "export_data", "manage_settings", "manage_training",
                "view_training", "view_training_reports", "view_training"
            ],
            "manager": [
                "manage_blocks", "manage_observations", "manage_tasks", "manage_risks",
                "view_analytics", "export_data", "manage_training", "view_training",
                "view_training_reports", "view_training"
            ],
            "user": [
                "create_observations", "complete_tasks", "edit_own_tasks", 
                "view_blocks", "export_own_data", "view_training"
            ]
        }
        
        user_permissions = role_permissions.get(self.role, [])
        return permission in user_permissions
    
    def can_manage_user(self, target_user) -> bool:
        """Check if this user can manage another user"""
        if not self.has_permission("manage_users"):
            return False
        
        # Only admin can manage users
        if self.role == "admin":
            return target_user.company_id == self.company_id
        
        return False
    
    def can_invite_users(self) -> bool:
        """Check if user can invite other users"""
        # Only admin and manager can invite users
        return self.role in ["admin", "manager"]
    
    def can_invite_role(self, target_role: str) -> bool:
        """Check if user can invite someone with the target role"""
        if not self.can_invite_users():
            return False
        
        # Admin can invite any role
        if self.role == "admin":
            return target_role in ["admin", "manager", "user"]
        
        # Manager can only invite users (not admin/manager)
        if self.role == "manager":
            return target_role == "user"
        
        return False
    
    def get_preference(self, key: str, default=None):
        """Get a user preference value"""
        return self.preferences.get(key, default)
    
    def set_preference(self, key: str, value):
        """Set a user preference value"""
        if self.preferences is None:
            self.preferences = {}
        self.preferences[key] = value
    
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
    
    def accept_invitation(self):
        """Mark invitation as accepted"""
        if not self.accepted_invite_at:
            self.accepted_invite_at = datetime.now(timezone.utc)