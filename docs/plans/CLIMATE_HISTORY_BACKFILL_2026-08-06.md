# Climate history backfill — local run, monthly publication, per-cell records

**Date:** 2026-08-06
**Status:** plan, not yet built
**Depends on:** `fastgrid.py` / `raster.py` (built + verified 2026-08-06),
`SURFACE_CONTRACT_V2.md` (needs three amendments — §7 below)

Two pipelines, deliberately separate:

| | **A. History** | **B. Operational** |
|---|---|---|
| Era | 1986-01-01 → 2023-12-31 | 2020 → present, then forward |
| Source | CSVs on `Z:\Data` (CLIFLO) | Postgres `weather_data_daily` |
| Cadence | one-off local run | rolling daily; forward-only hourly |
| Published | **monthly** statistics + records | daily (and hourly, forward-only) |

They overlap on 2020-2023. That is not a problem to eliminate — it is the
measurement window for the era step-change the platform plan already commits to
publishing (§6).

---

## 1. What is actually on disk

```
Z:\Data\REGEN SPLINE V1.4\INPUT DATA\
    TEMP_DAILY_Tmean(C)_SPLINE_INPUTS\      13,879 files   1986-01-01..2023-12-31
    TEMP_DAILY_Tmin(C)_SPLINE_INPUTS\       ~13,879
    TEMP_DAILY_Tmax(C)_SPLINE_INPUTS\       ~13,879
    PRECIPITATION_DAILY_Amount(mm)_SPLINE_INPUTS\  13,878
    GLOBAL_RAD_DAILY_SPLINE_INPUTS\         13,879
Z:\Data\Climate_Station_Data\New_Zealand\STATION_INFORMATION_CLIFLO\
Z:\Data\VCDN_500m\VCDN_500m.csv
Z:\Data\REGEN SPLINE V1.4\OUTPUT DATA\...\{GRIDDED,STATION,TESTING}_OUTPUTS\
```

Each input is `Station,<measure>` for one date — byte-identical in shape to the
15-date fixture the port was verified against, so no new reader is needed.

**5 variables × 13,879 dates = 69,395 daily surfaces.**

`Z:` is a slow network drive. Enumerating one directory of 13,879 files took
minutes. This is a first-order constraint, and §3 Phase 0 addresses it.

---

## 2. The one decision that cannot be reversed later

> **Anything you cannot recompute from the monthly product must be accumulated
> during the run, while the daily surfaces exist.**

Once dailies are discarded, these are recoverable from monthly stats:

- all-time max/min per cell (max of monthly maxima)
- monthly and annual means, ranges, anomalies
- "wettest month on record", "warmest winter"

These are **not**, and are gone forever unless accumulated in the same pass:

- **the date a record was set** — needs the argmax day carried through
- **threshold-day counts** — frost days, days >25/30 °C, rain days >1/10/25 mm.
  A monthly mean/min/max cannot reconstruct how many days crossed a line.
- **daily percentiles** — the 95th percentile of daily rainfall is not a
  function of monthly summaries
- **spell lengths** — consecutive dry days, heatwave runs
- **"is today the hottest 6 August on record"** — needs day-of-year climatology

So the monthly product must be richer than mean/median/min/max. The extra bands
cost almost nothing to compute (they are running accumulators) and re-running to
add one later costs a full pass.

### Recommended per-cell, per-month band set

| Band | temp_* | rainfall | rad | Why |
|---|---|---|---|---|
| `mean` | ✓ | ✓ | ✓ | the headline |
| `min` / `max` | ✓ | ✓ | ✓ | extremes |
| `argmin_day` / `argmax_day` | ✓ | ✓ | ✓ | **record dates survive** |
| `median` | ✓ | ✓ | ✓ | requested |
| `sd` | ✓ | ✓ | ✓ | anomaly z-scores, ConfidenceBadge |
| `sum` | — | ✓ | ✓ | rainfall total is the number people want, not the mean |
| `n_valid` | ✓ | ✓ | ✓ | honesty: how many days actually contributed |
| `count_lt_0` | ✓ | — | — | frost days |
| `count_gt_25`, `count_gt_30` | ✓ | — | — | hot days |
| `count_gt_1`, `count_gt_10`, `count_gt_25mm` | — | ✓ | — | rain days |
| `max_dry_spell` | — | ✓ | — | consecutive days < 1 mm |

Median needs a month of values in memory at once — 31 × 1.44 M × 4 B = 178 MB.
Trivial. Everything else is a running accumulator.

**Exact daily percentiles are deferred**, not accumulated: they need either a
t-digest per cell (1.44 M digests) or a second pass. Threshold counts answer the
same user questions more directly. Revisit only if a real requirement appears.

---

## 3. Process — Pipeline A (history)

### Phase 0 — Stage inputs locally
The engine is now fast enough that reading 69,395 small files off a slow network
drive would dominate the run. Copy once, in bulk, then never touch `Z:` again:

```
robocopy "Z:\Data\REGEN SPLINE V1.4\INPUT DATA" A:\climate_inputs /E /MT:16
```
~28 MB per variable (13,879 × ~2 KB), so ~150 MB total.

Then **consolidate each variable into one Parquet** — `(station_id, date, value)`,
~2.5 M rows per variable. The run then opens one file instead of 13,879.
New script: `backend/scripts/interpolation/consolidate_history.py`.

### Phase 1 — Station catalogue and per-variable basis
1. Parse `STATION_INFORMATION_CLIFLO` into one table
   `(station_id, latitude, longitude, elevation)`.
   **The repo's `CLIFLO_RAW_Temp_Daily.csv` is the temperature network only.**
   Precipitation has a substantially larger gauge network, so the union station
   count — and therefore basis size — differs per variable.
2. Apply `tps.screen_relevance()` (800 km) against the 500 m grid.
3. Build one `GridBasis` **per variable**, since the union differs.

   Basis size is `n_cells × (n_union + 3) × itemsize`:

   | union stations | float64 | float32 |
   |---|---|---|
   | 300 (temp) | 3.4 GB | 1.7 GB |
   | 600 | 6.9 GB | 3.5 GB |
   | 1,000 (precip?) | **11.5 GB — will not fit** | 5.8 GB |

   On 16 GB, **temperature runs in float64; precipitation may have to run in
   float32** (validated to 0.016 °C, well inside its own error). `fastgrid.estimate_bytes`
   decides this at runtime rather than by guess. `GridBasis.save()` +
   `mmap_mode="r"` lets parallel workers share one copy.

### Phase 2 — The run: stream dailies, never write them
For each variable, for each calendar month:

1. Fit every day in the month (`tps.fit_surface(..., origin=basis_origin)`) —
   107 ms each, measured.
2. Stack the coefficient vectors and project the whole month in one GEMM —
   ~2.8 ms per surface at batch size ≥128.
3. Reduce the (n_cells × n_days) block into the band set from §2.
4. Write the monthly COGs. Discard the dailies.

**Do not materialise daily COGs.** That single choice is the difference between:

| | per surface | 69,395 surfaces |
|---|---|---|
| fit + project only | 110 ms | **2.1 h** single-core |
| + write a daily COG | 570 ms | 11.0 h single-core, **+142 GB** |

Re-running to recover dailies later costs 2.1 h, which is cheaper than storing
them. What *is* retained is the per-date **station-level** output the on-prem
pipeline also produced (`STATION_OUTPUTS`) — kilobytes, and it is what
validation needs.

Peak RAM: basis (1.7-5.8 GB) + one month block (178 MB) + overhead. Fits.

Parallelism: fits are independent per date; the GEMM is already multi-threaded.
Run one process per variable with `OMP_NUM_THREADS` capped, or one process with
threaded BLAS. On 6 cores expect **well under an hour wall for all five
variables**, dominated by the monthly COG writes.

### Phase 3 — Records and climatology layers
A second, cheap pass over the 456 monthly products per variable (not over
dailies), producing one multi-band COG per variable:

- all-time daily max / min, and the **date** of each (from `argmax_day` + month)
- per-calendar-month climatological mean, sd, min, max across 38 years (12 × 4)
- 1991-2020 normals (the standard WMO period) as a distinct band set
- annual mean/total per year — small enough to be a 38-band layer

This is what answers "hottest day on record", "wettest August", "is today
unusual" as **one windowed read at one cell** — the same access pattern
`/point` already uses.

### Phase 4 — Publish
Upload monthly + records to `s3://auxein-climate-surfaces` under the amended key
layout (§7), and insert one `surface_run` row per product for the catalog.

Estimated S3 footprint for the whole history: **~30 GB** (monthly stat surfaces
compress better than dailies — they are smoother), plus ~0.5 GB of records
layers. About $0.70/month.

---

## 4. Where the stats should live — COGs, not Postgres

You asked whether per-grid-point stats go locally or in the DB. **Keep them as
COGs on the same grid**, for three reasons:

1. **Scale.** 1.44 M cells × 5 variables × ~60 statistics is 432 M values. As
   rows that is unusable; as a wide table it is ~1 GB of `float4` columns and
   still awkward to query spatially.
2. **No second source of truth.** D13 makes surfaces authoritative. A stats
   table is a copy that can drift from the rasters it was derived from.
3. **Same access path.** `/point` already opens a COG and samples one cell. A
   records lookup is the identical operation against a different key — no new
   query layer, no new cache, no migration.

Postgres keeps only the **catalog** (`surface_run`, `surface_validation_stats`)
— which surfaces exist, when they were generated, with what model version and
what cv_rmse. That is what it is good at.

---

## 5. Pipeline B — operational, 2020 → present

Distinct from the history run and should not be conflated with it.

