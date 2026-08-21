# Waikato Regional Council — KiWIS probe, 2026-08-21

**Status: BUILT, SEEDED AND BACKFILLED 2026-08-21.** 51 stations seeded, elevations
filled from the DEM, backfilled to 2020, wired into all six schedule points.
Uncommitted and therefore NOT yet running on the box — `deploy.sh` resets to
`origin/main`.

Files: `ingestion/config/waikato_sites.py`, `ingestion/sources/waikato.py`,
`ingestion/scripts/seed_waikato_from_probe.py`, `ingestion/scripts/probe_kiwis.py`.

> **One finding from this build outgrew it.** Validating the very first station
> exposed rain gauges stuck at exactly 0.0 while reporting full telemetry — and the
> detector written for it found **43 runs over 37 stations across 9 of the 15
> sources**, all stored `quality = 'GOOD'`. `WCRC_GREYMOUTH_AERO_EWS` reads 0.0 mm
> for all twelve months of 2020 and 238-320 mm/month from 2021. **All 43 have been
> quarantined — 384,396 raw rows flagged, 7,854 daily values cleared** — and a
> re-survey now returns nothing. See `backend/scripts/quarantine_stuck_rainfall.py`.

Reproduce everything below with:

    python ingestion/scripts/probe_kiwis.py --host envdata.waikatoregion.govt.nz:8080 \
        --out waikato_kiwis.json
    python ingestion/scripts/probe_kiwis.py --report waikato_kiwis.json
    python ingestion/scripts/probe_kiwis.py --report waikato_kiwis.json \
        --host envdata.waikatoregion.govt.nz:8080 --quality --year 2025

`probe_kiwis.py` is written against KiWIS the *product*, not against Waikato — any
other agency found running it is one `--host` away. The dump stays gitignored
(regenerable), unlike the browser-captured `waikato_all.json`.

## The headline

Waikato is reachable, and by a far better route than either of the two we found
on 2026-08-04 and wrote off.

    http://envdata.waikatoregion.govt.nz:8080/KiWIS/KiWIS

This is **KiWIS** — Kisters' documented machine interface onto their WISKI
archive. It is a *third* Waikato host, unrelated to the two in
`project_council_platform_discovery`:

| host | what it is | status |
|---|---|---|
| `www.waikatoregion.govt.nz/api/v1/enviromap/` | the public map's private XHR | Imperva WAF, rejects scripted clients |
| `api.waikatoregion.govt.nz` | Azure APIM gateway | route unguessable, 404 on every probe |
| **`envdata.waikatoregion.govt.nz:8080/KiWIS`** | **KiWIS / WISKI** | **open, keyless, no WAF, 0.25 s from a NZ desktop** |

No disclaimer POST, no session, no anti-forgery token, no allowlist — it
answered a cold request from a desktop. That is a materially different posture
from the AQUARIUS three, and it means **the 2026-08-05 "5 councils all blocked on
an access request" conclusion is now wrong for Waikato.**

`http://` on port 8080 only. Same shape as BoP: do not "fix" it to https.

## What is actually there

Complete inventory via `getTimeseriesList&parametertype_name=*` — 11,409 series,
overwhelmingly water. The meteorological subset:

| parametertype | series | distinct stations | live (<=30 d) |
|---|---|---|---|
| Precipitation | 529 | 43 | **37** |
| Air Temperature | 60 | 15 | 13 |
| Barometric Pressure | 43 | 12 | 1 |
| Wind Speed | 31 | 8 | 6 |
| Wind Direction | 22 | 8 | 6 |
| Humidity | 17 | 8 | 7 |
| Solar Radiation | 1 | 1 | 0 (dead 2026-02) |

**51 live stations total, all with coordinates.**

