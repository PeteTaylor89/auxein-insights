#!/usr/bin/env python3
"""
Standalone Climate Data Import Script
Run from the backend directory: python scripts/data_import/climate_import.py
"""

import os
import sys
import argparse
import pandas as pd
from datetime import datetime
from pathlib import Path

# Find and add the backend directory to Python path
current_file = Path(__file__).absolute()
backend_dir = None

# Search for backend directory
search_paths = [
    current_file.parent.parent.parent,  # scripts/data_import -> scripts -> backend
    current_file.parent.parent,         # scripts/data_import -> scripts
    current_file.parent,                # scripts/data_import
    Path.cwd(),                         # current working directory
]

print("🔍 Searching for backend directory...")
for path in search_paths:
    db_path = path / 'db'
    session_path = db_path / 'session.py'
    print(f"  Checking: {path}")
    print(f"    - db exists: {db_path.exists()}")
    print(f"    - session.py exists: {session_path.exists()}")
    
    if db_path.exists() and session_path.exists():
        backend_dir = path
        print(f"✅ Found backend at: {backend_dir}")
        break

if not backend_dir:
    print("❌ Could not find backend directory!")
    print("\nPlease run this script from one of these locations:")
    print("  - /a/auxein-insights-v0.1/backend/")
    print("  - /a/auxein-insights-v0.1/backend/scripts/")
    print("  - /a/auxein-insights-v0.1/backend/scripts/data_import/")
    sys.exit(1)

# Add backend to Python path
sys.path.insert(0, str(backend_dir))
print(f"📁 Added to Python path: {backend_dir}")

# Now try to import modules
try:
    from db.session import SessionLocal
    
    # Import only the models we need to avoid circular import issues
    import sqlalchemy as sa
    from sqlalchemy.orm import Session
    from db.base_class import Base
    
    print("✅ Successfully imported database modules")
except ImportError as e:
    print(f"❌ Import error: {e}")
    print(f"Backend directory: {backend_dir}")
    print(f"Python path: {sys.path[:3]}...")  # Show first 3 entries
    
    # Check what's actually in the db directory
    db_dir = backend_dir / 'db'
    if db_dir.exists():
        print(f"\nContents of {db_dir}:")
        for item in db_dir.iterdir():
            print(f"  - {item.name}")
    sys.exit(1)

def import_csv_file(file_path: str, block_id: int, db: Session) -> dict:
    """Import climate data from a single CSV file"""
    try:
        # Read CSV
        df = pd.read_csv(file_path)
        
        # Validate columns
        required_columns = ['Date', 'Tmean(C)', 'Tmin(C)', 'Tmax(C)', 'Amount(mm)', 'Amount(MJm2)']
        if not all(col in df.columns for col in required_columns):
            return {
                "success": False,
                "error": f"Missing required columns. Expected: {required_columns}",
                "processed": 0,
                "imported": 0,
                "skipped": 0
            }
        
        processed = 0
        imported = 0
        skipped = 0
        errors = []
        batch_size = 1000
        
        print(f"  📊 Processing {len(df):,} records...")
        
        # Process in batches
        for i in range(0, len(df), batch_size):
            batch = df.iloc[i:i+batch_size]
            
            for idx, row in batch.iterrows():
                try:
                    # Parse date
                    record_date = pd.to_datetime(row['Date']).date()
                    
                    # Check if record exists (using raw SQL for performance)
                    existing = db.execute(sa.text("""
                        SELECT id FROM climate_historical_data 
                        WHERE vineyard_block_id = :block_id AND date = :date
                    """), {"block_id": block_id, "date": record_date}).fetchone()
                    
                    if existing:
                        skipped += 1
                        continue
                    
                    # Handle negative rainfall (convert to 0)
                    rainfall = float(row['Amount(mm)']) if pd.notna(row['Amount(mm)']) else None
                    if rainfall is not None and rainfall < 0:
                        rainfall = 0.0
                    
                    # Insert using raw SQL for better performance
                    db.execute(sa.text("""
                        INSERT INTO climate_historical_data 
                        (vineyard_block_id, date, temperature_mean, temperature_min, 
                         temperature_max, rainfall_amount, solar_radiation, data_quality, 
                         created_at, updated_at)
                        VALUES 
                        (:block_id, :date, :temp_mean, :temp_min, :temp_max, 
                         :rainfall, :solar, 'interpolated', NOW(), NOW())
                    """), {
                        "block_id": block_id,
                        "date": record_date,
                        "temp_mean": float(row['Tmean(C)']) if pd.notna(row['Tmean(C)']) else None,
                        "temp_min": float(row['Tmin(C)']) if pd.notna(row['Tmin(C)']) else None,
                        "temp_max": float(row['Tmax(C)']) if pd.notna(row['Tmax(C)']) else None,
                        "rainfall": rainfall,
                        "solar": float(row['Amount(MJm2)']) if pd.notna(row['Amount(MJm2)']) else None
                    })
                    
                    imported += 1
                    processed += 1
                    
                except Exception as e:
                    errors.append(f"Row {idx}: {str(e)}")
                    continue
            
            # Commit batch
            try:
                db.commit()
                if imported % 5000 == 0 and imported > 0:
                    print(f"    ✅ Imported {imported:,} records so far...")
            except Exception as e:
                db.rollback()
                return {
                    "success": False,
                    "error": f"Database error during batch commit: {str(e)}",
                    "processed": processed,
                    "imported": imported,
                    "skipped": skipped,
                    "errors": errors
                }
        
        return {
            "success": True,
            "processed": processed,
            "imported": imported,
            "skipped": skipped,
            "errors": errors[:10]  # Only return first 10 errors
        }
        
    except Exception as e:
        db.rollback()
        return {
            "success": False,
            "error": str(e),
            "processed": 0,
            "imported": 0,
            "skipped": 0,
            "errors": []
        }
    """Get block info using raw SQL to avoid model relationship issues"""
    try:
        result = db.execute(sa.text("""
            SELECT 
                vb.id,
                vb.block_name,
                vb.variety,
                c.name as company_name
            FROM vineyard_blocks vb
            LEFT JOIN companies c ON vb.company_id = c.id
            WHERE vb.id = :block_id
        """), {"block_id": block_id}).fetchone()
        
        if result:
            return {
                "id": result.id,
                "block_name": result.block_name,
                "variety": result.variety,
                "company_name": result.company_name
            }
        return None
    except Exception as e:
        print(f"Error querying block {block_id}: {e}")
        return None

