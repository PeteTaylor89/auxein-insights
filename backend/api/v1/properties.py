# api/v1/properties.py - Property CRUD, management relationships, user property scopes (Phase A, Grow V1)
import logging
from typing import List, Optional, Any, Dict
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from geoalchemy2.shape import to_shape, from_shape
from shapely.geometry import mapping, shape as shapely_shape

from db.session import get_db
from db.models.user import User
from db.models.contractor import Contractor
from db.models.contractor_relationship import ContractorRelationship
from db.models.property import Property
from db.models.management_relationship import ManagementRelationship
from db.models.user_property_scope import UserPropertyScope
from db.models.block import VineyardBlock
from api.deps import get_current_user, get_current_user_or_contractor
from schemas.property import (
    PropertyCreate, PropertyUpdate, PropertyOut,
    ManagementRelationshipCreate, ManagementRelationshipOut,
    UserPropertyScopeCreate, UserPropertyScopeOut,
)
from services.property_service import get_visible_property_ids
from services import grow_insights_site
from services import grow_phenology
from services import grow_season
from services import grow_disease
from services import workflow_dispatch
from services.insights_profile import ensure_insights_profile
from db.models.insights_site import InsightsSite
from services import insights_site_views as site_views
from services import insights_dashboard

logger = logging.getLogger(__name__)
router = APIRouter()


def _geometry_to_geojson(geom) -> Optional[Dict[str, Any]]:
    """Convert a PostGIS geometry column value to a GeoJSON geometry dict.
    Returns None if the column is empty or conversion fails (we'd rather
    serve the rest of the property data than 500 the request).
    """
    if geom is None:
        return None
    try:
        return mapping(to_shape(geom))
    except Exception as e:
        logger.warning(f"Failed to serialise property geometry: {e}")
        return None


# ==================== PROPERTY CRUD ====================

