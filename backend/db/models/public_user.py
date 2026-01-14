# db/models/public_user.py - Public User Model with Marketing & User Segmentation
from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text
from sqlalchemy.sql import func
from db.base_class import Base
from datetime import datetime, timezone

class PublicUser(Base):
    __tablename__ = "public_users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    first_name = Column(String(50), nullable=True)
    last_name = Column(String(50), nullable=True)

    user_type = Column(String(50), nullable=True)
    company_name = Column(String(200), nullable=True)
    job_title = Column(String(100), nullable=True)
    region_of_interest = Column(String(100), nullable=True)

    newsletter_opt_in = Column(Boolean, default=False, nullable=False)
    marketing_opt_in = Column(Boolean, default=False, nullable=False)
    research_opt_in = Column(Boolean, default=False, nullable=False)

    is_active = Column(Boolean, default=True, nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)

    verification_token = Column(String(255), nullable=True)
    verification_sent_at = Column(DateTime(timezone=True), nullable=True)
    verified_at = Column(DateTime(timezone=True), nullable=True)

    reset_token = Column(String(255), nullable=True)
    reset_token_expires = Column(DateTime(timezone=True), nullable=True)

    last_login = Column(DateTime(timezone=True), nullable=True)
    login_count = Column(Integer, default=0, nullable=False)

    first_map_view = Column(DateTime(timezone=True), nullable=True)
    last_active = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
    
    def __repr__(self):
        return f"<PublicUser(id={self.id}, email='{self.email}', type='{self.user_type}', verified={self.is_verified})>"
    
    @property
    def full_name(self):
        """Return the user's full name if available, otherwise email"""
        if self.first_name and self.last_name:
            return f"{self.first_name} {self.last_name}"
        elif self.first_name:
            return self.first_name
        else:
            return self.email.split('@')[0]
    
    @property
    def can_login(self):
        """Check if user can login (must be active and verified)"""
        return self.is_active and self.is_verified
    
    @property
    def is_wine_professional(self):
        """Check if user is a wine industry professional"""
        return self.user_type in ['wine_company_owner', 'wine_company_employee', 'consultant']
    
    @property
    def marketing_segment(self):
        """
        Return marketing segment for targeted communications.
        Useful for email campaigns and analytics.
        """
        if self.user_type == 'wine_company_owner':
            return 'high_value_prospect'  # Most likely to buy paid tool
        elif self.user_type == 'wine_company_employee':
            return 'decision_influencer'  # May influence purchase decision
        elif self.user_type == 'consultant':
            return 'referral_partner'  # May refer clients
        elif self.user_type == 'wine_enthusiast':
            return 'community_member'  # Engagement, not conversion
        elif self.user_type == 'researcher':
            return 'academic_partner'  # Potential collaboration
        else:
            return 'general_user'
    
    def can_receive_newsletter(self):
        """Check if user has opted in to newsletters"""
        return self.newsletter_opt_in and self.is_verified
    
    def can_receive_marketing(self):
        """Check if user has opted in to marketing emails"""
        return self.marketing_opt_in and self.is_verified
    
    def update_last_active(self):
        """Update last active timestamp (call when user interacts)"""
        self.last_active = datetime.now(timezone.utc)