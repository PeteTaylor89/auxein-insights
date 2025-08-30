# services/visitor_service.py - Visitor business logic
from typing import Optional, List, Dict, Any
from datetime import datetime, date, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_

from db.models.visitor import Visitor, VisitorVisit
from db.models.user import User
from db.models.company import Company
from schemas.visitor import (
    VisitorCreate, VisitorUpdate, VisitorWithStats,
    VisitorVisitCreate, VisitorVisitUpdate, VisitorVisitWithDetails,
    VisitorStats, VisitorReport
)
from permissions.visitor_permissions import VisitorPermissions

class VisitorService:
    """Service class for visitor management operations"""
    
    def __init__(self, db: Session):
        self.db = db
    
    # ===== VISITOR CRUD =====
    
    def create_visitor(self, visitor_data: VisitorCreate, current_user: User) -> Visitor:
        """Create a new visitor"""
        # Set company_id from current user if not provided
        if not visitor_data.company_id:
            visitor_data.company_id = current_user.company_id
        
        # Check if visitor already exists (by email or name+phone)
        existing_visitor = None
        if visitor_data.email:
            existing_visitor = self.db.query(Visitor).filter(
                Visitor.company_id == visitor_data.company_id,
                Visitor.email == visitor_data.email,
                Visitor.is_active == True
            ).first()
        
        if not existing_visitor and visitor_data.phone:
            existing_visitor = self.db.query(Visitor).filter(
                Visitor.company_id == visitor_data.company_id,
                Visitor.first_name == visitor_data.first_name,
                Visitor.last_name == visitor_data.last_name,
                Visitor.phone == visitor_data.phone,
                Visitor.is_active == True
            ).first()
        
        if existing_visitor:
            # Update existing visitor with any new information
            for field, value in visitor_data.dict(exclude_unset=True, exclude={'company_id'}).items():
                if value and hasattr(existing_visitor, field):
                    setattr(existing_visitor, field, value)
            
            self.db.commit()
            self.db.refresh(existing_visitor)
            return existing_visitor
        
        # Create new visitor
        db_visitor = Visitor(
            **visitor_data.dict(exclude={'company_id'}),
            company_id=visitor_data.company_id,
            created_by=current_user.id
        )
        
        self.db.add(db_visitor)
        self.db.commit()
        self.db.refresh(db_visitor)
        return db_visitor
    
    def get_visitor(self, visitor_id: int, company_id: int) -> Optional[Visitor]:
        """Get visitor by ID"""
        return self.db.query(Visitor).filter(
            Visitor.id == visitor_id,
            Visitor.company_id == company_id
        ).first()
    
    def get_visitors(self, company_id: int, skip: int = 0, limit: int = 100, 
                    search: Optional[str] = None, active_only: bool = True) -> List[Visitor]:
        """Get list of visitors with optional search"""
        query = self.db.query(Visitor).filter(Visitor.company_id == company_id)
        
        if active_only:
            query = query.filter(Visitor.is_active == True)
        
        if search:
            search_filter = or_(
                Visitor.first_name.ilike(f"%{search}%"),
                Visitor.last_name.ilike(f"%{search}%"),
                Visitor.email.ilike(f"%{search}%"),
                Visitor.company_representing.ilike(f"%{search}%")
            )
            query = query.filter(search_filter)
        
        return query.offset(skip).limit(limit).all()
    
    def update_visitor(self, visitor_id: int, visitor_data: VisitorUpdate, 
                      current_user: User) -> Optional[Visitor]:
        """Update visitor details"""
        visitor = self.get_visitor(visitor_id, current_user.company_id)
        if not visitor:
            return None
        
        # Check permissions
        if not VisitorPermissions.can_modify_visitor(current_user, visitor):
            raise PermissionError("Insufficient permissions to modify visitor")
        
        # Update fields
        for field, value in visitor_data.dict(exclude_unset=True).items():
            if hasattr(visitor, field):
                setattr(visitor, field, value)
        
        self.db.commit()
        self.db.refresh(visitor)
        return visitor
    
    def ban_visitor(self, visitor_id: int, reason: str, current_user: User) -> Optional[Visitor]:
        """Ban a visitor"""
        visitor = self.get_visitor(visitor_id, current_user.company_id)
        if not visitor:
            return None
        
        # Check permissions
        if not VisitorPermissions.can_ban_visitor(current_user, visitor):
            raise PermissionError("Insufficient permissions to ban visitor")
        
        visitor.is_banned = True
        visitor.ban_reason = reason
        
        self.db.commit()
        self.db.refresh(visitor)
        return visitor
    
    # ===== VISITOR VISIT CRUD =====
    
    def create_visit(self, visit_data: VisitorVisitCreate, current_user: User) -> VisitorVisit:
        """Create a new visitor visit"""
        # Set company_id from current user if not provided
        if not visit_data.company_id:
            visit_data.company_id = current_user.company_id
        
        # Set visit_date to today if not provided
        if not visit_data.visit_date:
            visit_data.visit_date = date.today()
        
        # Verify visitor exists and is active
        visitor = self.get_visitor(visit_data.visitor_id, current_user.company_id)
        if not visitor or not visitor.is_active or visitor.is_banned:
            raise ValueError("Visitor not found, inactive, or banned")
        
        # Create visit
        db_visit = VisitorVisit(
            **visit_data.dict(exclude={'company_id'}),
            company_id=visit_data.company_id,
            created_by=current_user.id
        )
        
        self.db.add(db_visit)
        self.db.commit()
        self.db.refresh(db_visit)
        return db_visit
    
    def get_visit(self, visit_id: int, company_id: int) -> Optional[VisitorVisit]:
        """Get visit by ID"""
        return self.db.query(VisitorVisit).filter(
            VisitorVisit.id == visit_id,
            VisitorVisit.company_id == company_id
        ).first()
    
    def get_visits(self, company_id: int, skip: int = 0, limit: int = 100,
                  visitor_id: Optional[int] = None, visit_date: Optional[date] = None,
                  status: Optional[str] = None) -> List[VisitorVisit]:
        """Get list of visits with optional filters"""
        query = self.db.query(VisitorVisit).filter(VisitorVisit.company_id == company_id)
        
        if visitor_id:
            query = query.filter(VisitorVisit.visitor_id == visitor_id)
        
        if visit_date:
            query = query.filter(VisitorVisit.visit_date == visit_date)
        
        if status:
            query = query.filter(VisitorVisit.status == status)
        
        return query.order_by(VisitorVisit.visit_date.desc()).offset(skip).limit(limit).all()
    
    def get_active_visits(self, company_id: int) -> List[VisitorVisit]:
        """Get all currently active visits (signed in but not out) with related data"""
        from sqlalchemy.orm import joinedload
        
        return self.db.query(VisitorVisit).options(
            joinedload(VisitorVisit.visitor),  # Load visitor relationship
            joinedload(VisitorVisit.host),     # Load host relationship
            joinedload(VisitorVisit.creator)   # Load creator relationship
        ).filter(
            VisitorVisit.company_id == company_id,
            VisitorVisit.signed_in_at.isnot(None),
            VisitorVisit.signed_out_at.is_(None),
            VisitorVisit.status == "in_progress"
        ).all()
    
    def sign_in_visitor(self, visit_id: int, current_user: User, 
                       induction_completed: bool = False,
                       ppe_provided: List[str] = None,
                       safety_briefing_given: bool = False,
                       areas_accessed: List[str] = None,
                       notes: Optional[str] = None) -> Optional[VisitorVisit]:
        """Sign a visitor in"""
        visit = self.get_visit(visit_id, current_user.company_id)
        if not visit:
            return None
        
        # Check permissions
        if not VisitorPermissions.can_sign_in_visitor(current_user, visit):
            raise PermissionError("Insufficient permissions to sign in visitor")
        
        # Check if already signed in
        if visit.signed_in_at:
            raise ValueError("Visitor is already signed in")
        
        # Sign in
        visit.sign_in(current_user.id)
        
        # Update safety information
        if induction_completed:
            visit.complete_induction(current_user.id)
        
        if ppe_provided:
            visit.ppe_provided = ppe_provided
        
        visit.safety_briefing_given = safety_briefing_given
        
        if areas_accessed:
            visit.areas_accessed = areas_accessed
        
        if notes:
            visit.visit_notes = (visit.visit_notes or "") + f"\nSign-in notes: {notes}"
        
        self.db.commit()
        self.db.refresh(visit)
        return visit
    
    def sign_out_visitor(self, visit_id: int, current_user: User, 
                        notes: Optional[str] = None) -> Optional[VisitorVisit]:
        """Sign a visitor out"""
        visit = self.get_visit(visit_id, current_user.company_id)
        if not visit:
            return None
        
        # Check permissions
        if not VisitorPermissions.can_sign_out_visitor(current_user, visit):
            raise PermissionError("Insufficient permissions to sign out visitor")
        
        # Check if not signed in
        if not visit.signed_in_at:
            raise ValueError("Visitor is not signed in")
        
        if visit.signed_out_at:
            raise ValueError("Visitor is already signed out")
        
        # Sign out
        visit.sign_out(current_user.id, notes)
        
        self.db.commit()
        self.db.refresh(visit)
        return visit
    
    # ===== VISITOR REGISTRATION PORTAL =====
    
    def register_visitor_and_visit(self, registration_data: Dict[str, Any], 
                                  company_id: int, current_user: User) -> Dict[str, Any]:
        """Register a visitor and create their visit in one operation"""
        
        # Create or find visitor
        visitor_data = VisitorCreate(
            first_name=registration_data['firstName'],
            last_name=registration_data['lastName'],
            email=registration_data.get('email'),
            phone=registration_data['phone'],
            emergency_contact_name=registration_data['emergencyName'],
            emergency_contact_phone=registration_data['emergencyPhone'],
            vehicle_registration=registration_data.get('vehicleReg'),
            driver_license=registration_data.get('driverLicense'),
            company_representing=registration_data.get('company'),
            position_title=registration_data.get('position'),
            company_id=company_id
        )
        
        # Create visitor (will update existing if found) - USE ACTUAL USER
        visitor = self.create_visitor(visitor_data, current_user)
        
        # Create visit - USE ACTUAL USER
        visit_data = VisitorVisitCreate(
            visitor_id=visitor.id,
            purpose=registration_data['purpose'],
            expected_duration_hours=int(registration_data.get('expectedDuration', 4)),
            host_user_id=current_user.id,  # Use current user as default host, or you could look up by hostName
            company_id=company_id
        )
        
        visit = self.create_visit(visit_data, current_user)
        
        # Mark induction as completed if done in portal
        if registration_data.get('inductionCompleted'):
            visit.complete_induction(current_user.id)  # USE ACTUAL USER ID
        
        # Set PPE requirements
        if registration_data.get('ppeRequired'):
            visit.ppe_provided = registration_data['ppeRequired']
        
        # Set safety briefing
        if registration_data.get('safetyBriefingAccepted'):
            visit.safety_briefing_given = True
        
        # Auto sign-in
        visit.sign_in(current_user.id)  # USE ACTUAL USER ID
        
        self.db.commit()
        self.db.refresh(visit)
        
        return {
            "visitor": visitor,
            "visit": visit,
            "message": "Registration completed successfully",
            "visit_id": visit.id,
            "visitor_name": visitor.full_name
        }
    
    # ===== STATISTICS & REPORTING =====
    
    def get_visitor_stats(self, company_id: int, days: int = 30) -> VisitorStats:
        """Get visitor statistics for a company"""
        start_date = date.today() - timedelta(days=days)
        
        # Total visitors
        total_visitors = self.db.query(func.count(Visitor.id)).filter(
            Visitor.company_id == company_id,
            Visitor.is_active == True
        ).scalar() or 0
        
        # Total visits in period
        total_visits = self.db.query(func.count(VisitorVisit.id)).filter(
            VisitorVisit.company_id == company_id,
            VisitorVisit.visit_date >= start_date
        ).scalar() or 0
        
        # Active visits today
        active_visits_today = len(self.get_active_visits(company_id))
        
        # Frequent visitors (3+ visits)
        frequent_visitors = self.db.query(func.count(Visitor.id)).filter(
            Visitor.company_id == company_id,
            Visitor.id.in_(
                self.db.query(VisitorVisit.visitor_id)
                .filter(VisitorVisit.company_id == company_id)
                .group_by(VisitorVisit.visitor_id)
                .having(func.count(VisitorVisit.id) >= 3)
            )
        ).scalar() or 0
        
        # Visits this month
        month_start = date.today().replace(day=1)
        visits_this_month = self.db.query(func.count(VisitorVisit.id)).filter(
            VisitorVisit.company_id == company_id,
            VisitorVisit.visit_date >= month_start
        ).scalar() or 0
        
        # Average visit duration (for completed visits)
        avg_duration_query = self.db.query(
            func.avg(
                func.extract('epoch', VisitorVisit.signed_out_at - VisitorVisit.signed_in_at) / 60
            )
        ).filter(
            VisitorVisit.company_id == company_id,
            VisitorVisit.signed_in_at.isnot(None),
            VisitorVisit.signed_out_at.isnot(None),
            VisitorVisit.visit_date >= start_date
        ).scalar()
        
        avg_duration = float(avg_duration_query) if avg_duration_query else 0.0
        
        # Most common purposes
        purpose_stats = self.db.query(
            VisitorVisit.purpose,
            func.count(VisitorVisit.id).label('count')
        ).filter(
            VisitorVisit.company_id == company_id,
            VisitorVisit.visit_date >= start_date
        ).group_by(VisitorVisit.purpose).order_by(func.count(VisitorVisit.id).desc()).limit(5).all()
        
        most_common_purposes = [
            {"purpose": purpose, "count": count} 
            for purpose, count in purpose_stats
        ]
        
        return VisitorStats(
            total_visitors=total_visitors,
            total_visits=total_visits,
            active_visits_today=active_visits_today,
            frequent_visitors=frequent_visitors,
            visitors_this_month=len(set([
                v.visitor_id for v in self.db.query(VisitorVisit.visitor_id).filter(
                    VisitorVisit.company_id == company_id,
                    VisitorVisit.visit_date >= month_start
                ).all()
            ])),
            visits_this_month=visits_this_month,
            average_visit_duration_minutes=avg_duration,
            most_common_purposes=most_common_purposes
        )