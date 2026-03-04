# Auxein Insights Pro — Development Plan

> **For use by Claude Code.** Phases 0, 1, and 2 are COMPLETE. Work begins at Phase 2.5.
> Last updated: March 2026

---

## Phase 0: Discovery (REQUIRED FIRST STEP)

Before making any code changes, Claude Code must build a complete understanding of the current codebase. Run the following discovery steps and document findings before proceeding.

### 0.1 — Repository Structure

```bash
# Map the full monorepo layout
find . -maxdepth 4 -type f -name "*.py" -o -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" -o -name "*.json" -o -name "*.yml" -o -name "*.yaml" | head -200
ls -la
ls -la backend/
ls -la packages/
ls -la packages/web/src/
ls -la packages/insights/src/
ls -la packages/shared/src/ 2>/dev/null
ls -la packages/mobile/ 2>/dev/null
```

### 0.2 — Backend Architecture

```bash
# Database models — the source of truth
find backend/ -name "models.py" -o -name "models/" | head -20
cat backend/app/models/*.py 2>/dev/null || cat backend/app/models.py 2>/dev/null

# API routes
find backend/ -path "*/routes/*" -o -path "*/routers/*" -o -path "*/api/*" | head -30
cat backend/app/api/*.py 2>/dev/null

# Schemas (Pydantic)
find backend/ -path "*/schemas/*" | head -20

# Auth & middleware
find backend/ -name "auth*" -o -name "middleware*" -o -name "deps*" -o -name "security*" | head -20

# Config & environment
cat backend/.env.example 2>/dev/null
cat backend/app/config.py 2>/dev/null || cat backend/app/core/config.py 2>/dev/null
```

### 0.3 — Frontend Architecture (Web / Pro App)

```bash
# Component tree
find packages/web/src -name "*.jsx" -o -name "*.tsx" | head -50

# Services layer (API wrappers)
find packages/web/src -path "*/services/*" | head -20
cat packages/web/src/services/*.js 2>/dev/null | head -200

# Auth context
find packages/web/src -name "*Auth*" -o -name "*auth*" | head -10

# Routing
find packages/web/src -name "*Router*" -o -name "*routes*" -o -name "App.jsx" -o -name "App.tsx" | head -10
```

### 0.4 — Insights App (Free Public App)

```bash
find packages/insights/src -name "*.jsx" -o -name "*.tsx" | head -50
cat packages/insights/package.json
```

### 0.5 — Database State

```bash
# Check Alembic migrations
find . -path "*/alembic/versions/*" | head -30
cat alembic.ini 2>/dev/null

# Current models list — document every table
grep -r "class.*Base\)" backend/ --include="*.py" | head -40
```

### 0.6 — Deployment Configuration

```bash
# AWS / EB config
cat backend/Procfile 2>/dev/null
cat backend/.ebextensions/*.config 2>/dev/null
ls -la .github/workflows/ 2>/dev/null
cat .github/workflows/*.yml 2>/dev/null
```

### 0.7 — Document Findings

After discovery, create `DISCOVERY_REPORT.md` at the repo root containing:
- Complete list of database tables and their relationships
- All API route groups with endpoint counts
- Frontend page/component inventory
- Current user role system (fields, enums, middleware)
- Deployment topology (what's on AWS, what's local)
- Any tech debt or inconsistencies found

**Do not proceed to Phase 2.5 until the discovery report is complete and reviewed.**

---

## Current Platform Summary (Known Context)

### Tech Stack
| Layer | Technology |
|-------|-----------|
| Backend | FastAPI (Python), SQLAlchemy ORM, Pydantic schemas |
| Database | PostgreSQL + PostGIS on AWS RDS |
| Frontend (Pro) | React + Vite (`packages/web`), port 5173 |
| Frontend (Insights) | React + Vite (`packages/insights`), port 5174 |
| Mobile | React Native / Expo (`packages/mobile`) — scaffolding only |
| Shared | `packages/shared` — shared services, types, hooks |
| Maps | Mapbox GL JS |
| Auth | JWT (access + refresh tokens), company-based multi-tenancy |
| Deployment | Backend: AWS Elastic Beanstalk (api.auxein.co.nz), Frontend: S3 + CloudFront (insights.auxein.co.nz), DB: AWS RDS |

