# 01 — Data Model

Proposed schema for the `taste` domain. Three new tables, no changes to existing tables. All ownership FKs go to `users(id)` (Integer); none of the new tables carry `company_id`. This deliberately diverges from the rest of Grow's company-scoped tenancy — see `00-findings.md` §B.5.

---

## 1. Single-table vs detail-table — recommendation

The spec asks us to choose and justify. **Recommendation: hybrid (Option C below).** One base `taste_entries` table carrying the columns that all three entry types share (owner, type, date, free-text title/note, soft-delete, timestamps), plus a `tasting_entry_details` table for grid-driven tasting captures and a `flight_entries` table for the ordered wine list inside a flight. Interaction entries need no detail table — their fields fit comfortably on the base row.

### Why hybrid, not single-table-JSONB

A pure single-table design (`taste_entries` with a `data JSONB` column carrying everything type-specific) is *simpler to migrate* and *easier to change* once shipped — at the cost of:

- **Indexability.** We will want indexed access to `is_blind`, `grid_schema_id`, `producer`, `vintage`, `region`, `variety` — and especially per-grid analytics ("show me all my MW Practical scores on Cabernet Sauvignon"). Indexing a JSONB key works but is more painful than indexing a column. The Taste platform's value is in the data graph; we lose leverage if every analytic query has to traverse JSONB.
- **Query clarity.** A REST list endpoint that filters by `producer LIKE '%Cloudy Bay%'` reads better as a column than as `data->>'producer'`. Pydantic Response models stay declarative.
- **Type safety at the ORM layer.** SQLAlchemy can give us real attributes on the relationship objects; JSONB-only forces dict lookups and string keys throughout the API code.

### Why not pure detail-tables-per-type either

A pure split — three sibling tables `tasting_entries`, `flight_entries`, `interaction_entries` with no common parent — duplicates the owner/date/timestamp columns across all three and makes the "give me everything I tasted on this date" query a three-way UNION. We also lose a single FK target for any future cross-type linking (a flight could reference a previously logged tasting entry; an interaction could reference a flight).

### The trade-off, stated plainly

Hybrid is more migration work than single-table-JSONB (three CREATE TABLEs instead of one), and you can't pick a brand-new entry type purely as a `definition` JSON change — you'll write a detail table when a fourth type ships. That's the right cost: the three types we know about are architecturally different (tasting = structured grid; flight = ordered list of children; interaction = freeform meeting note). Treating them as the same shape would mean either over-fitting one to fit the others or stuffing everything in JSONB and losing the leverage above.

The flexibility argument cuts the other way too: **the `values` JSONB on `tasting_entry_details` is where new grid types live without schema changes** (a new MW grade, a WSET grid, a Voices consumer grid — all just rows in `grid_schemas`). The grid engine *is* the schema-free escape hatch. That's exactly the use case JSONB earns; entry-type identity is not.

---

## 2. Tables

### 2.1 `grid_schemas` — the engine

Versioned grid definitions. Each row is a complete grid (sections → fields → allowed values → conditional logic) renderable by one shared frontend renderer.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | Surrogate. Entries reference `(grid_schema_key, grid_schema_version)` not this id — see §2.2 — so this is purely for FK convenience and admin UI. |
| `key` | `VARCHAR(50)` | `NOT NULL` | Stable identifier: `mw_practical`, `ms_deductive`, `freeform`, `wset_l4`, ... |
| `version` | `INTEGER` | `NOT NULL` | Monotonic per `key`. Starts at 1. Increment when the `definition` changes substantively. |
| `label` | `VARCHAR(200)` | `NOT NULL` | Human-readable: "MW Practical Tasting Note (2024)". |
| `description` | `TEXT` | nullable | Optional notes about the grid, scoring system, etc. |
| `definition` | `JSONB` | `NOT NULL` | The grid contract — see `02-grid-engine.md` for shape. |
| `is_active` | `BOOLEAN` | `NOT NULL DEFAULT TRUE` | Active grids show in the picker. Old versions stay readable but un-selectable. |
| `is_system` | `BOOLEAN` | `NOT NULL DEFAULT FALSE` | System-seeded grid (MW/MS/Freeform) vs user-authored. Used by the UI to forbid editing the seeds. |
| `user_id` | `INTEGER` | `REFERENCES users(id) ON DELETE SET NULL`, nullable | Owner of a user-authored grid. NULL when `is_system = TRUE`. |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | `NOT NULL DEFAULT NOW()` | |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | `NOT NULL DEFAULT NOW()` | Touched by ORM `onupdate`. |

