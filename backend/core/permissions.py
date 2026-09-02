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
    # Health-and-safety only, mobile only. Signs on and off a property, raises
    # incidents, signs visitors in, reads the risk register and the map. NO
    # tasks, NO observations, NO assets, NO timesheets, NO costs, NO reports.
    #
    # It exists to answer "who is on site right now" for everyone, not just
    # visitors and contractors — so it is deliberately the CHEAPEST account to
    # hand out, and correspondingly the narrowest.
    #
    # `users.user_type` is VARCHAR(20), not a Postgres enum, so adding a value
    # needs no migration. What it DOES need is the frontend mirror in
    # packages/shared/src/utils/permissions.js — a module or a type missing
    # there answers false for everyone, silently.
    general_user = "general_user"


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
    # Incidents and the risk register. A general_user can RAISE an incident and
    # READ the register — the point of putting an H&S-only account on a phone is
    # that the person who sees the hazard is the person who reports it — but
    # cannot update or close anything.
    "risks": {
        "create":   [UserType.auxein_admin, UserType.company_admin, UserType.company_manager, UserType.company_user, UserType.general_user],
        "read":     [UserType.auxein_admin, UserType.company_admin, UserType.company_manager, UserType.company_user, UserType.general_user],
        "read_own": [UserType.company_user, UserType.general_user],
        "update":   [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "delete":   [UserType.auxein_admin, UserType.company_admin],
        "assign":   [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
    },
    # Incidents were served for a long time with NO entry here at all, which
    # meant has_permission(anything, "incidents", ...) was False for every user
    # type including auxein_admin. Nothing 403'd, because the incident routes
    # never asked — but the frontend mirror had nothing to read, and the first
    # require_permission("incidents", ...) added would have locked out the whole
    # company. Reporting an incident is the one thing everybody on a site must
    # be able to do, contractors and the H&S account included.
    "incidents": {
        "create":   [UserType.auxein_admin, UserType.company_admin, UserType.company_manager, UserType.company_user, UserType.contractor, UserType.general_user],
        "read":     [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "read_own": [UserType.company_user, UserType.contractor, UserType.general_user],
        "update":   [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "delete":   [UserType.auxein_admin, UserType.company_admin],
        "close":    [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
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
        "create": [UserType.auxein_admin, UserType.company_admin, UserType.company_manager, UserType.company_user, UserType.general_user],
        "read":   [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "update": [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "delete": [UserType.auxein_admin, UserType.company_admin],
    },
    # general_user was added here 2026-09-02 (Pete's call). The H&S account was
    # scoped as the narrowest tier, but someone signing on to a site is often
    # also being paid for the day, and there is no reason to make them a second
    # account to record it. They get their OWN timesheet only — read_own and
    # submit, never read/approve across the company.
    "timesheets": {
        "create":  [UserType.auxein_admin, UserType.company_admin, UserType.company_manager, UserType.company_user, UserType.contractor, UserType.general_user],
        "read":    [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "read_own":[UserType.company_user, UserType.contractor, UserType.general_user],
        "update":  [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "delete":  [UserType.auxein_admin, UserType.company_admin],
        "approve": [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "submit":  [UserType.company_user, UserType.contractor, UserType.general_user],
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
    # Pay rates and task costs. Its OWN module rather than riding on
    # `timesheets:read`, which company_manager holds — reusing that would have
    # answered "who may see salaries" by accident, and every future grant of
    # timesheet visibility would have silently granted pay-rate visibility too.
    #
    # Admin only, decided 2026-08-28. This is the tightest sensible default:
    # widening it later is a one-line change, and narrowing it after managers
    # have seen what their crew earns is not a change you can make.
    #
    # Note that a task cost plus its hours reveals an hourly rate, so `read`
    # here gates the derived figures as tightly as the rates themselves.
    "costs": {
        "read":   [UserType.auxein_admin, UserType.company_admin],
        "create": [UserType.auxein_admin, UserType.company_admin],
        "update": [UserType.auxein_admin, UserType.company_admin],
        "delete": [UserType.auxein_admin, UserType.company_admin],
        "export": [UserType.auxein_admin, UserType.company_admin],
    },
    # general_user needs `read` (added 2026-09-02). Without it GET /properties
    # 403s, the incident and risk forms load an EMPTY property list, and since a
    # non-admin must supply a property_id the submit then fails — a 403 two
    # screens away from the request that actually caused it. Reading the names
    # of the sites you may be standing on is the floor for an H&S account;
    # create/update/delete stay with admins.
    "properties": {
        "create": [UserType.auxein_admin, UserType.company_admin],
        "read":   [UserType.auxein_admin, UserType.company_admin, UserType.company_manager, UserType.company_user, UserType.general_user],
        "update": [UserType.auxein_admin, UserType.company_admin],
        "delete": [UserType.auxein_admin, UserType.company_admin],
        "manage": [UserType.auxein_admin, UserType.company_admin],
    },
    "blocks": {
        "create": [UserType.auxein_admin, UserType.company_admin],
        "read":   [UserType.auxein_admin, UserType.company_admin, UserType.company_manager, UserType.company_user, UserType.contractor, UserType.general_user],
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
        "read":   [UserType.auxein_admin, UserType.company_admin, UserType.company_manager, UserType.company_user, UserType.contractor, UserType.general_user],
        "update": [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "delete": [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
    },
    "spatial_areas": {
        "create": [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "read":   [UserType.auxein_admin, UserType.company_admin, UserType.company_manager, UserType.company_user, UserType.general_user],
        "update": [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "delete": [UserType.auxein_admin, UserType.company_admin],
    },
    "subscriptions": {
        "read":   [UserType.auxein_admin, UserType.company_admin],
        "update": [UserType.auxein_admin],
    },
    "notifications": {
        "read":       [UserType.auxein_admin, UserType.company_admin, UserType.company_manager, UserType.company_user, UserType.contractor, UserType.general_user],
        "mark_read":  [UserType.auxein_admin, UserType.company_admin, UserType.company_manager, UserType.company_user, UserType.contractor, UserType.general_user],
    },
    # Signing on and off a PROPERTY. Its own module rather than riding on
    # `visitors`: a visitor record is about someone who does not work here, and
    # this is about someone who does. `read` is who-is-on-site-now and stops at
    # manager; `create` is signing yourself on, which everyone with the app can
    # do for themselves and nobody can do for anyone else.
    "site_attendance": {
        "create": [UserType.auxein_admin, UserType.company_admin, UserType.company_manager, UserType.company_user, UserType.contractor, UserType.general_user],
        "read":   [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "update": [UserType.auxein_admin, UserType.company_admin, UserType.company_manager],
        "delete": [UserType.auxein_admin, UserType.company_admin],
    },
}

# Data scope per user type
SCOPE: dict[str, str] = {
    UserType.auxein_admin:    "global",        # Access all tenants
    UserType.company_admin:   "tenant",        # Own company only
    UserType.company_manager: "tenant",        # Own company only
    UserType.company_user:    "tenant",        # Own company only
    UserType.contractor:      "relationship",  # Active relationships only
    UserType.general_user:    "tenant",        # Own company only
}

# Platform access per user type
PLATFORM: dict[str, list[str]] = {
    UserType.auxein_admin:    ["web"],
    UserType.company_admin:   ["web", "mobile"],
    UserType.company_manager: ["web", "mobile"],
    UserType.company_user:    ["mobile"],
    UserType.contractor:      ["web", "mobile"],
    # Mobile only, and enforced at login rather than here — see auth.py STEP 4.
    UserType.general_user:    ["mobile"],
}


# --- The legacy `users.role` vocabulary -------------------------------------
#
# `users.role` predates user_type and was meant to be replaced by it. It has
# not been, so both columns are still written and every write has to keep them
# in step. Before this was centralised the mapping existed in FOUR places
# (accept_invitation, login_with_temp_credentials, PUT /admin/users/{id}/role,
# and a validator list in schemas/invitation.py) and they had already drifted:
# the invite form offered "viewer", which three of the four rejected outright.
#
# One list, one map. A surface that offers a role the map does not carry is a
# 422 or a 400 the user cannot act on.
ROLE_TO_USER_TYPE: dict[str, str] = {
    "admin":   UserType.company_admin.value,
    "manager": UserType.company_manager.value,
    "user":    UserType.company_user.value,
    # Health-and-safety only. See the UserType.general_user note above.
    "general": UserType.general_user.value,
}

# The roles an admin may assign or invite. Derived, so it cannot drift.
ASSIGNABLE_ROLES: list[str] = list(ROLE_TO_USER_TYPE)

# user_types refused on the web client. Enforced at /auth/login STEP 4 and
# mirrored on the temp-credential path; PLATFORM above is still dormant.
MOBILE_ONLY_USER_TYPES: frozenset[str] = frozenset({
    UserType.company_user.value,
    UserType.general_user.value,
})


def user_type_for_role(role: str) -> str:
    """The user_type a legacy role resolves to. Unknown roles get the narrowest
    company tier rather than an elevated one."""
    return ROLE_TO_USER_TYPE.get(role, UserType.company_user.value)


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
