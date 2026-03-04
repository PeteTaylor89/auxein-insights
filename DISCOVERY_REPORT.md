# Auxein Insights Pro — Phase 0 Discovery Report

> Generated: March 2026
> Scope: Full codebase discovery for Phase 2.5 (User Types & Permissions Overhaul)

---

## 1. Database Tables & Relationships

### 1.1 Table Inventory (62 tables)

| # | Table | Purpose | Tenant-Scoped |
|---|-------|---------|---------------|
| 1 | `companies` | Root tenant entity | N/A (is tenant) |
| 2 | `subscriptions` | Pricing tiers and feature config | No (global) |
| 3 | `users` | Internal company staff (3-role system) | Yes |
| 4 | `public_users` | Public/content consumer accounts (Integer PKs) | No (global) |
| 5 | `invitations` | Pending user invitations | Yes |
| 6 | `token_blacklist` | JWT revocation | No |
| 7 | `contractors` | Third-party service providers | No (global) |
| 8 | `contractor_relationships` | Contractor ↔ Company links | Yes |
| 9 | `contractor_assignments` | Work assignments to contractors | Yes |
| 10 | `contractor_movements` | Biosecurity visit tracking | Yes |
| 11 | `contractor_training` | Contractor training assignments | No |
| 12 | `tasks` | Work instances | Yes |
| 13 | `task_templates` | Reusable task definitions | Yes |
| 14 | `task_assignments` | Task ↔ User links | No |
| 15 | `task_rows` | Row-level progress tracking | No |
| 16 | `task_gps_tracks` | GPS tracking points | No |
| 17 | `task_assets` | Task ↔ Asset junction (many-to-many) | No |
| 18 | `timesheet_days` | Daily timesheet records | Yes |
| 19 | `time_entries` | Time entries against tasks | No |
| 20 | `site_risks` | Risk assessments (PostGIS) | Yes |
| 21 | `risk_actions` | Risk mitigation actions | Yes |
| 22 | `incidents` | H&S incidents (WorkSafe NZ) | Yes |
| 23 | `training_modules` | Training course content | Yes |
| 24 | `training_slides` | Slide content within modules | No |
| 25 | `training_questions` | Assessment questions | No |
| 26 | `training_question_options` | Multiple choice options | No |
| 27 | `training_records` | Polymorphic completion tracking | No |
| 28 | `training_attempts` | Individual attempt records | No |
| 29 | `assets` | Equipment, vehicles, consumables | Yes |
| 30 | `asset_maintenance` | Maintenance history/scheduling | Yes |
| 31 | `asset_calibrations` | Equipment calibration records | Yes |
| 32 | `stock_movements` | Consumable inventory tracking | Yes |
| 33 | `visitors` | Master visitor records | Yes |
| 34 | `visitor_visits` | Individual visit logs | Yes |
| 35 | `observation_templates` | Reusable observation protocols | Yes |
| 36 | `observation_plans` | Planned observation campaigns | Yes |
| 37 | `observation_plan_targets` | Plan ↔ Block targets | No |
| 38 | `observation_plan_assignees` | Plan ↔ User assignments | No |
| 39 | `observation_runs` | Completed observation instances | Yes |
| 40 | `observation_spots` | Individual data points (PostGIS) | Yes |
| 41 | `vineyard_blocks` | Vineyard parcels (PostGIS) | Yes |
| 42 | `vineyard_rows` | Individual rows within blocks | No |
| 43 | `spatial_areas` | Custom spatial zones (PostGIS) | Yes |
| 44 | `files` | Centralized file management (UUID PKs) | Yes |
| 45 | `articles` | Blog/news for Regional Insights | No (global) |
| 46 | `article_comments` | Article comments (threaded) | No |
| 47 | `article_likes` | Article likes | No |
| 48 | `research_reports` | Research publications | No (global) |
| 49 | `research_sections` | Sections within reports | No |
| 50 | `research_files` | Downloadable research files | No |
| 51 | `research_comments` | Research comments (threaded) | No |
| 52 | `research_likes` | Research likes | No |
| 53 | `email_templates` | Reusable email templates | No (global) |
| 54 | `email_campaigns` | Email marketing campaigns | No (global) |
| 55 | `email_sends` | Individual email delivery tracking | No |
| 56 | `notifications` | In-app notifications | Yes |
| 57 | `company_land_ownerships` | Land parcel ownership | Yes |
| 58 | `wine_regions` | Geographic wine regions (PostGIS) | No (global) |
| 59 | `primary_parcels` | Cadastral reference data (LINZ) | No (global) |
| 60 | `weather` | Weather observation data | No (global) |
| 61 | `climate_historical_data` | Historical climate for blocks | No |
| 62 | `blockchain_chains` | Immutable operation logs | Yes |

