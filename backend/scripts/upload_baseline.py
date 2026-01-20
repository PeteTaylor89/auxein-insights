#!/usr/bin/env python3
"""
scripts/upload_baseline.py

Upload 1986-2005 daily climatology data into climate_zone_daily_baseline table.

CSV Format Expected (one file per zone, named {ZoneName}_daily_climatology_1986_2005.csv):
    date,doy_vintage,mean_Tmean,sd_Tmean,mean_Tmin,sd_Tmin,mean_Tmax,sd_Tmax,
    mean_GDD10,sd_GDD10,mean_GDD0,sd_GDD0,mean_Rain,sd_Rain,mean_Solar,sd_Solar

Usage:
    python scripts/upload_baseline.py --file /path/to/Auckland_daily_climatology_1986_2005.csv --zone-name Auckland
    python scripts/upload_baseline.py --dir /path/to/baseline_csvs/
    python scripts/upload_baseline.py --file /path/to/data.csv --zone-name Auckland --dry-run
    python scripts/upload_baseline.py --file /path/to/data.csv --zone-name Auckland --clear
"""

import argparse
import csv
import logging
import re
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Dict, List, Optional

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from db.session import SessionLocal
from db.models.climate import ClimateZone
from db.models.realtime_climate import ClimateZoneDailyBaseline

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def parse_decimal(value_str: str) -> Optional[Decimal]:
    """Parse a value string to Decimal, handling empty values."""
    if not value_str or value_str.strip() == '':
        return None
    try:
        return Decimal(value_str.strip())
    except InvalidOperation:
        return None


def extract_zone_name_from_filename(filename: str) -> Optional[str]:
    """
    Extract zone name from filename.
    Expected: {ZoneName}_daily_climatology_1986_2005.csv
    Handles spaces in zone names like "Central Otago", "Hawkes Bay", etc.
    """
    match = re.match(r'^(.+?)_daily_climatology', filename)
    if match:
        return match.group(1)  # Keep spaces as-is
    return None


def get_zone_lookup(db) -> Dict[str, int]:
    """
    Build lookup of zone_name → zone_id from database.
    Uses case-insensitive matching and handles various formats.
    """
    zones = db.query(ClimateZone).filter(ClimateZone.is_active == True).all()
    
    lookup = {}
    for zone in zones:
        # Store multiple variations for matching
        lookup[zone.name.lower()] = zone.id
        lookup[zone.name.lower().replace(' ', '_')] = zone.id
        lookup[zone.name.lower().replace(' ', '')] = zone.id
        # Also store slug if available
        if zone.slug:
            lookup[zone.slug.lower()] = zone.id
    
    return lookup


