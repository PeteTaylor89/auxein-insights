# GDC Hilltop Data Ingestion — Implementation Spec

## Overview

Implement a data ingestion pipeline for Gisborne District Council (GDC) environmental monitoring data via their Hilltop Server, following the same pattern as existing ECAN, MDC, GWRC, and HBRC ingestion modules in Auxein Engine.

**Base URL:** `http://hilltop.gdc.govt.nz/data.hts`

**Region code to use internally:** `GDC`

---

## Target Sites & Measurements

### Rainfall Sites

| Site Name (exact) | Measurements |
|---|---|
| `Ceasar Rd No1 Bore` | Rainfall (hourly totals) |
| `Hika No1 Bore` | Rainfall (hourly totals) |
| `Waipaoa River at Matawhera Bridge` | Rainfall (hourly totals) |
| `Cameron Road` | Rainfall (hourly totals) |
| `Airport Met station` | Rainfall (hourly totals) |
| `Stout St` | Rainfall (hourly totals) |

> ⚠️ Verify exact site name strings against the Hilltop SiteList before hardcoding. GDC site names are case-sensitive. Run the SiteList probe first (see Discovery step below).

### Climate / Weather Station Sites

| Site Name (exact) | Measurements |
|---|---|
| `Airport` | Air Temperature, Relative Humidity, Wind Speed (Average), Wind Speed (Maximum), Wind Direction |

> Note: The rainfall page uses `Airport Met station` while the weather stations page may list this as `Airport`. Probe both — they may be the same physical station with different Hilltop site names, or separate entries. Confirm via MeasurementList before splitting.

### Soil Temperature & Moisture Sites

| Site Name (exact) | Measurements |
|---|---|
| `Ceasar Rd No1 Bore` | Soil Temperature, Soil Moisture |
| `Hika No1 Bore` | Soil Temperature, Soil Moisture |
| `Cameron Road` | Soil Temperature, Soil Moisture |

> Note: Ceasar Rd and Hika appear in both Rainfall and Soil groups — a single site may carry multiple measurement types. Confirm available measurements per site via MeasurementList.

---

## Discovery Step — Run Before Coding

Before writing the ingestion logic, probe the GDC Hilltop server to confirm exact site names and available measurements. Run these queries manually or as a one-off script:

```bash
# 1. Full site list with coordinates
curl "http://hilltop.gdc.govt.nz/data.hts?Service=Hilltop&Request=SiteList&Location=LatLong"

# 2. Measurements available at a specific site (repeat for each target site)
curl "http://hilltop.gdc.govt.nz/data.hts?Service=Hilltop&Request=MeasurementList&Site=Ceasar+Rd+No1+Bore"
curl "http://hilltop.gdc.govt.nz/data.hts?Service=Hilltop&Request=MeasurementList&Site=Airport+Met+station"
curl "http://hilltop.gdc.govt.nz/data.hts?Service=Hilltop&Request=MeasurementList&Site=Cameron+Road"

# 3. Sample data fetch — verify response format
curl "http://hilltop.gdc.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Cameron+Road&Measurement=Rainfall&TimeInterval=P1D"
```

Capture the XML responses and use them to confirm:
- Exact `SiteName` strings (spaces, capitalisation, punctuation)
- Exact `Measurement` names (e.g. `Rainfall`, `Air Temperature`, `Soil Temperature`, `Soil Moisture`)
- Whether `Airport Met station` and `Airport` are the same site
- Whether soil bore sites carry rainfall AND soil measurements simultaneously

---

## API Pattern

GDC Hilltop uses the standard Hilltop Server XML API. All requests are HTTP GET. Responses are XML.

### Hourly Rainfall Fetch

```
GET http://hilltop.gdc.govt.nz/data.hts
  ?Service=Hilltop
  &Request=GetData
  &Site=<SiteName>
  &Measurement=Rainfall
  &Method=Total
  &Interval=1+hour
  &From=<ISO8601>
  &To=<ISO8601>
```

### Climate / Weather Fetch

```
GET http://hilltop.gdc.govt.nz/data.hts
  ?Service=Hilltop
  &Request=GetData
  &Site=Airport
  &Measurement=Air+Temperature
  &Method=Average
  &Interval=1+hour
  &From=<ISO8601>
  &To=<ISO8601>
```

Repeat for each measurement: `Relative Humidity`, `Wind Speed`, `Wind Direction`.

### Soil Fetch

```
GET http://hilltop.gdc.govt.nz/data.hts
  ?Service=Hilltop
  &Request=GetData
  &Site=<SiteName>
  &Measurement=Soil+Temperature
  &From=<ISO8601>
  &To=<ISO8601>
```

### Temporal Filter Options

