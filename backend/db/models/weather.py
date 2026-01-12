# db/models/models/weather.py
from sqlalchemy import Column, Integer, String, Numeric, Boolean, DateTime, Index, text
from sqlalchemy.dialects.postgresql import JSONB
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
    notes = Column(JSONB)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=text('NOW()'))
    updated_at = Column(DateTime(timezone=True), server_default=text('NOW()'))

class WeatherData(Base):
    __tablename__ = 'weather_data'
    
    station_id = Column(Integer, nullable=False, primary_key=True)
    timestamp = Column(DateTime(timezone=True), nullable=False, primary_key=True)
    variable = Column(String(50), nullable=False, primary_key=True)
    value = Column(Numeric(10, 4))
    unit = Column(String(20))
    quality = Column(String(20), default='GOOD')
    created_at = Column(DateTime(timezone=True), server_default=text('NOW()'))

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