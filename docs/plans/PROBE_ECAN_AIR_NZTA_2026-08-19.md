# Probe results: ECan Air temperature, and NZTA road weather

Run 2026-08-19 against live public endpoints. Read-only, keyless, no accounts
created. Scripts and raw captures: `scratchpad/live_discovery/`.

Context: `LIVE_SURFACES_DISCOVERY_2026-08-19.md` §7 — Canterbury carries a
4,453 km² temperature deficit and ECan supplies 102 rain gauges and **zero**
thermometers through its Hilltop/rainfall feeds.

---

## 1. ECan Air collection — **CONFIRMED, back to 2020 and further**

### Access

Public, keyless, on the same open portal as the rainfall feed already wired.
The `Ocp-Apim-Subscription-Key` gate applies to `apidevelopers.ecan.govt.nz`
(the *developer* portal); this is `data.ecan.govt.nz` and needs nothing.

```
GET https://data.ecan.govt.nz/data/94/Air/
    Air%20quality%20data%20for%20a%20monitored%20site%20(hourly)/JSON
    ?SiteId={SiteNo}&StartDate={dd/mm/yyyy}&EndDate={dd/mm/yyyy}
```

Supporting endpoints: method **23** (sites, with `LatestDateTime`), method
**180** (station × monitor channel, with lat/lon), method **29** (10-minute),
**98** (daily), **100** (latest). Formats CSV / XML / JSON / JSONP, `zip=`
supported.

**Licence: CC BY 4.0** — stated in the portal footer, "All data unless
specifically stated is licensed under a Creative Commons Attribution 4.0
International License". Commercial use permitted with attribution.

### What comes back

Hourly rows carrying temperature alongside pollutants. Field names are
XML-name-escaped, which the parser has to handle:

```json
{"DateTime": "2026-08-01T01:00:00+12:00",
 "StationName": "Riccarton Road",
 "NO_x0020__x0028_ug_x002F_m3_x0029_": "2.2921624",
 "NO2_x0020__x0028_ug_x002F_m3_x0029_": "3.1899137",
 "Temperature_x0020_2m_x0020__x0028_DegC_x0029_": "4.5226808"}
```

`_x0020_` = space, `_x0028_`/`_x0029_` = parens, `_x002F_` = slash. So
`Temperature 2m (DegC)`. Channels are `WEB_Temp2m` (MonitorTypeCode 169) and
`WEB_Temp6m` (170). **Hourly cadence means genuine Tmin/Tmax**, not the
midnight-spot-reading problem that afflicted the Hilltop councils.

### Depth of record — one 7-day request per site per year, week of 1–7 June

| site | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|---|---|---|
| Riccarton Road | 168/168 | 168/168 | 168/168 | 168/168 | 168/168 | 168/168 | 168/168 |
| Woolston | 168/168 | 168/168 | 168/167 | 168/168 | 168/168 | 168/168 | 168/168 |
| Kaiapoi | 168/168 | 168/168 | 168/168 | 168/168 | 168/168 | 168/168 | 168/168 |
| Rangiora | 168/168 | 168/168 | 168/168 | 168/168 | 168/168 | 168/168 | 168/168 |
| Geraldine | 168/168 | 168/168 | 168/168 | 168/168 | 168/168 | 168/168 | 168/168 |
| Timaru Anzac Square | 168/168 | 168/168 | 168/168 | 168/168 | 168/168 | 168/168 | 168/168 |
| Waimate Kennedy | 168/168 | 168/168 | 167/166 | 168/168 | 168/168 | 168/168 | 168/168 |
| Washdyke Alpine | 168/168 | 168/168 | 168/168 | 168/168 | 168/168 | 168/168 | 168/168 |
| Ashburton | 168/168 | 168/168 | 168/168 | 168/168 | 168/168 | 168/168 | — |
| St Albans EP | — | — | 168/168 | 168/168 | 121/121 | 168/168 | 168/168 |
| Ashburton 2 | — | — | — | — | — | 168/168 | 168/168 |
| St Albans | 168/168 | — | — | — | — | — | — |

*(hours returned / hours carrying a temperature value; 168 = a complete week)*

**Eight stations with unbroken hourly temperature across the entire 2020–present
window**, plus St Albans EP from 2022, Ashburton 2 from 2025, and Ashburton
closing out 2020–2025. Completeness in the sampled weeks is 99.9 %.

The five sites that returned nothing are **decommissioned, not misaddressed** —
method 23's `LatestDateTime` confirms: Lincoln 2010-04-20, Burnside 2010-12-31,
Timaru Grey Rd 2006-04-03, Waimate Stadium 2015-08-13, Washdyke Flat Road
2019-01-31, St Albans 2020-11-17. No SiteId mismatch to chase. Lincoln is the
loss worth noting — "Crop and Seed Farm", the only rural site of the set — but
it has been off for fifteen years.

