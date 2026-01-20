#!/usr/bin/env python3
"""
scripts/zone_aggregation.py

Aggregate station-level daily data (weather_data_daily) into zone-level 
aggregates (climate_zone_daily) using Inverse Distance Weighting (IDW).

Usage:
    python scripts/zone_aggregation.py                           # Process yesterday
    python scripts/zone_aggregation.py --date 2025-10-15         # Process specific date
    python scripts/zone_aggregation.py --start 2025-10-01 --end 2025-10-31  # Date range
    python scripts/zone_aggregation.py --dry-run                 # Show what would be processed
"""

import argparse
import logging
import sys
from datetime import datetime, date, timedelta
from decimal import Decimal
from pathlib import Path
from statistics import mean, stdev
from typing import Dict, List, Optional

import pytz

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from db.session import SessionLocal
from db.models.climate import ClimateZone
from db.models.realtime_climate import ClimateZoneDaily

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

NZ_TZ = pytz.timezone('Pacific/Auckland')
MIN_STATIONS_FOR_ZONE = 2
OUTLIER_SD_THRESHOLD = 1.5  # Exclude stations > 1.5 SD from mean


def get_vintage_year(target_date: date) -> int:
    """Get the vintage year for a given date (July 1 - June 30)."""
    return target_date.year + 1 if target_date.month >= 7 else target_date.year


def mean_with_outlier_removal(values: List[float], sd_threshold: float = OUTLIER_SD_THRESHOLD) -> Optional[float]:
    """
    Calculate mean, excluding outliers > sd_threshold standard deviations from mean.
    
    Returns None if insufficient valid values.
    """
    # Filter out None values
    valid = [v for v in values if v is not None]
    
    if len(valid) < 2:
        return mean(valid) if valid else None
    
    # Calculate initial mean and SD
    initial_mean = mean(valid)
    initial_sd = stdev(valid)
    
    # If SD is very small (all values similar), keep all
    if initial_sd < 0.01:
        return initial_mean
    
    # Filter outliers
    filtered = [v for v in valid if abs(v - initial_mean) <= sd_threshold * initial_sd]
    
    # Need at least 1 value after filtering
    if not filtered:
        return initial_mean  # Fall back to original if all excluded
    
    return mean(filtered)


def get_zones_with_stations(db) -> List[dict]:
    """Get climate zones with sufficient station coverage."""
    result = db.execute(text("""
        SELECT 
            cz.id as zone_id,
            cz.name as zone_name,
            COUNT(DISTINCT ws.station_id) as station_count
        FROM climate_zones cz
        LEFT JOIN weather_stations ws ON ws.zone_id = cz.id AND ws.is_active = true
        WHERE cz.is_active = true
        GROUP BY cz.id, cz.name
        HAVING COUNT(DISTINCT ws.station_id) >= :min_stations
        ORDER BY cz.name
    """), {'min_stations': MIN_STATIONS_FOR_ZONE})
    
    return [
        {
            'zone_id': row[0],
            'zone_name': row[1],
            'station_count': row[2],
        }
        for row in result
    ]


def get_zone_stations_with_data(db, zone_id: int, target_date: date) -> List[dict]:
    """Get stations in zone with data for target date."""
    result = db.execute(text("""
        SELECT 
            ws.station_id,
            wdd.temp_min, wdd.temp_max, wdd.temp_mean,
            wdd.humidity_mean, wdd.rainfall_mm, wdd.solar_radiation, wdd.gdd_base0
        FROM weather_stations ws
        JOIN weather_data_daily wdd ON wdd.station_id = ws.station_id
        WHERE ws.zone_id = :zone_id AND ws.is_active = true AND wdd.date = :target_date
    """), {'zone_id': zone_id, 'target_date': target_date})
    
    return [
        {
            'station_id': row[0],
            'temp_min': float(row[1]) if row[1] else None,
            'temp_max': float(row[2]) if row[2] else None,
            'temp_mean': float(row[3]) if row[3] else None,
            'humidity_mean': float(row[4]) if row[4] else None,
            'rainfall_mm': float(row[5]) if row[5] else None,
            'solar_radiation': float(row[6]) if row[6] else None,
            'gdd_base0': float(row[7]) if row[7] else None,
        }
        for row in result
    ]


def get_previous_cumulative_gdd(db, zone_id: int, target_date: date) -> Decimal:
    """Get cumulative GDD from previous day."""
    if target_date.month == 7 and target_date.day == 1:
        return Decimal('0')
    
    previous_date = target_date - timedelta(days=1)
    existing = db.query(ClimateZoneDaily).filter(
        ClimateZoneDaily.zone_id == zone_id,
        ClimateZoneDaily.date == previous_date
    ).first()
    
    return Decimal(str(existing.gdd_cumulative)) if existing and existing.gdd_cumulative else Decimal('0')


