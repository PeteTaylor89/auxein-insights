# 03 — API Surface, Pydantic Models & Migration Plan

What the HTTP API looks like, how the Pydantic models stack, the user-scoped guard (contrasted with the company-scoped one already in the repo), the camelCase ↔ snake_case boundary against the capture app, and the migration that Phase 2 will write (described — not generated, not run).

Naming and conventions follow `00-findings.md` §B exactly. Anything that looks unusual against the rest of the repo is called out explicitly.

---

## 1. API surface

All endpoints live under `/api/v1/taste/`. Two routers, registered in `backend/main.py` next to the other v1 routers:

```python
# main.py — new lines
from api.v1 import taste_grids, taste_entries

app.include_router(taste_grids.router,   prefix="/api/v1/taste/grids",   tags=["taste-grids"])
app.include_router(taste_entries.router, prefix="/api/v1/taste/entries", tags=["taste-entries"])
```

Splitting grids and entries into two router files mirrors how the rest of the codebase handles related-but-independent resources (e.g. `calibrations.py` + `calibration_schedules.py`).

### 1.1 Grid endpoints — `/api/v1/taste/grids`

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| `GET`    | `/`                | List grids. Query params: `key=<str>`, `is_active=<bool>` (default `true`), `is_system=<bool>`, `mine=<bool>` (filter to `user_id == current_user.id` plus all system grids). | `get_current_user` |
| `GET`    | `/{id}`            | Read one grid by id. Returns historical (inactive) versions too — needed to render old tasting notes. | `get_current_user` |
| `POST`   | `/`                | Create a user-authored grid. `is_system` is forced `false`, `user_id` is set from `current_user`. Version is forced to `1`. *Defer to Phase 2.5 unless Pete wants it at launch — see `00-findings.md` open question 4.* | `get_current_user` |
| `PATCH`  | `/{id}`            | Edit a grid. Behaviour: if `current_user.id != grid.user_id` → 404. If `grid.is_system` → 403. Otherwise creates a new row with `version = max(version) + 1` and the new `definition`; sets old row `is_active = false`; returns the **new** row. | `get_current_user` |
| `DELETE` | `/{id}`            | Soft-retire (sets `is_active = false`). Never hard-deletes. 403 on system grids. | `get_current_user` |

System grids are visible to all users but editable by none. Filtering rule for `GET /`: a user sees `(is_system = true) OR (user_id = current_user.id)`.

### 1.2 Entry endpoints — `/api/v1/taste/entries`

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| `GET`    | `/`                  | List the current user's entries. Query params: `type=tasting|flight|interaction`, `date_from=YYYY-MM-DD`, `date_to=YYYY-MM-DD`, `q=<full-text>`, `grid_key=<str>`, `include_deleted=false`. Pagination `limit` / `offset` (default 50 / 0, max 200). Default ordering `entry_date DESC, id DESC`. | `get_current_user` |
| `POST`   | `/`                  | Create. Payload discriminated by `type`. See §3 for shapes. Returns the full entry response. | `get_current_user` |
| `GET`    | `/{id}`              | Read one entry. Full payload including details/flight wines as appropriate. | `get_current_user` |
| `PATCH`  | `/{id}`              | Update. Discriminated by stored `type` — payload must match. `type` itself is immutable. `grid_schema_id` is immutable too (an entry stays bound to the grid it was captured against). Editing `values` is allowed; identity fields and notes always editable. | `get_current_user` |
| `DELETE` | `/{id}`              | Soft delete (sets `deleted_at = NOW()`). | `get_current_user` |
| `POST`   | `/{id}/reveal`       | Tasting entries only. Transitions `blind_state` `blind → revealed`, stamps `revealed_at = NOW()`. 409 if state isn't `blind`. 400 if entry isn't a tasting. | `get_current_user` |
| `POST`   | `/{id}/restore`      | Inverse of soft delete (clears `deleted_at`). Optional convenience — easy to add. | `get_current_user` |

**Every entry endpoint is user-scoped.** The list query starts `db.query(TasteEntry).filter(TasteEntry.user_id == current_user.id)`. The read/update/delete helpers join `user_id == current_user.id` and 404 on miss. No `?scope=all` admin escape hatch in v1 — see §5.

### 1.3 What's not in v1

