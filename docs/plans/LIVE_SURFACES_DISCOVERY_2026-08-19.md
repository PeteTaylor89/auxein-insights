# Live surfaces from the DB — coverage discovery and plan

**Date:** 2026-08-19 · **DB:** `auxein_db` prod, alembic head `add_map_feature_types`
**Scope:** daily 500 m surfaces for `temp_min`/`temp_max`/`temp_mean` and hourly
surfaces for precipitation, built from `weather_data_daily` / `weather_data`
2020-01-01 → present; bias measured against the published 1986–2023 CLIFLO
archive over the 2020–2023 overlap.

Measured against prod during this session. **The DB moved under the discovery
while it ran** — a parallel agent is repopulating raw data from the ingestion
classes, and the numbers below are the second pass, taken after that landed.
Queries and scripts: `scratchpad/live_discovery/`.

---

## 1. What changed today

The first pass found that six councils stored **one temperature record per day
stamped 00:00 NZT**, so `temp_min` and `temp_max` were identical on every day —
mean diurnal range exactly 0.00 °C across HBRC, GW, TDC, GDC, WCRC (100 %) and
MDC (97 %). Only ~50 stations in the whole 2020–2023 overlap had a real DTR.

**The repopulation has fixed this.** Sub-daily temperature now runs back to 2020
for every council that has a feed:

| source | overlap station-days | % Tmin==Tmax | mean DTR | median recs/day |
|---|---|---|---|---|
| SYNOP_GTS | 61,802 | 0.1 % | 7.23 | 24 |
| MDC | 37,530 | 5.3 % | 9.10 | 169 |
| HBRC | 29,207 | **0.0 %** | 8.83 | 24 |
| GW | 15,900 | 0.3 % | 8.47 | 144 |
| BOPRC | 15,834 | 0.0 % | 8.53 | 144 |
| GDC | 13,078 | 0.1 % | 8.00 | 144 |
| TDC | 10,226 | 14.3 % | 6.97 | 144 |
| WCRC | 2,922 | 2.4 % | 8.60 | 96 |

Genuine-DTR stations reporting per day, by year: **114 · 122 · 129 · 131 · 152 ·
~200 · 220**. Was ~50 flat across 2020–2024 this morning.

The proposed "Phase D probe" — find out whether the councils' archives held the
15-minute series back to 2020 — is answered and done. They did, and it's in.

---

## 2. Current state, both eras

`weather_data_daily`: 1,520,754 rows, 878 stations, 2020-01-01 → 2026-08-19.

Stations per day, median by year:

| year | temp_mean | genuine DTR | rainfall | solar |
|---|---|---|---|---|
| 2020 | 120 | 114 | 479 | 29 |
| 2021 | 129 | 122 | 493 | 28 |
| 2022 | 133 | 129 | 511 | 28 |
| 2023 | 134 | 131 | 527 | 28 |
| 2024 | 157 | 152 | 616 | 28 |
| 2025 | 159 | ~150 | 627 | 27 |
| 2026 | 222 | 220 | 772 | 37 |

### Network geometry, like for like

Nearest-neighbour spacing against the CLIFLO fixture **restricted to the same
2020–2023 window**:

| variable | network | n | NN med | NN p90 |
|---|---|---|---|---|
| temp_mean | CLIFLO 2020-23 | 235 (243/day) | 10.9 | 39.3 km |
| | DB 2020-23 | 127 | 19.1 | 78.5 km |
| | **union** | **341** | **7.8** | **27.0 km** |
| temp_min | CLIFLO 2020-23 | 240 (244/day) | 11.0 | 39.1 km |
| | DB 2020-23, genuine | **118** | 19.3 | 75.1 km |
| | **union** | **338** | **7.9** | **27.0 km** |
| rainfall | CLIFLO 2020-23 | 357 (360/day) | 8.8 | 28.0 km |
| | DB 2020-23 | **490** | 8.8 | 17.5 km |
| | **union** | **825** | **7.3** | **17.5 km** |

Co-location: 62 of the 118 genuine DB temperature stations are within 5 km of a
CLIFLO station, so the DB contributes **56 novel temperature sites** and **388
novel rain gauges**. The union beats CLIFLO alone on p90 spacing by 31 % for
temperature and 38 % for rainfall.

This morning's conclusion — "a DB temperature surface would be strictly worse
than the published one" — no longer holds. The DB alone is still thinner than
CLIFLO; the union is materially better than either.

### Live era (2025-09-01 → 2026-08-17)

