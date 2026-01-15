#!/usr/bin/env python3
"""
Pre-flight validation script for climate data import
Checks database connectivity, block existence, and estimates import time

Usage:
  python validate_before_import.py --csv-dir /path/to/csvs
"""

import argparse
import pandas as pd
import psycopg2
from pathlib import Path
import sys
from typing import Dict, List, Tuple
import time

# Add backend to path (same logic as main script)
current_file = Path(__file__).absolute()
backend_dir = None

search_paths = [
    current_file.parent.parent.parent,
    current_file.parent.parent,
    current_file.parent,
    Path.cwd(),
]

for path in search_paths:
    db_path = path / 'db'
    if db_path.exists() and (db_path / 'session.py').exists():
        backend_dir = path
        break

if backend_dir:
    sys.path.insert(0, str(backend_dir))
    from core.config import settings
else:
    print("⚠️  Warning: Could not find backend directory, using environment variables")
    import os
    
    class Settings:
        DATABASE_URL = os.getenv('DATABASE_URL')
    
    settings = Settings()


def get_connection():
    """Get database connection"""
    db_url = settings.DATABASE_URL
    return psycopg2.connect(db_url)


def test_database_connection() -> bool:
    """Test basic database connectivity"""
    print("🔌 Testing database connection...")
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT version();")
        version = cursor.fetchone()[0]
        print(f"  ✅ Connected successfully")
        print(f"  📊 PostgreSQL version: {version.split(',')[0]}")
        cursor.close()
        conn.close()
        return True
    except Exception as e:
        print(f"  ❌ Connection failed: {e}")
        return False


def check_table_structure() -> bool:
    """Verify climate_historical_data table exists and has correct structure"""
    print("\n🗄️  Checking table structure...")
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # Check if table exists
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'climate_historical_data'
            );
        """)
        exists = cursor.fetchone()[0]
        
        if not exists:
            print("  ❌ Table 'climate_historical_data' does not exist!")
            return False
        
        print("  ✅ Table exists")
        
        # Check columns
        cursor.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'climate_historical_data'
            ORDER BY ordinal_position;
        """)
        columns = cursor.fetchall()
        
        print("  📋 Table structure:")
        for col_name, col_type in columns:
            print(f"    - {col_name}: {col_type}")
        
        # Check for required columns
        required_columns = {
            'vineyard_block_id', 'date', 'temperature_mean', 
            'temperature_min', 'temperature_max', 'rainfall_amount',
            'solar_radiation', 'data_quality'
        }
        existing_columns = {col[0] for col in columns}
        missing = required_columns - existing_columns
        
        if missing:
            print(f"  ❌ Missing required columns: {missing}")
            return False
        
        print("  ✅ All required columns present")
        
        # Check current record count
        cursor.execute("SELECT COUNT(*) FROM climate_historical_data;")
        count = cursor.fetchone()[0]
        print(f"  📊 Current record count: {count:,}")
        
        cursor.close()
        conn.close()
        return True
        
    except Exception as e:
        print(f"  ❌ Error checking table: {e}")
        return False


def scan_csv_files(csv_dir: str) -> Dict[int, Tuple[str, int]]:
    """Scan CSV directory and get file info"""
    print(f"\n📂 Scanning CSV directory: {csv_dir}")
    csv_path = Path(csv_dir)
    
    if not csv_path.exists():
        print(f"  ❌ Directory not found!")
        return {}
    
    files_info = {}
    total_size = 0
    errors = []
    
    for csv_file in csv_path.glob("*.csv"):
        try:
            block_id = int(csv_file.stem)
            file_size = csv_file.stat().st_size
            
            # Quick validation - read first few rows
            df = pd.read_csv(csv_file, nrows=5)
            required_cols = ['Date', 'Tmean(C)', 'Tmin(C)', 'Tmax(C)', 'Amount(mm)', 'Amount(MJm2)']
            
            if all(col in df.columns for col in required_cols):
                # Get actual row count
                row_count = sum(1 for _ in open(csv_file)) - 1  # Subtract header
                files_info[block_id] = (str(csv_file), row_count)
                total_size += file_size
            else:
                errors.append(f"Block {block_id}: Missing columns")
                
        except ValueError:
            # Non-numeric filename
            continue
        except Exception as e:
            errors.append(f"{csv_file.name}: {str(e)}")
    
    print(f"  ✅ Found {len(files_info):,} valid CSV files")
    print(f"  📊 Total size: {total_size / (1024**3):.2f} GB")
    
    if errors:
        print(f"  ⚠️  {len(errors)} files with errors:")
        for error in errors[:5]:
            print(f"    - {error}")
        if len(errors) > 5:
            print(f"    ... and {len(errors) - 5} more")
    
    # Show sample files
    print(f"  📄 Sample files:")
    for block_id in sorted(files_info.keys())[:5]:
        path, rows = files_info[block_id]
        print(f"    - Block {block_id}: {rows:,} rows")
    
    return files_info


def check_blocks_in_database(block_ids: List[int]) -> Tuple[set, set]:
    """Check which blocks exist in database"""
    print(f"\n🔍 Checking {len(block_ids):,} blocks in database...")
    
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # Batch check all blocks
        cursor.execute(
            "SELECT id FROM vineyard_blocks WHERE id = ANY(%s)",
            (block_ids,)
        )
        existing = {row[0] for row in cursor.fetchall()}
        missing = set(block_ids) - existing
        
        print(f"  ✅ Found {len(existing):,} blocks in database")
        
        if missing:
            print(f"  ⚠️  {len(missing):,} blocks NOT in database:")
            for block_id in sorted(list(missing)[:10]):
                print(f"    - Block {block_id}")
            if len(missing) > 10:
                print(f"    ... and {len(missing) - 10} more")
        
        cursor.close()
        conn.close()
        
        return existing, missing
        
    except Exception as e:
        print(f"  ❌ Error checking blocks: {e}")
        return set(), set(block_ids)


