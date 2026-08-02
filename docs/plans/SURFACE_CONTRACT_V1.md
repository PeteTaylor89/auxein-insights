# Climate Surface Contract v1

**Status: PUBLISHED 2026-08-02 · this is the interface WS3 builds against**

This document is the frozen interface between the interpolation pipeline (WS2)
and everything that consumes surfaces (WS3 frontend, point API, AI agent tools,
phenology/disease). It is deliberately published **before any surface exists** so
the frontend can build against a stub and the two workstreams run in parallel.

**Rule: nothing in §2, §3 or §5 changes without a version bump.** Additive
fields are fine; renames and semantic changes are not.

---

## 1. Storage

**Bucket:** `auxein-climate-surfaces` (`ap-southeast-2`, private).
Reads go through the backend or a CloudFront distribution — never a public
bucket ACL.

### 1.1 Key layout
```
surfaces/v1/{variable}/{granularity}/{YYYY}/{MM}/
    {variable}_{granularity}_{YYYYMMDD}[T{HH}]_{resolution_m}m.tif      # value
    {variable}_{granularity}_{YYYYMMDD}[T{HH}]_{resolution_m}m_sd.tif   # uncertainty
```

Examples:
```
surfaces/v1/temp_mean/daily/2026/08/temp_mean_daily_20260802_1000m.tif
surfaces/v1/temp_mean/daily/2026/08/temp_mean_daily_20260802_1000m_sd.tif
surfaces/v1/rainfall/daily/1986/01/rainfall_daily_19860101_5000m.tif
```

`{HH}` is present only for `granularity=hourly`, is UTC, and is zero-padded.

### 1.2 Controlled vocabularies
| Field | Allowed values |
|---|---|
| `variable` | `temp_mean`, `temp_min`, `temp_max`, `rainfall`, `pet`, `rh`, `pressure` |
| `granularity` | `daily`, `hourly` |
| `resolution_m` | `500`, `1000`, `2000`, `5000` |

Variable names match `measurement_catalog` codes where one exists, so a surface
variable and a station variable are never ambiguous.

### 1.3 Which resolutions exist when
| Era | Source | Resolution | Variables |
|---|---|---|---|
| 1986-2024 | imported on-prem archive | `5000` | `temp_min`, `temp_max`, `temp_mean`, `rainfall` (+ radiation) |
| 2020-present | new pipeline | `1000` national, `500` flagship regions | `temp_*`, `rainfall`, `pet`, `rh` |

**Consumers must never mix resolutions in a single series without saying so.**
`resolution_m` is returned on every API response for exactly this reason. There
is no RH or PET before 2020 — those series legitimately start there.

---

## 2. GeoTIFF specification

Every surface is a **Cloud-Optimized GeoTIFF**:

| Property | Value |
|---|---|
| CRS | `EPSG:4326` (WGS84 lon/lat) |
| Bands | 1 |
| dtype | `float32` |
| NoData | `-9999.0` |
| Compression | `DEFLATE`, `PREDICTOR=3` (float) |
| Tiling | internal, 512×512 |
| Overviews | yes, powers of 2 down to <256 px, `AVERAGE` |
| Units | °C (`temp_*`), mm (`rainfall`), mm/day (`pet`), % (`rh`), hPa (`pressure`) |

The `_sd.tif` sibling has identical geometry and holds the per-cell uncertainty
estimate in the same units.

### 2.1 Embedded metadata
Written as GeoTIFF metadata tags, so a surface is self-describing even if
detached from the database:
```
AUXEIN_VARIABLE, AUXEIN_GRANULARITY, AUXEIN_VALID_AT, AUXEIN_RESOLUTION_M,
AUXEIN_MODEL_VERSION, AUXEIN_N_STATIONS_FIT, AUXEIN_N_STATIONS_TEST,
AUXEIN_RMSE, AUXEIN_T_RMSE, AUXEIN_SMOOTHING, AUXEIN_LAPSE_RATE, AUXEIN_CREATED_AT
```

---

## 3. Database index

The rasters live on S3; Postgres holds only the index and the statistics, so one
SQL query locates any surface and reports its accuracy.

### 3.1 `surface_run`
| Column | Type | Notes |
|---|---|---|
| `id` | bigserial PK | |
| `variable` | text | see vocab |
| `granularity` | text | `daily` / `hourly` |
| `valid_at` | timestamptz | UTC; midnight UTC for daily |
| `resolution_m` | int | |
| `model_version` | text | e.g. `tps-1.7.0` |
| `s3_key` | text | value raster |
| `s3_key_sd` | text | uncertainty raster, nullable |
| `n_stations_fit` | int | |
| `n_stations_test` | int | |
| `smoothing` | double precision | CV-selected |
| `status` | text | `ok` / `degraded` / `failed` |
| `created_at` | timestamptz | |

