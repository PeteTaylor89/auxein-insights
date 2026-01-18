# api/v1/admin/admin_users.py - User Management Admin Endpoints
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import func, case, and_, or_, desc, asc
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from typing import Optional, List
import csv
import io

from db.session import get_db
from db.models.public_user import PublicUser
from core.admin_security import require_admin
from schemas.admin import (
    UserStatsResponse,
    UserTypeCount,
    RegionCount,
    MarketingSegmentCount,
    OptInStats,
    UserListItem,
    UserListResponse,
    UserDetailResponse,
    UserUpdateRequest,
    ActivityTimelineItem,
    ActivityTimelineResponse,
    MessageResponse,
)

router = APIRouter(prefix="/users", tags=["Admin - Users"])


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def get_marketing_segment(user_type: Optional[str]) -> str:
    """Calculate marketing segment from user type."""
    segments = {
        'wine_company_owner': 'high_value_prospect',
        'wine_company_employee': 'decision_influencer',
        'consultant': 'referral_partner',
        'wine_enthusiast': 'community_member',
        'researcher': 'academic_partner',
    }
    return segments.get(user_type, 'general_user')


def user_to_list_item(user: PublicUser) -> UserListItem:
    """Convert PublicUser to UserListItem schema."""
    return UserListItem(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        full_name=user.full_name,
        user_type=user.user_type,
        company_name=user.company_name,
        job_title=user.job_title,
        region_of_interest=user.region_of_interest,
        marketing_segment=get_marketing_segment(user.user_type),
        is_active=user.is_active,
        is_verified=user.is_verified,
        newsletter_opt_in=user.newsletter_opt_in,
        marketing_opt_in=user.marketing_opt_in,
        research_opt_in=user.research_opt_in,
        login_count=user.login_count or 0,
        last_login=user.last_login,
        last_active=user.last_active,
        created_at=user.created_at,
    )


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("/stats", response_model=UserStatsResponse)
async def get_user_stats(
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin)
):
    """
    Get dashboard summary statistics for users.
    
    Returns counts, breakdowns by type/region/segment, and opt-in rates.
    """
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)
    
    # Base counts
    total = db.query(func.count(PublicUser.id)).scalar() or 0
    verified = db.query(func.count(PublicUser.id)).filter(PublicUser.is_verified == True).scalar() or 0
    active = db.query(func.count(PublicUser.id)).filter(PublicUser.is_active == True).scalar() or 0
    
    # Activity counts
    active_7d = db.query(func.count(PublicUser.id)).filter(
        PublicUser.last_active >= week_ago
    ).scalar() or 0
    
    active_30d = db.query(func.count(PublicUser.id)).filter(
        PublicUser.last_active >= month_ago
    ).scalar() or 0
    
    signups_today = db.query(func.count(PublicUser.id)).filter(
        PublicUser.created_at >= today_start
    ).scalar() or 0
    
    signups_week = db.query(func.count(PublicUser.id)).filter(
        PublicUser.created_at >= week_ago
    ).scalar() or 0
    
    signups_month = db.query(func.count(PublicUser.id)).filter(
        PublicUser.created_at >= month_ago
    ).scalar() or 0
    
    # By user type
    type_counts = db.query(
        PublicUser.user_type,
        func.count(PublicUser.id).label('count')
    ).group_by(PublicUser.user_type).all()
    
    by_type = [
        UserTypeCount(
            user_type=t[0] or 'unspecified',
            count=t[1],
            percentage=round((t[1] / total * 100) if total > 0 else 0, 1)
        )
        for t in type_counts
    ]
    
    # By region
    region_counts = db.query(
        PublicUser.region_of_interest,
        func.count(PublicUser.id).label('count')
    ).group_by(PublicUser.region_of_interest).all()
    
    by_region = [
        RegionCount(
            region=r[0] or 'unspecified',
            count=r[1],
            percentage=round((r[1] / total * 100) if total > 0 else 0, 1)
        )
        for r in region_counts
    ]
    
    # By marketing segment (computed from user_type)
    segment_map = {}
    for t in type_counts:
        segment = get_marketing_segment(t[0])
        segment_map[segment] = segment_map.get(segment, 0) + t[1]
    
    by_segment = [
        MarketingSegmentCount(
            segment=seg,
            count=count,
            percentage=round((count / total * 100) if total > 0 else 0, 1)
        )
        for seg, count in segment_map.items()
    ]
    
    # Opt-in counts
    newsletter_count = db.query(func.count(PublicUser.id)).filter(
        PublicUser.newsletter_opt_in == True,
        PublicUser.is_verified == True
    ).scalar() or 0
    
    marketing_count = db.query(func.count(PublicUser.id)).filter(
        PublicUser.marketing_opt_in == True,
        PublicUser.is_verified == True
    ).scalar() or 0
    
    research_count = db.query(func.count(PublicUser.id)).filter(
        PublicUser.research_opt_in == True,
        PublicUser.is_verified == True
    ).scalar() or 0
    
    opt_ins = OptInStats(
        newsletter=newsletter_count,
        newsletter_pct=round((newsletter_count / verified * 100) if verified > 0 else 0, 1),
        marketing=marketing_count,
        marketing_pct=round((marketing_count / verified * 100) if verified > 0 else 0, 1),
        research=research_count,
        research_pct=round((research_count / verified * 100) if verified > 0 else 0, 1),
    )
    
    # Login stats
    avg_logins = db.query(func.avg(PublicUser.login_count)).scalar() or 0
    never_logged = db.query(func.count(PublicUser.id)).filter(
        or_(PublicUser.login_count == 0, PublicUser.login_count == None)
    ).scalar() or 0
    
    return UserStatsResponse(
        total_users=total,
        verified_users=verified,
        unverified_users=total - verified,
        active_users=active,
        active_last_7_days=active_7d,
        active_last_30_days=active_30d,
        signups_today=signups_today,
        signups_this_week=signups_week,
        signups_this_month=signups_month,
        by_type=by_type,
        by_region=by_region,
        by_segment=by_segment,
        opt_ins=opt_ins,
        avg_login_count=round(float(avg_logins), 1),
        users_never_logged_in=never_logged,
    )