| variable | n | NN med | NN p90 | NN max |
|---|---|---|---|---|
| temp_mean | 211 | 13.9 | 54.4 | 302.8 km |
| genuine DTR | 210 | 13.9 | 54.5 | 302.8 km |
| rainfall | 731 | 8.5 | 16.9 | 47.9 km |
| solar | 35 | 26.0 | 47.9 | 124.5 km |

Distance from wine-zone centroid to nearest genuine-DTR station — the zones that
are still far in **both** eras are the real holes:

| zone | 2020–23 | live |
|---|---|---|
| North Canterbury | 58.3 | **3.4** |
| Waipara | 51.0 | **2.3** |
| Bendigo | 48.5 | **9.0** |
| Central Otago | 38.6 | **6.3** |
| Bannockburn | 34.5 | **4.8** |
| **Waitaki** | 46.6 | 46.6 |
| **Waiheke** | 34.2 | 34.2 |
| **Auckland** | 28.4 | 28.4 |
| **Martinborough / Wairarapa** | 16.4 | 16.4 |
| **Gibbston** | 16.3 | 16.3 |

Everything else is inside 14 km in both eras.

---

## 3. Hourly precipitation — the constraint that governs the plan

Hourly-capable rainfall stations (≥20 distinct hours on ≥5 of 7 days):

| period | stations |
|---|---|
| 2020-06 | 47 |
| 2022-06 | 49 |
| 2024-06 | 49 |
| 2025-06 | 52 |
| 2026-01 … 2026-07 | 135–140 |
| **2026-08-04 → now** | **~620** |

Day by day through the switch-on: 0 on Jul 25, 237 on Jul 26, 363 by Jul 28,
481 by Aug 3, **623 from Aug 4**, flat since.

**There is no hourly rainfall history.** Before 2026 the hourly network is BOPRC
and essentially nothing else — 47 gauges nationally. The hourly product can only
be built forward, and today it has **15 days of record**.

### Rainfall value semantics are mixed, and mixed *within* a source

Cadence bands over the last 30 days: 146 stations at 3–12 records/day
(ECAN, HBRC, SYNOP), 333 at 21.7–30 (ECAN, GW, HORIZONS, NRC, SOUTHLAND, TRC,
WCRC), 294 above 30 (BOPRC, GDC, GW, HARVEST, HBRC, MDC, NRC, TDC, WCRC).

Several sources appear in more than one band. Worked example: TDC averages
12.8 records/station/day, but station 393 (`TDC_HY_ANATOKI_AT_PARADISE`) posts
**one record per day at NZ midnight carrying the daily total** — 249.1 mm on
2026-06-01 and 440.4 mm on 2026-06-02, `rainfall_record_count` = 1. Those are
real values for a Kahurangi catchment, not an error; the archive's own maximum
is 691.8 mm. But fed to an hourly fit they would put a day's rain into one hour.

Per-source averages hide this completely. Classification has to be
**per station, per era**, and it is a prerequisite for any hourly fit.

---

## 3a. Completeness for the interpolator, 2020 → present

CLIFLO and the published surfaces are the **validation sets**, not inputs. What
follows is whether the DB alone can carry a fit, and where it cannot.

### Temporal — no gaps left

Days below a viable fitting count, 2020-01-01 → 2026-08-17 (2,421 days):

| year | days | temp days < 100 stns | DTR days < 100 | DTR < 50 | rain days < 400 | min temp | min DTR | min rain |
|---|---|---|---|---|---|---|---|---|
| 2020 | 366 | 0 | 0 | 0 | 0 | 112 | 109 | 471 |
| 2021 | 365 | 1 | 2 | 0 | 0 | 91 | 79 | 479 |
| 2022 | 365 | 0 | 0 | 0 | 0 | 127 | 122 | 500 |
| 2023 | 365 | 0 | 0 | 0 | 0 | 129 | 127 | 519 |
| 2024 | 366 | 0 | 0 | 0 | 0 | 143 | 143 | 600 |
| 2025 | 365 | 0 | 0 | 0 | 0 | 141 | 141 | 617 |
| 2026 | 229 | 0 | 0 | 0 | 0 | 151 | 151 | 551 |

Every day in six and a half years clears 79 thermometers and 471 gauges. There
is **no day the interpolator cannot fit**, and no temporal hole to work around.
The historical archive itself ran on a 145-station minimum, so this is
comparable.

### Spatial — measured against land, not against other stations

Nearest-neighbour spacing flatters a clustered network. The honest metric is
distance from **land** to the nearest station, over an 11,471-point ~5 km grid
inside `nz_land` (264,667 km², LINZ 51153).

