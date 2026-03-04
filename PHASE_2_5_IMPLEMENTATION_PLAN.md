# Phase 2.5 — User Types & Permissions Overhaul

## Implementation Plan

> Generated: March 2026
> Prerequisite: `DISCOVERY_REPORT.md` reviewed and approved
> Estimated steps: 12 (sequential, each testable independently)

---

## Architectural Decisions

These decisions were informed by the Phase 0 discovery audit.

### D1: Keep contractors as a separate table

**Decision:** Do NOT merge `contractors` into `users`. Keep the existing `contractors` table and separate auth flow.

**Rationale:**
- The `contractors` table has 50+ specialised columns (insurance, biosecurity, verification documents, equipment, movement tracking) that have no equivalent on `users`.
- Merging would create a massively sparse table with nullable columns.
- The existing dual-login flow (checks both tables with timing-safe comparison) already works.
- `contractor` becomes a `user_type` value in the JWT but still resolves to the `Contractor` model.

**Impact:** The new `user_type` enum on the `users` table will have 4 values: `auxein_admin`, `company_admin`, `company_manager`, `company_user`. Contractors keep their separate table but participate in the unified permission system via the JWT `user_type: "contractor"` claim.

### D2: Auxein Admin lives on the `users` table

**Decision:** `auxein_admin` is a `user_type` value on the `users` table, not on `public_users`.

**Rationale:**
- The Insights admin panel (`require_admin` on `PublicUser.is_admin`) is for content/editorial administration. This remains unchanged.
- `auxein_admin` is a platform-level super-admin for the Pro app (cross-tenant access, system config). This is a different concern.
- The current `@auxein.co.nz` domain check on the Insights side stays as-is — it's a lightweight editorial gate, not a platform permission system.

**Impact:** `auxein_admin` users can access any company's data. The permission system treats `scope: "global"` for this user type.

### D3: Code-level permission matrix (not database table)

**Decision:** Define permissions in `backend/core/permissions.py` as a Python dict. No `permissions` database table.

**Rationale:**
- The existing `ROLE_PERMISSIONS` dict in `schemas/user.py` and `RISK_PERMISSIONS` in `utils/risk_permissions.py` already use this pattern.
- A code-level matrix is version-controlled, testable, and doesn't require migrations to update.
- A database table adds complexity (admin UI to manage, cache invalidation, migration risk) for no current benefit. Can be added later if dynamic per-company permissions are needed.

### D4: Unify JWT implementation (fix public_security.py)

**Decision:** Move public user token creation to use `core/security/auth.py` with a `"public_access"` type claim, removing the duplicate implementation in `public_security.py`.

**Rationale:**
- The current dual-key setup (hardcoded default in `public_security.py`) is a security vulnerability.
- Both systems already use `python-jose` with HS256. Unifying them eliminates the hardcoded secret and reduces code duplication.

---

## Step-by-Step Implementation

### Step 1: Create the permission matrix module

**New file:** `backend/core/permissions.py`