@router.get("", response_model=UserListResponse)
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    search: Optional[str] = Query(None, description="Search email or name"),
    user_type: Optional[str] = Query(None),
    region_of_interest: Optional[str] = Query(None),
    is_verified: Optional[bool] = Query(None),
    is_active: Optional[bool] = Query(None),
    marketing_segment: Optional[str] = Query(None),
    created_after: Optional[datetime] = Query(None),
    created_before: Optional[datetime] = Query(None),
    last_active_after: Optional[datetime] = Query(None),
    sort_by: str = Query("created_at", regex="^(created_at|last_login|last_active|login_count|email)$"),
    sort_order: str = Query("desc", regex="^(asc|desc)$"),
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin)
):
    """
    List users with filtering and pagination.
    
    Supports filtering by type, region, verification status, activity, and date ranges.
    """
    query = db.query(PublicUser)
    
    # Apply filters
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                PublicUser.email.ilike(search_term),
                PublicUser.first_name.ilike(search_term),
                PublicUser.last_name.ilike(search_term),
                PublicUser.company_name.ilike(search_term),
            )
        )
    
    if user_type:
        query = query.filter(PublicUser.user_type == user_type)
    
    if region_of_interest:
        query = query.filter(PublicUser.region_of_interest == region_of_interest)
    
    if is_verified is not None:
        query = query.filter(PublicUser.is_verified == is_verified)
    
    if is_active is not None:
        query = query.filter(PublicUser.is_active == is_active)
    
    if marketing_segment:
        # Filter by computed segment (requires mapping user_types)
        segment_types = {
            'high_value_prospect': ['wine_company_owner'],
            'decision_influencer': ['wine_company_employee'],
            'referral_partner': ['consultant'],
            'community_member': ['wine_enthusiast'],
            'academic_partner': ['researcher'],
        }
        types = segment_types.get(marketing_segment, [])
        if types:
            query = query.filter(PublicUser.user_type.in_(types))
    
    if created_after:
        query = query.filter(PublicUser.created_at >= created_after)
    
    if created_before:
        query = query.filter(PublicUser.created_at <= created_before)
    
    if last_active_after:
        query = query.filter(PublicUser.last_active >= last_active_after)
    
    # Get total count
    total = query.count()
    
    # Apply sorting
    sort_column = getattr(PublicUser, sort_by)
    if sort_order == "desc":
        query = query.order_by(desc(sort_column))
    else:
        query = query.order_by(asc(sort_column))
    
    # Apply pagination
    offset = (page - 1) * page_size
    users = query.offset(offset).limit(page_size).all()
    
    return UserListResponse(
        users=[user_to_list_item(u) for u in users],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
    )


