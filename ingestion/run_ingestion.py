"""
Main ingestion script for weather data sources
Run from GitHub Actions or locally
"""
import os
import sys
import argparse
from pathlib import Path
from datetime import datetime

# Add paths
sys.path.insert(0, str(Path(__file__).parent))

from sources.harvest import HarvestIngestion
from sources.ecan import ECANIngestion
from sources.mdc import MDCIngestion


def main():
    parser = argparse.ArgumentParser(description='Run weather data ingestion')
    parser.add_argument(
        '--source', 
        choices=['harvest', 'ecan', 'mdc', 'all'], 
        default='all',
        help='Data source to ingest'
    )
    parser.add_argument(
        '--period',
        choices=['incremental', 'backfill'],
        default='incremental',
        help='Ingestion period (incremental=recent data, backfill=all historical)'
    )
    parser.add_argument(
        '--days',
        type=int,
        default=90,
        help='Days to backfill (only used with --period backfill)'
    )
    parser.add_argument(
        '--start',
        type=str,
        metavar='DD/MM/YYYY',
        help='Explicit start date (overrides period logic)'
    )
    parser.add_argument(
        '--end',
        type=str,
        metavar='DD/MM/YYYY',
        help='Explicit end date (defaults to today)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Fetch and parse but do not insert to database'
    )
    parser.add_argument(
        '--interval',
        type=str,
        default='30 minutes',
        help='MDC data aggregation interval (e.g., "30 minutes", "1 hour"). Default: 30 minutes'
    )
    
    args = parser.parse_args()
    
    print(f"\n{'='*70}")
    print(f"  WEATHER DATA INGESTION")
    print(f"  Started: {datetime.now()}")
    print(f"  Source: {args.source.upper()}")
    print(f"  Period: {args.period.upper()}")
    if args.period == 'backfill':
        print(f"  Backfill days: {args.days}")
    if args.start:
        print(f"  Date range: {args.start} to {args.end or 'today'}")
    if args.dry_run:
        print(f"  *** DRY RUN - No data will be inserted ***")
    print(f"{'='*70}\n")
    
    # Track overall success
    success = True
    
    # Run Harvest ingestion
    if args.source in ['harvest', 'all']:
        try:
            print("▶ Starting HARVEST ingestion...\n")
            ingester = HarvestIngestion()
            ingester.run()
            print("✓ Harvest ingestion complete\n")
        except Exception as e:
            print(f"✗ Harvest ingestion failed: {e}\n")
            success = False
    
    # Run ECAN ingestion
    if args.source in ['ecan', 'all']:
        try:
            print("▶ Starting ECAN ingestion...\n")
            ingester = ECANIngestion()
            ingester.run(period=args.period)
            print("✓ ECAN ingestion complete\n")
        except Exception as e:
            print(f"✗ ECAN ingestion failed: {e}\n")
            success = False
    
    # Run MDC ingestion
    if args.source in ['mdc', 'all']:
        try:
            print("▶ Starting MDC ingestion...\n")
            ingester = MDCIngestion()
            ingester.run(
                period=args.period, 
                backfill_days=args.days,
                start_date=args.start,
                end_date=args.end,
                dry_run=args.dry_run,
                interval=args.interval
            )
            print("✓ MDC ingestion complete\n")
        except Exception as e:
            print(f"✗ MDC ingestion failed: {e}\n")
            success = False
    
    print(f"{'='*70}")
    if success:
        print(f"  ✓ ALL INGESTION COMPLETE")
    else:
        print(f"  ⚠ INGESTION COMPLETED WITH ERRORS")
    print(f"  Finished: {datetime.now()}")
    print(f"{'='*70}\n")
    
    # Exit with error code if failed (for GitHub Actions)
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()