**There is no soil moisture, no soil temperature, no ET and no dew point
anywhere in KiWIS** — confirmed against the full parametertype enumeration, not
guessed. Note this *contradicts* the enviromap capture, which advertised SoilM 9
and SoilT 9. The two systems publish different subsets of the same network:
enviromap is the curated public-map view, KiWIS is the archive. If soil is ever
wanted it has to come from enviromap, which is still WAF-blocked.

Conversely KiWIS is far richer where it counts — **37 live rain gauges against
enviromap's 26, and 13 air temperatures against 4.**

## Why it is worth building: rainfall

Waikato was the largest single component of the 27,710 km² rainfall deficit
(`project_surface_coverage_deficit`). This closes a big share of it.

**Zero overlap with the existing network.** Nearest active station to each of the
51 candidates: minimum 5.0 km (a Hamilton air-quality site vs Hamilton Aws — a
different station, not a republication), and the *rainfall* gauges sit **20–53 km**
from anything we hold. Nearest neighbours are BOPRC, SYNOP_GTS, HORIZONS and
HBRC — every one of them *outside* the region. Waikato's interior is empty in our
network, exactly as the deficit study said.

Land-to-nearest-live-rain-gauge, 11,494-point ~5 km grid inside `nz_land`,
against stations with a `rainfall_mm` daily row in the last 90 days:

| | before | after +37 |
|---|---|---|
| p50 | 10.4 km | 9.8 km |
| **p90** | **33.9 km** | **29.1 km** |
| **share of NZ land >30 km from a gauge** | **12.8 %** | **9.4 %** |

3.4 percentage points of 264,667 km² is **~9,000 km² of land** brought inside
30 km of a gauge, from one source.

> Method note: these are NOT the same numbers as the §3a deficit study, which
> measured the 2020-23 station set and reported p90 99.0 km. This measures
> *currently reporting* gauges. Compare it to itself, not across studies.

**And the record is deep.** Earliest rainfall is **1976-03-09** (Kiko Road) —
second only to MDC's 1963 across the whole platform. Depth of the live set by
decade of first observation: 1970s 1, 1980s 7, 1990s 6, 2000s 10, 2010s 14,
2020s 13. Twenty-four live stations predate 2010, which is what makes this
useful to the 1986-2023 archive and not just the forward feed.

## Why temperature is a much weaker case

13 live air temperatures, but **seven of them are one site**: Waikato site 1342
is Hamilton's air-quality cluster (Claudelands, Bloodbank, Grey St, Lorne St,
Cambridge Rd, Wairere Dr, plus the dead ECNZ Peachgrove Rd), all within ~9 km of
Hamilton Aws. Four of those — the ones suffixed **"Clarity"** — are low-cost
Clarity Node sensors installed 2023-12, not screened climate instruments.

The `notes.siting = "urban_air_quality"` treatment from
`project_ecan_air_source` applies here and then some. The interpolation bias
study must split on it. **Do not read "13 new thermometers" as 13 new
locations** — the effective count is about six: Hamilton, Te Kuiti (Waitomo DC
Yard), Tokoroa (SWDC Billah St), Morrinsville, Thames, Playcentre Farmers Road.

Genuine depth exists though: SWDC Billah St from 2001, Playcentre Farmers Road
2005, Waitomo DC Yard 2006, Gilles Avenue 2007, Claudelands 2014.

## Contract

`?service=kisters&type=queryServices&datasource=0&request=...&format=...`

Only `datasource=0` exists — 1 and 2 return `Datasource parameter not found in
config`.

- **`getStationList`** — 736 stations. `returnfields` accepts `site_no,
  site_name, station_no, station_name, station_id, site_id, station_latitude,
  station_longitude, station_carteasting, station_cartnorthing, river_name,
  catchment_name, object_type`. **`station_elevation` is NOT a valid field** —
  elevation still has to come from `fill_elevation_from_dem.py`.
