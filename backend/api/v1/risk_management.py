"""
Risk Management API Router
Integrates with existing vineyard management system
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
import logging

# Your existing imports

from db.models.user import User
from api.deps import get_db, get_current_user

# New risk management imports
from db.models.site_risk import SiteRisk
from db.models.risk_action import RiskAction
from db.models.incident import Incident

from schemas.site_risk import (
    SiteRiskCreate, SiteRiskUpdate, SiteRiskResponse, SiteRiskSummary,
    ResidualRiskUpdate, RiskMatrix, RiskAssessment
)
from schemas.risk_action import (
    RiskActionCreate, RiskActionUpdate, RiskActionResponse, RiskActionSummary,
    ActionProgressUpdate, ActionCompletion, ActionVerification, ActionMetrics
)
from schemas.incident import (
    IncidentCreate, IncidentUpdate, IncidentResponse, IncidentSummary,
    IncidentInvestigation, WorkSafeNotification, IncidentClosure, IncidentMetrics
)

from services.risk_action_service import RiskActionService
from services.risk_logic import RiskBusinessLogic
from services.integrated_risk_service import IntegratedRiskService
from utils.risk_permissions import RiskPermissions

# Create the main router
router = APIRouter()
logger = logging.getLogger(__name__)

def geojson_to_wkt(geojson_dict):
    """Convert GeoJSON-like dict to WKT string for PostGIS"""
    if not geojson_dict:
        return None
    
    if geojson_dict['type'] == 'Point':
        coords = geojson_dict['coordinates']
        return f"POINT({coords[0]} {coords[1]})"
    elif geojson_dict['type'] == 'Polygon':
        coords = geojson_dict['coordinates'][0]  # First ring
        coord_pairs = ' '.join([f"{coord[0]} {coord[1]}" for coord in coords])
        return f"POLYGON(({coord_pairs}))"
    
    return None

# ===== SITE RISKS ENDPOINTS =====

@router.get("/risk-management/risks/", response_model=List[SiteRiskSummary])
def get_company_risks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, le=100),
    risk_type: Optional[str] = Query(None),
    risk_level: Optional[str] = Query(None),
    status: Optional[str] = Query(None)
):
    """Get all risks for the current user's company"""
    query = db.query(SiteRisk).filter(SiteRisk.company_id == current_user.company_id)
    
    if risk_type:
        query = query.filter(SiteRisk.risk_type == risk_type)
    if risk_level:
        query = query.filter(SiteRisk.inherent_risk_level == risk_level)
    if status:
        query = query.filter(SiteRisk.status == status)
    
    risks = query.order_by(SiteRisk.inherent_risk_score.desc()).offset(skip).limit(limit).all()
    return risks

