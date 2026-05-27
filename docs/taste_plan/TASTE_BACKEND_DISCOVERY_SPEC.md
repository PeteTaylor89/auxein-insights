# Discovery & Design Spec — Taste Capture Backend

**Subject.** Add a personal tasting-capture domain (`taste`) to the Auxein Grow monorepo backend: three capture types (tasting notes, flights, interaction notes), a JSONB-driven grid schema engine, and a versioned REST API — to back a personal iPad capture app now and the Auxein Taste platform later.

**Mode.** **Discovery and design only. Phase 1 produces documents, not code.** No code changes, no schema changes, no migrations, no commits, no PRs until the design is reviewed and Phase 2 is explicitly authorised. Read-only access to the codebase and database throughout Phase 1.

**Audience.** Claude Code, executing against the live Auxein monorepo and a **read-only** connection to the staging (preferred) or production database.

**Deliverables (Phase 1).** Four Markdown documents in `/discovery/taste-backend/` (paths in §6). No source touched.

**Estimated effort.** One focused day for discovery + design. Stop and ask if scope creeps beyond the boundaries in §2.

---

## 1. Background and intent

Auxein needs a place to capture tasting notes today. There is a 30+ note backlog accumulating during an active Master of Wine application, and a personal web app (docked on iPad) is being built to clear it. That app must hook into the existing backend rather than store data in isolation.

Strategically, this is **not** a throwaway personal tool. It is the data foundation for **Auxein Taste**. Every structured note logged by a calibrated expert taster is a high-signal labelled data point. The capture surface is simple; the tasting graph underneath is the asset. The schema must therefore be Taste-native from day one even though the only user at launch is a single MW candidate.

Three architecturally significant decisions have already been made upstream and are **fixed inputs** to this spec — confirm they remain sound against the live code, but do not relitigate without flagging:

1. **Ownership is per-user, full stop.** Tasting entries belong to a *taster* (`user_id`) and nothing else. This is the Taste-native shape: a taster's notes follow the person, independent of any company. There is **no `company_id`** on these tables — do not add one "for later." This deliberately diverges from the `company_id`-scoped tenancy used across the rest of Grow (asset management, tasks, etc.); the divergence is intentional and central to the design. Future shared/panel/study-group tastings will be modelled explicitly when needed (a sharing-grant or membership table), not by repurposing a vestigial column. Verify the `users` PK type in the live schema before finalising ownership FKs.
2. **Grids are a JSONB schema engine, not hard-coded forms.** A grid (MW Practical, MS Deductive, Freeform, and future WSET L4 / consumer Voices grids) is a versioned config record describing sections, fields, allowed values, and conditional logic. One rendering contract serves all grids. A new grid is a row, not a migration.
3. **Three capture types ship:** `tasting` (structured, grid-driven), `flight` (an ordered set of wines with per-wine notes + an overall note), `interaction` (free-text meeting/conversation notes with who/role/subject).

---

## 2. Hard boundaries

**Phase 1 (this run) MUST NOT:**
- Modify any source file, schema, or seed data.
- Generate, run, or stage Alembic migrations.
- Create branches, commits, or PRs.
- Write to the database. Use a read-only role. If only a read-write connection is available, **stop and report** rather than risk a write.
- Call external services or incur cost.

**Phase 1 MUST:**
- Read the actual codebase and the actual live database schema, and treat any divergence between documented schema and live schema as a finding to report.
- Produce concrete, reviewable design artifacts (§6).
- Follow existing repo conventions discovered in situ — not assumed from memory.

If any instruction here conflicts with what is actually in the codebase, **the codebase wins** — document the conflict in `00-findings.md` and proceed with the real pattern.

---

## 3. Discovery tasks

Work through these in order. Record evidence (file paths, line references, actual DDL) as you go.

### 3.1 Repository orientation
- Locate the backend root, `main.py` / app factory, and confirm the API version prefix (expected `/api/v1`, confirm against `api.auxein.co.nz/api`).
- Inventory the conventions in `schemas/` (Pydantic Base/Create/Update/Response pattern) and `api/v1/` (CRUD + action endpoint style). Use `schemas/user.py`, `schemas/company.py`, and a strong endpoint example (e.g. `api/v1/vineyard_rows.py`) as the canonical reference patterns to imitate.
- Identify the ORM models layer, the Alembic setup (`alembic/`, `env.py`, current head revision), and how PostGIS types are declared (tasting has no geometry, but migrations must not break the PostGIS-enabled environment).
- Identify the auth dependency (JWT extraction, `get_current_user`) and exactly how `company_id` filtering is enforced today. **This is critical** — the new tables break that pattern deliberately (user-scoped), so you must understand the existing guard precisely to write a correct user-scoped equivalent.

### 3.2 Database reality check (read-only)
- Dump the live definitions of `users` and `companies` (columns, PKs, FKs, types). Confirm the PK type of `users` (UUID vs int) — all ownership FKs depend on it.
- Confirm whether a `taste` schema/namespace or any tasting-related table already exists. Report if so.
- Note the conventions actually in use: timestamp columns (`created_at`/`updated_at`, tz-aware?), soft-delete vs hard-delete, naming (snake_case, singular/plural tables), JSONB usage elsewhere in the schema for precedent.

