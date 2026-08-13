# Climate Surface Contract v2

**Status: PUBLISHED 2026-08-04 · amended 2026-08-05 (§8.1, additive) · amended
2026-08-13 (§8.2 — aggregated surfaces, zonal weighting, gap semantics) · this
is the interface WS3 builds against**

This document is the frozen interface between the interpolation pipeline (WS2)
and everything that consumes surfaces (WS3 frontend, point API, AI agent tools,
phenology/disease). It is deliberately published **before any surface exists** so
the frontend can build against a stub and the two workstreams run in parallel.

**Rule: nothing in §2, §3 or §5 changes without a version bump.** Additive
fields are fine; renames and semantic changes are not.

Supersedes [`SURFACE_CONTRACT_V1.md`](SURFACE_CONTRACT_V1.md) — see §8 for what
changed and why it needed a bump.

---

## 1. Storage

**Bucket:** `auxein-climate-surfaces` (`ap-southeast-2`, private).
Reads go through the backend or a CloudFront distribution — never a public
bucket ACL.

### 1.1 Key layout

**Per-timestep surfaces** (`daily`, `hourly`) — one raster per timestep:
```
surfaces/v2/{variable}/{granularity}/{YYYY}/{MM}/
    {variable}_{granularity}_{YYYYMMDD}[T{HH}]_{resolution_m}m.tif      # value
    {variable}_{granularity}_{YYYYMMDD}[T{HH}]_{resolution_m}m_sd.tif   # uncertainty
```

**Aggregated surfaces** (`monthly`, `records`) — one raster per *statistic*:
```
surfaces/v2/{variable}/monthly/{YYYY}/
    {variable}_monthly_{YYYYMM}_{resolution_m}m_{statistic}.tif
surfaces/v2/{variable}/records/
    {variable}_records_{resolution_m}m_{statistic}.tif
```

Examples:
```
surfaces/v2/temp_mean/daily/2026/08/temp_mean_daily_20260802_1000m.tif
surfaces/v2/temp_mean/daily/2026/08/temp_mean_daily_20260802_1000m_sd.tif
surfaces/v2/temp_min/monthly/1986/temp_min_monthly_198601_500m_frost_days.tif
surfaces/v2/temp_min/records/temp_min_records_500m_all_time_min.tif
```

`{HH}` is present only for `granularity=hourly`, is UTC, and is zero-padded.

**Note the three deliberate asymmetries**, all of which follow from what the
key has to identify rather than from taste:

1. **Monthly has no `{MM}` directory level.** A year holds 12 months × ~14
   statistics ≈ 170 objects, which needs no further fanout; daily needs the
   month level because a year holds 365 × 2.
2. **`records` has no date component at all** — an all-time record surface is
   not "as at" a timestep, it is the whole archive reduced. Its `valid_at` in
   `surface_run` is the END of the period it covers, with `period_start` giving
   the other bound (§3.1).
3. **`_sd` is a suffix on per-timestep keys but a `statistic` on aggregated
   ones.** `sd` there means "standard deviation of the daily values within the
   month", which is a different quantity from a per-timestep kriging
   uncertainty and must not be read as interchangeable with it. The monthly
   `sd` is load-bearing: GDD is computed from `mean` + `sd` via
   `n·[(μ−B)Φ(z) + σφ(z)]`, and naive `max(0, mean−10)` under-counts by 20% at
   cool sites.

**The `surfaces/v1/` prefix is unused and must stay empty.** No v1 surface was
ever generated. If one appears there, something is running old code.

### 1.2 Controlled vocabularies
| Field | Allowed values |
|---|---|
| `variable` | `temp_mean`, `temp_min`, `temp_max`, `rainfall`, `pet`, `rh`, `pressure`, `solar_rad` |
| `granularity` | `daily`, `hourly`, `monthly`, `records` |
| `resolution_m` | `500`, `1000`, `2000`, `5000` |
| `statistic` | see below; **required** for `monthly` / `records`, **absent** for `daily` / `hourly` |

Variable names match `measurement_catalog` codes where one exists, so a surface
variable and a station variable are never ambiguous.

#### `statistic` vocabulary
Aggregated surfaces carry a statistic dimension because the daily surfaces they
were derived from **are never written** — streaming month-by-month into
accumulators is the difference between ~2 h and ~11 h + 142 GB. The consequence
is irreversible and dictates this list: **anything not accumulated while the
dailies existed cannot be recovered from the published product.** Recomputing
costs a full re-run.

| Group | Statistics | Applies to |
|---|---|---|
| Distribution | `mean`, `median`, `min`, `max`, `sd` | all |
| Timing | `argmin_day`, `argmax_day` | all |
| Records | `all_time_min`, `all_time_max`, `all_time_min_day`, `all_time_max_day` | `records` only |
| Temperature thresholds | `frost_days` (temp_min), `days_over_25` / `days_over_30` (temp_max) | per variable — see below |
| Frost timing | `first_frost_day`, `last_frost_day` | `temp_min` only |
| Rainfall | `sum`, `wet_days`, `days_over_10mm`, `days_over_25mm`, `max_dry_spell`, `wet_top1`..`wet_top5` | `rainfall` only |

