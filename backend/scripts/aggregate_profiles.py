#!/usr/bin/env python3
"""
aggregate_profiles.py - Aggregate user_events into user_profiles for segmentation.

Usage:
    python -m scripts.aggregate_profiles

Can also be triggered via admin endpoint POST /api/v1/admin/users/aggregate-profiles
"""
import sys
import os
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import func, distinct
from db.session import SessionLocal
from db.models.user_enrichment import UserEvent, UserProfile
from db.models.public_user import PublicUser


def aggregate_profiles(db=None):
    """Aggregate user_events into user_profiles."""
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True

    try:
        # Get all users with events
        user_ids = [
            row[0] for row in
            db.query(distinct(UserEvent.user_id)).all()
        ]

        updated = 0
        for user_id in user_ids:
            events = db.query(UserEvent).filter(UserEvent.user_id == user_id)

            total_sessions = db.query(
                distinct(UserEvent.session_id)
            ).filter(
                UserEvent.user_id == user_id,
                UserEvent.session_id.isnot(None),
            ).count()

            article_reads = events.filter(
                UserEvent.event_type == 'article_read'
            ).count()

            research_views = events.filter(
                UserEvent.event_type == 'research_read'
            ).count()

            # Comments and likes from event data
            total_comments = events.filter(
                UserEvent.event_type.in_(['article_comment', 'research_comment'])
            ).count()

            total_likes = events.filter(
                UserEvent.event_type.in_(['article_like', 'research_like'])
            ).count()

            last_event = events.order_by(UserEvent.created_at.desc()).first()
            last_active = last_event.created_at if last_event else None

            # Engagement score: weighted sum
            score = (
                article_reads * 3
                + research_views * 5
                + total_comments * 10
                + total_likes * 2
                + total_sessions * 1
            )

            # Segment assignment
            if score >= 100:
                segment = 'power_user'
            elif score >= 30:
                segment = 'engaged'
            elif score >= 5:
                segment = 'casual'
            else:
                segment = 'lurker'

            # Upsert profile
            profile = db.query(UserProfile).filter(
                UserProfile.user_id == user_id
            ).first()

            if not profile:
                profile = UserProfile(user_id=user_id)
                db.add(profile)

            profile.total_sessions = total_sessions
            profile.total_article_reads = article_reads
            profile.total_research_views = research_views
            profile.total_comments = total_comments
            profile.total_likes = total_likes
            profile.last_active_at = last_active
            profile.engagement_score = score
            profile.segment = segment
            profile.updated_at = datetime.now(timezone.utc)

            updated += 1

        db.commit()
        print(f"Aggregated profiles for {updated} users")
        return updated

    finally:
        if close_db:
            db.close()


if __name__ == '__main__':
    aggregate_profiles()
