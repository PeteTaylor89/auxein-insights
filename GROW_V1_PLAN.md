# Auxein Grow — v1 Development Plan
## For Claude Code Review & Formalisation

> **Status:** Pre-build scope lock. This document is a draft for Claude Code to review
> against the current codebase, flag conflicts or gaps, and return for formalisation.
>
> **Rule:** This is the last scope revision before build begins. No new functional scope
> enters v1 after this document is finalised. All additions go to the v1.x backlog.

---

## INSTRUCTIONS FOR CLAUDE CODE

Before doing anything else, run a structured discovery pass against the codebase and
report back on each item below. The goal is not to build anything yet — it is to
produce an honest audit of what already exists, what is partially built, and what is
genuinely new work.

### Discovery Checklist

For each module listed in Section 3 (v1 Feature Scope), identify:

1. **EXISTS** — model, schema, and at least a stub API endpoint are present
2. **PARTIAL** — model exists but schema or endpoint is incomplete / untested
3. **SCHEMA ONLY** — model and schema exist, no endpoint
4. **NOT STARTED** — nothing present in codebase

Additionally, confirm:

- [x] Current `VineyardBlock` model fields — does `company_id` FK exist? **YES.** `company_id` (Integer FK → companies.id) exists. No `property_id`. Full fields: id, block_name, planted_date, removed_date, variety, clone, rootstock, row_spacing, vine_spacing, area, region, swnz, organic, biodynamic, regenerative, winery, centroid_longitude, centroid_latitude, gi, elevation, geometry, row_start, row_end, row_count, training_system, company_id, created_at, updated_at.
- [x] Does a `Property` table exist? **NO.** Confirmed — no Property model, table, or schema exists. Related tables: `primary_parcels` (LINZ cadastral), `company_land_ownerships` (parcel↔company links), but these are not the Property entity described in Section 2.
- [x] Does a `ManagementRelationship` table exist? **NO.** Confirmed — no ManagementRelationship model. Only related: `contractor_relationships` (contractor↔company links).
- [x] Does `BlockchainChain` link to `block_id`? **YES** — via `vineyard_block_id` FK → `vineyard_blocks.id`. Also has `company_id` FK (nullable) and `assignment_user_id` FK.
- [x] What user role/type system is currently implemented? **Dual system:** (1) Legacy `role` column (String(20)): `admin`, `manager`, `user`. (2) New `user_type` column (String(20), indexed): `auxein_admin`, `company_admin`, `company_manager`, `company_user`. Contractors have a `user_type` property returning `"contractor"`. Permission matrix in `core/permissions.py` with 17 modules. `require_permission(module, action)` dependency in `deps.py`.
- [x] Is Metservice weather integration present? **NO.** No Metservice references in codebase. Weather data sources are: HARVEST (10-min), ECAN (hourly), HBRC (hourly).
- [x] Is Harvest Electronics integration present? **YES.** `WeatherStation` model with `data_source='HARVEST'`, CSV backfill script, admin station management, daily/hourly aggregation pipeline. Feeds into disease models and climate APIs.
- [x] What Alembic migrations exist? **57 migrations.** Current head: `add_user_type_to_users` (2026-03-05). No migrations for `property`, `management_relationship`, or `user_property_scope`.
- [x] Is there a `company_user_type` or similar enum in the User model? **YES** — `user_type` column (String(20)) with values: `auxein_admin`, `company_admin`, `company_manager`, `company_user`. Added in migration `add_user_type_to_users`. Backfilled from legacy `role` values.
- [x] Does an `OperationalArea` model exist distinct from `VineyardBlock`? **Not as a separate model.** `SpatialArea` (`spatial_areas` table) serves this purpose — supports polygon geometry, hierarchical parent-child, `area_type` field, company-scoped. No dedicated `OperationalArea` model.

Return a structured report under the heading `## DISCOVERY REPORT` at the end of this
file before any code changes are made.

---

## 1. ARCHITECTURE CONSTRAINTS

These rules apply to all work in this plan. They are non-negotiable.

1. **Do not break the live Insights app.** `insights.auxein.co.nz` is in production.
   Every backend change must be regression-tested against Insights endpoints:
   public climate data, auth (`/api/auth/`), and weather endpoints.

2. **Shared backend.** Grow and Regional Insights share the same FastAPI backend and
   PostgreSQL/PostGIS database on AWS RDS. Schema migrations affect both consumers.

3. **Three frontend consumers.** The React web app, React Native / Expo mobile app,
   and Regional Insights web app all consume the same backend. Shared package changes
   affect all three.

4. **Alembic for all schema changes.** No manual `ALTER TABLE` or raw SQL migrations.
   Every schema change gets its own Alembic revision with a descriptive message.

5. **No scope creep.** If a feature is listed as v1.x, v2, or v3 in Section 4, it
   does not get built now even if it seems easy. Log it as a comment in the code.

---

## 2. THE PROPERTY / MANAGEMENT RELATIONSHIP MODEL

### 2.1 Why This Exists

The current schema has a direct `company_id` FK on `VineyardBlock`. This works for:
- An owner who farms their own property
- A lessee who farms a leased block

It breaks for:
- A **Viticultural Management Company (VMC)** managing blocks for absent landowners
- A landowner who wants read-only visibility while a VMC operates
- A VMC running 20–30 properties needing a portfolio view
- A management contract ending and records needing to transfer cleanly

The fix is a `Property` entity sitting between `Company` (the owner/leaseholder) and
`VineyardBlock`, plus a `ManagementRelationship` table.

### 2.2 New Schema — Property

```sql
CREATE TABLE properties (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    owner_company_id  INTEGER REFERENCES companies(id),  -- legal owner
    address         TEXT,
    legal_description TEXT,
    total_area_ha   NUMERIC(10,4),
    region          VARCHAR(100),
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);
```

**Key decisions:**
- `owner_company_id` is nullable — allows blocks to exist before an owner company
  account is created (common for legacy data import).
- A `Property` has many `VineyardBlock`s via a `property_id` FK on `VineyardBlock`.
- A `Property` has many `ManagementRelationship`s (one active at a time).

### 2.3 New Schema — ManagementRelationship

```sql
CREATE TABLE management_relationships (
    id                  SERIAL PRIMARY KEY,
    property_id         INTEGER NOT NULL REFERENCES properties(id),
    managing_company_id INTEGER NOT NULL REFERENCES companies(id),
    start_date          DATE NOT NULL,
    end_date            DATE,             -- NULL = currently active
    contract_reference  VARCHAR(255),
    notes               TEXT,
    is_active           BOOLEAN DEFAULT TRUE,
    created_by_user_id  INTEGER REFERENCES users(id),
    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_one_active_manager
    ON management_relationships(property_id)
    WHERE is_active = TRUE;
```

**Key decisions:**
- Only one active management relationship per property at a time (enforced by
  partial unique index).
- Historical relationships are retained — records survive contract end.
- `managing_company_id` and `owner_company_id` may be the same (owner-operated).

### 2.4 Modified Schema — VineyardBlock

Add `property_id` FK to the existing `vineyard_blocks` table:

```sql
ALTER TABLE vineyard_blocks
    ADD COLUMN property_id INTEGER REFERENCES properties(id);
```

**Migration strategy:**
1. Add `property_id` as nullable.
2. Create a `Property` record for each distinct `company_id` grouping of existing
   blocks (one property per existing company by default — safe assumption for
   current single-vineyard users).
3. Backfill `property_id` on all existing blocks.
4. Create `ManagementRelationship` records for all existing companies (owner =
   manager, start_date = company created_at).
5. `company_id` on `VineyardBlock` is **retained** for now as a denormalised
   convenience FK — it should reflect the *active managing company* and is kept
   in sync by the management relationship logic. This avoids breaking every
   existing query that filters by `company_id`.

### 2.5 Permission Scoping for VMC Users

The existing five roles remain unchanged:

| Role | Scope |
|---|---|
| `auxein_admin` | Full platform |
| `company_admin` | Full access within their company's scope |
| `company_manager` | Near-full within company scope |
| `company_user` | Limited, mobile-primary, within company scope |
| `contractor` | Scoped to active relationship + assigned tasks |

For VMC users, "company scope" means all properties where their company has an
active `ManagementRelationship`. No new role is required.

A new `UserPropertyScope` table handles the case where a VMC staff member should
only see a subset of managed properties:

```sql
CREATE TABLE user_property_scopes (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    property_id INTEGER NOT NULL REFERENCES properties(id),
    UNIQUE(user_id, property_id)
);
```

**Logic:** If a `company_manager` or `company_user` has ANY rows in
`user_property_scopes`, they are restricted to those properties only. If they have
ZERO rows, they see all properties managed by their company (default behaviour —
preserves backward compatibility for all existing users).

### 2.6 Owner Read-Only Access

A landowner whose property is managed by a VMC can have a Grow login with read-only
visibility. Implementation:

- Owner has a `Company` record (may be minimal — just a name and contact)
- Owner user has role `company_admin` within their own company
- Their company is the `owner_company_id` on the `Property`
- Query logic: a user can view (read-only) any property where their `company_id`
  matches `owner_company_id`, regardless of who the active manager is
- They cannot create tasks, observations, or any write operations — enforced at
  endpoint level with an `is_owner_viewing` flag derived from the relationship check

### 2.7 GrapeLink Export — Property-Scoped

GrapeLink accounts belong to the landowner (or the entity with the wine company
contract), not necessarily the VMC. The compliance export must be generated
per-property, attributed to the `owner_company_id`'s GrapeLink credentials, even
when all operational data was entered by VMC staff.

The `Property` model therefore carries:
```sql
grapelink_grower_id   VARCHAR(100),  -- property-level GrapeLink identifier
grapelink_property_code VARCHAR(100)
```

Not on `Company` — on `Property`. This is the structural change that makes
multi-property VMC compliance exports correct.

---

## 3. v1 FEATURE SCOPE (LOCKED)

The table below is the authoritative v1 scope. The `Status` column is blank — Claude
Code fills this in during discovery.

Key: `EXISTS` | `PARTIAL` | `SCHEMA ONLY` | `NOT STARTED`

### 3.1 Onboarding

| Feature | v1 | Claude Code Status |
|---|---|---|
| Create company | Yes | EXISTS — `Company` model, schema, full CRUD + public registration endpoint |
| Create / import property (new) | Yes | PARTIAL — `Property` model+table+migration exist, CRUD endpoints at `/v1/properties/`, admin list at `GET /admin/properties`. Frontend PropertyManagement component in Admin page. Import not yet implemented. |
| Block creation and map drawing | Yes | EXISTS — `VineyardBlock` model with PostGIS geometry, GeoJSON, split, full CRUD |
| Assign Harvest Electronics stations to blocks | Yes | PARTIAL — `WeatherStation` model with `data_source='HARVEST'` exists, data ingestion works, but no block↔station assignment endpoint |
| Metservice forecast point assignment | Yes | NOT STARTED — no Metservice integration found; weather uses Harvest/ECAN/HBRC sources only |
| Map block_id to property-level GrapeLink details | Yes | NOT STARTED — no GrapeLink model, schema, or endpoints exist |

### 3.2 User Management & Permissions

| Feature | v1 | Claude Code Status |
|---|---|---|
| `auxein_admin` role — full platform | Yes | EXISTS — `user_type` column on `users`, `core/permissions.py` matrix, `scope: "global"` bypass in deps.py |
| `company_admin` — full tenant access | Yes | EXISTS — `user_type="company_admin"`, full permission matrix, JWT claims |
| `company_manager` — near-full web + mobile | Yes | EXISTS — `user_type="company_manager"`, permission matrix, known 403 bug on users list (see alpha tests) |
| `company_user` — limited, mobile primary | Yes | EXISTS — `user_type="company_user"`, limited permissions, known bug: can create assets/spatial_areas when shouldn't |
| `contractor` — relationship-scoped | Yes | EXISTS — separate `contractors` table, `user_type` property returns `"contractor"`, `has_permission()` duck-typed |
| `UserPropertyScope` — VMC staff property scoping (new) | Yes | PARTIAL — model+table+migration exist (`user_property_scopes`), `get_visible_property_ids()` in `property_service.py` uses scopes for filtering. No frontend UI for managing scopes yet. |
| Owner read-only access via `owner_company_id` match (new) | Yes | PARTIAL — Property model exists, `is_owner_viewing()` implemented in `property_service.py`, returns true when user's company owns but doesn't manage. Endpoint-level enforcement not yet wired into all block/task/observation routes. |
| Notification preferences per user | Partial | NOT STARTED — no `NotificationPreference` model or per-user filtering |

### 3.3 Admin & Contractor Management

| Feature | v1 | Claude Code Status |
|---|---|---|
| Invite and manage users | Yes | EXISTS — invitation flow, user CRUD, role assignment, all endpoints present |
| Oversee timesheets and training completion | Yes | EXISTS — timesheet approval workflow + training completion tracking both implemented |
| Manage contractor relationships | Yes | PARTIAL — `ContractorRelationship` model+schema exist with full fields. Admin endpoints added: `POST /admin/create-contractor` (with auto-relationship), `GET /admin/contractors` (system-wide list with relationship counts). Dedicated company-level CRUD endpoints still needed. |
| Contractor profile | Yes | EXISTS — `Contractor` model with 50+ fields (insurance, biosecurity, verification), profile endpoints via auth |
| Contractor task integration | Yes | SCHEMA ONLY — `ContractorAssignment` model+schema exist with full status workflow, but no `/contractor-assignments` endpoints |
| Contractor observation integration | Yes | SCHEMA ONLY — `ContractorMovement.observations_created` field exists, no dedicated contractor observation endpoints |
| Contractor risks (read-only) | Yes | PARTIAL — `biosecurity_risk_level` property + compliance scoring exist on model, no dedicated contractor risk endpoints |
| Contractor incident creation | Yes | PARTIAL — `Incident` model fully implemented with WorkSafe NZ fields, but no contractor-specific incident workflow |
| Contractor biosecurity movement logging | Yes | SCHEMA ONLY — `ContractorMovement` model (329 lines) with full biosecurity tracking, but no API endpoints exposed |

### 3.4 Visitor Management

| Feature | v1 | Claude Code Status |
|---|---|---|
| Log visitor (QR or manual) | Yes | EXISTS — `Visitor`+`VisitorVisit` models, full CRUD, sign-in/sign-out endpoints |
| Overdue / overstay alerts | Yes | EXISTS — `is_overdue` computed property, active visits endpoint, notification wiring |
| Visitor table (not GPS) | Yes | EXISTS — visitor list, visit history, dashboard with overdue alerts |
| Induction form with digital sign-off | Yes | EXISTS — `induction_completed`, `safety_briefing_given`, `ppe_provided`, `areas_accessed` fields on visit sign-in |

### 3.5 Operational Maps

| Feature | v1 | Claude Code Status |
|---|---|---|
| Blocks — view and manage on map | Yes | EXISTS — Maps V2 with GeoJSON blocks layer, drawing, editing, split, popup detail |
| Operational areas — view and manage on map | Yes | EXISTS — `SpatialArea` model with polygon fill+outline+label layers in Maps V2 |
| Observations map layer | Yes | EXISTS — icon markers at block centroids grouped by observation count |
| Tasks map layer | Yes | EXISTS — icon markers per block + single GPS track overlay |
| Risks map layer | Yes | EXISTS — circle markers colour-coded by risk level |
| Spray efficiency (GPS + calibration) heatmap layer | Yes | NOT STARTED — placeholder in layer registry, no backend heatmap data service |
| Disease pressure heatmap layer | Yes | NOT STARTED — disease data exists in `disease_pressure` table but not exposed as map layer |
| Phenology stage layer | Yes | NOT STARTED — phenology data exists in `phenology_estimates` table but no map layer |
| Frost risk layer | Yes | NOT STARTED — `temp_min` tracked, `frost_days` counted, but no frost risk model or map layer |
| Weather station live conditions layer | Yes | NOT STARTED — station data ingested, no map layer rendering live conditions |
| Soil moisture layer (where Harvest sensors present) | Yes | NOT STARTED — no soil moisture data from Harvest sensors, no map layer |

### 3.6 Blocks & Operational Areas

| Feature | v1 | Claude Code Status |
|---|---|---|
| Edit all block details (variety, clone, rows, spacing, rootstock, farming type) | Yes | EXISTS — all fields on model+schema, full CRUD endpoints |
| Row-level data with mixed clone handling | Yes | EXISTS — `VineyardRow` model with `clonal_sections` JSON, `get_clone_at_position()`, dedicated endpoints |
| Biodynamic / regenerative farming flag | Yes | EXISTS — `swnz`, `organic`, `biodynamic`, `regenerative` boolean fields on `VineyardBlock` |
| Block climate intelligence panel (Insights integration) | Yes | EXISTS — `ClimateHistoricalData` model, historical/summary/stats endpoints per block |
| Block linked to `property_id` (new) | Yes | PARTIAL — `property_id` FK added to `VineyardBlock` model+schema, Alembic migration created, block API responses include `property_id`, Maps V2 block create/edit forms have property dropdown. Property CRUD endpoints exist. Backfill migration (004) not yet run. |
| Edit all operational area details | Yes | EXISTS — `SpatialArea` model with PostGIS polygon, metadata JSON, hierarchical parent_area_id, full CRUD |
| Assign tasks and observations to operational areas | Yes | PARTIAL — `SpatialArea` model exists with task/observation potential, but no explicit assignment linkage endpoints |

### 3.7 Map Builder

