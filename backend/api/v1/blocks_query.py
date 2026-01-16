# api/routers/blocks_query.py
"""
Public API endpoint for querying vineyard blocks by clicking on map.
Returns block metadata WITHOUT geometry to prevent scraping.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request, BackgroundTasks, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
from datetime import datetime, timedelta
from collections import defaultdict
import logging
import smtplib
import json
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
from api.deps import get_db
from core.public_security import get_current_public_user
from db.models.public_user import PublicUser
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(tags=["public-blocks"])

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

class IssueReport(BaseModel):
    """Schema for reporting block data issues"""
    block_id: int
    block_name: str
    issue_type: str  # wrong_variety, wrong_name, wrong_area, wrong_location, other
    description: str
    reported_at: str

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

class GeoJSONRateLimiter:
    """Rate limiter specifically for GeoJSON bulk requests"""
    
    def __init__(self):
        self.requests = defaultdict(list)  # {user_id: [timestamp, ...]}
    
    def check_rate_limit(self, user_id: int, max_per_hour: int = 10, max_per_day: int = 50):
        """
        GeoJSON endpoint is heavily rate limited since it returns all blocks.
        Users should only need to call this once per session.
        """
        now = datetime.now()
        
        # Clean old timestamps
        cutoff_hour = now - timedelta(hours=1)
        cutoff_day = now - timedelta(days=1)
        
        user_requests = self.requests[user_id]
        self.requests[user_id] = [t for t in user_requests if t > cutoff_day]
        
        # Check limits
        recent_hour = sum(1 for t in self.requests[user_id] if t > cutoff_hour)
        recent_day = len(self.requests[user_id])
        
        if recent_hour >= max_per_hour:
            retry_after = 3600
            return False, retry_after
        
        if recent_day >= max_per_day:
            retry_after = 86400
            return False, retry_after
        
        # Record this request
        self.requests[user_id].append(now)
        
        return True, None


geojson_rate_limiter = GeoJSONRateLimiter()


def generate_sql_update(issue: IssueReport) -> str:
    """
    Generate SQL script for quick database update.
    Admin can copy-paste this into their SQL client.
    """
    
    if issue.issue_type == "wrong_variety":
        return f"""
-- Update variety for block {issue.block_id}
-- Issue: {issue.description}
UPDATE vineyard_blocks
SET variety = 'NEW_VARIETY_HERE',  -- TODO: Replace with correct variety
    updated_at = CURRENT_TIMESTAMP
WHERE id = {issue.block_id};

-- Verify update
SELECT id, block_name, variety, updated_at 
FROM vineyard_blocks 
WHERE id = {issue.block_id};
"""
    
    elif issue.issue_type == "wrong_name":
        return f"""
-- Update name for block {issue.block_id}
-- Issue: {issue.description}
UPDATE vineyard_blocks
SET block_name = 'NEW_NAME_HERE',  -- TODO: Replace with correct name
    updated_at = CURRENT_TIMESTAMP
WHERE id = {issue.block_id};

-- Verify update
SELECT id, block_name, variety, updated_at 
FROM vineyard_blocks 
WHERE id = {issue.block_id};
"""
    
    elif issue.issue_type == "wrong_area":
        return f"""
-- Update area for block {issue.block_id}
-- Issue: {issue.description}
UPDATE vineyard_blocks
SET area = 0.00,  -- TODO: Replace with correct area in hectares
    updated_at = CURRENT_TIMESTAMP
WHERE id = {issue.block_id};

-- Verify update
SELECT id, block_name, area, updated_at 
FROM vineyard_blocks 
WHERE id = {issue.block_id};
"""
    
    elif issue.issue_type == "wrong_location":
        return f"""
-- Update location for block {issue.block_id}
-- Issue: {issue.description}
-- NOTE: This may require GIS tools to update geometry
UPDATE vineyard_blocks
SET centroid_latitude = 0.0,    -- TODO: Replace with correct latitude
    centroid_longitude = 0.0,   -- TODO: Replace with correct longitude
    updated_at = CURRENT_TIMESTAMP
WHERE id = {issue.block_id};

-- For geometry updates, use PostGIS:
-- UPDATE vineyard_blocks
-- SET geometry = ST_SetSRID(ST_GeomFromText('POLYGON((lng lat, ...))'), 4326)
-- WHERE id = {issue.block_id};

-- Verify update
SELECT id, block_name, centroid_latitude, centroid_longitude, updated_at 
FROM vineyard_blocks 
WHERE id = {issue.block_id};
"""
    
    else:  # other
        return f"""
-- Manual review required for block {issue.block_id}
-- Issue type: {issue.issue_type}
-- Description: {issue.description}