def check_existing_data(block_ids: List[int]) -> Dict[int, int]:
    """Check how much data already exists for each block"""
    print(f"\n🔎 Checking existing climate data...")
    
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT vineyard_block_id, COUNT(*) 
            FROM climate_historical_data 
            WHERE vineyard_block_id = ANY(%s)
            GROUP BY vineyard_block_id
        """, (block_ids[:1000],))  # Sample first 1000 blocks
        
        existing_data = dict(cursor.fetchall())
        
        if existing_data:
            print(f"  ⚠️  Found existing data for {len(existing_data):,} blocks")
            print(f"  📊 Sample of blocks with existing data:")
            for block_id in list(existing_data.keys())[:5]:
                print(f"    - Block {block_id}: {existing_data[block_id]:,} records")
            print(f"\n  ⚠️  WARNING: Import will DELETE and REPLACE existing data for these blocks!")
        else:
            print(f"  ✅ No existing data found - clean import")
        
        cursor.close()
        conn.close()
        
        return existing_data
        
    except Exception as e:
        print(f"  ⚠️  Could not check existing data: {e}")
        return {}


def estimate_import_time(files_info: Dict[int, Tuple[str, int]], workers: int = 4):
    """Estimate import time based on file sizes and record counts"""
    print(f"\n⏱️  Estimating import time...")
    
    total_records = sum(rows for _, rows in files_info.values())
    
    # Performance estimates (conservative)
    records_per_sec_copy = 50000  # PostgreSQL COPY
    records_per_sec_execute = 10000  # execute_values
    
    time_copy = total_records / records_per_sec_copy / workers
    time_execute = total_records / records_per_sec_execute / workers
    
    print(f"  📊 Total records to import: {total_records:,}")
    print(f"  👷 Workers: {workers}")
    print(f"\n  ⚡ Using COPY method (fastest):")
    print(f"    - Estimated time: {time_copy/60:.1f} minutes ({time_copy/3600:.1f} hours)")
    print(f"    - Speed: ~{records_per_sec_copy * workers:,} records/sec")
    print(f"\n  🔄 Using execute_values method (fallback):")
    print(f"    - Estimated time: {time_execute/60:.1f} minutes ({time_execute/3600:.1f} hours)")
    print(f"    - Speed: ~{records_per_sec_execute * workers:,} records/sec")


def main():
    parser = argparse.ArgumentParser(description='Validate before climate data import')
    parser.add_argument('--csv-dir', required=True, help='Directory containing CSV files')
    parser.add_argument('--workers', type=int, default=4, help='Number of workers for time estimate')
    
    args = parser.parse_args()
    
    print("="*60)
    print("🔍 PRE-FLIGHT VALIDATION FOR CLIMATE DATA IMPORT")
    print("="*60)
    
    # Step 1: Test database connection
    if not test_database_connection():
        print("\n❌ VALIDATION FAILED: Cannot connect to database")
        print("   Check your DATABASE_URL in .env file")
        return 1
    
    # Step 2: Check table structure
    if not check_table_structure():
        print("\n❌ VALIDATION FAILED: Table structure issues")
        print("   Run database migrations first")
        return 1
    
    # Step 3: Scan CSV files
    files_info = scan_csv_files(args.csv_dir)
    if not files_info:
        print("\n❌ VALIDATION FAILED: No valid CSV files found")
        return 1
    
    # Step 4: Check blocks exist in database
    block_ids = list(files_info.keys())
    existing_blocks, missing_blocks = check_blocks_in_database(block_ids)
    
    if not existing_blocks:
        print("\n❌ VALIDATION FAILED: No blocks found in database")
        print("   Import vineyard blocks first")
        return 1
    
    # Step 5: Check for existing data
    existing_data = check_existing_data(list(existing_blocks)[:1000])
    
    # Step 6: Estimate import time
    estimate_import_time(files_info, args.workers)
    
    # Final summary
    print(f"\n{'='*60}")
    print("📋 VALIDATION SUMMARY")
    print(f"{'='*60}")
    print(f"✅ Database connection: OK")
    print(f"✅ Table structure: OK")
    print(f"✅ CSV files found: {len(files_info):,}")
    print(f"✅ Valid blocks: {len(existing_blocks):,}")
    
    if missing_blocks:
        print(f"⚠️  Invalid blocks: {len(missing_blocks):,}")
        print(f"   These blocks will be SKIPPED during import")
    
    if existing_data:
        print(f"⚠️  Blocks with existing data: {len(existing_data):,}")
        print(f"   Existing data will be DELETED and REPLACED")
    
    print(f"\n{'='*60}")
    print("🚀 READY TO IMPORT!")
    print(f"{'='*60}")
    print("\nRun the import with:")
    print(f"\n  python import_climate_csvs_optimized.py \\")
    print(f"    --csv-dir {args.csv_dir} \\")
    print(f"    --workers {args.workers}")
    print("\nOr for a test run with 10 files:")
    print(f"\n  python import_climate_csvs_optimized.py \\")
    print(f"    --csv-dir {args.csv_dir} \\")
    print(f"    --limit 10 \\")
    print(f"    --workers 2")
    
    return 0


if __name__ == "__main__":
    exit(main())