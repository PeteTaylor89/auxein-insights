# Sub-block management units ("sections")

**Scoping doc, 2026-08-15. No code written, and none planned for today — this is scoping only.**
Origin: Greystone asked whether smaller, clonally distinct areas inside a block can be managed and
yield-tracked as units in their own right.

All open questions were answered by Pete on 2026-08-15 — see **§10**. §6.4, §7.2, §9 and §10a were
revised in light of those answers; the phasing changed, so read §9 rather than any recollection of
an earlier version.

---

## 1. Decisions already taken

Settled with Pete before this doc was written — treat as fixed, not as open options.

| Decision | |
|---|---|
| **Not spatial areas** | Sections are built on `vineyard_rows`, not on `SpatialArea`. Reasons in §8. |
| **Defined in the block edit form** | Sections are created and have rows assigned to them from the CompanyAdmin → Blocks tab, alongside the existing `RowRangePainter`. |
| **Yield from vine counts per row** | Vines per section = sum of its rows' vine counts, not an area-share of a block figure. **See §4 — the data for this does not exist yet.** |
| **Off by default, per company** | A company-level toggle enables sub-block units for tasks and observations, with a helper explaining it. Users who don't want them never see them. |
| **Appear as a block would** | Once enabled, a section is selectable in task and observation assignment the same way a block is, and shows on detail views the same way. |

---

## 2. What already exists — Greystone are doing this by hand today

This is not new territory. `vineyard_rows` already carries `variety`, `clone` and `rootstock` per
row, and `CompanyAdmin.jsx` already ships a **`RowRangePainter`** driving
`PATCH /vineyard-rows/by-block/{block_id}/range` — built for the beta's "40-row block planted to
two clones" ask.

Read-only survey of prod, 2026-08-15:

| | |
|---|---|
| Greystone (company 19) blocks / materialised rows | 32 / 1,330 |
| Rows with a clone recorded | **370** |
| Blocks already carrying more than one clone across their rows | **2** |
| `task_rows` rows linked to a real `vineyard_row_id` | **353 / 353 — 100%** |
| `observation_spots` with `row_id` set | **0 / 11** |
| `spatial_areas` in the entire system | 2 (one orchard, one paddock) |

Example of an existing multi-clone block — `Block 18 Chardonnay` (id 4156): clone `C95` on 2 rows,
clone `C2/23` on 45 rows. Block 8948 carries three (`444`, `555`, `666`).

**Greystone are the only customer with materialised rows.** Every other company is on the
`block.row_count` fallback path in `task_rows.py`, where task rows are generated as bare
`row_number` strings with `vineyard_row_id = NULL`. That is fine — sections simply won't apply to
them, which is consistent with the feature being opt-in per company.

**Read that table as: they can already record clonal variation, but can't manage or report on it.**
The work here is finishing something half-built, not starting something new.

---

## 3. Data model

### 3.1 New table `block_sections`

```
id               serial PK
block_id         FK vineyard_blocks(id) ON DELETE CASCADE, NOT NULL, indexed
company_id       FK companies(id) NOT NULL, indexed        -- denormalised, matches every other model
name             varchar(100) NOT NULL                     -- "C2/23", "Mendoza top", "Rows 21-40"
variety          varchar NULL
clone            varchar NULL
rootstock        varchar NULL
planted_date     date NULL
area_ha          numeric NULL                              -- optional, entered not derived (§4)
status           varchar(20) NOT NULL DEFAULT 'producing'  -- reuses BlockStatus values
notes            text NULL
created_at / updated_at
UNIQUE (block_id, name)
```

`status` deliberately reuses the existing `BlockStatus` vocabulary (`developing`, `pre_production`,
`producing`, `redeveloping`, `replanting`, `mothballed`, `retired`) and the shared
`blockStatus.js` util, so a replanted section can be excluded from rollups the same way a replanted
block already is. **No new enum** — `vineyard_blocks.status` is a plain `VARCHAR(20)`, so match it.

### 3.2 Membership — a FK on the row, not a stored range

