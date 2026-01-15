# api/routers/blocks_query.py
"""
Public API endpoint for querying vineyard blocks by clicking on map.
Returns block metadata WITHOUT geometry to prevent scraping.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
from datetime import datetime, timedelta
from collections import defaultdict
import logging

from api.deps import get_db
from core.public_security import get_current_public_user
from db.models.public_user import PublicUser
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/public/blocks", tags=["public-blocks"])


# ============================================================================
# PYDANTIC SCHEMAS
# ============================================================================

class BlockQueryResponse(BaseModel):
    """Response schema for block query - NO GEOMETRY"""
    id: int
    block_name: Optional[str]
    variety: Optional[str]
    area: Optional[float]
    region: Optional[str]
    gi: Optional[str]  # Geographical Indication
    planted_date: Optional[str]
    elevation: Optional[float]
    winery: Optional[str]
    
    # Sustainability flags
    organic: bool = False
    biodynamic: bool = False
    regenerative: bool = False
    swnz: bool = False
    
    # Calculated fields
    age_years: Optional[int] = None
    
    class Config:
        from_attributes = True


class ClickLog(BaseModel):
    """Log entry for click tracking"""
    user_id: int
    lng: float
    lat: float
    timestamp: datetime
    found_block: bool


# ============================================================================
# IN-MEMORY RATE LIMITING & GRID DETECTION
# ============================================================================

class ClickTracker:
    """In-memory tracker for detecting suspicious click patterns"""
    
    def __init__(self):
        # Store last N clicks per user: {user_id: [ClickLog, ...]}
        self.user_clicks = defaultdict(list)
        self.max_history = 50  # Keep last 50 clicks per user
        
    def add_click(self, user_id: int, lng: float, lat: float, found_block: bool):
        """Record a click"""
        click = ClickLog(
            user_id=user_id,
            lng=lng,
            lat=lat,
            timestamp=datetime.now(),
            found_block=found_block
        )
        
        self.user_clicks[user_id].append(click)
        
        # Keep only recent clicks
        if len(self.user_clicks[user_id]) > self.max_history:
            self.user_clicks[user_id] = self.user_clicks[user_id][-self.max_history:]
    
    def get_recent_clicks(self, user_id: int, minutes: int = 5) -> list[ClickLog]:
        """Get clicks from last N minutes"""
        cutoff = datetime.now() - timedelta(minutes=minutes)
        return [
            click for click in self.user_clicks.get(user_id, [])
            if click.timestamp > cutoff
        ]
    
    def is_grid_scanning(self, user_id: int) -> bool:
        """
        Detect if user is clicking in a systematic grid pattern.
        
        Indicators:
        - Many clicks in short time
        - Evenly spaced coordinates
        - High success rate finding blocks
        """
        recent = self.get_recent_clicks(user_id, minutes=5)
        
        if len(recent) < 20:
            return False  # Not enough data
        
        # Check 1: Too many clicks too fast (>20 in 5 min = suspicious)
        if len(recent) > 20:
            logger.warning(f"User {user_id}: {len(recent)} clicks in 5 minutes")
        
        # Check 2: Very high success rate (>90% = suspicious)
        success_rate = sum(1 for c in recent if c.found_block) / len(recent)
        if success_rate > 0.9:
            logger.warning(f"User {user_id}: {success_rate:.1%} success rate")
            return True
        
        # Check 3: Evenly spaced coordinates (grid pattern)
        if self._is_grid_pattern(recent):
            logger.warning(f"User {user_id}: Grid pattern detected")
            return True
        
        return False
    
    def _is_grid_pattern(self, clicks: list[ClickLog]) -> bool:
        """Check if clicks form a regular grid"""
        if len(clicks) < 10:
            return False
        
        # Calculate spacing between consecutive clicks
        spacings = []
        for i in range(1, len(clicks)):
            prev = clicks[i-1]
            curr = clicks[i]
            spacing = ((curr.lng - prev.lng)**2 + (curr.lat - prev.lat)**2)**0.5
            spacings.append(spacing)
        
        if not spacings:
            return False
        
        # If spacing is very consistent (low variance), likely a grid
        avg_spacing = sum(spacings) / len(spacings)
        variance = sum((s - avg_spacing)**2 for s in spacings) / len(spacings)
        std_dev = variance ** 0.5
        
        # Low standard deviation relative to mean = regular pattern
        if avg_spacing > 0 and (std_dev / avg_spacing) < 0.3:
            return True
        
        return False


# Global click tracker instance
click_tracker = ClickTracker()


# ============================================================================
# RATE LIMITING DEPENDENCY
# ============================================================================

class RateLimiter:
    """Simple in-memory rate limiter"""
    
    def __init__(self):
        self.requests = defaultdict(list)  # {user_id: [timestamp, ...]}
    
    def check_rate_limit(self, user_id: int, max_per_minute: int = 30, max_per_hour: int = 200):
        """
        Check if user has exceeded rate limits.
        Returns (allowed: bool, retry_after: Optional[int])
        """
        now = datetime.now()
        
        # Clean old timestamps
        cutoff_minute = now - timedelta(minutes=1)
        cutoff_hour = now - timedelta(hours=1)
        
        user_requests = self.requests[user_id]
        self.requests[user_id] = [t for t in user_requests if t > cutoff_hour]
        
        # Check limits
        recent_minute = sum(1 for t in self.requests[user_id] if t > cutoff_minute)
        recent_hour = len(self.requests[user_id])
        
        if recent_minute >= max_per_minute:
            retry_after = 60  # Wait 1 minute
            return False, retry_after
        
        if recent_hour >= max_per_hour:
            retry_after = 3600  # Wait 1 hour
            return False, retry_after
        
        # Record this request
        self.requests[user_id].append(now)
        
        return True, None


rate_limiter = RateLimiter()


# ============================================================================
# API ENDPOINTS
# ============================================================================

@router.get("/query", response_model=BlockQueryResponse)
async def query_block_at_point(
    lng: float = Field(..., description="Longitude (e.g., 172.1234)", ge=-180, le=180),
    lat: float = Field(..., description="Latitude (e.g., -41.5678)", ge=-90, le=90),
    current_user: PublicUser = Depends(get_current_public_user),
    db: Session = Depends(get_db)
):
    """
    Find which vineyard block contains the clicked point.
    
    Security features:
    - Authentication required (JWT token)
    - Rate limited (30/min, 200/hour)
    - Grid scanning detection
    - NO GEOMETRY returned (prevents scraping)
    - Click tracking for monitoring
    
    Returns:
    - Block metadata if point is inside a block
    - 404 if point is outside all blocks
    - 429 if rate limit exceeded
    - 403 if suspicious activity detected
    """
    
    # ========================================================================
    # SECURITY: Rate Limiting
    # ========================================================================
    allowed, retry_after = rate_limiter.check_rate_limit(current_user.id)
    
    if not allowed:
        logger.warning(f"Rate limit exceeded for user {current_user.id} ({current_user.email})")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded. Try again in {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)}
        )
    
    # ========================================================================
    # SECURITY: Grid Scanning Detection
    # ========================================================================
    if click_tracker.is_grid_scanning(current_user.id):
        logger.error(f"Grid scanning detected for user {current_user.id} ({current_user.email})")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Suspicious activity detected. Your account has been flagged for review."
        )
    
    # ========================================================================
    # QUERY: Point-in-Polygon (PostGIS)
    # ========================================================================
    try:
        # Use PostGIS ST_Contains to find block containing this point
        # ST_Contains is indexed and very fast (microseconds)
        query = text("""
            SELECT 
                id,
                block_name,
                variety,
                area,
                region,
                gi,
                planted_date,
                elevation,
                winery,
                organic,
                biodynamic,
                regenerative,
                swnz,
                EXTRACT(YEAR FROM AGE(COALESCE(removed_date, CURRENT_DATE), planted_date))::INTEGER as age_years
            FROM vineyard_blocks
            WHERE 
                geometry IS NOT NULL
                AND ST_Contains(
                    geometry, 
                    ST_SetSRID(ST_Point(:lng, :lat), 4326)
                )
            LIMIT 1
        """)
        
        result = db.execute(query, {"lng": lng, "lat": lat}).fetchone()
        
        # Track this click
        click_tracker.add_click(
            user_id=current_user.id,
            lng=lng,
            lat=lat,
            found_block=result is not None
        )
        
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No vineyard block found at this location"
            )
        
        # Convert Row to dict
        block_data = dict(result._mapping)
        
        # Format date as string if present
        if block_data.get('planted_date'):
            block_data['planted_date'] = block_data['planted_date'].isoformat()
        
        logger.info(
            f"User {current_user.id} queried block {block_data['id']} "
            f"({block_data.get('block_name', 'Unnamed')}) at ({lng:.4f}, {lat:.4f})"
        )
        
        return BlockQueryResponse(**block_data)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying block: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error querying vineyard block"
        )


@router.get("/stats")
async def get_public_stats(
    current_user: PublicUser = Depends(get_current_public_user),
    db: Session = Depends(get_db)
):
    """
    Get public statistics about vineyard blocks (no sensitive data).
    Useful for displaying general info about NZ wine regions.
    """
    try:
        query = text("""
            SELECT 
                COUNT(*) as total_blocks,
                COUNT(DISTINCT region) as total_regions,
                COUNT(DISTINCT variety) as total_varieties,
                SUM(area) as total_area_ha,
                COUNT(CASE WHEN organic = true THEN 1 END) as organic_blocks,
                COUNT(CASE WHEN biodynamic = true THEN 1 END) as biodynamic_blocks,
                COUNT(CASE WHEN regenerative = true THEN 1 END) as regenerative_blocks
            FROM vineyard_blocks
            WHERE geometry IS NOT NULL
        """)
        
        result = db.execute(query).fetchone()
        
        return {
            "total_blocks": result.total_blocks,
            "total_regions": result.total_regions,
            "total_varieties": result.total_varieties,
            "total_area_ha": round(result.total_area_ha, 2) if result.total_area_ha else 0,
            "sustainable_practices": {
                "organic": result.organic_blocks,
                "biodynamic": result.biodynamic_blocks,
                "regenerative": result.regenerative_blocks
            }
        }
    
    except Exception as e:
        logger.error(f"Error fetching stats: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error fetching statistics"
        )


@router.get("/regions")
async def get_regions(
    current_user: PublicUser = Depends(get_current_public_user),
    db: Session = Depends(get_db)
):
    """
    Get list of wine regions with bounding boxes for map navigation.
    """
    try:
        query = text("""
            SELECT 
                region,
                COUNT(*) as block_count,
                SUM(area) as total_area_ha,
                ST_XMin(ST_Extent(geometry)) as min_lng,
                ST_YMin(ST_Extent(geometry)) as min_lat,
                ST_XMax(ST_Extent(geometry)) as max_lng,
                ST_YMax(ST_Extent(geometry)) as max_lat
            FROM vineyard_blocks
            WHERE 
                geometry IS NOT NULL 
                AND region IS NOT NULL
            GROUP BY region
            ORDER BY total_area_ha DESC
        """)
        
        results = db.execute(query).fetchall()
        
        regions = []
        for row in results:
            regions.append({
                "name": row.region,
                "block_count": row.block_count,
                "total_area_ha": round(row.total_area_ha, 2) if row.total_area_ha else 0,
                "bounds": {
                    "min_lng": row.min_lng,
                    "min_lat": row.min_lat,
                    "max_lng": row.max_lng,
                    "max_lat": row.max_lat
                }
            })
        
        return regions
    
    except Exception as e:
        logger.error(f"Error fetching regions: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error fetching regions"
        )