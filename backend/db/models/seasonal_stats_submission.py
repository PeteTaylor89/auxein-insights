# db/models/seasonal_stats_submission.py
"""
Captures user-submitted seasonal stats requests for modelling.
Each submission records what zone/variety/harvest date the user queried.
"""
from sqlalchemy import (
    Column, Integer, String, Date, DateTime, ForeignKey, JSON, func
)
from sqlalchemy.orm import relationship
from db.base_class import Base


class SeasonalStatsSubmission(Base):
    """User submissions via the seasonal stats widget."""
    __tablename__ = "seasonal_stats_submissions"

    id = Column(Integer, primary_key=True, index=True)
    public_user_id = Column(Integer, ForeignKey("public_users.id"), nullable=True)

    # Inputs
    zone_slug = Column(String(100), nullable=False)
    variety = Column(String(100), nullable=True)  # code or free text for 'other'
    harvest_date = Column(Date, nullable=False)

    # Selected display variables (ordered list)
    selected_variables = Column(JSON, nullable=True)

    # Calculated results snapshot
    results = Column(JSON, nullable=True)

    created_at = Column(DateTime, default=func.now())

    # Relationships
    user = relationship("PublicUser", backref="seasonal_stats_submissions")
