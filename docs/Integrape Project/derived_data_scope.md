# Scoping the DERIVED and NOT BUILT items

Date: 2026-09-16 · Companion to `partner_api_draft.md`
Everything below was checked against the code, not estimated from memory.

---

## 0. Summary

| # | Item | State today | Size | Blocker |
|---|---|---|---|---|
| A | `/meta/models` registry | DERIVED — facts exist in docstrings, nowhere queryable | **S** (1–2 d) | Wording decisions, not code |
| B | `POST /rasters/sample` (batch) | DERIVED — `/surfaces/point` is single-point | **S** (2 d) | None. Cheaper than expected — see B |
| C | `/partner/health` | DERIVED — `/admin/jobs` already does the hard part | **S** (1 d) | None |
| D | `/meta/variables`, `/meta/availability` | Effectively LIVE | **S** (½ d each) | None |
| E | `/meta/entitlements` | NOT BUILT | — | Falls out of the auth build |
| F | **Change feed** | NOT BUILT, and **4 resources cannot support one today** | **M–L** (5–8 d) | Missing change markers — see F |
| G | Bulk export | NOT BUILT, and there is no job runner | **M** (4–5 d) | Design choice — see G |
| H | Raster object download | NOT BUILT | — | Recommend it stays out |

**Core total (A–D, F, G): roughly 13–18 working days, so 3–4 focused weeks**, on
top of the Phase 1 auth build. Two-thirds of that is F and G.

The headline: **B is much cheaper than it looks and F is more expensive** — and
F is the one a partner actually depends on.

---

## A. `/meta/models` — the model registry · S

Every fact this endpoint needs exists and is well documented. None of it is
queryable: it lives in migration docstrings and service comments.

The build is a small seeded table (`model_registry`: key, name, version,
citation, scale/bands, known limits, status) plus a read endpoint. A day of
code, a day of writing.

The writing is the part that matters, because this is where we say once, in a
versioned place:

- Bacchus's `1/I` assembly is an Auxein inference, not a published spec
- botrytis **severity** and **cumulative** are different quantities on different
  bands
- frost is withheld, and why
- `eto_mm` is Hargreaves-Samani from temperature — there is no measured ET
- which varieties have calibrated thresholds, and which do not

**Decision needed, not engineering time.** Worth doing before anything is sent
to Mirjam, because these caveats are the ones that are expensive to add later.

---

## B. `POST /rasters/sample` — batch point sampling · S

**This is the good news in the whole document.** `services/surface_store.py`
already exposes:

```python
def sample(s3_key: str, points: Sequence[tuple[float, float]]) -> list[Optional[float]]
```

It takes **N points per raster open**. The expensive part of a point sample is
opening the COG over GDAL's HTTP range reader; sampling 400 coordinates from an
already-open raster is close to free.

`/surfaces/point` loops the wrong way round for a partner: one point × N dates =
N opens. Inverting it — for each (variable, date), open once and sample every
point — means **400 vineyards over a year costs the same as one vineyard over a
year.** That is the difference between a viable integration and one that melts
the box.

Build: a request model, the inverted loop, a cap on `points × dates × variables`
with a clear `422`, and the existing null/nodata semantics carried through
unchanged.

Two operational notes:

- **`rasterio` must actually be installed in the serving venv.** A missing
  install presents as a 503 saying the surface is unreadable, which reads like a
  data problem and is not. Worth an explicit startup check before a partner ever
  sees it.
- Keep `cv_units` on the response. Rainfall is fitted in ratio space, so its
  `cv_rmse` is dimensionless and must never be rendered as millimetres.

---

## C. `/partner/health` · S

`api/v1/admin_jobs.py` already holds a `JOBS` registry with per-job `max_age`
(cadence + designed-in data lag) and a classifier that calls a job `late` at one
missed interval and `stale` at two. It judges on **output freshness, not exit
status**, which is the correct basis and the hard part.

The partner endpoint is a filter and a re-shape: only the pipelines behind
entitled resources, no internal job names, no SQL. One day.

Worth doing early — it converts "your data looks stale" from an email thread
into something their monitoring can read.

---

## D. `/meta/variables`, `/meta/availability` · S

`measurement_catalog` holds code, display name, canonical unit, value type and
rollup method — exactly the shape wanted. `/surfaces/available` already computes
first date, last date and gaps per variable × granularity.

Both are a re-shape behind the partner auth dep. Half a day each; count them
inside the endpoint work rather than as separate items.

---

## F. The change feed — and the finding that matters · M–L

This is the item to take seriously. I audited whether each table can even
support a change feed, by checking what its writer does on conflict.