| Feature | v1 | Claude Code Status |
|---|---|---|
| Packaged curated layers with toggle visibility | Yes | EXISTS — layer registry with 10+ layers, toggle/opacity/reorder controls, builder sidebar |
| Save and restore map settings | Yes | PARTIAL — localStorage persistence via `useBuilderState` hook; no backend API for named saved maps |
| Export map to PDF and image | Yes | NOT STARTED — no export service or UI |
| Custom GeoJSON / KML / GeoTIFF / CSV-to-point import | Yes | NOT STARTED — no import UI or backend endpoint |

### 3.8 Task Engine

| Feature | v1 | Claude Code Status |
|---|---|---|
| Create, assign, and oversee tasks | Yes | EXISTS — full CRUD, assignment, status workflow, row-level progress tracking |
| Task templates — partial set at launch (manual, tractor, spray, maintenance, calibration, lab, biosecurity, land management) | Partial | EXISTS — `TaskTemplate` model with categories (vineyard, land_management, asset_management, compliance, general), subcategories, equipment/consumable requirements, quick-create |
| Spray tasks (GPS-tracked + calibration linked) | Yes | EXISTS — `TaskGPSTrack` model with start/stop/pause/resume/bulk-points, `AssetCalibration` linked via `TaskAsset` |
| Calendar view (tasks, training, maintenance, weather) | Yes | PARTIAL — `GET /tasks/calendar` returns task events only; no aggregated endpoint across observation plans, maintenance, training, weather |
| Assign input costs to tasks | Partial | EXISTS — `estimated_cost`, `actual_cost`, `cost_currency`, material costs JSON on task model |
| Timesheet integration — log time against tasks | Yes | EXISTS — `TimesheetDay`+`TimeEntry` models, full approval workflow, task-linked entries |
| Rule-based auto-task generation (disease model + phenology triggers) | Yes | NOT STARTED — disease models + phenology estimates exist in DB but no trigger logic or auto-generation service |

### 3.9 Observations

| Feature | v1 | Claude Code Status |
|---|---|---|
| Observation templates (phenology, disease, ripening, maintenance, vine health, weather event, biosecurity, irrigation) | Yes | EXISTS — 20 system templates seeded: phenology, bud count, flower count, yield est (pre/post veraison), maturity sampling, growth/canopy, soil, nutrient/vine health, disease, pest, beneficials, biosecurity, compliance, H&S, maintenance, land management, irrigation, frost event, weather observation |
| Ad hoc observations | Yes | EXISTS — single-run ad hoc observation flow with flexible template selection |
| Planned / scheduled observations | Yes | EXISTS — `ObservationPlan` with targets per block, assignees, status tracking, run execution |
| Phenology-conditional mobile menu | Yes | NOT STARTED — mobile app is stub only; no conditional menu logic exists |
| Observation → risk escalation / task trigger | Partial | PARTIAL — `ObservationTaskLink` model exists for maintenance sightings → tasks; no auto-escalation rules or risk pipeline |
| Yield estimation pipeline (bud → flower → bunch → harvest estimate) | Partial | PARTIAL — templates for bud/flower/bunch counts with computed t/ha fields exist; no backend aggregation pipeline wiring the progression |
| Photo, video, voice-to-text in field | Yes | PARTIAL — photo + video file attachment supported (`photo_file_ids`, `video_file_ids`, `document_file_ids`); voice-to-text NOT implemented |

### 3.10 Asset Management

| Feature | v1 | Claude Code Status |
|---|---|---|
| Manage assets (equipment, vehicles, infrastructure) | Yes | EXISTS — `Asset` model with category field, full CRUD, photo/document attachments |
| Manage consumables and stock levels | Yes | EXISTS — `StockMovement` model (purchase/usage/transfer/adjustment/disposal), automatic stock level updates, batch/expiry tracking |
| Asset maintenance schedules and records | Yes | EXISTS — `AssetMaintenance` model (scheduled/reactive/emergency/compliance), full CRUD with status tracking |
| Asset calibrations (spray units, sensors) | Yes | EXISTS — `AssetCalibration` model with tolerance validation (pass/fail/out_of_tolerance), due dates, full CRUD |
| Carbon data capture layer (fuel, GPS hours, consumable inputs) | Partial | PARTIAL — `fuel_type`, `fuel_efficiency_standard` on Asset; `fuel_consumption_liters`, `operating_hours`, `distance_covered_km` on AssetCalibration; no emissions calculation service |

### 3.11 Risk Management

| Feature | v1 | Claude Code Status |
|---|---|---|
| ISO-standard risk dashboard with control management | Yes | EXISTS — `SiteRisk` model with inherent+residual likelihood/severity (1-5), risk score, risk level, `IntegratedRiskService` dashboard |
| Assign controls and alerts to risks | Yes | EXISTS — `RiskAction` model with action types (preventive/detective/corrective/mitigative), control types, progress tracking, effectiveness review |
| Spatially managed risks (block and area linked) | Yes | EXISTS — `location` (POINT) + `area` (POLYGON) PostGIS fields on `SiteRisk`, GeoJSON conversion in API |
| Incident reporting | Yes | EXISTS — `Incident` model with full H&S fields, WorkSafe NZ notification support, investigation tracking |
| Incident root cause analysis | Yes | EXISTS — `immediate_causes`, `root_causes`, `contributing_factors` JSON arrays on Incident model |
| Incident escalation workflow | Yes | EXISTS — status workflow (open/investigating/awaiting_actions/closed), corrective actions via `RiskAction` relationship |

### 3.12 Timesheets

| Feature | v1 | Claude Code Status |
|---|---|---|
| Log time linked to tasks | Yes | EXISTS — `TimesheetDay`+`TimeEntry` models, `task_id` FK on entries, full CRUD |
| Manager / admin oversight and approval | Yes | EXISTS — submit/approve/reject/release workflow, `approved_by`/`approved_at` tracking |
| Export to CSV | Yes | PARTIAL — data structure supports export, but no dedicated CSV export endpoint |

### 3.13 Training

| Feature | v1 | Claude Code Status |
|---|---|---|
| Create training modules (slides, questions) | Yes | EXISTS — `TrainingModule`, `TrainingSlide`, `TrainingQuestion`, `TrainingQuestionOption` models, full CRUD, publish/archive |
| Assign training modules to users / roles | Yes | EXISTS — `required_for_roles` JSON, `auto_assign_visitors`/`auto_assign_contractors`, bulk assignment |
| Track completion and certification status | Yes | EXISTS — `TrainingRecord`+`TrainingAttempt`+`TrainingResponse` models, `valid_for_days` expiry, passing score |

### 3.14 Alerts & Notifications

| Feature | v1 | Claude Code Status |
|---|---|---|
| Alerts linked to tasks, observations, risks, controls, incidents | Yes | EXISTS — `Notification` model with types (task, incident, action, training, visitor, timesheet, system), deep-link `data` JSON |
| Notification dashboard (in-app) | Yes | EXISTS — `GET /notifications` paginated list, `GET /unread-count`, mark-read endpoints, `NotificationService` |
| Push notifications to mobile | Yes | NOT STARTED — no FCM/APNS/Expo push service, no device token model, mobile app is stub |
| User-level notification preferences (partial — channel + block scope) | Partial | NOT STARTED — no preference model, no per-user filtering or channel selection |
| Weather alerts — frost / storm / hail (partial at launch) | Partial | NOT STARTED — no weather alert rules, no threshold model, no trigger service |

### 3.15 Weather

| Feature | v1 | Claude Code Status |
|---|---|---|
| Metservice API — live forecast (already built) | Yes | NOT STARTED — **no Metservice integration exists**; weather sources are Harvest Electronics, ECAN, HBRC only |
| User-defined forecast point | Yes | PARTIAL — zone-based forecast via `climate_zones` (20 NZ regions); no user-defined custom forecast point assignment |
| Harvest Electronics station live data on map | Yes | PARTIAL — data ingestion fully implemented (10-min intervals, CSV backfill, daily aggregation), but no map layer rendering station data |
| ETc / evapotranspiration from station data | Yes | NOT STARTED — no ETc calculation service or endpoint |
| Soil moisture from Harvest sensors | Yes | NOT STARTED — no soil moisture data ingestion or endpoints |

### 3.16 Third-Party Integrations

| Feature | v1 | Claude Code Status |
|---|---|---|
| Harvest Electronics multi-tenant station integration | Yes | EXISTS — `WeatherStation` model with `data_source='HARVEST'`, CSV backfill, admin station management, daily/hourly aggregation pipeline |
| GrapeLink — export file (fallback, property-scoped) | Yes | NOT STARTED — no GrapeLink model, schema, or export logic |
| GrapeLink — API integration (partial) | Partial | NOT STARTED — no GrapeLink API client or integration code |
| ACVM chemical database (embedded, locally cached) | Yes | PARTIAL — `registration_number`, `registration_expiry`, `active_ingredient`, `hazard_classifications` fields on Asset model; no external ACVM database lookup or cache |
| Metservice API | Yes | NOT STARTED — **no Metservice integration exists in codebase** |
| S-Map / soil reference data (partial) | Partial | NOT STARTED — no S-Map integration; soil observations captured via observation templates only |

### 3.17 Insights Intelligence Layer