**Temperature**

| network | n | median | p90 | p99 | max | land >25 km | land >50 km |
|---|---|---|---|---|---|---|---|
| CLIFLO 2020-23 | 240 | 19.4 | 35.3 | 48.7 | 60.3 | 31.9 % | 0.7 % |
| DB overlap 2020-23 | 118 | 35.6 | 71.2 | 109.8 | 148.4 | 66.7 % | **30.6 %** |
| DB live 2025-26 | 210 | 25.8 | 55.7 | 80.5 | 104.4 | 51.7 % | **15.1 %** |
| **union (overlap)** | 358 | **17.2** | **32.5** | 45.8 | 59.9 | 24.7 % | 0.4 % |

**Rainfall**

| network | n | median | p90 | p99 | max | land >25 km | land >50 km |
|---|---|---|---|---|---|---|---|
| CLIFLO 2020-23 | 357 | 16.4 | 32.7 | 48.2 | 71.7 | 23.3 % | 0.7 % |
| DB overlap 2020-23 | 490 | 17.9 | **99.0** | 155.0 | 183.9 | 42.3 % | **29.3 %** |
| DB live 2025-26 | 731 | 10.8 | 51.9 | 90.1 | 110.1 | 22.6 % | 10.7 % |
| **union (overlap)** | 847 | **10.6** | **24.7** | 44.2 | 71.7 | 9.8 % | 0.5 % |

**Read the rainfall rows carefully.** The DB has 490 gauges against CLIFLO's
357 — 37 % more — and its p90 land distance is **three times worse** (99.0 vs
32.7 km). Council networks are dense inside their own boundaries and stop at
them. Station count is not coverage, and any "we have more gauges than NIWA"
claim is false in the way that matters to a spline.

### Elevation — better than CLIFLO, which is the one pleasant surprise

The lapse detrend/retrend needs stations spanning relief.

| network | n | median | p90 | max | ≥500 m | ≥1000 m |
|---|---|---|---|---|---|---|
| CLIFLO 2020-23 temp | 240 | 81 | 551 | 2000 | 25 | 9 |
| DB live temp | 210 | 123 | 711 | 1624 | **41** | **13** |
| DB overlap temp | 118 | — | — | 1279 | 21 | 3 |

The live network samples altitude **better** than CLIFLO — 41 stations above
500 m against 25 — so the retrend is at least as well constrained. The overlap
network is thin above 1,000 m (3 stations) and the 2020-23 fits should be
expected to be weakest in the high country, which is also where the spatial
holes are.

### Solar is still not viable

35 stations nationally, 19 of them HBRC, none in Canterbury, Otago or Southland.
The remaining `solar_rad` gap in the published archive must come from `Z:`.

---

## 4. Live defects found

- **BOPRC temperature fell from 14 stations to 4 on 2026-08-02** and has stayed
  at 4 for 18 days. Every other month of 2026 shows 14. This looks like a
  regression introduced alongside the repopulation — BoP is OGC SOS, `http://`
  only.
- **2026-08-12 is a half-filled rollup day**: 105 temperature / 504 rainfall
  against 222 / 772 on the days either side, while the raw table holds the full
  222 / 771 for that date. Partly recovered since this morning, not fixed.
- **HORIZONS runs ~5 % degenerate every month** — one station in 20, consistent
  across Jan–Aug. A single sensor, not a pipeline fault.
- The daily rollup sits **D+2**; 2026-08-18 and 08-19 are still filling.

---

## 5. Plan

### Phase 0 — clear the defects (small, do first)

Five items. Only the first is load-bearing for the interpolator; the rest are
data-loss and hygiene. All of it is well under a day.

**0.1 — There is no physical-range QC anywhere, and sentinels are in the data.**
Promoted to the top of the plan: this is the one Phase 0 item that will destroy
a surface rather than degrade it. Scanning `weather_data_daily`, 2020 → now:

| check | station-days | stations | worst value |
|---|---|---|---|
| temperature ≤ −30 °C | 235 | 10 | **−6,999 °C** (TDC) |
| temp_max > 45 °C | 35 | 6 | **+278.1 °C** |
| rainfall > 700 mm | 30 | 6 | **232,036 mm** |
| rainfall < 0 | 3 | 1 | −8.2 mm |
| solar < 0 | 12,235 | 18 | −12,085 |
| temp_min > temp_max | 0 | 0 | — |