Unique on `(variable, granularity, valid_at, resolution_m, model_version)`.

`status='degraded'` means the surface was produced but failed a quality gate
(too few stations, RMSE above threshold). It is still served — with its
confidence — rather than hidden.

### 3.2 `surface_validation_stats`
FK `surface_run_id` → `surface_run.id`. Columns: `rmse`, `cv_rmse`, `t_rmse`,
`snr`, `mae`, `bias`, `r2`, `max_abs_error`, `n_fit`, `n_test`.

**Three accuracy numbers, and they are not interchangeable.** Measured on the
1986-2000 golden files (see `parity_check.py --all`):

| Statistic | What it is | Observed range | Publish? |
|---|---|---|---|
| `rmse` | residual over the *fitted* stations | 0.002 - 0.24 °C | **Never.** The spline near-interpolates its own training points at the CV-selected smoothing, so this is ~0.01 °C and flatters the model by two orders of magnitude. Diagnostic only. |
| `cv_rmse` | **shuffled** 10-fold CV, production clip applied | **1.09 - 1.66 °C** (median 1.28) | **Yes — this is the published number.** Always available, genuinely out-of-sample. |
| `t_rmse` | declustered holdout | 0.11 - 1.9 °C, `n_test` 0-13 | Only when `n_test >= 10`. Often 1-4 stations, and **zero** for 1986 — too thin to publish alone. |

### 3.3 How `cv_rmse` must be computed (measured, not assumed)
`cv_experiment.py` established two non-obvious requirements. Both are load-bearing;
skipping either produces a materially wrong published figure.

**Folds must be shuffled.** The station table is ordered geographically —
measured fold compactness **0.49** for unshuffled folds versus **1.00** for
random (i.e. an unshuffled fold's members are half as far apart as the network
average). Unshuffled folds therefore excise contiguous *regions*, scoring the
spline on extrapolating across a hole it never faces in production.

| Fold scheme | Median RMSE | Worst |
|---|---|---|
| unshuffled 5-fold (the original) | 1.903 | 3.003 |
| shuffled 5-fold (20% held out) | 1.379 | 1.777 |
| **shuffled 10-fold (10%)** | **1.338** | 1.653 |
| shuffled 20-fold (5%) | 1.336 | 1.689 |
| LOOCV | 1.314 | 1.734 |

Shuffling alone recovers **~28%**. Fold *size* barely matters once shuffled —
LOOCV beats 10-fold by ~2% for n× the cost — so **shuffled 10-fold** is the
standard, with a fixed seed for reproducibility.

**Predictions must be clipped** to the training range, exactly as production
does. Unclipped, a near-singular thin-plate system produced a **176 °C**
excursion on one date. The clip is a real safety mechanism, not cosmetic.

**Scoring is deliberately decoupled from smoothing selection.** Smoothing is
still chosen with the original's unshuffled folds so surfaces remain bit-for-bit
identical to the validated on-prem model. Changing how we *measure* a surface
must never change the surface.

### 3.4 Confidence is distance-banded, not a single number
Pooled LOOCV error against distance-to-nearest-station:

| Distance to nearest station | RMSE | Bias |
|---|---|---|
| 0-5 km | 1.10 °C | +0.02 |
| 5-10 km | 1.02 °C | +0.05 |
| 10-20 km | 1.20 °C | -0.09 |
| 20-40 km | 1.41 °C | +0.02 |
| 40-80 km | 1.76 °C | -0.04 |
| >80 km | 2.04 °C | **-0.63** |

Error grows smoothly with isolation, and beyond 80 km a **cold bias** appears
(remote stations are disproportionately high-country). So a point 3 km from a
station is roughly twice as trustworthy as one 60 km away, and one global RMSE
would misrepresent both.

**Therefore `/point` returns `distance_to_nearest_station_km` and a banded
`expected_error`, not just the surface-wide `cv_rmse`.** This is the honest
version of the confidence story and it is the product differentiator.

**Caveat carried forward:** CV measures accuracy at locations where a station
exists — inherently better-supported than an arbitrary remote grid cell. The
distance banding is what keeps that honest.

Two consequences that must be respected by consumers:

1. **`cv_rmse` is the honest accuracy.** A surface whose fit RMSE is 0.01 °C is
   not accurate to 0.01 °C; on the historical 5 km network it is accurate to
   roughly ±2 °C. Publishing the fit residual would be misleading.
2. **The declustering holdout is a fit-stabilisation device first and a test set
   second.** It only yields test stations where redundant near-colocated
   stations happen to exist. It cannot be relied on for coverage.

