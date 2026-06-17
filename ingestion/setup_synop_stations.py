"""One-time script to create SYNOP (WMO/Unidata) station records in the database.

Phase B1 of NOAA_NCEI_INGESTION_SCOPE.md. Seeds all 54 active NZ SYNOP stations
as ADDITIVE devices (data_source='SYNOP_GTS') — never touches council / Harvest
rows. In-zone stations get zone_id + contributes_to_regional=true; national-
context stations get zone_id NULL, region NULL, contributes_to_regional=false
(per the locked decision).

Usage:
    python setup_synop_stations.py --dry-run   # Preview
    python setup_synop_stations.py             # Insert
"""

import sys
import argparse
import json
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent))

# Windows consoles default to cp1252; the status glyphs (✓/✗/⚠) below would
# raise UnicodeEncodeError. Force UTF-8 stdout where supported.
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

from sqlalchemy import text
from ingestion.db_connection import get_ingestion_session
from ingestion.config.synop_sites import SYNOP_SITES

DATA_SOURCE = 'SYNOP_GTS'
COUNTRY_ISO2 = 'NZ'
CADENCE_MINUTES = 60  # SYNOP main + intermediate synoptic hours


def setup_synop_stations(dry_run: bool = False):
    if dry_run:
        print("\n" + "=" * 60)
        print("DRY RUN - No changes will be made to the database")
        print("=" * 60)

    Session = get_ingestion_session()

    with Session() as session:
        # Resolve foreign keys once.
        data_source_id = session.execute(
            text("SELECT id FROM data_sources WHERE code = :c"), {'c': DATA_SOURCE}
        ).scalar()
        if data_source_id is None:
            print(f"  ✗ data_sources row '{DATA_SOURCE}' missing — run migration add_obs_provenance first.")
            return

        country_id = session.execute(
            text("SELECT id FROM countries WHERE iso2 = :c"), {'c': COUNTRY_ISO2}
        ).scalar()

        zone_by_slug = {
            row[1]: row[0]
            for row in session.execute(text("SELECT id, slug FROM climate_zones")).fetchall()
        }

        created = skipped = errors = 0

        for station_code, cfg in SYNOP_SITES.items():
            try:
                print(f"\nProcessing {station_code} ({cfg['name']})...")

                # Idempotent: skip if already present.
                exists = session.execute(text("""
                    SELECT station_id FROM weather_stations
                    WHERE station_code = :code AND data_source = :ds
                """), {'code': station_code, 'ds': DATA_SOURCE}).fetchone()
                if exists:
                    print(f"  Already exists, skipping.")
                    skipped += 1
                    continue

                zone_slug = cfg.get('zone_slug')
                zone_id = zone_by_slug.get(zone_slug) if zone_slug else None
                if zone_slug and zone_id is None:
                    print(f"  ⚠ zone_slug '{zone_slug}' not found in climate_zones — leaving zone NULL.")
                contributes = bool(cfg.get('contributes_to_regional') and zone_id is not None)

                notes = json.dumps({
                    'wmo_block': cfg['wmo_block'],
                    'ghcnh_id': cfg.get('ghcnh_id'),
                    'ghcnd_id': cfg.get('ghcnd_id'),
                    'icao': cfg.get('icao'),
                    'measurements': cfg['measurements'],
                    'source_network': 'WMO SYNOP via Unidata IDD/GTS',
                })

                params = {
                    'code': station_code,
                    'name': cfg['name'],
                    'source_id': cfg['wmo_block'],
                    'lat': cfg['lat'],
                    'lon': cfg['lon'],
                    'elevation': int(cfg['elevation']) if cfg.get('elevation') is not None else None,
                    'region': cfg.get('region'),
                    'zone_id': zone_id,
                    'data_source_id': data_source_id,
                    'country_id': country_id,
                    'contributes': contributes,
                    'cadence': CADENCE_MINUTES,
                    'notes': notes,
                }

                if dry_run:
                    print(f"  Would create: WMO {cfg['wmo_block']} | ghcnh={cfg.get('ghcnh_id')} "
                          f"ghcnd={cfg.get('ghcnd_id')} | zone={zone_slug or '-'}({zone_id}) "
                          f"region={cfg.get('region') or '-'} contributes={contributes}")
                    created += 1
                    continue

                session.execute(text("""
                    INSERT INTO weather_stations
                        (station_code, station_name, data_source, source_id,
                         latitude, longitude, elevation, location, region, zone_id, notes, is_active,
                         device_class, data_source_id, country_id,
                         ingest_cadence_minutes, visibility, contributes_to_regional,
                         is_high_resolution, timezone)
                    VALUES
                        (:code, :name, 'SYNOP_GTS', :source_id,
                         :lat, :lon, :elevation,
                         ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                         :region, :zone_id, CAST(:notes AS jsonb), true,
                         'weather_station', :data_source_id, :country_id,
                         :cadence, 'public', :contributes,
                         false, 'Pacific/Auckland')
                """), params)
                session.commit()
                print(f"  ✓ Created (zone={zone_slug or 'NULL'}, contributes={contributes})")
                created += 1

            except Exception as e:
                print(f"  ✗ Error: {e}")
                import traceback; traceback.print_exc()
                if not dry_run:
                    session.rollback()
                errors += 1
                continue

        print("\n" + "=" * 60)
        print("DRY RUN SUMMARY" if dry_run else "SETUP COMPLETE")
        print("=" * 60)
        print(f"  Created: {created}")
        print(f"  Skipped: {skipped}")
        print(f"  Errors:  {errors}")
        print(f"  Total:   {len(SYNOP_SITES)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Setup SYNOP weather stations in database')
    parser.add_argument('--dry-run', action='store_true', help='Preview without writing')
    args = parser.parse_args()
    setup_synop_stations(dry_run=args.dry_run)
