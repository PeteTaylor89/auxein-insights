# Auxein Partner Data API — scoped specification v2

Date: 2026-09-17 · Status: **scope, nothing built** · Supersedes the site, auth
and raster sections of `partner_api_draft.md`; the rest of that draft still
stands.

**Commercial in confidence. Indicative, and subject to agreement.**

---

## 0. What this document does

`partner_api_draft.md` was a catalogue of everything the platform could
plausibly expose. This one narrows to the five things asked for, and every
field in it is verified against the live schema rather than proposed:

1. **The My Site record as it actually exists today** (§1) — nine tables, the
   exact columns, and which of them are populated.
2. **The site API** (§2) — register a site (which triggers the extraction),
   read one, list them all, and the sub-resources under each.
3. **An authentication key** (§3) — the M2M credential. None exists today.
4. **Daily surfaces as GeoTIFF** (§4) — a reversal of the draft's §2.4
   recommendation, scoped with the guard rails that make it survivable.
5. **Regional data from the Regional Explorer** (§5).

One thing carried forward unchanged, because it governs everything below: the
API is **one versioned `/api/v1/partner/*`, with Integrape as tenant #1 and
entitlements as data.** Nothing here is Integrape-specific in code.

### 0.1 A note on §4 before you read it

The draft argued against shipping GeoTIFFs, and the argument has not changed:
the rasters are the asset, and a partner holding the archive can answer every
question in §1, §2 and §5 forever without us. It converts an annual licence into
a one-off sale nobody priced.

That is a commercial judgement, not a technical blocker, and it is Pete's to
make. §4 scopes the export properly and adds the four terms — tier, lag, extent
cap, and a licence clause naming redistribution — that make a raster licence
enforceable rather than merely regretted. If the answer is still no, §4 costs
nothing to leave unbuilt and §2/§5 stand on their own.

---

## 1. The My Site schema, as built

Nine tables, all keyed on `insights_site.id`. Everything below is verified
against `backend/db/models/insights_site.py` plus the migrations that extended
it (`site_gdd_columns`, `site_water_balance`, `site_hourly_disease`,
`bacchus_botrytis_index`, `site_phenology`, `budburst_chilling_forcing`,
`site_projection`, `insights_accounts`).

A site is **one 500 m grid cell.** It therefore carries a value, not a
distribution — the opposite of a zone (§5), which carries min/max/p10/p90
across real vineyard cells. That difference is the reason the two families do
not share a schema, and it should be stated in anything sent out.

### 1.1 `insights_site` — the site record

| Column | Type | Notes |
|---|---|---|
| `id` | bigint | |
| `public_user_id` | int, null | A Pro slot owner. NULL for an account site |
| `account_id` | bigint, null | An enterprise account. **Exactly one of these two is set**, enforced by `ck_insights_site_one_owner` |
| `company_id` | int, null | A **label**, not the owner — the Grow tenant via the one-way SSO link. NULL for direct subscribers |
| `source` | text | `pro_slot` / `account` / `grow`. Decides whether quota and move rules apply |
| `site_type` | text, null | `regional` / `sub_regional` / `phenology`, from the client's own list |
| `external_ref` | text, null | **The client's identifier.** Their platform is the system of record for what a site is called |
| `requested_metrics` | text[], null | What the client asked for at this site. **Not derivable from `site_type`** |
| `variety` | text, null | In the client's own words |
| `variety_code` | varchar(10), null | Resolved to `phenology_thresholds`. `variety` set with `variety_code` NULL means we hold no model for it |
| `slot_index` | smallint | Which entitled slot this occupies |
| `label` | varchar(80), null | |
| `latitude` / `longitude` | float | |
| `elevation_m` | float, null | |
| `grid_row` / `grid_col` / `grid_key` | int / int / text | The resolved surface cell and the grid those indices belong to |
| `zone_id` | int, null | Regional comparator. **NULL is legitimate** — a site outside every mapped zone has no regional background |
| `status` | text | `populating` → `ready`. See §2.2 |
| `status_detail` | text, null | |
| `requested_at` / `populated_at` | timestamptz | |
| `moves_used` / `move_window_start` | smallint / timestamptz | 2 moves per 365 days on a Pro slot; not applied to account sites |
| `created_at` / `updated_at` | timestamptz | |

### 1.2 `insights_site_daily` — the daily record

PK `(site_id, date)`. **This is an UPSERT target, not an append log.**

| Column | Unit | Notes |
|---|---|---|
| `date` | — | Local calendar date, Pacific/Auckland |
| `temp_min` / `temp_max` / `temp_mean` | °C | From the fitted daily surface at this cell |
| `rainfall_mm` | mm | |
| `gdd_daily` / `gdd_cumulative` | °C·day | **Base 0**, accumulated from 1 September |
| `gdd10_daily` / `gdd10_cumulative` | °C·day | **Base 10.** Both bases are stored; they are not interchangeable |
| `eto_mm` | mm | Reference ET, **Hargreaves-Samani from temperature — an estimate, never a measurement** |
| `etc_mm` | mm | Crop ET |
| `water_balance_mm` | mm | Running balance |
| `eto_method` | — | Named on every row, so a consumer can tell what produced it |
| `model_version` | — | Which surface era this day came from |
| `extracted_at` | timestamptz | |