In the raw table over the last 30 days: HORIZONS station 760
(`HAUTAPU_AT_MOUNGANUI_STATION`) emits **−100.00 °C at 144 records/day**, every
record, plus −100 on `rh`; SOUTHLAND emits −7,999 on `wind_speed`.

These are Hilltop/telemetry no-data sentinels being ingested as observations.
The counts are small, and that is exactly the danger — 235 poisoned station-days
across six years reads as noise in a row count, but **one −6,999 in a TPS fit
takes out the national surface for that day**, and GCV will happily choose a
lambda that accommodates it. Note `temp_min > temp_max` is 0, so the aggregate
is internally consistent; consistency is not validity.

Two fixes, both needed. A physical-range filter at ingest so new sentinels stop
landing, and an independent screen in `consolidate_db.py` at fit time, because
the historical rows are already written and because the fit should never trust
its input. Ranges should be per-variable and generous — NZ's record low is
−25.6 °C and the archive's rainfall maximum is 691.8 mm, so a −30/+45 °C and
0/750 mm gate rejects only the impossible.

**0.2 — BOPRC temp/rh/pressure stop dead at 2026-08-01 on 10 stations.**
14 → 4 thermometers on 2026-08-02, still 4, 18 days and counting. The ten are
BoP's air-quality sites; the four survivors are hydrology sites. The ingester
logs SUCCESS and re-writes a window that never advances past 1 August, while
rainfall on the same station in the same run is current. Full diagnosis and the
`LABEL = 'Primary'` hypothesis: `docs/Bugs/Current/BOPRC_MET_STOPS_2026-08-01.md`.

**0.3 — 2026-08-12 is a half-filled rollup day.** Six whole sources are absent
from the daily table while their raw data is present: ECAN 102, SYNOP_GTS 47,
SOUTHLAND 43, NRC 41, TRC 28, HARVEST 7 — 268 stations. The other eight sources
are complete for that date. That is a source-partitioned run, not a random
failure. Re-run `daily_aggregation.py --date 2026-08-12`.

**0.4 — HORIZONS station 760** is not a degenerate-aggregation case as first
catalogued; it is 0.1 above. Flag or deactivate the station as well as filtering
the value.

**0.5 — A watchdog, because `ingestion_log` cannot see any of this.** BOPRC
logged 15,508 SUCCESS and 1 FAILED across the fortnight it was losing 10
stations, because a run that fetches 3 of 4 variables is a success. Add a
per-(station, variable) last-seen alert — a pair that reported daily for 30 days
going 48 h silent — plus a per-variable station-count floor on the daily rollup.
Per the incremental-clamp footgun, a per-day row count looks fully populated
when it is not; 2026-08-12 and the BOPRC loss are both that failure mode.

### Phase 1 — station cadence classification

New, and load-bearing for hourly precip. For every (station, variable, era),
classify the native cadence as `daily_total` / `hourly` / `sub_hourly_event`
and persist it. Rules:

- A `daily_total` station must be **excluded from hourly fits entirely** — it
  cannot be disaggregated and interpolating it as an hourly value is wrong by
  a factor of ~24 at the point.
- It must still be **included in daily fits**, where its value is exactly right.
- The classification cannot be per-source. TDC alone spans both.
- Re-derive on a rolling window; the Jul–Aug switch-on proves cadence changes
  under you.

Cheap validation: for a `sub_hourly` station, the sum of its hourly increments
must reconcile to the day; for a `daily_total` station it is the day by
definition. A station where those disagree is misclassified.

### Phase 2 — daily surfaces from the DB, 2020 → present

`backend/scripts/interpolation/consolidate_db.py`, emitting **the same `.npz`
contract** as `consolidate_history.py` (`values`, `station_ids`, `dates`,
`latitude`, `longitude`, `elevation`). `run_history.py` then runs unchanged —
ridge/GCV, the lapse detrend/retrend, `screen_relevance`, the LENZ ratio path
and the whole band set carry over with no new fitting code.

Order: **rainfall, temp_mean, temp_min, temp_max**, 2020-01-01 → present.
Write under a **distinct `model_version`** — do not touch the published `v2`
keys. Budget ~2.7 h per four-year rainfall variable, ~50–77 min per temperature
variable at the historical rate, so roughly a day of compute for the set.

Note for `temp_min`: the archive's lapse rate is **0.4**, settled, and the
per-region work found a warm bias in frost valleys. Same rate here, and expect
the same regional signature — don't re-derive it.

### Phase 3 — the overlap bias study, 2020-2023

