# Hilltop councils: temp_min = temp_max = temp_mean, 2020 to 2026-07-27

Found 2026-08-19. Open. Data defect, not an outage — the pipeline is healthy from
2026-07-28 onward; what is broken is the archive behind that date.

## OUTCOME — data repaired 2026-08-19, uncommitted and undeployed

Re-fetched at native resolution and re-aggregated. Seven councils, 488 stations,
zero errors.

| | before | after |
|---|---|---|
| raw temp rows | ~230,000 | **34,420,865** |
| mean DTR | 0.05-0.65 degC | **7.81-10.55 degC** |
| zero-DTR station-days | 92.7-99.5% | **0.00-0.67%** |
| database | 35 GB | 43 GB |

**Ground truth.** HBRC Bridge Pa reproduces the source's native record **exactly on
10 of 10 sampled days** (Tmin, Tmax and Tmean all to 0.01 degC).

**Independent cross-check against CLIFLO** at 24 co-located pairs within 500 m —
a different network, different instruments, different QC — over 341 station-days in
2022-2023:

```
Tmin   bias -0.22   median +0.00   sd 1.52   MAE 0.83
Tmax   bias -0.05   median -0.10   sd 2.39   MAE 1.83
```

Better than expected. The anticipated midnight vs 09:00-09:00 day-boundary penalty
on Tmin did not materialise at these sites — median error is exactly zero. Caveat:
only 3 stations contributed 5 or more days, so this validates that the pipeline is
sound rather than establishing a network-wide error budget.

**730,147 thin station-days (<4 obs) now carry NULL rather than a fabricated
extreme**, with `temp_record_count` preserved so they stay auditable. 233 zero-DTR
days remain, all with 4+ observations — flat sensors or genuinely isothermal days,
not manufactured ones.

`check_daily_climate.py` still reports `thin 7.52%` for HORIZONS and `8.64%` for
TDC. That is the correct behaviour finally being visible: Hilltop genuinely serves
only one daily value for those station-days and the archive now says so instead of
inventing a range.

### Two further defects found during the repair

Both were silent — the process reported success and had done nothing.

1. **NZ DST spring-forward produced a duplicate key that aborted every full year.**
   Hilltop publishes both `02:00` and `03:00` on the changeover day;
   `.replace(tzinfo=ZoneInfo)` maps `02:00 NZST (+12)` and `03:00 NZDT (+13)` to the
   same UTC instant, and `execute_values` sends a year-chunk as ONE statement, so
   Postgres refused the lot with *"cannot affect row a second time"*. Fixed by
   de-duplicating in `db_util._dedupe`. Note the subtlety that made the first fix
   fail: two aware datetimes sharing one tzinfo compare by **wall clock**, so
   `a == b` is False while `hash(a) == hash(b)` is True — a dict cannot collapse
   them. The key must be the explicit UTC instant.

2. **A `numeric(10,4)` overflow from one bad reading killed a year.** TDC published
   `214699991.0` as an air temperature at Richmond Roof on 2026-08-15. Guarded in
   `db_util` on storage capacity (`|value| >= 1e6`), not plausibility, so it cannot
   discard good data; drops are printed.

Plus one introduced during the fix: `MIN_TEMP_RECORDS_FOR_DAILY` computed its NULLs
correctly but `upsert_daily_records` COALESCE'd them away against the stored value
— the B4.1 rainfall guard and the new temperature guard have opposite intent, and
B4.1 won silently. Resolved with `TEMP_AUTHORITATIVE_COLUMNS`: temperature has no
second writer, so this script's computed value including NULL always wins, while
B4.1 keeps protecting `rainfall_mm` which does.

**The lesson worth carrying:** every one of these reported success. Exit codes and
station counts caught none of them; row counts and distributions caught all of them.
Run `check_daily_climate.py` after any backfill.

## Summary

For seven Hilltop-sourced councils, every daily temperature aggregate between 2020
and 2026-07-27 was computed from a **single observation per station-day**, taken at
midnight NZ. `temp_min`, `temp_max` and `temp_mean` are therefore all the same
number, mean DTR is 0.00 degC, and that number is a midnight spot reading rather
than any daily statistic.

177,536 station-days are affected across 97 stations. Measured against the
councils' own native record, the stored values run **Tmax 7.4 degC low, Tmean 2.5
degC low, Tmin 2.3 degC high, and GDD10 32 percent low**.

The published 1986-2023 surfaces are **not** affected — they are built from the
CLIFLO CSVs on `Z:`, not from this database.

