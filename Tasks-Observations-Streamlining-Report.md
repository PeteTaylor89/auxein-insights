# Tasks & Observations — Streamlining Analysis

**Date:** 2026-03-20
**Author:** Claude (analysis requested by Peter Taylor)

---

## 1. Current Architecture Summary

### Three Interconnected Systems

| Aspect | Tasks | Observations | Assets & Consumables |
|--------|-------|--------------|---------------------|
| **Template** | TaskTemplate (equipment IDs, consumable specs, GPS config) | ObservationTemplate (JSON field schema) | Asset catalogue (physical + consumable) |
| **Planning** | Direct creation from template | ObservationPlan → targets + assignees | Stock levels, reorder thresholds |
| **Execution** | Task lifecycle (7 states) with row-level progress | ObservationRun → ObservationSpots | TaskAsset junction: planned vs actual usage |
| **Location** | Block OR spatial area (flexible) | Block + row (structured) | StockMovement tracks block-level application |
| **Data capture** | Completion notes + photos | Dynamic form fields per spot + media | Pre-task checks, post-task readings |
| **GPS** | Full tracking (points, speed, segments) | Single GPS point per spot | Coverage area for application rate calculation |
| **Consumable tracking** | TaskAsset.planned_quantity → actual_quantity | None | StockMovement (purchase/usage/disposal), batch tracking |
| **Compliance** | — | — | ACVM registration, withholding periods, organic/SWNZ certification |
| **Calibration** | TaskAsset.requires_calibration flag | — | AssetCalibration (flow rate, pressure, tolerance) |

### The Task → Asset → Stock Pipeline

```
TaskTemplate
  ├── required_equipment_ids: [sprayer_id, tractor_id]
  ├── optional_equipment_ids: [gps_unit_id]
  └── required_consumables: [{asset_id: copper_id, rate_per_hectare: 2.5, unit: "L"}]
        │
        ▼
Task (created from template)
  └── TaskAsset (junction, per asset)
        ├── planned_quantity: 25L (= rate × hectares)
        ├── planned_hours: 4h (equipment)
        ├── requires_calibration: true
        ├── pre_task_check_completed: false
        │         │
        │    [Task execution]
        │         │
        ├── actual_quantity: 27.5L
        ├── actual_hours: 4.5h
        ├── actual_rate: 2.75 L/ha
        ├── batch_number: "CU-2026-003"
        └── actual_cost: $142.50
              │
              ▼
StockMovement (created on completion)
  ├── movement_type: "usage"
  ├── quantity: -27.5 (negative = stock out)
  ├── task_id: → links back to task
  ├── block_id: → where applied
  ├── usage_rate: 2.75 L/ha
  ├── area_treated: 10 ha
  ├── stock_before: 100L
  └── stock_after: 72.5L
              │
              ▼
Asset.current_stock: 72.5L (auto-updated)
```

**Critical gap identified:** The `actual_quantity` update on TaskAsset and automatic StockMovement creation on task completion are **not wired up**. The models support it, but no endpoint triggers the flow automatically. This is manual-only via the stock movements API.

### The Observation System (No Asset Integration)

```
ObservationTemplate (16 system + company custom)
  └── fields_json: [{name: "incidence_percent", type: "number"}, ...]
        │
        ▼
ObservationPlan (scheduled)
  ├── targets: [{block_id, row_labels, sample_size}]
  ├── assignees: [user_ids]
  └── rrule: "FREQ=WEEKLY" (optional recurrence)
        │
        ▼
ObservationRun (execution)
  ├── plan_id: nullable (ad-hoc runs have no plan)
  └── spots: [{data_json: {field_values}, gps, photos}]
```

**Key contrast with tasks:** Observations have no concept of:
- Equipment requirements or calibration
- Consumable usage or stock movements
- Pre/post-task checks
- Batch tracking or compliance data

This matters because a spraying task often produces observation-worthy data (coverage assessment, weather conditions at application) and an observation often triggers a task (disease detection → spray action).