Two properties that must reach a partner in bold:

- **NULL is never zero.** An absent rainfall day and a measured dry day are
  different facts, and this table keeps them apart.
- **Recent days change.** The engine re-fits a trailing D-9..D-3 window weekly,
  because `daily_aggregation` keeps revising `weather_data_daily` for about
  three days. A consumer that inserts once will diverge from us silently.

**Coverage:** continuous from **2026-02-15**. Nothing earlier exists at daily
granularity — the 1986 archive is monthly (§1.3). This is the single most
important number in this document for anyone sizing a backfill.

### 1.3 `insights_site_monthly` — the long record

PK `(site_id, variable, statistic, year, month)`, one `value` (float, nullable).

Back to **1986-01**, sampled from the monthly surface archive at this cell.
Variables and statistics follow the same bands the zone tables aggregate
(`scripts/aggregate_zone_monthly.BANDS`) so a site and its zone are comparable
by construction: temperature means, rainfall sum and wet days, threshold counts,
`gdd10` and the rest.

**Frost statistics exist in this table and must not be exported.** See §1.9.

### 1.4 `insights_site_season` — per-vintage metrics

PK `(site_id, vintage_year, metric)`, with `value`, `unit`, and `baseline` set
only for metrics that depend on a baseline period.

Metrics derived at the cell: `gdd10`, `tmean`, `tmin`, `tmax`, `hot_days_25`,
`hot_days_30`, `rain`, `wet_days`, `rain_days_over_10mm`,
`rain_days_over_25mm`, `max_dry_spell_within_month`, `rx1day`.

**A partial season emits no row.** Summing six months of eight would read as a
low year rather than as missing data, which is the failure a partner cannot
detect from their side.

### 1.5 `insights_site_hourly` — the hourly record

PK `(site_id, timestamp_utc)`. The provenance columns are the product here.

Values: `temp_mean`, `rh_mean`, `dewpoint`, `precipitation`, `wind_mean`.
Derived: `is_wet_hour`, `wetness_probability`, `wetness_source`,
`hours_since_rain`.
Provenance: `temp_station_count` + `temp_nearest_km`, `rh_station_count` +
`rh_nearest_km`, `rain_station_count` + `rain_nearest_km`,
`wind_station_count`, and `confidence`.

**Hourly is IDW from stations, not a fitted surface** (`services/point_climate.py`),
and it **refuses beyond measured distances**: temp 80 km, humidity 30 km,
rain 25 km, wind 50 km. `rh_station_count: 0` beside `temp_station_count: 4` is
the real failure mode worth naming — a hygrometer-free neighbourhood once
silently zeroed RH on this platform. Exposing the counts is what lets a partner
distrust the right rows instead of all of them.

Hourly is **24x the rows of daily** and is what makes the disease models
reproducible on the consumer's side. It is a separate entitlement (§3.4).

### 1.6 `insights_site_disease` — four models

PK `(site_id, date)`, plus `vintage_year` and `growth_stage`.

| Model | Columns |
|---|---|
| Powdery mildew (UC Davis / Gubler 1999) | `powdery_mildew_risk`, `pm_daily_index`, `pm_cumulative_index`, `pm_favorable_hours`, `pm_lethal_hours` |
| Botrytis (Gonzalez-Dominguez 2015) | `botrytis_risk`, `botrytis_severity`, `botrytis_cumulative`, `botrytis_wet_hours`, `botrytis_sporulation_index` |
| Bacchus (Balasubramaniam and Edwards) | `bacchus_index`, `bacchus_peak`, `bacchus_infection`, `bacchus_wet_hours`, `bacchus_dry_run` |
| Downy mildew (3-10 rule + Goidanich) | `downy_mildew_risk`, `dm_primary_met`, `dm_primary_score`, `dm_goidanich_index` |

Plus `humidity_available`, `hours_used`, `risk_factors` (JSONB).

Four commitments a partner payload has to carry:

1. **Bacchus is five numbers, not one.** The model is scoped to a wet period and
   the table to a day, so a wet period running 22:00 to 06:00 is one infection
   event across two rows. `index` is the state carried out of the day; `peak` is
   the highest reached during it and is **what to display**; `infection` is the
   event. Charting `index` as the day's risk under-reports, because a reset can
   wipe a period that got most of the way to 1.0.
2. **Bacchus precision is four decimal places** (`Numeric(7,4)`) and must
   survive the round trip. The index sums terms of order 0.01-0.07 against a
   threshold of exactly 1.0.
3. **`botrytis_severity` and `botrytis_cumulative` are different quantities on
   different scales.** Drawing one under the other's bands is a wrong chart — it
   has already happened once on our own screens.
4. **`humidity_available: false` and `hours_used < 24` are load-bearing.** They
   are how a consumer knows a low score means "low risk" rather than "we could
   not see". 23 of 67 sites on the current account carry no score at all.

