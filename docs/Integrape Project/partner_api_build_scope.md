# Partner Data API — build scope

Date: 2026-09-17 · Status: **scope, nothing built** · Follows
`partner_api_spec_v2.md`, which stays the field-level reference for what each
payload contains.

**Commercial in confidence.**

---

## 0. Decisions taken

| # | Decision | Taken |
|---|---|---|
| 1 | **GeoTIFF objects are IN** — daily and monthly | 2026-09-17 |
| 2 | **Authentication is an API key**, not OAuth2 | 2026-09-17 |
| 3 | **Seven endpoints**, listed in §1 | 2026-09-17 |
| 4 | **Per-key endpoint toggles, managed from a new admin page** | 2026-09-17 |

Everything below is scoped against those four. The wider catalogue in
`partner_api_draft.md` §2 is now out of scope for build — it stays useful as the
menu for the next partner, not as work.

### 0.1 One correction to v2 §1.9

v2 said every frost metric is removed. That is right for the **site** value and
the planted spread, and wrong as stated for the regional figure. The rule as
built (`insights_site_service.FROST_METRICS` + `FROST_DISCLAIMER`, applied in
`/sites/{id}/season`) is:

> Frost is reported as the **regional average only**. The site's own value and
> the zone's p10/p90 are both withheld — the value because the surfaces cannot
> resolve cold-air drainage, the spread because drawing a site inside or outside
> it is exactly the site-versus-neighbour claim the model cannot support.

A partner payload must carry the same three-part shape: `zone_mean` present,
`value` null, `p10`/`p90` null, and `regional_only_reason` set. A bare null with
no reason reads as missing data and will be chased as a bug.

`projection_store.WITHHELD` blocks `temp_min/frost_days` at the projection
catalogue, the step list and at resolve. **The partner layer is a fourth door
and needs the same block**, raising the same error a genuinely absent layer
raises so a withheld metric does not advertise itself to anyone probing the URL
space.

---

## 1. The seven endpoints

Base `https://api.auxein.co.nz/api/v1/partner`. Every response uses the envelope
in `partner_api_draft.md` §1.2.

| # | Toggle key | Method and path | What it is |
|---|---|---|---|
| 1 | `site.create` | `POST /sites` | Register a site. **202** — triggers the history build |
| 2 | `site.history` | `GET /sites/{id}/history` | The extracted record at the cell: daily, monthly or season |
| 3 | `site.season` | `GET /sites/{id}/season` | Season to date, day by day, against the site's own baseline |
| 4 | `region.history` | `GET /regions/{slug}/history` | Monthly from 1986 and per-vintage seasons, with zone spread |
| 5 | `region.summary` | `GET /regions/{slug}/summary` | The Regional Explorer payload |
| 6 | `raster.monthly` | `GET /rasters/monthly` | Monthly GeoTIFFs — catalogue and signed objects |
| 7 | `raster.daily` | `GET /rasters/daily` | Daily GeoTIFFs — catalogue and signed objects |

### 1.1 Three more that are not optional

The seven cannot be used without these, and they carry no data of their own.
They are **always on** and do not appear as toggles:

| Path | Why it cannot be toggled off |
|---|---|
| `GET /sites` | The only way to poll a site to `ready` after a 202. Without it, endpoint 1 is unusable |
| `GET /regions` | The slug catalogue. Endpoints 4 and 5 take a slug and there is no other way to learn one |
| `GET /meta/entitlements` | What this key may do. A partner who cannot read their own grants guesses at every 403 |

`GET /sites` and `GET /regions` return identifiers and status only — no
measurements — which is what makes always-on safe.

---

## 2. Endpoint detail

### 2.1 `POST /sites` — register, and trigger the history

```http
POST /api/v1/partner/sites
Authorization: Bearer auxp_live_7f3a...
Content-Type: application/json

{
  "external_ref": "IG-VY-00412",
  "label": "Rapaura Home Block",
  "latitude": -41.4712,
  "longitude": 173.8305,
  "variety": "Sauvignon Blanc",
  "site_type": "sub_regional"
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
    "cell": {"grid_key": "nz500-v3", "row": 1841, "col": 903},
    "elevation_m": 34.0,
    "zone": {"slug": "marlborough-wairau-valley", "name": "Wairau Valley"},
    "variety": "Sauvignon Blanc",
    "variety_code": "SB",
    "requested_at": "2026-09-17T02:14:09Z",
    "populated_at": null
  },
  "meta": {"expected_ready_seconds": 120}
}
```

**What the 202 is doing.** The row is written and the extraction is queued. The
extraction reads roughly **7,700 separate S3 objects** to build forty years of
monthly record at the cell, then the daily series, seasons, projections,
phenology and disease. It takes about 90 seconds to a few minutes.

So the contract on the client side is:

1. `POST /sites`, keep `id` against your `external_ref`.
2. Poll `GET /sites?status=populating` until the site is `ready` with
   `populated_at` set.
3. Then pull endpoints 2 and 3.

A sub-resource on a non-ready site returns **`409 site.not_ready`** — never an
empty `200`, which is indistinguishable from a site that genuinely has no data.

Three refusals that must be distinguishable:

| Code | Status | When |
|---|---|---|
| `site.duplicate_ref` | 409 | That `external_ref` already exists on this client. A second row at one place is two answers to one question |
| `placement.refused` | 422 | The coordinate is outside the grid or on nodata after searching eight rings for land. **The response names the searched extent** |
| `entitlement.site_cap` | 402 | The contracted site count is used up. Names the cap and the count in use |

**Placement can move the cell.** `resolve_cell` searches up to eight rings for
the nearest land cell. When it does, the response must say so — a coordinate in
an estuary quietly becoming a cell 2 km away is a wrong site nobody can see.

`PATCH /sites/{id}` (relabel, or move — a move re-queues the extraction) and
`DELETE /sites/{id}` sit under the same `site.create` toggle. A client that may
create sites may correct and remove them; splitting those into their own toggles
buys nothing and produces a client that can make a mess it cannot clean up.

### 2.2 `GET /sites/{id}/history`

One endpoint, three granularities, because they are one question asked at three
resolutions and a partner should not need three integrations.

```
GET /sites/412/history?granularity=daily&from=2026-02-15&to=2026-09-16
GET /sites/412/history?granularity=monthly&from=1986-01&to=2026-08
GET /sites/412/history?granularity=season
```

| `granularity` | Source | Fields | Extent |
|---|---|---|---|
| `daily` | `insights_site_daily` | v2 §1.2 — temps, rainfall, **both GDD bases**, ETo/ETc/water balance, `eto_method`, `model_version` | **2026-02-15 →** |
| `monthly` | `insights_site_monthly` | variable × statistic × year × month → value | **1986-01 →** |
| `season` | `insights_site_season` | metric, value, unit, baseline, per vintage | 1987 → |

Defaults: `granularity=daily`, and the window defaults to the **current season**,
not to everything. Paging is cursor-based; `updated_since` is supported on all
three.

Four things this endpoint must state in `meta`, because each is a wrong number
downstream otherwise:

- **`coverage`** — the first and last date actually held at this granularity.
  Daily starting 2026-02-15 while monthly starts 1986-01 is the single most
  misread fact in this API.
- **`null` is never zero.** An absent rainfall day and a measured dry day are
  different facts and this table keeps them apart.
- **Recent days are revised.** The engine re-fits a trailing D-9..D-3 window
  weekly. **Upsert on `(site_id, date)`; never insert-once.**
- **ETo is Hargreaves-Samani from temperature.** There is no measured ET on this
  platform, and `eto_method` is on every row so a consumer can tell.

Frost statistics are filtered out of `monthly` and `season` per §0.1.

### 2.3 `GET /sites/{id}/season` — rolling, against baseline

The season-to-date curve beside the site's own 1986-2005 normal, day by day.
This is the endpoint a grower-facing screen actually draws, and it is the one
with the most modelling behind it.

```json
{
  "data": {
    "site_id": 412,
    "vintage": 2027,
    "baseline": "1986-2005",
    "as_of": "2026-09-16",
    "days": [
      {
        "date": "2026-09-14",
        "gdd10_cumulative": 18.4,
        "gdd10_cumulative_baseline": 15.1,
        "rain_cumulative": 22.0,
        "rain_cumulative_baseline": 28.6,
        "tmean_to_date": 8.6,
        "tmean_to_date_baseline": 8.1
      }
    ],
    "season_to_date": {
      "gdd10": {"value": 18.4, "baseline": 15.1, "delta": 3.3, "unit": "C.day"},
      "rain": {"value": 22.0, "baseline": 28.6, "delta": -6.6, "unit": "mm"}
    },
    "meta": {
      "method": "zone daily shape, site monthly level; GDD re-integrated from the shifted mean and the zone's day-of-vintage sd",
      "shape_source": "climate_zone_daily_baseline (1986-2005, per zone)",
      "level_source": "insights_site_monthly (1986-2005, this cell)",
      "unadjusted_months": [],
      "interpolated_days": 1
    }
  }
}
```

Built by `services/insights_site_baseline.build()`. Four properties that have to
travel with the numbers:

1. **The baseline is a hybrid, and `meta` says so.** There is no daily baseline
   for a single cell and there cannot be one — the surface archive holds no
   daily rasters before 2026, and the 1986-2005 daily climatology is per **zone**.
   So the curve takes its day-to-day **shape** from the zone and its **level**
   from the site's own monthly normal.
2. **This is not cosmetic.** Waipara's zone Sep-Apr GDD10 baseline is 1,147.8;
   Fancrest, a site inside that zone, averages 1,040.9. Against the raw zone
   curve that site runs a 107 GDD deficit in every season it will ever have.
3. **GDD is recomputed, not rescaled.** Shifting a GDD10 climatology by a
   temperature offset is not linear — a site 1 °C warmer gains a full degree-day
   in midsummer and a fraction of one in the shoulders. The zone's daily tmean
   curve is shifted and GDD is re-integrated with the same estimator the live
   series uses, which is the only reason the two can be compared at all.
4. **It returns nothing when the site has no zone.** `build()` returns None, and
   the endpoint must answer `404 data.unavailable` with a reason rather than
   substitute a regional stand-in. A site outside every mapped zone legitimately
   has no baseline.

`unadjusted_months` is not decoration: a month with no site normal is left at the
zone's level, and a partly-regional curve presented as site-level is exactly the
claim this endpoint exists to avoid.

### 2.4 `GET /regions/{slug}/history`