### 1.2 Current Role System

**Users table (`users.role`):**
```
"admin"    → Full system access, manage users/billing/all features
"manager"  → Operational management, staff, observations, tasks, risks
"user"     → Field worker: create observations, complete tasks, view own data
```

**PublicUser table (`public_users`):**
- `is_admin` boolean (supplemental to `@auxein.co.nz` domain check)
- `user_type` string: wine_company_owner, wine_company_employee, consultant, wine_enthusiast, researcher
- `subscription_tier`: free, pro

**Contractors table (`contractors`):**
- Separate table entirely (not in `users`)
- `verification_level`: none, basic, full, premium
- `contractor_type`: individual, company, partnership
- Access controlled via `contractor_relationships` status

### 1.3 Key Relationship Patterns

- **Multi-tenancy**: Nearly all models have `company_id` FK. No middleware-level isolation — every route manually filters.
- **Polymorphic**: `TrainingRecord` uses `entity_type` + `entity_id` (user, visitor, contractor). `File` uses `entity_type` + `entity_id`.
- **Self-referential**: `User.invited_by → User.id`, `RiskAction.parent_action_id`, `SpatialArea.parent_area_id`, `ContractorMovement.previous_company_id`.
- **Soft deletes**: `User.deleted_at`, `File.deleted_at`.

### 1.4 Alembic Migrations

- **54 migration files** tracked in `alembic/versions/`
- Key migrations: initial tables → auth fields → spatial/PostGIS → company support → contractor system → training → tasks → observations → climate → public auth → content platform → notifications → timesheets
- `alembic/env.py` imports core models and filters PostGIS system tables

---

## 2. API Route Groups

### 2.1 Endpoint Summary (~600+ endpoints across 40 router modules)

