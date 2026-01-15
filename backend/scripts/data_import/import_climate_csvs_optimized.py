#!/usr/bin/env python3
"""
Optimized Bulk Climate Data Import Script
Handles 8,744+ CSV files with >10GB of data efficiently

Key optimizations:
- PostgreSQL COPY for bulk inserts (100-1000x faster)
- Parallel processing across multiple files
- Removes per-row duplicate checking
- Batch operations with large chunks
- Progress tracking and resume capability

Run from backend directory: python scripts/data_import/import_climate_csvs_optimized.py
"""

import os
import sys
import argparse
import pandas as pd
import psycopg2
from psycopg2 import sql
from psycopg2.extras import execute_values
from datetime import datetime
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import StringIO
import time
import json
from typing import Dict, List, Tuple

# Find and add the backend directory to Python path
current_file = Path(__file__).absolute()
backend_dir = None

search_paths = [
    current_file.parent.parent.parent,
    current_file.parent.parent,
    current_file.parent,
    Path.cwd(),
]

print("🔍 Searching for backend directory...")
for path in search_paths:
    db_path = path / 'db'
    session_path = db_path / 'session.py'
    if db_path.exists() and session_path.exists():
        backend_dir = path
        print(f"✅ Found backend at: {backend_dir}")
        break

if not backend_dir:
    print("❌ Could not find backend directory!")
    sys.exit(1)

sys.path.insert(0, str(backend_dir))

# Import database configuration
try:
    from db.session import SessionLocal, engine
    from core.config import settings
    print("✅ Successfully imported database modules")
except ImportError as e:
    print(f"❌ Import error: {e}")
    sys.exit(1)