```
vineyard_rows.section_id   FK block_sections(id) ON DELETE SET NULL, NULL, indexed
```

Explicit FK rather than a stored `row_start`/`row_end` on the section:

- handles non-contiguous membership (rows 1-10 and 31-40 in one section) without special cases
- one join for every rollup
- a row moving between sections is one UPDATE, and can't leave two ranges overlapping
- **`vineyard_rows.row_number` is a `String`** — a stored range would need natural-order comparison
  on every read. Ranges stay a *painting gesture* in the UI, never a stored representation.

### 3.3 Refinement columns on tasks and observations

```
tasks.block_section_id              FK block_sections(id) ON DELETE SET NULL, NULL, indexed
observation_runs.block_section_id   FK block_sections(id) ON DELETE SET NULL, NULL, indexed
observation_spots.block_section_id  FK block_sections(id) ON DELETE SET NULL, NULL, indexed
```

**The rule that makes this safe: `block_id` is ALWAYS populated as well.** A section refines a
block, it never replaces it. So every existing query, filter, permission check, map layer and
report that keys on `block_id` keeps working untouched, and a section task still appears under its
block everywhere it does today.

This is precisely where the `SpatialArea` route fails — see §8.

Task rows for a section-scoped task are generated from that section's rows only: one extra
`.filter(VineyardRow.section_id == ...)` in the `vineyard_rows` branch of
`backend/api/v1/task_rows.py:165`.

### 3.4 Migration

One migration, all columns nullable, no backfill. Suggested slug **`add_block_sections`** (18
chars — `alembic_version.version_num` is `VARCHAR(32)` and an over-length slug silently rolls back
the DDL). Chain off the then-current prod head; re-check with
`SELECT version_num FROM alembic_version` rather than a memory-cached value.

Nothing existing changes behaviour when every `section_id` is NULL, which is the state on day one
for every company including Greystone.

---

## 4. The vine-count problem — read before committing to a date

Yield per section needs vines per section. The plan is to sum vine counts across the section's
rows. `VineyardRow` already exposes a computed `vine_count` property:

```python
# db/models/vineyard_row.py:35
return int(self.row_length / self.vine_spacing)
```

**On current data that computes for zero Greystone rows:**

| | all rows | Greystone rows |
|---|---|---|
| total | 1,330 | 1,281 |
| `row_length` set | 20 | **0** |
| `vine_spacing` set | 725 | 681 |
| **both set → `vine_count` computable** | 20 | **0** |

`row_length` is NULL on every single Greystone row. The design is right; the input data isn't
there. Block-level figures are fine (`area` on 32/32 blocks, `row_spacing` 21/32, `vine_spacing`
20/32), which is why the *existing* block-level estimate works.

### Resolution ladder

Add an explicit nullable `vine_count` integer to `vineyard_rows` and resolve in this order, so a
section always produces a number and always says how good it is:

1. **`vineyard_rows.vine_count`** — entered directly. Growers often know this per row, and it is
   the only figure that accounts for missing or dead vines.
2. **`row_length / vine_spacing`** — the existing computed property, where both are present.
3. **Fall back to the block**: `section_area_ha × vines_per_ha(block.row_spacing,
   block.vine_spacing)`. Only available if `area_ha` was entered on the section.

Surface which rung was used. A yield number carrying "estimated from block spacing" is honest;
one that silently mixes rungs across a section is not — and `run_completion.py` already reports
`n`, `stdev` and `ci95` alongside its means, so this matches the existing tone.

### Getting the data in

Do **not** ask anyone to edit 1,281 rows. Extend the existing `RowRangePainter` to paint
`vine_count` and `row_length` over a range, exactly as it already paints clone. A uniform block is
then one operation, and the endpoint (`PATCH /by-block/{id}/range`) already uses `exclude_unset`,
so painting vine counts leaves clone and spacing untouched.

**This should be its own phase, ahead of any yield work** (§7 phase 2). It is independently useful
— it improves the block-level estimate too.

---

## 5. Feature gating

