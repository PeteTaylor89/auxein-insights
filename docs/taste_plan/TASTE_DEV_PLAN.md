# Auxein Taste — Dev Plan (Prequel)

**Scope:** ship a personal-use tasting capture surface — Pete's MW backlog of tasting notes, flights (blind/known), and general/interaction notes — as a ringfenced module of the existing Auxein backend plus a new branded SPA at `taste.auxein.co.nz`.

**Companion docs** (these supersede them where they conflict — this plan reflects the post-scoping conversation: same EB, same DB, Postgres `taste` schema as ringfence):

- `discovery/taste-backend/00-findings.md` — codebase conventions + open questions
- `discovery/taste-backend/01-data-model.md` — table shapes (still authoritative for column lists)
- `discovery/taste-backend/02-grid-engine.md` — JSONB grid contract + seed grids (still authoritative)
- `discovery/taste-backend/03-api-and-migration.md` — endpoint surface + Pydantic outlines (still authoritative)

The deltas vs the original discovery: (1) tables live in a Postgres `taste.*` schema, not `public`; (2) user-authored grid creation deferred entirely; (3) flight-to-tasting cross-link column dropped; (4) a new frontend section is added; (5) two phases instead of one — backend ships standalone first.

---

## 1. Outcome and non-goals

**Outcome.** Pete opens `taste.auxein.co.nz` on his iPad (Safari, docked), signs in with his existing Auxein admin credentials, picks a grid (MW Practical / MS Deductive / Freeform) or a non-tasting type (Flight, Interaction Note), captures the entry, and sees it in a chronological browse list with filter/search.

**Non-goals (explicit, to keep the prequel narrow):**

- No public Taste platform shape — no sharing, no panels, no social features, no marketing site.
- No user-authored grids. The three seeds cover the launch needs; custom grids are a Phase 2.5 add-on.
- No contact CRM integration for interaction notes — names live as free-text strings in `metadata`.
- No score normalisation / cross-grid analytics. Phase 3+.
- No offline / PWA / sync engine. The iPad will be on Wi-Fi; the capture form will write straight to the API.
- No mobile-native app. The React SPA at `taste.auxein.co.nz` is the only consumer.
- No new permissions module (`core/permissions.py`). User-scoped row-level auth is the entire security model.

---

## 2. Architecture summary

```
┌────────────────────────────┐         ┌──────────────────────────────────┐
│  taste.auxein.co.nz        │         │  api.auxein.co.nz                │
│  (S3 + CloudFront SPA)     │  HTTPS  │  EB env: auxein-api-prod-lb       │
│  packages/taste            │ ──────► │  FastAPI                          │
│  React 19 + Vite           │   JWT   │  + taste_grids router             │
│  Reuses @vineyard/shared   │         │  + taste_entries router           │
│  AuthContext (Grow JWT)    │         │  /api/v1/taste/...                │
└────────────────────────────┘         └─────────────────┬────────────────┘
                                                         │
                                                         ▼
                                          ┌──────────────────────────────┐
                                          │  RDS Postgres (auxein_db)    │
                                          │                              │
                                          │  public.*  (Grow tables)     │
                                          │  taste.*   (new schema)      │
                                          │     ├─ grid_schemas          │
                                          │     ├─ taste_entries         │
                                          │     ├─ tasting_entry_details │
                                          │     └─ flight_entries        │
                                          │                              │
                                          │  FK: taste.* → public.users  │
                                          └──────────────────────────────┘
```

### Ringfence properties this delivers

- **Logical isolation at the DB layer.** Every taste table lives in the Postgres `taste` schema. `pg_dump --schema=taste` extracts the entire domain; `DROP SCHEMA taste CASCADE` removes it cleanly. The boundary is visible to anyone inspecting the DB.
- **Cross-schema FK to `public.users(id)` still works.** Postgres supports it natively — no app-level user mirroring required.
- **Same EB, same connection pool.** No new ops surface. CORS gets one new origin (`taste.auxein.co.nz`).
- **Independent alembic stack.** Migrations live in `alembic/versions/` alongside everything else but the file names are prefixed `taste_*` for sorting. A future split to `alembic_taste/` is mechanical if Taste ever leaves the building.
- **Independent router modules.** `api/v1/taste_grids.py` + `api/v1/taste_entries.py` — no cross-imports from grow modules, no shared service code. Pulling them out into a separate FastAPI app later is a `mv`.

### What the ringfence does NOT do

- Doesn't protect against connection-pool exhaustion if taste traffic spikes (same RDS instance).
- Doesn't separate backups (same nightly snapshot covers both).
- Doesn't enforce permission boundaries at the DB level (only the app layer guards `user_id == current_user.id`).

These are all acceptable for a personal prequel.

---

## 3. Phasing

Two phases, each independently shippable. **Phase 2A backend first** — the iPad can start receiving entries via curl/Postman before the SPA exists. **Phase 2B frontend** — the SPA. **Phase 2.5** is the catch-all for everything deferred (user-authored grids, sharing model, analytics).

| Phase | Branch | Output | "Done" means |
| --- | --- | --- | --- |
| **2A — Backend** | `feat/taste-backend` | Two alembic revisions, models, schemas, two routers, CORS update | `POST /api/v1/taste/entries` works in staging; OpenAPI shows the endpoints; Pete can curl-create an entry and read it back. |
| **2B — Frontend** | `feat/taste-frontend` | `packages/taste` SPA, S3 bucket + CloudFront + Route53 + ACM, deploy script | `https://taste.auxein.co.nz` serves the SPA, login works against api.auxein.co.nz, the three grids render, an entry round-trips from the iPad. |
| **2.5 — Polish & extensions** | per-feature | Custom grids, blind-reveal animations, search, CSV export, etc. | Each feature ships on its own merit. |

Phase 2A is ~1-2 days. Phase 2B is ~3-5 days depending on visual polish.

---

## 4. Phase 2A — Backend

### 4.1 Files created

```
backend/
  db/models/taste/
    __init__.py                  # re-exports for cleanliness
    grid_schema.py               # GridSchema model
    entry.py                     # TasteEntry, TastingEntryDetails, FlightEntry models
  schemas/taste/
    __init__.py
    grid.py                      # Pydantic GridSchema models
    entry.py                     # Pydantic TasteEntry models (discriminated union)
  api/v1/
    taste_grids.py               # GET/POST/PATCH/DELETE on grids
    taste_entries.py             # CRUD + /reveal on entries
  data/taste_seed_grids.py       # MW_PRACTICAL_V1, MS_DEDUCTIVE_V1, FREEFORM_V1 dicts

alembic/versions/
  taste_001_init_schema.py       # CREATE SCHEMA taste; grid_schemas table + seed
  taste_002_entries.py           # taste_entries + tasting_entry_details + flight_entries
```

**Why nested folders** (`models/taste/`, `schemas/taste/`): the rest of the backend is flat (`models/user.py`, `models/block.py`, …). Nesting is a deliberate ringfence signal — anyone reading the backend sees taste as a self-contained module. The cost is two extra `__init__.py` files and the import path `from db.models.taste.entry import TasteEntry`.

### 4.2 Files modified

- `backend/main.py` — two `app.include_router(...)` calls, one new origin in `allowed_origins`.
- `alembic/env.py` — three new model imports so autogenerate works (hand-written migrations don't strictly need this, but it's the existing convention for every other model).

That's the entire backend change surface. **Zero modifications to existing tables, models, schemas, or endpoints.**

### 4.3 DB models — Python

Full code, ready to drop in.

