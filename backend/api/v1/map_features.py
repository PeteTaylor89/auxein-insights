# api/v1/map_features.py - Map points of interest (Maps V2)
#
# Read/write CRUD plus a GeoJSON endpoint for the map layer. Creation is
# web-only by design (managers/admins) — mobile is view-only for now, so
# nothing here needs the offline write queue.
import logging
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import mapping, shape
from sqlalchemy import or_
from sqlalchemy.orm import Session

from api.deps import get_db, get_current_user
from db.models.map_feature import MapFeature
from db.models.user import User
from schemas.map_feature import (
    MapFeatureCreate,
    MapFeatureResponse,
    MapFeatureUpdate,
)
from services.property_service import get_visible_property_ids

logger = logging.getLogger(__name__)
router = APIRouter()


def build_scope_filter(db: Session, user: User):
    """
    Restrict MapFeature queries to the user's property scope, plus company-wide
    (NULL property_id) features. Returns None for auxein_admin (no narrowing).

    Mirrors build_asset_scope_filter in assets.py. The NULL branch matters: a
    plain `property_id.IN (...)` silently drops every company-wide feature,
    which is the default for anything drawn without a property selected.
    """
    if user.user_type == "auxein_admin":
        return None

    visible_property_ids = get_visible_property_ids(db, user)
    if visible_property_ids:
        return or_(
            MapFeature.property_id.in_(visible_property_ids),
            MapFeature.property_id.is_(None),
        )
    return MapFeature.property_id.is_(None)


def get_scoped_feature(db: Session, user: User, feature_id: int) -> MapFeature:
    """Fetch one feature or raise. 404 for missing, 403 for out-of-scope."""
    feature = db.query(MapFeature).filter(MapFeature.id == feature_id).first()
    if not feature:
        raise HTTPException(status_code=404, detail="Map feature not found")

    if user.user_type != "auxein_admin":
        if user.company_id and feature.company_id != user.company_id:
            raise HTTPException(status_code=403, detail="Access denied")
        if feature.property_id is not None:
            if feature.property_id not in get_visible_property_ids(db, user):
                raise HTTPException(status_code=403, detail="Access denied")
    return feature


@router.get("/geojson", response_model=dict)
def get_map_features_geojson(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    feature_type: Optional[str] = Query(None),
    limit: int = Query(2000, le=10000),
):
    """All visible map features as a GeoJSON FeatureCollection for the map layer."""
    query = db.query(MapFeature).filter(MapFeature.is_active.is_(True))

    if current_user.user_type != "auxein_admin" and current_user.company_id:
        query = query.filter(MapFeature.company_id == current_user.company_id)

    scope_filter = build_scope_filter(db, current_user)
    if scope_filter is not None:
        query = query.filter(scope_filter)

    if feature_type:
        query = query.filter(MapFeature.feature_type == feature_type)

    features = []
    for f in query.limit(limit).all():
        if f.geometry is None:
            continue
        try:
            geom = mapping(to_shape(f.geometry))
        except Exception as e:
            # One unreadable geometry must not take the whole layer down.
            logger.error(f"Map feature {f.id} geometry unreadable: {e}")
            continue
        features.append({
            "type": "Feature",
            "geometry": geom,
            "properties": {
                "id": f.id,
                "feature_type": f.feature_type,
                "name": f.name,
                "description": f.description,
                "property_id": f.property_id,
                "company_id": f.company_id,
                "style": f.style,
            },
        })

    return {"type": "FeatureCollection", "features": features}


@router.get("/", response_model=List[MapFeatureResponse])
def list_map_features(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    feature_type: Optional[str] = Query(None),
    property_id: Optional[int] = Query(None),
    include_inactive: bool = Query(False),
    limit: int = Query(500, le=2000),
):
    query = db.query(MapFeature)

    if not include_inactive:
        query = query.filter(MapFeature.is_active.is_(True))

    if current_user.user_type != "auxein_admin" and current_user.company_id:
        query = query.filter(MapFeature.company_id == current_user.company_id)

    scope_filter = build_scope_filter(db, current_user)
    if scope_filter is not None:
        query = query.filter(scope_filter)

    if feature_type:
        query = query.filter(MapFeature.feature_type == feature_type)
    if property_id is not None:
        query = query.filter(MapFeature.property_id == property_id)

    return query.order_by(MapFeature.name).limit(limit).all()


@router.get("/{feature_id}", response_model=MapFeatureResponse)
def get_map_feature(
    feature_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_scoped_feature(db, current_user, feature_id)


@router.post("/", response_model=MapFeatureResponse, status_code=status.HTTP_201_CREATED)
def create_map_feature(
    payload: MapFeatureCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company_id = payload.company_id or current_user.company_id
    if not company_id:
        raise HTTPException(
            status_code=400,
            detail="No company context — company_id is required for this user",
        )
    # A non-admin may only create inside their own company, whatever they send.
    if current_user.user_type != "auxein_admin" and company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Cannot create features for another company")

    if payload.property_id is not None and current_user.user_type != "auxein_admin":
        if payload.property_id not in get_visible_property_ids(db, current_user):
            raise HTTPException(status_code=403, detail="Property not in your scope")

    try:
        geom = from_shape(shape(payload.geometry), srid=4326)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid geometry: {e}")

    feature = MapFeature(
        company_id=company_id,
        property_id=payload.property_id,
        feature_type=payload.feature_type.value,
        name=payload.name,
        description=payload.description,
        geometry=geom,
        style=payload.style,
        is_active=True if payload.is_active is None else payload.is_active,
        created_by_id=current_user.id,
    )
    db.add(feature)
    db.commit()
    db.refresh(feature)
    return feature


@router.patch("/{feature_id}", response_model=MapFeatureResponse)
def update_map_feature(
    feature_id: int,
    payload: MapFeatureUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    feature = get_scoped_feature(db, current_user, feature_id)
    data = payload.model_dump(exclude_unset=True)

    if "property_id" in data and data["property_id"] is not None:
        if current_user.user_type != "auxein_admin":
            if data["property_id"] not in get_visible_property_ids(db, current_user):
                raise HTTPException(status_code=403, detail="Property not in your scope")

    if "geometry" in data and data["geometry"] is not None:
        try:
            feature.geometry = from_shape(shape(data["geometry"]), srid=4326)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid geometry: {e}")
    data.pop("geometry", None)

    if "feature_type" in data and data["feature_type"] is not None:
        feature.feature_type = (
            data["feature_type"].value
            if hasattr(data["feature_type"], "value")
            else data["feature_type"]
        )
    data.pop("feature_type", None)

    for field, value in data.items():
        setattr(feature, field, value)

    db.commit()
    db.refresh(feature)
    return feature


@router.delete("/{feature_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_map_feature(
    feature_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    hard: bool = Query(False, description="Permanently delete instead of deactivating"),
):
    """Soft-delete by default (is_active=False) so an accidental removal is recoverable."""
    feature = get_scoped_feature(db, current_user, feature_id)
    if hard:
        db.delete(feature)
    else:
        feature.is_active = False
    db.commit()
    return None