- **`getTimeseriesList`** — **refuses an unfiltered request**
  (`MissingParameterValue: This datasource does not allow getTimeseriesList
  requests without filters`). Filters accept `*` wildcards, so
  `parametertype_name=*` is the way to enumerate everything. `coverage` in
  `returnfields` yields `from`/`to`.
- **`getTimeseriesValues`** — `ts_id` (comma-separated, several series in one
  response), `from`/`to` or `period=P2D`.
  `returnfields=Timestamp,Value,Quality Code`.
- **`getQualityCodes`** — the NEMS code table. Read it; see below.

`format=dajson` is the one to use: `[{"ts_id":…,"rows":…,"columns":"Timestamp,Value",
"data":[[ts,val],…]}]`, one object per requested series.

Timestamps carry an **explicit ±12:00/13:00 offset**, so `fromisoformat` gives a
correctly aware datetime and there is **no DST ambiguity** — none of the
`_dedupe`/`_utc_key` spring-forward trouble Hilltop caused.

## Six traps

**1. Training stations are in the catalogue.** Two families, and both would have
seeded silently:

- `GW_Training_Master`, `GW_Training2`…`GW_Training7` — 7 series, carrying
  *barometric pressure*, which is 7 of the 12 pressure stations in the whole
  network.
- `Doug_DP-Training2023`, `Jess_DP-Training2023`, `Tane_DP-Training2023` under
  **`site_no=99999`**.

Exclude on both `/training/i` in the station name **and** `site_no = 99999`.

**2. The `to` on climatology series runs into the future, so it cannot judge
liveness.** `60 – LongTermMonthMax` at Pinnacles has `to = 2026-12-01`. Take
liveness from the *observation* series only (`00 - Continuous*`, `10 - Hour*`,
`20 - Day*`) — this is the WCRC "liveness is judged per weather series" rule
again, in a new disguise. Keyed on the naive max, all 58 candidates look live;
keyed correctly, 7 are stale, one by 4,689 days.

**3. Quality code 130 is SYNTHETIC — modelled infill, not an observation.**
`getQualityCodes` is NEMS-aligned: 0 Excellent, 40 Good(600), 70 Fair(500), 100
Poor(400), **130 Synthetic(300)**, 160 Non-verified(200), **228 estimated /
generated / forecast / extrapolated**, 231 use-with-caution, 234
external-doubtful, 254 provisional/unassessed.

No other source we ingest labels its infill. Feeding code 130 into
`weather_data` would put a model's own output back in as an observation and then
fit the TPS against it. **Reject 130, 228 and 234 at parse time; keep 254
(provisional) — everything live is provisional.**

Measured over the chosen rainfall series at 14 live stations:

| code | | 2015 | 2025 |
|---|---|---|---|
| 254 | provisional/unassessed | 65.00 % | 84.44 % |
| 210 | standard documented procedure | 32.48 % | — |
| 70 | Fair (500 NEMS) | — | 12.26 % |
| 100 | Poor (400 NEMS) | — | 3.28 % |
| 231 | **use with caution — possible data problems** | **2.29 %** | — |
| **130** | **SYNTHETIC** | — | **0.01 % (43 values)** |
| **-1** | **not in `getQualityCodes` at all** | **0.23 %** | **0.02 %** |

Two things to carry forward. Synthetic is *rare but real* — 43 values is exactly
the size that reads as noise in a row count and still ruins a day's national fit,
which is the [[project_qc_physical_range]] lesson. And **`-1` is not in the code
table**, which starts at 0; the table is not a closed vocabulary, so the client
must treat an unrecognised code as suspect rather than assuming it is good.

**4. There is a hard row cap, not a time cap.** Pinnacles event rainfall:
1 year = 445 KB fine, 2 years = 209,066 rows / 7.1 MB fine, 3 years = HTTP 500
`DatasourceError`. Because it is a *row* cap, a fixed chunk length is wrong — a
busy station fails where a quiet one succeeds. Use `ecan_air.py`'s halving retry.

