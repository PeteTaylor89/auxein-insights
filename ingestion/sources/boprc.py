"""
Bay of Plenty Regional Council (BoP) weather ingestion — OGC **SOS 2.0**.

Endpoint: http://sos.boprc.govt.nz/service   (IP-allowlisted to the ingestion box)

BoP granted access on 2026-08-11 and did NOT open the AQUARIUS WebPortal value path we
spent 2026-08-04/05 reverse-engineering. They pointed us instead at a separate OGC Sensor
Observation Service sitting in front of the same AQUARIUS time-series database. The
portal-scraping approach in the previous version of this module is therefore retired:
`envdata.boprc.govt.nz` remains permission-gated forever as far as we are concerned, and
nothing here touches it. Access instructions and the curated site list are committed at
`docs/plans/BOPRC SOS Server Access Instructions - Auxein Climate Data.docx` and
`docs/plans/BOPRC Location Lists - Auxein.xlsx`.

------------------------------------------------------------------------------------
FIVE TRAPS, each of which returns HTTP 200 and looks like an empty result
------------------------------------------------------------------------------------
1. **It must be `http://`, NOT `https://`.** Port 443 is DROPPED (TCP no-response, 40s
   connect timeout); port 80 is open. An https attempt is indistinguishable from "the
   allowlist was never applied", which is how this access nearly got written off twice.
   Do not add a scheme fallback that retries https — it just doubles every timeout.

2. **An `<ows:ExceptionReport>` comes back with HTTP 200, not 4xx.** `raise_for_status()`
   passes cleanly on a malformed request. `_check_exception()` below parses for the
   element; every response goes through it.

3. **Omitting `temporalFilter` does NOT return the full record** — it silently returns
   only the most recent ~week (1,041 points on the reference series). Always send an
   explicit filter; never rely on the default.

4. **`GetCapabilities`'s `<sos:ObservationOffering>` blocks are a TRUNCATED subset** —
   4,450 blocks against **22,405** genuinely queryable offerings. The authoritative
   catalogue is the `<ows:Value>` list under `<ows:Parameter name="offering">` in the
   operations metadata. Reading the offering blocks instead makes whole variables vanish:
   `Soil Moisture.Primary` and `Soil Temp.Primary` have NO offering block at all, yet
   both return data. See `seed_boprc_from_sos.py`, which reads the AllowedValues list.

5. **A window before the start of record returns an empty 200**, not an exception — so an
   empty response is not evidence that a series is dead. Judge liveness on the period of
   record from GetDataAvailability, or on `max(timestamp)` in the DB.

------------------------------------------------------------------------------------
CONTRACT (all verified live from the box, 2026-08-13)
------------------------------------------------------------------------------------
  GetObservation   ?service=SOS&version=2.0.0&request=GetObservation
                   &offering=<Parameter>.Primary@<LocationId>
                   &temporalFilter=om:phenomenonTime,<start>/<end>
  GetFeatureOfInterest  (no argument) -> all 3,495 monitoring points, each with a
                   `gml:name` and WGS84 `ns:pos`. This is the seeder's coordinate source.
  GetDataAvailability   &featureOfInterest=<LocationId> -> datasets + period of record.

`temporalFilter` accepts BOTH the ISO duration forms in BoP's instructions
(`P6M/2019-08-01T`, `2019-03-01T/P6M`) and — more useful for chunking — an **explicit
`start/end` interval** (`2020-01-01T/2020-01-08T`, with or without a `Z` offset). The
explicit form is what this module uses; it makes each chunk exactly reproducible.

Response is WaterML 2.0: `wml2:MeasurementTVP` pairs of `wml2:time` / `wml2:value`.

**Timestamps are TRUE UTC.** Verified 2026-08-13: the newest point read
`2026-08-12T21:10Z` against a wall clock of `2026-08-12T21:15Z`. There is NO
Environment-Southland-style wall-clock-as-UTC offset here — do NOT subtract 12 hours.

**Units are asserted by the server and CHECKED here.** Every response carries
`<wml2:uom code="...">`. The previous version of this module refused to convert anything
because the AQUARIUS catalogue published no unit string; that is resolved — BoP's
instructions document the units AND the wire format confirms them per response. All are
already canonical (degC, mm, %, m/s, deg, hPa, W/m^2) so **no scaling is needed** —
unlike HBRC/GDC/TDC/TRC, which serve wind in km/h. `parse_observation()` compares the
response's uom against EXPECTED_UOM and REFUSES the series on a mismatch rather than
ingesting a silently-rescaled variable.

**Rainfall is safe to sum.** `Precip Total.Primary` carries
`interpolationType=.../TotalPrec` and `cumulative=false`, i.e. each point is the total
for its own interval, not a running total. Points arrive at 10-minute spacing (5-minute
for most other variables).

------------------------------------------------------------------------------------
LABEL SELECTION — `Primary` and nothing else
------------------------------------------------------------------------------------
An offering is `<Parameter>.<Label>@<LocationId>`. BoP publishes each parameter under a
dozen labels and their own instructions say to use `Primary`. That is also the only
correct choice here, and the rule is enforced (not preferred) in LABEL:

  Day* / Hour* / Month* / Year*   pre-aggregated. A daily mean is not an observation; one
                                  value per day makes daily min = max = mean downstream.
  FieldResult                     manual spot samples taken during water-quality runs —
                                  irregular, sparse, biased to working hours. There are
                                  52 `Wind Vel.FieldResult` offerings against 19 real
                                  `Wind Vel.Primary`, so a parameter-level count of BoP's
                                  network overstates it by ~3x.
  External / External_Raw / MetService / HydroCorrect / Operational_GDC / _HBRC / ESNZ
                                  another agency's telemetry republished by BoP. We
                                  already ingest GDC, HBRC, Southland and MetService-fed
                                  SYNOP directly; seeding these would put two stations on
                                  one coordinate and double-weight it in the surface fit.

Because the rule is a whitelist of one, a new label appearing in the portal is ignored
rather than silently ingested at the wrong aggregation.

------------------------------------------------------------------------------------
VOLUME — read before launching a deep backfill
------------------------------------------------------------------------------------
This source is far denser than any council we have ingested. A single station-year of
5-minute air temperature is ~105,000 points and **71 MB** of XML; BoP will serve a full
year in one 11-second response. Depth of record is real: rainfall to **1901**, air temp
and wind to **1992**.

A 2020-01-01 floor across all 81 weather locations is on the order of **40-50 million
rows** — roughly twice the entire platform's current 24M. That is a deliberate decision,
not a default: BACKFILL_START below is the platform-standard 2020-01-01 floor used by
every other council, and `--start` overrides it. Requests are chunked at CHUNK_DAYS so no
single response has to be held in memory whole.
"""