Now worth running for temperature, which it was not this morning. Decompose the
difference into three named terms rather than one blended number:

1. **Day boundary.** `daily_aggregation.py` uses NZ-local midnight-to-midnight;
   CLIFLO daily climate observations are **09:00–09:00**. For Tmin that
   reassigns the dawn minimum to the previous date — expected to be the largest
   single term. Isolate it by re-aggregating the ~46 SYNOP hourly stations on a
   9am boundary and re-fitting; nothing else changes between the two runs.
2. **Network.** Fit the archive's own station values on the DB's station subset.
   The difference against the published surface is what density alone costs.
3. **Residual.** What is left is genuine provenance disagreement.

Deliverables: per-zone and per-region bias tables (reuse `per_region_cv.py`),
the seasonal cycle of the bias, and a decision on whether live surfaces need a
reconciliation offset before being shown on the same axis as the archive.
Cross-check against `zone_surface_season`, which already reconciles to 0.00 GDD
against the GDD surfaces and is a working reference.

Honest expectation: **rainfall will look better than temperature** — the DB has
388 novel gauges and 56 novel thermometers. Report the two separately.

### Phase 4 — daily live engine

`run_live.py`: same fit, one day at a time, daily COG set plus a `surface_run`
row at `granularity='daily'`. The `statistic`-is-NULL partial unique index in
`surface_index_tables` already anticipates daily rows.

Schedule **D+2**, not D+1 — the rollup itself lands ~D+1 and late data arrives
after it. Roll daily into monthly and season on the archive's band vocabulary so
`/surfaces` serves 1986→now from one contract, with `model_version` the only
thing distinguishing eras.

Ships all four: rainfall, temp_mean, temp_min, temp_max. Frost products are now
supportable — 210 genuine-DTR stations live, and once Phase 2 backfills 2020
onward there are six seasons of daily Tmin to build a normal against.

### Phase 5 — hourly precipitation engine

Separate build, separate risk profile, and it should be scoped as
**forward-only** from the start.

- **Network**: ~620 gauges from 2026-08-04, 15 days deep. Nothing usable before.
  Any "hourly normal", percentile or anomaly is a season away at minimum.
- **Method**: the LENZ ratio does not transfer — LENZ is mean *annual* rainfall
  and there is no hourly climatology to scale by. Start with the sqrt transform
  (measured at −7 % on the daily bake-off, false-wet 6.8 %→3.8 %) and revisit
  the ratio question when a year of hourly record exists. Do not re-open the
  ratio argument before then.
- **Cost**: 24 fits/day instead of 1. At the observed rainfall rate this is the
  dominant compute line in the whole plan.
- **Retention**: decide before the first run. Recommend a rolling window of
  hourly COGs plus a permanent hourly→daily rollup, rather than keeping every
  hour forever.
- **Honesty about resolution**: 620 gauges at 8.5 km median spacing cannot
  resolve a 500 m hourly rainfall field. Keep 500 m for contract consistency,
  but the effective resolution is far coarser and the product must not imply
  otherwise — the known weakness on the daily archive is already that heavy
  rain (≥40 mm) runs −16.5 mm biased, and an hourly field will be worse.
- **Gate on Phase 1.** Running this before the cadence classification would put
  a daily total into a single hour at ~150 stations.

### Phase 6 — zone hourly for the disease service *(yours)*

Noting the seam so the two pieces meet cleanly:
`climate_zone_hourly.processing_method` is currently `'idw' | 'simple_mean'`,
with `station_count` and `confidence` alongside. A surface-derived path needs a
third value there. If zone hourly is to come from the hourly surface rather than
station IDW, it should use the **area-weighted zone cell mask** — blocks are
smaller than 500 m cells, and Marlborough's raw polygon mean runs 3.77 °C too
cold without it.

Worth deciding explicitly: disease models want *station-representative* hourly
values, and a smoothed surface is not the same thing as a station. Station-based
zone aggregation may well be the right answer for disease even once the surface
exists.

### Phase 7 — network gaps, ranked by measured deficit

The deficit metric: land within 20 km of a CLIFLO station but **beyond 30 km**
of a live DB station. That is coverage we can prove we are missing, because the
validation set has it and we do not.

**Temperature deficit — 47,830 km², 18.1 % of NZ**

