"""
One-time script to create MDC station records in database

Usage:
    python setup_mdc_stations.py --dry-run   # Preview what would be inserted
    python setup_mdc_stations.py             # Actually insert records
"""

import sys
import argparse
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))
import json

from sqlalchemy import text
from ingestion.db_connection import get_ingestion_session
from ingestion.config.mdc_sites import MDC_SITES


def setup_mdc_stations(dry_run: bool = False):
    """Create MDC weather station records"""
    
    if dry_run:
        print("\n" + "=" * 60)
        print("DRY RUN - No changes will be made to the database")
        print("=" * 60)
    
    Session = get_ingestion_session()
    
    with Session() as session:
        created = 0
        skipped = 0
        errors = 0
        
        for station_code, config in MDC_SITES.items():
            try:
                print(f"\nProcessing {station_code}...")
                
                # Validate required fields
                if config.get('lat') is None or config.get('lon') is None:
                    print(f"  ⚠ Warning: Missing coordinates for {station_code}")
                    if not dry_run:
                        print(f"  Skipping - coordinates required for database insert")
                        skipped += 1
                        continue
                
                # Check if station already exists
                result = session.execute(text("""
                    SELECT station_id FROM weather_stations 
                    WHERE station_code = :code AND data_source = 'MDC'
                """), {'code': station_code})
                
                if result.fetchone():
                    print(f"  Station {station_code} already exists, skipping...")
                    skipped += 1
                    continue
                
                # Build notes JSON
                notes_dict = {
                    "name": config['name'],
                    "site_name": config['site_name'],  # Exact API site name
                    "collection": config['collection'],
                    "measurements": config['measurements'],
                    "subregion": config.get('subregion', ''),
                }
                notes_json = json.dumps(notes_dict)
                
                # Build params dict
                params = {
                    'code': station_code,
                    'name': config['name'],
                    'site_name': config['site_name'],  # Used as source_id for API queries
                    'lat': config['lat'],
                    'lon': config['lon'],
                    'elevation': config.get('elevation'),
                    'region': config['region'],
                    'notes': notes_json
                }
                
                if dry_run:
                    print(f"  Would create station:")
                    print(f"    Code: {station_code}")
                    print(f"    Name: {config['name']}")
                    print(f"    Site (API): {config['site_name']}")
                    print(f"    Collection: {config['collection']}")
                    print(f"    Region: {config['region']}")
                    print(f"    Coords: {config.get('lat')}, {config.get('lon')}")
                    print(f"    Measurements: {config['measurements']}")
                    created += 1
                else:
                    # Insert new station with PostGIS POINT geometry
                    session.execute(text("""
                        INSERT INTO weather_stations 
                            (station_code, station_name, data_source, source_id, 
                             latitude, longitude, elevation, location, region, notes, is_active)
                        VALUES 
                            (:code, :name, 'MDC', :site_name, :lat, :lon, :elevation,
                             ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                             :region, CAST(:notes AS jsonb), true)
                    """), params)
                    
                    session.commit()
                    print(f"  ✓ Created station: {station_code} ({config['name']})")
                    created += 1
                
            except Exception as e:
                print(f"  ✗ Error creating station {station_code}: {e}")
                import traceback
                traceback.print_exc()
                if not dry_run:
                    session.rollback()
                errors += 1
                continue
        
        # Summary
        print("\n" + "=" * 60)
        if dry_run:
            print("DRY RUN SUMMARY")
        else:
            print("SETUP COMPLETE")
        print("=" * 60)
        print(f"  Created: {created}")
        print(f"  Skipped: {skipped}")
        print(f"  Errors:  {errors}")
        print(f"  Total:   {len(MDC_SITES)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Setup MDC weather stations in database')
    parser.add_argument('--dry-run', action='store_true', 
                        help='Preview changes without writing to database')
    args = parser.parse_args()
    
    setup_mdc_stations(dry_run=args.dry_run)