### Monorepo Structure
```
auxein-insights-v0.1/
├── backend/                 # FastAPI application
│   ├── app/
│   │   ├── api/             # Route handlers
│   │   ├── models/          # SQLAlchemy models
│   │   ├── schemas/         # Pydantic schemas
│   │   ├── services/        # Business logic
│   │   └── core/            # Config, security, deps
│   ├── Procfile             # EB deployment
│   └── .ebextensions/       # EB configuration
├── packages/
│   ├── web/                 # Auxein Insights Pro (authenticated SaaS)
│   ├── insights/            # Auxein Regional Intelligence (free/public)
│   ├── mobile/              # React Native app (scaffolding)
│   └── shared/              # Shared code across frontends
├── alembic/                 # Database migrations
└── .env                     # Shared environment variables
```

### Existing Backend Modules (built in Phases 0–2)
- **Auth**: JWT login, registration, email verification, password reset, refresh tokens
- **Companies**: Multi-tenant CRUD, subscription tiers
- **Users**: Roles (owner/admin/manager/user/viewer), profiles, team management
- **Vineyard Blocks**: PostGIS spatial data, GeoJSON, varieties, clones
- **Tasks**: CRUD, assignments, templates, status workflow, GPS tracking
- **Observations**: Plans, runs, spots, templates, image uploads
- **Risk Management**: Incidents, actions, NZ WorkSafe compliance
- **Assets**: Equipment, consumables, maintenance schedules, calibrations
- **Contractors**: Relationships, insurance, multi-company access
- **Training**: Modules, slides, assignments, completions
- **Visitors**: Check-in/out, inductions
- **Timesheets**: Daily entries, approval workflow
- **Weather**: Station data ingestion (Harvest, ECAN, MDC, GWRC), alerts
- **Notifications**: Model, CRUD, dispatch service, wired to tasks/incidents/actions/training/visitors/timesheets
- **Calendar**: Aggregated events endpoint across entity types
- **Reporting**: Task/observation/timesheet summaries, CSV export
- **Spatial**: Bounding box queries, nearest-block queries

---

## PHASE 2.5 — User Types & Permissions Overhaul (NEW)

**Goal:** Replace the current simple role system with a comprehensive 5-tier user type model that controls access across web and mobile platforms.

### 2.5.1 — Define the Five User Types

| User Type | Code | Platform Access | Scope |
|-----------|------|----------------|-------|
| **Auxein Admin** | `auxein_admin` | Web only | Full access to all tenants, all data, system configuration, subscription management, user provisioning across companies |
| **Company Admin** | `company_admin` | Web + Mobile | Full access within their tenant — all modules, all users, all settings, billing, contractor management |
| **Company Manager** | `company_manager` | Web + Mobile | Near-full operational access — can manage tasks, observations, assets, contractors, reports, team members. Cannot modify company settings, billing, or delete critical data |
| **Company User** | `company_user` | Mobile only (primary), limited web | Field worker role — assigned tasks, observation capture, GPS tracking, timesheets, training completion, incident reporting. Web access limited to viewing their own data and profile |
| **Contractor** | `contractor` | Web + Mobile | Controlled access based on active `ContractorRelationship` records. Can see assigned tasks, required training, and movement logging only for companies with active relationships. Multi-company capable |

### 2.5.2 — Database Changes

**Modify `users` table:**
- Replace existing `role` enum/field with `user_type` enum: `auxein_admin`, `company_admin`, `company_manager`, `company_user`, `contractor`
- Add `platform_access` computed or stored field (or derive from `user_type`)
- Ensure backward compatibility with any existing role references

**Modify or verify `contractor_relationships` table:**
- Confirm fields: `id`, `contractor_id` (FK users), `company_id` (FK companies), `status` (active/suspended/expired), `start_date`, `end_date`, `insurance_verified`, timestamps
- Add `permissions_override` JSON field (optional, for granular per-relationship permissions)

**Create `permissions` reference table (optional but recommended):**
```
permissions:
  id, user_type, module, action, allowed (boolean)
```
Where `module` = tasks, observations, assets, risks, training, visitors, timesheets, calendar, reports, blocks, contractors, users, settings, billing
And `action` = create, read, update, delete, assign, approve, export

Alternatively, define permissions as a code-level matrix (see 2.5.3).

### 2.5.3 — Permission Matrix (Code-Level Definition)

Create a permissions configuration file that serves as the single source of truth. Example structure:

```python
# backend/app/core/permissions.py

PERMISSIONS = {
    "auxein_admin": {
        "scope": "global",           # Access all tenants
        "platform": ["web"],
        "modules": "*",              # All modules, all actions
    },
    "company_admin": {
        "scope": "tenant",           # Own company only
        "platform": ["web", "mobile"],
        "modules": {
            "tasks": ["create", "read", "update", "delete", "assign", "approve"],
            "observations": ["create", "read", "update", "delete", "assign"],
            "assets": ["create", "read", "update", "delete"],
            "risks": ["create", "read", "update", "delete", "assign"],
            "training": ["create", "read", "update", "delete", "assign"],
            "visitors": ["create", "read", "update", "delete"],
            "timesheets": ["create", "read", "update", "delete", "approve"],
            "calendar": ["read"],
            "reports": ["read", "export"],
            "blocks": ["create", "read", "update", "delete"],
            "contractors": ["create", "read", "update", "delete", "assign"],
            "users": ["create", "read", "update", "delete"],
            "settings": ["read", "update"],
            "billing": ["read", "update"],
        }
    },
    "company_manager": {
        "scope": "tenant",
        "platform": ["web", "mobile"],
        "modules": {
            "tasks": ["create", "read", "update", "assign", "approve"],
            "observations": ["create", "read", "update", "assign"],
            "assets": ["create", "read", "update"],
            "risks": ["create", "read", "update", "assign"],
            "training": ["read", "assign"],
            "visitors": ["create", "read", "update"],
            "timesheets": ["create", "read", "update", "approve"],
            "calendar": ["read"],
            "reports": ["read", "export"],
            "blocks": ["read", "update"],
            "contractors": ["read", "assign"],
            "users": ["read"],
            "settings": [],           # No access
            "billing": [],            # No access
        }
    },
    "company_user": {
        "scope": "tenant",
        "platform": ["mobile"],       # Primary mobile, limited web
        "web_access": "read_own",     # Can view own profile and data on web
        "modules": {
            "tasks": ["read_assigned", "update_own", "complete"],
            "observations": ["create", "read_own"],
            "assets": ["read", "log_maintenance"],
            "risks": ["create", "read_own"],
            "training": ["read_assigned", "complete"],
            "visitors": ["create"],
            "timesheets": ["create", "read_own", "submit"],
            "calendar": ["read_own"],
            "reports": [],
            "blocks": ["read"],
            "contractors": [],
            "users": [],
            "settings": [],
            "billing": [],
        }
    },
    "contractor": {
        "scope": "relationship",      # Only companies with active relationship
        "platform": ["web", "mobile"],
        "modules": {
            "tasks": ["read_assigned", "update_own", "complete"],
            "observations": ["create", "read_own"],
            "assets": ["read"],
            "risks": ["create"],
            "training": ["read_assigned", "complete"],
            "visitors": [],
            "timesheets": ["create", "read_own", "submit"],
            "calendar": ["read_assigned"],
            "reports": [],
            "blocks": ["read"],
            "contractors": [],
            "users": [],
            "settings": [],
            "billing": [],
        }
    }
}
```

### 2.5.4 — Backend Middleware & Dependency Changes

1. **Create `require_permission(module, action)` dependency** that checks the user's `user_type` against the permissions matrix
2. **Update `get_current_user` dependency** to include `user_type` in the JWT payload and returned user object
3. **Update contractor middleware** (built in Phase 0.3) to validate `ContractorRelationship.status == 'active'` AND check the contractor permissions matrix
4. **Update every route handler** to use `require_permission()` instead of ad-hoc role checks
5. **Add `require_platform(platform)` check** for endpoints that should only be accessible from specific platforms (optional — can also be enforced at the frontend/API gateway level)

### 2.5.5 — Frontend Changes

**Web app (`packages/web`):**
- Update `AuthContext` to expose `user_type` and a `hasPermission(module, action)` helper
- Update navigation/sidebar to show/hide modules based on permissions
- Hide admin-only pages (settings, billing, user management) from managers and below
- Add Auxein Admin panel (system-wide view, all tenants) — may be a separate route group
- Restrict Company User web access to profile and read-only views of their own data

**Mobile app (`packages/mobile`):**
- Role-aware home screen: different dashboard for admin/manager vs. user vs. contractor
- Contractor: show company switcher when multiple active relationships exist
- Company User: show simplified navigation per the mobile field menu (see Phase 3)

### 2.5.6 — Migration Strategy

1. Write Alembic migration to add `user_type` column with default based on existing `role` mapping:
   - `admin` or `owner` → `company_admin`
   - `manager` → `company_manager`
   - `user` or `viewer` → `company_user`
   - Users with contractor relationships → `contractor`
   - Pete Taylor / system admin → `auxein_admin`
2. Backfill existing users
3. Remove or deprecate old `role` field after confirming all references are updated
4. Test all endpoints with each user type

### 2.5.7 — Testing Checklist

