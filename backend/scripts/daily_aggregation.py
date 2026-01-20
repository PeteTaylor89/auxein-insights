#!/usr/bin/env python3
"""
scripts/daily_aggregation.py

Aggregate raw weather_data into weather_data_daily table.
Calculates daily min/max/mean for temperature and humidity,
sum for rainfall and solar radiation, and GDD values.

Designed to run daily via GitHub Actions at 6pm NZT (15-hour delay for data sources).

Usage:
    python scripts/daily_aggregation.py                          # Process yesterday
    python scripts/daily_aggregation.py --date 2025-10-15        # Process specific date
    python scripts/daily_aggregation.py --start 2025-10-01 --end 2025-10-31  # Date range
    python scripts/daily_aggregation.py --dry-run                # Show what would be processed
"""

import argparse
import logging
import sys
from datetime import datetime, date, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Dict, List, Optional

import pytz

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from db.session import SessionLocal
from db.models.weather import WeatherStation
from db.models.realtime_climate import WeatherDataDaily

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

NZ_TZ = pytz.timezone('Pacific/Auckland')


def get_active_stations(db) -> List[dict]:
    """Get all active weather stations with their IDs and zone_ids."""
    stations = db.query(WeatherStation).filter(
        WeatherStation.is_active == True
    ).order_by(WeatherStation.station_id).all()
    
    return [
        {
            'station_id': s.station_id,
            'station_code': s.station_code,
            'zone_id': s.zone_id,
            'region': s.region,
        }
        for s in stations
    ]


def aggregate_station_day(
    db,
    station_id: int,
    target_date: date,
) -> Optional[dict]:
    """
    Aggregate raw weather_data for a single station and date.
    
    Returns dict with aggregated values, or None if no data.
    """
    # Define date range in NZ timezone
    start_dt = NZ_TZ.localize(datetime.combine(target_date, datetime.min.time()))
    end_dt = NZ_TZ.localize(datetime.combine(target_date + timedelta(days=1), datetime.min.time()))
    
    # Query raw data for this station and date
    result = db.execute(text("""
        SELECT 
            variable,
            COUNT(*) as record_count,
            MIN(value) as min_val,
            MAX(value) as max_val,
            AVG(value) as avg_val,
            SUM(value) as sum_val
        FROM weather_data
        WHERE station_id = :station_id
          AND timestamp >= :start_dt
          AND timestamp < :end_dt
          AND value IS NOT NULL
        GROUP BY variable
    """), {
        'station_id': station_id,
        'start_dt': start_dt,
        'end_dt': end_dt,
    })
    
    # Build aggregated record
    aggregates = {}
    for row in result:
        variable = row[0]
        aggregates[variable] = {
            'count': row[1],
            'min': row[2],
            'max': row[3],
            'avg': row[4],
            'sum': row[5],
        }
    
    if not aggregates:
        return None
    
    # Extract values by variable type
    temp_data = aggregates.get('temp', {})
    humidity_data = aggregates.get('humidity', {})
    rainfall_data = aggregates.get('rainfall', {})
    solar_data = aggregates.get('solar_radiation', {})
    
    # Calculate GDD values
    temp_mean = temp_data.get('avg')
    gdd_base0 = None
    gdd_base10 = None
    
    if temp_mean is not None:
        temp_mean = Decimal(str(temp_mean))
        gdd_base0 = max(Decimal('0'), temp_mean)
        gdd_base10 = max(Decimal('0'), temp_mean - Decimal('10'))
    
    record = {
        'station_id': station_id,
        'date': target_date,
        'temp_min': temp_data.get('min'),
        'temp_max': temp_data.get('max'),
        'temp_mean': temp_mean,
        'humidity_min': humidity_data.get('min'),
        'humidity_max': humidity_data.get('max'),
        'humidity_mean': humidity_data.get('avg'),
        'rainfall_mm': rainfall_data.get('sum', Decimal('0')),
        'solar_radiation': solar_data.get('sum'),
        'gdd_base0': gdd_base0,
        'gdd_base10': gdd_base10,
        'temp_record_count': temp_data.get('count', 0),
        'humidity_record_count': humidity_data.get('count', 0),
        'rainfall_record_count': rainfall_data.get('count', 0),
    }
    
    return record


