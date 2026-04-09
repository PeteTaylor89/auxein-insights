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


def get_active_stations(db, zone_id: Optional[int] = None) -> List[dict]:
    """Get active weather stations, optionally filtered by zone_id."""
    query = db.query(WeatherStation).filter(
        WeatherStation.is_active == True
    )
    if zone_id is not None:
        query = query.filter(WeatherStation.zone_id == zone_id)

    stations = query.order_by(WeatherStation.station_id).all()

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
    
    # Query raw data for this station and date, collapsing variable aliases
    # consistent with hourly_aggregation.py approach
    result = db.execute(text("""
        SELECT
            -- Temperature
            MIN(CASE WHEN variable IN ('temp', 'temperature', 'air_temperature') THEN value END) as temp_min,
            MAX(CASE WHEN variable IN ('temp', 'temperature', 'air_temperature') THEN value END) as temp_max,
            AVG(CASE WHEN variable IN ('temp', 'temperature', 'air_temperature') THEN value END) as temp_mean,
            COUNT(CASE WHEN variable IN ('temp', 'temperature', 'air_temperature') THEN 1 END) as temp_count,
            -- Humidity
            MIN(CASE WHEN variable IN ('rh', 'humidity', 'relative_humidity') THEN value END) as humidity_min,
            MAX(CASE WHEN variable IN ('rh', 'humidity', 'relative_humidity') THEN value END) as humidity_max,
            AVG(CASE WHEN variable IN ('rh', 'humidity', 'relative_humidity') THEN value END) as humidity_mean,
            COUNT(CASE WHEN variable IN ('rh', 'humidity', 'relative_humidity') THEN 1 END) as humidity_count,
            -- Rainfall
            SUM(CASE WHEN variable IN ('rainfall', 'precipitation', 'precip', 'rain') THEN value END) as rainfall_sum,
            COUNT(CASE WHEN variable IN ('rainfall', 'precipitation', 'precip', 'rain') THEN 1 END) as rainfall_count,
            -- Solar radiation
            SUM(CASE WHEN variable IN ('solar_radiation', 'solar', 'radiation') THEN value END) as solar_sum,
            -- Overall record count
            COUNT(*) as total_count
        FROM weather_data
        WHERE station_id = :station_id
          AND timestamp >= :start_dt
          AND timestamp < :end_dt
          AND value IS NOT NULL
    """), {
        'station_id': station_id,
        'start_dt': start_dt,
        'end_dt': end_dt,
    })

    row = result.mappings().fetchone()
    if not row or row['total_count'] == 0:
        return None

    # Calculate GDD values
    temp_mean = row['temp_mean']
    gdd_base0 = None
    gdd_base10 = None

    if temp_mean is not None:
        temp_mean = Decimal(str(temp_mean))
        gdd_base0 = max(Decimal('0'), temp_mean)
        gdd_base10 = max(Decimal('0'), temp_mean - Decimal('10'))

    record = {
        'station_id': station_id,
        'date': target_date,
        'temp_min': row['temp_min'],
        'temp_max': row['temp_max'],
        'temp_mean': temp_mean,
        'humidity_min': row['humidity_min'],
        'humidity_max': row['humidity_max'],
        'humidity_mean': row['humidity_mean'],
        'rainfall_mm': row['rainfall_sum'] if row['rainfall_sum'] is not None else Decimal('0'),
        'solar_radiation': row['solar_sum'],
        'gdd_base0': gdd_base0,
        'gdd_base10': gdd_base10,
        'temp_record_count': row['temp_count'] or 0,
        'humidity_record_count': row['humidity_count'] or 0,
        'rainfall_record_count': row['rainfall_count'] or 0,
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
    dry_run: bool = False,
    zone_id: Optional[int] = None
):
    """Run daily aggregation for specified date(s), optionally filtered to a single zone."""
    
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
    if zone_id is not None:
        logger.info(f"Zone filter: {zone_id}")

    if dry_run:
        logger.info("[DRY RUN MODE]")

    db = SessionLocal()

    try:
        # Get active stations
        stations = get_active_stations(db, zone_id=zone_id)
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
    parser.add_argument('--zone-id', type=int, help='Process only stations in this zone')

    args = parser.parse_args()

    run_daily_aggregation(
        target_date=args.date,
        start_date=args.start,
        end_date=args.end,
        dry_run=args.dry_run,
        zone_id=args.zone_id
    )


if __name__ == '__main__':
    main()