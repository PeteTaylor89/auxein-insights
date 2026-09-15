# Scope — Platform KPI dashboard (monthly snapshot + running total)

_Scoping only. No code changed. Written 2026-09-15._
_All figures below were queried against **prod** (`auxein-db...ap-southeast-2`) on 2026-09-15, read-only._

Supersedes Part 2 of `INSIGHTS_ADMIN_SPLIT_AND_KPI_PLAN.md` (2026-05-18), which covered
Insights metrics only, assumed no snapshot history, and left three questions open that this
document answers with data. Lives on `admin.auxein.co.nz` (see
`ADMIN_SUBDOMAIN_SCOPE_2026-09-15.md`) as the Insights **Dashboard**.

---

## 1. Verdict per KPI — every one checked against live data

**Live** = the number today, so you can see the metric is real rather than theoretical.

| # | KPI | Source | Live | Backfillable? | Verdict |
|---|---|---|---|---|---|
| 1 | Verified users | `public_users.is_verified` | **65** of 68 | ✅ from `created_at` | Ready |
| 2 | MAU (Insights) | `user_events` | **15** (Sept) | ✅ **7 months** | Ready — but redefine, see §2.2 |
| 3 | WAU/MAU % | `user_events` | **50%** (12/24 rolling) | ✅ | Ready |
| 4 | Newsletter opt-in % of verified | `public_users.newsletter_opt_in` | **86%** (56/65) | ✅ **seeded to Jul 2026** (§3.4) | Ready |
| 5 | Active weather stations | `weather_stations.is_active` | **932** | ✅ **seeded to May 2026** (§3.4) | Ready — NZ/AU split is NOT, see §2.3 |
| 6 | Grow companies | `companies` | **5** net (8 raw) | ✅ | Ready |
| 7 | Grow users | `users` | **9** net (18 raw) | ✅ | Ready |
| 8 | Ha under management | `vineyard_blocks.company_id` | **203.28** (201.35 excl. mothballed) | ⚠️ areas edited in place | **RESOLVED — §2.1** |
| 9 | Tasks scheduled | `tasks` | **25** net | ✅ | Ready — define "scheduled", §3.2 |
| 10 | Tasks completed | `tasks.status='completed'` | **16** net | ⚠️ status is mutable, §3.2 | Ready with caveat |
| 11 | Observations made | `observation_runs` / `observation_spots` | **46 runs / 51 spots** | ✅ | Ready — pick the unit, §2.4 |
| 12 | Risks managed | `site_risks` | **4** net | ✅ | Ready |
| 13 | Assets managed | `assets` | **10** net | ✅ | Ready |
| 14 | Properties | `properties` | **7** net | ✅ | Suggested addition |
| 15 | Blocks | `vineyard_blocks.company_id` | **102** net | ✅ | Suggested addition — count via `company_id`, NOT the property join (§2.1) |
| 16 | Incidents / Visitors | `incidents` / `visitors` | **0 / 0** net | ✅ | Real but empty — include, expect zeros |
| 17 | Live sub-regions (complete view) | — | **61%** (seeded) | seeded only | **Not computable** — definition unsettled (§3.4) |

Net figures exclude **Auxein** (id 7), **Auxein Test** (24) and **App Store Test** (17).

The exclusion is material, not cosmetic: it removes **3 of 8 companies and 9 of 18 Grow
users — half the user table.** Reporting the raw numbers would roughly double every Grow
figure.

---

## 2. Definition questions (2.1 resolved; 2.2-2.4 open)

### 2.1 "Ha under management" — RESOLVED 2026-09-15: `vineyard_blocks.company_id`

**The answer is `SUM(vineyard_blocks.area) GROUP BY vineyard_blocks.company_id`. Live net
figure: 203.28 ha** across 102 blocks and 5 companies.

This was scoped as blocked because the first pass compared `properties.total_area_ha`
(53.60) against blocks joined *through properties* (77.93). **Both were wrong**, and the
join was wrong for a reason worth recording:

`vineyard_blocks` holds **8,803 rows, of which only 112 have a `company_id` and 65 a
`property_id`.** The other 8,691 — 8,725 rows at status `developing`, totalling **43,097
ha** — are a reference dataset, not managed blocks. An unfiltered `SUM(area)` returns
~43,253 ha, which is roughly the entire New Zealand vineyard estate.

**`company_id` is the only field that sees the real data**, because a managed block does
not necessarily have a property:

| Company | Blocks | Ha | Blocks with NO `property_id` |
|---|---|---|---|
| Greystone Wines | 32 | 52.01 | 0 |
| Fancrest Estate | 8 | 4.31 | **8** |
| Black Estate | 25 | 25.94 | 2 |
| Barbour Vineyards | 2 | 8.45 | **2** |
| Mt Beautiful | 35 | **112.56** | **35** |
| **Net total** | **102** | **203.28** | |

Mt Beautiful is the proof: 112.56 ha across 35 blocks, **none of which has a
`property_id`**, so the property join reported it as zero — and it is the single largest
holding on the platform. Fancrest and Barbour are the same story. The property route did
not merely disagree with the block route, it was structurally blind to more than half the
estate.

Where both keys are set they agree — **zero rows disagree** on company. So `company_id` is
consistent as well as complete.

Two small follow-ons:
- **Mothballed blocks.** 203.28 ha all-status; **201.35 ha** excluding `mothballed`
  (Greystone has 1.92 ha mothballed). Recommend excluding `mothballed` and `removed` —
  "under management" should not count land taken out of production. Record the choice in
  `meta`.
- **`properties.total_area_ha` is now known-unreliable** and should not be used for any
  reported figure. It disagrees with the blocks for Black Estate (48.00 vs 25.94) and is
  null for the companies that hold most of the area.

### 2.2 MAU has two definitions, and the current endpoint uses the weaker one

`/admin/users/stats` computes MAU as `last_active >= now() - 30 days`. Two problems:

**`last_active` is written in exactly one place.** Not on login, not on authenticated
requests — only by `POST /public/events` and `/public/events/batch`
(`enrichment.py:116`). And `eventTracker.js` skips the call entirely when there is no
token. So today's "MAU" means *signed-in Insights users who triggered a tracked event in
the SPA*. It excludes anonymous readers (Umami only) and **every Grow user who never opens
Insights**.

**It is a single mutable column, so it cannot be backfilled.** A rolling-30-day count of a
value that is overwritten has no history.

`user_events` fixes both: it is an append-only log running from **2026-02-27**, and it
gives calendar-month actives directly —

| Month | Events | Active users |
|---|---|---|
| 2026-02 | 279 | 7 |
| 2026-03 | 978 | 14 |
| 2026-04 | 1,133 | 23 |
| 2026-05 | 553 | 10 |
| 2026-06 | 655 | 18 |
| 2026-07 | 115 | 7 |
| 2026-08 | 1,692 | 15 |
| 2026-09 (partial) | 816 | 15 |

**Recommend: MAU = distinct `user_id` in `user_events` for the calendar month.** It is
stable, backfillable to February, and matches what "monthly" implies. WAU = the same over
the snapshot week. Keep the rolling-30-day number if you want it, but label the two
differently — they will not agree, and a dashboard showing both without saying why invites
exactly the wrong conclusion.

**Grow has no equivalent.** `users` carries `last_login` and `login_count` but no
`last_active` and no event stream. A Grow MAU would either be "logged in within 30 days"
(9 net users: 6 in 30d, 4 in 7d — but refresh tokens mean a working user may not re-login
for weeks, so it undercounts) or derived from authorship: distinct `created_by` across
`tasks` and `observation_runs` in the month. **The authorship version is backfillable and
means something**; the login version is neither. Recommend authorship, labelled "Grow
users active" rather than MAU.

### 2.3 The NZ/AU station split the May plan wanted is not derivable

`weather_stations.country_id` is **NULL for 803 of 964 rows (83%)**. Only 145 carry
`country_id = 1`. A per-country breakdown today would report ~129 NZ stations against a
real figure near 932, and 0 for Australia — which is true, but only by accident.