`Company` already has the mechanism. `companies.feature_overrides` is JSON and
`Company.has_feature(name)` (`backend/db/models/company.py:179`) checks
`feature_overrides["enabled_features"]` before falling back to the subscription. It defaults to
**off** unless explicitly granted, which is exactly the requested behaviour.

- Feature key: **`sub_block_units`**.
- Enabling it for Greystone is a one-row JSON edit, no migration and no deploy.
- Gate the **UI surfaces**, not the data. Sections remain definable in the block edit form for
  anyone with materialised rows — it is only their appearance in task and observation assignment
  that the flag controls. A company that turns the flag off keeps its section definitions and its
  history; the pickers just stop offering them.
- Expose it as `has_sub_block_units` on the company payload the frontend already reads, so no
  client needs to understand the `feature_overrides` shape.
- The toggle itself belongs on **CompanyAdmin → Blocks**, next to where sections are defined,
  with the `?` helper popover pattern already in the design system
  (`project_help_tip_system`) explaining what turning it on changes.

---

## 6. Where it appears

### 6.1 Defining sections — CompanyAdmin → Blocks (no flag needed)

The block edit form gains a **Sections** panel below the existing row tools:

- list of sections with name, clone, row count, and derived vine count with its confidence rung
- create a section, then assign rows to it by painting a range — same gesture as the clone painter,
  which is what Greystone already use
- a row belongs to at most one section; painting a range over rows already in another section
  moves them, and says so
- **unassigned rows are shown as a residual group**, not hidden. A block where 45 of 47 rows sit in
  sections and 2 don't is a data-entry mistake worth surfacing, and it is exactly the shape of
  Block 18.

### 6.2 Task and observation assignment (flag on)

A section appears in the block picker as a child entry under its block. Selecting one sets **both**
`block_id` and `block_section_id`. Selecting the block itself leaves `block_section_id` NULL and
means the whole block, as it does today.

Affected pickers: web `TaskCreationWizard`, `TaskQuickCreate`, observation run creation; mobile
`BlockPickerModal` (shared by task creation and observation capture) and `ObservationsScreen`.
Mobile mirrors the shared service by hand — `packages/mobile/src/api/services.js` cannot import
`@vineyard/shared`.

### 6.3 Detail views

Task detail and observation run detail show the section beside the block —
`Block 18 Chardonnay › C2/23`. Mobile `TaskDetailScreen` already renders a `Block` field in its
head card; this is one more line in the same `<Field>` list.

### 6.4 Observation runs carry the section — this is the yield path

Per §10 answer 1, the grower picks the section **when starting the run**: "select sub block 2 of
block x, does the bunch counts and weights". So `observation_runs.block_section_id` is what carries
yield attribution, and every spot in that run belongs to that section by construction.

That means the run creation flow — web observation run creation and mobile `ObservationsScreen` →
`BlockPickerModal` — is the only place section selection is strictly required for yield.

### 6.5 Per-spot row capture — a refinement, not a gate

`observation_spots.row_id` is **0% populated**: capture never records which row a spot was taken in.
Given 6.4 this is **not** a blocker for section-level yield, but it is still worth doing:

- within-section granularity (which end of the section is underperforming)
- it lets a run that spans sections be attributed correctly after the fact
- it improves every existing per-block estimate, independently of sections

`SpotCaptureScreen` would gain a row selector, defaulting to the row nearest the captured GPS point
where row geometry exists (`vineyard_rows.geometry` is a LINESTRING). Sequence it after the
sections work, not before it.

---

## 7. Rollups

### 7.1 Work — free

`task_rows.vineyard_row_id` is 100% populated for Greystone, so joining
`task_rows → vineyard_rows → section_id` gives per-section progress, completion and labour hours
with **no new write path at all**. Directly assigned section tasks come through
`tasks.block_section_id`. Both routes, unioned, are the section's work history.

### 7.2 Yield estimate

`run_completion.py` computes `yield_t_per_ha` from `bunches_per_vine × bunch_weight_g ×
vines_per_ha`, where `vines_per_ha` derives from **block-level** spacing. For sections:

- attribute by the run's `block_section_id` (§6.4). Per-spot `row_id` is a later refinement.
- compute vines from the section's own rows via the §4 ladder, not from block spacing — a section
  with different spacing is otherwise misattributed, which is the whole point of separating it
- **keep writing the block-level figure as well**, so nothing reading `summary_json` today breaks
- carry the §4 confidence rung into `summary_json` beside the existing `n` / `stdev` / `ci95`

The arithmetic wants stating plainly, because it is the one place a section can quietly produce a
worse number than the block it came from: **`t/ha` needs an area, and a section has no measured
one.** With vines counted per row (§4 rung 1) the honest formula is per-vine, scaled by the
section's own vine total:

```
section_tonnes   = mean_bunches_per_vine × mean_bunch_weight_g × section_vines / 1e6
section_t_per_ha = section_tonnes / section_area_ha        -- only if area_ha was entered
```

Report `section_tonnes` always; report `t/ha` only when `area_ha` is present. Deriving a section
area by pro-rating the block's hectares across row counts assumes uniform row length and spacing,
which is exactly the assumption a clonally distinct section is likely to break.

### 7.3 Actual harvest yield — out of scope, and does not exist anywhere

Confirmed estimated-only (§10 answer 1), so this is a note on the landscape, not planned work.

There is **no harvest or tonnage model in Grow at all**. No weights, no bins, no harvest event. The
only `harvest_date` columns are in the blockchain traceability module and the Insights
seasonal-stats form, neither of which is a yield record. If real weights off the block are ever
wanted, that is a bigger piece of work than sub-blocks itself and needs its own scoping.

---

## 8. Why not spatial areas

`SpatialArea` looks like the natural fit — self-referencing `parent_area_id`, company-scoped
polygons, and `Task` already carries `spatial_area_id`. Three things rule it out:

1. **No `block_id`.** A spatial area cannot be declared as being inside a block. Adding one means
   changing what the model means.
2. **Its vocabulary is non-vineyard land.** The `AREA_TYPES` list in `SpatialAreaForm.jsx` is
   paddock, orchard, plantation forestry, native forest, wetland, waterway, conservation area,
   infrastructure, waste management. Its 2 live rows (one orchard, one paddock) confirm it is the
   "other land on the property" concept.
3. **`ObservationRun` has no `spatial_area_id`.** Yield estimates are computed at run completion,
   so a spatial-area section could not carry yield without adding that link anyway — at which point
   the work of §3.3 has been done, with worse semantics.

And decisively: **`tasks.spatial_area_id` is an alternative to `block_id`, not a refinement of
it.** A task on a spatial area has `block_id = NULL`. Making a section both would break the
existing either/or assumption in every filter and rollup that reads those columns. The
`block_section_id` design in §3.3 avoids this entirely by keeping `block_id` always populated.

---

## 9. Phasing

Each phase is independently shippable and additive. Revised after the §10 answers — the old phase 6
(actual harvest) is dropped, and per-spot row capture moved **after** yield rather than gating it.

| # | Scope | Notes |
|---|---|---|
| **1** | `block_sections` table + `vineyard_rows.section_id` + Sections panel in the block edit form | Read-only value: they can finally *name* what they already have. No flag needed. |
| **2** | `vineyard_rows.vine_count` + paint it by range in `RowRangePainter` | **The one hard gate on yield** (§4) — no workaround exists. Independently improves block-level estimates. |
| **3** | `tasks.block_section_id` + `feature_overrides` flag + pickers + detail views + **section-scoped task row generation (§10a)** | The visible feature. Work rollup (§7.1) comes free with it. |
| **4** | `observation_runs.block_section_id` + section selection in run creation | Small — the picker work from phase 3 is reused. |
| **5** | Section-aware yield estimate in `run_completion.py` | Needs **2 and 4**. Not 6. |
| **6** | Per-spot `observation_spots.row_id` capture on mobile (§6.5) | Refinement. Worth doing on its own merits, but nothing above waits on it. |