```
GET /regions/marlborough-wairau-valley/history?granularity=monthly&from=1986-01
GET /regions/marlborough-wairau-valley/history?granularity=season
```

`monthly` reads `climate_history_monthly_surface` (mean and SD, from 1986);
`season` reads the per-vintage metrics **with zone spread**.

**Spread is what a region has and a site does not.** Every season figure carries
`min`, `max`, `p10`, `p90` and `coverage`, because it describes real vineyard
cells across a region rather than a single number pretending to be one.
`coverage` is load-bearing — a metric covering 30% of a zone's planted cells is a
different claim from one covering all of it — and a partner rendering the mean
without it is publishing a stronger statement than we made.

`GET /regions` returns the walkable hierarchy: `slug`, `name`, `parent_slug`,
`zone_level`, `region_name`, area and centroid. A partner rolls a sub-region up
to its region from our data rather than from a lookup table hard-coded on their
side.

### 2.5 `GET /regions/{slug}/summary`

The Regional Explorer payload, from `services/insights_region_dashboard.build()`:

```json
{
  "data": {
    "zone": {"slug": "...", "name": "...", "level": "sub_regional",
             "region_name": "Marlborough", "parent_slug": "marlborough"},
    "vintage": 2027,
    "as_of": "2026-09-16",
    "baseline": "1986-2005",
    "recent": { },
    "season": { },
    "phenology": { },
    "disease": { },
    "projections": { },
    "models_disclaimer": "..."
  }
}
```

- `recent` — purely observed, no interpolation, no baseline.
- `season` — season to date against the zone's own normal, with spread.
- `phenology` — zone-level estimates per variety, including budburst.
- `disease` — **all four models including Bacchus**, with the recent curve.
- `projections` — SSP × period × season, delta and absolute, against 1986-2005.

Four things the partner build has to get right here:

1. **Strip the tier gating.** `build()` takes `registered` and returns `_locked`
   placeholder blocks to anonymous callers. A partner key is not a tier — the
   gate is the **entitlement**, and a locked block must never reach a partner
   payload. Either the block is granted and populated, or the key does not hold
   `region.summary`.
2. **Zone and site disagree, and should.** The zone averages the stations
   assigned to it; a site runs IDW against the same models with measured refusal
   distances. Same model, different spatial source. State it in
   `models_disclaimer` or a partner showing both on one screen files a bug
   against us.
3. **`humidity_mean` and `solar_radiation` come only from the station rollup.**
   The surface upsert deliberately omits them so it cannot blank the only copy.
   They carry `method: station`, not `method: surface`.
4. **Carry `method` per variable** — `surface`, `station_idw` or `derived` —
   with its evidence: `cv_rmse` + `cv_units` for a surface, `station_count` +
   `nearest_km` for IDW. Only four variables have a fitted surface; a bare number
   makes three different kinds of claim indistinguishable.

The holding line matters too. Phenology and disease fall back to a
"season has not started" reason rather than "not modelled for this region" —
from 2026-09-01 the daily surfaces cover every zone, so "not here" stopped being
true.

### 2.6 and 2.7 — the GeoTIFF endpoints

Both work the same way and differ only in what they list. **Catalogue first,
objects second** — a partner should be able to see what exists, and what it
costs them in bytes, before they pull it.

```
GET /rasters/daily?variable=temp_min&from=2026-09-01&to=2026-09-16
GET /rasters/monthly?variable=rainfall&statistic=sum&from=2020-01&to=2024-12
```

```json
{
  "data": [
    {
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
      "url": "https://...s3...?X-Amz-...",
      "url_expires_at": "2026-09-17T03:14:09Z"
    }
  ],
  "meta": {
    "objects_remaining_today": 178,
    "bytes_remaining_today": 3355443200
  }
}
```

`?include_url=false` returns the catalogue without minting signed URLs, so a
client can plan a pull without spending quota. Minting a URL is what counts
against the object and byte caps, not downloading it — otherwise the cap is
unenforceable.

#### What exists

| | Daily | Monthly |
|---|---|---|
| Key | `surfaces/v2/<var>/daily/<YYYY>/<MM>/<var>_daily_<YYYYMMDD>_500m.tif` | `surfaces/v2/<var>/monthly/<YYYY>/<var>_monthly_<YYYYMM>_500m_<stat>.tif` |
| Variables | `temp_min`, `temp_max`, `temp_mean`, `rainfall` | the same four |
| Statistic | **NULL** — a value, not an aggregate | **Required. 40 granted** of 43 published; the three frost layers are withheld — §2.6.1 |
| Extent | **2026-02-15 →**, 214 days | **1986-01 → 2026-08**, 488 months |
| **Objects** | **856** | **20,984** |
| **Size** | **1.36 GiB**, avg 1.62 MiB | **18.19 GiB**, avg 0.89 MiB |
| Cadence | D+2 03:00 NZ, plus a weekly D-9..D-3 refit Sun 04:00 NZ | On archive extension |

All 500 m, 2856 × 2667, float32 with nodata, on the private
`auxein-climate-surfaces` bucket, indexed by `surface_run`.

**Measured 2026-09-17** by `aws s3 ls --recursive --summarize` over
`surfaces/v2/`, replacing the ~6 MB per-object estimate this document carried
until then. Per variable:

| Variable | Daily obj | Daily size | Daily avg | Monthly obj | Monthly size | Monthly avg |
|---|---|---|---|---|---|---|
| `temp_min` | 214 | 0.39 GiB | 1.89 MiB | 4,880 | 4.16 GiB | 0.87 MiB |
| `temp_max` | 214 | 0.41 GiB | 1.98 MiB | 4,392 | 4.14 GiB | 0.97 MiB |
| `temp_mean` | 214 | 0.41 GiB | 1.98 MiB | 3,416 | 3.99 GiB | 1.20 MiB |
| `rainfall` | 214 | 0.13 GiB | 0.63 MiB | 8,296 | 5.89 GiB | 0.73 MiB |

#### 2.6.1 The statistic list is 43, not 15 — and it contains three frost layers

`aggregate_zone_monthly.BANDS` lists 15 statistic-variable pairs. **That is the
zone-aggregation list, not the published raster list.** The bucket holds 43,
488 months of each:

| Variable | Statistics |
|---|---|
| `temp_mean` | mean, median, sd, min, max, argmin_day, argmax_day |
| `temp_min` | mean, median, sd, min, max, argmin_day, argmax_day, **frost_days**, **first_frost_day**, **last_frost_day** |
| `temp_max` | mean, median, sd, min, max, argmin_day, argmax_day, days_over_25, days_over_30 |
| `rainfall` | sum, mean, median, sd, min, max, argmin_day, argmax_day, wet_days, days_over_10mm, days_over_25mm, max_dry_spell, wet_top1, wet_top2, wet_top3, wet_top4, wet_top5 |

Three consequences, all of which change what gets built:

1. **The frost filter is three layers, not one.** `frost_days`,
   `first_frost_day` and `last_frost_day` — 1,464 objects, 357 MiB, all under
   `temp_min`. v2 §1.9 and §2.6 of this document named only `frost_days`. The
   last-spring-frost date is explicitly withheld by the same 2026-08-24 decision,
   and it has a raster with a real key.
2. **`argmin_day` and `argmax_day` are day-of-month indices where 0 means
   "never", not the 1st.** `aggregate_zone_monthly` excludes them deliberately
   because a weighted mean over cells is not a date. As per-cell rasters they are
   valid and useful, but a partner reading 0 as a date is a guaranteed
   misreading. Either document the sentinel in the catalogue or exclude them.
3. **`median` and `wet_top1..5` were undocumented anywhere.** `wet_top1..5`
   alone is 3.0 GiB — the five wettest days of each month, per cell.
   **Decided 2026-09-17: all 43 are in the grant less the three frost layers, so
   40.** They ship because they were chosen, not because nobody noticed, and
   each needs a one-line definition in `/meta/variables` before they go out.

#### 2.6.2 What `raster.monthly` does NOT include

The same bucket holds four more trees the two toggles must not reach:

| Prefix | Objects | Size | Note |
|---|---|---|---|
| `<var>/records/` | 16 | 15 MiB | All-time layers. Deliberately not indexed for the live era |
| `<var>/normal/` | 35 | 58 MiB | 1986-2005 baseline |
| `<var>/projection/` | 560 | 0.96 GiB | MfE downscaled. `temp_min/frost_days` already withheld here |
| `gdd0/`, `gdd10/` | 657 | 1.63 GiB | Season accumulations, plus gdd10 normal and projection |

Plus `_assets/`, `_backup/`, `_build/`, `_fields/`, `_runs/`, and a set of
**legacy duplicate trees at the bucket root** (`temp_min/`, `rainfall/` and the
rest, outside `surfaces/v2/`).

**Therefore: a signed URL is minted only from `surface_run.s3_key`, never from a
client-supplied path, prefix or filename.** There is no path parameter on either
raster endpoint — the client names an object by its catalogue `id`. The index is
the allowlist. Anything else makes the build artefacts, the backups and the
withheld projection layers reachable by URL construction.

#### Five things the raster endpoints must state

1. **The daily archive starts 2026-02-15.** Monthly starts 1986-01. Anyone
   sizing a raster backfill from the monthly figure is wrong by forty years.
2. **`cv_units` must be honoured.** Rainfall is fitted in **ratio space**, so its
   `cv_rmse` is dimensionless (~0.0025) and **must never be rendered as
   millimetres**. This is the most likely misreading in the whole offering.
3. **The archive is unclipped.** Values exist beyond the coast and the land mask.
   Reading `null` with a reason is correct at those cells; reading the number is
   not.
4. **Three frost layers are withheld** (§0.1, §2.6.1) — `frost_days`,
   `first_frost_day`, `last_frost_day`. They are published monthly statistics
   with real S3 keys, so the raster catalogue is a **fifth door** past the three
   `projection_store.WITHHELD` guards. All three must be filtered from the
   catalogue, from the statistic list and at object resolve, with the same error
   a genuinely absent layer raises.
5. **Daily objects are rewritten in place.** The weekly refit overwrites
   D-9..D-3 **at the same S3 key**. A consumer caching by key alone serves a
   stale raster forever. `created_at` and `checksum` are how they detect it.
   Which is also why:

#### The four commercial terms, now that objects are in