For each of the 5 user types, verify:
- [ ] Login succeeds and JWT contains correct `user_type`
- [ ] Permitted endpoints return 200
- [ ] Forbidden endpoints return 403
- [ ] Tenant isolation holds (no cross-company data leakage)
- [ ] Contractor can only access companies with active relationships
- [ ] Company User cannot access admin/settings endpoints
- [ ] Auxein Admin can access all tenants
- [ ] Platform restrictions are enforced (Company User primarily mobile)

---

## PHASE 3 — Web & Mobile Core Workflows (Parallel)

**Prerequisite:** Phase 2.5 complete (permissions system in place).

### Web (filling gaps in existing Pro app)

| # | Task | Detail |
|---|------|--------|
| W3.1 | **Calendar page** | Build `/calendar` consuming the aggregated calendar endpoint. Week/month view. Show tasks, observation plans, maintenance due, training deadlines, action due dates. |
| W3.2 | **Notifications UI** | Bell icon with unread count badge. Dropdown notification list. Full page at `/notifications`. Mark read/unread. Click-through to relevant entity. |
| W3.3 | **Contractor management UI** | Admin page to view/manage contractor relationships, approve/suspend contractors, view insurance status, assign tasks to contractors. Respect `company_admin` and `company_manager` permissions. |
| W3.4 | **GPS tracking dashboard** | Live/historical GPS track visualization on Mapbox map for active tasks. Track stats (distance, area, speed). |
| W3.5 | **Unified reporting page** | `/reports` with tabs: Tasks, Observations, Timesheets, Assets. Summary stats + CSV export. Respect user type permissions for export access. |

### Mobile (build from scratch)

| # | Task | Detail |
|---|------|--------|
| M3.1 | **Project scaffolding** | React Navigation (bottom tabs + stack), auth screens (login with user type detection), token storage, shared service wiring. Role-aware navigation based on `user_type`. |
| M3.2 | **Home dashboard** | Company name, quick stats (tasks, observations), weather widget, recent notifications count. Adapt layout per user type. |
| M3.3 | **Task list & detail** | My Tasks list (filterable by status), task detail with actions (start/pause/resume/complete), assignment info. |
| M3.4 | **Task creation (simplified)** | Quick-create from template, basic field entry, block selection, user assignment. Available to `company_admin`, `company_manager` only. |
| M3.5 | **GPS tracking** | `expo-location` integration, background tracking, bulk point upload, live track display on map, start/pause/resume/stop controls. |
| M3.6 | **Observation capture** | Simplified mobile menu (see below). Select template → start run → capture spots with GPS + camera (`expo-image-picker`) + form fields → complete run. |

### Mobile Field Menu (Simplified Navigation)

Instead of mirroring the web app's module-based navigation, the mobile app presents a **task-oriented menu**:

```
┌──────────────────────────────┐
│  Disease Observations        │
│  Phenology Observations      │
│  Bud Count *                 │  ← Hidden after phenological stage passed
│  Flower Count *              │  ← Hidden after flowering
│  Bunch Count                 │
│  Bunch/Berry Sampling        │
│  Hazard                      │
│  Health and Safety           │
│  Log a Task                  │
│  Start / Resume Tasks        │
│  Tractor Task                │
└──────────────────────────────┘
* Items marked with asterisk are conditionally hidden based on phenological stage data.
```

Each menu item opens a **simple, single-purpose form** with photo, video, voice-to-text, and GPS auto-capture.

---

## PHASE 4 — Web & Mobile Secondary Features

### Web

| # | Task | Detail |
|---|------|--------|
| W4.1 | **Weather alerts display** | Surface weather alerts on home dashboard and calendar. |
| W4.2 | **Insights completion** | Build out phenology views, disease pressure graphs (UC Davis/González-Domínguez/Goidanich models), pest/disease calendar overlay with spray tasks and weather indices. Yield estimation views using bud/flower/bunch count progression. Pre-harvest sampling insights. |
| W4.3 | **Pro app header/footer** | Apply consistent branding — header with section links, matching footer. |
| W4.4 | **Spray diary auto-generation** | Tractor tasks + consumables + weather conditions + phenology + GPS → auto-generated spray diary for compliance review and submission. |
| W4.5 | **Asset insights** | Carbon calculator from fuel use, machine hours, GPS data. Consumable compliance tracking for sustainability accreditations. Maintenance/calibration calendar. |

### Mobile

