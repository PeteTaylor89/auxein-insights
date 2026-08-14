"""
Taranaki Regional Council (TRC) weather data ingestion.
API: bespoke JSON on the public site at https://www.trc.govt.nz (NOT Hilltop, NOT AQUARIUS).

Endpoints:
  /environment/maps-and-data/regional-overview/MapMarkers?measureID={id}
      -> [{"siteID","title","lat","lng","measure","unit","description","link"},...]
      (the station catalogue for one measure; coordinates included. Content-Type is
       text/html but the body is JSON.)
  /environment/maps-and-data/site-details/LoadGraphAndListData/?siteID={id}&measureID={id}&timePeriod={p}
      -> {"highStockData":[[epoch_ms,value],...], "list":"<html...>", "unitSymbol",
          "graphTitle", "isWindDirection", "error", ...}

Traps, each of which returns HTTP 200 and looks like an empty result rather than an error:

1. **The trailing slash on `LoadGraphAndListData/` is load-bearing.** Without it every
   request 500s.
2. **`timePeriod` is a closed whitelist of exactly THREE values** — `7days`, `30days`,
   `365days`. Everything else (`1days`, `14days`, `60days`, `90days`, `1year`, `all`,
   `custom`, `366days`, ...) returns a 157-byte body with `error:true`. It is NOT a
   free-form `{N}days` pattern; do not compute one.
3. **Read `highStockData`, never `list`.** `list` is a ~250 KB pre-rendered HTML table
   string, not rows — `len()` on it returns a character count that looks like a
   plausible sample size.
4. **Resolution is a function of the period, and so is the AGGREGATION** (see below).
5. **`unit` from MapMarkers lies for wind direction** — measureID 4 reports `km/h`
   while serving degrees. The data response is authoritative: it carries
   `isWindDirection: 1` and `unitSymbol: "degrees"`.

Period -> resolution and aggregation (measured 2026-08-11, site 1 Stratford):

    7days    2017 pts   5 min (rain) / 10 min (temp, wind)   raw observations
    30days    720 pts   hourly  — "Hourly total rainfall" / "Hourly average air temperature"
    365days   366 pts   DAILY   — "Daily total rainfall" / "Daily AVERAGE air temperature"

The incremental feed uses `30days` and never `7days`, even though `7days` is finer — see
INCREMENTAL_PERIOD below for why mixing the two silently doubles daily rainfall totals.

**`timePeriod` counts POINTS, not calendar days.** `30days` returns the most recent 720
hourly points, whatever dates those happen to span. A dead sensor therefore keeps serving
a full, plausible-looking window of stale data forever — TRC_KAPOAIAIA_AT_CAPE_EGMONT's
soil temperature stopped on 2026-06-04 and still returned 720 points dated May-June when
first ingested on 2026-08-11. Consequences: (a) a station returning data is NOT evidence
it is live, so judge liveness on `max(timestamp)` in the DB, never on a non-empty
response; (b) the backfill cannot assume the incremental feed covers the last 30 calendar
days — it clamps against what is actually stored (see run()).

**Why 365days is rainfall-only.** A daily *total* rainfall is a true daily value and
aggregates correctly. A daily *average* temperature is not an observation — ingesting one
per day would make `daily_aggregation` compute min = max = mean for that day and inject a
flat, biased series into exactly the Tmin/Tmax surfaces that are already the weakest in
the model. So the 365-day window carries rainfall and nothing else. Consequence: TRC adds
one year of daily rainfall history and only ~30 days of temperature. That is the honest
ceiling of this API, not a wiring bug.

**Why backfill clamps to points older than MAX_INCREMENTAL_DAYS.** The incremental feed
already writes hourly/10-minute rainfall for the last 30 days. A daily total from the
365-day window lands at 00:00 on the same day and would upsert over — or be summed
alongside — those hourly points, double-counting the day's rain. The backfill therefore
discards anything inside the incremental window; the two never overlap.

Timestamps are TRUE UTC. Verified against the portal's own local-time label: a marker
reading "Air temperature 11:00am ... 12.2 degC" matched the series point at
2026-08-10T23:00Z = 12.0. There is NO Environment-Southland-style wall-clock-as-UTC
offset here — do not add one.

Units: rainfall mm, temp/soil_temp degC, soil moisture %, pressure hPa are already
canonical. Wind speed and gust are km/h and need x1/3.6 (as HBRC/GDC/TDC).

Cloudflare: the public site sits behind Cloudflare, which rejected scripted clients
during the 2026-08-05 discovery pass. It serves them normally as of 2026-08-11 from the
ingestion box. If that reverts, the failure is an HTTP 403 with a "Just a moment"
challenge body — that is an access decision to raise with the council, NOT something to
defeat with a spoofed User-Agent or a TLS-fingerprint client (standing decision).
"""