**5. `Hour.Total` is hour-STARTING — do NOT apply the ECAN_AIR shift.** Verified
directly: a tip at `2026-08-14T05:09:06+12:00` in the event series appears in the
hour labelled `05:00` in `Hour.Total`, and a full day sums to 39.50 mm in both.
This is already our convention. ECAN_AIR's `_hour_start` exists because *that*
feed is hour-ending; copying it here would shear every daily total by an hour.

**6. The host refuses connections under rapid or concurrent load.** A 37-station
sweep fired back-to-back lost 5 stations to `WinError 10060` (connect timeout),
and a second script running against the host at the same time failed outright.
The host recovers by itself — the same sweep with **1 s between requests and a
3/6/9 s backoff completed 28 fetches with 0 failures.** So a failure here is
usually pace, not a broken route, and it is a silent one: the failures land as
per-station exceptions that a driver would happily log and move past. Serialise;
do not parallelise. Note the box already runs three sources concurrently in
`run_all.sh`, but those are three *different* hosts.

## Series selection

`ts_path` is `site_no/station_no/stationparameter_name/ts_shortname`, e.g.
`234/9/Precip/CmdTotal.P`. Each station carries 10-20 derived series; pick one
per (station, variable) by preference chain:

    rainfall  10 - HourTotal > 00 - Continuous5m.P > 00 - Continuous.P > 00 - Continuous.O
    others    10 - HourMean  > 00 - Continuous.P   > 00 - Continuous.O

**`Hour.Total` is an exact aggregate of the event series** (39.50 mm = 39.50 mm
over the same day) at 24 rows instead of 103, so preferring it is free accuracy
and a 4x volume saving. It is available at 28 of the 37 live rainfall stations;
the other 9 fall back to `Continuous5m.P` at 105 k rows/year.

Resulting choice across the 51 live stations: HourTotal 28, HourMean 24,
Continuous5m.P 9, Continuous.O 8, Continuous.P 1.

Excluded as derived, manual or QA: `60 – LongTerm*`, `61 - LongTermDay*`,
`40 - YearTotal`, `30 - Month*`, `25 - WeekTotal`, `20 - DayAccum`,
`20 - DayMovTotal`, `05 - Observer*` (flask/dip manual readings),
`90 - Migrated_*`, `99 - *_Old`, `01 - CurrentMonthAccum`, `.P2`.

## Backfill size

~**20.2 M raw rows** at full depth, ~**8.8 M** from 2020 onward. Dominated by the
9 five-minute rainfall stations.

## Build checklist

1. `ingestion/config/waikato_sites.py` — `API_BASE`, `DATA_SOURCE = "WRC"`,
   `REGION = "Waikato"`, measurement map, quality-code reject set, chunking.
2. `ingestion/sources/waikato.py` — KiWIS client. **New platform class**; nothing
   existing is reusable beyond `db_util`, `window_util`, `http_util`.
3. `ingestion/scripts/seed_waikato_from_probe.py` — reads the banked probe JSON.
4. `fill_elevation_from_dem.py --source WRC`.
5. Wire into **all six** places: `run_ingestion.py` (import/choices/dispatch),
   **`ingestion/run_all.sh` `SOURCES=`** — the actual schedule —
   `weather-ingestion.yml` matrix *and* dispatch choices,
   `backfill_driver.SOURCE_MODULE` (style `range`).
6. `backend/scripts/daily_aggregation.py --source WRC` for history.

## What the build added beyond the scope

**A unit guard at seed time.** Every WRC series is already canonical — wind is
uniformly "meter per second" across all 31 series, pressure "hectopascal" across 43
— which is unusual and must not be assumed: HBRC, GDC and TDC all publish wind in
km/h, and Horizons publishes `Wind Speed` in m/s at 18 sites, km/h at 2 and mm/s at
1. `EXPECTED_KIWIS_UNITS` is asserted per station and a mismatch REJECTS the station
rather than seeding it. A silent unit swap is unrecoverable — the numbers stay
plausible forever — and the check costs one comparison. Verified by injecting a
km/h series into the probe dump: the seeder refused that station and seeded the
other 50.