**There is no forward disease forecast.** These indices score D-1 from observed
data. Any forecast framing stays out until MetOcean redistribution rights are
resolved.

### 1.7 `insights_site_phenology`

PK `(site_id, variety_code, vintage_year, estimate_date)`.

Accumulation: `gdd_accumulated` (base 0 from 1 Sep), `gdd_from_oct1` (what the
harvest thresholds are calibrated against), `current_stage`, `avg_daily_gdd`.
Stages: `flowering_date` + `flowering_is_actual`, `veraison_date` +
`veraison_is_actual`, and `harvest_170/180/190/200/210/220_date`.
Budburst: `budburst_date`, `budburst_is_actual`, `endodormancy_date`,
`chill_units`, `forcing_units`, `variety_is_assumed`.
Comparators: `days_vs_baseline`, `gdd_vs_baseline`, `baseline_source`, and a
**stored** zone block — `zone_id`, `zone_gdd_accumulated`,
`zone_flowering_date`, `zone_veraison_date`, `zone_harvest_210_date`.
Plus `confidence`.

Five things that are each a wrong number waiting to happen downstream:

1. **Budburst runs a different model from everything below it** — chilling then
   forcing, triggered by a photoperiod that moves with latitude, not by a fixed
   1 September start. `endodormancy_date` is not decoration: a budburst date is
   unreadable without it.
2. **`forcing_units: null` means dormancy has not released.** Not the same as
   having accumulated none.
3. **Two GDD accumulations, deliberately.** One accumulation cannot serve both
   the season total and the harvest thresholds.
4. **The zone block is stored, not joined**, so both halves carry the same
   estimate date and "am I ahead of the district" is like-for-like.
5. **`variety_is_assumed: true` is a warning.** The substitution is worth 5-20
   days against a model RMSE of 4.9 days. A variety we hold no thresholds for
   returns no phenology at all rather than a silent default — four sites on the
   current account want Pinot gris, which is not in the table.

The phenology **vintage rolls 1 July** while the accumulation starts
1 September. Two different rules, both load-bearing.

### 1.8 `insights_site_projection` and `insights_site_yield`

`insights_site_projection` — unique on `(site_id, scenario, period, season,
variable, statistic)`, carrying `baseline_value`, `projected_value`, `delta`
(stored, not derived), `unit`, `model_version`, `rule`, `grid_key`. Downscaled
MfE 2024 at this cell against its own 1986-2005 normal. No p10/p90: those
describe spread across a zone's cells, and at a point the honest value is
absent. **Rainfall change is a percentage, not millimetres.**

`insights_site_yield` — PK `(site_id, vintage_year, variety_code)`, with
`value`, `unit` (`t/ha` or `kg/vine`, stored never assumed), `note`,
`entered_by`, `entered_at`. **Client-entered, never modelled.** There is no
yield model on this platform and nothing in an export may imply otherwise. For
a partner this is most likely a **write** surface, not a read one (§2.4).

### 1.9 What is withheld, and why it must stay withheld

**Every frost metric.** `frost_days`, `early_frost_days` and the last-spring-
frost day are computed and stored in `insights_site_monthly` and
`insights_site_season`, and are **removed from the product** — from the regional
overview, the climate explorer, the API schemas and the article widget.

The count is thresholded off a lapse-retrended Tmin field, and on frost nights
the atmosphere inverts: cold air drains to the valley floor, so the lapse is
wrong in sign for exactly the nights that make the count. Measured against
stations in Marlborough, frost is loaded onto the tops and erased from the
valley floors, which is where the vines are. The MfE projection composes onto
the same broken normal and reaches p99.9 = 209 frost days.

`projection_store.WITHHELD` already blocks this at the catalogue, the step list
and at resolve. **A partner export is a fourth door and needs the same block**,
raising the same error a genuinely absent layer raises so a withheld metric does
not advertise itself to anyone probing the URL space.

---

## 2. The site API

Base `https://api.auxein.co.nz/api/v1/partner`. Every response uses the envelope
and conventions in `partner_api_draft.md` §1: UTC instants with explicit offset,
Pacific/Auckland calendar dates, `null` never meaning zero, units echoed in
`meta.units`, cursor paging, `updated_since` on every time-series resource.

Status column: **LIVE** = the data exists and is written today, the endpoint is a
re-shape. **NEW** = net-new build.

### 2.1 The catalogue

