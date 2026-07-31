# Ingestion Expansion — Findings (2026-07-16)

---

## STATUS UPDATE — 2026-07-28/29 (HBRC + MDC BUILT & backfilled)

The discovery below (2026-07-16) has since been **executed for HBRC and MDC**:

- **HBRC 9 → 93 stations**, **MDC 11 → 52 stations** — seeded from live probes via new
  generators `ingestion/scripts/seed_hbrc_from_probe.py` / `seed_mdc_from_probe.py`
  (match existing stations by API site-name to reuse codes; MDC uses an ANCHOR filter
  to mine weather sites out of the MDCAWS2 hydrology/WQ network). Platform 145 → 270 stations.
- **Elevation** filled from the **LINZ 8m DEM** (`nzdem8m` via Open Topo Data, keyless)
  by `ingestion/scripts/fill_elevation_from_dem.py` — matches hand-entered values to the
  decimetre. LINZ has no point-elevation API; this is the substitute.
- **Deep-history backfill 2020 → present at DAILY interval** — floored at 2020-01-01
  (practical; deeper later). Final coverage: **HBRC 85/93** stations with pre-2025 data
  (474k pre-2025 rows), **MDC 48/52** (374k). Forward incremental stays **30-min**.
- **Hang + the fix:** the raw single-process backfill (and the incremental cron) WEDGED —
  a Hilltop request trickles past `requests`' timeout and hangs the whole process to
  GitHub's 6-hour cap. Fixed by (1) `ingestion/scripts/backfill_driver.py` — per-station
  subprocess with a hard timeout (`--skip-existing-before`, `--only`, `--source`); and
  (2) `ingestion/sources/http_util.py` `get_with_hard_timeout()` wired into all sources +
  an incremental 30-day look-back clamp + workflow `timeout-minutes`/`concurrency` guards +
  a Harvest empty-page pagination fix. **Re-enable `weather-ingestion.yml` after deploy.**
- **Leftover items:** 8 HBRC river/lake gauges returned no daily data (investigate);
  a few gap stations (e.g. MDC Top Valley temp ends 2023) need a deliberate backfill pass;
  minor transient recent-window FAILED chunks (next cron picks up).
- **GDC (Gisborne) SCOPED, NOT BUILT (parked):** 12 climate + 65 rainfall live sites,
  rainfall to **1946** (deepest on platform), wind km/hr, no solar/soil. Probes:
  `gdc_climate.json`, `gdc_rain.json`. Southland + Northland remain gated on licensing.

---

**Status (original):** Discovery complete. **Build NOT started — paused 2026-07-16, to be picked up later.**
Nothing in `ingestion/` has been modified. The only code added is a read-only probe tool
(`ingestion/scripts/probe_hilltop.py`, §10).
**Method:** Live probing of council APIs on 2026-07-16 + code review of `ingestion/`.
**Supersedes/corrects:** parts of `HBRC_INGESTION_EXPANSION.md` (see §3.4), fills the ⚪ gaps in `NZ_COUNCIL_DATA_SOURCES.md` for Southland + Northland.

All figures below are from live API responses on 2026-07-16, not from prior docs.

> **Resume here → §11.** Start with §11 for the pick-up checklist and the open decisions that
> must be answered before any code is written.

---

## 1. Current state — what we ingest today

**142 devices, 8 live sources, 11 canonical variables.**

