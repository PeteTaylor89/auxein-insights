# db/models/user_property_scope.py - VMC staff property scoping (Phase A, Grow V1)
from sqlalchemy import Column, Integer, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from db.base_class import Base


class UserPropertyScope(Base):
    __tablename__ = "user_property_scopes"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    property_id = Column(Integer, ForeignKey("properties.id"), nullable=False, index=True)

    __table_args__ = (
        UniqueConstraint("user_id", "property_id", name="uq_user_property"),
    )

    user = relationship("User", back_populates="property_scopes")
    property = relationship("Property")

    def __repr__(self):
        return f"<UserPropertyScope(user_id={self.user_id}, property_id={self.property_id})>"
