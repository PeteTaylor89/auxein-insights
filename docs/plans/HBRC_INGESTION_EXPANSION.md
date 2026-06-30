# HBRC Ingestion Expansion — Discovery & Plan

**Status:** Discovery complete, build not started. Resume later.
**Date probed:** 2026-06-29 (live HBRC Hilltop API).
**Owner:** Pete

---

## TL;DR

We ingest **9 HBRC stations / 4 variables**. The HBRC Hilltop API exposes
**~22 live climate stations + 235 rainfall sites**, plus several variables we
don't pull (PET/evapotranspiration, wind speed/direction, soil temp/moisture),
with temperature/rainfall/RH history going back to **1997**. This doc captures
the gap analysis, the add-then-backfill plan, and a side-quest admin endpoint
for "stations per variable". No code written yet.

---

## 1. How the pipeline works today

**Source path:** `ingestion/sources/hbrc.py` + `ingestion/config/hbrc_sites.py` +
`ingestion/setup_hbrc_stations.py`, orchestrated by `ingestion/run_ingestion.py`,
scheduled by `.github/workflows/weather-ingestion.yml` (cron `5 */6 * * *`, every 6h).

**API:** Hilltop Server, public / no auth.
Base: `https://data.hbrc.govt.nz/Envirodata/EMAR.hts`
`GetData` params: `Site`, `Measurement`, `From`/`To` (DD/MM/YYYY), optional `Interval` (default `30 minutes`).

**Flow:**
1. `get_active_stations()` reads `weather_stations` WHERE `data_source='HBRC' AND is_active`.
2. Per station it reads `notes.measurements` (JSON array) — **this list, not the API, decides what gets pulled.**
3. Each measurement name is looked up in a hardcoded `measurement_map` (`hbrc.py:37-46`); **unknown names are silently skipped.**
4. Incremental = from last `weather_data` timestamp; backfill = `--period backfill --days N` or explicit `--start-date/--end-date`. **One `GetData` call per measurement across the whole range (no chunking).**
5. Upsert into `weather_data` (EAV: `station_id, timestamp, variable, value, unit`), `ON CONFLICT` update. Logs to `ingestion_log`.

**Adding stations** is a separate one-time script `setup_hbrc_stations.py`: reads the
config dict, INSERTs `weather_stations` rows (PostGIS point + `notes.measurements`).
**Currently insert-only — skips existing rows, no update path.**

## 2. Current state vs. available

**Ingested today: 9 stations, 4 variables.**
- Climate (2): Bridge Pa, Crownthorpe → temp, rainfall, RH, solar.
- Rainfall-only (7): Maraekakaho, Ngaruroro, Kaiapo, Tutaekuri, Farndon, Moteo, Kopanga.
- `measurement_map` also defines `soil_temp` + `soil_moisture` but **no station config requests them** (dead entries).

**Available on the live API:**

| Asset | Available | We ingest | Gap |
|---|---|---|---|
| Climate stations | 23 named "Climate" (+ Kotemaori); ~22 live | 2 | ~20 live |
| Rainfall sites (`HBRC_Rainfall` collection) | **235** | 7 | 228 |

**Variables per climate station** (consistent across live ones):

| HBRC measurement | Canonical | In `measurement_map`? | History | Priority |
|---|---|---|---|---|
| Average Air Temperature | temp | yes | back to 1997–1999 | have |
| Rainfall | rainfall | yes | 1997–1999 | have |
| Average Humidity | rh | yes | 1997–1999 | have |
| Solar Radiation | solar_radiation | yes | ~2008–2014 | have |
| **PET Hourly / PET Daily** | (new) `pet` mm | **no** | ~2011–2014 | **HIGH** (irrigation/disease) |
| **Average Wind Speed** | (new) `wind_speed` km/h | **no** | 1997–1999 | **HIGH** |
| **Average Wind Direction** | (new) `wind_dir` deg | **no** | 1997–1999 | MED |
| **Maximum Wind Speed** (gust) | (new) `wind_gust` km/h | **no** | 1997–1999 | MED |
| Soil Temperature 100mm | `soil_temp` | mapped, unused | ~2003 | MED |
| Soil Moisture | `soil_moisture` | mapped, unused | ~2003 | MED |
| Barometric Pressure | (new) `pressure` hPa | no | few urban sites only | LOW |
| Grass Temp / Hail / PM2.5 / Rainomatic | — | no | niche | SKIP |

