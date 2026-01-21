#!/usr/bin/env python3
"""
scripts/hourly_aggregation.py

Aggregate weather station data to hourly zone-level climate.
Includes leaf wetness estimation and dew point calculation.

SCHEMA NOTES:
- Zone assignment is via `zone_id` column on `weather_stations` table
- Raw data from `weather_data` table (EAV schema)
- EAV columns: station_id, timestamp, variable, value, unit, quality
- Variables pivoted: temperature, humidity, rainfall

Usage:
    python scripts/hourly_aggregation.py                    # Process last 24 hours
    python scripts/hourly_aggregation.py --date 2025-01-20  # Specific date
    python scripts/hourly_aggregation.py --hours 48         # Last N hours
    python scripts/hourly_aggregation.py --dry-run          # Show without saving
    python scripts/hourly_aggregation.py --check-vars       # List available variables
    python scripts/hourly_aggregation.py --check-stations   # Check station variables (all)
    python scripts/hourly_aggregation.py --check-stations 15  # Check station variables (zone 15)
    
    # Date range backfill:
    python scripts/hourly_aggregation.py --start-date 2025-10-01                    # Oct 1 to today
    python scripts/hourly_aggregation.py --start-date 2025-10-01 --end-date 2025-12-31  # Oct-Dec 2025
    python scripts/hourly_aggregation.py --start-date 2025-10-01 --dry-run          # Dry run backfill
"""

import argparse
import logging
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import math

import pytz

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from sqlalchemy.orm import Session
from db.session import SessionLocal

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

NZ_TZ = pytz.timezone('Pacific/Auckland')
UTC = pytz.UTC


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def calculate_dew_point(temp_c: float, humidity_pct: float) -> Optional[float]:
    """Calculate dew point using Magnus formula."""
    if temp_c is None or humidity_pct is None or humidity_pct <= 0:
        return None
    
    a = 17.67
    b = 243.5
    
    try:
        rh_fraction = max(0.01, humidity_pct / 100.0)
        gamma = math.log(rh_fraction) + (a * temp_c) / (b + temp_c)
        dew_point = (b * gamma) / (a - gamma)
        return round(dew_point, 2)
    except (ValueError, ZeroDivisionError):
        return None


def estimate_leaf_wetness(
    temp_c: float,
    humidity_pct: float,
    rainfall_mm: float,
    hours_since_rain: Optional[int] = None
) -> Tuple[bool, float, Optional[str]]:
    """
    Estimate leaf wetness from meteorological variables.
    
    Returns: (is_wet, probability, source)
    """
    p_precip = 1.0 if rainfall_mm and rainfall_mm > 0 else 0.0
    
    p_post_rain = 0.0
    if hours_since_rain is not None and hours_since_rain <= 6:
        base_decay = 0.3
        if temp_c and temp_c > 25:
            base_decay *= 1.5
        if humidity_pct and humidity_pct < 70:
            base_decay *= 1.3
        p_post_rain = max(0, 1.0 - (hours_since_rain * base_decay))
    
    p_rh = 0.0
    if humidity_pct is not None:
        if humidity_pct >= 95:
            p_rh = 0.95
        elif humidity_pct >= 90:
            p_rh = 0.8
        elif humidity_pct >= 87:
            p_rh = 0.5
        elif humidity_pct >= 80:
            p_rh = 0.2
    
    p_dew = 0.0
    if temp_c is not None and humidity_pct is not None:
        dew_point = calculate_dew_point(temp_c, humidity_pct)
        if dew_point is not None:
            depression = temp_c - dew_point
            if depression <= 1.0:
                p_dew = 0.9
            elif depression <= 2.0:
                p_dew = 0.7
            elif depression <= 3.0:
                p_dew = 0.4
    
    max_p = max(p_precip, p_post_rain, p_rh, p_dew)
    
    if p_precip > 0:
        source = 'rain'
    elif p_post_rain >= max_p and p_post_rain > 0:
        source = 'post_rain'
    elif p_rh >= max_p and p_rh > 0:
        source = 'humidity'
    elif p_dew >= max_p and p_dew > 0:
        source = 'dewpoint'
    else:
        source = None
    
    is_wet = max_p >= 0.5
    
    return is_wet, round(max_p, 2), source


def get_vintage_year(dt: datetime) -> int:
    """Get vintage year for a datetime."""
    if dt.month >= 7:
        return dt.year + 1
    return dt.year


