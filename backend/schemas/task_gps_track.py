# app/schemas/task_gps_track.py - Task GPS Tracking Schemas
from typing import Optional, List, Tuple
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field, field_validator, computed_field


class GPSPointBase(BaseModel):
    """Base schema for GPS points"""
    latitude: Decimal = Field(..., ge=-90, le=90, decimal_places=7)
    longitude: Decimal = Field(..., ge=-180, le=180, decimal_places=7)
    altitude: Optional[Decimal] = Field(None, decimal_places=2)
    accuracy: Optional[Decimal] = Field(None, ge=0, decimal_places=2)
    
    @field_validator('latitude', 'longitude')
    @classmethod
    def validate_decimal_precision(cls, v: Decimal) -> Decimal:
        """Ensure proper decimal precision for GPS coordinates"""
        if v is not None:
            return v.quantize(Decimal('0.0000001'))
        return v


class TaskGPSTrackCreate(GPSPointBase):
    """Schema for creating a GPS track point"""
    timestamp: datetime
    speed: Optional[Decimal] = Field(None, ge=0, decimal_places=2)  # km/h
    heading: Optional[Decimal] = Field(None, ge=0, le=360, decimal_places=2)  # degrees
    segment_id: int = Field(default=1, ge=1)
    device_id: Optional[str] = Field(None, max_length=100)
    
    @field_validator('heading')
    @classmethod
    def validate_heading(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        """Validate heading is between 0-360 degrees"""
        if v is not None and (v < 0 or v > 360):
            raise ValueError("Heading must be between 0 and 360 degrees")
        return v


class TaskGPSTrackBulkCreate(BaseModel):
    """Schema for bulk creating GPS points (batch upload)"""
    points: List[TaskGPSTrackCreate] = Field(..., min_length=1, max_length=1000)
    
    @field_validator('points')
    @classmethod
    def validate_chronological_order(cls, v: List[TaskGPSTrackCreate]) -> List[TaskGPSTrackCreate]:
        """Ensure points are in chronological order"""
        if len(v) > 1:
            for i in range(1, len(v)):
                if v[i].timestamp < v[i-1].timestamp:
                    raise ValueError("GPS points must be in chronological order")
        return v


class TaskGPSTrackResponse(GPSPointBase):
    """Schema for GPS track point responses"""
    id: int
    task_id: int
    user_id: int
    timestamp: datetime
    speed: Optional[Decimal] = None
    heading: Optional[Decimal] = None
    segment_id: int
    device_id: Optional[str] = None
    
    @computed_field
    @property
    def coordinates(self) -> Tuple[float, float]:
        """Get coordinates as tuple (lat, lng)"""
        return (float(self.latitude), float(self.longitude))
    
    class Config:
        from_attributes = True


class TaskGPSTrackSummary(BaseModel):
    """Lightweight GPS point info"""
    id: int
    latitude: Decimal
    longitude: Decimal
    timestamp: datetime
    speed: Optional[Decimal] = None
    segment_id: int
    
    class Config:
        from_attributes = True


class TaskGPSSegmentInfo(BaseModel):
    """Information about a GPS tracking segment"""
    segment_id: int
    start_time: datetime
    end_time: Optional[datetime] = None
    point_count: int
    duration_minutes: Optional[int] = None
    distance_meters: Optional[Decimal] = None
    avg_speed_kmh: Optional[Decimal] = None
    is_active: bool  # True if segment is currently recording


class TaskGPSTrackFilter(BaseModel):
    """Filter schema for GPS tracks"""
    task_id: Optional[int] = None
    user_id: Optional[int] = None
    segment_id: Optional[int] = None
    timestamp_from: Optional[datetime] = None
    timestamp_to: Optional[datetime] = None
    min_accuracy: Optional[Decimal] = None  # Filter out points with accuracy worse than this


class TaskGPSTrackStartRequest(BaseModel):
    """Schema for starting GPS tracking"""
    device_id: Optional[str] = Field(None, max_length=100)
    initial_point: Optional[TaskGPSTrackCreate] = None


class TaskGPSTrackPointRequest(BaseModel):
    """Schema for adding a single GPS point during tracking"""
    latitude: Decimal = Field(..., ge=-90, le=90)
    longitude: Decimal = Field(..., ge=-180, le=180)
    altitude: Optional[Decimal] = None
    accuracy: Optional[Decimal] = Field(None, ge=0)
    speed: Optional[Decimal] = Field(None, ge=0)
    heading: Optional[Decimal] = Field(None, ge=0, le=360)
    timestamp: Optional[datetime] = None  # If None, use server time


class TaskGPSTrackPauseRequest(BaseModel):
    """Schema for pausing GPS tracking"""
    final_point: Optional[TaskGPSTrackPointRequest] = None
    reason: Optional[str] = None


class TaskGPSTrackResumeRequest(BaseModel):
    """Schema for resuming GPS tracking"""
    initial_point: Optional[TaskGPSTrackPointRequest] = None


class TaskGPSTrackStopRequest(BaseModel):
    """Schema for stopping GPS tracking"""
    final_point: Optional[TaskGPSTrackPointRequest] = None


class TaskGPSTrackSummaryStats(BaseModel):
    """Summary statistics for a task's GPS track"""
    task_id: int
    total_points: int
    total_segments: int
    
    # Distance and coverage
    total_distance_meters: Decimal
    total_distance_km: Decimal
    area_covered_hectares: Optional[Decimal] = None
    
    # Time
    tracking_start_time: datetime
    tracking_end_time: Optional[datetime] = None
    total_tracking_duration_minutes: int
    active_tracking_duration_minutes: int  # Excluding pauses
    
    # Speed
    max_speed_kmh: Optional[Decimal] = None
    avg_speed_kmh: Optional[Decimal] = None
    min_speed_kmh: Optional[Decimal] = None
    
    # Quality
    avg_accuracy_meters: Optional[Decimal] = None
    points_with_poor_accuracy: int  # accuracy > 20m
    
    @computed_field
    @property
    def total_distance_miles(self) -> Decimal:
        """Convert distance to miles"""
        return self.total_distance_km * Decimal('0.621371')


class TaskGPSTrackGeometry(BaseModel):
    """GPS track as GeoJSON geometry"""
    task_id: int
    segment_id: Optional[int] = None  # If None, return all segments
    geometry: dict  # GeoJSON LineString or MultiLineString
    properties: dict  # Additional properties (timestamps, speeds, etc.)


class TaskGPSHeatmapData(BaseModel):
    """Data for generating GPS heatmap"""
    task_id: int
    points: List[dict]  # [{"lat": ..., "lng": ..., "weight": ...}]
    bounds: dict  # {"north": ..., "south": ..., "east": ..., "west": ...}


class TaskGPSSpeedProfile(BaseModel):
    """Speed profile over time"""
    task_id: int
    data_points: List[dict]  # [{"timestamp": ..., "speed_kmh": ..., "distance_km": ...}]
    
    # Statistics
    avg_working_speed: Decimal  # Average speed when moving
    time_stationary_minutes: int  # Time with speed < 1 km/h
    time_moving_minutes: int


class TaskGPSCoverageAnalysis(BaseModel):
    """Analysis of area coverage"""
    task_id: int
    planned_area_hectares: Optional[Decimal] = None
    covered_area_hectares: Decimal
    coverage_percentage: Optional[int] = Field(None, ge=0, le=100)
    
    # Overlap detection
    overlap_area_hectares: Decimal
    missed_area_hectares: Optional[Decimal] = None
    
    # Efficiency
    distance_per_hectare: Decimal  # Total distance / covered area
    passes_per_area: int  # Number of times same area was covered


class TaskGPSQualityReport(BaseModel):
    """Quality report for GPS tracking"""
    task_id: int
    total_points: int
    
    # Accuracy distribution
    excellent_accuracy_points: int  # < 5m
    good_accuracy_points: int  # 5-10m
    fair_accuracy_points: int  # 10-20m
    poor_accuracy_points: int  # > 20m
    
    # Data quality issues
    missing_timestamps: int
    missing_speed_data: int
    missing_heading_data: int
    suspicious_speed_readings: int  # > 50 km/h for vineyard work
    
    # Gaps in tracking
    tracking_gaps: List[dict]  # [{"start": ..., "end": ..., "duration_minutes": ...}]
    longest_gap_minutes: Optional[int] = None
    
    # Overall quality score
    quality_score: int = Field(ge=0, le=100)  # Composite score