- No bulk import endpoint (the capture app will POST one at a time when syncing from local storage).
- No search-as-you-type endpoint. Plain `?q=` substring on title/notes is enough at the data volumes involved.
- No share/grant endpoints. The whole sharing model is deliberately Phase 3+ work per spec §1.
- No analytics endpoints. Phase 2.5 territory — and they'll live under `/api/v1/taste/insights/` not on the entry router.

---

## 2. User-scoped auth guard — and the contrast with the existing company-scoped one

Spec §4.3 asks us to specify the new guard *explicitly* and *contrast* it with the existing one so the divergence is intentional and reviewable. Both forms below; the difference is one filter clause.

### 2.1 Existing pattern (company-scoped) — from `vineyard_rows.py:39-47`

```python
# DO NOT COPY for taste — shown only for contrast.
def _verify_row_access(db: Session, row_id: int, user: User) -> VineyardRow:
    row = db.query(VineyardRow).join(VineyardBlock).filter(
        VineyardRow.id == row_id,
        VineyardBlock.company_id == user.company_id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Row not found")
    return row
```

A vineyard row is visible to anyone in the company that owns its block. The guard joins to the parent (`vineyard_blocks`) because that's where `company_id` lives.

### 2.2 New pattern (user-scoped) — for taste

```python
# api/v1/taste_entries.py
def _verify_entry_access(db: Session, entry_id: int, user: User) -> TasteEntry:
    entry = db.query(TasteEntry).filter(
        TasteEntry.id == entry_id,
        TasteEntry.user_id == user.id,        # ← the divergence
        TasteEntry.deleted_at.is_(None),      # ← soft-delete-aware by default
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    return entry
```

A tasting entry is visible to *exactly one* person — its owner. There is no parent to join through; `taste_entries.user_id` is the truth. The guard is one filter, not two. Deleted entries are 404 unless the explicit `include_deleted` query param overrides (a separate variant of the helper).

### 2.3 The grid guard — slightly different

Grids are partly shared (system grids) and partly private (user grids). Read access is permissive, write access is strict:

```python
# api/v1/taste_grids.py
def _readable_grid(db: Session, grid_id: int, user: User) -> GridSchema:
    grid = db.query(GridSchema).filter(
        GridSchema.id == grid_id,
        or_(GridSchema.is_system.is_(True), GridSchema.user_id == user.id),
    ).first()
    if not grid:
        raise HTTPException(status_code=404, detail="Grid not found")
    return grid

def _writable_grid(db: Session, grid_id: int, user: User) -> GridSchema:
    grid = _readable_grid(db, grid_id, user)
    if grid.is_system:
        raise HTTPException(status_code=403, detail="System grids cannot be edited")
    if grid.user_id != user.id:
        # Shouldn't reach here given _readable_grid, but explicit > implicit.
        raise HTTPException(status_code=404, detail="Grid not found")
    return grid
```

Read returns either-or; write requires ownership of a non-system grid.

### 2.4 Why no company override for Auxein admins

The existing repo has `?scope=all` for `auxein_admin` users on some endpoints (`spatial_areas.py:34-38`). **Taste deliberately omits it.** Reasons:

- Personal tasting notes are personal — an admin scrolling another taster's MW notes is a privacy footgun we don't need.
- Compliance / introspection on the Taste platform will go through purpose-built channels (analytics aggregates, opt-in sharing), not blanket admin reads.

If Pete actually wants admin-read for operational reasons (e.g. debugging a sync issue), that's a separate dedicated endpoint with audit logging, not a parameter on the standard list endpoint.

---

## 3. Pydantic models (outlines)

Following the discovered convention (`schemas/vineyard_row.py`, `schemas/user.py`) — Base / Create / Update / Response stack, `from_attributes = True` on response models.

Naming the response class as the bare resource name (`TasteEntry`) collides with the SQLAlchemy model on import; aliasing on import is the repo norm (`from schemas.taste_entry import TasteEntry as TasteEntrySchema`).

Pydantic v2 syntax used below to match the *newer* file conventions (`field_validator`, `model_config = ConfigDict(...)`) — older v1-style is also accepted in the repo but discouraged for new code.

### 3.1 `schemas/taste_grid.py` (outline)

