# Grow V1 — Plan Revision 2

> **Date:** 2026-03-25
> **Status:** Draft for review — modifies ownership model, adds alias tables,
> company admin page, calendar interactions, row task management, and
> property-level scoping for insights/reporting.

---

## 1. SUMMARY OF CHANGES FROM REVISION 1

| # | Change | Impact |
|---|--------|--------|
| 1 | **Remove owner read-only concept** — property owner company admins get full admin privileges (not view-only) | Simplify `property_service.py`, remove `is_owner_viewing()`, update `verify_block_access()` |
| 2 | **Alias relationship table** — single polymorphic table linking any entity to external system IDs | New model + migration + admin UI |
| 3 | **User↔Property assignment** — make `UserPropertyScope` the primary tool for assigning users to properties within a company | Upgrade existing model, add admin UI, enforce in all queries |
| 4 | **Property = key management unit** — insights, reporting, calendar all property-scoped with company rollup | Modify report/calendar/insights endpoints |
| 5 | **Company Admin page** — new frontend page for company_admin users (timesheets, training, aliases, grapelink, reporting, metservice, harvest stations, calendar URLs) | New page + backend endpoints |
| 6 | **Calendar create + drag** — "+" button to create task from calendar, drag events to change dates | Frontend + PATCH endpoint |
| 7 | **Row task management** — complete the row-level task workflow end-to-end | Backend endpoints + frontend UI |
| 8 | **Forecast point on Property** — property-level lat/lng for MetOcean weather API (replacing block centroid lookup) | New columns + migration + WeatherWidget update |
| 9 | **iCal feed per user** — user-specific calendar feeds for Google/Apple Calendar subscription | New backend iCal endpoint + token-based auth |

---

## 2. DETAILED CHANGES

### 2.1 Remove Owner Read-Only Concept

**Current state:** `is_owner_viewing()` returns True when a user's company owns a property but another company manages it. This blocks all write operations for the owner.

**New rule:** Any `company_admin` of the owner company gets full admin privileges on the property, even when another company manages it. The owner is not "absent" — they have full rights.

**Rationale:** Simplifies the mental model. A property owner should always be able to manage their property. The VMC relationship is about delegation, not lockout.

**Changes required:**

| File | Change |
|------|--------|
| `backend/services/property_service.py` | Remove `is_owner_viewing()` function. Remove `OWNER_READONLY_MSG`. Update `verify_block_access()` to drop the owner read-only gate. |
| `backend/api/tasks.py` | Remove any `is_owner_viewing` checks on task create/update |
| `backend/api/observations.py` | Remove any `is_owner_viewing` checks |
| `GROW_V1_PLAN.md` | Update Section 2.6 and Rule 5 in Section 7 |

**`verify_block_access()` simplified:**
```python
def verify_block_access(db, current_user, block_id, require_write=False):
    block = db.query(VineyardBlock).filter(VineyardBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    if current_user.user_type == "auxein_admin":
        return block
    # Check via property or legacy company_id
    if block.property_id:
        visible_ids = get_visible_property_ids(db, current_user)
        if block.property_id in visible_ids:
            return block
    if block.company_id == current_user.company_id:
        return block
    raise HTTPException(status_code=403, detail="Access denied")
```

**Multiple admins per company:** Already supported — multiple users with `user_type="company_admin"` and the same `company_id` work correctly. No changes needed.

---

### 2.2 Alias Relationship Table (External System IDs)

**Purpose:** Blocks have different IDs in different third-party systems. Sprays have codes in compliance systems. Properties have GrapeLink grower codes. This table provides a single, extensible place to store all those cross-references.

**Design decision:** Single polymorphic table with `entity_type` field. Simpler than one table per relationship type, and future-proof for new integrations. Existing dedicated columns (e.g., `grapelink_grower_id` on Property) are kept as-is — the alias table is for the long tail of external system mappings.

**New model: `ExternalAlias`**

```sql
CREATE TABLE external_aliases (
    id              SERIAL PRIMARY KEY,
    company_id      INTEGER NOT NULL REFERENCES companies(id),
    entity_type     VARCHAR(50) NOT NULL,   -- 'block', 'property', 'station', 'asset', 'user'
    entity_id       INTEGER NOT NULL,        -- FK to the entity (not enforced at DB level due to polymorphism)
    system_name     VARCHAR(100) NOT NULL,   -- 'grapelink', 'metservice', 'harvest', 'swnz', 'custom'
    external_id     VARCHAR(255) NOT NULL,   -- the ID in the external system
    external_label  VARCHAR(255),            -- optional human-readable label
    metadata        JSONB,                   -- any extra data (e.g., API keys, region codes)
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_alias_unique
    ON external_aliases(company_id, entity_type, entity_id, system_name);
```