**Threshold statistics are keyed by variable, not applied to every temperature
variable.** `frost_days` belongs to `temp_min` (FD), `days_over_25` /
`days_over_30` to `temp_max` (SU25/TX30); `temp_mean` gets none. The completed
`temp_mean` and `temp_max` runs predate this rule and carry junk bands —
`temp_mean/…/frost_days` counts days the daily *mean* went below zero. **Those
tifs must be deleted and the two manifests rewritten before publishing.** No
refit is needed.

`*_day` statistics are day-of-month, `0` meaning "did not occur". The `records`
`*_day` pair is stored as **days since 1986-01-01**, because float32 cannot hold
`YYYYMMDD` exactly.

**Count statistics are the authority at a threshold, not the value ones.**
Counts are computed before encoding and are exact; `min`/`max` are LERC-lossy to
0.01, so 0.07% of cells show `frost_days > 0` alongside a stored `min >= 0`.

### 1.3 Which resolutions exist when
| Era | Source | Granularity | Resolution | Variables |
|---|---|---|---|---|
| 1986-2023 | **500 m recompute** (`run_history.py`) | `monthly` + `records` | `500` | `temp_mean`, `temp_max`, `temp_min` done; `rainfall`, `solar_rad` pending |
| 2020-present | new pipeline | `daily` | `1000` national, `500` flagship regions | `temp_*`, `rainfall`, `pet`, `rh` |

**The historical era is no longer a 5 km import.** v2 originally specified
1986-2024 as the on-prem archive at 5 km; that has been superseded by a 500 m
recompute on a denser station network (512 stations vs the archive's ~471, and
~197 reporting on a median day vs 190). The old figure is *not* a resolution
this contract still produces for that era.

**The historical era is monthly, not daily.** Daily 1986-2023 surfaces do not
exist and are not recoverable from what is published — see the statistic
vocabulary above. A consumer asking for `granularity=daily` before 2020 gets
nothing, and that is correct rather than a gap to be filled.

**Consumers must never mix resolutions in a single series without saying so.**
`resolution_m` is returned on every API response for exactly this reason. There
is no RH or PET before 2020 — those series legitimately start there.

**Accuracy is not uniform across variables.** Measured `cv_rmse` medians over
13,878 fitted days each: `temp_mean` **1.15**, `temp_max` **1.41**, `temp_min`
**1.83**. Minimum temperature is materially harder — cold-air pooling and
inversions are local effects a smooth spline cannot represent — and `frost_days`
rides on exactly that variable. Frost products must carry their confidence
prominently, not as a footnote.

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

Note that `EPSG:4326` is the *output* CRS. The spline itself is fitted in metric
coordinates (§4) — thin-plate splines are isotropic, and at −41° latitude a
degree of longitude is ~84 km against ~111 km for latitude, so fitting in degrees
imposes a 32% east-west stretch with no physical basis.

The `_sd.tif` sibling has identical geometry and holds the per-cell uncertainty
estimate in the same units.

### 2.1 Embedded metadata
Written as GeoTIFF metadata tags, so a surface is self-describing even if
detached from the database:
```
AUXEIN_VARIABLE, AUXEIN_GRANULARITY, AUXEIN_VALID_AT, AUXEIN_RESOLUTION_M,
AUXEIN_MODEL_VERSION, AUXEIN_ENGINE, AUXEIN_N_STATIONS_FIT, AUXEIN_N_STATIONS_TEST,
AUXEIN_N_STATIONS_EXCLUDED, AUXEIN_RELEVANCE_KM,
AUXEIN_RMSE, AUXEIN_CV_RMSE, AUXEIN_T_RMSE, AUXEIN_SMOOTHING, AUXEIN_EDF,
AUXEIN_LAPSE_RATE, AUXEIN_CLIPPED, AUXEIN_CREATED_AT
```

| Tag | Meaning |
|---|---|
| `AUXEIN_ENGINE` | `ridge` (production) or `legacy`. A surface must say which solver produced it — the two are not interchangeable and their maps differ by ~0.44 °C (§3.5). |
| `AUXEIN_N_STATIONS_EXCLUDED` | Stations withheld from the fit by the relevance screen (§4.2). `0` for every regional surface; `1` nationally today. |
| `AUXEIN_RELEVANCE_KM` | The screen's radius, so the station set is reproducible from the raster alone. |
| `AUXEIN_SMOOTHING` | The GCV-selected roughness penalty **λ**, typically 0.3–30. Under v1 this tag held scipy's `smooth`, always ~1e-4. Same name, different quantity. |
| `AUXEIN_EDF` | Effective degrees of freedom the spline spent — ANUSPLIN's *signal*. |
| `AUXEIN_CLIPPED` | Whether predictions were clamped to the observed station range. `false` in production. |

---

## 3. Database index

The rasters live on S3; Postgres holds only the index and the statistics, so one
SQL query locates any surface and reports its accuracy.

