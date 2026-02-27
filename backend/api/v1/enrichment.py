# backend/api/v1/enrichment.py - User Enrichment API endpoints
from typing import Optional, List

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from db.session import get_db
from db.models.user_enrichment import UserEvent, UserProfile
from db.models.public_user import PublicUser
from db.models.article import Article
from db.models.research import ResearchReport
from core.public_security import get_current_public_user
from core.admin_security import require_admin
from schemas.enrichment import (
    EventCreate, EventBatchCreate, UserProfileResponse, UserProfileListItem,
    UserProfileListResponse, SegmentCount, ContentPerformanceItem,
)

router = APIRouter()


# ========== HELPERS ==========

def update_user_profile(db: Session, user_id: int):
    """Lightweight single-user profile aggregation. Runs after each event batch."""
    events = db.query(UserEvent).filter(UserEvent.user_id == user_id)

    total_sessions = db.query(
        func.count(func.distinct(UserEvent.session_id))
    ).filter(
        UserEvent.user_id == user_id,
        UserEvent.session_id.isnot(None),
    ).scalar() or 0

    article_reads = events.filter(UserEvent.event_type == 'article_read').count()
    research_views = events.filter(UserEvent.event_type == 'research_read').count()
    total_comments = events.filter(
        UserEvent.event_type.in_(['article_comment', 'research_comment'])
    ).count()
    total_likes = events.filter(
        UserEvent.event_type.in_(['article_like', 'research_like'])
    ).count()
    page_views = events.filter(UserEvent.event_type == 'page_view').count()

    last_event = events.order_by(desc(UserEvent.created_at)).first()

    score = (
        article_reads * 3
        + research_views * 5
        + total_comments * 10
        + total_likes * 2
        + total_sessions * 1
        + page_views * 0.5
    )

    if score >= 100:
        segment = 'power_user'
    elif score >= 30:
        segment = 'engaged'
    elif score >= 5:
        segment = 'casual'
    else:
        segment = 'lurker'

    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if not profile:
        profile = UserProfile(user_id=user_id)
        db.add(profile)

    profile.total_sessions = total_sessions
    profile.total_article_reads = article_reads
    profile.total_research_views = research_views
    profile.total_comments = total_comments
    profile.total_likes = total_likes
    profile.last_active_at = last_event.created_at if last_event else None
    profile.engagement_score = score
    profile.segment = segment
    profile.updated_at = datetime.now(timezone.utc)


# ========== PUBLIC ==========

@router.post("/public/events", status_code=201)
async def record_event(
    data: EventCreate, db: Session = Depends(get_db),
    current_user: PublicUser = Depends(get_current_public_user),
):
    """Record a structured engagement event for the current user."""
    event = UserEvent(
        user_id=current_user.id,
        event_type=data.event_type,
        event_data=data.event_data,
        session_id=data.session_id,
    )
    db.add(event)
    db.commit()
    return {"detail": "Event recorded"}


@router.post("/public/events/batch", status_code=201)
async def record_events_batch(
    data: EventBatchCreate, db: Session = Depends(get_db),
    current_user: PublicUser = Depends(get_current_public_user),
):
    """Record a batch of engagement events (max 50)."""
    for ev in data.events:
        db.add(UserEvent(
            user_id=current_user.id,
            event_type=ev.event_type,
            event_data=ev.event_data,
            session_id=ev.session_id,
        ))
    current_user.last_active = datetime.now(timezone.utc)
    db.flush()  # write events so profile aggregation can see them
    update_user_profile(db, current_user.id)
    db.commit()
    return {"detail": f"{len(data.events)} events recorded"}


# ========== ADMIN ==========

