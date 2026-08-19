# Ingestion status report — completeness, failures, poisoned sites

2026-08-19. Written by the ingestion/backfill agent. Updated after acting on it —
see §6 for what was fixed. General QC envelopes remain the other agent's workstream.

Handoff note: I did **not** receive any message about
`BOPRC_MET_STOPS_2026-08-01.md`. I found it on disk. If inter-agent messaging is
expected to work, it is not working — assume docs-on-disk is the only channel.

---

## 1. Record completeness, first observation to current

`weather_data_daily`, every source, whole record:

| source | first | last | span (d) | days present | missing | stations | station-days |
|---|---|---|---|---|---|---|---|
| GDC | 2020-01-01 | 2026-08-19 | 2423 | 2423 | **0** | 64 | 101,701 |
| WCRC | 2020-01-01 | 2026-08-19 | 2423 | 2423 | **0** | 53 | 110,621 |
| GW | 2020-01-01 | 2026-08-19 | 2423 | 2423 | **0** | 86 | 197,824 |
| HBRC | 2020-01-01 | 2026-08-19 | 2423 | 2423 | **0** | 84 | 202,950 |
| TDC | 2020-01-01 | 2026-08-19 | 2423 | 2423 | **0** | 43 | 103,347 |
| MDC | 2020-01-01 | 2026-08-19 | 2423 | 2423 | **0** | 45 | 103,294 |
| HORIZONS | 2022-01-01 | 2026-08-19 | 1692 | 1692 | **0** | 116 | 108,719 |
| BOPRC | 2020-01-01 | 2026-08-17 | 2421 | 2421 | 0 | 65 | 145,526 |
| ECAN | 2020-01-01 | 2026-08-17 | 2421 | 2420 | 1 | 102 | 227,949 |
| NRC | 2020-01-01 | 2026-08-17 | 2421 | 2420 | 1 | 41 | 97,111 |
| SYNOP_GTS | 2020-01-01 | 2026-08-17 | 2421 | 2417 | 4 | 52 | 108,140 |
| SOUTHLAND | 2025-07-30 | 2026-08-17 | 384 | 383 | 1 | 53 | 20,249 |
| HARVEST | 2025-09-01 | 2026-08-17 | 351 | 350 | 1 | 43 | 14,536 |
| TRC | 2025-08-11 | 2026-08-17 | 372 | 371 | 1 | 31 | 10,492 |

**Calendar coverage is essentially complete** — at most 4 missing days on any
source. The daily record starts **2020-01-01** everywhere it can; Horizons starts
2022, and Southland / Harvest / TRC are forward-only APIs with no deep history and
never will have one.

**The 2-day lag on seven sources is the daily ROLLUP, not ingestion.** Raw ingest is
current — every source logged to `ingestion_log` between 01:05 and 01:17 today. The
seven councils showing `last = 08-19` are the ones I re-aggregated manually during
the temperature backfill; the rest sit at 08-17 because `daily_aggregation` has not
run for them since. Worth confirming that job is scheduled at all.

## 2. Current usable temperature network

Last 30 days, stations with >=4 obs/day and a plausible, non-flat daily range:

| source | reporting | usable | | source | reporting | usable |
|---|---|---|---|---|---|---|
| SYNOP_GTS | 48 | 48 | | TRC | 17 | 17 |
| SOUTHLAND | 31 | 31 | | BOPRC | 14 | 14 |
| MDC | 30 | **29** | | GW | 12 | 12 |
| HARVEST | 21 | 21 | | GDC | 10 | 10 |
| HBRC | 20 | 20 | | TDC | 7 | 7 |
| HORIZONS | 20 | **19** | | WCRC | 2 | 2 |

**232 reporting, 230 usable.** ECAN (102 stations) and NRC (41) contribute **no
temperature at all** — rainfall only.

## 3. Sources not completing, and errors

