"""
Environment Southland (ES) weather data ingestion.
API: bespoke JSON portal at https://envdata.es.govt.nz (NOT Hilltop, NOT AQUARIUS).

Endpoints:
  /services/sites.ashx?f={dataset}.xml
      -> {"sites":[{"name","dataTo","easting","northing","fields":[{"field","text","units","value"}]}]}
      (JSON despite the .xml suffix; `field` is the data.ashx query key, null = no data at that site)
  /services/data.ashx?s={site}&m={field}&i={days}
      -> {"name","dataStart","dataEnd","data":[{"measurement","units","data":[[epoch_ms,value],...]}]}
      (values are [epoch_ms, value] pairs under data[0].data; data:null = invalid measurement)

Key differences from the Hilltop councils:
  - JSON, not XML. The epoch-millis are NOT UTC: ES encodes NZ wall-clock as if it
    were UTC, so every point reads 12h into the future unless corrected. See
    ES_CLOCK_OFFSET below.
  - data.ashx caps at 365 days (i>365 silently returns 7 days; From/To ignored) -> FORWARD FEED
    ONLY. No deep history via the API. Incremental look-back is clamped to 30 days, and
    may reach 7 days further to close a gap it can actually close (see window_util).
  - The measurement query key is the per-site `field` string, which varies across sites
    (e.g. "Relative Humidity" vs "Relative humidity"); we normalise case/space-insensitively.
  - Units are already canonical (Degrees Celsius / % / m/s / Degrees / watts/m2 / mm) -> no scaling.
  - COMMERCIAL LICENCE: ES requires written permission for commercial reuse. Cleared 2026-07-30.
"""

import time
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode, quote

import requests
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).parent.parent))
from db_connection import get_ingestion_session
from sources.db_util import bulk_upsert_observations
from sources.http_util import get_with_hard_timeout
from sources.window_util import incremental_days
# Incremental window + gap-close policy: see sources/window_util.py.

# Forward-only source; a stale station can't spawn a runaway fetch. The API also
# hard-caps at 365 days, so nothing deeper is reachable regardless.
API_MAX_DAYS = 365

# ES `epoch_ms` is NZ wall-clock rendered as though it were UTC, so rendering it as
# UTC lands 12h in the future. The offset is FIXED NZST year-round, not DST-aware:
# on spring-forward day (2025-09-28) every ES station still reports a 02:00 point and
# a full continuous 24 hours, which a real local clock would have skipped. So subtract
# a flat 12h -- localising to Pacific/Auckland instead would put NZDT-period data out
# by an hour.
ES_CLOCK_OFFSET = timedelta(hours=12)


def canonical_for_field(field):
    """Map an ES `field` string -> (canonical_variable, canonical_unit), or None to skip.

    ES field names vary across sites and carry sensor-height / depth suffixes, so we
    match case/space-insensitively on the prefix. Secondary-height (6 metre) wind and
    PM10 / housekeeping fields are intentionally dropped.
    """
    if not field:
        return None
    f = " ".join(field.strip().lower().split())
    if "6 met" in f:                         # secondary sensor height -> skip
        return None
    if f.startswith("air temp"):
        return ("temp", "C")
    if f.startswith("relative humid"):
        return ("rh", "percent")
    if f.startswith("wind speed"):
        return ("wind_speed", "m/s")
    if f.startswith("wind direction"):
        return ("wind_direction", "deg")
    if f.startswith("solar radiation"):
        return ("solar_radiation", "W/m2")
    if f.startswith("rainfall"):
        return ("rainfall", "mm")
    if "water filled pore" in f or f.startswith("soil moisture"):
        return ("soil_moisture_vwc", "percent")
    if f.startswith("soil temperature") or f.startswith("soil temp"):
        return ("soil_temp", "C")
    return None                              # PM10, DataOwnership, etc.


