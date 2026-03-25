# db/models/external_alias.py - External system ID mapping (Grow V1, Revision 2)
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from db.base_class import Base


class ExternalAlias(Base):
    __tablename__ = "external_aliases"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    entity_type = Column(String(50), nullable=False)       # 'block', 'property', 'asset', 'user'
    entity_id = Column(Integer, nullable=False)             # polymorphic FK (not DB-enforced)
    system_name = Column(String(100), nullable=False)       # 'grapelink', 'swnz', 'acvm', 'supplier', 'custom'
    external_id = Column(String(255), nullable=False)       # the ID in the external system
    external_label = Column(String(255), nullable=True)     # optional human-readable label
    extra = Column("metadata", JSONB, nullable=True)        # DB column is "metadata", Python attr is "extra"
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    company = relationship("Company", foreign_keys=[company_id])

    __table_args__ = (
        UniqueConstraint('company_id', 'entity_type', 'entity_id', 'system_name',
                         name='uq_alias_entity_system'),
        Index('ix_alias_entity', 'entity_type', 'entity_id'),
        Index('ix_alias_system', 'company_id', 'system_name'),
    )

    def __repr__(self):
        return (
            f"<ExternalAlias(id={self.id}, {self.entity_type}:{self.entity_id} "
            f"-> {self.system_name}:{self.external_id})>"
        )