```python
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict, Field

class GridSchemaBase(BaseModel):
    key: str = Field(..., max_length=50, pattern=r"^[a-z][a-z0-9_]*$")
    label: str = Field(..., max_length=200)
    description: Optional[str] = None
    definition: Dict[str, Any]                  # see 02-grid-engine.md §1-§4
    is_active: bool = True

class GridSchemaCreate(GridSchemaBase):
    # is_system forced False server-side; user_id from current_user
    pass

class GridSchemaUpdate(BaseModel):
    # PATCH creates a NEW row at version+1; this model only carries the editable bits
    label: Optional[str] = None
    description: Optional[str] = None
    definition: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None

class GridSchema(GridSchemaBase):
    id: int
    version: int
    is_system: bool
    user_id: Optional[int]
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)
```

### 3.2 `schemas/taste_entry.py` (outline)

The discriminator-aware Create model is the tricky bit. Pydantic v2 supports discriminated unions natively — use them.

```python
from datetime import datetime, date
from typing import Optional, List, Dict, Any, Literal, Union
from pydantic import BaseModel, ConfigDict, Field, field_validator

# ─── Shared bits ────────────────────────────────────────────────────────────

EntryType = Literal["tasting", "flight", "interaction"]
BlindState = Literal["open", "blind", "revealed"]

class TasteEntryBase(BaseModel):
    type: EntryType
    entry_date: date
    title: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

# ─── Type-specific create payloads ──────────────────────────────────────────

class TastingDetailsCreate(BaseModel):
    grid_schema_id: int                      # OR pass grid_schema_key + version
    is_blind: bool = False                   # capture-app camelCase boundary -> see §4
    producer: Optional[str] = Field(None, max_length=200)
    wine_name: Optional[str] = Field(None, max_length=200)
    vintage: Optional[int] = Field(None, ge=1800, le=2100)
    variety: Optional[str] = Field(None, max_length=200)
    region: Optional[str] = Field(None, max_length=200)
    country: Optional[str] = Field(None, max_length=100)
    values: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("values")
    def _validate_against_grid(cls, v: dict) -> dict:
        # Looks up grid + asserts chips_single / chips_multi values are in
        # allowed_values. Required-field enforcement deferred to v1.1.
        # See 02-grid-engine.md §4.
        return v

class FlightWineCreate(BaseModel):
    position: int = Field(..., ge=1)
    label: Optional[str] = Field(None, max_length=200)
    producer: Optional[str] = None
    wine_name: Optional[str] = None
    vintage: Optional[int] = Field(None, ge=1800, le=2100)
    variety: Optional[str] = None
    region: Optional[str] = None
    country: Optional[str] = None
    notes: Optional[str] = None
    tasting_entry_id: Optional[int] = None

class TastingEntryCreate(TasteEntryBase):
    type: Literal["tasting"]
    details: TastingDetailsCreate

class FlightEntryCreate(TasteEntryBase):
    type: Literal["flight"]
    wines: List[FlightWineCreate] = Field(default_factory=list)

class InteractionEntryCreate(TasteEntryBase):
    type: Literal["interaction"]
    # who/role/organisation live in `metadata` per 01-data-model.md §2.5
    # interaction body lives in `notes` (inherited)

TasteEntryCreate = Union[
    TastingEntryCreate, FlightEntryCreate, InteractionEntryCreate,
]
# In the endpoint: Field(..., discriminator="type")

# ─── Response models ────────────────────────────────────────────────────────

class TastingDetails(BaseModel):
    grid_schema_id: int
    grid_schema_key: str
    grid_schema_version: int
    blind_state: BlindState
    revealed_at: Optional[datetime]
    producer: Optional[str]
    wine_name: Optional[str]
    vintage: Optional[int]
    variety: Optional[str]
    region: Optional[str]
    country: Optional[str]
    values: Dict[str, Any]
    model_config = ConfigDict(from_attributes=True)

class FlightWine(FlightWineCreate):
    id: int
    flight_id: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

class TasteEntry(TasteEntryBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime]

    # Populated only when relevant:
    details: Optional[TastingDetails] = None       # for type="tasting"
    wines:   Optional[List[FlightWine]] = None     # for type="flight"

    model_config = ConfigDict(from_attributes=True)

# ─── Update — partial, all optional ─────────────────────────────────────────
# (one per type, structured analogously to *Create — type & grid_schema_id
#  are immutable; blind_state is changed via POST /reveal, not PATCH.)
```