import io
import math
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from xml.etree import ElementTree as ET

import requests
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).parent.parent))
from db_connection import get_ingestion_session
from sources.db_util import bulk_upsert_observations
from sources.http_util import get_with_hard_timeout
from sources.window_util import MAX_INCREMENTAL_DAYS, incremental_start

# http, NOT https — port 443 is dropped. See trap 1 in the module docstring.
BASE_URL = 'http://sos.boprc.govt.nz/service'

NS = {
    'wml2': 'http://www.opengis.net/waterml/2.0',
    'ows': 'http://www.opengis.net/ows/1.1',
    'sos': 'http://www.opengis.net/sos/2.0',
    'om': 'http://www.opengis.net/om/2.0',
    'gml': 'http://www.opengis.net/gml/3.2',
}

# The PREFERRED label. See the module docstring for why the vocabulary is curated
# rather than taken wholesale.
LABEL = 'Primary'

# Labels accepted ONLY when `Primary` yields nothing for the requested window.
#
# Added 2026-08-20. On 1 August 2026 BoP moved three air-quality sites' air
# temperature from `Air Temp.Primary` to `Air Temp.Operational`:
#
#     Air Temp.Operational@EK171423   Rotorua at Edmund Rd
#     Air Temp.Operational@EK687314   Rotorua at Moses Rd
#     Air Temp.Operational@DP650467   Tauranga at Otumoetai
#
# `Primary` still EXISTS for all three — GetDataAvailability reports it, its period
# of record simply stops at 2026-07-31T12:00:00Z — so nothing errored and nothing
# looked missing. The whitelist-of-one dropped the replacement series in silence
# and BoP's own portal showed 7 live thermometers against the 4 we were storing.
#
# Note this is BARE `Operational`, which is BoP's own unapproved telemetry. It is
# NOT the same as `Operational_GDC` / `Operational_HBRC` / `Operational_ESNZ`,
# which are other agencies' data republished by BoP and stay excluded — we ingest
# GDC and HBRC directly and seeding those would double-weight one coordinate in
# the surface fit.
#
# Ordering matters: this is a FALLBACK, never a parallel source. A location that
# publishes both would otherwise be ingested twice into the same (station,
# variable, timestamp) key, with the two series disagreeing on the same instant.
FALLBACK_LABELS = ('Operational',)

# Quality stamped on records that came from a fallback label. `Operational` is
# unapproved data — BoP's export page refuses to serve it for that reason — so it
# must not be stored as GOOD alongside quality-assured Primary. PROVISIONAL is the
# value SYNOP already uses for the same meaning, and the daily rollup accepts it
# (only QUARANTINED is excluded), so these stations return to the surface fit while
# staying distinguishable in the raw table.
FALLBACK_QUALITY = 'PROVISIONAL' 