| Feature | v1 | Claude Code Status |
|---|---|---|
| Historical climate by block (Insights integration) | Yes | EXISTS — `ClimateHistoricalData` model, per-block historical/summary/stats endpoints, CSV import |
| Projected climate by block (Insights integration) | Yes | EXISTS — `climate_projections` table with SSP126/SSP245/SSP370 scenarios for 3 future periods |
| Current season vs. historical benchmark panel | Yes | EXISTS — `climate_zone_daily_baseline` (1986-2005), GDD comparison, days-ahead/behind baseline |
| Phenology — modelled + observed timeline and projection | Yes | EXISTS — `PhenologyThreshold`+`PhenologyEstimate` models, GDD-based stage estimation, variety-specific harvest predictions at 6 sugar levels |
| Harvest estimation — crop load, timing, maturity metrics | Yes | PARTIAL — phenology harvest date predictions exist; observation templates capture bud/flower/bunch data; no autonomous aggregation pipeline |
| Disease — modelled, observed, spray efficiency combined | Yes | PARTIAL — disease models fully implemented (see below); observation templates exist; spray efficiency NOT implemented |
| UC Davis Powdery Mildew Risk Index | Yes | EXISTS — full implementation in `disease_service_v2.py` (Gubler et al. 1999), daily+cumulative index, favourable/lethal hour tracking |
| González-Domínguez Botrytis model | Yes | EXISTS — full implementation with wetness estimation, sporulation index, growth stage factors, daily severity 0-100 |
| Downy Mildew primary infection model | Yes | EXISTS — 3-10 Rule + Goidanich cumulative index, primary risk score, risk factors tracking |
| Frost risk model (topographically adjusted) | Yes | NOT STARTED — `frost_days` counted in climate_calculations.py but no predictive model or topographic adjustment |
| Spray interval tracker per block/product | Yes | NOT STARTED — `withholding_period_days` field on consumable assets; no interval tracking service or per-block/product logic |
| Blockchain — all critical tasks, observations, inputs | Yes | EXISTS — `BlockchainChain`+`BlockchainNode`+`BlockchainEvent`+`FruitReceived` models, DAG structure, season polymorphism, provenance hash |
| Biosecurity — observation-based + contractor movements | Partial | PARTIAL — `ContractorMovement` model fully implemented (329 lines, biosecurity risk scoring); biosecurity observation template exists; no aggregated biosecurity dashboard |
| Operational reporting — exportable season reports | Yes | NOT STARTED — no report generation service, no PDF/Excel export, no reporting UI in Pro app |

---

## 4. v1.x / v2 / v3 BACKLOG (DO NOT BUILD IN v1)

Items below are locked out of v1. Any temptation to include them should be resisted.
Log a `# TODO v1.x:` comment in relevant code locations as a pointer.

### v1.x (3–6 months post-launch)
- Mobile offline mode (SQLite queue + sync on reconnect)
- External calendar sync (iCal / Google Calendar / Outlook)
- GrapeLink full API push (replacing export file)
- User-level notification preferences (full granularity)
- Weather alerts full implementation (frost, storm, hail)
- Task templates — full library
- NDVI / vine health layer (Sentinel ESA free tier)
- Yield estimation layer on map
- Spatial analysis tools (buffers, area calcs)
- Carbon reporting (calculation layer on top of v1 data capture)
- Data import wizard (CSV template for block, spray, obs migration)
- Guided onboarding wizard
- VMC portfolio dashboard (all managed properties in one view)
- Buffer zone assignment on operational areas
- Observation → risk/task pipeline (full automation, not partial)

### v2 (6–18 months)
- AI-assisted task suggestions
- Ferment data handoff (Fruit Intake Package at harvest)
- Lab API integrations (Hill Labs, Eurofins)
- Asset cost and depreciation tracking
- Risk reports and operational efficiency reporting
- Biodiversity monitoring outcomes on operational areas
- Full biosecurity with national/regional alert ingestion
- Management contract transfer workflow (property record ownership transfer)
- External WMS / tile source connections in Map Builder

### v3 (18 months+)
- Cropsy integration (explore)
- 3rd party payroll integration (Xero/MYOB)
- Training library for Auxein Learn integration
- Consumer-facing provenance / Discover integration

---

## 5. SCHEMA MIGRATION PLAN

The following Alembic migrations are required, in order. Claude Code should confirm
whether any of these already exist before creating new ones.

### Migration 001 — Add `properties` table
```
alembic revision --autogenerate -m "add_properties_table"
```
Creates `properties` table as defined in Section 2.2.

### Migration 002 — Add `management_relationships` table
```
alembic revision --autogenerate -m "add_management_relationships_table"
```
Creates `management_relationships` table + partial unique index as defined in
Section 2.3.

### Migration 003 — Add `property_id` to `vineyard_blocks`
```
alembic revision --autogenerate -m "add_property_id_to_vineyard_blocks"
```
Adds nullable `property_id` FK to `vineyard_blocks`. Does NOT remove `company_id`.

### Migration 004 — Backfill properties from existing companies
```
alembic revision -m "backfill_properties_from_companies"
```
Manual migration (not autogenerate). For each distinct `company_id` in
`vineyard_blocks`, creates one `Property` record and one `ManagementRelationship`
(owner = manager, start_date = company created_at). Backfills `property_id` on all
existing blocks.

### Migration 005 — Add `user_property_scopes` table
```
alembic revision --autogenerate -m "add_user_property_scopes_table"
```
Creates `user_property_scopes` table as defined in Section 2.5.

### Migration 006 — Add GrapeLink fields to `properties`
```
alembic revision --autogenerate -m "add_grapelink_fields_to_properties"
```
Adds `grapelink_grower_id` and `grapelink_property_code` to `properties`. These
fields should be REMOVED from `companies` if they currently exist there.

---

## 6. API ENDPOINTS — NEW OR MODIFIED

Claude Code: confirm which of these exist, are partial, or are not started.

### New Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/properties/` | List all properties visible to current user |
| POST | `/api/properties/` | Create property (company_admin+) |
| GET | `/api/properties/{id}` | Get property detail |
| PATCH | `/api/properties/{id}` | Update property |
| GET | `/api/properties/{id}/blocks` | List blocks for property |
| GET | `/api/properties/{id}/management-history` | Management relationship history |
| POST | `/api/properties/{id}/management-relationships` | Create new management relationship (transfers active flag) |
| GET | `/api/companies/{id}/managed-properties` | All properties a VMC is actively managing |
| GET | `/api/users/{id}/property-scopes` | Get user's property scope list |
| POST | `/api/users/{id}/property-scopes` | Add property to user's scope |
| DELETE | `/api/users/{id}/property-scopes/{property_id}` | Remove property from user's scope |

### Modified Endpoints

| Endpoint | Change required |
|---|---|
| `POST /api/blocks/` | Accept `property_id` in request body |
| `GET /api/blocks/` | Filter by `property_id` if provided; also filter by all properties where user's company is active manager |
| `GET /api/companies/{id}/blocks` | Scope to properties managed by this company (not just `company_id` on block) |
| `POST /api/compliance/grapelink-export` | Accept `property_id` parameter; use property-level GrapeLink credentials |
| All block-scoped query endpoints | Add `property_id` as optional filter parameter |

---

## 7. CRITICAL DATA INTEGRITY RULES

These must be enforced at the application layer (not just database constraints):

1. **One active manager per property.** Before creating a new `ManagementRelationship`
   with `is_active = TRUE`, set all existing active relationships for that property
   to `is_active = FALSE`, `end_date = today`.

2. **Block records do not belong to the managing company — they belong to the property.**
   When a management relationship ends, blocks do NOT get re-assigned. The new manager
   inherits them via the new `ManagementRelationship`.

3. **Blockchain chains are not broken by management transfers.** The chain was
   initiated on the block, not on the company. A management change does not create
   a new chain — it adds a `management_transfer` event to the existing chain.

4. **`company_id` on `VineyardBlock` is kept in sync.** Whenever a new management
   relationship becomes active for a property, all blocks under that property have
   their `company_id` updated to the new `managing_company_id`. This preserves
   backward compatibility with all existing `company_id`-based queries.

5. **Owner read-only access is enforced at endpoint level**, not via role. A user
   whose company is the `owner_company_id` on a property but NOT the
   `managing_company_id` receives 200 OK on GET endpoints for that property's
   blocks, tasks (read), and observations (read), but 403 on all POST/PATCH/DELETE.

---

## 8. WHAT CLAUDE CODE SHOULD RETURN

After completing the discovery pass, return this document with:

1. `## DISCOVERY REPORT` section appended at the end, containing:
   - Status of each item in Section 3 (`EXISTS` / `PARTIAL` / `SCHEMA ONLY` / `NOT STARTED`)
   - Current schema for `VineyardBlock`, `Company`, and `User` models (abbreviated)
   - Current Alembic migration head
   - Any conflicts between the proposed schema changes in Section 2 and the current
     codebase that need resolution before proceeding
   - Any features listed as v1 that are clearly further from complete than expected

