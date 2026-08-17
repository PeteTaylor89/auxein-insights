# Removing the blockchain module

**Scoping doc, 2026-08-15. No code written — scoping only.**
Intent: remove the blockchain traceability module entirely from Grow, with the option to
reintroduce it later. This doc is the inventory, the order of operations and the traps.

---

## 1. The short version

It is **4 models, 4 tables, 4 endpoints, ~700 lines of backend code**, and it has never done
anything. There are no foreign keys pointing at it from outside its own four tables, and no
frontend consumes any of its output. Removal is self-contained and low-risk — the risks that do
exist are all in the *order* of operations, not in the coupling.

One piece of collateral is worth the trip on its own: **`backend/services/block_service.py` (102
lines) is entirely unreferenced dead code** — nothing anywhere imports `BlockService`.

---

## 2. Evidence — what is actually in there

Read-only survey of prod, 2026-08-15:

| table | rows | size |
|---|---|---|
| `blockchain_chains` | **89** | 192 kB |
| `blockchain_nodes` | **89** | 328 kB |
| `blockchain_events` | **0** | 24 kB |
| `fruit_received` | **0** | 48 kB |

- **89 chains across 89 distinct blocks — one per customer block**, auto-created when the block was
  created or assigned. 84 in June 2026, 5 in July 2026.
- **89 nodes across 89 chains = exactly one node each.** That is the genesis node and nothing else.
  **Nothing has ever been appended to any chain.**
- `blockchain_events` and `fruit_received` are **empty**. The provenance half of the module has
  never been used at all.
- Total footprint ~592 kB.

**No foreign key from any non-blockchain table points at these four tables.** All four FKs found
are internal (`nodes → chains`, `events → nodes`, `fruit_received → chains/nodes`). The only
outward link is `blockchain_chains.vineyard_block_id → vineyard_blocks.id`, which points *out*, and
the ORM-side `VineyardBlock.blockchain_chains` relationship.

**No frontend consumes it.** Verified: nothing in `packages/` reads `blockchain_created`,
`blockchain_info`, `blockchain-status` or `create-blockchain`.

---

## 3. Full inventory

### 3.1 Delete outright

| path | lines | note |
|---|---|---|
| `backend/db/models/blockchain.py` | 172 | `BlockchainChain`, `BlockchainNode`, `BlockchainEvent`, `FruitReceived` |
| `backend/schemas/blockchain.py` | 123 | |
| `backend/api/v1/blockchain.py` | 148 | 4 endpoints under `/api/blockchain` |
| `backend/services/blockchain_service.py` | 454 | |
| `backend/services/block_service.py` | 102 | **Already dead** — nothing imports `BlockService`. Delete regardless. |

### 3.2 Edit — references to strip

| path | what |
|---|---|
| `backend/main.py:15-18` | the `try: from api.v1 import blockchain / except ImportError: pass` |
| `backend/main.py:178-182` | `app.include_router(blockchain.router, prefix="/api/blockchain", ...)` |
| `backend/db/base.py:41` | model import |
| `backend/db/models/__init__.py:56` | model import |
| `backend/db/models/block.py:77` | `blockchain_chains = relationship(...)` on `VineyardBlock` |
| `backend/api/v1/blocks.py` | **the big one** — see §3.3 |
| `backend/services/management_service.py` | `_log_management_transfer` + its call site |

### 3.3 `backend/api/v1/blocks.py` — the only substantial edit

Four separate places, ~90 lines total:

- `from services.blockchain_service import BlockchainService` (line 19)
- `POST /{block_id}/create-blockchain` (~342-394) — whole endpoint goes
- `GET /{block_id}/blockchain-status` (~591-632) — whole endpoint goes
- auto-create on `create_block` (~438-468) and on assign-to-company (~524-580), plus a third
  auto-create around line 726

The two create paths add `blockchain_created` and `blockchain_info` to their **response bodies**.
Those keys disappear. Verified no client reads them, but it is a response-shape change, so it
belongs in the commit message.

### 3.4 `management_service.py`

`transfer_management` is **live** — called from `backend/api/v1/properties.py:318`. It logs a
`management_transfer` node onto the block's chain for the current season.

