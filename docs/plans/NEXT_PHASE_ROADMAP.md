# Next Phase Roadmap — Insights upgrade, Grow completion, unified users, timeseries scale

**Date:** 2026-05-13
**Author:** Pete + Claude (discovery + sprint-ordering session)
**Scope:** Synthesis of all current plan docs (`docs/plans/*.md`) against verified codebase + database state. Establishes the build order for the next ~6 sprints and scopes the timeseries strategy for billions-of-rows growth.
**Status:** Awaiting confirmation on the one open ordering question (§4). All other decisions locked.
**Related docs:**
- `GROW_COMMERCIAL_RELEASE_PLAN.md` — the 8-phase web plan this roadmap re-sequences
- `unified_users_plan.md` — superseded by §3.1 below (publisher tenancy explicitly deferred)
- `DATA_INGESTION_PLATFORM_PLAN.md` — partitioning + cold-storage strategy in §6 builds on this
- `MOBILE_MAP_PLAN.md`, `MOBILE_POLISH_PLAN.md`, `MANAGEMENT_RELATIONSHIP_UI_PLAN.md`, `VISITOR_REGISTER_SCOPING.md`

---

## 1. State snapshot (verified 2026-05-13)

### Backend / data
- Property gating (`UserPropertyScope` + `get_visible_property_ids`) live across blocks, tasks, observations, assets, risks, incidents
- Visitor register: web sign-in portal + mobile sign-in/sign-out + management page
- Calibration two-table model + asset spec persistence (schedules + events)
- AWS S3 file migration done — EB redeploys no longer lose photos
- Notifications backend: 4 endpoints; 2 of N triggers wired
- Calendar, Reports, Timesheets backends in place
- TDC + GDC ingestion code written, wired into `run_ingestion.py`, cron defaults to `all`
- Data Ingestion Platform: Phases 0, 0b, A, B1, B1.5, B1.6 deployed
- Alembic single head `add_banner_audience`. BUG-005 zombies inert.

### Web (Grow / Pro)
- `CompanyAdmin.jsx` has all 12 tabs (Properties, Blocks, Relationships, Timesheets, Aliases, Calendar Sync, Team, Invite, Training, GrapeLink, Weather, Reports)
- `ObservationDashboard.jsx` has the 5-tab structure (plans / runs / templates / tasks / task-templates)
- Calibrations on standalone `/calibrations` route — not yet folded into `/assets`
- `Notifications.jsx` — mark-read + filters work; row click-through to target entity missing
- Maps V2 — blocks + spatial areas drawable; property-polygon drawing NOT built; no `polygon`/`geometry` column on `properties` table
- `Profile.jsx` — still renders Company + Subscription sections (plan wants them stripped)

### Mobile
- Polish (M5.1 → M5.4) substantially done
- Visitor sign-in + sign-out screens shipped
- Risk + Task creation, FAB, three-state GPS lifecycle in
- Map screen + background GPS still gated on EAS dev build
- v0.1.1 build prep done; Play Console submission blocked by BLOCKER-001

### Insights
- v1.1 phases 1–5 done (5 explorers, regional map, Seasonal Stats Widget, articles, mobile/SEO)
- v1.1 Phase 6 (zone-geometry loader + IDW zone aggregation) pending
- 14 page components + admin CMS in `packages/insights/`
- BSI / VineFacts / publisher tenancy concepts: greenfield — nothing built yet

---

## 2. Hard constraints / blockers shaping the order

| Constraint | Impact | Resolution path |
|---|---|---|
| `climate_historical_data` = 121M rows, no `(vineyard_block_id, date)` composite index, no rollup table. `SELECT *` takes 12 min. | Blocks property-scoped climate dashboards (Grow Insights tab) AND zone aggregation at v1.1 Phase 6 scale | Sprint 4 — index + rollup + partitioning. Tiered approach in §6. |
| BLOCKER-001 — GCP org policy locks `eas submit` for Play Store | Play Store launch | Pete recovering Workspace super-admin + managing GCP console JSON schema policy. Independent track. |
| EAS dev build not yet run | Blocks Mobile Map plan, GPS.2 spray-map, GPS.5 background tracking | Apple Dev Program confirmation in progress; Android dev build can run independently. Sprint 0. |
| `unified_users_plan.md` conflates two scopes | The doc is a BSI publisher-tenancy discovery spec with a Phase-7-FK-propagation paragraph stapled on top — two very different scopes in one file | Resolved in §3.1: ship the small FK now, defer publisher tenancy until scoping + contracts are in. |