A `RevealRequest` / `RevealResponse` pair is unnecessary — the `POST /{id}/reveal` endpoint takes no body and returns the updated `TasteEntry`.

### 3.3 Important Pydantic-side rules

- **`type` is immutable.** Enforced by validating in `update_entry()` (the endpoint), not in the schema, because Pydantic can't see the persisted state.
- **`grid_schema_id` is immutable on tasting entries.** Same rule.
- **`blind_state` is not in the update model at all** — it only changes via `/reveal`. Capture-app PATCHes silently drop it.

---

## 4. Frontend payload reconciliation (the camelCase ↔ snake_case boundary)

Per spec §3.3, the capture app's `auxein.tasting.v1` export is the source-of-truth payload shape the API must accept. The capture app is not in this repo (see `00-findings.md` open question 7), so this section is built from the spec's description of the export shape. **Re-confirm against an actual sample before locking down Phase 2.**

### 4.1 Top-level entry envelope

| Capture app (camelCase) | API (snake_case) | Notes |
| --- | --- | --- |
| `id` | client-side id, server returns its own `id`. | The capture app may submit its local id; the backend ignores it and returns its own. Recommend keeping a `client_id` echoback field on the response to help the app reconcile during sync. |
| `type` | `type` | identical |
| `date` | `entry_date` | rename. `entry_date` matches the DB column. |
| `schemaId` | `details.grid_schema_id` | tasting only; lives nested under `details`. |
| `blind` | `details.is_blind` | tasting only; nested. Booleans are simple, but the rename matters. |
| identity (`producer`, `vintage`, `region`, `variety`, `wineName`) | `details.producer`, `details.vintage`, `details.region`, `details.variety`, `details.wine_name` | nested; `wineName` → `wine_name`. |
| `values` | `details.values` | nested; keys inside `values` are NOT renamed — they're owned by the grid `definition` and are already snake_case in our seed grids. |
| `wines` | `wines` | flight only; identical structure, each item gets the same camelCase→snake_case treatment (`wineName` → `wine_name`, `tastingEntryId` → `tasting_entry_id`). |

### 4.2 Two ways to handle the translation

**Option A — let Pydantic do it (recommended).**

```python
from pydantic import ConfigDict
from pydantic.alias_generators import to_camel

class TasteEntryBase(BaseModel):
    ...
    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True,        # accept BOTH camelCase and snake_case on input
    )
```

`populate_by_name=True` means the API tolerates `entryDate` *and* `entry_date` on input. Output serialises to camelCase by default, which matches the capture app. The rest of the Grow API uses snake_case responses, so this is the **first** taste-specific deviation from house style. The reason to accept it: the capture app is the only consumer at v1 and is already camelCase; making it pretend to be snake_case is busywork. When (if) a web/iPad Grow surface starts reading taste data, we add a response option (`?format=snake`) or just stop using the alias generator.

**Option B — translate at the route layer.**

Keep the Pydantic models pure snake_case (matching the rest of Grow), wrap the route handler in a translation step. More code, more places for keys to drift. Not recommended unless Pete wants strict house-style consistency across all APIs.

**Recommendation: Option A**, with an explicit comment in the schema file noting the deviation and the reason.

### 4.3 The `details.values` map keys are NOT translated

The keys inside `values` (`appearance.intensity`, `palate.acidity`, …) are owned by the grid `definition`, not by the API contract. They pass through verbatim. The seed grids already use snake_case keys for consistency.

---

## 5. Migration plan (described, not generated)

Two Alembic revisions, stacked off the current head (`add_contractor_reset_token` at time of writing — but Phase 2 must re-verify against `SELECT version_num FROM alembic_version` on the target DB immediately before generating, since other migrations may have landed).

Splitting into two revisions makes it easier to ship the grid engine standalone if entries aren't ready, and keeps each migration's `op.execute()` seed block small enough to review.

### 5.1 Revision 1 — `add_taste_grids`