Total active stations is sound: **932 flagged active, and 922 distinct stations actually
reported in the last 7 days** — so the flag is honest to within ~1%. Ship the total; treat
the country split as blocked on backfilling `country_id`.

Worth deciding which definition the KPI uses, since they differ slightly: the **flag**
(932) is a statement of intent, **reporting in the last 7 days** (922) is a statement of
fact. Recommend reporting the flag as the headline and the reporting count beside it — the
gap between them is itself a useful health signal.

### 2.4 "Observations made" — runs or spots?

Both exist and differ by roughly 10%: **46 runs**, **51 spots** (net). A run is a scouting
round; spots are the individual records within it. They answer different questions — "how
often does anyone go out" vs "how much data came back". Recommend **both**, as separate
rows; they are one extra column and the ratio is informative.

Note `observation_spots` has no `company_id` — it joins through `observation_runs`, which
does. Do not count it standalone or the exclusion silently fails (95 raw vs 51 net).

---

## 3. Snapshot design

### 3.1 Stock vs flow — the distinction the table has to encode

The request is "snapshot on the 1st, with a running total". Those are different things for
different metrics, and conflating them is the usual way these dashboards go wrong:

- **Stock** (verified users, companies, Grow users, Ha, active stations, assets, risks):
  a level. The snapshot is the value on the 1st. A "running total" is meaningless — you
  would be summing the same users every month.
- **Flow** (tasks completed, observations made, incidents raised): an increment. Here both
  readings are wanted — **the month's own count** and **cumulative to date**.

So every metric row stores both, with flow metrics filling in `period_value` and stock
metrics leaving it null:

```
kpi_snapshots
  id            bigserial PK
  snapshot_date date      NOT NULL   -- always the 1st, UTC-safe (see below)
  metric_key    varchar(64) NOT NULL -- 'insights.verified_users', 'grow.ha_managed', ...
  value         numeric   NOT NULL   -- the level at snapshot, or cumulative for a flow
  period_value  numeric   NULL       -- the month's increment; NULL for stock metrics
  meta          jsonb     NULL       -- definition id, exclusion list applied, caveats
  created_at    timestamptz NOT NULL
  UNIQUE (snapshot_date, metric_key)
```

`metric_key` as a string rather than a column per KPI: adding a metric is then an insert,
not a migration, and the dashboard renders whatever it finds. The `UNIQUE` makes the job
idempotent — a re-run overwrites rather than duplicating, which matters because of the
seed-drift pattern already seen elsewhere in this repo.

**`meta` is not decoration.** Several of these numbers are only interpretable alongside the
definition in force when they were taken — which Ha source (§2.1), which MAU (§2.2), which
company exclusions. Storing it per row means a later definition change is visible in the
series instead of silently rewriting history.

### 3.2 Mutable status is a real limit on two metrics

`tasks.status` is a current state, not an event. "Tasks completed in July" computed today
counts tasks that are completed *now* and were created in July — not tasks completed in
July. A task completed in July and reopened in August has vanished from the July figure.

There is no `completed_at` column — only `completed_by`. So:

- **Once snapshots start running, this is fixed**: each month's snapshot freezes that
  month's count and nothing can retroactively change it.
- **Backfill before that is approximate** and should be marked so in `meta`.
- Optional, out of scope here: adding `tasks.completed_at` would make it exact going
  forward and is a one-line migration.

Same shape applies to "tasks scheduled". Define it explicitly — recommend **all tasks
created in the period excluding `draft`** (live: 24 of 25 net), since a draft was never
actually scheduled.

### 3.3 What can and cannot be backfilled

| Backfillable to first record | Forward-only from first snapshot |
|---|---|
| Verified users, Grow users, companies, properties, blocks (all have `created_at`) | ~~Newsletter opt-in %~~ — **seeded from Jul 2026**, §3.4 |
| Tasks, observations, risks, assets, incidents, visitors (`created_at`) | ~~Active weather stations~~ — **seeded from May 2026**, §3.4 |
| MAU / WAU from `user_events` — **to 2026-02-27** | **Ha under management** — areas are edited in place |
| | Task completion counts — exact only from first snapshot (§3.2) |