# SOS observableProperty -> (canonical_variable, canonical_unit, scale)
# Every BoP unit is already canonical, so every scale is 1.0. If a scale ever needs to be
# other than 1.0, add it here AND to EXPECTED_UOM so the assertion still guards it.
MEASUREMENT_MAP = {
    'Precip Total':  ('rainfall',          'mm',      1.0),
    'Air Temp':      ('temp',              'C',       1.0),
    'Soil Temp':     ('soil_temp',         'C',       1.0),
    'Soil Moisture': ('soil_moisture_vwc', 'percent', 1.0),
    'Rel Humidity':  ('rh',                'percent', 1.0),
    'Atmos Pres':    ('pressure',          'hPa',     1.0),
    'Solar Rad':     ('solar_radiation',   'W/m2',    1.0),
}

# WIND IS DELIBERATELY NOT INGESTED FROM BoP (Pete's call, 2026-08-13).
# `Wind Vel`, `Wind Dir` and `Wind Gust Vel` are 13 sites each at 5-minute resolution —
# together roughly a THIRD of everything this source would pull off BoP's servers, more
# than any other variable group. Unlike rainfall there is no usable server-side hourly
# series to fall back on: `Wind Dir.HourMean` exists at only 5 of our 13 sites and
# `Wind Gust Vel.HourMean` at 11, so taking it would either drop sites or mix two
# aggregations into one series. Given the surface contract has no wind variable at all
# and Horizons' wind is already excluded from the fit on QC grounds, the load is not
# worth it.
#
# Re-enabling means restoring the three entries below to MEASUREMENT_MAP and re-seeding.
# The resampling rules for them are kept in RESAMPLE_MAX / RESAMPLE_CIRCULAR — they were
# measured, they are correct, and they are exactly what a future re-enable needs.
WIND_NOT_INGESTED = {
    'Wind Vel':      ('wind_speed',        'm/s',     1.0),
    'Wind Dir':      ('wind_direction',    'deg',     1.0),
    'Wind Gust Vel': ('wind_gust',         'm/s',     1.0),
}

# The uom code the server must report for each parameter. A mismatch means BoP changed a
# unit under us; parse_observation() refuses the series rather than rescaling blindly.
# This is the guard that replaces the old "units are unknown, refuse everything" stance.
EXPECTED_UOM = {
    'Precip Total':  {'mm'},
    'Air Temp':      {'degC'},
    'Soil Temp':     {'degC'},
    'Soil Moisture': {'%'},
    'Rel Humidity':  {'%'},
    'Atmos Pres':    {'hPa'},
    'Solar Rad':     {'W/m^2', 'W/m2'},
    # Retained for a future wind re-enable — see WIND_NOT_INGESTED.
    'Wind Vel':      {'m/s'},
    'Wind Dir':      {'deg', 'degree', 'degrees'},
    'Wind Gust Vel': {'m/s'},
}

# Deliberately NOT mapped:
#   'Water Temp'                       river temperature, not a weather variable (119 of
#                                      them — the single biggest parameter on the server).
#   'Standardised Precipitation Index' a derived drought index, not a measurement.
#   'Rainfall Infiltration Recharge'   modelled groundwater recharge, not rainfall.
# Everything else on the server is hydrology, water quality or water-take metering.

# Days per GetObservation request during a backfill. A year of 5-minute data is ~71 MB and
# ~105k points in ONE response; the server will serve it, but holding that in memory on a
# t3.micro while up to three sources run in parallel is not worth the round-trip saved.
# 90 days is ~18 MB / ~26k points / ~5s.
CHUNK_DAYS = 90

# Platform-standard floor, matching every other council. Deep history exists (rainfall to
# 1901) but see the VOLUME note in the module docstring before lowering this.
BACKFILL_START = '2020-01-01'

# ---------------------------------------------------------------------------------
# HOURLY RESAMPLING (backfill only) — see the VOLUME note in the module docstring.
#
# At native resolution a 2020 floor across 65 stations is ~80M rows, over three times the
# whole platform. Reducing the backfill to hourly brings that to ~9M. The forward feed
# stays native (Pete's standing call: fine data, 10-minute floor) — only history is
# reduced, and history is served to users as daily statistics anyway.
#
# THE AGGREGATION MUST BE PER-VARIABLE. A single "average the hour" rule silently
# corrupts three of them:
#   rainfall       each point is an INTERVAL TOTAL (interpolationType=TotalPrec), so the
#                  hour is a SUM. Averaging would divide the day's rain by ~6.
#   wind_gust      a gust is already a maximum over its own interval; the meaningful
#                  hourly value is the MAX. Averaging gusts reports a number that never
#                  occurred and destroys the extreme the variable exists to capture.
#   wind_direction a CIRCULAR quantity. The naive mean of 350 deg and 10 deg is 180 deg —
#                  exactly backwards. Must be a vector (unit-circle) mean.
# Everything else is an instantaneous scalar and takes an ordinary mean.
RESAMPLE_SUM = {'rainfall'}
RESAMPLE_MAX = {'wind_gust'}
RESAMPLE_CIRCULAR = {'wind_direction'}