| Method | Path | Returns | Status |
|---|---|---|---|
| `POST` | `/sites` | Register a site. **202** — triggers the extraction | LIVE |
| `GET` | `/sites` | Every entitled site | LIVE |
| `GET` | `/sites/{id}` | One site | LIVE |
| `PATCH` | `/sites/{id}` | Relabel, or move (re-triggers the extraction) | LIVE |
| `DELETE` | `/sites/{id}` | Remove a site and its record | LIVE |
| `GET` | `/sites/{id}/daily` | §1.2 | NEW — the data is live, the shape is `/timeseries` |
| `GET` | `/sites/{id}/hourly` | §1.5 | NEW |
| `GET` | `/sites/{id}/monthly` | §1.3 | LIVE |
| `GET` | `/sites/{id}/seasons` | §1.4 | LIVE |
| `GET` | `/sites/{id}/phenology` | §1.7 | LIVE |
| `GET` | `/sites/{id}/disease` | §1.6 | NEW — served today inside `/timeseries` |
| `GET` | `/sites/{id}/projections` | §1.8 | LIVE |
| `GET`/`PUT` | `/sites/{id}/yield` | §1.8 | NEW |
| `GET` | `/sites/{id}/stations` | The stations feeding the hourly record, per leg, nearest first | LIVE |
| `GET` | `/portfolio` | One row per site: season to date vs its own baseline to the same day, next stage, disease headline | LIVE |

The existing Pro endpoints these re-shape live in
`backend/api/v1/insights_sites.py`. Phases 2 and 3 of the build are small
precisely because the SQL already exists — the work is entitlement filtering,
paging and the envelope, not the queries.

### 2.2 `POST /sites` — the hinge of the integration

This is the endpoint that triggers the history build, and it is the one most
likely to be misread on first integration.

```http
POST /api/v1/partner/sites
Authorization: Bearer auxp_live_7f3a...

{
  "external_ref": "IG-VY-00412",
  "label": "Rapaura Home Block",
  "latitude": -41.4712,
  "longitude": 173.8305,
  "variety": "Sauvignon Blanc",
  "site_type": "sub_regional",
  "requested_metrics": ["gdd", "disease", "phenology", "et"]
}
```

```http
HTTP/1.1 202 Accepted
```

```json
{
  "data": {
    "id": 412,
    "external_ref": "IG-VY-00412",
    "status": "populating",
    "latitude": -41.4712, "longitude": 173.8305,
    "cell": {"grid_key": "nz500-v3", "row": 1841, "col": 903},
    "elevation_m": 34.0,
    "zone": {"id": 7, "slug": "marlborough-wairau-valley"},
    "variety": "Sauvignon Blanc",
    "variety_code": "SB",
    "requested_at": "2026-09-17T02:14:09Z",
    "populated_at": null
  },
  "meta": {
    "message": "Building the climate history for this site.",
    "expected_ready_seconds": 120
  }
}
```

**What 202 means, and what the spec must say plainly.** Registration writes the
row and queues the extraction. The extraction runs out of process and reads
**about 7,700 separate S3 objects** to build forty years of monthly record at
the cell, then the daily series, then seasons, projections, phenology and
disease. It takes roughly 90 seconds to a few minutes.

So: **a site polled immediately after registration is legitimately empty.**
Without that sentence in the spec, Mirjam's first integration test reads an
empty site and looks broken. The correct client behaviour is:

1. `POST /sites` → keep the returned `id` against your `external_ref`.
2. Poll `GET /sites?status=populating` (or the single site) until `status` is
   `ready` and `populated_at` is set.
3. Only then pull the sub-resources. A sub-resource on a non-ready site returns
   `409` with code `site.not_ready` — **not** an empty 200, which would be
   indistinguishable from a site with no data.

`status` values: `populating`, `ready`, `failed` (with `status_detail`).

**`external_ref` is how the two systems stay joined.** Their platform is the
system of record for what a vineyard is; matching on our label breaks the first
time somebody tidies a name. It should be unique per client and the API should
enforce that, returning `409 site.duplicate_ref` — a silent second row at the
same place is two answers to one question.

**Placement can be refused.** `resolve_cell` raises a `PlacementError` when a
coordinate falls outside the grid or on a nodata cell; it searches up to eight
rings for the nearest land cell first. A refusal is `422` with the code and the
searched extent, and the response says which. A coordinate in the sea should
never quietly become the nearest land cell without the client being told the
cell moved.

### 2.3 `GET /sites` and `GET /sites/{id}`

`GET /sites` returns every site the credential is entitled to, one row each,
shaped exactly as the `data` block above. Filters: `status`, `site_type`,
`zone`, `variety_code`, `updated_since`, plus cursor paging. A lookup by their
own identifier is `GET /sites?external_ref=IG-VY-00412` rather than a second
path, so there is one canonical URL per site.

`GET /sites/{id}` takes `?include=` to fold in the current state without a
second round trip — `include=latest_daily,phenology,disease` is what a partner
dashboard tile actually needs, and refusing it guarantees an N+1 against us.

### 2.4 Sub-resources

All time-series resources take `from`, `to`, `vintage`, `updated_since`,
`limit`, `cursor`. `vintage` is a shorthand for the Sep-Apr season bounds, and
**defaults to the current season, not to everything** — the daily record is
short today and will not stay short.

`GET /sites/{id}/daily` returns §1.2 verbatim, one object per date, with
`meta.units` and `meta.model_version`. The existing `/timeseries` endpoint
returns parallel arrays because a chart wants columns; a partner feed should get
objects, and both should come from the same builder so an export cannot disagree
with the screen it came from.

