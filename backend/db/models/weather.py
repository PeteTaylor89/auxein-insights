# db/models/models/weather.py
from sqlalchemy import Column, Integer, String, Numeric, Boolean, DateTime, Index, ForeignKey, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from geoalchemy2 import Geography
from db.base_class import Base

class WeatherStation(Base):
    __tablename__ = 'weather_stations'

    station_id = Column(Integer, primary_key=True, autoincrement=True)
    station_code = Column(String(100), unique=True, nullable=False)
    station_name = Column(String(255))
    data_source = Column(String(50), nullable=False)
    source_id = Column(String(200))
    latitude = Column(Numeric(10, 8))
    longitude = Column(Numeric(11, 8))
    elevation = Column(Integer)
    location = Column(Geography(geometry_type='POINT', srid=4326))
    region = Column(String(100))
    zone_id = Column(Integer, ForeignKey('climate_zones.id'), nullable=True)
    notes = Column(JSONB)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=text('NOW()'))
    updated_at = Column(DateTime(timezone=True), server_default=text('NOW()'))

    # Data Ingestion Platform (Phase 0.2) — generic device + company + geo fields.
    # Until the rename to `devices`, these live alongside the legacy columns.
    device_class = Column(String(50), nullable=False, server_default='weather_station')
    country_id = Column(Integer, ForeignKey('countries.id'), nullable=True)
    data_source_id = Column(Integer, ForeignKey('data_sources.id'), nullable=True)
    company_id = Column(Integer, ForeignKey('companies.id'), nullable=True)
    property_id = Column(Integer, ForeignKey('properties.id'), nullable=True)
    asset_id = Column(Integer, ForeignKey('assets.id'), nullable=True)
    api_credential_ref = Column(String(200), nullable=True)
    ingest_cadence_minutes = Column(Integer, nullable=False, server_default='360')
    visibility = Column(String(20), nullable=False, server_default='public')
    contributes_to_regional = Column(Boolean, nullable=False, server_default=text('true'))
    is_high_resolution = Column(Boolean, nullable=False, server_default=text('false'))
    timezone = Column(String(50), nullable=False, server_default='Pacific/Auckland')

    zone = relationship("ClimateZone", backref="weather_stations")
    country = relationship("Country", foreign_keys=[country_id])
    data_source_ref = relationship("DataSource", foreign_keys=[data_source_id])

class WeatherData(Base):
    __tablename__ = 'weather_data'
    
    station_id = Column(Integer, nullable=False, primary_key=True)
    timestamp = Column(DateTime(timezone=True), nullable=False, primary_key=True)
    variable = Column(String(50), nullable=False, primary_key=True)
    value = Column(Numeric(10, 4))
    unit = Column(String(20))
    quality = Column(String(20), default='GOOD')
    created_at = Column(DateTime(timezone=True), server_default=text('NOW()'))

    # Observation provenance (Phase B0 — two-tier provisional/authoritative).
    # source: SYNOP | GHCNH | GHCND | <legacy source code>.
    # quality_rank: 1=PROVISIONAL, 2=CONFIRMED, 3=AUTHORITATIVE (default).
    source = Column(String(20), nullable=True)
    quality_flags = Column(JSONB, nullable=True)
    quality_rank = Column(Integer, nullable=False, server_default=text('3'))

class IngestionLog(Base):
    __tablename__ = 'ingestion_log'
    
    log_id = Column(Integer, primary_key=True, autoincrement=True)
    data_source = Column(String(50), nullable=False)
    station_id = Column(Integer)
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True))
    records_processed = Column(Integer)
    records_inserted = Column(Integer)
    status = Column(String(20))
    error_msg = Column(String)
    logged_at = Column(DateTime(timezone=True), server_default=text('NOW()'))