
import asyncio
import os
import sys
from pathlib import Path

# Add the current directory to Python path
sys.path.append(str(Path(__file__).parent))

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

from sqlalchemy.orm import sessionmaker
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy import func
from db.session import engine
from services.linz_parcels_service import LINZParcelsService
from geoalchemy2.shape import from_shape
from datetime import datetime, timezone
import uuid
import logging

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class SimpleParcelsSync:
    """Simplified sync service that avoids model relationship issues"""
    
    def __init__(self, db_session, linz_service):
        self.db = db_session
        self.linz_service = linz_service
        self.batch_id = uuid.uuid4()
        
    async def sync_parcels(self, limit=None):
        """Sync parcels with progress tracking"""
        
        # Get total count
        total_count = await self.linz_service.get_total_parcel_count()
        if limit:
            total_count = min(total_count, limit)
            
        print(f"🚀 Starting sync of {total_count:,} parcels...")
        
        processed_count = 0
        created_count = 0
        updated_count = 0
        error_count = 0
        
        # Process in batches
        batch_size = 1000
        
        for offset in range(0, total_count, batch_size):
            current_batch_size = min(batch_size, total_count - offset)
            
            try:
                print(f"📦 Processing batch {offset:,} - {offset + current_batch_size:,}")
                
                # Fetch batch
                features, metadata = await self.linz_service.fetch_parcels_batch(
                    offset, current_batch_size
                )
                
                if not features:
                    print(f"⚠️  Empty batch at offset {offset}, stopping")
                    break
                
                # Process batch
                batch_result = await self._process_batch(features)
                
                processed_count += batch_result["processed"]
                created_count += batch_result["created"] 
                updated_count += batch_result["updated"]
                error_count += batch_result["errors"]
                
                # Progress update
                progress = (processed_count / total_count) * 100
                print(f"✅ Batch complete: {processed_count:,}/{total_count:,} "
                      f"({progress:.1f}%) - {batch_result['created']} created, "
                      f"{batch_result['errors']} errors")
                
                # Small delay to be nice to LINZ API
                await asyncio.sleep(0.2)
                
            except Exception as e:
                print(f"❌ Error processing batch at offset {offset}: {e}")
                error_count += current_batch_size
                continue
        
        print(f"\n🎉 Sync completed!")
        print(f"   📊 Total processed: {processed_count:,}")
        print(f"   ✅ Created: {created_count:,}")
        print(f"   🔄 Updated: {updated_count:,}")
        print(f"   ❌ Errors: {error_count:,}")
        
        return {
            "batch_id": self.batch_id,
            "processed": processed_count,
            "created": created_count,
            "updated": updated_count,
            "errors": error_count
        }
    
    async def _process_batch(self, features):
        """Process a batch of features"""
        from db.models.primary_parcel import PrimaryParcel
        
        processed = 0
        created = 0
        updated = 0
        errors = 0
        
        for feature in features:
            try:
                # Process the feature
                parcel_data = self.linz_service.process_parcel_feature(feature)
                
                if not parcel_data:
                    errors += 1
                    continue
                
                # Prepare database data
                db_data = {
                    "linz_id": parcel_data["linz_id"],
                    "appellation": parcel_data["appellation"],
                    "affected_surveys": parcel_data["affected_surveys"],
                    "parcel_intent": parcel_data["parcel_intent"],
                    "topology_type": parcel_data["topology_type"],
                    "statutory_actions": parcel_data["statutory_actions"],
                    "land_district": parcel_data["land_district"],
                    "titles": parcel_data["titles"],
                    "survey_area": parcel_data["survey_area"],
                    "calc_area": parcel_data["calc_area"],
                    "last_synced_at": datetime.now(timezone.utc),
                    "sync_batch_id": self.batch_id,
                    "is_active": True
                }
                
                # Handle geometry
                if parcel_data["geometry_2193"]:
                    db_data["geometry"] = from_shape(parcel_data["geometry_2193"], srid=2193)
                    db_data["geometry_wgs84"] = func.ST_Transform(
                        from_shape(parcel_data["geometry_2193"], srid=2193), 4326
                    )
                
                # Use PostgreSQL UPSERT
                stmt = insert(PrimaryParcel).values(**db_data)
                
                # On conflict, update
                update_dict = {key: stmt.excluded[key] for key in db_data.keys() 
                              if key not in ['linz_id']}
                update_dict['updated_at'] = datetime.now(timezone.utc)
                
                stmt = stmt.on_conflict_do_update(
                    index_elements=['linz_id'],
                    set_=update_dict
                )
                
                # Execute
                self.db.execute(stmt)
                created += 1  # Simplified - count all as created
                processed += 1
                
            except Exception as e:
                logger.error(f"Error processing parcel {parcel_data.get('linz_id', 'unknown') if 'parcel_data' in locals() else 'unknown'}: {e}")
                errors += 1
                continue
        
        # Commit batch
        self.db.commit()
        
        return {
            "processed": processed,
            "created": created,
            "updated": updated,
            "errors": errors
        }

async def main():
    print("🚀 Simplified LINZ Parcels Sync")
    print("=" * 40)
    
    # Check environment
    api_key = os.getenv("LINZ_API_KEY")
    if not api_key:
        print("❌ LINZ_API_KEY not found")
        return
    
    print(f"🔑 API Key: {api_key[:8]}...")
    
    # Initialize services
    linz_service = LINZParcelsService(api_key)
    
    # Test connection
    print("\n🧪 Testing LINZ connection...")
    connection_test = await linz_service.test_connection()
    
    if not connection_test["success"]:
        print(f"❌ Connection failed: {connection_test['error']}")
        return
    
    print(f"✅ Connected! {connection_test['total_parcels']:,} parcels available")
    
    # Get user input
    print(f"\n📋 Sync Options:")
    print(f"   1. Test sync (1,000 parcels)")
    print(f"   2. Medium sync (10,000 parcels)")  
    print(f"   3. Large sync (100,000 parcels)")
    print(f"   4. Full sync ({connection_test['total_parcels']:,} parcels) ⚠️  HOURS!")
    
    choice = input("\nSelect option (1-4): ").strip()
    
    limits = {
        "1": 1000,
        "2": 10000,
        "3": 100000,
        "4": None  # No limit = full sync
    }
    
    if choice not in limits:
        print("Invalid choice")
        return
    
    limit = limits[choice]
    
    if choice == "4":
        confirm = input(f"⚠️  Full sync will take HOURS! Continue? (yes/no): ")
        if confirm.lower() != "yes":
            print("Cancelled")
            return
    
    # Create database session
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    
    try:
        # Run sync
        sync_service = SimpleParcelsSync(db, linz_service)
        result = await sync_service.sync_parcels(limit)
        
        print(f"\n🎉 Sync completed successfully!")
        print(f"   🆔 Batch ID: {result['batch_id']}")
        
    except Exception as e:
        print(f"❌ Sync failed: {e}")
        logger.exception("Sync error:")
        
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(main())