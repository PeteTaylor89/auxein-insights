# Automated live surface engine — proposal

**Date:** 2026-08-20 · **Status:** proposal, nothing scheduled
**Prereqs met:** `consolidate_db.py` built; `run_history.py` runs unchanged off DB
inputs; overlap bias study complete; 2024-01 → 2026-07 gap fill running.

Everything below is sized from measurements taken today, not estimates. Where a
number is a guess it says so.

---

## 1. What the engine has to produce

| product | cadence | source | status |
|---|---|---|---|
| `temp_mean` / `temp_min` / `temp_max` daily → monthly | daily | `weather_data_daily` | fill running |
| `rainfall` daily → monthly | daily | `weather_data_daily` | fill running |
| GDD (base 10) season | monthly recompute | monthly `mean` + `sd` bands | formula exists |
| **precipitation hourly** | hourly | raw `timeseries_observations` | **not built** |

---

## 2. Measured ingest lag — this sets every schedule

Per-source lag behind wall clock, 2026-08-20 15:46 NZ:

| lag | sources |
|---|---|
| 0.7–1.0 h | BOPRC, GW, TDC, TRC, MDC, NRC, SOUTHLAND, ECAN, HORIZONS, WCRC, GDC, HBRC |
| 1.7 h | HARVEST (13-hour publication delay is in `harvest.py`; the observed lag is smaller because it backfills) |
| 2.8 h | SYNOP_GTS (Ogimet) |
| **24.8 h** | **ECAN_AIR** |

`weather_data_daily` currently reaches D+0. Two things follow:

- **ECAN_AIR at ~25 h is the binding constraint on any daily product**, and it is
  10 Canterbury thermometers in the country's largest temperature deficit region.
  A D+1 daily fit would systematically omit them.
- ECAN_AIR carries **no rainfall**, so it does not constrain the hourly precip
  engine at all.

### Schedule this implies

| job | when | why |
|---|---|---|
| hourly precip | **H+2** | max rainfall-source lag is ~1 h; 2 h is one hour of margin |
| daily temp + daily rainfall | **D+2, 03:00 NZ** | rollup lands D+1, ECAN_AIR lands ~D+1, late data after |
| **weekly re-fit of D-9 … D-3** | Sun 04:00 NZ | late-arriving data silently changes a day that was already fitted; without this the surface and the DB disagree forever |
| monthly roll-up + GDD | 2nd of each month | needs the whole prior month final |

The weekly re-fit is not optional padding. `daily_aggregation.py` runs every 6 h
with `--lookback-days 3`, so the DAILY TABLE keeps changing for ~3 days after the
fact; a surface fitted once at D+2 would never see those revisions.

---

## 3. Measured compute cost

At 500 m (1,429,944 land cells), float32, this workstation:

| variable | stations | basis | per month | per day (fit only) |
|---|---|---|---|---|
| temperature | 247 | 1.43 GB, 8 s | 8.4 s | ~0.28 s |
| rainfall | 801 | 4.60 GB, 27 s | 28.6 s | ~1.0 s |

**Memory is the real constraint, not time.** Rainfall at float64 is **9.16 GB**
against ~10 GB free and gets OOM-killed — that is what killed the first attempt
today. `--dtype float32` halves it, and the CV statistic is *identical* (temp_mean
2022-02 = 1.119 at both), because the basis dtype affects grid projection, not the
station-space fit. **Run production at float32 and size the box at ≥16 GB.**

Daily engine cost: 4 variables × 1 day ≈ **2 s of fitting** plus one basis build
(~35 s if all four share a process). Trivial. The basis should be built once per
process and reused across variables — rebuilding it per variable is 90% of the run.

### Hourly precipitation cost
24 fits/day against ~1.0 s/fit = **~25 s/day of fitting**, plus a 27 s basis. Also
trivial. The cost is **storage and write time**, not arithmetic: 24 COGs/day at the
daily rainfall size.

---

## 4. Hourly precipitation — the gate that must come first

Measured over 2026-08-13 → 08-19, median distinct hours reporting per station-day:

| cadence | stations | median h/day |
|---|---|---|
| **hourly** | **620** | 21–24 |
| sub_daily_partial | 149 | 4–16 |
| daily_total | 3 | 2–4 |

**Rule, and it is a hard gate:**

- `hourly` (620) → eligible for hourly fits.
- `daily_total` (3) → **excluded from hourly fits entirely**, included in daily.
  Their value is a whole day's rain; interpolated as an hourly value it is wrong by
  ~24×. TDC station 393 posted 440.4 mm on one record on 2026-06-02 — a real value
  for a Kahurangi catchment, and catastrophic in an hourly field.
- `sub_daily_partial` (149) → **excluded until reconciled.** A station reporting 8
  hours a day is not reporting 8 hours of rain; it is reporting whatever accumulated
  between transmissions. Feeding it to an hourly fit understates the wet hours and
  invents dry ones.

