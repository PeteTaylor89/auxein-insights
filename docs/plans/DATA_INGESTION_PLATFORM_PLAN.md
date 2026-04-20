# Environmental & Operational Data Ingestion Platform — Architecture Plan

**Status:** Draft — awaiting review
**Author:** Claude + Peter
**Date:** 2026-04-20
**Scope:** Generalize the current NZ weather-focused ingestion pipeline into a global, multi-source environmental & operational timeseries platform with a separate alerts subsystem. Includes infrastructure for multiple API keys, company-owned devices, zone hierarchy, and international expansion (AU September launch; UK / CA / CH / other wine countries progressively).
**Related docs:** `docs/Auxein Inisghts Deployment Workflow V1.0.docx`

---

## 1. Why we're doing this

Today's ingestion pipeline was built to serve one job: pull weather observations from NZ regional councils + Harvest Electronics, aggregate them into NZ wine climate zones, and drive Regional Insights. Five things have outgrown that shape:

1. **Multi-API-key reality.** Each new commercial Harvest customer has their own API account; the current single `HARVEST_API_KEY` env var doesn't scale. Same shape will repeat for BoM, Met Office, paid MetService tiers, and anything else behind a key.
2. **Nested zones.** "Central Otago" and its sub-zones ("Bannockburn", "Gibbston", "Bendigo") already co-exist flatly in `climate_zones` with no hierarchy. A station in Bannockburn needs to contribute to Bannockburn *and* Central Otago aggregates — cleanly, no duplication.
3. **Company-owned devices.** Customers supplying their own stations must see their raw/live data privately in Grow, while still contributing (anonymously) to public regional aggregates. No `company_id` exists on `weather_stations` today.
4. **Not just weather.** Harvest devices are generic timeseries — pumps, meters, frost fans, tank levels, groundwater bores. The current `weather_stations` + `weather_data` schema and the hardcoded `variable = 'temp' | 'rh' | 'rainfall' | 'solar_radiation' | 'pressure'` inference in `ingestion/sources/harvest.py:125-142` can't represent a pump flow meter.
5. **International.** BoM / Australia ships September 2026. UK, Canada, Switzerland, and other wine countries follow. The system embeds NZ assumptions: LINZ cadastres, IPoNZ GI metadata, `Pacific/Auckland` timezone, SH-only vintage year math (`July 1 → June 30`), NIWA BCSD climate CSVs.

The goal of this plan is to produce a **generic devices + timeseries + alerts platform** that:
- Treats NZ as the first tenant of a global system, not the system itself.
- Lets new countries / data sources / device classes plug in via config, not code rewrites.
- Preserves the existing climate / phenology / disease pipelines (they're legitimately weather-specific and don't need to be generalized).
- Ships back-compat views so no existing code breaks during the rename.

---

## 2. Current state — verified

### 2.1 Schema (NZ-only, weather-first)

| Table | Columns relevant | Notes |
|---|---|---|
| `weather_stations` | `station_id, station_code, data_source, source_id, lat/lon/elevation, location (geog), region, zone_id, notes JSONB, is_active` | 1:1 FK to `climate_zones`. No `company_id`, no device type, no credential reference. (`backend/db/models/weather.py:8-27`) |
| `weather_data` | `(station_id, timestamp, variable) PK, value Numeric, unit, quality` | Row-per-observation. `variable` is free-text string. (`backend/db/models/weather.py:29-37`) |
| `weather_data_daily` | fixed columns `temp_min/max/mean, humidity_*, rainfall_mm, solar_radiation, gdd_base0/10, *_record_count` | Weather-specific rollup per station per day. (`backend/db/models/realtime_climate.py:26-68`) |
| `climate_zones` | `id, region_id FK wine_regions, name, slug, description, geometry MULTIPOLYGON, display_order` | **Flat.** Mixes overview zones ("Central Otago") and sub-zones ("Bannockburn") as siblings. Parent implied only by `wine_regions.slug`. (`backend/db/models/climate.py:21-68`, `backend/scripts/seed_climate_zones.py:41-201`) |
| `climate_zone_daily` / `_hourly` / `_daily_baseline` | weather-specific | Feeds phenology + disease models. |
| `wine_regions` | NZ regions, LINZ council boundaries, NZ Winegrowers stats (`backend/db/models/wine_region.py`) | No `country_id` — implicitly NZ. |
| `geographical_indications` | IPoNZ reg number, IPoNZ URL, renewal date | NZ-IP-system specific. (`backend/db/models/geographical_indication.py`) |
| `ingestion_log` | `data_source, station_id, times, records, status, error_msg` | Works across sources; fine. |

### 2.2 Ingestion

| Source | File | Pattern |
|---|---|---|
| Harvest Electronics | `ingestion/sources/harvest.py` | REST, API key via `HARVEST_API_KEY` env var, trace_id per station, variable inferred from `uom` field (brittle — only works for weather units) |
| ECAN, MDC, GW, HBRC, TDC, GDC | `ingestion/sources/{source}.py` | Hilltop XML, no API key, hardcoded per-class `measurement_map` translating provider names → canonical variable codes |
| All | `ingestion/run_ingestion.py` | argparse source selector; GH Actions cron every 6h at `:05 */6 * * *` (`.github/workflows/weather-ingestion.yml`) |

