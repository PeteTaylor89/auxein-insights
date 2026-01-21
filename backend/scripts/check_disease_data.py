#!/usr/bin/env python3
"""
CLI script to query disease_pressure table for debugging.

Usage:
    python scripts/check_disease_data.py                     # Last 30 days for all zones
    python scripts/check_disease_data.py --zone waipara      # Specific zone
    python scripts/check_disease_data.py --zone-id 15        # By zone ID
    python scripts/check_disease_data.py --days 7            # Last 7 days
    python scripts/check_disease_data.py --raw               # Show raw risk_factors JSON
"""

import argparse
import sys
from pathlib import Path
from datetime import date, timedelta

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from db.session import SessionLocal


def query_disease_pressure(zone_slug=None, zone_id=None, days=30, show_raw=False):
    """Query disease_pressure table and display results."""
    db = SessionLocal()
    
    try:
        # Build query
        query = """
            SELECT 
                dp.id,
                dp.zone_id,
                cz.name as zone_name,
                cz.slug as zone_slug,
                dp.date,
                dp.downy_mildew_risk,
                dp.powdery_mildew_risk,
                dp.botrytis_risk,
                dp.recommendations,
                dp.humidity_available,
                dp.risk_factors
            FROM disease_pressure dp
            JOIN climate_zones cz ON dp.zone_id = cz.id
            WHERE dp.date >= :start_date
        """
        
        params = {
            'start_date': date.today() - timedelta(days=days)
        }
        
        if zone_slug:
            query += " AND cz.slug = :zone_slug"
            params['zone_slug'] = zone_slug
        elif zone_id:
            query += " AND dp.zone_id = :zone_id"
            params['zone_id'] = zone_id
        
        query += " ORDER BY dp.zone_id, dp.date DESC"
        
        result = db.execute(text(query), params)
        rows = result.fetchall()
        
        if not rows:
            print(f"\n❌ No disease_pressure records found")
            print(f"   Filters: zone_slug={zone_slug}, zone_id={zone_id}, days={days}")
            return
        
        print(f"\n{'='*80}")
        print(f"DISEASE PRESSURE DATA ({len(rows)} records)")
        print(f"{'='*80}")
        
        current_zone = None
        for row in rows:
            # Print zone header when it changes
            if row.zone_id != current_zone:
                current_zone = row.zone_id
                print(f"\n📍 Zone: {row.zone_name} (ID: {row.zone_id}, slug: {row.zone_slug})")
                print("-" * 70)
                print(f"{'Date':<12} {'Downy':<10} {'Powdery':<10} {'Botrytis':<10} {'Humidity':<10}")
                print("-" * 70)
            
            humidity = "Yes" if row.humidity_available else "No"
            print(f"{str(row.date):<12} {row.downy_mildew_risk or 'NULL':<10} {row.powdery_mildew_risk or 'NULL':<10} {row.botrytis_risk or 'NULL':<10} {humidity:<10}")
            
            if show_raw and row.risk_factors:
                print(f"   risk_factors: {row.risk_factors}")
        
        # Summary stats
        print(f"\n{'='*80}")
        print("SUMMARY")
        print(f"{'='*80}")
        
        # Check for records with scores in risk_factors
        score_query = """
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN risk_factors IS NOT NULL THEN 1 END) as with_factors,
                COUNT(CASE WHEN risk_factors->>'scores' IS NOT NULL THEN 1 END) as with_scores,
                MIN(date) as earliest,
                MAX(date) as latest
            FROM disease_pressure dp
            JOIN climate_zones cz ON dp.zone_id = cz.id
            WHERE dp.date >= :start_date
        """
        if zone_slug:
            score_query += " AND cz.slug = :zone_slug"
        elif zone_id:
            score_query += " AND dp.zone_id = :zone_id"
        
        stats = db.execute(text(score_query), params).fetchone()
        
        print(f"Total records: {stats.total}")
        print(f"With risk_factors: {stats.with_factors}")
        print(f"With scores in risk_factors: {stats.with_scores}")
        print(f"Date range: {stats.earliest} to {stats.latest}")
        
        # Check what's in risk_factors for a sample record
        sample_query = """
            SELECT risk_factors 
            FROM disease_pressure dp
            JOIN climate_zones cz ON dp.zone_id = cz.id
            WHERE dp.date >= :start_date
              AND dp.risk_factors IS NOT NULL
        """
        if zone_slug:
            sample_query += " AND cz.slug = :zone_slug"
        elif zone_id:
            sample_query += " AND dp.zone_id = :zone_id"
        sample_query += " LIMIT 1"
        
        sample = db.execute(text(sample_query), params).fetchone()
        if sample and sample.risk_factors:
            print(f"\nSample risk_factors structure:")
            import json
            print(json.dumps(sample.risk_factors, indent=2, default=str))
        
    finally:
        db.close()


def check_table_structure():
    """Check the disease_pressure table structure."""
    db = SessionLocal()
    
    try:
        query = """
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'disease_pressure'
            ORDER BY ordinal_position
        """
        
        result = db.execute(text(query))
        rows = result.fetchall()
        
        print(f"\n{'='*60}")
        print("DISEASE_PRESSURE TABLE STRUCTURE")
        print(f"{'='*60}")
        print(f"{'Column':<30} {'Type':<20} {'Nullable':<10}")
        print("-" * 60)
        
        for row in rows:
            print(f"{row.column_name:<30} {row.data_type:<20} {row.is_nullable:<10}")
        
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description='Query disease_pressure table')
    parser.add_argument('--zone', type=str, help='Zone slug (e.g., waipara)')
    parser.add_argument('--zone-id', type=int, help='Zone ID')
    parser.add_argument('--days', type=int, default=30, help='Number of days to look back')
    parser.add_argument('--raw', action='store_true', help='Show raw risk_factors JSON')
    parser.add_argument('--schema', action='store_true', help='Show table structure')
    
    args = parser.parse_args()
    
    if args.schema:
        check_table_structure()
    
    query_disease_pressure(
        zone_slug=args.zone,
        zone_id=args.zone_id,
        days=args.days,
        show_raw=args.raw
    )


if __name__ == '__main__':
    main()