It already no-ops when no chain exists for the season ("skip blockchain logging rather than create
an orphan chain"), and since every chain holds only its genesis node, **this path has never
successfully logged anything.** Removing `_log_management_transfer` and its call leaves the
transfer itself untouched.

### 3.5 Frontend — a placeholder, plus marketing copy

- `packages/web/src/pages/Insights.jsx` — a **BlockChain tab that renders "BlockChain coming
  soon…"**. No data, no API call.
- `packages/web/src/help/helpContent.jsx:440` — the matching `insights.blockchain` help topic,
  already flagged `soon: true`.
- `packages/auxein-marketing/` — `about/page.tsx`, `grow/page.tsx`,
  `components/solutions/{Growfeaturesdata,solutionsData}.ts`.

**Both of these are decisions, not cleanup — see §6.**

### 3.6 Migrations — do NOT delete these

`alembic/versions/20250629_003.py` (creates all four tables), `_004.py` (season/company columns on
chains), `_005.py` (flexible season management).

They are **mid-chain ancestors** of the current head (`002 → 003 → 004 → 005 → …`). Deleting an
applied migration breaks the chain for any fresh bootstrap and orphans every descendant. They stay
as history; a **new** migration drops the tables.

---

## 4. Order of operations

The coupling is trivial; the sequencing is where this can go wrong.

**Do the code removal and the table drop as two separate deployments, code first.**

1. **Remove the code**, all of §3.1 and §3.2 together. The app now never touches the four tables.
2. **Deploy the backend and confirm it boots** — `GET /api/blockchain/...` should 404, and block
   creation and company assignment should both still work.
3. **Dump the data** (§5) if reintroduction is at all likely.
4. **Then** add and run the drop migration.

Dropping first would leave live code querying tables that no longer exist — 500s on block creation
and company assignment until the code deploy lands.

### The drop migration

Drop in FK order — `fruit_received`, `blockchain_events`, `blockchain_nodes`, `blockchain_chains` —
or use `CASCADE`. Suggested slug **`drop_blockchain_tables`** (22 chars; `version_num` is
`VARCHAR(32)` and an over-length slug silently rolls back the DDL). Chain off the then-current prod
head — check with `SELECT version_num FROM alembic_version`, not a cached value.

Write a real `downgrade()` that recreates the tables. It won't restore the rows, but it keeps the
chain reversible and makes the reintroduction path in §5 cheaper.

---

## 5. Preserving the option to reintroduce

The 89 chains and 89 nodes are ~500 kB and are the only record that the module ever ran. Before
dropping:

```
pg_dump --data-only --table=blockchain_chains --table=blockchain_nodes \
        --table=blockchain_events --table=fruit_received > blockchain_backup_2026-08-15.sql
```

Keep it somewhere durable and note it here. Given every chain holds only a genesis node, the data
has essentially no operational value — but it is cheap insurance and it records *which* 89 blocks
had chains, which is the one thing that would be tedious to reconstruct.

**For reintroduction, git is the real archive.** The removal commit is the restore point, so:

- **Remove it in one self-contained commit**, separate from any other work, with the four deleted
  files and the `blocks.py` edits together. A `git revert` of that single commit is then a working
  restore.
- Reference the commit SHA in this doc once it exists.
- If the module comes back, it should almost certainly come back differently — a design where
  chains are appended to by real events rather than auto-created empty on block assignment. The
  fact that 89 chains accumulated exactly 89 genesis nodes and nothing else is the strongest
  evidence available about what was wrong with the original design. **Worth reading this section
  before rebuilding it the same way.**

---

## 6. Two decisions that aren't mine to make

**The Insights BlockChain tab.** It says "coming soon" and shows nothing. If reintroduction is
genuinely on the cards, leaving the placeholder is defensible — it is honest about the state. If it
has been sitting there since June with no plan, it is a promise the product isn't keeping and
should go with the rest. Removing it means the tab entry in `Insights.jsx:24`, the `case
'blockchain'` block (~230-247), and the `insights.blockchain` topic in `helpContent.jsx:440`.

**Marketing site copy.** `auxein.co.nz` currently sells blockchain traceability on the About and
Grow pages and in the solutions data. Whether to pull that is a positioning call, not a code one —
but the copy and the product should not disagree, so it needs an answer at the same time.

---

## 7. Traps

- **`main.py`'s `try/except ImportError` is a false safety net.** The import is guarded but
  `app.include_router(blockchain.router, ...)` at line 178 is **not** — if the import ever failed
  the app would `NameError` at boot, not degrade gracefully. Practically: remove both together, and
  don't trust the guard to make a partial removal safe.
- **`eb deploy` ships the working DIRECTORY, not git HEAD** (`project_eb_deploy_from_directory`).
  A half-finished removal on disk goes to prod. Finish the code removal, or stash it, before any
  unrelated deploy.
- **Never delete `20250629_003/004/005`** (§3.6).
- **`block_service.py` is unreferenced but it is not blockchain-only in name** — check nothing new
  has started importing `BlockService` before deleting. It was dead as of 2026-08-15.
- **`VineyardBlock.blockchain_chains`** is a relationship, not a column. Removing it needs no
  migration, but leaving it after the model is deleted breaks SQLAlchemy mapper configuration at
  import time — i.e. the app won't start. Remove it in the same commit as the model.
- The four tables total ~592 kB. **This is not a disk-space exercise** — the case for removal is
  the ~700 lines of code and four endpoints that have to be understood, tested and secured for no
  return.

---

## 8. Rough size

| step | effort |
|---|---|
| Code removal (§3.1-3.4) | half a day, mechanical |
| Verify boot, block create, company assign, management transfer | short |
| Dump + drop migration | short |
| Frontend placeholder removal (if §6 says so) | short |
| Marketing copy (if §6 says so) | not a code task |

No mobile work at all — mobile has never referenced blockchain.

---

## 9. Execution record — 2026-08-17

**Code removal DONE. Table drop NOT done (deliberately — it is deployment 2).**

### Deleted (5 files, ~999 lines)
`backend/db/models/blockchain.py`, `backend/schemas/blockchain.py`,
`backend/api/v1/blockchain.py`, `backend/services/blockchain_service.py`,
`backend/services/block_service.py` (the already-dead one — re-checked, still nothing imported
`BlockService`).

### Edited — backend
- `main.py` — the `try/except ImportError` block and the unguarded `include_router` (§7's false
  safety net), removed together.
- `db/base.py`, `db/models/__init__.py` — model imports.
- `db/models/block.py` — `VineyardBlock.blockchain_chains` relationship, same commit as the model.
- `api/v1/blocks.py` — import, `POST /{id}/create-blockchain`, `GET /{id}/blockchain-status`, and
  all three auto-create sites (create, assign-company, split). `season_type` went with them: it
  was read from the assign-company request body and fed nothing else.
- `services/management_service.py` — `_log_transfer_event` and its call site; the docstring's
  step 5; and the now-unused `hashlib`, `json`, `datetime`, `timezone` imports. The transfer
  itself is untouched.

### Edited — frontend
- `packages/web/src/pages/Insights.jsx` — the `blockchain` pill card and its `case` block.
- `packages/web/src/help/helpContent.jsx` — the `insights.blockchain` topic.
- Marketing (§6's second decision, actioned): `app/grow/page.tsx` — the feature card is now
  **Compliance & Audit Trail** describing what actually ships, keeping the grid at 6; plus the
  benefits line and the hero paragraph. `app/about/page.tsx` timeline entry.
  `components/solutions/solutionsData.ts` — description + feature bullet.
  `components/solutions/Growfeaturesdata.ts` — the **Blockchain Provenance** entry deleted
  outright, because the **Audit Trail** entry directly below it already states the real capability.

### Verification performed
- `grep -ri blockchain` across `backend/` and `packages/` (excl. node_modules/.next): **zero code
  hits.** Remaining hits are docs, this plan, the three historical migrations and the new drop
  migration.
- `configure_mappers()` succeeds — 97 tables, no blockchain tables mapped. This is the §7 trap
  (a dangling relationship breaks mapper config at import time); it is clear.
- **FastAPI app boots — 592 routes, zero `blockchain` paths.**
- All edited Python compiles; all edited JSX/TS/TSX parse under esbuild.

### The drop migration — written, NOT applied
`alembic/versions/drop_blockchain_tables.py`. Slug is 22 chars, inside the 32-char limit.

**`down_revision = 'zone_cell_mask'`, NOT `surface_cv_units`.** It was written against
`surface_cv_units` (the live prod head, single row, verified 2026-08-17), but a **parallel
Insights session added `zone_cell_mask` off that same head on the same day**, which gave alembic
**two heads** — `alembic upgrade head` would have failed outright. Rebased onto `zone_cell_mask`
so the chain is linear again: `surface_cv_units → zone_cell_mask → drop_blockchain_tables`.
`alembic heads` now reports one head. This one goes second, which is correct anyway since it must
not run until the code removal is deployed.

**Watch this if the parallel session rebases too** — if both migrations get pointed at each other
you get a cycle. Re-run `alembic heads` before applying anything.

Its `downgrade()` reproduces the **live reflected schema**, not the literal sum of 003/004/005 —
`blockchain_chains` carries **both** `season` (from 004) and `season_id` (from 005), because 005
re-added the season columns under new names instead of renaming them. Reconstructing from the
migrations alone would have produced a table that never existed.

Row counts re-confirmed immediately before writing it: chains **89**, nodes **89**, events **0**,
fruit_received **0** — unchanged from the 08-15 survey.

### Remaining steps, in order
1. Commit this as **one self-contained commit** (§5 — `git revert` is then the restore path).
   Record the SHA here.
2. Deploy the backend. Confirm it boots, `/api/blockchain/*` 404s, and block create + company
   assign + management transfer all still work.
3. `pg_dump` the four tables (§5).
4. **Only then** `alembic upgrade head` to drop them.

### Response-shape changes to note in the commit message
`POST /blocks/` and `PATCH /blocks/{id}/assign-company` no longer return `blockchain_created` or
`blockchain_info`. Verified no client reads them.

### Noticed in passing — NOT fixed, not in scope
- **`backend/db/base.py` is already broken and was before this change** — line 17 imports
  `db.models.observation`, which does not exist. Anything importing `db.base` raises
  `ModuleNotFoundError`. The app boots because it goes through `db.models` instead. Worth a
  separate look: either it is dead and should go, or something (alembic env?) is silently not
  using it.
- **The marketing site still advertises "GPS-tracked spray tasks"** (`solutionsData.ts`) and
  "spray efficiency heatmaps" (`grow/page.tsx`) — both mothballed. Same copy-vs-product mismatch
  as blockchain, different feature. Left alone deliberately: out of scope for this task.