### 3.1 `surface_run`
| Column | Type | Notes |
|---|---|---|
| `id` | bigserial PK | |
| `variable` | text | see vocab |
| `granularity` | text | `daily` / `hourly` / `monthly` / `records` |
| `statistic` | text | **null for `daily`/`hourly`**, required for `monthly`/`records` (§1.2) |
| `valid_at` | timestamptz | UTC. Midnight UTC for `daily`; **first instant of the month** for `monthly`; **end of the covered period** for `records` |
| `period_start` | timestamptz | null except for `records`, where it is the first day of the archive. A record surface covers a span, not an instant, and without both bounds "all-time" silently changes meaning every time the archive is extended |
| `resolution_m` | int | |
| `model_version` | text | e.g. `tps-2.0.0` |
| `engine` | text | `ridge` / `legacy` |
| `s3_key` | text | value raster |
| `s3_key_sd` | text | uncertainty raster, nullable |
| `n_stations_fit` | int | |
| `n_stations_test` | int | |
| `n_stations_excluded` | int | withheld by the relevance screen (§4.2) |
| `relevance_km` | double precision | screen radius; null if not screened |
| `smoothing` | double precision | GCV-selected λ — **not** v1's scipy `smooth` |
| `edf` | double precision | effective dof spent; null under `legacy` |
| `edf_frac` | double precision | `edf / n_stations_fit` |
| `clipped` | boolean | predictions clamped to observed range |
| `status` | text | `ok` / `degraded` / `failed` |
| `created_at` | timestamptz | |

Unique on `(variable, granularity, statistic, valid_at, resolution_m, model_version)`.

**`statistic` must be in that key, and it must not be nullable in it.** Postgres
treats NULLs as distinct in a unique index, so a plain nullable column would let
the same daily surface be inserted repeatedly without collision. Use a
partial-unique pair — one index `WHERE statistic IS NULL`, one `WHERE statistic
IS NOT NULL` — or store `''` for per-timestep rows. The migration takes the
partial-index route, because `''` invites a consumer to treat empty string as a
statistic name.

**One monthly month is many rows, not one.** A month of `temp_min` at 500 m is
~14 rows in this table, one per statistic, all sharing `valid_at`, `cv_rmse` and
`n_stations_fit` — they came from a single set of fits. `surface_validation_stats`
therefore hangs off the *fit*, not off each raster: see §3.2.

`model_version` is independent of this contract version and changes whenever the
science changes. The ridge engine ships as `tps-2.0.0`.

**`edf_frac` is the overfitting alarm.** ANUSPLIN's guidance is that signal
should stay below about n/2. In production it runs at a median of 47% (range
17–70%). A surface above ~80% is fitting fine structure it cannot support and
should be treated as suspect even if its `cv_rmse` looks acceptable.

`status='degraded'` means the surface was produced but failed a quality gate
(too few stations, `cv_rmse` above threshold). It is still served — with its
confidence — rather than hidden.

**The gate is on `cv_rmse`, never on `rmse`.** Gating on the fit residual is
self-defeating: the cheapest way to shrink it is to discard stations until the
spline can interpolate whatever remains. The v1 engine did exactly that on 2 of
15 test dates — one dropped 11 real observations and drove its fit residual from
0.913 to 0.002 °C with no out-of-sample improvement at all.

### 3.2 `surface_validation_stats`

**Amended 2026-08-13: keyed on the FIT, not on the raster.** v2 originally hung
this off `surface_run.id`, which only works when one raster comes from one fit.
Monthly surfaces broke that assumption in both directions at once:

- one month of `temp_min` produces **~14 rasters** (one per statistic) from the
  **same** set of fits, so a per-raster FK duplicates identical statistics 14×;
- that month was fitted **~30 times**, once per day, so there is no single
  `cv_rmse` to attach to the raster in the first place — `run_history.py` emits
  13,878 rows per variable, one per fitted day.

So the grain is the fit:

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial PK | |
| `variable` | text | |
| `valid_on` | date | the day that was fitted |
| `resolution_m` | int | |
| `model_version` | text | |
| `n_fit`, `n_test` | int | |
| `cv_rmse` | double precision | the published number (§3.3) |
| `rmse`, `t_rmse`, `snr`, `mae`, `bias`, `r2`, `max_abs_error` | double precision | nullable |
| `edf`, `lam` | double precision | complexity and the GCV-selected λ |

Unique on `(variable, valid_on, resolution_m, model_version)`.

`surface_run` therefore carries its **own** summary of the fits behind the object
it describes — `cv_rmse` (median over the covered days) and `cv_rmse_max` — so
`/point` and `/available` answer from one row without a join, while the per-day
detail stays queryable. For a `daily` surface the median is over one day and the
two agree; for `monthly` they will not, and the maximum is the honest one to
show beside a monthly extreme.

**Do not average `cv_rmse` across days to describe a month.** The median is a
description of a typical day in that month; a monthly `max` statistic was set on
one specific day, and the error that matters for it is that day's.

