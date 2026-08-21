"""Waikato Regional Council — KiWIS configuration.

Probe results, coverage justification and the full trap list are in
`docs/plans/PROBE_WAIKATO_KIWIS_2026-08-21.md`. Regenerate the site inventory with
`ingestion/scripts/probe_kiwis.py --host envdata.waikatoregion.govt.nz:8080`.

## Why this source exists

Waikato was the largest single component of the 27,710 km² rainfall deficit — land
we could prove we were missing, because CLIFLO covers it and we did not. The
interior of the region was empty: the nearest station we held to each of these
gauges is 20-53 km away, and every one of those neighbours (BOPRC, SYNOP, HORIZONS,
HBRC) sits *outside* the region.

Adding the 37 live gauges moves p90 land-to-gauge distance from 33.9 km to 29.1 km
and drops the share of NZ land beyond 30 km of a gauge from 12.8 % to 9.4 % —
roughly 9,000 km². Rainfall reaches back to 1976-03-09, second only to MDC.

## Access

`http://envdata.waikatoregion.govt.nz:8080/KiWIS/KiWIS` — KiWIS, Kisters' documented
interface onto their WISKI archive. Public, keyless, no WAF, no session.

**HTTP on port 8080 only. Do not "fix" this to https** — same as BoP, where port 443
is simply dropped.

This host is unrelated to the two that blocked us in August 2026:
`www.waikatoregion.govt.nz/api/v1/enviromap/` (Imperva, rejects scripted clients)
and `api.waikatoregion.govt.nz` (Azure APIM, route unguessable). The conclusion that
Waikato needed a council access grant was wrong — it needed a host nobody guessed.

**LICENCE: CC BY 4.0 — attribute Waikato Regional Council.**
"""

API_BASE = "http://envdata.waikatoregion.govt.nz:8080/KiWIS/KiWIS"

DATA_SOURCE = "WRC"
REGION = "Waikato"

# Only `datasource=0` exists; 1 and 2 answer "Datasource parameter not found in
# config". It is a required parameter on every request, not an optional one.
DATASOURCE = "0"


# ---------------------------------------------------------------- what we ingest

# KiWIS parametertype_name -> our canonical variable.
#
# EXACT MATCH, and deliberately a short list. The server carries 11,409 series and
# the overwhelming majority are water: level, discharge, groundwater, E. coli,
# nutrients, metals, macroinvertebrate indices. Matching on a substring would be a
# disaster here — "Water Temperature" (381 series of river temperature) and
# "Temperature" both contain "Temp", and neither is an air temperature.
#
# Confirmed ABSENT from KiWIS by enumerating `parametertype_name=*`: soil moisture,
# soil temperature, evapotranspiration, dew point. Do not add mappings for them —
# the WRC enviromap page advertises SoilM 9 / SoilT 9, but that is a different
# system (still WAF-blocked) publishing a different subset of the same network.
MEASUREMENT_MAP = {
    "Precipitation": ("rainfall", "mm"),
    "Air Temperature": ("temp", "C"),
    "Humidity": ("rh", "%"),
    "Wind Speed": ("wind_speed", "m/s"),
    "Wind Direction": ("wind_direction", "deg"),
    "Barometric Pressure": ("pressure", "hPa"),
}

# WRC's own `ts_unitname` for each variable, and the reason there is no conversion
# factor anywhere in this source.
#
# Every WRC series is ALREADY canonical: wind is uniformly "meter per second" across
# all 31 series, pressure "hectopascal" across 43, humidity "percentage",
# precipitation "millimeter", temperature "degree Celsius". That is unusual and not
# to be assumed — HBRC, GDC and TDC all publish wind in km/h and need a /3.6, and
# Horizons publishes `Wind Speed` in m/s at 18 sites, km/h at 2 and mm/s at 1.
#
# So the seeder ASSERTS this rather than trusting it. A silent unit swap is
# unrecoverable downstream — the numbers stay plausible forever — and the cost of
# catching it is one comparison at seed time. If WRC ever reconfigures a sensor to
# km/h, seeding fails loudly instead of quietly poisoning the wind field.
EXPECTED_KIWIS_UNITS = {
    "rainfall": "millimeter",
    "temp": "degree Celsius",
    "rh": "percentage",
    "wind_speed": "meter per second",
    "wind_direction": "degree",
    "pressure": "hectopascal",
}

# Deliberately NOT ingested, though they exist:
#
#   Solar Radiation   ONE series, at Inferno Crater Weather Station, dead since
#                     2026-02-24, and reported in MJ/m2 (an accumulation) where our
#                     `solar_radiation` is W/m2 (a flux). One dead station is not
#                     worth a unit-conversion path that nothing else exercises.
#   Water Temperature 381 series of river temperature. Not a weather variable.
#   everything else   hydrology and water quality.
IGNORED_PARAMETERS = {
    "Solar Radiation", "Global Radiation", "Water Temperature", "Generic",
}