2. A `## REVISED ESTIMATES` section with rough build effort for each NOT STARTED or
   PARTIAL item (T-shirt sizes: S = < 1 day, M = 1–3 days, L = 3–7 days, XL = 1–2 weeks)

3. A `## RECOMMENDED BUILD ORDER` section — the sequence in which modules should be
   built given data model dependencies (schema migrations must precede any feature
   that depends on the new tables)

4. Do NOT make any code changes during discovery. Return the annotated document first.

---

## DISCOVERY REPORT

> **Generated:** 2026-03-12
> **Scope:** Full codebase audit against GROW_V1_PLAN Section 3 feature scope
> **Codebase:** 62 database tables, ~600+ API endpoints, 57 Alembic migrations

### Discovery Checklist — Answered

All 10 checklist items answered inline above (Section "Additionally, confirm"). Summary:

| Question | Answer |
|----------|--------|
| `VineyardBlock.company_id` FK? | YES |
| `Property` table? | NO — new work |
| `ManagementRelationship` table? | NO — new work |
| `BlockchainChain` → block FK? | YES — via `vineyard_block_id` |
| Role/type system? | Dual: legacy `role` (3 values) + new `user_type` (4 values + contractor property) |
| Metservice? | NO — not present |
| Harvest Electronics? | YES — fully implemented |
| Alembic head? | `add_user_type_to_users` (57 migrations) |
| `user_type` on User model? | YES — `auxein_admin`, `company_admin`, `company_manager`, `company_user` |
| `OperationalArea` model? | NO — `SpatialArea` serves this purpose |

### Current Schema Summaries

**VineyardBlock** (`vineyard_blocks`): 27 columns. Key: `id`, `block_name`, `variety`, `clone`, `rootstock`, `row_spacing`, `vine_spacing`, `area`, `region`, `swnz`, `organic`, `biodynamic`, `regenerative`, `geometry` (PostGIS), `company_id` (FK). No `property_id`.

**Company** (`companies`): Tenant root entity. Company CRUD, public registration, subscription tiers. No `grapelink_grower_id` or `grapelink_property_code` fields.

**User** (`users`): Dual role system. `role` (String(20): admin/manager/user — legacy). `user_type` (String(20): auxein_admin/company_admin/company_manager/company_user — current). `has_permission(module, action)` method delegates to `core/permissions.py`. `company_id` FK. Soft delete via `deleted_at`.

### Section 3 Status Summary

| Section | EXISTS | PARTIAL | SCHEMA ONLY | NOT STARTED | Total |
|---------|--------|---------|-------------|-------------|-------|
| 3.1 Onboarding | 2 | 2 | 0 | 2 | 6 |
| 3.2 User Mgmt | 5 | 2 | 0 | 1 | 8 |
| 3.3 Contractors | 2 | 3† | 3 | 0 | 8* |
| 3.4 Visitors | 4 | 0 | 0 | 0 | 4 |
| 3.5 Maps | 5 | 0 | 0 | 6 | 11 |
| 3.6 Blocks/Areas | 5 | 2 | 0 | 0 | 7 |
| 3.7 Map Builder | 1 | 1 | 0 | 2 | 4 |
| 3.8 Task Engine | 5 | 1 | 0 | 1 | 7 |
| 3.9 Observations | 3 | 3 | 0 | 1 | 7 |
| 3.10 Assets | 4 | 1 | 0 | 0 | 5 |
| 3.11 Risks | 6 | 0 | 0 | 0 | 6 |
| 3.12 Timesheets | 2 | 1 | 0 | 0 | 3 |
| 3.13 Training | 3 | 0 | 0 | 0 | 3 |
| 3.14 Notifications | 2 | 0 | 0 | 3 | 5 |
| 3.15 Weather | 0 | 2 | 0 | 3 | 5 |
| 3.16 Integrations | 1 | 1 | 0 | 4 | 6 |
| 3.17 Intelligence | 8 | 3 | 0 | 3 | 14 |
| **TOTALS** | **58** | **21** | **3** | **27** | **109** |

*Note: 3.3 "Invite and manage users" counted as EXISTS (separate from contractor items)
†Updated 2026-03-13: contractor relationship management upgraded from PARTIAL to PARTIAL+ (admin endpoints added)

### Conflicts with Section 2 (Property/Management Model)

1. **No conflicts with existing schema** — the proposed `properties`, `management_relationships`, and `user_property_scopes` tables are entirely new. No column name collisions.

2. **`company_land_ownerships` + `primary_parcels` overlap** — These existing tables track LINZ cadastral parcels and ownership. The new `Property` entity is a different concept (operational property, not a cadastral parcel). However, there is a natural link: a `Property` may encompass one or more `primary_parcels`. Consider adding a `property_id` FK to `company_land_ownerships` in a future migration, or adding a `primary_parcel_ids` JSON field to `properties`.

3. **`company_id` retention on `VineyardBlock`** — Section 2.4 correctly identifies that `company_id` must be retained as a denormalised convenience FK. The sync logic (Rule 4 in Section 7) is the most complex new behaviour and must be carefully implemented.

4. **Blockchain `company_id` is nullable** — `BlockchainChain.company_id` is already nullable, which aligns with Section 7 Rule 3 (chains belong to blocks, not companies). A management transfer event type needs to be added to the `BlockchainNode` node types.

5. **GrapeLink fields** — Section 2.7 proposes `grapelink_grower_id` and `grapelink_property_code` on `properties`. These fields do NOT currently exist on `companies` either, so Migration 006 only needs to ADD them (no removal needed).

### Features Further From Complete Than Expected

1. **Metservice API (3.15, 3.16)** — Listed as "already built" in the plan. **It does not exist.** The weather system uses Harvest Electronics, ECAN, and HBRC — no Metservice integration at all. This needs a scope decision: build Metservice integration, or accept the current data sources as sufficient for v1.

2. **Contractor endpoints (3.3)** — Models and schemas are comprehensive (ContractorAssignment, ContractorMovement), but API endpoints are almost entirely missing. The 329-line `ContractorMovement` model has zero exposed endpoints. This is more work than "partial" — it's effectively "model complete, API not started".

3. **Map heatmap layers (3.5)** — Six layers listed as v1 are NOT STARTED with no backend data services. Disease/phenology data exists in the DB, but transforming it into spatial heatmap layers is significant new work (backend aggregation + Mapbox GL heatmap rendering).

4. **ETc / evapotranspiration (3.15)** — Listed as v1. Not implemented and not trivial — requires Penman-Monteith or similar equation implementation, additional sensor data (wind speed, which Harvest may not provide), and reference crop coefficients.

5. **Operational reporting (3.17)** — Listed as v1. No report generation service exists anywhere. This requires a reporting framework (PDF/Excel generation), report templates, and a frontend UI.

6. **Push notifications (3.14)** — Listed as v1. Mobile app is a stub. Push requires device token model, Expo/FCM service integration, and a functioning mobile app.

### Phase 2.5 Status (from Alpha Tests)

Phase 2.5 (User Types & Permissions Overhaul) is **substantially complete** with known bugs:
- Permission matrix (`core/permissions.py`) fully implemented with 17 modules
- `require_permission()` dependency wired into `deps.py`
- JWT carries `user_type_role` claim
- Frontend `AuthContext` exposes `hasPermission(module, action)`
- `ProtectedRoute` supports `allowedUserTypes` and `requiredPermission` props

**Known bugs from alpha testing:**
- `company_manager` gets 403 on users list (NoneType error) — **FIXED** (commit ff86070)
- `company_user` can create assets and spatial areas (should be blocked)
- `userTypeRole` not persisting correctly in localStorage (all display as company_user) — **FIXED** (commit ff86070)
- `tasksService.getFilteredTasks` is not a function (separate bug)
- Risk dashboard `user_type` not coming through in response

---

## REVISED ESTIMATES

T-shirt sizes: **S** = < 1 day, **M** = 1–3 days, **L** = 3–7 days, **XL** = 1–2 weeks

### New Schema Work (Section 2)

| Item | Estimate | Notes |
|------|----------|-------|
| Migration 001: `properties` table | S | Straightforward table creation |
| Migration 002: `management_relationships` table + partial unique index | S | Includes index |
| Migration 003: `property_id` FK on `vineyard_blocks` | S | Nullable FK addition |
| Migration 004: Backfill properties from existing companies | M | Manual migration, data transformation logic, testing |
| Migration 005: `user_property_scopes` table | S | Simple junction table |
| Migration 006: GrapeLink fields on `properties` | S | Two varchar columns |
| Property model + schema + CRUD endpoints | M | Model, Pydantic schemas, router with 7 endpoints |
| ManagementRelationship model + schema + endpoints | M | Model, schemas, transfer logic, 3 endpoints |
| UserPropertyScope model + schema + endpoints | S | Simple CRUD + scope filtering logic |
| Owner read-only access logic | M | Endpoint-level `is_owner_viewing` flag, modify all block-scoped endpoints |
| `company_id` sync on management transfer | M | Service logic + blockchain management_transfer event |
| Modified block endpoints (property_id filter) | M | Update ~10 block-scoped query endpoints |