| Term | Value | Why |
|---|---|---|
| **Tier** | `raster.daily` and `raster.monthly` are separate toggles, separately priced | Monthly is the forty-year asset; daily is three seasons. They are not the same sale |
| **Lag** | Daily objects at **D-14**. Monthly at publication | The refit window closes at D-3, so a 14-day lag means every object handed over is **final**. It solves the stale-cache trap and the commercial exposure with one rule. Point sampling and tiles stay at D+2, so nothing a partner's users see gets slower |
| **Caps** | `objects_per_day` **and** `bytes_per_day`, per key | A rows/day quota does not bound rasters. See below — the caps do less work than expected |
| **Licence** | Objects are for use within the licensee's platform, not sublicensable, and do not survive termination | A raster with no clause attached is a raster that has been sold. **This is now the primary control, not the caps** |

**The measurement changed the argument for caps.** The whole daily archive is
**1.36 GiB across 856 objects** and the whole monthly archive is **18.19 GiB
across 20,984 objects** (§2.6). At those sizes a byte cap is not a meaningful
barrier: daily is a four-minute download on a business connection, and monthly
is an afternoon. A cap set low enough to actually prevent a full sweep would
also prevent legitimate use.

So the caps are **cost control and abuse detection, not asset protection**. They
stop a runaway loop and they make `partner_request_log` answer "what did they
actually take" at renewal. What protects the asset is the **lag** and the
**licence clause** — and if neither of those is acceptable commercially, then
the honest conclusion is that shipping objects is a sale, not a licence, and it
should be priced as one.

Suggested starting values, to be set in the contract rather than derived:

| Limit | Daily key | Monthly key |
|---|---|---|
| `objects_per_day` | 250 | 1,000 |
| `bytes_per_day` | 2 GiB | 4 GiB |

A normal nightly pull is 4 objects (~6.5 MiB); the monthly archive backfills
inside a working week at 1,000/day. Both are generous for real use and both make
a full-archive sweep visible in the log before it completes.

### 2.8 Backfill and steady state are two different problems

Every endpoint here is pulled twice: once to load the history, and then forever
to keep it current. Those two have volumes three orders of magnitude apart, and
a single throttle cannot serve both — set it for steady state and the backfill
never finishes; set it for the backfill and there is no throttle.

**They split on whether the payload is rows or objects.**

#### Rows — throttle only, no bulk path

| Backfill | Volume |
|---|---|
| One site (16 bands × 488 months, 14 metrics × 40 vintages, 214 daily) | **~8,600 rows** |
| 50 sites | 429,000 rows |
| 250 sites | **2.1M rows** |
| All 23 zones, monthly from 1986 | ~170,000 rows |

At a `rows_per_day` of 2,000,000 a **250-site backfill completes inside a
day**, and steady state is a few thousand rows a night. No bulk export job, no
manual handover, no special path — the ordinary paged endpoint with a cursor is
the whole mechanism. `GET /sites/{id}/history?granularity=monthly` returning
7,808 rows in cursor pages is simply not a large request.

This is the cheap half, and it is worth saying plainly in anything sent out:
**the row API needs no special arrangement to load forty years.**

#### Rasters — staged manual handover for the backfill, throttle for the delta

| Backfill | Volume |
|---|---|
| Daily archive | 856 objects, **1.36 GiB** |
| Monthly archive | 20,984 objects, **18.19 GiB** |
| Steady state, daily | **4 objects/day, ~6.5 MiB** |
| Steady state, monthly | 43 objects on archive extension |

21,000 signed-URL mints and 20 GiB of range reads through our worker pool, to
move data that never changes, is the wrong use of the API. And a throttle loose
enough to allow it in reasonable time is loose enough that it is not a control.

**So: the raster backfill is a one-time staged copy, done manually after
signature. The API serves the delta only, throttled for the delta.**

```
scripts/stage_partner_archive.py --client integrape --apply
    reads the client's grant (variables, statistics, date floor)
    filters the withheld layers (§2.6.1)
    copies matching objects, server-side, into
        s3://auxein-partner-staging/integrape/
    writes manifest.json (key, bytes, sha256, model_version, cv_rmse, cv_units)
```

Then grant their AWS account read on that prefix for a fixed window, they
`aws s3 sync` it, and the grant is revoked. Server-side copy, no egress through
us, no worker time, and it costs pennies.

**Why a staged copy and not a read grant on the live tree.** Three reasons, and
the first is the one that matters:

1. **The withheld-layer filter has to exist in the bulk path too.**
   `surfaces/v2/temp_min/monthly/` contains `frost_days`, `first_frost_day` and
   `last_frost_day`. A prefix grant hands over all three. Staging is what makes
   the bulk path and the API path enforce the *same* allowlist — the script
   reads the grant, exactly as the API does.
2. **The live tree contains things nobody bought** — `_backup/`, `_build/`,
   `_runs/`, the projection layers, the legacy duplicate trees (§2.6.2).
3. **The manifest is the audit record.** It says precisely what was handed over,
   on what date, at what `model_version`. In two years that is the difference
   between a licence with a known scope and an argument.

The staging bucket is emptied after the sync. It is a transfer mechanism, not a
second archive.

#### What this means for the client toggles

`raster.daily` and `raster.monthly` grant **the delta feed**. The one-time
archive is a contract deliverable, not an API capability — which is also why it
can be priced separately from the feed, and why a partner who lapses keeps
whatever they synced but stops receiving anything new. That is a much cleaner
commercial boundary than a rate limiter.