**What it defines:**
```python
from enum import Enum

class UserType(str, Enum):
    auxein_admin = "auxein_admin"
    company_admin = "company_admin"
    company_manager = "company_manager"
    company_user = "company_user"
    contractor = "contractor"

# Module → actions → list of user_types that can perform the action
PERMISSIONS = {
    "tasks": {
        "create":          ["auxein_admin", "company_admin", "company_manager"],
        "read":            ["auxein_admin", "company_admin", "company_manager", "company_user", "contractor"],
        "read_assigned":   ["company_user", "contractor"],
        "update":          ["auxein_admin", "company_admin", "company_manager"],
        "update_own":      ["company_user", "contractor"],
        "delete":          ["auxein_admin", "company_admin"],
        "assign":          ["auxein_admin", "company_admin", "company_manager"],
        "approve":         ["auxein_admin", "company_admin", "company_manager"],
        "complete":        ["auxein_admin", "company_admin", "company_manager", "company_user", "contractor"],
    },
    "observations": {
        "create":          ["auxein_admin", "company_admin", "company_manager", "company_user", "contractor"],
        "read":            ["auxein_admin", "company_admin", "company_manager"],
        "read_own":        ["company_user", "contractor"],
        "update":          ["auxein_admin", "company_admin", "company_manager"],
        "delete":          ["auxein_admin", "company_admin"],
        "assign":          ["auxein_admin", "company_admin", "company_manager"],
    },
    "assets": {
        "create":          ["auxein_admin", "company_admin", "company_manager"],
        "read":            ["auxein_admin", "company_admin", "company_manager", "company_user", "contractor"],
        "update":          ["auxein_admin", "company_admin", "company_manager"],
        "delete":          ["auxein_admin", "company_admin"],
        "log_maintenance": ["auxein_admin", "company_admin", "company_manager", "company_user"],
    },
    "risks": {
        "create":          ["auxein_admin", "company_admin", "company_manager"],
        "read":            ["auxein_admin", "company_admin", "company_manager", "company_user"],
        "read_own":        ["company_user"],
        "update":          ["auxein_admin", "company_admin", "company_manager"],
        "delete":          ["auxein_admin", "company_admin"],
        "assign":          ["auxein_admin", "company_admin", "company_manager"],
    },
    "training": {
        "create":          ["auxein_admin", "company_admin"],
        "read":            ["auxein_admin", "company_admin", "company_manager", "company_user", "contractor"],
        "read_assigned":   ["company_user", "contractor"],
        "update":          ["auxein_admin", "company_admin"],
        "delete":          ["auxein_admin", "company_admin"],
        "assign":          ["auxein_admin", "company_admin", "company_manager"],
        "complete":        ["auxein_admin", "company_admin", "company_manager", "company_user", "contractor"],
    },
    "visitors": {
        "create":          ["auxein_admin", "company_admin", "company_manager", "company_user"],
        "read":            ["auxein_admin", "company_admin", "company_manager"],
        "update":          ["auxein_admin", "company_admin", "company_manager"],
        "delete":          ["auxein_admin", "company_admin"],
    },
    "timesheets": {
        "create":          ["auxein_admin", "company_admin", "company_manager", "company_user", "contractor"],
        "read":            ["auxein_admin", "company_admin", "company_manager"],
        "read_own":        ["company_user", "contractor"],
        "update":          ["auxein_admin", "company_admin", "company_manager"],
        "delete":          ["auxein_admin", "company_admin"],
        "approve":         ["auxein_admin", "company_admin", "company_manager"],
        "submit":          ["company_user", "contractor"],
    },
    "calendar": {
        "read":            ["auxein_admin", "company_admin", "company_manager", "company_user"],
        "read_own":        ["company_user"],
        "read_assigned":   ["contractor"],
    },
    "reports": {
        "read":            ["auxein_admin", "company_admin", "company_manager"],
        "export":          ["auxein_admin", "company_admin", "company_manager"],
    },
    "blocks": {
        "create":          ["auxein_admin", "company_admin"],
        "read":            ["auxein_admin", "company_admin", "company_manager", "company_user", "contractor"],
        "update":          ["auxein_admin", "company_admin", "company_manager"],
        "delete":          ["auxein_admin", "company_admin"],
    },
    "contractors": {
        "create":          ["auxein_admin", "company_admin"],
        "read":            ["auxein_admin", "company_admin", "company_manager"],
        "update":          ["auxein_admin", "company_admin"],
        "delete":          ["auxein_admin", "company_admin"],
        "assign":          ["auxein_admin", "company_admin", "company_manager"],
    },
    "users": {
        "create":          ["auxein_admin", "company_admin"],
        "read":            ["auxein_admin", "company_admin", "company_manager"],
        "update":          ["auxein_admin", "company_admin"],
        "delete":          ["auxein_admin", "company_admin"],
    },
    "settings": {
        "read":            ["auxein_admin", "company_admin"],
        "update":          ["auxein_admin", "company_admin"],
    },
    "billing": {
        "read":            ["auxein_admin", "company_admin"],
        "update":          ["auxein_admin", "company_admin"],
    },
    "files": {
        "upload":          ["auxein_admin", "company_admin", "company_manager", "company_user"],
        "read":            ["auxein_admin", "company_admin", "company_manager", "company_user", "contractor"],
        "delete":          ["auxein_admin", "company_admin"],
    },
    "climate": {
        "read":            ["auxein_admin", "company_admin", "company_manager", "company_user"],
        "import":          ["auxein_admin", "company_admin"],
        "delete":          ["auxein_admin", "company_admin"],
    },
    "spatial_areas": {
        "create":          ["auxein_admin", "company_admin", "company_manager"],
        "read":            ["auxein_admin", "company_admin", "company_manager", "company_user"],
        "update":          ["auxein_admin", "company_admin", "company_manager"],
        "delete":          ["auxein_admin", "company_admin"],
    },
    "subscriptions": {
        "read":            ["auxein_admin", "company_admin"],
        "update":          ["auxein_admin"],
    },
}

# Scope definitions
SCOPE = {
    "auxein_admin":    "global",       # Access all tenants
    "company_admin":   "tenant",       # Own company only
    "company_manager": "tenant",       # Own company only
    "company_user":    "tenant",       # Own company only
    "contractor":      "relationship", # Active relationships only
}

# Platform access
PLATFORM = {
    "auxein_admin":    ["web"],
    "company_admin":   ["web", "mobile"],
    "company_manager": ["web", "mobile"],
    "company_user":    ["mobile", "web_limited"],
    "contractor":      ["web", "mobile"],
}

def has_permission(user_type: str, module: str, action: str) -> bool:
    """Check if a user_type has permission for module.action"""
    module_perms = PERMISSIONS.get(module)
    if not module_perms:
        return False
    allowed_types = module_perms.get(action, [])
    return user_type in allowed_types

def get_scope(user_type: str) -> str:
    """Get the data scope for a user type"""
    return SCOPE.get(user_type, "tenant")
```

