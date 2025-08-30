# db/models/block.py - Updated version
from sqlalchemy import Column, Integer, String, Float, Boolean, Date, DateTime, func, ForeignKey, JSON
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry
from db.base_class import Base
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from db.models.climate_historical import ClimateHistoricalData

class VineyardBlock(Base):
    __tablename__ = "vineyard_blocks"
    
    id = Column(Integer, primary_key=True, index=True)
    block_name = Column(String, nullable=True)
    planted_date = Column(Date, nullable=True)
    removed_date = Column(Date, nullable=True)
    variety = Column(String, nullable=True)
    clone = Column(String, nullable=True) 
    rootstock = Column(String, nullable=True)
    row_spacing = Column(Float, nullable=True)
    vine_spacing = Column(Float, nullable=True)
    area = Column(Float, nullable=True)
    region = Column(String, nullable=True)
    swnz = Column(Boolean, default=False)
    organic = Column(Boolean, default=False)
    biodynamic = Column(Boolean, default=False)
    regenerative = Column(Boolean, default=False)
    winery = Column(String, nullable=True)
    centroid_longitude = Column(Float, nullable=True)
    centroid_latitude = Column(Float, nullable=True)
    gi = Column(String, nullable=True)
    elevation = Column(Float, nullable=True)
    geometry = Column(Geometry('GEOMETRY'), nullable=True)
    row_start = Column(String, nullable=True)
    row_end = Column(String, nullable=True)
    row_count = Column(Integer, nullable=True)
    training_system = Column(String, nullable=True)
    company_id = Column(Integer, ForeignKey("companies.id"))
    
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # Relationships
    company = relationship("Company", back_populates="blocks")
    tasks = relationship("Task", back_populates="block")
    observations = relationship("Observation", back_populates="block", cascade="all, delete-orphan")
    rows = relationship("VineyardRow", back_populates="block", cascade="all, delete-orphan")
    blockchain_chains = relationship("BlockchainChain", back_populates="vineyard_block")
    climate_historical_data = relationship("ClimateHistoricalData", back_populates="vineyard_block", cascade="all, delete-orphan")

    def get_climate_data_summary(self, db_session, days: int = 30):

        from datetime import date, timedelta
        from sqlalchemy import func
        from db.models.climate_historical import ClimateHistoricalData
        
        start_date = date.today() - timedelta(days=days)
        
        summary = db_session.query(
            func.avg(ClimateHistoricalData.temperature_mean).label('avg_temp'),
            func.sum(ClimateHistoricalData.rainfall_amount).label('total_rainfall'),
            func.count(ClimateHistoricalData.id).label('record_count')
        ).filter(
            ClimateHistoricalData.vineyard_block_id == self.id,
            ClimateHistoricalData.date >= start_date
        ).first()
        
        return {
            "period_days": days,
            "average_temperature": round(summary.avg_temp, 1) if summary.avg_temp else None,
            "total_rainfall": round(summary.total_rainfall, 1) if summary.total_rainfall else None,
            "data_points": summary.record_count or 0
        }