### 3.1 NOAA — NOT a failure. My error.
Last `ingestion_log` entry 2026-08-03, which I first reported as "stopped 16 days
ago". **It was never scheduled.** NOAA appears in no workflow; `run_ingestion`
describes it as "backfill/bootstrap", and the only NOAA path in CI is a manual
`workflow_dispatch` option on `synop-live.yml`. The 2026-08-03 entry was a hand-run
backfill. Nothing is broken — I misread an unscheduled tool as a stopped job.

It works fine when invoked; that is how the 2025 gap below was diagnosed.

### 3.2 GW — 321 failures in 7 days, ongoing
Still failing as of the 01:05 run today. All the same shape, `No response for <X>`:

| measurement | failures | stations |
|---|---|---|
| Rainfall | 154 | **77** |
| Soil Temperature 10cm | 26 | 13 |
| Soil Moisture Content | 24 | 12 |
| Relative Humidity | 20 | 10 |
| Barometric Pressure | 16 | 8 |
| Air Temperature | 13 | 6 |
| others (wind, solar, Lawa variants) | ~68 | — |

**CORRECTED after investigation — this is noise, not data loss.** The per-station
framing above is wrong. Grouping the log by minute shows GW fails in WHOLE RUNS:

```
2026-08-18 23:05   SUCCESS  83   FAILED   0
2026-08-19 00:05   SUCCESS  84   FAILED   0
2026-08-19 01:05   SUCCESS   0   FAILED 160     <- entire run
2026-08-19 01:50   SUCCESS  83   FAILED   0     <- manual re-run, clean
```

Every request in a run fails together, so it is a brief GW endpoint outage, not 77
sick stations. **And it causes no data loss**: the incremental fetches from the last
stored timestamp, so the next successful run backfills the gap. GW rainfall coverage
is continuous — 77 stations every hour for the last 30 hours, no holes.

Fixed anyway: **GW, WCRC and HORIZONS had no retry logic**, while HBRC/MDC/TDC/GDC/NRC
all retry 3x with 5s/15s/45s backoff. Added to all three. That absorbs sub-minute
blips; a multi-minute outage will still fail a run, and that is acceptable because it
self-heals. The value is fewer false alarms, not recovered data.

### 3.3 ECAN — a code defect, not a network one
`string indices must be integers, not 'str'` — 36 occurrences on
`ECAN_MOUNT_BYRNE`, 5 on `ECAN_NORTH_ESK`.

**FIXED.** ECAN's JSON is converted from XML, so a site with exactly ONE record in
the 2-day window returns `item` as a bare object instead of a one-element list.
Iterating that dict yields key strings and the first `rec['DateTime']` raises. Mount
Byrne is a low-rainfall site that often records a single tip per window, which is why
it hit this repeatedly and wetter sites never did. `fetch_site_data` now normalises a
dict to a one-element list.

### 3.4 BOPRC met variables dead since 2026-08-01
Independently confirmed, exactly as `BOPRC_MET_STOPS_2026-08-01.md` describes.
Distinct BoP stations reporting, by week:

| week | temp | rh | pressure | rainfall |
|---|---|---|---|---|
| 2026-07-13 | 14 | 12 | 16 | 52 |
| 2026-07-20 | 14 | 12 | 16 | 52 |
| 2026-07-27 | 14 | 12 | 16 | 52 |
| **2026-08-03** | **4** | **2** | **6** | 52 |
| 2026-08-10 | 4 | 2 | 6 | 52 |
| 2026-08-17 | 4 | 2 | 6 | 52 |

**I could not run the proposed `GetCapabilities` label test.** `sos.boprc.govt.nz:80`
times out from this machine — BoP allowlists by IP and this host is not on it
(`data.hbrc.govt.nz:443` from the same shell is reachable, so it is not general
network failure). The cron reaches BoP fine, so **that test has to run from the CI
runner or another allowlisted IP.** The hypothesis remains untested, not disproven.

## 4. Poisoned sites

This is the part that would most damage an interpolation, and none of it is
filtered today.

### 4.1 Two stations are actively emitting garbage RIGHT NOW