# Kept at NATIVE resolution even when resampling. `daily_aggregation.py` derives daily
# min/max from these raw points, so collapsing temperature to hourly means clips both
# tails — Tmin biased warm, Tmax biased cool. Tmin is already the weakest surface in the
# model (see the tmin-lapse work), so it is the one variable where the extra rows buy
# something real. 14 stations; ~10M rows of the ~19M total.
RESAMPLE_EXCLUDE = {'temp'}

# ---------------------------------------------------------------------------------
# SERVER-SIDE HOURLY OFFERINGS — transfer saving for a RESAMPLED BACKFILL only.
#
# Client-side resampling saves storage but NOT bandwidth: it still pulls every native
# point off BoP's server and throws 11 of every 12 away. The full 2020 backfill moves
# ~56 GB of XML for that reason, which is what makes it an 8-9 hour run.
#
# BoP also publishes pre-aggregated hourly series. Coverage is uneven and mostly too thin
# to use (pressure 4 of 16 sites, RH 4 of 12, wind direction 5 of 13, soil none at all),
# but **`Precip Total.HourTotal` covers 51 of the 52 rainfall sites we seed** — and
# rainfall is the single largest share of the volume. So rainfall, and only rainfall,
# reads the server's hourly series when the location has one.
#
# *** `HourTotal` IS STAMPED AT THE END OF ITS HOUR. ***
# Everything else in this platform — and `resample_hourly()` above — stamps at the hour
# START. Measured 2026-08-13 against client-summed Primary on two stations over two wet
# days: with no shift the daily sum-of-absolute-differences was 18-31 mm and the worst
# hour was off by 9.5 mm; shifting HourTotal back one hour drops that to 0.17-3.4 mm with
# a worst hour of 0.61 mm. The residual is exactly one tipping-bucket tip (0.56 mm at
# Edgecumbe, 0.53 mm at Galatea) — the two windows disagree about which side of the hour
# boundary a tip falls on, which is a rounding difference, not a systematic error.
#
# Without the shift every BoP rainfall reading would sit an hour late, rainfall would be
# misaligned against temperature from the same station, and a re-run over existing
# Primary-derived rows would write a SHIFTED SECOND SERIES rather than overwriting.
#
# variable -> (parameter, label, stamp_shift_to_interval_start)
SERVER_HOURLY = {
    'rainfall': ('Precip Total', 'HourTotal', timedelta(hours=-1)),
}

# Incremental look-back cap and gap-closing reach both live in sources/window_util.py —
# every source shares them. See that module for why the clamp alone created permanent
# holes, and for the 2026-07-14 incident that produced this split.

# Overlap re-fetched on every incremental run so late-arriving or revised points land.
INCREMENTAL_OVERLAP_HOURS = 3


class BoPSOSError(RuntimeError):
    """The SOS server returned an ows:ExceptionReport, or a contract assumption broke."""


def resample_hourly(records, variable):
    """Collapse sub-hourly records to one point per hour, per-variable (see RESAMPLE_*).

    Each output point is stamped at the START of its hour. Returns `records` untouched
    for variables in RESAMPLE_EXCLUDE.
    """
    if not records or variable in RESAMPLE_EXCLUDE:
        return records

    buckets = {}
    for r in records:
        hour = r['timestamp'].replace(minute=0, second=0, microsecond=0)
        buckets.setdefault(hour, []).append(r)

    out = []
    for hour, group in sorted(buckets.items()):
        values = [g['value'] for g in group]
        if variable in RESAMPLE_SUM:
            value = math.fsum(values)
        elif variable in RESAMPLE_MAX:
            value = max(values)
        elif variable in RESAMPLE_CIRCULAR:
            # Vector mean on the unit circle, then back to a 0-360 bearing.
            rad = [math.radians(v) for v in values]
            east = math.fsum(math.sin(a) for a in rad)
            north = math.fsum(math.cos(a) for a in rad)
            if abs(east) < 1e-12 and abs(north) < 1e-12:
                continue          # opposing directions cancel; no meaningful mean
            value = math.degrees(math.atan2(east, north)) % 360.0
        else:
            value = math.fsum(values) / len(values)
        template = group[0]
        out.append({**template, 'timestamp': hour, 'value': value})
    return out


def _iso(dt):
    """SOS temporalFilter bound. Second precision, explicit Z."""
    return dt.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def parse_offering(offering):
    """`Air Temp.Primary@JH105608` -> ('Air Temp', 'Primary', 'JH105608')."""
    head, _, loc = (offering or '').partition('@')
    label, _, qualifier = head.partition('.')
    return (label or None, qualifier or None, loc or None)