# Which ts_name to take per variable, best first. A KiWIS station carries 10-20
# series per parameter and only one of them is the observation.
#
# `10 - HourTotal` beats the native event series for rainfall because it is an EXACT
# aggregate of it — verified at Pinnacles, 39.50 mm both ways over 2026-08-14, at 24
# rows against 103. So preferring it costs no accuracy and cuts volume ~4x. It is
# present at 28 of the 37 live gauges; the rest fall back to `Continuous5m.P`.
SERIES_PREFERENCE = {
    "rainfall": ["10 - HourTotal", "00 - Continuous5m.P", "00 - Continuous.P",
                 "00 - Continuous.O", "20 - DayTotal"],
    "_default": ["10 - HourMean", "10 - HourMovMean", "00 - Continuous.P",
                 "00 - Continuous.O", "20 - DayMean"],
}

# Everything NOT in SERIES_PREFERENCE is excluded, and the exclusions are the point:
#
#   60/61 - LongTerm*   climatology. Its `to` runs into the FUTURE (2026-12-01), so
#                       it silently defeats any liveness test built on max(to).
#   40 - YearTotal, 30 - Month*, 25 - WeekTotal, 20 - DayAccum, 20 - DayMovTotal
#                       accumulations; summing them into a daily total double-counts
#   05 - Observer*      manual flask and dip readings, irregular
#   90 - Migrated_*     legacy HydroTel/Tideda imports, superseded by Continuous
#   99 - *_Old, 01 - CurrentMonthAccum
#   *.P2                a second processing stage that lags the primary by weeks


# --------------------------------------------------------------------- quality

# NEMS-aligned quality codes from `getQualityCodes`. The ones we refuse.
#
# 130 SYNTHETIC is the one that matters and the reason this map exists at all. It is
# MODELLED INFILL — the council's own reconstruction of a gap, not a reading. No
# other source we ingest labels its infill, so nothing upstream would catch it, and
# ingesting it would put a model's output into `weather_data` and then fit the
# national TPS against it. Measured at 43 values across 14 stations in 2025: rare
# enough to read as noise in a row count, and one of them is enough to distort a
# day's fit.
#
# 228 and 234 are the same argument: an extrapolation and an untrusted external
# feed are not observations.
REJECT_QUALITY_CODES = {
    130,   # 300 NEMS — Synthetic
    228,   # Data estimated, generated, forecast or extrapolated
    234,   # External Source — Doubtful Quality
}

# Kept, but stored as PROVISIONAL rather than GOOD so downstream can tell.
#
#   254  Provisional/Unassessed — the bulk of anything recent (84 % of 2025). Every
#        live reading starts here and is re-coded later, which is also why the
#        incremental overlaps: the VALUE can change when the code does.
#   231  "Use with Caution - Possible data problems" (2.29 % of 2015)
#   160  200 NEMS — No Quality or Non verified
#   222  External Data - Unknown Quality
#   225  Non-standard sampling location
#   211  Reference readings differ from primary due to a reality shift
SUSPECT_QUALITY_CODES = {254, 231, 160, 222, 225, 211}

# The code table starts at 0, but real payloads also carry **-1, which is not in it
# at all** and always arrives with an EMPTY value — it is the explicit no-data
# marker for a gap. Karamu Walkway has 411 consecutive such hours in 2015.
#
# This is why the parser must skip empty values rather than coercing them: reading
# an empty rainfall cell as 0.0 would manufacture a 411-hour dry spell out of a
# telemetry outage, and it would look completely plausible.
#
# An unrecognised code is therefore treated as suspect, never as good — the
# vocabulary is demonstrably not closed.
GAP_QUALITY_CODE = -1


# --------------------------------------------------------------------- fetching

# THE WINDOW LIMIT IS A ROW CAP, NOT A TIME CAP. Measured at Pinnacles on the native
# event series: 1 year fine, 2 years / 209,066 rows fine, 3 years -> HTTP 500
# `DatasourceError`.
#
# That distinction drives the design. A fixed chunk LENGTH is wrong, because the
# same 3-year window succeeds at a quiet gauge and fails at a busy one, and because
# a station's own density changes over its record (Pinnacles returned 3.6 MB for
# 2015 and 0.4 MB for 2024). So: start optimistic and halve on failure.
CHUNK_DAYS = 365
MIN_CHUNK_DAYS = 15

# Seconds between requests. THE HOST DROPS CONNECTIONS UNDER RAPID OR CONCURRENT
# LOAD and recovers on its own: 37 back-to-back fetches lost 5 stations to connect
# timeouts, while the same sweep at 1 s spacing lost none. The failures surface as
# ordinary per-station exceptions, so without this they would be logged, skipped and
# never noticed.
REQUEST_DELAY = 1.0
RETRY_BACKOFF = (3, 6, 9)

# Match the rest of the platform. Earliest data is 1976 and the full record is
# ~20.2 M rows; 2020 keeps Waikato consistent with every other council source and
# with the live-surface era.
BACKFILL_START = "01/01/2020"

# Re-fetch a little before the last stored point. WRC revises: a series moves from
# 254 Provisional to 210/40 as it is quality-coded, and the upsert makes the overlap
# free.
INCREMENTAL_OVERLAP_HOURS = 3
