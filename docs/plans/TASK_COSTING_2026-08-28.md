# Cost per task — gap analysis and build plan

**Date:** 2026-08-28
**Status:** BUILT. Phases 0-4 on 2026-08-28, Phase 5 (reporting) on 2026-09-01. D1-D4 decided.
Nothing is deployed and no cost figure has been seen against real data — no company has rates entered.
**Goal:** a defensible cost per task, decomposed into staff labour, contractor labour, consumables and equipment, stable enough to drive cost-per-hectare and cost-per-operation insights.

**Depends on:** `docs/Bugs/Current/TIMESHEET_WORKFLOW_2026-08-28.md`. Costing inherits every timesheet defect — see *Blocking dependency* below.

---

## 1. Current state

Audited `db/models/{task,asset,user,contractor_assignment,timesheet}.py`, `api/v1/{tasks,reports,stock_movements}.py`.

| Component | Hours / quantity | Rate | Cost written | Verdict |
|---|---|---|---|---|
| Staff labour | ✅ `TimeEntry.hours`, task-coded | ❌ **nothing exists** | ❌ | Rate is the gap |
| Contractor labour | ✅ `ContractorAssignment.actual_hours_worked` | ✅ `agreed_rate` + `rate_type` | ❌ never written | Complete but unplugged |
| Consumables | ✅ `TaskAsset.actual_quantity` + `StockMovement` | ✅ `Asset.cost_per_unit` | ❌ never written | Both halves present, not multiplied |
| Equipment | ❌ columns exist, nothing writes them | ❌ no rate | ❌ | Largest build |

### 1.1 What works

**The hours spine.** `reports.py:668` `_task_hours()` sums `TimeEntry.hours` + `ContractorAssignment.actual_hours_worked` per `task_id`. Its own docstring records that `Task.actual_hours` is documented as "Calculated from TimeEntry" but is never written — confirmed live on 2026-08-28: `actual_hours` read `"0.00"` on a task whose 1.5h *did* reach the timesheet. **Any costing must use `_task_hours` or an extension of it**, never `Task.actual_hours`, or the cost figures will disagree with the reports already shipped.

**Consumable quantity capture.** Both clients send `consumable_actuals` (`packages/mobile/src/screens/TaskDetailScreen.js:421`, `packages/web/src/pages/TaskDetail.jsx:284`). `tasks.py:1428–1470` writes `TaskAsset.actual_quantity`, derives `actual_rate` from `task.area_total_hectares`, creates a `StockMovement` carrying `task_id`, `block_id`, `usage_rate`, `area_treated`, `stock_before/after`, and decrements `asset.current_stock`. This is a genuinely complete usage ledger.

**Contractor rate capture.** `ContractorAssignment` holds `rate_type` (`hourly | daily | fixed_price`), `agreed_rate`, `currency` (default NZD), `estimated_cost`, `actual_cost`, `invoice_required`, `payment_status`.

### 1.2 What is missing or dead

**G1 — Staff pay rates do not exist.** `db/models/user.py` has no rate column of any kind: no hourly rate, no salary, no employment type, no on-cost. Staff labour is typically the largest line in a vineyard task, the hours are already task-coded, and there is nothing to multiply them by.

**G2 — Consumable cost is never computed at completion.** `tasks.py:1451` constructs the `StockMovement` without `unit_cost` or `total_cost`, although `asset` — carrying `cost_per_unit` — is in scope from line ~1435. `TaskAsset.actual_cost` is likewise never set. The manual endpoint `stock_movements.py:53` computes `total_cost` only when the caller supplies `unit_cost`, with **no fallback** to `asset.cost_per_unit`. Net effect: every task-driven consumable usage is recorded in litres and kilograms and in zero dollars.

**G3 — `calculate_payment_amount()` is dead code.** Defined at `contractor_assignment.py:315`, called from nowhere in `api/` or `services/`. `ContractorAssignment.actual_cost` is never written by any endpoint.

