# Two answers: regional Bacchus, and how non-interpolated variables reach an export

Date: 2026-09-16 · Verified against the code, not estimated.
Corrects `derived_data_scope.md` §I, which sized regional Bacchus at **M**. It is **S**.

---

## Q1. Can we add Bacchus to regional disease pressure, backfilled to 1 Sept?

**Yes, and it is a day or two, not a week.** The model is already sitting in the
zone script.

### What already exists

`BacchusModel` is **defined inside `backend/scripts/disease_service_v2.py`** —
the zone disease service — and **never called there**.
`scripts/populate_site_disease.py` imports it *from* that file and runs it for
sites. The zone path has been carrying the implementation all along and simply
never invoking it.

The model is spatially agnostic by construction:

```python
BacchusModel.calculate(hourly_data, previous_index=0.0, previous_dry_run=0)
# hourly_data: list of dicts with 'temp' and 'is_wet'
```

And `climate_zone_hourly` already holds every input it needs: `temp_mean`,
`rh_mean`, `precipitation`, `is_wet_hour`, `wetness_probability`,
`hours_since_rain`. Nothing new has to be computed or ingested.

This is exactly the design intent stated in the site script: *"Only the SPATIAL
SOURCE differs between a zone and a point."* Zone Bacchus is that sentence
applied in the direction it has not been applied yet.

### The work

1. **Migration** — five columns on `disease_pressure`, mirroring
   `bacchus_botrytis_index.py`: `bacchus_index`, `bacchus_peak`,
   `bacchus_infection`, `bacchus_wet_hours`, `bacchus_dry_run`.
   **`NUMERIC(7,4)`, not `(5,2)`** — the index sums terms of order 0.01–0.07
   against a threshold of exactly 1.0, and two decimal places would lose a fifth
   of a wet hour per hour until the rounding error decided infections. Nullable,
   no server default: a day scored before the model existed did not run it,
   which is not a claim of zero.
   *Watch the 32-character Alembic slug limit — it silently rolls back DDL.*

2. **Carry-in** — the zone script's existing previous-state query already
   date-bounds itself and fetches pm / botrytis / goidanich. Add
   `bacchus_index` and `bacchus_dry_run` to it, **plus the contiguity check**:

   ```python
   contiguous = previous_row.date == day - timedelta(days=1)
   ```

   **Bacchus does not carry across a gap.** Its state is a live wet period, and
   an unscored day is not four dry hours — it is no information. Without this,
   a wet Tuesday and a wet Friday add up to an infection that never happened.
   The other three models are seasonal accumulators with a decay and are
   unharmed by a gap; only this one resets. The site path already does this and
   the zone path must match it.

3. **Call it** in the zone loop, next to the other three.

4. **Upsert** — add the five columns. **And while in there, add
   `created_at = now()` to the `DO UPDATE SET`.** It is currently missing, so a
   re-scored zone-day silently keeps its original timestamp — the change-feed
   gap from `derived_data_scope.md` §F. Two birds, one migration.

5. **Backfill** from 1 September.

### Three constraints on the backfill

**(a) Strictly in date order, per zone.** Bacchus carries `index` and `dry_run`
from one day to the next. A parallelised or out-of-order backfill produces
plausible wrong numbers with nothing on the surface to show it.

**(b) The `date < :day` bound is load-bearing.** Both cumulative models are
`cumulative = prev * decay + today * weight`. Without the bound a recompute
reads the newest row — which on a replay is the day being recomputed — and feeds
a day's own state back into itself. The decay becomes a ratchet. This is the
bug that corrupted **45% of the 2026 zone disease vintage**, and it stayed
invisible because only the accumulator moved. The query must be copied with its
bound intact.

**(c) Hourly coverage is the real limit, not compute.** 1 Sept 2026 → today is
about sixteen days × N zones of `climate_zone_hourly` — trivially cheap, and the
network is dense through that window. Going back further is a different
question: the site record deliberately starts 15 August 2026, eleven days after
the hourly rain-gauge network stepped from ~140 to ~620 stations.

Also expect **zones with no answer**. Zone disease depends on hygrometers
assigned to that zone; some zones rest on a single one. A zone with no humidity
produces `NULL`, not a low score — a quiet zero here would read as "no botrytis
risk" when it means "we could not see".

### One thing to document, not fix

**Zone Bacchus and site Bacchus will disagree**, and should. The zone averages
the stations assigned to it; the point runs IDW with measured refusal distances
against the same model. Same model, different spatial source. That belongs in
`/meta/models` as a stated property, not as a discrepancy to be reconciled.

**Size: S — 1–2 days including backfill and verification.**

---

## Q2. We interpolate temp and precip. How do the other variables reach an export?

**They reach it by a different route, and the export has to say which route.**
There are three provenance classes, and the honest answer is to carry the class
on every variable rather than flatten them into a single number that looks
uniformly authoritative.

### Class 1 — Fitted surface (raster)

**`temp_min`, `temp_max`, `temp_mean`, `rainfall`.** Ridge/spline fit on a 500 m
grid, lapse-reduced, with cross-validated error. The zone rollup states it
plainly: *"The surface carries four variables."* Season-level `gdd0` / `gdd10`
surfaces are derived from these.

Carries: `cv_rmse` + **`cv_units`** (rainfall is fitted in ratio space, so its
error is dimensionless and must never be rendered as millimetres),
`model_version`, `grid_key`, `resolution_m`.

