#!/usr/bin/env python3
"""
scripts/compute_completed_season.py

Fold a completed growing season's extreme metrics (frost / hot days / R99p /
last frost) from the live zone-daily series into climate_zone_season_stats as
'observed' rows. Run after a season ends (≥ 30 Apr). Idempotent; never clobbers
modelled rows.

Usage:
    # one zone
    python scripts/compute_completed_season.py --vintage 2026 --zone waipara
    # all active zones
    python scripts/compute_completed_season.py --vintage 2026
    # ignore the completeness gate (e.g. mid-season preview)
    python scripts/compute_completed_season.py --vintage 2026 --force
"""

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from db.session import SessionLocal
from db.models.climate import ClimateZone
from services.season_extremes import upsert_observed_season

logging.basicConfig(level=logging.INFO, format='%(message)s')
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(description="Fold a completed season into climate_zone_season_stats")
    parser.add_argument('--vintage', type=int, required=True, help="Vintage year (Sep prev-year to Apr)")
    parser.add_argument('--zone', help="Zone slug; omit for all active zones")
    parser.add_argument('--force', action='store_true', help="Ignore the season-complete gate")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        q = db.query(ClimateZone).filter(ClimateZone.is_active == True)
        if args.zone:
            q = q.filter(ClimateZone.slug == args.zone)
        zones = q.order_by(ClimateZone.display_order).all()
        if not zones:
            logger.error("No matching zones")
            return

        logger.info(f"Vintage {args.vintage} — {len(zones)} zone(s)")
        counts = {}
        for z in zones:
            status = upsert_observed_season(db, z.id, args.vintage, force=args.force)
            counts[status.split(':')[0]] = counts.get(status.split(':')[0], 0) + 1
            logger.info(f"  {z.name}: {status}")
        logger.info(f"\nSummary: {counts}")
    finally:
        db.close()


if __name__ == '__main__':
    main()