| # | Task | Detail |
|---|------|--------|
| M4.1 | **Risk/incident reporting** | Create incident form with camera, GPS auto-fill, severity selection. View assigned actions. |
| M4.2 | **Asset lookup** | View equipment/consumables, log maintenance completion, record stock usage. |
| M4.3 | **Timesheeting** | Daily time entry against tasks, submit for approval. |
| M4.4 | **Visitor check-in** | Quick visitor registration, sign-in/out, induction confirmation. |
| M4.5 | **Training viewer** | View assigned modules, swipe through slides, answer questions, track completion. |
| M4.6 | **Notifications** | `expo-notifications` setup, push token registration, in-app notification list. |

---

## PHASE 5 — Polish & Offline

| # | Task | Detail |
|---|------|--------|
| 5.1 | **Mobile offline support** | Local SQLite storage for tasks, observations, GPS points. Queue mutations when offline, sync on reconnect, conflict resolution. |
| 5.2 | **Mobile map** | `react-native-maps` or Mapbox RN with block visualization, GPS overlay, task location context. |
| 5.3 | **Contractor mobile experience** | Contractor-specific home screen, company list from active relationships, company switcher, assigned tasks, training, movement/biosecurity logging. |
| 5.4 | **Calendar on mobile** | Calendar view with tasks, training, maintenance due dates. |
| 5.5 | **Push notifications backend** | FCM/APNS integration, device token CRUD, push delivery in notification dispatch service. |
| 5.6 | **Reporting on mobile** | Summary dashboards, exportable views. |
| 5.7 | **External calendar sync** | iCal feed generation endpoint. Google Calendar / Outlook integration. |

---

## Dependency Graph

```
Phase 0: Discovery (understand codebase)
└─→ Phase 2.5: User Types & Permissions Overhaul
    ├─→ Phase 3 Web (calendar, notifications UI, contractor mgmt, GPS dashboard, reports)
    ├─→ Phase 3 Mobile (scaffold, tasks, GPS, observations)
    │   ├─→ Phase 4 Mobile (incidents, assets, timesheets, training, push)
    │   └─→ Phase 5 (offline, maps, contractor experience, calendar sync)
    └─→ Phase 4 Web (weather alerts, insights views, styling, spray diary, asset insights)
        └─→ Phase 5 (external calendar sync, reporting polish)
```

---

## Critical Rules

1. **Backend changes must not break the live Insights app.** Every backend change must include regression testing against the insights app's endpoints (public climate, auth, weather). The Insights app is live at `insights.auxein.co.nz`.

2. **Shared package changes affect all three consumers** (web, mobile, insights). Any service signature changes must be backwards compatible or coordinated across all packages.

3. **Tenant isolation is non-negotiable.** Every query touching company data must filter by `company_id`. Contractor access must validate active relationship status on every request.

4. **Permissions are enforced at the API level, not just the UI.** Frontend hides elements for UX; the backend must independently reject unauthorized requests with 403.

5. **Mobile-first for field workflows.** The observation and task capture UX must be optimized for one-handed phone use in the field. Keep forms minimal — GPS, camera, and voice-to-text do the heavy lifting.

6. **Alembic for all schema changes.** No manual SQL. Every migration must be reversible.

---

## Observations & Tasks — Simplified Data Model Notes

From the product simplification documents:

### Observations
- **Rationalise templates** to key types: Disease, Phenology, Bud Count, Flower Count, Bunch Count, Bunch/Berry Sampling, Hazard, H&S. Remainder are free-form.
- **Remove plan targets model** and integrations — keep free text for user notes in plans.
- **Small operators**: In-field, select template → GO (no planning required).
- **All operators**: Runs and spots are tied to blocks/varieties/clones for insights linkage.
- **Insights**: Disease observations tied to modelled disease pressures. Phenology mapped with weather indices and regional averages. Yield estimates build from bud → flower → bunch → sampling data points.
- **Observation-to-task automation**: Observations that trigger tasks (e.g., maintenance) should auto-create tasks. Risk-triggering observations route to the risk model, not observations.

### Tasks
- **Row-level tracking**: Tasks are often long-duration where rows are completed individually. The task model needs a sub-unit (row progress) concept.
- **Templates** for recurring tasks (desktop only for creation).
- **Tractor tasks** link to assets, consumables, calibrations for spray diary generation.
- **Task duration** measured for time/cost analysis.
- **Contractor tracking** for biosecurity-related movements.

### Assets
- **Ensure build is ready for financial components** (cost tracking, depreciation — future phase).
- **Link assets, calibrations, and consumables to tractor tasks** for spray diaries.
- **Carbon calculator** based on fuel use, machine hours, GPS data.
- **Consumable compliance** tagged for sustainability accreditations.