**Files changed:** 1 new file
**Risk:** None (additive only)

---

### Step 2: Add `user_type` column to `users` table (Alembic migration)

**New file:** `alembic/versions/xxx_add_user_type_to_users.py`

**Migration logic:**
```python
# Forward migration
op.add_column('users', sa.Column('user_type', sa.String(20), nullable=True))

# Backfill from existing role
op.execute("""
    UPDATE users SET user_type = CASE
        WHEN role IN ('admin', 'owner') THEN 'company_admin'
        WHEN role = 'manager' THEN 'company_manager'
        WHEN role IN ('user', 'viewer') THEN 'company_user'
        ELSE 'company_user'
    END
""")

# Specific override for Pete Taylor / Auxein system admin
op.execute("""
    UPDATE users SET user_type = 'auxein_admin'
    WHERE email = 'pete.taylor@auxein.co.nz'
""")

# Make non-nullable after backfill
op.alter_column('users', 'user_type', nullable=False, server_default='company_user')

# Add index
op.create_index('ix_users_user_type', 'users', ['user_type'])
```

**Reverse migration:**
```python
op.drop_index('ix_users_user_type')
op.drop_column('users', 'user_type')
```

**Note:** The old `role` column is NOT dropped yet. It stays for backward compatibility during the transition. It will be removed in Step 12 after all references are confirmed updated.

**Files changed:** 1 new migration file
**Risk:** Low — additive column, backfill is safe

---

### Step 3: Update the User model

**File:** `backend/db/models/user.py`

**Changes:**
1. Add `user_type` column alongside existing `role`:
   ```python
   user_type = Column(String(20), nullable=False, default="company_user", index=True)
   ```