Classification must be **per station, per era, on a rolling 30-day window**, and
persisted. It cannot be a per-source rule: TDC alone spans all three bands. The
Jul–Aug 2026 switch-on (47 → 620 gauges) proves cadence changes underneath you.

Cheap validator: for an `hourly` station the sum of its hourly increments must
reconcile to its daily total. A station where those disagree is misclassified.

### Honest limits on the hourly product
- **15 days of record.** No hourly normal, percentile or anomaly is possible for at
  least a season. Ship absolute values only.
- **The LENZ ratio does not transfer.** LENZ is mean *annual* rainfall; there is no
  hourly climatology to scale by. Start on the sqrt transform and do not re-open
  the ratio question until a year of hourly record exists.
- **620 gauges at ~8.5 km median spacing cannot resolve a 500 m hourly field.**
  Keep 500 m for contract consistency, but the effective resolution is far coarser
  and the product must not imply otherwise. The daily archive already runs −16.5 mm
  biased on heavy rain (≥40 mm); hourly will be worse.
- **Retention:** rolling window of hourly COGs (propose 90 days) plus a permanent
  hourly→daily roll-up. Keeping every hour forever is the dominant storage line.

---

## 5. GDD

No new band and no new fit. GDD comes from the monthly `mean` + `sd` bands:

```
n * [ (mu - B) * Phi(z) + sigma * phi(z) ],  z = (mu - B) / sigma
```

Measured bias +0.1 GDD, p5–p95 −6.7…+7.4 over 5,092 station-seasons. Naive
`max(0, monthly_mean - 10)` under-counts by 20% at cool sites through convexity.

- **Never drop `sd`.** The formula is unusable without it.
- Season is **Sep–Apr**, not Oct–Apr (`season.js`).
- `gdd_cumulative` in the Pro dashboard is base-0 Jul–Jun and must never be
  rendered as gdd10.

Recompute monthly, after the month closes. Cost is negligible — it is arithmetic
over two existing rasters.

---

## 6. Era separation — non-negotiable

The live era must never share `model_version` with the published archive. The
estimator is identical but the observations are not, and the measured provenance
offset is **tmean −0.27 °C, tmin +0.29, tmax −0.43**, stable to ±0.12 °C across
2020–2023.

`run_history.py` now takes `--model-version`; the fill runs as
**`tps-2.0.0-ridge-db`** against the archive's `tps-2.0.0-ridge`. `surface_run`
rows therefore stay separable, and `/surfaces` can serve 1986→now from one contract
with `model_version` as the only thing distinguishing eras.

**Publish the offset rather than hiding it.** That was already the archive's stated
honesty requirement; this is the number it referred to.

---

## 7. Failure modes to build in from day one

Every one of these has already happened at least once on this platform.

1. **A silent no-op reports success.** `run_ingestion` printed *Found 0 active
   Harvest stations* and exited 0 for a whole fleet backfill today (a CRLF in a
   station list). Every scheduled job must assert on a **row/cell count**, not an
   exit code.
2. **A newly-seeded source is invisible to the rollup.** ECAN_AIR sat in raw back
   to 2020 while `weather_data_daily` only ever saw it from 2026-08-15. After any
   seed or backfill, run `daily_aggregation.py --source X` over the full range.
3. **A frozen sensor passes every range check.** Two found today (−16.50 °C and
   3.96 °C with 288 records/day). The detector is a **pinned value** — share of
   days in a month whose `temp_min` rounds to the same 0.1 °C. Run it monthly.
4. **A one-point spike survives the range gate.** `MAX_DTR = 30.0` now screens it
   in `consolidate_db.py`; keep the screen at fit time, not only at ingest, because
   the fit must never trust its input.
5. **A station moves label and looks dead.** Three BoP thermometers moved
   `Primary` → `Operational` on 2026-08-01 and vanished silently. A
   per-(station, variable) last-seen watchdog catches both this and a real outage;
   `ingestion_log` catches neither.
6. **cv_rmse is not a network-quality metric.** Adding the Harvest stations made it
   *worse* while adding real information — they sit in cold-air-drainage valleys
   their neighbours cannot see. Gate network decisions on land-distance coverage;
   use cv_rmse only to check the estimator.

---

## 8. Proposed build order

1. **Cadence classification table + rolling job.** Gates everything hourly. ~1 day.
2. **`run_live.py`** — one day, all four variables, one shared basis, writes daily
   COGs + a `surface_run` row at `granularity='daily'`. The `statistic`-is-NULL
   partial unique index in `surface_index_tables` already anticipates daily rows.
3. **Daily schedule at D+2** plus the weekly D-9…D-3 re-fit.
4. **Monthly roll-up + GDD**, on the archive's band vocabulary so `/surfaces`
   serves one contract across both eras.
5. **Hourly precip engine**, gated on (1), forward-only, 90-day retention.
6. **Watchdogs** (§7.1, §7.3, §7.5) — cheap, and each one is a defect already paid
   for once.

Cut line if it slips: hourly precipitation. It has 15 days of record, cannot
support a normal for a season, and nothing downstream depends on it yet. The daily
temperature products are what the season needs.