**Three accuracy numbers, and they are not interchangeable.** Measured on the
1986-2000 golden files (`parity_check.py --all --engine both`):

| Statistic | What it is | Observed range | Publish? |
|---|---|---|---|
| `rmse` | residual over the *fitted* stations | 0.23 - 1.12 °C (median 0.59) | **No.** A genuine smoothed-fit residual now, not v1's ~0.01 °C artefact — but still in-sample. It measures how hard the surface smoothed, not how right it is. Read it beside `edf_frac`. |
| `cv_rmse` | **shuffled** 10-fold CV, λ re-selected inside each fold | **0.91 - 1.33 °C** (median **1.11**) | **Yes — this is the published number.** Always available, genuinely out-of-sample. |
| `t_rmse` | declustered holdout | 0.26 - 2.59 °C, `n_test` 0-13 | Only when `n_test >= 10`. Often 1-4 stations, and **zero** for 1986. It also measures agreement between near-colocated sensors, which is not interpolation skill — treat it as a sanity check, never as the headline. |

`snr` is retained for schema stability but **means nothing**. It is
`mean(y)/rmse`, which is origin-dependent — the same surface expressed in Kelvin
scores ~15× higher. Use `edf_frac` as the model-complexity diagnostic instead.

### 3.3 How `cv_rmse` must be computed (measured, not assumed)
`cv_experiment.py` and `gamma_experiment.py` established three requirements. All
three are load-bearing; skipping any produces a materially wrong published
figure.

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
standard, with a fixed seed for reproducibility. (Those figures were measured
under the v1 engine. What they establish is the *ranking* between fold schemes,
which does not depend on the solver.)

**The smoothing parameter must be re-selected inside every training fold.**
Choosing λ on all the data and then cross-validating at that fixed λ leaks the
held-out fold into the model and understates error. Under v1 scoring was
deliberately decoupled from selection, to keep surfaces bit-identical to the
on-prem model; that constraint is gone, so GCV now runs per fold.

**Clipping must mirror production, and production does not clip.** Under v1 the
clip was load-bearing — its near-singular system produced a 176 °C excursion
unclipped, and measured CV error rose from 1.31 to a mean of 1.87 with a worst
date of 7.29 °C. The ridge engine needs no clip because the roughness penalty
keeps the surface bounded, so scoring must not apply one either.

### 3.4 Confidence is distance-banded, not a single number
Pooled LOOCV error against distance-to-nearest-station (v1 engine in brackets):

| Distance to nearest station | RMSE | Bias |
|---|---|---|
| 0-5 km | **0.88 °C** (v1: 1.10) | +0.12 |
| 5-10 km | **0.84 °C** (v1: 1.02) | +0.08 |
| 10-20 km | **1.02 °C** (v1: 1.20) | -0.13 |
| 20-40 km | **1.15 °C** (v1: 1.41) | +0.01 |
| 40-80 km | **1.38 °C** (v1: 1.76) | -0.00 |
| >80 km | **1.84 °C** (v1: 2.04) | **-0.71** |

Error grows smoothly with isolation, and beyond 80 km a **cold bias** appears
(remote stations are disproportionately high-country). A point 3 km from a
station is roughly twice as trustworthy as one 60 km away, and one global RMSE
would misrepresent both. The ridge engine improves every band, most in the
well-observed ones.

**Therefore `/point` returns `distance_to_nearest_station_km` and a banded
`expected_error`, not just the surface-wide `cv_rmse`.** This is the honest
version of the confidence story and it is the product differentiator.

**Caveat one:** CV measures accuracy at locations where a station exists —
inherently better-supported than an arbitrary remote grid cell. The distance
banding is what keeps that honest.

**Caveat two, and it is not fixable by better maths.** These figures are measured
almost entirely below 500 m, because that is where the stations are. On the
historical network, 6.5% of stations sit above 500 m against 38.7% of grid cells,
and **zero** stations above 1,000 m against 14.5% of cells. **17.3% of the grid
lies above the highest station in the network.** For those cells the only thing
determining the answer is the fixed 0.6 °C/100 m lapse rate — and measured
empirically per day across the same 15 dates, the real lapse rate ranges 0.25 to
0.81 °C/100 m. No cross-validation can see that error, because there is nothing
up there to validate against.

**Do not quote a surface-wide `cv_rmse` for an alpine point.** NIWA hit the same
wall and says so in print (Tait & Woods 2007: interpolated data above 500 m
should be used with caution). Vineyards are low, so this is commercially
survivable — but the published figure must be scoped to the elevation band it
was measured in.

Two consequences that must be respected by consumers:

1. **`cv_rmse` is the honest accuracy.** The fit residual is not the accuracy,
   whichever engine produced it.
2. **The declustering holdout is a fit-stabilisation device first and a test set
   second.** It only yields test stations where redundant near-colocated
   stations happen to exist. It cannot be relied on for coverage.