**G4 — Equipment hours are never captured.** `TaskAsset.actual_hours`, `usage_started_at`, `usage_ended_at`, `post_task_reading` are all dead columns — no endpoint writes any of them. Only `planned_hours` is captured, at attach time (`tasks.py:3430`). `Asset.current_hours` exists but is settable only through the asset update schema; nothing increments it from task usage.

**G5 — No asset operating rate.** No hourly rate field on `Asset`. Raw material for deriving one is present: `purchase_price`, `current_value`, `depreciation_rate`, `fuel_efficiency_standard` (already L/hr), and a full `AssetMaintenance` cost history (`labor_cost`, `parts_cost`, `external_cost`, `total_cost`, `asset_hours_at_maintenance`).

**G6 — No cost container.** `Task` has no cost columns. No `task_cost` table. No report surfaces cost anywhere — `reports.py:489` has `agreed_rate` in scope and reports hours only.

---

## 2. Decisions required before building

These are product calls. Do not let an implementing agent choose them.

### D1 — Snapshot at completion, or recompute on read? **(blocks everything)**

Recomputing from current rates means a pay rise retroactively reprices every task that person ever touched, and last month's exported report stops matching the system.

**Recommendation: snapshot.** Write a `task_cost` row at completion carrying the component costs, the currency, `computed_at`, and the identity of every rate version used. Add an explicit recompute endpoint for genuine corrections, which supersedes rather than overwrites. This is the difference between a number you can put in front of an accountant and one you cannot.

### D2 — Where do uncoded hours go?

`TimesheetDay.uncoded_hours` is real paid labour attached to no task. Task-less `TimeEntry` rows are the same problem (see F13 in the timesheet report). Options:

- **(a)** absorb into overhead, never allocated to tasks — simple, honest, but the sum of task costs will not reconcile to payroll
- **(b)** pro-rate across the day's tasks by hours — reconciles, but invents an allocation
- **(c)** allocate to a synthetic "general work" task per day — visible, reconciles, adds noise

Leaving this undecided means the day's cost will not reconcile and nobody will know why.

### D3 — Stock costing method

`Asset.cost_per_unit` is a single mutable field, so editing it reprices history. Purchase-type `StockMovement` rows carry their own `unit_cost`, so weighted-average is derivable — nothing currently derives it. Choose **last price / weighted average / FIFO**. Weighted average from purchase movements is the usual compromise; last-price is the cheapest and is what `cost_per_unit` already approximates.

### D4 — Who may see pay rates?

`timesheets:read` is currently granted to `company_manager` (`core/permissions.py:82`). Reusing it for pay rates answers by accident a question that deserves an explicit answer. Assume a **new `costs` permission module** with its own matrix unless decided otherwise.

---

## 3. Proposed data model

All migrations live at the **repo root** in `alembic/versions/`, not under `backend/`. **Slugs over 32 characters silently roll back the DDL.**

### 3.1 `user_pay_rate` (new)

Effective-dated, not a column on `User`, precisely so that history does not reprice.

```
id, company_id FK, user_id FK,
hourly_rate NUMERIC(10,2), currency CHAR(3) DEFAULT 'NZD',
effective_from DATE NOT NULL, effective_to DATE NULL,
created_by, created_at
```

Index `(user_id, effective_from)`. Constraint: no overlapping ranges per user. Resolution at costing time is by the task's completion date, not today.

### 3.2 Company-level costing settings (extend `companies` or a new `company_cost_settings`)

```
default_hourly_rate NUMERIC(10,2)      -- fallback for unrated staff
on_cost_multiplier NUMERIC(5,4)        -- holiday pay + ACC + KiwiSaver, e.g. 1.1800
currency CHAR(3) DEFAULT 'NZD'
stock_costing_method VARCHAR(20)       -- per D3
uncoded_hours_policy VARCHAR(20)       -- per D2
```

The on-cost multiplier matters: a bare hourly rate understates true employment cost by roughly 15–20%, and a costing model that ignores it will be quietly wrong in a consistent direction.