def check_available_variables(db: Session):
    """
    List all unique variable names in weather_data table.
    
    Use this to verify the variable names used in the hourly aggregation query.
    """
    result = db.execute(text("""
        SELECT 
            variable,
            unit,
            COUNT(*) as record_count,
            MIN(timestamp) as first_record,
            MAX(timestamp) as last_record
        FROM weather_data
        GROUP BY variable, unit
        ORDER BY variable
    """)).fetchall()
    
    logger.info("=" * 60)
    logger.info("Available Variables in weather_data")
    logger.info("=" * 60)
    
    for row in result:
        logger.info(f"  {row[0]:25} | unit: {row[1]:10} | records: {row[2]:,}")
        logger.info(f"    Range: {row[3]} to {row[4]}")
    
    logger.info("=" * 60)
    logger.info("Update the query in get_hourly_station_data() if variable names differ")
    
    return result


def check_station_variables(db: Session, zone_id: int = None):
    """
    Check which stations have which variables.
    Useful for debugging missing humidity/rainfall data.
    """
    zone_filter = ""
    params = {}
    
    if zone_id:
        zone_filter = "AND ws.zone_id = :zone_id"
        params['zone_id'] = zone_id
    
    result = db.execute(text(f"""
        SELECT 
            ws.station_id,
            ws.station_name,
            ws.zone_id,
            wd.variable,
            COUNT(*) as record_count,
            MAX(wd.timestamp) as last_record
        FROM weather_stations ws
        JOIN weather_data wd ON ws.station_id = wd.station_id
        WHERE ws.is_active = TRUE
          {zone_filter}
        GROUP BY ws.station_id, ws.station_name, ws.zone_id, wd.variable
        ORDER BY ws.zone_id, ws.station_id, wd.variable
    """), params).fetchall()
    
    logger.info("=" * 60)
    logger.info(f"Station Variables {'(Zone ' + str(zone_id) + ')' if zone_id else '(All Zones)'}")
    logger.info("=" * 60)
    
    current_station = None
    for row in result:
        station_id, station_name, z_id, variable, count, last_rec = row
        
        if station_id != current_station:
            logger.info(f"\n  Station {station_id}: {station_name} (Zone {z_id})")
            current_station = station_id
        
        logger.info(f"    - {variable:20} | {count:>8,} records | last: {last_rec}")
    
    # Summary: which stations have humidity?
    humidity_stations = db.execute(text(f"""
        SELECT DISTINCT ws.station_id, ws.station_name
        FROM weather_stations ws
        JOIN weather_data wd ON ws.station_id = wd.station_id
        WHERE ws.is_active = TRUE
          AND wd.variable IN ('humidity', 'rh', 'relative_humidity')
          AND wd.timestamp >= NOW() - INTERVAL '7 days'
          {zone_filter}
        ORDER BY ws.station_id
    """), params).fetchall()
    
    logger.info(f"\n" + "=" * 60)
    logger.info(f"Stations with humidity data (last 7 days): {len(humidity_stations)}")
    for s in humidity_stations:
        logger.info(f"  - Station {s[0]}: {s[1]}")
    
    return result


# =============================================================================
# DATA AGGREGATION
# =============================================================================

def get_zone_station_mappings(db: Session) -> Dict[int, List[int]]:
    """
    Get mapping of zone_id -> list of station_ids.
    
    Uses zone_id column directly on weather_stations table
    (as per realtime_climate_001 migration).
    """
    result = db.execute(text("""
        SELECT zone_id, station_id 
        FROM weather_stations
        WHERE zone_id IS NOT NULL
          AND is_active = TRUE
        ORDER BY zone_id, station_id
    """)).fetchall()
    
    mappings = {}
    for row in result:
        zone_id = row[0]
        station_id = row[1]
        if zone_id not in mappings:
            mappings[zone_id] = []
        mappings[zone_id].append(station_id)
    
    return mappings