| station | value | records/day | since |
|---|---|---|---|
| `HORIZONS_HAUTAPU_AT_MOUNGANUI_STATION` | **−100.00 °C** | 144 | ≥15 days, still today |
| `MDC_LAKE_ELTERWATER` | **0.00 °C** | 288 | ≥15 days, still today |

Neither is sparse data — they are dense, confident, and wrong. `−100` is a
missing-data sentinel being ingested as an observation; a hard `0.00` at 288
records/day is a dead sensor. **21,023 raw rows of exactly −100.0** exist across 2
Horizons stations.

A single −100 °C station inside a thin-plate spline will drag an entire region.

### 4.2 Impossible values across the whole record

| check | rows | stations | worst |
|---|---|---|---|
| temp_min < −25 °C | 237 | 10 | **−6999.00** (TDC), −100.00 (HORIZONS, HBRC) |
| temp_max > 45 °C | 35 | 6 | **278.12** (WCRC_GREY_RV_CONICAL_HILL_NEW, 28 days) |
| humidity outside 0–100 | 1,480 | 18 | −90.50 (HORIZONS), 102.90 (MDC_RED_HILLS) |
| rainfall negative | 3 | 1 | −8.15 (HBRC_LAKE_WAIKOPIRO_BUOY) |
| rainfall > 500 mm/day | 40 | 12 | **232,036.00** (WCRC_HAAST_RV_ROARING_BILLY) |
| solar negative | 12,235 | 18 | −13.10 (TDC_MOTUEKA_SPORTSPARK) |

Raw temperature outside a generous NZ envelope (−25…45 °C): **25,835 rows across 16
stations** — 0.075% of the 34.4M temperature rows.

Two judgement calls worth making explicitly rather than filtering blind:

- **Not all rainfall >500 mm is bad.** `WCRC_CROPP_RV_WATERFALL` at 534 mm and
  `WCRC_HAAST_RV_CRON_CK` at 504 mm are entirely plausible — Cropp River holds the
  NZ daily record at 1086 mm. 232,036 mm and 10,208 mm are not. A flat threshold
  would discard real West Coast extremes, which are exactly the values a rainfall
  surface most needs to get right.
- **Small negative solar is instrument behaviour, not corruption.** Pyranometers
  read slightly negative at night from thermal offset. Values here are −1 to −13.
  Clip to zero; do not discard the station.

### 4.3 Stuck sensors — dense, plausible-looking, and flat

Stations with high record counts and zero daily range, i.e. invisible to any
missing-data or range check:

| source | station | flat days | records/day | span |
|---|---|---|---|---|
| HORIZONS | HAUTAPU_AT_MOUNGANUI_STATION | 57 | 141 | 2024-01-08 .. current |
| MDC | PELORUS_AT_1446 | 51 | 288 | 2025-05-18 .. 2025-08-20 |
| MDC | LAKE_ELTERWATER | 44 | 285 | 2026-07-07 .. current |
| HORIZONS | AHUAHU_AT_TE_TUHI_JUNCTION | 37 | 142 | 2024-05-31 .. 2024-07-09 |
| WCRC | PIGEON_CREEK_CWS | 19 | 143 | 2023-07-11 .. 2023-10-16 |
| WCRC | GREY_RV_CONICAL_HILL_NEW | 10 | 96 | 2023-04-15 .. 2024-07-18 |

## 5. What changed today, and what did not

**Changed (uncommitted, undeployed):** the Hilltop temperature archive was
re-fetched at native resolution and re-aggregated — see
`HILLTOP_TEMPERATURE_DEGENERATE_2026-08-19.md`. 34.4M temperature rows, mean DTR
now 7.81–10.55 °C. A `|value| >= 1e6` storage guard now rejects the
`numeric(10,4)`-overflowing values; it does **not** catch −100, −6999 or 278.12,
which are all storable.

**Not changed:** no QC/QA filtering, no range clipping, no stuck-sensor detection,
no station quarantine. Rainfall untouched. `zone_aggregation` not re-run.