## Mechanism

Three separate faults compound. Any one alone would have been survivable.

### 1. The backfill asked Hilltop for a daily interval with no aggregation method

`backfill_driver.py` defaults `--interval "1 day"`, and every Hilltop driver appends
it as `&Interval=1 day` with no `&Method` (`hbrc.py:126`, and the same line in
gw/tdc/gdc/wcrc/mdc/horizons). TDC and GDC add `Method=Total` for **rainfall only**
— temperature never got a method on any council.

Hilltop given `Interval` without `Method` does not aggregate. It returns the
**instantaneous value at the interval boundary**. Verified live against HBRC,
Bridge Pa Climate, 2023-01-10:

| request | value |
|---|---|
| no `Interval` — native hourly | 16.446 at 00:00, 73 points over 3 days |
| `Interval=1 day` — what shipped | **16.446**, the midnight point verbatim |
| `Interval=1 day&Method=Average` | 17.908 — the true daily mean |
| `Interval=1 day&Method=Extrema` | 16.352 |

The run logs confirm it went out that way on every request: `Interval=1%20day` on
97/97 HBRC and 1211/1211 MDC temperature URLs.

### 2. The incremental cron re-seeded the same row every day until 2026-07-30

This is why it never healed on its own, and why the fault is not confined to the
backfill window. Before commit `320473d` (2026-07-30) `fetch_data` formatted
`From`/`To` as bare `DD/MM/YYYY`. Hilltop reads a bare date as that day's 00:00.
The newest stored point was always midnight, so every hourly run requested a
**zero-width window** `[midnight, midnight]` and got exactly one point back — at
midnight. It rewrote the same degenerate row indefinitely.

`320473d` switched to time-bearing ISO bounds to fix a different symptom (the run
freezing at midnight NZ). It incidentally ended this one. The data goes clean 1-2
days before that commit date; the slack is unexplained and is probably the CI
matrix change `4f5a008` (2026-07-29) landing first.

### 3. The rollup has no minimum-record guard

`daily_aggregation.py:103-105` takes `MIN`/`MAX`/`AVG` over whatever rows exist,
with no floor on `temp_record_count`. One row in, and min = max = mean falls out.
The rollup is arithmetically correct and silent. This is the check that would have
caught the other two in 2020.

## Scope

Timestamps sit at 11:00/12:00 UTC — midnight NZDT/NZST — exactly one per
station-day.

| source | 1-record days | clean days | stations | span |
|---|---|---|---|---|
| MDC | 60,980 | 3,354 | 30/30 | 2020-01-01 → 2026-07-27 |
| HBRC | 47,236 | 1,093 | 20/20 | 2020-01-01 → 2026-07-26 |
| GW | 22,513 | 486 | 12/12 | 2020-01-01 → 2026-08-03 |
| **HORIZONS** | 19,019 | 199 | 21/21 | 2024-01-01 → 2026-08-03 |
| TDC | 16,138 | 798 | 7/7 | 2020-01-01 → 2026-07-27 |
| GDC | 7,216 | 566 | 5/11 | 2020-01-01 → 2026-07-27 |
| WCRC | 4,376 | 22 | 2/2 | 2020-01-01 → 2026-08-04 |

Two corrections to the shape this was first reported in:

- **HORIZONS is a seventh affected council**, all 21 stations. It is invisible in a
  2020-2023 comparison window because Horizons data only starts 2024.
- **It is not a 2020-2023 problem.** Over the full record the zero-DTR share is
  WCRC 99.5%, HORIZONS 99.0%, GW 97.9%, HBRC 97.7%, TDC 95.3%, MDC 94.9%,
  GDC 92.7%. It runs to the July 2026 fix, not to 2023.

The end is a clean cliff, not a taper — HBRC has 18/20 stations bad every day to
07-26, then 0 from 07-28. Consistent with a code change, not with drifting station
health.

## Magnitude

HBRC Bridge Pa Climate, 90 full days Jan-Mar 2023, stored value against the true
daily statistics recomputed from the council's native hourly record:

```
TRUE    Tmin 12.91   Tmax 22.58   Tmean 17.67   DTR 9.67
STORED  15.20 used as all three                 DTR 0.00
BIAS    Tmin +2.29   Tmax -7.38   Tmean -2.47
GDD10   true 696.8   vs stored 476.5            -31.6%
```