Station configs live in `ingestion/config/{source}_sites.py` (Python dicts) — used at initial setup only; `weather_stations` DB rows are the runtime source of truth after setup.

### 2.3 Hemisphere / vintage assumptions

- `ClimateZoneDaily.get_vintage_year(date)` (`realtime_climate.py:119-124`) and `zone_aggregation.py:get_vintage_year` both: `year + 1 if month >= 7 else year`. SH-specific.
- `ClimateZoneDailyBaseline.date_to_doy_vintage` (`realtime_climate.py:227-234`): "July 1 = day 1". SH-specific.
- Ingestion classes hardcode `ZoneInfo('Pacific/Auckland')` (e.g. `harvest.py:51, 59, 237`). NZ-specific.

### 2.4 Deployment

Per `docs/Auxein Inisghts Deployment Workflow V1.0.docx`:
- Backend: AWS EB (`auxein-api-prod-lb`), manual `eb deploy`
- Frontends: S3 + CloudFront (Insights: `E1LDN7KQ7TOFXN`; Pro: TBC)
- Ingestion: GH Actions cron every 6h; daily processing at `0 5/6 * * *` UTC
- Secrets: GH Actions `secrets.HARVEST_API_KEY` etc. — flat namespace

### 2.5 Hierarchy inconsistency — evidence

`seed_climate_zones.py` lines 41–201 show:

| Wine region | Zones in `climate_zones` table |
|---|---|
| Central Otago | **Central Otago**, Bannockburn, Bendigo, Gibbston |
| Hawkes Bay | **Hawkes Bay**, Gimblett Bridge Pa, Ngaruroro |
| Auckland | **Auckland**, Waiheke |
| Marlborough | Lower Wairau, Awatere, Upper Wairau and Southern Valleys *(no overview row)* |
| Wairarapa | Gladstone, Martinborough *(no overview row)* |
| North Canterbury | North Canterbury, Waipara |

All weather stations' `zone_id` point at whichever row was chosen at setup time (e.g., Maori Point stations → Central Otago overview; should be Bannockburn). Sub-zones currently have no stations and therefore don't publish aggregates.

---

## 3. Target architecture

### 3.1 Two paradigms, kept separate

| Paradigm | Shape | Examples |
|---|---|---|
| **Timeseries** | Device → periodic observations | Weather stations, pumps, meters, frost fans, tank sensors, groundwater bores, river gauges, soil probes |
| **Events / alerts** | Discrete interval-bound, geo-scoped, typed | Council water restrictions, flood warnings, fire bans, frost advisories, biosecurity notices, cyclone warnings |

### 3.2 Core timeseries model

```
data_sources          -- catalog: HARVEST, TDC, BOM, UK_METOFFICE, ECCC, MeteoSwiss, LAWA, …
  kind                -- weather | hydrology | operational | mixed
  requires_credentials
  api_pattern         -- hilltop | rest | ftp | csv | scrape
  base_url
  country_id          -- nullable (HARVEST is multi-country)

measurement_catalog   -- canonical variable registry
  code                -- temp_air, temp_soil_10cm, rh, rainfall, solar_radiation, wind_speed,
                     --   pump_flow, pump_runtime, frost_fan_on, tank_level, groundwater_level,
                     --   river_flow, river_level, soil_moisture_vwc, leaf_wetness, …
  display_name
  canonical_unit      -- unit we store in (SI preferred)
  value_type          -- continuous | cumulative | boolean | categorical
  rollup_method       -- mean | sum | last | max | min | any_true
  domain              -- weather | hydrology | irrigation | frost | quality | energy

devices                                     -- generalizes weather_stations
  id (was station_id)
  device_code (was station_code)
  name
  device_class        -- weather_station | pump | meter | frost_fan | groundwater_bore |
                     --   river_gauge | soil_probe | tank_sensor | irrigation_controller
  data_source_id      -- FK data_sources
  source_id           -- provider's ID (trace_id for Harvest, site_name for Hilltop)
  latitude / longitude / elevation / location (geog)
  timezone            -- IANA TZ string (Pacific/Auckland, Australia/Adelaide, Europe/London)
  zone_id             -- FK climate_zones (deepest zone; hierarchy handles rollup)
  country_id          -- FK countries (denormalized for speed)
  company_id          -- FK companies, NULL = public infrastructure
  property_id         -- FK properties, NULL = off-farm
  asset_id            -- FK assets, NULL otherwise (for fans, pumps represented as assets)
  api_credential_ref  -- string → secrets manager path
  ingest_cadence_minutes
  visibility          -- public | private (private = raw gated to company)
  contributes_to_regional  -- bool; weather_station public or company=true; pump/fan always false
  is_high_resolution  -- drives Grow "live" UI treatment
  is_active
  notes JSONB
  created_at / updated_at

device_measurements   -- M:N devices ↔ measurement_catalog
  device_id
  measurement_code
  source_measurement_name  -- provider's label (e.g., "Air Temperature (continuous)")
  unit                      -- source unit (may need conversion)
  is_primary
  is_active

timeseries_observations                     -- generalizes weather_data; partitioned monthly
  device_id
  timestamp (UTC, timezone-aware)
  measurement_code
  value Numeric             -- booleans encoded 0/1; categoricals via quality_flags lookup
  unit                       -- as-stored (usually canonical)
  quality                    -- GOOD | BAD | SUSPECT | ESTIMATED
  quality_flags JSONB        -- freeform per-source metadata
  PK (device_id, timestamp, measurement_code)
  -- PARTITION BY RANGE (timestamp), monthly partitions

ingestion_credentials
  id
  provider              -- HARVEST | BOM | UK_METOFFICE | …
  name                  -- human label ('black-estate-harvest', 'bom-commercial')
  secret_arn            -- AWS Secrets Manager ARN
  company_id            -- owner (NULL = Auxein-owned / public)
  is_active
  rotated_at
```