2. Update `has_permission()` method to use the new permission matrix:
   ```python
   def has_permission(self, module: str, action: str) -> bool:
       from core.permissions import has_permission
       return has_permission(self.user_type, module, action)
   ```

3. Add `is_auxein_admin` property:
   ```python
   @property
   def is_auxein_admin(self):
       return self.user_type == "auxein_admin"
   ```

4. Update `can_manage_user()`, `can_invite_users()`, `can_invite_role()` to use `user_type`.

5. Keep `role` field readable but add a deprecation comment.

**Files changed:** 1
**Risk:** Low — old `role` field still works, `has_permission()` signature changes from 1 arg to 2

---

### Step 4: Update the Contractor model for permission compatibility

**File:** `backend/db/models/contractor.py`

**Changes:**
1. Add a read-only `user_type` property:
   ```python
   @property
   def user_type(self) -> str:
       return "contractor"
   ```

2. Add `has_permission()` method (delegates to the same matrix):
   ```python
   def has_permission(self, module: str, action: str) -> bool:
       from core.permissions import has_permission
       return has_permission("contractor", module, action)
   ```

This makes `Contractor` duck-type compatible with `User` for permission checks — any code that does `current_user.has_permission(module, action)` works for both.

**Files changed:** 1
**Risk:** None (additive only)

---

### Step 5: Create `require_permission()` dependency

**File:** `backend/api/deps.py`

**New dependency function:**
```python
from core.permissions import has_permission as check_permission, get_scope

def require_permission(module: str, action: str):
    """
    FastAPI dependency factory.
    Usage: current_user = Depends(require_permission("tasks", "create"))
    Returns the authenticated user/contractor if they have permission.
    Raises 403 if not.
    """
    def _check(
        current_entity: Union[User, Contractor] = Depends(get_current_user_or_contractor)
    ) -> Union[User, Contractor]:
        user_type = current_entity.user_type
        if not check_permission(user_type, module, action):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {module}.{action} not allowed for {user_type}"
            )
        return current_entity
    return _check
```

**Also add specialised variants:**
```python
def require_company_user_permission(module: str, action: str):
    """Same as require_permission but only allows company users (not contractors)."""
    def _check(current_user: User = Depends(get_current_user)) -> User:
        if not check_permission(current_user.user_type, module, action):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {module}.{action}"
            )
        return current_user
    return _check
```

**Update `get_current_user()`:**
- After loading the user from DB, set `user_type` from the database column (not from JWT claim, which could be stale).
- The JWT `user_type` is used only for routing (User vs Contractor table lookup).

**Update `get_current_user_or_contractor()`:**
- For `auxein_admin` scope, skip company_id enforcement (global access).

**Files changed:** 1
**Risk:** Medium — central auth dependency, must not break existing flows. Add new functions alongside existing ones, don't modify signatures of existing functions yet.

---

### Step 6: Update JWT token creation to include `user_type`

**File:** `backend/api/v1/auth.py`

**Changes to the login endpoint (lines 442-466):**

Replace `role` claim with `user_type` claim from the database:
```python
token_data = {
    "user_type": "company_user" if user_type == "company_user" else "contractor",
    "user_type_role": authenticated_user.user_type if user_type == "company_user" else "contractor",
    "client_type": client_type,
    "role": authenticated_user.role if user_type == "company_user" else None,  # Keep for backward compat
    "company_id": authenticated_user.company_id if user_type == "company_user" else None,
    "company_ids": company_ids if user_type == "contractor" else None,
    "contractor_id": authenticated_user.id if user_type == "contractor" else None,
}
```

**Update `EnhancedToken` response** to include `user_type_role` (the new 5-tier type):
```python
class EnhancedToken(Token):
    user_type: str            # "company_user" | "contractor" (keeps routing working)
    user_type_role: str       # "auxein_admin" | "company_admin" | "company_manager" | "company_user" | "contractor"
    user_id: int
    username: str
    full_name: Optional[str] = None
    role: Optional[str] = None       # Deprecated, kept for frontend backward compat
    company_id: Optional[int] = None
    company_ids: Optional[list[int]] = None
```

