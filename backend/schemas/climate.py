# schemas/climate.py
from typing import Optional, List, Dict, Any
from datetime import date, datetime
from pydantic import BaseModel, validator
from enum import Enum

class DataQuality(str, Enum):
    interpolated = "interpolated"
    measured = "measured"
    estimated = "estimated"

class ClimateHistoricalBase(BaseModel):
    vineyard_block_id: int
    date: date
    temperature_mean: Optional[float] = None
    temperature_min: Optional[float] = None
    temperature_max: Optional[float] = None
    rainfall_amount: Optional[float] = None
    solar_radiation: Optional[float] = None
    humidity: Optional[float] = None
    wind_speed: Optional[float] = None
    data_quality: DataQuality = DataQuality.interpolated

    class Config:
        from_attributes = True

class ClimateHistoricalCreate(ClimateHistoricalBase):
    """Schema for creating climate data records"""
    pass

class ClimateHistoricalBulkCreate(BaseModel):
    """Schema for bulk importing climate data"""
    records: List[ClimateHistoricalCreate]
    
    @validator('records')
    def validate_records_not_empty(cls, v):
        if not v:
            raise ValueError('Records list cannot be empty')
        return v

class ClimateHistoricalUpdate(BaseModel):
    """Schema for updating climate data"""
    temperature_mean: Optional[float] = None
    temperature_min: Optional[float] = None
    temperature_max: Optional[float] = None
    rainfall_amount: Optional[float] = None
    solar_radiation: Optional[float] = None
    humidity: Optional[float] = None
    wind_speed: Optional[float] = None
    data_quality: Optional[DataQuality] = None

class ClimateHistorical(ClimateHistoricalBase):
    """Full climate data record with metadata"""
    id: int
    created_at: datetime
    updated_at: datetime

class ClimateHistoricalSummary(BaseModel):
    """Aggregated climate data for charts/analysis"""
    period: str  # 'daily', 'weekly', 'monthly', 'yearly'
    date_start: date
    date_end: date
    temperature_mean_avg: Optional[float] = None
    temperature_min_avg: Optional[float] = None
    temperature_max_avg: Optional[float] = None
    temperature_mean_min: Optional[float] = None
    temperature_mean_max: Optional[float] = None
    rainfall_total: Optional[float] = None
    rainfall_avg: Optional[float] = None
    solar_radiation_total: Optional[float] = None
    solar_radiation_avg: Optional[float] = None
    record_count: int

class ClimateQuery(BaseModel):
    """Query parameters for climate data requests"""
    vineyard_block_id: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    variables: Optional[List[str]] = None  # ['temperature', 'rainfall', 'solar']
    aggregation: Optional[str] = 'daily'  # 'daily', 'weekly', 'monthly', 'yearly'
    limit: Optional[int] = 1000
    
    @validator('variables')
    def validate_variables(cls, v):
        if v:
            allowed = ['temperature_mean', 'temperature_min', 'temperature_max', 
                      'rainfall_amount', 'solar_radiation', 'humidity', 'wind_speed']
            invalid = [var for var in v if var not in allowed]
            if invalid:
                raise ValueError(f'Invalid variables: {invalid}')
        return v
    
    @validator('aggregation')
    def validate_aggregation(cls, v):
        if v not in ['daily', 'weekly', 'monthly', 'yearly']:
            raise ValueError('Aggregation must be daily, weekly, monthly, or yearly')
        return v

class ClimateStats(BaseModel):
    """Climate statistics for a vineyard block"""
    vineyard_block_id: int
    total_records: int
    date_range_start: Optional[date] = None
    date_range_end: Optional[date] = None
    years_of_data: int
    temperature_stats: Dict[str, float]  # min, max, avg for mean/min/max temps
    rainfall_stats: Dict[str, float]     # total, avg, max daily
    solar_radiation_stats: Dict[str, float]  # total, avg, max daily
    data_quality_breakdown: Dict[str, int]  # count by quality type

class CSVImportResult(BaseModel):
    """Result of CSV import operation"""
    success: bool
    records_processed: int
    records_imported: int
    records_skipped: int
    errors: List[str]
    vineyard_block_id: Optional[int] = None