`PUT /sites/{id}/yield` is the only write below the site itself. It exists
because yield is client-entered, and a partner who can post their own harvest
figures back gets a platform that compares them against modelled season metrics.
`entered_by` is attribution, not bookkeeping: a number nobody can attribute is a
number nobody will trust beside modelled figures six months later.

### 2.5 Keeping a copy in sync

Two things make the difference between a partner who is happy at month six and
one re-pulling forty years every night:

- **`GET /changes?since=`** — resource, id, key, `updated_at`, including
  revisions to days already delivered. Without it the only correct client
  strategy is a trailing re-pull of unknown depth. **NEW.**
- **`POST /exports` → `GET /exports/{job_id}`** — a bulk extract (Parquet or
  CSV) behind a signed URL, for the initial backfill. **NEW.**

A first integration is then: register every site, one bulk export per family,
nightly `/changes` → upsert, and in-season daily pulls of phenology and disease.

---

## 3. The authentication key

**There is no machine-to-machine authentication in the backend today.** Verified:
every public endpoint authenticates a `public_users` JWT through
`get_current_public_user`, which reads `user_id` from the claims. The nearest
analogue is the server-verified embed grant for article widgets, which is
purpose-built and not generalisable. `ingestion_credentials` is the inbound
direction — our keys for councils' systems — and is not reusable here.

This is the largest net-new build in the whole scope, and it is the prerequisite
for everything in §2, §4 and §5.

### 3.1 Recommendation: an API key, not OAuth2

The draft proposed OAuth2 client credentials. For a bulk data feed, a **long-
lived API key presented as a bearer token** is the better first build:

- It is one request to integrate against, not two, and every HTTP client and
  every ETL scheduler already does it.
- It removes a token endpoint, a token cache and a clock-skew failure mode from
  the partner's side — and a token endpoint is the thing that breaks a nightly
  job at 3am in a way nobody is awake to see.
- It costs nothing later: a `/partner/token` exchange can be added over the same
  `partner_credential` table without breaking a key-based client, because the
  key remains the credential either way.

Where it is genuinely worse — a leaked long-lived secret has no natural expiry —
is answered by rotation, scoping and the request log below, all of which we need
regardless.

### 3.2 The key

```
auxp_live_7f3a2c9e4b1d...        (live)
auxp_test_0a4e18bc77f2...        (sandbox)
```

- Prefix (`auxp`), environment (`live` / `test`), then 32 bytes of
  `secrets.token_urlsafe` entropy. The prefix makes a leaked key greppable in a
  repository scan and identifiable in a support ticket.
- Presented as `Authorization: Bearer <key>` on every request.
- **Stored as an argon2 hash.** We keep the visible prefix and the last four
  characters so support can identify a key without holding it. **Shown in full
  exactly once, at creation.** There is no recovery path, only rotation.
- TLS only; a key arriving over plain HTTP is treated as compromised and
  revoked.

### 3.3 Tables

| Table | Purpose |
|---|---|
| `partner_client` | The organisation. Status, contract start and end, contact, environment |
| `partner_credential` | Hashed key, visible prefix and last 4, `created_at`, `last_used_at`, `revoked_at`, optional `expires_at`. **Multiple active rows per client** so rotation overlaps and is never a cutover |
| `partner_entitlement` | client x resource x scope. **This is the commercial model as data** |
| `partner_request_log` | Timestamp, client, credential, route, entitlement decision, row count, bytes, latency, status. **No payloads** |

### 3.4 Entitlements — the dials the contract turns without code

- **Resources** — which of §2, §4, §5.
- **Geography** — which zones; which sites, by account or explicit list.
- **Variables** — which measurement codes. This is where frost stays blocked
  (§1.9).
- **History depth** — the earliest date readable. An open decision (§6).
- **Granularity** — hourly yes or no. 24x the rows, and it is what makes the
  disease models reproducible on their side. A separate grant.
- **Raster tier** — `sample` / `tile` / `object` (§4).

`GET /meta/entitlements` returns this to the holder of the key. A partner who
can read their own entitlement stops guessing why a 403 happened, and it turns
upsell into a visible boundary rather than an argument.

Scope is checked first (does the key claim it), entitlement second (is the
client granted it, for this zone, this site, this date). Both, always.

### 3.5 The isolation requirement

**The partner key and the `public_users` JWT must be mutually unacceptable.**
Partner dependencies reject anything that is not a `partner_credential`; public
dependencies reject a partner key outright. This is the one part that must not
be casual: `get_current_public_user` reads `user_id` from the claims, so a
credential carrying a well-chosen claim set is exactly the kind of thing that
ends up authenticating somewhere nobody intended.

Two tests, asserting each direction is rejected. Also note that `HTTPBearer()`
defaults to `auto_error=True` and returns **403 to an anonymous caller**, not
401 — the partner dependency should return 401 with `WWW-Authenticate: Bearer`,
because a 403 tells an integrations engineer their key was wrong when in fact
it was absent.

### 3.6 Limits, rotation, operations