@router.post("/risk-management/risks/", response_model=SiteRiskResponse)
def create_risk(
    risk_data: SiteRiskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new site risk"""
    if not RiskPermissions.can_create_risk(current_user):
        raise HTTPException(status_code=403, detail="Insufficient permissions to create risks")
    
    try:
        # Prepare risk data
        risk_dict = risk_data.dict()
        
        # Convert location data from dict to WKT if present
        if risk_dict.get('location') and isinstance(risk_dict['location'], dict):
            risk_dict['location'] = geojson_to_wkt(risk_dict['location'])
        
        if risk_dict.get('area') and isinstance(risk_dict['area'], dict):
            risk_dict['area'] = geojson_to_wkt(risk_dict['area'])
        
        # Set required fields that come from the current user/session
        risk_dict["company_id"] = current_user.company_id
        risk_dict["created_by"] = current_user.id
        
        # Ensure custom_fields is always a dictionary, never None
        risk_dict["custom_fields"] = risk_dict.get("custom_fields") or {}
        
        # Calculate inherent risk before creating the object
        inherent_score = risk_data.inherent_likelihood * risk_data.inherent_severity
        if inherent_score <= 4:
            inherent_level = "low"
        elif inherent_score <= 9:
            inherent_level = "medium"
        elif inherent_score <= 16:
            inherent_level = "high"
        else:
            inherent_level = "critical"
        
        risk_dict["inherent_risk_score"] = inherent_score
        risk_dict["inherent_risk_level"] = inherent_level
        
        # Create the risk object
        risk = SiteRisk(**risk_dict)
        
        # Set the next review date
        risk.set_next_review_date()
        
        # Save to database
        db.add(risk)
        db.commit()
        db.refresh(risk)
        
        # CRITICAL: Ensure custom_fields is not None before returning
        if risk.custom_fields is None:
            risk.custom_fields = {}
            db.commit()
            db.refresh(risk)
        
        return risk
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating risk: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Error creating risk: {str(e)}")

@router.get("/risk-management/risks/{risk_id}", response_model=SiteRiskResponse)
def get_risk(
    risk_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific risk"""
    risk = db.query(SiteRisk).filter(
        SiteRisk.id == risk_id,
        SiteRisk.company_id == current_user.company_id
    ).first()
    
    if not risk:
        raise HTTPException(status_code=404, detail="Risk not found")
    
    # CRITICAL: Debug and fix None values
    print(f" Before fix - custom_fields: {risk.custom_fields}")
    print(f"Before fix - custom_fields type: {type(risk.custom_fields)}")
    
    # Ensure custom_fields is not None before returning
    if risk.custom_fields is None:
        print("Found None custom_fields, fixing...")
        risk.custom_fields = {}
        db.commit()
        db.refresh(risk)
        print(f"After fix - custom_fields: {risk.custom_fields}")
    
    # Also check other potentially problematic fields
    if not hasattr(risk, 'tags') or risk.tags is None:
        risk.tags = []
    
    print(f"Final custom_fields before return: {risk.custom_fields}")
    print(f"Final custom_fields type: {type(risk.custom_fields)}")
    
    return risk

@router.put("/risk-management/risks/{risk_id}", response_model=SiteRiskResponse)
def update_risk(
    risk_id: int,
    risk_data: SiteRiskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a risk"""
    risk = db.query(SiteRisk).filter(
        SiteRisk.id == risk_id,
        SiteRisk.company_id == current_user.company_id
    ).first()
    
    if not risk:
        raise HTTPException(status_code=404, detail="Risk not found")
    
    if not RiskPermissions.can_modify_risk(current_user, risk):
        raise HTTPException(status_code=403, detail="Insufficient permissions to modify this risk")
    
    # Update fields
    update_data = risk_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(risk, field, value)
    
    # Recalculate risk scores if likelihood/severity changed
    if "inherent_likelihood" in update_data or "inherent_severity" in update_data:
        risk.update_inherent_risk(risk.inherent_likelihood, risk.inherent_severity)
    
    if "residual_likelihood" in update_data or "residual_severity" in update_data:
        risk.update_residual_risk(risk.residual_likelihood, risk.residual_severity)
    
    db.commit()
    db.refresh(risk)
    return risk

@router.put("/risk-management/risks/{risk_id}/residual", response_model=SiteRiskResponse)
def update_residual_risk(
    risk_id: int,
    residual_data: ResidualRiskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update residual risk assessment (with validation)"""
    risk = db.query(SiteRisk).filter(
        SiteRisk.id == risk_id,
        SiteRisk.company_id == current_user.company_id
    ).first()
    
    if not risk:
        raise HTTPException(status_code=404, detail="Risk not found")
    
    if not RiskPermissions.can_modify_risk(current_user, risk):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    # Validate residual risk reduction
    risk_logic = RiskBusinessLogic(db)
    is_valid, message, required_actions = risk_logic.validate_residual_risk_reduction(
        risk, residual_data.residual_likelihood, residual_data.residual_severity
    )
    
    if not is_valid:
        raise HTTPException(
            status_code=400, 
            detail={
                "message": message,
                "required_actions": required_actions
            }
        )
    
    # Update residual risk
    risk.update_residual_risk(residual_data.residual_likelihood, residual_data.residual_severity)
    if residual_data.existing_controls:
        risk.existing_controls = residual_data.existing_controls
    
    db.commit()
    db.refresh(risk)
    return risk

@router.delete("/risk-management/risks/{risk_id}")
def delete_risk(
    risk_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a risk"""
    risk = db.query(SiteRisk).filter(
        SiteRisk.id == risk_id,
        SiteRisk.company_id == current_user.company_id
    ).first()
    
    if not risk:
        raise HTTPException(status_code=404, detail="Risk not found")
    
    if not RiskPermissions.can_delete_risk(current_user, risk):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    db.delete(risk)
    db.commit()
    return {"message": "Risk deleted successfully"}

@router.get("/risk-management/risks/matrix", response_model=RiskMatrix)
def get_risk_matrix():
    """Get risk matrix configuration"""
    return RiskMatrix()

# ===== RISK ACTIONS ENDPOINTS =====

@router.get("/risk-management/actions/", response_model=List[RiskActionSummary])
def get_risk_actions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    risk_id: Optional[int] = Query(None),
    assigned_to_me: bool = Query(False),
    status: Optional[str] = Query(None),
    overdue_only: bool = Query(False)
):
    """Get risk actions"""
    query = db.query(RiskAction).filter(RiskAction.company_id == current_user.company_id)
    
    if risk_id:
        query = query.filter(RiskAction.risk_id == risk_id)
    if assigned_to_me:
        query = query.filter(RiskAction.assigned_to == current_user.id)
    if status:
        query = query.filter(RiskAction.status == status)
    if overdue_only:
        from datetime import datetime, timezone
        query = query.filter(
            RiskAction.target_completion_date < datetime.now(timezone.utc),
            RiskAction.status.notin_(["completed", "cancelled"])
        )
    
    actions = query.order_by(RiskAction.priority.desc(), RiskAction.created_at.desc()).all()
    return actions

@router.get("/risk-management/actions/{action_id}/history")
def get_action_history(
    action_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get complete history of a recurring action series"""
    
    # Get the action to find the parent
    action = db.query(RiskAction).filter(
        RiskAction.id == action_id,
        RiskAction.company_id == current_user.company_id
    ).first()
    
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    
    # Find the root parent action
    parent_id = action.parent_action_id or action.id
    
    # Get all actions in the series
    history = db.query(RiskAction).filter(
        or_(
            RiskAction.id == parent_id,
            RiskAction.parent_action_id == parent_id
        ),
        RiskAction.company_id == current_user.company_id
    ).order_by(RiskAction.created_at.desc()).all()
    
    return history

@router.get("/risk-management/actions/{action_id}/children")  
def get_child_actions(
    action_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get child actions of a parent recurring action"""
    
    children = db.query(RiskAction).filter(
        RiskAction.parent_action_id == action_id,
        RiskAction.company_id == current_user.company_id
    ).order_by(RiskAction.created_at.desc()).all()
    
    return children

@router.post("/risk-management/actions/{action_id}/create-next")
def create_next_recurring_instance(
    action_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create the next instance of a recurring action"""
    
    parent_action = db.query(RiskAction).filter(
        RiskAction.id == action_id,
        RiskAction.company_id == current_user.company_id
    ).first()
    
    if not parent_action:
        raise HTTPException(status_code=404, detail="Action not found")
    
    if not parent_action.is_recurring:
        raise HTTPException(status_code=400, detail="Action is not recurring")
    
    # Create new instance
    new_action = parent_action.create_recurring_action()
    if new_action:
        new_action.company_id = current_user.company_id
        db.add(new_action)
        db.commit()
        db.refresh(new_action)
        return new_action
    else:
        raise HTTPException(status_code=400, detail="Failed to create recurring instance")


@router.post("/risk-management/actions/", response_model=RiskActionResponse)
def create_risk_action(
    action_data: RiskActionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new risk action"""
    try:
        # Use the service to create the action
        service = RiskActionService(db)
        
        # Prepare action data
        action_dict = action_data.dict()
        
        # Set required fields from context
        action_dict["company_id"] = current_user.company_id
        action_dict["created_by"] = current_user.id
        
        # Ensure fields that should be lists/dicts are never None
        if "custom_fields" not in action_dict or action_dict["custom_fields"] is None:
            action_dict["custom_fields"] = {}
        
        if "tags" not in action_dict or action_dict["tags"] is None:
            action_dict["tags"] = []
        
        # Create the action
        action = service.create_risk_action(action_dict, current_user)
        
        # CRITICAL: Ensure response fields are not None before returning
        if action.custom_fields is None:
            action.custom_fields = {}
        
        if action.tags is None:
            action.tags = []
        
        # Commit any changes to fix None values
        db.commit()
        db.refresh(action)
        
        return action
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating action: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Error creating action: {str(e)}")

@router.put("/risk-management/actions/{action_id}", response_model=RiskActionResponse)
def update_risk_action(
    action_id: int,
    action_data: RiskActionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a risk action"""
    service = RiskActionService(db)
    action = service.update_risk_action(action_id, action_data.dict(exclude_unset=True), current_user)
    return action

@router.put("/risk-management/actions/{action_id}/progress", response_model=RiskActionResponse)
def update_action_progress(
    action_id: int,
    progress_data: ActionProgressUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update action progress"""
    service = RiskActionService(db)
    action = service.update_risk_action(
        action_id, 
        {
            "progress_percentage": progress_data.progress_percentage,
            "completion_notes": progress_data.notes
        }, 
        current_user
    )
    return action

@router.post("/risk-management/actions/{action_id}/complete", response_model=RiskActionResponse)
def complete_action(
    action_id: int,
    completion_data: ActionCompletion,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Mark action as completed"""
    service = RiskActionService(db)
    action = service.complete_action(action_id, completion_data.dict(), current_user)
    return action

@router.post("/risk-management/actions/{action_id}/verify", response_model=RiskActionResponse)
def verify_action(
    action_id: int,
    verification_data: ActionVerification,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Verify completed action"""
    service = RiskActionService(db)
    action = service.verify_action(action_id, verification_data.dict(), current_user)
    return action

@router.get("/risk-management/actions/metrics", response_model=ActionMetrics)
def get_action_metrics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    days: int = Query(30, ge=1, le=365)
):
    """Get action performance metrics"""
    service = RiskActionService(db)
    metrics = service.get_action_metrics(current_user.company_id, days)
    return ActionMetrics(**metrics)

@router.get("/risk-management/actions/{action_id}", response_model=RiskActionResponse)
def get_action_by_id(
    action_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific action"""
    action = db.query(RiskAction).filter(
        RiskAction.id == action_id,
        RiskAction.company_id == current_user.company_id
    ).first()
    
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    
    # Ensure custom_fields is not None before returning
    if action.custom_fields is None:
        action.custom_fields = {}
        db.commit()
        db.refresh(action)
    
    # Ensure tags is not None
    if action.tags is None:
        action.tags = []
        db.commit()
        db.refresh(action)
    
    return action
    
# ===== INCIDENT REGISTER ENDPOINTS =====

@router.get("/risk-management/incidents/", response_model=List[IncidentSummary])
def get_incidents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, le=100),
    incident_type: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    notifiable_only: bool = Query(False)
):
    """Get incidents for the company"""
    query = db.query(Incident).filter(Incident.company_id == current_user.company_id)
    
    if incident_type:
        query = query.filter(Incident.incident_type == incident_type)
    if severity:
        query = query.filter(Incident.severity == severity)
    if status:
        query = query.filter(Incident.status == status)
    if notifiable_only:
        query = query.filter(Incident.is_notifiable == True)
    
    incidents = query.order_by(Incident.incident_date.desc()).offset(skip).limit(limit).all()
    return incidents

@router.post("/risk-management/incidents/", response_model=IncidentResponse)
def create_incident(
    incident_data: IncidentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new incident"""
    try:
        # Prepare incident data
        incident_dict = incident_data.dict()
        
        # CRITICAL FIX: Convert enum values to strings
        if 'incident_type' in incident_dict and hasattr(incident_dict['incident_type'], 'value'):
            incident_dict['incident_type'] = incident_dict['incident_type'].value
        if 'severity' in incident_dict and hasattr(incident_dict['severity'], 'value'):
            incident_dict['severity'] = incident_dict['severity'].value
        if 'category' in incident_dict and hasattr(incident_dict['category'], 'value'):
            incident_dict['category'] = incident_dict['category'].value
        
        # CRITICAL FIX: Handle location data conversion
        if incident_dict.get('location') and isinstance(incident_dict['location'], dict):
            location_dict = incident_dict['location']
            if location_dict.get('type') == 'Point' and 'coordinates' in location_dict:
                # Convert GeoJSON Point to WKT for PostGIS
                coords = location_dict['coordinates']
                incident_dict['location'] = f"SRID=4326;POINT({coords[0]} {coords[1]})"
            else:
                incident_dict['location'] = None
        else:
            incident_dict['location'] = None
        
        # CRITICAL FIX: Handle JSON fields - ensure they are proper Python objects, not strings
        json_fields = ['immediate_causes', 'root_causes', 'contributing_factors', 'custom_fields', 'tags']
        for field in json_fields:
            if field in incident_dict:
                if isinstance(incident_dict[field], str):
                    try:
                        if incident_dict[field] in ['null', 'None', '']:
                            incident_dict[field] = [] if field in ['immediate_causes', 'root_causes', 'contributing_factors', 'tags'] else {}
                        elif incident_dict[field] == '[]':
                            incident_dict[field] = []
                        elif incident_dict[field] == '{}':
                            incident_dict[field] = {}
                        else:
                            import json
                            incident_dict[field] = json.loads(incident_dict[field])
                    except (json.JSONDecodeError, ValueError):
                        incident_dict[field] = [] if field in ['immediate_causes', 'root_causes', 'contributing_factors', 'tags'] else {}
                elif incident_dict[field] is None:
                    incident_dict[field] = [] if field in ['immediate_causes', 'root_causes', 'contributing_factors', 'tags'] else {}
        
        # Set required fields that come from the current user/session
        incident_dict["reported_by"] = current_user.id
        
        # CRITICAL FIX: Generate incident number BEFORE creating the object
        # First, get the next sequence number for this year
        from datetime import datetime
        current_year = datetime.now().year
        
        # Get the highest incident number for this year and company
        max_incident = db.query(Incident).filter(
            Incident.company_id == current_user.company_id,
            Incident.incident_number.like(f"INC-{current_year}-%")
        ).order_by(Incident.incident_number.desc()).first()
        
        if max_incident and max_incident.incident_number:
            # Extract the sequence number from the last incident
            try:
                parts = max_incident.incident_number.split('-')
                if len(parts) >= 3:
                    last_seq = int(parts[2])
                    next_seq = last_seq + 1
                else:
                    next_seq = 1
            except (ValueError, IndexError):
                next_seq = 1
        else:
            next_seq = 1
        
        # Generate the incident number
        incident_number = f"INC-{current_year}-{current_user.company_id}-{next_seq:04d}"
        incident_dict["incident_number"] = incident_number
        
        # Create the incident object with the incident number already set
        incident = Incident(**incident_dict)
        
        # Determine if notifiable and set investigation dates
        incident.determine_notifiability()
        incident.set_investigation_due_date()
        
        # Save to database (no need for flush/refresh since incident_number is already set)
        db.add(incident)
        db.commit()
        db.refresh(incident)
        
        return incident
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating incident: {str(e)}")
        logger.error(f"Incident data: {incident_dict}")
        raise HTTPException(status_code=400, detail=f"Error creating incident: {str(e)}")

@router.get("/risk-management/incidents/{incident_id}", response_model=IncidentResponse)
def get_incident(
    incident_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific incident"""
    incident = db.query(Incident).filter(
        Incident.id == incident_id,
        Incident.company_id == current_user.company_id
    ).first()
    
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    return incident

# ===== INTEGRATED DASHBOARD ENDPOINTS =====

@router.get("/risk-management/dashboard")
def get_risk_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get comprehensive risk management dashboard"""
    service = IntegratedRiskService(db)
    dashboard_data = service.get_company_risk_dashboard(current_user.company_id)
    return dashboard_data

@router.get("/risk-management/overdue")
def get_overdue_items(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all overdue items requiring attention"""
    service = IntegratedRiskService(db)
    overdue_data = service.get_overdue_items(current_user.company_id)
    return overdue_data

@router.get("/risk-management/my-assignments")
def get_my_assignments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all items assigned to current user"""
    service = IntegratedRiskService(db)
    assignments = service.get_user_assigned_items(current_user.id)
    return assignments

@router.get("/risk-management/health-check")
def perform_health_check(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Perform risk management system health check"""
    service = IntegratedRiskService(db)
    health_check = service.perform_risk_health_check(current_user.company_id)
    return health_check

@router.get("/risk-management/reports/{report_type}")
def generate_risk_report(
    report_type: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Generate risk management report (weekly/monthly/quarterly/yearly)"""
    if report_type not in ["weekly", "monthly", "quarterly", "yearly"]:
        raise HTTPException(status_code=400, detail="Invalid report type. Must be one of: weekly, monthly, quarterly, yearly")
    
    service = IntegratedRiskService(db)
    report = service.generate_risk_report(current_user.company_id, report_type)
    return report

# ===== INTEGRATION ENDPOINTS =====

@router.post("/risk-management/incidents/{incident_id}/create-risk")
def create_risk_from_incident(
    incident_id: int,
    risk_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new risk based on an incident"""
    
    # Check permissions
    if not RiskPermissions.can_create_risk(current_user):
        raise HTTPException(status_code=403, detail="Insufficient permissions to create risks")
    
    # Get the incident
    incident = db.query(Incident).filter(
        Incident.id == incident_id,
        Incident.company_id == current_user.company_id
    ).first()
    
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    # Create risk from incident
    service = IntegratedRiskService(db)
    risk = service.create_risk_from_incident(incident, risk_data, current_user)
    
    return {
        "message": "Risk created successfully from incident",
        "risk_id": risk.id,
        "incident_id": incident_id,
        "risk_title": risk.risk_title
    }

# ===== UTILITY ENDPOINTS =====

@router.get("/risk-management/config")
def get_risk_config():
    """Get risk management configuration data"""
    from schemas.site_risk import RiskMatrix
    from schemas.risk_action import (
        ACTION_TYPE_DESCRIPTIONS, CONTROL_TYPE_DESCRIPTIONS, PRIORITY_URGENCY_MATRIX
    )
    from schemas.incident import NZ_INJURY_TYPES, BODY_PARTS, IMMEDIATE_CAUSES, ROOT_CAUSES
    
    return {
        "risk_matrix": RiskMatrix().dict(),
        "action_types": ACTION_TYPE_DESCRIPTIONS,
        "control_types": CONTROL_TYPE_DESCRIPTIONS,
        "priority_matrix": PRIORITY_URGENCY_MATRIX,
        "incident_config": {
            "injury_types": NZ_INJURY_TYPES,
            "body_parts": BODY_PARTS,
            "immediate_causes": IMMEDIATE_CAUSES,
            "root_causes": ROOT_CAUSES
        }
    }

@router.get("/risk-management/permissions")
def get_user_permissions(
    current_user: User = Depends(get_current_user)
):
    """Get current user's risk management permissions"""
    from utils.risk_permissions import RiskPermissions, RISK_PERMISSIONS
    
    user_permissions = {}
    
    for permission, allowed_roles in RISK_PERMISSIONS.items():
        user_permissions[permission.lower()] = current_user.role in allowed_roles
    
    return {
        "user_role": current_user.role,
        "permissions": user_permissions,
        "can_create_risk": RiskPermissions.can_create_risk(current_user),
        "can_create_actions": RiskPermissions.can_create_risk_action(current_user),
        "can_complete_actions": RiskPermissions.can_complete_risk_action(current_user, current_user.company_id),
        "can_manage_settings": RiskPermissions.can_manage_risk_settings(current_user)
    }

# ===== ENHANCED INCIDENT ENDPOINTS =====

@router.put("/risk-management/incidents/{incident_id}", response_model=IncidentResponse)
def update_incident_enhanced(
    incident_id: int,
    incident_data: IncidentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Enhanced incident update with proper data handling"""
    incident = db.query(Incident).filter(
        Incident.id == incident_id,
        Incident.company_id == current_user.company_id
    ).first()
    
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    try:
        # Get update data and exclude unset fields
        update_data = incident_data.dict(exclude_unset=True)
        
        # Handle enum fields - convert to strings if they're enum objects
        enum_fields = ['incident_type', 'severity', 'category', 'investigation_status', 'status']
        for field in enum_fields:
            if field in update_data and hasattr(update_data[field], 'value'):
                update_data[field] = update_data[field].value
        
        # Handle date fields - convert to proper datetime objects
        date_fields = ['incident_date', 'discovered_date', 'investigation_due_date', 
                      'investigation_completed_date', 'reviewed_date', 'approved_date']
        for field in date_fields:
            if field in update_data and update_data[field]:
                if isinstance(update_data[field], str):
                    update_data[field] = datetime.fromisoformat(update_data[field].replace('Z', '+00:00'))
        
        # Handle numeric fields
        if 'estimated_time_off_days' in update_data and update_data['estimated_time_off_days']:
            update_data['estimated_time_off_days'] = int(update_data['estimated_time_off_days'])
        
        if 'property_damage_cost' in update_data and update_data['property_damage_cost']:
            update_data['property_damage_cost'] = float(update_data['property_damage_cost'])
        
        if 'related_risk_id' in update_data and update_data['related_risk_id']:
            update_data['related_risk_id'] = int(update_data['related_risk_id'])
        
        # Handle location data if present
        if 'location' in update_data and update_data['location']:
            if isinstance(update_data['location'], dict):
                location_dict = update_data['location']
                if location_dict.get('type') == 'Point' and 'coordinates' in location_dict:
                    coords = location_dict['coordinates']
                    update_data['location'] = f"SRID=4326;POINT({coords[0]} {coords[1]})"
                else:
                    update_data['location'] = None
        
        # Handle JSON fields - ensure they are proper Python objects
        json_fields = ['immediate_causes', 'root_causes', 'contributing_factors', 'custom_fields', 'tags']
        for field in json_fields:
            if field in update_data:
                if isinstance(update_data[field], str):
                    try:
                        import json
                        if update_data[field] in ['null', 'None', '']:
                            update_data[field] = [] if field in ['immediate_causes', 'root_causes', 'contributing_factors', 'tags'] else {}
                        elif update_data[field] == '[]':
                            update_data[field] = []
                        elif update_data[field] == '{}':
                            update_data[field] = {}
                        else:
                            update_data[field] = json.loads(update_data[field])
                    except (json.JSONDecodeError, ValueError):
                        update_data[field] = [] if field in ['immediate_causes', 'root_causes', 'contributing_factors', 'tags'] else {}
                elif update_data[field] is None:
                    update_data[field] = [] if field in ['immediate_causes', 'root_causes', 'contributing_factors', 'tags'] else {}
        
        # Apply updates to the incident
        for field, value in update_data.items():
            if hasattr(incident, field):
                setattr(incident, field, value)
        
        # Re-determine notifiability if severity or type changed
        if 'severity' in update_data or 'incident_type' in update_data:
            incident.determine_notifiability()
        
        # Update investigation due date if needed
        if 'severity' in update_data and not incident.investigation_completed_date:
            incident.set_investigation_due_date()
        
        db.commit()
        db.refresh(incident)
        return incident
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating incident: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Error updating incident: {str(e)}")

@router.put("/risk-management/incidents/{incident_id}/investigation", response_model=IncidentResponse)
def update_incident_investigation(
    incident_id: int,
    investigation_data: IncidentInvestigation,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update incident investigation details"""
    incident = db.query(Incident).filter(
        Incident.id == incident_id,
        Incident.company_id == current_user.company_id
    ).first()
    
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    try:
        # Update investigation fields
        incident.investigation_findings = investigation_data.investigation_findings
        incident.immediate_causes = investigation_data.immediate_causes
        incident.root_causes = investigation_data.root_causes
        incident.contributing_factors = investigation_data.contributing_factors or []
        incident.corrective_actions_required = investigation_data.corrective_actions_required
        incident.lessons_learned = investigation_data.lessons_learned
        
        # Mark investigation as completed if findings are provided
        if investigation_data.investigation_findings and incident.investigation_status != "completed":
            incident.investigation_status = "completed"
            incident.investigation_completed_date = datetime.now(timezone.utc)
        
        # Update incident status to investigating if not already closed
        if incident.status == "open" and investigation_data.investigation_findings:
            incident.status = "investigating"
        
        db.commit()
        db.refresh(incident)
        return incident
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating investigation: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Error updating investigation: {str(e)}")

@router.post("/risk-management/incidents/{incident_id}/worksafe-notify")
def record_worksafe_notification(
    incident_id: int,
    notification_data: WorkSafeNotification,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Record WorkSafe notification for incident"""
    incident = db.query(Incident).filter(
        Incident.id == incident_id,
        Incident.company_id == current_user.company_id
    ).first()
    
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    if not incident.is_notifiable:
        raise HTTPException(status_code=400, detail="Incident is not notifiable to WorkSafe")
    
    if incident.worksafe_notified:
        raise HTTPException(status_code=400, detail="WorkSafe notification already recorded")
    
    try:
        # Record the notification
        incident.mark_worksafe_notified(notification_data.worksafe_reference)
        
        # Log the notification details in custom fields for audit trail
        if not incident.custom_fields:
            incident.custom_fields = {}
        
        incident.custom_fields.update({
            "worksafe_notification": {
                "method": getattr(notification_data, 'notification_method', 'unknown'),
                "notes": getattr(notification_data, 'notification_notes', ''),
                "notified_by": current_user.id,
                "notification_date": incident.worksafe_notification_date.isoformat()
            }
        })
        
        db.commit()
        db.refresh(incident)
        
        return {
            "message": "WorkSafe notification recorded successfully",
            "incident_number": incident.incident_number,
            "notification_date": incident.worksafe_notification_date,
            "reference": incident.worksafe_reference
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error recording WorkSafe notification: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Error recording notification: {str(e)}")

@router.post("/risk-management/incidents/{incident_id}/close", response_model=IncidentResponse)
def close_incident_with_validation(
    incident_id: int,
    closure_data: IncidentClosure,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Close an incident with proper validation"""
    incident = db.query(Incident).filter(
        Incident.id == incident_id,
        Incident.company_id == current_user.company_id
    ).first()
    
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    if incident.status == "closed":
        raise HTTPException(status_code=400, detail="Incident is already closed")
    
    # Validation checks before closing
    validation_errors = []
    
    # Check if investigation is completed for serious incidents
    if incident.is_serious_incident and incident.investigation_status != "completed":
        validation_errors.append("Investigation must be completed before closing serious incidents")
    
    # Check WorkSafe notification for notifiable incidents
    if incident.is_notifiable and not incident.worksafe_notified:
        validation_errors.append("WorkSafe must be notified before closing notifiable incidents")
    
    # Check if corrective actions are identified for serious incidents
    if (incident.is_serious_incident and 
        not incident.corrective_actions_required and 
        incident.investigation_status == "completed"):
        validation_errors.append("Corrective actions must be identified for serious incidents")
    
    if validation_errors:
        raise HTTPException(
            status_code=400, 
            detail={
                "message": "Cannot close incident - validation failed",
                "validation_errors": validation_errors
            }
        )
    
    try:
        # Close the incident
        incident.close_incident(current_user.id, closure_data.closure_reason)
        
        # Update additional closure fields
        if closure_data.lessons_learned:
            incident.lessons_learned = closure_data.lessons_learned
        
        incident.communication_completed = closure_data.communication_completed
        
        # Log closure in custom fields for audit trail
        if not incident.custom_fields:
            incident.custom_fields = {}
        
        incident.custom_fields.update({
            "closure": {
                "closed_by": current_user.id,
                "closure_date": incident.closed_date.isoformat(),
                "closure_reason": closure_data.closure_reason,
                "final_lessons_learned": closure_data.lessons_learned,
                "communication_completed": closure_data.communication_completed
            }
        })
        
        db.commit()
        db.refresh(incident)
        return incident
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error closing incident: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Error closing incident: {str(e)}")

@router.get("/api/users/company")
def get_company_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all users in the current user's company for dropdowns"""
    try:
        users = db.query(User).filter(
            User.company_id == current_user.company_id,
            User.is_active == True
        ).all()
        
        return [
            {
                "id": user.id,
                "email": user.email,
                "full_name": getattr(user, 'full_name', user.email),
                "role": getattr(user, 'role', 'user')
            }
            for user in users
        ]
    except Exception as e:
        logger.error(f"Error fetching company users: {str(e)}")
        raise HTTPException(status_code=400, detail="Error fetching users")

@router.get("/risk-management/incidents/{incident_id}/compliance-check")
def check_incident_compliance(
    incident_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Check incident compliance against NZ WorkSafe regulations"""
    incident = db.query(Incident).filter(
        Incident.id == incident_id,
        Incident.company_id == current_user.company_id
    ).first()
    
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    compliance_check = {
        "incident_id": incident_id,
        "incident_number": incident.incident_number,
        "overall_compliance": True,
        "issues": [],
        "recommendations": [],
        "checks": {}
    }
    
    # WorkSafe notification compliance
    if incident.is_notifiable:
        notification_compliant = incident.worksafe_notified
        
        if incident.worksafe_notification_date and incident.incident_date:
            hours_to_notify = (incident.worksafe_notification_date - incident.incident_date).total_seconds() / 3600
            timely_notification = hours_to_notify <= 48
        else:
            timely_notification = False if incident.worksafe_notified else None
        
        compliance_check["checks"]["worksafe_notification"] = {
            "required": True,
            "completed": notification_compliant,
            "timely": timely_notification,
            "deadline_hours": 48,
            "actual_hours": hours_to_notify if 'hours_to_notify' in locals() else None
        }
        
        if not notification_compliant:
            compliance_check["overall_compliance"] = False
            compliance_check["issues"].append("WorkSafe notification required but not completed")
            compliance_check["recommendations"].append("Notify WorkSafe immediately via phone (0800 030 040) or online")
        elif timely_notification is False:
            compliance_check["issues"].append("WorkSafe notification was delayed beyond 48-hour requirement")
    else:
        compliance_check["checks"]["worksafe_notification"] = {
            "required": False,
            "completed": "N/A",
            "timely": "N/A"
        }
    
    # Investigation compliance
    investigation_required = incident.investigation_required
    investigation_completed = incident.investigation_status == "completed"
    
    investigation_overdue = False
    if incident.investigation_due_date:
        investigation_overdue = (
            datetime.now(timezone.utc) > incident.investigation_due_date and 
            not investigation_completed
        )
    
    compliance_check["checks"]["investigation"] = {
        "required": investigation_required,
        "completed": investigation_completed,
        "overdue": investigation_overdue,
        "due_date": incident.investigation_due_date.isoformat() if incident.investigation_due_date else None
    }
    
    if investigation_required and not investigation_completed:
        if investigation_overdue:
            compliance_check["overall_compliance"] = False
            compliance_check["issues"].append("Investigation is overdue")
            compliance_check["recommendations"].append("Complete investigation immediately")
        else:
            compliance_check["recommendations"].append("Ensure investigation is completed by due date")
    
    return compliance_check