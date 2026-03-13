# db/models/management_relationship.py - Management Relationship (Phase A, Grow V1)
from sqlalchemy import Column, Integer, String, Text, DateTime, Date, Boolean, ForeignKey, Index
from sqlalchemy.sql import func, text
from sqlalchemy.orm import relationship
from db.base_class import Base


class ManagementRelationship(Base):
    __tablename__ = "management_relationships"

    id = Column(Integer, primary_key=True, index=True)
    property_id = Column(Integer, ForeignKey("properties.id"), nullable=False)
    managing_company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)  # NULL = currently active
    contract_reference = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Partial unique index: only one active manager per property
    __table_args__ = (
        Index(
            "idx_one_active_manager",
            "property_id",
            unique=True,
            postgresql_where=text("is_active = TRUE")
        ),
    )

    # Relationships
    property = relationship("Property", back_populates="management_relationships")
    managing_company = relationship(
        "Company",
        foreign_keys=[managing_company_id],
        back_populates="managed_relationships"
    )
    created_by = relationship("User", foreign_keys=[created_by_user_id])

    def __repr__(self):
        return (
            f"<ManagementRelationship(id={self.id}, property_id={self.property_id}, "
            f"managing_company_id={self.managing_company_id}, is_active={self.is_active})>"
        )
