#!/usr/bin/env python3
"""
scripts/phenology_service.py

Calculate phenological stage estimates for each variety in each zone
based on accumulated GDD (base 0).

Usage:
    python scripts/phenology_service.py                    # Process today
    python scripts/phenology_service.py --date 2025-12-15  # Specific date
    python scripts/phenology_service.py --dry-run          # Show without saving
"""

import argparse
import logging
import sys
from datetime import datetime, date, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import pytz

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from db.session import SessionLocal
from db.models.realtime_climate import (
    ClimateZoneDaily, ClimateZoneDailyBaseline,
    PhenologyThreshold, PhenologyEstimate
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

NZ_TZ = pytz.timezone('Pacific/Auckland')
GDD_RATE_LOOKBACK_DAYS = 14


def get_vintage_year(target_date: date) -> int:
    return target_date.year + 1 if target_date.month >= 7 else target_date.year


def get_day_of_vintage(target_date: date) -> int:
    july_1 = date(target_date.year, 7, 1) if target_date.month >= 7 else date(target_date.year - 1, 7, 1)
    return (target_date - july_1).days + 1


def get_phenology_thresholds(db) -> List[dict]:
    """Get all active phenology thresholds."""
    thresholds = db.query(PhenologyThreshold).filter(
        PhenologyThreshold.is_active == True
    ).order_by(PhenologyThreshold.variety_name).all()
    
    return [
        {
            'variety_code': t.variety_code,
            'variety_name': t.variety_name,
            'gdd_flowering': t.gdd_flowering,
            'gdd_veraison': t.gdd_veraison,
            'gdd_harvest_170': t.gdd_harvest_170,
            'gdd_harvest_180': t.gdd_harvest_180,
            'gdd_harvest_190': t.gdd_harvest_190,
            'gdd_harvest_200': t.gdd_harvest_200,
            'gdd_harvest_210': t.gdd_harvest_210,
            'gdd_harvest_220': t.gdd_harvest_220,
        }
        for t in thresholds
    ]


def get_zones_with_climate_data(db, target_date: date) -> List[dict]:
    """Get zones with climate_zone_daily data for target date."""
    zones = db.query(ClimateZoneDaily).filter(
        ClimateZoneDaily.date == target_date,
        ClimateZoneDaily.gdd_cumulative.isnot(None)
    ).all()
    
    return [
        {
            'zone_id': z.zone_id,
            'gdd_cumulative': z.gdd_cumulative,
            'confidence': z.confidence,
            'vintage_year': z.vintage_year,
        }
        for z in zones
    ]


def get_average_daily_gdd(db, zone_id: int, target_date: date) -> Optional[Decimal]:
    """Calculate average daily GDD over lookback period."""
    start_date = target_date - timedelta(days=GDD_RATE_LOOKBACK_DAYS)
    
    result = db.execute(text("""
        SELECT AVG(gdd_daily) FROM climate_zone_daily
        WHERE zone_id = :zone_id AND date > :start_date AND date <= :target_date
        AND gdd_daily IS NOT NULL
    """), {'zone_id': zone_id, 'start_date': start_date, 'target_date': target_date}).fetchone()
    
    return Decimal(str(result[0])) if result and result[0] else None


def get_baseline_gdd(db, zone_id: int, day_of_vintage: int) -> Optional[Decimal]:
    """Get baseline cumulative GDD for day of vintage."""
    baseline = db.query(ClimateZoneDailyBaseline).filter(
        ClimateZoneDailyBaseline.zone_id == zone_id,
        ClimateZoneDailyBaseline.day_of_vintage == day_of_vintage
    ).first()
    
    return baseline.gdd_base0_cumulative_avg if baseline else None


def determine_stage(gdd: Decimal, thresholds: dict) -> str:
    """Determine current phenological stage."""
    if thresholds['gdd_flowering'] and gdd < thresholds['gdd_flowering']:
        return 'pre_flowering'
    elif thresholds['gdd_veraison'] and gdd < thresholds['gdd_veraison']:
        return 'flowering'
    elif thresholds['gdd_harvest_170'] and gdd < thresholds['gdd_harvest_170']:
        return 'veraison'
    elif thresholds['gdd_harvest_200'] and gdd < thresholds['gdd_harvest_200']:
        return 'ripening'
    return 'harvest_ready'


def estimate_date(current_gdd: Decimal, target_gdd: Optional[Decimal],
                  avg_daily: Optional[Decimal], current_date: date) -> Optional[date]:
    """Estimate date to reach GDD threshold.
    
    Returns:
        - None if no target_gdd threshold defined
        - current_date if threshold already reached (stage has occurred)
        - Estimated future date if threshold not yet reached
    """
    if not target_gdd:
        return None
    
    # If threshold already reached, return current date (stage has occurred)
    if current_gdd >= target_gdd:
        return current_date  # Mark as "reached by this date"
    
    # If no rate data, can't predict future
    if not avg_daily or avg_daily <= 0:
        return None
    
    # Estimate future date
    days_to_reach = int((target_gdd - current_gdd) / avg_daily)
    return current_date + timedelta(days=days_to_reach)


def run_phenology_service(
    target_date: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    dry_run: bool = False
):
    """Run phenology estimation."""
    
    # Determine dates to process
    if target_date:
        dates_to_process = [datetime.strptime(target_date, '%Y-%m-%d').date()]
    elif start_date and end_date:
        start = datetime.strptime(start_date, '%Y-%m-%d').date()
        end = datetime.strptime(end_date, '%Y-%m-%d').date()
        dates_to_process = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    else:
        # Default: yesterday (to match daily/zone aggregation timing)
        yesterday = (datetime.now(NZ_TZ) - timedelta(days=1)).date()
        dates_to_process = [yesterday]
    
    logger.info(f"Phenology Estimation Service")
    logger.info(f"Dates: {dates_to_process[0]} to {dates_to_process[-1]} ({len(dates_to_process)} days)")
    
    if dry_run:
        logger.info("[DRY RUN MODE]")
    
    db = SessionLocal()
    
    try:
        thresholds = get_phenology_thresholds(db)
        logger.info(f"Found {len(thresholds)} variety thresholds")
        
        if not thresholds:
            logger.warning("No phenology thresholds found. Run upload_phenology.py first.")
            return
        
        total_count = 0
        for target in sorted(dates_to_process):
            zones = get_zones_with_climate_data(db, target)
            
            if not zones:
                logger.info(f"  {target}: No zones with climate data, skipping")
                continue
            
            count = 0
            for zone in zones:
                current_gdd = Decimal(str(zone['gdd_cumulative']))
                avg_daily = get_average_daily_gdd(db, zone['zone_id'], target)
                baseline_gdd = get_baseline_gdd(db, zone['zone_id'], get_day_of_vintage(target))
                
                for variety in thresholds:
                    stage = determine_stage(current_gdd, variety)
                    
                    # Calculate baseline comparison
                    days_vs_baseline = gdd_vs_baseline = None
                    if baseline_gdd and avg_daily and avg_daily > 0:
                        gdd_vs_baseline = current_gdd - baseline_gdd
                        days_vs_baseline = int(gdd_vs_baseline / avg_daily)
                    
                    record = PhenologyEstimate(
                        zone_id=zone['zone_id'],
                        variety_code=variety['variety_code'],
                        vintage_year=zone['vintage_year'],
                        estimate_date=target,
                        gdd_accumulated=current_gdd,
                        current_stage=stage,
                        flowering_date=estimate_date(current_gdd, variety['gdd_flowering'], avg_daily, target),
                        veraison_date=estimate_date(current_gdd, variety['gdd_veraison'], avg_daily, target),
                        harvest_170_date=estimate_date(current_gdd, variety['gdd_harvest_170'], avg_daily, target),
                        harvest_180_date=estimate_date(current_gdd, variety['gdd_harvest_180'], avg_daily, target),
                        harvest_190_date=estimate_date(current_gdd, variety['gdd_harvest_190'], avg_daily, target),
                        harvest_200_date=estimate_date(current_gdd, variety['gdd_harvest_200'], avg_daily, target),
                        harvest_210_date=estimate_date(current_gdd, variety['gdd_harvest_210'], avg_daily, target),
                        harvest_220_date=estimate_date(current_gdd, variety['gdd_harvest_220'], avg_daily, target),
                        days_vs_baseline=days_vs_baseline,
                        gdd_vs_baseline=gdd_vs_baseline,
                        confidence=zone['confidence'],
                    )
                    
                    if not dry_run:
                        # Upsert
                        existing = db.query(PhenologyEstimate).filter(
                            PhenologyEstimate.zone_id == zone['zone_id'],
                            PhenologyEstimate.variety_code == variety['variety_code'],
                            PhenologyEstimate.vintage_year == zone['vintage_year'],
                            PhenologyEstimate.estimate_date == target
                        ).first()
                        
                        if existing:
                            for attr in ['gdd_accumulated', 'current_stage', 'flowering_date', 'veraison_date',
                                        'harvest_170_date', 'harvest_180_date', 'harvest_190_date',
                                        'harvest_200_date', 'harvest_210_date', 'harvest_220_date',
                                        'days_vs_baseline', 'gdd_vs_baseline', 'confidence']:
                                setattr(existing, attr, getattr(record, attr))
                        else:
                            db.add(record)
                    
                    count += 1
            
            if not dry_run:
                db.commit()
            
            logger.info(f"  {target}: {len(zones)} zones × {len(thresholds)} varieties = {count} estimates")
            total_count += count
        
        logger.info(f"\n✅ Phenology estimation complete: {total_count} total estimates")
        
    except Exception as e:
        logger.error(f"Phenology service failed: {e}")
        db.rollback()
        raise
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description='Calculate phenology estimates')
    parser.add_argument('--date', type=str, help='Process specific date (YYYY-MM-DD)')
    parser.add_argument('--start', type=str, help='Start date for range (YYYY-MM-DD)')
    parser.add_argument('--end', type=str, help='End date for range (YYYY-MM-DD)')
    parser.add_argument('--dry-run', action='store_true', help='Show without saving')
    
    args = parser.parse_args()
    run_phenology_service(args.date, args.start, args.end, args.dry_run)


if __name__ == '__main__':
    main()