@router.get("/export")
async def export_users(
    search: Optional[str] = Query(None),
    user_type: Optional[str] = Query(None),
    region_of_interest: Optional[str] = Query(None),
    is_verified: Optional[bool] = Query(None),
    is_active: Optional[bool] = Query(None),
    created_after: Optional[datetime] = Query(None),
    created_before: Optional[datetime] = Query(None),
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin)
):
    """
    Export users to CSV with same filters as list endpoint.
    
    Returns a downloadable CSV file.
    """
    query = db.query(PublicUser)
    
    # Apply same filters as list endpoint
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                PublicUser.email.ilike(search_term),
                PublicUser.first_name.ilike(search_term),
                PublicUser.last_name.ilike(search_term),
            )
        )
    
    if user_type:
        query = query.filter(PublicUser.user_type == user_type)
    
    if region_of_interest:
        query = query.filter(PublicUser.region_of_interest == region_of_interest)
    
    if is_verified is not None:
        query = query.filter(PublicUser.is_verified == is_verified)
    
    if is_active is not None:
        query = query.filter(PublicUser.is_active == is_active)
    
    if created_after:
        query = query.filter(PublicUser.created_at >= created_after)
    
    if created_before:
        query = query.filter(PublicUser.created_at <= created_before)
    
    users = query.order_by(desc(PublicUser.created_at)).all()
    
    # Create CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header row
    writer.writerow([
        'ID', 'Email', 'First Name', 'Last Name', 'User Type', 'Company',
        'Job Title', 'Region of Interest', 'Marketing Segment',
        'Verified', 'Active', 'Newsletter Opt-in', 'Marketing Opt-in',
        'Research Opt-in', 'Login Count', 'Last Login', 'Last Active',
        'Created At', 'Notes'
    ])
    
    # Data rows
    for user in users:
        writer.writerow([
            user.id,
            user.email,
            user.first_name or '',
            user.last_name or '',
            user.user_type or '',
            user.company_name or '',
            user.job_title or '',
            user.region_of_interest or '',
            get_marketing_segment(user.user_type),
            'Yes' if user.is_verified else 'No',
            'Yes' if user.is_active else 'No',
            'Yes' if user.newsletter_opt_in else 'No',
            'Yes' if user.marketing_opt_in else 'No',
            'Yes' if user.research_opt_in else 'No',
            user.login_count or 0,
            user.last_login.isoformat() if user.last_login else '',
            user.last_active.isoformat() if user.last_active else '',
            user.created_at.isoformat() if user.created_at else '',
            user.notes or '',
        ])
    
    output.seek(0)
    
    # Generate filename with date
    filename = f"users_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/segments", response_model=List[MarketingSegmentCount])
async def get_marketing_segments(
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin)
):
    """
    Get marketing segment breakdown.
    
    Returns count and percentage for each segment.
    """
    total = db.query(func.count(PublicUser.id)).scalar() or 0
    
    type_counts = db.query(
        PublicUser.user_type,
        func.count(PublicUser.id).label('count')
    ).group_by(PublicUser.user_type).all()
    
    segment_map = {}
    for t in type_counts:
        segment = get_marketing_segment(t[0])
        segment_map[segment] = segment_map.get(segment, 0) + t[1]
    
    return [
        MarketingSegmentCount(
            segment=seg,
            count=count,
            percentage=round((count / total * 100) if total > 0 else 0, 1)
        )
        for seg, count in sorted(segment_map.items(), key=lambda x: x[1], reverse=True)
    ]


