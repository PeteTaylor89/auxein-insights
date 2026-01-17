#!/usr/bin/env python3
"""
scripts/upload_climate_projections.py

Upload climate projections from CSV files to:
- climate_baseline_monthly (extracted from Baseline_* columns)
- climate_projections (SSP scenarios)

CSV filename must match zone name (e.g., "Auckland_projections.csv" for zone "Auckland").

Usage:
    # Upload single zone
    python scripts/upload_climate_projections.py --file /path/to/Auckland_projections.csv
    
    # Upload all projection CSVs in directory
    python scripts/upload_climate_projections.py --dir /path/to/projection_csvs/
    
    # Dry run
    python scripts/upload_climate_projections.py --dir /path/to/csvs/ --dry-run
    
    # Clear existing data before upload
    python scripts/upload_climate_projections.py --file Auckland_projections.csv --clear
"""

import argparse
import csv
import logging
import sys
from decimal import Decimal
from pathlib import Path
from typing import Optional, Dict, List

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from db.session import SessionLocal
from db.models.climate import ClimateZone, ClimateBaselineMonthly, ClimateProjection

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
    """
    Extract zone name from projections CSV filename.
    e.g., 'Auckland_projections.csv' -> 'Auckland'
    """
    name = filepath.stem  # filename without extension
    # Remove '_projections' suffix if present
    if name.lower().endswith('_projections'):
        name = name[:-12]  # len('_projections') = 12
    return name


def upload_projections_file(
    db,
    filepath: Path,
    dry_run: bool = False,
    clear_existing: bool = False
) -> dict:
    """
    Upload a single projections CSV file.
    
    Extracts baseline data and projection data from the same file.
    
    Returns dict with counts.
    """
    zone_name = get_zone_name_from_filename(filepath)
    logger.info(f"Processing: {filepath.name} (zone: {zone_name})")
    
    # Find zone by name
    zone = db.query(ClimateZone).filter(ClimateZone.name == zone_name).first()
    if not zone:
        logger.error(f"  ❌ Zone '{zone_name}' not found in database. Skipping file.")
        return {'baseline_inserted': 0, 'projections_inserted': 0, 'errors': 1}
    
    logger.info(f"  Found zone: {zone.name} (id: {zone.id})")
    
    # Optionally clear existing data
    if clear_existing and not dry_run:
        deleted_baseline = db.query(ClimateBaselineMonthly).filter(
            ClimateBaselineMonthly.zone_id == zone.id
        ).delete()
        deleted_proj = db.query(ClimateProjection).filter(
            ClimateProjection.zone_id == zone.id
        ).delete()
        db.commit()
        logger.info(f"  Cleared {deleted_baseline} baseline + {deleted_proj} projection records")
    
    results = {'baseline_inserted': 0, 'projections_inserted': 0, 'errors': 0}
    
    # Read CSV
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    
    logger.info(f"  Read {len(rows)} rows from CSV")
    
    # =========================================================================
    # EXTRACT BASELINE (one record per month, same across all SSP/periods)
    # =========================================================================
    baseline_by_month: Dict[int, dict] = {}
    
    for row in rows:
        month = int(row['Month'])
        if month not in baseline_by_month:
            baseline_by_month[month] = {
                'tmean': parse_decimal(row.get('Baseline_Tmean')),
                'tmax': parse_decimal(row.get('Baseline_Tmax')),
                'tmin': parse_decimal(row.get('Baseline_Tmin')),
                'rain': parse_decimal(row.get('Baseline_Rain')),
                'gdd': parse_decimal(row.get('Baseline_GDD10')),
            }
    
    baseline_records = []
    for month, values in sorted(baseline_by_month.items()):
        record = ClimateBaselineMonthly(
            zone_id=zone.id,
            month=month,
            tmean=values['tmean'],
            tmax=values['tmax'],
            tmin=values['tmin'],
            rain=values['rain'],
            gdd=values['gdd'],
        )
        baseline_records.append(record)
    
    logger.info(f"  Extracted {len(baseline_records)} baseline records (months 1-12)")
    
    # =========================================================================
    # EXTRACT PROJECTIONS (3 SSP × 3 periods × 12 months = 108 records)
    # =========================================================================
    projection_records = []
    
    for row in rows:
        try:
            record = ClimateProjection(
                zone_id=zone.id,
                ssp=row['SSP'].strip(),
                period=row['Period'].strip(),
                month=int(row['Month']),
                # Tmean
                tmean_delta=parse_decimal(row.get('Proj_Tmean_mean')),
                tmean_delta_sd=parse_decimal(row.get('Proj_Tmean_sd')),
                tmean_projected=parse_decimal(row.get('Projected_Tmean')),
                # Tmax
                tmax_delta=parse_decimal(row.get('Proj_Tmax_mean')),
                tmax_delta_sd=parse_decimal(row.get('Proj_Tmax_sd')),
                tmax_projected=parse_decimal(row.get('Projected_Tmax')),
                # Tmin
                tmin_delta=parse_decimal(row.get('Proj_Tmin_mean')),
                tmin_delta_sd=parse_decimal(row.get('Proj_Tmin_sd')),
                tmin_projected=parse_decimal(row.get('Projected_Tmin')),
                # Rain
                rain_delta=parse_decimal(row.get('Proj_Rain_mean')),
                rain_delta_sd=parse_decimal(row.get('Proj_Rain_sd')),
                rain_projected=parse_decimal(row.get('Projected_Rain')),
                # GDD
                gdd_baseline=parse_decimal(row.get('Baseline_GDD10')),
                gdd_projected=parse_decimal(row.get('Projected_GDD10')),
            )
            projection_records.append(record)
        except Exception as e:
            logger.warning(f"  Error parsing projection row: {e}")
            results['errors'] += 1
    
    logger.info(f"  Parsed {len(projection_records)} projection records")
    
    # =========================================================================
    # INSERT
    # =========================================================================
    if dry_run:
        logger.info(f"  [DRY RUN] Would insert {len(baseline_records)} baseline + {len(projection_records)} projection records")
        results['baseline_inserted'] = len(baseline_records)
        results['projections_inserted'] = len(projection_records)
    else:
        try:
            # Insert baseline
            db.bulk_save_objects(baseline_records)
            results['baseline_inserted'] = len(baseline_records)
            
            # Insert projections
            db.bulk_save_objects(projection_records)
            results['projections_inserted'] = len(projection_records)
            
            db.commit()
            logger.info(f"  ✅ Inserted {len(baseline_records)} baseline + {len(projection_records)} projection records")
            
        except Exception as e:
            db.rollback()
            logger.error(f"  ❌ Insert failed: {e}")
            results['errors'] += len(baseline_records) + len(projection_records)
    
    return results