Midnight sits near the daily minimum, so Tmax collapses and Tmean runs cold. The
error is not noise — it is a systematic cold bias with a warm bias on Tmin, which
is the worst possible combination for frost work and for GDD.

## Rainfall is a separate, smaller problem

Rainfall values are **numerically correct but stamped one day late**.

Hilltop does default to totalling for cumulative measurements, so the missing
`Method=Total` on HBRC/MDC/GW/WCRC/HORIZONS did not corrupt the numbers. But a
`1 day` bin is labelled at the **end** of its interval, so the row stored against
date D holds the rain that fell on D-1. Verified over Feb 2023 at Bridge Pa: every
non-zero day matches the following day's label (12 of 14 days; the two that appear
to match same-day are 0.0 = 0.0).

`Method=Total` does not fix this — TDC and GDC carry the same shift.

At the 30-minute and hourly resolutions the incremental path uses, the same
end-labelling misplaces only the single bin either side of midnight, which is
immaterial. **The one-day shift applies to the backfilled era only**, the same
2020 → 2026-07-27 window.

## Other ingest sources are clean

| source | avg records/day | % DTR = 0 | mean DTR |
|---|---|---|---|
| HARVEST | 300.3 | 0.0 | 13.53 |
| BOPRC | 160.5 | 0.0 | 8.56 |
| SOUTHLAND | 24.0 | 0.0 | 9.57 |
| TRC | 23.4 | 0.0 | 7.05 |
| SYNOP_GTS | 22.4 | 0.0 | 7.34 |

None of these go through the Hilltop `Interval`/`Method` path — BoP is OGC SOS,
Southland and TRC are forward-only APIs, Harvest and SYNOP are their own formats.
No action needed on any of them.

Separately worth noting: **ECan, NRC and NOAA contribute no temperature at all** to
`weather_data_daily`. That is a coverage gap, not this bug, but it means ECan's
4 → 102 station expansion is not yet feeding the daily temperature record.

## Downstream

**Surfaces are clean.** Nothing under `backend/scripts/interpolation/` reads
`weather_data_daily` or `timeseries_observations`; the 1986-2023 archive is staged
from CLIFLO CSVs on `Z:` by `consolidate_history.py`. The Atlas, the GDD season
surfaces and the zone surface stats are untouched.

**`climate_zone_daily` is contaminated.** `zone_aggregation.py:147-152` pools
`temp_min`/`temp_max`/`temp_mean` across a zone's stations with no
`temp_record_count` filter, so a degenerate station-day carries the same weight as
a genuine 48-record one. Zone-level damage is muted because healthy stations
(SYNOP_GTS, HARVEST) dominate most zone means, but it is real: pre/post-cutover
zone DTR moves -2.94 Awatere, -2.32 Marlborough, -1.94 Hawkes Bay, -1.34 Gisborne.
That comparison is seasonally confounded — the pre window is a full year and the
post window is winter — so treat it as indicative of direction, not as an estimate
of size.

Everything downstream of that table inherits it: GDD accumulation, season extremes,
phenology estimates, disease pressure.

## What resolution to re-fetch at

Native resolution varies by council. HBRC serves hourly; MDC serves 5-minutely.
Subsampling MDC's native record to hourly and recomputing, over Jan 2023:

```
Tmin error   mean +0.343   worst +2.82
Tmax error   mean -0.091   worst -0.70
DTR  error   mean -0.434   worst -3.02
```

Hourly is exact where hourly is native (HBRC: error identically 0.000). Where the
council serves sub-hourly it costs about 0.4 degC of DTR on average, almost all of
it on **Tmin** — minima are sharp dawn troughs, maxima are broad afternoon
plateaus, so an hourly grid catches the max and misses the min. Worst case in one
month was 3 degC of DTR.

Recommendation: **fetch native — omit `Interval` entirely.** It is not more
expensive (see below), it removes the `Method` question altogether, and it avoids
having to defend a 0.3-0.4 degC warm bias on Tmin in frost-sensitive regions. Fall
back to `Interval=1 hour&Method=Average` only for a station whose native record is
too dense to move.

## Cost of the re-run

Fetching is not the bottleneck. One year-chunk of temperature from HBRC:

```
1 year native      0.2s    8,761 points    445 KB
1 year @ hourly    0.7s    8,761 points    445 KB
1 year @ 30 min    0.4s   17,521 points    889 KB
```

