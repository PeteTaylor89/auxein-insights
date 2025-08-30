# ==================================================
# File: services/linz_parcels_service.py (CORRECTED URL FORMAT)
# ==================================================

import httpx
import asyncio
from typing import List, Dict, Optional, AsyncGenerator, Tuple
from shapely.geometry import shape
import logging
from datetime import datetime, timezone
import json

logger = logging.getLogger(__name__)

class LINZParcelsService:
    """Service for fetching NZ Primary Parcels data from LINZ API"""
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        # CORRECTED: API key goes in the URL path, not as a parameter
        self.base_url = f"https://data.linz.govt.nz/services;key={api_key}"
        self.layer_id = "50772"  # NZ Primary Parcels layer ID
        self.batch_size = 1000   # Records per API call
        self.max_concurrent = 3  # Concurrent requests (be respectful to LINZ)
        self.request_delay = 0.2 # Delay between requests in seconds
        
        # HTTP client settings
        self.timeout = httpx.Timeout(60.0, connect=10.0)
        self.limits = httpx.Limits(max_keepalive_connections=5, max_connections=10)
        
    async def test_connection(self) -> Dict:
        """Test connection to LINZ API and validate credentials"""
        try:
            # Use the WFS GetCapabilities request to test connection
            url = f"{self.base_url}/wfs"
            params = {
                "service": "WFS",
                "version": "2.0.0",
                "request": "GetCapabilities"
            }
            
            async with httpx.AsyncClient(timeout=self.timeout, limits=self.limits) as client:
                response = await client.get(url, params=params)
                response.raise_for_status()
                
                # Check if response contains our layer
                response_text = response.text
                layer_reference = f"layer-{self.layer_id}"
                if layer_reference in response_text:
                    logger.info(f"LINZ API connection successful. Layer {self.layer_id} found.")
                    
                    # Now test a simple feature count request
                    return await self._test_feature_count()
                else:
                    return {
                        "success": False,
                        "error": f"Layer {self.layer_id} not found in capabilities",
                        "message": "Layer may not be accessible with your API key"
                    }
                    
        except httpx.HTTPStatusError as e:
            logger.error(f"LINZ API HTTP error: {e.response.status_code} - {e.response.text}")
            return {
                "success": False,
                "error": f"HTTP {e.response.status_code}: {e.response.text}",
                "message": "Check your LINZ API key and permissions"
            }
        except Exception as e:
            logger.error(f"LINZ API connection error: {e}")
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to connect to LINZ API"
            }
    
    async def _test_feature_count(self) -> Dict:
        """Test getting feature count using proper WFS syntax"""
        try:
            url = f"{self.base_url}/wfs"
            params = {
                "service": "WFS",
                "version": "2.0.0",
                "request": "GetFeature",
                "typeNames": f"layer-{self.layer_id}",
                "resultType": "hits"
            }
            
            async with httpx.AsyncClient(timeout=self.timeout, limits=self.limits) as client:
                response = await client.get(url, params=params)
                response.raise_for_status()
                
                # Parse XML response to get feature count
                response_text = response.text
                
                # Simple XML parsing to find numberOfFeatures
                import re
                match = re.search(r'numberOfFeatures="(\d+)"', response_text)
                if match:
                    total_features = int(match.group(1))
                else:
                    # Try alternative parsing
                    match = re.search(r'numberMatched="(\d+)"', response_text)
                    total_features = int(match.group(1)) if match else 0
                
                logger.info(f"LINZ API connection successful. Total parcels available: {total_features:,}")
                
                return {
                    "success": True,
                    "total_parcels": total_features,
                    "layer_id": self.layer_id,
                    "message": f"Connected successfully. {total_features:,} parcels available."
                }
                
        except Exception as e:
            logger.error(f"Error testing feature count: {e}")
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to get feature count from LINZ API"
            }
    
    async def get_total_parcel_count(self) -> int:
        """Get total count of parcels available from LINZ"""
        try:
            url = f"{self.base_url}/wfs"
            params = {
                "service": "WFS",
                "version": "2.0.0",
                "request": "GetFeature",
                "typeNames": f"layer-{self.layer_id}",
                "resultType": "hits"
            }
            
            async with httpx.AsyncClient(timeout=self.timeout, limits=self.limits) as client:
                response = await client.get(url, params=params)
                response.raise_for_status()
                
                # Parse XML response
                response_text = response.text
                import re
                match = re.search(r'numberOfFeatures="(\d+)"', response_text)
                if match:
                    total = int(match.group(1))
                else:
                    match = re.search(r'numberMatched="(\d+)"', response_text)
                    total = int(match.group(1)) if match else 0
                
                logger.info(f"Total parcels available from LINZ: {total:,}")
                return total
                
        except Exception as e:
            logger.error(f"Error getting total parcel count: {e}")
            raise
    
    async def fetch_parcels_batch(
        self, 
        offset: int, 
        limit: int = None
    ) -> Tuple[List[Dict], Dict]:
        """
        Fetch a batch of parcels from LINZ API using WFS
        Returns: (features_list, metadata_dict)
        """
        if limit is None:
            limit = self.batch_size
            
        url = f"{self.base_url}/wfs"
        params = {
            "service": "WFS",
            "version": "2.0.0",
            "request": "GetFeature",
            "typeNames": f"layer-{self.layer_id}",
            "outputFormat": "application/json",
            "srsName": "EPSG:2193",  # NZTM2000
            "startIndex": offset,
            "count": limit
        }
        
        start_time = datetime.now(timezone.utc)
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout, limits=self.limits) as client:
                response = await client.get(url, params=params)
                response.raise_for_status()
                
                end_time = datetime.now(timezone.utc)
                request_duration = (end_time - start_time).total_seconds()
                
                data = response.json()
                features = data.get("features", [])
                
                # Collect metadata about this request
                metadata = {
                    "request_duration_seconds": request_duration,
                    "response_size_bytes": len(response.content),
                    "features_returned": len(features),
                    "offset": offset,
                    "limit": limit,
                    "timestamp": start_time.isoformat(),
                    "srs": params["srsName"]
                }
                
                logger.debug(f"Fetched batch: offset={offset}, count={len(features)}, duration={request_duration:.2f}s")
                
                return features, metadata
                
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error fetching batch at offset {offset}: {e.response.status_code}")
            logger.error(f"Response: {e.response.text[:500]}...")
            raise
        except httpx.TimeoutException:
            logger.error(f"Timeout fetching batch at offset {offset}")
            raise
        except Exception as e:
            logger.error(f"Error fetching batch at offset {offset}: {e}")
            raise
    
    async def stream_all_parcels(
        self, 
        progress_callback: Optional[callable] = None
    ) -> AsyncGenerator[Tuple[List[Dict], Dict], None]:
        """
        Stream all parcels in batches with progress tracking
        
        Args:
            progress_callback: Optional function called with (processed, total, metadata)
        
        Yields:
            Tuple of (features_list, batch_metadata)
        """
        total_count = await self.get_total_parcel_count()
        processed_count = 0
        
        logger.info(f"Starting to stream {total_count:,} parcels in batches of {self.batch_size}")
        
        # Semaphore to limit concurrent requests
        semaphore = asyncio.Semaphore(self.max_concurrent)
        
        async def fetch_batch_with_semaphore(offset: int):
            async with semaphore:
                # Add delay to be respectful to LINZ API
                if offset > 0:  # Don't delay the first request
                    await asyncio.sleep(self.request_delay)
                return await self.fetch_parcels_batch(offset, self.batch_size)
        
        # Process in chunks
        for offset in range(0, total_count, self.batch_size):
            try:
                features, batch_metadata = await fetch_batch_with_semaphore(offset)
                
                if not features:
                    logger.warning(f"Empty batch at offset {offset}, stopping")
                    break
                
                processed_count += len(features)
                
                # Add progress info to metadata
                batch_metadata.update({
                    "total_parcels": total_count,
                    "processed_count": processed_count,
                    "progress_percentage": (processed_count / total_count) * 100 if total_count > 0 else 0,
                    "remaining_count": total_count - processed_count
                })
                
                # Call progress callback if provided
                if progress_callback:
                    try:
                        await progress_callback(processed_count, total_count, batch_metadata)
                    except Exception as e:
                        logger.warning(f"Progress callback error: {e}")
                
                yield features, batch_metadata
                
                logger.info(f"Streamed batch: {processed_count:,}/{total_count:,} "
                           f"({batch_metadata['progress_percentage']:.1f}%) complete")
                
            except Exception as e:
                logger.error(f"Error streaming batch at offset {offset}: {e}")
                # Don't re-raise here, let the sync service handle it
                break
        
        logger.info(f"Completed streaming. Processed {processed_count:,} parcels")
    
    def process_parcel_feature(self, feature: Dict) -> Optional[Dict]:
        """
        Process a single parcel feature from LINZ into our database format
        
        Args:
            feature: GeoJSON feature from LINZ API
            
        Returns:
            Processed parcel data dict or None if invalid
        """
        try:
            props = feature.get("properties", {})
            geometry = feature.get("geometry")
            
            # Extract LINZ ID (required field)
            linz_id = props.get("id")
            if not linz_id:
                logger.warning("Feature missing required 'id' field, skipping")
                return None
            
            # Process geometry
            geom_2193 = None
            if geometry:
                try:
                    geom_2193 = shape(geometry)
                    # Validate geometry
                    if not geom_2193.is_valid:
                        logger.warning(f"Invalid geometry for parcel {linz_id}, attempting to fix")
                        # Try to fix invalid geometry
                        geom_2193 = geom_2193.buffer(0)
                        if not geom_2193.is_valid:
                            logger.warning(f"Could not fix geometry for parcel {linz_id}, skipping")
                            return None
                except Exception as e:
                    logger.warning(f"Error processing geometry for parcel {linz_id}: {e}")
                    return None
            
            # Clean and process array fields
            def clean_array_field(value):
                if value is None:
                    return []
                if isinstance(value, list):
                    return [str(item) for item in value if item is not None]
                if isinstance(value, str):
                    # Handle comma-separated strings
                    return [item.strip() for item in value.split(',') if item.strip()]
                return [str(value)]
            
            # Clean numeric fields
            def clean_numeric(value):
                if value is None or value == '':
                    return None
                try:
                    return float(value)
                except (ValueError, TypeError):
                    return None
            
            # Build the processed parcel data
            parcel_data = {
                "linz_id": int(linz_id),
                "appellation": props.get("appellation"),
                "affected_surveys": clean_array_field(props.get("affected_surveys")),
                "parcel_intent": props.get("parcel_intent"),
                "topology_type": props.get("topology_type"),
                "statutory_actions": clean_array_field(props.get("statutory_actions")),
                "land_district": props.get("land_district"),
                "titles": clean_array_field(props.get("titles")),
                "survey_area": clean_numeric(props.get("survey_area")),
                "calc_area": clean_numeric(props.get("calc_area")),
                "geometry_2193": geom_2193
            }
            
            return parcel_data
            
        except Exception as e:
            logger.error(f"Error processing parcel feature: {e}")
            return None
    
    async def get_parcels_by_bbox(
        self, 
        west: float, 
        south: float, 
        east: float, 
        north: float,
        max_features: int = 1000
    ) -> List[Dict]:
        """
        Get parcels within a bounding box (for map display)
        
        Args:
            west, south, east, north: Bounding box in WGS84 coordinates
            max_features: Maximum number of features to return
            
        Returns:
            List of processed parcel features
        """
        try:
            url = f"{self.base_url}/wfs"
            
            # Create bbox parameter (west,south,east,north)
            bbox = f"{west},{south},{east},{north}"
            
            params = {
                "service": "WFS",
                "version": "2.0.0",
                "request": "GetFeature",
                "typeNames": f"layer-{self.layer_id}",
                "outputFormat": "application/json",
                "srsName": "EPSG:2193",  # Return in NZTM2000
                "bbox": bbox,
                "count": max_features
            }
            
            async with httpx.AsyncClient(timeout=self.timeout, limits=self.limits) as client:
                response = await client.get(url, params=params)
                response.raise_for_status()
                
                data = response.json()
                features = data.get("features", [])
                
                logger.info(f"Fetched {len(features)} parcels for bbox {bbox}")
                
                # Process features
                processed_parcels = []
                for feature in features:
                    processed = self.process_parcel_feature(feature)
                    if processed:
                        processed_parcels.append(processed)
                
                return processed_parcels
                
        except Exception as e:
            logger.error(f"Error fetching parcels by bbox: {e}")
            raise
    
    async def get_parcel_by_linz_id(self, linz_id: int) -> Optional[Dict]:
        """
        Get a specific parcel by its LINZ ID
        
        Args:
            linz_id: LINZ parcel ID
            
        Returns:
            Processed parcel data or None if not found
        """
        try:
            url = f"{self.base_url}/wfs"
            params = {
                "service": "WFS",
                "version": "2.0.0",
                "request": "GetFeature",
                "typeNames": f"layer-{self.layer_id}",
                "outputFormat": "application/json",
                "srsName": "EPSG:2193",
                "cql_filter": f"id={linz_id}",
                "count": 1
            }
            
            async with httpx.AsyncClient(timeout=self.timeout, limits=self.limits) as client:
                response = await client.get(url, params=params)
                response.raise_for_status()
                
                data = response.json()
                features = data.get("features", [])
                
                if features:
                    return self.process_parcel_feature(features[0])
                else:
                    logger.warning(f"Parcel with LINZ ID {linz_id} not found")
                    return None
                    
        except Exception as e:
            logger.error(f"Error fetching parcel {linz_id}: {e}")
            raise