| area | land km² | live med | live p90 | CLIFLO med | deficit km² | live stns |
|---|---|---|---|---|---|---|
| **West Coast** | 49,929 | 46.6 | 74.3 | 21.0 | **16,243** | **4** |
| **Waikato / King Country** | 23,926 | 30.2 | 47.9 | 17.3 | **6,622** | 14 |
| **Canterbury** | 16,359 | 31.8 | 51.6 | 15.6 | **4,453** | 24 |
| **Otago** | 30,940 | 18.3 | 43.8 | 17.6 | **4,130** | 25 |
| **Northland** | 12,713 | 38.9 | 62.7 | 19.8 | **3,461** | **3** |
| Manawatu / Whanganui | 20,535 | 16.5 | 33.7 | 17.3 | 2,423 | 20 |
| Waitaki / Mackenzie | 7,752 | 35.2 | 58.8 | 18.5 | 2,284 | 4 |
| Southland / Fiordland | 22,357 | 23.4 | 51.1 | 23.1 | 2,284 | 36 |
| Nelson / Tasman | 20,281 | 23.6 | 56.5 | 28.7 | 1,638 | 21 |
| **Auckland** | 4,407 | 28.3 | 46.3 | 13.1 | 1,431 | **2** |
| Taranaki | 6,737 | 28.6 | 49.4 | 25.9 | 1,177 | 3 |
| Wairarapa / Wellington | 9,783 | 13.0 | 29.6 | 14.7 | 761 | 20 |
| Hawke's Bay / Gisborne | 17,697 | 12.0 | 26.9 | 19.6 | 554 | 38 |
| Coromandel / Hauraki | 1,431 | 27.9 | 45.5 | 19.2 | 254 | 1 |
| Bay of Plenty | 9,506 | 20.2 | 30.5 | 22.0 | 92 | 7 |
| Marlborough | 6,068 | 9.9 | 22.8 | 19.1 | 23 | 22 |
| Central Plateau | 1,569 | 17.0 | 34.2 | 30.9 | 0 | 13 |

**Rainfall deficit — 27,710 km², 10.5 % of NZ**

| area | land km² | live med | live p90 | deficit km² | live gauges |
|---|---|---|---|---|---|
| **Waikato / King Country** | 23,926 | 32.2 | 71.8 | **8,698** | 15 |
| **Otago** | 30,940 | 23.3 | 66.6 | **8,583** | 37 |
| **Auckland** | 4,407 | **77.8** | **98.9** | **3,346** | **0** |
| Southland / Fiordland | 22,357 | 28.6 | 69.0 | 3,184 | 44 |
| Waitaki / Mackenzie | 7,752 | 22.2 | 37.6 | 1,892 | 38 |
| West Coast | 49,929 | 11.2 | 27.5 | 738 | 95 |
| Coromandel / Hauraki | 1,431 | 54.2 | 86.4 | 646 | 0 |
| Northland | 12,713 | 8.8 | 21.1 | 577 | 41 |
| everything else | — | ≤11.8 | ≤17.7 | ~46 | — |

**The two variables have different problems and need different fixes.**

*Rainfall is a missing-council problem, and it is the one already identified.*
Waikato, Otago and Auckland account for **20,627 km² of the 27,710 km² deficit —
74 %**. Auckland is the worst cell in the country: **zero gauges**, 77.8 km
median and 98.9 km p90 to the nearest one. Getting those three councils in
essentially closes the rainfall gap.

*Temperature is a missing-thermometer problem inside councils we already ingest.*
The same three councils are only 12,183 km², **25 %** of the temperature
deficit. The larger half is West Coast, Northland and Canterbury — 24,157 km²,
just over half — and all three are live feeds today supplying gauges and almost
no thermometers:

| council | active stations | with air temp | with rainfall |
|---|---|---|---|
| ECAN | 102 | **0** | 102 |
| NRC | 41 | **0** | 41 |
| WCRC | 53 | **2** | 49 |
| TDC | 43 | 7 | 40 |
| GDC | 64 | 10 | 64 |
| GW | 83 | 12 | 77 |
| BOPRC | 65 | 4 (was 14, see 0.2) | 52 |
| HORIZONS | 116 | 20 | 97 |
| HBRC | 84 | 20 | 81 |
| MDC | 45 | 30 | 44 |
| SOUTHLAND | 53 | 31 | 43 |
| SYNOP_GTS | 48 | 48 | 47 |

### Where the missing thermometers actually are

Checked 2026-08-19 against the probe artefacts already on disk and one live
sweep of ECan's open portal.

**Hilltop hydrometry is exhausted — the "no luck" result is correct.**