@router.post("/admin/users/aggregate-profiles")
async def trigger_aggregate_profiles(
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    """Trigger user profile aggregation from events (admin only)."""
    from scripts.aggregate_profiles import aggregate_profiles
    count = aggregate_profiles(db)
    return {"detail": f"Aggregated {count} profiles"}


@router.get("/admin/events/diagnostic")
async def events_diagnostic(
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    """Quick diagnostic: recent event counts and latest events."""
    total = db.query(func.count(UserEvent.id)).scalar()
    last_24h = db.query(func.count(UserEvent.id)).filter(
        UserEvent.created_at >= datetime.now(timezone.utc) - timedelta(hours=24)
    ).scalar()
    unique_users = db.query(func.count(func.distinct(UserEvent.user_id))).scalar()

    # Event type breakdown (last 24h)
    type_counts = (
        db.query(UserEvent.event_type, func.count(UserEvent.id))
        .filter(UserEvent.created_at >= datetime.now(timezone.utc) - timedelta(hours=24))
        .group_by(UserEvent.event_type)
        .order_by(desc(func.count(UserEvent.id)))
        .all()
    )

    # Latest 10 events
    latest = (
        db.query(UserEvent)
        .order_by(desc(UserEvent.created_at))
        .limit(10).all()
    )

    return {
        "total_events": total,
        "events_last_24h": last_24h,
        "unique_users": unique_users,
        "event_types_24h": {t: c for t, c in type_counts},
        "latest_events": [
            {
                "id": e.id,
                "user_id": e.user_id,
                "event_type": e.event_type,
                "event_data": e.event_data,
                "session_id": e.session_id,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in latest
        ],
    }


@router.get("/admin/users/segments", response_model=List[SegmentCount])
async def user_segments(db: Session = Depends(get_db),
                        admin: PublicUser = Depends(require_admin)):
    """Get user segment counts (admin only)."""
    results = (
        db.query(UserProfile.segment, func.count(UserProfile.user_id))
        .filter(UserProfile.segment.isnot(None))
        .group_by(UserProfile.segment)
        .order_by(desc(func.count(UserProfile.user_id)))
        .all()
    )
    return [SegmentCount(segment=seg, count=cnt) for seg, cnt in results]


@router.get("/admin/users/profiles", response_model=UserProfileListResponse)
async def list_profiles(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=50),
    segment: Optional[str] = None,
    db: Session = Depends(get_db), admin: PublicUser = Depends(require_admin),
):
    """List user profiles with engagement data (admin only)."""
    query = (
        db.query(UserProfile, PublicUser)
        .join(PublicUser, PublicUser.id == UserProfile.user_id)
    )
    if segment:
        query = query.filter(UserProfile.segment == segment)

    total = query.count()
    rows = (
        query.order_by(desc(UserProfile.engagement_score))
        .offset((page - 1) * page_size).limit(page_size).all()
    )

    items = []
    for profile, user in rows:
        items.append(UserProfileListItem(
            user_id=user.id, email=user.email,
            full_name=user.full_name,
            user_type=user.user_type,
            region_of_interest=user.region_of_interest,
            subscription_tier=user.subscription_tier or "free",
            engagement_score=float(profile.engagement_score or 0),
            segment=profile.segment,
            total_sessions=profile.total_sessions,
            last_active_at=profile.last_active_at,
        ))

    return UserProfileListResponse(
        items=items, total=total, page=page, page_size=page_size,
    )


@router.get("/admin/users/{user_id}/profile", response_model=UserProfileResponse)
async def get_user_profile(user_id: int, db: Session = Depends(get_db),
                           admin: PublicUser = Depends(require_admin)):
    """Get detailed user profile by ID (admin only)."""
    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return UserProfileResponse.model_validate(profile)


@router.get("/admin/content/performance", response_model=List[ContentPerformanceItem])
async def content_performance(
    content_type: Optional[str] = Query(None, pattern="^(articles|research)$"),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db), admin: PublicUser = Depends(require_admin),
):
    """Get content performance metrics (admin only)."""
    items = []
    if content_type in (None, "articles"):
        articles = (
            db.query(Article)
            .filter(Article.status == "published")
            .order_by(desc(Article.view_count))
            .limit(limit).all()
        )
        for a in articles:
            items.append(ContentPerformanceItem(
                content_type="article", content_id=a.id, title=a.title,
                view_count=a.view_count, like_count=a.like_count,
                comment_count=a.comment_count,
            ))
    if content_type in (None, "research"):
        reports = (
            db.query(ResearchReport)
            .filter(ResearchReport.status == "published")
            .order_by(desc(ResearchReport.view_count))
            .limit(limit).all()
        )
        for r in reports:
            items.append(ContentPerformanceItem(
                content_type="research", content_id=r.id, title=r.title,
                view_count=r.view_count, like_count=r.like_count,
                comment_count=r.comment_count,
            ))
    return items