### 3.3 `Asset` additions

```
hourly_operating_rate NUMERIC(10,2) NULL   -- explicit override
rate_basis VARCHAR(20) NULL                -- 'manual' | 'derived'
```

Derived basis computes from `depreciation_rate` × `current_value`, `fuel_efficiency_standard` × a fuel price, and trailing `AssetMaintenance.total_cost` per operating hour. Start with `manual`; derivation is a Phase 5 refinement.

### 3.4 `task_cost` (new) — the snapshot

```
id, task_id FK UNIQUE, company_id FK,
labour_cost_staff NUMERIC(12,2),
labour_cost_contractor NUMERIC(12,2),
consumable_cost NUMERIC(12,2),
asset_cost NUMERIC(12,2),
total_cost NUMERIC(12,2),
currency CHAR(3),
staff_hours NUMERIC(8,2), contractor_hours NUMERIC(8,2), asset_hours NUMERIC(8,2),
on_cost_multiplier_applied NUMERIC(5,4),
rate_sources JSONB,        -- {user_pay_rate_ids: [...], asset_ids: {...}, stock_movement_ids: [...]}
computed_at, computed_by, is_superseded BOOLEAN DEFAULT false
```

`rate_sources` is what makes a figure auditable a year later. Without it, a disputed number cannot be explained.

**Index `task_cost.task_id`.** Note the standing footgun: an unindexed FK turns a parent delete into a sequential scan.

---

## 4. Phases

Built to be reviewable one phase at a time. Pause after each.

### Phase 0 — Fix the blocking timesheet defects *(prerequisite, not optional)*

From `docs/Bugs/Current/TIMESHEET_WORKFLOW_2026-08-28.md`: **F1** (hours silently discarded when a task is completed onto an approved day) and **F2** (day-total setter destroys uncoded time). Both understate labour with no trace. Costing on top of them produces numbers that are wrong in a way nobody can detect. F1 also has the fix that persists `hours_worked` onto the task, which costing wants regardless.

### Phase 1 — Zero-schema wins

No migration. Uses data already in scope.

1. **G2:** in `tasks.py:1451`, set `unit_cost = asset.cost_per_unit` and `total_cost = abs(quantity) * unit_cost` on the auto-created `StockMovement`; set `TaskAsset.actual_cost` to the same figure.
2. **G2:** in `stock_movements.py:53`, fall back to `asset.cost_per_unit` when the caller supplies no `unit_cost`.
3. **G3:** call `calculate_payment_amount()` on contractor completion and store the result in `ContractorAssignment.actual_cost`. Fix the hardcoded 8-hour day at `contractor_assignment.py:324` — read it from company settings, or refuse to guess and return `None` for `rate_type='daily'` without a configured day length.

After Phase 1, two of four components are real with no schema change and no new UI.

### Phase 2 — Staff rates *(blocked on D1, D4)*

Migration for `user_pay_rate` + company cost settings. CRUD endpoints under a new `costs` permission module. Admin UI in `CompanyAdmin.jsx` alongside user management. Resolution helper `resolve_pay_rate(user_id, on_date)`.

### Phase 3 — The costing service and snapshot *(blocked on D1, D2, D3)*

`services/task_costing.py`, built on `_task_hours`, not `Task.actual_hours`:

```
compute_task_cost(db, task_id, as_at) -> TaskCostResult
```

- staff labour: `TimeEntry.hours` per user × `resolve_pay_rate(user, task.completed_at)` × on-cost multiplier
- contractor labour: `ContractorAssignment.actual_cost` (Phase 1)
- consumables: `SUM(StockMovement.total_cost)` where `task_id` matches and `movement_type='usage'`
- equipment: deferred to Phase 4; emit `0.00` with `asset_hours = NULL`, not a silent zero

Write the snapshot on completion. Add `POST /tasks/{id}/cost/recompute` for corrections, superseding rather than overwriting.