def get_hourly_station_data(
    db: Session, 
    station_ids: List[int],
    start_dt: datetime,
    end_dt: datetime
) -> Dict[datetime, List[dict]]:
    """
    Get hourly aggregated station data from weather_data table.
    
    Schema is EAV (Entity-Attribute-Value):
    - station_id, timestamp, variable, value, unit, quality
    - Variables: 'temperature', 'humidity', 'rainfall' (or similar)
    
    This query pivots the variable rows into columns.
    
    Returns dict of {hour_start: [station_readings]}
    """
    if not station_ids:
        return {}
    
    # Pivot EAV data: rows -> columns, aggregated by hour
    # Note: Different stations may report different variables (temp-only, humidity-only, etc.)
    # We include all stations and aggregate at zone level
    result = db.execute(text("""
        SELECT 
            date_trunc('hour', timestamp) as hour_utc,
            station_id,
            -- Temperature
            AVG(CASE WHEN variable IN ('temperature', 'temp', 'air_temperature') THEN value END) as temp_mean,
            MIN(CASE WHEN variable IN ('temperature', 'temp', 'air_temperature') THEN value END) as temp_min,
            MAX(CASE WHEN variable IN ('temperature', 'temp', 'air_temperature') THEN value END) as temp_max,
            -- Humidity
            AVG(CASE WHEN variable IN ('humidity', 'relative_humidity', 'rh') THEN value END) as humidity_mean,
            MIN(CASE WHEN variable IN ('humidity', 'relative_humidity', 'rh') THEN value END) as humidity_min,
            MAX(CASE WHEN variable IN ('humidity', 'relative_humidity', 'rh') THEN value END) as humidity_max,
            -- Rainfall (sum for the hour, not average)
            SUM(CASE WHEN variable IN ('rainfall', 'precipitation', 'precip', 'rain') THEN value ELSE 0 END) as rainfall_mm,
            -- Record counts per variable type
            COUNT(DISTINCT CASE WHEN variable IN ('temperature', 'temp', 'air_temperature') THEN timestamp END) as temp_count,
            COUNT(DISTINCT CASE WHEN variable IN ('humidity', 'relative_humidity', 'rh') THEN timestamp END) as humidity_count
        FROM weather_data
        WHERE station_id = ANY(:station_ids)
          AND timestamp >= :start_dt
          AND timestamp < :end_dt
          AND quality = 'GOOD'
        GROUP BY date_trunc('hour', timestamp), station_id
        ORDER BY hour_utc, station_id
    """), {
        'station_ids': station_ids,
        'start_dt': start_dt,
        'end_dt': end_dt
    }).fetchall()
    
    hourly_data = {}
    for row in result:
        hour_utc = row[0]
        if hour_utc not in hourly_data:
            hourly_data[hour_utc] = []
        
        hourly_data[hour_utc].append({
            'station_id': row[1],
            'temp_mean': float(row[2]) if row[2] is not None else None,
            'temp_min': float(row[3]) if row[3] is not None else None,
            'temp_max': float(row[4]) if row[4] is not None else None,
            'humidity_mean': float(row[5]) if row[5] is not None else None,
            'humidity_min': float(row[6]) if row[6] is not None else None,
            'humidity_max': float(row[7]) if row[7] is not None else None,
            'rainfall_mm': float(row[8]) if row[8] is not None else 0,
            'temp_count': row[9] or 0,
            'humidity_count': row[10] or 0,
        })
    
    return hourly_data


def aggregate_to_zone(station_readings: List[dict]) -> Optional[dict]:
    """
    Aggregate multiple station readings to zone-level values.
    
    Note: Different stations may report different variables.
    Temperature stations, humidity stations, and rainfall stations
    are often separate physical sensors.
    """
    if not station_readings:
        return None
    
    def safe_mean(values):
        valid = [v for v in values if v is not None]
        if not valid:
            return None
        
        # Remove outliers (>2 std from mean) if enough samples
        if len(valid) >= 3:
            mean = sum(valid) / len(valid)
            std = (sum((v - mean) ** 2 for v in valid) / len(valid)) ** 0.5
            if std > 0:
                valid = [v for v in valid if abs(v - mean) <= 2 * std]
        
        return sum(valid) / len(valid) if valid else None
    
    def safe_min(values):
        valid = [v for v in values if v is not None]
        return min(valid) if valid else None
    
    def safe_max(values):
        valid = [v for v in values if v is not None]
        return max(valid) if valid else None
    
    # Count stations with each variable
    stations_with_temp = sum(1 for r in station_readings if r['temp_mean'] is not None)
    stations_with_humidity = sum(1 for r in station_readings if r['humidity_mean'] is not None)
    stations_with_rain = sum(1 for r in station_readings if r['rainfall_mm'] and r['rainfall_mm'] > 0)
    
    return {
        'temp_mean': safe_mean([r['temp_mean'] for r in station_readings]),
        'temp_min': safe_min([r['temp_min'] for r in station_readings]),
        'temp_max': safe_max([r['temp_max'] for r in station_readings]),
        'humidity_mean': safe_mean([r['humidity_mean'] for r in station_readings]),
        'humidity_min': safe_min([r['humidity_min'] for r in station_readings]),
        'humidity_max': safe_max([r['humidity_max'] for r in station_readings]),
        'rainfall_mm': safe_mean([r['rainfall_mm'] for r in station_readings if r['rainfall_mm'] is not None]),
        'station_count': len(station_readings),
        'stations_with_temp': stations_with_temp,
        'stations_with_humidity': stations_with_humidity,
        'stations_with_rain': stations_with_rain,
    }