def load_baseline_csv(filepath: Path) -> List[dict]:
    """
    Load daily baseline data from CSV file.
    
    Returns list of dicts ready for database insertion (without zone_id).
    """
    records = []
    cumulative_gdd_base0 = Decimal('0')
    
    with open(filepath, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        
        for row in reader:
            doy = int(row.get('doy_vintage', 0))
            
            if doy < 1 or doy > 366:
                continue
            
            # Parse daily GDD
            gdd_base0_daily = parse_decimal(row.get('mean_GDD0', '')) or Decimal('0')
            gdd_base10_daily = parse_decimal(row.get('mean_GDD10', '')) or Decimal('0')
            
            # Accumulate GDD (reset on day 1)
            if doy == 1:
                cumulative_gdd_base0 = gdd_base0_daily
            else:
                cumulative_gdd_base0 += gdd_base0_daily
            
            record = {
                'day_of_vintage': doy,
                'tmean_avg': parse_decimal(row.get('mean_Tmean', '')),
                'tmean_sd': parse_decimal(row.get('sd_Tmean', '')),
                'tmin_avg': parse_decimal(row.get('mean_Tmin', '')),
                'tmin_sd': parse_decimal(row.get('sd_Tmin', '')),
                'tmax_avg': parse_decimal(row.get('mean_Tmax', '')),
                'tmax_sd': parse_decimal(row.get('sd_Tmax', '')),
                'gdd_base0_avg': gdd_base0_daily,
                'gdd_base0_sd': parse_decimal(row.get('sd_GDD0', '')),
                'gdd_base10_avg': gdd_base10_daily,
                'gdd_base10_sd': parse_decimal(row.get('sd_GDD10', '')),
                'gdd_base0_cumulative_avg': cumulative_gdd_base0,
                'gdd_base0_cumulative_sd': None,
                'rain_avg': parse_decimal(row.get('mean_Rain', '')),
                'rain_sd': parse_decimal(row.get('sd_Rain', '')),
                'solar_avg': parse_decimal(row.get('mean_Solar', '')),
                'solar_sd': parse_decimal(row.get('sd_Solar', '')),
            }
            
            records.append(record)
    
    return records


def upload_baseline_file(
    db,
    filepath: Path,
    zone_name: Optional[str],
    zone_lookup: Dict[str, int],
    dry_run: bool = False,
    clear_existing: bool = False
) -> Dict[str, any]:
    """Upload a single baseline CSV file."""
    
    # Determine zone name
    if not zone_name:
        zone_name = extract_zone_name_from_filename(filepath.name)
    
    if not zone_name:
        return {'error': f"Could not determine zone name from filename: {filepath.name}"}
    
    logger.info(f"Processing: {filepath.name} (zone: {zone_name})")
    
    # Look up zone ID - try multiple variations
    zone_id = None
    zone_key = zone_name.lower()
    
    # Try exact match, underscore version, no-space version
    for variant in [zone_key, zone_key.replace(' ', '_'), zone_key.replace(' ', '')]:
        if variant in zone_lookup:
            zone_id = zone_lookup[variant]
            break
    
    if not zone_id:
        return {'error': f"Zone not found in database: {zone_name}"}
    
    logger.info(f"  Found zone: {zone_name} (id: {zone_id})")
    
    # Optionally clear existing data
    if clear_existing and not dry_run:
        deleted = db.query(ClimateZoneDailyBaseline).filter(
            ClimateZoneDailyBaseline.zone_id == zone_id
        ).delete()
        db.commit()
        logger.info(f"  Cleared {deleted} existing records")
    
    # Load CSV
    records = load_baseline_csv(filepath)
    
    if not records:
        return {'error': f"No records found in file: {filepath.name}"}
    
    logger.info(f"  Parsed {len(records)} days of baseline data")
    
    if dry_run:
        logger.info(f"  [DRY RUN] Would insert {len(records)} records")
        return {
            'zone_name': zone_name,
            'zone_id': zone_id,
            'days_loaded': len(records),
            'records_inserted': len(records),
        }
    
    # Insert records
    count = 0
    for record in records:
        # Check if exists
        existing = db.query(ClimateZoneDailyBaseline).filter(
            ClimateZoneDailyBaseline.zone_id == zone_id,
            ClimateZoneDailyBaseline.day_of_vintage == record['day_of_vintage']
        ).first()
        
        if existing:
            # Update
            for key, value in record.items():
                setattr(existing, key, value)
        else:
            # Insert
            new_record = ClimateZoneDailyBaseline(
                zone_id=zone_id,
                **record
            )
            db.add(new_record)
        
        count += 1
    
    db.commit()
    logger.info(f"  ✅ Inserted {count} records")
    
    return {
        'zone_name': zone_name,
        'zone_id': zone_id,
        'days_loaded': len(records),
        'records_inserted': count,
    }


def upload_baseline_climatology(
    file_path: Optional[str] = None,
    dir_path: Optional[str] = None,
    zone_name: Optional[str] = None,
    dry_run: bool = False,
    clear_existing: bool = False
):
    """
    Upload daily baseline climatology from CSV file(s).
    """
    db = SessionLocal()
    
    try:
        # Get zone lookup
        zone_lookup = get_zone_lookup(db)
        logger.info(f"Found {len(zone_lookup) // 2} climate zones in database")
        
        if dry_run:
            logger.info("[DRY RUN MODE]")
        
        # Collect files to process
        files_to_process = []
        
        if file_path:
            files_to_process.append((Path(file_path), zone_name))
        
        elif dir_path:
            dp = Path(dir_path)
            if not dp.exists():
                logger.error(f"Directory not found: {dir_path}")
                return
            for csv_file in dp.glob('*_daily_climatology*.csv'):
                files_to_process.append((csv_file, None))  # Zone name from filename
        
        if not files_to_process:
            logger.error("No files found to process")
            return
        
        logger.info(f"Found {len(files_to_process)} file(s) to process")
        
        # Process each file
        results = []
        for filepath, zn in files_to_process:
            result = upload_baseline_file(
                db, filepath, zn, zone_lookup, dry_run, clear_existing
            )
            
            if 'error' in result:
                logger.error(f"  ❌ {result['error']}")
            
            results.append(result)
        
        # Summary
        logger.info(f"\n{'='*60}")
        logger.info("UPLOAD SUMMARY")
        logger.info(f"{'='*60}")
        
        successful = [r for r in results if 'error' not in r]
        failed = [r for r in results if 'error' in r]
        
        logger.info(f"Zones processed:   {len(successful)}")
        logger.info(f"Failed:            {len(failed)}")
        
        if successful:
            total_days = sum(r['days_loaded'] for r in successful)
            logger.info(f"Total days loaded: {total_days}")
        
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        db.rollback()
        raise
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description='Upload daily baseline climatology from CSV')
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--file', '-f', type=str, help='Path to single baseline CSV file')
    group.add_argument('--dir', '-d', type=str, help='Path to directory containing baseline CSVs')
    parser.add_argument('--zone-name', '-z', type=str, help='Zone name (required for --file if not in filename)')
    parser.add_argument('--dry-run', action='store_true', help='Parse files but do not insert data')
    parser.add_argument('--clear', action='store_true', help='Clear existing data before upload')
    
    args = parser.parse_args()
    
    upload_baseline_climatology(
        file_path=args.file,
        dir_path=args.dir,
        zone_name=args.zone_name,
        dry_run=args.dry_run,
        clear_existing=args.clear
    )


if __name__ == '__main__':
    main()