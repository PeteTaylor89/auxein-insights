# backend/api/v1/public_banners.py
"""Public endpoint for active site banners. No authentication required."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from db.session import get_db
from db.models.site_banner import SiteBanner
from schemas.site_banner import BannerResponse, BannerListResponse

router = APIRouter(tags=["public_banners"])


@router.get("/active", response_model=BannerListResponse)
def get_active_banners(db: Session = Depends(get_db)):
    """Get all active site banners, ordered by display_order."""
    banners = db.query(SiteBanner).filter(
        SiteBanner.is_active == True
    ).order_by(SiteBanner.display_order).all()

    return BannerListResponse(
        banners=[BannerResponse.model_validate(b) for b in banners],
        total=len(banners)
    )