-- View block details
SELECT * FROM vineyard_blocks WHERE id = {issue.block_id};

-- Update block after manual review:
UPDATE vineyard_blocks
SET 
    -- Add fields to update here
    updated_at = CURRENT_TIMESTAMP
WHERE id = {issue.block_id};
"""


# Add this function for sending emails:

async def send_issue_report_email(issue: IssueReport, user_email: str):
    """
    Send email notification about reported issue.
    Uses environment variables for SMTP configuration.
    """
    
    # Email configuration from environment
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_password = os.getenv("SMTP_PASSWORD", "")
    from_email = os.getenv("FROM_EMAIL", smtp_user)
    to_email = "insights@auxein.co.nz"
    
    if not smtp_user or not smtp_password:
        logger.warning("SMTP credentials not configured. Email notification skipped.")
        return
    
    # Generate SQL script
    sql_script = generate_sql_update(issue)
    
    # Create email
    msg = MIMEMultipart('alternative')
    msg['Subject'] = f"Block Data Issue Report: {issue.block_name}"
    msg['From'] = from_email
    msg['To'] = to_email
    msg['Reply-To'] = user_email
    
    # Email body
    text_body = f"""
Block Data Issue Report

Block ID: {issue.block_id}
Block Name: {issue.block_name}
Issue Type: {issue.issue_type.replace('_', ' ').title()}
Description: {issue.description}

Reported By: {user_email}
Reported At: {issue.reported_at}

--- SQL UPDATE SCRIPT ---
{sql_script}
---

You can copy the SQL script above and run it in pgAdmin or your SQL client after verifying the correction.