The modern network (607 active, heading to ~1,000) is 3-4× denser than the
~150-190 station historical network these figures come from, so `cv_rmse` on new
surfaces should be materially better. The distance banding above shows why:
density is the dominant lever, worth more than any change of algorithm. That
improvement must be *measured and shown*, not assumed.

### 3.5 Why v2 surfaces differ from v1 by ~0.44 °C

Anyone comparing a v2 surface against a v1-era one — or against the imported
on-prem archive — will see a difference everywhere. It is not a bug, and it is
worth being able to explain to a customer.

The v1 engine was constrained to **pass through every station exactly**; its
residual at its own stations was 0.021 °C. So every station's departure from its
neighbours was written into the surface as a bump: instrument offset, siting,
observation timing and genuine local microclimate, all of it, indiscriminately.
The ridge engine instead asks how much of each departure is *reproducible* and
keeps only that. Measured:

| | v1 (`legacy`) | v2 (`ridge`) |
|---|---|---|
| RMS distance the surface sits from its own stations | 0.021 °C | **0.587 °C** |
| Spline-field roughness (mean \|cell − neighbour mean\|, terrain removed) | 0.0182 | **0.0077** (2.4× smoother) |
| Mean \|v2 − v1\| over the grid | — | **0.441 °C** |
| Out-of-sample error (`cv_rmse`, median) | 1.324 °C | **1.106 °C** |

The ~0.44 °C is the amplitude of the per-station wiggle v1 was reproducing and v2
is not. The decisive row is the last: **out-of-sample error went down.** Had that
wiggle been real signal, discarding it would have made predictions worse. It made
them better, on 15 of 15 test dates — v1 was fitting structure that does not
recur a few kilometres away.

The difference is broad rather than local: mean |v2 − v1| is 0.43-0.45 °C out to
20 km from a station, 0.50 at 20-40 km, 0.59 beyond 40 km. It is also about **40%
of the surfaces' own out-of-sample error**, so at any single point the two maps
sit within each other's uncertainty. The improvement is real but statistical —
it shows across many points, not at one.

**The honest limit.** Cross-validation cannot distinguish measurement noise from
real microclimate that happens to be observed by only one station. A frost hollow
recorded by a single site and a miscalibrated sensor look identical to it, and
the ridge engine smooths both. For vineyard frost risk that is a genuine loss,
and the remedy is not less smoothing — with one observation the two are not
separable — but more stations, or site-level correction against a local sensor.

---

## 4. Interpolation method (informational — see the plan for detail)

Per variable per timestep:

1. **Screen for relevance**: drop stations further than `relevance_km` from the
   nearest cell of the target grid (§4.2).
2. Lapse-rate detrend to sea level (0.6 °C/100 m).
3. Spatially decluster: near-colocated stations collapse to one for fitting; the
   duplicates become the holdout.
4. Fit a **2D thin-plate smoothing spline in kilometres** about the station
   centroid — bordered system with a linear trend and an `n·λ·I` roughness
   penalty.