Phases 1 and 2 involve **no mobile work at all**, and phase 2 is the long pole for yield because it
needs data entered, not just code written — start it early even if phase 1 slips. Phase 3 is the
first with a mobile surface, though picker changes are JS-only so no EAS rebuild
(`project_mobile_expo_dev_testing`).

---

## 10. Questions — answered (Pete, 2026-08-15)

All four are closed. Treat these as settled alongside §1.

**1. Estimated or actual yield? → Estimated.**
> "Estimated at the moment — user uses the yield estimation observation template, selects sub block
> 2 of block x, does the bunch counts and weights. Aggregation up to sub block level."

Two consequences, and the second reshapes the phasing:

- **Actual harvest recording (old phase 6) is out of scope.** §7.3 stands as a note on what does
  not exist, not as work.
- **Per-spot `row_id` is NOT a prerequisite for section yield.** The section is chosen when the
  *run* is created, so `observation_runs.block_section_id` carries it and every spot in that run
  belongs to that section by construction. §6.4 was wrong to call row capture the blocking
  prerequisite — it is a refinement that buys within-section granularity, not the gate. **The real
  gate on yield is the vine count (§4), which has no workaround.**

**2. Geometry? → No.** Row membership only. No drawing UI, no PostGIS column on `block_sections`.
If sections are ever wanted shaded on the map, derive the hull from the rows' LINESTRINGs at read
time rather than storing a second copy that can drift from membership.

**3. Permanent or re-cut by season? → Permanent.** `status` handles replanting. No season
dimension on membership, and no date-scoping on any rollup.

**4. Own row numbering? → No.** Row numbering lives in the greater block; a section is a filter
over it. `task_rows` linkage is preserved unchanged.

---

## 10a. Section-scoped tasks and row generation

> "For tasks we need to be able to assign a task to a sub block, then generate rows for the sub
> block. EG Block 1 has 50 rows, two sub blocks, 25 rows each. Task 1 is assigned to sub block B —
> rows 26-50 generated. But the lineage needs to roll up as described earlier."

**Worked example.** Block 1, rows 1-50. Section A = rows 1-25, Section B = rows 26-50. A task
assigned to Section B gets `block_id = <Block 1>` and `block_section_id = <Section B>`, and
generates **25** `task_rows` — one per row 26-50, each with a real `vineyard_row_id`.

The change is one filter in the `vineyard_rows` branch of `generate_task_rows`
(`backend/api/v1/task_rows.py:165`):

```python
vineyard_rows = db.query(VineyardRow).filter(VineyardRow.block_id == block.id)
if task.block_section_id:
    vineyard_rows = vineyard_rows.filter(VineyardRow.section_id == task.block_section_id)
vineyard_rows = vineyard_rows.order_by(VineyardRow.row_number).all()
```

Three things to get right:

- **Order by natural sort, not `row_number`.** The existing `.order_by(VineyardRow.row_number)` is
  a lexicographic sort on a `String` — row 10 lands before row 9 today. Section ranges make this
  much more visible ("rows 26-50" reading as 26, 27, 3x, 4x, 50 out of order), so fix it here.
- **The `block.row_count` fallback cannot serve a section.** If a block has no materialised rows
  there is nothing carrying `section_id`, so a section task has no rows to generate. Refuse with a
  clear message rather than silently generating the whole block's rows — that would be a task
  claiming 50 rows of work when 25 were meant.
- **Lineage rolls up both ways, and they must not double-count.** A section's work history is the
  union of (a) tasks with `block_section_id` set directly and (b) tasks whose `task_rows` join
  through to rows in the section. A section-assigned task appears in *both*. De-duplicate on
  `task.id` when rolling up, or the same task's hours get counted twice.

---

## 11. Notes for whoever builds it

- **`vineyard_rows.row_number` is a `String`.** SQL ordering puts row 10 before row 9. Use the
  existing `byNatural` comparator (`packages/shared/src/utils/naturalSort.js`, mirrored at
  `packages/mobile/src/utils/naturalSort.js`) anywhere rows are listed or ranged.