**Partial-data honesty:** a task with unrated staff must not report a confident low total. Carry an explicit completeness flag (e.g. `staff_hours_unrated`) and have every consumer render "incomplete" rather than a number that looks whole.

### Phase 4 — Equipment hours and rates *(blocked on D1; largest build)*

The hard half: unlike consumables there is no completion-time capture for equipment.

1. Capture `TaskAsset.actual_hours` at completion, mirroring the consumables modal both clients already have. Default equipment with `role='primary'` to the task's labour hours, overridable.
2. Populate `usage_started_at` / `usage_ended_at` from task start/complete as a fallback.
3. Increment `Asset.current_hours` from captured usage — this also makes `maintenance_interval_hours`, `due_hours` and `next_due_hours` work, which they currently do not.
4. Add `hourly_operating_rate`; fold `asset_cost` into the snapshot.

Item 3 is worth noting to stakeholders: the maintenance scheduling already in the model is inert for the same reason costing is, and this phase fixes both.

### Phase 5 — Reporting and insights *(BUILT 2026-09-01)*

Delivered: `_task_costs` beside `_task_hours`; cost columns and cost/ha on work-by-block;
cost totals on tasks/summary and both exports; a new `/reports/costs/{summary,export}` with
cost by operation and by variety, the labour/materials/machinery mix, cost per hour, cost per
hectare and estimated-vs-actual hours. Gated on `costs`, not `reports` — the cost objects are
absent from the payload entirely for a company_manager.

Also corrected here: `tasks/summary` and `tasks/export` were reading the dead
`Task.actual_hours`. Now that it IS written at completion, leaving them would have shown hours
on newly completed tasks, zero on everything historical, and a total disagreeing with
work-by-block on the same data.

Not built: cost per tonne (needs harvest data), and cost per operation ACROSS SEASONS — the
report answers one date range at a time.

Original scope:

Extend the `_task_hours` pattern to `_task_costs`. Add cost columns to `work-by-block` and `tasks/summary`, plus exports. Derived measures once the spine is trustworthy: cost per hectare by block and by variety, cost per operation type across seasons, estimated-vs-actual (`Task.estimated_hours` is already captured and currently unused for variance), labour-vs-materials mix, and cost per tonne once harvest data lands.

---

## 5. Footguns

1. **`Task.actual_hours` is dead.** Always `_task_hours`. Anything reading `actual_hours` reports a vineyard where nobody has ever worked.
2. **Parent/child roll-ups.** `reports.py` already guards job counts against `parent_task_id` double-counting; costing must apply the same guard or every roll-up parent doubles its children.
3. **Multi-block allocation.** `Task.block_id` is singular but tasks span blocks — spray coverage already handles this. Cost per block needs an explicit allocation rule (area, rows, or time). Do not let it default to "all of it on `block_id`".
4. **Currency is inconsistent.** `ContractorAssignment.currency` defaults NZD; `Asset` and `StockMovement` have no currency field. Single-currency for v1, but write `currency` on `task_cost` so the assumption is recorded rather than implied.
5. **Fixed-price contractors do not divide.** `rate_type='fixed_price'` has no hours to spread. Allocating one fixed price across several tasks or blocks needs a rule, or the assignment must be constrained to a single task.
6. **`TimeEntry.task_id` is `ondelete="SET NULL"`.** Deleting a task orphans its time entries — the hours survive, their allocation does not. A snapshot taken before the delete keeps the cost; a recompute afterwards silently loses it. Another argument for D1 = snapshot.
7. **Cost data is sensitive.** Pay rates and margins are not ordinary app data. Settle D4 before the first endpoint ships, not after.

---

## 6. Immediate recommendation

Phase 0 then Phase 1. Together they are small, need no migration and no decisions, and take consumables and contractors from "recorded in units, zero in dollars" to real figures — while removing the two defects that would otherwise poison whatever is built on top.

Then bring D1–D4 to a decision before Phase 2 opens.
