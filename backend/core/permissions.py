"""
Centralized permission matrix for Auxein Insights Pro.

This module defines the 5-tier user type system and all module/action
permissions. It is the single source of truth — backend route handlers
and frontend navigation both derive from this matrix.

Usage:
    from core.permissions import UserType, has_permission, get_scope

    # In route handlers (via require_permission dependency):
    if not has_permission(current_user.user_type, "tasks", "create"):
        raise HTTPException(403)

    # On models:
    current_user.has_permission("tasks", "create")
"""
from enum import Enum


class UserType(str, Enum):
    auxein_admin = "auxein_admin"
    company_admin = "company_admin"
    company_manager = "company_manager"
    company_user = "company_user"
    contractor = "contractor"


# Module -> action -> list of user_types allowed to perform the action
PERMISSIONS: dict[str, dict[str, list[str]]] = {
    "tasks": {
        "create":        [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "read":          [UserType.auxein_admin, UserType.company_admin, UserType.company_manager, UserType.company_user, UserType.contractor],
        "read_assigned": [UserType.company_user, UserType.contractor],
        "update":        [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "update_own":    [UserType.company_user, UserType.contractor],
        "delete":        [UserType.auxein_admin, UserType.company_admin],
        "assign":        [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "approve":       [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "complete":      [UserType.auxein_admin, UserType.company_admin, UserType.company_manager, UserType.company_user, UserType.contractor],
    },
    "observations": {
        "create":        [UserType.auxein_admin, UserType.company_admin, UserType.company_manager, UserType.company_user, UserType.contractor],
        "read":          [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "read_own":      [UserType.company_user, UserType.contractor],
        "update":        [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "delete":        [UserType.auxein_admin, UserType.company_admin],
        "assign":        [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
    },
    "assets": {
        "create":          [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "read":            [UserType.auxein_admin, UserType.company_admin, UserType.company_manager, UserType.company_user, UserType.contractor],
        "update":          [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "delete":          [UserType.auxein_admin, UserType.company_admin],
        "log_maintenance": [UserType.auxein_admin, UserType.company_admin, UserType.company_manager, UserType.company_user],
    },
    "risks": {
        "create":   [UserType.auxein_admin, UserType.company_admin, UserType.company_manager, UserType.company_user],
        "read":     [UserType.auxein_admin, UserType.company_admin, UserType.company_manager, UserType.company_user],
        "read_own": [UserType.company_user],
        "update":   [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "delete":   [UserType.auxein_admin, UserType.company_admin],
        "assign":   [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
    },
    "training": {
        "create":        [UserType.auxein_admin, UserType.company_admin],
        "read":          [UserType.auxein_admin, UserType.company_admin, UserType.company_manager, UserType.company_user, UserType.contractor],
        "read_assigned": [UserType.company_user, UserType.contractor],
        "update":        [UserType.auxein_admin, UserType.company_admin],
        "delete":        [UserType.auxein_admin, UserType.company_admin],
        "assign":        [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "complete":      [UserType.auxein_admin, UserType.company_admin, UserType.company_manager, UserType.company_user, UserType.contractor],
    },
    "visitors": {
        "create": [UserType.auxein_admin, UserType.company_admin, UserType.company_manager, UserType.company_user],
        "read":   [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "update": [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "delete": [UserType.auxein_admin, UserType.company_admin],
    },
    "timesheets": {
        "create":  [UserType.auxein_admin, UserType.company_admin, UserType.company_manager, UserType.company_user, UserType.contractor],
        "read":    [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "read_own":[UserType.company_user, UserType.contractor],
        "update":  [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "delete":  [UserType.auxein_admin, UserType.company_admin],
        "approve": [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "submit":  [UserType.company_user, UserType.contractor],
    },
    "calendar": {
        "read":          [UserType.auxein_admin, UserType.company_admin, UserType.company_manager, UserType.company_user],
        "read_own":      [UserType.company_user],
        "read_assigned": [UserType.contractor],
    },
    "reports": {
        "read":   [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "export": [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
    },
    "properties": {
        "create": [UserType.auxein_admin, UserType.company_admin],
        "read":   [UserType.auxein_admin, UserType.company_admin, UserType.company_manager, UserType.company_user],
        "update": [UserType.auxein_admin, UserType.company_admin],
        "delete": [UserType.auxein_admin, UserType.company_admin],
        "manage": [UserType.auxein_admin, UserType.company_admin],
    },
    "blocks": {
        "create": [UserType.auxein_admin, UserType.company_admin],
        "read":   [UserType.auxein_admin, UserType.company_admin, UserType.company_manager, UserType.company_user, UserType.contractor],
        "update": [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "delete": [UserType.auxein_admin, UserType.company_admin],
    },
    "contractors": {
        "create": [UserType.auxein_admin, UserType.company_admin],
        "read":   [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "update": [UserType.auxein_admin, UserType.company_admin],
        "delete": [UserType.auxein_admin, UserType.company_admin],
        "assign": [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
    },
    "users": {
        "create": [UserType.auxein_admin, UserType.company_admin],
        "read":   [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "update": [UserType.auxein_admin, UserType.company_admin],
        "delete": [UserType.auxein_admin, UserType.company_admin],
    },
    "settings": {
        "read":   [UserType.auxein_admin, UserType.company_admin],
        "update": [UserType.auxein_admin, UserType.company_admin],
    },
    "billing": {
        "read":   [UserType.auxein_admin, UserType.company_admin],
        "update": [UserType.auxein_admin, UserType.company_admin],
    },
    "files": {
        "upload": [UserType.auxein_admin, UserType.company_admin, UserType.company_manager, UserType.company_user],
        "read":   [UserType.auxein_admin, UserType.company_admin, UserType.company_manager, UserType.company_user, UserType.contractor],
        "delete": [UserType.auxein_admin, UserType.company_admin],
    },
    "climate": {
        "read":   [UserType.auxein_admin, UserType.company_admin, UserType.company_manager, UserType.company_user],
        "import": [UserType.auxein_admin, UserType.company_admin],
        "delete": [UserType.auxein_admin, UserType.company_admin],
    },
    # The POI vocabulary is shared state — one person's new type shows in
    # everyone's picker and legend — so creating one is manager+, while reading
    # the list stays open to anyone who can see the map.
    "map_feature_types": {
        "create": [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "read":   [UserType.auxein_admin, UserType.company_admin, UserType.company_manager, UserType.company_user, UserType.contractor],
        "update": [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "delete": [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
    },
    "spatial_areas": {
        "create": [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "read":   [UserType.auxein_admin, UserType.company_admin, UserType.company_manager, UserType.company_user],
        "update": [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "delete": [UserType.auxein_admin, UserType.company_admin],
    },
    "subscriptions": {
        "read":   [UserType.auxein_admin, UserType.company_admin],
        "update": [UserType.auxein_admin],
    },
    "notifications": {
        "read":       [UserType.auxein_admin, UserType.company_admin, UserType.company_manager, UserType.company_user, UserType.contractor],
        "mark_read":  [UserType.auxein_admin, UserType.company_admin, UserType.company_manager, UserType.company_user, UserType.contractor],
    },
}

# Data scope per user type
SCOPE: dict[str, str] = {
    UserType.auxein_admin:    "global",        # Access all tenants
    UserType.company_admin:   "tenant",        # Own company only
    UserType.company_manager: "tenant",        # Own company only
    UserType.company_user:    "tenant",        # Own company only
    UserType.contractor:      "relationship",  # Active relationships only
}

# Platform access per user type
PLATFORM: dict[str, list[str]] = {
    UserType.auxein_admin:    ["web"],
    UserType.company_admin:   ["web", "mobile"],
    UserType.company_manager: ["web", "mobile"],
    UserType.company_user:    ["mobile"],
    UserType.contractor:      ["web", "mobile"],
}


def has_permission(user_type: str, module: str, action: str) -> bool:
    """Check if a user_type has permission for module.action."""
    module_perms = PERMISSIONS.get(module)
    if not module_perms:
        return False
    allowed_types = module_perms.get(action, [])
    return user_type in allowed_types


def get_scope(user_type: str) -> str:
    """Get the data scope for a user type."""
    return SCOPE.get(user_type, "tenant")


def get_platform_access(user_type: str) -> list[str]:
    """Get the platform access list for a user type."""
    return PLATFORM.get(user_type, [])