---

## 3. Decisions confirmed 2026-05-13

### 3.1 Unified users — proceed with FK-propagation only
- One alembic migration adding nullable `linked_public_user_id` on `users` with unique constraint to `public_users.id`
- Patch Grow `auth.py` and Insights `public_auth.py` signup + password-change flows to propagate the password hash to the linked row in the same transaction
- Lazy backfill on next successful login of an existing un-linked user
- Email-change behaviour: re-link to new email if the new email also matches a row in the other table, else unlink and surface a notice
- New Insights signup of an email that already exists in `users` → fails with "Account already exists" prompt
- Estimated 1–2 dev days. Lands in Sprint 2.

### 3.2 BSI publisher tenancy — deferred, requires contracted scope
Treated as a separate later epic. The existing `unified_users_plan.md` discovery spec stays as the scoping starting point but does not block Grow commercial release. Pre-condition: contracted requirements from BSI before any build commences.

### 3.3 Property climate rollup — user-initiated Compute button
- New `property_climate_daily` rollup table (property_id, date, derived metrics) — write-once-per-recompute, read-heavy
- Refreshed only when the user presses "Compute" on a property, not on every property edit
- Idempotent recompute; safe to re-run

### 3.4 Mobile launch blockers — owner-driven
- BLOCKER-001 (Play Console JSON): Pete recovering Workspace super-admin + adjusting GCP org policy today
- Apple Developer Program: Pete confirming today; unlocks iOS dev build

---

## 4. Open ordering question

**Insights v1.1 Phase 6 vs Insights upgrade — sequenced or merged?**

Both depend on the same climate perf foundation (§6 Tiers 1–2). The choice:

- **Option A (recommended):** Do v1.1 Phase 6 first (zone-geometry loader + IDW station→zone aggregation — closes out the existing v1.1 plan, ~2 days, proves the perf foundation works at zone scale) THEN tackle the larger Insights upgrade (property-scope climate history, region-vs-property compare, growth/phenology from models + user observations, disease pressure layer).
- **Option B:** Fold them into one larger Insights push. Saves a small amount of context switching but increases the unit of work and delays Phase 6 closeout.

Recommendation: Option A. Defaulting to that in §5 unless Pete confirms otherwise.

---

## 5. Recommended sprint ordering

Phase numbering is roadmap-internal, not the source plan docs'. Each block is ~2–5 dev days unless noted.

### Sprint 0 — Unblock & sweep (≈2 days)
1. Run the prod alembic check, delete the two BUG-005 zombie files
2. BUG-001 — build the web viewer for calibration photos
3. EAS dev build kickoff: confirm Mapbox tokens, Android-first first build. Unlocks MAP + GPS.2 + GPS.5.
4. In parallel (Pete-owned): GCP org policy fix + Apple Dev Program enrolment

### Sprint 1 — Grow commercial release, low-risk passes (≈4–5 days)
- **Grow Phase 1** — Contractor mobile-only web gate (`/contractor-mobile-only` landing, ProtectedRoute branch, header strip)
- **Grow Phase 2** — Manage-tab polish (Properties tickbox UI, Blocks natural-sort + Edit button, Timesheets pop-per-entry + smoother add, Aliases dropdowns, Calendar Sync ICS end-to-end test)

### Sprint 2 — Relationships + unified users FK (≈3–4 days)
- **Grow Phase 3** — Contractor relationships card flesh-out + Management Relationship UI Phase 1 (read-only chip + history modal per `MANAGEMENT_RELATIONSHIP_UI_PLAN.md`)
- **Grow Phase 7 (FK variant only)** — unified users per §3.1. Explicitly NOT publisher tenancy.