**Back-compat views (low-risk rename):**
```sql
CREATE VIEW weather_stations AS
  SELECT id AS station_id, device_code AS station_code, name AS station_name,
         (SELECT code FROM data_sources WHERE id = d.data_source_id) AS data_source,
         source_id, latitude, longitude, elevation, location, ...
  FROM devices d WHERE device_class = 'weather_station';

CREATE VIEW weather_data AS
  SELECT device_id AS station_id, timestamp, measurement_code AS variable,
         value, unit, quality, created_at
  FROM timeseries_observations
  WHERE measurement_code IN (SELECT code FROM measurement_catalog WHERE domain = 'weather');
```
Every existing script (climate pipeline, admin_weather endpoints, Hilltop ingestion classes) keeps running untouched. Callers migrate to the generic tables incrementally; views deprecate in a later release.

### 3.3 Geography scaffolding

```
countries
  id
  iso2                   -- NZ, AU, GB, CA, CH, US, FR, IT, ES, PT, DE, AT, …
  name
  hemisphere             -- N | S
  vintage_start_month    -- 7 (SH: Jul 1 → next Jun 30), 1 (NH: calendar-year vintage), or 10 (some EU)
  default_timezone       -- Pacific/Auckland, Australia/Adelaide, Europe/London, …
  is_active
  display_order

wine_regions
  + country_id FK        -- NZ existing rows default to NZ country
  + parent_region_id     -- for super-regions (e.g., AU "South East Australia" umbrella)

climate_zones
  + parent_zone_id       -- self-FK; Bannockburn.parent = Central Otago
  + zone_level           -- region | sub_zone
  + country_id           -- denormalized

geographic_designations  -- generalizes geographical_indications
  id
  name, slug
  designation_system     -- IPoNZ_GI | EU_PDO | EU_PGI | AU_GI | US_AVA | AOC | DOCG | DO | DOC | …
  country_id FK
  region_id FK (wine_regions, nullable)
  parent_designation_id  -- nesting (AOC ⊂ IGP; AVA ⊂ AVA)
  geometry MULTIPOLYGON
  bounds JSONB
  metadata JSONB         -- per-system (IPoNZ ip_number, EU file number, TTB number)
  registration_date
  is_active

-- Existing NZ IPoNZ rows migrate in place: designation_system='IPoNZ_GI',
--   country_id=NZ, metadata = {ip_number, iponz_url, renewal_date}
```

### 3.4 Hemisphere-aware vintage helper

Replace `get_vintage_year(date)` with one function taking a country:

```python
def vintage_year_for(d: date, country: Country) -> int:
    if country.hemisphere == 'S':
        return d.year + 1 if d.month >= country.vintage_start_month else d.year
    # NH: vintage = harvest-year = calendar year
    return d.year

def day_of_vintage(d: date, country: Country) -> int:
    start = date(d.year if d.month >= country.vintage_start_month else d.year - 1,
                 country.vintage_start_month, 1)
    return (d - start).days + 1
```
Callers: `zone_aggregation.py`, `realtime_climate.py` (ClimateZoneDaily, ClimateZoneDailyBaseline), `phenology_service.py`, disease models. Zone → country resolved via `climate_zones.country_id`.

### 3.5 Zone aggregation — recursive CTE

```sql
WITH RECURSIVE zone_tree(descendant_id, root_id) AS (
  SELECT id, id FROM climate_zones WHERE is_active
  UNION ALL
  SELECT cz.id, zt.root_id
  FROM climate_zones cz JOIN zone_tree zt ON cz.parent_zone_id = zt.descendant_id
)
SELECT zt.root_id AS zone_id, d.id AS device_id, d.device_class, d.visibility
FROM zone_tree zt
JOIN devices d ON d.zone_id = zt.descendant_id
WHERE d.is_active
  AND d.device_class = 'weather_station'
  AND d.contributes_to_regional = true
```

Applied in `backend/scripts/zone_aggregation.py` replacing the existing `LEFT JOIN weather_stations ws ON ws.zone_id = cz.id`. A station registered to Bannockburn feeds both Bannockburn and Central Otago aggregates automatically. `MIN_STATIONS_FOR_ZONE = 2` still evaluated at each level; sub-zones below threshold simply don't publish.

### 3.6 Alerts subsystem (placeholder in this plan, full build deferred)

```
alert_sources            -- per-country / per-feed config
  id, name, country_id, feed_type (rss | rest | scrape), url, poll_interval_minutes

environmental_alerts
  id
  source_id FK alert_sources
  external_id               -- provider's ID, for dedupe
  alert_type                -- water_restriction | flood_warning | fire_ban | frost_advisory |
                           --   biosecurity_notice | cyclone_warning | air_quality | …
  severity                  -- info | advisory | watch | warning | emergency
  title, body, url
  issued_at, effective_from, effective_to
  geometry MULTIPOLYGON     -- affected area
  zone_ids INT[]            -- denormalized for fast filter
  country_id FK
  raw JSONB
  status                    -- active | expired | cancelled
```