- **Rate limit per client** (requests/minute) protects the box.
- **Row and byte quota per day** protects the asset, and is the number that
  matters when the API is priced flat. `429` with `Retry-After`, and
  `X-RateLimit-Remaining` on every response so a well-behaved client can pace
  itself. Bulk export (§2.5) exists so nobody needs to hammer the paged
  endpoints.
- **Rotation**: create the second key, both work, they cut over, revoke the
  first. `last_used_at` tells us when that is safe.
- **IP allowlist**, optional per client, off by default. One column, and some
  security reviews require it.
- **Sandbox**: a `partner_client` in `test` with a fixed synthetic dataset and
  its own key. Mirjam can build the whole integration before a contract is
  signed, which is a sales asset rather than a cost.
- **Errors**: `application/problem+json` with a stable `code`. Day one:
  `auth.invalid_key`, `auth.key_revoked`, `auth.scope_missing`,
  `entitlement.resource`, `entitlement.geography`, `entitlement.history_depth`,
  `entitlement.granularity`, `quota.rate_limited`, `quota.rows_exhausted`,
  `site.not_ready`, `site.duplicate_ref`, `placement.refused`,
  `data.unavailable`, `data.withheld`.

`site.not_ready`, `data.unavailable` and `data.withheld` are the three that stop
a partner reading absence as zero: come back, there is genuinely nothing here,
and we hold this but do not publish it.

---

## 4. Daily surfaces as GeoTIFF

### 4.1 What exists

The rasters are Cloud Optimized GeoTIFFs on a **private** S3 bucket
(`auxein-climate-surfaces`), indexed by `surface_run` in Postgres. Nothing in
the database stores pixels; one row locates any object and reports how accurate
it is.

```
s3://auxein-climate-surfaces/surfaces/v2/<variable>/daily/<YYYY>/<MM>/
    <variable>_daily_<YYYYMMDD>_500m.tif
```

| Property | Value |
|---|---|
| Variables at daily granularity | **`temp_min`, `temp_max`, `temp_mean`, `rainfall` — these four only** |
| Resolution | 500 m |
| Grid | 2856 x 2667, New Zealand |
| dtype | float32, with nodata |
| Coverage | **2026-02-15 to present.** Roughly 215 days x 4 variables |
| Cadence | D+2 at 03:00 NZ, plus a weekly D-9..D-3 refit at Sun 04:00 NZ |
| `model_version` | `tps-2.0.0-ridge-db-adj` (temperatures, era-corrected), `tps-2.0.0-ridge-db` (rainfall, uncorrected) |
| `statistic` | **NULL** for daily. It is a value, not an aggregate |

`surface_run` carries per-object `cv_rmse`, `cv_units`, `n_stations_fit`,
`n_stations_test`, `n_stations_excluded`, `relevance_km`, `smoothing`, `edf`,
`clipped` and `status`. Current medians: temp_mean 1.29 °C, temp_min 2.15 °C,
temp_max 1.45 °C, rainfall 0.002 dimensionless.

### 4.2 The four things an export must state

1. **The daily archive starts 2026-02-15.** Anyone sizing a historical raster
   backfill from this endpoint will otherwise assume 1986, which is the monthly
   archive. Monthly GeoTIFFs back to 1986-01 exist and are a **separate**
   grant — they are the deeper asset and should be priced as one.
2. **`cv_units` must be honoured.** Rainfall is fitted in **ratio space**, so its
   `cv_rmse` is dimensionless (about 0.0025) and **must never be rendered as
   millimetres**. This is the single most likely misreading in the whole raster
   offering.
3. **The archive is stored unclipped.** Values exist beyond the coast and the
   land mask. Reading `null` with a reason is correct at those cells; reading
   the number is not.
4. **Days are revised.** The weekly refit rewrites D-9..D-3 **at the same S3
   key**. A consumer caching by key alone will serve a stale raster forever. The
   catalogue's `created_at` and `model_version` are how they detect it, and the
   change feed (§2.5) is how they are told.

### 4.3 The endpoints

| Method | Path | Returns | Status |
|---|---|---|---|
| `GET` | `/rasters/catalogue` | One row per published object: variable, granularity, statistic, `valid_at`, resolution, `model_version`, `cv_rmse` + `cv_units`, station counts, `clipped`, `status`, `created_at`, `bytes`, `checksum` | LIVE (`surface_run`) |
| `GET` | `/rasters/{id}/object` | **Time-limited signed URL to the GeoTIFF** | NEW |
| `POST` | `/rasters/objects` | Batch: a variable and date range → a list of signed URLs, one per object | NEW |
| `POST` | `/rasters/sample` | Batch point sample, N coordinates x a date range → values | NEW (`store.sample` already takes a sequence of points; `/surfaces/point` exposes one) |
| `GET` | `/rasters/tiles/...` | Rendered PNG tiles for display | LIVE |

