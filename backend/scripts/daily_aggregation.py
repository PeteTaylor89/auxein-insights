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
    python scripts/daily_aggregation.py --start 2025-07-29 --end 2026-07-28 --source SOUTHLAND
                                                                 # Backfill one source only
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

from sqlalchemy import func, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from db.session import SessionLocal
from db.models.weather import WeatherStation
from db.models.realtime_climate import WeatherDataDaily

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

NZ_TZ = pytz.timezone('Pacific/Auckland')

# Variable aliases, collapsed consistently with hourly_aggregation.py.
TEMP_VARS = ('temp', 'temperature', 'air_temperature')
RH_VARS = ('rh', 'humidity', 'relative_humidity')
RAIN_VARS = ('rainfall', 'precipitation', 'precip', 'rain')
SOLAR_VARS = ('solar_radiation', 'solar', 'radiation')

# A daily min/max needs enough observations through the day to actually contain
# the dawn trough and the afternoon peak. Below this floor we publish NOTHING for
# temperature rather than a number that looks like a statistic and is not one.
#
# This is the check that was missing. Seven Hilltop councils spent 2020-2026
# storing ONE observation per station-day — taken at midnight — and MIN/MAX/AVG
# over that single row produced temp_min == temp_max == temp_mean on 177,536
# station-days, silently, because the arithmetic was never wrong. See
# docs/Bugs/Current/HILLTOP_TEMPERATURE_DEGENERATE_2026-08-19.md.
#
# 4 is deliberately permissive. It kills the degenerate 1-3 record case without
# discarding genuinely coarse networks — 3-hourly SYNOP gives 8 obs/day, which is
# imperfect for extremes but is standard practice and real data. Raise it toward
# 24 if the archive is ever rebuilt at hourly or better throughout.
MIN_TEMP_RECORDS_FOR_DAILY = 4

# Columns this script is the SOLE writer of, so a value it computes — including a
# deliberate NULL — must always win on upsert.
#
# Everything else is protected by the B4.1 guard (COALESCE(EXCLUDED, existing)),
# which exists because `rainfall_mm` has a SECOND writer: an authoritative
# GHCN-Daily PRCP that a NULL from a precip-less hourly source must not clobber.
# Temperature has no second writer.
#
# Without this split the two guards contradict each other and B4.1 wins silently:
# MIN_TEMP_RECORDS_FOR_DAILY computes temp_min=NULL for a one-observation day, the
# COALESCE restores the stored 13.30, and 5,483 fabricated extremes survive a
# re-aggregation that reported success. Found 2026-08-19 after the temperature
# backfill; see docs/Bugs/Current/HILLTOP_TEMPERATURE_DEGENERATE_2026-08-19.md.
TEMP_AUTHORITATIVE_COLUMNS = (
    'temp_min', 'temp_max', 'temp_mean',
    'temp_record_count', 'gdd_base0', 'gdd_base10',
)

# Observations marked QUARANTINED are excluded from every daily statistic. The rows
# stay in the raw table on purpose — a failed sensor is evidence, and deleting it
# makes the failure unprovable and the gap indistinguishable from "never reported".
# Marking is per (station, variable, time window), so a station whose thermometer
# died in July keeps its five good years.
QUARANTINE_QUALITY = 'QUARANTINED'

# How many days each set-based query spans. Raw obs are yearly-partitioned, so a
# month keeps every chunk inside one partition while bounding the scan.
DEFAULT_CHUNK_DAYS = 31


