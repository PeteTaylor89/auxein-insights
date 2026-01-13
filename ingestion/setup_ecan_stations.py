"""
One-time script to create ECAN station records in database
"""

import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))
import json

from sqlalchemy import text
from ingestion.db_connection import get_ingestion_session
from ingestion.config.ecan_sites import ECAN_SITES

def setup_ecan_stations():
    """Create ECAN weather station records"""
    Session = get_ingestion_session()
    
    with Session() as session:
        for station_code, config in ECAN_SITES.items():
            try:
                print(f"\nProcessing {station_code}...")
                
                # Check if station already exists
                result = session.execute(text("""
                    SELECT station_id FROM weather_stations 
                    WHERE station_code = :code AND data_source = 'ECAN'
                """), {'code': station_code})
                
                if result.fetchone():
                    print(f"Station {station_code} already exists, skipping...")
                    continue
                
                # Build notes JSON
                notes_dict = {
                    "name": config['name'],
                    "variables": config['variables']
                }
                notes_json = json.dumps(notes_dict)
                
                # Build params dict
                params = {
                    'code': station_code,
                    'name': config['name'],
                    'site_no': config['site_no'],
                    'lat': config['lat'],
                    'lon': config['lon'],
                    'elevation': config.get('elevation'),
                    'region': config['region'],
                    'notes': notes_json
                }
                
                # Insert new station with PostGIS POINT geometry
                session.execute(text("""
                    INSERT INTO weather_stations 
                        (station_code, station_name, data_source, source_id, 
                         latitude, longitude, elevation, location, region, notes, is_active)
                    VALUES 
                        (:code, :name, 'ECAN', :site_no, :lat, :lon, :elevation,
                         ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                         :region, CAST(:notes AS jsonb), true)
                """), params)
                
                session.commit()
                print(f"✓ Created station: {station_code} ({config['name']})")
                
            except Exception as e:
                print(f"✗ Error creating station {station_code}: {e}")
                import traceback
                traceback.print_exc()
                session.rollback()
                continue
        
        print("\n✓ ECAN station setup complete!")


if __name__ == "__main__":
    setup_ecan_stations()