**Indexes & constraints**

- `UNIQUE (key, version)` — name `uq_grid_schemas_key_version`. The (key, version) tuple is the natural identity that entries lock onto.
- `INDEX ix_grid_schemas_key (key)` — list-by-key queries.
- `INDEX ix_grid_schemas_user_id (user_id) WHERE user_id IS NOT NULL` — partial index for user-grid listing.
- `CHECK (version >= 1)` — name `ck_grid_schemas_version_positive`.
- `CHECK (is_system = FALSE OR user_id IS NULL)` — name `ck_grid_schemas_system_no_owner`. A system grid can't have a user owner.

**Cascade behaviour**

- `user_id` on `users.id` is `SET NULL`: deleting a user (which is itself rare — usually soft-deleted) leaves their custom grids in place, orphaned. We could choose `CASCADE` instead — but a custom grid might be referenced by a *system-shared* tasting entry in some future iteration, so orphaning is safer.

### 2.2 `taste_entries` — the spine

Every tasting note, flight, and interaction is a row here. Detail tables hang off this for tasting/flight types.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | |
| `user_id` | `INTEGER` | `NOT NULL REFERENCES users(id) ON DELETE CASCADE` | Owner. Deleting the user deletes their notes — this is *their* data. Soft-delete on `users` (which the codebase prefers anyway) avoids the destructive case. |
| `type` | `VARCHAR(20)` | `NOT NULL` | Discriminator: `tasting`, `flight`, `interaction`. |
| `entry_date` | `DATE` | `NOT NULL` | The date the wine was tasted / the meeting happened. Not a timestamp — granularity is the day, matching the existing capture app payload's `date` field. |
| `title` | `VARCHAR(200)` | nullable | Optional human-readable title. For tasting, often derived from producer + vintage. For flight, the flight theme. For interaction, the subject line. |
| `notes` | `TEXT` | nullable | Free-text appended to any entry type. For interaction, this is the body. |
| `metadata` | `JSONB` | `NOT NULL DEFAULT '{}'::jsonb` | Catch-all for non-indexed extras (occasion, mood, weather, future tag list, etc.). Don't push core fields here. |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | `NOT NULL DEFAULT NOW()` | |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | `NOT NULL DEFAULT NOW()` | |
| `deleted_at` | `TIMESTAMP WITH TIME ZONE` | nullable | Soft delete. List endpoints filter `deleted_at IS NULL` by default. |

**Indexes & constraints**

- `CHECK (type IN ('tasting','flight','interaction'))` — name `ck_taste_entries_type`.
- `INDEX ix_taste_entries_user_id (user_id)` — every query is user-scoped, so this is the workhorse index.
- `INDEX ix_taste_entries_user_date (user_id, entry_date DESC)` — the chronological-list query.
- `INDEX ix_taste_entries_user_type (user_id, type)` — type-filtered lists.
- `INDEX ix_taste_entries_deleted_at (deleted_at) WHERE deleted_at IS NULL` — partial index, makes the "active entries" filter free.

**Cascade behaviour**

- `user_id ON DELETE CASCADE` — see notes above. The `users` table is itself soft-delete in practice; CASCADE only triggers on the rare hard-delete path. Detail tables cascade off `taste_entries.id`.

### 2.3 `tasting_entry_details` — structured tasting fields