5. Choose λ by **minimising GCV**, with a guarded fallback (re-select at γ = 1.2
   if the first choice spends more than 80% of the available degrees of freedom,
   which catches GCV's known flat-criterion under-smoothing).
6. Evaluate on the target grid. **No range clip.**
7. Lapse retrend to each grid cell's elevation.

This is the same family of method NIWA uses for VCSN (ANUSPLIN thin-plate
smoothing spline, GCV-selected penalty, metric coordinates), with one deliberate
difference: elevation is handled by detrend/retrend rather than as a third spline
covariate. That was tested — a naive trivariate fit was worse on all 15 dates
(1.47 vs 1.27 °C) because scipy's fixed kernel is not the right basis in 3D.

The `legacy` engine (scipy `Rbf` on degrees, CV-selected `smooth`, clipped)
remains in the codebase and is bit-faithful to the on-prem model to 2e-9 °C. It
is the regression target for the port, **not a production option**, and must not
be used to generate a surface written under `surfaces/v2/`.

### 4.1 Rainfall

Rainfall never uses a lapse rate, and its accuracy story is separate from
temperature's. It is fitted by `scripts/interpolation/precip.py` on the **square
root** of daily depth, squared back with a non-negativity clamp — daily rainfall
is heavily right-skewed and a spline on raw depth predicts negative rain in the
gaps. Measured over 534 stations and 60 days by 10-fold cross-validation by
station, that is 7% better than a spline on raw depth and drops the false-wet
rate from 6.8% to 3.8%.

| Statistic | Auxein | VCSN (Tait et al. 2012) |
|---|---|---|
| MAE, all days | 2.05 mm | 2.6 mm |
| MAE, wet-wet days | 7.20 mm | 6.9 mm |
| MAE, below 500 m | 1.64 mm | 2–4 mm |
| MAE, above 500 m | 3.24 mm | 5–15 mm |
| MAE, heavy rain (≥40 mm) | **27.9 mm, bias −16.5** | 8–12 / 10–40 mm |

**Those columns are not like-for-like and must not be published as a
comparison.** Tait validated against 718 fully independent gauges never input to
VCSN; ours is cross-validation within our own denser network, which is an easier
test. The favourable rows largely measure station density.

**The heavy-rain row is the real limitation.** We under-predict extremes by an
average 16.5 mm, which is the standard behaviour of a smoothing spline and is
worst on exactly the days a customer looks up. Any consumer presenting rainfall
for a storm event must carry that caveat.

**Orography is still unsolved.** Rainfall has no covariate. NIWA's method —
Tait et al. (2006) — fits the daily spline against a mean-annual-rainfall
climatology, and we measured that it would be worth 21–26% here *given a good
climatology*. Ours, derived from only 2020-onward record, is not good enough:
its median error is 14.4% and its 90th percentile 43.9%, and past ~40% error the
ratio method is worse than no covariate at all. See
`docs/plans/INTERPOLATION_BENCHMARK_2026-08-04.md` §P1. Until a real climatology
is sourced, rainfall surfaces carry no orographic correction and the confidence
figures above are what they are.

### 4.2 Which stations enter a fit (the relevance screen)

A thin-plate spline has no notion of "too far away to matter". Every station
enters the bordered system, and the linear trend term is fitted globally, so a
station on the far side of an ocean still helps set the trend over the area
actually being mapped. Something has to decide the station set, and leaving it
implicit means it gets decided by accident.

**The rule.** Before fitting, drop stations further than `relevance_km` from the
nearest cell of the target grid. Default **800 km**
(`tps.screen_relevance`). Excluded stations are recorded, never silently
dropped: `n_stations_excluded` on `surface_run`, `AUXEIN_N_STATIONS_EXCLUDED` on
the raster, and a logged warning naming each one.

**Distance is to the grid, not to other stations.** Station-to-station distance
is circular — it defines relevance by the clustering being screened. A bounding
box is worse: measured, Raoul Island is ~605 km from the NZ mainland box while
Campbell Island is ~560 km, so a rectangle *reverses* the ranking, having no idea
which corner of itself is land.

Against the 5 km national grid:

| | distance to nearest grid cell | |
|---|---|---|
| Auckland Islands | 367 km | keep |
| Campbell Island | 598 km | keep |
| Chatham Islands | 682 km | keep |
| **Raoul Island** | **983 km** | **drop** |

**This screen removes exactly one station today**, and it is deliberately not
tuned finer than that. Thresholds anywhere in 700–950 km select the identical
set; the stable band is 598–983 km, so 600 would be knife-edge — Campbell
survives it by 2 km. The constant is calibrated against **three** offshore
stations, which is a small sample, and must be re-measured if the network gains
stations in that band.

**Do not raise the radius to "include more data", and do not lower it to exclude
islands as a class.** Both were measured
(`INTERPOLATION_BENCHMARK_2026-08-04.md` §3.12, 26,644 held-out station-days).
Dropping Campbell and the Auckland Islands costs **9.5% MAE in the southern
band**: they are the only stations south of the mainland, and they turn the
southern coast from an extrapolation edge into interpolation interior. Keeping
Raoul costs a measurable but negligible amount. The rule exists to make that
distinction explicit and reproducible, not to prune aggressively.

Expect the southern-island benefit to shrink as Otago and Southland are seeded —
that edge moves offshore. It will look like the islands stopped mattering. Keep
them.

**Coordinates.** Fitting is in kilometres via a local equirectangular projection
about the station centroid, with longitude differences wrapped into (−180, 180].
The wrap is not cosmetic: New Zealand's network straddles the antimeridian, and
unwrapped, a station reporting 177.93 °W projected to −29,371 km — 30,000 km west
of the country instead of 756 km east. Such a station is not corrupted but
**erased**, since at that range its contribution is constant-plus-linear across
the domain and the spline's own polynomial term absorbs it. The Chathams are the
case that matters: genuinely informative for eastern surfaces, and silently
discarded without it. Any reimplementation of this contract must wrap.

---

## 5. API contract

All routes are under `/api/v1/surfaces`. Free vs paid gating is applied at the
route layer; the shapes below do not change between tiers.

**The route stays at `/api/v1/` and does not track this contract version** — see
§7. The `v1` there is the platform API version, shared with `/api/v1/climate`
and every other backend route.

**The response shapes are byte-identical to v1** — only the numbers moved. Any
stub built against v1 §5 satisfies v2 §5 unchanged, URLs included.

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
            "cv_rmse": 1.11,                          // surface-wide, shuffled 10-fold
            "expected_error": 0.88,                   // banded by isolation (§3.4)
            "distance_to_nearest_station_km": 4.2,
            "t_rmse": 0.38, "n_test": 12
          } }
      ]
    }
  ],
  "meta": { "contract_version": "v2", "model_version": "tps-2.0.0",
            "cells_missing": 0 }
}
```
`meta.contract_version` is the **only** place a response declares which contract
it satisfies — the route no longer carries it (§7). It is the one field added to
§5 relative to v1, and it is additive, so a v1-era stub stays valid.

`value` is `null` (never 0) where the cell is NoData or no surface exists.
**Every point carries its own `resolution_m` and confidence** — a series may
legitimately span the 5 km historical era and the 1 km modern era.

### 5.2 Region / zonal statistics
```
GET /api/v1/surfaces/region?zone_id=5&variables=temp_mean&start=…&end=…
    &weighting=blocks        # blocks (default for wine zones) | area