**A stuck-at-zero rainfall detector**, `backend/scripts/quarantine_stuck_rainfall.py`.
Written because the first WRC station validated —
`WRC_20_HENDERSON_ROAD_HORSHAM_DOWNS` — returned a *full* complement of 5-minute
readings, 8,928 rows in a 31-day month, every one exactly `0.0000`, continuously
from 2024-10 to 2025-04.

The detector is a RUN, never a value. `value = 0` as a rule would be the
MDC_LAKE_ELTERWATER mistake in new clothes — a blanket zero rule there would have
destroyed 442k genuinely-zero readings from a lake that really does reach freezing.
Three conditions together: the month totals exactly 0.0 mm, **and** the gauge
reported on ≥26 days of it, **and** it persists ≥2 consecutive months. No NZ site
has gone two calendar months with a working gauge and no measurable rain (the
longest recorded dry spell is 71 days), so the threshold sits outside the
climatological envelope and a real drought cannot trip it.

**It is not a Waikato problem.** Run across the network it finds 43 runs over 37
stations in 9 of 15 sources — 34 in GDC, GW, HARVEST, HBRC, HORIZONS, MDC, NRC and
WCRC, plus 9 in WRC itself. The proof case,
which rules out an ingestion artefact rather than assuming: `WCRC_GREYMOUTH_AERO_EWS`
reads exactly 0.0 mm for all twelve months of 2020 (366 daily records, raw rows
present, all `0.0000`, all stored GOOD) and then 238-320 mm every month of 2021 —
normal for Greymouth's ~2,900 mm/yr. Same station, same cadence, same code path, so
it is the gauge and not the pipeline, and specifically *not* the Hilltop
interval artefact, which would have hit 2021 identically.

Every guard we have misses this. The physical-range gate passes it (0.0 mm is the
most common legitimate reading in the database); the record-count guards pass it
(the station is FULL, not thin — 288 records/day is the *healthy* signature);
`ingestion_log` passes it; per-day and per-month row counts look perfect because the
rows really are all there; and no individual value looks absurd. `cv_rmse` will not
flag it either, because the station agrees with itself.

It is also the worst *direction* of error for a rainfall surface. A stuck gauge does
not add noise, it adds a confident zero, and the spline drags the fitted field down
over a wide radius. Greymouth 2020 puts 0 mm where 2,900 mm belongs, inside the
region that already carries the largest coverage deficit in the country.