Schema lands in Phase 0 as an empty placeholder; first poller + UI not scoped in this plan.

### 3.7 Public vs company semantics per device class

| Device class | Default visibility | Contributes to regional aggregates? | Grow |
|---|---|---|---|
| Weather station (council / public Harvest tier) | public | yes | comparison layer |
| Weather station (company-owned) | private | yes (anonymized via aggregate) | own live + regional comparison |
| Pump / meter / frost fan / tank / irrigation controller | private | **never** | company only |
| Groundwater bore (council) | public | yes (regional hydrology module) | public layer |
| Groundwater bore (company-owned) | private | no | company only |
| River gauge (council) | public | yes | public layer |
| Soil probe (company-owned) | private | no | company only |

Encoded as two independently-settable booleans (`visibility`, `contributes_to_regional`) with sensible defaults per class; admin UI surfaces the choice when onboarding.

---

## 4. Grow presentation

Grow's weather/operational surfaces consume the generic layer:

| Module | Data source | Endpoint family (new) | Scope |
|---|---|---|---|
| Weather dashboard | `timeseries_observations` + `climate_zone_daily` | `/api/v1/grow/weather/*` | own stations + own zones' regional aggregate |
| Irrigation / pumps | `timeseries_observations` filtered by `device_class='pump'` / `'meter'` | `/api/v1/grow/irrigation/*` | own devices only |
| Frost fans | `device_class='frost_fan'` | `/api/v1/grow/frost/*` | own devices + zone frost alerts |
| Tank & water storage | `device_class='tank_sensor'` | `/api/v1/grow/water/*` | own devices |
| Hydrology context | Public council bores + river gauges in same zones | `/api/v1/grow/hydrology/*` | public data, scoped by company's zones |
| Alerts | `environmental_alerts` filtered by zone / property geometry | `/api/v1/grow/alerts` | placeholder for now |

All Grow endpoints go through a gating dependency analogous to the existing `get_visible_property_ids()` in `property_service.py` — returns `devices WHERE company_id = current_user.company_id` (plus public contextual data where the UX demands it).

Regional Insights endpoints read only from `climate_zone_*` aggregates and never expose `device_id` — privacy preserved by construction.

---

## 5. Ingestion changes

### 5.1 Config-driven variable mapping

Today: each source file has a hardcoded `measurement_map` (`tdc.py:37`, `hbrc.py:37`, etc.) and Harvest infers variable from unit. After Phase 0:

- `device_measurements` rows declare exactly what each device reports and how the provider labels it.
- Source classes read from DB, not from hardcoded maps.
- Harvest trace_id → device class resolved at device registration (admin picks "weather station" vs "pump meter" vs "frost fan"), not inferred at ingestion time from `uom`.

### 5.2 Variable cadence

One source, many cadences. Split GH Actions workflow:

- `weather-ingestion-public.yml` (existing, retitled): every 6h, filters `devices WHERE ingest_cadence_minutes >= 180`
- `weather-ingestion-live.yml` (new): every 15 min, filters `ingest_cadence_minutes < 60`
- On-demand fetch in Grow backend for "latest reading" views when last obs > threshold

### 5.3 Bulk station onboarding (BoM-scale)

Manual Python configs don't scale past one country. New admin flow:

1. `discover_stations` method per `DataSource` class — pull upstream catalogue by geography (bounding box or geometry) with a buffer around the target zone.
2. Admin UI paginates the catalogue and shows stations inside the zone geometry + buffer.
3. Admin bulk-selects → backend creates `devices` rows with `is_active=false`.
4. Admin reviews metadata, activates; system begins ingesting.

**Station selection philosophy (your answer to Q3):** by geography with a buffer. Default buffer: configurable per country (suggest 5 km for densely-instrumented countries, 20 km sparse).

### 5.4 Credential registry

`ingestion_credentials` (from §3.2). On ingestion run:

- Source class reads distinct `api_credential_ref` values from its active devices.
- For each ref, fetch secret from AWS Secrets Manager once (`boto3` already in use).
- Instantiate one fetcher per credential; group devices by credential.

Back-compat during transition: if a `devices.api_credential_ref` is NULL, fall through to the legacy `HARVEST_API_KEY` env var. Migration seeds existing NZ Harvest devices with `api_credential_ref = 'harvest/default'`.

---

## 6. International expansion

### 6.1 Australia — September 2026 launch

Australia is SH, same vintage conventions as NZ (`hemisphere='S'`, `vintage_start_month=7`). Commercial BoM API licence **procurement is part of this plan** per your direction.

**AU wine regions to seed** (full list per Wine Australia GI register):