@router.get("/", response_model=List[PropertyOut])
def list_properties(
    db: Session = Depends(get_db),
    actor=Depends(get_current_user_or_contractor),
):
    """List properties visible to the current actor.

    Company users: properties scoped via UserPropertyScope (same as /geojson).
    Contractors: properties owned by companies with an active relationship.
    """
    is_contractor = isinstance(actor, Contractor)

    if is_contractor:
        active_company_ids = [
            r.company_id for r in db.query(ContractorRelationship).filter(
                ContractorRelationship.contractor_id == actor.id,
                ContractorRelationship.status == "active",
            ).all()
        ]
        if not active_company_ids:
            return []
        properties = db.query(Property).filter(
            Property.owner_company_id.in_(active_company_ids)
        ).all()
    else:
        current_user = actor
        if not current_user.has_permission("properties", "read"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
        visible_ids = get_visible_property_ids(db, current_user)
        if not visible_ids:
            return []
        properties = db.query(Property).filter(Property.id.in_(visible_ids)).all()

    # Enrich with active managing company id + boundary GeoJSON
    result = []
    for prop in properties:
        out = PropertyOut.model_validate(prop)
        active_rel = db.query(ManagementRelationship).filter(
            ManagementRelationship.property_id == prop.id,
            ManagementRelationship.is_active == True
        ).first()
        out.active_managing_company_id = active_rel.managing_company_id if active_rel else None
        out.geometry = _geometry_to_geojson(prop.geometry)
        result.append(out)

    return result


@router.post("/", response_model=PropertyOut, status_code=status.HTTP_201_CREATED)
def create_property(
    property_in: PropertyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new property. company_admin+ only."""
    if not current_user.has_permission("properties", "create"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    prop = Property(**property_in.model_dump())
    db.add(prop)
    db.commit()
    db.refresh(prop)

    logger.info(f"Property {prop.id} created by user {current_user.id}")
    return PropertyOut.model_validate(prop)


@router.get("/geojson")
def list_properties_geojson(
    contractor_scope: bool = Query(
        False,
        description="When the caller is a contractor, scoping is implicit. "
                    "For company users the flag is currently ignored — visibility uses UserPropertyScope."
    ),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_or_contractor),
):
    """Return property boundary polygons as a GeoJSON FeatureCollection.

    Scoping:
      - Company users → properties visible via UserPropertyScope (same as `/properties`).
      - Contractors  → properties owned by companies they have an *active*
        relationship with. The `contractor_scope` query flag is implicit for
        contractors and accepted (but unused) for company users.

    Properties without a boundary polygon are still returned as features with
    `geometry: null`, so the mobile app can still list them in pickers — only
    properties with a geometry will trigger geofence prompts.

    NOTE: Declared before `/{property_id}` so FastAPI doesn't try to coerce
    "geojson" into an int path param.
    """
    # Duck-typed identity check — contractor has `contractor_type`, user has `company_id`.
    is_contractor = isinstance(current_user, Contractor) or hasattr(current_user, "contractor_type")

    if is_contractor:
        active_company_ids = [
            r.company_id for r in db.query(ContractorRelationship).filter(
                ContractorRelationship.contractor_id == current_user.id,
                ContractorRelationship.status == "active",
            ).all()
        ]
        if not active_company_ids:
            return {"type": "FeatureCollection", "features": []}
        properties = db.query(Property).filter(
            Property.owner_company_id.in_(active_company_ids)
        ).all()
    else:
        if not current_user.has_permission("properties", "read"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
        visible_ids = get_visible_property_ids(db, current_user)
        if not visible_ids:
            return {"type": "FeatureCollection", "features": []}
        properties = db.query(Property).filter(Property.id.in_(visible_ids)).all()

    features = []
    for prop in properties:
        features.append({
            "type": "Feature",
            "id": prop.id,
            "geometry": _geometry_to_geojson(prop.geometry),
            "properties": {
                "id": prop.id,
                "name": prop.name,
                "owner_company_id": prop.owner_company_id,
                "region": prop.region,
                "total_area_ha": float(prop.total_area_ha) if prop.total_area_ha is not None else None,
            },
        })

    return {"type": "FeatureCollection", "features": features}


@router.get("/{property_id}", response_model=PropertyOut)
def get_property(
    property_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single property by ID."""
    if not current_user.has_permission("properties", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    visible_ids = get_visible_property_ids(db, current_user)
    if property_id not in visible_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")

    out = PropertyOut.model_validate(prop)
    active_rel = db.query(ManagementRelationship).filter(
        ManagementRelationship.property_id == prop.id,
        ManagementRelationship.is_active == True
    ).first()
    out.active_managing_company_id = active_rel.managing_company_id if active_rel else None
    out.geometry = _geometry_to_geojson(prop.geometry)
    return out


@router.patch("/{property_id}", response_model=PropertyOut)
def update_property(
    property_id: int,
    property_in: PropertyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a property. company_admin+ only."""
    if not current_user.has_permission("properties", "update"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    visible_ids = get_visible_property_ids(db, current_user)
    if property_id not in visible_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")

    update_data = property_in.model_dump(exclude_unset=True)

    # Geometry needs special handling: convert GeoJSON dict → PostGIS via shapely.
    # `null` clears the boundary; an omitted field leaves it untouched.
    if "geometry" in update_data:
        geom_value = update_data.pop("geometry")
        if geom_value is None:
            prop.geometry = None
        else:
            try:
                shp = shapely_shape(geom_value)
                if shp.geom_type not in ("Polygon", "MultiPolygon"):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Property geometry must be Polygon or MultiPolygon, got {shp.geom_type}",
                    )
                prop.geometry = from_shape(shp, srid=4326)
            except HTTPException:
                raise
            except Exception as e:
                logger.warning(f"Invalid property geometry for {property_id}: {e}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid GeoJSON geometry: {e}",
                )

    for field, value in update_data.items():
        setattr(prop, field, value)

    db.commit()
    db.refresh(prop)
    logger.info(f"Property {prop.id} updated by user {current_user.id}")
    out = PropertyOut.model_validate(prop)
    out.geometry = _geometry_to_geojson(prop.geometry)
    return out


@router.get("/{property_id}/blocks")
def get_property_blocks(
    property_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all blocks for a property."""
    if not current_user.has_permission("properties", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    visible_ids = get_visible_property_ids(db, current_user)
    if property_id not in visible_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    blocks = db.query(VineyardBlock).filter(VineyardBlock.property_id == property_id).all()
    return blocks


# ==================== MANAGEMENT RELATIONSHIPS ====================

@router.get("/{property_id}/management-history", response_model=List[ManagementRelationshipOut])
def get_management_history(
    property_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all management relationships for a property, ordered by start_date desc."""
    if not current_user.has_permission("properties", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    visible_ids = get_visible_property_ids(db, current_user)
    if property_id not in visible_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    relationships = db.query(ManagementRelationship).filter(
        ManagementRelationship.property_id == property_id
    ).order_by(ManagementRelationship.start_date.desc()).all()

    return relationships


@router.post("/{property_id}/management-relationships", response_model=ManagementRelationshipOut, status_code=status.HTTP_201_CREATED)
def create_management_relationship(
    property_id: int,
    rel_in: ManagementRelationshipCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Transfer management of a property to a new company. company_admin+ only."""
    if not current_user.has_permission("properties", "manage"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    visible_ids = get_visible_property_ids(db, current_user)
    if property_id not in visible_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    from services.management_service import transfer_management

    try:
        new_rel = transfer_management(
            db=db,
            property_id=property_id,
            new_managing_company_id=rel_in.managing_company_id,
            start_date=rel_in.start_date,
            contract_reference=rel_in.contract_reference,
            created_by_user_id=current_user.id,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return new_rel


# ==================== USER PROPERTY SCOPES (A9) ====================

@router.get("/users/{user_id}/property-scopes", response_model=List[UserPropertyScopeOut])
def get_user_property_scopes(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get property scopes for a user. If empty, user sees all company-managed properties."""
    if not current_user.has_permission("users", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    scopes = db.query(UserPropertyScope).filter(
        UserPropertyScope.user_id == user_id
    ).all()
    return scopes


@router.post("/users/{user_id}/property-scopes", response_model=UserPropertyScopeOut, status_code=status.HTTP_201_CREATED)
def add_user_property_scope(
    user_id: int,
    scope_in: UserPropertyScopeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a property to a user's scope. company_admin+ only."""
    if not current_user.has_permission("users", "update"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    # Verify property exists and is visible
    visible_ids = get_visible_property_ids(db, current_user)
    if scope_in.property_id not in visible_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Property not found or not accessible")

    # Check for duplicate
    existing = db.query(UserPropertyScope).filter(
        UserPropertyScope.user_id == user_id,
        UserPropertyScope.property_id == scope_in.property_id
    ).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Scope already exists")

    scope = UserPropertyScope(user_id=user_id, property_id=scope_in.property_id)
    db.add(scope)
    db.commit()
    db.refresh(scope)
    return scope


@router.delete("/users/{user_id}/property-scopes/{property_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_user_property_scope(
    user_id: int,
    property_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a property from a user's scope."""
    if not current_user.has_permission("users", "update"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    scope = db.query(UserPropertyScope).filter(
        UserPropertyScope.user_id == user_id,
        UserPropertyScope.property_id == property_id
    ).first()

    if not scope:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scope not found")

    db.delete(scope)
    db.commit()


# ── Insights site ──────────────────────────────────────────────────────
# The property's own point in the Insights surface archive. Without one, This
# Season shows the property its REGION's climate, which is somebody else's.
#
# Read is `properties:read` — knowing whether your own property has a weather
# point is not privileged. Provisioning is `properties:update`, because it
# creates an Insights account for the company on first use and places a point
# that then gets extracted nightly.
@router.get("/{property_id}/insights-site")
def get_property_insights_site(
    property_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Whether this property has a site, and what state it is in.

    Always 200, never 404 on an absent site. "This property has no site yet" is
    a normal answer that the UI renders as a button, and a 404 would make it
    indistinguishable from a property that does not exist.
    """
    if not current_user.has_permission("properties", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
    if property_id not in get_visible_property_ids(db, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")

    has_point = prop.forecast_latitude is not None and prop.forecast_longitude is not None
    site = db.get(InsightsSite, prop.insights_site_id) if prop.insights_site_id else None

    # How far the site sits from where the property now says its point is.
    # Saving a new point does NOT move the site, so this is the only thing that
    # tells anyone the two have come apart — property 14 spent a day reporting
    # central Christchurch's climate after its point was corrected by 67 km.
    drift = grow_insights_site.point_drift_m(prop, site) if site else None

    return {
        "property_id": prop.id,
        "property_name": prop.name,
        # The gate on provisioning, reported separately from the site itself so
        # the UI can say WHY the button is unavailable rather than just hiding it.
        "has_forecast_point": has_point,
        "can_provision": has_point and prop.owner_company_id is not None,
        "site": None if site is None else {
            "id": site.id,
            "label": site.label,
            "status": site.status,
            "status_detail": site.status_detail,
            "latitude": site.latitude,
            "longitude": site.longitude,
            "grid_key": site.grid_key,
            "zone_id": site.zone_id,
            "source": site.source,
            "populated_at": site.populated_at.isoformat() if site.populated_at else None,
            # 'ready' is the only status the season, disease and phenology
            # panels can read. Anything else and they must say "still building"
            # rather than render an empty chart.
            "is_ready": site.status == "ready",
            # Metres between the property's point and the site. Rounded because
            # a figure like "67,121 m" is read as a distance, not a coordinate.
            "point_drift_m": None if drift is None else round(drift),
            "point_matches": drift is not None
            and drift < grow_insights_site.DRIFT_TOLERANCE_M,
        },
    }


@router.post("/{property_id}/insights-site/move", status_code=status.HTTP_202_ACCEPTED)
def move_property_insights_site(
    property_id: int,
    background: BackgroundTasks = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Re-place this property's climate site at its current forecast point.

    Saving a forecast point deliberately does not do this. The site's value is
    its extracted 1986-2023 record, and rebuilding that on every property save
    would let a mistyped coordinate throw away the record with no undo — so it
    is a button, pressed when the Weather tab shows the two have drifted apart.

    202, like provisioning: the row moves immediately, its climate record is
    rebuilt by the populator. The OLD rows stay visible until the new extraction
    overwrites them.
    """
    if not current_user.has_permission("properties", "update"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Not enough permissions")
    if property_id not in get_visible_property_ids(db, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Not enough permissions")

    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Property not found")

    try:
        result = grow_insights_site.move_site_to_property_point(db, prop)
    except grow_insights_site.ProvisioningError as exc:
        # Same contract as provisioning: every refusal is something the user can
        # act on, so the code travels with it.
        raise HTTPException(status_code=422, detail={
            "code": exc.code, "message": exc.message, **exc.detail,
        })

    db.commit()
    site = result["site"]
    db.refresh(site)

    if result["moved"] and background is not None:
        background.add_task(workflow_dispatch.populate_site, site.id)

    nearest = result.get("nearest_zone")
    return {
        "moved": result["moved"],
        "drift_m": None if result["drift_m"] is None else round(result["drift_m"]),
        "site": {
            "id": site.id, "label": site.label, "status": site.status,
            "latitude": site.latitude, "longitude": site.longitude,
            "grid_key": site.grid_key, "zone_id": site.zone_id,
            "is_ready": site.status == "ready",
        },
        # A point outside every wine zone is allowed — `resolve_zone` refuses to
        # snap one to a region it is not in — but it costs every regional
        # comparison, so the caller is told which zone it missed and by how far.
        "zone_warning": None if site.zone_id or not nearest else (
            f"This point is {round(nearest['distance_m'])} m outside "
            f"{nearest['name']}, so this property has no regional figures to "
            f"compare against. Move it inside the zone to get them."),
        "nearest_zone": nearest,
        "message": (result.get("reason") if not result["moved"] else
                    "We're rebuilding the climate history at the new point. "
                    "It usually takes a few minutes."),
    }


@router.post("/{property_id}/insights-site", status_code=status.HTTP_202_ACCEPTED)
def provision_property_insights_site(
    property_id: int,
    background: BackgroundTasks = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Place a site at this property's forecast point.

    202, not 201: the row exists immediately but its climate record does not.
    Extraction is a separate job and the caller has to poll or come back.
    """
    if not current_user.has_permission("properties", "update"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
    if property_id not in get_visible_property_ids(db, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")

    try:
        site = grow_insights_site.provision_site_for_property(db, prop)
    except grow_insights_site.ProvisioningError as exc:
        # 422 with the code intact: every refusal here is something the user can
        # fix (set a weather point, move an off-mask point inland), so the
        # client needs to tell them which one it was.
        raise HTTPException(status_code=422, detail={
            "code": exc.code, "message": exc.message, **exc.detail,
        })

    # The signed-in user becomes a member of their company's Insights account,
    # so the point they just created is reachable by them. Membership is what
    # entitles a Grow user to Pro — see services/grow_insights_site.
    profile = ensure_insights_profile(db, current_user)
    if profile is not None:
        # The FIRST member of a new account is its owner; everyone after joins
        # as a plain member. Keyed on the account being empty rather than on the
        # caller's Grow permission, which is already known to be true here and
        # would have made every provisioner an owner.
        first = grow_insights_site.member_count(db, site.account_id) == 0
        grow_insights_site.ensure_member(
            db, site.account_id, profile.id,
            role="owner" if first else "member",
        )

    db.commit()
    db.refresh(site)

    # Ask the extraction to start NOW rather than at the next */5 sweep — the
    # same accelerator the Pro placement endpoint uses, and for the same
    # reason: the sweep is the guarantee, the dispatch is what makes the wait
    # seconds instead of minutes. AFTER the response, because the customer
    # should not wait on a call to GitHub, and never blocking: `dispatch`
    # swallows every failure and the site stays queued for the sweep either
    # way. `background` is None when this function is called directly (a test),
    # which is also exactly when a real workflow must not fire.
    if background is not None:
        background.add_task(workflow_dispatch.populate_site, site.id)

    return {
        "site": {
            "id": site.id, "label": site.label, "status": site.status,
            "latitude": site.latitude, "longitude": site.longitude,
            "grid_key": site.grid_key, "zone_id": site.zone_id,
            "is_ready": site.status == "ready",
        },
        # Named here so the API and the UI cannot promise different things —
        # same rule as the Pro placement endpoint.
        "message": ("We're building the climate history for this property. "
                    "It usually takes a few minutes."),
    }


@router.get("/{property_id}/phenology")
def get_property_phenology(
    property_id: int,
    vintage: Optional[int] = Query(None, description="Season; defaults to the latest with data"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Regional, site and observed phenology for this property, per variety.

    `properties:read`, not `reports:read`. Two reasons: a grower looking at
    their own vineyard's growth stage is not reading a management report, and
    gating it on `reports` would hide it from a company_user who can see the
    blocks it describes.

    Every track can be absent, and each absence carries its own reason —
    `regional_reason` for no climate zone, `site_reason` for no climate site or
    one still building, and a variety's `observed: null` for nothing recorded.
    An empty column with no explanation is the thing this endpoint exists to
    avoid: the panel it feeds has rendered MOCK data since 2026-05-29 precisely
    because there was no honest way to render nothing.
    """
    if not current_user.has_permission("properties", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
    if property_id not in get_visible_property_ids(db, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")

    return grow_phenology.property_phenology(db, prop, vintage)


@router.get("/{property_id}/season")
def get_property_season(
    property_id: int,
    days: int = Query(14, ge=1, le=30, description="Disease window, in days"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """This season for one property: weather to date and disease pressure.

    `properties:read`, like the phenology endpoint beside it, and for the same
    reason: conditions on your own vineyard are not a management report.

    Both halves report REGIONAL and SITE side by side, and the regional half is
    fetched independently of the site — a property with no climate site still
    gets its region's disease pressure, which is live and current. That
    independence is deliberate: the first cut of the phenology assembly derived
    its season from the site alone and silently switched off the regional track
    for every company that had no site.
    """
    if not current_user.has_permission("properties", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
    if property_id not in get_visible_property_ids(db, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")

    return grow_season.property_season(db, prop, days=days)


# ── The property's own climate record ──────────────────────────────────────
# Everything Insights presents on My Site, for a Grow property, off the same
# `insights_site`. The payloads are built by `services/insights_site_views`,
# which the Insights routes also call — one implementation, so the two products
# cannot report different numbers for the same 500 m cell.
#
# THE DIFFERENCE FROM THE INSIGHTS ROUTES IS THE ABSENT CASE. Insights answers
# 409 when a site is not ready, because a subscriber who placed a point expects
# it to work. A Grow property with no site is in a perfectly normal state — most
# of them are — so these answer 200 with `available: false` and a reason the
# panel can render. A 4xx would make "you have not set this up" indistinguishable
# from "this broke".


def _property_site(db: Session, property_id: int, current_user: User):
    """(property, site, refusal). `refusal` is a ready-to-return payload.

    Permission is `properties:read`: knowing your own property's climate is not
    privileged, and gating it on `reports` would hide it from a company_user who
    can see the blocks it describes.
    """
    if not current_user.has_permission("properties", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Not enough permissions")
    if property_id not in get_visible_property_ids(db, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Not enough permissions")

    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Property not found")

    site = (db.get(InsightsSite, prop.insights_site_id)
            if prop.insights_site_id else None)
    if site is None:
        return prop, None, {
            "property_id": prop.id, "property_name": prop.name,
            "site": None, "available": False,
            "reason": ("This property has no climate site yet. Create one in "
                       "Manage → Weather to read its own record rather than "
                       "its region's."),
        }
    blocked = site_views.not_ready(site)
    if blocked:
        return prop, site, {
            "property_id": prop.id, "property_name": prop.name,
            "site": site_views.serialise_site(db, site),
            "available": False,
            "reason": ("This property's climate site is still building its "
                       "history." if blocked["code"] == "populating"
                       else blocked["message"]),
        }
    return prop, site, None


def _climate_envelope(db: Session, prop: Property, site: InsightsSite,
                      payload: dict) -> dict:
    """The site block every one of these carries, plus the property's own name.

    A Grow user identifies the place by property, has never seen a site id, and
    a rename leaves `site.label` stale — so the property name travels beside it
    rather than the caller reading the label.
    """
    return {"property_id": prop.id, "property_name": prop.name,
            "site": site_views.serialise_site(db, site),
            "available": True, **payload}


@router.get("/{property_id}/climate/overview")
def property_climate_overview(
    property_id: int,
    baseline: str = Query(site_views.PRO_BASELINE),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The dashboard: what this site usually does, and both seasons.

    The tiles are the site's own 1986-2023 record; the previous-season strip is
    station data at REGIONAL scale, because no live surface covers a finished
    season. They are separate blocks on purpose and must stay labelled apart.
    """
    prop, site, refusal = _property_site(db, property_id, current_user)
    if refusal:
        return refusal
    try:
        bounds = site_views.parse_baseline(baseline)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return _climate_envelope(db, prop, site,
                             insights_dashboard.build(db, site, bounds))


@router.get("/{property_id}/climate/seasons")
def property_climate_seasons(
    property_id: int,
    metrics: Optional[str] = Query(None, description="comma-separated; default all"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Season by season, 1986 to 2023, against the spread of its region."""
    prop, site, refusal = _property_site(db, property_id, current_user)
    if refusal:
        return refusal
    wanted = [m.strip() for m in metrics.split(",")] if metrics else None
    return _climate_envelope(db, prop, site, site_views.seasons(db, site, wanted))


@router.get("/{property_id}/climate/monthly")
def property_climate_monthly(
    property_id: int,
    variable: str = Query("temp_mean"),
    statistic: str = Query("mean"),
    baseline: str = Query(site_views.PRO_BASELINE),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Month by month, as an anomaly against this site's own normal."""
    prop, site, refusal = _property_site(db, property_id, current_user)
    if refusal:
        return refusal
    try:
        bounds = site_views.parse_baseline(baseline)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    try:
        payload = site_views.monthly(db, site, variable, statistic, bounds)
    except site_views.NoSuchBand as exc:
        # Not a 404 here. The property and its site both exist; this particular
        # band does not, which is the same shape of answer as "no site yet".
        return {"property_id": prop.id, "property_name": prop.name,
                "site": site_views.serialise_site(db, site),
                "available": False, "reason": str(exc)}
    return _climate_envelope(db, prop, site, payload)


@router.get("/{property_id}/climate/season-series")
def property_climate_season_series(
    property_id: int,
    vintage: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The season in progress, day by day, against ONE comparison at a time."""
    prop, site, refusal = _property_site(db, property_id, current_user)
    if refusal:
        return refusal
    return _climate_envelope(db, prop, site,
                             site_views.season_series(db, site, vintage))


@router.get("/{property_id}/climate/disease")
def property_climate_disease(
    property_id: int,
    days: int = Query(30, ge=7, le=120),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Disease pressure as the models' own numbers, not three words.

    Unlike the other `/climate/*` routes this does NOT require a ready climate
    site: a property with no site still gets its region's models, which is the
    same fallback `/season` already uses for the risk levels. So it resolves the
    property itself rather than going through `_property_site`.
    """
    if not current_user.has_permission("properties", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Not enough permissions")
    if property_id not in get_visible_property_ids(db, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Not enough permissions")

    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Property not found")

    payload = grow_disease.property_disease(db, prop, days=days)
    return {"property_id": prop.id, "property_name": prop.name, **payload}


@router.get("/{property_id}/climate/projections")
def property_climate_projections(
    property_id: int,
    season: str = Query("ANN", description="ANN, SEPAPR, DJF, MAM, JJA or SON"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Scenario deltas at this site's cell, with its region's delta beside them.

    ANN by default, not the SEPAPR the rest of the site product uses: only
    `gdd10.cumulative` is published for the growing season, so SEPAPR would
    return one band and look broken. The `seasons` list says what is held.
    """
    prop, site, refusal = _property_site(db, property_id, current_user)
    if refusal:
        return refusal
    return _climate_envelope(db, prop, site,
                             site_views.projections(db, site, season))
