"""
Test script for Harvest ingestion - local development
"""
import os
import sys
import json
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from backend
env_path = Path(__file__).parent.parent / "backend" / ".env"
load_dotenv(env_path)

# Import after loading env
from sqlalchemy import text
from config.harvest_stations import HARVEST_STATIONS
from sources.harvest import HarvestIngestion
from db_connection import get_ingestion_engine


def test_ingestion():
    """Run test ingestion"""
    ingester = HarvestIngestion()
    ingester.run()

def check_results():
    """Check what data was inserted"""
    engine = get_ingestion_engine()
    
    print("\n" + "="*60)
    print("Checking results...")
    print("="*60 + "\n")
    
    with engine.connect() as conn:
        # Count records per station
        result = conn.execute(text("""
            SELECT ws.station_code, wd.variable, 
                   COUNT(*) as record_count,
                   MIN(wd.timestamp) as first_record,
                   MAX(wd.timestamp) as last_record
            FROM weather_stations ws
            JOIN weather_data wd ON ws.station_id = wd.station_id
            WHERE ws.data_source = 'HARVEST'
            GROUP BY ws.station_code, wd.variable
            ORDER BY ws.station_code, wd.variable
        """))
        
        print("Data summary:")
        for row in result:
            print(f"  {row[0]} ({row[1]}): {row[2]} records")
            print(f"    First: {row[3]}")
            print(f"    Last:  {row[4]}\n")
        
        # Check ingestion log
        result = conn.execute(text("""
            SELECT data_source, status, COUNT(*) as count,
                   SUM(records_inserted) as total_records
            FROM ingestion_log
            WHERE data_source = 'HARVEST'
            GROUP BY data_source, status
        """))
        
        print("Ingestion log:")
        for row in result:
            print(f"  {row[0]} - {row[1]}: {row[2]} runs, {row[3]} total records")

if __name__ == '__main__':
 
    # Step 2: Run ingestion
    test_ingestion()
    
    # Step 3: Check results
    check_results()