```
Returns the same envelope with `mean` / `min` / `max` / `area_km2` per timestep.
A region value and a point value inside it come from the same raster and are
therefore consistent by construction.

**Amended 2026-08-13 — `weighting` is required to interpret the numbers, and the
default changed.** v2 specified a single behaviour, "area-weighted over the zone
polygon". That is the wrong answer for a wine climate zone: a zone that is 80%
unplantable hill country and 20% vineyard gets a mean describing land nobody
farms.

| `weighting` | What is aggregated | `min` / `max` mean |
|---|---|---|
| `blocks` | only raster cells intersecting a registered block inside the zone | **across blocks** — "the coolest vineyard in this zone" |
| `area` | every cell inside the zone polygon, area-weighted | **across cells** — "the coldest cell, including the ridge nobody plants on" |

`weighting` is **echoed in the response**, and consumers must read it. The two
modes reuse the same `mean`/`min`/`max` fields, so without it the identical JSON
means two materially different things depending on which code path filled it.

`blocks` is the default for wine zones and is what backs climate histories and
current-season metrics. **Projections are exempt** — they keep coming from the
existing DB path, which already produced them this way, so there is nothing to
re-derive.

`blocks` degrades to `area` where a zone contains no registered blocks, and says
so via `weighting: "area"` in the response rather than returning nothing.

### 5.3 Surface discovery
```
GET /api/v1/surfaces/available?variable=temp_mean&granularity=daily
→ { "variable": "...", "first": "1986-01-01", "last": "2026-08-01",
    "resolutions": [5000, 1000, 500], "gaps": ["2024-01-01/2024-03-14"] }