**Key decisions:**
- `company_id` scoped — each company manages its own aliases
- Unique constraint prevents duplicate mappings (one block can't have two GrapeLink IDs)
- `metadata` JSONB for system-specific extras (e.g., GrapeLink API credentials, Metservice location coords)
- Polymorphic `entity_type` + `entity_id` instead of separate FK columns — keeps the table clean and extensible

**Existing dedicated columns kept:** `grapelink_grower_id` and `grapelink_property_code` on Property stay as-is. The alias table handles the broader pattern — blocks in GrapeLink, spray records in compliance systems, etc.

**Use cases:**
| entity_type | system_name | Example external_id | Notes |
|-------------|-------------|---------------------|-------|
| `block` | `grapelink` | `GL-BLK-2025-007` | Block's GrapeLink ID for compliance export |
| `block` | `swnz` | `SWNZ-MB-2024-103` | SWNZ certification number |
| `asset` | `acvm` | `P009876` | Spray product ACVM registration |
| `asset` | `supplier` | `CROP-CU-500` | Supplier product code |
| `property` | `custom` | `Site-A` | Any ad-hoc external reference |

**Backend:**
- Model: `backend/db/models/external_alias.py`
- Endpoints: CRUD at `/api/v1/aliases/` (company-scoped)
  - `GET /api/v1/aliases/?entity_type=block&entity_id=5` — get aliases for an entity
  - `GET /api/v1/aliases/?system_name=grapelink` — get all GrapeLink aliases for company
  - `POST /api/v1/aliases/` — create alias
  - `PATCH /api/v1/aliases/{id}` — update
  - `DELETE /api/v1/aliases/{id}` — remove
- Utility: `get_alias(db, company_id, entity_type, entity_id, system_name) -> str|None`

**Frontend:**
- Alias management table in Company Admin page (Section 2.5)
- Inline alias display on block detail, property detail

---

### 2.3 User↔Property Assignment (Upgraded)

**Current state:** `UserPropertyScope` exists as a junction table. Logic: if a user has scope rows, they ONLY see those properties. If no scope rows, they see all company properties.

**New behaviour — same table, clearer semantics:**

The default (no scope rows = see everything) is good for `company_admin`. For `company_manager` and `company_user`, we want explicit assignment:

| user_type | No scope rows | Has scope rows |
|-----------|---------------|----------------|
| `company_admin` | Sees ALL company properties (owner + managed) | Sees ALL (scopes ignored for admin) |
| `company_manager` | Sees ALL company properties | Sees ONLY scoped properties |
| `company_user` | Sees ALL company properties | Sees ONLY scoped properties |

**Change:** `company_admin` always sees all properties regardless of scope rows. This simplifies admin access and means scopes are purely a staff management tool.

**Update to `get_visible_property_ids()`:**
```python
def get_visible_property_ids(db, current_user):
    if current_user.user_type == "auxein_admin":
        return [all properties]
    if current_user.user_type == "contractor":
        return []

    # company_admin always sees all
    if current_user.user_type == "company_admin":
        return [managed + owned properties]

    # company_manager/company_user: check scopes
    scopes = db.query(UserPropertyScope.property_id).filter(
        UserPropertyScope.user_id == current_user.id
    ).all()
    if scopes:
        return [s[0] for s in scopes]

    # No scopes = see all (backward compatible)
    return [managed + owned properties]
```

**Company Admin page UI:**
- Property assignment tab showing all users in company
- For each user: checkboxes for which properties they're assigned to
- Bulk assign: "Assign all users to property X"
- Visual: table with users as rows, properties as columns, checkboxes at intersections

---

### 2.4 Property as Key Management Unit

This is the central architectural shift. Properties become the primary unit for:

#### 2.4.1 Insights — Property Level with Regional Fallback

**Current state:** Insights data is zone-level only (20 NZ climate zones). Properties have a `region` string but no FK to `ClimateZone`.

**New approach:**
1. Add `climate_zone_id` FK to `properties` table (migration)
2. Insights endpoints accept `property_id` parameter
3. When property has weather station data (via Harvest stations assigned to blocks), show property-level actuals
4. When no station data exists, fall back to regional climate zone data
5. Dashboard shows: "Property insights" (station data) + "Regional context" (zone data)

**New field on Property:**
```sql
ALTER TABLE properties ADD COLUMN climate_zone_id INTEGER REFERENCES climate_zones(id);
```

This links each property to its regional climate zone for fallback data.

#### 2.4.2 Reporting — Property or Company Level

**Current state:** Reports filter by `company_id` only.

**New approach:** Add `property_id` as optional filter on all report endpoints. When provided, filter tasks/observations/timesheets/assets to that property's blocks only.

**Endpoint changes:**
```
GET /api/v1/reports/tasks/summary?property_id=5        → property-level
GET /api/v1/reports/tasks/summary                       → company-level (all properties)
GET /api/v1/reports/tasks/export?property_id=5          → property-level CSV
```

**Implementation:** Filter tasks by `Task.block_id` → `VineyardBlock.property_id`. Same pattern for observations, timesheets (via task linkage), and assets.

**Frontend:** Add property dropdown selector in Reports page header. Default: "All Properties" (company level).

#### 2.4.3 Calendar — Property Scoped

**Current state:** Calendar shows all events for the company.

**New approach:** Add property filter dropdown to calendar. Events filtered by block → property chain.

---

### 2.5 Company Admin Page

**Who sees it:** `company_admin` users (not `auxein_admin` — that's the system admin page).

**Navigation:** New nav item "Manage" (or gear icon) in SiteHeader for `company_admin` users. Distinct from the system `/admin` page.

**Route:** `/company-admin`

**Tabs:**

| Tab | Content | Backend needed |
|-----|---------|---------------|
| **Users & Properties** | User list with property assignment checkboxes. Invite user form. | Existing user CRUD + UserPropertyScope CRUD |
| **Timesheets** | Approval dashboard — pending timesheets, approve/reject, date range filter. Links to detailed view. | Existing endpoints, may need manager-view query |
| **Training** | Training module management, assignment status per user, completion tracking. | Existing endpoints |
| **Aliases** | External alias management table. Filter by system_name. Inline edit. | New ExternalAlias CRUD (Section 2.2) |
| **GrapeLink** | Property-level GrapeLink setup: grower ID, property code, export trigger. | Existing fields + alias table, export endpoint (future) |
| **Weather** | Forecast point setting per property (lat/lng picker or input). Harvest station management (placeholder — future detail). | Property update endpoint (forecast_latitude/longitude) |
| **Calendar Sync** | Per-user iCal feed URLs for Google/Apple Calendar subscription. Admins/managers see team feeds. Copy-to-clipboard. | New iCal endpoint (Section 2.9) |
| **Reports** | Quick stats panel (tasks completed, hours logged, overdue count) + link to full `/reports` page. | Existing report endpoints |

**Key design principle:** "Simplicity with depth." The default view should be a clean dashboard with key metrics. Each tab drills into detail. No feature requires more than 2 clicks to reach.

---

### 2.6 Calendar Enhancements

#### 2.6.1 Create Task from Calendar ("+" Button)

**UX flow:**
1. User clicks "+" button on a calendar day cell
2. Opens a compact task creation modal (not full wizard)
3. Pre-fills: `scheduled_start_date` = clicked date
4. Fields: title, block (dropdown), priority, assignee (optional)
5. Save → creates task → appears on calendar immediately

**Backend:** Uses existing `POST /api/tasks/` endpoint. No backend changes needed.

**Frontend changes:**
- Add "+" button to each day cell in CalendarView (visible on hover)
- New `QuickTaskModal` component (reuse patterns from TaskQuickCreate)
- On save: refetch calendar events

#### 2.6.2 Drag Events to Modify Dates

**UX flow:**
1. User drags a task event card to a different day
2. Drop triggers date update
3. For single-day events: update `scheduled_start_date`
4. For multi-day events: shift both start and end dates by the delta
5. Optimistic UI update + PATCH to backend

**Backend:** Need a lightweight endpoint for date-only updates:
```
PATCH /api/tasks/{task_id}/reschedule
Body: { "scheduled_start_date": "2026-04-02", "scheduled_end_date": "2026-04-04" }
```

**Frontend changes:**
- Add `draggable` attribute to event cards
- `onDragStart`: capture event ID + original date
- `onDrop` on day cells: calculate date delta, call reschedule endpoint
- Only task events are draggable (observations/training/risk actions are not)

**Constraints:**
- Only `company_admin` and `company_manager` can drag (permission check)
- Completed/cancelled tasks are not draggable
- Visual feedback: ghost card while dragging, drop zone highlight

---

### 2.7 Row Task Management (End-to-End)

**Current state:** `TaskRow` model exists with status, completion tracking, quality rating. `VineyardRow` model exists with geometry and clonal sections. No frontend UI for row-level task management. No dedicated API endpoints.

**What needs building:**

#### Backend Endpoints

```
# Row management within a task
GET    /api/tasks/{task_id}/rows              → list task rows (with status, progress)
POST   /api/tasks/{task_id}/rows/generate     → auto-generate rows from block's vineyard_rows
PATCH  /api/tasks/{task_id}/rows/{row_id}     → update row status/progress/notes
POST   /api/tasks/{task_id}/rows/{row_id}/complete  → mark row complete (+ timestamp + user)
POST   /api/tasks/{task_id}/rows/{row_id}/skip      → skip row (+ reason)
POST   /api/tasks/{task_id}/rows/bulk-update  → update multiple rows at once
```

**Auto-generate logic (`/rows/generate`):**
1. Look up task's `block_id`
2. Query `VineyardRow` for that block
3. Create `TaskRow` for each vineyard row (status=pending)
4. If block has `row_start`/`row_end`/`row_count` but no VineyardRow records, generate numbered rows
5. Update `task.rows_total` count

#### Frontend — Row Progress Panel

**Where it appears:** Task detail view, as a collapsible "Row Progress" section.

**Layout:**
```
┌─────────────────────────────────────────────┐
│ Row Progress                    [Generate Rows] │
│ ████████████░░░░░░░░  12/20 rows (60%)      │
│                                                 │
│ Row 1  ✅ Completed   2:30pm   ★★★★☆  Notes... │
│ Row 2  ✅ Completed   2:45pm   ★★★★★          │
│ Row 3  🔄 In Progress  75%     ───────         │
│ Row 4  ⏭️ Skipped     "Too wet"                │
│ Row 5  ⬜ Pending                               │
│ Row 6  ⬜ Pending                               │
│ ...                                             │
│ [Complete Current Row] [Skip Row] [Bulk Complete]│
└─────────────────────────────────────────────┘
```

**Interactions:**
- "Generate Rows" button → calls `/rows/generate` (one-time, when task starts)
- Click a row → expand to show notes/issues/quality inline edit
- "Complete Current Row" → marks the first pending row as complete
- "Skip Row" → prompts for skip reason
- "Bulk Complete" → select multiple rows → mark all complete
- Progress bar auto-updates as rows are completed
- Task `progress_percentage` auto-recalculated on each row update

---

### 2.8 Property Forecast Point (MetOcean Weather API)

**Current state:** The weather forecast is already built as a frontend-only integration:
- `packages/shared/src/api/weatherService.js` calls **MetOcean API** (`forecast-v2.metoceanapi.com`)
- `getCurrentWeather(lat, lon)` and `getWeatherForecast(lat, lon)` fetch live data
- `WeatherWidget.jsx` displays current conditions + 24h forecast
- **Problem:** Currently uses the centroid of the first block in the company — not configurable, not property-scoped

**Fix:** Add `forecast_latitude` and `forecast_longitude` columns to the `properties` table. The WeatherWidget reads from the selected property's forecast point instead of computing from block centroids.

**New fields on Property:**
```sql
ALTER TABLE properties ADD COLUMN forecast_latitude NUMERIC(10, 7);
ALTER TABLE properties ADD COLUMN forecast_longitude NUMERIC(10, 7);
```

**Company Admin UI — Weather tab:**
- Show each property with current forecast point (lat/lng)
- "Set Location" button → opens a small map picker or lat/lng input
- Default: auto-compute from centroid of property's blocks (if not manually set)
- Save updates the property record

**Frontend change — WeatherWidget:**
- Accept `property` prop instead of `block`
- Use `property.forecast_latitude` / `property.forecast_longitude`
- Fallback chain: property forecast point → first block centroid → company default location

**Harvest stations:** Placeholder for now. Stations are standalone weather stations, not assigned to blocks. Station management UI will be designed in a future phase with more detail.

---

### 2.9 iCal Feed (Per-User Calendar Subscription)

**Purpose:** Let users subscribe to their Auxein calendar from Google Calendar, Apple Calendar, or Outlook — so tasks and events appear alongside their personal schedule.

**Design — user-specific feeds with role-based scope:**

| User type | Feed contents |
|-----------|--------------|
| `company_user` | Only their assigned tasks + training due dates |
| `company_manager` | All tasks for their scoped properties (team member names shown on events) |
| `company_admin` | All tasks across all company properties (team member names shown) |

**Backend — new endpoint:**
```
GET /api/v1/calendar/feed/{feed_token}.ics
```

- **No JWT auth** — iCal clients can't send auth headers. Instead, use a per-user `feed_token` (random UUID stored on User model, generated on first request).
- Returns standard iCal (`.ics`) format with VEVENT entries
- Events include: tasks (with assignee names for managers/admins), training due dates, observation plan dates
- `SUMMARY`: task title (+ assignee name for team feeds)
- `DTSTART`/`DTEND`: scheduled dates
- `DESCRIPTION`: block name, priority, status
- `URL`: deep link to task in web app

**New field on User model:**
```sql
ALTER TABLE users ADD COLUMN calendar_feed_token VARCHAR(64) UNIQUE;
```

Generated lazily — when user first visits Calendar Sync tab, generate token if null.

**Security:** Feed token is opaque, unguessable (UUID4), and user-revocable ("Regenerate URL" button invalidates old token).

**Company Admin UI — Calendar Sync tab:**
- Show each user's feed URL (or "Generate" button if not yet created)
- Copy-to-clipboard button
- "Regenerate" button (invalidates old URL)
- Instructions: "Add this URL to Google Calendar / Apple Calendar / Outlook"
- For the current user: show their own feed URL prominently at top

**Frontend — also accessible from user's own Settings/Profile page:**
- "Calendar Subscription" section
- Show URL + copy button + regenerate

---

### 2.10 Row Task Management — Refined Scope

Based on feedback: **web UI = reporting & tracking, mobile = core data input.**

**Web UI (this build):**
- Read-only row progress panel in task detail view
- Progress bar + row status list (completed/skipped/pending counts)
- Row-by-row status table with timestamps, notes, quality ratings
- Filter/sort rows by status
- Admin/manager can manually mark rows complete or skip from web (override)
- "Generate Rows" button for initial setup

**Mobile (future Phase B3):**
- Touch-optimized row completion flow (swipe or tap to complete)
- GPS auto-tag per row completion
- Camera for row-level photo capture
- Offline queue for field completion

**Backend endpoints (same as Section 2.7):** Built now, serve both web and mobile.

---

## 3. BUILD ORDER

### Phase R1: Model & Service Simplification + Schema (1-2 days)

```
R1.1  Remove owner read-only logic (property_service.py, tasks.py, observations.py)
R1.2  Update verify_block_access() — drop is_owner_viewing gate
R1.3  Update get_visible_property_ids() — company_admin always sees all
R1.4  Migration: add climate_zone_id FK to properties table
R1.5  Migration: add forecast_latitude, forecast_longitude to properties table
R1.6  Migration: add calendar_feed_token to users table
```

### Phase R2: External Alias Table (2-3 days)

```
R2.1  Create ExternalAlias model + Alembic migration
R2.2  Create alias CRUD endpoints (/api/v1/aliases/) — company-scoped
R2.3  Create get_alias() utility function
R2.4  Create alias Pydantic schemas
```

### Phase R3: Backend — Company Admin + iCal + Row Tasks (4-5 days)

```
R3.1  Timesheet approval query endpoint (pending timesheets for company)
R3.2  Training status summary endpoint (completion by user)
R3.3  User property scope management endpoints (assign/unassign users to properties)
R3.4  iCal feed endpoint (GET /api/v1/calendar/feed/{token}.ics) — role-based scope
R3.5  Feed token generation endpoint (POST /api/v1/calendar/feed/generate)
R3.6  Task row CRUD endpoints (list, generate, update, complete, skip, bulk-update)
R3.7  Auto-generate rows from block's vineyard rows
R3.8  Auto-recalculate task progress_percentage on row changes
R3.9  PATCH /api/tasks/{id}/reschedule endpoint (date-only update)
```

### Phase R4: Company Admin Page — Frontend (4-5 days)

```
R4.1   CompanyAdmin page shell with tabs + route (/company-admin)
R4.2   Users & Properties tab (user list + property assignment matrix)
R4.3   Timesheets tab (approval dashboard — pending/approved/rejected)
R4.4   Training tab (module management + completion tracking by user)
R4.5   Aliases tab (external alias CRUD table, filter by system_name)
R4.6   GrapeLink tab (property-level grower ID / property code setup)
R4.7   Weather tab (forecast point lat/lng per property, Harvest stations placeholder)
R4.8   Calendar Sync tab (per-user iCal URLs, generate/regenerate/copy)
R4.9   Reports tab (quick stats + link to /reports)
R4.10  Nav integration (SiteHeader — "Manage" for company_admin)
```

### Phase R5: Property Scoping — Reports + Calendar + Weather (3-4 days)

```
R5.1  Add property_id filter to all report summary endpoints
R5.2  Add property_id filter to all report export endpoints
R5.3  Frontend: property dropdown in Reports page header
R5.4  Frontend: property dropdown in Calendar page header
R5.5  Update WeatherWidget — read forecast point from property (fallback: block centroid)
R5.6  Add property selector to weather/insights views
```

### Phase R6: Calendar Enhancements (3-4 days)

```
R6.1  "+" button on calendar day cells → QuickTaskModal (pre-fills date)
R6.2  Drag-and-drop on task event cards → calls PATCH /reschedule
R6.3  Optimistic UI update + error rollback on drag
R6.4  Permission gating (only admin/manager can drag, no completed/cancelled)
```

### Phase R7: Row Task Management — Web UI (3-4 days)

```
R7.1  RowProgressPanel component (progress bar + row status table)
R7.2  Integrate into task detail view (collapsible section)
R7.3  "Generate Rows" button (calls /rows/generate)
R7.4  Row status table: filter/sort, timestamps, notes, quality ratings
R7.5  Admin/manager override: manual complete/skip from web
```

### Phase R8: Property-Level Insights (2-3 days)

```
R8.1  Add climate_zone_id dropdown to property admin forms
R8.2  Insights endpoint: accept property_id, return station data + zone fallback
R8.3  Frontend: property-scoped insights panel
```

---

## 4. DEPENDENCY GRAPH

```
R1 (simplify + schema) ──┐
                          ├──→ R3 (backend: admin + iCal + rows) ──→ R4 (company admin frontend)
R2 (alias table) ─────────┘                                          │
                                                                      ├──→ R5 (property scoping: reports + calendar + weather)
                                                                      ├──→ R6 (calendar: create + drag)
                                                                      └──→ R8 (property insights)

R7 (row task web UI) ── depends on R3.6-R3.8 (row endpoints), parallel with R4-R6
```

**Critical path:** R1 → R2 → R3 → R4 → R5 (~14-19 days)
**Parallel track:** R7 (row task web UI, ~3-4 days, after R3 row endpoints done)
**Total estimate:** ~22-30 working days

---

## 5. WHAT DOES NOT CHANGE

1. **Permission matrix stays 5-tier** — no new roles needed
2. **ManagementRelationship model stays** — still tracks which company manages a property, just without the read-only lockout
3. **Block.company_id stays** — denormalized for backward compat
4. **UserPropertyScope table stays** — same model, clearer semantics
5. **Existing admin page (/admin)** — stays as the `auxein_admin` system page. New `/company-admin` is separate.
6. **Task/Observation models** — no schema changes needed for property scoping (they chain through block.property_id)

---

## 6. RESOLVED DECISIONS

| # | Question | Decision | Impact on plan |
|---|----------|----------|---------------|
| 1 | Calendar URLs — per-property or per-user? | **Per-user iCal feeds.** Users see their assigned tasks. Managers/admins see full team calendar with names. | Added Section 2.9, `calendar_feed_token` on User, new iCal endpoint |
| 2 | Metservice/weather timing | **Already built** (MetOcean API, frontend-only). Just needs property-level forecast point instead of block centroid. | Added `forecast_latitude`/`forecast_longitude` to Property, update WeatherWidget |
| 3 | Row task management — web vs mobile | **Web = reporting & tracking, mobile = core data input.** Web gets read-only progress panel + admin overrides. | Refined Section 2.10, web UI is read-heavy |
| 4 | Alias table vs dedicated columns | **Keep existing GrapeLink columns.** Alias table is for the long tail: blocks in GrapeLink, spray products in ACVM, etc. | No migration of existing fields |
| 5 | Harvest station assignment | **Placeholder for now.** Stations are standalone, not assigned to blocks. Future phase with more detail. | Weather tab shows placeholder, no station-block endpoint |
| 6 | Company admin reports | **Quick stats + link to /reports page.** | Lightweight stats panel, not embedded dashboard |