"""ECan (Environment Canterbury) AIR QUALITY network — met configuration.

Separate from `ecan_sites.py`, which configures ECan's *rainfall* feed, because
these are physically different stations on a different telemetry system with a
different URL grammar. Rainfall uses `?SiteNo=&Period=`; air uses
`?SiteId=&StartDate=&EndDate=`, and the two site-number namespaces are unrelated
(rainfall SITE_NOs look like 237101, air SiteIds are 1-91).

## Why this source exists

ECan runs 102 rain gauges and, through Hilltop and the rainfall portal, **zero
thermometers**. Canterbury therefore carried a 4,453 km² temperature deficit
against CLIFLO — land within 20 km of a CLIFLO station but beyond 30 km of any
of ours (`docs/plans/LIVE_SURFACES_DISCOVERY_2026-08-19.md` §7).

The air-quality network is the exception: dispersion modelling needs met
sensors, so these sites carry screened-ish air temperature and wind alongside
the pollutants. This is the same shape as Bay of Plenty, whose AQ network
supplied 10 of our 14 BoP thermometers.

**Geraldine (-44.100, 171.242) sits inside the two largest deficit cells in the
country** (3,992 km² combined). Rangiora and Kaiapoi take the North Canterbury
cell. Nothing here reaches the Mackenzie or the Southern Alps.

## Access

Public, keyless, on `data.ecan.govt.nz`. The `Ocp-Apim-Subscription-Key` gate
that the source map documents applies to `apidevelopers.ecan.govt.nz` — the
*developer* portal — and not to this one.

**LICENCE: CC BY 4.0** — attribute Environment Canterbury. Stated in the portal
footer: "All data unless specifically stated is licensed under a Creative
Commons Attribution 4.0 International License."

## Probed 2026-08-19 — see docs/plans/PROBE_ECAN_AIR_NZTA_2026-08-19.md

- Eight stations return unbroken 168/168-hour weeks in every year 2020→2026.
- Granularity stays **hourly at every window length**. This matters: the ECan
  *rainfall* feed silently switches to one midnight-stamped daily total per day
  once the window exceeds a month, which is why `ecan.py` needs its daily/hourly
  seam guard. This feed does not, so no seam logic is required here.
- A full-year request returns ~8,754 rows and succeeds; a **two-year request
  504s**. Hence CHUNK_DAYS below.
- Five of the sixteen sites carrying temperature channels in the metadata are
  decommissioned (Lincoln 2010, Burnside 2010, Timaru Grey Rd 2006, Waimate
  Stadium 2015, Washdyke Flat Rd 2019). Seeding reads `LatestDateTime` from
  method 23 rather than assuming the channel list is current.
"""

API_BASE = "https://data.ecan.govt.nz/data"

# Method 94 is the hourly series; 23 lists sites (with LatestDateTime, which is
# how we tell a live station from a decommissioned one); 180 gives the station x
# monitor-channel matrix, which is the only place lat/lon and the channel type
# codes appear.
ENDPOINTS = {
    "hourly": "94/Air/Air%20quality%20data%20for%20a%20monitored%20site%20(hourly)",
    "sites": "23/Air/Air%20quality%20sites%20monitored",
    "channels": "180/Air/Air%20quality%20all%20stations%20and%20monitor%20channels",
}

# MonitorTypeCode for the temperature channels, from method 180.
#
# MATCH ON THESE CODES, NOT ON THE STRING "temp". West Coast's Reefton sites
# expose `BAM Air Temperature` — a beta-attenuation monitor's INTERNAL INSTRUMENT
# temperature, not an air temperature. It passes any naive name filter and is
# meteorologically meaningless. ECan's own channel list does not contain it, but
# the seeding script matches on code so a future council reusing this shape
# cannot introduce one.
TEMP_MONITOR_TYPE_CODES = {"169": "temp_2m", "170": "temp_6m"}

