"""
ECAN (Environment Canterbury) weather data ingestion
"""

import requests
from datetime import datetime, timezone, timedelta
import pytz
from typing import List, Dict, Optional
from sqlalchemy import text
import logging
import sys
from pathlib import Path
import os

# Import our DB connection utility (same as Harvest)
sys.path.insert(0, str(Path(__file__).parent.parent))
from db_connection import get_ingestion_session

from config.ecan_sites import ECAN_SITES, ECAN_API_BASE, ECAN_ENDPOINTS, ECAN_PERIODS

logger = logging.getLogger(__name__)

class ECANIngestion:
    def __init__(self):
        self.data_source = 'ECAN'
        self.nz_tz = pytz.timezone('Pacific/Auckland')
        
        # Database connection (same pattern as Harvest)
        self.Session = get_ingestion_session()
    
    def get_active_sites(self):
        """Get all active ECAN sites from database"""
        with self.Session() as session:
            result = session.execute(text("""
                SELECT station_id, station_code, source_id, notes
                FROM weather_stations
                WHERE data_source = :source AND is_active = true
                ORDER BY station_code
            """), {'source': self.data_source})
            return result.fetchall()
    
    def fetch_site_data(self, site_no: str, variable: str, period: str = '2_Days') -> List[Dict]:
        """
        Fetch data for a single site and variable
        
        Args:
            site_no: ECAN site number (e.g., '237101')
            variable: Variable type ('rainfall', 'temperature', etc.)
            period: 'All' for backfill, '2_Days' for incremental
        
        Returns:
            List of data records
        """
        if variable not in ECAN_ENDPOINTS:
            logger.warning(f"Unknown variable type: {variable}")
            return []
        
        endpoint = ECAN_ENDPOINTS[variable]
        url = f"{ECAN_API_BASE}{endpoint}/JSON"
        
        params = {
            'SiteNo': site_no,
            'Period': period,
            'zip': '0'  # No compression for JSON
        }
        
        try:
            logger.info(f"Fetching ECAN data: site={site_no}, variable={variable}, period={period}")
            response = requests.get(url, params=params, timeout=30)
            response.raise_for_status()
            
            data = response.json()
            items = data.get('data', {}).get('item', [])
            
            logger.info(f"Retrieved {len(items)} records for site {site_no}")
            return items
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching ECAN data for site {site_no}: {e}")
            return []
        except Exception as e:
            logger.error(f"Unexpected error processing ECAN data for site {site_no}: {e}")
            return []
    
    def parse_timestamp(self, dt_string: str) -> datetime:
        """
        Parse ECAN timestamp (already timezone-aware)
        Example: "2026-01-13T15:00:00+13:00"
        """
        dt = datetime.fromisoformat(dt_string)
        # Ensure it's in NZ timezone
        if dt.tzinfo is None:
            dt = self.nz_tz.localize(dt)
        return dt
    
    def normalize_variable_name(self, raw_name: str) -> str:
        """
        Normalize ECAN variable names to standard format
        """
        mapping = {
            'RainfallTotal': 'rainfall',
            # Add more as discovered:
            # 'Temperature': 'temperature',
            # 'SolarRadiation': 'solar_radiation',
        }
        return mapping.get(raw_name, raw_name.lower())
    
    def transform_records(self, raw_records: List[Dict], station_id: str) -> List[Dict]:
        """
        Transform ECAN records to standard format matching Harvest
        
        Returns list of dicts compatible with weather_data table
        """
        transformed = []
        
        for record in raw_records:
            try:
                timestamp = self.parse_timestamp(record['DateTime'])
                
                # ECAN returns one variable per endpoint
                # Find which field has the value (exclude site_no and DateTime)
                value_keys = [k for k in record.keys() if k not in ['site_no', 'DateTime']]
                
                for key in value_keys:
                    variable = self.normalize_variable_name(key)
                    value = float(record[key])
                    
                    # Determine unit based on variable
                    unit = self._get_unit(variable)
                    
                    transformed.append({
                        'station_id': station_id,
                        'timestamp': timestamp,
                        'variable': variable,
                        'value': value,
                        'unit': unit,
                        'quality': 'good'  # ECAN doesn't provide quality flags
                    })
                    
            except (ValueError, KeyError) as e:
                logger.warning(f"Error transforming record: {e}, record: {record}")
                continue
        
        return transformed
    
    def _get_unit(self, variable: str) -> str:
        """Return standard unit for variable"""
        units = {
            'rainfall': 'mm',
            'temperature': 'C',
            'solar_radiation': 'MJ/m2',
            'humidity': '%',
            'pressure': 'hPa',
        }
        return units.get(variable, 'unknown')
    
    def insert_data(self, records: List[Dict]):
        """Insert weather data records into database (same as Harvest)"""
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
                            unit = EXCLUDED.unit,
                            quality = EXCLUDED.quality
                    """),
                    records
                )
                session.commit()
                return len(records)
            except Exception as e:
                session.rollback()
                logger.error(f"Database error: {e}")
                return 0
    
    def log_ingestion(self, station_id: str, start_time: datetime, 
                      records_processed: int, records_inserted: int,
                      status: str, error_msg: Optional[str] = None):
        """Log ingestion run to database (same as Harvest)"""
        with self.Session() as session:
            try:
                session.execute(text("""
                    INSERT INTO ingestion_log 
                        (data_source, station_id, start_time, end_time, 
                         records_processed, records_inserted, status, error_msg)
                    VALUES 
                        (:data_source, :station_id, :start_time, NOW(),
                         :records_processed, :records_inserted, :status, :error_msg)
                """), {
                    'data_source': self.data_source,
                    'station_id': station_id,
                    'start_time': start_time,
                    'records_processed': records_processed,
                    'records_inserted': records_inserted,
                    'status': status,
                    'error_msg': error_msg
                })
                session.commit()
            except Exception as e:
                logger.error(f"Failed to log ingestion: {e}")
    
    def run(self, period: str = 'incremental'):
        """
        Run ECAN ingestion for all active sites
        
        Args:
            period: 'incremental' (2_Days) or 'backfill' (All)
        """
        api_period = ECAN_PERIODS.get(period, '2_Days')
        
        print(f"\n{'='*60}")
        print(f"Starting ECAN ingestion at {datetime.now()}")
        print(f"Period: {api_period}")
        print(f"{'='*60}\n")
        
        active_sites = self.get_active_sites()
        
        if not active_sites:
            print("No active ECAN sites found in database")
            return
        
        print(f"Found {len(active_sites)} active ECAN sites\n")
        
        for site in active_sites:
            station_id = site[0]
            station_code = site[1]
            source_id = site[2]  # ECAN site_no
            notes = site[3]
            
            print(f"Processing: {station_code}")
            
            # Get site config to know which variables to fetch
            site_config = None
            for code, config in ECAN_SITES.items():
                if config['site_no'] == source_id:
                    site_config = config
                    break
            
            if not site_config:
                print(f"  ✗ Site config not found\n")
                continue
            
            start_time = datetime.now(timezone.utc)
            total_processed = 0
            total_inserted = 0
            
            # Fetch data for each variable
            for variable in site_config['variables']:
                try:
                    raw_records = self.fetch_site_data(source_id, variable, api_period)
                    
                    if not raw_records:
                        print(f"  - {variable}: No data returned")
                        continue
                    
                    transformed_records = self.transform_records(raw_records, station_id)
                    
                    if not transformed_records:
                        print(f"  ✗ {variable}: No valid records")
                        continue
                    
                    records_inserted = self.insert_data(transformed_records)
                    
                    total_processed += len(raw_records)
                    total_inserted += records_inserted
                    
                    print(f"  ✓ {variable}: Inserted {records_inserted} records")
                    
                except Exception as e:
                    print(f"  ✗ Error processing {variable}: {e}")
                    self.log_ingestion(
                        station_id, start_time, 0, 0, 'FAILED', str(e)
                    )
                    continue
            
            # Log overall result for this station
            if total_inserted > 0:
                self.log_ingestion(
                    station_id, start_time, total_processed, total_inserted, 'SUCCESS'
                )
                print(f"  Total: {total_inserted}/{total_processed} records\n")
            else:
                print(f"  ✗ No records inserted\n")
        
        print(f"{'='*60}")
        print(f"ECAN ingestion complete at {datetime.now()}")
        print(f"{'='*60}\n")