| State / zone | Regions (seeded as `climate_zones` with `zone_level='region'` or `'sub_zone'` under super-zones) |
|---|---|
| **NSW — Big Rivers** | Murray Darling, Perricoota, Riverina, Swan Hill |
| **NSW — Central Ranges** | Cowra, Mudgee, Orange |
| **NSW — Hunter Valley** | Hunter (sub: Pokolbin, Broke Fordwich, Upper Hunter Valley) |
| **NSW — Northern Rivers** | Hastings River |
| **NSW — Northern Slopes** | New England Australia |
| **NSW — South Coast** | Shoalhaven Coast, Southern Highlands |
| **NSW — Southern New South Wales** | Canberra District, Gundagai, Hilltops, Tumbarumba |
| **VIC — North East Victoria** | Alpine Valleys, Beechworth, Glenrowan, King Valley, Rutherglen |
| **VIC — North West Victoria** | Murray Darling (shared NSW), Swan Hill (shared NSW) |
| **VIC — Central Victoria** | Bendigo, Goulburn Valley, Heathcote, Strathbogie Ranges, Upper Goulburn |
| **VIC — Western Victoria** | Grampians, Henty, Pyrenees |
| **VIC — Port Phillip** | Geelong, Macedon Ranges, Mornington Peninsula, Sunbury, Yarra Valley |
| **VIC — Gippsland** | Gippsland |
| **SA — Adelaide super-zone** | (parent) |
| **SA — Mount Lofty Ranges** | Adelaide Hills (sub: Piccadilly Valley, Lenswood), Adelaide Plains, Clare Valley |
| **SA — Barossa** | Barossa Valley, Eden Valley (sub: High Eden) |
| **SA — Fleurieu** | Currency Creek, Kangaroo Island, Langhorne Creek, McLaren Vale, Southern Fleurieu |
| **SA — Limestone Coast** | Coonawarra, Mount Benson, Mount Gambier, Padthaway, Robe, Wrattonbully |
| **SA — Lower Murray** | Riverland |
| **SA — The Peninsulas** | Southern Flinders Ranges |
| **WA — Greater Perth** | Perth Hills, Peel, Swan District (sub: Swan Valley) |
| **WA — South West Australia** | Blackwood Valley, Geographe, Great Southern (sub: Albany, Denmark, Frankland River, Mount Barker, Porongurup), Manjimup, Margaret River, Pemberton |
| **WA — Other** | Central Western Australia, Eastern Plains Inland and North of WA, West Australian South East Coastal |
| **QLD** | Granite Belt, South Burnett |
| **TAS** | Tasmania (informal sub-regions: Tamar Valley, Coal River, Derwent, East Coast, Huon Valley, Pipers River — seed as sub_zone rows even though not formal GIs) |

Geometry sources: Wine Australia GI register (ESRI shapefiles available publicly).

**BoM ingestion plan:**
- New `ingestion/sources/bom.py` `BomIngestion` class — REST under the commercial licence.
- Station catalogue ingested via the `discover_stations` flow (§5.3) — BoM has thousands of stations; admin picks by geometry.
- Measurement set: air temp, min/max temp, RH, rainfall, solar exposure, wind speed/direction, pressure, evapotranspiration.
- Cadence: 6h for bulk, with 30-min live option for paid-tier endpoints.
- Historical: BoM SILO or AGCD gridded dataset for baseline climatology (separate loader; format differs from NIWA BCSD).

**AU alerts (future, not in Phase E scope):** BoM warnings API + state emergency services feeds.

### 6.2 Subsequent countries

| Country | Hemisphere | Vintage start | Primary data sources | Notes |
|---|---|---|---|---|
| UK (GB) | N | Month = 1 (calendar vintage) | Met Office DataHub (paid API), Environment Agency for hydrology | GDPR; data residency may push to eu-west RDS |
| Canada (CA) | N | 1 | Environment and Climate Change Canada (ECCC) public API, provincial feeds (BC Min Agri, Ontario OMAFRA) | Bilingual metadata |
| Switzerland (CH) | N | 1 | MeteoSwiss IDA web + commercial tier, BAFU for hydrology | Data privacy regime stricter than GDPR in some domains |
| USA (US) | N | 1 | NWS/NOAA public, MesoWest/Synoptic (network-of-networks), AgWeatherNet | Imperial units common — needs conversion |
| France (FR) | N | 1 | Météo-France (paid), INRAE | AOC designation system deepest of all — `geographic_designations` nesting matters |
| Italy (IT) | N | 1 | ISPRA, regional ARPA agencies | DOCG/DOC/IGT nesting |
| Spain (ES) | N | 1 | AEMET | DOP/DO nesting |
| Portugal (PT) | N | 1 | IPMA | DOP/IG |
| Germany (DE) | N | 1 | DWD | Prädikatswein system — may want custom metadata |
| Austria (AT) | N | 1 | ZAMG / GeoSphere Austria | DAC system |
| South Africa (ZA) | S | 7 | SAWS | Wine of Origin scheme |
| Chile (CL) | S | 7 | DMC | D.O. by valley |
| Argentina (AR) | S | 7 | SMN | IG system |

**Progressive rollout path** (not committed in this plan, informational):
1. NZ (existing) — baseline
2. AU — September 2026 (this plan)
3. Next 1–2 countries: likely UK or ZA based on customer demand
4. EU cluster (FR, IT, ES, DE, AT, CH) — benefits from shared PDO/PGI abstraction
5. Americas (CL, AR, US)

### 6.3 What each new country requires

With the platform in place:

1. `countries` row (~30 sec of SQL)
2. `wine_regions` + `climate_zones` seed (geometry from country GI registry; 1–3 days per country depending on source format)
3. `geographic_designations` seed with per-country `designation_system`
4. One `DataSource` entry per primary weather provider
5. One new `{provider}.py` ingestion class (~2–4 days depending on API shape — REST vs FTP vs Hilltop-like)
6. Climate baseline loader for the country's gridded historical dataset (~2–3 days)
7. Station discovery and initial activation via admin UI (hours to days)

Nothing else structural. No new core tables. No new Grow modules required until a customer actually lands.

---

## 7. Storage & scale

`timeseries_observations` volume grows quickly:

- Weather station @ 10-min cadence × 5 variables = 262k rows/year/station
- Pump / meter @ 1-min cadence × 3 vars = 1.58M rows/year/device
- Target scale at end of year 1: ~300 devices → 50–200M rows

**Recommendation: native Postgres range partitioning by month.** AWS RDS doesn't ship TimescaleDB so that option is off-table without migrating off RDS. Timestream is overkill for v1 and complicates access patterns.

- Partition key: `timestamp` monthly (`p_obs_2026_04`, `p_obs_2026_05`, …)
- Partition management via `pg_partman` (available on RDS) or a scheduled maintenance job creating next month's partition
- Indexes: `(device_id, timestamp DESC, measurement_code)` per-partition; covering the hot query pattern (latest N obs for a device)
- Old partitions detached + archived to S3 (parquet) after 3 years; rollups preserved indefinitely

**Grow "live" queries** — hit a separate hot cache (Redis / materialized view refreshed on ingest) for the last N hours per device, to keep dashboard loads sub-100ms regardless of table size.

---

## 8. Admin surfaces (Pro)

### 8.1 New admin areas

| Surface | Who | Purpose |
|---|---|---|
| **Auxein Admin → Data Sources** | Auxein Admin | List all `data_sources`, health per source, credential health, last successful ingest per source |
| **Auxein Admin → Devices** | Auxein Admin | CRUD any device globally; reclassify `device_class`; reassign zone/company |
| **Auxein Admin → Station Discovery** | Auxein Admin | Pick country + zone → browse upstream catalogue → bulk-import devices |
| **Auxein Admin → Countries & Zones** | Auxein Admin | Manage `countries`, `climate_zones` hierarchy, `geographic_designations` |
| **Auxein Admin → Alerts** *(placeholder)* | Auxein Admin | Once alerts land: curate sources, type taxonomy |
| **Company Admin → Weather Stations** *(new tab in Company Admin)* | Company Admin | Register own Harvest (or other) stations; paste API key → stored in Secrets Manager; assign zone; trigger backfill |
| **Company Admin → Devices** *(later)* | Company Admin | Manage pumps/fans/meters tied to properties and assets |

### 8.2 Company Admin onboarding flow (weather stations, v1)

1. Settings → **Weather Stations** tab → "Add station" wizard
2. Pick source (`Harvest` / `Other`) → enter station metadata (name, lat/lon, elevation)
3. Pick zone — tree picker shows `country → wine_region → climate_zone → sub_zone`
4. Enter API credential → named + stored in Secrets Manager → `ingestion_credentials` row
5. Set cadence (default 15 min for live), visibility (private), contributes to regional (yes, default)
6. Confirmation: "Your station will contribute to regional aggregates for {zone} and parent {region}. You'll see live raw data in Grow; raw data is not exposed publicly."
7. Backend: create `devices` row, trigger backfill (reuses `ingestion/run_ingestion.py --source {src} --station {code} --period backfill`)

---

## 9. Phasing & effort

| Phase | Scope | Effort | Blocks |
|---|---|---|---|
| **0 — Model generalization** | `devices`, `timeseries_observations`, `measurement_catalog`, `device_measurements`, `data_sources`, `ingestion_credentials`, partitioning, back-compat views; property/asset FKs on devices. Zero behaviour change. | ~4d | nothing |
| **0b — Geography abstraction** | `countries` table; `wine_regions.country_id`; `climate_zones.parent_zone_id` + `zone_level` + `country_id`; generalize `geographical_indications` → `geographic_designations`; hemisphere-aware `vintage_year_for()` helper; per-device timezone. Backfill NZ. | ~2d | Phase 0 |
| **A — Zone hierarchy** | Recursive CTE in zone aggregation; seed NZ sub-zone parents; add Marlborough/Wairarapa overview rows; repoint existing stations to sub-zones where appropriate. | ~1.5d | Phase 0b |
| **B — Company ownership + credential registry** | `devices.company_id`, `api_credential_ref`, `ingest_cadence_minutes`, `visibility`, `contributes_to_regional`; AWS Secrets Manager wiring; split GH Actions workflow for variable cadence; Grow weather endpoint skeleton with `get_visible_property_ids()`-style gating. | ~3d | Phase 0 |
| **C — Harvest device reclassification** | Audit existing Harvest traces; populate `device_measurements` from current inferred mapping; ingestion reads from DB not hardcoded maps; migrate Maori Point to Bannockburn. | ~2d | Phases 0, A |
| **D — Station discovery admin UI** | `discover_stations` interface per source class; admin UI to browse/import by geometry+buffer; reusable across Harvest, BoM, future sources. | ~3d | Phases 0, B |
| **E — BoM ingestion + AU seed** | AU country row; seed all AU wine regions/sub-zones per §6.1 table; geometries from Wine Australia GI register; `BomIngestion` class; SILO/AGCD climate baseline loader; first AU stations live. | ~5d | Phases 0b, B, D |
| **F — Alerts schema placeholder** | `alert_sources`, `environmental_alerts` tables, admin stub. No poller, no Grow UI yet. | ~0.5d | Phase 0b |
| **G — Grow weather module (v1)** | Grow dashboard showing own stations + regional comparison; device drill-downs; live cadence honoured. First customer-facing payoff. | ~4d | Phases B, C |
| **H — Grow operational modules (progressive)** | Irrigation/pumps, frost fans, tanks, hydrology. One at a time as customers demand. | incremental | Phase G |