```
Drives the frontend time-scrubber bounds. **`gaps` is authoritative** — the
scrubber must grey out missing dates rather than requesting and rendering holes.

**Amended 2026-08-13 — gap endpoints are EXCLUSIVE.** `"A/B"` means every
timestep strictly between A and B is missing; **A and B themselves have
surfaces.** Gaps are emitted by walking consecutive available timesteps, so the
bounds are by construction dates that exist.

This was undefined in v2 and it is silently wrong in both directions: an
inclusive reader greys out two perfectly good dates per gap, and a producer that
later emits inclusive intervals makes the scrubber request holes it was told to
avoid. Neither shows up as an error — one hides data, the other renders a blank
map. `packages/insights/src/services/surfaceService.js` implements the exclusive
reading.

A single missing timestep is still expressed as an interval spanning it, never
as a bare date.

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

**Three version numbers, deliberately independent.** v1 coupled the first two;
v2 decouples them.

| Version | Where it lives | What it tracks | Current |
|---|---|---|---|
| Contract | S3 prefix `surfaces/{v}/`, `meta.contract_version` | This document — storage layout, COG spec, DB schema, API shapes | `v2` |
| Platform API | route `/api/v1/…` | The backend's public API, shared with `/api/v1/climate` and every other route | `v1` |
| Model | `model_version` on each surface | The science — engine, smoothing, covariates | `tps-2.0.0` |

Breaking changes to this document mint `v3` in the **S3 prefix and
`meta.contract_version` only**. The route does not move, and both prefixes serve
during migration.

**Why the route is not versioned with the contract.** v1's §7 tied the two
together, which would have put surfaces at `/api/v2/surfaces` alongside
`/api/v1/climate` — a permanent oddity for a contract change no frontend can
even observe, since §5's shapes did not move. The route version belongs to the
platform API and moves when the platform API breaks. This contract's version
belongs in the storage layout and the payload.

The consequence: **a URL no longer tells you which contract a response conforms
to.** `meta.contract_version` carries that instead, and consumers that care must
read it there.

`model_version` stays independent of both — it changes whenever the science
changes, and lets us re-run a period and compare without touching the contract.

---

## 8. What changed from v1, and why it needed a bump

The interpolation engine changed from scipy `Rbf` to a ridge-penalised
thin-plate spline with GCV-selected smoothing
(`docs/plans/INTERPOLATION_BENCHMARK_2026-08-04.md`).

| | v1 | v2 |
|---|---|---|
| Solver | scipy `Rbf` on lon/lat degrees | thin-plate spline in km, `n·λ·I` ridge |
| Smoothing | scipy `smooth`, 5-fold CV MSE | roughness penalty λ, GCV + guarded fallback |
| Range clip | applied, and load-bearing | **not applied** |
| Escalation ladder | fired, deleting stations | disabled |
| `smoothing` field | scipy `smooth`, ~1e-4 | λ, typically 0.3–30 |
| `rmse` field | ~0.01 °C, meaningless | 0.23–1.12 °C, a real fit residual |
| `cv_rmse` (published) | median 1.32 °C | **median 1.11 °C** (−13.8%, better on 15/15 dates) |
| New fields | — | `engine`, `edf`, `edf_frac`, `clipped` |

**Why this is a bump and not a revision.** `smoothing` keeps its name but changes
both its meaning and its numeric scale by four orders of magnitude, and `rmse`
changes from an artefact to a real statistic. §Rule at the top of v1 says renames
and semantic changes force a version bump; these are semantic changes to
published fields, so v2 it is — even though the migration cost happens to be zero
because no v1 surface was ever generated and no v1 route was ever implemented.

Adding `engine`, `edf`, `edf_frac` and `clipped` would have been permissible
as additive fields under v1. The `smoothing` and `rmse` redefinitions are what
forced the bump.

**The route did not move.** v1's §7 tied the route version to the contract
version; v2 decouples them (§7). Surfaces are served from `/api/v1/surfaces`,
matching the rest of the backend, and `meta.contract_version` tells a consumer
which contract it is getting. That is the one behavioural difference between what
v1 specified and what v2 specifies at the API layer — and it means §5 needed no
URL changes at all.

**Migration.** There is nothing to migrate. `surfaces/v1/` is empty and stays
empty, and `/api/v1/surfaces` was never implemented — it is now the route to
implement, serving v2-contract surfaces. Anything that hardcodes a `smoothing`
range or treats `rmse` as ~0 needs checking, but no such consumer is known to
exist.

### 8.1 Amendment 2026-08-05 — relevance screen (additive, no bump)

Added: `n_stations_excluded` and `relevance_km` on `surface_run` (§3.1), the
matching `AUXEIN_N_STATIONS_EXCLUDED` / `AUXEIN_RELEVANCE_KM` raster tags
(§2.1), a station-screening step in the method (§4 step 1) and §4.2 describing
it, including the antimeridian wrap the projection now applies.

**This does not mint v3.** Every schema change is an added field, and the rule at
the top of this document permits those explicitly; no existing field changes name
or meaning, and **§5 is untouched**, so stubs already built against v2 remain
correct without modification. The behavioural change — one station excluded from
national fits — moves published `cv_rmse` by under 0.1%, which is inside the
noise of the figures in §3.2 and does not invalidate them.

Contrast with what forced the v2 bump: there, `smoothing` and `rmse` kept their
names and changed their meanings. That is the distinction the rule is drawing,
and it is worth preserving — this amendment is the example of the permissible
side of it.

### 8.2 Amendment 2026-08-13 — aggregated surfaces, zonal weighting, gap semantics

Cleared the blockers that stood between the completed 1986-2023 recompute and
publishing it. Four changes, in descending order of how badly getting them wrong
would have hurt:

**1. `granularity` gained `monthly` and `records`, and the key layout gained a
`statistic` dimension** (§1.1, §1.2). Without this the entire history — three
variables × 4,564 rasters each, already on disk — had nowhere legal to live.
The statistic vocabulary is written out in full because the daily surfaces the
aggregates came from **are never written**, so anything omitted from that list
is unrecoverable without a full re-run.

**2. `/region` gained `weighting`, and its default changed** (§5.2). A wine zone
statistic is now block-intersected, carrying the range across blocks. The old
text said area-weighted over the polygon, which describes land nobody farms.
This one is a genuine semantic change to an existing field's meaning, not an
addition — see the bump question below.

**3. Gap intervals are exclusive at both endpoints** (§5.3). Previously
undefined, and wrong in either direction without ever raising an error.

**4. `surface_validation_stats` is keyed on the fit, not the raster** (§3.2),
because a monthly month is ~14 rasters from ~30 fits — a per-raster FK is wrong
at both ends. `surface_run` gained `statistic`, `period_start` and a
`cv_rmse_max` summary.

Also corrected: §1.3 said the 1986-2024 era was a 5 km on-prem import. It is a
500 m recompute on a denser network, it is monthly rather than daily, and its
accuracy varies by variable enough to matter (`temp_min` median `cv_rmse` 1.83
against `temp_mean`'s 1.15).

**Does this mint v3?** Judgement call, and the answer is **no** — but only just,
and the reasoning should be on the record because change 2 sits on the wrong side
of the usual line.

`/region` is **not yet implemented** in any form beyond the stub, and the stub
has never served a `blocks`-weighted or an `area`-weighted number to a consumer.
So no deployed client has ever read the field whose meaning changed, and there is
nothing in the field to break. The v2 bump precedent — `smoothing` and `rmse`
keeping their names while changing meaning — was forced because those fields were
already being read and had already been published. This is the same shape of
change caught before it acquired consumers.

Everything else here is additive: new vocabulary values, new nullable columns, a
new optional query parameter, and one previously-undefined behaviour now defined.
`meta.contract_version` stays `v2`, the S3 prefix stays `surfaces/v2/`, and stubs
built against v2 §5 remain correct.

**If `/region` ships a value before this amendment is implemented, that
reasoning expires** and the weighting change has to mint v3 properly.
