# backend/app/models/realtime_climate.py
"""
Real-time climate models for Regional Intelligence.

Tables:
- WeatherDataDaily: Daily aggregates per station
- ClimateZoneDaily: Zone-level daily climate with GDD accumulation
- ClimateZoneHourly: Zone-level hourly climate for disease models
- ClimateZoneDailyBaseline: 1986-2005 daily climatology per zone
- PhenologyThreshold: GDD thresholds by variety
- PhenologyEstimate: Current season phenology estimates
- DiseasePressure: Daily disease risk indicators with model outputs

NOTE: All FK references use 'climate_zones.id' (plural) to match existing schema.
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


class ClimateZoneDaily(Base):
    """Zone-level daily climate data with GDD accumulation."""
    __tablename__ = 'climate_zone_daily'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    zone_id = Column(Integer, ForeignKey('climate_zones.id'), nullable=False)  # PLURAL
    date = Column(Date, nullable=False)
    vintage_year = Column(Integer, nullable=False)
    
    # Temperature (°C)
    temp_min = Column(Numeric(6, 2))
    temp_max = Column(Numeric(6, 2))
    temp_mean = Column(Numeric(6, 2))
    
    # Humidity (%)
    humidity_mean = Column(Numeric(5, 2))
    
    # Rainfall (mm)
    rainfall_mm = Column(Numeric(8, 2))
    
    # Solar radiation (MJ/m²)
    solar_radiation = Column(Numeric(8, 2))
    
    # GDD calculations (base 0 for phenology)
    gdd_daily = Column(Numeric(6, 2))
    gdd_cumulative = Column(Numeric(8, 2))
    
    # Station coverage
    station_count = Column(Integer)
    stations_with_temp = Column(Integer)
    stations_with_humidity = Column(Integer)
    stations_with_rain = Column(Integer)
    
    # Confidence rating
    confidence = Column(String(10))  # 'high', 'medium', 'low'
    processing_method = Column(String(20))  # 'idw', 'simple_mean'
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    zone = relationship("ClimateZone", backref="daily_data")
    
    __table_args__ = (
        UniqueConstraint('zone_id', 'date', name='uq_climate_zone_daily_zone_date'),
        Index('idx_climate_zone_daily_zone_date', 'zone_id', date.desc()),
        Index('idx_climate_zone_daily_vintage', 'zone_id', 'vintage_year'),
    )
    
    @staticmethod
    def get_vintage_year(date):
        """Get the vintage year for a given date (July 1 - June 30)."""
        if date.month >= 7:
            return date.year + 1
        return date.year


class ClimateZoneHourly(Base):
    """
    Hourly aggregated climate data for disease model calculations.
    
    Required for peer-reviewed disease models:
    - UC Davis Powdery Mildew Risk Index (needs hourly temps)
    - González-Domínguez Botrytis Model (needs wetness duration)
    - Goidanich Downy Mildew Index (needs hourly conditions)
    """
    __tablename__ = 'climate_zone_hourly'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    zone_id = Column(Integer, ForeignKey('climate_zones.id'), nullable=False)  # PLURAL - matches schema
    timestamp_utc = Column(DateTime, nullable=False)
    timestamp_local = Column(DateTime, nullable=False)
    vintage_year = Column(Integer, nullable=False)
    
    # Temperature (°C)
    temp_mean = Column(Numeric(5, 2))
    temp_min = Column(Numeric(5, 2))
    temp_max = Column(Numeric(5, 2))
    
    # Humidity (%)
    rh_mean = Column(Numeric(5, 2))
    rh_min = Column(Numeric(5, 2))
    rh_max = Column(Numeric(5, 2))
    
    # Precipitation (mm)
    precipitation = Column(Numeric(6, 2), default=0)
    
    # Derived: Dewpoint (°C)
    dewpoint = Column(Numeric(5, 2))
    
    # Leaf wetness estimation (no sensor - derived from other variables)
    is_wet_hour = Column(Boolean, default=False)
    wetness_probability = Column(Numeric(3, 2))  # 0.00-1.00
    wetness_source = Column(String(20))  # 'rain', 'humidity', 'dewpoint', 'post_rain'
    hours_since_rain = Column(Integer)
    
    # Data quality
    station_count = Column(Integer)
    confidence = Column(String(10))
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    zone = relationship("ClimateZone", backref="hourly_data")
    
    __table_args__ = (
        UniqueConstraint('zone_id', 'timestamp_utc', name='uq_climate_zone_hourly'),
        Index('ix_zone_hourly_lookup', 'zone_id', 'timestamp_local'),
        Index('ix_zone_hourly_vintage', 'zone_id', 'vintage_year'),
    )


class ClimateZoneDailyBaseline(Base):
    """1986-2005 daily climatology baseline per zone."""
    __tablename__ = 'climate_zone_daily_baseline'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    zone_id = Column(Integer, ForeignKey('climate_zones.id'), nullable=False)  # PLURAL
    day_of_vintage = Column(Integer, nullable=False)  # 1 = July 1, 366 = June 30
    
    # Temperature
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
    
    # GDD cumulative
    gdd_base0_cumulative_avg = Column(Numeric(8, 2))
    gdd_base0_cumulative_sd = Column(Numeric(8, 2))
    
    # Rainfall
    rain_avg = Column(Numeric(8, 2))
    rain_sd = Column(Numeric(8, 2))
    
    # Solar
    solar_avg = Column(Numeric(8, 2))
    solar_sd = Column(Numeric(8, 2))
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    zone = relationship("ClimateZone", backref="daily_baseline")
    
    __table_args__ = (
        UniqueConstraint('zone_id', 'day_of_vintage', name='uq_baseline_zone_doy'),
        CheckConstraint('day_of_vintage BETWEEN 1 AND 366', name='ck_baseline_doy_range'),
        Index('idx_baseline_zone_doy', 'zone_id', 'day_of_vintage'),
    )
    
    @staticmethod
    def date_to_doy_vintage(date):
        """Convert a date to day-of-vintage-year (July 1 = 1)."""
        from datetime import date as dt
        if date.month >= 7:
            july_1 = dt(date.year, 7, 1)
        else:
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
    gdd_harvest_170 = Column(Numeric(8, 2))
    gdd_harvest_180 = Column(Numeric(8, 2))
    gdd_harvest_190 = Column(Numeric(8, 2))
    gdd_harvest_200 = Column(Numeric(8, 2))
    gdd_harvest_210 = Column(Numeric(8, 2))
    gdd_harvest_220 = Column(Numeric(8, 2))
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
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
    zone_id = Column(Integer, ForeignKey('climate_zones.id'), nullable=False)  # PLURAL
    variety_code = Column(String(20), nullable=False)
    vintage_year = Column(Integer, nullable=False)
    estimate_date = Column(Date, nullable=False)
    
    # Current status
    gdd_accumulated = Column(Numeric(8, 2))
    current_stage = Column(String(30))
    
    # Stage dates
    flowering_date = Column(Date)
    flowering_is_actual = Column(Boolean, default=False)
    veraison_date = Column(Date)
    veraison_is_actual = Column(Boolean, default=False)
    
    # Harvest predictions
    harvest_170_date = Column(Date)
    harvest_180_date = Column(Date)
    harvest_190_date = Column(Date)
    harvest_200_date = Column(Date)
    harvest_210_date = Column(Date)
    harvest_220_date = Column(Date)
    
    # Comparison to baseline
    days_vs_baseline = Column(Integer)
    gdd_vs_baseline = Column(Numeric(8, 2))
    
    confidence = Column(String(10))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    zone = relationship("ClimateZone", backref="phenology_estimates")
    
    __table_args__ = (
        UniqueConstraint('zone_id', 'variety_code', 'vintage_year', 'estimate_date',
                        name='uq_phenology_zone_variety_vintage_date'),
        Index('idx_phenology_zone_vintage', 'zone_id', 'vintage_year', estimate_date.desc()),
    )


class DiseasePressure(Base):
    """
    Daily disease risk indicators per zone.
    
    Combines simple risk levels with peer-reviewed model outputs:
    - Powdery Mildew: UC Davis Risk Index (Gubler et al., 1999)
    - Botrytis: González-Domínguez Model (2015)
    - Downy Mildew: 3-10 Rule + Goidanich Index
    """
    __tablename__ = 'disease_pressure'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    zone_id = Column(Integer, ForeignKey('climate_zones.id'), nullable=False)  # PLURAL
    date = Column(Date, nullable=False)
    vintage_year = Column(Integer)  # Added for easier querying
    
    # ==========================================================================
    # RISK LEVELS (original fields - kept for backward compatibility)
    # ==========================================================================
    downy_mildew_risk = Column(String(10))    # 'low', 'moderate', 'high', 'extreme'
    powdery_mildew_risk = Column(String(10))
    botrytis_risk = Column(String(10))
    
    # ==========================================================================
    # POWDERY MILDEW - UC Davis Risk Index (Gubler et al., 1999)
    # ==========================================================================
    # Daily index contribution
    pm_daily_index = Column(Numeric(5, 2))
    # Cumulative index (0-100): <30 low, 30-50 moderate, 50-60 high, >60 extreme
    pm_cumulative_index = Column(Numeric(5, 2))
    # Hours at favorable temperature (21-30°C)
    pm_favorable_hours = Column(Integer)
    # Hours above lethal threshold (>35°C)
    pm_lethal_hours = Column(Integer)
    
    # ==========================================================================
    # BOTRYTIS - González-Domínguez Model (2015)
    # ==========================================================================
    # Daily infection severity (0-100)
    botrytis_severity = Column(Numeric(5, 2))
    # Cumulative seasonal risk
    botrytis_cumulative = Column(Numeric(5, 2))
    # Wet hours (leaf wetness estimated)
    botrytis_wet_hours = Column(Integer)
    # Sporulation index (conditions for secondary spread)
    botrytis_sporulation_index = Column(Numeric(5, 2))
    
    # ==========================================================================
    # DOWNY MILDEW - 3-10 Rule + Goidanich Index
    # ==========================================================================
    # 3-10 Rule conditions met (T≥10°C, Rain≥10mm, wetness)
    dm_primary_met = Column(Boolean, default=False)
    # Primary risk score (0-100)
    dm_primary_score = Column(Numeric(5, 2))
    # Goidanich cumulative index for secondary infection
    dm_goidanich_index = Column(Numeric(5, 2))
    
    # ==========================================================================
    # CONTEXT & METADATA
    # ==========================================================================
    # Current growth stage (affects disease susceptibility)
    growth_stage = Column(String(30))
    
    # Flexible storage for additional factors (original field)
    risk_factors = Column(JSONB)
    
    # Recommendations
    recommendations = Column(Text)
    
    # Data quality
    humidity_available = Column(Boolean, default=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    zone = relationship("ClimateZone", backref="disease_pressure")
    
    __table_args__ = (
        UniqueConstraint('zone_id', 'date', name='uq_disease_zone_date'),
        Index('idx_disease_zone_date', 'zone_id', date.desc()),
        Index('idx_disease_zone_vintage', 'zone_id', 'vintage_year'),
    )
    
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