import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode

import requests
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).parent.parent))
from db_connection import get_ingestion_session
from sources.db_util import bulk_upsert_observations
from sources.http_util import get_with_hard_timeout

# TRC is forward-only, so it has no incremental clamp of its own — but its backfill
# cutoff MUST equal the shared incremental window, or the two either overlap (double
# counting daily rainfall totals) or leave a gap. Sharing the constant keeps them in
# step if the window is ever retuned.
from sources.window_util import MAX_INCREMENTAL_DAYS  # noqa: E402

# The complete accepted vocabulary. Anything else returns error:true.
PERIODS = ('7days', '30days', '365days')
PERIOD_DAYS = {'7days': 7, '30days': 30, '365days': 365}

# ONE RESOLUTION PER VARIABLE — the incremental feed always uses the hourly window.
#
# `7days` would give finer data (5-minute rainfall, 10-minute temp/wind), but the two
# windows cannot be mixed: a day holding both 5-minute AND hourly rainfall rows is summed
# by daily_aggregation into roughly DOUBLE the true daily total, and the upsert key
# (station, timestamp, variable) does not collide often enough to prevent it — the
# 5-minute points simply sit alongside the hourly ones. Any switch between windows
# creates a boundary day with exactly that defect. Pinning the incremental feed to
# `30days` makes the resolution invariant hold for every day, forever.
#
# The 365-day window stays safe because the backfill writes strictly outside the
# incremental window (see backfill_cutoff in run()), so no day ever receives both.
INCREMENTAL_PERIOD = '30days'

# measureID -> (canonical_variable, canonical_unit, scale)
# Excluded deliberately: 7/9 river level & flow, 8 water temperature (river, not weather),
# 18 PM2.5 (air quality). Those are real measures on the portal but not weather variables.
MEASUREMENT_MAP = {
    1:  ('rainfall',          'mm',      1.0),
    3:  ('temp',              'C',       1.0),
    6:  ('soil_temp',         'C',       1.0),
    5:  ('soil_moisture_vwc', 'percent', 1.0),
    2:  ('wind_speed',        'm/s',     1.0 / 3.6),   # served as km/h
    4:  ('wind_direction',    'deg',     1.0),         # unit field claims km/h; it is degrees
    10: ('wind_gust',         'm/s',     1.0 / 3.6),   # served as km/h
    15: ('pressure',          'hPa',     1.0),
}

# Only these carry a genuine daily value in the 365-day window. See the module docstring.
DAILY_SAFE_MEASURES = {1}