| Resource | Marker | Moves on re-write? | Verified |
|---|---|---|---|
| `insights_site_daily` | `extracted_at` | **Yes** | `ON CONFLICT … extracted_at = EXCLUDED.extracted_at` |
| `insights_site_hourly` | `created_at` | **Yes** | `ON CONFLICT … created_at = now()` |
| `insights_site_disease` | `created_at` | **Yes** | `ON CONFLICT … created_at = now()` |
| `climate_zone_daily` | `created_at` | **Yes** | `ON CONFLICT … created_at = now()` |
| `insights_site_phenology` | `created_at` | **Yes** (append-only — `estimate_date` is in the PK) | model |
| `phenology_estimates` | `created_at` | **Yes** (append-only) | model |
| `insights_site_projection` | `extracted_at` | Yes | model |
| ~~`disease_pressure` (zone)~~ | `created_at` | **Yes — FIXED 2026-09-16** (was omitted from the `DO UPDATE SET`) | `disease_service_v2.py` |
| **`insights_site_monthly`** | — | **No column at all** | model |
| **`insights_site_season`** | — | **No column at all** | model |
| **`climate_zone_surface_monthly`** | — | **No column at all** | `zone_surface_monthly.py` |
| **`climate_zone_surface_season`** | — | **No column at all** | `zone_surface_season.py` |

So: the daily/hourly/disease/phenology path is ready. **The monthly and season
path has no change marker anywhere**, and zone disease silently keeps its
original timestamp when a day is re-scored.

Why this is the expensive item rather than a footnote: a partner who is told
"poll the change feed" and whose monthly series then never updates has a copy
that diverges from ours without either side noticing. That is the same class of
failure as a re-fit day inserted once and never corrected — except it happens in
their database, where we cannot see it.

Work:

1. Add `updated_at` to the four tables, defaulted and indexed (**note the
   32-character Alembic slug limit** — it silently rolls back DDL).
2. Fix the writers: set it on conflict. One-line change in `disease_service_v2.py`
   for zone disease; the monthly/season writers need the column threaded through.
3. Backfill existing rows to a sentinel so a first full pull is well-defined.
4. Build `GET /changes?since=` over a union of the resources, returning
   `{resource, key, updated_at}` — keys, not payloads, so the feed stays cheap
   and the consumer pulls what it needs.
5. A test that re-running a pipeline over an existing day actually moves the
   marker. Without this the feed will look correct and be wrong.

Also worth renaming in the contract if not in the schema: three of these
columns are called `created_at` but behave as `updated_at`. Expose them to a
partner as `updated_at`, whatever the column is called underneath.

---

## G. Bulk export · M

There is **no job infrastructure** in the API. The only async mechanism is
FastAPI `BackgroundTasks`, which runs in-process and dies with the instance —
not a basis for a 40-year extract. Surfaces already run on Fargate under
EventBridge, so the capability exists, just not from a web request.

Two options:

**G1 — pre-generated snapshots (recommended, ~4 d).** A scheduled task writes
Parquet/CSV per resource per entitlement scope to S3 on a cadence (nightly for
current season, weekly for archive). `POST /exports` becomes "here is a signed
URL to the latest snapshot" — no queue, no workers, no request that runs for
twenty minutes. Predictable cost, and it rides infrastructure that already
works.

**G2 — real export jobs (~8–10 d).** A job table, an ECS `run_task` trigger, a
status endpoint, retries. Genuinely on-demand, arbitrary ranges. Only worth it
if partners need slices we cannot anticipate.

**Take G1.** The backfill is a one-off event and the ongoing need is deltas,
which the change feed serves. If a partner later needs arbitrary extracts, G2
can be added without changing the contract — `POST /exports` returning a job id
is the same shape either way.

---

## H. Raster objects · no build

Recommended out, per `partner_api_draft.md` §2.4. Nothing to scope. It is a
commercial decision, and the decision is worth making explicitly rather than by
omission — the rasters are the asset, and handing over the archive converts an
annual licence into a one-off sale we never priced.

---

## I. Gaps that are modelling, not plumbing

These are not API work. They will surface in the spec regardless, so they need
positions rather than estimates.

| Gap | What it would take | Recommendation |
|---|---|---|
| ~~**Bacchus is site-level only**~~ | — | **BUILT 2026-09-16.** `zone_bacchus_index` migration + `disease_service_v2.py`; backfilled 1–15 Sept, 328 zone-days across 22 zones. Zone and site Bacchus are now both available and will legitimately disagree (different spatial source) |
| **No daily RH at site level** — RH is hourly-only | A defined daily aggregate, **S–M** | Needs a definition decision first (mean of hourly? min? a fixed hour?). Do not invent one to fill a column |
| **Pinot gris has no `variety_code`** | Threshold derivation + validation | Out of scope for the integration. Return no phenology rather than a default |
| **Frost withheld** | Resolve the coverage artefact behind the regional bias | Stays withheld. Declared in `/meta/models` |
| **No disease forecast** | Per `integration_plan.md` §4.1–4.2 | Out until the MetOcean licence question clears |

---

## J. Sequencing

**Before anything is sent to Mirjam** (no engineering): A's wording decisions,
and positions on the §I gaps. These set what the spec commits us to, and they
are the expensive things to change later.

**Phase 1** (auth — see `partner_api_draft.md` §4). E falls out of it.

**Phase 2a** — D + B + C alongside the read endpoints. All small, and B is what
makes site-heavy consumption affordable.

**Phase 2b** — F. Start the marker migration early: it is a schema change
touching four tables and it wants to be settled before a partner is depending
on the feed, not after.

**Phase 3** — G1.

The one thing I would not defer is the **F marker audit**. It is cheap now and
it is the kind of gap that stays invisible until a partner's monthly numbers
have been quietly wrong for a season.