```json
{
  "data": {
    "id": 184102,
    "variable": "temp_min",
    "granularity": "daily",
    "statistic": null,
    "valid_at": "2026-09-14T00:00:00Z",
    "resolution_m": 500,
    "model_version": "tps-2.0.0-ridge-db-adj",
    "cv_rmse": 2.08, "cv_units": "C",
    "n_stations_fit": 214, "n_stations_test": 24, "n_stations_excluded": 3,
    "clipped": false, "status": "ok",
    "created_at": "2026-09-16T15:02:11Z",
    "bytes": 6203488,
    "checksum": "sha256:9f2c...",
    "url": "https://auxein-climate-surfaces.s3.../temp_min_daily_20260914_500m.tif?X-Amz-...",
    "url_expires_at": "2026-09-17T03:14:09Z"
  }
}
```

The signed URL is minted per request against the private bucket, short-lived
(15 minutes suggested), and **logged in `partner_request_log` with the object
id and its byte count**. The log is what makes the byte quota real and what
answers "what did they actually take" at renewal.

### 4.4 The four terms that make this survivable

If GeoTIFF objects ship, these are not optional extras — they are the difference
between a licence and a handover:

1. **Tier it.** `raster: sample` / `tile` / `object` is already an entitlement
   dimension (§3.4). Objects are the top tier and priced separately from the
   API. A client on `sample` and `tile` gets everything their users see.
2. **Lag it.** Objects available at **D-14** rather than D+2. The refit window
   closes at D-3, so a 14-day lag also means every object handed over is final
   and will not be silently rewritten — the lag solves §4.2(4) as well as the
   commercial exposure. Point sampling and tiles stay at D+2, so nothing the
   partner's users see gets slower.
3. **Cap the extent.** A rows/day quota does not bound rasters; a
   **objects/day** and **bytes/day** quota does. The full daily archive is on
   the order of 860 objects and a few gigabytes — without a cap it is a single
   afternoon's download.
4. **Name redistribution in the contract.** The licence must say the objects are
   for use within the licensee's platform, are not sublicensable, and do not
   survive termination. A raster with no clause attached is a raster that has
   been sold.

Absent these four, the honest position remains the draft's: sell sampling and
tiles, keep the objects.

### 4.5 Build size

| Piece | Size |
|---|---|
| `/rasters/catalogue` — paged, filtered projection of `surface_run` | S |
| `/rasters/{id}/object` + `/rasters/objects` — signed URL minting, lag rule, object and byte quota, logging | S-M |
| `/rasters/sample` — batch over the existing `store.sample` | S |
| Tile access under a partner key | S |

The whole of §4 is small **because** the index and the reader already exist. The
cost in §4 is commercial, not engineering, which is exactly why the decision
should be made on commercial grounds.

---

## 5. Regional data from the Regional Explorer

The Regional Explorer is the free, ungated regional view: 23 climate zones under
their wine regions, with the season to date, phenology, disease, forty years of
history and the downscaled projections. It is the broadest coverage we have and
the easiest part of the offer to deliver, because every query already exists in
`backend/services/insights_region_dashboard.py` and
`backend/api/v1/public_climate.py`.

### 5.1 What a zone carries that a site does not

**Spread.** A zone figure carries `min`, `max`, `p10`, `p90` and `coverage`
because it describes real vineyard cells across a region, not a single number
pretending to be one. `coverage` is load-bearing: a metric covering 30% of a
zone's planted cells is a different claim from one covering all of it. This is
a genuine differentiator and belongs in anything sent out.

The zone hierarchy is walkable — `parent_zone_id` and `zone_level` — so a
partner can roll a sub-region up to its region without a lookup table of ours
hard-coded on their side.

### 5.2 The catalogue

| Method | Path | Returns | Status |
|---|---|---|---|
| `GET` | `/regions` | Wine regions, scoped by country and industry | LIVE |
| `GET` | `/zones` | Climate zones with `parent_zone_id`, `zone_level`, area, centroid | LIVE |
| `GET` | `/zones/{slug}` | Zone detail, with boundary GeoJSON on request | LIVE |
| `GET` | `/zones/{slug}/daily` | `climate_zone_daily`: temperatures, humidity, rainfall, solar, GDD, **plus per-variable station counts and `confidence`** | LIVE |
| `GET` | `/zones/{slug}/hourly` | `climate_zone_hourly` | LIVE |
| `GET` | `/zones/{slug}/monthly` | `climate_history_monthly_surface`, from 1986, mean and SD | LIVE |
| `GET` | `/zones/{slug}/seasons` | Per-vintage season metrics with zone spread | LIVE |
| `GET` | `/zones/{slug}/baseline` | The 1986-2005 baseline, daily or monthly | LIVE |
| `GET` | `/zones/{slug}/projections` | SSP x period x season, delta and absolute | LIVE |
| `GET` | `/zones/{slug}/phenology` | Zone-level estimates per variety | LIVE |
| `GET` | `/zones/{slug}/disease` | Zone daily indices, **all four models including Bacchus** | LIVE |
| `GET` | `/zones/{slug}/dashboard` | The whole Explorer page in one call | LIVE |
| `GET` | `/compare/zones`, `/compare/seasons`, `/compare/zones/seasons` | Cross-zone comparison, as the Explorer draws it | LIVE |

Every one of these is a re-shape behind the partner key. There is no new data
and no new pipeline in §5 — this is the cheapest thing in the document to ship
and the broadest thing in it to sell.