**All 43 are quarantined** (Pete's call, 2026-08-21): 384,396 raw rows flagged and
7,854 daily rainfall values cleared, and a re-survey returns nothing. By source: WRC
271,872 rows over 6 stations (its 5-minute gauges dominate the count), HARVEST
105,918 (2), HORIZONS 2,523 (10), GW 1,951 (6), WCRC 1,156 (5), NRC 610 (2), HBRC
183 (3), MDC 122 (2), GDC 61 (1).

**This changes historical rainfall fields, so any surface fitted before 2026-08-21
was fitted against the fabricated zeros and should be rebuilt.**

### The B4.1 collision — quarantining alone does NOTHING

`daily_aggregation.py` correctly excludes QUARANTINED rows, so a re-aggregated day
computes `rainfall_mm = NULL`. But `rainfall_mm` is not in that script's
`TEMP_AUTHORITATIVE_COLUMNS`, so it is written through the B4.1 guard —
`COALESCE(EXCLUDED.rainfall_mm, existing.rainfall_mm)` — which exists for a good
reason: GHCN-Daily PRCP is a legitimate second writer that a precip-less hourly
source must not clobber.

The incoming NULL therefore **loses to the stored 0.0, and the fabricated zeros
survive a re-aggregation that reports success.** That is the identical collision
that let 5,483 fabricated temperature extremes survive the 2026-08-19 repair, in the
one column where the guard genuinely has to stay. The script nulls the daily columns
**explicitly by station and date window** rather than trusting a rebuild.

Generalise it: **any quarantine of a non-`TEMP_AUTHORITATIVE` column must clear the
daily table directly. Re-aggregation is not sufficient and will look like it
worked.**

## Open — needs Pete

**Licence: CC BY 4.0**, confirmed by Pete 2026-08-21 — attribute Waikato Regional
Council. Recorded in `notes.licence` on all 51 stations.

**1. The other 33 stuck-at-zero runs.** Quarantining them is a data decision with a
surface rebuild attached. Recommend doing it, and doing it before the next rainfall
surface run rather than after.

**2. Soil moisture and soil temperature are not in KiWIS.** The WRC enviromap page
advertises 9 sites of each, so the sensors exist; they are simply not published
through this interface. Worth one question to WRC now that a channel is open.

**3. ORC needs one credential, and the ask is now specific.**
`https://hydrotel.orc.govt.nz/api/` serves a complete HydroTel Web Service API
documentation page — `GetTreeItems`, `GetItemDetails`, `GetLoggedData`,
`GetLatestValue`, JSON throughout. HydroTel is a HyQuest/Kisters product, entirely
separate from the AQUARIUS portal at `envdata.orc.govt.nz/AQWebPortal` and **not**
subject to its permission model.

Both ORC surfaces are gated: the Web Service takes **HTTP Basic auth only** and 401s
anonymously *and* with the vendor's documented `guest`/`guest` (those work only on
the vendor's own demo host, `data.kisters.co.nz`); the human portal at
`/hydrotel/cgi-bin/hydweb.cgi` — "ORC: Online Data Network Portal" — 302s every
route to a login.

So the ask is one line: **a HydroTel Web Service account for
hydrotel.orc.govt.nz.** That is a routine product credential rather than a bespoke
data agreement, which makes ORC the likeliest of the remaining councils to open.

`ingestion/scripts/probe_hydrotel.py` is written and waiting on that credential. It
encodes the contract and its four traps — the **1,000-record page cap** with
`DataLimited`/`NextDT` walking BACKWARDS in descending date order; **timestamps with
no timezone at all** ("times in HydroTel are not referenced to a specific time
zone"), which must be measured against a known event before any backfill or it is a
silent 12-13 hour shear; the integer quality vocabulary (1 Telemetered, 2 Imported,
3 Edited, 4 Partial, **5 Missing/Invalid**); and the docs' `LocationX` appearing to
be the *latitude*. **It has never been run against live data** — it is written to
the published contract, not to observed responses, and says so.

**Auckland is a thorough negative.** Every route class checked:

| route | result |
|---|---|
| AQUARIUS `environmentauckland.org.nz` | gated as before (empty `Statistics` group) |
| `/KiWIS/*` on that host | HTTP 200, **zero bytes** — looks like a hit, is not. `/DefinitelyNotARoute/` behaves identically; POST discriminates. It is the disclaimer catch-all |
| HydroTel | absent |
| `api.aucklandcouncil.govt.nz/v1/*` | **all** paths 504, not just weather-ish ones — prefix-level behaviour, NOT evidence of a matched route |
| ArcGIS Online org `n4yPwebTjJCmXB6W` | fully public, but flood/coastal-hazard and water-quality layers only. `wm_Site_Monitoring_Public` is lakes, coastal sediment, rivers, safe-swim — **zero meteorology** |
| DNS sweep, 17+ subdomains | only `api.` resolves |

Auckland publishes its GIS hazard layers openly and keeps its hydrometric
observations behind AQUARIUS. **Do not re-probe for KiWIS or HydroTel.** The only
remaining lever is the account request already outstanding.