**File:** `backend/schemas/token.py`
- Add `user_type_role` field to `EnhancedToken`

**Files changed:** 2
**Risk:** Medium — must maintain backward compatibility with existing frontend token parsing

---

### Step 7: Unify public user JWT (fix security vulnerability)

**File:** `backend/core/public_security.py`

**Changes:**
1. Remove the hardcoded `SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")`
2. Import `settings` from `core.config` and use `settings.SECRET_KEY`
3. Use `create_access_token()` from `core/security/auth.py` with `extra_data={"type": "public_access", "user_id": user.id}`
4. Update `decode_access_token()` to use the shared `decode_token()` function
5. Keep the `get_current_public_user()` and `get_optional_public_user()` dependencies unchanged in signature

**Files changed:** 1
**Risk:** Medium — existing public user tokens will be invalidated (users will need to re-login). This is acceptable since the fix closes a security vulnerability.

---

### Step 8: Update route handlers — replace ad-hoc role checks with `require_permission()`

This is the highest-volume change. Each file is updated independently and can be tested in isolation.

**Approach:** For each route file, replace inline role checks with the new dependency. The mapping below shows every change.

#### 8a. `admin.py` (11 checks → `require_permission("users", "create/read/update/delete")`)

| Line | Current Check | New Dependency |
|------|--------------|----------------|
| 124 | `if current_user.role != "admin"` | `Depends(require_company_user_permission("users", "create"))` |
| 289, 318, 346, 398, 430, 516, 565, 608, 645 | `if current_user.role != "admin"` | `Depends(require_company_user_permission("users", "read/update/delete"))` |
| 470 | `if current_user.role not in ["admin", "manager"]` | `Depends(require_company_user_permission("users", "read"))` |

#### 8b. `tasks.py` (5 checks)

| Line | Current Check | New Dependency |
|------|--------------|----------------|
| 136 | `if current_user.role not in ["admin", "manager"]` | `Depends(require_permission("tasks", "create"))` |
| 223 | `if current_user.role not in ["admin", "manager"]` | `Depends(require_permission("tasks", "create"))` |
| 250 | `if current_user.role != "admin"` | `Depends(require_permission("tasks", "delete"))` |
| 529 | `if current_user.role not in ["admin", "manager"] and task.created_by != current_user.id` | `Depends(require_permission("tasks", "update"))` + keep ownership fallback for `update_own` |

#### 8c. `timesheets.py` (8 checks)

| Line | Current Check | Replacement |
|------|--------------|-------------|
| 49 | `if current_user.role == "admin"` (filtering) | `if current_user.has_permission("timesheets", "read")` |
| 60 | `if current_user.role != "admin" and day.user_id != current_user.id` | `if not current_user.has_permission("timesheets", "update") and day.user_id != current_user.id` |
| 147, 186 | `if current_user.role not in ("admin", "manager")` | `if not current_user.has_permission("timesheets", "read")` |
| 214 | `if current_user.role not in ("admin", "manager") and ...` | `if not current_user.has_permission("timesheets", "delete") and ...` |
| 254 | `if day.user_id != current_user.id and current_user.role != "admin"` | `if day.user_id != current_user.id and not current_user.has_permission("timesheets", "approve")` |
| 289, 324 | `if current_user.role not in ("admin", "manager")` | `if not current_user.has_permission("timesheets", "read")` |

#### 8d. `training.py` (16 checks — already uses `has_permission()`)

These already call `current_user.has_permission("manage_training")`. Update the permission strings to the new module.action format:
- `has_permission("manage_training")` → `has_permission("training", "create")` or `"update"` as appropriate
- `has_permission("view_training")` → `has_permission("training", "read")`