- **WCRC** (`hilltop.wcrc.govt.nz`, 121 sites): exactly **two** real
  air-temperature sites — `Grey Rv @ Conical Hill new` and `Pigeon Creek CWS`
  (a full climate station: air temp, wind, solar, pressure, rainfall). Both are
  already ingested. Every other "Temperature" hit in the catalogue is **water**
  temperature.
- **NRC** (`hilltop.nrc.govt.nz`, 41 sites): **zero** air temperature. The three
  hits are water temperature. NRC does carry 6-layer soil moisture at 10 sites,
  which is useful for other things and not for this.
- Trap worth naming: WCRC's Reefton air-quality sites expose
  **`BAM Air Temperature`**. That is the beta-attenuation monitor's internal
  instrument temperature, not a screened air temperature. It would pass a naive
  name filter and be wrong.

**But ECan was never actually probed for temperature.** The only ECan artefact
on disk is `ecan_sites.json`, and its endpoint is
`data.ecan.govt.nz/data/51/Rainfall/Rainfall summary by area/JSON` —
`"measurements": ["rainfall"]`. Air temperature was outside that probe's scope,
so the negative result does not cover it.

Sweeping the same portal's **Air** collection:

> `data.ecan.govt.nz/data/180/Air/Air quality all stations and monitor channels/JSON`
> exposes channels `WEB_Temp2m`, `WEB_Temp6m`, `WEB_RH`, `RH`, `Wind Speed V`,
> `Wind Dir V`, `Wind_Max` alongside the pollutants.
>
> **16 stations carry a temperature channel**: St Albans, St Albans EP,
> Riccarton Road, Woolston, Burnside, Kaiapoi, Rangiora, Lincoln, Ashburton,
> Geraldine, Timaru Anzac Square, Timaru Grey Rd, Washdyke Flat Road,
> Washdyke Alpine, Waimate Stadium, Waimate Kennedy.
>
> Keyless, same open portal, same URL grammar as the rainfall feed already
> wired. No Azure APIM key needed — that gate is on the *developer* portal, not
> this one.

This is the same shape as BoP, whose air-quality network supplied **10 of our 14
BoP thermometers** until they stopped on 2026-08-02 (defect 0.2). Air-quality
monitoring runs on separate telemetry from hydrometry at every regional council,
and it is the only council network that routinely carries screened met sensors,
because dispersion modelling needs them.

Three honest caveats before this is treated as solved:

1. **Siting.** These are urban and roadside exposure sites, not climate
   stations. A 2 m temperature beside an arterial road is not the same
   observation as a screened rural one, and the urban heat island is real at
   St Albans, Riccarton and Woolston. They should carry a siting flag and their
   residuals should be watched in the bias study rather than assumed clean.
2. **Geography.** They cluster on the plains and in towns — Christchurch ×5,
   Timaru ×2, Washdyke ×2, Waimate ×2. They close the **North Canterbury and
   mid-Canterbury plains** deficit cells (−43.0/172.5, −43.0/173.0) and do
   nothing for the Mackenzie and Southern Alps cells (−44.0/171.0–171.5,
   −43.5/170.0–170.5, −44.5/170.0), which are the larger half of the Canterbury
   deficit.
3. ~~**History** — unresolved.~~ **PROBED 2026-08-19, and it goes back.**
   MethodId=94 takes `?SiteId=&StartDate=&EndDate=` (dd/mm/yyyy) and returns
   **hourly** temperature. Eight stations — Riccarton Road, Woolston, Kaiapoi,
   Rangiora, Geraldine, Timaru Anzac Square, Waimate Kennedy, Washdyke Alpine —
   have unbroken 168/168-hour weeks in every year 2020→2026, plus St Albans EP
   from 2022 and Ashburton 2020–2025. Licence is **CC BY 4.0**. So this helps
   the Phase 2 backfill and the live product equally. Five of the sixteen
   metadata sites are decommissioned (Lincoln 2010, Burnside 2010, Timaru Grey
   Rd 2006, Waimate Stadium 2015, Washdyke Flat Rd 2019) — not a SiteId
   mismatch. Full results: `PROBE_ECAN_AIR_NZTA_2026-08-19.md`.
   **Geraldine (−44.100, 171.242) sits inside the two largest deficit cells in
   the country.** The alpine cells stay empty.

**Nelson** is a smaller loose end in the same shape: `ncc_met.json` probes
Tasman's Hilltop filtered to Nelson and finds three air-temperature sites
(`AQ Nelson at Blackwood St`, `HY Nelson at Broads`, `HY Nelson at Princes Dr`).
Worth checking against the 7 TDC thermometers we already ingest.