class TRCIngestion:
    """Ingestion class for the Taranaki Regional Council public JSON feed."""

    def __init__(self):
        self.data_source = 'TRC'
        self.base_url = 'https://www.trc.govt.nz/environment/maps-and-data'
        self.headers = {
            # Identify honestly. Do NOT substitute a browser string if Cloudflare
            # starts refusing us — see the module docstring.
            'User-Agent': 'Auxein-Insights/1.0 (climate data ingestion; pete.taylor@auxein.co.nz)',
        }
        self.Session = get_ingestion_session()

    def get_active_stations(self):
        with self.Session() as session:
            result = session.execute(text("""
                SELECT station_id, station_code, source_id, notes
                FROM weather_stations
                WHERE data_source = :source AND is_active = true
                ORDER BY station_code
            """), {'source': self.data_source})
            return result.fetchall()

    def get_last_timestamp(self, station_id: int, variable: str):
        """Newest stored timestamp for this series, or None if we hold nothing yet.

        Returns None rather than the usual `now - 2 days` default: the caller uses it to
        decide how much of the fetched window to keep, and a 2-day default would silently
        discard 28 of the 30 days available on a station's first ever run.
        """
        with self.Session() as session:
            result = session.execute(text("""
                SELECT MAX(timestamp) FROM weather_data
                WHERE station_id = :station_id AND variable = :variable
            """), {'station_id': station_id, 'variable': variable})
            last_time = result.scalar()
            if last_time:
                if last_time.tzinfo is None:
                    last_time = last_time.replace(tzinfo=timezone.utc)
                return last_time
            return None

    def get_first_timestamp(self, station_id: int, variable: str):
        """Oldest stored timestamp for this series, or None if we hold nothing yet."""
        with self.Session() as session:
            result = session.execute(text("""
                SELECT MIN(timestamp) FROM weather_data
                WHERE station_id = :station_id AND variable = :variable
            """), {'station_id': station_id, 'variable': variable})
            first_time = result.scalar()
            if first_time and first_time.tzinfo is None:
                first_time = first_time.replace(tzinfo=timezone.utc)
            return first_time

    def fetch_data(self, site_id, measure_id: int, period: str):
        """GET LoadGraphAndListData and return parsed JSON (or None).

        The trailing slash on the path is required — without it the endpoint 500s.
        """
        params = {'siteID': site_id, 'measureID': measure_id, 'timePeriod': period}
        url = f"{self.base_url}/site-details/LoadGraphAndListData/?" + urlencode(params)
        max_retries = 3
        for attempt in range(1, max_retries + 1):
            try:
                print(f"      URL: {url}")
                response = get_with_hard_timeout(url, total_timeout=120, headers=self.headers)
                response.raise_for_status()
                return response.json()
            except (requests.exceptions.RequestException, ValueError) as e:
                if attempt < max_retries:
                    wait = 5 * (3 ** (attempt - 1))
                    print(f"      Attempt {attempt}/{max_retries} failed ({e}), retrying in {wait}s...")
                    time.sleep(wait)
                else:
                    print(f"      API error after {max_retries} attempts: {e}")
                    return None

    def parse_response(self, station_id: int, payload, measure_id: int,
                       not_after: datetime = None, not_before: datetime = None) -> list:
        """Parse a LoadGraphAndListData payload into records.

        Points are [epoch_ms, value] under `highStockData`, in true UTC.

        `not_after` drops points at/after a cutoff — used by the backfill to stay clear
        of the incremental window (see the module docstring).

        `not_before` drops points already held. The smallest window this API offers is
        7 days, so an hourly incremental necessarily re-downloads 7 days of 5-minute
        data to gain ~12 new points per measure. Without this filter that is ~180k
        redundant upserts every hour (~4.3M/day against a 24M-row table) for a few
        thousand real ones. The fetch cost is unavoidable; the write cost is not.
        """
        records = []
        mapping = MEASUREMENT_MAP.get(measure_id)
        if not mapping or not payload:
            return records
        if payload.get('error'):
            return records
        variable, unit, scale = mapping

        # Guard the documented unit lie: measureID 4 is degrees even though the
        # catalogue advertises km/h. If the payload ever stops asserting that, the
        # scale assumption above is no longer safe.
        if measure_id == 4 and not payload.get('isWindDirection'):
            print("      ⚠ measureID 4 no longer flags isWindDirection — skipping "
                  "rather than risk ingesting km/h as degrees")
            return records

        points = payload.get('highStockData')
        if not isinstance(points, list):
            return records

        for pt in points:
            try:
                epoch_ms, value = pt[0], pt[1]
                if value is None:
                    continue
                ts = datetime.fromtimestamp(epoch_ms / 1000, tz=timezone.utc)
                if not_after is not None and ts >= not_after:
                    continue
                if not_before is not None and ts < not_before:
                    continue
                records.append({
                    'station_id': station_id,
                    'timestamp': ts,
                    'variable': variable,
                    'value': float(value) * scale,
                    'unit': unit,
                    'quality': 'GOOD',
                })
            except (ValueError, TypeError, IndexError):
                continue
        return records

    def insert_data(self, records: list) -> int:
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

    def log_ingestion(self, station_id: int, start_time: datetime,
                      records_processed: int, records_inserted: int,
                      status: str, error_msg: str = None):
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
                    'inserted': records_inserted, 'status': status, 'error_msg': error_msg,
                })
                session.commit()
            except Exception as e:
                print(f"      Failed to log ingestion: {e}")

    def run(self, period: str = 'incremental', backfill_days: int = None,
            start_date: str = None, end_date: str = None, dry_run: bool = False,
            interval: str = None, station_code: str = None):
        """Ingest TRC data.

        NOTE: start_date/end_date/interval are ignored — the API accepts only one of
        three fixed look-back windows anchored to now, with no date-range parameters
        (`fromDate`/`startDate`/`dateFrom`/`from` all return error:true).
        """
        print(f"Starting TRC ingestion at {datetime.now(timezone.utc)}")
        print(f"Period: {period}")

        stations = self.get_active_stations()
        if station_code:
            stations = [s for s in stations if s[1] == station_code]
            if not stations:
                print(f"⚠ Station '{station_code}' not found in active TRC stations")
                return

        print(f"Found {len(stations)} active TRC station(s)\n")
        total_inserted = total_parsed = 0
        now = datetime.now(timezone.utc)
        # Backfill writes strictly OUTSIDE the incremental window so daily totals never
        # land on top of the hourly series for the same day.
        backfill_cutoff = now - timedelta(days=MAX_INCREMENTAL_DAYS)

        for station in stations:
            station_id, code, site_id, notes = station[0], station[1], station[2], (station[3] or {})
            print(f"Processing: {code}\n  Site ID: {site_id}")
            measures = notes.get('measurements', [])
            if not measures:
                print("  ⚠ No measurements configured, skipping")
                continue

            for raw_mid in measures:
                try:
                    measure_id = int(raw_mid)
                except (TypeError, ValueError):
                    print(f"    ⚠ Non-numeric measureID {raw_mid!r}, skipping")
                    continue

                mapping = MEASUREMENT_MAP.get(measure_id)
                if not mapping:
                    print(f"    ⚠ Unmapped measureID {measure_id}, skipping")
                    continue
                variable = mapping[0]

                try:
                    if period == 'backfill':
                        if measure_id not in DAILY_SAFE_MEASURES:
                            print(f"    {variable}: skipped — the 365-day window serves "
                                  f"daily AVERAGES for this measure, which are not "
                                  f"observations (see module docstring)")
                            continue
                        api_period = '365days'
                        # Clamp against what is ACTUALLY stored, not a nominal 30-day
                        # floor: `30days` returns the last 720 points regardless of the
                        # dates they span, so a sparse or dead series can already hold
                        # rows well past 30 days back. Writing daily totals on top of
                        # those would double-count the day (see the module docstring).
                        stored_from = self.get_first_timestamp(station_id, variable)
                        not_after = min(backfill_cutoff, stored_from) if stored_from \
                            else backfill_cutoff
                        not_before = None
                    else:
                        last = self.get_last_timestamp(station_id, variable)
                        api_period = INCREMENTAL_PERIOD
                        not_after = None
                        # First run for this (station, variable): take the whole window.
                        # Otherwise keep a 3h overlap so late-arriving or revised points
                        # are still picked up, without rewriting the entire 30 days.
                        not_before = None if last is None else last - timedelta(hours=3)

                    print(f"    measureID {measure_id} -> {variable}: fetching {api_period}")
                    payload = self.fetch_data(site_id, measure_id, api_period)
                    records = self.parse_response(station_id, payload, measure_id,
                                                  not_after=not_after,
                                                  not_before=not_before)
                    total_parsed += len(records)

                    if dry_run:
                        sample = records[-1] if records else None
                        print(f"      [DRY RUN] would insert {len(records)} records"
                              + (f" (last {sample['timestamp']} = {sample['value']:.3g} "
                                 f"{sample['unit']})" if sample else ""))
                    else:
                        n = self.insert_data(records)
                        total_inserted += n
                        self.log_ingestion(station_id, datetime.now(timezone.utc),
                                           len(records), n,
                                           'SUCCESS' if records else 'NO_DATA')
                        print(f"      ✓ inserted {n} records")
                    time.sleep(0.3)              # politeness
                except Exception as e:
                    print(f"      ✗ measureID {measure_id}: {e}")
                    if not dry_run:
                        self.log_ingestion(station_id, datetime.now(timezone.utc), 0, 0,
                                           'FAILED', str(e))

        print(f"\n{'='*60}")
        print(f"TRC ingestion complete at {datetime.now(timezone.utc)}")
        print(f"Total records {'parsed' if dry_run else 'inserted'}: "
              f"{total_parsed if dry_run else total_inserted}")
        print(f"{'='*60}\n")


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Run Taranaki (TRC) weather data ingestion')
    parser.add_argument('--period', choices=['incremental', 'backfill'], default='incremental')
    parser.add_argument('--days', type=int, default=365,
                        help='(accepted for driver compatibility; TRC backfill is always '
                             'the fixed 365-day daily-rainfall window)')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--interval', type=str, default=None,
                        help='(ignored — TRC has no interval parameter)')
    parser.add_argument('--station', type=str, help='Single station code')
    args = parser.parse_args()

    TRCIngestion().run(
        period=args.period, backfill_days=args.days,
        dry_run=args.dry_run, station_code=args.station,
    )
