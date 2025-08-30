from typing import Optional, Dict, Any, List
from datetime import datetime
from pydantic import BaseModel, validator, model_validator
from enum import Enum
from geojson_pydantic import Point, Polygon

class RiskCategory(str, Enum):
    weather = "weather"
    pests_diseases = "pests_diseases"
    biosecurity = "biosecurity"
    equipment = "equipment"
    chemical = "chemical"
    personnel = "personnel"
    biological = "biological"
    fire = "fire"
    structural = "structural"
    environmental = "environmental"
    security = "security"
    other = "other"

class RiskType(str, Enum):
    health_safety = "health_safety"
    environmental = "environmental"
    production = "production"      # Field/vineyard specific risks
    operational = "operational"    # Winery and general operations
    financial = "financial"
    regulatory = "regulatory"
    reputational = "reputational"

class RiskStatus(str, Enum):
    active = "active"
    under_review = "under_review"
    closed = "closed"
    archived = "archived"

class RiskLevel(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"

class SiteRiskBase(BaseModel):
    risk_title: str
    risk_description: str
    risk_category: RiskCategory
    risk_type: RiskType
    # Removed block_id - risks are company-wide with their own locations
    
    # Location data
    location: Optional[Point] = None
    area: Optional[Polygon] = None
    location_description: Optional[str] = None
    
    # Inherent risk (required)
    inherent_likelihood: int
    inherent_severity: int
    
    # Risk management
    owner_id: Optional[int] = None
    review_frequency_days: Optional[int] = None
    
    # Additional details
    potential_consequences: Optional[str] = None
    existing_controls: Optional[str] = None
    regulatory_requirements: Optional[str] = None
    custom_fields: Optional[Dict[str, Any]] = None
    
    @validator("inherent_likelihood", "inherent_severity")
    def validate_risk_scores(cls, v):
        if not 1 <= v <= 5:
            raise ValueError("Risk likelihood and severity must be between 1 and 5")
        return v
    
    @validator("review_frequency_days")
    def validate_review_frequency(cls, v):
        if v is not None and v < 1:
            raise ValueError("Review frequency must be at least 1 day")
        return v

class SiteRiskCreate(SiteRiskBase):
    company_id: int

class SiteRiskUpdate(BaseModel):
    risk_title: Optional[str] = None
    risk_description: Optional[str] = None
    risk_category: Optional[RiskCategory] = None
    risk_type: Optional[RiskType] = None
    # Removed block_id - risks are company-wide with their own locations
    
    # Location updates
    location: Optional[Point] = None
    area: Optional[Polygon] = None
    location_description: Optional[str] = None
    
    # Risk assessment updates
    inherent_likelihood: Optional[int] = None
    inherent_severity: Optional[int] = None
    residual_likelihood: Optional[int] = None
    residual_severity: Optional[int] = None
    
    # Management updates
    status: Optional[RiskStatus] = None
    owner_id: Optional[int] = None
    review_frequency_days: Optional[int] = None
    
    # Detail updates
    potential_consequences: Optional[str] = None
    existing_controls: Optional[str] = None
    regulatory_requirements: Optional[str] = None
    custom_fields: Optional[Dict[str, Any]] = None
    
    @validator("inherent_likelihood", "inherent_severity", "residual_likelihood", "residual_severity")
    def validate_risk_scores(cls, v):
        if v is not None and not 1 <= v <= 5:
            raise ValueError("Risk likelihood and severity must be between 1 and 5")
        return v

class ResidualRiskUpdate(BaseModel):
    """Specific schema for updating residual risk after controls are implemented"""
    residual_likelihood: int
    residual_severity: int
    existing_controls: Optional[str] = None
    
    @validator("residual_likelihood", "residual_severity")
    def validate_risk_scores(cls, v):
        if not 1 <= v <= 5:
            raise ValueError("Risk likelihood and severity must be between 1 and 5")
        return v

class SiteRiskResponse(BaseModel):
    id: int
    company_id: int
    # Removed block_id - risks are company-wide with their own locations
    
    # Risk identification
    risk_title: str
    risk_description: str
    risk_category: RiskCategory
    risk_type: RiskType
    
    # Location data (converted from PostGIS)
    location: Optional[Dict[str, Any]] = None
    area: Optional[Dict[str, Any]] = None
    location_description: Optional[str] = None
    
    # Inherent risk
    inherent_likelihood: int
    inherent_severity: int
    inherent_risk_score: int
    inherent_risk_level: RiskLevel
    
    # Residual risk
    residual_likelihood: Optional[int] = None
    residual_severity: Optional[int] = None
    residual_risk_score: Optional[int] = None
    residual_risk_level: Optional[RiskLevel] = None
    
    # Management
    status: RiskStatus
    owner_id: Optional[int] = None
    created_by: int
    
    # Review tracking
    review_frequency_days: Optional[int] = None
    last_reviewed: Optional[datetime] = None
    next_review_due: Optional[datetime] = None
    
    # Additional details
    potential_consequences: Optional[str] = None
    existing_controls: Optional[str] = None
    regulatory_requirements: Optional[str] = None
    custom_fields: Dict[str, Any]
    
    # Computed properties
    has_residual_assessment: bool
    risk_reduced: bool
    is_high_risk: bool
    is_review_overdue: bool
    
    # Timestamps
    created_at: datetime
    updated_at: datetime
    archived_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True
    
    @model_validator(mode='before')
    @classmethod
    def convert_geometry_fields(cls, data):
        """Convert PostGIS geometry fields to GeoJSON"""
        if hasattr(data, '__dict__'):
            # Convert SQLAlchemy model to dict
            data_dict = {c.name: getattr(data, c.name) for c in data.__table__.columns}
            
            # Handle geometry conversions
            for geom_field in ['location', 'area']:
                if geom_field in data_dict and data_dict[geom_field] is not None:
                    try:
                        from geoalchemy2.shape import to_shape
                        from shapely.geometry import mapping
                        geom = to_shape(data_dict[geom_field])
                        data_dict[geom_field] = mapping(geom)
                    except Exception as e:
                        print(f"Error converting {geom_field}: {e}")
                        data_dict[geom_field] = None
            
            # Add computed properties from the model
            if hasattr(data, 'has_residual_assessment'):
                data_dict['has_residual_assessment'] = data.has_residual_assessment
                data_dict['risk_reduced'] = data.risk_reduced
                data_dict['is_high_risk'] = data.is_high_risk
                data_dict['is_review_overdue'] = data.is_review_overdue
            
            return data_dict
        return data

class SiteRiskSummary(BaseModel):
    """Lightweight risk info for lists and dashboards"""
    id: int
    risk_title: str
    risk_description: str
    risk_category: RiskCategory
    risk_type: RiskType
    inherent_risk_level: RiskLevel
    inherent_risk_score: int
    residual_risk_score: Optional [int]
    residual_risk_level: Optional[RiskLevel] = None
    status: RiskStatus
    potential_consequences: Optional[str] = None
    is_high_risk: bool
    is_review_overdue: bool
    created_at: datetime
    next_review_due: datetime
    
    class Config:
        from_attributes = True

class RiskMatrix(BaseModel):
    """Risk matrix configuration and data"""
    likelihood_scale: List[Dict[str, Any]] = [
        {"value": 1, "label": "Very Unlikely", "description": "Less than 1% chance"},
        {"value": 2, "label": "Unlikely", "description": "1-10% chance"},
        {"value": 3, "label": "Possible", "description": "10-50% chance"},
        {"value": 4, "label": "Likely", "description": "50-90% chance"},
        {"value": 5, "label": "Very Likely", "description": "Greater than 90% chance"}
    ]
    
    severity_scale: List[Dict[str, Any]] = [
        {"value": 1, "label": "Minimal", "description": "Minor inconvenience"},
        {"value": 2, "label": "Minor", "description": "Some impact, easily managed"},
        {"value": 3, "label": "Moderate", "description": "Significant impact, manageable"},
        {"value": 4, "label": "Major", "description": "Severe impact, difficult to manage"},
        {"value": 5, "label": "Catastrophic", "description": "Extreme impact, very difficult to recover"}
    ]
    
    risk_levels: Dict[str, Dict[str, Any]] = {
        "low": {"label": "Low", "color": "#22c55e", "score_range": [1, 4]},
        "medium": {"label": "Medium", "color": "#f59e0b", "score_range": [5, 9]},
        "high": {"label": "High", "color": "#ef4444", "score_range": [10, 16]},
        "critical": {"label": "Critical", "color": "#991b1b", "score_range": [17, 25]}
    }

class RiskAssessment(BaseModel):
    """Schema for conducting risk assessments"""
    risk_id: int
    assessment_type: str  # "inherent" or "residual"
    likelihood: int
    severity: int
    assessment_notes: Optional[str] = None
    assessor_id: int
    
    @validator("likelihood", "severity")
    def validate_scores(cls, v):
        if not 1 <= v <= 5:
            raise ValueError("Scores must be between 1 and 5")
        return v
    
    @validator("assessment_type")
    def validate_assessment_type(cls, v):
        if v not in ["inherent", "residual"]:
            raise ValueError("Assessment type must be 'inherent' or 'residual'")
        return v

class RiskReviewRequest(BaseModel):
    """Schema for requesting risk reviews"""
    risk_ids: List[int]
    reviewer_id: int
    review_notes: Optional[str] = None
    due_date: Optional[datetime] = None