| # | Route Group | Prefix | Endpoint Count | Auth Pattern |
|---|-------------|--------|----------------|-------------|
| 1 | Auth | `/api/auth` | ~13 | Mixed public/authenticated |
| 2 | Public Auth | `/api/v1/public/auth` | ~11 | Public user JWT |
| 3 | Companies | `/api/companies` | ~20 | `get_current_user` / mixed |
| 4 | Admin (Company) | `/api/admin` | ~15 | `get_current_user` + role check |
| 5 | Admin (Public Users) | `/api/v1/admin/users` | ~12 | `require_admin` |
| 6 | Admin (Banners) | `/api/v1/admin/banners` | 4 | `require_admin` |
| 7 | Admin (Weather) | `/api/v1/admin/weather` | ~15 | `require_admin` |
| 8 | Admin (Data Quality) | `/api/v1/admin/data` | ~20 | `require_admin` |
| 9 | Blocks | `/api/blocks` | ~20 | `get_current_user` |
| 10 | Vineyard Rows | `/api/vineyard_rows` | ~15 | `get_current_user` |
| 11 | Spatial Areas | `/api/spatial_areas` | ~12 | `get_current_user` |
| 12 | Parcels | `/api/parcels` | ~18 | Mixed |
| 13 | Observations | `/api/observations` | ~45 | Mixed |
| 14 | Observation Runs | `/api/observation_runs_complete` | ~2 | `get_current_user` |
| 15 | Climate | `/api/climate` | ~12 | `get_current_user` |
| 16 | Public Climate | `/api/v1/public/public_climate` | ~15 | Public (no auth) |
| 17 | Realtime Climate | `/api/v1/public/realtime` | ~20 | Public (no auth) |
| 18 | Risk Management | `/api/risk-management` | ~50 | `get_current_user` |
| 19 | Tasks | `/api/tasks` | ~80 | `get_current_user` + role checks |
| 20 | Training | `/api/training` | ~20 | `get_current_user` |
| 21 | Timesheets | `/api/timesheets` | ~15 | Mixed |
| 22 | Visitors | `/api/visitors` | ~15 | `get_current_user` |
| 23 | Assets | `/api/assets` | ~20 | `get_current_user` |
| 24 | Maintenance | `/api/maintenance` | ~15 | `get_current_user` |
| 25 | Calibrations | `/api/calibrations` | ~15 | `get_current_user` |
| 26 | Stock Movements | `/api/stock-movements` | ~15 | `get_current_user` |
| 27 | Articles | `/api/v1/articles` | ~20 | Mixed (public read / admin write) |
| 28 | Research | `/api/v1/research` | ~20 | Mixed (public read / admin write) |
| 29 | Article Images | `/api/v1/article-images` | ~5 | `require_admin` |
| 30 | Email Campaigns | `/api/v1/campaigns` | ~15 | `require_admin` |
| 31 | Enrichment | `/api/v1/enrichment` | ~8 | Mixed |
| 32 | Public Banners | `/api/v1/public/banners` | 1 | Public |
| 33 | Regions | `/api/v1/public/regions` | ~8 | Public |
| 34 | GIS | `/api/v1/public/gis` | ~8 | Public |
| 35 | Blocks Query | `/api/v1/public/blocks` | ~15 | Public |
| 36 | Files | `/api/files` | ~10 | `get_current_user` |
| 37 | Notifications | `/api/v1/notifications` | ~8 | `get_current_public_user` |
| 38 | SEO | `/` | 3 | Public |
| 39 | Blockchain | `/api/blockchain` | ~5 | `get_current_user` |
| 40 | Subscriptions | `/api/subscriptions` | ~8 | `get_current_user` |

### 2.2 Auth Dependency Patterns

| Dependency | Returns | Used By |
|------------|---------|---------|
| `get_current_user()` | `User` | Company-only endpoints |
| `get_current_contractor()` | `Contractor` | Contractor-only endpoints |
| `get_current_user_or_contractor()` | `Union[User, Contractor]` | Mixed endpoints |
| `get_current_public_user()` | `PublicUser` | Insights platform |
| `get_optional_public_user()` | `Optional[PublicUser]` | Mixed public endpoints |
| `require_admin` | `PublicUser` (admin) | Insights admin panel |

### 2.3 Role Check Inconsistencies

Role checks are ad-hoc across routes with no standardized pattern:

```python
# Pattern 1: Direct equality
if current_user.role != "admin": raise HTTPException(403)

# Pattern 2: List membership
if current_user.role not in ["admin", "manager"]: raise HTTPException(403)

# Pattern 3: Permission service (rare, only in risk management)
if not RiskPermissions.can_create_risk_action(user): raise PermissionError()
```

**There is no centralized `require_permission()` dependency.** This is the primary gap Phase 2.5 addresses.

---

## 3. Frontend Page/Component Inventory

### 3.1 Web App — Auxein Insights Pro (`packages/web`)

**29 authenticated pages, 6 public pages**

| Category | Routes | Key Pages |
|----------|--------|-----------|
| Dashboard | `/` | Home with stats, weather, company info |
| Auth | `/login`, `/forgot-password`, `/reset-password`, `/accept-invitation` | Standard auth flow |
| Profile | `/profile`, `/change-password` | User profile management |
| Maps | `/maps` | Vineyard block mapping (Mapbox GL) |
| Risk | `/RiskDashboard`, `/risks/create`, `/actions/create`, `/incidents/create`, `/incidents/:id/edit` | Risk management suite |
| Insights | `/Insights` | Data analytics page |
| Visitors | `/visitors` (public), `/admin/visitors` | Visitor registration & management |
| Training | `/training`, `/training/modules/:id/edit`, `/training/take/:id` | Training modules |
| Timesheets | `/timesheets` | Time recording |
| Observations | `/observations`, `/planobservation`, `/plandetail/:id`, `/planedit/:id`, `/observations/runstart/:planId`, `/observations/runcapture/:id`, `/observations/adhoc` | Full observation workflow |
| Assets | `/assets`, `/assets/equipment/new`, `/assets/equipment/:id/edit`, `/assets/consumables/new`, `/assets/consumables/:id/edit` | Equipment & consumables |
| Tasks | `/tasks/templates/new`, `/tasks/templates/:id/edit`, `/tasks/new`, `/tasks/create` | Task management |

