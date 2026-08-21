import requests
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy import text
import sys
from pathlib import Path

# Import our DB connection utility
sys.path.insert(0, str(Path(__file__).parent.parent))
from db_connection import get_ingestion_session
from sources.http_util import get_with_hard_timeout
from sources.db_util import bulk_upsert_observations

# Backend service for credential resolution (Phase B1)
backend_path = Path(__file__).parent.parent.parent / "backend"
sys.path.insert(0, str(backend_path))
from services.credential_service import CredentialResolver, CredentialError  # noqa: E402


class HarvestIngestion:
    """Ingestion class for Harvest Electronics weather data.

    Per-device credential resolution (Phase B1): each device's
    `api_credential_ref` resolves through CredentialResolver to its actual API
    key. Devices sharing a ref share a key (one Auxein-owned key serves many
    public stations; each customer brings their own ref/key when onboarded).
    """

    def __init__(self, resolver: Optional[CredentialResolver] = None):
        self.data_source = 'HARVEST'
        self.base_url = 'https://live.harvest.com/api.php'
        self.delay_hours = 13  # Harvest has 13-hour data delay

        # Database connection
        self.Session = get_ingestion_session()

        # Credential resolver — instantiate one if caller didn't pass one in.
        # The resolver holds its own DB session for credential lookups,
        # independent of the per-call sessions used for stations / data inserts.
        if resolver is None:
            resolver = CredentialResolver(db=self.Session())
        self.resolver = resolver

    def get_active_stations(self, station_code=None, credential_ref=None):
        """Get active Harvest stations from database, including credential ref.

        Optional filters (either, both, or neither):
            station_code: exact station_code match (single device).
            credential_ref: exact api_credential_ref match (e.g. 'harvest/codc'
                to scope to all devices sharing that credential).
        """
        params = {'source': self.data_source}
        filters = ["data_source = :source", "is_active = true"]
        if station_code:
            filters.append("station_code = :station_code")
            params['station_code'] = station_code
        if credential_ref:
            filters.append("api_credential_ref = :credential_ref")
            params['credential_ref'] = credential_ref

        sql = f"""
            SELECT station_id, station_code, source_id, notes, api_credential_ref
            FROM weather_stations
            WHERE {' AND '.join(filters)}
            ORDER BY station_code
        """
        with self.Session() as session:
            result = session.execute(text(sql), params)
            return result.fetchall()
    
    def get_last_timestamp(self, station_id, variable='temp'):
        """Get last observation time for this station/variable"""
        with self.Session() as session:
            result = session.execute(text("""
                SELECT MAX(timestamp)
                FROM weather_data
                WHERE station_id = :station_id AND variable = :variable
            """), {'station_id': station_id, 'variable': variable})
            
            last_time = result.scalar()
            if last_time:
                # Ensure the returned timestamp is timezone-aware (NZ)
                from zoneinfo import ZoneInfo
                nz_tz = ZoneInfo('Pacific/Auckland')
                if last_time.tzinfo is None:
                    last_time = last_time.replace(tzinfo=nz_tz)
                return last_time
            else:
                # First run: start from 2 days ago instead of Jan 1
                from datetime import datetime
                from zoneinfo import ZoneInfo
                nz_tz = ZoneInfo('Pacific/Auckland')
                return datetime.now(nz_tz) - timedelta(days=2)
    
    def fetch_harvest_data(self, trace_id, start_time, end_time, api_key):
        """Fetch data from Harvest API with pagination support.

        api_key is passed in per call rather than read from self, so devices
        belonging to different Harvest accounts (different credential refs)
        can be ingested in the same run.
        """
        all_data = []

        params = {
            'output_type': 'application/json',
            'command_type': 'get_data',
            'api_key': api_key,
            'trace_id': trace_id,
            'start_time': start_time.strftime('%Y-%m-%d %H:%M:%S'),
            'end_time': end_time.strftime('%Y-%m-%d %H:%M:%S')
        }
        
        url = self.base_url
        page_count = 0
        # Safety cap against runaway pagination loops. Sized for multi-year
        # backfills at 10-min cadence: 100 records/page × 2000 pages ≈ 4 years
        # of one trace. Harvest's rate limit (200 req/min) is the real ceiling.
        max_pages = 2000
        
        try:
            print(f"    Fetching trace {trace_id}: {start_time.date()} to {end_time.date()}")
            
            while url and page_count < max_pages:
                response = get_with_hard_timeout(
                    url, total_timeout=60,
                    params=params if page_count == 0 else None)
                response.raise_for_status()
                data = response.json()

                page_data = data.get('data') or []
                if page_data:
                    all_data.extend(page_data)
                    page_count += 1
                else:
                    # Empty page. Harvest still returns a 'next' link on empty
                    # results, so following it just burns requests (one trace was
                    # chasing ~18 empty pages). Stop as soon as a page is empty.
                    break

                # Follow pagination only while pages keep returning data
                if data.get('_links', {}).get('next'):
                    url = data['_links']['next']
                    params = None  # Next URL already has params
                    print(f"      Page {page_count}: {len(page_data)} records (fetching more...)")
                else:
                    break
            
            if page_count >= max_pages:
                # Reaching the cap exits the loop and returns the partial set as if
                # it were complete — a silent truncation, and the caller then writes
                # a `last timestamp` that makes the gap look ingested. Say so.
                # At ~186 records/page a 6.5-year window needs ~2,370 pages, so a
                # whole-range backfill DOES hit this; chunk by year.
                print(f"    !! PAGE CAP {max_pages} REACHED for trace {trace_id} — "
                      f"result is TRUNCATED at {all_data[-1].get('time_stamp')}; "
                      f"re-run in smaller windows")
            print(f"    Received {len(all_data)} total records across {page_count} page(s)")
            
            # Return in same format as original
            return {
                'data': all_data,
                'uom': data.get('uom', ''),
                'time_zone': data.get('time_zone', '')
            }
            
        except requests.exceptions.RequestException as e:
            print(f"    API error: {e}")
            return None
        except Exception as e:
            print(f"    Unexpected error: {e}")
            return None
    
    def parse_response(self, station_id, response_data):
        """Parse Harvest API response into standardized format"""
        records = []
        
        if not response_data or 'data' not in response_data:
            return records
        
        # Determine variable type from unit of measurement
        uom = response_data.get('uom', '')
        if uom == '°C':
            variable = 'temp'
            unit = 'C'
        elif uom == '%':
            variable = 'rh'
            unit = 'percent'
        elif uom == 'mm':
            variable = 'rainfall'
            unit = 'mm'
        elif uom == 'W/m²' or uom == 'MJ/m²':
            variable = 'solar_radiation'
            unit = uom
        elif uom == 'hPa' or uom == 'kPa':
            variable = 'pressure'
            unit = uom
        else:
            variable = 'unknown'
            unit = uom
        
        # Parse each reading
        for reading in response_data['data']:
            try:
                timestamp = datetime.strptime(
                    reading['time_stamp'],
                    '%Y-%m-%d %H:%M:%S.%f'
                )
                
                quality = 'GOOD' if reading.get('data_state', False) else 'BAD'
                
                records.append({
                    'station_id': station_id,
                    'timestamp': timestamp,
                    'variable': variable,
                    'value': float(reading['data_value']),
                    'unit': unit,
                    'quality': quality
                })
            except Exception as e:
                print(f"    Error parsing reading: {e}")
                continue
        
        return records
    
    def insert_data(self, records):
        """Insert weather data records into database.

        Uses the shared `execute_values` path rather than the per-row executemany
        this used to run. The record dicts already match OBS_COLUMNS exactly, so
        the switch is a drop-in — and it is what makes a multi-year backfill
        possible at all.

        Measured 2026-08-20: the Harvest API itself is fast (0.6 s for a 200-record
        page, ~1.1 days of 10-minute data per request), so a station-year is only
        ~3 minutes of fetching. The old executemany sent ONE round-trip PER ROW to
        RDS in Sydney at ~30-60 ms each, which is ~50 minutes per station-year of
        pure insert latency — a 2020-2025 fleet backfill would have taken on the
        order of 200 hours, and a single station-MONTH timed out at 4 minutes.

        `bulk_upsert_observations` also applies the physical-range screen and the
        spring-forward dedupe, so Harvest picks both up rather than needing its own.
        """
        if not records:
            return 0

        with self.Session() as session:
            try:
                n = bulk_upsert_observations(session, records)
                session.commit()
                return n
            except Exception as e:
                session.rollback()
                print(f"    Database error: {e}")
                return 0
    
    def log_ingestion(self, station_id, start_time, records_processed, 
                     records_inserted, status, error_msg=None):
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
                print(f"    Failed to log ingestion: {e}")
    
    def run(self, start_date=None, end_date=None, station_code=None, credential_ref=None, dry_run=False, **kwargs):
        """Main ingestion process.

        Args:
            start_date: Explicit start date string (DD/MM/YYYY). Overrides incremental logic.
            end_date: Explicit end date string (DD/MM/YYYY). Defaults to now minus delay.
            station_code: Scope to a single station_code (backfill / testing).
            credential_ref: Scope to all devices using this api_credential_ref
                (e.g. 'harvest/codc' to backfill just that customer's fleet).
            dry_run: If True, fetch + parse but skip DB writes and skip
                ingestion_log entries. Exercises credential + API + parser.
        """
        print(f"\n{'='*60}")
        print(f"Starting Harvest ingestion at {datetime.now()}")
        if start_date:
            print(f"Date range: {start_date} to {end_date or 'now'}")
        if station_code:
            print(f"Station filter:    {station_code}")
        if credential_ref:
            print(f"Credential filter: {credential_ref}")
        if dry_run:
            print(f"*** DRY RUN — no DB writes, no ingestion_log entries ***")
        print(f"{'='*60}\n")

        from zoneinfo import ZoneInfo
        nz_tz = ZoneInfo('Pacific/Auckland')

        # Parse explicit dates if provided
        explicit_start = None
        explicit_end = None
        if start_date:
            explicit_start = datetime.strptime(start_date, '%d/%m/%Y').replace(tzinfo=nz_tz)
        if end_date:
            explicit_end = datetime.strptime(end_date, '%d/%m/%Y').replace(hour=23, minute=59, second=59, tzinfo=nz_tz)

        stations = self.get_active_stations(station_code=station_code, credential_ref=credential_ref)
        print(f"Found {len(stations)} active Harvest stations\n")

        # Pre-resolve every distinct credential ref so we know upfront which
        # are healthy. Failures here mean affected stations get skipped with a
        # clear log line instead of erroring mid-fetch.
        unique_refs = sorted({s[4] for s in stations if s[4]})
        resolved_keys: dict[str, str] = {}
        ref_errors: dict[str, str] = {}
        for ref in unique_refs:
            try:
                resolved_keys[ref] = self.resolver.resolve(ref)
            except CredentialError as e:
                ref_errors[ref] = str(e)
                print(f"  ⚠ Credential '{ref}' failed to resolve: {e}")
        print(
            f"Resolved {len(resolved_keys)}/{len(unique_refs)} credential ref(s) "
            f"across {len(stations)} stations\n"
        )

        for station in stations:
            station_id = station[0]
            station_code = station[1]
            source_id = station[2]  # trace_id
            notes = station[3]
            credential_ref = station[4]

            print(f"Processing: {station_code}")

            # Resolve API key for this station via its credential ref.
            if not credential_ref:
                print(f"  ✗ No api_credential_ref set on device {station_id}; skipping\n")
                self.log_ingestion(
                    station_id, datetime.now(nz_tz), 0, 0,
                    'FAILED', 'Device has no api_credential_ref',
                )
                continue
            api_key = resolved_keys.get(credential_ref)
            if api_key is None:
                err = ref_errors.get(credential_ref, 'unknown resolver error')
                print(f"  ✗ Credential '{credential_ref}' unavailable; skipping\n")
                self.log_ingestion(
                    station_id, datetime.now(nz_tz), 0, 0,
                    'FAILED', f"Credential '{credential_ref}' unavailable: {err}",
                )
                continue

            try:
                # Calculate time window
                if explicit_start:
                    start_time = explicit_start
                    end_time = explicit_end or (datetime.now(nz_tz) - timedelta(hours=self.delay_hours))
                else:
                    # Incremental: from last record to now (accounting for 13-hour delay)
                    end_time = datetime.now(nz_tz) - timedelta(hours=self.delay_hours)
                    start_time = self.get_last_timestamp(station_id)

                # Skip if already up to date
                if start_time >= end_time:
                    print(f"  ✓ Already up to date (last: {start_time})\n")
                    continue

                # Fetch from API
                response = self.fetch_harvest_data(source_id, start_time, end_time, api_key)

                if not response:
                    if not dry_run:
                        self.log_ingestion(station_id, start_time, 0, 0,
                                         'FAILED', 'No response from API')
                    print(f"  ✗ Failed to fetch data\n")
                    continue

                # Parse response
                records = self.parse_response(station_id, response)

                if not records:
                    if not dry_run:
                        self.log_ingestion(station_id, start_time, 0, 0,
                                         'FAILED', 'No valid records parsed')
                    print(f"  ✗ No valid records\n")
                    continue

                if dry_run:
                    print(f"  ✓ DRY RUN: parsed {len(records)} records (skipped insert + log)")
                    print(f"  Time range: {records[0]['timestamp'].date()} to {records[-1]['timestamp'].date()}\n")
                    continue

                # Insert into database
                inserted = self.insert_data(records)

                # Log success
                self.log_ingestion(station_id, start_time, len(records),
                                 inserted, 'SUCCESS')

                print(f"  ✓ Inserted {inserted} records")
                print(f"  Time range: {records[0]['timestamp'].date()} to {records[-1]['timestamp'].date()}\n")
                
            except Exception as e:
                print(f"  ✗ Error: {e}\n")
                self.log_ingestion(station_id, datetime.now(), 0, 0,
                                 'FAILED', str(e))
        
        print(f"{'='*60}")
        print(f"Harvest ingestion complete at {datetime.now()}")
        print(f"{'='*60}\n")