The modern network (427 active, heading to ~1,000) is 2-5× denser than the
~150-190 station historical network these figures come from, so `cv_rmse` on new
surfaces should be materially better. That improvement should be *measured and
shown*, not assumed.

**Known caveat:** the CV folds are unshuffled (inherited from the on-prem model,
and kept for determinism). If stations are ordered geographically, folds remove
spatially contiguous blocks, which makes `cv_rmse` pessimistic. Quantify against
shuffled/LOOCV before publishing a headline accuracy figure.

---

## 4. Interpolation method (informational — see the plan for detail)

Per variable per timestep: lapse-rate detrend to sea level (0.6 °C/100 m) →
2D thin-plate spline on (lon, lat), smoothing chosen by 5-fold CV → clip to the
observed station min/max → lapse retrend to each grid cell's elevation.
Holdout is by **spatial declustering**: near-colocated stations are collapsed to
one for fitting and the duplicates become an independent test set.

---

## 5. API contract

All routes are under `/api/v1/surfaces`. Free vs paid gating is applied at the
route layer; the shapes below do not change between tiers.

### 5.1 Point sample
```
GET /api/v1/surfaces/point
    ?lon=173.95&lat=-41.51
    &variables=temp_mean,rainfall
    &start=2026-07-01&end=2026-08-01
    &granularity=daily
```
```jsonc
{
  "location": { "lon": 173.95, "lat": -41.51, "elevation_m": 34 },
  "granularity": "daily",
  "series": [
    {
      "variable": "temp_mean",
      "unit": "C",
      "points": [
        { "valid_at": "2026-07-01T00:00:00Z", "value": 8.4,
          "sd": 0.42, "resolution_m": 1000,
          "confidence": {
            "cv_rmse": 1.28,                          // surface-wide, shuffled 10-fold
            "expected_error": 1.10,                   // banded by isolation (§3.4)
            "distance_to_nearest_station_km": 4.2,
            "t_rmse": 0.38, "n_test": 12
          } }
      ]
    }
  ],
  "meta": { "model_version": "tps-1.7.0", "cells_missing": 0 }
}
```
`value` is `null` (never 0) where the cell is NoData or no surface exists.
**Every point carries its own `resolution_m` and confidence** — a series may
legitimately span the 5 km historical era and the 1 km modern era.

### 5.2 Region / zonal statistics
```
GET /api/v1/surfaces/region?zone_id=5&variables=temp_mean&start=…&end=…
```
Returns the same envelope with `mean` / `min` / `max` / `area_km2` per timestep,
area-weighted over the zone polygon. A region value and a point value inside it
come from the same raster and are therefore consistent by construction.

### 5.3 Surface discovery
```
GET /api/v1/surfaces/available?variable=temp_mean&granularity=daily
→ { "variable": "...", "first": "1986-01-01", "last": "2026-08-01",
    "resolutions": [5000, 1000, 500], "gaps": ["2024-01-01/2024-03-14"] }
```
Drives the frontend time-scrubber bounds. **`gaps` is authoritative** — the
scrubber must grey out missing dates rather than requesting and rendering holes.

### 5.4 Tiles (map rendering)
```
GET /api/v1/surfaces/tiles/{variable}/{granularity}/{valid_at}/{z}/{x}/{y}.png
    ?ramp=viridis&min=0&max=30
```
PNG web-mercator tiles rendered from the COG. MVP serves dynamically with
aggressive caching; if load demands it, pre-rendering to S3+CloudFront is a
drop-in change behind the same URL.

### 5.5 Errors
Standard envelope, HTTP status meaningful: `404` no surface for that
variable/date, `422` bad parameters, `402` entitlement required (paid features),
`503` surface exists but the raster is unreadable.

---

## 6. Stub-first workflow (how WS3 starts today)

A stub service satisfies §5 with synthetic but *plausible* data — correct
shapes, correct units, realistic NZ diurnal and seasonal signal, and a
deliberate `gaps` entry plus a mixed-resolution series so the frontend is forced
to handle both from day one.

Frontend acceptance before real surfaces land:
- Time-scrubber respects `available.gaps`.
- `ConfidenceBadge` renders from `confidence.cv_rmse` on every value, and falls
  back gracefully when `t_rmse` is null or `n_test` is small.
- Mixed-resolution series render without silently blending eras.
- `value: null` renders as a gap, never as zero.

That last point is not hypothetical — a NULL-rainfall-written-as-0 bug (B4.1)
has already bitten this platform once.

---

## 7. Versioning

The `v1` in both the S3 prefix and the route is the contract version. Breaking
changes mint `v2` and both serve during migration. `model_version` on each
surface is independent — it changes whenever the science changes, and lets us
re-run a period and compare without invalidating the contract.