#### `backend/db/models/taste/__init__.py`

```python
from .grid_schema import GridSchema
from .entry import TasteEntry, TastingEntryDetails, FlightEntry

__all__ = ['GridSchema', 'TasteEntry', 'TastingEntryDetails', 'FlightEntry']
```

#### `backend/db/models/taste/grid_schema.py`

```python
"""Grid schema engine — versioned JSONB grid definitions.

Lives in Postgres schema `taste`. See discovery/taste-backend/02-grid-engine.md
for the JSONB contract and the three seeded system grids.
"""
from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime, ForeignKey,
    UniqueConstraint, CheckConstraint, Index, text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from db.base_class import Base


class GridSchema(Base):
    __tablename__ = 'grid_schemas'
    __table_args__ = (
        UniqueConstraint('key', 'version', name='uq_grid_schemas_key_version'),
        CheckConstraint('version >= 1', name='ck_grid_schemas_version_positive'),
        CheckConstraint(
            'is_system = FALSE OR user_id IS NULL',
            name='ck_grid_schemas_system_no_owner',
        ),
        Index('ix_grid_schemas_key', 'key'),
        Index('ix_grid_schemas_user_id', 'user_id',
              postgresql_where=text('user_id IS NOT NULL')),
        {'schema': 'taste'},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(50), nullable=False)
    version = Column(Integer, nullable=False)
    label = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    definition = Column(JSONB, nullable=False)
    is_active = Column(Boolean, nullable=False, server_default=text('TRUE'))
    is_system = Column(Boolean, nullable=False, server_default=text('FALSE'))
    user_id = Column(
        Integer,
        ForeignKey('public.users.id', ondelete='SET NULL'),
        nullable=True,
    )
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text('NOW()'))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text('NOW()'),
                        onupdate=text('NOW()'))

    def __repr__(self):
        return f"<GridSchema(key='{self.key}', version={self.version})>"
```

#### `backend/db/models/taste/entry.py`

```python
"""Tasting/flight/interaction entries. Lives in Postgres schema `taste`."""
from sqlalchemy import (
    Column, Integer, String, Text, Date, DateTime, ForeignKey,
    UniqueConstraint, CheckConstraint, Index, ForeignKeyConstraint, text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from db.base_class import Base


class TasteEntry(Base):
    __tablename__ = 'taste_entries'
    __table_args__ = (
        CheckConstraint(
            "type IN ('tasting','flight','interaction')",
            name='ck_taste_entries_type',
        ),
        Index('ix_taste_entries_user_id', 'user_id'),
        Index('ix_taste_entries_user_date', 'user_id', text('entry_date DESC')),
        Index('ix_taste_entries_user_type', 'user_id', 'type'),
        Index('ix_taste_entries_active', 'user_id', 'entry_date',
              postgresql_where=text('deleted_at IS NULL')),
        {'schema': 'taste'},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        Integer,
        ForeignKey('public.users.id', ondelete='CASCADE'),
        nullable=False,
    )
    type = Column(String(20), nullable=False)
    entry_date = Column(Date, nullable=False)
    title = Column(String(200), nullable=True)
    notes = Column(Text, nullable=True)
    metadata_ = Column('metadata', JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text('NOW()'))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text('NOW()'),
                        onupdate=text('NOW()'))
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    # `metadata` is a reserved attribute on SQLAlchemy Base — store under metadata_
    # and use `Column('metadata', ...)` so the DB column name is still `metadata`.

    details = relationship(
        'TastingEntryDetails',
        back_populates='entry',
        uselist=False,
        cascade='all, delete-orphan',
    )
    wines = relationship(
        'FlightEntry',
        back_populates='flight',
        cascade='all, delete-orphan',
        order_by='FlightEntry.position',
    )


class TastingEntryDetails(Base):
    __tablename__ = 'tasting_entry_details'
    __table_args__ = (
        ForeignKeyConstraint(
            ['grid_schema_key', 'grid_schema_version'],
            ['taste.grid_schemas.key', 'taste.grid_schemas.version'],
            name='fk_tasting_entry_details_grid_version',
        ),
        CheckConstraint(
            "blind_state IN ('open','blind','revealed')",
            name='ck_tasting_entry_details_blind_state',
        ),
        CheckConstraint(
            "(blind_state = 'revealed') = (revealed_at IS NOT NULL)",
            name='ck_tasting_entry_details_revealed_consistency',
        ),
        CheckConstraint(
            'vintage IS NULL OR vintage BETWEEN 1800 AND 2100',
            name='ck_tasting_entry_details_vintage_range',
        ),
        Index('ix_tasting_entry_details_grid', 'grid_schema_key', 'grid_schema_version'),
        Index('ix_tasting_entry_details_producer', 'producer',
              postgresql_where=text('producer IS NOT NULL')),
        Index('ix_tasting_entry_details_variety', 'variety',
              postgresql_where=text('variety IS NOT NULL')),
        Index('ix_tasting_entry_details_vintage', 'vintage',
              postgresql_where=text('vintage IS NOT NULL')),
        {'schema': 'taste'},
    )

    entry_id = Column(
        Integer,
        ForeignKey('taste.taste_entries.id', ondelete='CASCADE'),
        primary_key=True,
    )
    grid_schema_id = Column(
        Integer,
        ForeignKey('taste.grid_schemas.id', ondelete='RESTRICT'),
        nullable=False,
    )
    grid_schema_key = Column(String(50), nullable=False)
    grid_schema_version = Column(Integer, nullable=False)
    blind_state = Column(String(10), nullable=False, server_default=text("'open'"))
    revealed_at = Column(DateTime(timezone=True), nullable=True)
    producer = Column(String(200), nullable=True)
    wine_name = Column(String(200), nullable=True)
    vintage = Column(Integer, nullable=True)
    variety = Column(String(200), nullable=True)
    region = Column(String(200), nullable=True)
    country = Column(String(100), nullable=True)
    values = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text('NOW()'))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text('NOW()'),
                        onupdate=text('NOW()'))

    entry = relationship('TasteEntry', back_populates='details')
    grid = relationship('GridSchema')


class FlightEntry(Base):
    __tablename__ = 'flight_entries'
    __table_args__ = (
        UniqueConstraint('flight_id', 'position', name='uq_flight_entries_flight_position'),
        CheckConstraint('position >= 1', name='ck_flight_entries_position_positive'),
        CheckConstraint(
            'vintage IS NULL OR vintage BETWEEN 1800 AND 2100',
            name='ck_flight_entries_vintage_range',
        ),
        Index('ix_flight_entries_flight_id', 'flight_id'),
        {'schema': 'taste'},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    flight_id = Column(
        Integer,
        ForeignKey('taste.taste_entries.id', ondelete='CASCADE'),
        nullable=False,
    )
    position = Column(Integer, nullable=False)
    label = Column(String(200), nullable=True)
    producer = Column(String(200), nullable=True)
    wine_name = Column(String(200), nullable=True)
    vintage = Column(Integer, nullable=True)
    variety = Column(String(200), nullable=True)
    region = Column(String(200), nullable=True)
    country = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text('NOW()'))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text('NOW()'),
                        onupdate=text('NOW()'))

    flight = relationship('TasteEntry', back_populates='wines')
```

Notes for the implementer:

- `metadata_` Python attr / `metadata` DB column — SQLAlchemy reserves `Base.metadata` for the registry. Standard workaround used here.
- `tasting_entry_id` from the original spec is deleted — flights and tasting notes are independent in this prequel.
- All FKs and table references are fully qualified with `taste.` or `public.` to keep the schema boundary explicit in the code.