#### 8e. `assets.py` (5 checks), `calibrations.py` (6), `maintenance.py` (5)

Replace `if user.role != "admin" and asset.company_id != user.company_id` pattern with:
```python
if not current_user.has_permission("assets", "read"):
    # Enforce company scope
    if asset.company_id != current_user.company_id:
        raise HTTPException(403, "Access denied")
```

For `auxein_admin`, the scope check is skipped (global access).

#### 8f. `companies.py` (4 checks)

| Current | New |
|---------|-----|
| `if current_user.role != "admin"` | `if not current_user.has_permission("settings", "update")` |
| subscription update check | `if not current_user.has_permission("billing", "update")` |

#### 8g. `parcels.py` (3 checks — uses legacy "owner" role)

Replace `if current_user.role not in ["admin", "owner"]` with `if not current_user.has_permission("blocks", "update")`.

#### 8h. `files.py` (6 checks), `spatial_areas.py` (6), `climate.py` (3), `subscriptions.py` (1)

Same pattern: replace `role != "admin"` with `has_permission(module, action)`.

#### 8i. `risk_management.py` (2 checks + `RiskPermissions` utility)

**File:** `backend/utils/risk_permissions.py`

Update `RiskPermissions` static methods to delegate to the new matrix:
```python
@staticmethod
def can_create_risk(user) -> bool:
    return user.has_permission("risks", "create")
```

#### 8j. Scope enforcement for `auxein_admin`

In every route that filters by `company_id`, add a bypass for `auxein_admin`:
```python
if current_user.user_type != "auxein_admin":
    query = query.filter(Model.company_id == current_user.company_id)
# else: auxein_admin sees all tenants
```

**Files changed:** ~15 route files + 1 utility
**Risk:** HIGH — this is the largest change. Must be done file-by-file with tests after each.

---

### Step 9: Update User schemas

**File:** `backend/schemas/user.py`

**Changes:**
1. Add `user_type` field to `UserBase`, `User`, `UserInDB`, `UserWithCompany`, `UserSummary`:
   ```python
   user_type: str = "company_user"
   ```

2. Add `user_type` to `UserCreate` and `UserUpdate`:
   ```python
   user_type: Optional[str] = None
   ```

3. Add validator for `user_type`:
   ```python
   @validator("user_type")
   def validate_user_type(cls, v):
       allowed = ["auxein_admin", "company_admin", "company_manager", "company_user"]
       if v not in allowed:
           raise ValueError(f"user_type must be one of: {', '.join(allowed)}")
       return v
   ```

4. Replace `ROLE_PERMISSIONS` dict with import from `core.permissions`:
   ```python
   from core.permissions import PERMISSIONS, has_permission
   ```

5. Keep `role` field in schemas (deprecated, for backward compat) but mark it optional.

**Files changed:** 1
**Risk:** Medium — schema changes affect API response shape. Frontend may need updates.

---

### Step 10: Update frontend AuthContext and navigation

#### 10a. Shared AuthContext (`packages/shared/src/contexts/AuthContext.jsx`)

**Changes:**
1. Store `user_type_role` from login response (the 5-tier type):
   ```javascript
   const [userTypeRole, setUserTypeRole] = useState(null);
   // On login: setUserTypeRole(response.user_type_role)
   ```

2. Add permission helper:
   ```javascript
   const hasPermission = useCallback((module, action) => {
       // Client-side mirror of backend PERMISSIONS matrix
       return PERMISSIONS[module]?.[action]?.includes(userTypeRole) ?? false;
   }, [userTypeRole]);
   ```

3. Expose in context value:
   ```javascript
   const value = {
       ...existing,
       userTypeRole,           // "auxein_admin" | "company_admin" | etc.
       hasPermission,          // (module, action) => boolean
       isAuxeinAdmin: () => userTypeRole === 'auxein_admin',
       isCompanyAdmin: () => userTypeRole === 'company_admin',
       isManager: () => userTypeRole === 'company_manager',
   };
   ```

