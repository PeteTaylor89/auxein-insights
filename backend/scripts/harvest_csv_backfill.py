#!/usr/bin/env python3
"""
scripts/harvest_csv_backfill.py

Import historical weather data from Harvest Electronics CSV exports
into the weather_data table.

CSV Format Expected:
- First column: "Time (dd/mm/yyyy hh:mm:ss) Pacific/Auckland"
- Remaining columns: Station codes with variable suffix
  - _TEMP → 'temp' variable
  - _HUMIDITY → 'humidity' variable  
  - _PRECIP → 'rainfall' variable
  - _RADIATION → 'solar_radiation' variable

Usage:
    python scripts/harvest_csv_backfill.py --file /path/to/Barbour.csv
    python scripts/harvest_csv_backfill.py --dir /path/to/csv/folder
    python scripts/harvest_csv_backfill.py --file /path/to/data.csv --dry-run
"""

import argparse
import csv
import logging
import sys
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import pytz

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from db.session import SessionLocal
from db.models.weather import WeatherStation, WeatherData

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Timezone for parsing
NZ_TZ = pytz.timezone('Pacific/Auckland')

# Variable mapping from column suffix to database variable name
VARIABLE_MAPPING = {
    '_TEMP': 'temp',
    '_HUMIDITY': 'humidity',
    '_PRECIP': 'rainfall',
    '_RADIATION': 'solar_radiation',
}

# Units for each variable
UNITS = {
    'temp': '°C',
    'humidity': '%',
    'rainfall': 'mm',
    'solar_radiation': 'W/m²',
}


def parse_timestamp(timestamp_str: str) -> Optional[datetime]:
    """
    Parse Harvest timestamp format: "dd/mm/yyyy h:mm" or "dd/mm/yyyy hh:mm:ss"
    Returns timezone-aware datetime in Pacific/Auckland.
    """
    formats = [
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M",
        "%d/%m/%Y %I:%M:%S %p",
        "%d/%m/%Y %I:%M %p",
    ]
    
    for fmt in formats:
        try:
            naive_dt = datetime.strptime(timestamp_str.strip(), fmt)
            return NZ_TZ.localize(naive_dt)
        except ValueError:
            continue
    
    return None


def extract_station_and_variable(column_name: str) -> Optional[Tuple[str, str]]:
    """
    Extract station code and variable from column header.
    
    Database stores full station code including variable suffix.
    Example: "HARV_BARBOUR_01_TEMP" → ("HARV_BARBOUR_01_TEMP", "temp")
    """
    for suffix, variable in VARIABLE_MAPPING.items():
        if column_name.upper().endswith(suffix):
            # Use the full column name as station_code (matches DB)
            station_code = column_name.upper()
            return (station_code, variable)
    
    return None


def parse_value(value_str: str) -> Optional[Decimal]:
    """Parse a value string to Decimal, handling empty values."""
    if not value_str or value_str.strip() == '':
        return None
    try:
        return Decimal(value_str.strip())
    except InvalidOperation:
        return None


def get_station_lookup(db) -> Dict[str, int]:
    """Build lookup of station_code → station_id from database."""
    stations = db.query(WeatherStation).filter(
        WeatherStation.data_source == 'HARVEST',
        WeatherStation.is_active == True
    ).all()
    
    # Use uppercase keys for case-insensitive matching
    return {s.station_code.upper(): s.station_id for s in stations}


def process_csv_file(
    db,
    filepath: Path,
    station_lookup: Dict[str, int],
    dry_run: bool = False,
    batch_size: int = 1000
) -> Dict[str, any]:
    """
    Process a single CSV file and insert records into weather_data.
    
    Returns dict with processing statistics.
    """
    stats = {
        'rows_processed': 0,
        'records_inserted': 0,
        'records_skipped': 0,
        'unknown_stations': set(),
        'parse_errors': 0,
    }
    
    logger.info(f"Processing: {filepath.name}")
    
    with open(filepath, 'r', encoding='utf-8-sig') as f:
        reader = csv.reader(f)
        
        # Parse header row
        header = next(reader)
        
        # Build column mapping: index → (station_code, variable)
        column_map = {}
        for idx, col in enumerate(header[1:], start=1):
            parsed = extract_station_and_variable(col)
            if parsed:
                station_code, variable = parsed
                if station_code in station_lookup:
                    column_map[idx] = {
                        'station_id': station_lookup[station_code],
                        'station_code': station_code,
                        'variable': variable,
                        'unit': UNITS.get(variable, ''),
                    }
                else:
                    stats['unknown_stations'].add(station_code)
        
        if not column_map:
            logger.warning(f"  ⚠️  No valid columns found in {filepath.name}")
            return stats
        
        unique_stations = len(set(c['station_code'] for c in column_map.values()))
        logger.info(f"  Found {len(column_map)} data columns from {unique_stations} stations")
        
        # Process data rows
        batch = []
        
        for row in reader:
            stats['rows_processed'] += 1
            
            # Parse timestamp
            timestamp = parse_timestamp(row[0])
            if not timestamp:
                stats['parse_errors'] += 1
                continue
            
            # Extract values for each column
            for idx, col_info in column_map.items():
                if idx >= len(row):
                    continue
                    
                value = parse_value(row[idx])
                if value is None:
                    continue
                
                record = WeatherData(
                    station_id=col_info['station_id'],
                    timestamp=timestamp,
                    variable=col_info['variable'],
                    value=value,
                    unit=col_info['unit'],
                    quality='GOOD',
                )
                batch.append(record)
            
            # Insert batch when full
            if len(batch) >= batch_size:
                if not dry_run:
                    inserted = insert_batch(db, batch)
                    stats['records_inserted'] += inserted
                    stats['records_skipped'] += len(batch) - inserted
                else:
                    stats['records_inserted'] += len(batch)
                batch = []
                
                # Progress indicator
                if stats['rows_processed'] % 10000 == 0:
                    logger.info(f"  Processed {stats['rows_processed']:,} rows...")
        
        # Insert remaining batch
        if batch:
            if not dry_run:
                inserted = insert_batch(db, batch)
                stats['records_inserted'] += inserted
                stats['records_skipped'] += len(batch) - inserted
            else:
                stats['records_inserted'] += len(batch)
    
    return stats