### 4.4 Pydantic schemas

#### `backend/schemas/taste/grid.py`

```python
from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class GridSchemaBase(BaseModel):
    key: str = Field(..., max_length=50, pattern=r"^[a-z][a-z0-9_]*$")
    label: str = Field(..., max_length=200)
    description: Optional[str] = None
    definition: Dict[str, Any]
    is_active: bool = True


class GridSchemaResponse(GridSchemaBase):
    id: int
    version: int
    is_system: bool
    user_id: Optional[int]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True,
    )
```

`GridSchemaCreate` / `GridSchemaUpdate` are deferred — the v1 endpoint is read-only for grids. The seeded three are enough.

#### `backend/schemas/taste/entry.py`

```python
from datetime import datetime, date
from typing import Optional, List, Dict, Any, Literal, Union
from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel


EntryType = Literal['tasting', 'flight', 'interaction']
BlindState = Literal['open', 'blind', 'revealed']


# ─── Camel-aware base ────────────────────────────────────────────────────────

class _CamelModel(BaseModel):
    """Base for taste schemas. Serialises to camelCase to match the SPA's
    in-memory shape. populate_by_name=True so snake_case input still works
    (curl-friendly during dev).
    """
    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True,
    )


# ─── Shared base for all three entry types ───────────────────────────────────

class TasteEntryBase(_CamelModel):
    type: EntryType
    entry_date: date
    title: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


# ─── Type-specific create payloads ───────────────────────────────────────────

class TastingDetailsCreate(_CamelModel):
    grid_schema_id: int
    is_blind: bool = False
    producer: Optional[str] = Field(None, max_length=200)
    wine_name: Optional[str] = Field(None, max_length=200)
    vintage: Optional[int] = Field(None, ge=1800, le=2100)
    variety: Optional[str] = Field(None, max_length=200)
    region: Optional[str] = Field(None, max_length=200)
    country: Optional[str] = Field(None, max_length=100)
    values: Dict[str, Any] = Field(default_factory=dict)


class FlightWineCreate(_CamelModel):
    position: int = Field(..., ge=1)
    label: Optional[str] = Field(None, max_length=200)
    producer: Optional[str] = None
    wine_name: Optional[str] = None
    vintage: Optional[int] = Field(None, ge=1800, le=2100)
    variety: Optional[str] = None
    region: Optional[str] = None
    country: Optional[str] = None
    notes: Optional[str] = None


class TastingEntryCreate(TasteEntryBase):
    type: Literal['tasting']
    details: TastingDetailsCreate


class FlightEntryCreate(TasteEntryBase):
    type: Literal['flight']
    wines: List[FlightWineCreate] = Field(default_factory=list)


class InteractionEntryCreate(TasteEntryBase):
    type: Literal['interaction']
    # who/role/organisation live in `metadata`; body in `notes`


TasteEntryCreate = Union[
    TastingEntryCreate, FlightEntryCreate, InteractionEntryCreate,
]


# ─── Update payloads (partial; type & grid immutable) ────────────────────────

class TastingDetailsUpdate(_CamelModel):
    producer: Optional[str] = None
    wine_name: Optional[str] = None
    vintage: Optional[int] = Field(None, ge=1800, le=2100)
    variety: Optional[str] = None
    region: Optional[str] = None
    country: Optional[str] = None
    values: Optional[Dict[str, Any]] = None


class TasteEntryUpdate(_CamelModel):
    entry_date: Optional[date] = None
    title: Optional[str] = None
    notes: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    details: Optional[TastingDetailsUpdate] = None
    wines: Optional[List[FlightWineCreate]] = None       # replaces wines list


# ─── Response models ─────────────────────────────────────────────────────────

class TastingDetailsResponse(_CamelModel):
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


class FlightWineResponse(_CamelModel):
    id: int
    flight_id: int
    position: int
    label: Optional[str]
    producer: Optional[str]
    wine_name: Optional[str]
    vintage: Optional[int]
    variety: Optional[str]
    region: Optional[str]
    country: Optional[str]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime


class TasteEntryResponse(TasteEntryBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime]
    details: Optional[TastingDetailsResponse] = None
    wines: Optional[List[FlightWineResponse]] = None
```

### 4.5 Endpoints

#### `backend/api/v1/taste_grids.py` (skeleton)

```python
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from db.session import get_db
from api.deps import get_current_user
from db.models.user import User
from db.models.taste import GridSchema
from schemas.taste.grid import GridSchemaResponse

router = APIRouter()


@router.get('/', response_model=List[GridSchemaResponse])
def list_grids(
    is_active: bool = Query(True),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List grids visible to the current user (system grids + own custom grids).
    v1 only ships system grids — but the user_id OR clause is wired so adding
    custom-grid creation later requires zero endpoint changes.
    """
    from sqlalchemy import or_
    q = db.query(GridSchema).filter(
        or_(GridSchema.is_system.is_(True), GridSchema.user_id == user.id),
    )
    if is_active:
        q = q.filter(GridSchema.is_active.is_(True))
    return q.order_by(GridSchema.key, GridSchema.version.desc()).all()


@router.get('/{grid_id}', response_model=GridSchemaResponse)
def get_grid(
    grid_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from sqlalchemy import or_
    grid = db.query(GridSchema).filter(
        GridSchema.id == grid_id,
        or_(GridSchema.is_system.is_(True), GridSchema.user_id == user.id),
    ).first()
    if not grid:
        raise HTTPException(status_code=404, detail='Grid not found')
    return grid
```

That's all of `taste_grids.py` for v1. Create/patch/delete are explicitly Phase 2.5.

#### `backend/api/v1/taste_entries.py` (skeleton)

