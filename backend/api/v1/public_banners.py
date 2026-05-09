# backend/api/v1/public_banners.py
"""Public endpoint for active site banners. No authentication required.

Supports an `audience` query param so the same endpoint serves both Insights
(`?audience=insights`, default) and Grow (`?audience=grow`). Banners with
`audience='both'` always appear regardless of which product asks.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from db.session import get_db
from db.models.site_banner import SiteBanner, BannerAudience
from schemas.site_banner import BannerResponse, BannerListResponse

router = APIRouter(tags=["public_banners"])


@router.get("/active", response_model=BannerListResponse)
def get_active_banners(
    audience: BannerAudience = Query(
        BannerAudience.insights,
        description="Which product is asking. Banners with audience='both' always match.",
    ),
    db: Session = Depends(get_db),
):
    """Get active site banners for the requested audience, ordered by display_order."""
    banners = (
        db.query(SiteBanner)
        .filter(
            SiteBanner.is_active == True,
            SiteBanner.audience.in_([audience, BannerAudience.both]),
        )
        .order_by(SiteBanner.display_order)
        .all()
    )

    return BannerListResponse(
        banners=[BannerResponse.model_validate(b) for b in banners],
        total=len(banners),
    )