---

## 3. Authentication — the key

### 3.1 What exists today

**Nothing.** Verified: every public endpoint authenticates a `public_users` JWT
through `get_current_public_user`, which reads `user_id` from the claims.
`ingestion_credentials` is the inbound direction — our keys for councils'
systems — and is not reusable. The article embed grant is purpose-built and not
generalisable.

This is the largest net-new piece, and it gates all seven endpoints.

### 3.2 The key itself

```
auxp_live_7f3a2c9e4b1d8a6f...        live
auxp_test_0a4e18bc77f2c1e9...        sandbox
```

- Prefix `auxp`, environment, then 32 bytes of `secrets.token_urlsafe`. The
  prefix makes a leaked key greppable in a repository scan and identifiable in a
  support ticket without holding it.
- `Authorization: Bearer <key>` on every request.
- **Stored as an argon2 hash.** We keep the prefix and last four for support.
  **Shown in full exactly once, at creation.** There is no recovery path, only
  rotation — and the admin page has to make that unmissable (§4.3).
- TLS only. A key arriving over plain HTTP is treated as compromised.

### 3.3 Why a key and not OAuth2

One request to integrate rather than two; no token endpoint, token cache or
clock-skew failure to break a nightly job at 3am; and every ETL scheduler
already does bearer auth. A `/partner/token` exchange can be layered over the
same `partner_credential` table later without breaking a key-based client,
because the key stays the credential either way.

The genuine downside — a long-lived secret has no natural expiry — is answered
by `expires_at`, overlapping rotation, per-key scoping and the request log,
all of which we need regardless.

### 3.4 The isolation requirement

**The partner key and the `public_users` JWT must be mutually unacceptable.**
Partner dependencies accept only a `partner_credential`; public dependencies
reject a partner key outright. Two tests, asserting each direction.

`HTTPBearer()` defaults to `auto_error=True` and returns **403 to an anonymous
caller**, not 401. The partner dependency must return **401 with
`WWW-Authenticate: Bearer`** for a missing key — a 403 tells an integrations
engineer their key was wrong when in fact it was absent, and that is an hour of
somebody's afternoon.

---

## 4. The admin page

New page at **`/partners`** in `packages/admin`, following `AdminAccounts.jsx`:
client tabs across the top, detail below.

**It must wrap itself in `<AdminLayout title subtitle>`.** `AdminRoute` renders
no chrome, so a page that forgets silently loses the entire nav.

### 4.1 Files

| File | Purpose |
|---|---|
| `packages/admin/src/pages/admin/AdminPartners.jsx` | The page |
| `packages/admin/src/pages/admin/AdminPartners.css` | Its styles |
| `packages/admin/src/services/adminService.js` | Add `adminPartnerService` beside `adminAccountService` |
| `packages/admin/src/components/AdminNav.jsx` | New `partners` nav group |
| `packages/admin/src/App.jsx` | `<Route path="/partners" element={<Guarded><AdminPartners /></Guarded>} />` |
| `backend/api/v1/admin_partners.py` | The admin API, behind `require_admin` |
| `backend/main.py` | Register the router |
| `alembic/versions/partner_api.py` | The four tables (§5) |

A new nav group rather than a row under Insights: partner clients are neither
Insights nor Grow, and the group heading is what makes that legible. One item
today (`Partners`), with room for `Usage` when the request log earns its own
page.

**Watch the alembic slug limit** — a revision id over 32 characters silently
rolls back the DDL. `partner_api` is safe.

### 4.2 Layout

```
Partners                                         [ + New client ]
Client organisations with API access
─────────────────────────────────────────────────────────────────
[ Integrape ] [ + ]                                    ● live
─────────────────────────────────────────────────────────────────
 CONTRACT                                              [ Edit ]
 Status      active            Environment   live
 Term        2026-10-01 → 2027-09-30
 Contact     joris.besamusca@integrape.com
 Site cap    250 (41 in use)   History from  1986-01-01
 Raster      daily + monthly · D-14 lag
─────────────────────────────────────────────────────────────────
 KEYS                                              [ + New key ]
 Label          Prefix            Created     Last used    
 ETL nightly    auxp_live_7f3a…9c 01 Oct      2h ago       [Rotate] [Revoke]
 Raster puller  auxp_live_2b81…4e 01 Oct      3d ago       [Rotate] [Revoke]
─────────────────────────────────────────────────────────────────
 ENDPOINTS                            ETL nightly   Raster puller
 Add a site                  POST         [x]            [ ]
 Site history                GET          [x]            [ ]
 Site season vs baseline     GET          [x]            [ ]
 Regional history            GET          [x]            [ ]
 Regional summary            GET          [x]            [ ]
 Monthly GeoTIFFs            GET          [ ]            [x]
 Daily GeoTIFFs              GET          [ ]            [x]
─────────────────────────────────────────────────────────────────
 LIMITS (per key)            ETL nightly   Raster puller
 Requests / minute               120            30
 Rows / day                  2,000,000          —
 Objects / day                   —              200
 Bytes / day                     —            5 GB
─────────────────────────────────────────────────────────────────
 USAGE — last 30 days
 Requests 84,102 · Rows 41.2M · Objects 1,847 · Bytes 11.3 GB
 [ per-key breakdown ]
```