```python
"""Add grid_schemas + seed system grids (MW Practical, MS Deductive, Freeform).

Introduces the JSONB-driven grid schema engine that backs the personal tasting
capture app and the future Taste platform. System grids are seeded immutable at
version 1; user-authored grids (is_system=False) are out of scope for the v1
endpoint but the column shape supports them so we can add the create endpoint
in Phase 2.5 without a schema change.

Revision ID: add_taste_grids
Revises: add_contractor_reset_token        # re-verify against live head
Create Date: 2026-MM-DD
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
import json


revision = 'add_taste_grids'
down_revision = 'add_contractor_reset_token'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'grid_schemas',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('key', sa.String(50), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('label', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('definition', JSONB(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('TRUE')),
        sa.Column('is_system', sa.Boolean(), nullable=False, server_default=sa.text('FALSE')),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.UniqueConstraint('key', 'version', name='uq_grid_schemas_key_version'),
        sa.CheckConstraint('version >= 1', name='ck_grid_schemas_version_positive'),
        sa.CheckConstraint(
            'is_system = FALSE OR user_id IS NULL',
            name='ck_grid_schemas_system_no_owner',
        ),
    )
    op.create_index('ix_grid_schemas_key', 'grid_schemas', ['key'])
    op.create_index(
        'ix_grid_schemas_user_id', 'grid_schemas', ['user_id'],
        postgresql_where=sa.text('user_id IS NOT NULL'),
    )

    # Seed system grids — load full JSON from inline literals to keep the
    # migration self-contained. (Alternative: ship the seed JSON files alongside
    # the migration and read them at upgrade time. Inline keeps the migration
    # reviewable as a single artefact, which is the repo's preference per the
    # add_calibration_schedules style.)
    op.execute(sa.text("""
        INSERT INTO grid_schemas (key, version, label, definition, is_system)
        VALUES
          ('mw_practical', 1, 'MW Practical Tasting Note', :mw, TRUE),
          ('ms_deductive', 1, 'Master Sommelier — Deductive Tasting', :ms, TRUE),
          ('freeform',     1, 'Freeform Note',             :ff, TRUE)
    """).bindparams(
        mw=json.dumps(MW_PRACTICAL_V1),
        ms=json.dumps(MS_DEDUCTIVE_V1),
        ff=json.dumps(FREEFORM_V1),
    ))


def downgrade():
    op.drop_index('ix_grid_schemas_user_id', table_name='grid_schemas')
    op.drop_index('ix_grid_schemas_key', table_name='grid_schemas')
    op.drop_table('grid_schemas')


# Seed grid definitions — the JSON from 02-grid-engine.md §5
MW_PRACTICAL_V1 = { ... }   # see 02-grid-engine.md §5.1
MS_DEDUCTIVE_V1 = { ... }   # see 02-grid-engine.md §5.2
FREEFORM_V1     = { ... }   # see 02-grid-engine.md §5.3
```