```python
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session, selectinload

from db.session import get_db
from api.deps import get_current_user
from db.models.user import User
from db.models.taste import TasteEntry, TastingEntryDetails, FlightEntry, GridSchema
from schemas.taste.entry import (
    TasteEntryCreate, TasteEntryUpdate, TasteEntryResponse,
)

router = APIRouter()


def _verify_entry_access(
    db: Session, entry_id: int, user: User, *, include_deleted: bool = False,
) -> TasteEntry:
    q = db.query(TasteEntry).filter(
        TasteEntry.id == entry_id,
        TasteEntry.user_id == user.id,
    )
    if not include_deleted:
        q = q.filter(TasteEntry.deleted_at.is_(None))
    entry = q.first()
    if not entry:
        raise HTTPException(status_code=404, detail='Entry not found')
    return entry


@router.get('/', response_model=List[TasteEntryResponse])
def list_entries(
    type: Optional[str] = Query(None, pattern='^(tasting|flight|interaction)$'),
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    q: Optional[str] = Query(None, description='Substring search on title + notes'),
    grid_key: Optional[str] = None,
    include_deleted: bool = False,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = db.query(TasteEntry).filter(TasteEntry.user_id == user.id)
    if not include_deleted:
        query = query.filter(TasteEntry.deleted_at.is_(None))
    if type:
        query = query.filter(TasteEntry.type == type)
    if date_from:
        query = query.filter(TasteEntry.entry_date >= date_from)
    if date_to:
        query = query.filter(TasteEntry.entry_date <= date_to)
    if q:
        pattern = f'%{q}%'
        query = query.filter(or_(
            TasteEntry.title.ilike(pattern),
            TasteEntry.notes.ilike(pattern),
        ))
    if grid_key:
        query = query.join(TastingEntryDetails).filter(
            TastingEntryDetails.grid_schema_key == grid_key,
        )

    query = query.options(
        selectinload(TasteEntry.details),
        selectinload(TasteEntry.wines),
    ).order_by(TasteEntry.entry_date.desc(), TasteEntry.id.desc())

    return query.offset(offset).limit(limit).all()


@router.get('/{entry_id}', response_model=TasteEntryResponse)
def get_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return _verify_entry_access(db, entry_id, user)


@router.post('/', response_model=TasteEntryResponse, status_code=201)
def create_entry(
    payload: TasteEntryCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    entry = TasteEntry(
        user_id=user.id,
        type=payload.type,
        entry_date=payload.entry_date,
        title=payload.title,
        notes=payload.notes,
        metadata_=payload.metadata,
    )
    db.add(entry)
    db.flush()                                              # assigns entry.id

    if payload.type == 'tasting':
        grid = db.query(GridSchema).filter(
            GridSchema.id == payload.details.grid_schema_id,
        ).first()
        if not grid:
            raise HTTPException(status_code=400, detail='Unknown grid_schema_id')
        details = TastingEntryDetails(
            entry_id=entry.id,
            grid_schema_id=grid.id,
            grid_schema_key=grid.key,                       # denormalised, pinned
            grid_schema_version=grid.version,
            blind_state='blind' if payload.details.is_blind else 'open',
            producer=payload.details.producer,
            wine_name=payload.details.wine_name,
            vintage=payload.details.vintage,
            variety=payload.details.variety,
            region=payload.details.region,
            country=payload.details.country,
            values=payload.details.values,
        )
        db.add(details)

    elif payload.type == 'flight':
        for wine in payload.wines:
            db.add(FlightEntry(flight_id=entry.id, **wine.model_dump()))

    db.commit()
    db.refresh(entry)
    return entry


@router.patch('/{entry_id}', response_model=TasteEntryResponse)
def update_entry(
    entry_id: int,
    payload: TasteEntryUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    entry = _verify_entry_access(db, entry_id, user)

    for field in ('entry_date', 'title', 'notes'):
        v = getattr(payload, field, None)
        if v is not None:
            setattr(entry, field, v)
    if payload.metadata is not None:
        entry.metadata_ = payload.metadata

    if payload.details and entry.type == 'tasting' and entry.details:
        for field in ('producer', 'wine_name', 'vintage', 'variety',
                      'region', 'country', 'values'):
            v = getattr(payload.details, field, None)
            if v is not None:
                setattr(entry.details, field, v)

    if payload.wines is not None and entry.type == 'flight':
        # Replace-wines semantics — simpler than diff in v1.
        for w in list(entry.wines):
            db.delete(w)
        db.flush()
        for w in payload.wines:
            db.add(FlightEntry(flight_id=entry.id, **w.model_dump()))

    db.commit()
    db.refresh(entry)
    return entry


@router.delete('/{entry_id}', status_code=204)
def delete_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    entry = _verify_entry_access(db, entry_id, user)
    entry.deleted_at = datetime.now(timezone.utc)
    db.commit()


@router.post('/{entry_id}/reveal', response_model=TasteEntryResponse)
def reveal_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    entry = _verify_entry_access(db, entry_id, user)
    if entry.type != 'tasting' or not entry.details:
        raise HTTPException(status_code=400, detail='Only tasting entries can be revealed')
    if entry.details.blind_state != 'blind':
        raise HTTPException(status_code=409, detail='Entry is not in blind state')
    entry.details.blind_state = 'revealed'
    entry.details.revealed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(entry)
    return entry
```

### 4.6 `main.py` changes — the exact diff

```diff
- from api.v1 import auth, blocks, observations, companies, admin, invitations, ..., feedback
+ from api.v1 import auth, blocks, observations, companies, admin, invitations, ..., feedback, taste_grids, taste_entries

  allowed_origins = [
      "https://www.auxein.co.nz",
      "https://auxein.co.nz",
      "https://app.auxein.co.nz",
      "https://grow.auxein.co.nz",
      "https://insights.auxein.co.nz",
+     "https://taste.auxein.co.nz",
      "http://localhost",
      "http://localhost:3000",
      "http://localhost:5173",
      "http://localhost:5174",
+     "http://localhost:5175",
  ]

  # … existing routers …

+ app.include_router(
+     taste_grids.router,
+     prefix="/api/v1/taste/grids",
+     tags=["taste-grids"],
+ )
+ app.include_router(
+     taste_entries.router,
+     prefix="/api/v1/taste/entries",
+     tags=["taste-entries"],
+ )
```

Port 5175 reserved for the taste SPA in local dev (5173=web, 5174=insights).

### 4.7 Alembic migrations

#### `alembic/versions/taste_001_init_schema.py`

```python
"""Create Postgres schema `taste` + grid_schemas table + seed three system grids.

First of two stacked migrations for the taste prequel. Lives in the same
alembic timeline as the rest of the backend — the `taste_` filename prefix
keeps it visually grouped. Revision id intentionally short (under 32 chars).

Revision ID: taste_001_init
Revises: add_contractor_reset_token        # re-verify against live head
Create Date: 2026-MM-DD
"""
import json
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# IMPORTANT: this import is what makes the seed inserts deterministic. The
# seed dicts live in backend code, NOT inline here, so the migration and the
# runtime API agree on grid content.
from data.taste_seed_grids import MW_PRACTICAL_V1, MS_DEDUCTIVE_V1, FREEFORM_V1


revision = 'taste_001_init'
down_revision = 'add_contractor_reset_token'
branch_labels = None
depends_on = None


def upgrade():
    op.execute('CREATE SCHEMA IF NOT EXISTS taste')

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
        sa.Column('user_id', sa.Integer(),
                  sa.ForeignKey('public.users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('NOW()')),
        sa.UniqueConstraint('key', 'version', name='uq_grid_schemas_key_version'),
        sa.CheckConstraint('version >= 1', name='ck_grid_schemas_version_positive'),
        sa.CheckConstraint('is_system = FALSE OR user_id IS NULL',
                           name='ck_grid_schemas_system_no_owner'),
        schema='taste',
    )
    op.create_index('ix_grid_schemas_key', 'grid_schemas', ['key'], schema='taste')
    op.create_index(
        'ix_grid_schemas_user_id', 'grid_schemas', ['user_id'],
        postgresql_where=sa.text('user_id IS NOT NULL'),
        schema='taste',
    )

    op.execute(sa.text("""
        INSERT INTO taste.grid_schemas (key, version, label, definition, is_system)
        VALUES
          ('mw_practical', 1, 'MW Practical Tasting Note', CAST(:mw AS JSONB), TRUE),
          ('ms_deductive', 1, 'Master Sommelier — Deductive Tasting', CAST(:ms AS JSONB), TRUE),
          ('freeform',     1, 'Freeform Note',             CAST(:ff AS JSONB), TRUE)
    """).bindparams(
        mw=json.dumps(MW_PRACTICAL_V1),
        ms=json.dumps(MS_DEDUCTIVE_V1),
        ff=json.dumps(FREEFORM_V1),
    ))


def downgrade():
    op.drop_index('ix_grid_schemas_user_id', table_name='grid_schemas', schema='taste')
    op.drop_index('ix_grid_schemas_key', table_name='grid_schemas', schema='taste')
    op.drop_table('grid_schemas', schema='taste')
    op.execute('DROP SCHEMA IF EXISTS taste CASCADE')
```

#### `alembic/versions/taste_002_entries.py`