### District councils are not the answer, and the reason is structural

Assessed in `NZ_COUNCIL_DATA_SOURCES.md` (2026-06-25, multi-source, adversarially
verified) and re-checked today. Environmental monitoring is a **regional council
RMA function**; territorial authorities hold land use and run water-supply and
wastewater telemetry, not meteorology. Christchurch City's open-data portal was
confirmed to carry **no** hydrological or weather telemetry, only static District
Plan layers.

The West Coast makes the point cleanly: Buller, Grey and Westland districts do
not run networks — they appear as **tabs on WCRC's own portal**, which is one
regional telemetry system presented by district. There is no separate district
layer to ingest.

The genuine exception is **unitary authorities**, which hold both functions —
and we already ingest all of them (Tasman, Gisborne, Marlborough, Nelson via
Tasman's server).

### What is left for the high country

The Mackenzie, the Southern Alps, Fiordland and the West Coast ranges will not
be fixed by any council, and NIWA is a settled *no* (platform plan decision D3,
"licence terms unacceptable") — which is precisely why the deficit is defined
against CLIFLO in the first place. It measures what we have chosen to forgo, not
a purchasable shopping list.

Realistic remaining vectors, **all unverified leads, in rough order of promise**:

| source | why it fits the gap | state |
|---|---|---|
| **FENZ fire-weather** | screened, rural, sited in dry high-country and hill country — exactly the Canterbury/Otago/Marlborough gap | **requested**, Harvest-sourced so it inherits Harvest's cadence |
| **Hydro generators** — Meridian (Waitaki/Mackenzie), Contact (Clutha), Manawa/Westpower (West Coast), Mercury (Waikato) | dense met networks for inflow forecasting, sited in exactly the empty catchments | not approached; commercial licence |
| **Ski fields** — Mt Hutt, Porters, Craigieburn, Broken River, Temple Basin, Ohau, Roundhill, Coronet, Cardrona, Treble Cone | the only routine observations above 1,000 m; our network has 13 such stations nationally | not approached |
| ~~**NZTA** road weather~~ | ~~the alpine corridors~~ | **CLOSED 2026-08-19.** No weather datasets on the open portal; the Traffic API WADL declares 26 resources and none is an observation; `events/` carries weather only as advisory free text with no numeric fields. MetService operates the RWIS under contract — commercial, and it hits the same licence wall as NIWA (D3). |
| **Aerodromes** — Hokitika, Westport, Franz Josef, Kaitaia, Kerikeri | already partly covered by SYNOP_GTS | check overlap before pursuing |

### Priority order

1. **Probe ECan's Air collection for historical temperature** — 16 keyless
   stations, feeds we already talk to, addresses the Canterbury plains deficit.
   Cheapest win on this list by a wide margin.
2. **Waikato, Auckland, Otago licences** — in train. Between them **74 % of the
   rainfall deficit** (20,627 of 27,710 km²); Auckland alone has **zero gauges**
   at 77.8 km median distance.
3. **FENZ** — in train, best fit for the temperature gap that councils cannot
   reach.
4. **Hydro generators and ski fields** — the only path into the alpine cells.
5. **Fiordland and the main divide** stay extrapolation edges. That is a
   disclosure problem, not an ingestion ticket — the surface should carry an
   explicit confidence caveat there rather than imply a value it cannot support.

Items 1–3 are worth more to surface quality than any algorithmic change on the
interpolation re-test list.

### A note on how the gaps affect the product

They do not lower quality uniformly — they lower it **regionally**, and the
regions are known and enumerable above. Two consequences worth designing for:

- The overlap bias study (Phase 3) will attribute the West Coast, Waikato and
  Northland error to "network" rather than "method", which is correct and should
  be reported that way rather than as a national number.
- `cv_rmse` is computed inside the network, so it is blind to a hole — a region
  with four stations can post a flattering CV score precisely because there is
  nothing to disagree with. The per-region work already found a 1.34–2.30 zone
  spread against a 1.88 national figure. The distance-to-nearest-station field
  above is the honest companion metric and should ship alongside any per-region
  confidence the API exposes.

---

## 6. Sequencing

Phase 0 is hours. Phase 1 gates Phase 5 and is worth doing properly. Phase 2
is a day of compute and unblocks Phase 3, which answers the question the whole
exercise exists to answer. Phase 4 follows Phase 3. Phase 5 runs on its own
track once Phase 1 lands, and should not wait for the bias study — it has no
archive to reconcile against. Phase 7 is ingestion work in parallel throughout.
