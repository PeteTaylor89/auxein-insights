# scripts/test_db_config.py
import os
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

# Set environment if provided
if len(sys.argv) > 1:
    os.environ['ENV'] = sys.argv[1]

from sqlalchemy import text
from core.config import settings, debug_settings
from db.session import engine

def test_connection():
    print("\n" + "=" * 60)
    print("Testing Database Connection")
    print("=" * 60 + "\n")
    
    # Show config
    debug_settings()
    
    # Test connection
    print("Attempting database connection...")
    try:
        with engine.connect() as conn:
            # PostgreSQL version
            result = conn.execute(text("SELECT version()"))
            version = result.fetchone()[0]
            print(f"\n✅ CONNECTION SUCCESS")
            print(f"   PostgreSQL: {version.split(',')[0]}")
            
        # New connection for each query to avoid transaction issues
        with engine.connect() as conn:
            # Check PostGIS
            try:
                result = conn.execute(text("SELECT PostGIS_Version()"))
                postgis = result.fetchone()[0]
                print(f"   PostGIS: {postgis}")
            except Exception:
                print("   PostGIS: ❌ Not installed")
        
        with engine.connect() as conn:
            # Check database size
            result = conn.execute(text("SELECT pg_size_pretty(pg_database_size(current_database()))"))
            size = result.fetchone()[0]
            print(f"   Database size: {size}")
        
        with engine.connect() as conn:
            # Check table count
            result = conn.execute(text("""
                SELECT count(*) 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
            """))
            table_count = result.fetchone()[0]
            print(f"   Tables in 'public' schema: {table_count}")
            
        print("\n🎉 Connection test completed!")
        return True
            
    except Exception as e:
        print(f"\n❌ CONNECTION FAILED: {e}")
        print("\nTroubleshooting:")
        if settings.ENV == 'local':
            print("  - Is PostgreSQL running locally?")
            print("  - Is LOCAL_DATABASE_URL correct?")
        else:
            print("  - Is RDS_ENDPOINT correct?")
            print("  - Is RDS security group allowing your IP?")
            print("  - Check RDS_USER and password in Secrets Manager")
        return False

if __name__ == "__main__":
    test_connection()