### Global Observation Templates (16 system templates)

| Template | Type | Fields | Vineyard-Specific? |
|----------|------|--------|--------------------|
| Phenology (EL Stages) | phenology | 3 | Yes |
| Bud Count (Post-pruning) | bud_count | 5 | Yes |
| Bunch Count (per vine) | bud_count | 4 | Yes |
| Flower Count / Fruit Set | flower_count | 5 | Yes |
| Yield Estimation (Pre-veraison) | yield | 5 | Yes |
| Yield Estimation (Post-veraison) | yield | 5 | Yes |
| On-Site Lab Sampling | lab_sampling | 9 | Yes |
| External Lab Sampling | lab_sampling | 19 | Yes |
| Growth / Canopy | growth | 5 | Yes |
| Vine Health | disease | 4 | Yes |
| Pests & Diseases | disease | 9 | Yes |
| Beneficial Species | pest | 3 | Partially |
| Biosecurity | biosecurity | 4 | Partially |
| Land Management | land_management | 5 | No |
| Frost Event | weather | 5 | Partially |
| Free-form Observation | other | 1 | No |

---

## 2. The Core Problem: Overlapping Workflows

### 2.1 — "Is this a task or an observation?"

| Scenario | Current Path | Natural Path | Asset Involvement |
|----------|-------------|--------------|-------------------|
| "Spray Block 5 with copper" | Create task → add consumables → calibrate sprayer → start → GPS track → complete → **manually** create stock movement | Should auto-deduct stock on completion | Sprayer (calibration), copper (consumable), tractor (equipment) |
| "Check Block 7 for botrytis" | Create obs plan → template → run → spots | Quick action → pick block → record | None |
| "Spray Block 7 for botrytis (following observation)" | Create new task from scratch | Should pre-fill from observation context | Fungicide (consumable), sprayer (equipment) |
| "Prune Block 3, record cane weights" | Create task + separate observation run | Should capture pruning data IN the task | Secateurs (equipment) |
| "Apply fertiliser, record application rate" | Create task with consumable → complete → **then** create separate observation to record conditions | Task should capture application conditions at completion | Fertiliser (consumable), spreader (equipment) |
| "Weekly disease monitoring walk" | Create obs plan with recurrence | Correct, but completion should suggest follow-up tasks if thresholds exceeded | None directly, but may trigger spray task |
| "Calibrate sprayer before spray task" | Create separate calibration record, then link to task | Pre-task check should prompt for calibration if due | Sprayer (calibration required) |

**The three-system gap:** Tasks know about assets/consumables but not observation data. Observations know about field data but not assets. A spray task needs to capture: what was sprayed (consumable), how much (stock movement), where (GPS track), AND environmental conditions at application time (observation data). Currently this requires touching all three systems separately.

### 2.2 — Observation Plan Overhead

11 steps before data capture begins (unchanged from v1 analysis — see Section 3.1 for solution).

### 2.3 — The Consumable Completion Gap

When a task involving consumables is completed today:
1. TaskAsset has `planned_quantity` but `actual_quantity` is never updated via any endpoint
2. No StockMovement is auto-created — stock levels don't change
3. No withholding period tracking is triggered (the Asset model stores `withholding_period_days` but nothing uses it on task completion)
4. No batch number is recorded against the usage
5. Compliance data (ACVM registration, organic certification) isn't validated at task start

The models are rich — `TaskAsset` has fields for batch_number, expiry_date, actual_cost, pre/post-task checks, usage timing. `StockMovement` has task_id, block_id, usage_rate, area_treated. **None of this is wired up in the task completion flow.**

### 2.4 — Template Rigidity

The 16 global observation templates are scientifically excellent but structured for formal data collection. A manager doing a quick vineyard walk doesn't need separate templates for pre-veraison and post-veraison yield. They need: "I see powdery mildew on Block 7 rows 12-18, severity moderate, here's a photo."

---

## 3. Recommendations