| Use case | Parameter |
|---|---|
| Last 24 hours | `TimeInterval=P1D` |
| Last 7 days | `TimeInterval=P7D` |
| Custom range | `From=2025-01-01T00:00&To=2025-01-31T23:59` |
| Most recent value only | Omit all time params |

---

## Implementation Tasks

### 1. Config / Constants

Add GDC to the regional council config alongside existing councils.

```python
GDC_HILLTOP_BASE_URL = "http://hilltop.gdc.govt.nz/data.hts"

GDC_RAINFALL_SITES = [
    "Ceasar Rd No1 Bore",
    "Hika No1 Bore",
    "Waipaoa River at Matawhera Bridge",
    "Cameron Road",
    "Airport Met station",
    "Stout St",
]

GDC_CLIMATE_SITES = [
    "Airport",  # confirm exact name via discovery
]

GDC_CLIMATE_MEASUREMENTS = [
    "Air Temperature",
    "Relative Humidity",
    "Wind Speed",
    "Wind Direction",
]

GDC_SOIL_SITES = [
    "Ceasar Rd No1 Bore",
    "Hika No1 Bore",
    "Cameron Road",
]

GDC_SOIL_MEASUREMENTS = [
    "Soil Temperature",
    "Soil Moisture",
]
```

### 2. Fetcher Module

Create `app/ingestion/gdc_hilltop.py` (or equivalent path following existing module naming).

- Reuse the existing Hilltop XML parser already built for ECAN/HBRC
- Add GDC-specific site/measurement lists
- Handle the case where a site appears in multiple measurement groups (rainfall + soil) without duplicate fetches — fetch MeasurementList once per site and dispatch accordingly
- All times should be stored as UTC; GDC data is NZDT (UTC+13 in summer, UTC+12 in winter) — apply the same DST-aware conversion used for other NZ councils

### 3. GitHub Actions Scheduler

Add a GDC ingestion job to the existing GitHub Actions workflow.

Suggested schedule:
- **Rainfall:** every 30 minutes (GDC updates hourly but staggered; 30 min cadence avoids gaps)
- **Climate (weather station):** every 30 minutes
- **Soil:** every 60 minutes

Follow the existing job pattern for ECAN/HBRC in the workflow YAML.

### 4. Database

Add GDC site records to the sites table using coordinates from the SiteList response. Use `region_code = 'GDC'` and `data_source = 'GDC_HILLTOP'`.

Measurement type mapping for DB storage:

| Hilltop Measurement | DB measurement_type |
|---|---|
| Rainfall | `rainfall_mm` |
| Air Temperature | `air_temp_c` |
| Relative Humidity | `relative_humidity_pct` |
| Wind Speed | `wind_speed_ms` |
| Wind Direction | `wind_direction_deg` |
| Soil Temperature | `soil_temp_c` |
| Soil Moisture | `soil_moisture_pct` |

Confirm soil moisture units from the MeasurementList response (may be `%` volumetric water content or `m³/m³` depending on sensor).

### 5. Error Handling

- GDC Hilltop may return empty XML for sites with no recent data (common after dry periods for rainfall sites) — handle gracefully, log as `no_data` not as error
- Some HBRC-operated sites embedded in GDC data are flagged as "raw format" — tag these records with `quality_flag = 'RAW'` in the DB and exclude from derived calculations until QA'd
- Add GDC to the existing council health-check endpoint

---

## Data Quality Notes

Per GDC's own documentation:
- Hourly totals are **end-of-period**: a value timestamped 10:00am covers 9:01am–10:00am
- Last 24h and 7-day totals are **hour-aligned** (e.g. at 8:28am, the 24h total runs back to 8:00am)
- All times on the GDC frontend are NZDT — the raw Hilltop XML timestamps should be verified for timezone encoding during discovery
- HBRC-operated sites within GDC's network are explicitly raw/unprocessed

---

## Terms of Use — Implementation Note

GDC data is used under their website terms (non-commercial / informational use, with attribution). Before Auxein Grow goes live with GDC data feeding commercial dashboards, obtain written confirmation from GDC that the use case is acceptable. Contact: service@gdc.govt.nz. In the meantime, attribute GDC as the data source in any UI display.

---

## References

- GDC Rainfall page: https://www.gdc.govt.nz/environment/maps-and-data/rainfall-data
- GDC Weather Stations page: https://www.gdc.govt.nz/environment/maps-and-data/weather-stations
- GDC Soil Temp/Moisture page: https://www.gdc.govt.nz/environment/maps-and-data/soil-temperature-and-moisture
- GDC Terms & Conditions: https://www.gdc.govt.nz/about-this-site
- Hilltop Server API docs: http://hilltop.gdc.govt.nz/data.hts (root URL returns API reference)
- hilltoppy (Python wrapper): https://hilltop-py.readthedocs.io