### Where they land against the deficit

| station | lat | lon | deficit cell it sits in |
|---|---|---|---|
| Geraldine | −44.100 | 171.242 | **−44.0/171.0–171.5 — the two largest cells in the country (3,992 km²)** |
| Timaru Anzac Sq | −44.404 | 171.250 | south Canterbury coastal |
| Washdyke Alpine | −44.356 | 171.242 | south Canterbury coastal |
| Waimate Kennedy | −44.733 | 171.050 | Waitaki approaches |
| Ashburton 2 | −43.907 | 171.761 | mid-Canterbury plains |
| Rangiora | −43.308 | 172.595 | **−43.0/172.5 (1,177 km²)** |
| Kaiapoi | −43.385 | 172.652 | North Canterbury |
| Riccarton Rd / Woolston / St Albans EP | −43.5 | 172.6 | Christchurch urban |

Geraldine alone sits inside the single worst deficit cell pair. This does **not**
reach the Mackenzie or the Southern Alps (−43.5/170.0–170.5, −44.5/170.0), which
stay empty.

### Caveats to carry into the build

1. **Siting.** Urban and roadside exposure sites, chosen for population exposure,
   not climate. Riccarton Road is literally 122 Riccarton Road. Heat island is
   real at the three Christchurch sites. Flag them, and watch their residuals in
   the Phase 3 bias study rather than assuming they behave like screened
   stations. Geraldine (a cemetery), Waimate Kennedy and Washdyke are better
   sited than the Christchurch trio.
2. **Two heights.** `Temp2m` and `Temp6m` both exist at most sites. Use 2 m and
   ignore 6 m; do not average them. (One row in the metadata labels 6 m as
   "Temperature 10m" — a metadata error at St Albans, further reason to take 2 m
   only.)
3. **Escaped field names** must be decoded, not string-matched loosely.
4. **The BAM trap, restated.** WCRC's Reefton sites expose `BAM Air Temperature`
   — a beta-attenuation monitor's internal instrument temperature. ECan's
   channel list does **not** contain that; its temperature channels are
   `WEB_Temp2m`/`WEB_Temp6m` under MonitorTypeCode 169/170. Match on the
   MonitorTypeCode, not on the string "temp".

### Verdict

**Build it.** ~10 live stations, 8 with full 2020→present hourly history, keyless,
CC BY 4.0, on a portal we already talk to. It helps the Phase 2 backfill and the
live product equally, which was the open question. It closes the North Canterbury
and Geraldine deficit cells and leaves the alpine ones open.

### BUILT 2026-08-19 — not yet seeded or run

- `ingestion/config/ecan_air_sites.py` — endpoints, measurement map, QC ranges,
  and the reasoning for every omission.
- `ingestion/sources/ecan_air.py` — `ECanAirIngestion`, source key `ECAN_AIR`.
- `ingestion/scripts/seed_ecan_air.py` — seeds from methods 180 + 23 live.
- `ingestion/run_ingestion.py` — imported, added to `--source` choices and to
  `all`.

`ECAN_AIR` is a **separate source from `ECAN`**, not a variable bolted onto it:
different stations, different telemetry, different URL grammar (`SiteId` + date
range vs `SiteNo` + `Period`), and unrelated site-number namespaces.

Three behaviours of the feed that the class handles and that are worth knowing
before touching it:

1. **Field names are XML-name-escaped** — `Temperature 2m (DegC)` arrives as
   `Temperature_x0020_2m_x0020__x0028_DegC_x0029_`. Decoded, not substring-matched.
2. **Timestamps are hour-ENDING; stored hour-STARTING.** A full-year request
   returns 01:00 on 1 Jan through 00:00 on 1 Jan following — 8,760 slots labelled
   01:00..24:00. Left alone, `daily_aggregation` would give each day the hour
   ending 00:00 (which belongs to the previous day) and lose its own final hour —
   a one-hour shear in every daily min/max that would almost never move Tmin or
   Tmax, which is exactly why it would never be noticed.
3. **Both date bounds are whole-day inclusive**, so chunks advance to
   `chunk_end + 1 day`. Verified: 01/01/2023..20/02/2024 walks as
   `2023-01-01..06-29`, `06-30..12-26`, `12-27..2024-02-20` — no overlap, no gap.

Unlike `ecan.py` there is **no daily/hourly seam to guard**. The rainfall portal
switches to midnight daily totals past a month-long window; this endpoint was
probed at one week, one month and one full year and returned hourly every time.

