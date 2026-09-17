# Auxein Partner Data API

**Specification v1.0** · 17 September 2026

Prepared for Integrape. **Commercial in confidence.** Indicative and subject to
agreement.

---

## 1. Overview

The Auxein Partner Data API gives a licensed partner programmatic access to the
climate, phenology and disease-pressure record that sits behind Auxein Insights.

There are three kinds of resource:

| | What it is |
|---|---|
| **Sites** | A point you register. We extract the full climate record at that location and keep it current |
| **Regions** | The 23 New Zealand wine climate zones, their history and their current season |
| **Rasters** | The underlying interpolated surfaces as GeoTIFFs, at 500 m |

Seven endpoints, described in §5.

### 1.1 What this platform does not have

Stated up front, because each is a reasonable assumption that would be wrong.

- **There is no disease forecast.** The disease indices score observed weather up
  to yesterday. Nothing in this API projects disease pressure forward.
- **There is no measured evapotranspiration.** `eto_mm` is estimated from
  temperature by Hargreaves-Samani. The method is named on every row.
- **There is no yield model.** Yield values are the ones you enter.
- **New Zealand only.** Australia is not yet available.
- **No frost figure is published at a point.** See §7.3.

---

## 2. Conventions

These apply to every response.

| | |
|---|---|
| Base URL | `https://api.auxein.co.nz/api/v1/partner` |
| Authentication | API key as a bearer token. See §3 |
| Format | JSON, UTF-8 |
| Instants | ISO 8601, **UTC with explicit offset** |
| Dates | **Local calendar dates, Pacific/Auckland** |
| Nulls | `null` means *absent*. **It never means zero** |
| Units | Stated per field, and echoed in `meta.units` |
| Paging | Cursor: `?limit=&cursor=`, with `paging.next_cursor` (null at the end) |
| Incremental | `?updated_since=` on every time-series resource |
| Vintage | The growing season **Sep-Apr**, labelled by the harvest year |
| Rounding | We return full precision. Rounding is your decision |
| Errors | `application/problem+json` with a stable `code` (§8) |

### 2.1 Units

| Quantity | Unit |
|---|---|
| Temperature, dewpoint | °C |
| Rainfall, ET, water balance | mm |
| Relative humidity | % |
| Wind speed | m/s |
| Solar radiation | MJ/m²/day |
| Growing degree days | °C·day (base stated in the field name) |
| Distance to station | km |

### 2.2 Response envelope

```json
{
  "data": [],
  "meta": {
    "resource": "site.history.daily",
    "units": {"temp_mean": "C", "rainfall_mm": "mm", "gdd10_cumulative": "C.day"},
    "coverage": {"first": "2026-02-15", "last": "2026-09-16"},
    "model_version": "tps-2.0.0-ridge-db-adj",
    "generated_at": "2026-09-17T04:12:07Z"
  },
  "paging": {"limit": 1000, "next_cursor": "eyJkIjoiMjAyNi0wNC0zMCJ9"}
}
```

### 2.3 Four properties that will affect your integration

**1. `null` is never zero.** An absent rainfall observation and a measured dry
day are different facts and this API keeps them apart. Coercing `null` to `0` on
your side will produce a dry day that did not happen.

**2. Recent days are revised.** Our daily engine re-fits a trailing window each
week, because the underlying station aggregation keeps settling for about three
days. Days near the present therefore change after first publication.

> **Upsert on the key — `(site_id, date)` or `(zone_slug, date)`. Do not
> insert-once.** A consumer that inserts once will diverge from us silently.

Use `?updated_since=` to pull only what has moved.

**3. Coverage is not uniform.** Monthly data reaches back to **January 1986**.
Daily data begins **15 February 2026**. Every response carries `meta.coverage`
with the real first and last date for that resource and granularity.

**4. Provenance travels with the value.** Every measurement carries a `method`:

