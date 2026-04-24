"""
Setup script for Harvest Electronics weather stations.

Checks config against the database and inserts only new stations.
Safe to re-run — existing stations are skipped.

Usage:
    python setup_harvest_stations.py --dry-run   # Preview what would be inserted
    python setup_harvest_stations.py             # Insert new stations only
"""

import sys
import argparse
import json
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent))

from sqlalchemy import text
from ingestion.db_connection import get_ingestion_session
from ingestion.config.harvest_stations import HARVEST_STATIONS


def setup_harvest_stations(dry_run: bool = False):
    """Check for new Harvest stations in config and add them to the database."""

    if dry_run:
        print("\n" + "=" * 60)
        print("DRY RUN - No changes will be made to the database")
        print("=" * 60)

    Session = get_ingestion_session()

    with Session() as session:
        created = 0
        skipped = 0
        errors = 0

        # Get all existing Harvest station codes in one query
        result = session.execute(text("""
            SELECT station_code FROM weather_stations
            WHERE data_source = 'HARVEST'
        """))
        existing_codes = {row[0] for row in result}

        print(f"\nConfig has {len(HARVEST_STATIONS)} stations, "
            f"{len(existing_codes)} already in database\n")

        for config in HARVEST_STATIONS:
            station_code = config['station_code']

            if station_code in existing_codes:
                skipped += 1
                continue

            # Validate required fields
            if config.get('latitude') is None or config.get('longitude') is None:
                print(f"  ⚠ {station_code}: missing coordinates, skipping")
                errors += 1
                continue

            if config.get('source_id') is None:
                print(f"  ⚠ {station_code}: missing source_id (trace ID), skipping")
                errors += 1
                continue

            notes_json = json.dumps(config.get('notes', {}))

            params = {
                'code': station_code,
                'name': config['station_name'],
                'source_id': config['source_id'],
                'lat': config['latitude'],
                'lon': config['longitude'],
                'elevation': config.get('elevation'),
                'region': config.get('region'),
                'zone_id': config.get('zone_id'),
                'notes': notes_json,
                'api_credential_ref': config.get('api_credential_ref'),
            }

            if dry_run:
                print(f"  Would create: {station_code}")
                print(f"    Name:    {config['station_name']}")
                print(f"    Trace:   {config['source_id']}")
                print(f"    Region:  {config.get('region')}")
                print(f"    Zone ID: {config.get('zone_id')}")
                print(f"    Coords:  {config['latitude']}, {config['longitude']}")
                print(f"    Elev:    {config.get('elevation')}")
                print(f"    Cred:    {config.get('api_credential_ref') or '(default)'}")
                created += 1
            else:
                try:
                    session.execute(text("""
                        INSERT INTO weather_stations
                            (station_code, station_name, data_source, source_id,
                            latitude, longitude, elevation, location,
                            region, zone_id, notes, is_active, api_credential_ref)
                        VALUES
                            (:code, :name, 'HARVEST', :source_id,
                            :lat, :lon, :elevation,
                            ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                            :region, :zone_id, CAST(:notes AS jsonb), true,
                            :api_credential_ref)
                    """), params)
                    session.commit()
                    print(f"  ✓ Created: {station_code} ({config['station_name']})")
                    created += 1
                except Exception as e:
                    print(f"  ✗ Error creating {station_code}: {e}")
                    session.rollback()
                    errors += 1

        # Summary
        print("\n" + "=" * 60)
        print("DRY RUN SUMMARY" if dry_run else "SETUP COMPLETE")
        print("=" * 60)
        print(f"  New:     {created}")
        print(f"  Skipped: {skipped} (already in DB)")
        print(f"  Errors:  {errors}")
        print(f"  Total:   {len(HARVEST_STATIONS)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description='Setup Harvest weather stations — inserts new stations only'
    )
    parser.add_argument(
        '--dry-run', action='store_true',
        help='Preview new stations without writing to database'
    )
    args = parser.parse_args()

    setup_harvest_stations(dry_run=args.dry_run)