Physical-range QC is applied at the source (`VALUE_RANGES`) — the ingest half of
Phase 0.1. `db_util` already rejects NaN/inf and |v| ≥ 1e6, but that is a storage
bound and stores −100 °C happily. Verified: −100, −7999, −9999 and +46.1 °C are
all rejected with a warning; +42.3 °C is kept (NZ's record high is 42.4 °C, set
at Rangiora — one of these very stations).

**Verification run against the live feed, no DB writes:** decode ✓; Geraldine
2024-06-01..07 returns 168 rows → 583 observations (temp 168, wind_speed 168,
wind_gust 168, wind_direction 79 — calm hours carry no direction); hour shift ✓;
range gate ✓; dead site (Lincoln) returns 0 and transforms to 0 ✓; 415-day
chunked dry run parsed 34,189 observations across 3 non-overlapping chunks ✓.

**Seed dry run selected 12 stations**, correctly rejecting the five whose record
ends before 2020 (Burnside 2010, Lincoln 2010, Timaru Grey Rd 2006, Waimate
Stadium 2015, Washdyke Flat Rd 2019). Two of the twelve are stale but carry
in-window history worth backfilling (Ashburton to 2025-11, St Albans to 2020-11).

Local note: neither `venv` has `requests`; the system Python 3.13 does, and that
is what the verification used.

To run:

```
python ingestion/scripts/seed_ecan_air.py --dry-run     # then without
python ingestion/scripts/fill_elevation_from_dem.py --source ECAN_AIR
python ingestion/run_ingestion.py --source ecan_air --period backfill --start 01/01/2020
```

### SEEDED AND BACKFILLED 2026-08-19 — live in prod

12 stations, elevations filled from the LINZ 8 m DEM (0 fallbacks, 0 left NULL),
**1,977,056 observations** ingested, of which **580,076 hourly air temperatures**
spanning 2020-01-01 → 2026-08-19. Range −6.0 to +39.6 °C.

| station | elev m | temp | wind | from | to |
|---|---|---|---|---|---|
| Geraldine | 111 | 57,836 | 57,775 | 2020-01-01 | 2026-08-19 |
| Waimate Kennedy | 52 | 58,107 | 58,064 | 2020-01-01 | 2026-08-19 |
| Timaru Anzac Square | 16 | 58,090 | 58,079 | 2020-01-01 | 2026-08-19 |
| Rangiora | 28 | 58,001 | 57,999 | 2020-01-01 | 2026-08-19 |
| Washdyke Alpine | 9 | 57,903 | 57,802 | 2020-01-01 | 2026-08-19 |
| Riccarton Road | 11 | 57,830 | — | 2020-01-01 | 2026-08-19 |
| Woolston | 14 | 57,412 | 57,766 | 2020-01-01 | 2026-08-19 |
| Kaiapoi | 6 | 57,345 | 57,023 | 2020-01-01 | 2026-08-19 |
| Ashburton | 91 | 51,074 | 50,888 | 2020-01-01 | 2025-11-05 |
| St Albans EP | 8 | 40,963 | 40,953 | 2021-12-03 | 2026-08-19 |
| Ashburton 2 | 94 | 17,780 | — | 2024-08-07 | 2026-08-19 |
| St Albans | 9 | 7,735 | 7,735 | 2020-01-01 | 2020-11-18 |

Riccarton Road has no wind sensors (its payload carries NO, NO₂ and temperature
only) — not a defect. Ashburton 2's wind is unrecoverable; see below.

#### The one thing that went wrong, and how it was caught

Ashburton 2 returned **17,800 rows that transformed to zero observations** on the
first pass. Its `MonitorFullName` for the temperature channel is
`'Temperature 2m '` — trailing space, no unit — where every other station
publishes `'Temperature 2m (DegC)'`. The exact-match map missed it.

The unmapped-field report existed but was a `logger.info`, and `run_ingestion.py`
configures no logging, so it printed nothing. **The only reason this was visible
at all is that the chunk line prints rows AND observations**; `0 rows -> 0` and
`2863 rows -> 0` read very differently. Fixed three ways: lookup now normalises
case and whitespace (while still requiring every spelling to be listed
explicitly, so no unit is ever inferred), the alias is in the map, and the
unmapped report is a `print`.

Ashburton 2 re-ran cleanly: 17,780 records.

While fixing it, a second Ashburton 2 field turned out to be **unresolvable and
deliberately left unmapped**: `AS/NZS 3580.14 Section 2` is the `MonitorFullName`
of *both* channel 1 (`Wind Speed V`, type 18) and channel 2 (`Wind Dir V`,
type 19) — the metadata names the compliance standard instead of the quantity.
One unlabelled number, no way to tell m/s from degrees. A plausible value (6.77)
makes a guess tempting; a guess would have put wind direction into the wind-speed
series for six years. Wind at Ashburton 2 stays lost until ECan fixes it.