| Source | Devices | Variables ingested | Status |
|---|---|---|---|
| Harvest | 44 (~7 physical sites; one device *per trace*) | temp, rh, rainfall, solar_radiation, pressure | Live, only keyed source |
| SYNOP (Ogimet) | 54 | temp, dewpoint, rh, pressure, pressure_msl, wind_speed, wind_direction, rainfall | Live, 3-hourly |
| MDC (Marlborough) | 11 | temp, rh, rainfall | Live |
| TDC (Tasman) | 11 | temp, rh, rainfall, solar_radiation | Live |
| HBRC (Hawke's Bay) | 9 | temp, rh, rainfall, solar_radiation | Live |
| GDC (Gisborne) | 5 | temp, rh, rainfall | Live |
| GW (Wellington) | 4 | temp, rh, rainfall | Live |
| ECAN (Canterbury) | 4 | rainfall only | Live |
| NOAA NCEI | (same 54 as SYNOP) | 8 hourly | Dormant — manual only |

Canonical variables in use: `temp`, `rh`, `rainfall`, `solar_radiation`, `soil_temp`, `soil_moisture`,
`dewpoint`, `pressure`, `pressure_msl`, `wind_speed`, `wind_direction`.

### 1.1 Architecture constraints that shape any expansion

These are load-bearing and were confirmed by code review:

1. **Config files are seed-time only.** `ingestion/config/*_sites.py` is consumed once by
   `setup_*_stations.py`. At runtime every source calls `get_active_stations()` and reads
   `notes->measurements` **from the DB**. Editing a config file does **not** change what a deployed
   run ingests. (ECAN is the lone exception — it re-reads its config at runtime.)
2. **`setup_*_stations.py` is insert-only** (skip-if-exists). There is no update path, so existing
   stations cannot gain new measurements without an UPSERT change.
3. **Unlisted measurements are silently skipped.** Each source has a hardcoded `measurement_map`
   (e.g. `ingestion/sources/hbrc.py:37-46`). A measurement not in the map is dropped without error.
   **Extending the map must precede any backfill.**
4. **No base class / registry.** `ingestion/sources/__init__.py` is empty (0 bytes);
   `run_ingestion.py:115-288` is a hand-maintained if-chain with a hardcoded `choices` list at
   `:29`. The five Hilltop councils (mdc/gw/hbrc/tdc/gdc) are near-identical clones differing only
   in `measurement_map`, base URL and small quirks. Adding a source touches 4+ places.
5. **Scheduling is GitHub Actions only** — `weather-ingestion.yml` (`5 */6 * * *`),
   `synop-live.yml` (`10 */3 * * *`), `daily-processing.yml`. No celery/APScheduler/EB worker.
6. `device_measurements` exists in the schema to replace the hardcoded maps, but **no ingestion code
   reads it** — the config-driven refactor in `DATA_INGESTION_PLATFORM_PLAN.md:376-390` is pending.

---

## 2. Cross-cutting gotchas discovered while probing

Recording these because each one cost time and each will recur.

### 2.1 Hilltop does not decode `+` as a space
Python's `urllib.parse.urlencode` encodes spaces as `+`. Hilltop does **not** decode that back to a
space — it treats `Bridge+Pa+Climate` as a literal site name, finds nothing, and returns
**valid XML with zero DataSource elements**. It does *not* return an error. This silently looks like
"the site has no measurements" rather than a failure.

**Always use** `urlencode(params, quote_via=urllib.parse.quote)` (→ `%20`), or build URLs with
`quote()`. Note `curl` gets this right naturally, so a curl probe can succeed where the Python
client silently returns empty.

### 2.2 HBRC 403s requests without a User-Agent, and intermittently 522s
- No `User-Agent` header → HTTP 403. Set one (`Mozilla/5.0 (compatible; AuxeinIngest/1.0)`).
- Cloudflare returns **HTTP 522** (origin timeout) intermittently, roughly 1 call in 5 during
  probing. Retries with backoff clear it. `hbrc.py:111-125` already retries 3× at 5/15/45s — keep
  that, and make any new probe/backfill tooling retry too.

### 2.3 `From`/`To` live on `DataSource`, not `Measurement`
In a Hilltop `MeasurementList` response, the date range is an attribute of the parent `<DataSource>`
element. `<Measurement>` children carry `Units`/`RequestAs`/`Divisor`, and only *sometimes*
`VMStart`/`VMFinish`. **Liveness must be read from `DataSource/To`.** Parsing `Measurement` for
`From`/`To` yields nothing.

### 2.4 Site coordinates are projected, not lat/lon
`Request=SiteList&Location=Yes` returns **NZMG** (EPSG:27200) easting/northing for HBRC —
`<Projection>NZMG</Projection>`. Use **`Location=LatLong`** to get `<Latitude>`/`<Longitude>`
directly and skip a reprojection step. (2220 of HBRC's 2241 sites return lat/long; 21 do not.)

---

## 3. HBRC (Hawke's Bay) — probe results

**Endpoint:** `https://data.hbrc.govt.nz/Envirodata/EMAR.hts` — Hilltop, no auth, **CC-BY 4.0**.
No `Collection` param required.

**Scale:** 2,241 sites total. **23 named "Climate" stations.** We ingest **2**.

### 3.1 Climate station liveness (all 23)

Liveness = max `DataSource/To` across the site. Cutoff for "live" = data within the last ~3 months.

**17 live. 6 dead.** Dead stations must be excluded — this is exactly why the config has to be
generated from the API, not hand-typed.

| Site | Lat | Lon | Status |
|---|---|---|---|
| Bridge Pa Climate | -39.645984 | 176.763458 | **ingested** |
| Crownthorpe Climate | -39.556805 | 176.562260 | **ingested** |
| Cricklewood Climate | -38.968751 | 177.134431 | new — live |
| Gwavas HQ Climate | -39.730851 | 176.443384 | new — live |
| Kaiwaka Tareha Climate | -39.271912 | 176.870567 | new — live |
| Omakere Climate | -40.028093 | 176.798717 | new — live |
| Onga Onga Climate | -39.927411 | 176.473434 | new — live |
| Porangahau Climate | -40.188330 | 176.597367 | new — live |
| Pukeorapa Climate | -38.946913 | 177.720293 | new — live |
| Ruakituri River at Tauwharetoi Climate | -38.803581 | 177.479840 | new — live |
| Taharua Climate | -39.011698 | 176.281974 | new — live |
| Te Aute Drumpeel Rd Climate | -39.888457 | 176.661514 | new — live |
| Te Haroto Climate | -39.155935 | 176.611654 | new — live |
| Te Pohue No.2 Climate | -39.268184 | 176.682456 | new — live |
| Waihau Climate | -39.391753 | 176.560695 | new — live |
| Waimarama Climate | -39.849638 | 176.961024 | new — live |
| Waipukurau Climate | -39.995809 | 176.534092 | new — live |
| ~~Awatoto Climate~~ | -39.545887 | 176.919111 | **dead** — last data 2016-02-24 |
| ~~Marewa Park Climate~~ | -39.500162 | 176.897001 | **dead** — last data 2020-06-01 |
| ~~Meeanee Climate~~ | -39.539079 | 176.861786 | **dead** — last data 2012-02-02 |
| ~~Ngamatea Climate~~ | -39.446465 | 176.196874 | **dead** — last data 2013-05-31 |
| ~~St Johns Climate~~ | -39.638872 | 176.858787 | **dead** — last data 2016-02-24 |
| ~~Tuai Climate~~ | -38.807063 | 177.132002 | **dead** — last data 2017-05-11 |

**Net: +15 new live climate stations** (2 → 17).

### 3.2 Variable inventory across the 17 live climate stations

All 17 live stations carry an **identical core set** — uniform coverage, no per-site variation to
special-case. `Site` = number of live stations offering it.

| Measurement (`RequestAs`) | Sites | Earliest | Latest | Units | Status |
|---|---|---|---|---|---|
| Average Air Temperature | 17 | 1994-08-11 | live | deg c | ingested (`temp`) |
| Average Humidity | 17 | 1994-08-11 | live | % | ingested (`rh`) |
| Rainfall | 17 | 1984-12-20 | live | mm | ingested (`rainfall`) |
| Solar Radiation | 17 | 2007-08-31 | live | watts/m2 | ingested (`solar_radiation`) |
| Soil Temperature 100mm | 17 | 1998-12-16 | live | Deg C | mapped, **never requested** |
| Soil Moisture | 17 | 2003-07-03 | live | % | mapped, **never requested** |
| **Average Wind Speed** | 17 | 1994-08-11 | live | km/h | **NEW** |
| **Average Wind Direction** | 17 | 1994-08-11 | live | Deg | **NEW** |
| **Maximum Wind Speed** (gust) | 17 | 1994-08-11 | live | km/h | **NEW** |
| **PET Hourly** | 17 | 2007-10-17 | live | mm | **NEW** |
| **PET Daily** | 16 | 2007-10-17 | live | mm | **NEW** |
| Rainfall Periodic | 17 | 1984-12-13 | live | mm | NEW (see note) |
| Maximum Wind Direction | 10 | 1994-08-11 | 2024-07-16 | deg | NEW — stale |
| Minimum Wind Gust | 5 | 2006-07-11 | live | km/h | NEW — low coverage |

**Derived/QA series — do not ingest as observations:** `Checkgauge Difference`,
`Rainfall Daily Difference`, `Consecutive Dry Days`, `RainDayMonth`, `RainDays <10mm`,
`RainDays >10mm`, `PET Hourly Total`, `PET Hourly (Incremental)` (ended 2020-10-14),
`PET Daily (Incremental)` (ended 2020-10-14), `Time Maximum Wind`, `Recorder Total`,
`Check Gauge Total`, `Hydro Monitoring Form`, `Comment`, `Recorder Time`.
These are council QA artefacts or stats we compute ourselves in the aggregation layer.

**Note on `Rainfall Periodic`:** distinct from `Rainfall` (which has `Divisor=1000`,
`Interpolation=Incremental`). Needs a value-comparison probe before use — do not assume it is a
drop-in. `Rainfall` is the series already in production; keep it.

### 3.3 Recommended new variables for HBRC

Priority order, all **live, uniform across all 17 stations, and with deep history**:

1. **`pet`** (mm) — PET Hourly. Irrigation scheduling + disease modelling. History to 2007-10-17.
2. **`wind_speed`** (km/h → confirm canonical unit) — Average Wind Speed. History to **1994**.
3. **`wind_direction`** (deg) — Average Wind Direction. History to 1994.
4. **`wind_gust`** (km/h) — Maximum Wind Speed. History to 1994. Frost-fan + spray-window relevance.
5. **`soil_temp`** (deg C) — already mapped, just never requested. History to 1998.
6. **`soil_moisture_vwc`** (%) — already mapped **under the wrong code** (see §3.5). History to 2003.

`wind_speed`/`wind_direction` already exist as canonical codes (used by SYNOP/NOAA), so items 2–3
need **no catalog change** — only a `measurement_map` entry. `pet` and `wind_gust` are new codes
requiring `measurement_catalog` rows.

### 3.4 Corrections to `HBRC_INGESTION_EXPANSION.md`

The 2026-06-29 discovery pass understated availability materially. Live probing on 2026-07-16 shows:

| Claim in old doc | Actual (probed 2026-07-16) |
|---|---|
| Wind history "1997–1999" | **1994-08-11 → live.** Full 32-year record on all 17 live stations. |
| PET history "~2011–2014" | **2007-10-17 → live.** |
| "~22 climate sites live" | **17 live**, 6 dead. |
| Soil temp history "~2003" | Soil Temperature 100mm from **1998-12-16**; Soil Moisture from 2003-07-03. |
| "history goes back to 1997" | **Rainfall to 1984-12-20**; temp/RH/wind to 1994-08-11. |

The old doc's per-variable date ranges were most likely sampled from a station that has since been
decommissioned. Treat §"Available-but-not-ingested variables" in that doc as superseded by §3.2 here.

### 3.5 Bug to fix in passing

`ingestion/sources/hbrc.py:45` maps `Soil Moisture` → **`soil_moisture`**, but the code seeded in
`measurement_catalog` is **`soil_moisture_vwc`** (`alembic/versions/add_data_platform_catalog.py:205`).
Since no station config currently requests Soil Moisture, this has never fired — enabling soil
moisture without fixing the code would write an uncatalogued variable.

### 3.6 NOT PROBED — the HBRC rainfall tier

**This is an open gap.** `HBRC_INGESTION_EXPANSION.md` reports **235 sites** in the
`HBRC_Rainfall` collection; we ingest **7**. This pass focused on the Climate tier and **did not
probe rainfall**. Before building the rainfall expansion, run:

```
python ingestion/scripts/probe_hilltop.py --agency hbrc --collection HBRC_Rainfall --out hbrc_rain.json
```

Expect the same liveness problem (some proportion decommissioned) and note the old doc's caveat that
some "rainfall" sites are river/stream gauges that also log rainfall — still usable. The open
decision from the old doc stands: **curated wine-region subset vs all 235**.

### 3.7 Zone assignment

All 9 existing HBRC stations are pinned to `zone_id=5`. The 17 live climate stations span
**-38.80 to -40.19** latitude (Ruakituri in the north to Porangahau in the south) — roughly 155 km.
Blanket-assigning `zone_id=5` is wrong and will distort zone aggregates, which use
`MIN_STATIONS_FOR_ZONE = 2` per level. Zone assignment needs a deliberate decision, not a default.

---

## 4. Marlborough (MDC) — initial probe

**Endpoint:** `https://hydro.marlborough.govt.nz/data.hts` — Hilltop, no auth. Requires `Collection`.

**Scale:** **4,446 sites**, **61 collections**. We ingest 11 stations / 3 variables
(temp, rh, rainfall) — no solar, no wind, no soil.

`NZ_COUNCIL_DATA_SOURCES.md` calls MDC "the single most viticulture-relevant council" — the site
list includes named vineyard sites (`1323 Brancott Vineyard`, `Wither Hills Vineyard`).

### 4.1 Collection sizes (probed)

| Collection | Sites | Probed? |
|---|---|---|
| `Climate` | **14** (all live) | yes — §4.2 |
| `Air Temp` | 7 | no |
| `Rainfall` | 42 | no — next |
| `Soil` | **163** | **no — likely soil temp/moisture, probe next** |
| `MDCAWS2` | **100** | **no — automatic weather stations, may carry solar; probe next** |
| `Picton_Climate` | 1 | folded into Climate |

`Soil` (163) and `MDCAWS2` (100) are the two big unprobed collections and the most likely home for
solar radiation and soil variables, which the `Climate` collection lacks entirely.

### 4.2 `Climate` collection — 14 sites, all live

All 14 returned data on 2026-07-16. 4 overlap with what we already ingest (Blenheim at MDC Office,
Blenheim Bowling Club, Taylor at Taylor Pass Landfill, Lake Elterwater Climate); the other 10 are new:
Picton Climate at Waitohi Domain, Awatere at Awapiri, Top Valley at Staircase Ridge,
Wye at Charlies Rest, Taylor at Tinpot, Omaka at Ramshead Saddle, Branch at Mt Morris,
Flaxbourne at Corrie Downs, Rai at Rai Falls, Picton at Memorial Park.

**Site coordinates** (from `SiteList&Location=LatLong`, ready for the config):

| Site | Lat | Lon | Status |
|---|---|---|---|
| Blenheim at MDC Office | -41.51167038 | 173.95492702 | **ingested** |
| Blenheim Bowling Club | -41.52663988 | 173.95608203 | **ingested** |
| Taylor at Taylor Pass Landfill | -41.56407676 | 173.93270765 | **ingested** |
| Lake Elterwater Climate | -41.80307306 | 174.15435665 | **ingested** |
| Awatere at Awapiri | -41.83477611 | 173.73081669 | new — live |
| Branch at Mt Morris | -41.86458644 | 173.11515432 | new — live |
| Flaxbourne at Corrie Downs | -41.80297379 | 174.13266349 | new — live |
| Omaka at Ramshead Saddle | -41.69689019 | 173.74738829 | new — live |
| Picton Climate at Waitohi Domain | -41.29043927 | 174.00249810 | new — live |
| Picton at Memorial Park | -41.28699834 | 174.01381430 | new — live |
| Rai at Rai Falls | -41.28420906 | 173.57471142 | new — live |
| Taylor at Tinpot | -41.62887685 | 173.88335201 | new — live |
| Top Valley at Staircase Ridge | -41.56538793 | 173.37093347 | new — live |
| Wye at Charlies Rest | -41.70550427 | 173.31012606 | new — live |

**Signal (ingest candidates):**

| Measurement | Sites | Earliest | Latest | Units | Status |
|---|---|---|---|---|---|
| Rainfall | 12 | **1963-10-23** | live | mm | ingested |
| Air Temperature | 12 | 2010-01-26 | live | deg C | ingested |
| Humidity | 11 | 2009-04-02 | live | % | ingested |
| **Air Temperature Max** | 12 | 2010-01-26 | live | — | **NEW** |
| **Air Temperature Min** | 12 | 2010-01-26 | live | — | **NEW** |
| **Wind Direction** | 10 | 2018-08-03 | live | deg | **NEW** |
| **Barometric Pressure hPa** | 7 | 2009-04-02 | live | hPa | **NEW** |
| **Wind Speed** | 5 | 2011-07-06 | live | m/sec | **NEW** |
| **Wind Gust** | 4 | 2015-11-20 | live | m/sec | **NEW** |

**Rainfall to 1963-10-23 — a 63-year record.** The deepest history of any source on the platform and
the strongest case for a climate-normals backfill.

**No solar radiation, no PET, no soil temperature/moisture in the `Climate` collection.** Check
`MDCAWS2` and `Soil` before concluding MDC lacks them.

### 4.3 MDC gotchas (differ from HBRC)

1. **Wind arrives in three unit variants as separate series** — `Wind Speed` (m/sec),
   `Wind Speed km/hr` (km/h), `Wind Speed knots` (Knots); likewise `Wind Gust` / `Wind Gust km/hr` /
   `Wind Gust knots`. These are the *same measurement* pre-converted. Pick **one** variant per
   canonical code or the same observation will be written three times. Note HBRC's wind is km/h and
   MDC's base `Wind Speed` is m/sec — normalise at the map, not downstream.
2. **Much heavier QA/derived noise than HBRC.** Exclude: all `LAWA*` series
   (`LAWAmax`, `LAWAmin`, `LAWAMean`, `LAWAMedian`, `LAWAAirTemperature*`, `LAWAWindSpeed*`,
   `Rainfall LAWA`), all `*Reference` / `*Verification` / `*Comment` / `*Score` / `Audit*` /
   `Validation` / `Backup*` series, `Rainfall {0.5,1,2,4,6,12,24,48,72} Hour` roll-ups,
   `Rainfall Daily`/`Monthly`/`Raw`, `Dry Days`, `Wet Days`, `Storage Gauge Total`,
   `Hazard`, `Injury or Incident`, `WQ Sample`, and the `Gauging*`/`Observer` flow-gauging set.
   We compute roll-ups ourselves in the aggregation layer.
3. **MDC metadata has unit errors** — `Air Temperature difference` reports units of `mm`. Do not
   trust the `Units` field blindly; validate against the canonical unit in `measurement_catalog`.
4. **`Air Temperature (6m)` / `Humidity (6m)`** exist on 3 sites — a second sensor height. If ever
   ingested it needs a distinct code; do not merge with the standard-height series.
5. The `Metservice` / `Metpress` / `Wind Direction Metservice` collections are likely
   **redistributed MetService data**, which almost certainly carries different licensing than MDC's
   own observations. **Confirm before use.**

---

## 5. Southland (Environment Southland) — probe results

**Prior state:** ⚪ unknown in `NZ_COUNCIL_DATA_SOURCES.md` — no scoping, "likely Hilltop, go probe."

**Finding: Southland is NOT Hilltop and NOT AQUARIUS.** It is a bespoke ASP.NET portal at
`https://envdata.es.govt.nz` with an **undocumented JSON API**. Hilltop probes 404 on every
`.hts` path tried.

### 5.1 The API surface (reverse-engineered from `/scripts/base.js`)

| Endpoint | Purpose |
|---|---|
| `/services/sites.ashx?f={dataset}.xml` | Site list + latest values + field metadata (JSON) |
| `/services/data.ashx?s={site}&m={measurement}&i={days}` | Timeseries — `[epoch_ms, value]` pairs |
| `/services/catalogue.ashx?site={s}&measurement={m}` | Returns `dataStart` (period of record) |
| `/services/historical.ashx?site=&measurement=&start=&end=&mode=1&b64=1` | **Renders a GIF chart — not data** |
| `/services/edi.ashx` | Site/dial index |
| `/services/webcam.ashx?i=` | Webcam images |

Valid `f` values (the `.xml` suffix is required): `air`, `rainfall`, `soil-temperature`,
`soil-moisture`, `water-level`, `water-temperature`, `water-quality`, `flow`, `groundwater`.

### 5.2 Network — the richest council feed found

| Dataset | Sites | Variables |
|---|---|---|
| `air.xml` | **31** | Air Temperature (°C), Relative Humidity (%), **Wind Speed**, **Wind Direction**, **Solar Radiation**, Daily/Continuous PM10 |
| `rainfall.xml` | **44** | Rainfall (mm) + Last Hour / Today / prior-7-day totals |
| `soil-temperature.xml` | **19** | Soil Temperature (°C), Soil Moisture (%) |
| `soil-moisture.xml` | 19 | (same 19 sites as above — two views of one network) |

**Latency ~5–10 minutes** (`dataTo` tracked the wall clock during probing) — fresher than every
other source we have, including Harvest's hardcoded 13-hour delay.

Wind + solar on 31 stations would be the largest single addition of those variables to the platform.

### 5.3 Blocker A — deep history is NOT reachable via the API

`catalogue.ashx` advertises `dataStart: 2006-09-24` (20 years), but `data.ashx` **caps at exactly
365 days**:

| `i=` | Result |
|---|---|
| 30 | 736 hourly points — correct |
| 365 | 8,776 hourly points — correct (full year in one call) |
| **366** | **silently falls back to the 7-day default (184 points)** |
| 400 / 500 / 730 / 1095 / 1825 / 2500 / 3000 / 3650 | same silent 7-day fallback |

`start=`/`end=` params are **ignored** — supplying them returns the default 7-day window.
The window is anchored to *now*, so arbitrary historical ranges cannot be requested.

This is a **silent truncation**, not an error — the same failure class as the Alembic 32-char slug
limit. Any backfill loop that assumes `i=N` works for large N will quietly write 7 days of data and
report success.

**Consequence: Southland is a strong forward feed, not a baseline/history source.** The 20-year
record would need a direct data request to ES.

### 5.4 Blocker B — commercial licensing

ES terms of use (`https://www.es.govt.nz/terms-of-use`), verbatim:

> "Information on this site may be reproduced free of charge ... by non-commercial organisations,
> without requiring specific permission."
> **"Commercial organisations, businesses and trade organisations require permission to reproduce
> any content from Environment Southland."**

Auxein is a commercial business. **This requires written permission from ES before ingestion.**
Materially different from HBRC's explicit CC-BY 4.0.

### 5.5 Integration cost (if unblocked)

- New client class (not a Hilltop clone) — the only source of its shape.
- **NZTM → WGS84 reprojection**: coordinates come as `easting`/`northing` (EPSG:2193), e.g.
  `1221858, 4910704`. Every other source gives lat/lon.
- **Field-name normalisation**: names are inconsistent *across sites within the same dataset* —
  `Relative Humidity` (23 sites) vs `Relative humidity` (8); `SolarRadiation` (27) vs
  `Solar Radiation` (4); `Soil Moisture` (18) vs `SoilMoisture` (1); `Daily PM10` vs `PM10 Daily`.
  A `measurement_map` must be case/space-insensitive or it will silently drop ~25% of stations.
- `DataOwnership` field: `0` on all 31 air sites and 43/44 rainfall sites; **`1` on one rainfall
  site** — likely third-party-owned. Honour it.

---

## 5A. Otago (ORC) — probe results (added 2026-07-30)

**Prior state:** wired into `probe_hilltop.py` AGENCIES but never actually probed.

**Finding: ORC runs TWO endpoints, and the Hilltop one is FROZEN.**

### 5A.1 Old Hilltop — `https://gisdata.orc.govt.nz/hilltop/{Global,Telemetry}.hts`

Live Hilltop server (Agency=ORC, v2.10), no auth. `Global.hts` = 822 sites (archive),
`Telemetry.hts` = 215 sites (live network). Collections are hydrology/water-quality
dominated (WQ/LAWA/Macro/Wells/Flow); **no `Climate` collection.** Collection-tagged
`SiteList` is unreliable — query by `Measurement=` instead.

Weather streams (by measurement, Telemetry.hts):

| Measurement | Live sites | Archive (Global) |
|---|---|---|
| Rainfall | 54 | 85 |
| Air Temperature | 17 | 4 |
| Relative Humidity | 3 | — |
| Wind Speed | 0 | — |

**BLOCKER — the public Hilltop export is frozen at ~2024-11-06.** Every "live" site
(independent rainfall + air-temp) tops out at 2024-11-06; `GetData&From=2025-06-01`
returns `Error: No data`. ~20 months stale. Air-temp is worse still — the 17 sites are
mostly met sensors bolted to aging PM10 air-quality stations (Alexandra ends 2016,
several others 2017–2020). **Usable only as a rainfall history source up to Nov 2024,
not a live feed.**

### 5A.2 Live data = AQUARIUS Web Portal — `https://envdata.orc.govt.nz/AQWebPortal`

ORC moved live telemetry to **Aquatic Informatics AQUARIUS** (a *third* API shape after
Hilltop and ES's bespoke JSON). Current data lives here; ingesting it needs a **new
AQUARIUS client** (not a Hilltop clone). Feasible — AQUARIUS is common across NZ councils
(Waikato/BoP/Taranaki/ORC) — but it's net-new integration work, not a `measurement_map`
extension.

### 5A.3 Assessment

ORC's weather value is **rainfall density** — air temp/wind are thin and the prime
**Central Otago viticulture sites (Alexandra, Cromwell, Clyde/Roxburgh) are ALREADY in
production via Harvest** (`HARV_CODC_*`). So ORC adds spatial rainfall coverage, not new
climate stations. Given the AQUARIUS integration cost, ORC is **lower priority than ES**.
Licensing not yet verified (check ORC terms of use before any build).

### 5A.4 District councils (Otago + Southland)

Dunedin City, Clutha, Central Otago, Queenstown-Lakes, Waitaki (Otago); Invercargill City,
Gore, Southland (Southland) — **none run public weather telemetry.** Regional councils
(ORC, Environment Southland) are the data holders. CODC's climate sites are already
covered via Harvest. **No district-council streams to add.**

---

## 6. Northland (NRC) — probe results

**Prior state:** ⚪ unknown in `NZ_COUNCIL_DATA_SOURCES.md`.

**Finding: Northland IS a live Hilltop server** — `https://hilltop.nrc.govt.nz/data.hts`, no auth.
`Request=Status` returns `<Agency>Northland Regional Council</Agency>`, Hilltop v2509.1.2.85.
It would drop into the existing clone pattern with minimal work.

**Scale:** 1,126 sites, 19 collections.

Collections: `Climate_soil`, `Rainfall`, `Rivers_flows_levels`, `Groundwater_levels`,
`Wind_wave`, `Coastal_*`, `Lake_*`, `River_waterquality_*`, `Cyanobacteria Monitoring`,
`KaitiakiDataRivers`.

### 6.1 The catch — no air temperature

`Climate_soil` is **9 sites, all live** (re-probed with the tool in §10 — all 9 reporting
2026-07-16). Despite the name it carries **no air temperature**:

| Measurement | Sites | Earliest | Latest | Units |
|---|---|---|---|---|
| Rainfall | 9 | **1977-05-01** | live | mm |
| Soil Moisture 0-150mm … 1050-1200mm (**8 depths**) | 9 | 2000-01-01 | live | % |
| Soil Temperature 100/200/300/400mm (**4 depths**) | 3 | 2000-01-01 | live | degC |
| Voltage (housekeeping — ignore) | 9 | 2000-01-01 | live | Volts |

Sites: Hakaru at Tara, Kaeo at Bramleys, Mangakahia at Twin Bridges, Okarika at Rowland Rd,
Okoraka at Ngatawhiti Road, Otaika at Cemetery Road, Te Puhi at Mangakawakawa Trig,
Waihopo at Kimberley Road, Waitangi at Ohaeawai.

**No air temperature, no RH, no solar, no wind** on any Climate_soil site. `Rainfall` collection:
41 sites (not probed in detail).

> **Correction (2026-07-16, same day):** an earlier draft of this doc said Climate_soil carried
> "rainfall + soil moisture only". Re-probing with the §10 tool found **soil temperature at 4 depths
> on 3 sites**, and rainfall back to **1977** (not 2014 as the raw-edited series suggests — that's a
> different DataSource). The "no air temperature" conclusion stands.

**Assessment:** Northland is a rainfall + multi-depth soil network, not a climate network. The 8-depth
soil moisture and 4-depth soil temperature profiles are genuinely novel for the platform (we model a
single `soil_moisture` / `soil_temp` value) and need a **data-model decision** before they can be
represented — this is the real work item here, not the client. There is no NZ wine region in
Northland at scale, so value is national-context only. **Low priority.**

### 6.2 Licensing — same blocker as Southland

NRC copyright terms (`https://www.nrc.govt.nz/copyright/`), verbatim:

> "Information on this site may be reproduced free of charge ... by New Zealand Government and local
> government agencies, and by **non-commercial organisations**, without requiring specific permission."
> **"Commercial organisations, businesses and trade organisations require permission to reproduce
> any content from the Northland Regional Council."**

---

## 7. Licensing — an open question wider than this workstream

Two of two newly-probed councils carry an explicit **"commercial organisations require permission"**
clause. This raises a question about councils **already in production**:

| Council | Licence position | Source |
|---|---|---|
| HBRC | **CC-BY 4.0**, explicit | recorded in `NZ_COUNCIL_DATA_SOURCES.md` |
| TDC | Access agreement in place; Richmond Racecourse restricted | `ingestion/config/tdc_sites.py:5-9` |
| **Southland** | **Commercial use requires permission** | probed 2026-07-16 |
| **Northland** | **Commercial use requires permission** | probed 2026-07-16 |
| MDC, GW, GDC, ECAN | **Not verified** | — |

**Action required (Pete):** confirm what permission, if any, is in place for MDC / GW / GDC / ECAN,
and decide whether to approach ES and NRC. This is a commercial/legal decision, not a technical one.
Not a blocker for HBRC (CC-BY 4.0).

---

## 8. Recommended sequence

1. **HBRC expansion** — CC-BY 4.0, no new client, largest verified gap (2 → 17 climate stations,
   +6 variables). Order:
   a. Fix `soil_moisture` → `soil_moisture_vwc` (§3.5).
   b. Extend `measurement_map` with PET / wind speed / wind direction / wind gust; add
      `pet` + `wind_gust` to `measurement_catalog`.
   c. Make `setup_hbrc_stations.py` UPSERT so the 2 existing stations gain the new measurements.
   d. Generate the station config **from the API with a liveness filter** — never hand-type; 6 of 23
      are dead.
   e. Decide zone assignment (§3.7) before seeding.
   f. Backfill **chunked by year** — current code issues one `GetData` per measurement across the
      whole range; 1984→2026 in one call will fail.
2. **Marlborough** — same pattern, highest viticultural value (§4).
3. **Southland** — plan doc + ES permission request. Do not build until §5.4 is resolved.
4. **Northland** — clone pattern, but low priority (§6.1) and gated on §6.2.

### 8.1 Prerequisite — fix B4.1 before any backfill

`backend/scripts/daily_aggregation.py` (`upsert_daily_record`, ~L144-161) upserts with **no
`quality_rank`/`source` guard**, and coalesces NULL rainfall to `Decimal('0')` (~L132). GHCNh
carries no hourly precipitation, so the hourly SUM is NULL → 0 → **overwrites authoritative
GHCN-Daily rainfall with zeros**. Affects 4 in-zone stations (Auckland 93110, Gisborne 93292,
Christchurch Aero 93781, Tara Hills 93747).

The forward nightly cron mostly dodges it because GHCN-Daily lags ~2 weeks. **A backdated re-run
hits it head-on.** Flagged in `NOAA_NCEI_INGESTION_SCOPE.md` §10 as B4.1, still unbuilt.
**Fix before backfilling anything.**

---

## 9. Probe reproduction

So this doesn't need re-probing. All endpoints are keyless; HBRC needs a User-Agent.

```bash
# HBRC — sites with lat/lon (NOT Location=Yes, which returns NZMG easting/northing)
curl -A "Mozilla/5.0" "https://data.hbrc.govt.nz/Envirodata/EMAR.hts?Service=Hilltop&Request=SiteList&Location=LatLong"
# HBRC — measurements for one site (%20 for spaces, NOT '+')
curl -A "Mozilla/5.0" "https://data.hbrc.govt.nz/Envirodata/EMAR.hts?Service=Hilltop&Request=MeasurementList&Site=Bridge%20Pa%20Climate"

# MDC
curl "https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=CollectionList"
curl "https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=SiteList&Collection=Climate"

# Northland — confirms Hilltop
curl "https://hilltop.nrc.govt.nz/data.hts?Service=Hilltop&Request=Status"
curl "https://hilltop.nrc.govt.nz/data.hts?Service=Hilltop&Request=SiteList&Collection=Climate_soil"

# Southland — bespoke JSON, not Hilltop
curl "https://envdata.es.govt.nz/services/sites.ashx?f=air.xml"
curl "https://envdata.es.govt.nz/services/catalogue.ashx?site=Winton%20at%20Essex%20Street&measurement=Air%20Temperature"
curl "https://envdata.es.govt.nz/services/data.ashx?s=Winton%20at%20Essex%20Street&m=Air%20Temperature&i=365"  # i>365 silently returns 7 days
```

### 9.1 Gotcha 5 — some agencies return gzip unrequested

NRC's IIS returns a **gzip-encoded body** even when the client never sends `Accept-Encoding`.
`curl` transparently decompresses, so a curl probe succeeds while a naive Python client sees binary
garbage (`\x1f\x8b...`) and — with a parse-guard — retries forever against a perfectly healthy
server. **Sniff the magic bytes and decompress**; don't trust `Content-Encoding`. Handled in the
§10 tool via `_maybe_gunzip()`.

---

## 10. The probe tool — `ingestion/scripts/probe_hilltop.py`

**Added by this pass. Read-only, keyless, safe to run any time.** It exists because station configs
must be **generated from the live API, never hand-typed** — hand-typing is precisely how the prior
HBRC doc ended up with wrong date ranges and dead stations counted as live (§3.4).

It encodes all five gotchas (§2, §9.1), filters council QA/derived noise, splits live from dead
against a cutoff, and emits a markdown coord table ready to paste into a config or this doc.

```bash
# probe + report in one go
python ingestion/scripts/probe_hilltop.py --agency hbrc --filter Climate --out hbrc_climate.json
python ingestion/scripts/probe_hilltop.py --agency mdc  --collection Climate     --out mdc_climate.json
python ingestion/scripts/probe_hilltop.py --agency mdc  --collection MDCAWS2     --out mdc_aws.json      # UNPROBED (§4.1)
python ingestion/scripts/probe_hilltop.py --agency mdc  --collection Soil        --out mdc_soil.json     # UNPROBED (§4.1)
python ingestion/scripts/probe_hilltop.py --agency hbrc --collection HBRC_Rainfall --out hbrc_rain.json  # UNPROBED (§3.6)

# re-report an existing dump without re-hitting the API
python ingestion/scripts/probe_hilltop.py --report hbrc_climate.json --min-sites 5
```

Agencies wired: `hbrc`, `mdc`, `nrc`, `gw`, `tdc`, `gdc`, `orc`. Southland is **not** included — it
is not Hilltop (§5) and needs a different client.

**Validation:** run against HBRC on 2026-07-16 it independently reproduced §3.1 and §3.2 exactly
(17 live / 6 dead, identical coords and date ranges). Against NRC it corrected §6.1.

Tuning: `--live-cutoff YYYY-MM` (default `2026-04`) decides live vs dead — **raise it as time
passes** or long-dead stations will start reading as live. `--min-sites N` hides
low-coverage measurements from the report.

---

## 11. Resume here — pick-up checklist

> **STATUS 2026-07-31 — §§11.1-11.3 below are largely SUPERSEDED. Read this first.**
>
> The build happened. Shipped since 2026-07-16:
> - **HBRC** expanded to 93 stations (84 active), **MDC** to 52, **GDC** to 65 — all with
>   deep backfills, elevation, and the new variables. B4.1 was fixed before backfilling
>   (guards now in `backend/scripts/daily_aggregation.py`).
> - **Ingestion moved off GitHub Actions** to an hourly AWS EC2 box in Sydney
>   (`ingestion/run_all.sh` + cron + `deploy.sh`); `weather-ingestion.yml` is the disabled
>   fallback. See `docs/deployment-workbook.md` §2.
> - **Southland (ES)** built + seeded (53 stations) and **NRC** built + seeded (41 rainfall
>   stations, 2026-07-31). Both **licence-cleared 2026-07-30** — §5.4 and §6.2 are resolved,
>   and §7's ES/NRC question is closed. MDC/GW/GDC/ECAN licensing is **still unverified**.
> - Both new sources are wired into `run_all.sh` and the GH fallback matrix (2026-07-31).
> - `probe_hilltop.py` dumps now live in `ingestion/scripts/probes/` (gitignored).
>
> **Still open:** the §5A ORC AQUARIUS client (not started, low priority); NRC's multi-depth
> soil profiles (needs the data-model decision in §6.1 — V1 is rainfall-only); zone
> assignment (§3.7) is now moot, superseded by the interpolation model.

### 11.1 Decisions required before writing code

These are blocking and are **Pete's calls**, not technical defaults:

1. **Zone assignment for the 15 new HBRC stations** (§3.7). They span 155 km (-38.80 to -40.19).
   All 9 current HBRC stations sit on `zone_id=5`. Blanket-assigning zone 5 will distort zone
   aggregates (`MIN_STATIONS_FOR_ZONE = 2` per level). **No default is safe here.**
2. **Which variables to add** — recommendation is all 6 in §3.3 (pet, wind_speed, wind_direction,
   wind_gust, soil_temp, soil_moisture_vwc).
3. **HBRC rainfall scope** (§3.6) — curated wine-region subset vs all 235. Needs a probe first.
4. **Backfill depth** — rainfall reaches 1984 (HBRC) / 1963 (MDC). How far back do we actually want?
5. **Licensing** (§7) — verify MDC/GW/GDC/ECAN; decide whether to approach ES + NRC.

### 11.2 Build order once decided (HBRC)

1. Fix `soil_moisture` → `soil_moisture_vwc` in `ingestion/sources/hbrc.py:45` (§3.5).
2. Extend `measurement_map` (`hbrc.py:37-46`) with PET Hourly / Average Wind Speed / Average Wind
   Direction / Maximum Wind Speed. Add `pet` + `wind_gust` to `measurement_catalog` via migration
   (**mind the 32-char Alembic slug limit**). `wind_speed`/`wind_direction` already exist — no
   catalog change.
3. Normalise units at the map: HBRC wind is km/h, MDC's base `Wind Speed` is m/sec (§4.3).
4. Make `setup_hbrc_stations.py` **UPSERT** — it is insert-only today, so the 2 existing stations
   will NOT pick up the new measurements without this (§1.1 constraint 2). This is the step most
   likely to be missed: extending the map alone changes nothing, because runtime reads
   `notes->measurements` from the DB (§1.1 constraint 1).
5. Generate the station config with `probe_hilltop.py` (§10) + liveness filter — never hand-type.
6. Deploy, then backfill **chunked by year** (§8.1 first).

### 11.3 Traps that will bite on resume

- Editing `config/hbrc_sites.py` alone does **nothing** to a deployed run (§1.1 constraint 1).
- Extending `measurement_map` alone does **nothing** without the seeder UPSERT (§1.1 constraint 2).
- Unlisted measurements are dropped **silently** (§1.1 constraint 3).
- **Fix B4.1 before any backfill** (§8.1) or you will zero out authoritative rainfall.
- `--live-cutoff` in the probe tool is a fixed `YYYY-MM` string — stale it and dead stations read as
  live.