### Class 2 — Station aggregation (no surface exists)

**`rh`, `dewpoint`, `wind`, `solar_radiation`, and everything hourly.** These
are not interpolated by the surface engine at all. They reach a consumer by two
different mechanisms depending on grain:

**At a zone** — `hourly_aggregation.py` averages the stations assigned to that
zone into `climate_zone_hourly`. At daily grain, `climate_zone_daily`'s
`humidity_mean` and `solar_radiation` come **only** from the station rollup, and
the surface upsert deliberately omits them from both its column lists so it
cannot blank the only copy that exists.

**At a point** — `services/point_climate.py` synthesises an hourly series from
nearby stations by IDW (power 2, up to 12 neighbours). Two properties of that
service belong in any spec, because they are the difference between an estimate
and a guess:

- **Temperature is lapse-reduced, interpolated, then restored at the site's own
  elevation** (0.6 °C/100 m, imported from the interpolation engine so a point
  and a surface cannot disagree about what elevation does).
- **Humidity travels as dewpoint, never as relative humidity.** Dewpoint is
  approximately conserved as an air mass moves; RH is a ratio against a
  saturation pressure that depends on temperature, so interpolating RH between a
  valley station and a hillside site imports the valley's temperature through
  the back door. Each station's (T, RH) becomes a dewpoint, dewpoints are
  interpolated, and RH is reconstructed from the site's *own* temperature.

**And it refuses beyond a measured distance**, rather than returning a weak
number:

| Variable | Cap | Why |
|---|---|---|
| Temperature | 80 km | Decorrelates slowly; RMS 2.96 °C at 50–80 km |
| Humidity | **30 km** | Decorrelates ~2× faster. The wetness estimator reads RH through a ladder with rungs at 80/87/90/95 %, and an 11 % RMS error spans the whole ladder |
| Rainfall | **25 km** | Convective rain is cellular — a gauge can record 40 mm while one 12 km away records nothing. Distance-weighting averages the signal away |
| Wind | 50 km | |

Beyond the cap the service returns `None`. **Interpolation does not create a
hygrometer**, and an export must be able to say so.

Carries: per-variable `station_count` and `nearest_km`, plus `confidence`. There
is no `cv_rmse` here, because there is no fit — offering one would be inventing
a validation that was never run.

### Class 3 — Derived after interpolation

**`gdd_*`, `eto_mm`, `etc_mm`, `water_balance_mm`, `dewpoint`, `is_wet_hour`,
`wetness_probability`, `hours_since_rain`, all disease indices, all phenology.**

Computed at the point or zone *after* the spatial step, never averaged across
stations — a weighted average of two stations' wet-hour flags is not a wetness
estimate.

Worth stating explicitly in the spec: **`eto_mm` is Hargreaves-Samani, which
uses temperature alone, and that is a consequence of Class 2's coverage, not a
shortcut.** Penman-Monteith needs net radiation, wind and humidity; solar
radiation is the binding constraint, available within 20 km at only 36 of 67
sites on the reference list and within 50 km at 46. Choosing the method the data
supports, and naming it in every row via `eto_method`, is the honest treatment.

### What this means for the export schema

Carry the provenance with the value. Concretely, a `method` per variable:

```json
{
  "date": "2026-09-14",
  "temp_mean": { "value": 8.6, "method": "surface",
                 "cv_rmse": 0.91, "cv_units": "C", "model_version": "daily-v2.3" },
  "rainfall_mm": { "value": 0.0, "method": "surface",
                   "cv_rmse": 0.0025, "cv_units": "ratio" },
  "rh_mean":    { "value": 81.2, "method": "station_idw",
                  "station_count": 2, "nearest_km": 18.7, "max_km": 30.0 },
  "solar_radiation": { "value": null, "method": "station_idw",
                       "station_count": 0, "reason": "no station within 50 km" },
  "eto_mm":     { "value": 1.8, "method": "derived",
                  "eto_method": "hargreaves-samani", "inputs": ["temp_min","temp_max"] }
}
```

If the nested shape is too heavy for their ingest — and it may be — the flat
alternative is a parallel `_method` / `_station_count` / `_nearest_km` column set,
or a single `provenance` block in `meta` describing the whole payload where the
method is uniform per variable. **What is not acceptable is shipping a bare
number**, because a fitted surface value, a 28 km IDW blend and a
temperature-only ETo estimate are three different kinds of claim, and a partner
cannot tell them apart once they are in the same column.

Three rules follow, and they belong in the spec prose rather than a footnote:

1. **`null` is a legitimate, informative answer** — it means the variable was
   outside its refusal distance, or off the land mask. It is never zero.
2. **`station_count: 0` is the difference between "low risk" and "we could not
   see."** A hygrometer-free neighbourhood has already silently zeroed RH on
   this platform once.
3. **Only four variables have a fitted surface.** Anything implying a national
   gridded product for humidity, wind or solar is a claim we cannot support.

---

## What changes in the other documents

- `derived_data_scope.md` §I — regional Bacchus moves from **M / "accept the
  asymmetry"** to **S / do it**. Its §F zone-disease `created_at` fix rides the
  same migration.
- `partner_api_draft.md` §2.6 — `/zones/{slug}/disease` can carry a `bacchus`
  block after all.
- `partner_api_draft.md` §1.1 and §2 — add the `method` / provenance convention
  above; it is currently implied only for site hourly.