def get_active_stations(db, zone_id: Optional[int] = None,
                        source: Optional[str] = None) -> List[dict]:
    """Get active weather stations, optionally filtered by zone_id and/or data_source.

    The source filter exists for backfilling a council that was seeded after the
    rollup was already running: zone_id can't scope those (new stations are seeded
    with a NULL zone), and without it every run walks all active stations per day.
    """
    query = db.query(WeatherStation).filter(
        WeatherStation.is_active == True
    )
    if zone_id is not None:
        query = query.filter(WeatherStation.zone_id == zone_id)
    if source is not None:
        query = query.filter(WeatherStation.data_source == source.upper())

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
          AND coalesce(quality, '') <> :quarantine
    """), {
        'quarantine': QUARANTINE_QUALITY,
        'station_id': station_id,
        'start_dt': start_dt,
        'end_dt': end_dt,
    })

    row = result.mappings().fetchone()
    if not row or row['total_count'] == 0:
        return None

    # Delegate to the shared builder so the per-day and set-based paths cannot
    # drift apart. They already had: this block was a verbatim copy that the
    # docstring on _build_record claimed was shared, and the temperature guard
    # would have landed in only one of them.
    return _build_record(station_id, target_date, row)


def _build_record(station_id: int, target_date: date, row) -> dict:
    """Shape one aggregated row into a weather_data_daily record.

    Shared by the per-day and set-based paths so both derive GDD and apply the
    B4.1 rainfall guard identically.
    """
    temp_count = row['temp_count'] or 0
    temp_min = row['temp_min']
    temp_max = row['temp_max']
    temp_mean = row['temp_mean']
    gdd_base0 = None
    gdd_base10 = None

    # Too few observations to characterise a day: withhold all three statistics
    # rather than emit a spot reading dressed as a min, a max and a mean. GDD goes
    # with them — it is derived from temp_mean, so a fabricated mean fabricates a
    # season total. temp_record_count is still written, so a withheld day is
    # auditable rather than merely absent.
    if temp_count < MIN_TEMP_RECORDS_FOR_DAILY:
        temp_min = temp_max = temp_mean = None

    if temp_mean is not None:
        temp_mean = Decimal(str(temp_mean))
        gdd_base0 = max(Decimal('0'), temp_mean)
        gdd_base10 = max(Decimal('0'), temp_mean - Decimal('10'))

    return {
        'station_id': station_id,
        'date': target_date,
        'temp_min': temp_min,
        'temp_max': temp_max,
        'temp_mean': temp_mean,
        'humidity_min': row['humidity_min'],
        'humidity_max': row['humidity_max'],
        'humidity_mean': row['humidity_mean'],
        # B4.1 guard: leave NULL when there are no rainfall obs — do NOT fabricate
        # a 0mm reading for rainfall-less stations (GHCNh/SYNOP carry no/sparse
        # hourly precip). A spurious 0 pollutes zone rainfall averages and, on a
        # historical backdate, would clobber a real authoritative daily PRCP.
        # SUM returns NULL iff no rainfall rows matched (a genuine 0mm day still
        # sums to 0, which is kept).
        'rainfall_mm': row['rainfall_sum'],
        'solar_radiation': row['solar_sum'],
        'gdd_base0': gdd_base0,
        'gdd_base10': gdd_base10,
        'temp_record_count': row['temp_count'] or 0,
        'humidity_record_count': row['humidity_count'] or 0,
        'rainfall_record_count': row['rainfall_count'] or 0,
    }


# One GROUP BY over a whole (stations x date-range) block, instead of one query
# per station-day. The per-day path cost ~1 RDS round-trip each; at ~1M
# outstanding station-days that was over a dozen hours of pure latency and it
# gated the surface backfill.
#
# The NZ-local day boundary is preserved exactly: `timestamp AT TIME ZONE
# 'Pacific/Auckland'` converts the stored timestamptz to NZ wall-clock, and
# ::date takes the local calendar day — the same partition the per-day path got
# from NZ_TZ.localize(midnight) bounds, DST included (NZ transitions at 2/3am,
# so local midnight is never ambiguous).
AGGREGATE_RANGE_SQL = text(f"""
    SELECT
        station_id,
        (timestamp AT TIME ZONE 'Pacific/Auckland')::date AS obs_date,
        MIN(CASE WHEN variable IN {TEMP_VARS} THEN value END) as temp_min,
        MAX(CASE WHEN variable IN {TEMP_VARS} THEN value END) as temp_max,
        AVG(CASE WHEN variable IN {TEMP_VARS} THEN value END) as temp_mean,
        COUNT(CASE WHEN variable IN {TEMP_VARS} THEN 1 END) as temp_count,
        MIN(CASE WHEN variable IN {RH_VARS} THEN value END) as humidity_min,
        MAX(CASE WHEN variable IN {RH_VARS} THEN value END) as humidity_max,
        AVG(CASE WHEN variable IN {RH_VARS} THEN value END) as humidity_mean,
        COUNT(CASE WHEN variable IN {RH_VARS} THEN 1 END) as humidity_count,
        SUM(CASE WHEN variable IN {RAIN_VARS} THEN value END) as rainfall_sum,
        COUNT(CASE WHEN variable IN {RAIN_VARS} THEN 1 END) as rainfall_count,
        SUM(CASE WHEN variable IN {SOLAR_VARS} THEN value END) as solar_sum,
        COUNT(*) as total_count
    FROM weather_data
    WHERE station_id = ANY(:station_ids)
      AND timestamp >= :start_dt
      AND timestamp < :end_dt
      AND value IS NOT NULL
      AND coalesce(quality, '') <> '{QUARANTINE_QUALITY}'
    GROUP BY station_id, 2
