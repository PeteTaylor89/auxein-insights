"""
NRC (Northland Regional Council) weather data ingestion.
API: Hilltop Server at https://hilltop.nrc.govt.nz/data.hts

V1 scope: RAINFALL only (41 live sites). NRC's Climate_soil network also carries
multi-depth soil moisture/temperature (8 + 4 depths) and NO air temperature — the
soil profiles need a data-model decision (we store single soil values), so they are
deferred. See docs/plans/INGESTION_EXPANSION_2026-07-16.md §6.

NRC-specific quirks vs the other Hilltop councils:
  - IIS returns a gzip-encoded body even when we don't request it -> sniff the magic
    bytes and decompress (requests only auto-decompresses when Content-Encoding is set).
  - Set a User-Agent (some council front-ends 403 without one).

COMMERCIAL LICENCE: NRC requires written permission for commercial reuse. Cleared 2026-07-30.
"""

import gzip as _gzip
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import sys
from pathlib import Path
from urllib.parse import quote

import requests
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).parent.parent))
from db_connection import get_ingestion_session
from sources.db_util import bulk_upsert_observations
from sources.http_util import get_with_hard_timeout
from sources.hilltop_util import aggregation_query
from sources.window_util import MAX_INCREMENTAL_DAYS, incremental_start
# Incremental window + gap-close policy: see sources/window_util.py.