### 3.3 Frontend contract
- A capture app already exists (React, currently on a local storage layer) producing entries in the `auxein.tasting.v1` export shape: each entry has `id`, `type`, `date`, and type-specific fields; tasting entries carry `schemaId`, `blind`, identity fields (producer/vintage/region), and a flat `values` map keyed `section.field`. Treat this as the **source-of-truth payload shape the API must accept and return.** Reconcile it with backend conventions and note any field-name translations (e.g. camelCase → snake_case) required at the API boundary.

---

## 4. Design tasks

Produce a proposed design — **as documents, not code** — covering the following.

### 4.1 Data model
Propose tables (names follow discovered conventions). Indicative shape, to be reconciled with reality:

- **`grid_schemas`** — the engine. `id`, `key` (e.g. `mw_practical`), `version`, `label`, `definition` (JSONB: ordered sections → fields → {type, allowed values, conditional logic}), `is_active`, ownership (`user_id` nullable for system/global grids vs user-authored custom grids), timestamps. System grids (MW/MS/Freeform) seed-loaded; user custom grids created at runtime.
- **`tasting_entries`** — the spine for all three types, or a base + per-type detail. Decide and justify: single-table-with-`type`-discriminator + JSONB `data`, vs base table + `tasting_notes` / `flights` / `interactions` detail tables. Recommend one; state the trade-off (query/index flexibility vs schema clarity). Owner is `user_id` only — no `company_id`.
- For **tasting**: FK to `grid_schemas`, `is_blind` flag, identity fields, and the `values` map stored as JSONB (keyed `section.field`, matching the frontend). Blind-reveal data (producer/region) must be storable but conceptually gated — note how reveal state is represented.
- For **flight**: ordered wines (child rows or JSONB array — decide), each optionally linkable to a `tasting_entry`, plus flight-level theme/overall note.
- For **interaction**: who, role/org, subject, body. Flag for future linking to CRM/industry-contact records (Marcus Pickens, Damian Martin et al.) but **do not build that linkage now** — just leave the door open in the design.

State indexes (at minimum `user_id`, `type`, `date`), and the FK/cascade behaviour on user deletion.

### 4.2 Grid schema-engine contract
- Define the JSONB `definition` structure precisely enough that the existing frontend renderer (sections, chip fields with allowed values, free-text fields) consumes it without code branching per grid.
- Specify how grid **versioning** works: an entry references the grid `id` + `version` it was captured against, so historical notes stay faithful when a grid is later edited. This is non-negotiable for data integrity in Taste.
- Provide the seed `definition` JSON for the three launch grids (MW Practical, MS Deductive, Freeform). MW Practical sections: Appearance / Nose / Palate / Assessment of Quality (BLIC reasoning) / Origin, Variety & Maturity. MS Deductive: Sight / Nose / Palate / Initial Conclusion / Final Conclusion (grape–region–vintage–quality call). Freeform: a single open note block.

### 4.3 API surface
Propose endpoints mirroring the discovered `api/v1` style. Indicative (reconcile naming with repo):
- `GET/POST /api/v1/taste/grids`, `GET /api/v1/taste/grids/{id}` — list/read grids; create custom grids.
- `GET /api/v1/taste/entries` (filter by `type`, `date` range, full-text search), `POST`, `GET/PATCH/DELETE /{id}`.
- `POST /api/v1/taste/entries/{id}/reveal` — flip blind→open for a blind tasting.
- All endpoints **user-scoped**: the auth dependency must filter by `current_user.id`, never `company_id`, for personal entries. Specify the authorisation guard explicitly and contrast it with the existing company-scoped guard so the divergence is intentional and reviewable.
- Define Pydantic Base/Create/Update/Response models per the discovered convention, including the camelCase↔snake_case boundary against the frontend payload.

### 4.4 Migration plan (described, not generated)
- Describe the Alembic migration that *would* create these tables (off the current head), the seed step for system grids, and a rollback. **Do not generate or run it in Phase 1.**

---

## 5. Open questions to surface (do not answer unilaterally)
List anything discovery reveals that needs Pete's decision before Phase 2, e.g.: UUID vs int PKs if `users` differs from expectation; single-table vs detail-table for entries (give your recommendation); whether custom user-authored grids are in scope for v1 or deferred; how reveal state and blind metadata should be modelled.

---

## 6. Deliverables (write these, nothing else)

Create under `/discovery/taste-backend/`:

1. **`00-findings.md`** — what the codebase and live DB actually look like: conventions, auth/tenancy guard, `users`/`companies` shape, Alembic head, any documented-vs-live divergence, any existing tasting artifacts.
2. **`01-data-model.md`** — proposed tables with full column lists, types, FKs, indexes, cascade behaviour; the single-table-vs-detail-table recommendation with rationale.
3. **`02-grid-engine.md`** — the JSONB `definition` contract, versioning model, and the three seed grid definitions as complete JSON.
4. **`03-api-and-migration.md`** — endpoint list, Pydantic model outlines, the user-scoped auth guard, frontend payload reconciliation, and the described (not generated) migration + rollback plan.

End Phase 1 by listing the §5 open questions at the top of `00-findings.md` so they are the first thing reviewed.

---

## 7. Phase 2 (do not start without authorisation)
On written approval of the Phase 1 design: implement models, Pydantic schemas, endpoints, the Alembic migration, and system-grid seed — on a feature branch, following the approved design and discovered conventions, with no changes to existing Grow tables.