#### 10b. Permission constants (`packages/shared/src/permissions.js`) — NEW FILE

Mirror the backend permission matrix as a JS module so `hasPermission()` works client-side without API calls. This file should be auto-generated from the backend or manually synced.

#### 10c. ProtectedRoute (`packages/web/src/components/ProtectedRoute.jsx`)

**Changes:** Add optional `module` and `action` props:
```jsx
function ProtectedRoute({ children, module, action }) {
    const { isAuthenticated, loading, hasPermission } = useAuth();

    if (loading) return <LoadingSpinner />;
    if (!isAuthenticated) return <Navigate to="/login" replace />;
    if (module && action && !hasPermission(module, action)) {
        return <Navigate to="/" replace />;
    }
    return children;
}
```

#### 10d. Navigation components

**`Navigation.jsx`**, **`MobileNavigation.jsx`**, **`AppBar.jsx`:**

Filter nav items based on `hasPermission`:
```jsx
const navItems = [
    { path: "/", label: "Home", icon: <Home />, always: true },
    { path: "/maps", label: "Map", module: "blocks", action: "read" },
    { path: "/observations", label: "Observations", module: "observations", action: "read" },
    { path: "/tasks", label: "Tasks", module: "tasks", action: "read" },
    { path: "/assets", label: "Assets", module: "assets", action: "read" },
    { path: "/timesheets", label: "Timesheets", module: "timesheets", action: "read" },
    { path: "/training", label: "Training", module: "training", action: "read" },
    { path: "/RiskDashboard", label: "Risk", module: "risks", action: "read" },
    { path: "/Insights", label: "Insights", module: "reports", action: "read" },
].filter(item => item.always || hasPermission(item.module, item.action));
```

#### 10e. Page-level role checks

Update pages that do inline role checks:

| File | Current | New |
|------|---------|-----|
| `TrainingModules.jsx:47` | `user?.role === 'admin' \|\| user?.role === 'manager'` | `hasPermission('training', 'create')` |
| `ModuleEditor.jsx:37` | `user?.role === 'admin' \|\| user?.role === 'manager'` | `hasPermission('training', 'update')` |
| `TimesheetSystem.jsx:357` | `['manager', 'admin'].includes(user.role)` | `hasPermission('timesheets', 'approve')` |
| `Profile.jsx:27` | `user?.email === 'pete.taylor@auxein.co.nz'` | `isAuxeinAdmin()` |
| `CompanyUserManagement.jsx:512` | Hardcoded role list | Use `UserType` enum values |

#### 10f. Update `authService.js` metadata storage

Add `userTypeRole` to stored metadata:
```javascript
const metadata = {
    ...existing,
    userTypeRole: loginResponse.user_type_role,
};
```

**Files changed:** ~8 frontend files + 1 new permissions constants file
**Risk:** Medium — frontend changes are visible to users immediately

---

### Step 11: Testing checklist

For each of the 5 user types, verify the following. This step produces no code changes — it's a manual/automated test pass.

**Create test accounts:**
1. `auxein_admin` — Pete Taylor or new test account
2. `company_admin` — existing admin user
3. `company_manager` — existing manager user
4. `company_user` — existing user
5. `contractor` — existing contractor with active relationship

**For each user type, verify:**

| Test | Expected |
|------|----------|
| Login returns correct `user_type_role` in token response | Pass |
| JWT contains correct `user_type` claim | Pass |
| `GET /api/auth/me` returns `user_type` field | Pass |
| Permitted endpoints return 200 | Pass |
| Forbidden endpoints return 403 with clear error message | Pass |
| Tenant isolation: no cross-company data leakage | Pass |
| `auxein_admin` can access all tenants | Pass |
| Contractor can only access companies with active relationships | Pass |
| `company_user` cannot access admin/settings endpoints | Pass |
| Navigation shows only permitted items | Pass |
| Public Insights app still works (no regression) | Pass |
| Public climate endpoints still work (no auth required) | Pass |
| Article/research endpoints still work | Pass |