- **`clonal_sections` (JSON, sub-row precision) exists on `VineyardRow` with a live endpoint and
  zero rows using it.** It models clone changes *part-way along a row*. Sections as designed here
  are whole-row membership. Don't conflate them, and don't build on `clonal_sections`.
  **That mid-row decision has now been taken — see §12.**
- **8,692 of 8,781 `vineyard_blocks` have `company_id = NULL`** — the national reference dataset,
  not customer data. Any section query must be company-scoped or it will trawl all of it.
- Keep mobile's hand-mirrored `services.js` in step with `packages/shared` — mobile cannot import
  `@vineyard/shared` (`feedback_mobile_no_shared_imports`).
- Two multi-clone blocks (4156, 8948) already exist in prod and make a real test case from day one.

---

## 12. Partial rows — "the bottom half of rows 20-30" (2026-08-17)

> Pete: *"consider if a subblock is say the bottom half of a subset of rows in a block — I know a
> few producers who have this set up."*

This is real and it breaks §3.2 as written. §3.2's `vineyard_rows.section_id` is a scalar FK, so
membership is all-or-nothing per row: a row is in exactly one section, along its whole length.
"The bottom half of rows 20-30" cannot be expressed at all.

### 12.1 The finding that decides the design

The obvious anchors for "half way along a row" are metres, vine index, or a point on the row
geometry. **Prod, 2026-08-17 — none of them exist:**

| Anchor | Availability | Verdict |
|---|---|---|
| Row **geometry** (`LINESTRING`, linear-referencing via `ST_LineSubstring`) | **0 of 1,330 rows** have geometry | Dead. Also kills draw-a-polygon-and-intersect. |
| **Metres** along the row (`row_length`) | **20 of 1,330** rows in the entire DB | Dead for Greystone (0 of 1,281). |
| **Vine index** (`clonal_sections`-style `start_vine`/`end_vine`) | Needs `vine_count` = `row_length / vine_spacing`; `row_length` is NULL | Dead, and it would move the §4 vine-count gap onto the critical path instead of leaving it on yield alone. |
| **Proportional fraction** of the row (0.0 → 1.0) | Needs **nothing** | The only option that works today. |

`vine_spacing` is set on 20 of Greystone's 32 blocks, so the vine-index route is *nearly* viable —
but "nearly" on a compliance-adjacent number is not viable. **Anchor on fractions.**

The pleasant consequence: a fraction is stable under later data improvement. When `row_length` or
row geometry eventually lands, `0.5` becomes real metres with no migration and no re-entry.

### 12.2 Revised membership model — supersedes §3.2

Replace the scalar FK with a join table carrying an optional extent:

```
block_section_rows
  id               serial PK
  section_id       FK block_sections(id) ON DELETE CASCADE, NOT NULL, indexed
  vineyard_row_id  FK vineyard_rows(id)  ON DELETE CASCADE, NOT NULL, indexed
  start_frac       numeric(5,4) NOT NULL DEFAULT 0    -- 0.0000 .. 1.0000
  end_frac         numeric(5,4) NOT NULL DEFAULT 1
  CHECK (start_frac >= 0 AND end_frac <= 1 AND start_frac < end_frac)
  UNIQUE (section_id, vineyard_row_id)
```

**A whole-row section is just `(0, 1)`.** That is the point: there is one representation, not two.
The simple case stays simple, the partial case is the same table, and no query needs to branch on
"is this a partial section". Every rollup is still one join — to a join table instead of a column.

`vineyard_rows.section_id` from §3.2 is **dropped**; it never shipped, so there is nothing to
migrate. Everything else in §3 stands unchanged, including the rule that matters most:
**`block_id` stays always populated and `block_section_id` only refines it.**

**Non-overlap is enforceable in Postgres**, which is worth taking:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE block_section_rows ADD CONSTRAINT no_overlapping_section_extents
  EXCLUDE USING gist (vineyard_row_id WITH =, numrange(start_frac, end_frac) WITH &&);