def get_available_csvs(csv_dir: str) -> dict:
    """Scan directory for CSV files and extract block IDs"""
    csv_dir = Path(csv_dir)
    if not csv_dir.exists():
        print(f"❌ Directory not found: {csv_dir}")
        return {}
    
    available_files = {}
    for csv_file in csv_dir.glob("*.csv"):
        try:
            # Extract block_id from filename (e.g., "1.csv" -> 1)
            block_id = int(csv_file.stem)
            available_files[block_id] = str(csv_file)
        except ValueError:
            print(f"⚠️  Skipping file with non-numeric name: {csv_file.name}")
            continue
    
    return available_files

print("📋 Script loaded successfully, starting main function...")

def main():
    parser = argparse.ArgumentParser(description='Import climate CSV files')
    parser.add_argument('--csv-dir', required=True, help='Directory containing CSV files')
    parser.add_argument('--block-ids', help='Comma-separated list of block IDs to import')
    parser.add_argument('--dry-run', action='store_true', help='Preview files without importing')
    parser.add_argument('--limit', type=int, help='Limit number of files to process')
    
    args = parser.parse_args()
    
    print(f"\n📂 Scanning CSV directory: {args.csv_dir}")
    
    # Get available CSV files
    available_files = get_available_csvs(args.csv_dir)
    if not available_files:
        print(f"❌ No valid CSV files found in {args.csv_dir}")
        return 1
    
    print(f"✅ Found {len(available_files)} CSV files:")
    for block_id in sorted(available_files.keys())[:10]:  # Show first 10
        print(f"  - {block_id}.csv")
    if len(available_files) > 10:
        print(f"  ... and {len(available_files) - 10} more")
    
    # Determine which blocks to process
    if args.block_ids:
        requested_blocks = [int(x.strip()) for x in args.block_ids.split(',')]
        blocks_to_process = {bid: available_files[bid] for bid in requested_blocks if bid in available_files}
        missing_blocks = [bid for bid in requested_blocks if bid not in available_files]
        if missing_blocks:
            print(f"⚠️  No CSV files found for blocks: {missing_blocks}")
    else:
        blocks_to_process = available_files
    
    # Apply limit if specified
    if args.limit:
        blocks_to_process = dict(list(blocks_to_process.items())[:args.limit])
    
    print(f"\n🎯 Will process {len(blocks_to_process)} files")
    
    if args.dry_run:
        print(f"\n🔍 DRY RUN - Checking database for blocks:")
        db = SessionLocal()
        try:
            # Check first 10 blocks as a sample
            sample_blocks = list(blocks_to_process.keys())[:10]
            
            for block_id in sample_blocks:
                file_path = blocks_to_process[block_id]
                
                # Get block info using raw SQL to avoid model relationship issues
                block_info = get_block_info(db, block_id)
                
                if block_info:
                    print(f"  ✅ Block {block_id}: {block_info['block_name']} ({block_info['variety']}) - {block_info['company_name']}")
                else:
                    print(f"  ❌ Block {block_id}: NOT FOUND IN DATABASE")
                    
                # Quick check of CSV structure
                try:
                    df = pd.read_csv(file_path, nrows=3)
                    required_cols = ['Date', 'Tmean(C)', 'Tmin(C)', 'Tmax(C)', 'Amount(mm)', 'Amount(MJm2)']
                    has_all_cols = all(col in df.columns for col in required_cols)
                    status = "✅" if has_all_cols else "⚠️"
                    print(f"      📊 CSV: {len(df)} sample rows, valid format: {status}")
                    if not has_all_cols:
                        print(f"         Missing: {[col for col in required_cols if col not in df.columns]}")
                except Exception as e:
                    print(f"      ❌ CSV Error: {e}")
            
            if len(blocks_to_process) > 10:
                print(f"  ... and {len(blocks_to_process) - 10} more blocks to check")
                
        except Exception as e:
            print(f"❌ Database connection error: {e}")
        finally:
            db.close()
            
        print(f"\n✅ Dry run complete.")
        print(f"Found {len([bid for bid in sample_blocks if get_block_info(SessionLocal(), bid)])} valid blocks out of {len(sample_blocks)} sampled.")
        print("Use without --dry-run to start importing data.")
        return 0
    
    print(f"\n🚀 Starting actual import...")
    
    db = SessionLocal()
    try:
        total_imported = 0
        total_skipped = 0
        total_processed = 0
        total_errors = 0
        successful_blocks = 0
        failed_blocks = 0
        
        print(f"📋 Processing {len(blocks_to_process)} files...")
        
        for i, (block_id, file_path) in enumerate(sorted(blocks_to_process.items()), 1):
            print(f"\n📁 [{i}/{len(blocks_to_process)}] Block {block_id}")
            
            # Verify block exists
            block_info = get_block_info(db, block_id)
            if not block_info:
                print(f"  ❌ Block {block_id} not found in database - skipping")
                failed_blocks += 1
                continue
            
            print(f"  🏷️  {block_info['block_name']} ({block_info['variety']}) - {block_info['company_name']}")
            
            # Import the file
            result = import_csv_file(file_path, block_id, db)
            
            if result["success"]:
                print(f"  ✅ Success: {result['imported']:,} imported, {result['skipped']:,} skipped")
                total_imported += result["imported"]
                total_skipped += result["skipped"]
                total_processed += result["processed"]
                successful_blocks += 1
                
                if result["errors"]:
                    print(f"  ⚠️  {len(result['errors'])} errors occurred")
                    total_errors += len(result["errors"])
            else:
                print(f"  ❌ Failed: {result['error']}")
                failed_blocks += 1
                total_errors += 1
        
        print(f"\n🎉 IMPORT COMPLETE!")
        print(f"┌─────────────────────────────────────┐")
        print(f"│ FINAL SUMMARY                       │")
        print(f"├─────────────────────────────────────┤")
        print(f"│ Files processed: {len(blocks_to_process):15,} │")
        print(f"│ Successful blocks: {successful_blocks:13,} │")
        print(f"│ Failed blocks: {failed_blocks:17,} │")
        print(f"│ Records processed: {total_processed:13,} │")
        print(f"│ Records imported: {total_imported:14,} │")
        print(f"│ Records skipped: {total_skipped:15,} │")
        print(f"│ Total errors: {total_errors:18,} │")
        print(f"└─────────────────────────────────────┘")
        
        if total_imported > 0:
            print(f"\n🎊 Successfully imported {total_imported:,} climate records!")
            print(f"💾 Data spans from 1986 to 2023 with daily measurements")
            print(f"🌡️  Temperature, rainfall, and solar radiation data now available")
        
    except KeyboardInterrupt:
        print(f"\n⏹️  Import interrupted by user")
        print(f"Partial results: {total_imported:,} records imported so far")
    except Exception as e:
        print(f"\n❌ Fatal error during import: {e}")
    finally:
        db.close()
    
    return 0

def get_block_info(db: Session, block_id: int):
    """Get block info using raw SQL to avoid model relationship issues"""
    try:
        result = db.execute(sa.text("""
            SELECT 
                vb.id,
                vb.block_name,
                vb.variety,
                c.name as company_name
            FROM vineyard_blocks vb
            LEFT JOIN companies c ON vb.company_id = c.id
            WHERE vb.id = :block_id
        """), {"block_id": block_id}).fetchone()
        
        if result:
            return {
                "id": result.id,
                "block_name": result.block_name,
                "variety": result.variety,
                "company_name": result.company_name
            }
        return None
    except Exception as e:
        print(f"Error querying block {block_id}: {e}")
        return None

if __name__ == "__main__":
    exit(main())