## 3. Critical caveats (from the probe)

- **Not all 23 climate sites are live.** Tuai Climate ended **2017-05-11**. Liveness
  must be checked via the `To` date in `MeasurementList` before adding/backfilling.
  Confirmed live to 2026-06-29: Bridge Pa, Crownthorpe, Waipukurau.
- **Deep history exists** — temp/rainfall/RH back to **1997** on long-running sites.
  Far beyond our current `data_from: 2025-10-01`. High value for Insights climate
  normals/baselines.
- Some of the 235 "rainfall" sites are river/stream gauges that also log rainfall —
  all legitimately usable for the rainfall-coverage layer.
- All current stations pinned to `zone_id=5` (Hawke's Bay). Full climate set spans
  Wairoa/Tuai (north, lat -38.8) to Porangahau/CHB (south, lat -40.2) — wider than one
  zone but fine to keep on zone 5 for v1; revisit sub-zoning later.
- Hilltop `From`/`To` are day-resolution (DD/MM/YYYY) — fine.

## 4. Plan — add sites, then backfill

### Phase A — Discovery snapshot → config (data-driven, not hand-typed)
1. Discovery helper pulls `SiteList&Collection=Fire Weather` (climate) + `Collection=HBRC_Rainfall` (rainfall) for coords, then `MeasurementList` per site for measurement set + **`To` date (liveness)**.
2. Emit generated `hbrc_sites.py` (or JSON seed): live climate stations (drop any with `To` older than ~90 days, e.g. Tuai), each with its real measurement list; rainfall sites with `['Rainfall']`. **Tier rainfall** — curated wine-region subset first, full 235 second.

### Phase B — Extend variable map (MUST precede backfill, else new vars silently dropped)
3. Add to `measurement_map`: `PET Hourly`/`PET Daily`→`pet` (mm), `Average Wind Speed`→`wind_speed` (km/h), `Average Wind Direction`→`wind_dir` (deg), `Maximum Wind Speed`→`wind_gust` (km/h); confirm `soil_temp`/`soil_moisture` wiring. Register new canonicals in `measurement_catalog`.

### Phase C — Seed / refresh stations
4. Extend `setup_hbrc_stations.py` to **UPSERT** (currently insert-only) so existing Bridge Pa/Crownthorpe gain wind/PET/soil in `notes.measurements`, and mark decommissioned sites `is_active=false`.
5. Run seed (dry-run first). Result: ~22 climate + chosen rainfall tier.

### Phase D — Backfill (staged, chunked)
6. Order: new variables on the existing 2 stations first (validates the map) → new climate stations → rainfall tier.
7. **Chunk by year.** Current code does one `GetData` per measurement across the whole range; 1997→2026 at 30-min in one call is heavy/failure-prone. Add yearly windowing in the backfill loop (incremental path unaffected).
8. Pick interval per use: keep 30-min raw for climate vars; **daily totals likely sufficient** for the deep rainfall backfill (coverage layer) — confirm before pulling 27 yrs × 235 sites at 30-min.
9. Validate with `--dry-run`, then run; monitor `ingestion_log` + the admin WeatherStatus page for completeness.

### Open decisions (pick up here)
- [ ] Rainfall scope: curated wine-region subset vs. all 235?
- [ ] Backfill depth: full 1997 history vs. shorter window?
- [ ] Which new variables for v1 — recommend **PET + wind** first.

## 5. Side-quest — "stations per variable" admin endpoint (plan only)

**Endpoint:** `GET /api/v1/admin/weather/variables/summary` in
`backend/api/v1/admin_weather.py` (guard `require_admin`, same pattern as siblings).

**Returns:**
```
{ total_stations, total_active_stations,
  variables: [ { variable, station_count, active_station_count }, ... ] }
```
e.g. `200 total · rainfall 180 · rh 97 · temp 95 · solar 40 · pet 22 …`

**Query (data-driven):** `SELECT variable, COUNT(DISTINCT station_id) FROM weather_data GROUP BY variable`.
`weather_data` is large → add optional recency window `?since_days=90` (recommended
default) or back it with `device_measurements`/`measurement_catalog` for config-declared
counts. Optional filters to mirror existing endpoints: `?data_source=`, `?region=`, `?active_only=true`.

**Frontend:** add `adminService.weather.getVariableSummary()` in
`packages/insights/src/services/adminService.js`; render a summary card/table on
`packages/insights/src/pages/WeatherStatus.jsx` (no new page).

**Recommendation:** data-driven count + default 90-day window + source filter → "live
coverage per variable" rather than "what config claims".

---

## Appendix — probe reference (so we don't re-probe)

### Discovery commands
```bash
# Climate stations:
curl "https://data.hbrc.govt.nz/Envirodata/EMAR.hts?Service=Hilltop&Request=SiteList&Collection=Fire%20Weather&Location=LatLong"
# Rainfall sites (235):
curl "https://data.hbrc.govt.nz/Envirodata/EMAR.hts?Service=Hilltop&Request=SiteList&Collection=HBRC_Rainfall&Location=LatLong"
# Measurements + date coverage per site:
curl "https://data.hbrc.govt.nz/Envirodata/EMAR.hts?Service=Hilltop&Request=MeasurementList&Site=Bridge%20Pa%20Climate"
# All collections:
curl "https://data.hbrc.govt.nz/Envirodata/EMAR.hts?Service=Hilltop&Request=CollectionList"
```

### Collections on EMAR.hts
`EMAR Seed Sites`, `EMARSites and Measurements`, `Fire Weather` (15 climate),
`GWL_for_Ensemble_Stats`, `HBRC_Rainfall` (235), `WQSonde`.

### Climate sites + coordinates (23 named "Climate"; verify liveness via To date)
```
Awatoto Climate           -39.5459 176.9191
Bridge Pa Climate         -39.6460 176.7635   (INGESTED, live)
Cricklewood Climate       -38.9688 177.1344
Crownthorpe Climate       -39.5568 176.5623   (INGESTED, live)
Gwavas HQ Climate         -39.7309 176.4434
Kaiwaka Tareha Climate    -39.2719 176.8706
Marewa Park Climate       -39.5002 176.8970   (urban: + pressure, hail, PM2.5)
Meeanee Climate           -39.5391 176.8618
Ngamatea Climate          -39.4465 176.1969
Omakere Climate           -40.0281 176.7987
Onga Onga Climate         -39.9274 176.4734
Porangahau Climate        -40.1883 176.5974
Pukeorapa Climate         -38.9469 177.7203
Ruakituri ... Climate     -38.8036 177.4798
St Johns Climate          -39.6389 176.8588
Taharua Climate           -39.0117 176.2820
Te Aute Drumpeel Rd Clim. -39.8885 176.6615
Te Haroto Climate         -39.1559 176.6117
Te Pohue No.2 Climate     -39.2682 176.6825
Tuai Climate              -38.8071 177.1320   (DECOMMISSIONED, ends 2017-05-11)
Waihau Climate            -39.3918 176.5607
Waimarama Climate         -39.8496 176.9610
Waipukurau Climate        -39.9958 176.5341   (live)
```
(Kotemaori is in the Fire Weather collection too but not named "*Climate".)

### Data depth examples (MeasurementList From/To)
```
Crownthorpe:  temp/rain/RH/wind  1999-01-26 → live;  soil 2003;  solar/PET 2014
Waipukurau:   temp/rain/RH/wind  1997-04-20 → live;  soil/solar/PET 2011;  soilTemp100 2001
Tuai:         all                2012 → 2017-05-11  (DEAD — exclude)
```
