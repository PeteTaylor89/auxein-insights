# Phenology from the surface, disease at a point — re-plan, 26 August 2026

Supersedes items 5, 6 and 8 of the "open" list in
`DAILY_OPERATIONS_2026-08-24.md`. Two architectural changes, decided by Pete
2026-08-26:

1. **Phenology stops reading the zone station average and starts sampling the
   daily surface across the zone's planted cells** — giving a spread rather than
   one false date, and letting a Pro site be placed inside that spread.
2. **Disease keeps its regional table**, and gains an **inverse-distance path to
   an arbitrary point** for Pro and bespoke use, backfilled where the record
   allows.

---

## 0. The timing fact that governs everything

`phenology_service.py` calibrates flowering and véraison from **1 September**
and harvest from **1 October** — it subtracts the day-62 (31 August) baseline
offset before comparing to any threshold.

**The 2027 vintage has not started accumulating.** Today is 26 August. Daily
surface publishing goes live 1 September. Those are the same date.

So switching phenology onto the surface **before 1 September costs nothing and
creates no discontinuity**: there is no season in progress to break, no
mid-season step in a published date, and no backfill of daily surfaces required
to reconstruct an accumulation that has not begun. Do it after 1 September and
every one of those becomes a problem.

That window is six days. It is the reason to sequence Change A ahead of
everything else on the cutover list except the job actually running.

---

## Change A — phenology from the cell mask

### What it replaces

Today: `phenology_service.py` reads `climate_zone_daily.gdd_cumulative`, one
station-average number per zone per day, and emits one `phenology_estimates`
row per zone/variety/vintage/date carrying one `gdd_accumulated`, one
`current_stage` and one date per stage.

A zone is not one place. Upper Wairau and Southern Valleys is 11,531 planted
hectares; a single flowering date for it is precise and wrong.

### The construction, and the trap in it

`climate_zone_cell_mask` holds **10,379 cells across 23 zones**, each with its
planted hectares. The daily surfaces give every one of those cells a
temperature. So:

1. **Per cell, per day**: `gdd_day = max(0, temp_mean)` — base 0, matching what
   the thresholds are calibrated against.
2. **Per cell, cumulative** from 1 September (and separately from 1 October for
   the harvest thresholds).
3. **Per cell, a crossing date** — the first day the cumulative clears each
   variety threshold.
4. **Percentiles of the crossing dates**, weighted by planted hectares.

> **Take percentiles of the DATES, never of the daily GDD.** Accumulating a p90
> of daily GDD assumes the same cell is the 90th percentile every day of the
> season, which it is not. This is the same error as accumulating daily standard
> deviations into a season spread band, already documented and already avoided
> once. The per-cell accumulation must be carried through and reduced *at the
> end*, not reduced daily and then accumulated.

Note that the Jensen correction that governs `gdd_season.py` — never substitute
`max(0, mean − base)` for the integral over a distribution — **does not apply
here and must not be transplanted**. That correction exists because the archive
is monthly and GDD is convex over a month's temperature distribution. A daily
surface has no distribution left to integrate; the daily value *is* the
estimator. Having true daily surfaces is precisely what removes that
approximation.

### Storage

New table, narrow, one row per cell per day:

```
phenology_cell_daily(zone_id, row, col, date, gdd_day)
```

~10,379 rows a day, ~2.5 M for a Sep–Apr season. Store the **daily** value, not
the cumulative — cumulative is a window function, and storing it would mean a
re-fit of one day silently invalidating every row after it.

**This is the recompute-never-accumulate rule again.** The weekly pass re-fits
D−9…D−3 and those values change. Storing dailies means a re-fit replaces seven
days of rows and the accumulation is simply re-derived; storing cumulatives
would require rewriting the rest of the season and would drift the first time
anyone forgot.

### Schema change to `phenology_estimates`

Widen rather than adding rows — the existing unique constraint on
(zone_id, variety_code, vintage_year, estimate_date) stays meaningful, and every
consumer keeps working:

- `gdd_accumulated_p10`, `_p50`, `_p90` beside the existing scalar
- `flowering_date_p10 / _p50 / _p90`, same for véraison and each harvest target
- `n_cells`, `planted_ha` — the weight behind the spread
- keep `gdd_accumulated` and `flowering_date` as the **p50**, so nothing
  downstream breaks on the day of the change

