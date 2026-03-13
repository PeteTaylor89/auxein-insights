# Auxein Grow — v1 Build Plan
### For Claude Code Execution

> **Source documents:** `GROW_V1_PLAN.md` (discovery-annotated, 2026-03-12),
> `PHASES_3_4_5_IMPLEMENTATION_PLAN.md`, `PHASE_2_5_ALPHA_TESTS.md`
>
> **Scope status:** LOCKED. Discovery complete. No new v1 features may be added.
> All additions go to the `## BACKLOG` section at the end of this file.
>
> **Codebase baseline:** 62 tables · ~600 endpoints · 57 Alembic migrations
> **Current Alembic head:** `add_user_type_to_users` (2026-03-05)

---

## NON-NEGOTIABLE ARCHITECTURE RULES

Apply these to every task in this plan without exception.

**R1. Do not break the live Insights app.**
`insights.auxein.co.nz` is in production. After every backend change, regression-test:
- `GET /api/v1/public/climate/*` (public climate endpoints)
- `GET /api/auth/` (auth flow)
- `GET /api/v1/gis/geojson` and `GET /api/v1/regions/geojson` (dual-auth endpoints)

**R2. One backend, three consumers.**
FastAPI on AWS EB serves: Pro web app (port 5173), Regional Insights (port 5174 /
insights.auxein.co.nz), and mobile (React Native/Expo). Changes to `packages/shared/`
affect all three. Test all three consumers after shared package changes.

**R3. Alembic only.**
No raw `ALTER TABLE`. Every schema change = one Alembic revision with a descriptive
slug. Run `alembic upgrade head` and verify on staging before prod.

**R4. `require_permission()` on every new endpoint.**
Use `require_permission(module, action)` from `core/permissions.py` on every new
route. Never rely on frontend role checks for data access.

**R5. `company_id` on `VineyardBlock` is a denormalised sync field.**
It must always equal the `managing_company_id` of the property's active
`ManagementRelationship`. All writes to `management_relationships` must trigger
the sync (see Phase A, step A12). Never update `company_id` on a block directly
in isolation.

**R6. No scope creep.**
Features listed in the `## BACKLOG` section do not get built now. Mark relevant
code with `# TODO v1.x: <description>` as a pointer for later.

**R7. Clean up tech debt in context.**
When working in or near a file that contains known tech debt (see Appendix),
fix it. Do not create new instances of the same debt.

**R8. Test at every phase gate.**
No phase is complete until its phase gate test checklist passes AND the Regional
Insights regression suite passes. Do not begin the next phase until the gate is green.

---

## TESTING STRATEGY

Three layers of testing apply throughout the build.

### Layer 1 — Task-Level Tests (during build)

Each task (A1, A2, … F4) includes inline test criteria (marked **Test:** in the task
description). The developer verifies these pass before marking the task done. These are
manual API calls (curl / Postman / httpie) or browser checks — not automated test suites.

### Layer 2 — Phase Gate Tests (at phase boundary)

A structured checklist at the end of each phase. All items must pass before the next phase
starts. Phase gate tests are defined in each phase section below (look for `### PHASE X — TEST GATE`).

Phase gate tests cover:
- **Functional verification** — every new endpoint responds correctly for each user type
- **Permission matrix** — confirm `require_permission()` blocks/allows correctly per role
- **Data integrity** — migrations applied cleanly, backfills correct, FKs enforced
- **Frontend smoke** — new pages load, navigation works, no console errors

### Layer 3 — Regional Insights Regression (at every gate)

`insights.auxein.co.nz` is live in production. Every phase gate MUST include the full
Insights regression checklist below. A failure here blocks the phase from closing.

**Insights Regression Checklist:**

| # | Test | Method | Expected |
|---|------|--------|----------|
| IR-1 | Public climate endpoints | `GET /api/v1/public/climate/regions` | 200, returns region list |
| IR-2 | Public climate detail | `GET /api/v1/public/climate/marlborough` (or any valid region) | 200, returns climate data |
| IR-3 | Public auth flow | `POST /api/auth/public/register` (new user) then `POST /api/auth/public/login` | 201 then 200 with JWT |
| IR-4 | Public auth — existing user login | `POST /api/auth/public/login` (existing test user) | 200 with JWT containing correct fields |
| IR-5 | Dual-auth GeoJSON (anonymous) | `GET /api/v1/gis/geojson` (no auth header) | 200, returns public features |
| IR-6 | Dual-auth GeoJSON (authenticated) | `GET /api/v1/gis/geojson` (with public user JWT) | 200, returns enriched features |
| IR-7 | Regions GeoJSON | `GET /api/v1/regions/geojson` | 200, valid GeoJSON FeatureCollection |
| IR-8 | Articles list | `GET /api/v1/public/articles` | 200, returns article array |
| IR-9 | Article detail + SEO meta | `GET /api/v1/public/articles/{slug}` | 200, response includes `meta_title`, `meta_description` |
| IR-10 | Insights frontend loads | Browse `http://localhost:5174/` | Page renders, no console errors, Umami script present |
| IR-11 | Insights article page | Browse `http://localhost:5174/articles/{slug}` | Article renders with correct meta tags in `<head>` |
| IR-12 | Insights region page | Browse `http://localhost:5174/regions/{region}` | Region page renders with climate data |
| IR-13 | Shared package integrity | `npm run build` in `packages/insights/` | Build succeeds with zero errors |

If any IR test fails, the phase gate fails. Fix the regression before proceeding.

---

## RESOLVED SCOPE DECISIONS

These were flagged as ambiguous in the discovery report. They are now resolved.

| Item | Decision | Rationale |
|---|---|---|
| Metservice API | **DEFERRED → v1.x** | Does not exist in codebase. Harvest / ECAN / HBRC cover key NZ regions for v1. |
| ETc / evapotranspiration | **DEFERRED → v1.x** | Requires Penman-Monteith + wind speed sensor data. Harvest capability unconfirmed. |
| Soil moisture layer | **DEFERRED → v1.x** | No soil moisture data from Harvest sensors. Unconfirmed availability. |
| Push notifications | **DEFERRED → v1.x** | Mobile app is a stub. Cannot deliver push without a functioning mobile app. |
| Phenology-conditional mobile menu | **DEFERRED → v1.x** | Mobile app is a stub (Step M3.1 not yet started). |
| Voice-to-text in observations | **DEFERRED → v1.x** | Mobile and Web Speech API dependency. |
| Full PDF/Excel reporting | **DEFERRED → v1.x** | XL effort with no existing foundation. CSV export covers v1 compliance needs. |
| GrapeLink full API push | **DEFERRED → v1.x** | Export file (CSV) is sufficient for v1. API requires GrapeLink partner relationship. |
| S-Map soil reference | **DEFERRED → v1.x** | Data licence not yet secured. |
| GeoTIFF import | **DEFERRED → v1.x** | Complex format parsing. Low priority for v1. |
| Mobile app (full build) | **DEFERRED → v1.x** | Phases 3–5 mobile spec retained in `PHASES_3_4_5_IMPLEMENTATION_PLAN.md` as post-v1 reference. v1 ships as web-first. |

---

## DISCOVERY SUMMARY

| Module | EXISTS | PARTIAL | SCHEMA ONLY | NOT STARTED | Total |
|---|---|---|---|---|---|
| Onboarding | 2 | 1 | 0 | 3 | 6 |
| User Management | 5 | 0 | 0 | 3 | 8 |
| Contractors | 2 | 3 | 3 | 0 | 8 |
| Visitors | 4 | 0 | 0 | 0 | 4 |
| Operational Maps | 5 | 0 | 0 | 6 | 11 |
| Blocks / Areas | 5 | 1 | 0 | 1 | 7 |
| Map Builder | 1 | 1 | 0 | 2 | 4 |
| Task Engine | 5 | 1 | 0 | 1 | 7 |
| Observations | 3 | 3 | 0 | 1 | 7 |
| Asset Management | 4 | 1 | 0 | 0 | 5 |
| Risk Management | 6 | 0 | 0 | 0 | 6 |
| Timesheets | 2 | 1 | 0 | 0 | 3 |
| Training | 3 | 0 | 0 | 0 | 3 |
| Alerts & Notifications | 2 | 0 | 0 | 3 | 5 |
| Weather | 0 | 2 | 0 | 3 | 5 |
| Integrations | 1 | 1 | 0 | 4 | 6 |
| Intelligence Layer | 8 | 3 | 0 | 3 | 14 |
| **TOTALS** | **58** | **18** | **3** | **30** | **109** |

---

## PHASE A — FOUNDATION
**Must complete before any other phase. ~2 weeks.**

Phase A establishes the Property/Management model and fixes the permission bugs
that block all subsequent work. Nothing else starts until A1–A6 are done.

---

### A1 — Fix Phase 2.5 Permission Bugs

Five bugs confirmed in alpha testing (2026-03-05). Fix all before any new feature work.

#### Bug 1: `company_manager` gets 403 on users list
- **Symptom:** `NoneType object has no attribute HTTP_403_FORBIDDEN`
- **Location:** `backend/api/v1/users.py` — GET `/api/v1/users` endpoint
- **Fix:** Trace `require_permission("users", "read")`. Confirm `company_manager` is
  mapped to `"read"` on the `users` module in `core/permissions.py`. The error suggests
  the permission check itself is throwing rather than returning 403 — check for a
  `NoneType` dereference in `deps.py` `require_permission` implementation.
- **Test:** `company_manager` JWT → `GET /api/v1/users` → expect 200 with company-scoped list.

#### Bug 2: `company_user` can create assets and spatial areas
- **Symptom:** POST to `/api/v1/assets` and `/api/v1/spatial-areas` succeeds for `company_user`
- **Location:** `backend/api/v1/assets.py` and `backend/api/v1/spatial_areas.py`
- **Fix:** Add `require_permission("assets", "create")` and
  `require_permission("spatial_areas", "create")` to the POST endpoints if missing.
  Verify `company_user` is NOT mapped to `"create"` on these modules in `core/permissions.py`.
- **Test:** `company_user` JWT → `POST /api/v1/assets` → expect 403.