#### Validation against the nearest existing thermometer

**Every one of the 12 has a SYNOP station as its nearest neighbour** — direct
confirmation that ECan contributed nothing to the temperature field before this.
Ashburton was 60 km from the nearest thermometer.

Hourly correlation, July 2026:

| station | ref | km | n | r | bias °C | sd °C |
|---|---|---|---|---|---|---|
| Washdyke Alpine | 93773 Timaru Aero | 6.3 | 697 | **0.963** | −0.10 | 1.23 |
| Riccarton Road | 93781 Chch Aero | 7.0 | 744 | 0.945 | +0.60 | 1.61 |
| Kaiapoi | 93781 | 15.1 | 744 | 0.935 | −0.94 | 1.82 |
| St Albans EP | 93781 | 8.7 | 744 | 0.930 | +0.21 | 1.72 |
| Rangiora | 93781 Chch Aero | 20.5 | 744 | 0.888 | +0.02 | 2.59 |
| Woolston | 93781 | 14.2 | 744 | 0.887 | **+1.34** | 2.17 |
| Geraldine | 93773 | 22.2 | 744 | 0.872 | **−0.76** | 2.39 |
| Waimate Kennedy | 93796 | 26.2 | 744 | 0.836 | −0.03 | 2.25 |
| Ashburton 2 | 93781 | 60.8 | 743 | 0.821 | +0.82 | 2.77 |

Two of these are physically coherent rather than suspicious, and both were
predicted: **Geraldine runs 0.76 °C cool** and sits 84 m higher than its
reference, which a 0.6–1.0 °C/100 m lapse accounts for entirely; **Woolston runs
1.34 °C warm and Riccarton Road 0.60 °C warm**, which is the urban heat island
the siting caveat called out. Kaiapoi, north of the city and semi-rural, runs
0.94 °C cool. The `siting: "urban_air_quality"` flag in `notes` is doing real
work — the Phase 3 bias study should split on it rather than pooling these with
screened stations.

#### Incidental defect found

**`SYNOP_93780` (Christchurch Intl) stopped on 2026-06-09** — 71 days silent,
while `SYNOP_93781` (Christchurch Aero Aws) continues. Christchurch is not blind,
but a station died unnoticed. That is the **third** instance of the same failure
mode today (BOPRC's 10 AQ stations, the 2026-08-12 rollup day, this) and the
strongest argument yet for the Phase 0.5 per-(station, variable) last-seen
watchdog: none of the three is visible in `ingestion_log`.

#### Still to do

These rows are in `weather_data` only. They do not reach the interpolation
network until `daily_aggregation.py` runs over 2020→present — worth coordinating
with the parallel raw-data repopulation rather than both re-aggregating the same
window.

---

## 2. NZTA road weather — **NEGATIVE, do not pursue**

Three independent checks, all negative.

**The open data portal has no weather datasets.** A search of
`opendata-nzta.opendata.arcgis.com` for "weather" returns three items — NZTA
Highway Information, TMS historical traffic volumes, and Crash Analysis System.
None is meteorological.

**The Traffic & Travel API has no weather resource.** The WADL at
`https://trafficnz.info/service/traffic/rest/4?_wadl` declares **26 resources**
and every one is `cameras/`, `events/`, `journeys/`, `links/`, `regions/`,
`signs/tim/`, `signs/vms/` or `ways/`. There is no observation resource.

**"Weather" in the API description means advisory text, not observations.**
Pulling `events/all/1` returned 190 live events across four `eventType` values —
Road Work 89, Area Warning 67, Scheduled Road Work 27, Road Hazard 7. Twenty-six
mention weather, all as free text in `eventComments`. The payload has **no
numeric observation fields whatsoever** — no temperature, rainfall, wind or
humidity key exists on any event.

**Why, structurally.** MetService operates the road-weather intelligence under
contract to NZTA for de-icing and severe-weather response. The RWIS sensors are
physically on the passes, but the observations are a commercial deliverable to
NZTA and its maintenance contractors, not open data. Acquiring them is a
MetService commercial conversation, not an integration.

Incidental: `nzta.govt.nz` sits behind Imperva/Incapsula and returns a WAF
challenge to scripted requests — same class of block as Waikato Regional
Council. `trafficnz.info` is not blocked. Worth recording so nobody re-derives it.

### Verdict

**Closed.** No open road-weather observations exist. If the alpine gap matters
enough to pay for, the conversation is with MetService directly — and that runs
into the same licence problem as NIWA (platform plan decision D3). Hydro
generators and ski fields remain the untested alternatives for that terrain.