**Total to AU launch (0 + 0b + A + B + D + E + F):** ~19 dev days. Tight but achievable by September 2026 if started promptly. Grow weather module (G) is recommended for AU launch alongside but could slip to October.

**Critical path:** 0 → 0b → B → D → E. A and C can run in parallel with B.

---

## 10. Migration strategy (Phase 0 detail)

Because the rename blast radius is large, migrations land in a specific order with back-compat views at every step.

### Step 1 — New tables, no deletes

```sql
-- New catalog tables
CREATE TABLE data_sources (...);
CREATE TABLE measurement_catalog (...);
CREATE TABLE ingestion_credentials (...);
CREATE TABLE countries (...);

-- Seed measurement_catalog from existing variable set
INSERT INTO measurement_catalog (code, display_name, canonical_unit, value_type, rollup_method, domain)
VALUES
  ('temp', 'Air Temperature', 'C', 'continuous', 'mean', 'weather'),
  ('rh', 'Relative Humidity', 'percent', 'continuous', 'mean', 'weather'),
  ('rainfall', 'Rainfall', 'mm', 'cumulative', 'sum', 'weather'),
  ('solar_radiation', 'Solar Radiation', 'W/m2', 'continuous', 'mean', 'weather'),
  ('pressure', 'Barometric Pressure', 'hPa', 'continuous', 'mean', 'weather'),
  ...;

-- Seed data_sources from existing ingestion classes (HARVEST, ECAN, MDC, GW, HBRC, TDC, GDC)
-- Seed countries: NZ only initially
```

### Step 2 — Add columns to existing tables (non-destructive)

```sql
ALTER TABLE weather_stations
  ADD COLUMN device_class VARCHAR(50) DEFAULT 'weather_station',
  ADD COLUMN country_id INT REFERENCES countries(id),
  ADD COLUMN company_id INT REFERENCES companies(id),
  ADD COLUMN property_id INT REFERENCES properties(id),
  ADD COLUMN asset_id INT REFERENCES assets(id),
  ADD COLUMN api_credential_ref VARCHAR(200),
  ADD COLUMN ingest_cadence_minutes INT DEFAULT 360,
  ADD COLUMN visibility VARCHAR(20) DEFAULT 'public',
  ADD COLUMN contributes_to_regional BOOLEAN DEFAULT true,
  ADD COLUMN is_high_resolution BOOLEAN DEFAULT false,
  ADD COLUMN timezone VARCHAR(50) DEFAULT 'Pacific/Auckland';

ALTER TABLE climate_zones
  ADD COLUMN parent_zone_id INT REFERENCES climate_zones(id),
  ADD COLUMN zone_level VARCHAR(20) DEFAULT 'region',
  ADD COLUMN country_id INT REFERENCES countries(id);

ALTER TABLE wine_regions ADD COLUMN country_id INT REFERENCES countries(id);
```

### Step 3 — Rename via views (zero-downtime)

```sql
-- Rename tables to their generic names
ALTER TABLE weather_stations RENAME TO devices;
ALTER TABLE weather_data RENAME TO timeseries_observations;

-- Rename key columns
ALTER TABLE devices RENAME COLUMN station_id TO id;
ALTER TABLE devices RENAME COLUMN station_code TO device_code;
ALTER TABLE devices RENAME COLUMN station_name TO name;
ALTER TABLE timeseries_observations RENAME COLUMN variable TO measurement_code;

-- Back-compat views
CREATE VIEW weather_stations AS
  SELECT id AS station_id, device_code AS station_code, name AS station_name,
         data_source, source_id, latitude, longitude, elevation, location,
         region, zone_id, notes, is_active, created_at, updated_at
  FROM devices
  WHERE device_class = 'weather_station';

CREATE VIEW weather_data AS
  SELECT device_id AS station_id, timestamp, measurement_code AS variable,
         value, unit, quality, created_at
  FROM timeseries_observations;
```

### Step 4 — Partition `timeseries_observations`

Separate Alembic migration (risky, executed in maintenance window). Options:
- **In-place conversion:** `pg_partman` tooling or manual: create partitioned parent, copy data, swap. Downtime risk.
- **New-partitioned table, backfill, rename:** lower risk, doubles disk briefly.

Recommend second approach. Write-safe because writes happen through source ingestion, which can be paused for the cutover window (next cron = 6h later).

### Step 5 — Backfill `device_measurements`

Populate from the existing per-source `measurement_map` dicts (`tdc.py:37`, `hbrc.py:37`, etc.) and from observed `(device_id, measurement_code)` pairs in historical data. Idempotent script.