So the first run produces a genuinely useful **7-month history** for most of the list, and
the mutable-state metrics begin accruing from that date. Worth stating on the dashboard:
a chart that silently starts some series in February and others in October looks broken.

### 3.4 Seeded history — manually tracked figures, supplied 2026-09-15

Three of the metrics marked forward-only in §3.3 have **real history from a hand-kept
sheet**. Columns are month-start snapshots; the last is `2026-09-01` — the snapshot on the
1st covering the month ending 31 Aug.

| Metric | 2026-05-01 | 2026-06-01 | 2026-07-01 | 2026-08-01 | 2026-09-01 |
|---|---|---|---|---|---|
| Active weather stations (NZ) | 70 | 71 | 145 | 438 | 932 |
| Newsletter opt-in, % of verified | — | — | 85.0% | 86.4% | 86.0% |
| Live sub-regions (complete view) | — | — | 39% | 39% | 61% |

**The date mapping is confirmed against the database, not assumed.** Reconstructing station
counts from `created_at` gives 145 at 2026-07-01 (exact match) and 932 active at
2026-09-01 (exact match), with the right shape across all five columns. It also rules out
the alternative reading that the series ends 2026-08-01: the database holds ~430 stations
at that date, nowhere near 932.

**Why this history cannot be regenerated, and must be seeded rather than computed:**
reconstruction from `created_at` is *not* the same as the live count at the time, because
`is_active` is mutable. A station created in June and deactivated in September counts as
inactive in any reconstruction, however far back it reaches. That is exactly the drift
visible in the table above — 70 vs a reconstructed 81 at 2026-05-01. **The hand-kept
figures are the more accurate record and should win.**

So these rows load into `kpi_snapshots` with `meta.source = 'manual'` and
`meta.note = 'hand-tracked prior to automation'`, distinguishing them from
`meta.source = 'computed'` rows produced by the job. The dashboard should mark the seam —
a series that switches measurement method silently is how a step change gets mistaken for
a real trend.

`Live sub-regions (complete view)` is **not currently computable** — it is the May plan's
item 5, which was blocked on defining what makes a sub-region "complete" (§6 lists the
candidate rules). Until that is settled, it exists as seeded history only, with no job
writing new rows. Worth noting it moved 39% → 61% in one month, so somebody is applying a
definition; capturing that definition is what would let the job take it over.

**Unresolved:** four percentages accompanied the station series — `61%`, `100%`, `86%`,
`88%`. Four values against a five-point series, and they match neither active-as-%-of-total
(89/89/89/94/97 from the database) nor month-over-month growth. Not loaded pending
identification; see §6.8.

### 3.5 Scheduling

The existing job infrastructure applies — **EventBridge, not GitHub cron**: that pattern is
already established for every other scheduled job here, and the GH cron has run up to 9
hours late. Job health is judged by output freshness rather than exit status, which suits
this well: the check is "is there a row for the current month".

Two things the 1st-of-month timing needs:
- **Run on the 2nd, for the 1st.** A job firing at 00:0x on the 1st NZ time is still
  the previous month in UTC, and server-side `date.today()` on prod is yesterday's date all
  NZ morning. Snapshot the *completed* month rather than racing the boundary.
- **Idempotent + manually re-runnable.** The `UNIQUE (snapshot_date, metric_key)` gives
  this; an admin-only "recompute this month" button costs almost nothing and saves a
  deploy when a definition changes.

---

## 4. Build

Assumes the admin subdomain work. The dashboard replaces the current
`AdminDashboard.jsx` content, or sits beside it as `/kpis`.