- **Rolling daily.** Same engine, station values from `weather_data_daily`
  instead of CSVs. The active network is ~800 stations against the historical
  ~180, so the basis is larger (float32, ~5 GB) and must be **rebuilt whenever
  the station set changes** — new councils are still being seeded. Rebuild
  weekly, or on a station-catalogue version bump, not per day.
- **Where it runs.** Not in the API process. A 5 GB basis and a GEMM do not
  belong in a gunicorn worker. Run it on the workstation on a schedule, or on a
  small scheduled EC2, and publish to S3. The API only ever *reads* COGs.
- **Forward-only hourly.** Per assumption A1, 30-minute raw only exists from
  ~2025-08-31, so hourly starts there and is never backfillable. 24× the daily
  volume — decide retention before switching it on.

---

## 6. Honesty items that must not be skipped

1. **500 m is real for temperature and cosmetic for rainfall.** The lapse
   retrend uses a 500 m DEM, so temperature genuinely carries 500 m elevation
   structure. Rainfall is fitted with `lapse_rate=0` and no orographic
   correction (the climatology-ratio method was measured and rejected), so a
   500 m rainfall surface is a *resample* of information whose real resolution
   is station spacing — tens of km. Store it at 500 m for grid consistency if
   you like, but the ConfidenceBadge must not imply 500 m rainfall accuracy.
2. **The 2020-2023 overlap is the era-comparison window.** Both pipelines cover
   it. Compute the offset between CLIFLO-derived and DB-derived surfaces over
   those four years and publish it, rather than picking a cutover date and
   hoping nobody notices the seam.
3. **Heavy rain is under-predicted** — 27.9 mm MAE, −16.5 mm bias. Any "wettest
   day on record" feature is built on precisely the days the model is weakest.
   Disclose it there specifically.
4. **`n_valid` per month is a published band, not a diagnostic.** The 1986
   network is ~150 stations; a month with sparse reporting should look sparse.

---

## 7. Contract amendments required

`SURFACE_CONTRACT_V2.md` is frozen and this plan does not fit it. Three changes,
all additive, so **no v3 bump** is needed:

1. **§1.2 `granularity`** currently allows only `daily`, `hourly`. Add
   `monthly`.
2. **§1.1 key layout** has no statistic dimension. Proposed:
   ```
   surfaces/v2/{variable}/monthly/{YYYY}/
       {variable}_monthly_{YYYYMM}_{res}m_{stat}.tif
   surfaces/v2/{variable}/records/
       {variable}_records_{res}m.tif          # multi-band
   ```
   Separate objects per statistic rather than one multi-band monthly file, so
   each remains an ordinary single-band surface the existing tiler and `/point`
   handle with no special-casing.
3. **§1.3 era table** says 1986-2024 is `5000` m imported from the on-prem
   archive. This plan replaces that with a 500 m recompute under
   `model_version = tps-2.0.0-ridge`. The row must be corrected, and the
   `surfaces/v2/.../5000m` keys it implies will never exist.

API additions (shapes unchanged, so any stub built against §5 still holds):
`granularity=monthly` on `/point`, `/region`, `/available`, plus a `stat`
parameter defaulting to `mean`.

---

## 8. Validation before publishing anything

1. `parity_check.py --all` — unchanged, guards the port.
2. `fastgrid_check.py --grid 500m` — guards the fast path.
3. **Against the on-prem outputs already on `Z:`.** `GRIDDED_OUTPUTS` and
   `TESTING_OUTPUTS` hold the original 5 km grids and cross-validation summaries
   for all 13,879 dates. Compare the new ridge surfaces against them on a
   sample: not for parity (different engine, expected to differ by 0.3-0.7 °C)
   but to confirm the divergence is the *known* one and there is no new bias.
   The on-prem `Mean_MSE` column is the honest out-of-sample number — compare
   `sqrt(Mean_MSE)` against our `cv_rmse` across the sample.
4. Spot-check a month's reconstruction: monthly `mean` recomputed from a
   re-run of that month's dailies must match the published band bit-for-bit.

---

## 9. Open decisions

1. **Which variables?** Five are available. Global radiation is on disk and
   free to include; the platform plan lists solar as a station-point layer, not
   a surface. Include it or not?
2. **Rainfall resolution** — 500 m for grid consistency, or 5 km honesty
   (25× cheaper, and no information is lost)?
3. **Keep daily surfaces?** Default recommendation is no (saves 142 GB and 9 h;
   re-running costs 2.1 h). Say if you want them retained.
4. **1991-2020 normals** as a published product? It is the WMO standard period,
   it falls entirely inside the history run, and it is the climatology whose
   absence currently blocks the precipitation ratio method — computing it here
   may unblock that separately.
5. **Tmin/Tmax lapse rate.** The 0.6 °C/100 m constant is a `Tmean` value.
   Tmin under inversion conditions does not follow it, and the on-prem model
   applied the same constant to all three. Keep for consistency, or measure?