### Sprint 3 — Task / observation UX + cross-app glue (≈3–4 days)
- **Grow Phase 4** — TaskDetail dead-whitespace fix, task-template subcategory dropdown, ObservationDashboard tab friction, Calibrations folded into `/assets` as 4th tab (keep `/calibrations` as a 301 redirect)
- **Grow Phase 5** — Notifications click-through + Clear-all + per-item dismiss; Calendar multi-event-per-day fix; Home Upcoming polish; Timesheets analysis card

### Sprint 4 — Climate perf foundation (≈3–4 days, the keystone)
Dependency for both Insights upgrade AND Grow property climate dashboards.
1. Composite index on `climate_historical_data (vineyard_block_id, date)` — `CREATE INDEX CONCURRENTLY`, no downtime
2. Composite index on `timeseries_observations (device_id, timestamp DESC, measurement_code)` — covering index for latest-N-obs queries
3. New `property_climate_daily` rollup table + Compute button on properties (per §3.3)
4. New `property_climate_summary` rollup keyed `(property_id, vintage_year)` for region-vs-property compare card
5. pg_partman setup so new `timeseries_observations` data lands partitioned from day one — full backfill happens as a background task during Sprint 5 (see §6 Tier 3)

### Sprint 5 — Grow Phase 6 + Insights upgrade (≈5–7 days)
- **Grow Phase 6** — property polygon drawing in Maps V2 + alembic migration for the column (visual only, geofencing deferred), GPS track viewer
- **Insights v1.1 Phase 6** — zone-geometry loader + IDW aggregation. Smaller, runs first.
- **Insights upgrade** — wired to the new rollups: climate history per property, region-vs-property compare, growth/phenology drawing from both `phenology_service.py` and user-observed phenology/bud/flower counts, disease pressure layer. Biosecurity + blockchain remain on hold per Pete's note.
- Background task: full partition backfill of historical `timeseries_observations` data

### Sprint 6 — Phase 8 + later epics (post-launch)
- **Grow Phase 8** — style consistency sweep (groups-per-PR, defer if no concrete checklist emerges)
- **Compliance scoping** (SWNZ / BioGro / Organics / Biodynamic) — separate plan doc once Pete details them
- **Reports customer scoping** — separate plan
- **Training overhaul, GrapeLink, Weather-station self-service** — v1.1 candidates
- **BSI publisher tenancy** — separate epic once contracted scope lands. Use `unified_users_plan.md` discovery spec as starting point.

### Independent tracks (run in parallel with above)
- **Mobile Map** (`MOBILE_MAP_PLAN.md`) — once Sprint 0 dev build is live, MAP.1 → MAP.9 is ~4–5 days
- **OFF.3 Phases 3–6** — observation cache + write queues + sync UI
- **Data ingestion Probe 1 + B3/B4 Grow weather wizard** — gated on the empirical Harvest data-lag check
- **BoM / AU launch** (Data Ingestion Phase E) — separate dependency chain, targets September 2026

---

## 6. Timeseries strategy at billions-of-rows scale

### 6.1 Critical distinction
- **`climate_historical_data` (121M rows) is effectively static.** NIWA BCSD 1986–2024 backfill, per vineyard block, per day. No live writes — grew once at import and stays put. Solve once with indexes + partitioning and it stays fast forever.
- **The real growth concern is operational timeseries:** `weather_data` / `timeseries_observations` (rename per Data Ingestion plan) plus future device data — pumps, meters, frost fans, soil probes. From DIP §7: one weather station at 10-min cadence = ~262k rows/year; one pump at 1-min × 3 vars = 1.6M rows/year/device. At 300 devices end-of-year-1 = 50–200M new rows/year. Multiply across AU launch + UK/CL/ZA — billions inside 2–3 years is realistic.

### 6.2 Tier 1 — Indexing (hours, zero downtime — Sprint 4)
- `CREATE INDEX CONCURRENTLY` on `climate_historical_data (vineyard_block_id, date)` — fixes the 12-min `SELECT *`
- `CREATE INDEX CONCURRENTLY` on `timeseries_observations (device_id, timestamp DESC, measurement_code)` — covering index for the dominant "latest N obs for device" pattern
- Both safe live against prod