One-to-one with `taste_entries` when `type = 'tasting'`. No row exists for `flight` or `interaction` entries.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| `entry_id` | `INTEGER` | `PRIMARY KEY REFERENCES taste_entries(id) ON DELETE CASCADE` | PK *is* the FK — one-to-one. |
| `grid_schema_id` | `INTEGER` | `NOT NULL REFERENCES grid_schemas(id) ON DELETE RESTRICT` | What grid was used. RESTRICT because deleting a grid that's been used would lose interpretation context. (Operationally: set `is_active = FALSE` on a grid you want retired; never delete it.) |
| `grid_schema_key` | `VARCHAR(50)` | `NOT NULL` | Denormalised copy of the grid's `key` at capture time. Lets queries filter by grid family without joining. |
| `grid_schema_version` | `INTEGER` | `NOT NULL` | Denormalised copy of the version at capture time. **The pair `(grid_schema_key, grid_schema_version)` is the canonical "what shape is this note?" tuple** — see `02-grid-engine.md` §3. The FK `grid_schema_id` is convenience; integrity is enforced by a composite FK below. |
| `blind_state` | `VARCHAR(10)` | `NOT NULL DEFAULT 'open'` | `open` (taster knew the wine), `blind` (taster did not), `revealed` (was blind, now revealed). |
| `revealed_at` | `TIMESTAMP WITH TIME ZONE` | nullable | Set when `blind_state` transitions to `revealed`. NULL otherwise. |
| `producer` | `VARCHAR(200)` | nullable | Identity fields — populated from the start of a blind tasting too, just gated by `blind_state` at the API/UI layer. |
| `wine_name` | `VARCHAR(200)` | nullable | The cuvée name if separate from producer. |
| `vintage` | `INTEGER` | nullable | E.g. `2018`. `CHECK (vintage IS NULL OR vintage BETWEEN 1800 AND 2100)`. |
| `variety` | `VARCHAR(200)` | nullable | Free text for now — "Cabernet Sauvignon", "Cabernet/Merlot blend", "Field blend". Normalisation can come later. |
| `region` | `VARCHAR(200)` | nullable | Free text — "Marlborough", "Margaux", "Russian River Valley". Normalisation later. |
| `country` | `VARCHAR(100)` | nullable | Free text. (`data_platform.countries` exists in the wider system but isn't connected here in v1.) |
| `values` | `JSONB` | `NOT NULL DEFAULT '{}'::jsonb` | The grid-driven captures. Keyed `section.field`, matching the capture app's payload shape. Values can be string, number, array, or null per `definition`. See `02-grid-engine.md` §4. |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | `NOT NULL DEFAULT NOW()` | |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | `NOT NULL DEFAULT NOW()` | |

**Indexes & constraints**

- `FOREIGN KEY (grid_schema_id) REFERENCES grid_schemas(id)` — convenience FK (above).
- `FOREIGN KEY (grid_schema_key, grid_schema_version) REFERENCES grid_schemas(key, version)` — name `fk_tasting_entry_details_grid_version`. **This is the load-bearing FK.** Pinning the version tuple ensures `values` is interpretable forever.
- `CHECK (blind_state IN ('open','blind','revealed'))` — name `ck_tasting_entry_details_blind_state`.
- `CHECK (blind_state = 'revealed') = (revealed_at IS NOT NULL)` — name `ck_tasting_entry_details_revealed_consistency`. `revealed_at` is set iff state is `revealed`.
- `INDEX ix_tasting_entry_details_grid (grid_schema_key, grid_schema_version)` — analytics by grid version.
- `INDEX ix_tasting_entry_details_producer (producer)` — `WHERE producer IS NOT NULL` partial.
- `INDEX ix_tasting_entry_details_variety (variety)` — partial.
- `INDEX ix_tasting_entry_details_vintage (vintage)` — partial.
- `INDEX ix_tasting_entry_details_values_gin (values jsonb_path_ops)` USING `GIN` — for searches into the grid `values` map (e.g. "all wines where palate.acidity = 'high'").

**Cascade behaviour**

- `entry_id ON DELETE CASCADE` — deleting a `taste_entry` deletes its details.
- `grid_schema_id ON DELETE RESTRICT` — see column note.

### 2.4 `flight_entries` — wines in a flight

Children of a `taste_entries` row with `type = 'flight'`. Ordered.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | |
| `flight_id` | `INTEGER` | `NOT NULL REFERENCES taste_entries(id) ON DELETE CASCADE` | The parent flight. Application code enforces parent has `type = 'flight'`. |
| `position` | `INTEGER` | `NOT NULL` | Pour order, starting at 1. |
| `label` | `VARCHAR(200)` | nullable | What the taster called this wine in the flight: "Wine 1", "Cab #3", "the funky one". |
| `producer` | `VARCHAR(200)` | nullable | Same identity fields as tasting details. |
| `wine_name` | `VARCHAR(200)` | nullable | |
| `vintage` | `INTEGER` | nullable | `CHECK (vintage IS NULL OR vintage BETWEEN 1800 AND 2100)`. |
| `variety` | `VARCHAR(200)` | nullable | |
| `region` | `VARCHAR(200)` | nullable | |
| `country` | `VARCHAR(100)` | nullable | |
| `notes` | `TEXT` | nullable | Per-wine free text. The overall flight note lives on `taste_entries.notes`. |
| `tasting_entry_id` | `INTEGER` | `REFERENCES taste_entries(id) ON DELETE SET NULL`, nullable | Optional link to a full `tasting` entry capturing this wine in detail. Lets a flight reference deeper notes without duplicating data. |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | `NOT NULL DEFAULT NOW()` | |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | `NOT NULL DEFAULT NOW()` | |

**Indexes & constraints**

- `UNIQUE (flight_id, position)` — name `uq_flight_entries_flight_position`. Two wines can't share a pour position within a flight.
- `INDEX ix_flight_entries_flight_id (flight_id)`.
- `INDEX ix_flight_entries_tasting_entry_id (tasting_entry_id) WHERE tasting_entry_id IS NOT NULL` — partial.
- `CHECK (position >= 1)` — name `ck_flight_entries_position_positive`.

**Cascade behaviour**

- `flight_id ON DELETE CASCADE` — deleting the parent flight deletes the children.
- `tasting_entry_id ON DELETE SET NULL` — deleting a referenced tasting entry doesn't blow away the flight; the link just goes away.

### 2.5 No table for interaction entries

Interaction-specific fields fit on the base `taste_entries` row using the existing columns:

- `title` — subject
- `notes` — body
- `metadata` — `{ "who": [...], "role": "...", "organisation": "..." }`

When (not if) the contact reference proper is added, we add `interaction_entry_details` with FK to whatever industry-contact table comes into being. Don't pre-build it — spec §4.1 explicitly says "do not build that linkage now; just leave the door open." The door is the `metadata` JSONB column.

---

## 3. Ownership FK summary

All three new tables eventually trace to `users(id)`:

```
users.id
  └── grid_schemas.user_id            (nullable, SET NULL)
  └── taste_entries.user_id           (NOT NULL, CASCADE)
        └── tasting_entry_details.entry_id    (PK = FK, CASCADE)
        │     └── grid_schemas.id              (RESTRICT, via id)
        │     └── grid_schemas.(key, version)  (RESTRICT, via composite)
        └── flight_entries.flight_id           (CASCADE)
              └── taste_entries.id             (SET NULL, via tasting_entry_id)
```

No FK touches `companies` from any taste table.

---

## 4. What is *not* in the model (and why)

- **No `company_id`.** Spec §1, repeated emphatically. Future sharing → explicit grant table, not a vestigial column.
- **No `published` / `is_draft` / `state`.** All entries are "real" the moment they're saved. The capture app handles drafts client-side (it already runs on local storage). Adding a state machine now would be premature.
- **No score columns** (`points`, `score_out_of_100`, etc.). Scores belong inside the grid `values` JSONB because not every grid scores the same way (MW has Assessment of Quality narrative + numerical, MS is pass/fail at the conclusion, WSET L4 has structured marks). Lifting one specific score to a column means choosing one grid as canonical, which contradicts the engine model.
- **No `wine_id` / `producer_id` FK.** Identity is free-text in v1. Normalisation into a wines table is its own project — Taste platform thing.
- **No `geometry` column** on any taste table. Tastings happen in places, but until we know what we'd do with that data, no point modelling it. The `metadata` column can hold a `location` blob if the capture app starts asking for one.
- **No audit table.** `created_at`/`updated_at`/`deleted_at` on every row is enough for v1.

---

## 5. Approximate row counts and storage sanity check

Personal use at launch: ~30 backlogged notes + ~10-20/month going forward = ~300/year. Even at 10 KB per row (tasting `values` JSONB included), that's ~3 MB/year. The indexes will dwarf the data. **No partitioning, no archive table needed.** When (if) Taste opens to other tasters, the per-user filter on every index keeps query plans flat well into the millions of rows. Revisit at 10M rows.
