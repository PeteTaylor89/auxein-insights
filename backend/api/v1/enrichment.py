# backend/api/v1/enrichment.py - User Enrichment API endpoints
from typing import Optional, List

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
    EventCreate, UserProfileResponse, UserProfileListItem,
    UserProfileListResponse, SegmentCount, ContentPerformanceItem,
)

router = APIRouter()


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


# ========== ADMIN ==========

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