### Step 6 — Migrate `geographical_indications` → `geographic_designations`

```sql
CREATE TABLE geographic_designations (...);

INSERT INTO geographic_designations
  (name, slug, designation_system, country_id, region_id, parent_designation_id,
   geometry, bounds, metadata, registration_date, is_active, display_order)
SELECT
  name, slug, 'IPoNZ_GI', (SELECT id FROM countries WHERE iso2='NZ'), region_id, NULL,
  geometry, bounds,
  jsonb_build_object('ip_number', ip_number, 'iponz_url', iponz_url,
                     'renewal_date', renewal_date, 'notes', notes),
  registration_date, is_active, display_order
FROM geographical_indications;

-- Keep geographical_indications as a view for back-compat
DROP TABLE geographical_indications;
CREATE VIEW geographical_indications AS
  SELECT id, name, slug, geometry, bounds,
         metadata->>'ip_number' AS ip_number,
         metadata->>'iponz_url' AS iponz_url,
         ...
  FROM geographic_designations
  WHERE designation_system = 'IPoNZ_GI';
```

---

## 11. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Climate pipeline breaks during rename | Low | High | Back-compat views at every step; run full daily-processing pipeline in staging end-to-end before cutover |
| Partition migration data loss | Low | Catastrophic | Dual-write approach: new-partitioned table + backfill + rename; full RDS snapshot before cutover |
| BoM licence delayed past September | Medium | Medium | Seed AU regions and scaffold BoM class regardless; use public BoM endpoints as fallback launch |
| NH vintage logic regressions | Medium | Medium | No NH users until UK lands; guard with `if country.hemisphere == 'N'` paths and tests before first NH customer |
| AWS Secrets Manager cost / quota | Low | Low | ~$0.40/secret/month; batch reads cached per ingestion run |
| Data residency for UK/CH customers | Medium | High | Defer until customer commits; likely eu-west RDS replica; don't prebuild |
| `timeseries_observations` bloat ahead of partitioning | High | Medium | Partition before Phase B customer onboarding bumps write volume |

---

## 12. Non-goals / explicitly deferred

- **Second-country cadastral sync** (Geoscape for AU, OS for UK). NZ-only LINZ sync stays; other countries use self-drawn property polygons until a customer commits.
- **Full alerts subsystem** — schema placeholder only; first poller + Grow UI is a separate plan.
- **Data residency / multi-region DB** — defer until UK or CH customer commits.
- **Currency / i18n of Grow UI strings** — not in scope for platform layer; handle per-country in frontend.
- **Unit conversion UI toggle** (metric ↔ imperial). Store canonical units; convert for display only when US customers arrive.
- **Timestream or TimescaleDB migration** — native Postgres partitioning is sufficient for v1; revisit only if observed bottleneck.
- **Real-time push from devices** (webhooks, MQTT). Pull-based ingestion only in v1.
- **Grow operational modules beyond Weather** — one module at a time, customer-demand driven.

---

## 13. Open questions flagged for future decision

1. **NH vintage UX** — when UK/CA dashboards go live, how do we disambiguate "2024 vintage" on a screen that might show both SH and NH data side-by-side? *Deferred per your direction; revisit before first NH customer.* We will defer the thinking of multi country views as currently we are operating on a .co.nz domain and will consider regional domains?
2. **Regional data-use disclosure** — currently silent on "contributed by N stations, K companies" per your direction (Q2 earlier). Revisit if trust/transparency becomes a customer ask. will revisit at a later date, current thinking is we will have a modal that pops up kind of like the about with credits to all data suppliers.
3. **Single-contributor sub-zones** — publish without label per your direction (Q3 earlier); revisit if customers surface concerns. happy with this approach
4. **BoM commercial tier features** — exact variable + cadence set depends on licence terms. Finalize at procurement. Precisely. 
5. **Station buffer default per country** — suggest 5 km for NZ/AU/UK; 20 km for sparse regions. Tune after first country goes live. Agreed
6. **Grow "live" cadence** — placeholder 15 min for company-owned stations; revisit with first customer to trade off API call cost vs freshness. Agreed - we also need to consider how the onboarding and UX works, as the returned station information from Harvest is abstract - not super easy to automate
7. **Credentials rotation policy** — quarterly? Annual? Driven by customer policies. Defer until first company-owned station is live. Defer until Grow is live

---

## 14. Success criteria

- **Phase 0 + 0b complete:** All existing NZ ingestion + climate processing continues to run on back-compat views with zero behaviour change. Staging daily-processing pipeline passes end-to-end.
- **Phase A complete:** Maori Point stations aggregate into Bannockburn sub-zone, which aggregates into Central Otago region, without data duplication. Regional Insights drill-down to sub-zone live.
- **Phase B complete:** A company-supplied Harvest station can be onboarded via Company Admin UI, its raw data is visible only to that company in Grow, and it contributes to the Waipara regional aggregate anonymously.
- **Phase E complete (AU launch):** At least one Australian customer sees BoM-backed regional insights for their GI region + their own station (if any) by September 30, 2026.
- **Platform invariant:** Adding country N+1 requires no new core tables, only seed data + one ingestion class.

---

*End of plan — 2026-04-20.*
