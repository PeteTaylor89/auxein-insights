"""
Standalone script for GitHub Actions ingestion
"""
import os
import sys
import json
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from sqlalchemy import text
from config.harvest_stations import HARVEST_STATIONS
from sources.harvest import HarvestIngestion  
from db_connection import get_ingestion_engine

def main():
    print("=" * 60)
    print("Setting up Harvest stations on AWS...")
    print("=" * 60)
    
    engine = get_ingestion_engine()
    
    # Setup stations
    with engine.connect() as conn:
        for station in HARVEST_STATIONS:
            try:
                result = conn.execute(
                    text('''
                        INSERT INTO weather_stations
                            (station_code, station_name, data_source, source_id,
                             latitude, longitude, elevation, location, region, notes, is_active)
                        VALUES (:code, :name, :source, :source_id, :lat, :lon, :elev,
                                ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                                :region, CAST(:notes AS jsonb), true)
                        ON CONFLICT (station_code) 
                        DO UPDATE SET
                            station_name = EXCLUDED.station_name,
                            source_id = EXCLUDED.source_id,
                            latitude = EXCLUDED.latitude,
                            longitude = EXCLUDED.longitude,
                            elevation = EXCLUDED.elevation,
                            location = EXCLUDED.location,
                            region = EXCLUDED.region,
                            notes = EXCLUDED.notes,
                            updated_at = NOW()
                        RETURNING station_id
                    '''),
                    {
                        'code': station['station_code'],
                        'name': station['station_name'],
                        'source': station['data_source'],
                        'source_id': station['source_id'],
                        'lat': station['latitude'],
                        'lon': station['longitude'],
                        'elev': station.get('elevation'),
                        'region': station['region'],
                        'notes': json.dumps(station.get('notes', {}))
                    }
                )
                station_id = result.fetchone()[0]
                print(f"  ✓ {station['station_code']} (ID: {station_id})")
            except Exception as e:
                print(f"  ✗ Failed to setup {station['station_code']}: {e}")
        
        conn.commit()
    
    print(f"\n✓ Station setup complete: {len(HARVEST_STATIONS)} stations\n")
    
    # Run ingestion
    print("=" * 60)
    print("Starting Harvest data ingestion...")
    print("=" * 60)
    
    ingester = HarvestIngestion()
    ingester.run()
    
    print("\n✓ Ingestion workflow complete")

if __name__ == '__main__':
    main()