### Where it runs, and what that costs

Phenology becomes downstream of the surface fit rather than of the zone rollup.
Two consequences, both real:

- **It inherits D+2 latency.** Today it runs at 18:00 on data aggregated hours
  earlier. It will run after the 03:00 fit of D−2. For a seasonal phenology
  estimate that is immaterial; it must be stated rather than discovered.
- **It must recompute on re-fit.** The Sunday pass changes seven days of
  surface, so phenology for the whole season from 1 September has to be
  re-derived after it. Cheap — it is a window function over 2.5 M narrow rows —
  but it must be wired, not assumed.

Run it on the ingest box reading the published COGs, not inside the Fargate
task. Sampling 10,379 cells from four rasters is a range-read job, not a memory
job, and keeping it outside the fit means a phenology bug cannot fail the
surface publish.

### Pro site phenology comes free

`insights_site_daily` already stores the site's own cell `temp_mean` for every
day, upserted and corrected by the same re-fit sweep. Site GDD is
`max(0, temp_mean)` over the same window — no new extraction, no new surface
read, and it is by construction on the same estimator as the zone spread it
will be plotted against.

So a Pro site gets: its own accumulation, its own projected stage dates, and
**its position in its zone's distribution** — "your site is at the 78th
percentile of Awatere; flowering here is tracking six days ahead of the zone
median". That is the differentiation the whole change exists for.

### The one thing to verify before shipping

`days_vs_baseline` and `gdd_vs_baseline` compare against
`climate_zone_daily_baseline` (1986–2005). **Check whether that baseline is
station-derived or surface-derived.** If it is station-derived, comparing a
surface-derived p50 against it introduces a network offset that will read as
climate — the same class of error the era-offset field exists to correct, and it
would show up as a spurious "N days early against baseline" on day one.

If it is station-derived, the options are to re-derive the baseline over the
mask from the archive, or to withhold the baseline comparison until that is
done. Do not ship the comparison unverified.

---

## Change B — disease pressure at an arbitrary point

### What stays

`climate_zone_hourly` and the regional `disease_pressure` table are unchanged.
The three models — UC Davis powdery mildew, González-Domínguez botrytis,
3-10 plus Goidanich downy mildew — are unchanged. This is an additional spatial
source feeding the same models, not a replacement.

### The path