**Subtotal Section 2: ~L–XL (5–10 days)**

### NOT STARTED Features

| Feature | Estimate | Notes |
|---------|----------|-------|
| Metservice API integration | L | External API client, forecast point model, data ingestion pipeline. **OR** scope decision to defer |
| GrapeLink export file | M | Export format spec needed, per-property data aggregation, compliance file generation |
| GrapeLink API integration | L | External API client, auth, push/pull logic |
| Spray efficiency heatmap layer | M | Backend: aggregate GPS+calibration data per block. Frontend: Mapbox GL heatmap source+layer |
| Disease pressure heatmap layer | M | Backend: expose existing `disease_pressure` data as GeoJSON. Frontend: Mapbox heatmap rendering |
| Phenology stage layer | M | Backend: expose `phenology_estimates` as GeoJSON. Frontend: choropleth or symbol layer |
| Frost risk layer | L | Requires frost risk MODEL (predictive, topographically adjusted) + map layer. Most complex missing model |
| Weather station live conditions layer | M | Backend: live station data endpoint. Frontend: marker layer with current readings |
| Soil moisture layer | L | Requires soil moisture data from Harvest sensors (may need new data fields) + map layer |
| Map export to PDF/image | M | Canvas capture (html2canvas or Mapbox `getCanvas()`) + optional server-side PDF generation |
| Custom GeoJSON/KML/GeoTIFF/CSV import | L | File upload, format parsing (multiple formats), validation, preview, persist as SpatialArea or custom layer |
| Rule-based auto-task generation | L | Threshold engine monitoring disease+phenology data, task template auto-selection, background job |
| Phenology-conditional mobile menu | XL | Requires functioning mobile app (M3.1-M3.6 from Phases 3-5 plan). Deferred until mobile is built |
| ETc / evapotranspiration | M | Penman-Monteith implementation, sensor data requirements check, per-block calculation |
| Push notifications to mobile | L | Device token model, Expo push service, notification dispatch integration. Requires mobile app |
| Notification preferences | M | Preference model, per-user filtering, UI for preference management |
| Weather alerts (frost/storm/hail) | L | Alert rule model, threshold evaluation service, trigger logic, notification integration |
| Operational reporting (exportable season reports) | XL | Report framework, PDF/Excel generation, templates per domain (tasks, obs, spray, compliance), UI |
| Spray interval tracker per block/product | M | Service tracking last application per block+product, withholding countdown, next-due calculation |
| ACVM chemical database (full) | M | Source ACVM data, import/cache mechanism, lookup endpoint, link to consumable assets |
| S-Map / soil reference data | L | Data license, import pipeline, soil property model, block↔soil mapping |
| Timesheet CSV export endpoint | S | Serialise existing timesheet data to CSV, download endpoint |
| Yield estimation pipeline | M | Aggregate bud→flower→bunch observation data per block, compute progressive estimates, API endpoint |

### PARTIAL Features (Completion Work)

| Feature | Estimate | Notes |
|---------|----------|-------|
| Contractor relationship admin endpoints | M | Wire existing models to new CRUD router, ~9 endpoints |
| Contractor task assignment endpoints | M | Wire `ContractorAssignment` model to API, integrate with task workflow |
| Contractor biosecurity movement endpoints | M | Wire `ContractorMovement` model to API, check-in/check-out flow |
| Contractor observation/incident endpoints | S | Add contractor context to existing observation+incident endpoints |
| Calendar aggregated endpoint | M | Extend beyond tasks to include obs plans, maintenance, training, weather events |
| Map settings save to backend | M | Map config model, user-scoped CRUD endpoints, frontend API integration |
| Observation → risk/task auto-trigger | M | Rule engine for observation-to-risk escalation, observation-to-task creation |
| Voice-to-text in observations | M | Expo Speech API (mobile) or Web Speech API (web), transcription to text fields |
| Harvest station assignment to blocks | S | Station↔block mapping table or FK, assignment endpoint |
| Phase 2.5 bug fixes | M | Fix 5 known bugs from alpha testing |
| Assign tasks/observations to spatial areas | S | Add `spatial_area_id` FK to tasks/observations if not present, filter endpoints |

### Grand Total Estimate

| Category | Count | Estimated Days |
|----------|-------|---------------|
| New schema + Property/Management model | 12 items | 5–10 |
| NOT STARTED features | 23 items | 40–65 |
| PARTIAL completion work | 11 items | 12–20 |
| Phase 2.5 bug fixes | 5 bugs | 2–3 |
| **TOTAL** | | **~60–100 working days** |

**Note:** Several NOT STARTED items (Metservice, Soil moisture, S-Map, Push notifications, Mobile-dependent features) may warrant scope deferral to v1.x. See Recommended Build Order for prioritisation.

---

## RECOMMENDED BUILD ORDER

### Scope Decision Required First

Before build begins, resolve these scope questions:

1. **Metservice** — The plan lists it as "already built". It is not. Options:
   - (a) Build Metservice integration for v1 (adds L effort)
   - (b) Accept Harvest/ECAN/HBRC as v1 weather sources, defer Metservice to v1.x
   - **Recommendation: (b)** — existing sources cover the key regions

2. **ETc / Soil Moisture** — Both depend on sensor data that may not be available from current Harvest Electronics stations. Options:
   - (a) Build if Harvest provides the data fields
   - (b) Defer to v1.x pending sensor capability confirmation
   - **Recommendation: (b)** — verify data availability before investing build effort

3. **Push Notifications + Mobile-dependent features** — The mobile app is a stub. Push, phenology-conditional menu, and voice-to-text all require a functioning mobile app. Options:
   - (a) Build mobile app as part of v1
   - (b) Defer all mobile-dependent features to v1.x, ship v1 as web-only
   - **Recommendation: Decision needed** — this significantly affects scope

4. **Operational Reporting** — XL effort with no existing foundation. Options:
   - (a) Build full reporting framework for v1
   - (b) Ship v1 with CSV export only, defer PDF/Excel to v1.x
   - **Recommendation: (b)** — CSV export covers immediate compliance needs

### Phase A: Foundation (must be first)

**Duration: ~2 weeks**

```
A1. Fix Phase 2.5 bugs (company_manager 403, company_user permissions, userTypeRole persistence)
A2. Migration 001: properties table
A3. Migration 002: management_relationships table
A4. Migration 003: property_id on vineyard_blocks
A5. Migration 004: backfill properties from existing companies
A6. Migration 005: user_property_scopes table
A7. Migration 006: GrapeLink fields on properties
A8. Property model + schema + CRUD endpoints (7 endpoints)
A9. ManagementRelationship model + schema + endpoints
A10. UserPropertyScope model + schema + endpoints
A11. Owner read-only access logic
A12. company_id sync on management transfer + blockchain event
A13. Update block endpoints to accept/filter property_id
```

**Dependencies:** A2→A3→A4→A5 (sequential migrations). A8 depends on A2. A9 depends on A3. A10 depends on A6. A11 depends on A8+A9. A12 depends on A9. A13 depends on A4+A8.

### Phase B: Contractor API Wiring

**Duration: ~1 week**

```
B1. Contractor relationship admin CRUD endpoints (~9 endpoints)
B2. Contractor task assignment endpoints (wire ContractorAssignment model)
B3. Contractor biosecurity movement endpoints (wire ContractorMovement model)
B4. Contractor observation + incident context endpoints
```

**Dependencies:** Independent of Phase A. Can run in parallel.

### Phase C: Map Layers & Builder Completion

**Duration: ~2–3 weeks**

```
C1. Disease pressure map layer (expose existing data as GeoJSON + Mapbox heatmap)
C2. Phenology stage map layer (expose estimates as GeoJSON + choropleth)
C3. Weather station live conditions layer (station data endpoint + markers)
C4. Spray efficiency heatmap layer (aggregate GPS+calibration data)
C5. Harvest station assignment to blocks (station↔block mapping)
C6. Map settings save to backend (map config model + API)
C7. Map export to PDF/image (canvas capture)
C8. Custom GeoJSON/KML/CSV import (file upload + parse + preview)
```

**Dependencies:** C1+C2+C3 can be parallel. C4 depends on GPS track data. C5 independent. C6+C7+C8 independent of each other.

### Phase D: Intelligence & Automation

**Duration: ~2–3 weeks**

```
D1. Calendar aggregated endpoint (extend to obs plans, maintenance, training, actions)
D2. Spray interval tracker per block/product
D3. Rule-based auto-task generation (disease+phenology triggers → tasks)
D4. Observation → risk escalation / task trigger automation
D5. Yield estimation pipeline (aggregate bud→flower→bunch data per block)
D6. Notification preferences model + per-user filtering
D7. Weather alert rule engine + threshold model + trigger service
D8. Timesheet CSV export endpoint
```