@router.get("/activity", response_model=ActivityTimelineResponse)
async def get_activity_timeline(
    days: int = Query(7, ge=1, le=30),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin)
):
    """
    Get recent activity timeline (signups, logins, verifications).
    
    Returns combined timeline of recent user events.
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)
    
    events = []
    
    # Recent signups
    signups = db.query(PublicUser).filter(
        PublicUser.created_at >= since
    ).order_by(desc(PublicUser.created_at)).limit(limit).all()
    
    for user in signups:
        events.append(ActivityTimelineItem(
            timestamp=user.created_at,
            event_type="signup",
            user_id=user.id,
            user_email=user.email,
            user_name=user.full_name,
        ))
    
    # Recent logins
    logins = db.query(PublicUser).filter(
        PublicUser.last_login >= since
    ).order_by(desc(PublicUser.last_login)).limit(limit).all()
    
    for user in logins:
        events.append(ActivityTimelineItem(
            timestamp=user.last_login,
            event_type="login",
            user_id=user.id,
            user_email=user.email,
            user_name=user.full_name,
        ))
    
    # Recent verifications
    verifications = db.query(PublicUser).filter(
        PublicUser.verified_at >= since
    ).order_by(desc(PublicUser.verified_at)).limit(limit).all()
    
    for user in verifications:
        events.append(ActivityTimelineItem(
            timestamp=user.verified_at,
            event_type="verification",
            user_id=user.id,
            user_email=user.email,
            user_name=user.full_name,
        ))
    
    # Sort all events by timestamp and limit
    events.sort(key=lambda x: x.timestamp, reverse=True)
    events = events[:limit]
    
    # Count totals
    signup_count = db.query(func.count(PublicUser.id)).filter(
        PublicUser.created_at >= since
    ).scalar() or 0
    
    login_count = db.query(func.count(PublicUser.id)).filter(
        PublicUser.last_login >= since
    ).scalar() or 0
    
    verification_count = db.query(func.count(PublicUser.id)).filter(
        PublicUser.verified_at >= since
    ).scalar() or 0
    
    return ActivityTimelineResponse(
        events=events,
        total_signups_period=signup_count,
        total_logins_period=login_count,
        total_verifications_period=verification_count,
    )


@router.get("/{user_id}", response_model=UserDetailResponse)
async def get_user_detail(
    user_id: int,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin)
):
    """
    Get detailed information for a single user.
    """
    user = db.query(PublicUser).filter(PublicUser.id == user_id).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return UserDetailResponse(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        full_name=user.full_name,
        user_type=user.user_type,
        company_name=user.company_name,
        job_title=user.job_title,
        region_of_interest=user.region_of_interest,
        marketing_segment=get_marketing_segment(user.user_type),
        is_active=user.is_active,
        is_verified=user.is_verified,
        newsletter_opt_in=user.newsletter_opt_in,
        marketing_opt_in=user.marketing_opt_in,
        research_opt_in=user.research_opt_in,
        login_count=user.login_count or 0,
        last_login=user.last_login,
        last_active=user.last_active,
        created_at=user.created_at,
        verified_at=user.verified_at,
        first_map_view=user.first_map_view,
        notes=user.notes,
        updated_at=user.updated_at,
    )


@router.patch("/{user_id}", response_model=UserDetailResponse)
async def update_user(
    user_id: int,
    update_data: UserUpdateRequest,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin)
):
    """
    Update user (admin fields only: is_active, notes).
    """
    user = db.query(PublicUser).filter(PublicUser.id == user_id).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if update_data.is_active is not None:
        user.is_active = update_data.is_active
    
    if update_data.notes is not None:
        user.notes = update_data.notes
    
    db.commit()
    db.refresh(user)
    
    return UserDetailResponse(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        full_name=user.full_name,
        user_type=user.user_type,
        company_name=user.company_name,
        job_title=user.job_title,
        region_of_interest=user.region_of_interest,
        marketing_segment=get_marketing_segment(user.user_type),
        is_active=user.is_active,
        is_verified=user.is_verified,
        newsletter_opt_in=user.newsletter_opt_in,
        marketing_opt_in=user.marketing_opt_in,
        research_opt_in=user.research_opt_in,
        login_count=user.login_count or 0,
        last_login=user.last_login,
        last_active=user.last_active,
        created_at=user.created_at,
        verified_at=user.verified_at,
        first_map_view=user.first_map_view,
        notes=user.notes,
        updated_at=user.updated_at,
    )