### 5.3 Three properties to state

1. **Zone and site disagree, and should.** The zone averages the stations
   assigned to it; a site runs IDW against the same models with measured refusal
   distances. Same model, different spatial source. That is a stated property in
   `/meta/models`, not a discrepancy to reconcile — and without it a partner
   showing both on one screen files a bug against us.
2. **`climate_zone_daily.humidity_mean` and `solar_radiation` come only from the
   station rollup.** The surface upsert deliberately omits them so it cannot
   blank the only copy. They are `station` provenance, not `surface`, and an
   export must say so.
3. **Carry a `method` per variable** — `surface`, `station_idw` or `derived` —
   with its evidence: `cv_rmse` + `cv_units` for a surface, `station_count` +
   `nearest_km` for IDW. Only four variables have a fitted surface; everything
   else reaches a consumer another way, and a bare number makes three different
   kinds of claim indistinguishable.

### 5.4 Bulk

The Explorer data is small enough that the bulk path is worth offering outright:
23 zones x 40 seasons is a few thousand rows, and the monthly record back to
1986 is on the order of a hundred thousand. `POST /exports` with
`resource: zone.monthly` is a better first backfill than paging, and it is the
same job machinery §2.5 needs anyway.

---

## 6. Build order, and what is actually new

| Phase | Work | Size | New? |
|---|---|---|---|
| 1 | `partner_*` tables, key issue and verification, scope and entitlement checks, rate and byte quotas, request log, error envelope | **M-L** | **All new** |
| 2 | Regional read endpoints (§5) | M | Re-shape |
| 3 | Site read endpoints (§2.1, §2.4) | M | Re-shape, plus `/daily`, `/hourly`, `/disease` objects |
| 4 | `POST /sites`, `PATCH`, placement errors, `external_ref` uniqueness, ready polling (§2.2) | S-M | Re-shape |
| 5 | Raster catalogue, batch sample, signed objects with lag and caps (§4) | S-M | Mostly new plumbing over an existing index |
| 6 | Change feed and bulk export jobs (§2.5) | M | **All new** |
| 7 | Published OpenAPI, sandbox client with synthetic data, partner docs | S | New |

Phase 1 is the real build and it is **reusable for every client after this one**,
which is the whole argument for one partner API rather than a bespoke Integrape
one. Phases 2-4 are small because the data and most of the SQL already exist —
the work is shaping, entitlement filtering and paging.

Phases 6 is what separates a partner who is happy at month six from one who is
re-pulling everything nightly, and it is the phase most likely to be cut for
time. It should not be.

---

## 7. Decisions needed before this goes out

Carried forward from the draft where still open, plus the ones this scope adds.

| # | Decision | Why it cannot wait |
|---|---|---|
| 1 | **GeoTIFF objects in or out** (§0.1, §4.4) | Changes the price, the contract and the tier structure. Everything else in §4 is small |
| 2 | **If in: the lag, the object and byte caps, the licence clause** | These are the terms, not the implementation |
| 3 | **History depth** | Sites reach 1986 monthly and 2026-02-15 daily; zones reach 1986. What does the licence include? |
| 4 | **Site cap** | A flat $35k against an unbounded site count is unbounded cost. Each site is ~7,700 S3 reads to populate and a nightly extraction thereafter |
| 5 | **Hourly in or out** | 24x the rows, and it is what makes the disease models reproducible on their side |
| 6 | **API key vs OAuth2** (§3.1) | Recommendation is the key. It is one decision and it sets the whole of phase 1 |
| 7 | **Monthly rasters** | A separate and deeper asset than the daily ones. Priced separately or not at all |
| 8 | **Australia** | Seeded in `countries` but inactive with no data. Joris raised BOM himself — lever or weakness |
| 9 | **Spec before signature** | Recommended yes, marked commercial-in-confidence. It is what Joris asked for on 2026-09-16 |

Unchanged and not up for decision: **no forward disease forecast** until MetOcean
redistribution rights are resolved, **no frost metric** in any form (§1.9), and
**no private-station pass-through** — Harvest data has no consent model, no
tables and no agreement template.

---

## 8. What to strip before sending

The `Status` column values other than LIVE, §0.1, §4.4, §6 and §7. Mirjam gets
the shape, the field lists, the units and the honesty — the coverage dates, the
null convention, the revision behaviour, the provenance columns and the
withheld metrics. She does not need our build plan or our commercial reasoning.

What must survive the edit, because each is a wrong number in someone else's
platform otherwise:

- Daily data starts **2026-02-15**; monthly starts 1986.
- **Null is never zero.**
- **Recent days are revised**; upsert on the key, never insert-once.
- **Rainfall `cv_rmse` is dimensionless.**
- **Bacchus: chart `peak`, keep four decimals.**
- **Botrytis severity is not botrytis cumulative.**
- **`variety_is_assumed` and `humidity_available` are warnings, not metadata.**
- **ET is estimated from temperature.** There is no measured ET on this platform.
- **202 on `POST /sites` means the history is still building.**