**Prod safety notes (to include in the actual migration's docstring):**

- Idempotent on a fresh DB; not idempotent if `grid_schemas` already exists from a partial run. Convention in this codebase is to not guard for partial state — alembic re-attempts cleanly after a fix.
- No backfill needed (no existing tasting data).
- No PostGIS interaction; safe on a PostGIS-enabled DB.
- Inserting JSONB seeds in one transaction with the DDL — if either fails, both roll back.

### 5.2 Revision 2 — `add_taste_entries`

```python
"""Add taste_entries + tasting_entry_details + flight_entries.

Introduces the three-type entry spine (tasting / flight / interaction) following
the hybrid model in discovery/taste-backend/01-data-model.md §1: one base table
with a type discriminator, plus a one-to-one detail table for tasting captures
and a child table for flight wines. Interaction entries fit on the base row
using `title`/`notes`/`metadata` and need no detail table.

All ownership traces to users(id). No company_id anywhere — deliberate
divergence from Grow's company-scoped tenancy (see 00-findings.md §B.5).

Revision ID: add_taste_entries
Revises: add_taste_grids
Create Date: 2026-MM-DD
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision = 'add_taste_entries'
down_revision = 'add_taste_grids'
branch_labels = None
depends_on = None


def upgrade():
    # 1. The spine.
    op.create_table(
        'taste_entries',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(),
                  sa.ForeignKey('users.id', ondelete='CASCADE'),
                  nullable=False),
        sa.Column('type', sa.String(20), nullable=False),
        sa.Column('entry_date', sa.Date(), nullable=False),
        sa.Column('title', sa.String(200), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('metadata', JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "type IN ('tasting','flight','interaction')",
            name='ck_taste_entries_type',
        ),
    )
    op.create_index('ix_taste_entries_user_id', 'taste_entries', ['user_id'])
    op.create_index('ix_taste_entries_user_date', 'taste_entries',
                    ['user_id', sa.text('entry_date DESC')])
    op.create_index('ix_taste_entries_user_type', 'taste_entries',
                    ['user_id', 'type'])
    op.create_index(
        'ix_taste_entries_active', 'taste_entries', ['user_id', 'entry_date'],
        postgresql_where=sa.text('deleted_at IS NULL'),
    )

    # 2. One-to-one detail table for tasting entries.
    op.create_table(
        'tasting_entry_details',
        sa.Column('entry_id', sa.Integer(),
                  sa.ForeignKey('taste_entries.id', ondelete='CASCADE'),
                  primary_key=True),
        sa.Column('grid_schema_id', sa.Integer(),
                  sa.ForeignKey('grid_schemas.id', ondelete='RESTRICT'),
                  nullable=False),
        sa.Column('grid_schema_key', sa.String(50), nullable=False),
        sa.Column('grid_schema_version', sa.Integer(), nullable=False),
        sa.Column('blind_state', sa.String(10), nullable=False, server_default=sa.text("'open'")),
        sa.Column('revealed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('producer', sa.String(200), nullable=True),
        sa.Column('wine_name', sa.String(200), nullable=True),
        sa.Column('vintage', sa.Integer(), nullable=True),
        sa.Column('variety', sa.String(200), nullable=True),
        sa.Column('region', sa.String(200), nullable=True),
        sa.Column('country', sa.String(100), nullable=True),
        sa.Column('values', JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.ForeignKeyConstraint(
            ['grid_schema_key', 'grid_schema_version'],
            ['grid_schemas.key', 'grid_schemas.version'],
            name='fk_tasting_entry_details_grid_version',
        ),
        sa.CheckConstraint(
            "blind_state IN ('open','blind','revealed')",
            name='ck_tasting_entry_details_blind_state',
        ),
        sa.CheckConstraint(
            "(blind_state = 'revealed') = (revealed_at IS NOT NULL)",
            name='ck_tasting_entry_details_revealed_consistency',
        ),
        sa.CheckConstraint(
            'vintage IS NULL OR vintage BETWEEN 1800 AND 2100',
            name='ck_tasting_entry_details_vintage_range',
        ),
    )
    op.create_index('ix_tasting_entry_details_grid', 'tasting_entry_details',
                    ['grid_schema_key', 'grid_schema_version'])
    op.create_index('ix_tasting_entry_details_producer', 'tasting_entry_details', ['producer'],
                    postgresql_where=sa.text('producer IS NOT NULL'))
    op.create_index('ix_tasting_entry_details_variety', 'tasting_entry_details', ['variety'],
                    postgresql_where=sa.text('variety IS NOT NULL'))
    op.create_index('ix_tasting_entry_details_vintage', 'tasting_entry_details', ['vintage'],
                    postgresql_where=sa.text('vintage IS NOT NULL'))
    op.execute("""
        CREATE INDEX ix_tasting_entry_details_values_gin
        ON tasting_entry_details
        USING GIN (values jsonb_path_ops)
    """)

    # 3. Children of flight entries.
    op.create_table(
        'flight_entries',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('flight_id', sa.Integer(),
                  sa.ForeignKey('taste_entries.id', ondelete='CASCADE'),
                  nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('label', sa.String(200), nullable=True),
        sa.Column('producer', sa.String(200), nullable=True),
        sa.Column('wine_name', sa.String(200), nullable=True),
        sa.Column('vintage', sa.Integer(), nullable=True),
        sa.Column('variety', sa.String(200), nullable=True),
        sa.Column('region', sa.String(200), nullable=True),
        sa.Column('country', sa.String(100), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('tasting_entry_id', sa.Integer(),
                  sa.ForeignKey('taste_entries.id', ondelete='SET NULL'),
                  nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.UniqueConstraint('flight_id', 'position', name='uq_flight_entries_flight_position'),
        sa.CheckConstraint('position >= 1', name='ck_flight_entries_position_positive'),
        sa.CheckConstraint(
            'vintage IS NULL OR vintage BETWEEN 1800 AND 2100',
            name='ck_flight_entries_vintage_range',
        ),
    )
    op.create_index('ix_flight_entries_flight_id', 'flight_entries', ['flight_id'])
    op.create_index('ix_flight_entries_tasting_entry_id', 'flight_entries', ['tasting_entry_id'],
                    postgresql_where=sa.text('tasting_entry_id IS NOT NULL'))


def downgrade():
    op.drop_index('ix_flight_entries_tasting_entry_id', table_name='flight_entries')
    op.drop_index('ix_flight_entries_flight_id', table_name='flight_entries')
    op.drop_table('flight_entries')

    op.execute('DROP INDEX IF EXISTS ix_tasting_entry_details_values_gin')
    op.drop_index('ix_tasting_entry_details_vintage', table_name='tasting_entry_details')
    op.drop_index('ix_tasting_entry_details_variety', table_name='tasting_entry_details')
    op.drop_index('ix_tasting_entry_details_producer', table_name='tasting_entry_details')
    op.drop_index('ix_tasting_entry_details_grid', table_name='tasting_entry_details')
    op.drop_table('tasting_entry_details')

    op.drop_index('ix_taste_entries_active', table_name='taste_entries')
    op.drop_index('ix_taste_entries_user_type', table_name='taste_entries')
    op.drop_index('ix_taste_entries_user_date', table_name='taste_entries')
    op.drop_index('ix_taste_entries_user_id', table_name='taste_entries')
    op.drop_table('taste_entries')
```

**Prod safety notes:**

- Both revisions run inside transactions; either applies completely or rolls back.
- Downgrade order respects FK direction: flight_entries → tasting_entry_details → taste_entries → grid_schemas.
- `RESTRICT` on `grid_schemas.id` means dropping a grid that has entries against it requires explicit user action — desired.
- No data backfill in either migration. Nothing exists to backfill.

### 5.3 Rollback plan

- Each revision has a complete `downgrade()` that inverts upgrade. Running `alembic downgrade -1` twice removes the entire taste domain cleanly.
- All seed rows are removed by `DROP TABLE grid_schemas`. No orphan rows in any other table reference them (taste_entries FK is also dropped first).
- The `users` table is not touched in either migration — no need for a `users` rollback.
- Code-side rollback (revert the routers in `main.py`, delete the schemas/models/api files) is independent of the DB migration. A safe deploy sequence is: deploy code with the feature flag off, run migration, flip flag on. Roll-back order is the inverse.

### 5.4 Things Phase 2 must do that Phase 1 hasn't

1. Re-confirm `alembic_version` head on the target DB right before generating the revision (per user memory: dual-row in `alembic_version` is a known gotcha).
2. Keep both revision ids short (under 32 chars — per user memory, `version_num` is `VARCHAR(32)` and over-length silently rolls back DDL). `add_taste_grids` and `add_taste_entries` are 15 and 17 chars respectively — safe.
3. Add the new models to `alembic/env.py` model imports if autogenerate is ever wanted (hand-written DDL works without this).
4. Register the two routers in `main.py` and confirm CORS allows the iPad app's origin (it'll be the dev origin during initial work; the prod origin to be confirmed when the app is registered for a domain).
5. Wire a feature flag if you want the API live before the iPad app is ready. Recommend: ship behind a simple env var (`TASTE_ENABLED=true`) checked at router-include time. The rest of the codebase doesn't use a flag framework so this stays simple.

---

## 6. End of Phase 1

These four documents are the complete Phase 1 deliverable. No source files, schemas, migrations, branches, or commits have been touched.

Recommended review path:

1. `00-findings.md` §A — answer the open questions, especially (1) read-only role, (3) single-table-vs-detail-table direction, and (7) the capture-app payload sample.
2. `01-data-model.md` — confirm the hybrid model and ownership FK directions.
3. `02-grid-engine.md` §5 — validate the seed grids against your actual MW/MS course materials. Field labels and allowed-value lists are easy to change pre-launch and frozen-by-version after.
4. `03-api-and-migration.md` §2 — confirm the user-scoped guard is the divergence you want, with no admin-read escape hatch.

Phase 2 is implementation against the approved Phase 1 spec — feature branch, models + schemas + endpoints + migration + seed, no changes to existing Grow tables.