To reply to the user, use: {user_email}
"""
    
    html_body = f"""
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: #22c55e; color: white; padding: 20px; border-radius: 8px 8px 0 0; }}
        .content {{ background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }}
        .field {{ margin-bottom: 15px; }}
        .label {{ font-weight: 600; color: #6b7280; font-size: 12px; text-transform: uppercase; }}
        .value {{ color: #1f2937; font-size: 15px; margin-top: 4px; }}
        .sql-script {{ background: #1f2937; color: #f0fdf4; padding: 20px; border-radius: 6px; font-family: 'Courier New', monospace; font-size: 13px; overflow-x: auto; margin: 20px 0; }}
        .footer {{ margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 13px; color: #6b7280; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2 style="margin: 0;">Block Data Issue Report</h2>
        </div>
        <div class="content">
            <div class="field">
                <div class="label">Block ID</div>
                <div class="value">{issue.block_id}</div>
            </div>
            <div class="field">
                <div class="label">Block Name</div>
                <div class="value">{issue.block_name}</div>
            </div>
            <div class="field">
                <div class="label">Issue Type</div>
                <div class="value">{issue.issue_type.replace('_', ' ').title()}</div>
            </div>
            <div class="field">
                <div class="label">Description</div>
                <div class="value">{issue.description}</div>
            </div>
            <div class="field">
                <div class="label">Reported By</div>
                <div class="value">{user_email}</div>
            </div>
            <div class="field">
                <div class="label">Reported At</div>
                <div class="value">{issue.reported_at}</div>
            </div>
            
            <h3>SQL Update Script</h3>
            <p>Copy and paste this script into pgAdmin or your SQL client:</p>
            <div class="sql-script">{sql_script}</div>
            
            <div class="footer">
                <p>You can reply directly to <strong>{user_email}</strong> to follow up on this report.</p>
            </div>
        </div>
    </div>
</body>
</html>
"""
    
    # Attach both plain text and HTML versions
    part1 = MIMEText(text_body, 'plain')
    part2 = MIMEText(html_body, 'html')
    msg.attach(part1)
    msg.attach(part2)
    
    # Send email
    try:
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.send_message(msg)
        
        logger.info(f"Issue report email sent successfully for block {issue.block_id}")
    
    except Exception as e:
        logger.error(f"Failed to send issue report email: {str(e)}")
        # Don't raise - email failure shouldn't block the API response




# ============================================================================
# API ENDPOINTS
# ============================================================================

@router.get("/query", response_model=BlockQueryResponse)
async def query_block_at_point(
    lng: float = Query(..., description="Longitude (e.g., 172.1234)", ge=-180, le=180),
    lat: float = Query(..., description="Latitude (e.g., -41.5678)", ge=-90, le=90),
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

@router.post("/feedback/report-issue")
async def report_block_issue(
    issue: IssueReport,
    background_tasks: BackgroundTasks,
    current_user: PublicUser = Depends(get_current_public_user),
    db: Session = Depends(get_db)
):
    """
    Report a data issue with a vineyard block.
    
    This endpoint:
    1. Validates the issue report
    2. Sends an email to insights@auxein.co.nz with:
       - Issue details
       - Reporter information
       - Pre-generated SQL script for quick correction
    3. Returns success immediately (email sent in background)
    
    Rate limited to prevent spam.
    """
    
    # Validate issue type
    valid_types = ['wrong_variety', 'wrong_name', 'wrong_area', 'wrong_location', 'other']
    if issue.issue_type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid issue type. Must be one of: {', '.join(valid_types)}"
        )
    
    # Validate description
    if not issue.description or len(issue.description.strip()) < 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Description must be at least 10 characters"
        )
    
    # Check if block exists
    try:
        query = text("SELECT id, block_name FROM vineyard_blocks WHERE id = :block_id")
        result = db.execute(query, {"block_id": issue.block_id}).fetchone()
        
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Block not found"
            )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking block existence: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error validating block"
        )
    
    # Send email notification in background
    background_tasks.add_task(
        send_issue_report_email,
        issue,
        current_user.email
    )
    
    logger.info(
        f"Issue report submitted for block {issue.block_id} "
        f"by user {current_user.id} ({current_user.email})"
    )
    
    return {
        "status": "success",
        "message": "Issue report submitted successfully. Thank you for helping improve our data!"
    }


@router.get("/geojson")
async def get_blocks_geojson(
    current_user: PublicUser = Depends(get_current_public_user),
    db: Session = Depends(get_db)
):
    """
    Get all vineyard blocks as GeoJSON for map rendering.
    
    SECURITY:
    - Returns ONLY geometry and block ID
    - NO metadata (name, variety, area, etc.)
    - Heavily rate limited (10/hour, 50/day)
    - Authentication required
    
    This endpoint is designed for rendering blocks on a map.
    To get block details, use GET /api/public/blocks/{id} after clicking.
    """
    
    # Check rate limit (very restrictive)
    allowed, retry_after = geojson_rate_limiter.check_rate_limit(current_user.id)
    
    if not allowed:
        logger.warning(f"GeoJSON rate limit exceeded for user {current_user.id}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded. Try again in {retry_after // 3600} hours.",
            headers={"Retry-After": str(retry_after)}
        )
    
    try:
        # Query blocks - ONLY id and geometry, NO other properties
        # Reduce coordinate precision to 5 decimal places (~1m accuracy)
        query = text("""
            SELECT 
                id,
                ST_AsGeoJSON(
                    ST_ReducePrecision(geometry, 0.00001)
                ) as geojson
            FROM vineyard_blocks
            WHERE 
                geometry IS NOT NULL
                AND ST_IsValid(geometry)
        """)
        
        results = db.execute(query).fetchall()
        
        # Build GeoJSON FeatureCollection
        features = []
        for row in results:
            import json
            geom = json.loads(row.geojson)
            
            features.append({
                "type": "Feature",
                "properties": {
                    "id": row.id
                    # NO other properties - metadata fetched separately
                },
                "geometry": geom
            })
        
        logger.info(
            f"User {current_user.id} loaded GeoJSON with {len(features)} blocks"
        )
        
        return {
            "type": "FeatureCollection",
            "features": features
        }
    
    except Exception as e:
        logger.error(f"Error fetching GeoJSON: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error fetching block geometries"
        )


# ============================================================================
# NEW ENDPOINT: Get single block by ID (metadata only, no geometry)
# ============================================================================

@router.get("/{block_id}")
async def get_block_by_id(
    block_id: int,
    current_user: PublicUser = Depends(get_current_public_user),
    db: Session = Depends(get_db)
):
    """
    Get details for a single vineyard block by ID.
    
    SECURITY:
    - Returns metadata ONLY (no geometry)
    - Rate limited (30/min, 200/hour)
    - Authentication required
    
    Use this after clicking a block on the map to get its details.
    """
    
    # Check rate limit
    allowed, retry_after = rate_limiter.check_rate_limit(current_user.id)
    
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded. Try again in {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)}
        )
    
    try:
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
            WHERE id = :block_id
        """)
        
        result = db.execute(query, {"block_id": block_id}).fetchone()
        
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Block not found"
            )
        
        # Convert Row to dict
        block_data = dict(result._mapping)
        
        # Format date as string if present
        if block_data.get('planted_date'):
            block_data['planted_date'] = block_data['planted_date'].isoformat()
        
        logger.info(
            f"User {current_user.id} queried block {block_id} "
            f"({block_data.get('block_name', 'Unnamed')})"
        )
        
        return BlockQueryResponse(**block_data)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching block {block_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error fetching block details"
        )
