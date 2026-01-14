import requests
from datetime import datetime, timedelta
import os
from sqlalchemy import text
import sys
from pathlib import Path

# Import our DB connection utility
sys.path.insert(0, str(Path(__file__).parent.parent))
from db_connection import get_ingestion_session

class HarvestIngestion:
    """Ingestion class for Harvest Electronics weather data"""
    
    def __init__(self):
        self.data_source = 'HARVEST'
        self.api_key = os.getenv('HARVEST_API_KEY')
        if not self.api_key:
            raise ValueError("HARVEST_API_KEY not set in environment")
        
        self.base_url = 'https://live.harvest.com/api.php'
        self.delay_hours = 13  # Harvest has 13-hour data delay
        
        # Database connection
        self.Session = get_ingestion_session()
    
    def get_active_stations(self):
        """Get all active Harvest stations from database"""
        with self.Session() as session:
            result = session.execute(text("""
                SELECT station_id, station_code, source_id, notes
                FROM weather_stations
                WHERE data_source = :source AND is_active = true
                ORDER BY station_code
            """), {'source': self.data_source})
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
    
    def fetch_harvest_data(self, trace_id, start_time, end_time):
        """Fetch data from Harvest API with pagination support"""
        all_data = []
        
        params = {
            'output_type': 'application/json',
            'command_type': 'get_data',
            'api_key': self.api_key,
            'trace_id': trace_id,
            'start_time': start_time.strftime('%Y-%m-%d %H:%M:%S'),
            'end_time': end_time.strftime('%Y-%m-%d %H:%M:%S')
        }
        
        url = self.base_url
        page_count = 0
        max_pages = 50  # Safety limit to prevent infinite loops
        
        try:
            print(f"    Fetching trace {trace_id}: {start_time.date()} to {end_time.date()}")
            
            while url and page_count < max_pages:
                response = requests.get(url, params=params if page_count == 0 else None, timeout=30)
                response.raise_for_status()
                data = response.json()
                
                # Accumulate data
                if 'data' in data and data['data']:
                    all_data.extend(data['data'])
                    page_count += 1
                
                # Check for next page
                if '_links' in data and 'next' in data['_links']:
                    url = data['_links']['next']
                    params = None  # Next URL already has params
                    print(f"      Page {page_count}: {len(data['data'])} records (fetching more...)")
                else:
                    break
            
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
        """Insert weather data records into database"""
        if not records:
            return 0
        
        with self.Session() as session:
            try:
                # Use executemany for bulk insert
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
    
    def run(self):
        """Main ingestion process"""
        print(f"\n{'='*60}")
        print(f"Starting Harvest ingestion at {datetime.now()}")
        print(f"{'='*60}\n")
        
        stations = self.get_active_stations()
        print(f"Found {len(stations)} active Harvest stations\n")
        
        for station in stations:
            station_id = station[0]
            station_code = station[1]
            source_id = station[2]  # trace_id
            notes = station[3]
            
            print(f"Processing: {station_code}")
            
            try:
                # Calculate time window (accounting for 13-hour delay)
                from zoneinfo import ZoneInfo
                nz_tz = ZoneInfo('Pacific/Auckland')
                end_time = datetime.now(nz_tz) - timedelta(hours=self.delay_hours)  # ADD TIMEZONE HERE
                start_time = self.get_last_timestamp(station_id)
                
                # Skip if already up to date
                if start_time >= end_time:
                    print(f"  ✓ Already up to date (last: {start_time})\n")
                    continue
                
                # Fetch from API
                response = self.fetch_harvest_data(source_id, start_time, end_time)
                
                if not response:
                    self.log_ingestion(station_id, start_time, 0, 0, 
                                     'FAILED', 'No response from API')
                    print(f"  ✗ Failed to fetch data\n")
                    continue
                
                # Parse response
                records = self.parse_response(station_id, response)
                
                if not records:
                    self.log_ingestion(station_id, start_time, 0, 0,
                                     'FAILED', 'No valid records parsed')
                    print(f"  ✗ No valid records\n")
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