class NRCIngestion:
    """Ingestion class for NRC Hilltop rainfall data."""

    def __init__(self):
        self.data_source = 'NRC'
        self.base_url = 'https://hilltop.nrc.govt.nz/data.hts'
        self.Session = get_ingestion_session()
        self.nz_tz = ZoneInfo('Pacific/Auckland')
        self.headers = {'User-Agent': 'Mozilla/5.0 (compatible; AuxeinIngest/1.0)'}

        # Only Rainfall is mapped; every other series NRC exposes (Comment, Voltage,
        # Recorder Total, raw-edited, Primary Reference, multi-depth soil) is QA/
        # housekeeping/deferred and intentionally dropped.
        self.measurement_map = {
            'Rainfall': ('rainfall', 'mm', 1.0),
        }

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
                    last_time = last_time.replace(tzinfo=self.nz_tz)
                return last_time
            return datetime.now(self.nz_tz) - timedelta(days=2)

    def fetch_data(self, site_name: str, measurement: str,
                   start_time: datetime, end_time: datetime,
                   interval: str = None) -> str:
        # Time-bearing ISO bounds, normalised to NZ local (a bare date makes Hilltop
        # read `To` as that day's 00:00, freezing incremental at midnight NZ).
        from_str = start_time.astimezone(self.nz_tz).strftime('%Y-%m-%dT%H:%M:%S')
        to_str = end_time.astimezone(self.nz_tz).strftime('%Y-%m-%dT%H:%M:%S')

        url = (f"{self.base_url}?Service=Hilltop&Request=GetData"
               f"&Site={quote(site_name)}&Measurement={quote(measurement)}"
               f"&From={quote(from_str)}&To={quote(to_str)}")
        # Interval ALWAYS carries a Method — see sources/hilltop_util.py.
        url += aggregation_query(measurement, self.measurement_map, interval, quote)

        max_retries = 3
        for attempt in range(1, max_retries + 1):
            try:
                print(f"      URL: {url}")
                response = get_with_hard_timeout(url, total_timeout=90, headers=self.headers)
                response.raise_for_status()
                body = response.content
                if body[:2] == b'\x1f\x8b':          # NRC gzips unrequested
                    body = _gzip.decompress(body)
                return body.decode('utf-8', errors='replace')
            except requests.exceptions.RequestException as e:
                if attempt < max_retries:
                    wait = 5 * (3 ** (attempt - 1))
                    print(f"      Attempt {attempt}/{max_retries} failed ({e}), retrying in {wait}s...")
                    time.sleep(wait)
                else:
                    print(f"      API error after {max_retries} attempts: {e}")
                    return None

    def parse_response(self, station_id: int, xml_text: str, measurement: str) -> list:
        records = []
        if not xml_text:
            return records
        if '<Error>' in xml_text or '<e>' in xml_text:
            import re
            m = re.search(r'<[Ee](?:rror)?>([^<]+)</[Ee](?:rror)?>', xml_text)
            print(f"      API error: {m.group(1) if m else xml_text[:200]}")
            return records
        try:
            root = ET.fromstring(xml_text)
        except ET.ParseError as e:
            print(f"      XML parse error: {e}")
            return records
        if measurement not in self.measurement_map:
            return records
        variable, unit, scale = self.measurement_map[measurement]
        for elem in root.iter('E'):
            try:
                t_elem = elem.find('T')
                i1_elem = elem.find('I1')
                if i1_elem is None:
                    i1_elem = elem.find('Value')
                if t_elem is None or i1_elem is None:
                    continue
                ts = datetime.strptime(t_elem.text, '%Y-%m-%dT%H:%M:%S').replace(tzinfo=self.nz_tz)
                records.append({
                    'station_id': station_id, 'timestamp': ts, 'variable': variable,
                    'value': float(i1_elem.text) * scale, 'unit': unit, 'quality': 'GOOD',
                })
            except (ValueError, AttributeError):
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
                # A failed write is not a successful station - see db_util._dedupe.
                print(f"      *** DB WRITE FAILED: {e}")
                self.write_failed = True
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

    def _year_chunks(self, start, end):
        cur = start
        while cur < end:
            year_end = datetime(cur.year + 1, 1, 1, tzinfo=self.nz_tz)
            chunk_end = min(year_end, end)
            yield cur, chunk_end
            cur = chunk_end

    def run(self, period: str = 'incremental', backfill_days: int = None,
            start_date: str = None, end_date: str = None, dry_run: bool = False,
            interval: str = None, station_code: str = None):
        print(f"Starting NRC ingestion at {datetime.now(self.nz_tz)}")
        print(f"Period: {period}")

        explicit_start = explicit_end = None
        if start_date:
            explicit_start = datetime.strptime(start_date, '%d/%m/%Y').replace(tzinfo=self.nz_tz)
        if end_date:
            explicit_end = datetime.strptime(end_date, '%d/%m/%Y').replace(tzinfo=self.nz_tz)
        elif explicit_start:
            explicit_end = datetime.now(self.nz_tz)

        stations = self.get_active_stations()
        if station_code:
            stations = [s for s in stations if s[1] == station_code]
            if not stations:
                print(f"⚠ Station '{station_code}' not found in active NRC stations")
                return

        print(f"Found {len(stations)} active NRC station(s)\n")
        total_inserted = total_parsed = 0

        for station in stations:
            station_id, code, site_name, notes = station[0], station[1], station[2], (station[3] or {})
            print(f"Processing: {code}\n  Site: {site_name}")
            measurements = notes.get('measurements', [])
            if not measurements:
                print("  ⚠ No measurements configured, skipping")
                continue

            station_total = station_parsed = 0
            for measurement in measurements:
                if measurement not in self.measurement_map:
                    continue
                variable, _, _ = self.measurement_map[measurement]
                try:
                    if explicit_start:
                        start_time, end_time = explicit_start, explicit_end
                    else:
                        end_time = datetime.now(self.nz_tz)
                        if period == 'backfill' and backfill_days:
                            start_time = end_time - timedelta(days=backfill_days)
                        else:
                            start_time = self.get_last_timestamp(station_id, variable)

                    if not explicit_start and start_time >= end_time - timedelta(hours=1):
                        print(f"    {measurement}: Already up to date")
                        continue
                    if not explicit_start:
                        start_time, gap_note = incremental_start(start_time, end_time)
                        if gap_note:
                            print(f"    ⚠ {measurement}: {gap_note}")

                    print(f"    {measurement}: {start_time.date()} to {end_time.date()}")
                    for chunk_start, chunk_end in self._year_chunks(start_time, end_time):
                        xml_response = self.fetch_data(site_name, measurement,
                                                       chunk_start, chunk_end, interval)
                        if not xml_response:
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
                        self.log_ingestion(station_id, datetime.now(self.nz_tz), 0, 0, 'FAILED', str(e))

            if not dry_run and station_total > 0:
                self.log_ingestion(station_id, datetime.now(self.nz_tz),
                                   station_total, station_total, 'SUCCESS')
                total_inserted += station_total
            total_parsed += station_parsed
            print(f"  Total {'parsed' if dry_run else 'inserted'}: "
                  f"{station_parsed if dry_run else station_total} records\n")

        print(f"\n{'='*60}\nNRC ingestion complete at {datetime.now(self.nz_tz)}")
        print(f"Total records {'parsed' if dry_run else 'inserted'}: "
              f"{total_parsed if dry_run else total_inserted}\n{'='*60}\n")


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Run NRC weather data ingestion')
    parser.add_argument('--period', choices=['incremental', 'backfill'], default='incremental')
    parser.add_argument('--days', type=int, default=90)
    parser.add_argument('--start', type=str, metavar='DD/MM/YYYY')
    parser.add_argument('--end', type=str, metavar='DD/MM/YYYY')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--interval', type=str, default='1 hour')
    parser.add_argument('--station', type=str)
    args = parser.parse_args()
    ingester = NRCIngestion()
    ingester.run(
        period=args.period, backfill_days=args.days, start_date=args.start,
        end_date=args.end, dry_run=args.dry_run, interval=args.interval,
        station_code=args.station,
    )
    if getattr(ingester, 'write_failed', False):
        print('One or more database writes FAILED - see above. '
              'This run did NOT persist everything it fetched.')
        sys.exit(1)
