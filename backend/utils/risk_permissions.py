from typing import Optional
from db.models.user import User
from db.models.site_risk import SiteRisk

class RiskPermissions:
    """Centralized permissions for risk management - simplified for 3 roles"""
    
    @staticmethod
    def can_create_risk(user: User) -> bool:
        """Check if user can create new risks"""
        return user.role in ["admin", "manager"]
    
    @staticmethod
    def can_modify_risk(user: User, risk: Optional[SiteRisk] = None) -> bool:
        """Check if user can modify risks"""
        if user.role in ["admin", "manager"]:
            # Additional check: must be same company
            if risk:
                return risk.company_id == user.company_id
            return True
        return False
    
    @staticmethod
    def can_delete_risk(user: User, risk: SiteRisk) -> bool:
        """Check if user can delete risks"""
        # Admin can delete any risk in their company
        if user.role == "admin":
            return risk.company_id == user.company_id
        
        # Managers can only delete risks they created
        elif user.role == "manager":
            return (risk.company_id == user.company_id and 
                   risk.created_by == user.id)
        
        return False
    
    @staticmethod
    def can_view_risk(user: User, risk: SiteRisk) -> bool:
        """Check if user can view risks"""
        # All users can view risks within their company
        return risk.company_id == user.company_id
    
    @staticmethod
    def can_create_risk_action(user: User) -> bool:
        """Check if user can create risk actions"""
        # All user types can create risk actions
        return user.role in ["admin", "manager", "user"]
    
    @staticmethod
    def can_modify_risk_action(user: User, action_company_id: int) -> bool:
        """Check if user can modify risk actions"""
        if user.role in ["admin", "manager", "user"]:
            return action_company_id == user.company_id
        return False
    
    @staticmethod
    def can_complete_risk_action(user: User, action_company_id: int) -> bool:
        """Check if user can complete risk actions"""
        # All authenticated users in the company can complete actions
        return action_company_id == user.company_id
    
    @staticmethod
    def can_assign_risk_action(user: User, action_company_id: int) -> bool:
        """Check if user can assign risk actions to others"""
        if user.role in ["admin", "manager"]:
            return action_company_id == user.company_id
        return False
    
    @staticmethod
    def can_view_company_risks(user: User, company_id: int) -> bool:
        """Check if user can view all risks for a company"""
        return user.company_id == company_id
    
    @staticmethod
    def can_manage_risk_settings(user: User) -> bool:
        """Check if user can manage risk matrix settings, etc."""
        return user.role == "admin"

# Permission decorators for FastAPI endpoints
def require_risk_create_permission(func):
    """Decorator to require risk creation permissions"""
    def wrapper(*args, **kwargs):
        # This would be used in FastAPI with Depends
        pass
    return wrapper

def require_risk_modify_permission(func):
    """Decorator to require risk modification permissions"""
    def wrapper(*args, **kwargs):
        # This would be used in FastAPI with Depends
        pass
    return wrapper

# Simplified risk permission constants for easy reference
RISK_PERMISSIONS = {
    "CREATE_RISK": ["admin", "manager"],
    "MODIFY_RISK": ["admin", "manager"],
    "DELETE_RISK": ["admin"],  # Managers can delete their own
    "VIEW_RISK": ["admin", "manager", "user"],
    "CREATE_ACTION": ["admin", "manager", "user"],
    "MODIFY_ACTION": ["admin", "manager", "user"],
    "COMPLETE_ACTION": ["admin", "manager", "user"],
    "ASSIGN_ACTION": ["admin", "manager"],
    "MANAGE_SETTINGS": ["admin"]
}