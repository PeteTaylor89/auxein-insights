from typing import Optional, Union
from db.models.user import User
from db.models.contractor import Contractor
from db.models.site_risk import SiteRisk


class RiskPermissions:
    """Centralized permissions for risk management — delegates to the permission matrix"""

    @staticmethod
    def can_create_risk(user: Union[User, Contractor]) -> bool:
        """Check if user can create new risks"""
        return user.has_permission("risks", "create")

    @staticmethod
    def can_modify_risk(user: Union[User, Contractor], risk: Optional[SiteRisk] = None) -> bool:
        """Check if user can modify risks"""
        if user.has_permission("risks", "update"):
            if risk and hasattr(user, 'company_id'):
                return risk.company_id == user.company_id
            return True
        return False

    @staticmethod
    def can_delete_risk(user: Union[User, Contractor], risk: SiteRisk) -> bool:
        """Check if user can delete risks"""
        if not user.has_permission("risks", "delete"):
            return False
        if hasattr(user, 'company_id'):
            return risk.company_id == user.company_id
        return False

    @staticmethod
    def can_view_risk(user: Union[User, Contractor], risk: SiteRisk) -> bool:
        """Check if user can view risks"""
        if not user.has_permission("risks", "read"):
            return False
        if hasattr(user, 'company_id'):
            return risk.company_id == user.company_id
        return False

    @staticmethod
    def can_create_risk_action(user: Union[User, Contractor]) -> bool:
        """Check if user can create risk actions"""
        return user.has_permission("risks", "create")

    @staticmethod
    def can_modify_risk_action(user: Union[User, Contractor], action_company_id: int) -> bool:
        """Check if user can modify risk actions"""
        if not user.has_permission("risks", "update"):
            return False
        if hasattr(user, 'company_id'):
            return action_company_id == user.company_id
        return False

    @staticmethod
    def can_complete_risk_action(user: Union[User, Contractor], action_company_id: int) -> bool:
        """Check if user can complete risk actions"""
        if hasattr(user, 'company_id'):
            return action_company_id == user.company_id
        return False

    @staticmethod
    def can_assign_risk_action(user: Union[User, Contractor], action_company_id: int) -> bool:
        """Check if user can assign risk actions to others"""
        if not user.has_permission("risks", "assign"):
            return False
        if hasattr(user, 'company_id'):
            return action_company_id == user.company_id
        return False

    @staticmethod
    def can_view_company_risks(user: Union[User, Contractor], company_id: int) -> bool:
        """Check if user can view all risks for a company"""
        if hasattr(user, 'company_id'):
            return user.company_id == company_id
        return False

    @staticmethod
    def can_manage_risk_settings(user: Union[User, Contractor]) -> bool:
        """Check if user can manage risk matrix settings, etc."""
        return user.has_permission("settings", "update")