""")


def aggregate_range(
    db,
    station_ids: List[int],
    start_date: date,
    end_date: date,
) -> List[dict]:
    """Aggregate every (station, day) in [start_date, end_date] in one query.

    Returns a list of records. A station-day with no non-NULL observations
    simply produces no group, which is the set-based equivalent of the per-day
    path's `total_count == 0 -> return None`.
    """
    start_dt = NZ_TZ.localize(datetime.combine(start_date, datetime.min.time()))
    end_dt = NZ_TZ.localize(datetime.combine(end_date + timedelta(days=1), datetime.min.time()))

    rows = db.execute(AGGREGATE_RANGE_SQL, {
        'station_ids': list(station_ids),
        'start_dt': start_dt,
        'end_dt': end_dt,
    }).mappings().all()

    return [_build_record(r['station_id'], r['obs_date'], r) for r in rows]


def bulk_upsert_daily_records(db, records: List[dict]) -> int:
    """Upsert many daily records in a single statement.

    COALESCE(EXCLUDED.col, existing.col) reproduces the per-row B4.1 guard: a
    NULL in the incoming row never clobbers a stored non-NULL value.
    """
    if not records:
        return 0

    table = WeatherDataDaily.__table__
    stmt = pg_insert(table).values(records)
    update_cols = {
        c.name: (stmt.excluded[c.name]
                 if c.name in TEMP_AUTHORITATIVE_COLUMNS
                 else func.coalesce(stmt.excluded[c.name], table.c[c.name]))
        for c in table.columns
        if c.name not in ('id', 'station_id', 'date', 'created_at')
    }
    stmt = stmt.on_conflict_do_update(
        index_elements=['station_id', 'date'],
        set_=update_cols,
    )
    db.execute(stmt)
    return len(records)


def upsert_daily_record(db, record: dict) -> bool:
    """Insert or update a daily aggregate record."""
    existing = db.query(WeatherDataDaily).filter(
        WeatherDataDaily.station_id == record['station_id'],
        WeatherDataDaily.date == record['date']
    ).first()
    
    if existing:
        # Update
        for key, value in record.items():
            if key in ('station_id', 'date'):
                continue
            # B4.1 guard: never overwrite an existing non-NULL value with NULL.
            # GHCNh hourly carries no precip, so re-aggregating a station-day that
            # already has an authoritative GHCN-Daily PRCP (or any source-supplied
            # value) must not clobber it back to NULL. Genuinely new fields and
            # real updates (non-None values) still apply.
            if (value is None and getattr(existing, key) is not None
                    and key not in TEMP_AUTHORITATIVE_COLUMNS):
                continue
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


def process_chunk(
    db,
    station_ids: List[int],
    chunk_start: date,
    chunk_end: date,
    dry_run: bool = False,
) -> int:
    """Aggregate and upsert one contiguous date block. Returns records written."""
    records = aggregate_range(db, station_ids, chunk_start, chunk_end)

    if dry_run:
        return len(records)

    written = bulk_upsert_daily_records(db, records)
    db.commit()
    return written


def run_daily_aggregation(
    target_date: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    dry_run: bool = False,
    zone_id: Optional[int] = None,
    source: Optional[str] = None,
    chunk_days: int = DEFAULT_CHUNK_DAYS,
):
    """Run daily aggregation for specified date(s), optionally filtered to a single
    zone and/or data source."""

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
    if source is not None:
        logger.info(f"Source filter: {source.upper()}")

    if dry_run:
        logger.info("[DRY RUN MODE]")

    db = SessionLocal()

    try:
        # Get active stations
        stations = get_active_stations(db, zone_id=zone_id, source=source)
        logger.info(f"Found {len(stations)} active weather stations")
        if not stations:
            logger.warning("No stations matched the filters — nothing to do.")
            return
        
        station_ids = [s['station_id'] for s in stations]

        # Walk the range in contiguous blocks — one query per block rather than
        # one per station-day.
        records_written = 0
        chunks = 0
        span_start = dates_to_process[0]
        span_end = dates_to_process[-1]

        cursor = span_start
        while cursor <= span_end:
            chunk_end = min(cursor + timedelta(days=chunk_days - 1), span_end)
            written = process_chunk(db, station_ids, cursor, chunk_end, dry_run)
            records_written += written
            chunks += 1
            logger.info(f"  {cursor} → {chunk_end}: {written} records")
            cursor = chunk_end + timedelta(days=1)

        # Summary
        logger.info(f"\n{'='*60}")
        logger.info("DAILY AGGREGATION SUMMARY")
        logger.info(f"{'='*60}")
        logger.info(f"Dates processed:    {len(dates_to_process)}")
        logger.info(f"Chunks (queries):   {chunks}")
        logger.info(f"Records written:    {records_written}")

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
    parser.add_argument('--source', type=str,
                        help='Process only stations from this data_source (e.g. SOUTHLAND, NRC)')
    parser.add_argument('--chunk-days', type=int, default=DEFAULT_CHUNK_DAYS,
                        help=f'Days per aggregation query (default {DEFAULT_CHUNK_DAYS})')

    args = parser.parse_args()

    run_daily_aggregation(
        target_date=args.date,
        start_date=args.start,
        end_date=args.end,
        dry_run=args.dry_run,
        zone_id=args.zone_id,
        source=args.source,
        chunk_days=args.chunk_days,
    )


if __name__ == '__main__':
    main()