**Components:** 42 components across root + 5 subdirectories (admin, climate, training, TaskManagement, widgets)

**Navigation:** `Navigation.jsx`, `AppBar.jsx`, `MobileNavigation.jsx` — no role-based filtering currently

### 3.2 Insights App — Regional Intelligence (`packages/insights`)

**17 public pages, 15 admin pages**

| Category | Routes | Key Pages |
|----------|--------|-----------|
| Public | `/`, `/about`, `/legal` | Landing, about, legal |
| Articles | `/articles`, `/articles/:slug` | Content listing & detail |
| Research | `/research`, `/research/:slug` | Research listing & detail |
| Admin Dashboard | `/admin` | Overview dashboard |
| Admin Users | `/admin/users`, `/admin/users/:id` | User management |
| Admin Content | `/admin/articles`, `/admin/articles/new`, `/admin/articles/:id/edit` | Article CRUD |
| Admin Research | `/admin/research`, `/admin/research/new`, `/admin/research/:id/edit` | Research CRUD |
| Admin Weather | `/admin/weather`, `/admin/weather/:id` | Weather station management |
| Admin Banners | `/admin/banners` | Site banner management |
| Admin Email | `/admin/email`, `/admin/email/new`, `/admin/email/:id/edit` | Email campaigns |

**Components:** 39 components across auth (8), climate (11), editor (3), RegionalMap (7), legal (4)

**Admin Protection:** `AdminRoute` wrapper checks `user.is_admin` boolean

### 3.3 Shared Package (`packages/shared`)

**Exports:**
- 21 API service modules (authService, blocksService, tasksService, etc.)
- `AuthContext` + `useAuth()` hook (multi-tenant company/contractor auth)
- 9 training-related hooks
- `usePullToRefresh()`, `useImageUpload()` hooks
- Password reset utilities

### 3.4 Mobile App (`packages/mobile`)

**Status: Stub only** — single "Coming soon!" screen with Expo 53 + React Native 0.79.6 scaffolding.

---

## 4. Current User Role System

### 4.1 Company Users (`users` table)

| Field | Type | Values | Purpose |
|-------|------|--------|---------|
| `role` | String(20) | `admin`, `manager`, `user` | Access control |
| `is_active` | Boolean | — | Account enabled |
| `is_verified` | Boolean | — | Email verified |
| `is_suspended` | Boolean | — | Admin suspension |
| `can_login` | Computed | — | `is_active AND is_verified AND NOT suspended AND NOT locked` |

**Schema-Level Permission Matrix:**
```python
admin:   manage_company, manage_users, manage_billing, manage_blocks,
         manage_observations, manage_tasks, manage_risks, view_analytics,
         export_data, manage_settings, view_training

manager: manage_blocks, manage_observations, manage_tasks, manage_risks,
         view_analytics, export_data, view_training

user:    create_observations, complete_tasks, edit_own_tasks,
         view_blocks, export_own_data, view_training
```

**JWT Claims (Company User):**
```json
{
  "sub": "user_id",
  "user_type": "company_user",
  "type": "access",
  "jti": "uuid",
  "company_id": 123,
  "role": "admin"
}
```

### 4.2 Contractors (`contractors` table)

- Entirely separate table from `users`
- Auth via `get_current_contractor()` dependency
- Access scoped by `ContractorRelationship` status
- `can_work_today` computed from contract dates

**JWT Claims (Contractor):**
```json
{
  "sub": "contractor_id",
  "user_type": "contractor",
  "type": "access",
  "jti": "uuid",
  "company_ids": [1, 2, 3]
}
```