def track_hours_since_rain(
    db: Session,
    zone_id: int,
    current_hour: datetime,
    current_rainfall: float
) -> int:
    """Track hours since last rainfall for wetness estimation."""
    if current_rainfall and current_rainfall > 0:
        return 0
    
    result = db.execute(text("""
        SELECT timestamp_utc, precipitation
        FROM climate_zone_hourly
        WHERE zone_id = :zone_id
          AND timestamp_utc < :current_hour
          AND timestamp_utc >= :lookback
          AND precipitation > 0
        ORDER BY timestamp_utc DESC
        LIMIT 1
    """), {
        'zone_id': zone_id,
        'current_hour': current_hour,
        'lookback': current_hour - timedelta(hours=24)
    }).fetchone()
    
    if result:
        last_rain_hour = result[0]
        if last_rain_hour.tzinfo is None:
            last_rain_hour = UTC.localize(last_rain_hour)
        current_aware = current_hour if current_hour.tzinfo else UTC.localize(current_hour)
        hours_diff = int((current_aware - last_rain_hour).total_seconds() / 3600)
        return hours_diff
    
    return 999  # No rain in last 24h


def determine_confidence(station_count: int, expected_min: int = 2) -> str:
    """Determine data confidence based on station coverage."""
    if station_count >= expected_min + 1:
        return 'high'
    elif station_count >= expected_min:
        return 'medium'
    else:
        return 'low'


# =============================================================================
# MAIN PROCESSING
# =============================================================================

def run_hourly_aggregation(
    hours_back: int = 24,
    target_date: str = None,
    dry_run: bool = False
):
    """Run hourly aggregation for zone climate data."""
    logger.info("=" * 60)
    logger.info("Hourly Climate Aggregation Service")
    logger.info("=" * 60)
    
    db = SessionLocal()
    
    try:
        # Determine time range
        if target_date:
            start_local = NZ_TZ.localize(
                datetime.strptime(target_date, '%Y-%m-%d')
            )
            end_local = start_local + timedelta(days=1)
        else:
            end_local = datetime.now(NZ_TZ).replace(minute=0, second=0, microsecond=0)
            start_local = end_local - timedelta(hours=hours_back)
        
        start_utc = start_local.astimezone(UTC)
        end_utc = end_local.astimezone(UTC)
        
        logger.info(f"Processing: {start_local} to {end_local} (NZ time)")
        logger.info(f"           {start_utc} to {end_utc} (UTC)")
        
        if dry_run:
            logger.info("[DRY RUN MODE - No changes will be saved]")
        
        # Get zone-station mappings from weather_stations table
        zone_stations = get_zone_station_mappings(db)
        logger.info(f"Found {len(zone_stations)} zones with station assignments")
        
        if not zone_stations:
            logger.warning("No zones with assigned stations found!")
            logger.info("Ensure weather_stations.zone_id is populated for your stations.")
            return
        
        # Show zone details
        for zone_id, station_ids in zone_stations.items():
            logger.info(f"  Zone {zone_id}: {len(station_ids)} stations ({station_ids})")
        
        total_records = process_time_range(db, zone_stations, start_utc, end_utc, dry_run)
        
        logger.info(f"\n{'=' * 60}")
        logger.info(f"✅ Hourly aggregation complete: {total_records} total records")
        
    except Exception as e:
        logger.error(f"Hourly aggregation failed: {e}")
        db.rollback()
        raise
    finally:
        db.close()