---

### Step 12: Deprecate old `role` field

**After all tests pass and frontend is confirmed working with `user_type`:**

1. **Alembic migration:** Drop the `role` column from `users` table
2. **Remove** `role` from all schemas and model
3. **Remove** legacy `ROLE_PERMISSIONS` dict from `schemas/user.py`
4. **Remove** `getRoleBadge()` function from frontend components (or update to use `user_type`)
5. **Clean up** any remaining references to `current_user.role`

**Files changed:** 1 migration + cleanup across ~10 files
**Risk:** Low (by this point all references are already updated)

---

## File Change Summary

| Step | Files Created | Files Modified | Risk |
|------|--------------|----------------|------|
| 1 | `backend/core/permissions.py` | — | None |
| 2 | `alembic/versions/xxx_add_user_type.py` | — | Low |
| 3 | — | `backend/db/models/user.py` | Low |
| 4 | — | `backend/db/models/contractor.py` | None |
| 5 | — | `backend/api/deps.py` | Medium |
| 6 | — | `backend/api/v1/auth.py`, `backend/schemas/token.py` | Medium |
| 7 | — | `backend/core/public_security.py` | Medium |
| 8 | — | ~15 route files + `utils/risk_permissions.py` | **High** |
| 9 | — | `backend/schemas/user.py` | Medium |
| 10 | `packages/shared/src/permissions.js` | ~8 frontend files | Medium |
| 11 | — | — (testing only) | — |
| 12 | `alembic/versions/xxx_drop_role.py` | ~10 files (cleanup) | Low |

**Total: ~3 new files, ~35 modified files**

---

## Implementation Order & Dependencies

```
Step 1: Permission matrix (standalone, no dependencies)
  └─→ Step 2: Database migration (requires Step 1 for enum values)
      └─→ Step 3: User model update (requires Step 2 for column)
          └─→ Step 4: Contractor model update (requires Step 1)
              └─→ Step 5: require_permission() dependency (requires Steps 3+4)
                  ├─→ Step 6: JWT token update (requires Step 3)
                  ├─→ Step 7: Public security fix (independent but logical here)
                  └─→ Step 8: Route handler updates (requires Step 5) ← LARGEST STEP
                      └─→ Step 9: Schema updates (can parallel with Step 8)
                          └─→ Step 10: Frontend updates (requires Steps 6+9)
                              └─→ Step 11: Testing (requires all above)
                                  └─→ Step 12: Deprecate old role (requires Step 11 pass)
```

---

## Rollback Strategy

Each step is designed to be independently reversible:

- **Steps 1-4:** Additive only. Revert = delete new file / drop column.
- **Steps 5-6:** New dependencies added alongside existing ones. Revert = remove new functions.
- **Step 7:** Public token key change. Revert = restore old `public_security.py`. Users re-login.
- **Step 8:** Route changes. Revert = git revert per-file. Old `role` field still exists until Step 12.
- **Steps 9-10:** Schema/frontend changes. Revert = git revert.
- **Step 12:** Only executed after full test pass. Revert = restore column from backup.

The key safety net: the old `role` column remains in the database until Step 12, so if anything goes wrong in Steps 3-11, the system can fall back to the old role-based checks.

---

## Critical Rules (from Development Plan)

1. **Backend changes must not break the live Insights app.** Every step includes regression testing against public endpoints.
2. **Shared package changes affect all three consumers.** Steps 10a-10f coordinate across web, insights, and shared.
3. **Tenant isolation is non-negotiable.** Step 8j adds `auxein_admin` global scope bypass — this must be carefully audited.
4. **Permissions enforced at API level, not just UI.** Step 8 is the backend enforcement. Step 10 is UI polish only.
5. **Alembic for all schema changes.** Steps 2 and 12 use reversible Alembic migrations.