**A matrix, not a per-key form.** Endpoints are rows and keys are columns
because the question an admin actually has is "do these two keys differ, and
where" — and a form per key makes that answerable only by remembering. With two
or three keys the matrix fits and the drift is visible at a glance.

### 4.3 The one irreversible moment

Creating a key shows the secret **once**. That needs a modal that:

- shows the full key in a monospace field with a copy button,
- states plainly that it will not be shown again,
- requires an explicit **"I have saved this key"** before it closes,
- and cannot be dismissed by clicking outside or pressing Escape.

Everything else on this page is editable. This is the only action where getting
it wrong costs a support round trip and a rotation, so it is the only one that
earns a blocking confirmation.

**Rotate** is not a separate concept from create: it issues a second key with
**the same toggles and limits copied**, leaves both active, and shows the new
secret in the same modal. The old key is revoked manually after their cutover,
which `last_used_at` tells us is safe. A rotate that silently invalidates the
old key is a cutover, not a rotation, and it breaks a partner at whatever hour
we click it.

### 4.4 Two traps worth building against

1. **A revoked key must stop working immediately.** If entitlements are cached
   per key for performance — and at these volumes they should be, it is one
   lookup per request otherwise — then revoke and every toggle change must bust
   that cache. A 60-second TTL with explicit invalidation on write is the
   simplest version that is still correct. A revoked key that keeps working for
   five minutes is the kind of thing nobody notices until it matters.
2. **A toggle cannot exceed the contract.** §5.2.

### 4.5 The admin API

All behind `require_admin` (`is_admin` on `PublicUser`).

| Method | Path |
|---|---|
| `GET` | `/api/v1/admin/partners` |
| `POST` | `/api/v1/admin/partners` |
| `GET`/`PATCH` | `/api/v1/admin/partners/{id}` |
| `POST` | `/api/v1/admin/partners/{id}/keys` — **returns the secret once** |
| `POST` | `/api/v1/admin/partners/{id}/keys/{key_id}/rotate` |
| `DELETE` | `/api/v1/admin/partners/{id}/keys/{key_id}` — revoke |
| `PUT` | `/api/v1/admin/partners/{id}/keys/{key_id}/grants` — the toggle row |
| `PUT` | `/api/v1/admin/partners/{id}/keys/{key_id}/limits` |
| `GET` | `/api/v1/admin/partners/{id}/usage?days=30` |

Every write lands in an audit line naming the admin, because "who turned the
raster endpoint on" is a question that gets asked once and has to be answerable.

---

## 5. Data model

### 5.1 Tables

**`partner_client`** — the organisation.
`id`, `name`, `slug`, `status` (`active` / `suspended` / `ended`),
`environment` (`live` / `test`), `contact_email`, `contract_start`,
`contract_end`, `notes`, `created_at`, `updated_at`.

**`partner_credential`** — one key.
`id`, `client_id`, `label`, `key_prefix`, `key_last4`, `key_hash` (argon2),
`created_at`, `created_by`, `last_used_at`, `expires_at`, `revoked_at`,
`revoked_by`, `ip_allowlist` (inet[], null = any).
**Multiple active rows per client**, which is what makes rotation overlapping
rather than a cutover.

**`partner_grant`** — the toggles. One row per (credential, endpoint).
`credential_id`, `endpoint` (the toggle key from §1), `enabled`,
`config` (JSONB — per-endpoint qualifiers: history floor, zone allowlist,
granularities), `updated_at`, `updated_by`. PK `(credential_id, endpoint)`.

**`partner_limit`** — per credential.
`credential_id`, `requests_per_minute`, `rows_per_day`, `objects_per_day`,
`bytes_per_day`, `raster_lag_days`.

**`partner_request_log`** — `id`, `client_id`, `credential_id`, `at`, `route`,
`method`, `status`, `decision`, `row_count`, `object_count`, `bytes`,
`latency_ms`. **No payloads.** It is what makes the byte cap real and what
answers the renewal conversation.

### 5.2 Two levels, and why

**The client holds the contract; the key holds the operational toggles, and a
key can only narrow what the client was sold.**

`partner_client` carries the contracted ceiling — site cap, history floor,
raster tiers, geography. `partner_grant` is per key and is checked against it.
A key toggle for an endpoint the client does not hold is greyed out in the
matrix and rejected by the API.

This is one extra check and it buys the thing a flat per-key model cannot do:
**ending a contract is one edit**, not an audit of every key that was ever
issued. It also makes the admin page honest — a greyed toggle says "not sold",
which is a different sentence from "off", and the difference is the upsell
conversation.

Check order on every request: **key valid → client active → client entitled →
key toggle on → per-endpoint config (dates, geography) → limits.** Each failure
has its own error code (`partner_api_spec_v2.md` §3.6) so a partner can tell
"not sold" from "switched off" from "out of quota" without emailing us.

---

## 6. Build sequence

**Gate: a signed order.** Nothing in this table starts before one. The
deliverable until then is the specification, which is what Joris asked for on
2026-09-16.