```

That lets rows 20-30 carry a "bottom half" section *and* a "top half" section, while making it
impossible for two sections to claim the same stretch of the same row. Confirm `btree_gist` is
available on RDS before relying on it; the app-level check is the fallback, not the plan.

### 12.3 The origin problem — read this before building the UI

**A fraction needs an origin, and with no row geometry there is no origin.** Nothing in the data
says which end of row 20 is "the bottom". `start_frac = 0` is meaningless on its own.

Resolve it by splitting the two jobs the fraction is doing:

- **Maths** — area, vine count, yield, "how much of this row belongs to the section". Needs only
  the *extent* (`end_frac - start_frac`), never the origin. Works today, exactly.
- **Field navigation** — telling a tractor driver where to start. Needs the origin, and a number
  can't supply it.

So add a plain descriptive label on the section and let humans carry the origin:

```
block_sections.extent_label   varchar(60) NULL   -- "from the northern end", "road end", "below the track"
```

Show it wherever the section appears in the field. It is deliberately free text: encoding a
compass bearing we cannot verify against absent geometry would be false precision. When row
geometry lands, the label stays as provenance and the origin becomes derivable.

**Do not let the UI imply a precision the data doesn't have.** A slider that reads "50%" is
honest; one that reads "142 m" or "vine 87" is not, until §4 phase 2 is done.

### 12.4 Knock-ons

**Task row generation (§10a).** Unchanged in shape — still one filter, now a join:

```python
vineyard_rows = (db.query(VineyardRow)
                   .filter(VineyardRow.block_id == block.id))
if task.block_section_id:
    vineyard_rows = (vineyard_rows
        .join(BlockSectionRow, BlockSectionRow.vineyard_row_id == VineyardRow.id)
        .filter(BlockSectionRow.section_id == task.block_section_id))
```

A half-row section still generates **one `task_row` per row** — `task_rows` are per-row and there
is no reason to fragment them. The extent belongs to the section, not to the task row. But
**surface the extent in the row list on mobile** ("Row 24 — bottom half"), or the crew does the
whole row. That is the single most likely way this feature fails in the field.

Two sections on one row generate two `task_rows` on the same `vineyard_row_id` under *different*
tasks, which the existing constraints allow. Completing one does not complete the other — correct,
but confirm it reads sensibly in the mobile row list before shipping.

**Yield (§7.2).** Vines in a section = `Σ (row.vine_count × (end_frac − start_frac))`, rounded once
at the end. Still gated on §4 phase 2, exactly as before — partial rows change the arithmetic, not
the blocker.

**Area (`area_ha`).** Stays entered, not derived, as §3.1 has it. With no row geometry there is no
honest way to derive the area of half a row.

**`clonal_sections` still isn't the answer.** It is vine-indexed (so it inherits the dead
`vine_count` dependency), it is unconstrained JSON on the row with no FK to a section, and it has
0 rows in prod. Leave it alone.

### 12.5 Phasing impact

Small. Phase 1 in §9 becomes "`block_sections` + `block_section_rows` + Sections panel" instead of
"+ `vineyard_rows.section_id`" — same phase, same shippability, one extra table.

**Phase 1 can and should default every section to `(0, 1)`.** Ship whole-row sections first, get
them named and in use, and add the extent control in the painter as a phase 1b. Partial rows are
the harder UI and the rarer case; they should not delay the common one.

Suggested migration slug: **`add_block_sections`** (18 chars — `alembic_version.version_num` is
`VARCHAR(32)` and an over-length slug silently rolls back the DDL).

### 12.6 Still open for Pete

1. **Do the producers you know split a row at a consistent point across the whole range** (a clean
   line across rows 20-30), or does each row break at its own point? A consistent line is one
   fraction applied to a range — one gesture in the painter. Per-row breaks need per-row entry,
   which is a materially bigger UI.
2. **Is the split ever finer than halves/thirds?** If it is always a rough proportion, the painter
   offers presets and no one ever types a number.
