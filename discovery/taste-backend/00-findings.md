# 00 — Findings & Open Questions

Phase 1 discovery output. Read-only; no source, schema, or DB writes were performed.

The four documents in this directory are paired:

- `00-findings.md` (this) — what the code actually looks like + open questions
- `01-data-model.md` — proposed tables
- `02-grid-engine.md` — JSONB grid definition contract + seed grids
- `03-api-and-migration.md` — endpoints, Pydantic, described migration

---

## A. Open questions for Pete (review these first)

These need a call before Phase 2 starts. Each links to the section below where evidence is recorded.

1. **Read-only DB role is not available.** The spec mandates a read-only connection to staging (preferred) or prod for the live schema dump (§2 & §3.2). The repo's only configured connection is the developer's local Postgres on a writeable role (`postgres` superuser). Per spec §2, this means **stop and report** rather than risk a write. Phase 1 has proceeded against the ORM models + Alembic migrations as the schema source of truth, which is *usually* faithful but is not the same as the live DDL. Two paths forward — pick one before Phase 2: (a) provision a read-only role in staging RDS and re-run the live-schema reconciliation; (b) accept that the model+migration view is "close enough" given how disciplined this codebase has been about keeping them in sync. See §C below.

2. **`users.id` is `Integer`, not UUID.** The spec asked us to confirm before finalising FKs (§1). Confirmed: `User.id = Column(Integer, primary_key=True)` (`backend/db/models/user.py:12`). All ownership FKs in `01-data-model.md` use `INTEGER REFERENCES users(id)`. No further change required, but flagging because the spec called this out as decision-blocking.

3. **Single-table vs detail-table for entries.** Spec §4.1 explicitly asked for a recommendation + rationale. **Recommendation: hybrid — one base `taste_entries` table with a `type` discriminator plus `tasting_entry_details` / `flight_entry_details` / (no interaction detail table needed). Rationale and trade-off in `01-data-model.md`.** Confirm direction before Phase 2 — the alternative single-table-with-JSONB design is laid out alongside.

4. **Custom user-authored grids in v1 — in scope or deferred?** Spec §5 lists this as an open question. Schema design assumes "yes, in scope" (`grid_schemas.user_id` is nullable; NULL = system grid, NOT NULL = user-authored). The API design defers the actual `POST /taste/grids` create endpoint to Phase 2.5 unless you want it in the v1 launch. Easy to ship as design without endpoint.

5. **Blind-reveal state modelling.** Spec §4.1 says reveal data "must be storable but conceptually gated — note how reveal state is represented." Proposal in `01-data-model.md`: identity fields (producer/region/vintage/variety) are stored from the start in `tasting_entry_details`; a separate `blind_state` column (`'blind' | 'revealed'`) governs UI/API visibility; `POST /entries/{id}/reveal` flips it and stamps `revealed_at`. Confirm this matches the iPad UX expectation — alternative is "store nothing until revealed" which loses data integrity if the taster wants to capture identity upfront.

6. **API prefix.** Spec §3.1 expects `/api/v1`. **Repo reality is mixed** — newer modules (notifications, contractor-management, calendar, reports, company-admin, forecast) all use `/api/v1/...`; older modules (auth, blocks, observations, tasks) use the legacy `/api/...` prefix. Design assumes `/api/v1/taste/...` for all new taste endpoints. Confirm.

7. **`auxein.tasting.v1` capture app is not in this monorepo.** Spec §3.3 treats its payload shape as "source of truth." A repo-wide grep for `auxein.tasting.v1`, `tasting`, `MWPractical`, `MSDeductive`, `sommelier` returned only marketing-site biographical hits and the spec file itself — no capture-app code. The payload reconciliation in `03-api-and-migration.md` is therefore derived from the spec's prose description (§3.3), not from observed code. If the capture app exists elsewhere (separate repo, local dev folder), provide a pointer or paste a sample entry so the API boundary can be locked down before Phase 2.

---

## B. Backend conventions discovered

### B.1 Repo layout

- Backend root: `backend/`. App factory: `backend/main.py`. Includes ~60 routers.
- Schemas: `backend/schemas/<resource>.py` — Pydantic v1-style with v2 shims (`from_attributes = True` in newer models, `orm_mode = True` in older ones — both are accepted by the current Pydantic version pinned in the repo).
- Models: `backend/db/models/<resource>.py`. All inherit from `db.base_class.Base = declarative_base()`. There is no `TimestampMixin` — every model declares `created_at` / `updated_at` itself.
- Endpoints: `backend/api/v1/<resource>.py`. Authentication dependency injected via `Depends(get_current_user)` from `backend/api/deps.py`.

### B.2 Pydantic schema pattern (canonical reference: `schemas/vineyard_row.py`, `schemas/user.py`)