### 6.3 Tier 2 — Rollup tables (Sprint 4)
- `property_climate_daily` — keyed `(property_id, date)`, derived from `climate_historical_data` weighted across that property's blocks. User-triggered via Compute button per §3.3. Idempotent.
- Volume estimate: ~few thousand rows per property × 40 years × few hundred properties = under 10M rows total. Trivial.
- `property_climate_summary` — keyed `(property_id, vintage_year)` — GDD totals, rainfall totals, frost days, key phenology DOYs. Powers Insights region-vs-property compare without re-aggregating on every page view.
- These tables are write-once-per-recompute, read-heavy — plain tables refreshed on the Compute event (not materialized views — keeps refresh logic explicit and inspectable).

### 6.4 Tier 3 — Partitioning (Sprint 4 setup + Sprint 5 backfill)
Native Postgres range partitioning by timestamp, monthly partitions. Already scoped in DIP §10 step 4 — execution path:
- Use `pg_partman` (available on RDS) to auto-create future partitions and detach old ones
- Partition `timeseries_observations` BY RANGE (timestamp), one partition per month (`p_obs_2026_06`, `p_obs_2026_07`, …)
- Partition `climate_historical_data` BY RANGE (date), one per year (`p_clim_1986`, … `p_clim_2024`) — static, do once
- Local indexes per partition; planner does partition pruning for any query with a date filter
- Migration path: new partitioned parent → backfill copy → atomic rename. Ingestion paused for the cutover window (next cron is 6h later — effectively invisible).
- **Execution order:** set up pg_partman so new data lands partitioned from day one (Sprint 4). Backfill historical data into partitions as a background task during Sprint 5 — does not block Insights upgrade work.

### 6.5 Tier 4 — Cold storage (post-AU-launch, when partitions age out)
- Detach partitions older than 3 years from the partitioned parent
- Export to Parquet on S3 (one file per partition)
- Aggregates (`climate_zone_daily`, `property_climate_daily`, `property_climate_summary`) stay in Postgres indefinitely — they are the read path for everything user-facing
- Raw old data accessible via Athena or DuckDB if/when a research query needs it
- Cuts hot Postgres footprint by ~70% at scale; backups, vacuum, replica lag all benefit
- Set up the detach + Parquet export pipeline once, runs monthly forever

### 6.6 Tier 5 — Read scaling (only if measured bottleneck)
- RDS read replica dedicated to Insights public traffic (separate from Grow operational load)
- Redis hot cache for "latest N readings per device" — sub-100ms dashboard loads (DIP §7)
- Don't pre-build either until a real bottleneck is measured

### 6.7 Explicitly NOT recommended
- **TimescaleDB** — requires migrating off RDS (or RDS-Aurora-with-extension which has its own quirks). Native partitioning + pg_partman gets us 80% of the value with no infra change.
- **Timestream / DynamoDB** — separate query stack, kills PostGIS spatial joins, breaks the recursive zone-tree CTE from DIP §3.5
- **Sharding** — premature; one well-partitioned Postgres instance handles tens of billions of rows comfortably

### 6.8 Net effect
- 121M-row `climate_historical_data` queryable in milliseconds
- Room for 10B+ rows of operational data over the next 3 years on the same RDS instance
- Clean cold-storage path that does not force a database migration when we get there

---

## 7. Tomorrow's pickup

Suggested first move: confirm §4 (Phase 6 ordering — recommend Option A) and the partitioning execution split in §6.4 (set up in Sprint 4, backfill as background during Sprint 5). Then kick off Sprint 0 — zombie alembic cleanup is a quick prod check + delete; BUG-001 calibration-photo viewer is ~half a day; EAS dev build kickoff runs in parallel once Apple Dev Program confirms.

If BLOCKER-001 (GCP org policy) clears today, Sprint 0 also includes generating the Play Console service-account JSON so v0.1.1 mobile is ready for internal testing.
