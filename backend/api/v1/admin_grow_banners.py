# backend/api/v1/admin_grow_banners.py
"""Grow admin CRUD endpoints for site banners.

Mirrors the Insights admin endpoints (`admin_banners.py`) but gated by Grow's
auxein_admin role rather than the Insights PublicUser admin. Both endpoints
write to the same `site_banners` table — the `audience` field on each banner
controls which product surfaces it.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from api.deps import get_db, get_current_user
from db.models.site_banner import SiteBanner
from db.models.user import User
from schemas.site_banner import (
    BannerCreate, BannerUpdate, BannerResponse, BannerListResponse
)

router = APIRouter(prefix="/banners", tags=["Grow Admin - Banners"])


def require_auxein_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_auxein_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Auxein admin access required",
        )
    return current_user


@router.get("", response_model=BannerListResponse)
def list_banners(
    db: Session = Depends(get_db),
    admin: User = Depends(require_auxein_admin),
):
    """List all banners (includes inactive, all audiences)."""
    banners = db.query(SiteBanner).order_by(SiteBanner.display_order).all()
    return BannerListResponse(
        banners=[BannerResponse.model_validate(b) for b in banners],
        total=len(banners),
    )


@router.post("", response_model=BannerResponse, status_code=status.HTTP_201_CREATED)
def create_banner(
    data: BannerCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_auxein_admin),
):
    """Create a new site banner."""
    banner = SiteBanner(
        title=data.title,
        content=data.content,
        banner_type=data.banner_type,
        audience=data.audience,
        is_active=data.is_active,
        display_order=data.display_order,
    )
    db.add(banner)
    db.commit()
    db.refresh(banner)
    return BannerResponse.model_validate(banner)


@router.patch("/{banner_id}", response_model=BannerResponse)
def update_banner(
    banner_id: int,
    data: BannerUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_auxein_admin),
):
    """Update an existing banner."""
    banner = db.query(SiteBanner).filter(SiteBanner.id == banner_id).first()
    if not banner:
        raise HTTPException(status_code=404, detail="Banner not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(banner, field, value)

    db.commit()
    db.refresh(banner)
    return BannerResponse.model_validate(banner)


@router.delete("/{banner_id}")
def delete_banner(
    banner_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_auxein_admin),
):
    """Delete a banner."""
    banner = db.query(SiteBanner).filter(SiteBanner.id == banner_id).first()
    if not banner:
        raise HTTPException(status_code=404, detail="Banner not found")

    db.delete(banner)
    db.commit()
    return {"message": "Banner deleted"}
