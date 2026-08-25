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
from datetime import date, datetime, timedelta
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
    parser.add_argument('--skip-qc', action='store_true',
                        help='Skip the QC check/clean stage. NOT recommended — '
                             'the zone rollups, disease and phenology have no '
                             'other guard against a bad station.')
    parser.add_argument('--max-reject-rate', type=float, default=0.05,
                        help='QC refuses to act if rejects exceed this share of '
                             'station-days. A rule that suddenly rejects the '
                             'network is far more likely to be a broken rule '
                             'than a broken network.')
    parser.add_argument('--skip-hourly', action='store_true', help='Skip hourly aggregation')
    parser.add_argument('--skip-zone', action='store_true', help='Skip zone aggregation')
    parser.add_argument('--skip-phenology', action='store_true', help='Skip phenology')
    parser.add_argument('--skip-disease', action='store_true', help='Skip disease pressure')
    parser.add_argument('--zone-id', type=int, help='Process only this zone (passed to all sub-scripts)')
    parser.add_argument(
        '--lookback-days', type=int, default=3,
        help='Re-aggregate this many days BEFORE the target date as well (default 3). '
             'Makes the daily rollup self-healing: a skipped or failed run is repaired '
             'by the next one instead of leaving a permanent hole.')

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
    if args.zone_id:
        logger.info(f"Zone filter:  {args.zone_id}")
    logger.info(f"Run time:     {datetime.now(NZ_TZ).strftime('%Y-%m-%d %H:%M:%S %Z')}")
    logger.info(f"Dry run:      {args.dry_run}")
    logger.info("=" * 60)
    
    results = {}

    # Hoisted: the QC stage needs this window too, and it used to be defined
    # only inside the aggregation branch — so `--skip-daily` alone raised
    # NameError before QC ever ran.
    start_date = (date.fromisoformat(target_date)
                  - timedelta(days=max(0, args.lookback_days))).isoformat()

    # =========================================================================
    # Step 1: Daily Aggregation (weather_data → weather_data_daily)
    # =========================================================================
    if not args.skip_daily:
        logger.info("\n[1/6] DAILY AGGREGATION (weather_data → weather_data_daily)")
        # Aggregate a WINDOW, not a single day. This job used to pass `--date
        # <yesterday>` and nothing else, so a run that was skipped, failed, or dropped
        # by the scheduler left that day permanently un-aggregated — the raw
        # observations were present and the daily row simply never appeared. That is
        # how 2026-08-12 lost a full day of SYNOP (8,086 raw rows, 48 stations, no
        # daily row) and how seven sources drifted two days behind, all while the
        # scheduled workflow reported success.
        #
        # daily_aggregation is idempotent (upsert on station_id+date) and set-based,
        # so re-aggregating a few recent days is close to free and repairs any hole
        # inside the window automatically.
        daily_args = (['--date', target_date] if args.lookback_days <= 0
                      else ['--start', start_date, '--end', target_date])
        if args.dry_run:
            daily_args.append('--dry-run')
        if args.zone_id:
            daily_args.extend(['--zone-id', str(args.zone_id)])
        logger.info(f"      window: {start_date} -> {target_date} "
                    f"(lookback {args.lookback_days}d, self-healing)")
        results['daily_aggregation'] = run_script('daily_aggregation.py', daily_args)
    else:
        logger.info("\n[1/6] DAILY AGGREGATION - SKIPPED")
        results['daily_aggregation'] = True

    # =========================================================================
    # Step 1b: QC — check and clean weather_data_daily
    # =========================================================================
    # Runs HERE, between aggregation and every consumer, because a fit-time
    # screen protects only the surface. The same bad value otherwise flows
    # straight into climate_zone_daily, disease pressure and phenology, and
    # those have no equivalent guard at all.
    #
    # It also re-applies standing quarantine windows to late-arriving data,
    # which is not optional: station 473's quarantined values were back in the
    # daily table within the hour, because a quarantine is a one-time UPDATE
    # while the hourly ingest keeps delivering rows for days already covered.
    if not args.skip_qc:
        logger.info("\n[1b/6] DAILY QC (check + clean weather_data_daily)")
        qc_args = ['--start', start_date, '--end', target_date,
                   '--max-reject-rate', str(args.max_reject_rate)]
        if not args.dry_run:
            qc_args.append('--apply')
        results['daily_qc'] = run_script('daily_qc.py', qc_args)
    else:
        logger.info("\n[1b/6] DAILY QC - SKIPPED")
        results['daily_qc'] = True

    # =========================================================================
    # Step 2: Hourly Aggregation (weather_data → climate_zone_hourly)
    # =========================================================================
    if not args.skip_hourly:
        logger.info("\n[2/6] HOURLY AGGREGATION (weather_data → climate_zone_hourly)")
        hourly_args = ['--date', target_date]
        if args.dry_run:
            hourly_args.append('--dry-run')
        if args.zone_id:
            hourly_args.extend(['--zone-id', str(args.zone_id)])
        results['hourly_aggregation'] = run_script('hourly_aggregation.py', hourly_args)
    else:
        logger.info("\n[2/6] HOURLY AGGREGATION - SKIPPED")
        results['hourly_aggregation'] = True
    
    # =========================================================================
    # Step 3: Zone Aggregation (weather_data_daily → climate_zone_daily)
    # =========================================================================
    if not args.skip_zone:
        logger.info("\n[3/6] ZONE AGGREGATION (weather_data_daily → climate_zone_daily)")
        zone_args = ['--date', target_date]
        if args.dry_run:
            zone_args.append('--dry-run')
        if args.zone_id:
            zone_args.extend(['--zone-id', str(args.zone_id)])
        results['zone_aggregation'] = run_script('zone_aggregation.py', zone_args)
    else:
        logger.info("\n[3/6] ZONE AGGREGATION - SKIPPED")
        results['zone_aggregation'] = True
    
    # =========================================================================
    # Step 4: Phenology Estimation
    # =========================================================================
    if not args.skip_phenology:
        logger.info("\n[4/6] PHENOLOGY ESTIMATION")
        pheno_args = ['--date', target_date]
        if args.dry_run:
            pheno_args.append('--dry-run')
        if args.zone_id:
            pheno_args.extend(['--zone-id', str(args.zone_id)])
        results['phenology'] = run_script('phenology_service.py', pheno_args)
    else:
        logger.info("\n[4/6] PHENOLOGY - SKIPPED")
        results['phenology'] = True
    
    # =========================================================================
    # Step 5: Disease Pressure (v2 - uses hourly data)
    # =========================================================================
    if not args.skip_disease:
        logger.info("\n[5/6] DISEASE PRESSURE (v2 - hourly data)")
        disease_args = ['--date', target_date]
        if args.dry_run:
            disease_args.append('--dry-run')
        if args.zone_id:
            disease_args.extend(['--zone-id', str(args.zone_id)])
        results['disease'] = run_script('disease_service_v2.py', disease_args)
    else:
        logger.info("\n[5/6] DISEASE PRESSURE - SKIPPED")
        results['disease'] = True
    
    # =========================================================================
    # Step 6: Token Blacklist Cleanup
    # =========================================================================
    logger.info("\n[6/6] TOKEN BLACKLIST CLEANUP")
    results['blacklist_cleanup'] = run_script('cleanup_blacklist.py', [])

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
        'disease': 'Disease Pressure',
        'blacklist_cleanup': 'Token Blacklist Cleanup'
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