```python
"""Add taste.taste_entries, taste.tasting_entry_details, taste.flight_entries.

Revision ID: taste_002_entries
Revises: taste_001_init
Create Date: 2026-MM-DD
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision = 'taste_002_entries'
down_revision = 'taste_001_init'
branch_labels = None
depends_on = None


def upgrade():
    # — taste_entries —
    op.create_table(
        'taste_entries',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(),
                  sa.ForeignKey('public.users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('type', sa.String(20), nullable=False),
        sa.Column('entry_date', sa.Date(), nullable=False),
        sa.Column('title', sa.String(200), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('metadata', JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('NOW()')),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("type IN ('tasting','flight','interaction')",
                           name='ck_taste_entries_type'),
        schema='taste',
    )
    op.create_index('ix_taste_entries_user_id', 'taste_entries', ['user_id'], schema='taste')
    op.create_index('ix_taste_entries_user_date', 'taste_entries',
                    ['user_id', sa.text('entry_date DESC')], schema='taste')
    op.create_index('ix_taste_entries_user_type', 'taste_entries',
                    ['user_id', 'type'], schema='taste')
    op.create_index(
        'ix_taste_entries_active', 'taste_entries',
        ['user_id', 'entry_date'],
        postgresql_where=sa.text('deleted_at IS NULL'),
        schema='taste',
    )

    # — tasting_entry_details —
    op.create_table(
        'tasting_entry_details',
        sa.Column('entry_id', sa.Integer(),
                  sa.ForeignKey('taste.taste_entries.id', ondelete='CASCADE'),
                  primary_key=True),
        sa.Column('grid_schema_id', sa.Integer(),
                  sa.ForeignKey('taste.grid_schemas.id', ondelete='RESTRICT'),
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
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('NOW()')),
        sa.ForeignKeyConstraint(
            ['grid_schema_key', 'grid_schema_version'],
            ['taste.grid_schemas.key', 'taste.grid_schemas.version'],
            name='fk_tasting_entry_details_grid_version',
        ),
        sa.CheckConstraint("blind_state IN ('open','blind','revealed')",
                           name='ck_tasting_entry_details_blind_state'),
        sa.CheckConstraint("(blind_state = 'revealed') = (revealed_at IS NOT NULL)",
                           name='ck_tasting_entry_details_revealed_consistency'),
        sa.CheckConstraint('vintage IS NULL OR vintage BETWEEN 1800 AND 2100',
                           name='ck_tasting_entry_details_vintage_range'),
        schema='taste',
    )
    op.create_index('ix_tasting_entry_details_grid', 'tasting_entry_details',
                    ['grid_schema_key', 'grid_schema_version'], schema='taste')
    op.create_index('ix_tasting_entry_details_producer', 'tasting_entry_details', ['producer'],
                    postgresql_where=sa.text('producer IS NOT NULL'), schema='taste')
    op.create_index('ix_tasting_entry_details_variety', 'tasting_entry_details', ['variety'],
                    postgresql_where=sa.text('variety IS NOT NULL'), schema='taste')
    op.create_index('ix_tasting_entry_details_vintage', 'tasting_entry_details', ['vintage'],
                    postgresql_where=sa.text('vintage IS NOT NULL'), schema='taste')
    op.execute("""
        CREATE INDEX ix_tasting_entry_details_values_gin
        ON taste.tasting_entry_details
        USING GIN (values jsonb_path_ops)
    """)

    # — flight_entries —
    op.create_table(
        'flight_entries',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('flight_id', sa.Integer(),
                  sa.ForeignKey('taste.taste_entries.id', ondelete='CASCADE'),
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
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('NOW()')),
        sa.UniqueConstraint('flight_id', 'position', name='uq_flight_entries_flight_position'),
        sa.CheckConstraint('position >= 1', name='ck_flight_entries_position_positive'),
        sa.CheckConstraint('vintage IS NULL OR vintage BETWEEN 1800 AND 2100',
                           name='ck_flight_entries_vintage_range'),
        schema='taste',
    )
    op.create_index('ix_flight_entries_flight_id', 'flight_entries', ['flight_id'], schema='taste')


def downgrade():
    op.drop_index('ix_flight_entries_flight_id', table_name='flight_entries', schema='taste')
    op.drop_table('flight_entries', schema='taste')

    op.execute('DROP INDEX IF EXISTS taste.ix_tasting_entry_details_values_gin')
    op.drop_index('ix_tasting_entry_details_vintage', table_name='tasting_entry_details', schema='taste')
    op.drop_index('ix_tasting_entry_details_variety', table_name='tasting_entry_details', schema='taste')
    op.drop_index('ix_tasting_entry_details_producer', table_name='tasting_entry_details', schema='taste')
    op.drop_index('ix_tasting_entry_details_grid', table_name='tasting_entry_details', schema='taste')
    op.drop_table('tasting_entry_details', schema='taste')

    op.drop_index('ix_taste_entries_active', table_name='taste_entries', schema='taste')
    op.drop_index('ix_taste_entries_user_type', table_name='taste_entries', schema='taste')
    op.drop_index('ix_taste_entries_user_date', table_name='taste_entries', schema='taste')
    op.drop_index('ix_taste_entries_user_id', table_name='taste_entries', schema='taste')
    op.drop_table('taste_entries', schema='taste')
```

### 4.8 `env.py` model imports

```python
# alembic/env.py — add to the existing imports
from db.models.taste.grid_schema import GridSchema
from db.models.taste.entry import TasteEntry, TastingEntryDetails, FlightEntry
```

### 4.9 Seed grids — `backend/data/taste_seed_grids.py`

Three Python dicts: `MW_PRACTICAL_V1`, `MS_DEDUCTIVE_V1`, `FREEFORM_V1`. Content is verbatim the JSON in `discovery/taste-backend/02-grid-engine.md` §5, just written as Python literals. The migration imports them; the runtime code never reads them after seeding (the DB row is the source of truth from then on).

### 4.10 Backend testing checklist

- `alembic upgrade head` runs cleanly on a fresh DB.
- `alembic downgrade -2` cleanly removes the taste schema.
- `python -c "from db.models.taste import TasteEntry; print(TasteEntry.__table__)"` resolves without errors.
- `curl -H "Authorization: Bearer <token>" https://localhost:8000/api/v1/taste/grids` returns three rows.
- `curl -X POST .../api/v1/taste/entries -d <tasting JSON>` round-trips correctly.
- `curl -X POST .../api/v1/taste/entries/1/reveal` transitions blind_state.
- `/docs` (in dev) shows `taste-grids` and `taste-entries` tags with the right operations under bearerAuth.
- A second user's `GET /entries` returns empty (cross-user isolation works).

---

## 5. Phase 2B — Frontend (`taste.auxein.co.nz`)

### 5.1 Package layout