### 4.3 Public Users (`public_users` table)

- Integer PKs (not UUIDs)
- `is_admin` boolean for Insights admin panel
- Separate JWT implementation in `public_security.py`
- 7-day token expiry (vs 3-hour for company users)

**JWT Claims (Public User):**
```json
{
  "user_id": 42,
  "email": "user@example.com",
  "type": "public_access",
  "exp": "7 days",
  "iat": "now"
}
```

### 4.4 How Phase 2.5 Maps to Current State

| Phase 2.5 User Type | Current Equivalent | Migration Path |
|----------------------|-------------------|----------------|
| `auxein_admin` | No equivalent (uses domain check `@auxein.co.nz`) | New role — assign to system admin accounts |
| `company_admin` | `users.role = "admin"` or `"owner"` | Rename existing role |
| `company_manager` | `users.role = "manager"` | Rename existing role |
| `company_user` | `users.role = "user"` or `"viewer"` | Rename existing role |
| `contractor` | Separate `contractors` table | Needs architectural decision — keep separate or merge into `users` |

---

## 5. Deployment Topology

### 5.1 Infrastructure

| Component | Platform | URL/Config |
|-----------|----------|-----------|
| **Backend API** | AWS Elastic Beanstalk | api.auxein.co.nz, t3.micro, Gunicorn+Uvicorn |
| **Insights Frontend** | S3 + CloudFront | insights.auxein.co.nz |
| **Pro Frontend** | S3 + CloudFront (assumed) | — |
| **Database** | AWS RDS | PostgreSQL + PostGIS, ap-southeast-2 |
| **Article Images** | AWS S3 | ARTICLE_IMAGES_S3_BUCKET + CDN |
| **File Uploads** | Local disk (EB instance) | `{UPLOAD_DIR}/{company_id}/{entity_type}/...` |
| **Secrets** | AWS Secrets Manager | RDS credentials |
| **Email** | Gmail SMTP | smtp.gmail.com:587 |

### 5.2 CI/CD (GitHub Actions)

| Workflow | Schedule | Purpose |
|----------|----------|---------|
| `daily-processing.yml` | 5:00 UTC (NZDT) / 6:00 UTC (NZST) | Daily climate data processing |
| `weather-ingestion.yml` | Every 6 hours | Weather data ingestion (Harvest, ECAN sources) |

### 5.3 Docker

- Root `Dockerfile`: Multi-stage (Node build + Python runtime)
- `backend/Dockerfile`: Python 3.11-slim standalone
- `packages/web/Dockerfile`: Multi-stage (Node build + Nginx)

### 5.4 Key Dependencies

**Backend (Python):** FastAPI 0.115.12, SQLAlchemy 2.0.40, Alembic 1.15.2, GeoAlchemy2 0.17.1, python-jose 3.4.0, bcrypt, boto3, Pillow, pandas

**Frontend (Node):** React 18.3.1, Vite 6.3.5, React Router 7.6.0, Mapbox GL 3.12.0, Chart.js 4.5.0, TipTap 3.20.0 (insights), React Hook Form 7.56.3 (web)

---

## 6. Tech Debt & Inconsistencies

### 6.1 Critical Security Issues

| # | Issue | Location | Severity | Detail |
|---|-------|----------|----------|--------|
| 1 | **Hardcoded default SECRET_KEY** | `backend/core/public_security.py:18` | HIGH | Falls back to `"your-secret-key-change-in-production"` if env var missing. Could allow token forgery. |
| 2 | **Dual JWT implementations** | `core/security/auth.py` vs `core/public_security.py` | MEDIUM | Different keys, different lifetimes (3h vs 7d), different logic. Risk of token confusion. |
| 3 | **Incomplete token revocation** | `core/security/auth.py` | MEDIUM | `revoke_all_user_tokens()` is "simplified" — cannot truly revoke all outstanding tokens. |
| 4 | **Failed login tracking not enforced** | `User.failed_login_attempts`, `locked_until` | LOW | Fields exist in model but are never incremented or checked during login. |

### 6.2 Code Quality Issues

