#!/usr/bin/env python3
"""
scripts/run_daily_processing.py

Run the complete daily processing pipeline:
1. Daily aggregation (weather_data → weather_data_daily)
2. Hourly aggregation (weather_data → climate_zone_hourly)
3. Zone aggregation (weather_data_daily → climate_zone_daily)
4. Phenology estimation
5. Disease pressure calculation (v2 - uses hourly data)

Designed to run daily at 6pm NZ time after all data sources have reported.

Usage:
    python scripts/run_daily_processing.py                    # Process yesterday
    python scripts/run_daily_processing.py --date 2025-12-15  # Specific date
    python scripts/run_daily_processing.py --dry-run          # Test run
"""

import argparse
import logging
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

import pytz

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

NZ_TZ = pytz.timezone('Pacific/Auckland')
SCRIPT_DIR = Path(__file__).parent


def run_script(script_name: str, args: list) -> bool:
    """Run a processing script and return success status."""
    script_path = SCRIPT_DIR / script_name
    
    if not script_path.exists():
        logger.error(f"  ✗ Script not found: {script_name}")
        return False
    
    cmd = [sys.executable, str(script_path)] + args
    logger.info(f"  Running: {script_name} {' '.join(args)}")
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)  # 30 min timeout
        
        # Show output
        if result.stdout:
            for line in result.stdout.strip().split('\n')[-5:]:  # Last 5 lines
                logger.info(f"    {line}")
        
        if result.returncode == 0:
            logger.info(f"  ✓ {script_name} completed")
            return True
        else:
            logger.error(f"  ✗ {script_name} failed (exit code {result.returncode})")
            if result.stderr:
                logger.error(f"    {result.stderr[:500]}")
            return False
            
    except subprocess.TimeoutExpired:
        logger.error(f"  ✗ {script_name} timed out (30 min)")
        return False
    except Exception as e:
        logger.error(f"  ✗ Error running {script_name}: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description='Run daily processing pipeline')
    parser.add_argument('--date', type=str, help='Process specific date (YYYY-MM-DD)')
    parser.add_argument('--dry-run', action='store_true', help='Test run without changes')
    parser.add_argument('--skip-daily', action='store_true', help='Skip daily aggregation')
    parser.add_argument('--skip-hourly', action='store_true', help='Skip hourly aggregation')
    parser.add_argument('--skip-zone', action='store_true', help='Skip zone aggregation')
    parser.add_argument('--skip-phenology', action='store_true', help='Skip phenology')
    parser.add_argument('--skip-disease', action='store_true', help='Skip disease pressure')
    
    args = parser.parse_args()
    
    # Determine target date
    if args.date:
        target_date = args.date
    else:
        yesterday = (datetime.now(NZ_TZ) - timedelta(days=1)).date()
        target_date = yesterday.strftime('%Y-%m-%d')
    
    logger.info("=" * 60)
    logger.info("AUXEIN DAILY PROCESSING PIPELINE")
    logger.info("=" * 60)
    logger.info(f"Target date:  {target_date}")
    logger.info(f"Run time:     {datetime.now(NZ_TZ).strftime('%Y-%m-%d %H:%M:%S %Z')}")
    logger.info(f"Dry run:      {args.dry_run}")
    logger.info("=" * 60)
    
    results = {}
    
    # =========================================================================
    # Step 1: Daily Aggregation (weather_data → weather_data_daily)
    # =========================================================================
    if not args.skip_daily:
        logger.info("\n[1/5] DAILY AGGREGATION (weather_data → weather_data_daily)")
        daily_args = ['--date', target_date]
        if args.dry_run:
            daily_args.append('--dry-run')
        results['daily_aggregation'] = run_script('daily_aggregation.py', daily_args)
    else:
        logger.info("\n[1/5] DAILY AGGREGATION - SKIPPED")
        results['daily_aggregation'] = True
    
    # =========================================================================
    # Step 2: Hourly Aggregation (weather_data → climate_zone_hourly)
    # =========================================================================
    if not args.skip_hourly:
        logger.info("\n[2/5] HOURLY AGGREGATION (weather_data → climate_zone_hourly)")
        hourly_args = ['--date', target_date]
        if args.dry_run:
            hourly_args.append('--dry-run')
        results['hourly_aggregation'] = run_script('hourly_aggregation.py', hourly_args)
    else:
        logger.info("\n[2/5] HOURLY AGGREGATION - SKIPPED")
        results['hourly_aggregation'] = True
    
    # =========================================================================
    # Step 3: Zone Aggregation (weather_data_daily → climate_zone_daily)
    # =========================================================================
    if not args.skip_zone:
        logger.info("\n[3/5] ZONE AGGREGATION (weather_data_daily → climate_zone_daily)")
        zone_args = ['--date', target_date]
        if args.dry_run:
            zone_args.append('--dry-run')
        results['zone_aggregation'] = run_script('zone_aggregation.py', zone_args)
    else:
        logger.info("\n[3/5] ZONE AGGREGATION - SKIPPED")
        results['zone_aggregation'] = True
    
    # =========================================================================
    # Step 4: Phenology Estimation
    # =========================================================================
    if not args.skip_phenology:
        logger.info("\n[4/5] PHENOLOGY ESTIMATION")
        pheno_args = ['--date', target_date]
        if args.dry_run:
            pheno_args.append('--dry-run')
        results['phenology'] = run_script('phenology_service.py', pheno_args)
    else:
        logger.info("\n[4/5] PHENOLOGY - SKIPPED")
        results['phenology'] = True
    
    # =========================================================================
    # Step 5: Disease Pressure (v2 - uses hourly data)
    # =========================================================================
    if not args.skip_disease:
        logger.info("\n[5/5] DISEASE PRESSURE (v2 - hourly data)")
        disease_args = ['--date', target_date]
        if args.dry_run:
            disease_args.append('--dry-run')
        results['disease'] = run_script('disease_service_v2.py', disease_args)
    else:
        logger.info("\n[5/5] DISEASE PRESSURE - SKIPPED")
        results['disease'] = True
    
    # =========================================================================
    # Summary
    # =========================================================================
    logger.info("\n" + "=" * 60)
    logger.info("PIPELINE SUMMARY")
    logger.info("=" * 60)
    
    step_names = {
        'daily_aggregation': 'Daily Aggregation',
        'hourly_aggregation': 'Hourly Aggregation',
        'zone_aggregation': 'Zone Aggregation',
        'phenology': 'Phenology',
        'disease': 'Disease Pressure'
    }
    
    for step, success in results.items():
        status = '✓' if success else '✗'
        logger.info(f"  {status} {step_names.get(step, step)}")
    
    if all(results.values()):
        logger.info("\n✅ All steps completed successfully")
        sys.exit(0)
    else:
        failed = [k for k, v in results.items() if not v]
        logger.error(f"\n❌ Failed steps: {', '.join(failed)}")
        sys.exit(1)


if __name__ == '__main__':
    main()