| # | Task | Notes | Est. |
|---|---|---|---|
| 1 | Decide §2.1–§2.4 | Ha source is the blocker; the rest have recommendations | — |
| 2 | `kpi_snapshots` migration | One table + unique index. **Slug ≤ 32 chars** — the Alembic limit silently rolls back DDL | 0.5 d |
| 3 | `services/kpi_metrics.py` | One function per metric, each returning `(value, period_value, meta)`. Central exclusion list — **one constant, not repeated per query** | 1 d |
| 4 | Backfill script | Monthly walk from the earliest record; `--dry-run` default, idempotent upsert | 0.5 d |
| 5 | `GET /api/v1/admin/kpis` | `require_admin`. Series by metric + latest snapshot; no recompute on read | 0.5 d |
| 6 | Scheduled job + `/admin/jobs` entry | EventBridge, 2nd of month; surfaces in the existing job-health panel | 0.5 d |
| 7 | Dashboard UI | Tiles for current values, sparkline per metric, month-over-month delta, a definition note per tile | 1–1.5 d |
| 8 | Recompute button | Admin-only, re-runs one month | 0.25 d |
| **Total** | | | **4.25–4.75 d** |

Deliberately excluded: article reads/likes/comments (the May plan's items 8–10). They are
Insights *content* metrics rather than platform KPIs, and the May analysis of them still
stands — `user_events.article_read` is signed-in-only, `articles.view_count` counts every
page load and is easy to inflate, and only Umami sees anonymous reach. Add them later as
their own group once the snapshot machinery exists.

---

## 5. Risks

1. **The exclusion list is three hardcoded names.** `name IN ('Auxein','Auxein Test','App
   Store Test')` breaks the moment someone renames a company or adds "Auxein Demo". It
   silently *includes* the test data rather than failing — every figure inflates and
   nothing errors. Recommend a `companies.is_internal` boolean instead: explicit, survives
   renames, and one place to change. Until then, keep it in one constant and assert the
   expected count (3) at job start.
2. **Half the Grow user table is test data.** With 5 real companies and 9 real users, any
   single new customer moves every percentage sharply. Show absolute counts next to
   percentages — at this scale a ratio alone is misleading.
3. **MAU will look like it dropped when the definition changes.** Rolling-30-day (24) and
   calendar-month (15) are both "MAU" and differ by 38%. Change the definition once, at the
   start, and record which one is in force in `meta`.
4. **A definition change rewrites history unless snapshots are immutable.** If the Ha
   source flips from properties to blocks, past snapshots must keep their old value with
   the old `meta`, not be recomputed. Recomputation should be an explicit, per-month act.
5. **`timeseries_observations` is 47 partitions and huge.** The station-reporting check
   must always bound the timestamp; an unbounded `count(DISTINCT station_id)` scans years.
   The query in §2.3 bounds to 7 days and targets the 2026 partition directly.

---

## 6. Open questions

1. ~~Ha under management~~ — **ANSWERED 2026-09-15: `vineyard_blocks.company_id`, 203.28 ha** (§2.1). Remaining sub-question: exclude `mothballed`/`removed` blocks? (recommend yes → 201.35 ha)
2. **MAU: switch to calendar-month from `user_events`?** (§2.2 — recommend yes)
3. **Add a Grow "active users" metric from authorship?** (§2.2 — recommend yes)
4. **Observations: runs, spots, or both?** (§2.4 — recommend both)
5. **`companies.is_internal` flag instead of the hardcoded name list?** (§5.1 — recommend yes)
6. **Add `tasks.completed_at` so completion is exact going forward?** (§3.2 — cheap, recommended)
7. **Backfill to Feb 2026 on first run, or start clean from October?** (§3.3 — recommend backfill)
8. **What are the four percentages on the station row — `61% / 100% / 86% / 88%`?** (§3.4)
   Four values against five columns, matching neither active-as-%-of-total nor growth.
   Not loaded until identified.
9. **Is there more of the hand-kept sheet?** Any other KPI tracked there converts a
   forward-only metric into real history for the cost of one insert (§3.4).
10. **What defines a "complete" sub-region?** It moved 39% → 61% in a month, so a rule is
   being applied by hand; capturing it is what lets the job take the metric over (§3.4).
