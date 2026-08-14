"""
GDC (Gisborne District Council) weather data ingestion
API: Hilltop Server at http://hilltop.gdc.govt.nz/data.hts

Key differences from TDC/MDC/GW:
  - HTTP (not HTTPS)
  - URL encoding must use %20 (not +) — quote() handles this correctly
  - Rainfall requires Method=Total parameter for hourly totals
  - Temperature measurement is 'Air Temperature' (not 'Air Temperature (continuous)')
  - Humidity measurement is 'Relative Humidity' (not 'Relative humidity')
  - Backfill should be done site-by-site to avoid server load
"""

import requests
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import sys
from pathlib import Path
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).parent.parent))
from db_connection import get_ingestion_session
from config.gdc_sites import GDC_SITES, GDC_API_BASE
from sources.db_util import bulk_upsert_observations
from sources.http_util import get_with_hard_timeout
from sources.window_util import MAX_INCREMENTAL_DAYS, incremental_start

# Incremental window + gap-close policy: see sources/window_util.py.


class GDCIngestion:
    """Ingestion class for GDC Hilltop weather data"""

    def __init__(self):
        self.data_source = 'GDC'
        self.base_url = GDC_API_BASE
        self.Session = get_ingestion_session()
        self.nz_tz = ZoneInfo('Pacific/Auckland')

        # Map GDC measurement name -> (canonical_variable, canonical_unit, scale).
        # Canonical unit is authoritative; GDC wind is km/hr -> m/s via 1/3.6.
        # All codes exist in measurement_catalog. No solar/soil at GDC sites.
        self.measurement_map = {
            'Air Temperature': ('temp', 'C', 1.0),
            'Relative Humidity': ('rh', 'percent', 1.0),
            'Rainfall': ('rainfall', 'mm', 1.0),
            'Average Wind Speed': ('wind_speed', 'm/s', 1.0 / 3.6),      # km/hr -> m/s
            'Average Wind Direction': ('wind_direction', 'deg', 1.0),
            'Maximum Wind Speed': ('wind_gust', 'm/s', 1.0 / 3.6),       # km/hr -> m/s
            'Barometric Pressure (hPa)': ('pressure', 'hPa', 1.0),
        }

        # Measurements that require Method=Total for hourly aggregation
        self.total_method_measurements = {'Rainfall'}

    def get_active_stations(self):
        """Get all active GDC stations from database"""
        with self.Session() as session:
            result = session.execute(text("""
                SELECT station_id, station_code, source_id, notes
                FROM weather_stations
                WHERE data_source = :source AND is_active = true
                ORDER BY station_code
            """), {'source': self.data_source})
            return result.fetchall()

    def get_last_timestamp(self, station_id: int, variable: str) -> datetime:
        """Get last observation time for this station/variable"""
        with self.Session() as session:
            result = session.execute(text("""
                SELECT MAX(timestamp)
                FROM weather_data
                WHERE station_id = :station_id AND variable = :variable
            """), {'station_id': station_id, 'variable': variable})

            last_time = result.scalar()
            if last_time:
                if last_time.tzinfo is None:
                    last_time = last_time.replace(tzinfo=self.nz_tz)
                return last_time
            else:
                return datetime.now(self.nz_tz) - timedelta(days=2)

    def fetch_data(self, site_name: str, measurement: str,
                   start_time: datetime, end_time: datetime,
                   interval: str = None) -> str:
        """Fetch data from GDC Hilltop API

        Args:
            site_name: Exact site name for API
            measurement: Measurement name (e.g., 'Air Temperature')
            start_time: Start of time range
            end_time: End of time range
            interval: Optional aggregation interval (e.g., '1 hour')
        """
        from urllib.parse import quote

        # Time-bearing ISO bounds, normalised to NZ local. A bare date makes Hilltop
        # read `To` as that day's 00:00, freezing incremental runs at midnight NZ;
        # and get_last_timestamp returns UTC-aware, so astimezone keeps From/To consistent.
        from_str = start_time.astimezone(self.nz_tz).strftime('%Y-%m-%dT%H:%M:%S')
        to_str = end_time.astimezone(self.nz_tz).strftime('%Y-%m-%dT%H:%M:%S')

        url = (
            f"{self.base_url}"
            f"?Service=Hilltop"
            f"&Request=GetData"
            f"&Site={quote(site_name)}"
            f"&Measurement={quote(measurement)}"
            f"&From={quote(from_str)}"
            f"&To={quote(to_str)}"
        )

        # Rainfall needs Method=Total for proper hourly totals
        if measurement in self.total_method_measurements:
            url += f"&Method=Total"

        if interval:
            url += f"&Interval={quote(interval)}"

        max_retries = 3
        for attempt in range(1, max_retries + 1):
            try:
                print(f"      URL: {url}")
                response = get_with_hard_timeout(url, total_timeout=90)
                response.raise_for_status()
                return response.text
            except requests.exceptions.RequestException as e:
                if attempt < max_retries:
                    wait = 5 * (3 ** (attempt - 1))
                    print(f"      Attempt {attempt}/{max_retries} failed ({e}), retrying in {wait}s...")
                    time.sleep(wait)
                else:
                    print(f"      API error after {max_retries} attempts: {e}")
                    return None

    def parse_response(self, station_id: int, xml_text: str,
                       measurement: str) -> list:
        """Parse Hilltop XML response into records"""
        records = []

        if not xml_text:
            return records

        if '<e>' in xml_text:
            import re
            match = re.search(r'<e>([^<]+)</e>', xml_text)
            error_msg = match.group(1) if match else xml_text[:300]
            print(f"      API error: {error_msg}")
            return records

        try:
            root = ET.fromstring(xml_text)
        except ET.ParseError as e:
            print(f"      XML parse error: {e}")
            return records

        if measurement not in self.measurement_map:
            print(f"      Unknown measurement: {measurement}")
            return records

        variable, unit, scale = self.measurement_map[measurement]
        # canonical unit from the map is authoritative (ignore XML <Units>); GDC
        # wind is km/hr and we store the scaled m/s value.

        for elem in root.iter('E'):
            try:
                t_elem = elem.find('T')
                # GDC uses I1 for data values (confirmed via sample fetch)
                i1_elem = elem.find('I1')
                if i1_elem is None:
                    i1_elem = elem.find('Value')

                if t_elem is None or i1_elem is None:
                    continue

                timestamp = datetime.strptime(t_elem.text, '%Y-%m-%dT%H:%M:%S')
                timestamp = timestamp.replace(tzinfo=self.nz_tz)

                value = float(i1_elem.text) * scale

                records.append({
                    'station_id': station_id,
                    'timestamp': timestamp,
                    'variable': variable,
                    'value': value,
                    'unit': unit,
                    'quality': 'GOOD'
                })
            except (ValueError, AttributeError) as e:
                continue

        return records

    def insert_data(self, records: list) -> int:
        """Insert weather data records into database"""
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
        """Log ingestion attempt"""
        with self.Session() as session:
            try:
                session.execute(
                    text("""
                        INSERT INTO ingestion_log
                            (data_source, station_id, start_time, end_time,
                             records_processed, records_inserted, status, error_msg)
                        VALUES (:source, :station_id, :start_time, NOW(),
                                :processed, :inserted, :status, :error_msg)
                    """),
                    {
                        'source': self.data_source,
                        'station_id': station_id,
                        'start_time': start_time,
                        'processed': records_processed,
                        'inserted': records_inserted,
                        'status': status,
                        'error_msg': error_msg
                    }
                )
                session.commit()
            except Exception as e:
                print(f"      Failed to log ingestion: {e}")

    def _year_chunks(self, start, end):
        """Yield (chunk_start, chunk_end) split on calendar-year boundaries so deep
        backfills stay bounded, per-year visible and resumable (see hbrc.py)."""
        cur = start
        while cur < end:
            year_end = datetime(cur.year + 1, 1, 1, tzinfo=self.nz_tz)
            chunk_end = min(year_end, end)
            yield cur, chunk_end
            cur = chunk_end

    def run(self, period: str = 'incremental', backfill_days: int = None,
            start_date: str = None, end_date: str = None, dry_run: bool = False,
            interval: str = None, station_code: str = None):
        """
        Main ingestion process

        Args:
            period: 'incremental' (from last timestamp) or 'backfill' (historical)
            backfill_days: Number of days to backfill (only used if period='backfill')
            start_date: Explicit start date (DD/MM/YYYY) - overrides period logic
            end_date: Explicit end date (DD/MM/YYYY) - defaults to today
            dry_run: If True, fetch and parse but don't insert to database
            interval: Data aggregation interval (e.g., '1 hour'). Default: 1 hour
            station_code: Optional station code to filter to a single station
        """
        print(f"\n{'='*60}")
        print(f"Starting GDC ingestion at {datetime.now()}")
        print(f"Period: {period}")
        if start_date:
            print(f"Date range: {start_date} to {end_date or 'today'}")
        if interval:
            print(f"Interval: {interval}")
        if station_code:
            print(f"Station filter: {station_code}")
        if dry_run:
            print(f"*** DRY RUN - No data will be inserted ***")
        print(f"{'='*60}\n")

        explicit_start = None
        explicit_end = None
        if start_date:
            explicit_start = datetime.strptime(start_date, '%d/%m/%Y').replace(tzinfo=self.nz_tz)
        if end_date:
            explicit_end = datetime.strptime(end_date, '%d/%m/%Y').replace(tzinfo=self.nz_tz)
        else:
            explicit_end = datetime.now(self.nz_tz)

        stations = self.get_active_stations()

        if station_code:
            stations = [s for s in stations if s[1] == station_code]
            if not stations:
                print(f"⚠ Station '{station_code}' not found in active GDC stations")
                print(f"  Available stations:")
                all_stations = self.get_active_stations()
                for s in all_stations:
                    print(f"    - {s[1]}")
                return

        print(f"Found {len(stations)} active GDC station(s)\n")

        total_inserted = 0
        total_parsed = 0

        for station in stations:
            station_id = station[0]
            station_code = station[1]
            site_name = station[2]  # source_id = site name for API
            notes = station[3] or {}

            print(f"Processing: {station_code}")
            print(f"  Site: {site_name}")

            measurements = notes.get('measurements', [])
            if not measurements:
                print(f"  ⚠ No measurements configured, skipping")
                continue

            print(f"  Measurements: {measurements}")

            station_total = 0
            station_parsed = 0

            for measurement in measurements:
                if measurement not in self.measurement_map:
                    print(f"    ⚠ Unknown measurement '{measurement}', skipping")
                    continue

                variable, _, _ = self.measurement_map[measurement]

                try:
                    if explicit_start:
                        start_time = explicit_start
                        end_time = explicit_end
                    else:
                        end_time = datetime.now(self.nz_tz)

                        if period == 'backfill' and backfill_days:
                            start_time = end_time - timedelta(days=backfill_days)
                        else:
                            start_time = self.get_last_timestamp(station_id, variable)

                    if not explicit_start and start_time >= end_time - timedelta(hours=1):
                        print(f"    {measurement}: Already up to date")
                        continue

                    # Cap incremental look-back (see hbrc.py) — no runaway catch-up.
                    if not explicit_start:
                        start_time, gap_note = incremental_start(start_time, end_time)
                        if gap_note:
                            print(f"    ⚠ {measurement}: {gap_note}")

                    print(f"    {measurement}: {start_time.date()} to {end_time.date()}")

                    # Fetch year-by-year so deep backfills stay bounded + resumable
                    for chunk_start, chunk_end in self._year_chunks(start_time, end_time):
                        xml_response = self.fetch_data(site_name, measurement,
                                                        chunk_start, chunk_end, interval)

                        if not xml_response:
                            if not dry_run:
                                self.log_ingestion(station_id, chunk_start, 0, 0,
                                                  'FAILED', f'No response for {measurement} '
                                                            f'{chunk_start.date()}..{chunk_end.date()}')
                            continue

                        records = self.parse_response(station_id, xml_response, measurement)

                        if not records:
                            print(f"      {chunk_start.year}: no records parsed")
                            continue

                        station_parsed += len(records)

                        if dry_run:
                            print(f"      [DRY RUN] {chunk_start.year}: would insert {len(records)} records "
                                  f"(sample {records[0]['timestamp']} = {records[0]['value']} {records[0]['unit']})")
                        else:
                            inserted = self.insert_data(records)
                            station_total += inserted
                            print(f"      ✓ {chunk_start.year}: inserted {inserted} records")

                except Exception as e:
                    print(f"      ✗ Error: {e}")
                    if not dry_run:
                        self.log_ingestion(station_id, datetime.now(self.nz_tz), 0, 0,
                                          'FAILED', str(e))

            if not dry_run and station_total > 0:
                self.log_ingestion(station_id, datetime.now(self.nz_tz),
                                  station_total, station_total, 'SUCCESS')
                total_inserted += station_total

            total_parsed += station_parsed

            if dry_run:
                print(f"  Total parsed: {station_parsed} records\n")
            else:
                print(f"  Total inserted: {station_total} records\n")

        print(f"{'='*60}")
        print(f"GDC ingestion complete at {datetime.now()}")
        if dry_run:
            print(f"Total records parsed: {total_parsed} (DRY RUN - nothing inserted)")
        else:
            print(f"Total records inserted: {total_inserted}")
        print(f"{'='*60}\n")


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Run GDC weather data ingestion')
    parser.add_argument('--period', choices=['incremental', 'backfill'],
                        default='incremental', help='Ingestion period')
    parser.add_argument('--days', type=int, default=90,
                        help='Days to backfill (only used with --period backfill)')
    parser.add_argument('--start', type=str, metavar='DD/MM/YYYY',
                        help='Explicit start date (overrides period logic)')
    parser.add_argument('--end', type=str, metavar='DD/MM/YYYY',
                        help='Explicit end date (defaults to today)')
    parser.add_argument('--dry-run', action='store_true',
                        help='Fetch and parse but do not insert to database')
    parser.add_argument('--interval', type=str, default='1 hour',
                        help='Data aggregation interval (e.g., "1 hour"). Default: 1 hour')
    parser.add_argument('--station', type=str,
                        help='Station code to run a single station (e.g., GDC_AIRPORT_MET)')
    args = parser.parse_args()

    ingester = GDCIngestion()
    ingester.run(
        period=args.period,
        backfill_days=args.days,
        start_date=args.start,
        end_date=args.end,
        dry_run=args.dry_run,
        interval=args.interval,
        station_code=args.station
    )
