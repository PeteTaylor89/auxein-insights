#!/usr/bin/env python3
"""
scripts/upload_phenology.py

Upload phenology GDD thresholds from CSV into the phenology_thresholds table.

CSV Format Expected:
    Variety,Flowering,Veraison,_170g/L,_180g/L,_190g/L,_200g/L,_210g/L,_220g/L
    Pinot noir,1219,2507,2695,2734,2788,2838,2899,2933

Note: All GDD values are base 0.

Usage:
    python scripts/upload_phenology.py --file /path/to/Phenology.csv
    python scripts/upload_phenology.py --file /path/to/Phenology.csv --dry-run
    python scripts/upload_phenology.py --file /path/to/Phenology.csv --clear
"""

import argparse
import csv
import logging
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Optional

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from db.session import SessionLocal
from db.models.realtime_climate import PhenologyThreshold

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# Variety code mapping (display name → code)
VARIETY_CODES = {
    'Cabernet franc': 'CF',
    'Cabernet Sauvignon': 'CS',
    'Chardonnay': 'CH',
    'Grenache': 'GR',
    'Merlot': 'ME',
    'Pinot noir': 'PN',
    'Rielsing': 'RI',  # Note: typo in original data
    'Riesling': 'RI',
    'Sauvignon blanc': 'SB',
    'Syrah': 'SY',
}


def parse_decimal(value_str: str) -> Optional[Decimal]:
    """Parse a value string to Decimal, handling empty values."""
    if not value_str or value_str.strip() == '':
        return None
    try:
        return Decimal(value_str.strip())
    except InvalidOperation:
        return None


def load_phenology_csv(filepath: Path) -> list[dict]:
    """
    Load phenology thresholds from CSV file.
    
    Returns list of dicts ready for database insertion.
    """
    records = []
    
    with open(filepath, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        
        for row in reader:
            variety_name = row.get('Variety', '').strip()
            
            if not variety_name:
                continue
            
            # Get variety code
            variety_code = VARIETY_CODES.get(variety_name)
            if not variety_code:
                logger.warning(f"  ⚠️  Unknown variety: {variety_name}")
                continue
            
            # Parse thresholds
            record = {
                'variety_code': variety_code,
                'variety_name': variety_name,
                'gdd_flowering': parse_decimal(row.get('Flowering', '')),
                'gdd_veraison': parse_decimal(row.get('Veraison', '')),
                'gdd_harvest_170': parse_decimal(row.get('_170g/L', '')),
                'gdd_harvest_180': parse_decimal(row.get('_180g/L', '')),
                'gdd_harvest_190': parse_decimal(row.get('_190g/L', '')),
                'gdd_harvest_200': parse_decimal(row.get('_200g/L', '')),
                'gdd_harvest_210': parse_decimal(row.get('_210g/L', '')),
                'gdd_harvest_220': parse_decimal(row.get('_220g/L', '')),
            }
            
            records.append(record)
    
    return records


def upload_phenology_thresholds(
    file_path: str,
    dry_run: bool = False,
    clear_existing: bool = False
):
    """
    Upload phenology thresholds from CSV file.
    """
    filepath = Path(file_path)
    if not filepath.exists():
        logger.error(f"File not found: {file_path}")
        return
    
    logger.info(f"Loading phenology thresholds from: {filepath.name}")
    if dry_run:
        logger.info("[DRY RUN MODE]")
    
    db = SessionLocal()
    
    try:
        # Optionally clear existing data
        if clear_existing and not dry_run:
            deleted = db.query(PhenologyThreshold).delete()
            db.commit()
            logger.info(f"Cleared {deleted} existing records")
        
        # Load CSV
        records = load_phenology_csv(filepath)
        logger.info(f"Found {len(records)} varieties")
        
        # Display summary
        logger.info(f"\n  Variety Thresholds (GDD base 0):")
        logger.info("  " + "-"*80)
        logger.info(f"  {'Variety':<20} {'Flowering':>10} {'Veraison':>10} {'Harvest @200g/L':>15}")
        logger.info("  " + "-"*80)
        
        for r in records:
            flowering = r['gdd_flowering'] or '-'
            veraison = r['gdd_veraison'] or '-'
            harvest = r['gdd_harvest_200'] or '-'
            logger.info(f"  {r['variety_name']:<20} {str(flowering):>10} {str(veraison):>10} {str(harvest):>15}")
        
        if dry_run:
            logger.info(f"\n[DRY RUN] Would upload {len(records)} phenology thresholds")
            return
        
        # Insert or update records
        count = 0
        for record in records:
            # Check if exists
            existing = db.query(PhenologyThreshold).filter(
                PhenologyThreshold.variety_code == record['variety_code']
            ).first()
            
            if existing:
                # Update
                existing.variety_name = record['variety_name']
                existing.gdd_flowering = record['gdd_flowering']
                existing.gdd_veraison = record['gdd_veraison']
                existing.gdd_harvest_170 = record['gdd_harvest_170']
                existing.gdd_harvest_180 = record['gdd_harvest_180']
                existing.gdd_harvest_190 = record['gdd_harvest_190']
                existing.gdd_harvest_200 = record['gdd_harvest_200']
                existing.gdd_harvest_210 = record['gdd_harvest_210']
                existing.gdd_harvest_220 = record['gdd_harvest_220']
                existing.is_active = True
            else:
                # Insert
                new_record = PhenologyThreshold(
                    variety_code=record['variety_code'],
                    variety_name=record['variety_name'],
                    gdd_flowering=record['gdd_flowering'],
                    gdd_veraison=record['gdd_veraison'],
                    gdd_harvest_170=record['gdd_harvest_170'],
                    gdd_harvest_180=record['gdd_harvest_180'],
                    gdd_harvest_190=record['gdd_harvest_190'],
                    gdd_harvest_200=record['gdd_harvest_200'],
                    gdd_harvest_210=record['gdd_harvest_210'],
                    gdd_harvest_220=record['gdd_harvest_220'],
                    is_active=True,
                )
                db.add(new_record)
            
            count += 1
        
        db.commit()
        logger.info(f"\n✅ Uploaded {count} phenology thresholds")
        
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        db.rollback()
        raise
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description='Upload phenology thresholds from CSV')
    parser.add_argument('--file', '-f', type=str, required=True, help='Path to Phenology.csv')
    parser.add_argument('--dry-run', action='store_true', help='Parse file but do not insert data')
    parser.add_argument('--clear', action='store_true', help='Clear existing data before upload')
    
    args = parser.parse_args()
    
    upload_phenology_thresholds(
        file_path=args.file,
        dry_run=args.dry_run,
        clear_existing=args.clear
    )


if __name__ == '__main__':
    main()