#### Bug 3: `userTypeRole` not persisting in localStorage
- **Symptom:** All users display as `company_user` after page reload
- **Location:** `packages/web/src/contexts/AuthContext.jsx`
- **Fix:** On login and token refresh, write `userTypeRole` to `localStorage` alongside
  the JWT. On app init, read from `localStorage` to restore. Ensure logout clears this key.
- **Test:** Login as `company_admin` → reload page → confirm role display is correct.

#### Bug 4: `tasksService.getFilteredTasks` is not a function
- **Symptom:** Runtime error when tasks filter is called
- **Location:** `packages/shared/src/api/tasksService.js`
- **Fix:** Verify the method exists and is exported. Check all call sites for the
  correct method name. Either add the missing method or update call sites to use
  the correct existing method name consistently.
- **Test:** Tasks list page loads without console error.

#### Bug 5: Risk dashboard `user_type` not in response
- **Symptom:** `user_type` field absent from risk dashboard API response
- **Location:** `backend/api/v1/risks.py` or `backend/services/integrated_risk_service.py`
- **Fix:** Determine whether `user_type` is needed in the response (for frontend
  display logic) or can be read from `AuthContext` instead. If it belongs in the
  response, add it to the response schema. If it should come from auth context,
  remove the frontend dependency on the API field.
- **Test:** Risk dashboard loads and displays correctly for all four `user_type` values.

**Also fix during A1 (tech debt — security):**
- `public_security.py`: Replace hardcoded `SECRET_KEY` default with an environment
  variable requirement that raises at startup if unset.
- Repo cleanup: Delete `email_utils - Copy.py` and `email_service - Copy.py` from repo.
- `climate_calculations.py`: Remove all DEBUG print statements.
- `cleanup_expired_blacklist()`: Add call to GitHub Actions daily schedule job.

---

### A2 — Migration: `properties` table

```
alembic revision --autogenerate -m "add_properties_table"
```

Verify autogenerate output matches the intended schema, then correct if needed:

```python
# backend/db/models/property.py  (NEW FILE)
class Property(Base):
    __tablename__ = "properties"

    id                       = Column(Integer, primary_key=True, index=True)
    name                     = Column(String(255), nullable=False)
    owner_company_id         = Column(Integer, ForeignKey("companies.id"), nullable=True)
    address                  = Column(Text, nullable=True)
    legal_description        = Column(Text, nullable=True)
    total_area_ha            = Column(Numeric(10, 4), nullable=True)
    region                   = Column(String(100), nullable=True)
    grapelink_grower_id      = Column(String(100), nullable=True)
    grapelink_property_code  = Column(String(100), nullable=True)
    created_at               = Column(DateTime, server_default=func.now())
    updated_at               = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    owner_company            = relationship("Company", foreign_keys=[owner_company_id],
                                             back_populates="owned_properties")
    management_relationships = relationship("ManagementRelationship", back_populates="property",
                                             order_by="ManagementRelationship.start_date")
    blocks                   = relationship("VineyardBlock", back_populates="property")
```

Add to `Company` model:
```python
owned_properties    = relationship("Property", foreign_keys="Property.owner_company_id",
                                    back_populates="owner_company")
managed_relationships = relationship("ManagementRelationship",
                                      foreign_keys="ManagementRelationship.managing_company_id",
                                      back_populates="managing_company")
```

Note: `grapelink_grower_id` and `grapelink_property_code` are included here directly.
Discovery confirmed these fields do NOT exist on `Company` either, so no removal needed.
Migration 006 from the original plan is therefore merged into this migration.

---

### A3 — Migration: `management_relationships` table

```
alembic revision --autogenerate -m "add_management_relationships_table"
```

```python
# backend/db/models/management_relationship.py  (NEW FILE)
class ManagementRelationship(Base):
    __tablename__ = "management_relationships"

    id                   = Column(Integer, primary_key=True, index=True)
    property_id          = Column(Integer, ForeignKey("properties.id"), nullable=False)
    managing_company_id  = Column(Integer, ForeignKey("companies.id"), nullable=False)
    start_date           = Column(Date, nullable=False)
    end_date             = Column(Date, nullable=True)     # NULL = currently active
    contract_reference   = Column(String(255), nullable=True)
    notes                = Column(Text, nullable=True)
    is_active            = Column(Boolean, default=True, nullable=False)
    created_by_user_id   = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at           = Column(DateTime, server_default=func.now())
    updated_at           = Column(DateTime, server_default=func.now(), onupdate=func.now())

    property         = relationship("Property", back_populates="management_relationships")
    managing_company = relationship("Company", foreign_keys=[managing_company_id],
                                    back_populates="managed_relationships")
    created_by       = relationship("User", foreign_keys=[created_by_user_id])
```

**Critical:** After autogenerate, manually add the partial unique index to the migration:
```python
# In the upgrade() function, after op.create_table():
op.create_index(
    "idx_one_active_manager",
    "management_relationships",
    ["property_id"],
    unique=True,
    postgresql_where=sa.text("is_active = TRUE")
)
```

And in downgrade():
```python
op.drop_index("idx_one_active_manager", table_name="management_relationships")
```

---

### A4 — Migration: `property_id` FK on `vineyard_blocks`

```
alembic revision --autogenerate -m "add_property_id_to_vineyard_blocks"
```

Adds `property_id` as a **nullable** FK to `vineyard_blocks`. Does NOT touch `company_id`.

Add to `VineyardBlock` model:
```python
property_id = Column(Integer, ForeignKey("properties.id"), nullable=True, index=True)
property    = relationship("Property", back_populates="blocks")
```

---

### A5 — Migration: Backfill properties from existing companies

```
alembic revision -m "backfill_properties_from_companies"
```

**Manual migration — do NOT use autogenerate.** Write `upgrade()` explicitly:

```python
def upgrade():
    conn = op.get_bind()

    # Get all companies that have at least one vineyard block
    companies = conn.execute(sa.text("""
        SELECT DISTINCT c.id, c.name, c.created_at
        FROM companies c
        INNER JOIN vineyard_blocks vb ON vb.company_id = c.id
        ORDER BY c.id
    """)).fetchall()

    for company in companies:
        start_date = company.created_at.date() if company.created_at else "2020-01-01"

        # Create one Property per company (safe 1:1 assumption for existing single-vineyard users)
        result = conn.execute(sa.text("""
            INSERT INTO properties
                (name, owner_company_id, grapelink_grower_id, grapelink_property_code,
                 created_at, updated_at)
            VALUES
                (:name, :company_id, NULL, NULL, NOW(), NOW())
            RETURNING id
        """), {"name": f"{company.name} Property", "company_id": company.id})
        property_id = result.scalar()

        # Create ManagementRelationship: owner = manager for all existing companies
        conn.execute(sa.text("""
            INSERT INTO management_relationships
                (property_id, managing_company_id, start_date, is_active, created_at, updated_at)
            VALUES
                (:property_id, :company_id, :start_date, TRUE, NOW(), NOW())
        """), {"property_id": property_id, "company_id": company.id, "start_date": start_date})

        # Backfill property_id on all blocks for this company
        conn.execute(sa.text("""
            UPDATE vineyard_blocks
            SET property_id = :property_id
            WHERE company_id = :company_id
        """), {"property_id": property_id, "company_id": company.id})


def downgrade():
    conn = op.get_bind()
    conn.execute(sa.text("UPDATE vineyard_blocks SET property_id = NULL"))
    conn.execute(sa.text("DELETE FROM management_relationships"))
    conn.execute(sa.text("DELETE FROM properties"))
```

---

### A6 — Migration: `user_property_scopes` table

```
alembic revision --autogenerate -m "add_user_property_scopes_table"
```

```python
# backend/db/models/user_property_scope.py  (NEW FILE)
class UserPropertyScope(Base):
    __tablename__ = "user_property_scopes"

    id          = Column(Integer, primary_key=True)
    user_id     = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    property_id = Column(Integer, ForeignKey("properties.id"), nullable=False, index=True)

    __table_args__ = (UniqueConstraint("user_id", "property_id", name="uq_user_property"),)

    user     = relationship("User", back_populates="property_scopes")
    property = relationship("Property")
```

Add to `User` model:
```python
property_scopes = relationship("UserPropertyScope", back_populates="user",
                                cascade="all, delete-orphan")
```

---

### A7 — PropertyService: Visibility Query Helper

**New file:** `backend/services/property_service.py`

This service is the single source of truth for "what can this user see?" All
block, task, observation, and risk query endpoints must call into this service
rather than implementing their own visibility logic.

```python
from typing import List
from sqlalchemy.orm import Session
from db.models.property import Property
from db.models.management_relationship import ManagementRelationship
from db.models.user_property_scope import UserPropertyScope
from db.models.user import User


def get_visible_property_ids(db: Session, current_user: User) -> List[int]:
    """
    Returns property IDs visible to the current user.

    Rules (in order):
    1. auxein_admin → all properties
    2. company_manager/company_user with UserPropertyScope rows → scoped to those properties
    3. company_admin/company_manager/company_user with NO scope rows →
       all properties where their company is the active managing_company_id
       UNION all properties where their company is the owner_company_id
    4. contractor → empty list (contractors access via task assignment, not property scope)
    """
    if current_user.user_type == "auxein_admin":
        return [p.id for p in db.query(Property.id).all()]

    if current_user.user_type == "contractor":
        return []

    # Check for explicit property scoping
    scopes = db.query(UserPropertyScope).filter(
        UserPropertyScope.user_id == current_user.id
    ).all()

    if scopes:
        return [s.property_id for s in scopes]

    # Default: all managed + all owned
    managed = db.query(ManagementRelationship.property_id).filter(
        ManagementRelationship.managing_company_id == current_user.company_id,
        ManagementRelationship.is_active == True
    ).all()

    owned = db.query(Property.id).filter(
        Property.owner_company_id == current_user.company_id
    ).all()

    return list({row[0] for row in managed} | {row[0] for row in owned})


def is_owner_viewing(db: Session, current_user: User, property_id: int) -> bool:
    """
    Returns True if the current user's company is the legal owner of the property
    but NOT the active managing company.

    This flag gates write operations: owners get read-only access to their properties
    when under external management. Enforced at endpoint level.
    """
    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        return False
    if prop.owner_company_id != current_user.company_id:
        return False

    active_manager = db.query(ManagementRelationship).filter(
        ManagementRelationship.property_id == property_id,
        ManagementRelationship.is_active == True
    ).first()

    if not active_manager:
        return False

    return active_manager.managing_company_id != current_user.company_id
```

