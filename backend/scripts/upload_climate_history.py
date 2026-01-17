#!/usr/bin/env python3
"""
scripts/upload_climate_history.py

Upload monthly climate history from CSV files to climate_history_monthly table.

CSV filename must match zone name exactly (e.g., "Auckland.csv" for zone "Auckland").

Usage:
    # Upload single zone
    python scripts/upload_climate_history.py --file /path/to/Auckland.csv
    
    # Upload all CSVs in directory
    python scripts/upload_climate_history.py --dir /path/to/history_csvs/
    
    # Dry run (preview without inserting)
    python scripts/upload_climate_history.py --dir /path/to/csvs/ --dry-run
    
    # Clear existing data for zone before upload
    python scripts/upload_climate_history.py --file Auckland.csv --clear
"""

import argparse
import csv
import logging
import sys
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Optional

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from db.session import SessionLocal
from db.models.climate import ClimateZone, ClimateHistoryMonthly

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def parse_decimal(value: str) -> Optional[Decimal]:
    """Parse string to Decimal, handling empty/null values."""
    if value is None or value.strip() == '':
        return None
    try:
        return Decimal(value.strip())
    except:
        return None


def get_zone_name_from_filename(filepath: Path) -> str:
    """Extract zone name from CSV filename (e.g., 'Auckland.csv' -> 'Auckland')."""
    return filepath.stem  # filename without extension


def upload_history_file(
    db,
    filepath: Path,
    dry_run: bool = False,
    clear_existing: bool = False
) -> dict:
    """
    Upload a single history CSV file.
    
    Returns dict with counts: {'inserted': N, 'skipped': N, 'errors': N}
    """
    zone_name = get_zone_name_from_filename(filepath)
    logger.info(f"Processing: {filepath.name} (zone: {zone_name})")
    
    # Find zone by name
    zone = db.query(ClimateZone).filter(ClimateZone.name == zone_name).first()
    if not zone:
        logger.error(f"  ❌ Zone '{zone_name}' not found in database. Skipping file.")
        return {'inserted': 0, 'skipped': 0, 'errors': 1}
    
    logger.info(f"  Found zone: {zone.name} (id: {zone.id})")
    
    # Optionally clear existing data
    if clear_existing and not dry_run:
        deleted = db.query(ClimateHistoryMonthly).filter(
            ClimateHistoryMonthly.zone_id == zone.id
        ).delete()
        db.commit()
        logger.info(f"  Cleared {deleted} existing records")
    
    # Read and parse CSV
    results = {'inserted': 0, 'skipped': 0, 'errors': 0}
    
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        
        rows_to_insert = []
        
        for row_num, row in enumerate(reader, start=2):  # start=2 because row 1 is header
            try:
                # Parse date
                date_str = row['date'].strip()
                date = datetime.strptime(date_str, '%Y-%m-%d').date()
                month = date.month
                year = date.year
                vintage_year = int(row['vintage_year'])
                
                # Create record
                record = ClimateHistoryMonthly(
                    zone_id=zone.id,
                    date=date,
                    month=month,
                    year=year,
                    vintage_year=vintage_year,
                    tmean_mean=parse_decimal(row.get('mean_Tmean')),
                    tmean_sd=parse_decimal(row.get('sd_Tmean')),
                    tmin_mean=parse_decimal(row.get('mean_Tmin')),
                    tmin_sd=parse_decimal(row.get('sd_Tmin')),
                    tmax_mean=parse_decimal(row.get('mean_Tmax')),
                    tmax_sd=parse_decimal(row.get('sd_Tmax')),
                    gdd_mean=parse_decimal(row.get('mean_GDD10')),
                    gdd_sd=parse_decimal(row.get('sd_GDD10')),
                    rain_mean=parse_decimal(row.get('mean_Rain')),
                    rain_sd=parse_decimal(row.get('sd_Rain')),
                    solar_mean=parse_decimal(row.get('mean_Solar')),
                    solar_sd=parse_decimal(row.get('sd_Solar')),
                )
                rows_to_insert.append(record)
                
            except Exception as e:
                logger.warning(f"  Row {row_num}: Error parsing - {e}")
                results['errors'] += 1
        
        logger.info(f"  Parsed {len(rows_to_insert)} records")
        
        if dry_run:
            logger.info(f"  [DRY RUN] Would insert {len(rows_to_insert)} records")
            results['inserted'] = len(rows_to_insert)
        else:
            # Bulk insert
            try:
                db.bulk_save_objects(rows_to_insert)
                db.commit()
                results['inserted'] = len(rows_to_insert)
                logger.info(f"  ✅ Inserted {len(rows_to_insert)} records")
            except Exception as e:
                db.rollback()
                logger.error(f"  ❌ Insert failed: {e}")
                results['errors'] += len(rows_to_insert)
    
    return results


def upload_climate_history(
    file_path: Optional[str] = None,
    dir_path: Optional[str] = None,
    dry_run: bool = False,
    clear_existing: bool = False
):
    """
    Upload climate history from CSV file(s).
    
    Args:
        file_path: Path to single CSV file
        dir_path: Path to directory containing CSV files
        dry_run: If True, preview without inserting
        clear_existing: If True, delete existing records before insert
    """
    db = SessionLocal()
    
    try:
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
            # Get all CSV files (exclude projections files)
            files = [f for f in dp.glob('*.csv') if '_projections' not in f.name.lower()]
            files.sort(key=lambda x: x.name)
        
        if not files:
            logger.error("No CSV files found to process")
            return
        
        logger.info(f"Found {len(files)} history CSV files to process")
        if dry_run:
            logger.info("[DRY RUN MODE]")
        
        # Process each file
        totals = {'inserted': 0, 'skipped': 0, 'errors': 0}
        
        for filepath in files:
            results = upload_history_file(db, filepath, dry_run, clear_existing)
            totals['inserted'] += results['inserted']
            totals['skipped'] += results['skipped']
            totals['errors'] += results['errors']
        
        # Summary
        logger.info(f"\n{'='*50}")
        logger.info(f"UPLOAD COMPLETE")
        logger.info(f"  Files processed: {len(files)}")
        logger.info(f"  Records inserted: {totals['inserted']}")
        logger.info(f"  Records skipped: {totals['skipped']}")
        logger.info(f"  Errors: {totals['errors']}")
        
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        db.rollback()
        raise
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Upload climate history CSV files")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--file", help="Path to single CSV file")
    group.add_argument("--dir", help="Path to directory containing CSV files")
    parser.add_argument("--dry-run", action="store_true", help="Preview without inserting")
    parser.add_argument("--clear", action="store_true", help="Clear existing data before upload")
    
    args = parser.parse_args()
    
    upload_climate_history(
        file_path=args.file,
        dir_path=args.dir,
        dry_run=args.dry_run,
        clear_existing=args.clear
    )


if __name__ == "__main__":
    main()