The backfill chunks on calendar-year boundaries (`_year_chunks`), so temperature
alone over 2020-2026 is roughly 97 stations x 7 years = **~680 requests, well under
an hour of wall clock**. The real cost is inserting about 5.6M raw rows at hourly,
or more at native. That path is already batched — `bulk_upsert_observations` uses
`execute_values` at page_size 1000 with `ON CONFLICT (station_id, timestamp,
variable)`, so it is idempotent and re-runnable.

Realistic total, and this has not been benchmarked end to end:

1. re-fetch temperature, 7 councils, 2020 → 2026-07-27 — **1-3 hours**, resumable
   per station via `--skip-existing-before`
2. re-run `daily_aggregation` over ~230,000 station-days — set-based since
   2026-08-04, so **tens of minutes**
3. re-run `zone_aggregation` over the same span
4. rainfall re-fetch to correct the one-day shift, if it is worth doing separately

It is an overnight job, not a week. It can be done one council at a time and each
council is independently verifiable.

## Code fixes — APPLIED 2026-08-19, not yet deployed or committed

All five landed. Nothing has been re-fetched or re-aggregated yet: the archive is
still wrong, the pipeline just will not make it worse.

1. **`ingestion/sources/hilltop_util.py` (new)** — one place that decides Interval
   and Method together. `aggregation_query()` returns an empty fragment for a
   native request and `&Interval=...&Method=...` otherwise, with `Method=Total`
   for the cumulative variables (rainfall, evapotranspiration) and `Average` for
   everything else. There is no code path left that can emit an Interval alone.
2. **All eight Hilltop drivers** (hbrc, gw, tdc, gdc, wcrc, mdc, horizons, nrc)
   now build that fragment through the helper. TDC/GDC/NRC's local
   `total_method_measurements` sets are retired — the rule is central now.
3. **Native is the default** — `backfill_driver.py`, all seven driver CLIs and
   `run_ingestion.py` default `--interval` to None. **Cadence is unchanged**; the
   hourly region updates run exactly as before. This changes how finely each run
   samples, not how often it runs. Note it does raise raw row volume for the
   sub-hourly councils (MDC is 5-minutely, so ~6x its old 30-minute rate).
4. **`daily_aggregation.py`** — `MIN_TEMP_RECORDS_FOR_DAILY = 4`. Below it,
   temp_min/temp_max/temp_mean and both GDD columns are withheld rather than
   fabricated; `temp_record_count` is still written so a withheld day is auditable.
   The per-day path was a verbatim copy of `_build_record` despite a docstring
   claiming otherwise, so it now delegates — the guard could not have landed in
   only one of them.
5. **`zone_aggregation.py`** — temperature is gated on `temp_record_count` via
   CASE rather than WHERE, so a thin station drops out of the temperature pool
   while its rainfall, which is valid, still counts.
6. **`backend/scripts/check_daily_climate.py` (new)** — standing check on the
   three distributions that would have caught this: percentage of station-days
   with DTR exactly 0, percentage below the observation floor, and mean DTR
   against the NZ 7-12 degC norm. Exits 1 on breach so it can gate a cron. The
   thin-day denominator counts only days a station reported temperature at all,
   or rainfall-only networks read as 100 percent thin and the check becomes noise.

Verified end to end: HBRC Cricklewood Climate, a station that was degenerate on
37 of 59 recent days, now returns **8,368 records for 2023** against 356 before,
with no `Interval` in the URL.

## Original fix list, for reference

1. `backfill_driver.py` — drop the `--interval "1 day"` default. A silent default
   that changes the meaning of the data is the root cause here.
2. Hilltop drivers — for any instantaneous measurement, either omit `Interval` or
   pass an explicit `Method`. Never `Interval` alone.
3. `daily_aggregation.py` — guard on `temp_record_count`. Below some floor, emit
   NULL `temp_min`/`temp_max` rather than a fabricated zero-DTR day. A day that
   cannot support a min and a max should not claim one.
4. `zone_aggregation.py` — filter on `temp_record_count` before pooling stations,
   so one thin station cannot drag a zone mean.
5. Add a standing check: any station-day with `temp_max - temp_min = 0` is
   physically impossible outside instrument failure and should alarm. Mean DTR per
   source per month would have surfaced this within a week of 2020.

## Open questions

- The 1-2 day gap between the data going clean (07-27/28) and `320473d` (07-30).
- Whether the rainfall one-day shift is worth a separate correction pass, or should
  ride along with the temperature re-fetch.
- Whether ECan/NRC temperature should be brought into `weather_data_daily` as part
  of the same work.