---

### A8 — Property Schemas and CRUD Endpoints

**New files:**
- `backend/schemas/property.py`
- `backend/api/v1/properties.py`

**Schemas (`backend/schemas/property.py`):**
```python
class PropertyBase(BaseModel):
    name: str
    owner_company_id: Optional[int] = None
    address: Optional[str] = None
    legal_description: Optional[str] = None
    total_area_ha: Optional[Decimal] = None
    region: Optional[str] = None
    grapelink_grower_id: Optional[str] = None
    grapelink_property_code: Optional[str] = None

class PropertyCreate(PropertyBase):
    pass

class PropertyUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    legal_description: Optional[str] = None
    total_area_ha: Optional[Decimal] = None
    region: Optional[str] = None
    grapelink_grower_id: Optional[str] = None
    grapelink_property_code: Optional[str] = None

class PropertyOut(PropertyBase):
    id: int
    active_managing_company_id: Optional[int] = None   # derived at query time
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True

class ManagementRelationshipCreate(BaseModel):
    managing_company_id: int
    start_date: date
    contract_reference: Optional[str] = None
    notes: Optional[str] = None

class ManagementRelationshipOut(BaseModel):
    id: int
    property_id: int
    managing_company_id: int
    start_date: date
    end_date: Optional[date]
    contract_reference: Optional[str]
    is_active: bool
    created_at: datetime
    class Config:
        from_attributes = True
```

**Router (`backend/api/v1/properties.py`):**

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/v1/properties/` | `properties.read` | Scoped via `get_visible_property_ids()` |
| POST | `/api/v1/properties/` | `properties.create` | `company_admin` only |
| GET | `/api/v1/properties/{id}` | `properties.read` | 403 if not in visible list |
| PATCH | `/api/v1/properties/{id}` | `properties.update` | `company_admin` only; 403 if owner viewing |
| GET | `/api/v1/properties/{id}/blocks` | `properties.read` | Returns blocks for property |
| GET | `/api/v1/properties/{id}/management-history` | `properties.read` | All ManagementRelationship records ordered by start_date desc |
| POST | `/api/v1/properties/{id}/management-relationships` | `properties.manage` | Calls `transfer_management()` service (A12) |

Also add to company router:

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/v1/companies/{id}/managed-properties` | `properties.read` | All active managed properties |

**Add `properties` module to `core/permissions.py`:**
```python
"properties": {
    "auxein_admin":   ["read", "create", "update", "delete", "manage"],
    "company_admin":  ["read", "create", "update", "manage"],
    "company_manager":["read"],
    "company_user":   [],
    "contractor":     [],
},
```

**Register router in `backend/main.py`.**

---

### A9 — UserPropertyScope Endpoints

