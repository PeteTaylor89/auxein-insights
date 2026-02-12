# backend/api/v1/admin_banners.py
"""Admin CRUD endpoints for site banners."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from db.session import get_db
from db.models.site_banner import SiteBanner
from db.models.public_user import PublicUser
from core.admin_security import require_admin
from schemas.site_banner import (
    BannerCreate, BannerUpdate, BannerResponse, BannerListResponse
)

router = APIRouter(prefix="/banners", tags=["Admin - Banners"])


@router.get("", response_model=BannerListResponse)
def list_banners(
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    """List all banners (includes inactive)."""
    banners = db.query(SiteBanner).order_by(SiteBanner.display_order).all()
    return BannerListResponse(
        banners=[BannerResponse.model_validate(b) for b in banners],
        total=len(banners)
    )


@router.post("", response_model=BannerResponse, status_code=status.HTTP_201_CREATED)
def create_banner(
    data: BannerCreate,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    """Create a new site banner."""
    banner = SiteBanner(
        title=data.title,
        content=data.content,
        banner_type=data.banner_type,
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
    admin: PublicUser = Depends(require_admin),
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
    admin: PublicUser = Depends(require_admin),
):
    """Delete a banner."""
    banner = db.query(SiteBanner).filter(SiteBanner.id == banner_id).first()
    if not banner:
        raise HTTPException(status_code=404, detail="Banner not found")

    db.delete(banner)
    db.commit()
    return {"message": "Banner deleted"}