| `method` | Meaning | Evidence carried |
|---|---|---|
| `surface` | Sampled from a fitted interpolated surface | `cv_rmse`, `cv_units` |
| `station_idw` | Inverse-distance weighted from nearby stations | `station_count`, `nearest_km` |
| `derived` | Computed from other values | `model`, `model_version` |

Only four variables have a fitted surface: `temp_min`, `temp_max`, `temp_mean`
and `rainfall`. Humidity, dewpoint, wind and solar radiation reach you by
station aggregation. GDD, ET, disease and phenology are derived. A bare number
would make those three claims indistinguishable, which is why `method` is on
every one.

---

## 3. Authentication

Every request carries an API key as a bearer token.

```http
GET /api/v1/partner/sites HTTP/1.1
Host: api.auxein.co.nz
Authorization: Bearer auxp_live_7f3a2c9e4b1d8a6f...
Accept: application/json
```

- Keys are issued by Auxein and are shown **once**, at creation. Store the key
  in your secret manager; we cannot recover it, only replace it.
- Keys are prefixed `auxp_live_` or `auxp_test_` (sandbox).
- **HTTPS only.** A key sent over plain HTTP is treated as compromised and
  revoked.
- You may hold **more than one active key at a time**. This is how rotation
  works without a cutover: we issue the replacement, both work, you switch, we
  revoke the old one.

Each key is granted a specific set of endpoints. `GET /meta/entitlements`
returns exactly what the presented key may do, so you never have to guess why a
request was refused:

```json
{
  "data": {
    "client": "Integrape",
    "environment": "live",
    "endpoints": ["site.create", "site.history", "site.season",
                  "region.history", "region.summary",
                  "raster.daily", "raster.monthly"],
    "history_from": "1986-01-01",
    "site_cap": 250,
    "sites_in_use": 41,
    "limits": {"requests_per_minute": 120, "rows_per_day": 2000000,
               "objects_per_day": 250, "bytes_per_day": 2147483648}
  }
}
```

### 3.1 Rate limits

`X-RateLimit-Remaining` is returned on every response. Exceeding a limit returns
**429** with `Retry-After`.

Limits are per key and cover requests per minute, rows per day, and — for raster
endpoints — objects and bytes per day. Your current values are in
`/meta/entitlements`.

---

## 4. Getting started

A first integration is four steps.

1. **`POST /sites`** for each vineyard, carrying your own identifier in
   `external_ref`. Returns **202** — see §5.1.
2. **Poll `GET /sites`** until each site reports `status: "ready"`.
3. **Backfill** with `GET /sites/{id}/history` and
   `GET /regions/{slug}/history`. Forty years at one site is about 8,600 rows;
   this needs no special arrangement.
4. **Keep current** with `?updated_since=` nightly, upserting on the key.

The raster archive is delivered separately as a one-time transfer (§6.3), not
through the API.

---

## 5. Endpoints

### 5.1 `POST /sites` — register a site

Registers a location and begins building its climate record.

```http
POST /api/v1/partner/sites
Content-Type: application/json

{
  "external_ref": "IG-VY-00412",
  "label": "Rapaura Home Block",
  "latitude": -41.4712,
  "longitude": 173.8305,
  "variety": "Sauvignon Blanc"
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
    "label": "Rapaura Home Block",
    "status": "populating",
    "latitude": -41.4712,
    "longitude": 173.8305,
    "elevation_m": 34.0,
    "cell": {"grid_key": "nz500-v3", "row": 1841, "col": 903},
    "zone": {"slug": "marlborough-wairau-valley", "name": "Wairau Valley"},
    "variety": "Sauvignon Blanc",
    "variety_code": "SB",
    "requested_at": "2026-09-17T02:14:09Z",
    "populated_at": null
  },
  "meta": {"expected_ready_seconds": 120}
}
```