def build_offering(parameter, location_id, label=LABEL):
    return f'{parameter}.{label}@{location_id}'


def _check_exception(body):
    """Raise if the body is an ows:ExceptionReport. HTTP 200 does NOT mean success here."""
    # Cheap prefilter: the element name only appears in a real exception report, and this
    # avoids parsing 70 MB of valid observations just to discover they are valid.
    if b'ExceptionReport' not in body[:4096]:
        return
    try:
        root = ET.fromstring(body)
    except ET.ParseError:
        return
    if not root.tag.endswith('ExceptionReport'):
        return
    exc = root.find('ows:Exception', NS)
    code = (exc.get('exceptionCode') if exc is not None else None) or 'unknown'
    locator = (exc.get('locator') if exc is not None else None) or '?'
    node = exc.find('ows:ExceptionText', NS) if exc is not None else None
    detail = (node.text if node is not None else '') or ''
    raise BoPSOSError(f'{code} on {locator}: {detail.strip()}')


class BoPRCIngestion:
    """SOS 2.0 client for Bay of Plenty Regional Council."""

    def __init__(self):
        self.data_source = 'BOPRC'
        self.base_url = BASE_URL
        self.headers = {
            'User-Agent': 'Auxein-Insights/1.0 (climate data ingestion; pete.taylor@auxein.co.nz)',
        }
        self.Session = get_ingestion_session()

    # ------------------------------------------------------------------ HTTP

    def _get(self, params, total_timeout=180):
        """One SOS request. Returns the raw body, having ruled out an ExceptionReport."""
        base = {'service': 'SOS', 'version': '2.0.0'}
        base.update(params)
        max_retries = 3
        for attempt in range(1, max_retries + 1):
            try:
                resp = get_with_hard_timeout(self.base_url, total_timeout=total_timeout,
                                             params=base, headers=self.headers)
                resp.raise_for_status()
                _check_exception(resp.content)
                return resp.content
            except BoPSOSError:
                raise                      # a contract error; retrying cannot help
            except requests.exceptions.RequestException as e:
                if attempt < max_retries:
                    wait = 5 * (3 ** (attempt - 1))
                    print(f"      attempt {attempt}/{max_retries} failed ({e}), "
                          f"retrying in {wait}s...")
                    time.sleep(wait)
                else:
                    print(f"      HTTP error after {max_retries} attempts: {e}")
                    return None

    def fetch_observation(self, offering, start, end):
        """GetObservation for one offering over an explicit [start, end) window."""
        return self._get({
            'request': 'GetObservation',
            'offering': offering,
            'temporalFilter': f'om:phenomenonTime,{_iso(start)}/{_iso(end)}',
        })

    def feature_of_interest(self, location_id=None):
        """GetFeatureOfInterest. With no argument, every monitoring point on the server."""
        params = {'request': 'GetFeatureOfInterest'}
        if location_id:
            params['featureOfInterest'] = location_id
        return self._get(params, total_timeout=300)

    def data_availability(self, location_id):
        """GetDataAvailability: every dataset at a location with its period of record.

        This is the liveness signal the seeder uses. BoP publishes long-dead sensors
        beside live ones at the same site, so judging a site by its newest series — the
        mistake that seeded dead HBRC/MDC/WCRC river gauges — would seed them all.
        """
        return self._get({'request': 'GetDataAvailability',
                          'featureOfInterest': location_id}, total_timeout=180)

    def capabilities(self):
        """GetCapabilities. ~22 MB — the seeder's catalogue source, not used at run time."""
        return self._get({'request': 'GetCapabilities'}, total_timeout=300)

    # ------------------------------------------------------------------ parsing

    def parse_observation(self, station_id, body, parameter,
                          not_before=None, not_after=None, quality='GOOD'):
        """WaterML 2.0 -> records, checking the server-declared unit first.

        Parsed with iterparse and cleared as it goes: a backfill chunk is tens of MB and
        an ElementTree of the whole document costs several times that in live objects.
        """
        records = []
        mapping = MEASUREMENT_MAP.get(parameter)
        if not mapping or not body:
            return records
        variable, unit, scale = mapping

        uom_seen = None
        tvp_tag = f"{{{NS['wml2']}}}MeasurementTVP"
        uom_tag = f"{{{NS['wml2']}}}uom"
        time_tag = f"{{{NS['wml2']}}}time"
        value_tag = f"{{{NS['wml2']}}}value"

        for _event, elem in ET.iterparse(io.BytesIO(body), events=('end',)):
            if elem.tag == uom_tag:
                if uom_seen is None:
                    uom_seen = elem.get('code')
                    expected = EXPECTED_UOM.get(parameter, set())
                    if expected and uom_seen not in expected:
                        # Refuse rather than rescale on a guess. A wind unit that silently
                        # flips m/s <-> km/h is a 3.6x error that looks entirely plausible
                        # in the data and would not surface in any fit statistic.
                        raise BoPSOSError(
                            f"unit mismatch for '{parameter}': server says "
                            f"'{uom_seen}', expected one of {sorted(expected)}. Refusing "
                            f"to ingest — confirm the change with BoP, then update "
                            f"MEASUREMENT_MAP and EXPECTED_UOM together."
                        )
                elem.clear()
                continue

            if elem.tag != tvp_tag:
                continue

            t_node = elem.find(time_tag)
            v_node = elem.find(value_tag)
            if t_node is None or v_node is None or not (v_node.text or '').strip():
                elem.clear()
                continue
            try:
                # '2026-08-12T21:10:00.000Z' — true UTC, no offset to apply.
                ts = datetime.fromisoformat(t_node.text.strip().replace('Z', '+00:00'))
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                value = float(v_node.text)
            except (ValueError, TypeError):
                elem.clear()
                continue

            if not_before is not None and ts < not_before:
                elem.clear()
                continue
            if not_after is not None and ts >= not_after:
                elem.clear()
                continue

            records.append({
                'station_id': station_id,
                'timestamp': ts,
                'variable': variable,
                'value': value * scale,
                'unit': unit,
                # BoP carries per-point NEMS qualifiers in wml2:qualifier (e.g. the label
                # "NO QUALITY"). Deliberately not mapped: the full NEMS vocabulary has not
                # been observed, and inventing a mapping is exactly the guess this module
                # avoids elsewhere. Every other source in the platform stores 'GOOD'.
                'quality': quality,
            })
            elem.clear()

        return records

    # ------------------------------------------------------------------ DB

    def get_active_stations(self):
        with self.Session() as session:
            return session.execute(text("""
                SELECT station_id, station_code, source_id, notes
                FROM weather_stations
                WHERE data_source = :source AND is_active = true
                ORDER BY station_code
            """), {'source': self.data_source}).fetchall()

    def get_last_timestamp(self, station_id, variable):
        with self.Session() as session:
            last = session.execute(text("""
                SELECT MAX(timestamp) FROM weather_data
                WHERE station_id = :station_id AND variable = :variable
            """), {'station_id': station_id, 'variable': variable}).scalar()
        if last is not None and last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        return last

    def insert_data(self, records):
        if not records:
            return 0
        with self.Session() as session:
            try:
                n = bulk_upsert_observations(session, records)
                session.commit()
                return n
            except Exception as e:
                session.rollback()
                print(f"      Database error: {e}")
                return 0

    def log_ingestion(self, station_id, start_time, records_processed,
                      records_inserted, status, error_msg=None):
        with self.Session() as session:
            try:
                session.execute(text("""
                    INSERT INTO ingestion_log
                        (data_source, station_id, start_time, end_time,
                         records_processed, records_inserted, status, error_msg)
                    VALUES (:source, :station_id, :start_time, NOW(),
                            :processed, :inserted, :status, :error_msg)
                """), {
                    'source': self.data_source, 'station_id': station_id,
                    'start_time': start_time, 'processed': records_processed,
                    'inserted': records_inserted, 'status': status,
                    'error_msg': error_msg,
                })
                session.commit()
            except Exception as e:
                print(f"      Failed to log ingestion: {e}")

    # ------------------------------------------------------------------ driver

    def check_access(self):
        """Is the SOS server reachable and serving? Returns (ok, detail).

        Kept because the old AQUARIUS gate made `--check-access` the documented way to
        tell a network problem from a permission problem. Here it doubles as the
        allowlist check: a connect timeout means this host is not on BoP's list (or
        someone used https).
        """
        try:
            body = self._get({'request': 'GetCapabilities'}, total_timeout=300)
        except BoPSOSError as e:
            return (False, f'SOS exception: {e}')
        except requests.exceptions.RequestException as e:
            return (False, f'unreachable ({e.__class__.__name__}) — is this host on '
                           f"BoP's IP allowlist, and is the URL http (not https)?")
        if not body:
            return (False, 'no response from GetCapabilities')
        n = body.count(b'<ows:Value>')
        return (True, f'GetCapabilities OK, {len(body) // 1_000_000} MB, ~{n} offerings')

    def _parse_start(self, value):
        """Accept the driver's dd/mm/YYYY and plain YYYY-MM-DD alike."""
        for fmt in ('%d/%m/%Y', '%Y-%m-%d'):
            try:
                return datetime.strptime(value, fmt).replace(tzinfo=timezone.utc)
            except ValueError:
                continue
        raise ValueError(f'unrecognised date {value!r} (want dd/mm/YYYY or YYYY-MM-DD)')

    def run(self, period='incremental', backfill_days=None, start_date=None,
            end_date=None, dry_run=False, interval=None, station_code=None,
            resample=True, only_variable=None):
        """Ingest BoP data.

        `interval` is accepted for driver compatibility and ignored — SOS has no
        server-side resampling parameter, so reduction happens client-side via
        `resample_hourly` (backfill only; see the RESAMPLE_* constants).

        `resample` defaults to True and applies ONLY to backfills. The forward feed is
        always native resolution.
        """
        print(f"Starting BoP (BOPRC) ingestion at {datetime.now(timezone.utc)}")
        print(f"Period: {period}")

        stations = self.get_active_stations()
        if station_code:
            stations = [s for s in stations if s[1] == station_code]
            if not stations:
                print(f"⚠ Station '{station_code}' not found in active BOPRC stations")
                return
        if not stations:
            print("⚠ No active BOPRC stations — run seed_boprc_from_sos.py first")
            return

        print(f"Found {len(stations)} active BOPRC station(s)\n")
        now = datetime.now(timezone.utc)
        total_inserted = total_parsed = 0

        # An explicit --start means a range backfill even without --period backfill:
        # backfill_driver.py's range style invokes sources as
        # `<module> --station CODE --start DATE --interval X` and never passes --period.
        # Keying only on `period` would make every driver-launched backfill silently run
        # a 30-day incremental instead — a whole run that looks successful and does
        # nothing, which is the failure mode that hid the Horizons dispatch gap for days.
        backfilling = (period == 'backfill') or bool(start_date)
        if backfilling:
            window_start = self._parse_start(start_date) if start_date \
                else self._parse_start(BACKFILL_START)
            # The backfill STOPS where the incremental window begins, and the two never
            # overlap. This is not tidiness — with hourly resampling it is a correctness
            # requirement. A day holding both hourly rainfall SUMS (backfill) and native
            # 10-minute points (incremental) is summed by daily_aggregation into roughly
            # double the true daily total, and the upsert key (station, timestamp,
            # variable) does not collide often enough to prevent it: only the :00 point
            # of each hour would clash. Same defect TRC's backfill_cutoff avoids.
            default_end = now - timedelta(days=MAX_INCREMENTAL_DAYS)
            window_end = self._parse_start(end_date) if end_date else default_end
            print(f"Backfill window: {window_start:%Y-%m-%d} to {window_end:%Y-%m-%d} "
                  f"in {CHUNK_DAYS}-day chunks"
                  + (f" | resampled HOURLY (except {sorted(RESAMPLE_EXCLUDE)})"
                     if resample else " | NATIVE resolution"))
            if not end_date:
                print(f"  (ends {MAX_INCREMENTAL_DAYS}d back — the incremental run "
                      f"covers from there at native resolution)")
        else:
            window_start = window_end = None

        for station in stations:
            station_id, code, location_id, notes = (
                station[0], station[1], station[2], (station[3] or {}))
            print(f"Processing: {code}\n  Location: {location_id}")
            parameters = notes.get('measurements', [])
            if not parameters:
                print("  ⚠ No measurements configured, skipping")
                continue

            for parameter in parameters:
                mapping = MEASUREMENT_MAP.get(parameter)
                if not mapping:
                    print(f"    ⚠ Unmapped parameter {parameter!r}, skipping")
                    continue
                variable = mapping[0]
                if only_variable and variable != only_variable:
                    continue

                # Prefer the server's pre-aggregated hourly series when this location
                # publishes one AND we are resampling anyway. The forward feed never
                # takes this path — it must stay native.
                server_hourly = None
                if backfilling and resample and variable in SERVER_HOURLY:
                    _param, _label, _shift = SERVER_HOURLY[variable]
                    if _param == parameter and \
                            parameter in (notes.get('hourly_offerings') or []):
                        server_hourly = (_label, _shift)

                offering = build_offering(
                    parameter, location_id,
                    server_hourly[0] if server_hourly else LABEL)

                try:
                    if backfilling:
                        start, end = window_start, window_end
                        not_before = None
                    else:
                        last = self.get_last_timestamp(station_id, variable)
                        start, note = incremental_start(
                            last, now, overlap_hours=INCREMENTAL_OVERLAP_HOURS)
                        if note:
                            print(f"    {variable}: {note}")
                        end = now
                        not_before = None

                    parsed = inserted = 0
                    # Chunk so no single response has to be held whole. Backfills span
                    # years at 5-minute resolution; the incremental window is one chunk.
                    cursor = start
                    while cursor < end:
                        chunk_end = min(cursor + timedelta(days=CHUNK_DAYS), end)
                        print(f"    {parameter} -> {variable}: "
                              f"{cursor:%Y-%m-%d} to {chunk_end:%Y-%m-%d}")
                        body = self.fetch_observation(offering, cursor, chunk_end)
                        records = self.parse_observation(
                            station_id, body, parameter,
                            not_before=not_before, not_after=None)

                        # Primary returned nothing for this window. Before accepting
                        # that as "no data", try the fallback labels — a series that
                        # has been MOVED looks exactly like a series that has stopped,
                        # and on 2026-08-01 three BoP air-quality sites did move. Only
                        # reached when Primary is empty, so a station publishing both
                        # is never ingested twice. See FALLBACK_LABELS.
                        if not records and not server_hourly:
                            for alt in FALLBACK_LABELS:
                                alt_offering = build_offering(parameter, location_id, alt)
                                try:
                                    alt_body = self.fetch_observation(
                                        alt_offering, cursor, chunk_end)
                                    records = self.parse_observation(
                                        station_id, alt_body, parameter,
                                        not_before=not_before, not_after=None,
                                        quality=FALLBACK_QUALITY)
                                except Exception as alt_err:
                                    # A missing fallback offering is the normal case for
                                    # most stations; do not let it kill the Primary run.
                                    print(f"      {alt} fallback unavailable: {alt_err}")
                                    continue
                                if records:
                                    print(f"      {parameter}: Primary empty, "
                                          f"{len(records)} record(s) from .{alt} "
                                          f"(stored {FALLBACK_QUALITY})")
                                    break
                        if server_hourly:
                            # Already hourly from the server — do NOT resample again.
                            # Re-stamp to the hour START; see SERVER_HOURLY above.
                            shift = server_hourly[1]
                            records = [{**r, 'timestamp': r['timestamp'] + shift}
                                       for r in records]
                            if records:
                                print(f"      {len(records)} server-hourly "
                                      f"({server_hourly[0]}, restamped {shift})")
                        elif backfilling and resample:
                            native = len(records)
                            records = resample_hourly(records, variable)
                            if native:
                                print(f"      {native} native -> {len(records)} hourly")
                        parsed += len(records)

                        if dry_run:
                            sample = records[-1] if records else None
                            print(f"      [DRY RUN] would insert {len(records)} records"
                                  + (f" (last {sample['timestamp']} = "
                                     f"{sample['value']:.4g} {sample['unit']})"
                                     if sample else ""))
                        else:
                            inserted += self.insert_data(records)
                        cursor = chunk_end
                        time.sleep(0.3)          # politeness

                    total_parsed += parsed
                    total_inserted += inserted
                    if not dry_run:
                        self.log_ingestion(station_id, datetime.now(timezone.utc),
                                           parsed, inserted,
                                           'SUCCESS' if parsed else 'NO_DATA')
                        print(f"      ✓ inserted {inserted} records")
                except BoPSOSError as e:
                    # A contract breach (bad offering, changed unit) — loud, not silent.
                    print(f"      ✗ {parameter}: {e}")
                    if not dry_run:
                        self.log_ingestion(station_id, datetime.now(timezone.utc),
                                           0, 0, 'FAILED', str(e))
                except Exception as e:
                    print(f"      ✗ {parameter}: {e}")
                    if not dry_run:
                        self.log_ingestion(station_id, datetime.now(timezone.utc),
                                           0, 0, 'FAILED', str(e))

        print(f"\n{'='*60}")
        print(f"BoP ingestion complete at {datetime.now(timezone.utc)}")
        print(f"Total records {'parsed' if dry_run else 'inserted'}: "
              f"{total_parsed if dry_run else total_inserted}")
        print(f"{'='*60}\n")


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Run Bay of Plenty (BOPRC) SOS ingestion')
    parser.add_argument('--period', choices=['incremental', 'backfill'],
                        default='incremental')
    parser.add_argument('--days', type=int, default=None,
                        help='(accepted for driver compatibility; use --start)')
    parser.add_argument('--start', type=str, default=None,
                        help=f'backfill start, dd/mm/YYYY or YYYY-MM-DD '
                             f'(default {BACKFILL_START})')
    parser.add_argument('--end', type=str, default=None)
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--interval', type=str, default=None,
                        help='(ignored — SOS has no resampling parameter)')
    parser.add_argument('--station', type=str, help='Single station code')
    parser.add_argument('--variable', type=str, default=None,
                        help='restrict to one canonical variable (e.g. rainfall) — for '
                             'targeted re-runs without re-fetching a whole station')
    parser.add_argument('--native', action='store_true',
                        help='backfill at native (sub-hourly) resolution instead of '
                             'resampling to hourly — ~9x the rows')
    parser.add_argument('--check-access', action='store_true',
                        help='report whether the SOS server is reachable, then exit')
    args = parser.parse_args()

    ingester = BoPRCIngestion()
    if args.check_access:
        ok, detail = ingester.check_access()
        print(('OPEN  — ' if ok else 'BLOCKED — ') + detail)
        sys.exit(0 if ok else 1)

    ingester.run(period=args.period, backfill_days=args.days,
                 start_date=args.start, end_date=args.end,
                 dry_run=args.dry_run, interval=args.interval,
                 station_code=args.station, resample=not args.native,
                 only_variable=args.variable)
