from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from db.base_class import Base

class TokenBlacklist(Base):
    __tablename__ = "token_blacklist"
    
    id = Column(Integer, primary_key=True, index=True)
    jti = Column(String(255), unique=True, index=True, nullable=False)  # JWT ID
    token_type = Column(String(20), nullable=False)  # 'access' or 'refresh'
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    reason = Column(String(50), default="logout")  # logout, security, admin_revoke
    blacklisted_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)  # Original token expiry
    
    # Relationship
    user = relationship("User")
    
    def __repr__(self):
        return f"<TokenBlacklist(jti='{self.jti}', type='{self.token_type}', user_id={self.user_id})>"