def insert_batch(db, records: List[WeatherData]) -> int:
    """
    Insert a batch of records using upsert (ON CONFLICT DO NOTHING).
    Returns count of inserted records.
    """
    if not records:
        return 0
    
    # Build values for raw SQL insert with ON CONFLICT
    values_list = []
    for r in records:
        values_list.append(
            f"({r.station_id}, "
            f"'{r.timestamp.isoformat()}', "
            f"'{r.variable}', "
            f"{r.value}, "
            f"'{r.unit}', "
            f"'{r.quality}')"
        )
    
    sql = f"""
        INSERT INTO weather_data (station_id, timestamp, variable, value, unit, quality)
        VALUES {','.join(values_list)}
        ON CONFLICT (station_id, timestamp, variable) DO NOTHING
    """
    
    try:
        result = db.execute(text(sql))
        db.commit()
        return result.rowcount
    except Exception as e:
        db.rollback()
        logger.error(f"  Batch insert error: {e}")
        return 0


def upload_harvest_csv(
    file_path: Optional[str] = None,
    dir_path: Optional[str] = None,
    dry_run: bool = False,
    batch_size: int = 1000
):
    """
    Upload Harvest weather data from CSV file(s).
    """
    db = SessionLocal()
    
    try:
        # Get station lookup
        station_lookup = get_station_lookup(db)
        logger.info(f"Found {len(station_lookup)} active Harvest stations in database")
        
        # Collect files to process
        files = []
        
        if file_path:
            fp = Path(file_path)
            if not fp.exists():
                logger.error(f"File not found: {file_path}")
                return
            files.append(fp)
        
        elif dir_path:
            dp = Path(dir_path)
            if not dp.exists():
                logger.error(f"Directory not found: {dir_path}")
                return
            files = list(dp.glob('*.csv'))
            files.sort(key=lambda x: x.name)
        
        if not files:
            logger.error("No CSV files found to process")
            return
        
        logger.info(f"Found {len(files)} CSV file(s) to process")
        if dry_run:
            logger.info("[DRY RUN MODE]")
        
        # Process each file
        totals = {
            'files_processed': 0,
            'rows_processed': 0,
            'records_inserted': 0,
            'records_skipped': 0,
            'unknown_stations': set(),
            'parse_errors': 0,
        }
        
        for filepath in files:
            stats = process_csv_file(db, filepath, station_lookup, dry_run, batch_size)
            
            totals['files_processed'] += 1
            totals['rows_processed'] += stats['rows_processed']
            totals['records_inserted'] += stats['records_inserted']
            totals['records_skipped'] += stats['records_skipped']
            totals['unknown_stations'].update(stats['unknown_stations'])
            totals['parse_errors'] += stats['parse_errors']
            
            logger.info(f"  ✓ {stats['rows_processed']:,} rows → {stats['records_inserted']:,} records")
        
        # Summary
        logger.info(f"\n{'='*60}")
        logger.info("BACKFILL SUMMARY")
        logger.info(f"{'='*60}")
        logger.info(f"Files processed:    {totals['files_processed']}")
        logger.info(f"Rows processed:     {totals['rows_processed']:,}")
        logger.info(f"Records inserted:   {totals['records_inserted']:,}")
        logger.info(f"Records skipped:    {totals['records_skipped']:,} (duplicates)")
        logger.info(f"Parse errors:       {totals['parse_errors']}")
        
        if totals['unknown_stations']:
            logger.warning(f"\n⚠️  Unknown stations (not in database):")
            for station in sorted(totals['unknown_stations']):
                logger.warning(f"    - {station}")
        
    except Exception as e:
        logger.error(f"Backfill failed: {e}")
        db.rollback()
        raise
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description='Backfill Harvest weather data from CSV files')
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--file', '-f', help='Path to a single CSV file')
    group.add_argument('--dir', '-d', help='Path to directory containing CSV files')
    parser.add_argument('--dry-run', action='store_true', help='Parse files but do not insert data')
    parser.add_argument('--batch-size', type=int, default=1000, help='Batch size for inserts')
    
    args = parser.parse_args()
    
    upload_harvest_csv(
        file_path=args.file,
        dir_path=args.dir,
        dry_run=args.dry_run,
        batch_size=args.batch_size
    )


if __name__ == '__main__':
    main()