Add to user management router or create `backend/api/v1/user_property_scopes.py`:

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/v1/users/{id}/property-scopes` | `users.read` | Returns list of scoped property IDs for user |
| POST | `/api/v1/users/{id}/property-scopes` | `users.update` | Adds a property to user's scope |
| DELETE | `/api/v1/users/{id}/property-scopes/{property_id}` | `users.update` | Removes a property from user's scope |

If zero `UserPropertyScope` rows exist for a user, they see all properties managed
by their company (default open behaviour — backwards compatible). Document this clearly.

---

### A10 — Block Endpoint Updates

**Modified file:** `backend/api/v1/blocks.py`

Four changes required:

1. **`POST /api/v1/blocks/`** — Accept optional `property_id` in request body.
   Validate it against `get_visible_property_ids()`. If user has exactly one visible
   property and `property_id` is not supplied, default to that property.

2. **`GET /api/v1/blocks/`** — Add `property_id` as an optional query parameter.
   Always filter by `get_visible_property_ids()` as the base scope. If `property_id`
   is supplied, additionally filter to that property.

3. **All block-scoped write endpoints** — Add `is_owner_viewing()` check. If True,
   return `403` with body: `{"detail": "This property is under external management.
   Contact the managing company to make changes."}`.

4. **All block-scoped query endpoints** — Replace the current `company_id` filter
   with a `property_id IN get_visible_property_ids()` filter. Retain `company_id`
   filter as a fallback for blocks that do not yet have `property_id` set (pre-backfill
   data edge case, should be zero after A5 but defensive coding is required).

---

### A11 — Owner Read-Only Access

Owner read-only is enforced at the **endpoint level**, not via role. The rule:

> A user whose company is the `owner_company_id` on a property, but NOT the active
> `managing_company_id`, receives 200 OK on all GET endpoints for that property's
> data, but 403 on all POST/PATCH/DELETE endpoints.

Implementation:
- `is_owner_viewing()` helper (A7) returns the flag.
- Add check at the top of every write endpoint: `if is_owner_viewing(...): raise 403`.
- Endpoints affected: blocks (all writes), tasks (create/update), observations
  (create/update), assets (create/update for property-scoped assets).
- READ access requires no change — `get_visible_property_ids()` already includes
  owned properties regardless of who manages them.

---

### A12 — Management Transfer Service

**New file:** `backend/services/management_service.py`

```python
def transfer_management(
    db: Session,
    property_id: int,
    new_managing_company_id: int,
    start_date: date,
    contract_reference: Optional[str],
    created_by_user_id: int
) -> ManagementRelationship:
    """
    Atomically transfers active management of a property to a new company.

    Steps (all in one transaction):
    1. Deactivate all current active ManagementRelationships for property_id
       (set is_active=False, end_date = start_date - 1 day)
    2. Create new ManagementRelationship (is_active=True)
    3. Update company_id on all VineyardBlocks in this property to new_managing_company_id
    4. Add a "management_transfer" event to the BlockchainChain for each block
    5. Return the new ManagementRelationship

    Raises ValueError if new_managing_company_id is not a valid Company.
    """
```

**Blockchain event:** Add `"management_transfer"` to the valid node event types in
`BlockchainNode` (or the enum/list that controls this). The event payload should
include: previous_company_id, new_company_id, transfer_date, contract_reference.
BlockchainChain.company_id is already nullable — confirmed in discovery, no change needed.

This service is called by the `POST /api/v1/properties/{id}/management-relationships`
endpoint (A8).

---

### PHASE A — TEST GATE

**Do not start Phases B, C, D, or E until every item below passes.**

#### A-GT: Permission & Bug Fix Verification

| # | Test | Method | Expected |
|---|------|--------|----------|
| A-1 | Bug 1 fixed | `company_manager` JWT → `GET /api/v1/users` | 200 with company-scoped list |
| A-2 | Bug 2 fixed | `company_user` JWT → `POST /api/v1/assets` | 403 |
| A-3 | Bug 2 fixed (spatial) | `company_user` JWT → `POST /api/v1/spatial-areas` | 403 |
| A-4 | Bug 3 fixed | Login as `company_admin` → reload page → check role display | Role persists correctly |
| A-5 | Bug 4 fixed | Navigate to tasks list page | No console error for `getFilteredTasks` |
| A-6 | Bug 5 fixed | Load risk dashboard as `company_manager` | `user_type` present in response or UI handles correctly |
| A-7 | SECRET_KEY secured | Start backend without `SECRET_KEY` env var | Startup fails with clear error |
| A-8 | Backup files removed | Check repo for `*- Copy.py` files | None exist |

#### A-GT: Property Model & Migrations

| # | Test | Method | Expected |
|---|------|--------|----------|
| A-9 | Migrations apply cleanly | `alembic upgrade head` on fresh DB clone | Zero errors, all 5 new tables exist |
| A-10 | Backfill integrity | `SELECT count(*) FROM vineyard_blocks WHERE property_id IS NULL` | 0 rows (all blocks assigned) |
| A-11 | Backfill 1:1 | For each company with blocks: exactly 1 Property + 1 active ManagementRelationship | Confirmed via SQL |
| A-12 | Partial unique index | `INSERT` two active relationships for same property_id | DB raises unique violation |
| A-13 | Property CRUD | `company_admin` JWT → create, read, update property | All succeed with correct data |
| A-14 | Property read scoping | `company_user` JWT (Company A) → `GET /api/v1/properties` | Only sees Company A properties |
| A-15 | Property create denied | `company_manager` JWT → `POST /api/v1/properties` | 403 |

#### A-GT: Visibility & Owner Read-Only

| # | Test | Method | Expected |
|---|------|--------|----------|
| A-16 | `auxein_admin` sees all | `auxein_admin` JWT → `GET /api/v1/properties` | Returns all properties |
| A-17 | Scoped user sees subset | Create `UserPropertyScope` for user → `GET /api/v1/properties` | Only scoped properties returned |
| A-18 | Owner read-only — GET | Owner company (non-manager) JWT → `GET /api/v1/blocks?property_id=X` | 200 with block data |
| A-19 | Owner read-only — POST | Owner company (non-manager) JWT → `POST /api/v1/blocks` for that property | 403 with owner message |
| A-20 | Owner read-only — tasks | Owner company JWT → `POST /api/v1/tasks` for owned property | 403 |

#### A-GT: Management Transfer

| # | Test | Method | Expected |
|---|------|--------|----------|
| A-21 | Transfer succeeds | `POST /api/v1/properties/{id}/management-relationships` with new company | 201, old relationship deactivated |
| A-22 | Block sync after transfer | Check `company_id` on all blocks for transferred property | All equal new managing company ID |
| A-23 | Blockchain event logged | Query `blockchain_nodes` for property's blocks | `management_transfer` event exists with correct payload |
| A-24 | One active constraint | After transfer, query active relationships for property | Exactly 1 active row |

#### A-GT: Insights Regression

Run the full **Insights Regression Checklist** (IR-1 through IR-13). All must pass.

---

## PHASE B — CONTRACTOR API WIRING
**~1 week. Parallel with Phase A after A1–A6 complete.**

Models are comprehensive. ContractorMovement alone is 329 lines with zero API exposure.
This phase wires models to endpoints — no new modelling required.

---

### B1 — Contractor Management Endpoints

**New file:** `backend/api/v1/contractor_management.py`

Following the detailed spec in `PHASES_3_4_5_IMPLEMENTATION_PLAN.md` Step W3.3.1:

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/v1/contractors` | `contractors.read` | Company-scoped via active relationships |
| GET | `/api/v1/contractors/{id}` | `contractors.read` | Full profile: insurance, biosecurity, verification |
| GET | `/api/v1/contractor-relationships` | `contractors.read` | Company's relationships |
| POST | `/api/v1/contractor-relationships` | `contractors.create` | Invite/create relationship |
| PATCH | `/api/v1/contractor-relationships/{id}` | `contractors.update` | approve / suspend / terminate |
| POST | `/api/v1/contractor-relationships/{id}/verify-insurance` | `contractors.update` | Mark insurance verified |
| GET | `/api/v1/contractors/{id}/assignments` | `contractors.read` | Task assignments for contractor |
| GET | `/api/v1/contractors/{id}/movements` | `contractors.read` | Movement/visit history |
| GET | `/api/v1/contractors/{id}/training` | `contractors.read` | Training status per company |

**Register in `backend/main.py`.**

---

### B2 — Contractor Task Assignment Endpoints

Wire the existing `ContractorAssignment` model (schema complete, zero endpoints):

| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/tasks/{task_id}/contractor-assignments` | Assign contractor to task |
| GET | `/api/v1/tasks/{task_id}/contractor-assignments` | List assignments for task |
| PATCH | `/api/v1/contractor-assignments/{id}` | Update status (accepted / declined / completed) |

---

### B3 — Contractor Biosecurity Movement Endpoints

Wire the existing `ContractorMovement` model (329 lines, zero endpoints):

| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/contractor-movements/check-in` | Log arrival with GPS, equipment, biosecurity declaration |
| POST | `/api/v1/contractor-movements/{id}/check-out` | Log departure |
| GET | `/api/v1/contractor-movements` | Company-scoped movement list |
| GET | `/api/v1/contractor-movements/{id}` | Movement detail |
| GET | `/api/v1/contractors/{id}/movements` | All movements for a contractor |

---

### B4 — Contractor Frontend UI

Following `PHASES_3_4_5_IMPLEMENTATION_PLAN.md` Step W3.3.2 precisely:

**New files:**
```
packages/web/src/pages/ContractorManagement.jsx
packages/web/src/components/contractors/ContractorList.jsx
packages/web/src/components/contractors/ContractorDetail.jsx
packages/web/src/components/contractors/InsuranceStatus.jsx
packages/web/src/components/contractors/RelationshipActions.jsx
packages/web/src/components/contractors/MovementTimeline.jsx
packages/shared/src/api/contractorManagementService.js
```

Tab layout: Active | Pending | Suspended | All. Contractor card + sliding detail panel.
Full spec at `PHASES_3_4_5_IMPLEMENTATION_PLAN.md` W3.3.2.

Add `/contractors` route to `packages/web/src/App.jsx`.

---

### PHASE B — TEST GATE

#### B-GT: Contractor Endpoints

| # | Test | Method | Expected |
|---|------|--------|----------|
| B-1 | List contractors | `company_admin` JWT → `GET /api/v1/contractors` | 200, returns company-scoped contractors |
| B-2 | Contractor detail | `company_admin` JWT → `GET /api/v1/contractors/{id}` | 200, includes insurance + biosecurity fields |
| B-3 | Create relationship | `company_admin` JWT → `POST /api/v1/contractor-relationships` | 201, relationship created |
| B-4 | Update relationship | `PATCH /api/v1/contractor-relationships/{id}` (approve) | 200, status updated |
| B-5 | Permission denied | `company_user` JWT → `POST /api/v1/contractor-relationships` | 403 |

#### B-GT: Task Assignment & Movement

| # | Test | Method | Expected |
|---|------|--------|----------|
| B-6 | Assign contractor to task | `POST /api/v1/tasks/{id}/contractor-assignments` | 201, assignment created |
| B-7 | Contractor accepts | `PATCH /api/v1/contractor-assignments/{id}` (status=accepted) | 200 |
| B-8 | Movement check-in | `POST /api/v1/contractor-movements/check-in` with GPS + declaration | 201, movement logged |
| B-9 | Movement check-out | `POST /api/v1/contractor-movements/{id}/check-out` | 200, departure time recorded |
| B-10 | Movement history | `GET /api/v1/contractors/{id}/movements` | 200, returns chronological list |

#### B-GT: Frontend Smoke

| # | Test | Method | Expected |
|---|------|--------|----------|
| B-11 | Contractor page loads | Browse `/contractors` as `company_admin` | Page renders with tab layout |
| B-12 | Contractor detail panel | Click a contractor row | Sliding panel opens with full profile |
| B-13 | Permission-gated nav | Login as `company_user` | `/contractors` route not visible or redirects |

#### B-GT: Insights Regression

Run the full **Insights Regression Checklist** (IR-1 through IR-13). All must pass.

---

## PHASE C — MAP LAYERS & BUILDER COMPLETION
**~2–3 weeks. Parallel with Phase D after Phase A complete.**

Six map layers are NOT STARTED. Data exists in the database for all of them.
The work is backend aggregation + Mapbox GL rendering.

---

### C1 — Disease Pressure Heatmap Layer

**Backend:**
- New endpoint: `GET /api/v1/map/disease-pressure`
- Query params: `disease_type` (powdery_mildew | botrytis | downy_mildew), `date` (ISO date)
- Queries `disease_pressure` table, aggregates to GeoJSON FeatureCollection
- Each Feature: block polygon geometry, properties:
  `{ block_id, risk_level, risk_score, disease_type, model_run_date }`
- Permission: `require_permission("map", "read")`
- Filter by `get_visible_property_ids()` — only return blocks the user can see

**Frontend:**
- New layer in map layer registry: `disease-pressure`
- Source type: GeoJSON from new endpoint
- Layer type: `fill` with `fill-color` expression:
  `["match", ["get", "risk_level"], "low", "#2D9E5A", "moderate", "#F5A623", "high", "#E74C3C", "extreme", "#8B0000", "#CCCCCC"]`
- Opacity slider in layer panel
- Block click popup: disease type, risk level label, score, model run date

---

### C2 — Phenology Stage Map Layer

**Backend:**
- New endpoint: `GET /api/v1/map/phenology`
- Queries `phenology_estimates` — most recent estimate per block
- Returns GeoJSON FeatureCollection, properties:
  `{ block_id, stage, stage_label, estimated_date, gdd_to_date, variety }`

**Frontend:**
- New layer: `phenology-stage`
- Layer type: `fill` with colour per stage (dormant=grey, bud burst=light green,
  flowering=yellow, fruit set=orange, veraison=purple, harvest=red)
- Legend component showing stage → colour mapping
- Block click popup: stage name, estimated date, GDD accumulated

---

### C3 — Weather Station Live Conditions Layer

**Backend:**
- New endpoint: `GET /api/v1/map/weather-stations`
- For each `WeatherStation` with `data_source='HARVEST'`: fetch the most recent
  hourly record from the aggregation pipeline
- Returns GeoJSON FeatureCollection: Point geometry per station, properties:
  `{ station_name, temp_c, humidity_pct, rainfall_24h_mm, wind_speed_kmh, leaf_wetness, last_reading_at }`

**Frontend:**
- New layer: `weather-stations`
- Layer type: `symbol` using a weather station icon
- Click popup: full current conditions card (temp, humidity, rainfall, wind, leaf wetness)
- No opacity slider — always fully opaque when active

---

### C4 — Spray Efficiency Heatmap Layer

Most technically complex new layer. GPS track + spray calibration → spatial coverage proof.

**Schema check:** Confirm whether `TaskGPSTrack` point records have a `spray_active`
boolean. If not, add via migration:
```
alembic revision --autogenerate -m "add_spray_active_to_gps_track_points"
```
Field: `spray_active = Column(Boolean, default=False)` on the GPS point model.
Mobile app sets this flag when the spray unit is active vs. transit.

**Backend:**
- New endpoint: `GET /api/v1/map/spray-coverage/{task_id}`
- Fetch GPS points for task where `spray_active = True`
- Fetch `AssetCalibration` for linked spray unit: boom width (m), application rate (L/ha)
- For each consecutive GPS point pair where spray is active:
  - Compute coverage corridor: ST_Buffer on the line segment, width = half boom width
- Union all corridors → total coverage polygon
- Compute coverage completeness: (covered area / block area) × 100
- Return GeoJSON with coverage polygon + stats: `{ coverage_pct, area_ha, double_coverage_pct }`
- Store result in task record for future retrieval without recalculation

**Frontend:**
- Accessible from task detail view: "View Spray Coverage" button → opens map with this layer
- Layer type: `fill` with density expression
- Statistics panel below map: coverage %, area sprayed, missed zones estimate

---

### C5 — Harvest Station Assignment to Blocks

Required so disease models know which sensor feeds which block.

**Migration:**
```
alembic revision --autogenerate -m "add_block_station_assignments_table"
```

```python
class BlockStationAssignment(Base):
    __tablename__ = "block_station_assignments"
    id         = Column(Integer, primary_key=True)
    block_id   = Column(Integer, ForeignKey("vineyard_blocks.id"), nullable=False)
    station_id = Column(Integer, ForeignKey("weather_stations.id"), nullable=False)
    is_primary = Column(Boolean, default=True)
    __table_args__ = (UniqueConstraint("block_id", "station_id"),)
```

**Endpoints:**
- `POST /api/v1/blocks/{id}/station-assignment` — assign station
- `GET /api/v1/blocks/{id}/station-assignment` — get current assignment
- `DELETE /api/v1/blocks/{id}/station-assignment/{station_id}` — remove

**Also:** Update disease model runs to use assigned station data per block rather than
nearest-by-coordinates fallback when an explicit assignment exists.

---

### C6 — Map Settings Save to Backend

Replace `localStorage` persistence in `useBuilderState` hook with backend storage
(keep localStorage as offline fallback).

**Migration:**
```
alembic revision --autogenerate -m "add_map_saved_views_table"
```

```python
class MapSavedView(Base):
    __tablename__ = "map_saved_views"
    id           = Column(Integer, primary_key=True)
    user_id      = Column(Integer, ForeignKey("users.id"), nullable=False)
    name         = Column(String(255), nullable=False)
    layer_config = Column(JSON)   # layer registry state
    viewport     = Column(JSON)   # center, zoom, bearing, pitch
    created_at   = Column(DateTime, server_default=func.now())
    updated_at   = Column(DateTime, server_default=func.now(), onupdate=func.now())
```

**Endpoints:** `GET/POST/PATCH/DELETE /api/v1/map/saved-views`

**Frontend changes:**
- "Save View" button in map builder sidebar → name modal → POST to API
- Saved views dropdown → GET from API → click to restore
- On load: fetch saved views + restore last active from localStorage fallback

---

### C7 — Map Export to PDF / Image

**Frontend only — no backend required for v1.**

```javascript
// Capture current map canvas state
const canvas = map.getCanvas();
canvas.toBlob((blob) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `auxein-map-${Date.now()}.png`;
  a.click();
}, 'image/png');
```

For PDF: wrap the PNG in `jspdf`. Add dependency: `npm install jspdf`.

UI: "Export" button in Map Builder toolbar → dropdown: "Export as PNG" / "Export as PDF".

---

### C8 — Custom Layer Import (GeoJSON / KML / CSV)

**Backend:**
- New endpoint: `POST /api/v1/map/custom-layers`
- Accept multipart file upload (GeoJSON, KML, CSV with lat/lon columns)
- Parse format:
  - GeoJSON: validate and pass through
  - KML: convert using `fastkml` or equivalent
  - CSV: parse lat/lon columns, build Point FeatureCollection
- Store result as `SpatialArea` with `area_type = "custom_import"` and source file metadata
- Return GeoJSON FeatureCollection for immediate map preview

**Frontend:**
- "Import Layer" button in Map Builder
- File picker → upload → preview on map → name + colour assignment → Save
- Imported layers appear in a "Custom Layers" section of the layer panel with delete option

GeoTIFF import is deferred to v1.x (complex format, low v1 priority).

---

### PHASE C — TEST GATE

#### C-GT: Map Layer Endpoints

| # | Test | Method | Expected |
|---|------|--------|----------|
| C-1 | Disease pressure endpoint | `GET /api/v1/map/disease-pressure?disease_type=powdery_mildew&date=2026-03-10` | 200, valid GeoJSON FeatureCollection |
| C-2 | Disease scoping | Request as user with limited property scope | Only returns blocks for visible properties |
| C-3 | Phenology endpoint | `GET /api/v1/map/phenology` | 200, GeoJSON with stage + variety per block |
| C-4 | Weather stations endpoint | `GET /api/v1/map/weather-stations` | 200, GeoJSON Points with current conditions |
| C-5 | Spray coverage endpoint | `GET /api/v1/map/spray-coverage/{task_id}` (completed spray task) | 200, coverage polygon + stats |
| C-6 | Station assignment CRUD | POST + GET + DELETE `/api/v1/blocks/{id}/station-assignment` | All succeed, assignment persists |
| C-7 | Saved views CRUD | POST + GET + PATCH + DELETE `/api/v1/map/saved-views` | Full lifecycle works, user-scoped |

#### C-GT: Map Layer Rendering

| # | Test | Method | Expected |
|---|------|--------|----------|
| C-8 | Disease pressure layer | Enable disease pressure layer in map builder | Blocks render with risk-level colours |
| C-9 | Phenology layer | Enable phenology layer | Blocks render with stage colours, legend visible |
| C-10 | Weather station layer | Enable weather stations layer | Station icons render, click shows conditions popup |
| C-11 | Spray coverage view | Open spray task → "View Spray Coverage" | Coverage polygon renders with stats panel |
| C-12 | Layer toggle | Enable/disable multiple layers | Layers appear/disappear without console errors |
| C-13 | Map export PNG | Click Export → "Export as PNG" | PNG downloads with current map state |
| C-14 | Map export PDF | Click Export → "Export as PDF" | PDF downloads with map embedded |
| C-15 | Custom layer import | Import a GeoJSON file via Map Builder | Layer renders, appears in Custom Layers panel |
| C-16 | Saved view restore | Save a view → reload page → select saved view | Map restores to saved state (layers, viewport) |

#### C-GT: Migration Integrity

| # | Test | Method | Expected |
|---|------|--------|----------|
| C-17 | New tables exist | `\dt block_station_assignments`, `\dt map_saved_views` | Both tables present |
| C-18 | spray_active field | `\d` on GPS track points table | `spray_active` boolean column exists (if migration was needed) |

#### C-GT: Insights Regression

Run the full **Insights Regression Checklist** (IR-1 through IR-13). All must pass.

**Additional C-phase Insights check:** Verify that the new `/api/v1/map/*` endpoints do NOT
interfere with the public GeoJSON endpoints (IR-5, IR-6, IR-7). The map endpoints should
require Pro auth — confirm anonymous requests to `/api/v1/map/disease-pressure` return 401.

---

## PHASE D — INTELLIGENCE & AUTOMATION
**~2–3 weeks. Parallel with Phase C after Phase A complete.**

---

### D1 — Unified Calendar Endpoint + Frontend

Following `PHASES_3_4_5_IMPLEMENTATION_PLAN.md` Step W3.1 precisely.

**Backend — new file `backend/api/v1/calendar.py`:**
- New endpoint: `GET /api/v1/calendar/events`
- Query params: `start_date`, `end_date`, `event_types[]`
- Aggregates across:
  - Tasks (`tasks.due_date`, `tasks.start_date`)
  - Observation plans (`observation_plans.due_start_at`, `due_end_at`)
  - Asset maintenance (`asset_maintenance.scheduled_date` where status=scheduled)
  - Training deadlines (`training_records.expires_at` for assigned training)
  - Risk action due dates (`risk_actions.target_completion_date` where status!=completed)
- Returns unified `CalendarEvent` schema with `event_type` discriminator
- Permission: `require_permission("calendar", "read")`
- **New file:** `backend/schemas/calendar.py`

**Frontend — new files per W3.1.2 spec:**
```
packages/web/src/pages/Calendar.jsx
packages/web/src/components/calendar/CalendarView.jsx
packages/web/src/components/calendar/CalendarEvent.jsx
packages/shared/src/api/calendarService.js
```

Add `@fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid` or lightweight
equivalent. Month view default, week view toggle. Colour-coded by event type.

Add `/calendar` route to `packages/web/src/App.jsx`.

---

### D2 — Spray Interval Tracker

**New file:** `backend/services/spray_interval_service.py`

Tracks last spray date per block per product/active-ingredient combination.
Sources data from completed spray tasks and their linked `TaskAsset` consumable records.

```python
def get_spray_intervals(db: Session, block_id: int) -> List[SprayIntervalRecord]:
    """
    Returns for each product category applied to this block:
    - last_applied_date
    - days_since_last_application
    - withholding_period_days (from consumable asset)
    - days_until_whp_clear (negative = already clear)
    - next_programme_due_date (based on configured spray interval)
    """
```

**New endpoint:** `GET /api/v1/blocks/{id}/spray-intervals`

This data feeds:
- Rule-based auto-task generation (D3) — "overdue for spray" trigger
- Block detail view — spray interval panel
- GrapeLink export (E1) — withholding period verification

---

### D3 — Rule-Based Auto-Task Generation

**New file:** `backend/services/task_automation_service.py`

Evaluates trigger rules against current data and creates `Task` records with
`auto_generated = True` and `status = "suggested"`. Runs as a GitHub Actions job
(add to daily schedule alongside climate processing).

**New migration:**
```
alembic revision --autogenerate -m "add_auto_generated_to_tasks"
```
Adds `auto_generated = Column(Boolean, default=False)` to `tasks`.

**Trigger rules:**
| Trigger | Condition | Suggested task |
|---|---|---|
| Powdery Mildew | Risk Index ≥ 5 for 2+ consecutive days | Spray: review PM programme |
| Botrytis | Model severity > 70 at flowering/bunch closure | Spray: review Botrytis programme |
| Downy Mildew | Primary infection event flagged | Spray: assess treatment |
| Frost | Min temp < 0°C forecast within 48h | Monitoring: check frost protection |
| Spray overdue | Days since last spray > programme threshold (from D2) | Spray: overdue |
| Observation flags action | `requires_action = True` on submitted obs | Maintenance: linked obs |
| Phenology: bud burst | Stage transition detected | Monitoring: begin early season programme |

Each trigger creates one `Notification` to `company_admin` + `company_manager`:
"Grow has suggested a new task: [task name]. [View / Dismiss]"

---

### D4 — Observation → Risk / Task Automation

**New file:** `backend/services/observation_automation_service.py`

Called from the observation POST endpoint after observation is saved.

Rules:
1. If `severity >= 3` on a disease observation → suggest a spray task (type = D3 trigger)
2. If `requires_action = True` → create a linked maintenance task
3. If `risk_level` is "high" or "critical" → create or escalate a `SiteRisk` record
   and notify `company_manager`+
4. ObservationTaskLink is already modelled — populate it when rule 2 fires

---

### D5 — Yield Estimation Pipeline

**New file:** `backend/services/yield_estimation_service.py`

Aggregates the bud→flower→bunch count observation series per block.

```python
def get_yield_estimate(db: Session, block_id: int, season_year: int) -> YieldEstimate:
    """
    Aggregates observation data:
    - bud_count obs → avg buds/vine → projected canes (after bud burst)
    - flower_count obs → fruit set rate → projected bunches (after fruit set)
    - bunch_count obs → bunches/vine → refine yield projection
    - berry_weight obs → g/berry → estimated yield in t/ha with confidence interval

    Returns: { estimated_yield_tha, confidence_low, confidence_high,
               data_stage, last_observation_date }
    """
```

**New endpoints:**
- `GET /api/v1/blocks/{id}/yield-estimate`
- `GET /api/v1/properties/{id}/yield-estimate` (aggregate across blocks)

---

### D6 — Notification Preferences

Following `PHASES_3_4_5_IMPLEMENTATION_PLAN.md` Step 5.5:

**Migration:**
```
alembic revision --autogenerate -m "add_notification_preferences_to_users"
```
Add `notification_preferences = Column(JSON, nullable=True)` to `users`.
(JSON avoids a separate table for v1; full preference model is v1.x.)

**Structure:**
```json
{
  "task_assigned": {"in_app": true, "email": true},
  "disease_alert": {"in_app": true, "email": false},
  "incident":      {"in_app": true, "email": true},
  "training_due":  {"in_app": true, "email": false},
  "visitor":       {"in_app": true, "email": false}
}
```

**Endpoint:** `GET/PATCH /api/v1/users/me/notification-preferences`

Update `NotificationService.notify()` to check preferences before dispatching.

**Frontend:** Preferences section in profile settings page.

---

### D7 — Weather Alert Rules

Following `PHASES_3_4_5_IMPLEMENTATION_PLAN.md` Step W4.1:

**Migration:**
```
alembic revision --autogenerate -m "add_weather_alert_tables"
```

Creates `weather_alerts` and `weather_alert_events` tables per spec in W4.1.1.

**New file:** `backend/api/v1/weather_alerts.py`
**New file:** `backend/services/weather_alert_service.py`

Alert types for v1: frost (min temp < threshold), heavy rain (rainfall > threshold).
Evaluated by daily GitHub Actions job. Creates `Notification` when threshold crossed.

Frontend: alert banner on home dashboard, alert rules manager in settings.
Full spec at `PHASES_3_4_5_IMPLEMENTATION_PLAN.md` W4.1.

---

### D8 — Timesheet CSV Export

**Backend:**
- New endpoint: `GET /api/v1/timesheets/export`
- Query params: `start_date`, `end_date`, `user_id` (optional)
- Columns: user, date, task_name, block, hours, approval_status, approved_by, notes
- Response: `Content-Type: text/csv`, `Content-Disposition: attachment; filename=timesheets.csv`
- Permission: `require_permission("timesheets", "export")`

**Frontend:** "Export CSV" button on the timesheets page, date range picker.

---

### PHASE D — TEST GATE

#### D-GT: Calendar & Automation Endpoints

| # | Test | Method | Expected |
|---|------|--------|----------|
| D-1 | Calendar aggregation | `GET /api/v1/calendar/events?start_date=2026-03-01&end_date=2026-03-31` | 200, events from tasks + obs plans + maintenance + training + risk actions |
| D-2 | Calendar event types filter | `GET /api/v1/calendar/events?event_types[]=task&event_types[]=observation` | Only task and observation events returned |
| D-3 | Spray intervals | `GET /api/v1/blocks/{id}/spray-intervals` (block with spray history) | 200, intervals with WHP and next-due calculations |
| D-4 | Auto-task generation | Trigger daily job manually (or call service directly) with a block at PM risk ≥ 5 | Task created with `auto_generated=True`, `status=suggested` |
| D-5 | Obs → task automation | `POST` observation with `severity >= 3` on disease type | Linked task created, `ObservationTaskLink` populated |
| D-6 | Obs → risk escalation | `POST` observation with `risk_level=critical` | `SiteRisk` record created/escalated, notification sent |
| D-7 | Yield estimation | `GET /api/v1/blocks/{id}/yield-estimate` (block with bud count obs) | 200, estimate with confidence interval and data stage |
| D-8 | Property yield aggregate | `GET /api/v1/properties/{id}/yield-estimate` | 200, aggregated across property blocks |

#### D-GT: Notifications & Alerts

| # | Test | Method | Expected |
|---|------|--------|----------|
| D-9 | Notification preferences GET | `GET /api/v1/users/me/notification-preferences` | 200, returns current prefs (or defaults) |
| D-10 | Notification preferences PATCH | `PATCH /api/v1/users/me/notification-preferences` (disable email for disease_alert) | 200, preference saved |
| D-11 | Preference respected | Trigger disease alert with email disabled | In-app notification created, no email sent |
| D-12 | Weather alert rule create | Create frost alert rule (threshold = 0°C) | Rule saved, confirmed via GET |
| D-13 | Weather alert triggers | Run alert service with station data showing -1°C | Alert event created + notification dispatched |
| D-14 | Timesheet CSV export | `GET /api/v1/timesheets/export?start_date=2026-01-01&end_date=2026-03-31` | CSV downloads with correct columns and data |

#### D-GT: Frontend Smoke

| # | Test | Method | Expected |
|---|------|--------|----------|
| D-15 | Calendar page loads | Browse `/calendar` as `company_manager` | FullCalendar renders with month view, events colour-coded |
| D-16 | Calendar week toggle | Switch to week view | View changes, events still display |
| D-17 | Auto-task in task list | Check tasks page after auto-task fires | Suggested task appears with `auto_generated` indicator |
| D-18 | Notification prefs UI | Browse profile settings → notification preferences | Preferences form renders, toggle saves correctly |
| D-19 | Weather alerts UI | Browse settings → weather alerts | Alert rules list + create form render |
| D-20 | Timesheet export button | Browse timesheets page → click "Export CSV" | CSV downloads |

#### D-GT: Cross-Phase Verification

| # | Test | Method | Expected |
|---|------|--------|----------|
| D-21 | Auto-task + notification | Auto-task fires → check notifications | `company_admin` and `company_manager` receive notification |
| D-22 | Calendar shows auto-tasks | Auto-task with due date → calendar endpoint | Event appears in calendar response |
| D-23 | Spray interval feeds D3 | Block with overdue spray → run auto-task job | "Spray: overdue" task generated |

#### D-GT: Insights Regression

Run the full **Insights Regression Checklist** (IR-1 through IR-13). All must pass.

**Additional D-phase Insights check:** Verify that new GitHub Actions jobs (auto-task, weather
alerts) do not interfere with the existing daily climate job (05:00 UTC) or weather ingestion
(every 6h). Confirm public climate endpoints still return fresh data after jobs run.

---

## PHASE E — INTEGRATIONS & COMPLIANCE
**~2 weeks. Parallel with Phases C and D after Phase A complete.**

---

### E1 — GrapeLink Export File

Depends on Phase A (Property model + GrapeLink fields on Property).

**New file:** `backend/services/grapelink_service.py`

Logic:
1. Fetch all completed spray tasks for the given `property_id` and date range
2. For each task: block, product (from `TaskAsset` consumable), rate, area, date,
   operator name, weather conditions at task completion (from nearest station)
3. Use `Property.grapelink_grower_id` and `Property.grapelink_property_code` as
   the grower identifier headers — NOT the company
4. Validate each product against ACVM data (E2): registration number, WHP, export MRL
5. Output: CSV in GrapeLink import format

**Important:** Obtain the current GrapeLink CSV import template from the GrapeLink
portal before implementing the column structure. The format may have changed.

**New endpoint:** `POST /api/v1/compliance/grapelink-export`
- Body: `{ property_id: int, start_date: date, end_date: date }`
- Response: CSV file download
- Permission: `require_permission("compliance", "export")`

Add `compliance` module to `core/permissions.py`:
```python
"compliance": {
    "auxein_admin":   ["read", "export"],
    "company_admin":  ["read", "export"],
    "company_manager":["read", "export"],
    "company_user":   ["read"],
    "contractor":     [],
},
```

**Frontend:**
- Compliance section: "Export Spray Diary to GrapeLink"
- Property selector + date range picker + Download CSV button
- Brief instruction: "Upload this file to your GrapeLink portal: Spray Diary → Import"

---

### E2 — ACVM Chemical Database

**Migration:**
```
alembic revision --autogenerate -m "add_acvm_products_table"
```

```python
class AcvmProduct(Base):
    __tablename__ = "acvm_products"
    id                          = Column(Integer, primary_key=True)
    registration_number         = Column(String(50), unique=True, nullable=False, index=True)
    product_name                = Column(String(255), nullable=False)
    active_ingredients          = Column(JSON)       # list of active ingredients
    approved_uses               = Column(JSON)       # crop types and pests
    withholding_period_days     = Column(Integer)
    mrl_export_markets          = Column(JSON)       # { "EU": 0.01, "US": 0.05 }
    hsno_classification         = Column(String(50))
    ppe_requirements            = Column(JSON)
    registration_expiry         = Column(Date)
    last_synced_at              = Column(DateTime)
```

**Import script:** `backend/scripts/import_acvm_products.py`
Source: bulk export from `www.acvm.govt.nz`. Run once at setup, refresh quarterly
via GitHub Actions.

**Endpoints:**
- `GET /api/v1/acvm/products?search=` — autocomplete (name or reg number)
- `GET /api/v1/acvm/products/{registration_number}` — full detail

**Integration:** Spray task creation links consumable to ACVM product. On link:
- Auto-populate `withholding_period_days` on the task record
- Check: does harvest estimate fall within the WHP window? Warn if so.
- Display PPE requirements on task detail

---

### E3 — Frost Risk Model + Map Layer

**New file:** `backend/services/frost_risk_service.py`

The topographically adjusted frost risk model. Requires C5 (station-to-block assignment).

```python
def calculate_frost_risk(
    db: Session,
    block_id: int,
    forecast_hours: int = 72
) -> FrostRiskForecast:
    """
    For the assigned Harvest Electronics station:
    1. Fetch 72h hourly temperature forecast from station data pipeline
    2. Apply topographic correction:
       - Get block elevation (VineyardBlock.elevation)
       - Get station elevation (WeatherStation.elevation)
       - Apply temperature lapse rate: -0.65°C per 100m elevation above station
       - Apply cold air drainage offset: VineyardBlock.frost_offset_c (new field, default 0.0)
    3. For each 6h period, compute frost_risk_level:
       - temp > 2°C  → None
       - 0°C to 2°C → Advisory
       - -2°C to 0°C → Warning
       - < -2°C      → Critical
    4. Return: { tonight, tomorrow, day_after } each with frost_risk_level and min_temp_c
    """
```

**New migration:**
```
alembic revision --autogenerate -m "add_frost_offset_to_vineyard_blocks"
```
Adds `frost_offset_c = Column(Numeric(4,2), default=0.0)` to `vineyard_blocks`.

**New endpoint:** `GET /api/v1/blocks/{id}/frost-risk`

**Map layer:** After service is built, add frost risk layer following C1 pattern:
- Backend: `GET /api/v1/map/frost-risk` returning GeoJSON FeatureCollection
- Frontend: new `frost-risk` layer in registry, choropleth by risk level

**Notification trigger:** Critical frost risk → weather alert via D7 if rule is configured.

---

### E4 — Operational Reporting (CSV Framework)

**v1 scope: CSV exports only.** PDF/Excel is v1.x.

**New file:** `backend/api/v1/reports.py`

| Endpoint | Report | Columns |
|---|---|---|
| `GET /api/v1/reports/spray-diary` | Season spray diary (GrapeLink-compatible) | Date, block, product, rate, area, weather, operator |
| `GET /api/v1/reports/tasks` | Task completion | Task, type, block, assignee, status, actual_cost, hours |
| `GET /api/v1/reports/observations` | Observation log | Date, type, block, severity, outcome, observer |
| `GET /api/v1/reports/timesheets` | Timesheet summary | User, week, task, hours, status |
| `GET /api/v1/reports/incidents` | H&S incident log | Date, type, severity, location, status, corrective actions |

All query params: `property_id`, `start_date`, `end_date`.
All responses: `Content-Type: text/csv`.
Permission: `require_permission("reports", "export")`.

**Frontend — new page `/reports`:**
```
packages/web/src/pages/Reports.jsx
packages/web/src/components/reports/ReportCard.jsx
```

One card per report type: description, date range picker, property selector, Download CSV.

---

### PHASE E — TEST GATE

#### E-GT: GrapeLink & Compliance

| # | Test | Method | Expected |
|---|------|--------|----------|
| E-1 | GrapeLink export | `POST /api/v1/compliance/grapelink-export` with valid property + date range | CSV downloads in GrapeLink import format |
| E-2 | GrapeLink uses Property fields | Check CSV header row | `grapelink_grower_id` and `grapelink_property_code` from Property (not Company) |
| E-3 | GrapeLink permission | `company_user` JWT → `POST /api/v1/compliance/grapelink-export` | 403 (read-only, no export) |
| E-4 | GrapeLink WHP validation | Export with a spray task inside WHP window | CSV includes WHP warning flag or report note |

#### E-GT: ACVM Database

| # | Test | Method | Expected |
|---|------|--------|----------|
| E-5 | ACVM search | `GET /api/v1/acvm/products?search=copper` | 200, returns matching products |
| E-6 | ACVM detail | `GET /api/v1/acvm/products/{registration_number}` | 200, full product record with WHP + PPE |
| E-7 | ACVM → spray task link | Create spray task, link consumable to ACVM product | WHP auto-populated on task, PPE displayed |
| E-8 | ACVM harvest warning | Spray task with WHP overlapping harvest estimate | Warning returned in response |

#### E-GT: Frost Risk

| # | Test | Method | Expected |
|---|------|--------|----------|
| E-9 | Frost risk endpoint | `GET /api/v1/blocks/{id}/frost-risk` (block with station assignment) | 200, forecast with tonight/tomorrow/day_after |
| E-10 | Frost topographic correction | Block 50m above station → check adjusted temp | Temp reduced by ~0.325°C vs station reading |
| E-11 | Frost map layer | `GET /api/v1/map/frost-risk` | 200, GeoJSON with risk_level per block |
| E-12 | Frost → weather alert | Critical frost risk + frost alert rule configured | Notification dispatched |
| E-13 | frost_offset_c migration | `\d vineyard_blocks` | `frost_offset_c` column exists with default 0.0 |

#### E-GT: Operational Reporting

| # | Test | Method | Expected |
|---|------|--------|----------|
| E-14 | Spray diary CSV | `GET /api/v1/reports/spray-diary?property_id=X&start_date=...&end_date=...` | CSV with correct columns, data matches tasks |
| E-15 | Tasks report CSV | `GET /api/v1/reports/tasks?property_id=X&...` | CSV with task completion data |
| E-16 | Observations report CSV | `GET /api/v1/reports/observations?property_id=X&...` | CSV with observation log |
| E-17 | Timesheets report CSV | `GET /api/v1/reports/timesheets?property_id=X&...` | CSV with timesheet summary |
| E-18 | Incidents report CSV | `GET /api/v1/reports/incidents?property_id=X&...` | CSV with H&S incident log |
| E-19 | Reports permission | `contractor` JWT → `GET /api/v1/reports/spray-diary` | 403 |
| E-20 | Reports scoping | `company_manager` JWT → report for property outside scope | Empty result or 403 (not another company's data) |

#### E-GT: Frontend Smoke

| # | Test | Method | Expected |
|---|------|--------|----------|
| E-21 | Compliance page | Browse compliance section → GrapeLink export | Property selector + date picker + download button render |
| E-22 | ACVM lookup in spray task | Create spray task → search ACVM products | Autocomplete works, selection populates WHP/PPE |
| E-23 | Reports page | Browse `/reports` | All 5 report cards render with download buttons |
| E-24 | Report download | Click download on any report card | CSV downloads with data |

#### E-GT: Insights Regression

Run the full **Insights Regression Checklist** (IR-1 through IR-13). All must pass.

**Additional E-phase Insights check:** The `acvm_products` table and ACVM import script must
not affect any public-facing tables. Confirm `alembic upgrade head` with the new ACVM migration
does not modify existing public tables. Verify the ACVM GitHub Actions job (quarterly refresh)
does not conflict with existing scheduled jobs.

---

## PHASE F — NOTIFICATIONS UI & RESIDUAL FRONTEND
**~1 week. Final phase.**

---

### F1 — Notifications UI

Following `PHASES_3_4_5_IMPLEMENTATION_PLAN.md` Step W3.2 precisely:

**New files:**
```
packages/web/src/components/NotificationBell.jsx
packages/web/src/components/NotificationDropdown.jsx
packages/web/src/pages/Notifications.jsx
packages/shared/src/api/notificationService.js
```

`NotificationBell` in `AppBar.jsx` — polls `GET /notifications/unread-count` every 30s.
Full implementation spec at `PHASES_3_4_5_IMPLEMENTATION_PLAN.md` W3.2.1.

---

### F2 — Unified Reporting Page

Following `PHASES_3_4_5_IMPLEMENTATION_PLAN.md` Step W3.5 precisely:

Build the web reporting UI to complement the CSV endpoints from E4. Tab layout:
Tasks | Observations | Timesheets | Assets. Charts + table per tab. Export button.

**New files per W3.5.2 spec.**

---

### F3 — Block Climate Intelligence Panel

**Frontend — extends existing block detail view:**

Add "Climate Intelligence" tab to block detail page.

Fetch from existing endpoints (all confirmed EXISTS in discovery):
- `GET /api/v1/climate/historical/{block_id}`
- `GET /api/v1/climate/projections/{block_id}`
- `GET /api/v1/climate/baseline/{zone}`
- `GET /api/v1/insights/phenology/{block_id}` (existing)
- `GET /api/v1/disease-pressure/{block_id}` (confirmed via disease models)

Display:
- GDD accumulation chart: current season vs. 10th/50th/90th percentile of 1986–present
- Season position banner: "Tracking X GDD ahead/behind 30-year median"
- Projected climate selector: RCP/SSP scenario + time horizon (2050 / 2100)
- Phenology stage timeline: modelled + observed
- Disease pressure history: weekly bar chart for current season

---

### F4 — GPS Tracking Dashboard

Following `PHASES_3_4_5_IMPLEMENTATION_PLAN.md` Step W3.4:

**New files:**
```
packages/web/src/pages/GPSTracking.jsx
packages/web/src/components/gps/TrackMap.jsx
packages/web/src/components/gps/TrackStats.jsx
```

Active tracks view (live position on Mapbox). Historical track view (polyline,
speed gradient). Track stats panel (distance, area, duration). Add `getGPSTrack()`,
`getGPSStats()`, `getActiveGPSTasks()` to tasksService.

Full spec at `PHASES_3_4_5_IMPLEMENTATION_PLAN.md` W3.4.

---

### PHASE F — TEST GATE (FINAL)

This is the final gate before v1 launch. It covers Phase F deliverables plus a full
end-to-end regression across all phases.

#### F-GT: Notifications UI

| # | Test | Method | Expected |
|---|------|--------|----------|
| F-1 | Notification bell renders | Login as any Pro user → check AppBar | Bell icon visible with unread count |
| F-2 | Bell count updates | Create a notification for user → wait 30s (poll cycle) | Count increments without page reload |
| F-3 | Notification dropdown | Click bell | Dropdown shows recent notifications, newest first |
| F-4 | Mark as read | Click a notification in dropdown | Notification marked read, count decrements |
| F-5 | Notifications page | Browse `/notifications` | Full notification list with pagination |
| F-6 | Notification routing | Click notification for a suggested task | Navigates to task detail page |

#### F-GT: Reporting Page

| # | Test | Method | Expected |
|---|------|--------|----------|
| F-7 | Reporting tabs render | Browse `/reports` | Tabs: Tasks, Observations, Timesheets, Assets all render |
| F-8 | Chart renders | Select Tasks tab with data in range | Chart displays, table below populates |
| F-9 | Export from reporting page | Click export button on any tab | CSV downloads matching displayed data |
| F-10 | Empty state | Select date range with no data | Friendly empty state message, no console errors |

#### F-GT: Block Climate Panel

| # | Test | Method | Expected |
|---|------|--------|----------|
| F-11 | Climate tab appears | Open block detail page | "Climate Intelligence" tab visible |
| F-12 | GDD chart | Click Climate Intelligence tab | GDD chart renders with current season + percentile bands |
| F-13 | Season position banner | Check banner text | Shows "Tracking X GDD ahead/behind 30-year median" |
| F-14 | Projection selector | Switch climate scenario (RCP/SSP) | Chart updates to selected projection |
| F-15 | Disease pressure chart | Scroll to disease section | Weekly bar chart for current season renders |

#### F-GT: GPS Dashboard

| # | Test | Method | Expected |
|---|------|--------|----------|
| F-16 | GPS page loads | Browse `/gps-tracking` | Page renders with map and controls |
| F-17 | Historical track | Select a completed task with GPS data | Polyline renders on map with speed gradient |
| F-18 | Track stats | View stats panel for selected track | Distance, area, duration displayed |

#### F-GT: Full End-to-End Regression

This is the final pre-launch check. Walk through each user type and verify core workflows.

| # | User Type | Workflow | Expected |
|---|-----------|----------|----------|
| F-19 | `auxein_admin` | List all properties → view any block → view any report | Full access, no 403s |
| F-20 | `company_admin` | Create property → assign blocks → create task → assign contractor → view calendar → export spray diary | Full workflow completes |
| F-21 | `company_manager` | View properties → view blocks → create observation → view risk dashboard → check notifications | All reads succeed, observation creates, notifications arrive |
| F-22 | `company_user` | View assigned properties → view blocks → submit timesheet → view calendar | Reads succeed, cannot create assets/spatial areas (403) |
| F-23 | `contractor` | Login → view assigned tasks → accept assignment → check in → complete task → check out | Full contractor workflow |
| F-24 | Owner (read-only) | Login as owner company user → view property under external management → attempt block edit | GET succeeds, POST/PATCH returns 403 with owner message |
| F-25 | Scoped user | User with `UserPropertyScope` → view properties | Only scoped properties visible |

#### F-GT: Permission Matrix Sweep

Verify `require_permission()` on every new endpoint added across all phases:

| Module | User Types That Should Have Access | Spot Check |
|--------|-----------------------------------|------------|
| `properties` | `auxein_admin` (full), `company_admin` (CRUD+manage), `company_manager` (read) | `company_user` → `GET /api/v1/properties` → 403 or empty |
| `contractors` | `auxein_admin` (full), `company_admin` (CRUD), `company_manager` (read) | `company_user` → `POST /api/v1/contractor-relationships` → 403 |
| `map` | All Pro users (read) | Anonymous → `GET /api/v1/map/disease-pressure` → 401 |
| `calendar` | All Pro users (read) | `contractor` → `GET /api/v1/calendar/events` → scoped or 403 |
| `compliance` | `auxein_admin`, `company_admin`, `company_manager` (read+export) | `company_user` → `POST /api/v1/compliance/grapelink-export` → 403 |
| `reports` | `auxein_admin`, `company_admin`, `company_manager` (export) | `contractor` → `GET /api/v1/reports/spray-diary` → 403 |

#### F-GT: Insights Regression (Final)

Run the full **Insights Regression Checklist** (IR-1 through IR-13). All must pass.

**Additional final checks:**
- Confirm `packages/shared/` changes have not broken Insights imports (`npm run build` in both `packages/web/` and `packages/insights/`)
- Confirm all new backend routes return 401 for unauthenticated requests (not 500)
- Confirm no new endpoints are accidentally exposed without auth (grep for routes missing `Depends(get_current_user)` or `require_permission`)
- Confirm `alembic upgrade head` runs cleanly from the pre-v1 baseline (test from the `add_user_type_to_users` migration head)

---

## BUILD ORDER DEPENDENCY GRAPH

```
╔══════════════════════════════════════════════════════════════╗
║  PHASE A — Foundation (~2 weeks)  [MUST BE FIRST]           ║
║  A1 Bug fixes → A2 → A3 → A4 → A5 → A6 (sequential)        ║
║  A7 PropertyService → A8 Endpoints → A9 Scope endpoints      ║
║  A10 Block updates → A11 Owner read-only → A12 Transfer svc  ║
║  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  ║
║  ► PHASE A TEST GATE + Insights Regression (IR-1→IR-13)      ║
╚══════════════════════════════════════════════════════════════╝
           │                    │
    ┌──────┘                    └──────┐
    ▼ (after A gate passes)           ▼ (after A gate passes)
╔═══════════════════════╗   ╔══════════════════════════════════╗
║ PHASE B               ║   ║ PHASE C — Map Layers (~2-3w)     ║
║ Contractor wiring     ║   ║ C1 Disease pressure layer        ║
║ (~1 week)             ║   ║ C2 Phenology stage layer         ║
║ B1 Admin endpoints    ║   ║ C3 Station live layer            ║
║ B2 Task assigns       ║   ║ C4 Spray efficiency heatmap      ║
║ B3 Movement API       ║   ║ C5 Station→block assignment      ║
║ B4 Frontend UI        ║   ║ C6 Map settings backend          ║
║ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ ║   ║ C7 Map export PNG/PDF            ║
║ ► B TEST GATE + IR    ║   ║ C8 Custom layer import           ║
╚═══════════════════════╝   ║ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ ║
                            ║ ► C TEST GATE + IR                ║
                            ╚══════════════════════════════════╝
                                       │
                            ╔══════════════════════════════════╗
                            ║ PHASE D — Intelligence (~2-3w)   ║
                            ║ D1–D8 (as before)                ║
                            ║ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ ║
                            ║ ► D TEST GATE + IR                ║
                            ╚══════════════════════════════════╝
                                       │
                            ╔══════════════════════════════════╗
                            ║ PHASE E — Integrations (~2w)     ║
                            ║ E1–E4 (as before)                ║
                            ║ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ ║
                            ║ ► E TEST GATE + IR                ║
                            ╚══════════════════════════════════╝
                                       │
                            ╔══════════════════════════════════╗
                            ║ PHASE F — Frontend (~1-2w)       ║
                            ║ F1–F4 (as before)                ║
                            ║ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ ║
                            ║ ► F FINAL TEST GATE + IR          ║
                            ║   (includes full E2E regression + ║
                            ║    permission matrix sweep)       ║
                            ╚══════════════════════════════════╝

CRITICAL PATH: A1→A2–A6→A7–A12→A GATE→E1  (~3–4 weeks)
B, C, D are parallelisable after A gate passes
Each ► TEST GATE must pass before the next phase begins
```

---

## ESTIMATED EFFORT

| Phase | Tasks | Build Days | Test Gate Days | Est. Total |
|---|---|---|---|---|
| A: Foundation + Property model | 12 | 10–14 | 2 | 12–16 |
| B: Contractor API wiring | 4 | 5–7 | 1 | 6–8 |
| C: Map layers + builder | 8 | 10–15 | 1.5 | 11.5–16.5 |
| D: Intelligence + automation | 8 | 10–15 | 1.5 | 11.5–16.5 |
| E: Integrations + compliance | 4 | 8–12 | 1.5 | 9.5–13.5 |
| F: Frontend + final E2E regression | 4 | 5–7 | 2.5 | 7.5–9.5 |
| **TOTAL** | **40** | **48–70** | **10** | **~58–80 working days** |

Testing overhead adds ~10 working days across all phases. This is primarily manual
verification (API calls, browser checks, SQL queries). The final F gate is the largest
(2.5 days) because it includes the full end-to-end user workflow regression and
permission matrix sweep across all new endpoints.

---

## BACKLOG — NOT IN v1

Do not build any of these during v1. Mark code with `# TODO v1.x: <description>`.

**v1.x (3–6 months post-launch):**
- Metservice API integration
- ETc / evapotranspiration (confirm Harvest sensor capability first)
- Soil moisture layer from Harvest sensors
- Push notifications to mobile (requires mobile app)
- Mobile offline mode (SQLite queue, expo-sqlite)
- Phenology-conditional mobile menu
- Voice-to-text in observations
- Full PDF/Excel operational reporting
- GrapeLink full API push
- S-Map soil reference data (pending licence)
- GeoTIFF import
- External calendar sync (iCal / Google / Outlook) — see Phase 5.7 spec
- Full user-level notification preferences (dedicated table, channel/block scope)
- VMC portfolio dashboard (aggregate across all managed properties)
- Buffer zone assignment on operational areas
- Observation → risk/task pipeline (full automation beyond D4 partial)
- NDVI / vine health layer (Sentinel ESA free tier)
- Yield estimation map layer
- Spatial analysis tools (buffers, area calcs)
- Carbon reporting (calculation layer on top of v1 data capture)
- Data import wizard (CSV migration from Vinman / Cropsy / spreadsheets)
- Guided onboarding wizard

**v2 (6–18 months):**
- AI-assisted task suggestions
- Ferment data handoff (Fruit Intake Package at harvest completion)
- Lab API integrations (Hill Labs, Eurofins)
- Asset cost and depreciation tracking
- Full biosecurity with national / regional alert ingestion
- Management contract transfer workflow (formal ownership transfer)
- External WMS / tile source in Map Builder
- Biodiversity monitoring on operational areas

**v3 (18 months+):**
- Cropsy integration
- Xero / MYOB payroll integration
- Auxein Learn integration
- Consumer provenance / Discover integration

---

## APPENDIX — INFRASTRUCTURE REFERENCE

| Component | Detail |
|---|---|
| Backend | FastAPI on AWS Elastic Beanstalk (api.auxein.co.nz), t3.micro, Gunicorn+Uvicorn |
| Database | PostgreSQL + PostGIS on AWS RDS, ap-southeast-2 |
| Frontend — Pro web | React + Vite on S3 + CloudFront, port 5173 local |
| Frontend — Insights | React + Vite on S3 + CloudFront (insights.auxein.co.nz), port 5174 local |
| Mobile | React Native / Expo — stub only (post-v1) |
| Email | Gmail SMTP via UnifiedEmailService |
| File storage | Local disk on EB instance, company-scoped paths |
| Images | AWS S3 |
| CI/CD | GitHub Actions — daily climate (05:00 UTC), weather ingestion (every 6h) |
| Weather sources | Harvest Electronics (10-min), ECAN (hourly), HBRC (hourly) |
| Mapping | Mapbox GL JS |

## APPENDIX — KNOWN TECH DEBT

Address in context when working in nearby files. Do not create new instances.

| Item | Location | Fix |
|---|---|---|
| Hardcoded SECRET_KEY | `public_security.py` | Env var requirement at startup |
| Backup files in repo | `email_utils - Copy.py`, `email_service - Copy.py` | Delete |
| DEBUG print statements | `climate_calculations.py` | Remove all |
| Token cleanup not scheduled | `cleanup_expired_blacklist()` | Add to GitHub Actions daily job |
| Failed login tracking | Login endpoint | Increment counter on failure |
| Legacy `role` column | `users` table | Eventual migration to `user_type` only (v2 cleanup) |
| No middleware tenant isolation | All routes | Phase A9 PropertyService improves this; full middleware is v2 |
