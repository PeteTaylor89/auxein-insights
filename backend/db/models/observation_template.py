#db/models/observation_template.py

from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from db.base_class import Base

class ObservationTemplate(Base):
    __tablename__ = "observation_templates"

    id = Column(Integer, primary_key=True, index=True)
    # NULL company_id = system template; non-null = org-scoped template
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)

    name = Column(String(120), nullable=False)
    type = Column(String(50), nullable=False, index=True)  # e.g. bunch_count, phenology, disease_quick
    version = Column(Integer, nullable=False, default=1)
    is_active = Column(Boolean, nullable=False, default=True)

    # Dynamic form definition
    fields_json = Column(JSON, nullable=False, default=list)        # array of field descriptors
    defaults_json = Column(JSON, nullable=False, default=dict)      # optional defaults
    validations_json = Column(JSON, nullable=False, default=dict)   # optional JSONSchema-like

    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships (optional; company doesn't need back_populates right now)
    creator = relationship("User")