def upload_climate_projections(
    file_path: Optional[str] = None,
    dir_path: Optional[str] = None,
    dry_run: bool = False,
    clear_existing: bool = False
):
    """
    Upload climate projections from CSV file(s).
    
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
            # Get projection CSV files
            files = list(dp.glob('*_projections.csv')) + list(dp.glob('*_Projections.csv'))
            files.sort(key=lambda x: x.name)
        
        if not files:
            logger.error("No projection CSV files found to process")
            return
        
        logger.info(f"Found {len(files)} projection CSV files to process")
        if dry_run:
            logger.info("[DRY RUN MODE]")
        
        # Process each file
        totals = {'baseline_inserted': 0, 'projections_inserted': 0, 'errors': 0}
        
        for filepath in files:
            results = upload_projections_file(db, filepath, dry_run, clear_existing)
            totals['baseline_inserted'] += results['baseline_inserted']
            totals['projections_inserted'] += results['projections_inserted']
            totals['errors'] += results['errors']
        
        # Summary
        logger.info(f"\n{'='*50}")
        logger.info(f"UPLOAD COMPLETE")
        logger.info(f"  Files processed: {len(files)}")
        logger.info(f"  Baseline records inserted: {totals['baseline_inserted']}")
        logger.info(f"  Projection records inserted: {totals['projections_inserted']}")
        logger.info(f"  Errors: {totals['errors']}")
        
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        db.rollback()
        raise
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Upload climate projections CSV files")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--file", help="Path to single projections CSV file")
    group.add_argument("--dir", help="Path to directory containing projections CSV files")
    parser.add_argument("--dry-run", action="store_true", help="Preview without inserting")
    parser.add_argument("--clear", action="store_true", help="Clear existing data before upload")
    
    args = parser.parse_args()
    
    upload_climate_projections(
        file_path=args.file,
        dir_path=args.dir,
        dry_run=args.dry_run,
        clear_existing=args.clear
    )


if __name__ == "__main__":
    main()