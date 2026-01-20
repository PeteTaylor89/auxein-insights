# backend/app/models/realtime_climate.py
"""
Real-time climate models for Regional Intelligence.

Tables:
- WeatherDataDaily: Daily aggregates per station
- ClimateZoneDaily: Zone-level daily climate with GDD accumulation
- ClimateZoneDailyBaseline: 1986-2005 daily climatology per zone
- PhenologyThreshold: GDD thresholds by variety
- PhenologyEstimate: Current season phenology estimates
- DiseasePressure: Daily disease risk indicators
"""

from sqlalchemy import (
    Column, Integer, String, Text, Boolean, Date, Numeric, 
    DateTime, ForeignKey, Index, UniqueConstraint, CheckConstraint, func
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from db.base_class import Base


class WeatherDataDaily(Base):
    """Daily aggregated weather data per station."""
    __tablename__ = 'weather_data_daily'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    station_id = Column(Integer, ForeignKey('weather_stations.station_id'), nullable=False)
    date = Column(Date, nullable=False)
    
    # Temperature (°C)
    temp_min = Column(Numeric(6, 2))
    temp_max = Column(Numeric(6, 2))
    temp_mean = Column(Numeric(6, 2))
    
    # Humidity (%)
    humidity_min = Column(Numeric(5, 2))
    humidity_max = Column(Numeric(5, 2))
    humidity_mean = Column(Numeric(5, 2))
    
    # Rainfall (mm) - sum for the day
    rainfall_mm = Column(Numeric(8, 2))
    
    # Solar radiation (MJ/m²) - sum for the day
    solar_radiation = Column(Numeric(8, 2))
    
    # GDD calculations
    gdd_base0 = Column(Numeric(6, 2))   # max(0, temp_mean)
    gdd_base10 = Column(Numeric(6, 2))  # max(0, temp_mean - 10)
    
    # Data quality indicators
    temp_record_count = Column(Integer)
    humidity_record_count = Column(Integer)
    rainfall_record_count = Column(Integer)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    station = relationship("WeatherStation", backref="daily_data")
    
    __table_args__ = (
        UniqueConstraint('station_id', 'date', name='uq_weather_data_daily_station_date'),
        Index('idx_weather_data_daily_station_date', 'station_id', date.desc()),
        Index('idx_weather_data_daily_date', 'date'),
    )
    
    def __repr__(self):
        return f"<WeatherDataDaily(station_id={self.station_id}, date='{self.date}')>"


class ClimateZoneDaily(Base):
    """Zone-level daily climate data with GDD accumulation."""
    __tablename__ = 'climate_zone_daily'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    zone_id = Column(Integer, ForeignKey('climate_zones.id'), nullable=False)
    date = Column(Date, nullable=False)
    vintage_year = Column(Integer, nullable=False)  # Growing season year (July-June)
    
    # Temperature (°C) - IDW average across stations
    temp_min = Column(Numeric(6, 2))
    temp_max = Column(Numeric(6, 2))
    temp_mean = Column(Numeric(6, 2))
    
    # Humidity (%) - where available
    humidity_mean = Column(Numeric(5, 2))
    
    # Rainfall (mm)
    rainfall_mm = Column(Numeric(8, 2))
    
    # Solar radiation (MJ/m²)
    solar_radiation = Column(Numeric(8, 2))
    
    # GDD calculations (base 0 for phenology matching)
    gdd_daily = Column(Numeric(6, 2))       # That day's GDD
    gdd_cumulative = Column(Numeric(8, 2))  # Running total from July 1
    
    # Station coverage metrics
    station_count = Column(Integer)
    stations_with_temp = Column(Integer)
    stations_with_humidity = Column(Integer)
    stations_with_rain = Column(Integer)
    
    # Confidence rating: 'low' (2-3), 'medium' (4-5), 'high' (6+)
    confidence = Column(String(10))
    processing_method = Column(String(20))  # 'idw', 'simple_mean'
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    zone = relationship("ClimateZone", backref="daily_data")
    
    __table_args__ = (
        UniqueConstraint('zone_id', 'date', name='uq_climate_zone_daily_zone_date'),
        Index('idx_climate_zone_daily_zone_date', 'zone_id', date.desc()),
        Index('idx_climate_zone_daily_vintage', 'zone_id', 'vintage_year'),
    )
    
    def __repr__(self):
        return f"<ClimateZoneDaily(zone_id={self.zone_id}, date='{self.date}')>"
    
    @staticmethod
    def get_vintage_year(date):
        """Get the vintage year for a given date (July 1 - June 30)."""
        if date.month >= 7:
            return date.year + 1
        return date.year


class ClimateZoneDailyBaseline(Base):
    """1986-2005 daily climatology baseline per zone."""
    __tablename__ = 'climate_zone_daily_baseline'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    zone_id = Column(Integer, ForeignKey('climate_zones.id'), nullable=False)
    
    # Day of vintage year (1 = July 1, 366 = June 30)
    day_of_vintage = Column(Integer, nullable=False)
    
    # Temperature means and standard deviations
    tmean_avg = Column(Numeric(6, 2))
    tmean_sd = Column(Numeric(6, 2))
    tmin_avg = Column(Numeric(6, 2))
    tmin_sd = Column(Numeric(6, 2))
    tmax_avg = Column(Numeric(6, 2))
    tmax_sd = Column(Numeric(6, 2))
    
    # GDD daily
    gdd_base0_avg = Column(Numeric(6, 2))
    gdd_base0_sd = Column(Numeric(6, 2))
    gdd_base10_avg = Column(Numeric(6, 2))
    gdd_base10_sd = Column(Numeric(6, 2))
    
    # GDD cumulative (for phenology comparison)
    gdd_base0_cumulative_avg = Column(Numeric(8, 2))
    gdd_base0_cumulative_sd = Column(Numeric(8, 2))
    
    # Rainfall
    rain_avg = Column(Numeric(8, 2))
    rain_sd = Column(Numeric(8, 2))
    
    # Solar radiation
    solar_avg = Column(Numeric(8, 2))
    solar_sd = Column(Numeric(8, 2))
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    zone = relationship("ClimateZone", backref="daily_baseline")
    
    __table_args__ = (
        UniqueConstraint('zone_id', 'day_of_vintage', name='uq_baseline_zone_doy'),
        CheckConstraint('day_of_vintage BETWEEN 1 AND 366', name='ck_baseline_doy_range'),
        Index('idx_baseline_zone_doy', 'zone_id', 'day_of_vintage'),
    )
    
    def __repr__(self):
        return f"<ClimateZoneDailyBaseline(zone_id={self.zone_id}, doy={self.day_of_vintage})>"
    
    @staticmethod
    def date_to_doy_vintage(date):
        """Convert a date to day-of-vintage-year (July 1 = 1)."""
        from datetime import date as dt
        if date.month >= 7:
            # July 1 of current year is day 1
            july_1 = dt(date.year, 7, 1)
        else:
            # January 1 is after July 1 of previous year
            july_1 = dt(date.year - 1, 7, 1)
        return (date - july_1).days + 1


class PhenologyThreshold(Base):
    """GDD thresholds for phenological stages by grape variety."""
    __tablename__ = 'phenology_thresholds'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    variety_code = Column(String(20), nullable=False, unique=True)
    variety_name = Column(String(100), nullable=False)
    
    # GDD thresholds (base 0)
    gdd_flowering = Column(Numeric(8, 2))
    gdd_veraison = Column(Numeric(8, 2))
    
    # Harvest thresholds at different sugar levels (g/L)
    gdd_harvest_170 = Column(Numeric(8, 2))  # 170 g/L - sparkling
    gdd_harvest_180 = Column(Numeric(8, 2))  # 180 g/L
    gdd_harvest_190 = Column(Numeric(8, 2))  # 190 g/L
    gdd_harvest_200 = Column(Numeric(8, 2))  # 200 g/L - table wine
    gdd_harvest_210 = Column(Numeric(8, 2))  # 210 g/L
    gdd_harvest_220 = Column(Numeric(8, 2))  # 220 g/L - riper style
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    def __repr__(self):
        return f"<PhenologyThreshold(variety='{self.variety_name}')>"
    
    def get_harvest_threshold(self, sugar_level: int = 200):
        """Get harvest GDD threshold for a given sugar level."""
        thresholds = {
            170: self.gdd_harvest_170,
            180: self.gdd_harvest_180,
            190: self.gdd_harvest_190,
            200: self.gdd_harvest_200,
            210: self.gdd_harvest_210,
            220: self.gdd_harvest_220,
        }
        return thresholds.get(sugar_level, self.gdd_harvest_200)


class PhenologyEstimate(Base):
    """Current season phenology estimates per zone and variety."""
    __tablename__ = 'phenology_estimates'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    zone_id = Column(Integer, ForeignKey('climate_zones.id'), nullable=False)
    variety_code = Column(String(20), nullable=False)
    vintage_year = Column(Integer, nullable=False)
    estimate_date = Column(Date, nullable=False)
    
    # Current status
    gdd_accumulated = Column(Numeric(8, 2))
    current_stage = Column(String(30))  # 'pre_flowering', 'flowering', 'veraison', 'ripening', 'harvest_ready'
    
    # Stage dates (actual or estimated)
    flowering_date = Column(Date)
    flowering_is_actual = Column(Boolean, default=False)
    veraison_date = Column(Date)
    veraison_is_actual = Column(Boolean, default=False)
    
    # Harvest predictions at different sugar targets
    harvest_170_date = Column(Date)
    harvest_180_date = Column(Date)
    harvest_190_date = Column(Date)
    harvest_200_date = Column(Date)
    harvest_210_date = Column(Date)
    harvest_220_date = Column(Date)
    
    # Comparison to baseline
    days_vs_baseline = Column(Integer)  # Positive = ahead, negative = behind
    gdd_vs_baseline = Column(Numeric(8, 2))  # Current GDD minus baseline expected
    
    # Confidence based on station coverage
    confidence = Column(String(10))
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    zone = relationship("ClimateZone", backref="phenology_estimates")
    
    __table_args__ = (
        UniqueConstraint('zone_id', 'variety_code', 'vintage_year', 'estimate_date',
                        name='uq_phenology_zone_variety_vintage_date'),
        Index('idx_phenology_zone_vintage', 'zone_id', 'vintage_year', estimate_date.desc()),
    )
    
    def __repr__(self):
        return f"<PhenologyEstimate(zone_id={self.zone_id}, variety='{self.variety_code}', date='{self.estimate_date}')>"


class DiseasePressure(Base):
    """Daily disease risk indicators per zone."""
    __tablename__ = 'disease_pressure'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    zone_id = Column(Integer, ForeignKey('climate_zones.id'), nullable=False)
    date = Column(Date, nullable=False)
    
    # Risk levels: 'low', 'moderate', 'high', 'extreme'
    downy_mildew_risk = Column(String(10))
    powdery_mildew_risk = Column(String(10))
    botrytis_risk = Column(String(10))
    
    # Contributing factors (JSONB for flexibility)
    risk_factors = Column(JSONB)
    # Example structure:
    # {
    #   "downy": {"temp_suitable": true, "rain_7d": 12.5, "humidity_high": true},
    #   "powdery": {"temp_optimal": true, "no_rain": true, "humidity_range": true},
    #   "botrytis": {"temp_optimal": false, "humidity_high": false}
    # }
    
    # Recommendations
    recommendations = Column(Text)
    
    # Data quality flag
    humidity_available = Column(Boolean, default=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    zone = relationship("ClimateZone", backref="disease_pressure")
    
    __table_args__ = (
        UniqueConstraint('zone_id', 'date', name='uq_disease_zone_date'),
        Index('idx_disease_zone_date', 'zone_id', date.desc()),
    )
    
    def __repr__(self):
        return f"<DiseasePressure(zone_id={self.zone_id}, date='{self.date}')>"
    
    @property
    def overall_risk(self):
        """Get the highest risk level across all diseases."""
        risk_order = {'low': 0, 'moderate': 1, 'high': 2, 'extreme': 3}
        risks = [
            self.downy_mildew_risk,
            self.powdery_mildew_risk,
            self.botrytis_risk
        ]
        max_risk = max(
            (r for r in risks if r),
            key=lambda x: risk_order.get(x, 0),
            default='low'
        )
        return max_risk