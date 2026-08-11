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
from sources.gw import GWIngestion
from sources.wcrc import WCRCIngestion
from sources.horizons import HorizonsIngestion
from sources.hbrc import HBRCIngestion
from sources.tdc import TDCIngestion
from sources.gdc import GDCIngestion
from sources.southland import SouthlandIngestion
from sources.nrc import NRCIngestion
from sources.trc import TRCIngestion
from sources.boprc import BoPRCIngestion
from sources.noaa import NoaaIngestion
from sources.synop import SynopIngestion


def main():
    parser = argparse.ArgumentParser(description='Run weather data ingestion')
    parser.add_argument(
        '--source', 
        choices=['harvest', 'ecan', 'mdc', 'gw', 'hbrc', 'tdc', 'gdc', 'southland', 'nrc', 'wcrc', 'horizons', 'trc', 'boprc', 'noaa', 'synop', 'all'],
        default='all',
        help='Data source to ingest (noaa/synop are backfill/bootstrap and boprc is '
             'still access-gated, so all three are excluded from "all")'
    )
    parser.add_argument(
        '--mode',
        choices=['hourly', 'daily'],
        default='hourly',
        help='NOAA only: GHCNh hourly (default) or GHCN-Daily'
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
        '--station',
        type=str,
        help='Station code to backfill a single station (e.g., HBRC_BRIDGE_PA, MDC_BLENHEIM_OFFICE)'
    )
    parser.add_argument(
        '--credential-ref',
        type=str,
        dest='credential_ref',
        help='Harvest only: scope ingestion to devices using this api_credential_ref '
             '(e.g., harvest/codc to backfill just that customer). Omit to run the whole fleet.'
    )
    parser.add_argument(
        '--reconcile',
        action='store_true',
        help='SYNOP only: run the NOAA authoritative pass to promote provisional rows'
    )
    parser.add_argument(
        '--interval',
        type=str,
        default='30 minutes',
        help='MDC/GW/HBRC/TDC data aggregation interval (e.g., "30 minutes", "1 hour"). Default: 30 minutes'
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
    if args.station:
        print(f"  Station: {args.station}")
    if args.credential_ref:
        print(f"  Credential ref: {args.credential_ref}")
    if args.dry_run:
        print(f"  *** DRY RUN - No data will be inserted ***")
    print(f"{'='*70}\n")
    
    # Track overall success
    success = True
    
    # Run Harvest ingestion
    if args.source in ['harvest', 'all']:
        try:
            print("▶ Starting HARVEST ingestion...\n")
            # Build a credential resolver that lives for the whole Harvest run
            # so per-process caching kicks in (one Secrets Manager call per ref,
            # not per device).
            from db_connection import get_ingestion_session
            from services.credential_service import CredentialResolver

            cred_session = get_ingestion_session()()
            resolver = CredentialResolver(db=cred_session)
            try:
                ingester = HarvestIngestion(resolver=resolver)
                ingester.run(
                    start_date=args.start,
                    end_date=args.end,
                    station_code=args.station,
                    credential_ref=args.credential_ref,
                    dry_run=args.dry_run,
                )
                print("✓ Harvest ingestion complete\n")
            finally:
                # The credential session sits idle through the entire Harvest
                # run (resolver caches values after initial pre-resolve), so
                # AWS RDS / the network may close the connection before we
                # get here. We don't care — no work is pending on this
                # session at this point.
                try:
                    cred_session.close()
                except Exception as close_err:
                    print(f"  (note: credential session close raised: {close_err})\n")
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
                interval=args.interval,
                station_code=args.station
            )
            print("✓ MDC ingestion complete\n")
        except Exception as e:
            print(f"✗ MDC ingestion failed: {e}\n")
            success = False
    
    # Run GW ingestion
    if args.source in ['gw', 'all']:
        try:
            print("▶ Starting GW ingestion...\n")
            ingester = GWIngestion()
            ingester.run(
                period=args.period, 
                backfill_days=args.days,
                start_date=args.start,
                end_date=args.end,
                dry_run=args.dry_run,
                interval=args.interval,
                station_code=args.station
            )
            print("✓ GW ingestion complete\n")
        except Exception as e:
            print(f"✗ GW ingestion failed: {e}\n")
            success = False

    # Run WCRC ingestion
    if args.source in ['wcrc', 'all']:
        try:
            print("▶ Starting WCRC ingestion...\n")
            ingester = WCRCIngestion()
            ingester.run(
                period=args.period,
                backfill_days=args.days,
                start_date=args.start,
                end_date=args.end,
                dry_run=args.dry_run,
                interval=args.interval,
                station_code=args.station
            )
            print("✓ WCRC ingestion complete\n")
        except Exception as e:
            print(f"✗ WCRC ingestion failed: {e}\n")
            success = False

    # Run Horizons (Manawatu-Whanganui) ingestion
    if args.source in ['horizons', 'all']:
        try:
            print("▶ Starting Horizons ingestion...\n")
            ingester = HorizonsIngestion()
            ingester.run(
                period=args.period,
                backfill_days=args.days,
                start_date=args.start,
                end_date=args.end,
                dry_run=args.dry_run,
                interval=args.interval,
                station_code=args.station
            )
            print("✓ Horizons ingestion complete\n")
        except Exception as e:
            print(f"✗ Horizons ingestion failed: {e}\n")
            success = False

    # Run HBRC ingestion
    if args.source in ['hbrc', 'all']:
        try:
            print("▶ Starting HBRC ingestion...\n")
            ingester = HBRCIngestion()
            ingester.run(
                period=args.period, 
                backfill_days=args.days,
                start_date=args.start,
                end_date=args.end,
                dry_run=args.dry_run,
                interval=args.interval,
                station_code=args.station
            )
            print("✓ HBRC ingestion complete\n")
        except Exception as e:
            print(f"✗ HBRC ingestion failed: {e}\n")
            success = False
    
    # Run TDC ingestion
    if args.source in ['tdc', 'all']:
        try:
            print("▶ Starting TDC ingestion...\n")
            ingester = TDCIngestion()
            ingester.run(
                period=args.period,
                backfill_days=args.days,
                start_date=args.start,
                end_date=args.end,
                dry_run=args.dry_run,
                interval=args.interval,
                station_code=args.station
            )
            print("✓ TDC ingestion complete\n")
        except Exception as e:
            print(f"✗ TDC ingestion failed: {e}\n")
            success = False

    # Run GDC ingestion
    if args.source in ['gdc', 'all']:
        try:
            print("▶ Starting GDC ingestion...\n")
            ingester = GDCIngestion()
            ingester.run(
                period=args.period,
                backfill_days=args.days,
                start_date=args.start,
                end_date=args.end,
                dry_run=args.dry_run,
                interval=args.interval,
                station_code=args.station
            )
            print("✓ GDC ingestion complete\n")
        except Exception as e:
            print(f"✗ GDC ingestion failed: {e}\n")
            success = False

    # Run Southland (Environment Southland) ingestion
    if args.source in ['southland', 'all']:
        try:
            print("▶ Starting Southland ingestion...\n")
            ingester = SouthlandIngestion()
            ingester.run(
                period=args.period,
                backfill_days=args.days,
                start_date=args.start,
                end_date=args.end,
                dry_run=args.dry_run,
                interval=args.interval,
                station_code=args.station
            )
            print("✓ Southland ingestion complete\n")
        except Exception as e:
            print(f"✗ Southland ingestion failed: {e}\n")
            success = False

    # Run NRC (Northland) ingestion
    if args.source in ['nrc', 'all']:
        try:
            print("▶ Starting NRC ingestion...\n")
            ingester = NRCIngestion()
            ingester.run(
                period=args.period,
                backfill_days=args.days,
                start_date=args.start,
                end_date=args.end,
                dry_run=args.dry_run,
                interval=args.interval,
                station_code=args.station
            )
            print("✓ NRC ingestion complete\n")
        except Exception as e:
            print(f"✗ NRC ingestion failed: {e}\n")
            success = False

    # Run TRC (Taranaki) ingestion
    if args.source in ['trc', 'all']:
        try:
            print("▶ Starting TRC ingestion...\n")
            ingester = TRCIngestion()
            ingester.run(
                period=args.period,
                backfill_days=args.days,
                start_date=args.start,
                end_date=args.end,
                dry_run=args.dry_run,
                interval=args.interval,
                station_code=args.station
            )
            print("✓ TRC ingestion complete\n")
        except Exception as e:
            print(f"✗ TRC ingestion failed: {e}\n")
            success = False

    # Run BoP (Bay of Plenty, AQUARIUS) ingestion.
    # Explicit only, NOT part of 'all': the portal publishes catalogue metadata
    # anonymously and gates every value path, so an hourly run would do nothing but
    # add a round-trip and a GATED line to the log. Wire it into run_all.sh only once
    # `python ingestion/sources/boprc.py --check-access` reports OPEN.
    if args.source == 'boprc':
        try:
            print("▶ Starting BoP (BOPRC) ingestion...\n")
            ingester = BoPRCIngestion()
            ingester.run(
                period=args.period,
                backfill_days=args.days,
                start_date=args.start,
                end_date=args.end,
                dry_run=args.dry_run,
                interval=args.interval,
                station_code=args.station
            )
            print("✓ BoP ingestion step complete\n")
        except Exception as e:
            print(f"✗ BoP ingestion failed: {e}\n")
            success = False

    # Run NOAA NCEI ingestion (backfill/authoritative — explicit only, not 'all')
    if args.source == 'noaa':
        try:
            print(f"▶ Starting NOAA ingestion (mode={args.mode})...\n")
            ingester = NoaaIngestion()
            ingester.run(
                mode=args.mode,
                start_date=args.start,
                end_date=args.end,
                dry_run=args.dry_run,
                station_code=args.station,
            )
            print("✓ NOAA ingestion complete\n")
        except Exception as e:
            print(f"✗ NOAA ingestion failed: {e}\n")
            success = False

    # Run SYNOP live ingestion (provisional/bootstrap — explicit only, not 'all')
    if args.source == 'synop':
        try:
            print(f"▶ Starting SYNOP ingestion (Ogimet bootstrap)...\n")
            ingester = SynopIngestion()
            ingester.run(
                start_date=args.start,
                end_date=args.end,
                dry_run=args.dry_run,
                station_code=args.station,
                reconcile=args.reconcile,
            )
            print("✓ SYNOP ingestion complete\n")
        except Exception as e:
            print(f"✗ SYNOP ingestion failed: {e}\n")
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