# db/models/climate.py
"""
Climate data models for Regional Intelligence app.

Tables:
- climate_zones: 20 NZ wine climate zones with FK to wine_regions
- climate_history_monthly: Monthly climate stats 1986-2024
- climate_baseline_monthly: 1986-2005 baseline averages per month
- climate_projections: SSP scenario projections (SSP126, SSP245, SSP370)
"""

from sqlalchemy import (
    Column, Integer, BigInteger, String, Text, Boolean,
    DateTime, Date, Numeric, ForeignKey, UniqueConstraint, Index, func
)
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry
from db.base_class import Base


class ClimateZone(Base):
    """
    Climate zones for NZ wine regions.

    20 zones total, each linked to a parent wine_region.
    Zone names match CSV filenames for data import (e.g., 'Auckland.csv').
    """
    __tablename__ = "climate_zones"

    id = Column(Integer, primary_key=True, index=True)
    region_id = Column(Integer, ForeignKey("wine_regions.id"), nullable=True)

    # Zone identification
    name = Column(String(100), nullable=False)  # Display name, matches CSV filename
    slug = Column(String(100), nullable=False, unique=True, index=True)

    # Content for UI display
    description = Column(Text, nullable=True)

    # Boundary geometry for map layer (WGS84)
    geometry = Column(Geometry('MULTIPOLYGON', srid=4326), nullable=True)

    # Display settings
    display_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)

    # Data Ingestion Platform (Phase 0.2) — hierarchy + country
    parent_zone_id = Column(Integer, ForeignKey("climate_zones.id"), nullable=True)
    zone_level = Column(String(20), nullable=False, server_default='region')
    country_id = Column(Integer, ForeignKey('countries.id'), nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    region = relationship("WineRegion", backref="climate_zones")
    parent_zone = relationship("ClimateZone", remote_side=[id], backref="sub_zones")
    country = relationship("Country", foreign_keys=[country_id])
    history = relationship("ClimateHistoryMonthly", back_populates="zone", cascade="all, delete-orphan")
    baseline = relationship("ClimateBaselineMonthly", back_populates="zone", cascade="all, delete-orphan")
    projections = relationship("ClimateProjection", back_populates="zone", cascade="all, delete-orphan")
    season_stats = relationship("ClimateZoneSeasonStats", back_populates="zone", cascade="all, delete-orphan")
    season_baseline = relationship("ClimateZoneSeasonBaseline", back_populates="zone", cascade="all, delete-orphan")
    projection_extremes = relationship("ClimateProjectionExtremes", back_populates="zone", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<ClimateZone(id={self.id}, name='{self.name}')>"
    
    @property
    def csv_filename(self):
        """Get the CSV filename for this zone's data"""
        return f"{self.name}.csv"
    
    @property
    def projections_filename(self):
        """Get the projections CSV filename for this zone"""
        return f"{self.name}_projections.csv"


class ClimateHistoryMonthly(Base):
    """
    Monthly climate statistics for each zone (1986-2024).
    
    Data includes mean and spatial standard deviation across the zone
    for temperature, GDD, rainfall, and solar radiation.
    
    Vintage year follows Southern Hemisphere convention:
    - Sep 1986 through Apr 1987 = vintage_year 1987
    """
    __tablename__ = "climate_history_monthly"
    
    id = Column(BigInteger, primary_key=True, index=True)
    zone_id = Column(Integer, ForeignKey("climate_zones.id"), nullable=False)
    
    # Date fields
    date = Column(Date, nullable=False)  # First of month (e.g., 1986-01-01)
    month = Column(Integer, nullable=False)  # 1-12
    year = Column(Integer, nullable=False)  # Calendar year
    vintage_year = Column(Integer, nullable=False)  # Growing season year
    
    # Temperature (°C) - mean and spatial std dev across zone
    tmean_mean = Column(Numeric(6, 2), nullable=True)
    tmean_sd = Column(Numeric(6, 2), nullable=True)
    tmin_mean = Column(Numeric(6, 2), nullable=True)
    tmin_sd = Column(Numeric(6, 2), nullable=True)
    tmax_mean = Column(Numeric(6, 2), nullable=True)
    tmax_sd = Column(Numeric(6, 2), nullable=True)
    
    # Growing Degree Days (base 10°C)
    gdd_mean = Column(Numeric(8, 2), nullable=True)
    gdd_sd = Column(Numeric(8, 2), nullable=True)
    
    # Rainfall (mm)
    rain_mean = Column(Numeric(8, 2), nullable=True)
    rain_sd = Column(Numeric(8, 2), nullable=True)
    
    # Solar radiation (MJ/m²)
    solar_mean = Column(Numeric(8, 2), nullable=True)
    solar_sd = Column(Numeric(8, 2), nullable=True)

    # Max 1-day rainfall (Rx1day, mm) — monthly extreme-rainfall event
    rx1day_mean = Column(Numeric(8, 2), nullable=True)
    rx1day_sd = Column(Numeric(8, 2), nullable=True)

    # Frost days (Tmin < 0) — monthly count (0 over summer; peaks in winter)
    frost_days_mean = Column(Numeric(6, 2), nullable=True)
    frost_days_sd = Column(Numeric(6, 2), nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=func.now())

    # Relationships
    zone = relationship("ClimateZone", back_populates="history")
    
    # Constraints and indexes
    __table_args__ = (
        UniqueConstraint('zone_id', 'date', name='uq_climate_history_zone_date'),
        Index('idx_climate_history_zone_vintage', 'zone_id', 'vintage_year'),
        Index('idx_climate_history_zone_month', 'zone_id', 'month'),
    )
    
    def __repr__(self):
        return f"<ClimateHistoryMonthly(zone_id={self.zone_id}, date='{self.date}')>"


class ClimateBaselineMonthly(Base):
    """
    Monthly baseline climate values (1986-2005 average).
    
    Extracted from projections CSV - same baseline values across all
    SSP scenarios and periods for a given zone and month.
    
    12 records per zone (one per month).
    """
    __tablename__ = "climate_baseline_monthly"
    
    id = Column(Integer, primary_key=True, index=True)
    zone_id = Column(Integer, ForeignKey("climate_zones.id"), nullable=False)
    month = Column(Integer, nullable=False)  # 1-12
    
    # Baseline values (1986-2005 average)
    tmean = Column(Numeric(6, 2), nullable=True)
    tmax = Column(Numeric(6, 2), nullable=True)
    tmin = Column(Numeric(6, 2), nullable=True)
    rain = Column(Numeric(8, 2), nullable=True)
    gdd = Column(Numeric(8, 2), nullable=True)

    # Max 1-day rainfall baseline (Rx1day, mm)
    rx1day_mean = Column(Numeric(8, 2), nullable=True)
    rx1day_sd = Column(Numeric(8, 2), nullable=True)

    # Frost days baseline (monthly normal count)
    frost_days_mean = Column(Numeric(6, 2), nullable=True)
    frost_days_sd = Column(Numeric(6, 2), nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=func.now())

    # Relationships
    zone = relationship("ClimateZone", back_populates="baseline")
    
    # Constraints
    __table_args__ = (
        UniqueConstraint('zone_id', 'month', name='uq_baseline_zone_month'),
    )
    
    def __repr__(self):
        return f"<ClimateBaselineMonthly(zone_id={self.zone_id}, month={self.month})>"


class ClimateProjection(Base):
    """
    Climate projections by SSP scenario and time period.
    
    SSP Scenarios:
    - SSP126: SSP1-2.6 (Sustainability - low emissions)
    - SSP245: SSP2-4.5 (Middle of the road)
    - SSP370: SSP3-7.0 (Regional rivalry - high emissions)
    
    Periods:
    - 2021_2040: Near-term
    - 2041_2060: Mid-century
    - 2080_2099: End of century
    
    Each record contains delta from baseline and projected absolute values.
    108 records per zone (3 SSP × 3 periods × 12 months).
    """
    __tablename__ = "climate_projections"
    
    id = Column(Integer, primary_key=True, index=True)
    zone_id = Column(Integer, ForeignKey("climate_zones.id"), nullable=False)
    
    # Scenario and period
    ssp = Column(String(10), nullable=False)  # 'SSP126', 'SSP245', 'SSP370'
    period = Column(String(20), nullable=False)  # '2021_2040', '2041_2060', '2080_2099'
    month = Column(Integer, nullable=False)  # 1-12
    
    # Temperature mean projections
    tmean_delta = Column(Numeric(6, 2), nullable=True)  # Change from baseline (°C)
    tmean_delta_sd = Column(Numeric(6, 2), nullable=True)  # Uncertainty
    tmean_projected = Column(Numeric(6, 2), nullable=True)  # Absolute projected value
    
    # Temperature max projections
    tmax_delta = Column(Numeric(6, 2), nullable=True)
    tmax_delta_sd = Column(Numeric(6, 2), nullable=True)
    tmax_projected = Column(Numeric(6, 2), nullable=True)
    
    # Temperature min projections
    tmin_delta = Column(Numeric(6, 2), nullable=True)
    tmin_delta_sd = Column(Numeric(6, 2), nullable=True)
    tmin_projected = Column(Numeric(6, 2), nullable=True)
    
    # Rainfall projections
    rain_delta = Column(Numeric(8, 2), nullable=True)  # Change in mm
    rain_delta_sd = Column(Numeric(8, 2), nullable=True)
    rain_projected = Column(Numeric(8, 2), nullable=True)
    
    # GDD projections (no delta columns in source, just baseline and projected)
    gdd_baseline = Column(Numeric(8, 2), nullable=True)
    gdd_projected = Column(Numeric(8, 2), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=func.now())
    
    # Relationships
    zone = relationship("ClimateZone", back_populates="projections")
    
    # Constraints and indexes
    __table_args__ = (
        UniqueConstraint('zone_id', 'ssp', 'period', 'month', name='uq_projection'),
        Index('idx_projections_zone_ssp', 'zone_id', 'ssp'),
        Index('idx_projections_zone_period', 'zone_id', 'period'),
    )
    
    def __repr__(self):
        return f"<ClimateProjection(zone_id={self.zone_id}, ssp='{self.ssp}', period='{self.period}', month={self.month})>"
    
    @property
    def ssp_name(self):
        """Human-readable SSP scenario name"""
        names = {
            'SSP126': 'SSP1-2.6 (Sustainability)',
            'SSP245': 'SSP2-4.5 (Middle of the road)',
            'SSP370': 'SSP3-7.0 (Regional rivalry)',
        }
        return names.get(self.ssp, self.ssp)
    
    @property
    def period_name(self):
        """Human-readable period name"""
        names = {
            '2021_2040': 'Near-term (2021-2040)',
            '2041_2060': 'Mid-century (2041-2060)',
            '2080_2099': 'End of century (2080-2099)',
        }
        return names.get(self.period, self.period)


class ClimateZoneSeasonStats(Base):
    """
    Per-season seasonal extreme metrics for each zone (1987-2024 modelled,
    plus 'observed' rows folded in from the live daily series as seasons complete).

    Definitions (ETCCDI-style): FD = Tmin < 0°C; spring frost = FD in Sep-Nov;
    last frost = last spring frost (Jul-Dec); TX30 = Tmax > 30; R99p = 99th
    percentile of wet-day (>=1mm) rainfall (mm). mean/sd are spatial across the
    zone's model grid (sd is null for live 'observed' rows — single IDW series).
    """
    __tablename__ = "climate_zone_season_stats"

    id = Column(BigInteger, primary_key=True, index=True)
    zone_id = Column(Integer, ForeignKey("climate_zones.id"), nullable=False)
    vintage_year = Column(Integer, nullable=False)  # Sep(y-1)-Apr(y) growing season

    # Frost
    last_frost_doy = Column(Numeric(6, 2), nullable=True)  # mean DOY of last spring frost
    last_frost_date = Column(String(10), nullable=True)    # e.g. '30-Sep'
    early_frost_mean = Column(Numeric(6, 2), nullable=True)  # spring (SON) frost count
    early_frost_sd = Column(Numeric(6, 2), nullable=True)
    frost_days_mean = Column(Numeric(6, 2), nullable=True)   # FD total
    frost_days_sd = Column(Numeric(6, 2), nullable=True)

    # Heat
    hot_days30_mean = Column(Numeric(6, 2), nullable=True)   # TX30
    hot_days30_sd = Column(Numeric(6, 2), nullable=True)

    # Extreme rainfall intensity
    r99p_mean = Column(Numeric(8, 2), nullable=True)
    r99p_sd = Column(Numeric(8, 2), nullable=True)

    # Provenance: 'modelled' (CSV 1987-2024) | 'observed' (live fold-in)
    source = Column(String(12), nullable=False, server_default='modelled')

    created_at = Column(DateTime, default=func.now())

    zone = relationship("ClimateZone", back_populates="season_stats")

    __table_args__ = (
        UniqueConstraint('zone_id', 'vintage_year', name='uq_season_stats_zone_vintage'),
        Index('idx_season_stats_zone_vintage', 'zone_id', 'vintage_year'),
    )

    def __repr__(self):
        return f"<ClimateZoneSeasonStats(zone_id={self.zone_id}, vintage_year={self.vintage_year}, source='{self.source}')>"


class ClimateZoneSeasonBaseline(Base):
    """
    Seasonal extreme baseline (the 1987-2006 'normal') for each zone — one row
    per zone. Comparison reference for history and live current-season cards.
    """
    __tablename__ = "climate_zone_season_baseline"

    id = Column(Integer, primary_key=True, index=True)
    zone_id = Column(Integer, ForeignKey("climate_zones.id"), nullable=False)
    baseline_period = Column(String(20), nullable=True)  # e.g. '1987-2006'

    last_frost_doy_mean = Column(Numeric(6, 2), nullable=True)
    last_frost_doy_sd = Column(Numeric(6, 2), nullable=True)
    last_frost_date = Column(String(10), nullable=True)
    early_frost_mean = Column(Numeric(6, 2), nullable=True)
    early_frost_sd = Column(Numeric(6, 2), nullable=True)
    frost_days_mean = Column(Numeric(6, 2), nullable=True)
    frost_days_sd = Column(Numeric(6, 2), nullable=True)
    hot_days30_mean = Column(Numeric(6, 2), nullable=True)
    hot_days30_sd = Column(Numeric(6, 2), nullable=True)
    r99p_mean = Column(Numeric(8, 2), nullable=True)
    r99p_sd = Column(Numeric(8, 2), nullable=True)

    created_at = Column(DateTime, default=func.now())

    zone = relationship("ClimateZone", back_populates="season_baseline")

    __table_args__ = (
        UniqueConstraint('zone_id', name='uq_season_baseline_zone'),
    )

    def __repr__(self):
        return f"<ClimateZoneSeasonBaseline(zone_id={self.zone_id}, period='{self.baseline_period}')>"


class ClimateProjectionExtremes(Base):
    """
    Projected seasonal extremes by SSP scenario and period (one row per
    zone/ssp/period). Holds baseline + delta + projected for frost days,
    spring frost, hot days (TX30) and R99p.
    """
    __tablename__ = "climate_projection_extremes"

    id = Column(Integer, primary_key=True, index=True)
    zone_id = Column(Integer, ForeignKey("climate_zones.id"), nullable=False)
    ssp = Column(String(10), nullable=False)      # 'SSP126', 'SSP245', 'SSP370'
    period = Column(String(20), nullable=False)   # '2021_2040', '2041_2060', '2080_2099'

    frost_days_baseline = Column(Numeric(8, 2), nullable=True)
    frost_days_delta = Column(Numeric(8, 2), nullable=True)
    frost_days_projected = Column(Numeric(8, 2), nullable=True)

    spring_frost_baseline = Column(Numeric(8, 2), nullable=True)
    spring_frost_delta = Column(Numeric(8, 2), nullable=True)
    spring_frost_projected = Column(Numeric(8, 2), nullable=True)

    hot_days30_baseline = Column(Numeric(8, 2), nullable=True)
    hot_days30_delta = Column(Numeric(8, 2), nullable=True)
    hot_days30_projected = Column(Numeric(8, 2), nullable=True)

    r99p_baseline = Column(Numeric(8, 2), nullable=True)
    r99p_delta = Column(Numeric(8, 2), nullable=True)
    r99p_projected = Column(Numeric(8, 2), nullable=True)

    created_at = Column(DateTime, default=func.now())

    zone = relationship("ClimateZone", back_populates="projection_extremes")

    __table_args__ = (
        UniqueConstraint('zone_id', 'ssp', 'period', name='uq_projection_extremes'),
        Index('idx_projection_extremes_zone', 'zone_id'),
    )

    def __repr__(self):
        return f"<ClimateProjectionExtremes(zone_id={self.zone_id}, ssp='{self.ssp}', period='{self.period}')>"