The convention is the classic Base / Create / Update / Response stack, but with **inconsistency** — different files use different combinations. The intersection (what's safe to assume) is:

- `XBase(BaseModel)` — shared optional fields, `class Config: from_attributes = True`
- `XCreate(XBase)` — promotes required-on-create fields from Optional → required
- `XUpdate(BaseModel)` — all Optional, separate base (does not inherit Create)
- `X(XBase)` — full Response shape with `id`, timestamps, computed fields, `from_attributes = True`
- `XWith<Related>(X)` — embedded relations (e.g. `VineyardRowWithBlock`)

Naming the response class as the bare resource name (`VineyardRow`, `User`, `Company`) collides with the SQLAlchemy model when both are imported — the repo aliases at import time (e.g. `from schemas.vineyard_row import VineyardRow as VineyardRowSchema`). The taste schemas should follow suit: `TastingEntry` (Pydantic) imported as `TastingEntrySchema` in the endpoint module.

### B.3 Endpoint pattern (canonical reference: `api/v1/vineyard_rows.py`)

- One router per file: `router = APIRouter()`, registered in `main.py` with a path prefix and tag.
- Standard CRUD: `POST /`, `GET /`, `GET /{id}`, `PATCH /{id}`, `DELETE /{id}`. Plus action endpoints (`POST /{id}/reveal`, `POST /bulk-create`, etc.) as needed.
- **Authorisation guard is a private helper** at the top of each module: `_verify_<resource>_access(db, id, user) -> Resource`. This helper joins to whatever scoping table is appropriate and raises 404 (not 403) on miss, so existence is not leaked.

  Example (`vineyard_rows.py:39-47`):

  ```python
  def _verify_row_access(db: Session, row_id: int, user: User) -> VineyardRow:
      row = db.query(VineyardRow).join(VineyardBlock).filter(
          VineyardRow.id == row_id,
          VineyardBlock.company_id == user.company_id
      ).first()
      if not row:
          raise HTTPException(status_code=404, detail="Row not found")
      return row
  ```

- List endpoints similarly start with a base filtered query: `db.query(VineyardRow).join(VineyardBlock).filter(VineyardBlock.company_id == user.company_id)` and add optional filters from query params.

- Auxein-admin override pattern exists for some modules (`spatial_areas.py:34-38`): `?scope=all` lifts the company filter iff `current_user.is_auxein_admin`. Not universal — most endpoints don't expose it.

### B.4 Auth dependency (canonical reference: `backend/api/deps.py`)

Three dependencies are available; pick by intent, not by role:

- `get_current_user` (`deps.py:105`) — returns `User`. **Rejects contractors with 403.** Use this for company-user-only endpoints.
- `get_current_contractor` (`deps.py:169`) — returns `Contractor`. Rejects company users.
- `get_current_user_or_contractor` (`deps.py:29`) — returns `Union[User, Contractor]`. Use when both should access.

Plus permission factories (`deps.py:296-345`) wrap the above and check `core/permissions.py`:
- `require_permission(module, action)` — works for User or Contractor.
- `require_company_user_permission(module, action)` — User only.

**Taste is User-only** (per spec §1: ownership is per-user, contractors and the public taste app should not collide). Use `get_current_user`. A new permissions module entry (`"taste"`) is not strictly required for v1 since the scoping happens at the row level (user owns row), but if you want admin/manager hierarchies later you'll add it then. Recommend: don't add a permissions module for v1 — keep auth as `Depends(get_current_user)` + row-level user_id check.

### B.5 Tenancy guard — the deliberate divergence

The repo has **two** tenancy patterns today:

1. **Company-scoped (the dominant pattern).** `<table>.company_id` FK + filter `<table>.company_id == user.company_id`. Used by blocks, vineyard_rows, tasks, observations, assets, calibrations, spatial_areas, risks, incidents — essentially every Grow resource.

2. **Property-scoped (added 2026-04-17).** `UserPropertyScope` join table; `property_service.get_visible_property_ids(user)` filters the company-scoped query down further when the user is restricted to specific properties. Layered on top of (1).

**Taste introduces a third pattern: user-scoped only.** No `company_id` column, no `UserPropertyScope` consideration. The guard helper becomes:

```python
def _verify_entry_access(db: Session, entry_id: int, user: User) -> TasteEntry:
    entry = db.query(TasteEntry).filter(
        TasteEntry.id == entry_id,
        TasteEntry.user_id == user.id     # ← differs from company_id == user.company_id
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    return entry
```

This is intentional and documented in spec §1. The taste tables must never join to companies for visibility; future sharing (panels, study groups) will be modelled with explicit grant tables.

### B.6 Column conventions

The codebase has drifted between two styles for new columns. The newer one (`data_platform.py`, `add_calibration_schedules.py`) is cleaner — recommend taste tables adopt it consistently:

- **Primary key:** `Column(Integer, primary_key=True, autoincrement=True)`. No UUIDs anywhere.
- **Timestamps:** `Column(DateTime(timezone=True), server_default=text('NOW()'))` for `created_at`; same with `onupdate=text('NOW()')` for `updated_at`. The older convention (`DateTime` without `timezone=True`, plus `default=func.now()` in Python) is still present in `vineyard_row.py` and is the wrong pattern — don't copy it.
- **Soft delete:** `deleted_at = Column(DateTime(timezone=True), nullable=True)` on `users` (model line 70). No `is_deleted` boolean. Most other tables hard-delete. **Taste recommendation:** soft-delete on `taste_entries` (so accidental swipes are recoverable in the iPad app); hard-delete on `grid_schemas` only if not referenced (FK from entries prevents this — see §C in `01-data-model.md`).
- **Enums:** declared as `String(20)` + `CheckConstraint("col IN (...)")`, not Postgres ENUM types. Reason in user memory: SQLAlchemy `Enum(...)` declarations on existing columns don't necessarily mean the DB column is `ENUM` — multiple cases where the column is `String`. Avoiding `ENUM` keeps Alembic upgrade/downgrade simple.
- **JSONB:** present and used elsewhere (e.g. `users.preferences = Column(JSON)`, `companies.settings`, `vineyard_rows.clonal_sections`, `spatial_areas.area_metadata`). Imported as `from sqlalchemy import JSON`. For taste, **use `JSONB` explicitly** via `from sqlalchemy.dialects.postgresql import JSONB` — gives access to GIN indexing and Postgres path operators, which we'll want for searching `grid_schemas.definition` and `tasting_entry_details.values`. The repo doesn't use JSONB elsewhere only because the existing data is small; taste will have very different access patterns.
- **Naming:** snake_case, plural table names (`users`, `companies`, `vineyard_blocks`, `asset_calibration_schedules`). Index naming: `ix_<table>_<col>`. Constraint naming: `ck_<table>_<rule>`, `uq_<table>_<cols>`. The taste proposal follows these.

### B.7 Alembic state

- Configured in `alembic/env.py` with `Base.metadata` from `db.base_class.Base`. `target_metadata` does NOT import every model — only ~12 — but autogenerate is rarely used; migrations are written by hand. Taste migration must import the new models in `env.py` for autogenerate to work, but hand-written DDL doesn't require it.
- 83 revision files in `alembic/versions/`. **Head is `add_contractor_reset_token`** (filename `add_contractor_reset_token.py`, revision id `'add_contractor_reset_token'`, downstream `down_revision = 'add_risk_spatial_fks'`, dated 2026-05-26). Confirmed no migration references it as `down_revision` (grep).
- Alembic version_num is `VARCHAR(32)` — slugs over 32 chars silently fail (this is documented in user memory as a known footgun). New taste revision ids must stay short. Proposal: `add_taste_grids` and `add_taste_entries`, both under 20 chars.
- PostGIS-aware: `env.py:53-55` excludes `spatial_ref_sys`, `geography_columns`, `geometry_columns` from autogenerate. Taste tables have no geometry — migration is plain SQL DDL.

### B.8 Migration style (canonical reference: `add_calibration_schedules.py`)

Hand-written `op.create_table` + `op.create_index` + optional `op.execute(SQL)` for seeds/backfills. Docstring includes prose explaining *why* the migration exists, prod-safety notes, and idempotency caveats. Downgrade is the inverse — drop indexes first, then table. Taste migration in `03-api-and-migration.md` follows this template exactly.

---

## C. Documented-vs-live divergence

**Cannot dump the live schema** (read-only role unavailable — see Open Question 1). Confidence in the model/migration view of the schema:

- **High** for: `users` table shape (PK type, key columns), `companies` table shape, alembic head, lack of any taste-related tables (grepped `tast` in `backend/` — only hits were `Catastrophic` strings in risk schemas). The chain of migrations from the 2025-06 baseline to 2026-05-26 head is complete and linear.
- **Medium** for: actual presence/absence of soft-deleted users vs hard-delete history. Doesn't affect taste design — we own the ownership FK direction.
- **Unknown:** whether anyone has run `add_contractor_reset_token` on the *prod* DB yet (user memory says it's still pending Pete's deploy). For the taste migration to apply cleanly on prod we just need it stacked after whatever the real head turns out to be. Phase 2 should re-confirm head against `SELECT version_num FROM alembic_version` on the target environment immediately before generating the new revision.

No documented-vs-live discrepancies found in the slices examined.

---

## D. Existing tasting artifacts

None. Greenfield. Specifically:

- No `taste` schema, table, model, schema, endpoint, or migration exists in `backend/`.
- No `auxein.tasting.v1`-shaped payload exists anywhere in the monorepo (`packages/web`, `packages/insights`, `packages/mobile`, `packages/auxein-marketing`, `packages/shared` — all grepped).
- Only string matches for "tasting" / "sommelier" / "MW" in the repo are biographical copy in the marketing site (`packages/auxein-marketing/src/app/about/page.tsx`) and unrelated `Catastrophic` risk labels.

This is good news: no cleanup required, no migration ordering risk, no UI surface to align with on the web/mobile side. The capture app lives outside this repo and is the only consumer at launch.