def upsert_daily_record(db, record: dict) -> bool:
    """Insert or update a daily aggregate record."""
    existing = db.query(WeatherDataDaily).filter(
        WeatherDataDaily.station_id == record['station_id'],
        WeatherDataDaily.date == record['date']
    ).first()
    
    if existing:
        # Update
        for key, value in record.items():
            if key not in ('station_id', 'date'):
                setattr(existing, key, value)
    else:
        # Insert
        new_record = WeatherDataDaily(**record)
        db.add(new_record)
    
    return True


def process_date(
    db,
    stations: List[dict],
    target_date: date,
    dry_run: bool = False
) -> Dict[str, int]:
    """Process all stations for a single date."""
    stats = {
        'stations_processed': 0,
        'records_created': 0,
        'stations_no_data': 0,
    }
    
    for station in stations:
        record = aggregate_station_day(db, station['station_id'], target_date)
        
        if record:
            if not dry_run:
                upsert_daily_record(db, record)
            stats['records_created'] += 1
        else:
            stats['stations_no_data'] += 1
        
        stats['stations_processed'] += 1
    
    if not dry_run:
        db.commit()
    
    return stats


def run_daily_aggregation(
    target_date: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    dry_run: bool = False
):
    """Run daily aggregation for specified date(s)."""
    
    # Determine dates to process
    if target_date:
        dates_to_process = [datetime.strptime(target_date, '%Y-%m-%d').date()]
    elif start_date and end_date:
        start = datetime.strptime(start_date, '%Y-%m-%d').date()
        end = datetime.strptime(end_date, '%Y-%m-%d').date()
        dates_to_process = []
        current = start
        while current <= end:
            dates_to_process.append(current)
            current += timedelta(days=1)
    else:
        # Default: yesterday
        yesterday = (datetime.now(NZ_TZ) - timedelta(days=1)).date()
        dates_to_process = [yesterday]
    
    logger.info(f"Daily Aggregation: weather_data → weather_data_daily")
    logger.info(f"Dates to process: {dates_to_process[0]} to {dates_to_process[-1]} ({len(dates_to_process)} days)")
    
    if dry_run:
        logger.info("[DRY RUN MODE]")
    
    db = SessionLocal()
    
    try:
        # Get active stations
        stations = get_active_stations(db)
        logger.info(f"Found {len(stations)} active weather stations")
        
        # Process each date
        total_stats = {
            'dates_processed': 0,
            'records_created': 0,
            'stations_no_data': 0,
        }
        
        for target in dates_to_process:
            stats = process_date(db, stations, target, dry_run)
            
            total_stats['dates_processed'] += 1
            total_stats['records_created'] += stats['records_created']
            total_stats['stations_no_data'] += stats['stations_no_data']
            
            logger.info(f"  {target}: {stats['records_created']} records, {stats['stations_no_data']} no data")
        
        # Summary
        logger.info(f"\n{'='*60}")
        logger.info("DAILY AGGREGATION SUMMARY")
        logger.info(f"{'='*60}")
        logger.info(f"Dates processed:    {total_stats['dates_processed']}")
        logger.info(f"Records created:    {total_stats['records_created']}")
        
        logger.info("\n✅ Daily aggregation complete")
        
    except Exception as e:
        logger.error(f"Daily aggregation failed: {e}")
        db.rollback()
        raise
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description='Aggregate daily weather data from raw observations')
    parser.add_argument('--date', type=str, help='Process specific date (YYYY-MM-DD)')
    parser.add_argument('--start', type=str, help='Start date for range (YYYY-MM-DD)')
    parser.add_argument('--end', type=str, help='End date for range (YYYY-MM-DD)')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be processed without inserting')
    
    args = parser.parse_args()
    
    run_daily_aggregation(
        target_date=args.date,
        start_date=args.start,
        end_date=args.end,
        dry_run=args.dry_run
    )


if __name__ == '__main__':
    main()