def aggregate_zone_day(db, zone: dict, target_date: date) -> Optional[dict]:
    """
    Aggregate station data for a zone using simple mean with outlier removal.
    
    Outliers (>1.5 SD from mean) are excluded from calculations.
    """
    stations = get_zone_stations_with_data(db, zone['zone_id'], target_date)
    
    stations_with_temp = [s for s in stations if s['temp_mean'] is not None]
    if len(stations_with_temp) < MIN_STATIONS_FOR_ZONE:
        return None
    
    # Calculate means with outlier removal for each variable
    temp_min = mean_with_outlier_removal([s['temp_min'] for s in stations])
    temp_max = mean_with_outlier_removal([s['temp_max'] for s in stations])
    temp_mean = mean_with_outlier_removal([s['temp_mean'] for s in stations])
    humidity_mean = mean_with_outlier_removal([s['humidity_mean'] for s in stations])
    rainfall_mm = mean_with_outlier_removal([s['rainfall_mm'] for s in stations])
    solar_radiation = mean_with_outlier_removal([s['solar_radiation'] for s in stations])
    
    # GDD from mean temp
    gdd_daily = max(Decimal('0'), Decimal(str(temp_mean))) if temp_mean else None
    
    # Count stations with each variable
    station_count = len(stations)
    confidence = 'high' if station_count >= 6 else ('medium' if station_count >= 4 else 'low')
    
    return {
        'zone_id': zone['zone_id'],
        'date': target_date,
        'vintage_year': get_vintage_year(target_date),
        'temp_min': Decimal(str(temp_min)) if temp_min else None,
        'temp_max': Decimal(str(temp_max)) if temp_max else None,
        'temp_mean': Decimal(str(temp_mean)) if temp_mean else None,
        'humidity_mean': Decimal(str(humidity_mean)) if humidity_mean else None,
        'rainfall_mm': Decimal(str(rainfall_mm)) if rainfall_mm else None,
        'solar_radiation': Decimal(str(solar_radiation)) if solar_radiation else None,
        'gdd_daily': gdd_daily,
        'gdd_cumulative': None,  # Set in upsert
        'station_count': station_count,
        'stations_with_temp': len(stations_with_temp),
        'stations_with_humidity': len([s for s in stations if s['humidity_mean']]),
        'stations_with_rain': len([s for s in stations if s['rainfall_mm']]),
        'confidence': confidence,
        'processing_method': 'mean_outlier_removed',
    }


def upsert_zone_daily(db, record: dict) -> bool:
    """Insert or update zone daily record."""
    previous_gdd = get_previous_cumulative_gdd(db, record['zone_id'], record['date'])
    record['gdd_cumulative'] = previous_gdd + (record['gdd_daily'] or Decimal('0'))
    
    existing = db.query(ClimateZoneDaily).filter(
        ClimateZoneDaily.zone_id == record['zone_id'],
        ClimateZoneDaily.date == record['date']
    ).first()
    
    if existing:
        for key, value in record.items():
            setattr(existing, key, value)
    else:
        db.add(ClimateZoneDaily(**record))
    
    return True


def run_zone_aggregation(
    target_date: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    dry_run: bool = False
):
    """Run zone aggregation for specified date(s)."""
    
    if target_date:
        dates_to_process = [datetime.strptime(target_date, '%Y-%m-%d').date()]
    elif start_date and end_date:
        start = datetime.strptime(start_date, '%Y-%m-%d').date()
        end = datetime.strptime(end_date, '%Y-%m-%d').date()
        dates_to_process = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    else:
        dates_to_process = [(datetime.now(NZ_TZ) - timedelta(days=1)).date()]
    
    logger.info(f"Zone Aggregation: weather_data_daily → climate_zone_daily")
    logger.info(f"Dates: {dates_to_process[0]} to {dates_to_process[-1]} ({len(dates_to_process)} days)")
    
    if dry_run:
        logger.info("[DRY RUN MODE]")
    
    db = SessionLocal()
    
    try:
        zones = get_zones_with_stations(db)
        logger.info(f"Found {len(zones)} zones with >= {MIN_STATIONS_FOR_ZONE} stations")
        
        for zone in zones:
            logger.info(f"  - {zone['zone_name']}: {zone['station_count']} stations")
        
        if not zones:
            logger.warning("No zones have sufficient station coverage")
            return
        
        total_records = 0
        for target in sorted(dates_to_process):
            records = 0
            for zone in zones:
                record = aggregate_zone_day(db, zone, target)
                if record:
                    if not dry_run:
                        upsert_zone_daily(db, record)
                    records += 1
            
            if not dry_run:
                db.commit()
            
            logger.info(f"  {target}: {records} zone records")
            total_records += records
        
        logger.info(f"\n✅ Zone aggregation complete: {total_records} records")
        
    except Exception as e:
        logger.error(f"Zone aggregation failed: {e}")
        db.rollback()
        raise
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description='Aggregate station data to zone level using IDW')
    parser.add_argument('--date', type=str, help='Process specific date (YYYY-MM-DD)')
    parser.add_argument('--start', type=str, help='Start date for range')
    parser.add_argument('--end', type=str, help='End date for range')
    parser.add_argument('--dry-run', action='store_true', help='Show without inserting')
    
    args = parser.parse_args()
    
    run_zone_aggregation(args.date, args.start, args.end, args.dry_run)


if __name__ == '__main__':
    main()