### 3.1 — Introduce "Quick Observation" (No Plan Required)

**Create a direct observation entry point that bypasses the plan entirely.**

| Step | Action |
|------|--------|
| 1 | Tap "Quick Observation" from home/observations page |
| 2 | Pick a template (grouped cards — see 3.6) |
| 3 | Pick a block |
| 4 | Record data (one spot, auto-GPS, camera prominent) |
| 5 | Save. Done. |

**Backend:** `ObservationRun` already supports `plan_id = NULL`. The frontend just needs a faster path.

### 3.2 — Wire Up Task Completion → Stock Deduction

**This is the highest-impact backend fix.** When a task with consumable TaskAssets is completed:

1. **Prompt for actual quantities** — the completion flow should show each consumable TaskAsset and ask: "Planned: 25L copper. Actual used?" with the planned value pre-filled
2. **Auto-create StockMovement** for each consumable:
   - `movement_type = "usage"`
   - `quantity = -actual_quantity`
   - `task_id`, `block_id` from task context
   - `usage_rate = actual_quantity / task.area_total_hectares`
   - `batch_number` from TaskAsset if recorded
3. **Update Asset.current_stock** (the StockMovement API already does this)
4. **Trigger withholding period** — if the consumable has `withholding_period_days > 0`, create a calendar event or notification: "Block 5: copper withholding period until {date}"
5. **Validate compliance** — on task start, check if consumable's ACVM registration has expired or if organic certification doesn't match the property's certification scheme

**Implementation:** Add a `POST /tasks/{task_id}/complete` enhancement that accepts `consumable_actuals: [{asset_id, actual_quantity, batch_number}]` in the completion payload. The endpoint creates StockMovements and updates TaskAsset.actual_quantity in one transaction.

### 3.3 — Add Pre-Task Check Flow for Equipment

`TaskAsset` already has `requires_calibration`, `pre_task_check_completed`, `pre_task_check_notes`, `pre_task_check_at` fields. Surface these in the UI:

1. When starting a task, if any TaskAsset has `requires_calibration = true` AND the linked Asset's last calibration is overdue → **block start** with: "Sprayer requires calibration. Last calibrated: {date}. Calibrate now or override."
2. If any TaskAsset has `is_required = true` → show pre-task checklist: "Confirm equipment ready: ☐ Sprayer calibrated ☐ Tractor fuelled ☐ PPE available"
3. Record `pre_task_check_at` timestamp when confirmed

### 3.4 — Task Templates: Reference Observation Templates for Completion Data

Some tasks naturally produce observation-worthy data. Allow TaskTemplate to reference an ObservationTemplate:

**New field on TaskTemplate:** `completion_observation_template_id` (FK, nullable)

**Behaviour:** When completing a task that has a linked observation template:
1. After confirming actual consumable quantities (3.2), show the observation template fields inline
2. Create an ObservationRun + single ObservationSpot with the captured data
3. Auto-link via ObservationTaskLink

**Example — Spray task completion flow:**
```
Step 1: "Mark task complete?"  → Confirm
Step 2: "Record actual usage"  → Copper: 27.5L (pre-filled from planned)
Step 3: "Record conditions"    → [Observation template fields]
         Wind speed: 8 km/h
         Temperature: 18°C
         Coverage rating: Good
         Notes: "Light breeze from NW, good coverage on all rows"
Step 4: Done → stock deducted, observation recorded, both linked
```

This eliminates the most common duplicate workflow.

### 3.5 — Observation-to-Task Auto-linking with Asset Pre-fill

The `ObservationTaskLink` bridge table exists but nothing uses it automatically. Wire it up with consumable context:

**Trigger:** When an observation spot records disease incidence > threshold (configurable per template):
1. Create a notification: "High botrytis incidence (35%) detected on Block 7"
2. **Suggest a task with pre-filled consumables**: "Spray Block 7 — Botrytis treatment" populated from a linked spray task template, including:
   - Recommended fungicide (from company's consumable inventory, filtered by certification)
   - Application rate (from Asset.application_rate_min/max)
   - Equipment (sprayer from company's equipment list)
3. Link the observation spot to the created task via `ObservationTaskLink`

This closes the full loop: **observe → alert → act (with correct consumables) → record conditions → deduct stock → track withholding**.

### 3.6 — Simplify the Observation Template Selection

**Proposed groupings:**

| Group | Templates | When to use |
|-------|-----------|-------------|
| **Quick Check** | Free-form, Pests & Diseases, Vine Health | "I noticed something" |
| **Phenology & Growth** | Phenology (EL), Bud Count, Growth/Canopy | Seasonal monitoring |
| **Yield** | Flower Count, Bunch Count, Pre-veraison, Post-veraison | Crop estimation |
| **Lab & Sampling** | On-Site Lab, External Lab | Lab work |
| **Environment** | Land Management, Frost Event, Beneficial Species, Biosecurity | Environmental monitoring |
| **Custom** | Company-created templates | Vineyard-specific |

### 3.7 — Merge the "Vineyard" Page into a Unified Activity Feed

**Proposed tab structure:**

| Tab | Content |
|-----|---------|
| **Activity** | Chronological feed: recent tasks (with consumable usage summaries) + observations + maintenance |
| **Tasks** | Task list with inline consumable/equipment indicators |
| **Observations** | Observation runs (merged plans + runs) |
| **Templates** | Both task templates AND observation templates |

### 3.8 — Observation Plans → "Scheduled Observations"

Rename and simplify:
- "Observation Plan" → "Scheduled Observation"
- "Start Now" goes directly to capture (skip plan-detail intermediate page)
- Recurring observations: hide rrule behind "Repeat: weekly/fortnightly/monthly"

### 3.9 — Allow User-Defined Observation Templates (Clone & Customise)

**Recommendation: Yes, with guardrails.**

1. **System templates remain read-only** — always available, cannot be modified
2. **Company templates** (`company_id != NULL`) created by admins
3. **Template builder** restricts field types to the existing `FieldType` enum
4. **"Clone & customise"** — duplicate a system template and add/remove fields
5. **Template categories** — group by purpose so selection isn't overwhelming

**Why this matters for the asset integration:** Company-specific observation templates can include fields relevant to their specific consumables — e.g., a custom "Spray Record" template with fields for product name, batch number, weather conditions, nozzle type, pressure, coverage rating. This captures data that currently falls between the task system and observation system.

---

## 4. Priority Ranking

| Priority | Recommendation | Effort | Impact | Dependencies |
|----------|---------------|--------|--------|--------------|
| **P0** | 3.1 Quick Observation (no plan) | S (2-3 days) | High — removes 8 steps from common workflow | None |
| **P0** | 3.2 Task completion → stock deduction | M (3-4 days) | High — completes the consumable pipeline | None |
| **P1** | 3.3 Pre-task equipment check flow | S (2 days) | Medium — uses existing TaskAsset fields | None |
| **P1** | 3.6 Template grouping in picker | S (1-2 days) | Medium — reduces cognitive load | None |
| **P1** | 3.8 Rename plans → scheduled observations | S (1 day) | Medium — clearer mental model | None |
| **P2** | 3.4 Observation template on task completion | M (4-5 days) | High — eliminates biggest duplicate workflow | 3.2 |
| **P2** | 3.5 Observation→task auto-linking with asset pre-fill | M (4-5 days) | High — closes observe→act→record loop | 3.2 |
| **P2** | 3.7 Unified activity feed tab | M (3-4 days) | Medium — better daily overview | None |
| **P2** | 3.9 User-defined templates (clone & customise) | M (4-5 days) | Medium — enables vineyard-specific monitoring | None |

### Recommended Build Sequence

```
Phase 1 (Quick Wins):
  3.1 Quick Observation ─────────────┐
  3.2 Task Completion + Stock ───────┤
  3.3 Pre-task Equipment Check ──────┤
  3.6 Template Grouping ─────────────┤
  3.8 Rename Plans ──────────────────┘
                                      ↓
Phase 2 (Integration):
  3.4 Obs Template on Task Complete ─┐ (requires 3.2)
  3.5 Obs→Task Auto-link ────────────┤ (requires 3.2)
  3.7 Unified Activity Feed ─────────┤
  3.9 User Templates ────────────────┘
```

---

## 5. The Complete Integrated Loop (Target State)

```
                    ┌──────────────────────────┐
                    │    Scheduled Observation  │
                    │    (weekly disease check) │
                    └────────────┬─────────────┘
                                 │ start run
                                 ▼
                    ┌──────────────────────────┐
                    │   Record Observation      │
                    │   Botrytis 35% Block 7    │
                    │   + photos + GPS          │
                    └────────────┬─────────────┘
                                 │ threshold exceeded
                                 ▼
              ┌──────────────────────────────────────┐
              │   Auto-suggested Task                 │
              │   "Spray Block 7 — Botrytis"         │
              │   Pre-filled:                         │
              │   • Fungicide: Switch 625 (25L)       │
              │   • Sprayer: Unit #3 (calibrated ✓)   │
              │   • Withholding: 28 days              │
              │   • Organic certified: ✓              │
              └────────────┬─────────────────────────┘
                           │ approved + assigned
                           ▼
              ┌──────────────────────────────────────┐
              │   Pre-task Checks                     │
              │   ☑ Sprayer calibrated (2 days ago)   │
              │   ☑ Chemical in stock (72.5L)         │
              │   ☑ Withholding period acceptable     │
              │   ☑ Weather window confirmed          │
              └────────────┬─────────────────────────┘
                           │ start task
                           ▼
              ┌──────────────────────────────────────┐
              │   Task Execution                      │
              │   GPS tracking (coverage map)         │
              │   Row-level progress                  │
              └────────────┬─────────────────────────┘
                           │ complete
                           ▼
              ┌──────────────────────────────────────┐
              │   Task Completion                     │
              │   Step 1: Actual quantities           │
              │     Switch 625: 27.5L (planned: 25L) │
              │     Batch: SW-2026-003                │
              │   Step 2: Conditions (obs template)   │
              │     Wind: 8 km/h NW                   │
              │     Temp: 18°C                        │
              │     Coverage: Good                    │
              └────────────┬─────────────────────────┘
                           │ auto-triggers
                           ▼
        ┌──────────────────┼──────────────────────┐
        │                  │                      │
        ▼                  ▼                      ▼
  StockMovement      ObservationRun         Calendar Event
  -27.5L Switch 625  Spray conditions       "Block 7 withholding
  stock: 72.5→45L    linked to task         ends 2026-04-17"
  block: Block 7     via ObsTaskLink
```

---

## 6. What NOT to Change

1. **Keep tasks and observations as separate backend models.** They serve different purposes (work execution vs data collection). The streamlining happens at the UX layer and completion flow, not the data layer.

2. **Keep the full task wizard.** Power users planning multi-block campaigns with specific equipment and consumables need the 7-section form. The quick-create path is for field workers.

3. **Keep observation plans for recurring schedules.** The plan → run → spots hierarchy is correct for structured monitoring programmes. Just don't force it for one-off checks.

4. **Keep the 16 system templates.** They represent genuine viticultural best practice. Add user templates alongside, don't replace.

5. **Don't merge task templates and observation templates** at the schema level. They serve different purposes (work definition with asset requirements vs data collection schema). The link should be a reference (`completion_observation_template_id`), not a merge.

6. **Don't move consumable tracking into observations.** Observations record what was seen; tasks record what was done. Consumable usage belongs in the task system. The observation captured at task completion is supplementary context (conditions, coverage assessment), not the consumable record itself.

7. **Don't auto-deduct stock without confirmation.** Always prompt for actual quantities at task completion — planned vs actual can differ significantly in vineyard operations (wind drift, equipment issues, area adjustments).