class SouthlandIngestion:
    """Ingestion class for the Environment Southland JSON portal."""

    def __init__(self):
        self.data_source = 'SOUTHLAND'
        self.base_url = 'https://envdata.es.govt.nz'
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

    def get_last_timestamp(self, station_id: int, variable: str) -> datetime:
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
            return datetime.now(timezone.utc) - timedelta(days=2)

    def fetch_data(self, site_name: str, field: str, days: int):
        """GET data.ashx and return parsed JSON (or None). i=days, capped at the API max."""
        params = {"s": site_name, "m": field, "i": min(int(days), API_MAX_DAYS)}
        url = f"{self.base_url}/services/data.ashx?" + urlencode(params, quote_via=quote)
        max_retries = 3
        for attempt in range(1, max_retries + 1):
            try:
                print(f"      URL: {url}")
                response = get_with_hard_timeout(url, total_timeout=90)
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

    def parse_response(self, station_id: int, payload, field: str) -> list:
        """Parse data.ashx JSON into records. Points are [epoch_ms(NZST-as-UTC), value]."""
        records = []
        var_unit = canonical_for_field(field)
        if not var_unit or not payload:
            return records
        variable, unit = var_unit
        series = payload.get("data") or []
        if not series:
            return records
        points = series[0].get("data")
        if not points:                       # data:null = invalid/empty measurement
            return records
        for pt in points:
            try:
                epoch_ms, value = pt[0], pt[1]
                if value is None:
                    continue
                ts = datetime.fromtimestamp(epoch_ms / 1000, tz=timezone.utc) - ES_CLOCK_OFFSET
                records.append({
                    'station_id': station_id,
                    'timestamp': ts,
                    'variable': variable,
                    'value': float(value),
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
        """Ingest ES data. NOTE: start_date/end_date/interval are ignored — the ES API
        only accepts an `i={days}` look-back (max 365) anchored to now."""
        print(f"Starting Southland ingestion at {datetime.now(timezone.utc)}")
        print(f"Period: {period}")

        stations = self.get_active_stations()
        if station_code:
            stations = [s for s in stations if s[1] == station_code]
            if not stations:
                print(f"⚠ Station '{station_code}' not found in active SOUTHLAND stations")
                return

        print(f"Found {len(stations)} active SOUTHLAND station(s)\n")
        total_inserted = total_parsed = 0

        for station in stations:
            station_id, code, site_name, notes = station[0], station[1], station[2], (station[3] or {})
            print(f"Processing: {code}\n  Site: {site_name}")
            fields = notes.get('measurements', [])
            if not fields:
                print("  ⚠ No measurements configured, skipping")
                continue

            for field in fields:
                var_unit = canonical_for_field(field)
                if not var_unit:
                    print(f"    ⚠ Unmapped field '{field}', skipping")
                    continue
                variable = var_unit[0]
                try:
                    if period == 'backfill':
                        days = min(backfill_days or API_MAX_DAYS, API_MAX_DAYS)
                    else:
                        last = self.get_last_timestamp(station_id, variable)
                        days_since = (datetime.now(timezone.utc) - last).days + 2
                        days, gap_note = incremental_days(days_since)
                        if gap_note:
                            print(f"    ⚠ {field}: {gap_note}")

                    print(f"    {field} -> {variable}: fetching i={days}d")
                    payload = self.fetch_data(site_name, field, days)
                    records = self.parse_response(station_id, payload, field)
                    total_parsed += len(records)

                    if dry_run:
                        sample = records[-1] if records else None
                        print(f"      [DRY RUN] would insert {len(records)} records"
                              + (f" (last {sample['timestamp']} = {sample['value']} {sample['unit']})" if sample else ""))
                    else:
                        n = self.insert_data(records)
                        total_inserted += n
                        self.log_ingestion(station_id, datetime.now(timezone.utc),
                                           len(records), n,
                                           'SUCCESS' if records else 'NO_DATA')
                        print(f"      ✓ inserted {n} records")
                    time.sleep(0.3)          # politeness
                except Exception as e:
                    print(f"      ✗ {field}: {e}")
                    if not dry_run:
                        self.log_ingestion(station_id, datetime.now(timezone.utc), 0, 0,
                                           'FAILED', str(e))

        print(f"\n{'='*60}")
        print(f"Southland ingestion complete at {datetime.now(timezone.utc)}")
        print(f"Total records {'parsed' if dry_run else 'inserted'}: "
              f"{total_parsed if dry_run else total_inserted}")
        print(f"{'='*60}\n")


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Run Southland (ES) weather data ingestion')
    parser.add_argument('--period', choices=['incremental', 'backfill'], default='incremental')
    parser.add_argument('--days', type=int, default=365,
                        help='Days to fetch for backfill (API max 365)')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--interval', type=str, default=None, help='(ignored — ES has no interval param)')
    parser.add_argument('--station', type=str, help='Single station code')
    args = parser.parse_args()

    SouthlandIngestion().run(
        period=args.period, backfill_days=args.days,
        dry_run=args.dry_run, station_code=args.station,
    )
