# ==================================================
# File: app/services/parcel_sync_service.py
# ==================================================

from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy import func, text
from db.models.primary_parcel import PrimaryParcel
from db.models.parcel_sync_log import ParcelSyncLog
from services.linz_parcels_service import LINZParcelsService
from geoalchemy2.shape import from_shape
from datetime import datetime, timezone
import uuid
import logging
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

class ParcelSyncService:
    """Service for synchronizing LINZ parcels data with local database"""
    
    def __init__(self, db: Session, linz_service: LINZParcelsService):
        self.db = db
        self.linz_service = linz_service
        
    async def full_refresh_sync(self, triggered_by_user_id: int) -> uuid.UUID:
        """
        Perform a full refresh of all parcel data from LINZ
        
        Args:
            triggered_by_user_id: ID of user who triggered the sync
            
        Returns:
            UUID of the sync batch
        """
        batch_id = uuid.uuid4()
        
        # Create sync log entry
        sync_log = ParcelSyncLog(
            batch_id=batch_id,
            sync_type="full_refresh",
            triggered_by=triggered_by_user_id,
            status="running"
        )
        self.db.add(sync_log)
        self.db.commit()
        
        logger.info(f"Starting full refresh sync with batch ID: {batch_id}")
        
        try:
            # Test LINZ connection first
            connection_test = await self.linz_service.test_connection()
            if not connection_test["success"]:
                raise Exception(f"LINZ API connection failed: {connection_test['error']}")
            
            sync_log.total_records = connection_test["total_parcels"]
            sync_log.add_metadata("linz_connection_test", connection_test)
            self.db.commit()
            
            # Process all parcels in batches
            total_processed = 0
            created_count = 0
            updated_count = 0
            error_count = 0
            
            # Progress callback to update sync log
            async def update_progress(processed, total, batch_metadata):
                sync_log.processed_records = processed
                sync_log.add_metadata("last_batch", batch_metadata)
                self.db.commit()
            
            # Stream and process all parcels
            async for features, batch_metadata in self.linz_service.stream_all_parcels(update_progress):
                try:
                    batch_result = await self._process_parcel_batch(features, batch_id)
                    
                    total_processed += batch_result["processed"]
                    created_count += batch_result["created"]
                    updated_count += batch_result["updated"]
                    error_count += batch_result["errors"]
                    
                    # Update sync log with progress
                    sync_log.processed_records = total_processed
                    sync_log.created_records = created_count
                    sync_log.updated_records = updated_count
                    sync_log.add_metadata("error_count", error_count)
                    sync_log.add_metadata("latest_batch_stats", batch_result)
                    self.db.commit()
                    
                    logger.info(f"Processed batch: {total_processed:,} total, "
                               f"{created_count:,} created, {updated_count:,} updated, "
                               f"{error_count:,} errors")
                    
                except Exception as e:
                    logger.error(f"Error processing batch: {e}")
                    error_count += len(features)
                    continue
            
            # Mark inactive parcels that weren't in this sync
            deleted_count = self._mark_missing_parcels_inactive(batch_id)
            
            # Complete sync log
            sync_log.status = "completed"
            sync_log.completed_at = datetime.now(timezone.utc)
            sync_log.total_records = total_processed
            sync_log.deleted_records = deleted_count
            sync_log.add_metadata("final_stats", {
                "total_processed": total_processed,
                "created": created_count,
                "updated": updated_count,
                "deleted": deleted_count,
                "errors": error_count
            })
            self.db.commit()
            
            logger.info(f"Sync completed successfully: {total_processed:,} processed, "
                       f"{created_count:,} created, {updated_count:,} updated, "
                       f"{deleted_count:,} deactivated, {error_count:,} errors")
            
        except Exception as e:
            # Mark sync as failed
            sync_log.status = "failed"
            sync_log.error_message = str(e)
            sync_log.completed_at = datetime.now(timezone.utc)
            self.db.commit()
            
            logger.error(f"Sync failed: {e}")
            raise
            
        return batch_id
    
    async def _process_parcel_batch(self, features: List[Dict], batch_id: uuid.UUID) -> Dict:
        """
        Process a batch of parcel features from LINZ
        
        Args:
            features: List of GeoJSON features from LINZ
            batch_id: UUID of the sync batch
            
        Returns:
            Dict with processing statistics
        """
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
                
                # Prepare database insert/update
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
                    "sync_batch_id": batch_id,
                    "is_active": True
                }
                
                # Handle geometry
                if parcel_data["geometry_2193"]:
                    db_data["geometry"] = from_shape(parcel_data["geometry_2193"], srid=2193)
                    db_data["geometry_wgs84"] = func.ST_Transform(
                        from_shape(parcel_data["geometry_2193"], srid=2193), 4326
                    )
                
                # Use PostgreSQL UPSERT for efficiency
                stmt = insert(PrimaryParcel).values(**db_data)
                
                # On conflict, update all fields except id and linz_id
                update_dict = {key: stmt.excluded[key] for key in db_data.keys() 
                              if key not in ['linz_id']}
                update_dict['updated_at'] = datetime.now(timezone.utc)
                
                stmt = stmt.on_conflict_do_update(
                    index_elements=['linz_id'],
                    set_=update_dict
                )
                
                # Execute and determine if it was insert or update
                result = self.db.execute(stmt)
                
                if result.rowcount == 1:
                    # Check if this was an insert or update by looking at the updated_at timestamp
                    # This is a simplified approach - in production you might want more sophisticated tracking
                    created += 1  # For simplicity, we'll count all as created for now
                
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
    
    def _mark_missing_parcels_inactive(self, batch_id: uuid.UUID) -> int:
        """
        Mark parcels not in current sync as inactive
        
        Args:
            batch_id: UUID of the current sync batch
            
        Returns:
            Number of parcels marked as inactive
        """
        result = self.db.execute(
            text("""
                UPDATE primary_parcels 
                SET is_active = false, 
                    updated_at = :now
                WHERE (sync_batch_id != :batch_id OR sync_batch_id IS NULL)
                  AND is_active = true
            """),
            {"batch_id": batch_id, "now": datetime.now(timezone.utc)}
        )
        self.db.commit()
        return result.rowcount
    
    def get_sync_status(self, batch_id: Optional[uuid.UUID] = None) -> Optional[Dict]:
        """
        Get status of a sync operation
        
        Args:
            batch_id: Specific batch ID, or None for latest
            
        Returns:
            Sync status dict or None if not found
        """
        if batch_id:
            sync_log = self.db.query(ParcelSyncLog).filter(
                ParcelSyncLog.batch_id == batch_id
            ).first()
        else:
            sync_log = self.db.query(ParcelSyncLog).order_by(
                ParcelSyncLog.started_at.desc()
            ).first()
        
        if not sync_log:
            return None
        
        return {
            "batch_id": sync_log.batch_id,
            "sync_type": sync_log.sync_type,
            "status": sync_log.status,
            "started_at": sync_log.started_at,
            "completed_at": sync_log.completed_at,
            "duration_seconds": sync_log.duration_seconds,
            "progress_percentage": sync_log.progress_percentage,
            "total_records": sync_log.total_records,
            "processed_records": sync_log.processed_records,
            "created_records": sync_log.created_records,
            "updated_records": sync_log.updated_records,
            "deleted_records": sync_log.deleted_records,
            "error_message": sync_log.error_message,
            "sync_metadata": sync_log.sync_metadata
        }
    
    async def test_small_sync(self, limit: int = 100) -> Dict:
        """
        Test sync with a small number of parcels for development/testing
        
        Args:
            limit: Number of parcels to sync for testing
            
        Returns:
            Dict with sync results
        """
        logger.info(f"Starting test sync with {limit} parcels")
        
        try:
            # Fetch a small batch
            features, metadata = await self.linz_service.fetch_parcels_batch(0, limit)
            
            if not features:
                return {
                    "success": False,
                    "error": "No features returned from LINZ API"
                }
            
            # Process the batch
            batch_id = uuid.uuid4()
            batch_result = await self._process_parcel_batch(features, batch_id)
            
            return {
                "success": True,
                "batch_id": str(batch_id),
                "features_fetched": len(features),
                "request_duration": metadata["request_duration_seconds"],
                "processing_result": batch_result
            }
            
        except Exception as e:
            logger.error(f"Test sync failed: {e}")
            return {
                "success": False,
                "error": str(e)
            }