# db/models/climate_historical.py
from sqlalchemy import Column, Integer, String, Float, Date, DateTime, func, ForeignKey, Enum
from sqlalchemy.orm import relationship
from db.base_class import Base
import enum

class DataQuality(enum.Enum):
    interpolated = "interpolated"
    measured = "measured"
    estimated = "estimated"

class ClimateHistoricalData(Base):
    __tablename__ = "climate_historical_data"
    
    id = Column(Integer, primary_key=True, index=True)
    vineyard_block_id = Column(Integer, ForeignKey("vineyard_blocks.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    
    # Core climate variables (matching your CSV structure)
    temperature_mean = Column(Float, nullable=True)  # Tmean(C)
    temperature_min = Column(Float, nullable=True)   # Tmin(C)
    temperature_max = Column(Float, nullable=True)   # Tmax(C)
    rainfall_amount = Column(Float, nullable=True)   # Amount(mm)
    solar_radiation = Column(Float, nullable=True)   # Amount(MJm2)
    
    # Future expansion fields
    humidity = Column(Float, nullable=True)          # % for future
    wind_speed = Column(Float, nullable=True)        # km/h for future
    
    # Metadata
    data_quality = Column(Enum(DataQuality), default=DataQuality.interpolated, nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    vineyard_block = relationship("VineyardBlock", back_populates="climate_historical_data")
    
    def __repr__(self):
        return f"<ClimateHistoricalData(block_id={self.vineyard_block_id}, date={self.date}, temp_mean={self.temperature_mean})>"
    
    @property
    def company_id(self):
        """Get company_id through the vineyard block relationship"""
        return self.vineyard_block.company_id if self.vineyard_block else None
    
    def to_dict(self):
        """Convert to dictionary for API responses"""
        return {
            "id": self.id,
            "vineyard_block_id": self.vineyard_block_id,
            "date": self.date.isoformat() if self.date else None,
            "temperature_mean": self.temperature_mean,
            "temperature_min": self.temperature_min,
            "temperature_max": self.temperature_max,
            "rainfall_amount": self.rainfall_amount,
            "solar_radiation": self.solar_radiation,
            "humidity": self.humidity,
            "wind_speed": self.wind_speed,
            "data_quality": self.data_quality.value if self.data_quality else None,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }


# Update to block.py model - add this relationship
# Add this line to the VineyardBlock class relationships section:
# climate_historical_data = relationship("ClimateHistoricalData", back_populates="vineyard_block", cascade="all, delete-orphan")