**Dependencies:** D1 standalone. D2 depends on asset+task data. D3 depends on disease models + task templates. D4 depends on observation+risk models. D5 depends on observation templates. D6+D7 can be parallel. D8 standalone.

### Phase E: Integrations

**Duration: ~2–3 weeks**

```
E1. GrapeLink export file (per-property, property-scoped credentials)
E2. ACVM chemical database (source data, import/cache, lookup)
E3. Frost risk model (predictive, topographically adjusted) + map layer
E4. ETc/evapotranspiration (if sensor data confirmed available)
E5. S-Map soil reference data (if data license secured)
E6. Operational reporting — CSV export framework (defer PDF/Excel to v1.x)
```

**Dependencies:** E1 depends on Phase A (Property model + GrapeLink fields). E2+E3+E4+E5 independent. E6 standalone.

### Phase F: Deferred to v1.x (Recommended)

These items are recommended for deferral based on effort vs. v1 launch priority:

```
- Metservice API integration (L) — current sources sufficient
- Soil moisture from Harvest sensors (L) — data availability unconfirmed
- Push notifications to mobile (L) — requires mobile app
- Phenology-conditional mobile menu (XL) — requires mobile app
- Voice-to-text (M) — requires mobile app or Web Speech API
- Full PDF/Excel operational reporting (XL) — CSV covers v1 compliance
- GrapeLink API integration (L) — export file sufficient for v1
- S-Map soil reference data (L) — data license dependent
- Custom GeoTIFF import (part of C8) — complex format, low priority
```

### Build Order Dependency Graph

```
Phase A: Foundation (Property/Management model)
├─→ Phase B: Contractor API (parallel with A)
├─→ Phase C: Map Layers (after A5 for property context)
│   └─→ Phase E1: GrapeLink export (after A7+A8)
├─→ Phase D: Intelligence & Automation (after A, parallel with C)
└─→ Phase E: Integrations (after A, parallel with C+D)
    └─→ Phase F: Deferred to v1.x
```

### Critical Path

The longest dependency chain is:

```
A1 (bug fixes) → A2–A5 (migrations) → A8–A9 (Property+Management endpoints)
→ A11–A13 (owner access + block endpoint updates)
→ E1 (GrapeLink export, depends on property model)
```

**Estimated critical path duration: ~3–4 weeks**

Phases B, C, D can run in parallel with the later stages of Phase A once the schema migrations are complete.

---

## APPENDIX: Prior Planning Documents

> The following documents were previously maintained as separate files in the repo root.
> Their content has been audited during this discovery pass. Key reference material is
> preserved below; the original files have been trimmed to pointers.

### A1. Prior Phase Status

| Document | Content | Status |
|----------|---------|--------|
| `DISCOVERY_REPORT.md` | Phase 0 codebase discovery (62 tables, routes, roles, tech debt) | Incorporated into this discovery — see checklist answers above |
| `Auxein Insights Pro — Development Plan.md` | Original Phases 0–5 plan | Superseded by this document for v1 scope; Phases 3-5 detail retained in `PHASES_3_4_5_IMPLEMENTATION_PLAN.md` |
| `PHASE_2_5_IMPLEMENTATION_PLAN.md` | 12-step permissions overhaul | Substantially complete — see Phase 2.5 Status above |
| `PHASE_2_5_ALPHA_TESTS.md` | Alpha test results with 5 known bugs | Bugs carried forward into Phase A of this build order |
| `PHASES_3_4_5_IMPLEMENTATION_PLAN.md` | Detailed web+mobile implementation steps | Retained as reference for post-v1 mobile work |

### A2. Infrastructure Reference

- **Backend**: FastAPI on AWS Elastic Beanstalk (api.auxein.co.nz), t3.micro, Gunicorn+Uvicorn
- **Database**: PostgreSQL + PostGIS on AWS RDS, ap-southeast-2
- **Frontend (Pro)**: React+Vite on S3+CloudFront (port 5173 local)
- **Frontend (Insights)**: React+Vite on S3+CloudFront (insights.auxein.co.nz, port 5174 local)
- **Mobile**: React Native/Expo — stub only
- **Email**: Gmail SMTP via `UnifiedEmailService`
- **Files**: Local disk on EB instance (company-scoped paths)
- **Images**: AWS S3 for article images
- **CI/CD**: GitHub Actions — daily climate processing (5:00 UTC), weather ingestion (every 6h)

### A3. Known Tech Debt (Carried Forward from Discovery)

1. **Hardcoded default SECRET_KEY** in `public_security.py` — security vulnerability (Phase 2.5 Step 7 addresses this)
2. **Backup files in repo** — `email_utils - Copy.py`, `email_service - Copy.py` (52KB + 22KB)
3. **DEBUG print statements** in `climate_calculations.py`
4. **No middleware-level tenant isolation** — every route manually filters `company_id`
5. **Token cleanup not scheduled** — `cleanup_expired_blacklist()` exists but never called
6. **Failed login tracking not enforced** — fields exist but never incremented during login
7. **3 missing blockchain methods** — `handle_company_reassignment()`, `archive_chain_for_season()`, `get_current_season()` referenced by `management_service.transfer_management()` but not implemented. Will throw `AttributeError` at runtime when a management transfer occurs. See Build Log §BL3.
8. **~20 endpoints with fragile post-fetch access patterns** — Many block/climate endpoints fetch data first, then check `company_id` after. Should filter in query instead. See Build Log §BL3.
9. **`block.company_id` vs `block.property_id` tension** — Legacy `company_id` used for access control everywhere, but new property-based model means access should flow through `property_id → management_relationship → managing_company_id`. Both coexist with no unified access verifier.

---

## BUILD LOG

### BL1. Admin UX Redesign (Completed 2026-03-13)

Extracted all system admin functionality from `/profile` into standalone `/admin` page. This addresses Phase A prerequisite work and provides the admin tooling needed for property/contractor management.

**What was built:**

| Item | Files | Status |
|------|-------|--------|
| Admin page shell with 4 sub-tabs (Companies, Users, Properties, Contractors) | `pages/Admin.jsx` (new) | DONE |
| Admin nav link in header (auxein_admin only) | `SiteHeader.jsx` (modified) | DONE |
| Admin quick actions on Home page | `Home.jsx` (modified) | DONE |
| Admin route in App.jsx | `App.jsx` (modified) | DONE |
| Profile.jsx stripped of system admin panels | `Profile.jsx` (modified) | DONE |
| PropertyManagement component (paginated table, search, company filter, inline create, row editing) | `components/admin/PropertyManagement.jsx` (new) | DONE |
| ContractorRegistry component (create form + list table, specialisation toggles, auto-password, link to company) | `components/admin/ContractorRegistry.jsx` (new) | DONE |
| Property API service | `shared/api/propertyService.js` (new) | DONE |
| Admin contractor endpoints | `backend/api/v1/admin.py` (modified) | DONE |
| `GET /admin/properties` — all properties with owner/manager names, block counts | `admin.py` | DONE |
| `POST /admin/create-contractor` — with auto-relationship, `registration_source="admin_created"` | `admin.py` | DONE |
| `GET /admin/contractors` — system-wide list with relationship counts | `admin.py` | DONE |

**Maps V2 property integration:**

| Item | Files | Status |
|------|-------|--------|
| `property_id` dropdown in BlockEditForm | `BlockEditForm.jsx` (modified) | DONE |
| `property_id` dropdown in BlockCreateForm | `BlockCreateForm.jsx` (modified) | DONE |
| PropertiesPanel in sidebar (admin only — lists properties, block counts, fly-to navigation) | `PropertiesPanel.jsx` (new) | DONE |
| MapsPage wiring (fetch properties, pass to forms, refresh on create/edit/delete) | `MapsPage.jsx` (modified) | DONE |
| `property_id` included in all block API responses (GeoJSON, company list, single block) | `blocks.py` (modified) | DONE |
| `auxein_admin` sees ALL blocks across all companies (no company_id filter) | `blocks.py` (modified) | DONE |

**Key fix:** All admin detection now uses `userTypeRole` from `useAuth()` context (JWT `user_type_role` claim), NOT `user.user_type` which resolves to `company_user` for everyone due to how the backend returns it.

### BL2. Schema Work Completed

| Migration | Status |
|-----------|--------|
| `add_properties_and_management` — creates `properties`, `management_relationships`, `user_property_scopes` tables + adds `property_id` FK to `vineyard_blocks` | CREATED (file exists at `alembic/versions/add_properties_and_management.py`) |
| Backfill migration (004) — create default properties from existing companies | NOT YET RUN |

**Models created:**
- `backend/db/models/property.py` — Property model with owner_company_id, address, legal_description, total_area_ha, region
- `backend/db/models/management_relationship.py` — ManagementRelationship with partial unique index on active relationship
- `backend/db/models/user_property_scope.py` — UserPropertyScope junction table

**Services created:**
- `backend/services/property_service.py` — `get_visible_property_ids()`, `is_owner_viewing()`
- `backend/services/management_service.py` — `transfer_management()` (bulk-updates `block.company_id`)