| # | Phase | Depends on | Size | New? |
|---|---|---|---|---|
| 1 | **Foundation** — `partner_api` migration (5 tables), key issue and verify (argon2), the FastAPI dependency, the check chain, request log, `problem+json` errors, **the two isolation tests** | — | **M-L** | All new |
| 2 | **Admin page** — clients, keys, create-once modal, rotate, toggle matrix, limits, usage (§4) | 1 (tables only) | **M** | All new |
| 3 | **The always-on trio** — `GET /sites`, `GET /regions`, `GET /meta/entitlements` (§1.1) | 1 | S | Re-shape |
| 4 | **Site write** — `POST/PATCH/DELETE /sites`, placement and duplicate-ref errors, site cap, ready polling (§2.1) | 3 | S-M | Re-shape |
| 5 | **Site read** — `/history` (3 granularities) and `/season`, frost filtered (§2.2, §2.3) | 3 | M | Re-shape |
| 6 | **Region read** — `/history` and `/summary`, tier gating stripped (§2.4, §2.5) | 3 | M | Re-shape |
| 7 | **Rasters** — catalogue, signed URLs **by id**, D-14 lag, object and byte accounting, the three-layer frost filter (§2.6) | 3 | S-M | New plumbing over an existing index |
| 8 | **Bulk staging** — `stage_partner_archive.py`, the manifest, the cross-account grant runbook (§2.8) | 7 (shares the allowlist) | S | New |
| 9 | **Publish** — OpenAPI, sandbox client with synthetic data, partner docs | 3-8 | S | New |

### 6.1 The critical path, and what runs beside it

```
1 Foundation ─┬─ 3 Trio ─┬─ 4 Site write ─ 5 Site read ─┐
              │          ├─ 6 Region read ──────────────┼─ 9 Publish
              │          └─ 7 Rasters ─ 8 Bulk staging ─┘
              └─ 2 Admin page (parallel from here)
```

**Phase 2 needs only phase 1's tables**, so the admin page can be built beside
phases 3 to 7 rather than after them. It must nevertheless be **finished before
the first real key is issued** — until it exists every key is a hand-written SQL
insert, and the first mistake is invisible until a partner reads something they
did not buy.

**Phases 5, 6 and 7 are independent of each other** and of phase 4. If there is
more than one pair of hands, that is where they go.

### 6.2 Three milestones worth naming

**M1 — "the key works" (end of phase 3).** A sandbox key, three endpoints
returning identifiers and no measurements. This is the smallest slice that
proves the whole auth chain end to end, and it is the earliest point Mirjam can
start building. Ship it to her before phases 4-7 are done; the integration
skeleton she writes against it does not change when the data arrives.

**M2 — "the feed works" (end of phase 7).** Every one of the seven endpoints
live, throttled, with the withheld layers filtered in all five places.

**M3 — "the archive is delivered" (end of phase 8).** The one-time staged copy,
the manifest, the grant and its revocation. This is a contract deliverable with
a date, not a capability that quietly exists.

### 6.3 Why the order is what it is

**Phase 1 is the real build.** Everything else is shaping queries that already
exist. It is also the phase that is **entirely reusable for every client after
this one**, which is the whole argument for one partner API rather than a
bespoke Integrape one — and the argument gets weaker the more of it is deferred.

**The trio goes before anything with data in it** because it makes the auth
chain testable against something harmless. Debugging a 403 on an endpoint that
returns forty years of climate is strictly worse than debugging it on one that
returns a list of slugs.

**Site write before site read** because a partner cannot read a site they have
not registered, and the 202/`site.not_ready` contract (§2.1) is the thing most
likely to be misunderstood. It wants to be exercised early and against a real
extraction, not mocked.

**Bulk staging last**, because it shares the withheld-layer allowlist with phase
7 and building it first would mean writing that filter twice — which is exactly
how the two paths drift apart and one of them starts shipping frost.

---

## 7. Still open

| # | Question | Blocks |
|---|---|---|
| 1 | **Site cap** — a flat $35k against unbounded sites is unbounded cost. Each site is ~7,700 S3 reads to populate and a nightly extraction thereafter | `partner_client.site_cap`, and the price |
| 2 | **History floor** — sites reach 1986 monthly and 2026-02-15 daily; regions reach 1986. What does the licence include? | The `history` config on endpoints 2 and 4 |
| 3 | ~~Raster caps — measure the archive first~~ **DONE 2026-09-17** (§2.6). Confirm the suggested `partner_limit` values | `partner_limit` defaults |
| 4 | **Monthly vs daily rasters priced together or apart.** Monthly is 18.19 GiB over 40 years; daily is 1.36 GiB over 7 months. They are not the same asset | The tier structure |
| ~~4b~~ | ~~Are `median`, `wet_top1..5` and `argmin/argmax_day` in the grant?~~ **DECIDED 2026-09-17: all 43 statistics are in**, less the three withheld frost layers = **40**. `argmin_day`/`argmax_day` need the 0-means-never sentinel documented in the catalogue (§2.6.1) | — |
| 5 | **Licence clause for objects** — not sublicensable, no survival past termination | The contract, not the code |
| 6 | **Sandbox** — a `test` client with synthetic data lets Mirjam build before signature. Sales asset or scope creep? | Phase 8 |
| 7 | **SLA** — target or commitment, and what happens when the D-1 chain slips (one source lands ~5 h behind the rest) | The contract |

Unchanged and not up for decision: **no forward disease forecast** until
MetOcean redistribution rights are resolved, **no site-level frost figure**
(§0.1), and **no private-station pass-through** — Harvest data has no consent
model, no tables and no agreement template.