| # | Issue | Location | Detail |
|---|-------|----------|--------|
| 1 | **Backup files in repo** | `backend/core/email_utils - Copy.py`, `backend/services/email_service - Copy.py` | 52KB + 22KB duplicates cluttering repo |
| 2 | **DEBUG print statements** | `backend/services/climate_calculations.py` (lines 32, 35, 46, 59, 64, 66) | Bare `print()` instead of logging |
| 3 | **TODO/FIXME comments** | `tasks.py:1665,1676,1762`, `companies.py:435,450` | Unimplemented distance calc, storage usage |
| 4 | **Hardcoded emails** | `core/email_templates.py`, `core/email_utils.py` | `support@auxein.co.nz`, should be in config |
| 5 | **Dead code** | `blockchain.py:171`, `training_slide.py:186-190` | Commented out relationships, deprecated methods |
| 6 | **Circular import risk** | `public_security.py` → `api/deps.py` | Fragile import chain |

### 6.3 Architectural Inconsistencies

| # | Issue | Impact on Phase 2.5 |
|---|-------|---------------------|
| 1 | **No centralized permission checking** | Every route does ad-hoc role checks differently. Phase 2.5 must replace all with `require_permission()`. |
| 2 | **No middleware-level tenant isolation** | Every query must manually filter `company_id`. New endpoints can easily leak data. |
| 3 | **Contractor is a separate entity from User** | Phase 2.5 proposes `contractor` as a user_type, but contractors live in a separate table with separate auth. Architectural decision needed. |
| 4 | **Admin auth path divergence** | Company admin: `user.role == "admin"` check in routes. Public admin: `require_admin` dependency. No unified pattern. |
| 5 | **Token cleanup not scheduled** | `cleanup_expired_blacklist()` exists but is never called by any background job or cron. |
| 6 | **Storage usage not calculated** | `companies.py:435,450` — hardcoded to 0.0, feature not implemented. |

### 6.4 Missing Features (Relevant to Phase 2.5+)

- No Calendar page (`/calendar`) in web app
- No Notifications UI (bell icon, dropdown) in web app
- No Contractor Management UI in web app
- No GPS Tracking Dashboard in web app
- No unified Reporting page in web app
- Mobile app is stub only
- No push notification infrastructure

---

## 7. Phase 2.5 Readiness Assessment

### What's Ready
- User model has extensible role field (String, not Enum — easy to change values)
- JWT already carries `user_type` and `role` claims
- `ContractorRelationship` with status and access controls exists
- Schema-level permission matrix defined in `schemas/user.py` (ROLE_PERMISSIONS dict)
- Alembic migrations are working and well-structured

### What Needs Decisions

1. **Contractor table architecture**: Keep contractors separate or merge into `users` table? The dev plan suggests `contractor` as a `user_type`, but the current architecture has a wholly separate `contractors` table with its own auth flow.

2. **Auxein Admin scope**: Currently, system-level admin is handled via `@auxein.co.nz` email domain check + `is_admin` boolean on `PublicUser`. Phase 2.5 wants `auxein_admin` as a `user_type` on the `users` table. These are different tables.

3. **Permission storage**: Code-level matrix (recommended in dev plan) vs database `permissions` table. Current codebase already has a code-level `ROLE_PERMISSIONS` dict in schemas.

4. **Public security unification**: Should `public_security.py` be merged with `core/security/auth.py` to use a single JWT implementation?

### Estimated Scope of Change

| Area | Files Affected | Complexity |
|------|----------------|------------|
| Database migration | 1 new Alembic migration | Medium |
| User model changes | `user.py`, `user.py` schema | Medium |
| Permission system | New `permissions.py` | High (new module) |
| Auth dependencies | `deps.py`, `security/auth.py` | High |
| Route updates | ~25 router files | High (volume) |
| Frontend auth | `AuthContext.jsx`, `ProtectedRoute.jsx` | Medium |
| Frontend navigation | `Navigation.jsx`, `AppBar.jsx` | Medium |
| Testing | All user types × all endpoints | High (volume) |

---

*End of Discovery Report. Do not proceed to Phase 2.5 until reviewed.*