```
packages/taste/
  index.html
  package.json
  vite.config.js
  public/
    favicon.ico
    logo-mark.png            (copy from packages/insights/public)
  src/
    main.jsx
    App.jsx
    index.css                 (imports shared theme tokens)
    services/
      tasteApi.js              (axios client, JWT interceptor)
      gridsService.js
      entriesService.js
    contexts/
      (none new — reuses @vineyard/shared AuthContext)
    pages/
      Landing.jsx              (logged-out hero + sign-in)
      Browse.jsx               (chronological list + filters)
      EntryDetail.jsx          (view single entry)
      NewEntry.jsx             (type picker + grid picker → form)
      CaptureTasting.jsx       (grid-driven form)
      CaptureFlight.jsx        (wines editor)
      CaptureInteraction.jsx   (subject + body form)
    components/
      Header.jsx               (Auxein brand + nav + user menu)
      Footer.jsx               (Auxein brand mark + copyright)
      GridRenderer.jsx         (the engine — sees definition, renders fields)
      fields/
        ChipsSingle.jsx
        ChipsMulti.jsx
        TextShort.jsx
        TextLong.jsx
        NumberInput.jsx
        YearInput.jsx
        BooleanToggle.jsx
      EntryCard.jsx            (list-row preview)
      EntryFilterBar.jsx       (type / date / search controls)
      BlindToggle.jsx          (blind/known switch on tasting form)
      RevealButton.jsx         (on detail view, blind entries only)
      FlightWineRow.jsx        (one wine in the flight editor)
      EmptyState.jsx
    utils/
      gridValidation.js        (mirrors backend rules — chips_single value in allowed_values, etc.)
      formatters.js            (date/score formatting)
    styles/
      theme.css                (re-exports vars from packages/web/src/styles/theme.css)
      pages.css
```

### 5.2 Tech stack — match the existing SPAs exactly

- **React 19, Vite 6, react-router-dom 7** — same versions as `packages/insights`.
- **`@vineyard/shared` workspace dependency** — for `AuthContext`, `authService`, `apiClient` (axios with JWT interceptor).
- **`lucide-react`** for icons (already in insights + web).
- **`dayjs`** for dates (already in insights).
- **No state library.** React context + local state is enough — there's no cross-page state to manage beyond auth.
- **No TypeScript.** The rest of the monorepo is JSX. Don't break the pattern for one new package.

`package.json`:

```json
{
  "name": "@vineyard/taste",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "cross-env VITE_CLIENT_TYPE=taste vite",
    "build": "cross-env VITE_CLIENT_TYPE=taste vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  },
  "dependencies": {
    "@vineyard/shared": "file:../shared",
    "axios": "^1.9.0",
    "dayjs": "^1.11.18",
    "lucide-react": "^0.510.0",
    "react": "19.1.0",
    "react-dom": "19.1.0",
    "react-router-dom": "^7.6.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.4.1",
    "cross-env": "^7.0.3",
    "eslint": "^9.25.0",
    "vite": "^6.3.5"
  }
}
```

`vite.config.js` mirrors insights, except port `5175` and an env-driven `VITE_API_URL` (defaults to `http://localhost:8000` in dev, `https://api.auxein.co.nz` in built bundles via `.env.production`).

### 5.3 Auth — reuse Grow's JWT

**Decision: the taste SPA uses the Grow AuthContext from `@vineyard/shared`, not the insights `PublicAuthContext`.** Reasons:

1. Taste is gated to *real* Auxein company users (Pete and whoever else gets explicit access). Public registration doesn't apply.
2. Pete already has a Grow login. Forcing a separate registration would be a fresh tenancy of one.
3. Reusing the Grow JWT means `get_current_user` on the backend works unchanged.

Login flow on the SPA:

1. Visit `taste.auxein.co.nz` → if no JWT → redirect to a sign-in screen.
2. Sign-in posts to `https://api.auxein.co.nz/api/auth/login` (the existing Grow auth endpoint).
3. JWT is stored in `localStorage` under `accessToken` (the convention `authService` already uses).
4. Subsequent API calls send `Authorization: Bearer <jwt>` automatically via the axios interceptor in `@vineyard/shared/api`.

The sign-in screen on taste does NOT support "forgot password" or "register" — those flows live on `grow.auxein.co.nz`. The taste login page links out: "Forgot password? Reset on Grow →".

### 5.4 Routes

```
/                       Landing (logged-out hero) OR Browse (logged-in default)
/sign-in                Sign-in screen
/new                    Type picker (Tasting / Flight / Interaction)
/new/tasting            Grid picker → /new/tasting/:gridKey
/new/tasting/:gridKey   The capture form for that grid
/new/flight             Flight editor
/new/interaction        Interaction form
/entries                Browse list (default landing for logged-in)
/entries/:id            Entry detail view
/entries/:id/edit       Entry editor (same form as /new but pre-filled)
```

No admin routes — Pete is the only user, and admin operations live on Grow.

### 5.5 Corporate style — concrete patterns to reuse

Pull tokens from `packages/web/src/styles/theme.css` (the canonical design system). Key visual moves to mirror from insights / Grow web:

- **Header.** Sticky, white background, olive accent line. Logo mark left, "Taste" subtitle to the right of the mark in olive (`#5B6830`). User menu on the right. Hides on scroll-down (use the `useScrollDirection` hook pattern from `insights/components/SiteHeader.jsx`).
- **Landing hero.** Full-width sand-gradient (`linear-gradient(135deg, var(--color-sand) 0%, #fff 100%)`), centred logo + tagline, single CTA button in terracotta. Matches the Grow Home and the insights Landing.
- **Buttons.**
  - Primary: olive background, white text, `border-radius: var(--radius-md)`, `padding: 12px 24px`.
  - Secondary: white background, olive border + text.
  - Accent / CTA: terracotta background, white text. Used sparingly (one per page max).
  - Never use the global `button { padding: 8px 16px }` from `index.css` for fixed-size icon buttons — override per the user-memory note.
- **Cards.** `var(--shadow-md)`, `var(--radius-lg)`, `var(--space-base)` padding. Sand-warm variant for the entry-list rows on the browse page.
- **Chips (used heavily — tasting grid fields).** Pill shape (`var(--radius-pill)`), 12-14px font, olive-bordered when unselected, solid olive with white text when selected. Multi-select uses the same chips with `aria-pressed` toggling. Spacing: 6-8px gap.
- **Typography.** Calibri stack from theme. Headings olive, body charcoal. Section heads in tasting grids use `font-size-lg` + olive colour + uppercase + letter-spacing.
- **Form rhythm.** Section heading → optional help text → field row with label above input. Mirror `packages/web/src/pages/TaskCreationWizard.jsx` / `TaskTemplateEditor.jsx` for spacing.
- **Empty states.** Centred icon (lucide `Wine` or `Notebook`) + olive text + secondary CTA. Match the pattern in `insights/pages/ArticlesPage.jsx` when no results.
- **Touch targets.** All interactive elements at least 44px tall — this is iPad-first.

The bottom-nav pattern from Grow mobile is NOT used here — the SPA is desktop/iPad-shaped. Header-only nav.

### 5.6 The grid renderer — single component to rule them all

`GridRenderer.jsx` takes a `definition` (the JSONB), the current `values` map, and an `onChange(key, value)` callback. It iterates `definition.sections → fields`, evaluates `visible_if`, delegates to one of the `fields/<Kind>.jsx` components, and stitches the per-field values back into the flat `section.field`-keyed map.

```jsx
function GridRenderer({ definition, values, onChange, blind_mode }) {
  return (
    <div className="grid-renderer">
      {definition.sections
        .sort((a, b) => a.order - b.order)
        .map((section) => (
          <Section key={section.id} section={section}>
            {section.fields.map((field) => {
              const key = `${section.id}.${field.id}`;
              if (!isVisible(field, values)) return null;
              const FieldComp = FIELD_COMPONENTS[field.kind];
              return (
                <FieldComp
                  key={key}
                  field={field}
                  value={values[key]}
                  onChange={(v) => onChange(key, v)}
                />
              );
            })}
          </Section>
        ))}
    </div>
  );
}
```

Adding a future grid (WSET L4, etc.) requires zero changes to the renderer — only a new row in `taste.grid_schemas`.

