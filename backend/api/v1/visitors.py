# api/v1/visitors.py - Visitor API endpoints
from typing import List, Optional, Dict, Any
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from api.deps import get_db, get_current_user
from db.models.user import User
from db.models.visitor import Visitor
from services.visitor_service import VisitorService
from schemas.visitor import (
    Visitor, VisitorCreate, VisitorUpdate, VisitorWithStats,
    VisitorVisit, VisitorVisitCreate, VisitorVisitUpdate, VisitorVisitWithDetails,
    VisitorSignIn, VisitorSignOut, VisitorInduction, VisitorIncident,
    VisitorStats, VisitorReport, VisitorVisitSummary
)
from permissions.visitor_permissions import VisitorPermissions


router = APIRouter()

# ===== VISITOR ENDPOINTS =====

@router.post("/visitors", response_model=Visitor, status_code=status.HTTP_201_CREATED)
def create_visitor(
    visitor: VisitorCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new visitor"""
    if not VisitorPermissions.can_create_visitor(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to create visitors"
        )
    
    service = VisitorService(db)
    try:
        return service.create_visitor(visitor, current_user)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.get("/visitors", response_model=List[VisitorWithStats])
def get_visitors(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    search: Optional[str] = Query(None),
    active_only: bool = Query(True),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get list of visitors"""
    if not VisitorPermissions.can_view_visitor(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to view visitors"
        )
    
    service = VisitorService(db)
    visitors = service.get_visitors(
        current_user.company_id, skip=skip, limit=limit, 
        search=search, active_only=active_only
    )
    
    # Add stats to each visitor
    visitors_with_stats = []
    for visitor in visitors:
        visitor_stats = VisitorWithStats(
            **visitor.__dict__,
            total_visits=len(visitor.visits),
            last_visit_date=max([v.visit_date for v in visitor.visits]) if visitor.visits else None,
            is_frequent_visitor=len(visitor.visits) >= 3
        )
        visitors_with_stats.append(visitor_stats)
    
    return visitors_with_stats

@router.get("/visitors/{visitor_id}", response_model=VisitorWithStats)
def get_visitor(
    visitor_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get visitor by ID"""
    service = VisitorService(db)
    visitor = service.get_visitor(visitor_id, current_user.company_id)
    
    if not visitor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Visitor not found"
        )
    
    if not VisitorPermissions.can_view_visitor(current_user, visitor):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to view this visitor"
        )
    
    return VisitorWithStats(
        **visitor.__dict__,
        total_visits=len(visitor.visits),
        last_visit_date=max([v.visit_date for v in visitor.visits]) if visitor.visits else None,
        is_frequent_visitor=len(visitor.visits) >= 3
    )

@router.put("/visitors/{visitor_id}", response_model=Visitor)
def update_visitor(
    visitor_id: int,
    visitor_update: VisitorUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update visitor details"""
    service = VisitorService(db)
    try:
        visitor = service.update_visitor(visitor_id, visitor_update, current_user)
        if not visitor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Visitor not found"
            )
        return visitor
    except PermissionError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.post("/visitors/{visitor_id}/ban")
def ban_visitor(
    visitor_id: int,
    reason: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Ban a visitor"""
    service = VisitorService(db)
    try:
        visitor = service.ban_visitor(visitor_id, reason, current_user)
        if not visitor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Visitor not found"
            )
        return {"message": "Visitor banned successfully", "visitor_id": visitor_id}
    except PermissionError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(e)
        )

# ===== VISITOR VISIT ENDPOINTS =====

@router.post("/visits", response_model=VisitorVisit, status_code=status.HTTP_201_CREATED)
def create_visit(
    visit: VisitorVisitCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new visitor visit"""
    if not VisitorPermissions.can_create_visit(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to create visits"
        )
    
    service = VisitorService(db)
    try:
        return service.create_visit(visit, current_user)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.get("/visits", response_model=List[VisitorVisitSummary])
def get_visits(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    visitor_id: Optional[int] = Query(None),
    visit_date: Optional[date] = Query(None),
    status: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get list of visits"""
    if not VisitorPermissions.can_view_visit(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to view visits"
        )
    
    service = VisitorService(db)
    visits = service.get_visits(
        current_user.company_id, skip=skip, limit=limit,
        visitor_id=visitor_id, visit_date=visit_date, status=status
    )
    
    # Convert to summary format
    visit_summaries = []
    for visit in visits:
        summary = VisitorVisitSummary(
            id=visit.id,
            visitor_name=visit.visitor.full_name,
            purpose=visit.purpose,
            visit_date=visit.visit_date,
            status=visit.status,
            host_name=visit.host.full_name if visit.host else "Unknown",
            signed_in_at=visit.signed_in_at,
            signed_out_at=visit.signed_out_at,
            is_active_visit=visit.is_active_visit
        )
        visit_summaries.append(summary)
    
    return visit_summaries

@router.get("/visits/active")
def get_active_visits(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all currently active visits"""
    if not VisitorPermissions.can_view_visit(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to view visits"
        )
    
    service = VisitorService(db)
    active_visits = service.get_active_visits(current_user.company_id)
    
    # Convert to simple dictionary format with all details
    result = []
    for visit in active_visits:
        # Ensure visitor relationship is loaded
        if not hasattr(visit, 'visitor') or visit.visitor is None:
            visit.visitor = db.query(Visitor).filter(Visitor.id == visit.visitor_id).first()
        
        # Ensure host relationship is loaded
        if not hasattr(visit, 'host') or visit.host is None:
            visit.host = db.query(User).filter(User.id == visit.host_user_id).first()
        
        visit_data = {
            # Visit details
            'id': visit.id,
            'visitor_id': visit.visitor_id,
            'purpose': visit.purpose,
            'visit_date': visit.visit_date.isoformat() if visit.visit_date else None,
            'expected_duration_hours': visit.expected_duration_hours,
            'signed_in_at': visit.signed_in_at.isoformat() if visit.signed_in_at else None,
            'signed_out_at': visit.signed_out_at.isoformat() if visit.signed_out_at else None,
            'status': visit.status,
            'host_user_id': visit.host_user_id,
            'areas_accessed': getattr(visit, 'areas_accessed', []),
            'ppe_provided': getattr(visit, 'ppe_provided', []),
            'induction_completed': getattr(visit, 'induction_completed', False),
            'safety_briefing_given': getattr(visit, 'safety_briefing_given', False),
            'visit_notes': getattr(visit, 'visit_notes', None),
            
            # Computed fields
            'is_active_visit': visit.is_active_visit,
            'visit_duration_minutes': visit.visit_duration_minutes,
            'is_overdue': visit.is_overdue,
            
            # Visitor details (flattened)
            'visitor': {
                'id': visit.visitor.id if visit.visitor else None,
                'first_name': visit.visitor.first_name if visit.visitor else None,
                'last_name': visit.visitor.last_name if visit.visitor else None,
                'email': visit.visitor.email if visit.visitor else None,
                'phone': visit.visitor.phone if visit.visitor else None,
                'company_representing': visit.visitor.company_representing if visit.visitor else None,
                'vehicle_registration': visit.visitor.vehicle_registration if visit.visitor else None,
                'emergency_contact_name': visit.visitor.emergency_contact_name if visit.visitor else None,
                'emergency_contact_phone': visit.visitor.emergency_contact_phone if visit.visitor else None,
            } if visit.visitor else None,
            
            # Host details (flattened)
            'host': {
                'id': visit.host.id if visit.host else None,
                'email': visit.host.email if visit.host else None,
                'first_name': visit.host.first_name if visit.host else None,
                'last_name': visit.host.last_name if visit.host else None,
                'full_name': f"{visit.host.first_name} {visit.host.last_name}" if visit.host else None,
            } if visit.host else None
        }
        
        result.append(visit_data)
    
    return result

@router.get("/visits/{visit_id}", response_model=VisitorVisitWithDetails)
def get_visit(
    visit_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get visit by ID"""
    service = VisitorService(db)
    visit = service.get_visit(visit_id, current_user.company_id)
    
    if not visit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Visit not found"
        )
    
    if not VisitorPermissions.can_view_visit(current_user, visit):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to view this visit"
        )
    
    # Create dict from visit attributes, excluding relationship objects to avoid conflicts
    visit_dict = {
        key: value for key, value in visit.__dict__.items() 
        if not key.startswith('_') and key not in ['visitor', 'host', 'creator']
    }
    
    # Convert SQLAlchemy objects to Pydantic models
    visitor_model = None
    if visit.visitor:
        from schemas.visitor import Visitor as VisitorSchema
        visitor_model = VisitorSchema.model_validate(visit.visitor)
    
    host_model = None
    if visit.host:
        from schemas.user import UserSummary
        host_model = UserSummary.model_validate(visit.host)
    
    return VisitorVisitWithDetails(
        **visit_dict,
        visitor=visitor_model,
        host=host_model,
        is_active_visit=visit.is_active_visit,
        visit_duration_minutes=visit.visit_duration_minutes,
        is_overdue=visit.is_overdue
    )

@router.post("/visits/{visit_id}/sign-in")
def sign_in_visitor(
    visit_id: int,
    sign_in_data: VisitorSignIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Sign a visitor in"""
    service = VisitorService(db)
    try:
        visit = service.sign_in_visitor(
            visit_id, current_user,
            induction_completed=sign_in_data.induction_completed,
            ppe_provided=sign_in_data.ppe_provided,
            safety_briefing_given=sign_in_data.safety_briefing_given,
            areas_accessed=sign_in_data.areas_accessed,
            notes=sign_in_data.notes
        )
        if not visit:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Visit not found"
            )
        return {"message": "Visitor signed in successfully", "visit_id": visit_id}
    except (PermissionError, ValueError) as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.post("/visits/{visit_id}/sign-out")
def sign_out_visitor(
    visit_id: int,
    notes: Optional[str] = None,  # Change this to accept optional notes directly
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Sign a visitor out"""
    service = VisitorService(db)
    try:
        visit = service.sign_out_visitor(visit_id, current_user, notes)
        if not visit:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Visit not found"
            )
        return {"message": "Visitor signed out successfully", "visit_id": visit_id}
    except (PermissionError, ValueError) as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
        
# ===== VISITOR REGISTRATION PORTAL ENDPOINT =====

@router.post("/register", status_code=status.HTTP_201_CREATED)
def register_visitor_portal(
    registration_data: Dict[str, Any],
    company_id: int = Query(..., description="Company ID for registration"),
    current_user: User = Depends(get_current_user),  # ADD THIS LINE
    db: Session = Depends(get_db)
):
    """
    Visitor self-registration portal
    Now requires authentication to track who registered the visitor
    """
    service = VisitorService(db)
    try:
        result = service.register_visitor_and_visit(registration_data, company_id, current_user)  # PASS current_user
        return {
            "success": True,
            "message": result["message"],
            "visit_id": result["visit_id"],
            "visitor_name": result["visitor_name"],
            "next_steps": [
                "You have been signed in automatically",
                "Your host will be notified of your arrival", 
                "Please wait in the reception area",
                "Remember to sign out when leaving"
            ]
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Registration failed: {str(e)}"
        )

# ===== STATISTICS & REPORTING ENDPOINTS =====

@router.get("/stats", response_model=VisitorStats)
def get_visitor_stats(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get visitor statistics"""
    if not VisitorPermissions.can_view_visitor_reports(current_user, current_user.company_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to view visitor reports"
        )
    
    service = VisitorService(db)
    return service.get_visitor_stats(current_user.company_id, days)

@router.get("/dashboard")
def get_visitor_dashboard(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get visitor dashboard data"""
    if not VisitorPermissions.can_view_visitor_reports(current_user, current_user.company_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to view visitor dashboard"
        )
    
    service = VisitorService(db)
    
    # Get active visits
    active_visits = service.get_active_visits(current_user.company_id)
    
    # Get today's visits
    today_visits = service.get_visits(
        current_user.company_id, 
        visit_date=date.today(),
        limit=50
    )
    
    # Get recent visitors (last 7 days)
    recent_visitors = service.get_visits(
        current_user.company_id,
        limit=20
    )
    
    # Get stats
    stats = service.get_visitor_stats(current_user.company_id, days=30)
    
    return {
        "active_visits": len(active_visits),
        "today_visits": len(today_visits),
        "recent_activity": [
            {
                "id": visit.id,
                "visitor_name": visit.visitor.full_name,
                "purpose": visit.purpose,
                "visit_date": visit.visit_date,
                "status": visit.status,
                "signed_in_at": visit.signed_in_at,
                "signed_out_at": visit.signed_out_at
            }
            for visit in recent_visitors[:10]
        ],
        "stats": stats,
        "alerts": [
            {
                "type": "overdue",
                "message": f"Visitor {visit.visitor.full_name} is overdue (expected {visit.expected_duration_hours}h)",
                "visit_id": visit.id
            }
            for visit in active_visits if visit.is_overdue
        ]
    }

# ===== UTILITY ENDPOINTS =====

@router.get("/search")
def search_visitors(
    q: str = Query(..., min_length=2),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Search for visitors by name, email, or company"""
    if not VisitorPermissions.can_view_visitor(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to search visitors"
        )
    
    service = VisitorService(db)
    visitors = service.get_visitors(current_user.company_id, search=q, limit=20)
    
    return [
        {
            "id": visitor.id,
            "name": visitor.full_name,
            "email": visitor.email,
            "company": visitor.company_representing,
            "phone": visitor.phone,
            "total_visits": len(visitor.visits),
            "last_visit": max([v.visit_date for v in visitor.visits]) if visitor.visits else None
        }
        for visitor in visitors
    ]

@router.get("/export")
def export_visitor_data(
    format: str = Query("csv", regex="^(csv|xlsx)$"),
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Export visitor data"""
    if not VisitorPermissions.can_export_visitor_data(current_user, current_user.company_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to export visitor data"
        )
    
    # This would implement actual export functionality
    # For now, return a placeholder
    return {
        "message": f"Export initiated for {format} format",
        "download_url": f"/api/v1/visitors/downloads/visitors_{current_user.company_id}_{days}days.{format}",
        "expires_at": "2024-01-01T00:00:00Z"
    }