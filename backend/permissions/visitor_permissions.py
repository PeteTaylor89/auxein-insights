# permissions/visitor_permissions.py - Visitor Management Permissions
from typing import Optional
from db.models.user import User
from db.models.visitor import Visitor, VisitorVisit

class VisitorPermissions:
    """Permissions for visitor management"""
    
    @staticmethod
    def can_create_visitor(user: User) -> bool:
        """Check if user can create new visitors"""
        # All users can create visitors (for when someone shows up)
        return user.role in ["admin", "manager", "user"]
    
    @staticmethod
    def can_view_visitor(user: User, visitor: Optional[Visitor] = None) -> bool:
        """Check if user can view visitor details"""
        if not visitor:
            return True  # Can view visitor list
        
        # All users in same company can view visitors
        return visitor.company_id == user.company_id
    
    @staticmethod
    def can_modify_visitor(user: User, visitor: Visitor) -> bool:
        """Check if user can modify visitor details"""
        if visitor.company_id != user.company_id:
            return False
        
        # Admin can modify any visitor
        if user.role == "admin":
            return True
        
        # Manager can modify any visitor
        if user.role == "manager":
            return True
        
        # Users can only modify visitors they created
        return visitor.created_by == user.id
    
    @staticmethod
    def can_delete_visitor(user: User, visitor: Visitor) -> bool:
        """Check if user can delete visitors"""
        if visitor.company_id != user.company_id:
            return False
        
        # Only admin can delete visitors
        if user.role == "admin":
            return True
        
        return False
    
    @staticmethod
    def can_ban_visitor(user: User, visitor: Visitor) -> bool:
        """Check if user can ban/unban visitors"""
        if visitor.company_id != user.company_id:
            return False
        
        # Only admin and manager can ban visitors
        return user.role in ["admin", "manager"]
    
    # ===== VISITOR VISIT PERMISSIONS =====
    
    @staticmethod
    def can_create_visit(user: User) -> bool:
        """Check if user can create visitor visits"""
        # All users can create visits (for when visitor arrives)
        return user.role in ["admin", "manager", "user"]
    
    @staticmethod
    def can_view_visit(user: User, visit: Optional[VisitorVisit] = None) -> bool:
        """Check if user can view visit details"""
        if not visit:
            return True  # Can view visit list
        
        # All users in same company can view visits
        return visit.company_id == user.company_id
    
    @staticmethod
    def can_modify_visit(user: User, visit: VisitorVisit) -> bool:
        """Check if user can modify visit details"""
        if visit.company_id != user.company_id:
            return False
        
        # Admin can modify any visit
        if user.role == "admin":
            return True
        
        # Manager can modify any visit
        if user.role == "manager":
            return True
        
        # Users can modify visits they created or are hosting
        return visit.created_by == user.id or visit.host_user_id == user.id
    
    @staticmethod
    def can_delete_visit(user: User, visit: VisitorVisit) -> bool:
        """Check if user can delete visits"""
        if visit.company_id != user.company_id:
            return False
        
        # Admin can delete any visit
        if user.role == "admin":
            return True
        
        # Manager can delete any visit
        if user.role == "manager":
            return True
        
        # Users can only delete visits they created (and only if not completed)
        if visit.created_by == user.id and visit.status != "completed":
            return True
        
        return False
    
    @staticmethod
    def can_sign_in_visitor(user: User, visit: VisitorVisit) -> bool:
        """Check if user can sign visitors in"""
        if visit.company_id != user.company_id:
            return False
        
        # All users can sign visitors in
        return True
    
    @staticmethod
    def can_sign_out_visitor(user: User, visit: VisitorVisit) -> bool:
        """Check if user can sign visitors out"""
        if visit.company_id != user.company_id:
            return False
        
        # All users can sign visitors out
        return True
    
    @staticmethod
    def can_complete_induction(user: User, visit: VisitorVisit) -> bool:
        """Check if user can complete visitor inductions"""
        if visit.company_id != user.company_id:
            return False
        
        # Admin and manager can complete inductions
        if user.role in ["admin", "manager"]:
            return True
        
        # Host can complete their visitor's induction
        return visit.host_user_id == user.id
    
    @staticmethod
    def can_log_incident(user: User, visit: VisitorVisit) -> bool:
        """Check if user can log visitor incidents"""
        if visit.company_id != user.company_id:
            return False
        
        # All users can log incidents
        return True
    
    @staticmethod
    def can_view_visitor_reports(user: User, company_id: int) -> bool:
        """Check if user can view visitor reports"""
        if company_id != user.company_id:
            return False
        
        # Admin and manager can view reports
        return user.role in ["admin", "manager"]
    
    @staticmethod
    def can_export_visitor_data(user: User, company_id: int) -> bool:
        """Check if user can export visitor data"""
        if company_id != user.company_id:
            return False
        
        # Admin and manager can export data
        return user.role in ["admin", "manager"]
    
    @staticmethod
    def can_manage_visitor_settings(user: User) -> bool:
        """Check if user can manage visitor settings"""
        # Only admin can manage visitor settings
        return user.role == "admin"

# Visitor permission constants for easy reference
VISITOR_PERMISSIONS = {
    "CREATE_VISITOR": ["admin", "manager", "user"],
    "VIEW_VISITOR": ["admin", "manager", "user"],
    "MODIFY_VISITOR": ["admin", "manager"],  # Users can modify their own
    "DELETE_VISITOR": ["admin"],
    "BAN_VISITOR": ["admin", "manager"],
    
    "CREATE_VISIT": ["admin", "manager", "user"],
    "VIEW_VISIT": ["admin", "manager", "user"],
    "MODIFY_VISIT": ["admin", "manager"],  # Users can modify their own/hosted
    "DELETE_VISIT": ["admin", "manager"],  # Users can delete their own uncompleted
    
    "SIGN_IN_VISITOR": ["admin", "manager", "user"],
    "SIGN_OUT_VISITOR": ["admin", "manager", "user"],
    "COMPLETE_INDUCTION": ["admin", "manager"],  # Host can also complete
    "LOG_INCIDENT": ["admin", "manager", "user"],
    
    "VIEW_REPORTS": ["admin", "manager"],
    "EXPORT_DATA": ["admin", "manager"],
    "MANAGE_SETTINGS": ["admin"]
}