def run_hourly_aggregation_range(
    start_date: str,
    end_date: str = None,
    dry_run: bool = False
):
    """
    Run hourly aggregation for a date range.
    
    Processes day by day to avoid memory issues with large date ranges.
    """
    logger.info("=" * 60)
    logger.info("Hourly Climate Aggregation Service - DATE RANGE MODE")
    logger.info("=" * 60)
    
    # Parse dates
    start = datetime.strptime(start_date, '%Y-%m-%d')
    if end_date:
        end = datetime.strptime(end_date, '%Y-%m-%d')
    else:
        end = datetime.now()
    
    total_days = (end - start).days + 1
    logger.info(f"Date range: {start_date} to {end_date or 'today'} ({total_days} days)")
    
    if dry_run:
        logger.info("[DRY RUN MODE - No changes will be saved]")
    
    db = SessionLocal()
    
    try:
        # Get zone-station mappings
        zone_stations = get_zone_station_mappings(db)
        logger.info(f"Found {len(zone_stations)} zones with station assignments")
        
        if not zone_stations:
            logger.warning("No zones with assigned stations found!")
            return
        
        # Show zone details
        for zone_id, station_ids in zone_stations.items():
            logger.info(f"  Zone {zone_id}: {len(station_ids)} stations")
        
        grand_total = 0
        
        # Process day by day
        current_date = start
        day_num = 0
        
        while current_date <= end:
            day_num += 1
            date_str = current_date.strftime('%Y-%m-%d')
            
            # Convert to UTC range for this day
            start_local = NZ_TZ.localize(current_date)
            end_local = start_local + timedelta(days=1)
            start_utc = start_local.astimezone(UTC)
            end_utc = end_local.astimezone(UTC)
            
            logger.info(f"\n[{day_num}/{total_days}] Processing {date_str}...")
            
            day_records = process_time_range(db, zone_stations, start_utc, end_utc, dry_run, verbose=False)
            grand_total += day_records
            
            logger.info(f"  → {day_records} hourly records")
            
            current_date += timedelta(days=1)
        
        logger.info(f"\n{'=' * 60}")
        logger.info(f"✅ Date range complete: {grand_total} total records over {total_days} days")
        
    except Exception as e:
        logger.error(f"Date range aggregation failed: {e}")
        db.rollback()
        raise
    finally:
        db.close()


