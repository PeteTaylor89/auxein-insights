# Weather Data Completeness — SQL Queries

Reference queries for assessing the completeness of Insights weather ingestion records
by **station**, **variable**, and **time range**. Written 2026-07-08.

## Schema reference

Raw readings are **long/narrow**: one row per `(station_id, timestamp, variable)`.

| Table | Role | Key columns |
|---|---|---|
| `weather_data` | raw readings (composite PK `station_id, timestamp, variable`) | `station_id`, `timestamp`, `variable`, `value`, `unit`, `source`, `quality_rank` |
| `weather_stations` | station metadata | `station_id` (PK), `station_code`, `station_name`, `zone_id`, `data_source`, `is_active`, `ingest_cadence_minutes`, `contributes_to_regional` |
| `device_measurements` | expected (station, variable) matrix | `device_id` → `station_id`, `measurement_code`, `is_active` |
| `measurement_catalog` | variable registry | `code`, `display_name`, `canonical_unit`, `domain` |
| `climate_zones` | zones | `id`, `name`, `slug` |

Notes:
- `weather_data.variable` = `measurement_catalog.code` = `device_measurements.measurement_code`.
- `weather_data.station_id` is **not** a declared FK (plain Integer) — orphaned readings are possible.
- Aggregate tables (`weather_data_daily`, `climate_zone_daily/hourly`) are **wide** — a missing
  variable there is a NULL column, not a missing row — so completeness logic differs from the
  long `weather_data` table.

## Suggested workflow

Run **#2** for the station overview, **#1** for the full station×variable matrix (the main
deliverable), then **#3 / #4 / #5** to drill into gaps once a thin station or variable shows up.

---

## 1. Master completeness matrix — one row per station × variable

The workhorse query: what each station actually reports, over what span, and how dense it is.

```sql
SELECT
    ws.station_id,
    ws.station_code,
    ws.station_name,
    cz.name                              AS zone,
    ws.data_source,
    wd.variable,
    mc.display_name                      AS variable_name,
    COUNT(*)                             AS reading_count,
    MIN(wd.timestamp)                    AS first_reading,
    MAX(wd.timestamp)                    AS last_reading,
    (MAX(wd.timestamp)::date
        - MIN(wd.timestamp)::date + 1)   AS span_days,
    COUNT(DISTINCT wd.timestamp::date)   AS days_with_data,
    ROUND(
        100.0 * COUNT(DISTINCT wd.timestamp::date)
        / NULLIF(MAX(wd.timestamp)::date - MIN(wd.timestamp)::date + 1, 0)
    , 1)                                 AS pct_days_covered,
    COUNT(*) FILTER (WHERE wd.value IS NULL) AS null_values,
    now() - MAX(wd.timestamp)            AS staleness
FROM weather_data wd
JOIN weather_stations ws ON ws.station_id = wd.station_id
LEFT JOIN climate_zones cz ON cz.id = ws.zone_id
LEFT JOIN measurement_catalog mc ON mc.code = wd.variable
GROUP BY ws.station_id, ws.station_code, ws.station_name,
         cz.name, ws.data_source, wd.variable, mc.display_name
ORDER BY ws.station_id, wd.variable;
```

`pct_days_covered` is the day-level coverage ratio; low values flag sparse or interrupted history.

---

## 2. Per-station roll-up — overall span and variable count

```sql
SELECT
    ws.station_id,
    ws.station_code,
    ws.station_name,
    cz.name                            AS zone,
    ws.data_source,
    ws.is_active,
    COUNT(DISTINCT wd.variable)        AS variable_count,
    COUNT(*)                           AS total_readings,
    MIN(wd.timestamp)                  AS first_reading,
    MAX(wd.timestamp)                  AS last_reading,
    now() - MAX(wd.timestamp)          AS staleness
FROM weather_stations ws
LEFT JOIN weather_data wd ON wd.station_id = ws.station_id
LEFT JOIN climate_zones cz ON cz.id = ws.zone_id
GROUP BY ws.station_id, ws.station_code, ws.station_name,
         cz.name, ws.data_source, ws.is_active
ORDER BY last_reading DESC NULLS LAST;
```

Stations with `total_readings = 0` / NULL span are registered but have never ingested.

---

## 3. Expected vs. actual — gaps against `device_measurements`

Finds declared-but-missing and reporting-but-undeclared (station, variable) pairs.

```sql
WITH expected AS (
    SELECT dm.device_id AS station_id, dm.measurement_code AS variable
    FROM device_measurements dm
    WHERE dm.is_active = true
),
actual AS (
    SELECT station_id, variable,
           COUNT(*) AS reading_count,
           MAX(timestamp) AS last_reading
    FROM weather_data
    GROUP BY station_id, variable
)
SELECT
    ws.station_id,
    ws.station_code,
    COALESCE(e.variable, a.variable)   AS variable,
    CASE
        WHEN a.station_id IS NULL THEN 'DECLARED_NO_DATA'
        WHEN e.station_id IS NULL THEN 'DATA_NOT_DECLARED'
        ELSE 'OK'
    END                                AS status,
    a.reading_count,
    a.last_reading
FROM weather_stations ws
LEFT JOIN expected e ON e.station_id = ws.station_id
FULL OUTER JOIN actual a
       ON a.station_id = COALESCE(e.station_id, ws.station_id)
      AND a.variable   = e.variable
WHERE COALESCE(e.station_id, a.station_id) = ws.station_id
ORDER BY ws.station_id, status, variable;
```

