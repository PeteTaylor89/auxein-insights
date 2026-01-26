"""
MDC (Marlborough District Council) weather data ingestion
API: Hilltop Server at https://hydro.marlborough.govt.nz/data.hts
"""

import requests
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import sys
from pathlib import Path
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).parent.parent))
from db_connection import get_ingestion_session
from config.mdc_sites import MDC_SITES, MDC_API_BASE


class MDCIngestion:
    """Ingestion class for MDC Hilltop weather data"""
    
    def __init__(self):
        self.data_source = 'MDC'
        self.base_url = MDC_API_BASE
        self.Session = get_ingestion_session()
        self.nz_tz = ZoneInfo('Pacific/Auckland')
        
        # Map MDC measurement names to standard variable names
        self.measurement_map = {
            'Air Temperature': ('temp', 'C'),
            'Humidity': ('rh', 'percent'),
            'Rainfall': ('rainfall', 'mm'),
            'Rainfall 1 Hour': ('rainfall', 'mm'),
        }
    
    def get_active_stations(self):
        """Get all active MDC stations from database"""
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
                # First run: start from 2 days ago
                return datetime.now(self.nz_tz) - timedelta(days=2)
    
    def fetch_data(self, site_name: str, measurement: str, 
                   start_time: datetime, end_time: datetime,
                   interval: str = None) -> str:
        """Fetch data from MDC Hilltop API
        
        Args:
            site_name: Exact site name for API
            measurement: Measurement name (e.g., 'Air Temperature')
            start_time: Start of time range
            end_time: End of time range
            interval: Optional aggregation interval (e.g., '30 minutes', '1 hour')
        """
        from urllib.parse import quote
        
        # Format dates as DD/MM/YYYY for Hilltop
        from_str = start_time.strftime('%d/%m/%Y')
        to_str = end_time.strftime('%d/%m/%Y')
        
        # Build URL manually to ensure %20 encoding (not +)
        url = (
            f"{self.base_url}"
            f"?Service=Hilltop"
            f"&Request=GetData"
            f"&Site={quote(site_name)}"
            f"&Measurement={quote(measurement)}"
            f"&From={quote(from_str)}"
            f"&To={quote(to_str)}"
        )
        
        if interval:
            url += f"&Interval={quote(interval)}"
        
        try:
            print(f"      URL: {url}")
            response = requests.get(url, timeout=60)
            response.raise_for_status()
            return response.text
        except requests.exceptions.RequestException as e:
            print(f"      API error: {e}")
            return None
    
    def parse_response(self, station_id: int, xml_text: str, 
                       measurement: str) -> list:
        """Parse Hilltop XML response into records"""
        records = []
        
        if not xml_text:
            return records
        
        # Check for error response
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
        
        # Get variable mapping
        if measurement not in self.measurement_map:
            print(f"      Unknown measurement: {measurement}")
            return records
        
        variable, default_unit = self.measurement_map[measurement]
        
        # Try to get unit from XML
        unit = default_unit
        units_elem = root.find('.//Units')
        if units_elem is not None and units_elem.text:
            xml_unit = units_elem.text
            # Normalize units
            if xml_unit == '%':
                unit = 'percent'
            elif xml_unit in ('°C', 'deg C'):
                unit = 'C'
            elif xml_unit == 'mm':
                unit = 'mm'
            else:
                unit = xml_unit
        
        # Parse data elements
        for elem in root.iter('E'):
            try:
                t_elem = elem.find('T')
                i1_elem = elem.find('I1')
                
                if t_elem is None or i1_elem is None:
                    continue
                
                # Parse timestamp (format: 2026-01-24T00:00:00)
                timestamp = datetime.strptime(t_elem.text, '%Y-%m-%dT%H:%M:%S')
                timestamp = timestamp.replace(tzinfo=self.nz_tz)
                
                # Parse value
                value = float(i1_elem.text)
                
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
                session.execute(
                    text("""
                        INSERT INTO weather_data 
                            (station_id, timestamp, variable, value, unit, quality)
                        VALUES (:station_id, :timestamp, :variable, :value, :unit, :quality)
                        ON CONFLICT (station_id, timestamp, variable)
                        DO UPDATE SET
                            value = EXCLUDED.value,
                            quality = EXCLUDED.quality,
                            created_at = NOW()
                    """),
                    records
                )
                session.commit()
                return len(records)
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
    
    def run(self, period: str = 'incremental', backfill_days: int = None,
            start_date: str = None, end_date: str = None, dry_run: bool = False,
            interval: str = None):
        """
        Main ingestion process
        
        Args:
            period: 'incremental' (from last timestamp) or 'backfill' (historical)
            backfill_days: Number of days to backfill (only used if period='backfill')
            start_date: Explicit start date (DD/MM/YYYY) - overrides period logic
            end_date: Explicit end date (DD/MM/YYYY) - defaults to today
            dry_run: If True, fetch and parse but don't insert to database
            interval: Data aggregation interval (e.g., '30 minutes', '1 hour')
        """
        print(f"\n{'='*60}")
        print(f"Starting MDC ingestion at {datetime.now()}")
        print(f"Period: {period}")
        if start_date:
            print(f"Date range: {start_date} to {end_date or 'today'}")
        if interval:
            print(f"Interval: {interval}")
        if dry_run:
            print(f"*** DRY RUN - No data will be inserted ***")
        print(f"{'='*60}\n")
        
        # Parse explicit dates if provided
        explicit_start = None
        explicit_end = None
        if start_date:
            explicit_start = datetime.strptime(start_date, '%d/%m/%Y').replace(tzinfo=self.nz_tz)
        if end_date:
            explicit_end = datetime.strptime(end_date, '%d/%m/%Y').replace(tzinfo=self.nz_tz)
        else:
            explicit_end = datetime.now(self.nz_tz)
        
        stations = self.get_active_stations()
        print(f"Found {len(stations)} active MDC stations\n")
        
        total_inserted = 0
        total_parsed = 0
        
        for station in stations:
            station_id = station[0]
            station_code = station[1]
            site_name = station[2]  # source_id = site name for API
            notes = station[3] or {}
            
            print(f"Processing: {station_code}")
            print(f"  Site: {site_name}")
            
            # Get measurements from notes
            measurements = notes.get('measurements', [])
            if not measurements:
                print(f"  ⚠ No measurements configured, skipping")
                continue
            
            print(f"  Measurements: {measurements}")
            
            station_total = 0
            station_parsed = 0
            
            for measurement in measurements:
                # Skip unknown measurements
                if measurement not in self.measurement_map:
                    print(f"    ⚠ Unknown measurement '{measurement}', skipping")
                    continue
                
                variable, _ = self.measurement_map[measurement]
                
                try:
                    # Calculate time window
                    if explicit_start:
                        start_time = explicit_start
                        end_time = explicit_end
                    else:
                        end_time = datetime.now(self.nz_tz)
                        
                        if period == 'backfill' and backfill_days:
                            start_time = end_time - timedelta(days=backfill_days)
                        else:
                            start_time = self.get_last_timestamp(station_id, variable)
                    
                    # Skip if already up to date (within 1 hour) - only for incremental
                    if not explicit_start and start_time >= end_time - timedelta(hours=1):
                        print(f"    {measurement}: Already up to date")
                        continue
                    
                    print(f"    {measurement}: {start_time.date()} to {end_time.date()}")
                    
                    # Fetch from API
                    xml_response = self.fetch_data(site_name, measurement, 
                                                    start_time, end_time, interval)
                    
                    if not xml_response:
                        if not dry_run:
                            self.log_ingestion(station_id, start_time, 0, 0,
                                              'FAILED', f'No response for {measurement}')
                        continue
                    
                    # Parse response
                    records = self.parse_response(station_id, xml_response, measurement)
                    
                    if not records:
                        print(f"      No records parsed")
                        continue
                    
                    station_parsed += len(records)
                    
                    if dry_run:
                        print(f"      [DRY RUN] Would insert {len(records)} records")
                        if records:
                            print(f"      Sample: {records[0]['timestamp']} = {records[0]['value']} {records[0]['unit']}")
                    else:
                        # Insert into database
                        inserted = self.insert_data(records)
                        station_total += inserted
                        print(f"      ✓ Inserted {inserted} records")
                    
                except Exception as e:
                    print(f"      ✗ Error: {e}")
                    if not dry_run:
                        self.log_ingestion(station_id, datetime.now(self.nz_tz), 0, 0,
                                          'FAILED', str(e))
            
            # Log overall station result
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
        print(f"MDC ingestion complete at {datetime.now()}")
        if dry_run:
            print(f"Total records parsed: {total_parsed} (DRY RUN - nothing inserted)")
        else:
            print(f"Total records inserted: {total_inserted}")
        print(f"{'='*60}\n")


if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Run MDC weather data ingestion')
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
    parser.add_argument('--interval', type=str, default='30 minutes',
                        help='Data aggregation interval (e.g., "30 minutes", "1 hour"). Default: 30 minutes')
    args = parser.parse_args()
    
    ingester = MDCIngestion()
    ingester.run(
        period=args.period, 
        backfill_days=args.days,
        start_date=args.start,
        end_date=args.end,
        dry_run=args.dry_run,
        interval=args.interval
    )