### 5.7 Blind/known flow on the SPA

- **At capture time:** the `BlindToggle` on `CaptureTasting.jsx` controls whether the identity fields (Producer, Vintage, Region, Variety) are shown above the grid or hidden inside a collapsed "Reveal (admin)" accordion. Either way they save to the API the same way — the toggle only affects rendering and the `is_blind` flag in the payload.
- **At browse time:** blind entries show "Blind tasting — [Variety guess from grid]" in the EntryCard, never the producer. EntryDetail.jsx shows producer/vintage/region only if `blind_state === 'open' || blind_state === 'revealed'`.
- **The Reveal button:** appears on `EntryDetail` when `blind_state === 'blind'`. Confirms via a modal ("Reveal Cloudy Bay Sauvignon Blanc 2022?"), POSTs `/{id}/reveal`, updates local state. Animation: identity fields fade in.

### 5.8 Capture forms — per-type detail

#### Tasting (`CaptureTasting.jsx`)

```
+--------------------------------------------------------+
| Header (sticky)                                        |
+--------------------------------------------------------+
| Grid: MW Practical             Date: [2026-05-27]      |
| Mode: ( ) Known  (•) Blind                             |
+--------------------------------------------------------+
| Identity (hidden when Blind, or in collapsed accordion)|
|   Producer ____  Wine ____  Vintage ____               |
|   Variety ____   Region ____  Country ____             |
+--------------------------------------------------------+
| GridRenderer renders sections from definition.json     |
|   APPEARANCE   intensity [chips] color [chips] …       |
|   NOSE         condition [chips] intensity [chips] …   |
|   PALATE       sweetness [chips] acidity [chips] …     |
|   ASSESSMENT   quality [chips] score [num] BLIC [text] |
|   ORIGIN       variety_call [text] region_call [text]  |
+--------------------------------------------------------+
| Notes (free text — saved on TasteEntry.notes)          |
+--------------------------------------------------------+
| [Cancel]                              [Save tasting]   |
+--------------------------------------------------------+
```

#### Flight (`CaptureFlight.jsx`)

```
+--------------------------------------------------------+
| Date  Title (theme)  Notes (overall)                   |
+--------------------------------------------------------+
| Wines (drag to reorder via lucide GripVertical)        |
|   1. [Label] [Producer] [Wine] [Vintage] [Notes…] [×]  |
|   2. [Label] [Producer] [Wine] [Vintage] [Notes…] [×]  |
|   …                                                    |
|                                              [+ Wine]  |
+--------------------------------------------------------+
| [Cancel]                              [Save flight]    |
+--------------------------------------------------------+
```

Drag-to-reorder is a Phase 2.5 polish — v1 ships with up/down arrows.

#### Interaction (`CaptureInteraction.jsx`)

```
+--------------------------------------------------------+
| Date         Subject (title)                           |
+--------------------------------------------------------+
| Who    [Marcus Pickens]      Role/Org [Wine MK CEO]    |
+--------------------------------------------------------+
| Body (textarea — TasteEntry.notes)                     |
+--------------------------------------------------------+
| [Cancel]                              [Save note]      |
+--------------------------------------------------------+
```

Who/Role/Org saves into `metadata.who`, `metadata.role`, `metadata.organisation`.

### 5.9 Browse + filter (`Browse.jsx`)

```
+--------------------------------------------------------+
| Header                                                 |
+--------------------------------------------------------+
| All  Tasting  Flight  Interaction       [Search …]     |
| Date: [Any v]  Grid: [Any v]                           |
+--------------------------------------------------------+
| 2026-05-27 · Tasting · MW Practical  · Outstanding   ›|
|   Cloudy Bay Sauvignon Blanc 2022                      |
| 2026-05-25 · Flight                                  ›|
|   Pinot Noir 2018 Vintage — 6 wines                    |
| 2026-05-22 · Interaction                             ›|
|   Marcus Pickens — Wine MK strategy session            |
+--------------------------------------------------------+
| [Load more]                                            |
+--------------------------------------------------------+
```

Filter state is URL-synced (`?type=tasting&date_from=2026-01-01`) so back-button works.

### 5.10 Local dev

```powershell
# Terminal 1 — backend
cd backend
uvicorn main:app --reload --port 8000

# Terminal 2 — taste SPA
cd packages/taste
npm install
npm run dev                # opens http://localhost:5175
```

Vite proxies `/api/*` to `http://localhost:8000` (mirror of the insights config).

---

## 6. Phase 2B infra — `taste.auxein.co.nz`

This follows the existing pattern in `docs/runbooks/provision-s3-buckets.md` exactly. Three new AWS resources, one Route53 record, one ACM cert.

### 6.1 Resources to provision

| Resource | Name | Region | Notes |
| --- | --- | --- | --- |
| ACM certificate | `taste.auxein.co.nz` | `us-east-1` | Required for CloudFront. DNS validation via Route53. |
| S3 bucket | `auxein-taste-web` | `ap-southeast-2` | Private (block public access). Static SPA assets. |
| CloudFront OAC | `auxein-taste-web-oac` | global | Origin Access Control (sigv4). |
| CloudFront distribution | (auto id, alias `taste.auxein.co.nz`) | global | SPA fallback: error 403/404 → `/index.html` with 200. Default TTL 86400. ACM cert from above. |
| Route53 A-alias record | `taste.auxein.co.nz` → CloudFront | `auxein.co.nz.` zone | Standard A-record alias. |
| S3 bucket policy | (attached) | — | Grants CloudFront OAC `s3:GetObject` only. |

The provisioning steps are word-for-word the existing Pro web recipe in the runbook — copy Stage A, replace `grow` with `taste`, change the bucket and OAC names. **Add a new runbook** `docs/runbooks/provision-taste-infra.md` so the steps are recorded.

### 6.2 Deployment

Build + sync, same pattern as the other SPAs:

```powershell
# From repo root
cd packages/taste
npm run build              # outputs to dist/

aws s3 sync dist/ s3://auxein-taste-web/ `
  --delete `
  --cache-control "public, max-age=300" `
  --profile eb-cli

# Invalidate CloudFront so the SPA shell updates
aws cloudfront create-invalidation `
  --distribution-id <new-distribution-id> `
  --paths "/index.html" "/" `
  --profile eb-cli
```

Static assets (CSS, JS hashed bundles) get long-cache headers automatically by Vite's content-hashed filenames; only `index.html` needs the short cache + invalidation.

A `deploy-taste.ps1` script in `scripts/` is worth adding for one-line deploys.

### 6.3 CORS — already covered

Backend change in §4.6 added `https://taste.auxein.co.nz` to `allowed_origins`. No EB env-var changes needed.

---

## 7. Cross-cutting concerns

### 7.1 Auth token sharing across subdomains

The Grow JWT lives in `localStorage`. `localStorage` is **per-origin**, so `grow.auxein.co.nz` and `taste.auxein.co.nz` do NOT share tokens — the user signs in twice. That's acceptable for a prequel (Pete signs in once on the iPad, stays signed in for the JWT lifetime — 180 min per `core/config.py:129` — and the refresh token is good for 7 days).

If single-sign-on across subdomains becomes annoying, the right fix is to lift the JWT into a cookie scoped to `.auxein.co.nz` and set `withCredentials: true` on axios. That's a 1-day project on its own and explicitly **out of scope for this plan** — flag it as Phase 2.5 if Pete asks.

### 7.2 Feature flag (optional)

Wrap the two `app.include_router` calls in:

```python
if os.getenv("TASTE_ENABLED", "false").lower() == "true":
    app.include_router(taste_grids.router, ...)
    app.include_router(taste_entries.router, ...)
```

Gives the option to deploy backend code without exposing endpoints. Default off. Remove the flag in Phase 2.5 once stable.

### 7.3 Observability

- The existing `log_errors` middleware (`main.py:80`) catches and logs taste exceptions automatically.
- No new metric instrumentation in v1 — the existing logs are enough at single-user volumes.
- Add `taste-backend` to the umami event tracker (`utils/eventTracker.js`) in Phase 2.5 if you want page-view stats on the SPA.

### 7.4 Backup posture

- Taste data lives in the same RDS instance and is included in the existing nightly snapshot. No new backup config required.
- `pg_dump --schema=taste` from a read-only role gives a quick ad-hoc extract whenever Pete wants a flat-file archive (e.g. for offline iPad reference).

### 7.5 Permissions matrix

No entry in `core/permissions.py`. Authorisation is entirely row-level (`taste_entries.user_id == current_user.id`). A user with no taste entries trivially has nothing to do on the site. If Phase 2.5 introduces sharing, that's when the permissions module gets a `taste` row.

---

## 8. Test plan

### 8.1 Backend (Phase 2A)

Run before merging the backend PR:

- `alembic upgrade head` clean on a fresh local DB.
- `alembic downgrade -2 && alembic upgrade head` round-trip clean.
- `pytest` (if a smoke test for each endpoint is added) — at minimum, manually verify the curl list in §4.10.
- Confirm `/openapi.json` shows the taste endpoints under `bearerAuth`.
- Confirm a *different* user (test user with separate JWT) gets empty `/entries` and 404 on someone else's entry id.
- Confirm grid `is_active=false` rows still return on `GET /grids/{id}` (historical render path).

### 8.2 Frontend (Phase 2B)

Run on the iPad in Safari (the actual deployment target — not desktop Chrome):

- Sign-in works with Pete's Grow credentials.
- Grid picker shows MW Practical, MS Deductive, Freeform.
- MW Practical form renders all five sections without scrolling jank.
- Blind toggle hides identity fields; payload still includes them when saved.
- Saving a tasting returns to Browse with the new entry at top.
- Flight: add 3 wines, reorder, save, reload, order preserved.
- Interaction: subject + body + who/role saves and renders.
- Search filters by substring on title and notes.
- Reveal button transitions a blind entry to revealed.
- Logout clears local storage and redirects to landing.

### 8.3 Smoke checklist for `taste.auxein.co.nz` first-day go-live

- DNS resolves to CloudFront.
- HTTPS cert is the new ACM one, not the apex wildcard.
- Loading `taste.auxein.co.nz/entries` directly (not via `/`) serves the SPA shell (CloudFront SPA fallback wired).
- API call from the SPA reaches `api.auxein.co.nz` without CORS error.
- No console errors on a fresh load.

---

## 9. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Pete edits a seed grid in DB by hand, breaking version pinning | Medium | High | App enforces "PATCH creates new version" — never UPDATE in place. Add a code comment in `taste_seed_grids.py` warning against direct DB edits. |
| Postgres `taste` schema not present in alembic_version on first migration apply | Low | High | `CREATE SCHEMA IF NOT EXISTS` in `taste_001` runs before any table DDL. |
| iPad Safari throws on a Pydantic-v2 strict camelCase response | Low | Medium | `populate_by_name=True` accepts either case on input; output is consistent camelCase. Tested manually on the iPad before sign-off. |
| JWT expires mid-tasting capture, user loses 20 min of typing | Medium | High | Implement axios 401 interceptor → silent refresh via `/api/auth/refresh` (the endpoint exists). If refresh fails, the form keeps state in component memory; sign-in modal overlays. |
| Cross-subdomain auth confusion | Low | Low | Sign-in screen explicitly says "Use your Grow credentials". Forgot-password link goes to grow.auxein.co.nz. |
| Pete deletes the `taste` schema by mistake | Very low | Very high | Daily RDS snapshot is the recovery. Tag the runbook step `CREATE SCHEMA` as "one-way" — `DROP SCHEMA taste CASCADE` is reserved for downgrade only. |

---

## 10. Open questions

These are decision points before Phase 2A starts. They're small — none should block kicking off.

1. **Feature flag?** Default on or off? Recommend **default OFF** so the migration can deploy ahead of the UI without exposing endpoints, then flip to ON via EB env-var when the SPA lands.
2. **Sign-in re-use vs new flow.** Confirmed direction: reuse Grow's `/api/auth/login` and `AuthContext`. No changes to existing auth code.
3. **Branding the SPA — "Auxein Taste" or just "Taste"?** The marketing site already uses "Auxein Taste" as a future product line. Recommend **"Auxein Taste"** in the header subtitle and `<title>` tag; visually short-form as "Taste" only inside dense UI.
4. **iPad pinning / PWA?** Skip in v1. Add a `<link rel="apple-touch-icon">` and a `manifest.json` so iOS treats it nicely if pinned to home screen, but no service worker / offline cache. Add when needed.
5. **Backfill / import the 30+ existing notes?** Decide before SPA ships. Two options: (a) Pete types them in over a week via the new UI — easy, no extra code; (b) build a one-shot `POST /entries/bulk-import` endpoint behind the feature flag — ~half a day. Recommend (a) unless the notes are already in a structured format somewhere.
6. **Public discoverability of `taste.auxein.co.nz` URL?** Default: indexable. Recommend **noindex** for v1 — add a `robots.txt` `Disallow: /` and a `<meta name="robots" content="noindex">`. The site is personal; no SEO benefit from being crawlable.

---

## 11. Out-of-scope hooks for Phase 2.5+

Listed so future-Pete knows where each future feature plugs in:

- **User-authored grids.** `GridSchema.user_id` and the create/patch endpoints are already in the schema and the API outline — just wire the UI in `pages/admin/Grids.jsx` and ship.
- **Sharing & panels.** New `taste.share_grants` table with `(grant_to_user_id, grant_from_user_id, scope_type, scope_id)`; query filter changes from `user_id == current_user.id` to `user_id == current_user.id OR id IN (visible_via_grants)`. No model changes elsewhere.
- **Contact CRM for interactions.** New `taste.contacts` table; add `interaction_entry_details(entry_id, contact_id)`; backfill from existing `metadata.who` strings via fuzzy match.
- **Analytics / cross-grid scoring.** New router `/api/v1/taste/insights/*`. Read-only — pulls from the existing tables. No new write paths.
- **CSV / PDF export.** Reuses the export library already in `backend/services/` (see how `reports.py` does CSV). Per-entry PDF would need a templating library — defer.
- **Public Taste platform shape (multi-tenant tasters).** This is the eventual home for everything above. The `taste` schema ringfence is what makes that extraction tractable.

---

## 12. Definition of done — Phase 2A + 2B together

- Code merged to `main` on both `feat/taste-backend` and `feat/taste-frontend` branches.
- Both alembic revisions applied to staging RDS, then prod RDS.
- Backend deployed to `auxein-api-prod-lb`.
- `taste.auxein.co.nz` DNS resolves and serves the SPA.
- Pete signs in on his iPad, captures a tasting note against MW Practical, sees it in Browse, and closes the iPad with a saved entry.
- One memory note saved (`project_taste_prequel.md`) recording what shipped and pointing at this dev plan + the discovery docs.

That last step is the bow on it — closing the loop so the next session has full context without needing to re-derive any of this.