**For whoever designs the QC layer:** every failure found today — this session's
four and the BoP one — reported success. `ingestion_log` shows SUCCESS for a run
that fetched 3 of 4 variables; a station emitting −100 °C at 144 records/day looks
healthier by row count than a good station. Row counts and status codes cannot see
any of it. What does see it: per-(station, variable) last-seen watchdogs, value
envelopes, and daily-range distributions.


---

## 6. Actions taken 2026-08-19 (uncommitted, undeployed)

**Quarantine — the two live-poisoning stations.** Marked `quality='QUARANTINED'` on
the raw rows rather than deleting them: a failed sensor is evidence, and deleting it
makes the failure unprovable and indistinguishable from "never reported".

| station | scope | quarantined | retained |
|---|---|---|---|
| `HORIZONS_HAUTAPU_AT_MOUNGANUI_STATION` | all time | 27,617 | 0 |
| `MDC_LAKE_ELTERWATER` | from 2026-07-07 | 12,379 | **443,553** |

The scoping matters. Hautapu has been unreliable since 2023-12 (56% of rows exactly
−100, plus a −61→−100 drift) and is written off. Lake Elterwater is the opposite:
only 2.9% of its rows are 0.00 and **most historical zeros are real** — it is a lake
station that genuinely reaches freezing. A blanket `value = 0` rule would have
destroyed ~400 legitimate winter readings. It only went stuck on 2026-07-07, so five
years of good data survive.

Carried by three changes: `daily_aggregation` excludes QUARANTINED rows from both
aggregate paths; the drivers skip quarantined variables so no new poison arrives; the
reason, onset and flag date are recorded in `weather_stations.notes.quarantine`.

Verified: Hautapu 0 temp rows / 962 NULL days, Lake Elterwater 1,576 days retained at
a plausible −4.27…33.10 °C, **no live stuck sensors remain**.

**Retry logic** added to gw / wcrc / horizons (see §3.2).

**ECAN single-item parse** fixed (see §3.3).

### Scheduling — the rollup job existed, the design did not heal

`daily-processing.yml` was already scheduled (05:00/06:00 UTC). The defect was what
it ran: `--date <yesterday>` and nothing else, so a run that was skipped, failed or
dropped by the scheduler left that day permanently un-aggregated — raw rows present,
daily row never created, workflow green. That is how 2026-08-12 lost a full day of
SYNOP and how seven sources drifted two days behind.

- `run_daily_processing.py` now aggregates a **window** (`--lookback-days`, default
  3) instead of a single day. `daily_aggregation` is idempotent and set-based, so
  overlapping windows repair any hole inside them for almost no cost.
- New **`daily-aggregation.yml`**, every 6 h at :35 — rollup only, skipping the
  genuinely-daily phenology/disease/zone steps. Offset from the hourly ingestion at
  :05 so it reads a settled window instead of racing the writers. It ends with
  `check_daily_climate.py`, so a rollup that completes but produces degenerate
  statistics fails the run rather than passing quietly.

### The 2025-08-30 → 09-02 SYNOP gap

Not fillable from the authoritative source. NOAA GHCN-Daily, probed day by day on
two stations, has a **wider** hole than we do:

```
08-28  1 row     09-01  0 rows
08-29  1 row     09-02  0 rows
08-30  0 rows    09-03  1 row
08-31  0 rows    09-04  1 row
```

Running NOAA against the gap upserted 0 rows. But SYNOP's **Ogimet** transport does
have the reports — 1,032 obs for Auckland alone across those dates — so the gap is
recoverable from the provisional live tier even though the authoritative daily
product never received them. Fleet-wide backfill run 2026-08-19.

Worth noting for anyone planning a NOAA-based repair: "authoritative" does not mean
"more complete". For this window GTS/Ogimet is the only source that has the data.

### Still open
- BOPRC met stop — untestable from here, needs an allowlisted IP.
- ~99 impossible station-days on other stations (−6999 TDC, 278.12 °C WCRC). Isolated
  bad days, not dead stations — value-envelope work, and the Cropp River case in §4.2
  is why those thresholds want setting once, carefully, rather than guessed at.