# Field name -> (variable, unit, scale). Keys are the DECODED field names; the
# raw JSON keys are XML-name-escaped (`Temperature_x0020_2m_x0020__x0028_DegC_x0029_`).
#
# Lookup normalises case and collapses whitespace (see `_normalise` in the
# source), but every accepted spelling is still listed EXPLICITLY. Nothing is
# inferred by stripping the unit suffix: `Wind speed (m/s)` and a hypothetical
# `Wind speed (km/h)` must never collapse onto one key, because the map is where
# the unit comes from and a silent unit swap is unrecoverable downstream.
#
# The field name in the payload is the channel's `MonitorFullName` from method
# 180, and ECan's is not consistent across stations — Ashburton 2 publishes
# `'Temperature 2m '` (trailing space, no unit) where every other site publishes
# `'Temperature 2m (DegC)'`. Hence the alias. That single inconsistency silently
# dropped 17,800 rows on the first backfill run.
#
# Verified against the live payload at 10 sites. Note what is NOT here: the
# method 180 channel list advertises `RH` and `WEB_RH`, but the hourly endpoint
# returns no humidity field at any site. Advertised channels and served fields
# are different sets — do not add a mapping from the channel list without
# confirming it appears in a response.
MEASUREMENT_MAP = {
    "Temperature 2m (DegC)": ("temp", "C", 1.0),
    "Temperature 2m": ("temp", "C", 1.0),          # Ashburton 2's spelling
    "Wind speed (m/s)": ("wind_speed", "m/s", 1.0),
    "Wind direction (Deg)": ("wind_direction", "deg", 1.0),
    "Wind maximum (m/s)": ("wind_gust", "m/s", 1.0),
}

# Deliberately dropped rather than mapped.
#
# `Temperature 6m (DegC)` is a second height on the same mast, present at 8 of 9
# live sites. It is NOT a second station and must never be averaged with the 2 m
# value — the whole point of a two-height mast is that they differ, and the
# gradient between them is the inversion strength the AQ programme is measuring.
# 2 m is the meteorological standard and the height CLIFLO reports, so 2 m is the
# one we take. (The metadata is not even self-consistent about the second height:
# St Albans labels MonitorTypeCode 170 as "Temperature 10m".)
#
# `AS/NZS 3580.14 Section 2` is UNRESOLVABLE and must stay unmapped.
#
# At Ashburton 2 that string is the `MonitorFullName` of BOTH channel 1
# (`Wind Speed V`, MonitorTypeCode 18) AND channel 2 (`Wind Dir V`, code 19) —
# the station's metadata gives the name of the *standard the instrument complies
# with* instead of the quantity. Two channels, one field name, so the payload
# carries a single unlabelled number and nothing in the response says whether it
# is m/s or degrees. A plausible-looking value (6.77) makes a guess tempting; a
# guess here would put wind direction into the wind-speed series at one station
# for six years. Leave it. Wind at Ashburton 2 is lost until ECan fixes the
# metadata, and the loss is visible in the unmapped-field report.
#
# Pollutants are out of scope for a weather platform.
IGNORED_FIELDS = {
    "Temperature 6m (DegC)",
    "AS/NZS 3580.14 Section 2",
    "PM10 (ug/m3)", "PM2.5 (ug/m3)", "NO (ug/m3)", "NO2 (ug/m3)",
    "CO (mg/m3)", "SO2 (ug/m3)", "O3 (ug/m3)", "Benzene (ug/m3)",
    "DateTime", "StationName", "site_no", "SiteNo",
}

# Physical plausibility bounds, applied at ingest.
#
# `db_util.bulk_upsert_observations` already rejects NaN/inf and |value| >= 1e6,
# but that is a STORAGE bound, not a physical one — it happily stores -100 degC.
# It has to be that permissive because it is shared across every variable.
#
# A per-variable gate belongs at the source, where the variable is known. This is
# the ingest half of the fix in LIVE_SURFACES_DISCOVERY §5 Phase 0.1: telemetry
# no-data sentinels (-100, -7999, -9999) were reaching `weather_data_daily` and a
# single one of them destroys a whole day's national TPS fit.
#
# Bounds are generous — the intent is to reject the impossible, never to trim a
# real extreme. NZ's record low is -25.6 degC (Ranfurly 1903) and its record high
# 42.4 degC (Rangiora 1973, and Rangiora is one of these very stations).
VALUE_RANGES = {
    "temp": (-30.0, 45.0),
    "wind_speed": (0.0, 75.0),
    "wind_gust": (0.0, 90.0),
    "wind_direction": (0.0, 360.0),
}

# One year of hourly data is ~8,760 rows and returns fine; two years 504s at the
# gateway. 180 days keeps a comfortable margin and bounds the response we hold in
# memory, at the cost of ~14 requests per station for a full 2020->now backfill.
CHUNK_DAYS = 180

# The published record for the live stations reaches at least this far back;
# probed complete for 2020 at eight sites. Individual stations start later and
# the seeding script records nothing about start dates, so a backfill simply
# asks from here and takes whatever the feed gives.
BACKFILL_START = "2020-01-01"

DATA_SOURCE = "ECAN_AIR"
REGION = "Canterbury"