> ### The 202 matters
>
> Registration queues the extraction; it does not perform it. Building forty
> years of record at a new location reads several thousand raster objects and
> takes **roughly 90 seconds to a few minutes**.
>
> A site queried immediately after registration is **legitimately empty**. Poll
> `GET /sites` until `status` is `ready` and `populated_at` is set. Any
> sub-resource on a site that is not ready returns **409 `site.not_ready`** —
> never an empty `200`, so you can always tell "not yet" from "nothing here".

**`external_ref` is the join.** Your platform is the system of record for what a
vineyard is called; we never match on our own label. It must be unique within
your account — a duplicate returns **409 `site.duplicate_ref`**.

**Placement may be refused or adjusted.** A coordinate outside the grid, or on
water, causes us to search outward for the nearest land cell. If none is found
within the search radius you get **422 `placement.refused`** naming the extent
searched. If the cell moved, the response says so — we never silently relocate a
site without telling you.

`PATCH /sites/{id}` relabels or moves a site (a move re-queues the extraction).
`DELETE /sites/{id}` removes it and its record.

`status` values: `populating`, `ready`, `failed` (with `status_detail`).

### 5.2 `GET /sites/{id}/history` — the extracted record

One endpoint at three resolutions.

```
GET /sites/412/history?granularity=daily&from=2026-02-15&to=2026-09-16
GET /sites/412/history?granularity=monthly&from=1986-01
GET /sites/412/history?granularity=season
```

Parameters: `granularity` (`daily` | `monthly` | `season`, default `daily`),
`from`, `to`, `vintage`, `updated_since`, `limit`, `cursor`.

**The window defaults to the current season, not to everything.** Pass `from`
and `to` explicitly for a backfill.

#### `granularity=daily` — coverage from 2026-02-15

| Field | Type | Unit | Notes |
|---|---|---|---|
| `date` | date | — | Local calendar date |
| `temp_min`, `temp_max`, `temp_mean` | float\|null | °C | |
| `rainfall_mm` | float\|null | mm | `0.0` is a measured dry day; `null` is no observation |
| `gdd_daily`, `gdd_cumulative` | float\|null | °C·day | **Base 0**, accumulated from 1 September |
| `gdd10_daily`, `gdd10_cumulative` | float\|null | °C·day | **Base 10**, accumulated from 1 September |
| `eto_mm` | float\|null | mm | Reference ET — **an estimate, not a measurement** |
| `etc_mm` | float\|null | mm | Crop ET |
| `water_balance_mm` | float\|null | mm | Running balance |
| `eto_method` | string\|null | — | e.g. `hargreaves-samani` |
| `model_version` | string\|null | — | Which surface era this day came from |

**Both GDD bases are supplied and they are not interchangeable.** Base 10 is the
viticultural convention; base 0 is what our phenology accumulations use. Pick
one deliberately.

#### `granularity=monthly` — coverage from 1986-01

Keyed `(variable, statistic, year, month)` with a single `value`.

| Variable | Statistics |
|---|---|
| `temp_mean` | `mean` |
| `temp_min` | `mean` |
| `temp_max` | `mean`, `days_over_25`, `days_over_30` |
| `rainfall` | `sum`, `max`, `wet_days`, `days_over_10mm`, `days_over_25mm`, `max_dry_spell` |
| `gdd10` | `sum` |

#### `granularity=season` — per vintage

`metric`, `value`, `unit`, `baseline`, per `vintage_year`.

Metrics: `gdd10`, `tmean`, `tmin`, `tmax`, `hot_days_25`, `hot_days_30`, `rain`,
`wet_days`, `rain_days_over_10mm`, `rain_days_over_25mm`,
`max_dry_spell_within_month`, `rx1day`.

> **A partial season returns no row.** We do not emit a sum over six months of
> eight — it would read as a low year rather than as missing data.

### 5.3 `GET /sites/{id}/season` — this season against its own baseline

The season to date, day by day, beside the site's own 1986-2005 normal.