### BL3. Block Access & Blockchain Audit (2026-03-13)

Full audit of how `company_id` constraints affect block operations, with property model implications.

#### Relationship Model (Canonical)

```
Company (owner)
  └── Property (1 company owns many properties)
        ├── ManagementRelationship → Company (manager, 1 active at a time)
        ├── VineyardBlock (many per property)
        │     ├── block.company_id = active managing company (denormalized, kept in sync)
        │     ├── block.property_id = owning property
        │     └── BlockchainChain (1 per block per season)
        │           └── BlockchainNode → BlockchainEvent (DAG)
        └── UserPropertyScope → User (optional staff scoping for VMCs)

Contractor
  └── ContractorRelationship → Company (many-to-many, scoped access)
```

#### Access Pattern Issues Found

**Pattern A (correct):** Filter in query — `query.filter(Block.company_id == user.company_id)`
**Pattern B (fragile):** Fetch first, check after — `block = db.get(id); if block.company_id != user.company_id: raise 403`

| Endpoint Group | Pattern | Issue |
|----------------|---------|-------|
| `blocks.py` — GeoJSON, company list | A (fixed) | auxein_admin bypass added |
| `blocks.py` — single block GET | B (fixed) | Null check reordered, admin bypass added |
| `blocks.py` — update/delete | B | Still fragile — no admin bypass, no property-based access |
| `climate_calculations.py` — 9 endpoints | B | All use post-fetch company check; no property-based access |
| `blockchain_service.py` — chain operations | A | company_id in query, but no property-based access path |
| `observations.py` — block-scoped queries | A | Filters by company_id, no property awareness |
| `tasks.py` — block-scoped queries | A | Same as observations |

#### Missing Blockchain Methods (Runtime Crash Risk)

`management_service.transfer_management()` calls three methods that don't exist:

```python
# These will throw AttributeError at runtime:
blockchain_service.handle_company_reassignment(db, block.id, new_company_id)
blockchain_service.archive_chain_for_season(db, block.id, current_season)
blockchain_service.get_current_season()
```

**Required implementation:**
1. `get_current_season()` — Return current season string (e.g. "2025-2026") based on date (Southern Hemisphere: Jul→Jun)
2. `archive_chain_for_season(db, block_id, season)` — Mark existing chain as archived, close it off
3. `handle_company_reassignment(db, block_id, new_company_id)` — Add `management_transfer` event to chain, update chain's `company_id`

#### Fundamental `company_id` vs `property_id` Tension

The legacy pattern (`block.company_id` used for all access control) and the new model (`property_id → management_relationship → managing_company_id`) coexist without a unified verifier. Current state:

- ~50+ endpoints filter by `company_id` directly
- Only `property_service.get_visible_property_ids()` implements property-based access
- No `verify_block_access(db, user, block_id)` helper exists

**Recommended fix:** Create a unified access helper:
```python
def verify_block_access(db, user, block_id, require_write=False):
    """Check if user can access a block via company_id OR property chain."""
    block = db.query(VineyardBlock).get(block_id)
    if not block: raise 404
    if user.user_type == "auxein_admin": return block
    # Direct company match (legacy, fast path)
    if block.company_id == user.company_id:
        if require_write and is_owner_viewing(db, user, block.property_id):
            raise 403  # owner is read-only
        return block
    # Property-based match (new path)
    visible = get_visible_property_ids(db, user)
    if block.property_id in visible:
        if require_write and is_owner_viewing(db, user, block.property_id):
            raise 403
        return block
    raise 403
```

This should be introduced incrementally — start with block CRUD endpoints, then roll out to climate, observations, tasks.

---

## NEXT KEY STEPS (Updated 2026-03-20)

### Phase B2 — Web Frontend (SUBSTANTIALLY COMPLETE as of 2026-03-20)

| Item | Status |
|------|--------|
| B2.1 Notifications (bell, dropdown, page) | **DONE** — backend wired, frontend polling, mark-read, type filters |
| B2.2 Calendar (unified events) | **DONE** — backend endpoint (tasks/obs/risk/training/maintenance), multi-day bars, month/week toggle |
| B2.3 Reports (summary + CSV) | **DONE** — 4 tabs (tasks/obs/timesheets/assets), 8 backend endpoints, CSV export |
| B2.4 GPS Track Visualization | **DONE** — TrackMap + TrackStats components (ready to embed in task detail) |
| B2.5 Task Quick Create | **DONE** — 3-step flow, template selector with Create Template card, route wiring |
| B2.6 Quick Observation | **DONE** — 2-step flow bypassing plans, grouped template picker (5 categories) |
| B2.7 Home Dashboard Wire-Up | **DONE** — real upcoming tasks, notification count, quick actions (New Task, Quick Obs, Calendar, Reports) |
| Design System Migration | **DONE** — 20+ files, all inline styles replaced with CSS classes/custom properties |
| Streamlining Report | **DONE** — `Tasks-Observations-Streamlining-Report.md` with priority-ranked recommendations |

### Deferred / Remaining

1. **Run backfill migration (004)** — Deferred, no real users yet. **Estimate: S**
2. **Company creation UX fixes** — Email not sending, password not working. **Estimate: M (1-2 days)**
3. **Maps V2 admin tab** — Bulk block/parcel assignment. **Estimate: L (3-5 days)**
4. **Fix climate endpoint access patterns** — 9 endpoints need property-aware filtering. **Estimate: M (2-3 days)**

### Next Build Phase — Streamlining Implementation (from report)

5. **Task completion → stock deduction (P0)** — Wire TaskAsset actual quantities + auto StockMovement creation on task complete. Backend change. **Estimate: M (3-4 days)**
6. **Pre-task equipment check flow (P1)** — Surface calibration/readiness checks in task start UI. **Estimate: S (2 days)**
7. **Observation template on task completion (P2)** — TaskTemplate references ObservationTemplate, capture conditions inline at completion. **Estimate: M (4-5 days)**
8. **Observation-to-task auto-linking (P2)** — Disease threshold triggers task suggestion with consumable pre-fill. **Estimate: M (4-5 days)**
9. **User-defined observation templates (P2)** — Clone and customise system templates. **Estimate: M (4-5 days)**

### Phase B3 — Mobile App Build

10. **Mobile scaffolding** — React Native/Expo, auth, navigation. **Estimate: L (5-7 days)**
11. **Mobile task + observation capture** — Touch-optimized, GPS auto-fill, camera-first. **Estimate: L (7-10 days)**

### Phase C-F (Original Plan)

12. **Phase C:** Map intelligence layers (disease pressure, phenology, weather, spray coverage)
13. **Phase D:** Intelligence & automation (calendar events, spray intervals, auto-tasks, yield estimation)
14. **Phase E:** Integrations & compliance (GrapeLink, ACVM, frost risk, CSV reports)
15. **Phase F:** Polish (offline support, push notifications, external calendar sync)

### Updated Phase A Status

| Item | Status |
|------|--------|
| A1. Fix Phase 2.5 bugs | **5 of 5 RESOLVED** — Bugs 1,3 fixed (commits), Bug 2 verified fixed (permissions gated), Bug 4 verified fixed (method exists), Bug 5 non-issue (frontend uses useAuth context) |
| A2. Migration 001: properties table | DONE (combined migration) |
| A3. Migration 002: management_relationships table | DONE (combined migration) |
| A4. Migration 003: property_id on vineyard_blocks | DONE (combined migration) |
| A5. Migration 004: backfill properties | DEFERRED — no real users, test data only |
| A6. Migration 005: user_property_scopes table | DONE (combined migration) |
| A7. Migration 006: GrapeLink fields on properties | DONE — fields on Property model (grapelink_grower_id, grapelink_property_code) |
| A8. Property model + schema + CRUD endpoints | DONE |
| A9. ManagementRelationship model + schema + endpoints | DONE |
| A10. UserPropertyScope model + schema + endpoints | DONE (model+service+endpoints), no frontend UI |
| A11. Owner read-only access logic | **DONE (2026-03-20)** — enforced on blocks, tasks, observations write endpoints |
| A12. company_id sync on management transfer + blockchain event | **DONE** — `transfer_management()` + all 3 blockchain methods fully implemented |
| A13. Update block endpoints to accept/filter property_id | DONE — create/update accept property_id, responses include it |
| A14. `verify_block_access()` unified helper | **DONE (2026-03-20)** — `property_service.py`, supports company_id + property_id + admin bypass + owner read-only |
| Admin UX Redesign | DONE — standalone /admin page, property management, contractor registry |
| Maps V2 property integration | DONE — property dropdown in block forms, PropertiesPanel sidebar, flyover scaffolding |
| auxein_admin global block visibility | DONE — admin sees all blocks across companies |

### Phase A Gate Status

Phase A is **functionally complete**. Remaining items (backfill migration, company creation UX, Maps V2 admin tab) are deferred or non-blocking for Phase B/C entry. The Phase A test gate can be run once test data is populated.