class BulkClimateImporter:
    """Optimized bulk climate data importer using PostgreSQL COPY"""
    
    def __init__(self, connection_string: str, workers: int = 4, manage_indexes: bool = True):
        self.connection_string = connection_string
        self.workers = workers
        self.progress_file = Path("import_progress.json")
        self.processed_blocks = self.load_progress()
        self.manage_indexes = manage_indexes
        self.dropped_indexes = []
        
    def load_progress(self) -> set:
        """Load previously processed blocks for resume capability"""
        if self.progress_file.exists():
            with open(self.progress_file, 'r') as f:
                data = json.load(f)
                return set(data.get('completed_blocks', []))
        return set()
    
    def save_progress(self, block_id: int):
        """Save progress after each successful block"""
        self.processed_blocks.add(block_id)
        with open(self.progress_file, 'w') as f:
            json.dump({
                'completed_blocks': list(self.processed_blocks),
                'last_updated': datetime.now().isoformat()
            }, f)
    
    def get_connection(self):
        """Get a new database connection"""
        return psycopg2.connect(self.connection_string)
    
    def drop_indexes(self):
        """Drop non-primary-key indexes for faster bulk insert"""
        if not self.manage_indexes:
            return
        
        print("\n🔧 Dropping indexes for faster import...")
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            
            # Get all indexes on the table (except primary key and unique constraints)
            cursor.execute("""
                SELECT indexname, indexdef
                FROM pg_indexes
                WHERE tablename = 'climate_historical_data'
                AND indexname NOT LIKE '%_pkey'
                AND indexname NOT IN (
                    SELECT conname FROM pg_constraint 
                    WHERE conrelid = 'climate_historical_data'::regclass
                    AND contype IN ('p', 'u')
                )
            """)
            
            indexes = cursor.fetchall()
            
            if not indexes:
                print("  ℹ️  No indexes to drop")
                return
            
            for index_name, index_def in indexes:
                print(f"  📋 Dropping index: {index_name}")
                cursor.execute(f"DROP INDEX IF EXISTS {index_name}")
                self.dropped_indexes.append((index_name, index_def))
            
            conn.commit()
            print(f"  ✅ Dropped {len(self.dropped_indexes)} indexes")
            
        except Exception as e:
            print(f"  ⚠️  Error dropping indexes: {e}")
            conn.rollback()
        finally:
            cursor.close()
            conn.close()
    
    def recreate_indexes(self):
        """Recreate indexes after import completes"""
        if not self.manage_indexes or not self.dropped_indexes:
            return
        
        print("\n🔨 Recreating indexes...")
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            
            for index_name, index_def in self.dropped_indexes:
                print(f"  🔧 Creating index: {index_name}")
                try:
                    cursor.execute(index_def)
                    conn.commit()
                    print(f"    ✅ Created")
                except Exception as e:
                    print(f"    ⚠️  Error: {e}")
                    conn.rollback()
            
            print(f"  ✅ Recreated {len(self.dropped_indexes)} indexes")
            
        except Exception as e:
            print(f"  ⚠️  Error recreating indexes: {e}")
        finally:
            cursor.close()
            conn.close()
    
    def disable_autovacuum(self):
        """Disable autovacuum on table during import"""
        if not self.manage_indexes:
            return
        
        print("\n⚙️  Disabling autovacuum...")
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                ALTER TABLE climate_historical_data 
                SET (autovacuum_enabled = false)
            """)
            conn.commit()
            print("  ✅ Autovacuum disabled")
        except Exception as e:
            print(f"  ⚠️  Error: {e}")
            conn.rollback()
        finally:
            cursor.close()
            conn.close()
    
    def enable_autovacuum_and_analyze(self):
        """Re-enable autovacuum and run ANALYZE after import"""
        if not self.manage_indexes:
            return
        
        print("\n🧹 Re-enabling autovacuum and analyzing table...")
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            
            # Re-enable autovacuum
            cursor.execute("""
                ALTER TABLE climate_historical_data 
                SET (autovacuum_enabled = true)
            """)
            conn.commit()
            print("  ✅ Autovacuum re-enabled")
            
            # Run ANALYZE
            print("  📊 Running ANALYZE (this may take a few minutes)...")
            cursor.execute("ANALYZE climate_historical_data")
            conn.commit()
            print("  ✅ ANALYZE complete")
            
        except Exception as e:
            print(f"  ⚠️  Error: {e}")
            conn.rollback()
        finally:
            cursor.close()
            conn.close()
    
    def prepare_dataframe(self, df: pd.DataFrame, block_id: int) -> pd.DataFrame:
        """Clean and prepare dataframe for import"""
        # Rename columns to match database schema
        df = df.rename(columns={
            'Date': 'date',
            'Tmean(C)': 'temperature_mean',
            'Tmin(C)': 'temperature_min',
            'Tmax(C)': 'temperature_max',
            'Amount(mm)': 'rainfall_amount',
            'Amount(MJm2)': 'solar_radiation'
        })
        
        # Convert date to proper format
        df['date'] = pd.to_datetime(df['date']).dt.date
        
        # Add required columns
        df['vineyard_block_id'] = block_id
        df['data_quality'] = 'interpolated'
        df['created_at'] = datetime.now()
        df['updated_at'] = datetime.now()
        
        # Handle negative rainfall (convert to 0)
        df['rainfall_amount'] = df['rainfall_amount'].apply(
            lambda x: 0.0 if pd.notna(x) and x < 0 else x
        )
        
        # Select only needed columns in correct order
        columns = [
            'vineyard_block_id', 'date', 'temperature_mean', 'temperature_min',
            'temperature_max', 'rainfall_amount', 'solar_radiation', 
            'data_quality', 'created_at', 'updated_at'
        ]
        
        return df[columns]
    
    def bulk_insert_with_copy(self, conn, df: pd.DataFrame, block_id: int) -> Dict:
        """Use PostgreSQL COPY for ultra-fast bulk insert"""
        try:
            cursor = conn.cursor()
            
            # Create a StringIO buffer with CSV data
            buffer = StringIO()
            df.to_csv(buffer, index=False, header=False, sep='\t')
            buffer.seek(0)
            
            # First, delete any existing records for this block to avoid conflicts
            # This is faster than checking each row individually
            cursor.execute(
                "DELETE FROM climate_historical_data WHERE vineyard_block_id = %s",
                (block_id,)
            )
            deleted_count = cursor.rowcount
            
            # Use COPY for bulk insert (extremely fast)
            cursor.copy_from(
                buffer,
                'climate_historical_data',
                columns=[
                    'vineyard_block_id', 'date', 'temperature_mean', 'temperature_min',
                    'temperature_max', 'rainfall_amount', 'solar_radiation',
                    'data_quality', 'created_at', 'updated_at'
                ],
                sep='\t',
                null=''
            )
            
            conn.commit()
            imported_count = len(df)
            
            return {
                'success': True,
                'imported': imported_count,
                'deleted': deleted_count,
                'error': None
            }
            
        except Exception as e:
            conn.rollback()
            return {
                'success': False,
                'imported': 0,
                'deleted': 0,
                'error': str(e)
            }
        finally:
            cursor.close()
    
    def bulk_insert_with_execute_values(self, conn, df: pd.DataFrame, block_id: int) -> Dict:
        """Alternative method using execute_values (if COPY has issues)"""
        try:
            cursor = conn.cursor()
            
            # Delete existing records
            cursor.execute(
                "DELETE FROM climate_historical_data WHERE vineyard_block_id = %s",
                (block_id,)
            )
            deleted_count = cursor.rowcount
            
            # Prepare data as list of tuples
            records = [tuple(row) for row in df.to_numpy()]
            
            # Bulk insert using execute_values (much faster than executemany)
            execute_values(
                cursor,
                """
                INSERT INTO climate_historical_data 
                (vineyard_block_id, date, temperature_mean, temperature_min,
                 temperature_max, rainfall_amount, solar_radiation, data_quality,
                 created_at, updated_at)
                VALUES %s
                """,
                records,
                page_size=5000
            )
            
            conn.commit()
            imported_count = len(df)
            
            return {
                'success': True,
                'imported': imported_count,
                'deleted': deleted_count,
                'error': None
            }
            
        except Exception as e:
            conn.rollback()
            return {
                'success': False,
                'imported': 0,
                'deleted': 0,
                'error': str(e)
            }
        finally:
            cursor.close()
    
    def process_single_file(self, file_path: str, block_id: int, use_copy: bool = True) -> Dict:
        """Process a single CSV file"""
        start_time = time.time()
        
        try:
            # Check if already processed
            if block_id in self.processed_blocks:
                return {
                    'block_id': block_id,
                    'success': True,
                    'imported': 0,
                    'deleted': 0,
                    'skipped': True,
                    'duration': 0,
                    'error': None
                }
            
            # Read CSV
            df = pd.read_csv(file_path)
            
            # Validate columns
            required_columns = ['Date', 'Tmean(C)', 'Tmin(C)', 'Tmax(C)', 'Amount(mm)', 'Amount(MJm2)']
            if not all(col in df.columns for col in required_columns):
                return {
                    'block_id': block_id,
                    'success': False,
                    'imported': 0,
                    'deleted': 0,
                    'skipped': False,
                    'duration': time.time() - start_time,
                    'error': f"Missing columns: {[c for c in required_columns if c not in df.columns]}"
                }
            
            # Prepare dataframe
            df = self.prepare_dataframe(df, block_id)
            
            # Get connection and insert
            conn = self.get_connection()
            try:
                if use_copy:
                    result = self.bulk_insert_with_copy(conn, df, block_id)
                else:
                    result = self.bulk_insert_with_execute_values(conn, df, block_id)
                
                if result['success']:
                    self.save_progress(block_id)
                
                result['block_id'] = block_id
                result['skipped'] = False
                result['duration'] = time.time() - start_time
                
                return result
                
            finally:
                conn.close()
                
        except Exception as e:
            return {
                'block_id': block_id,
                'success': False,
                'imported': 0,
                'deleted': 0,
                'skipped': False,
                'duration': time.time() - start_time,
                'error': str(e)
            }
    
    def verify_block_exists(self, block_id: int) -> bool:
        """Quick check if vineyard block exists in database"""
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT EXISTS(SELECT 1 FROM vineyard_blocks WHERE id = %s)",
                (block_id,)
            )
            exists = cursor.fetchone()[0]
            cursor.close()
            return exists
        finally:
            conn.close()
    
    def get_existing_blocks(self, block_ids: List[int]) -> set:
        """Batch check which blocks exist in database"""
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id FROM vineyard_blocks WHERE id = ANY(%s)",
                (block_ids,)
            )
            existing = {row[0] for row in cursor.fetchall()}
            cursor.close()
            return existing
        finally:
            conn.close()
    
    def import_files_parallel(
        self, 
        files_dict: Dict[int, str],
        use_copy: bool = True,
        validate_blocks: bool = True
    ):
        """Import multiple files in parallel"""
        
        print(f"\n🚀 Starting parallel import with {self.workers} workers")
        print(f"📊 Total files to process: {len(files_dict):,}")
        
        # Prepare database for bulk import
        if self.manage_indexes:
            self.drop_indexes()
            self.disable_autovacuum()
        
        # Filter out already processed blocks
        remaining_files = {
            bid: path for bid, path in files_dict.items() 
            if bid not in self.processed_blocks
        }
        
        if len(remaining_files) < len(files_dict):
            already_done = len(files_dict) - len(remaining_files)
            print(f"✅ {already_done:,} files already processed (resuming from checkpoint)")
        
        if not remaining_files:
            print("✅ All files already processed!")
            if self.manage_indexes:
                self.recreate_indexes()
                self.enable_autovacuum_and_analyze()
            return
        
        # Validate blocks exist in database
        if validate_blocks:
            print(f"🔍 Validating {len(remaining_files):,} blocks exist in database...")
            existing_blocks = self.get_existing_blocks(list(remaining_files.keys()))
            invalid_blocks = set(remaining_files.keys()) - existing_blocks
            
            if invalid_blocks:
                print(f"⚠️  Found {len(invalid_blocks):,} blocks not in database:")
                for bid in sorted(list(invalid_blocks)[:10]):
                    print(f"    - Block {bid}")
                if len(invalid_blocks) > 10:
                    print(f"    ... and {len(invalid_blocks) - 10} more")
                
                # Remove invalid blocks
                for bid in invalid_blocks:
                    del remaining_files[bid]
                
                print(f"✅ Proceeding with {len(remaining_files):,} valid blocks")
        
        # Process files in parallel
        results = []
        total_imported = 0
        total_deleted = 0
        successful = 0
        failed = 0
        skipped = 0
        
        start_time = time.time()
        
        with ThreadPoolExecutor(max_workers=self.workers) as executor:
            # Submit all tasks
            future_to_block = {
                executor.submit(self.process_single_file, path, block_id, use_copy): block_id
                for block_id, path in remaining_files.items()
            }
            
            # Process completed tasks
            for i, future in enumerate(as_completed(future_to_block), 1):
                result = future.result()
                results.append(result)
                
                if result['skipped']:
                    skipped += 1
                elif result['success']:
                    successful += 1
                    total_imported += result['imported']
                    total_deleted += result['deleted']
                    
                    # Progress update every 10 files
                    if i % 10 == 0:
                        elapsed = time.time() - start_time
                        rate = i / elapsed
                        eta = (len(remaining_files) - i) / rate if rate > 0 else 0
                        print(f"  [{i:,}/{len(remaining_files):,}] "
                              f"✅ {successful:,} successful, "
                              f"❌ {failed:,} failed, "
                              f"⏱️  {rate:.1f} files/sec, "
                              f"ETA: {eta/60:.1f} min")
                else:
                    failed += 1
                    print(f"  ❌ Block {result['block_id']}: {result['error']}")
        
        # Final summary
        total_time = time.time() - start_time
        
        print(f"\n{'='*60}")
        print(f"🎉 IMPORT COMPLETE!")
        print(f"{'='*60}")
        print(f"⏱️  Total time: {total_time/60:.1f} minutes ({total_time:.1f} seconds)")
        print(f"📊 Files processed: {len(remaining_files):,}")
        print(f"✅ Successful: {successful:,}")
        print(f"❌ Failed: {failed:,}")
        print(f"⏭️  Skipped (already done): {len(self.processed_blocks):,}")
        print(f"📈 Records imported: {total_imported:,}")
        print(f"🗑️  Records deleted (replaced): {total_deleted:,}")
        print(f"⚡ Average speed: {total_imported/total_time:.0f} records/sec")
        print(f"{'='*60}")
        
        # Restore database for normal operations
        if self.manage_indexes:
            self.recreate_indexes()
            self.enable_autovacuum_and_analyze()


def get_available_csvs(csv_dir: str) -> Dict[int, str]:
    """Scan directory for CSV files"""
    csv_path = Path(csv_dir)
    if not csv_path.exists():
        print(f"❌ Directory not found: {csv_dir}")
        return {}
    
    available_files = {}
    for csv_file in csv_path.glob("*.csv"):
        try:
            block_id = int(csv_file.stem)
            available_files[block_id] = str(csv_file)
        except ValueError:
            print(f"⚠️  Skipping file with non-numeric name: {csv_file.name}")
            continue
    
    return available_files


def main():
    parser = argparse.ArgumentParser(
        description='Optimized bulk import of climate CSV files',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Import all files with 8 parallel workers
  python import_climate_csvs_optimized.py --csv-dir Z:\\Data\\NZ_Climate_History\\Vineyards\\Merged --workers 8

  # Test with first 100 files
  python import_climate_csvs_optimized.py --csv-dir /path/to/csvs --limit 100 --workers 4

  # Resume interrupted import
  python import_climate_csvs_optimized.py --csv-dir /path/to/csvs --workers 8

  # Import specific blocks
  python import_climate_csvs_optimized.py --csv-dir /path/to/csvs --block-ids 1,2,3,4,5

  # Clear progress and start fresh
  python import_climate_csvs_optimized.py --csv-dir /path/to/csvs --clear-progress
        """
    )
    
    parser.add_argument('--csv-dir', required=True, help='Directory containing CSV files')
    parser.add_argument('--block-ids', help='Comma-separated list of block IDs to import')
    parser.add_argument('--limit', type=int, help='Limit number of files to process')
    parser.add_argument('--workers', type=int, default=4, 
                       help='Number of parallel workers (default: 4, recommended: 4-8)')
    parser.add_argument('--use-execute-values', action='store_true',
                       help='Use execute_values instead of COPY (slower but more compatible)')
    parser.add_argument('--skip-validation', action='store_true',
                       help='Skip checking if blocks exist in database')
    parser.add_argument('--clear-progress', action='store_true',
                       help='Clear progress file and start from scratch')
    parser.add_argument('--no-index-management', action='store_true',
                       help='Do not drop/recreate indexes (slower but safer)')
    
    args = parser.parse_args()
    
    # Clear progress if requested
    if args.clear_progress:
        progress_file = Path("import_progress.json")
        if progress_file.exists():
            progress_file.unlink()
            print("✅ Progress file cleared")
    
    # Get database connection string
    try:
        # Build connection string from settings
        db_url = settings.DATABASE_URL
        # Convert SQLAlchemy URL to psycopg2 format if needed
        if db_url.startswith('postgresql://'):
            connection_string = db_url
        else:
            print("❌ Unsupported database URL format")
            return 1
    except Exception as e:
        print(f"❌ Could not get database connection: {e}")
        return 1
    
    print(f"\n📂 Scanning CSV directory: {args.csv_dir}")
    
    # Get available CSV files
    available_files = get_available_csvs(args.csv_dir)
    if not available_files:
        print(f"❌ No valid CSV files found in {args.csv_dir}")
        return 1
    
    print(f"✅ Found {len(available_files):,} CSV files")
    
    # Determine which blocks to process
    if args.block_ids:
        requested_blocks = [int(x.strip()) for x in args.block_ids.split(',')]
        blocks_to_process = {
            bid: available_files[bid] for bid in requested_blocks 
            if bid in available_files
        }
        missing_blocks = [bid for bid in requested_blocks if bid not in available_files]
        if missing_blocks:
            print(f"⚠️  No CSV files found for blocks: {missing_blocks}")
    else:
        blocks_to_process = available_files
    
    # Apply limit if specified
    if args.limit:
        blocks_to_process = dict(list(blocks_to_process.items())[:args.limit])
        print(f"🎯 Limited to first {len(blocks_to_process):,} files")
    
    # Create importer and run
    importer = BulkClimateImporter(
        connection_string=connection_string,
        workers=args.workers,
        manage_indexes=not args.no_index_management
    )
    
    use_copy = not args.use_execute_values
    validate_blocks = not args.skip_validation
    
    importer.import_files_parallel(
        blocks_to_process,
        use_copy=use_copy,
        validate_blocks=validate_blocks
    )
    
    return 0


if __name__ == "__main__":
    exit(main())