```
GET /sites/412/season?vintage=2027
```

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
      "rain":  {"value": 22.0, "baseline": 28.6, "delta": -6.6, "unit": "mm"}
    },
    "meta": {
      "method": "zone daily shape, site monthly level; GDD re-integrated from the shifted mean and the zone day-of-vintage sd",
      "shape_source": "regional daily climatology 1986-2005",
      "level_source": "this location's own 1986-2005 monthly normal",
      "unadjusted_months": [],
      "interpolated_days": 1
    }
  }
}
```

**How the baseline is built, and why it is a hybrid.** There is no daily
1986-2005 record at a single 500 m cell — the daily surfaces do not reach back
that far. So the baseline curve takes its **day-to-day shape** from the region's
daily climatology and its **level** from the site's own monthly normal.

This is not a cosmetic correction. In one Canterbury zone the regional Sep-Apr
GDD10 baseline is 1,148 while a site inside it averages 1,041 — plotted against
the raw regional curve, that site would show a 107 GDD deficit in every season it
will ever have.

**GDD is recomputed, not shifted.** Applying a temperature offset to a GDD
climatology is not linear: a site 1 °C warmer gains a full degree-day in
midsummer but a fraction of one in the shoulder months, where many days sit
below the base. We shift the daily mean and re-integrate, using the same
estimator as the live series, which is the only reason the two are comparable.

`unadjusted_months` lists any month with no site-level normal, left at the
regional level. A site outside every mapped zone has no baseline at all and
returns **404 `data.unavailable`** rather than a regional stand-in.

### 5.4 `GET /regions/{slug}/history`

```
GET /regions/marlborough-wairau-valley/history?granularity=monthly&from=1986-01
GET /regions/marlborough-wairau-valley/history?granularity=season
```

`monthly` returns mean and standard deviation per variable from 1986.
`season` returns per-vintage metrics **with spread**:

```json
{
  "vintage_year": 2026,
  "metric": "gdd10",
  "unit": "C.day",
  "mean": 1183.4,
  "min": 1004.1, "max": 1329.8,
  "p10": 1061.2, "p90": 1287.0,
  "coverage": 0.93
}
```

> **Spread is the point of a regional figure.** A region is many vineyard cells,
> not one. `p10`/`p90` describe where 80% of them sit, and **`coverage` is the
> fraction of the region's planted cells the metric could be computed for.**
> A figure at `coverage: 0.30` is a different claim from the same figure at
> `1.00`, and publishing the mean without it states something stronger than we
> did.

`GET /regions` returns the catalogue, including `parent_slug` and `zone_level`
so the sub-region to region hierarchy is walkable from our data rather than
hard-coded in yours.

### 5.5 `GET /regions/{slug}/summary`

The current state of a region — the same content as the Auxein Insights regional
page.

```json
{
  "data": {
    "zone": {"slug": "marlborough-wairau-valley", "name": "Wairau Valley",
             "level": "sub_regional", "region_name": "Marlborough"},
    "vintage": 2027,
    "as_of": "2026-09-16",
    "baseline": "1986-2005",

    "recent": {"days": [ ]},
    "season": {"gdd10": {"value": 122.7, "baseline": 118.1, "delta": 4.6}},

    "phenology": {
      "available": true,
      "varieties": [{
        "variety_code": "SB",
        "budburst": {"date": "2026-09-22", "is_actual": false,
                     "endodormancy_date": "2026-07-28",
                     "chill_units": 1043.5, "forcing_units": 118.2,
                     "model": "chilling-forcing (APSIM Grapevine)"},
        "flowering_date": "2026-12-06", "veraison_date": "2027-02-03",
        "harvest_210_date": "2027-04-02",
        "confidence": "medium"
      }]
    },

    "disease": {
      "available": true,
      "latest": {
        "date": "2026-09-16",
        "powdery_mildew": {"risk": "low", "cumulative_index": 0.0,
                           "model": "uc-davis-gubler-1999",
                           "scale": "0-100 cumulative; <30 low, 30-50 moderate, 50-60 high, >60 extreme"},
        "botrytis": {"risk": "low", "severity": 0.0, "cumulative": 0.0,
                     "model": "gonzalez-dominguez-2015"},
        "bacchus": {"index": 0.1832, "peak": 0.2140, "infection": false,
                    "wet_hours": 4, "dry_run": 6},
        "downy_mildew": {"risk": "low", "primary_met": false,
                         "goidanich_index": 0.0},
        "humidity_available": true,
        "hours_used": 24
      },
      "series": [ ]
    },

    "projections": { },
    "models_disclaimer": "..."
  }
}
```

Five things to carry into any display of this payload.

**1. Bacchus is five numbers, not one.** The model is scoped to a *wet period*
and this record is scoped to a *day*, so a wet period from 22:00 to 06:00 is one
infection event across two rows.

- `index` is the state carried **out of** the day.
- `peak` is the highest value reached **during** it — **this is what to chart.**
- `infection` is the event itself.

Charting `index` as the day's risk **under-reports**, because a reset can wipe a
period that got most of the way to the threshold. The threshold is exactly
`1.0` and is returned alongside.

**Bacchus values carry four decimal places and need to survive your round trip.**
The index sums terms of order 0.01-0.07 against a threshold of 1.0; two decimal
places would accumulate enough error to decide infections.

**2. Botrytis `severity` and `cumulative` are different quantities on different
scales.** They are not two views of one number, and drawing one under the
other's risk bands produces a wrong chart.

**3. `humidity_available: false` and `hours_used < 24` are load-bearing.** They
are how you tell a genuinely low risk score from "we could not see". Some
locations have no humidity observation in range and carry no disease score at
all — that is reported, not silently zeroed.

**4. `is_actual: false` on a phenology date means it is modelled**, not
observed. `variety_is_assumed: true` means the site recorded no variety and we
substituted one — worth 5 to 20 days against a model RMSE of 4.9 days. A variety
we hold no calibration for returns no phenology rather than a silent default.

**5. Budburst runs a different model** from the stages below it — chilling, then
forcing, triggered by a photoperiod that moves with latitude rather than by a
fixed calendar start. `endodormancy_date` is when the chilling requirement was
met and forcing began; a budburst date cannot be interpreted without it.
`forcing_units: null` means dormancy has not yet released, which is not the same
as having accumulated none.

> **Regional and site figures will disagree, and should.** A regional value
> aggregates the stations assigned to that zone; a site value interpolates to a
> single cell with distance limits. Same model, different spatial source. This
> is a property of the two products, not a discrepancy to reconcile.

### 5.6 and 5.7 — `GET /rasters/daily` and `GET /rasters/monthly`

The interpolated surfaces themselves, as Cloud Optimized GeoTIFFs.

```
GET /rasters/daily?variable=temp_min&from=2026-09-01&to=2026-09-16
GET /rasters/monthly?variable=rainfall&statistic=sum&from=2020-01&to=2024-12
```

```json
{
  "data": [{
    "id": 184102,
    "variable": "temp_min",
    "granularity": "daily",
    "statistic": null,
    "valid_at": "2026-09-14T00:00:00Z",
    "resolution_m": 500,
    "model_version": "tps-2.0.0-ridge-db-adj",
    "cv_rmse": 2.08,
    "cv_units": "C",
    "n_stations_fit": 214,
    "n_stations_test": 24,
    "clipped": false,
    "status": "ok",
    "created_at": "2026-09-16T15:02:11Z",
    "bytes": 6203488,
    "checksum": "sha256:9f2c...",
    "url": "https://...?X-Amz-...",
    "url_expires_at": "2026-09-17T03:14:09Z"
  }],
  "meta": {"objects_remaining_today": 178, "bytes_remaining_today": 3355443200}
}
```

Pass **`?include_url=false`** to browse the catalogue without minting signed
URLs. Minting is what counts against your object and byte allowance, so this
lets you plan a pull for free.

Objects are addressed **by catalogue `id`**. There is no path or filename
parameter.

| | Daily | Monthly |
|---|---|---|
| Variables | `temp_min`, `temp_max`, `temp_mean`, `rainfall` | the same four |
| Statistic | not applicable | required — see below |
| Coverage | **from 2026-02-15** | **from 1986-01** |
| Resolution | 500 m, 2856 × 2667, float32 | 500 m, 2856 × 2667, float32 |
| Typical size | 0.6-2.0 MiB | 0.04-2.0 MiB |
| Availability | **D-14** (see §6.2) | on publication |

Monthly statistics, per variable:

| Variable | Statistics |
|---|---|
| `temp_mean` | `mean`, `median`, `sd`, `min`, `max`, `argmin_day`, `argmax_day` |
| `temp_min` | `mean`, `median`, `sd`, `min`, `max`, `argmin_day`, `argmax_day` |
| `temp_max` | `mean`, `median`, `sd`, `min`, `max`, `argmin_day`, `argmax_day`, `days_over_25`, `days_over_30` |
| `rainfall` | `sum`, `mean`, `median`, `sd`, `min`, `max`, `argmin_day`, `argmax_day`, `wet_days`, `days_over_10mm`, `days_over_25mm`, `max_dry_spell`, `wet_top1` … `wet_top5` |

> **`argmin_day` and `argmax_day` are day-of-month indices in which `0` means
> "did not occur", not the 1st.** Treat `0` as a sentinel, never as a date.

`wet_top1` … `wet_top5` are the five largest daily rainfall totals in the month,
per cell, in descending order.

---

## 6. Working with the rasters

### 6.1 Three things that will produce wrong numbers otherwise

**`cv_units` must be honoured.** `cv_rmse` is the out-of-sample cross-validated
error for that surface, and its unit is **not always the variable's unit**.
Rainfall is fitted in **ratio space**, so its `cv_rmse` is **dimensionless**
(around 0.0025) and must never be rendered as millimetres.

**The archive is stored unclipped.** Values exist in cells beyond the coastline
and outside the land mask. Those cells are not meaningful; read the nodata value
as absent rather than as a number.

**Daily objects are rewritten in place.** Our weekly refit revises recent days at
the same storage location. `created_at` and `checksum` in the catalogue are how
you detect a replacement. This is also why daily objects are released at D-14
(§6.2), by which point the refit window has closed and the object is final.

### 6.2 Availability lag

**Daily rasters are available at D-14.** Point values and rendered tiles remain
at D+2 — the lag applies to the GeoTIFF objects only. By D-14 the weekly refit
window has closed, so every object delivered is final and will not be revised
underneath you.

**Monthly rasters** are available on publication.

### 6.3 The initial archive transfer

The full raster archive is **1.36 GiB of daily objects** and **18.19 GiB of
monthly objects**. It is delivered once, as a direct storage-to-storage transfer
into a bucket you nominate, accompanied by a `manifest.json` listing every
object with its key, size, checksum, `model_version` and `cv_rmse`.

Pulling ~21,000 objects through the API would be slower for you and pointless
for data that does not change. **The API endpoints in §5.6 and §5.7 are for the
ongoing delta** — four objects a day for the daily surfaces, and the monthly set
when the archive is extended.

---

## 7. Data quality and disclosure

### 7.1 Model provenance

| Model | Basis |
|---|---|
| Interpolation | Thin-plate spline with ridge penalty, GCV-selected, 500 m |
| Powdery mildew | UC Davis / Gubler (1999) |
| Botrytis | Gonzalez-Dominguez et al. (2015) |
| Downy mildew | 3-10 rule with Goidanich index |
| Bacchus | Balasubramaniam and Edwards |
| Budburst | Chilling-forcing, APSIM Grapevine parameters |
| Reference ET | Hargreaves-Samani (temperature-based) |
| Projections | MfE 2024 downscaled, against a 1986-2005 baseline |

**On Bacchus specifically:** the model is published as a set of terms, and our
assembly of those terms into a single index is **an Auxein inference, not a
published specification.** We state this rather than present it as canonical.

### 7.2 Freshness

Daily data is **D-1**. The observation chain completes overnight New Zealand
time, and one data source typically lands about five hours behind the others.

This is a **target, not a service level**, until an SLA is separately agreed.

### 7.3 Frost is reported regionally, and only regionally

No frost figure is published at a point, and no frost raster is included.

The reason is specific. Frost counts are thresholded from an interpolated
minimum-temperature field that applies a standard lapse rate with elevation. On
frost nights the atmosphere **inverts** — cold air drains downhill and pools in
valley floors — so the lapse rate is wrong **in sign** on exactly the nights that
produce the count. Measured against stations, the interpolated field loads frost
onto ridgelines and erases it from valley floors, which is where vines are
planted.

Where a regional frost average is available it is returned with the site value
and the regional spread both `null` and a `regional_only_reason` explaining why.
Those nulls are deliberate, not missing data.

We will publish a point-level frost figure when the interpolation is corrected
for inversion, and not before.

### 7.4 Rainfall cross-validation error

Restating §6.1 because it is the most likely misreading in this API: rainfall is
fitted in ratio space. Its `cv_rmse` is dimensionless. It is not millimetres.

---

## 8. Errors

`application/problem+json`, with a stable `code` you can branch on.

```json
{
  "type": "https://api.auxein.co.nz/errors/entitlement",
  "title": "Not entitled",
  "status": 403,
  "code": "entitlement.history_depth",
  "detail": "History before 2006-01-01 is not included in this agreement.",
  "instance": "/api/v1/partner/sites/412/history?from=1990-01-01"
}
```

| Code | Status | Meaning |
|---|---|---|
| `auth.missing_key` | 401 | No `Authorization` header |
| `auth.invalid_key` | 401 | Key not recognised |
| `auth.key_revoked` | 401 | Key has been revoked or has expired |
| `auth.endpoint_not_granted` | 403 | This key is not granted this endpoint |
| `entitlement.resource` | 403 | Not included in the agreement |
| `entitlement.geography` | 403 | Outside the licensed area |
| `entitlement.history_depth` | 403 | Earlier than the licensed history |
| `entitlement.site_cap` | 402 | Contracted site count is fully used |
| `quota.rate_limited` | 429 | Requests per minute exceeded |
| `quota.rows_exhausted` | 429 | Daily row allowance exhausted |
| `quota.objects_exhausted` | 429 | Daily object or byte allowance exhausted |
| `site.not_ready` | 409 | Registered, still populating |
| `site.duplicate_ref` | 409 | `external_ref` already exists |
| `placement.refused` | 422 | No usable grid cell at that coordinate |
| `data.unavailable` | 404 | Nothing exists here |
| `data.withheld` | 404 | We hold this but do not publish it (§7.3) |

`data.unavailable` and `data.withheld` are deliberately distinct, and neither
is an empty success. "Nothing here", "not published", and "come back shortly"
are three different answers.

---

## 9. Versioning

- **Additive changes are always allowed.** New fields and endpoints may appear
  in `v1` at any time. **Your client must ignore unknown fields** — this is a
  requirement on the consumer, stated here so it is not a surprise.
- **Breaking changes get a new version path** (`/api/v2/partner`) with **six
  months' notice** and both versions live through the window. Breaking means
  removing or renaming a field, changing a type or unit, or changing what an
  existing value means.
- **Model version changes are announced, not silent.** A new `model_version` may
  change values for dates already delivered. We give 30 days' notice and
  identify the affected range so you can re-pull precisely what moved.
- **Revision of recent days is normal** (§2.3) and is not a breaking change.
- **Deprecation** is signalled with `Sunset` and `Deprecation` headers before
  anything is removed.

---

## 10. Contact

Technical: **pete.taylor@auxein.co.nz**

A **sandbox key** (`auxp_test_`) against a fixed synthetic dataset is available
on request, so the integration can be built and tested before anything is
finalised.