Filter `WHERE status <> 'OK'` for just the problems.

---

## 4. Time-density / gap detection — is the cadence being met?

Compares expected vs. actual reading counts per station per day using `ingest_cadence_minutes`.

```sql
WITH daily AS (
    SELECT
        wd.station_id,
        wd.variable,
        wd.timestamp::date            AS day,
        COUNT(*)                      AS readings
    FROM weather_data wd
    WHERE wd.timestamp >= now() - interval '30 days'
    GROUP BY wd.station_id, wd.variable, wd.timestamp::date
)
SELECT
    ws.station_code,
    d.variable,
    d.day,
    d.readings,
    (1440 / NULLIF(ws.ingest_cadence_minutes, 0)) AS expected_per_day,
    ROUND(100.0 * d.readings
        / NULLIF(1440 / NULLIF(ws.ingest_cadence_minutes, 0), 0), 0) AS pct_of_expected
FROM daily d
JOIN weather_stations ws ON ws.station_id = d.station_id
WHERE d.readings < (1440 / NULLIF(ws.ingest_cadence_minutes, 0)) * 0.8  -- < 80% of expected
ORDER BY ws.station_code, d.variable, d.day;
```

---

## 5. Missing-day detection — calendar gaps per station × variable series

Generates the full expected date range and left-joins actual days, returning dates with no data.

```sql
WITH bounds AS (
    SELECT station_id, variable,
           MIN(timestamp)::date AS first_day,
           MAX(timestamp)::date AS last_day
    FROM weather_data
    -- WHERE timestamp >= now() - interval '1 year'   -- bound the scan on big tables
    GROUP BY station_id, variable
),
calendar AS (
    SELECT b.station_id, b.variable,
           generate_series(b.first_day, b.last_day, interval '1 day')::date AS day
    FROM bounds b
),
have AS (
    SELECT DISTINCT station_id, variable, timestamp::date AS day
    FROM weather_data
)
SELECT
    ws.station_code,
    c.variable,
    c.day AS missing_day
FROM calendar c
JOIN weather_stations ws ON ws.station_id = c.station_id
LEFT JOIN have h
       ON h.station_id = c.station_id
      AND h.variable   = c.variable
      AND h.day        = c.day
WHERE h.day IS NULL
ORDER BY ws.station_code, c.variable, c.day;
```

---

## 6. Variable coverage summary — which variables exist and how widely

```sql
SELECT
    wd.variable,
    mc.display_name,
    mc.canonical_unit,
    mc.domain,
    COUNT(DISTINCT wd.station_id) AS station_count,
    COUNT(*)                      AS total_readings,
    MIN(wd.timestamp)             AS earliest,
    MAX(wd.timestamp)             AS latest
FROM weather_data wd
LEFT JOIN measurement_catalog mc ON mc.code = wd.variable
GROUP BY wd.variable, mc.display_name, mc.canonical_unit, mc.domain
ORDER BY station_count DESC, total_readings DESC;
```

A `variable` with a NULL `display_name` = a code in `weather_data` not in `measurement_catalog`
(data-hygiene flag).

---

## 7. Zone-level completeness — do all zones have contributing stations?

```sql
SELECT
    cz.id AS zone_id,
    cz.name AS zone,
    COUNT(DISTINCT ws.station_id) FILTER (WHERE ws.is_active) AS active_stations,
    COUNT(DISTINCT ws.station_id) FILTER (WHERE ws.contributes_to_regional) AS regional_stations,
    COUNT(DISTINCT wd.variable) AS variables,
    MAX(wd.timestamp) AS latest_reading
FROM climate_zones cz
LEFT JOIN weather_stations ws ON ws.zone_id = cz.id
LEFT JOIN weather_data wd ON wd.station_id = ws.station_id
GROUP BY cz.id, cz.name
ORDER BY cz.name;
```

Zones with `regional_stations = 0` or a stale `latest_reading` won't produce reliable
`climate_zone_daily` aggregates.

---

## 8. Orphaned readings — station_id with no matching station row

`weather_data.station_id` is not a declared FK, so run this one-off integrity check.

```sql
SELECT wd.station_id, COUNT(*) AS reading_count, MIN(wd.timestamp), MAX(wd.timestamp)
FROM weather_data wd
LEFT JOIN weather_stations ws ON ws.station_id = wd.station_id
WHERE ws.station_id IS NULL
GROUP BY wd.station_id
ORDER BY reading_count DESC;
```
