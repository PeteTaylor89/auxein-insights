# db/models/invitation.py
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from db.base_class import Base
from datetime import datetime, timezone, timedelta
import secrets

class Invitation(Base):
    __tablename__ = "invitations"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(100), nullable=False, index=True)
    token = Column(String(255), unique=True, nullable=False, index=True)
    
    # Company and user relationships
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    invited_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # User details for invitation
    role = Column(String(20), nullable=False, default="user")
    first_name = Column(String(50), nullable=True)
    last_name = Column(String(50), nullable=True)
    suggested_username = Column(String(50), nullable=True)
    message = Column(Text, nullable=True)
    
    # Status and timing
    status = Column(String(20), nullable=False, default="pending")  # pending, accepted, expired, cancelled
    expires_at = Column(DateTime(timezone=True), nullable=False)
    sent_at = Column(DateTime(timezone=True), server_default=func.now())
    accepted_at = Column(DateTime(timezone=True), nullable=True)
    
    # Result of invitation
    created_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    temporary_password = Column(String(255), nullable=True)  # Store hashed temp password

    # Relationships
    company = relationship("Company", back_populates="invitations")
    inviter = relationship("User", foreign_keys=[invited_by], back_populates="sent_invitations")
    created_user = relationship("User", foreign_keys=[created_user_id])
    
    @property
    def is_expired(self):
        """Check if invitation is expired"""
        return datetime.now(timezone.utc) > self.expires_at
    
    @property
    def is_valid(self):
        """Check if invitation is valid (pending and not expired)"""
        return self.status == "pending" and not self.is_expired
    
    @classmethod
    def create_invitation(cls, email: str, company_id: int, invited_by: int, 
                         role: str = "user", days_valid: int = 7, 
                         temporary_password: str = None, **kwargs):
        """Create a new invitation with generated token"""
        from core.security.password import get_password_hash
        
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(days=days_valid)
        
        # Hash the temporary password if provided
        hashed_temp_password = None
        if temporary_password:
            hashed_temp_password = get_password_hash(temporary_password)
        
        return cls(
            email=email,
            token=token,
            company_id=company_id,
            invited_by=invited_by,
            role=role,
            expires_at=expires_at,
            temporary_password=hashed_temp_password,
            **kwargs
        )