def process_time_range(
    db: Session,
    zone_stations: Dict[int, List[int]],
    start_utc: datetime,
    end_utc: datetime,
    dry_run: bool = False,
    verbose: bool = True
) -> int:
    """
    Process a time range for all zones.
    
    Returns total number of records processed.
    """
    total_records = 0
    
    for zone_id, station_ids in zone_stations.items():
        if verbose:
            logger.info(f"\nProcessing Zone {zone_id} ({len(station_ids)} stations)")
        
        # Get hourly station data
        try:
            hourly_station_data = get_hourly_station_data(
                db, station_ids, start_utc, end_utc
            )
        except Exception as e:
            logger.error(f"  Error fetching station data: {e}")
            continue
        
        if not hourly_station_data:
            if verbose:
                logger.info(f"  No data for zone {zone_id}")
            continue
        
        zone_records = 0
        
        for hour_utc, station_readings in sorted(hourly_station_data.items()):
            # Aggregate to zone level
            zone_data = aggregate_to_zone(station_readings)
            if not zone_data:
                continue
            
            # Skip if no temperature data at all
            if zone_data['temp_mean'] is None:
                continue
            
            # Convert to local time
            if hour_utc.tzinfo is None:
                hour_utc = UTC.localize(hour_utc)
            hour_local = hour_utc.astimezone(NZ_TZ)
            
            # Calculate derived fields
            dew_point = calculate_dew_point(
                zone_data['temp_mean'],
                zone_data['humidity_mean']
            )
            
            # Track hours since rain
            hours_since_rain = track_hours_since_rain(
                db, zone_id, hour_utc, zone_data['rainfall_mm']
            )
            
            # Estimate leaf wetness
            is_wet, wetness_prob, wetness_source = estimate_leaf_wetness(
                zone_data['temp_mean'],
                zone_data['humidity_mean'],
                zone_data['rainfall_mm'],
                hours_since_rain if hours_since_rain < 999 else None
            )
            
            # Confidence
            confidence = determine_confidence(zone_data['stations_with_temp'])
            
            # Vintage year
            vintage_year = get_vintage_year(hour_local)
            
            if dry_run:
                if verbose:
                    temp_str = f"{zone_data['temp_mean']:.1f}°C" if zone_data['temp_mean'] is not None else "N/A"
                    rh_str = f"{zone_data['humidity_mean']:.0f}%" if zone_data['humidity_mean'] is not None else "N/A"
                    rain_str = f"{zone_data['rainfall_mm']:.1f}mm" if zone_data['rainfall_mm'] else "0mm"
                    logger.info(
                        f"  {hour_local.strftime('%Y-%m-%d %H:%M')}: "
                        f"T={temp_str} ({zone_data['stations_with_temp']}), "
                        f"RH={rh_str} ({zone_data['stations_with_humidity']}), "
                        f"Rain={rain_str}, Wet={is_wet}"
                    )
            else:
                # Upsert record
                db.execute(text("""
                    INSERT INTO climate_zone_hourly (
                        zone_id, timestamp_utc, timestamp_local, vintage_year,
                        temp_mean, temp_min, temp_max,
                        rh_mean, rh_min, rh_max,
                        dewpoint, precipitation,
                        is_wet_hour, wetness_probability, wetness_source,
                        hours_since_rain, station_count, confidence
                    ) VALUES (
                        :zone_id, :timestamp_utc, :timestamp_local, :vintage_year,
                        :temp_mean, :temp_min, :temp_max,
                        :rh_mean, :rh_min, :rh_max,
                        :dewpoint, :precipitation,
                        :is_wet_hour, :wetness_probability, :wetness_source,
                        :hours_since_rain, :station_count, :confidence
                    )
                    ON CONFLICT (zone_id, timestamp_utc) DO UPDATE SET
                        timestamp_local = EXCLUDED.timestamp_local,
                        temp_mean = EXCLUDED.temp_mean,
                        temp_min = EXCLUDED.temp_min,
                        temp_max = EXCLUDED.temp_max,
                        rh_mean = EXCLUDED.rh_mean,
                        rh_min = EXCLUDED.rh_min,
                        rh_max = EXCLUDED.rh_max,
                        dewpoint = EXCLUDED.dewpoint,
                        precipitation = EXCLUDED.precipitation,
                        is_wet_hour = EXCLUDED.is_wet_hour,
                        wetness_probability = EXCLUDED.wetness_probability,
                        wetness_source = EXCLUDED.wetness_source,
                        hours_since_rain = EXCLUDED.hours_since_rain,
                        station_count = EXCLUDED.station_count,
                        confidence = EXCLUDED.confidence
                """), {
                    'zone_id': zone_id,
                    'timestamp_utc': hour_utc.replace(tzinfo=None),
                    'timestamp_local': hour_local.replace(tzinfo=None),
                    'vintage_year': vintage_year,
                    'temp_mean': zone_data['temp_mean'],
                    'temp_min': zone_data['temp_min'],
                    'temp_max': zone_data['temp_max'],
                    'rh_mean': zone_data['humidity_mean'],
                    'rh_min': zone_data['humidity_min'],
                    'rh_max': zone_data['humidity_max'],
                    'dewpoint': dew_point,
                    'precipitation': zone_data['rainfall_mm'],
                    'is_wet_hour': is_wet,
                    'wetness_probability': wetness_prob,
                    'wetness_source': wetness_source,
                    'hours_since_rain': hours_since_rain if hours_since_rain < 999 else None,
                    'station_count': zone_data['stations_with_temp'],
                    'confidence': confidence,
                })
            
            zone_records += 1
        
        if not dry_run:
            db.commit()
        
        if verbose:
            logger.info(f"  Processed {zone_records} hours")
        
        total_records += zone_records
    
    return total_records


def main():
    parser = argparse.ArgumentParser(description='Hourly climate aggregation')
    parser.add_argument('--hours', type=int, default=24, 
                        help='Hours to process (default: 24)')
    parser.add_argument('--date', type=str, 
                        help='Specific date to process (YYYY-MM-DD)')
    parser.add_argument('--start-date', type=str,
                        help='Start date for range (YYYY-MM-DD)')
    parser.add_argument('--end-date', type=str,
                        help='End date for range (YYYY-MM-DD), defaults to today')
    parser.add_argument('--dry-run', action='store_true',
                        help='Show without saving')
    parser.add_argument('--check-vars', action='store_true',
                        help='List available variable names in weather_data')
    parser.add_argument('--check-stations', type=int, nargs='?', const=0, default=None,
                        help='Check which stations have which variables (optionally for a specific zone_id)')
    
    args = parser.parse_args()
    
    if args.check_vars:
        db = SessionLocal()
        try:
            check_available_variables(db)
        finally:
            db.close()
    elif args.check_stations is not None:
        db = SessionLocal()
        try:
            zone_id = args.check_stations if args.check_stations > 0 else None
            check_station_variables(db, zone_id)
        finally:
            db.close()
    elif args.start_date:
        # Date range mode
        run_hourly_aggregation_range(args.start_date, args.end_date, args.dry_run)
    else:
        run_hourly_aggregation(args.hours, args.date, args.dry_run)


if __name__ == '__main__':
    main()