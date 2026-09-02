# Greystone feedback — scope and build order

**Date:** 2026-09-01
**Status:** scoped, nothing built. Decisions below were taken with Pete in session; do not re-litigate them.
**Origin:** Greystone field feedback — observation workflow is clunky for an aggregated block spot; sub-block management units wanted; plus an H&S-only account type, consumption-rate reporting, and a run of Insights work.

---

## 1. Decisions taken (2026-09-01)

| # | Decision | |
|---|---|---|
| D1 | **Management units are the first workstream** | Everything unit-level hangs off them |
| D2 | **Spots stay; a run gains an aggregate roll-up** | Not "one record instead of spots" — the field effort is fixed by faster capture, not less capture |
| D3 | **The general account is a NEW 6th user type** | Not a flag on `company_user` |
| D4 | **Counts render as an interpolated in-block surface** | Not a per-unit choropleth |
| D5 | **Yield is ESTIMATION ONLY** | No harvest/tonnage model. The estimate can never be checked against actual |
| D6 | **Rows get real geometry, generated from a painted first row** | Pete's design, and it supersedes the "type in row lengths" options |
| D7 | **Row generator takes count OR spacing, showing the other live** | A vineyard is planted to a real spacing; a count is what people remember |
| D8 | **The generator previews and confirms every time** | It must never silently overwrite hand-entered clone data |
| D9 | **A clipped row keeps every segment, length summed** | Multi-part geometry, one row record, truthful planted metres |
| D10 | **Management units are WHOLE ROWS in v1** | Stored as `(0,1)` fractions so partial rows need no model change later |
| D11 | **LTA bunch weights: per unit, carried forward** | Entered once, reused each season until changed |

---

## 2. What the data actually says (prod, read-only, 2026-09-01)

Verified this session. Several older assumptions were wrong; these numbers supersede them.

| Fact | Figure | Consequence |
|---|---|---|
| `vineyard_rows` total | **1,369** | Greystone 1,281, company 24 has 64, company 20 has 24 |
| rows with `row_length` | **59 of 1,369** | All 59 are company 24 (test). **Greystone has ZERO.** |
| rows with `geometry` | **0 of 1,369** | Column exists and is empty — the generator needs no migration for it |
| rows with `vine_spacing` | **764 of 1,369** | Better than expected. `vine_count = length ÷ spacing` computes for these the moment length exists |
| rows with `clonal_sections` | **0** | Dead feature, ignore it |
| customer blocks (non-parcel) | **94** | The other 8,691 rows in `vineyard_blocks` are `company_id IS NULL` reference parcels |
| **Greystone blocks** | **32, all 32 with a polygon** | 30 have `row_count`, 21 have `row_spacing` |
| observation spots, all companies, all time | **48** | 43 carry GPS, **0 carry `row_id`**, 48 carry `block_id` |
| busiest block by spots | **30 spots (block 4147)** | Every other block has 2 or fewer |
| observation runs | 44 (Greystone 33) | |
| `task_assets` | **7 rows, 1 with `actual_hours`** | Machinery-cost backfill is a non-problem at this size |
| completed tasks / live cost snapshots | **27 / 2** | |
| users | **16** — 11 company_admin, 3 company_user, 1 manager, 1 auxein_admin | No contractor users exist yet |

### The two findings that change the plan

**1. The raster cannot be built from existing data.** There are **48 observation spots in the entire database**, and only one block has ever accumulated more than two. An interpolated in-block surface (D4) needs many well-distributed spots per block. So W5 is not blocked by code — it is blocked by a season of capture that has not happened yet. Whatever we build for counts is only as good as the spots collected from now on.

**2. That makes capture the time-critical item, not the foundational one.** Row geometry can be entered in July as easily as September. **Bud counts cannot** — the window is open now. D1 puts management units first on dependency grounds, and that is right architecturally, but a missed capture window is unrecoverable while a missed data-entry window is not.

**Recommendation: ship W3 (capture) first as a small, self-contained release, then W1, then W2.** W3 is days, not weeks, and it is what makes the rest of the season's data worth having. This is a sequencing suggestion against new evidence, not a reversal of D1 — units still come before everything that depends on them.