For a point (a Pro site, or a bespoke client's block):

1. Select the nearest stations reporting hourly, **per variable** — the sets
   differ, and that is the whole difficulty.
2. **Interpolate the right quantities**:
   - **Temperature** — lapse-adjust each station to sea level, inverse-distance
     weight, retrend to the point's elevation. The same detrend/retrend the
     spline uses, for the same reason: a point 300 m above its stations is not
     at its stations' temperature.
   - **Humidity as dewpoint, not RH.** Dewpoint is conservative under elevation
     change and RH is not; interpolating RH between a valley floor and a hillside
     produces a number that is not a measurement of anything. Interpolate
     dewpoint, then derive RH at the point from the interpolated temperature and
     dewpoint.
   - **Rainfall** — inverse distance with a hard distance cap, and it is the weak
     link. Convective rain is genuinely cellular; this is the same reason
     rainfall is deliberately excluded from the fit-time neighbour screen.
3. **Derive everything else at the point, after interpolation** — dewpoint
   depression, `is_wet_hour`, `wetness_probability`, `wetness_source`,
   `hours_since_rain`. **Never interpolate a derived field.** The inverse-distance
   weighting of two stations' `is_wet_hour` booleans is not a wetness estimate,
   and a weighted mean of `hours_since_rain` is meaningless.
4. Run the existing models unchanged on the resulting hourly series.

### Refactor, not a fork

`hourly_aggregation.py` currently does the station selection, the averaging and
the per-hour derivation in one pass keyed on `weather_stations.zone_id`. Split
it:

- a **derivation module** — dewpoint, wetness, hours-since-rain — shared by both
  paths and unchanged in behaviour, verified by reproducing existing
  `climate_zone_hourly` rows exactly;
- a **spatial source** with two implementations: zone-average (existing, keyed
  on `zone_id`) and inverse-distance-at-a-point (new).

`disease_service_v2.py` then reads whichever table it is pointed at and does not
fork at all.

### Storage

```
insights_site_hourly(site_id, timestamp_utc, ...)   -- mirrors climate_zone_hourly
insights_site_disease(site_id, date, ...)           -- mirrors disease_pressure
```

Carry **per-variable** provenance on every hourly row: `n_stations_temp`,
`n_stations_rh`, `n_stations_rain`, and the distance to the nearest contributing
station for each. A single `station_count` and `confidence` cannot describe a
point with four thermometers at 6 km and its nearest hygrometer at 41 km, and
that is the ordinary case, not the edge case.

### Three hard gates, all of them prerequisites

**1. Rainfall cadence classification.** Roughly 150 stations post one record per
day carrying the daily total — station 393 recorded 440.4 mm as a single
midnight record. Fed to an hourly interpolation that puts a day's rain into one
hour. Cadence is mixed **within** a source, not just between sources, so this
cannot be a per-source rule: it needs per-station, per-era classification, and
it gates every hourly product including this one. This is prerequisite work, not
a refinement.

**2. Humidity coverage is the binding constraint, not the algorithm.** Zone 13
carries 11,531 planted hectares with **zero** humidity; zones 6 and 7 have no
assigned stations at all; Waipara has 25 stations and 3 with RH. Interpolating
to a point does not create a hygrometer. Two things follow: the manual
zone-assignment pass matters more after this change than before it, because
inverse distance selects on real distance rather than zone membership and will
find stations the current path cannot see; and the service must **refuse** past
a distance threshold rather than return a low-confidence number, because a
botrytis risk index built from a hygrometer 40 km away is worse than no index.

**3. Backfill depth — SETTLED. The record starts 15 August 2026.**
Decided by Pete 2026-08-26: every disease series, zone and point alike, begins
on **15 August 2026** and is backfilled to there. Most disease is inactive over
winter, and 15 August sits roughly a month ahead of budburst in every New
Zealand region, so nothing agronomically meaningful is discarded.

**That date also happens to be the only one the data supports, which is worth
knowing rather than discovering later.** Hourly-capable rainfall stations ran at
47 in 2020, ~52 in 2025 and 135–140 in early 2026, then stepped to **~620 on
4 August 2026** and have been flat since. A start date of 15 August is eleven
days the right side of that step. Any earlier start would have needed the
per-model, per-site "backfilled to" bookkeeping this decision removes: powdery
mildew reaching back furthest on temperature alone, botrytis and downy mildew
stopping at the Bay of Plenty because they need wetness and wetness needs rain.

So: **one start date, all three models, both spatial paths.** A new site
backfills to 15 August 2026 or to its own creation date, whichever is later, and
`insights_site_disease` carries no per-model provenance because there is nothing
to distinguish.

The cadence gate above is *not* relieved by this. The ~620 gauges include the
~150 that post a day's total as one midnight record, and that is a property of
the station rather than of the era.

### Wetness without a wetness sensor — and where wind belongs

We have no leaf-wetness sensors anywhere in the network, so wetness is inferred.
`estimate_leaf_wetness` already infers it from **rainfall, humidity, temperature
and dewpoint depression**, as the maximum of four probabilities: raining now,
recently rained and still drying, humidity above a ladder of thresholds, or
dewpoint depression small enough to condense.

**Wind is the missing term, and it enters as drying, not as wetting.** This is
the distinction to get right: rain, humidity and dew *cause* wetness; wind
*removes* it. Wind must therefore multiply the post-rain drying decay, and
suppress the dew term — dew does not form in a breeze — and must never be added
as a fifth probability inside the `max()`. Added as a fifth term it would make
wind *increase* modelled wetness, which is backwards.

Concretely, the post-rain decay is currently 0.3 per hour, scaled ×1.5 above
25 °C and ×1.3 below 70% humidity. Wind is the third and probably the strongest
of those three drying levers: a canopy at 5 m/s dries far faster than still air
at the same temperature and humidity. It becomes a third multiplier on the same
decay, plus a suppression factor on `p_dew` above a light-wind threshold.

**Wind must be optional per station.** Thirteen of twenty-two ingest sources map
`wind_speed` — broader coverage than humidity — but not every station reports
it. Where wind is absent the estimator must fall back to exactly today's
behaviour rather than fail, and `wetness_source` should record whether wind
informed the hour, so a later calibration can separate the two populations.

**Changing the estimator changes every disease number ever computed** — which is
precisely why the 15 August restart is the moment to do it. Recompute the
**zone** series from 15 August under the new estimator at the same time as the
point series is first built, and both spatial paths then share one estimator and
one start date. Doing it later means two incompatible eras inside one table with
nothing on the row to tell them apart.

None of this is calibrated against observed wetness, because we have no observed
wetness to calibrate against. It is a better-informed inference, not a
measurement, and the disease indices built on it inherit that. Say so in the
product copy.

### Where it runs

On the ingest box beside the rollup, on the same 6-hour cadence. A few stations
by 24 hours by N sites is arithmetic, not a workload — nothing here needs
Fargate, which stays for the surface fit alone.

---

## Revised order of the day

```
hourly :05   council ingest                        EC2      unchanged
every 6 h    daily_aggregation -> daily_qc         EC2      unchanged
             hourly_aggregation (zones)            EC2      refactored, same output
             IDW hourly at Pro points              EC2      NEW
             disease pressure, zone + point        EC2      same models, two sources
03:00        surface fit D-2                       Fargate  unchanged
             populate_site_daily                   EC2      after the fit
             phenology from the cell mask          EC2      MOVED here from 18:00
Sun 04:00    re-fit D-9..D-3                       Fargate  unchanged
             re-run site daily AND phenology       EC2      NEW dependency
18:00        zone rollups                          EC2      phenology removed from it
```

The structural change: **phenology crosses from the daily branch to the surface
branch.** It stops depending on the zone station average entirely and starts
depending on the fit — which means it also stops being protected by the daily QC
stage alone and starts inheriting the fit-time neighbour screen as well. That is
an improvement, and it is a change in what guards it.

Disease stays exactly where it is, on the hourly branch, still bypassing the
daily table. Nothing about that changes.

---

## What this does to the 1 September cutover

The existing list stands. Two items are added and one is re-ordered:

1. Run the daily job once by hand. *(unchanged, still first)*
2. **Cut phenology over to the cell mask BEFORE 1 September.** After that date
   it becomes a mid-season change to published dates. Six days.
3. Split the model-version pin per variable. *(unchanged)*
4. Purge the August test surfaces, disable the old workflow in the same change.
5. Apply the AWS deployment.
6. **Verify the phenology baseline's provenance** before enabling the
   `days_vs_baseline` comparison.

Change B is not gated on 1 September and should not be rushed to meet it. It has
a genuine prerequisite — the cadence classifier — and shipping an hourly point
product on unclassified rainfall would put a day's rain into one hour at ~150
stations.

Its own order:

1. **Rainfall cadence classification**, per station per era. Gates everything.
2. **Wind into the wetness estimator**, optional per station, degrading to
   today's behaviour where wind is absent.
3. **Recompute the zone disease series from 15 August 2026** under the new
   estimator — before any point series exists, so there is never a moment when
   the two disagree.
4. **Split `hourly_aggregation.py`** into the shared derivation module and the
   two spatial sources, verified by reproducing existing rows exactly.
5. **Build the point path** and backfill each site to 15 August 2026 or its
   creation date, whichever is later.

---

## Decided 2026-08-26

- **The mask median is the headline.** `gdd_accumulated`, `flowering_date`,
  `veraison_date` and every harvest target keep their existing column names and
  now carry the **p50 over the zone's planted cells**, with p10 and p90 beside
  them. Nothing downstream breaks, and the meaning of the scalar changes from
  "the station average" to "the median planted hectare" — which is the number a
  grower thought they were reading anyway.
- **Disease starts 15 August 2026**, one date for all three models and both
  spatial paths.
- **Wetness stays inferred**, from rainfall, humidity, temperature, dewpoint and
  now wind — wind as a drying term only.

## Open, and needing a call

- **The buffer question resurfaces.** Zone membership for stations is
  assignment-based; cell membership is geometric. The two need not agree, and
  after this change a zone's phenology and its disease pressure are drawn from
  different definitions of the same zone. Worth being explicit about in the
  product copy.
- **Refusal threshold for point disease.** What distance to the nearest
  hygrometer makes a botrytis index not worth returning? This wants a number
  before the first bespoke client, not after.