---

## 3. Build order

```
NOW      W3  Observation capture — sticky values + run aggregate     (season-critical, small)
THEN     W1  Row geometry generator — "Paint your rows"              (unblocks W2 extents, W7, vine counts)
THEN     W2  Management units — row-anchored sections                (the spine)
THEN     W6  LTA bunch weights + trajectory                          (needs W2)
         W7  Cost per 100 m and per unit                             (needs W1 + W2)
         W5  Counts → interpolated surface → yield estimate          (needs W3 data, W2 grain)
PARALLEL W4  General user type + site sign-in/out                    (no dependency on any of the above)
         W8  Insights wiring — phenology EL, obs→insight, My Site    (independent, smaller pieces)
```

W4 and W8 depend on nothing here and can be run by whoever is not on the critical path.

---

## W1 — Row geometry generator ("Paint your rows")

**The idea (Pete's):** open a modal showing the block polygon on a map. The user draws the first row. They give a row count *or* a row spacing. Rows are generated parallel at even spacing, clipped to the polygon, which produces correct variable lengths for free.

**Why it is more than a data-entry convenience.** Row geometry being empty is what killed metre-anchored extents, per-vine indexing and `ST_LineSubstring` partial rows in the August design — that design fell back to proportional fractions *because nothing else had data behind it*. Real geometry revives all of it, and it removes the "which end is the bottom?" origin problem, because a line has ends.

It also turns `row_length` from something 1,369 rows must be typed into, to something derived.

### Design

- **Input:** first-row line (2-point draw, or snap to a polygon edge), then either a count or a spacing — **each shows the other live (D7)**, computed from the polygon's width perpendicular to the drawn bearing.
- **Bearing:** taken from the drawn line. Subsequent rows offset perpendicular to it.
- **Fill direction:** the drawn row is treated as an edge; a control flips which side fills, with a live preview. (A first row drawn up the middle should offer "fill both sides".)
- **Clipping:** `ST_Intersection` with the block polygon. **Every segment is kept and length is summed (D9)** — one row record, multi-part geometry. A row that comes back split or unusually short is flagged in the preview.
- **Numbering:** direction picked in the modal, defaulting to match the block's existing `row_start`/`row_end`.
- **Write (D8):** the preview names exactly what will be *attached to an existing row*, *created*, and *left alone*, and writes nothing until confirmed. Greystone's 1,281 rows carry variety, clone and rootstock — **the generator must never delete or replace a row record.** Matching is by `row_number`.
- Derived on write: `row_length` from the geometry. `vine_count` where `vine_spacing` exists (764 rows already do).

### Phases
1. **Generate and preview only** — draw, count/spacing, live preview, no writes. Provable against Greystone's 32 polygons.
2. **Attach + create with confirmation**, including the split/short flags.
3. **Derived length and vine count**, with the resolution rung recorded (geometry → typed → block fallback) so a report can say where a number came from.

### Traps
- `vineyard_rows.geometry` **already exists and is empty** — no migration needed for it.
- A wrong block polygon will now produce wrong lengths, wrong vine counts and wrong costs, silently. The short/split flag is the only thing standing between a bad outline and a bad number: do not make it dismissible in bulk.
- Do not show metres anywhere the geometry is generated but unconfirmed.

---

## W2 — Management units (row-anchored sections)

Supersedes nothing in `docs/plans/SUB_BLOCK_SECTIONS.md` — that design stands. Recap of what is settled:

- New `block_sections` table plus a join `block_section_rows(section_id, vineyard_row_id, start_frac, end_frac)`.
- **`block_id` stays ALWAYS populated; the section refines it.** Every existing filter, permission and report keyed on `block_id` keeps working untouched. This is the rule that makes the whole thing safe.
- **NOT `SpatialArea`** — `tasks.spatial_area_id` is an *alternative* to `block_id`, not a refinement, so a section there breaks the either/or assumption everywhere.
- **v1 ships every section as `(0,1)` (D10).** Partial rows need no model change when they land — and after W1 they can be anchored to real metres rather than fractions.
- Gate the UI on `Company.has_feature('sub_block_units')` — defaults off, one JSON edit to enable for Greystone, no migration, no deploy.

**Assignment surfaces:** tasks and observation runs both gain an optional `block_section_id` alongside `block_id`. Reporting rolls up to both levels — a task on a section counts toward the section *and* the block, never one or the other.

**Open:** whether a task assigned to a section should still generate one `task_row` per row (August answer: yes, don't fragment) and how the extent surfaces in the mobile row list once partial rows exist ("Row 24 — bottom half"). Not a v1 problem under D10.

---

## W3 — Observation capture: sticky values + run aggregate

**Two distinct problems, one release.**

### 3a. Sticky field values within a run (the actual Greystone complaint)
Pete's example: on bud counts, *vines sampled per spot* is essentially always 1 and *target buds* is the same for every spot in the run. Both are re-entered per spot today.

**Fix:** the first spot's answers become the defaults for every subsequent spot in that run. The observer changes only what differs. Implementation options to settle before building: sticky-by-default for every field vs. a `sticky` flag on the template field definition. Sticky-by-default is fewer taps and no template migration; a flag is safer for fields where carrying a value forward would be actively wrong (a GPS-derived reading, a photo).

Also in scope: block/row/template context carried from the previous spot rather than re-selected.

### 3b. Run-level aggregate (D2)
A run gains a stored aggregate of its spots — count of spots, mean/total per numeric field — so a block-level figure exists without anyone doing arithmetic. Spots remain the record of truth; the aggregate is derived and recomputed, never typed.

### 3c. Record the row on a spot
**`observation_spots.row_id` is populated on 0 of 48 spots.** Capture never asks. Nothing can be attributed below block level until it does, which blocks every per-unit yield estimate. `SpotCaptureScreen` needs a row selector — **worth doing even if units are shelved**, because it improves every per-block estimate too.

---

## W4 — General user type (mobile-only, H&S)

**A new 6th user type (D3):** `general_user`, added to `UserType` in `backend/core/permissions.py` and mirrored in `packages/shared/src/utils/permissions.js`.

**Access:** incidents, visitors, risks, map viewing, and site sign-in/out. **No** tasks, **no** observations, **no** assets, **no** timesheets, **no** costs. Mobile only — the web/mobile access rule already has a precedent for refusing a login by surface.

**Site sign-in/out** is the point of the account: oversight of who is on site, not just visitors. Two existing models already do a version of this — `VisitorVisit` (a visitor, hosted, per company, no property) and `ContractorMovement` (a contractor, with `property_id`, arrival/departure). Staff have neither.

**Open question — must be answered before building:** does staff sign-in/out extend the visitor register, extend contractor movements, or get a third model? A third model means three near-identical tables and three reports; extending one means a nullable "who is this" that is a user, a visitor or a contractor. The site-access report already merges visitors and contractors, which argues for one movement model with a typed subject.

**"Saved details so login is super easy":** the account persists its own identity, so signing on to a site is one tap plus a property choice. Worth confirming whether this must work with no network (sign-on queued offline) — the offline write queue exists and 42 writes already opt in.

**Permission-matrix warning:** adding a tier touches all 17 modules in the backend matrix and its frontend mirror. The mirror already fell out of sync once this week — `costs` was missing from the frontend map entirely, which silently answered false for everyone. Add the tier to both in the same change, and add a check that the two module lists match.

---

## W5 — Counts, rasters and yield estimation

**Capture:** bud counts, bunch counts, flower counts — observation templates, per spot, with the row recorded (W3c) and GPS (43 of 48 spots already carry it).

**Surface (D4):** an interpolated in-block surface from spot counts. The interpolation engine and colour-ramp machinery already exist for climate surfaces and the contract is documented; this is a new variable and a much smaller domain, not new maths.

**The honest constraint, from §2:** with 48 spots total and one block that ever reached 30, no block in the database can support an interpolated surface today. **This workstream cannot be validated until a season of capture exists.** Build the capture first (W3), watch the density, and build the surface when a block has enough spots to test against. Do not ship a surface that renders confidently from four points.

**Yield estimation (D5):** `bunches per vine × vines × LTA bunch weight`, per management unit, rolled up to block. Vines come from W1's derived `vine_count`. **There is no harvest model, so the estimate is never reconciled to actual** — every figure has to say so, the same way costing says `is_complete: false`.

---

## W6 — LTA bunch weights and trajectory

**Storage (D11):** one weight per management unit, entered once, carried forward each season until changed. Needs an effective-from date so a change does not restate last season's trajectory — the same lesson as pay rates, where resolving at the work date rather than the completion date was worth 20%.

**Presentation:** current trajectory (this season's counts × the unit's LTA weight) against the LTA trajectory, per unit and rolled up to block.

**Open:** whether the LTA weight is a single number or a per-phenology-stage series, and whether "LTA trajectory" means the unit's own history (which does not exist yet) or a regional/varietal reference.

---

## W7 — Cost per 100 m and per unit

Cost per hectare works today. **Cost per 100 m is a division away once W1 lands** — the blocker was never code, it was that `row_length` is populated on 59 of 1,369 rows and zero of Greystone's.

- Denominator: summed length of the rows actually worked (`task_rows` → `vineyard_rows.row_length`).
- Same rule as everywhere else in costing: **no denominator, no figure** — `None`, never `0.00`.
- Add cost per unit and cost per vine once W1 and W2 land; both fall out of the same join.

**Consumption rates** (consumables, machinery hours, staff hours per hectare / per 100 m / per vine) come from the same denominators. The numerators already exist: `StockMovement` for consumables, `TaskAsset.actual_hours` for machinery (capture landed 2026-09-01), `_task_hours` for labour.

---

## W8 — Insights wiring

Three independent pieces, smallest first.

**8a. Phenology EL stage on the Insights page.** The point-phenology path is built. This is surfacing the current EL stage per site/property and wiring it into the page.

**8b. Pest/disease observation → an insight and a follow-up task.** An observation recording pest or disease pressure should be able to raise an Insights item and create a follow-up task in one action. Needs: which observation templates or fields qualify, whether the task is created automatically or offered, and what it inherits (block, section, assignee, due date).

**8c. My Site into Grow, with per-property weather location.** The Insights Pro site model exists — a point, its resolved grid cell, and its extracted 1986-2023 record. Wiring it into Grow means each **property** carries a weather location, backfilled, so Grow shows the property's own climate record rather than a regional one.

**Open on 8c:** does each property get its own site (which interacts with `pro_site_quota`, since a point subscription is priced separately and stacks), or does a Grow property resolve to a grid cell directly without consuming a quota slot? These are different commercial answers, not just different code.

---

## Immediate items already actioned or pending, not part of the above

- **Sentry / build 10** — blocked on an account and DSN only Pete can create. Everything else can be wired now, reading the DSN from the environment so the native module ships in build 10 and the value lands later.
- **Bulk cost recompute** — the single-task endpoint exists (`POST /tasks/{id}/cost/recompute`, with `?preview=true`). A bulk path and a UI do not. At **27 completed tasks and 7 task-asset rows**, the backfill is trivially small — but note that machinery cost cannot be recomputed onto historical tasks because `TaskAsset.actual_hours` was never captured before 2026-09-01. Recompute picks up rates; it cannot invent hours.

---

## Open questions, consolidated

1. **W3a** — sticky by default on every field, or a `sticky` flag per template field?
2. **W4** — does staff site sign-in/out extend the visitor register, extend contractor movements, or get a third model?
3. **W4** — must sign-on work offline?
4. **W6** — is the LTA weight one number per unit, or a series by phenology stage? And what is the "LTA trajectory" derived from, given no unit has history yet?
5. **W8b** — which observations qualify as pest/disease, and is the follow-up task automatic or offered?
6. **W8c** — does a Grow property consume an Insights site quota slot, or resolve to a grid cell outside the quota?
7. **W1** — when the first row is drawn up the middle of a block rather than along an edge, is "fill both sides" the default or an explicit choice?
