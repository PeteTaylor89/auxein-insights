# app/api/v1/assets.py - Assets API Router (Complete)
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_, or_
from typing import List, Optional, Union
from datetime import date, datetime, timedelta
import logging

from db.session import get_db
from db.models.asset import Asset, AssetMaintenance, AssetCalibration, AssetCalibrationSpec, StockMovement
from db.models.user import User
from db.models.contractor import Contractor
from db.models.company import Company
from schemas.asset import (
    AssetCreate, AssetUpdate, AssetResponse, AssetSummary, AssetStats,
    MaintenanceDue, CalibrationDue, ComplianceAlert, StockAlert, CertificationScheme,
    CalibrationSpecCreate, CalibrationSpecUpdate, CalibrationSpecResponse,
    AssetImportRequest, AssetImportResult, AssetImportError
)
from api.deps import get_current_user, get_current_contractor, get_current_user_or_contractor
from services.property_service import get_visible_property_ids

logger = logging.getLogger(__name__)
router = APIRouter()


def check_asset_scope(db: Session, user, asset):
    """Verify user can access this asset via property scope. Raises 403 on denial."""
    if user.user_type == "auxein_admin":
        return
    if asset.property_id is not None:
        visible = get_visible_property_ids(db, user)
        if asset.property_id not in visible:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


def build_asset_scope_filter(db: Session, user):
    """
    Returns a SQLAlchemy filter restricting Asset queries to the user's property
    scope, plus company-wide (NULL property_id) assets.
    Returns None for auxein_admin (no narrowing).
    """
    if user.user_type == "auxein_admin":
        return None

    visible_property_ids = get_visible_property_ids(db, user)
    if visible_property_ids:
        return or_(
            Asset.property_id.in_(visible_property_ids),
            Asset.property_id.is_(None)
        )
    return Asset.property_id.is_(None)

@router.post("/import", response_model=AssetImportResult)
def import_assets(
    payload: AssetImportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Bulk-create assets from a parsed CSV (Greystone beta: "a CSV import option
    would make it much quicker to load in all our equipment at once").

    The CSV is parsed in the browser and arrives here as rows, so this endpoint
    never deals with file encodings, delimiters or BOMs — it validates and
    writes. Row numbers are echoed back so the UI can point at the offending
    line in the user's own file.

    All-or-nothing by default: a single bad row aborts the whole import, because
    a half-loaded asset register is worse than a rejected file. Set
    `skip_invalid` to import what parses and report the rest.

    Declared before /{asset_id} routes so "import" is never parsed as an id.
    """
    if not current_user.has_permission("assets", "create"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions to create assets"
        )

    if not payload.rows:
        raise HTTPException(status_code=400, detail="No rows to import")

    # Existing asset numbers for this company — asset_number is unique per
    # company, so pre-loading avoids a query per row.
    existing_numbers = {
        n for (n,) in db.query(Asset.asset_number).filter(
            Asset.company_id == current_user.company_id
        ).all()
    }
    visible_properties = get_visible_property_ids(db, current_user)

    errors: List[AssetImportError] = []
    to_create = []
    seen_in_file = set()

    for row in payload.rows:
        # row_number is the line in the user's spreadsheet, not the array index.
        problems = []

        if not row.name or not row.name.strip():
            problems.append("name is required")
        if not row.asset_number or not row.asset_number.strip():
            problems.append("asset_number is required")

        number = (row.asset_number or "").strip()
        if number and number in existing_numbers:
            problems.append(f"asset_number '{number}' already exists")
        if number and number in seen_in_file:
            problems.append(f"asset_number '{number}' appears more than once in this file")

        if row.property_id is not None and row.property_id not in visible_properties:
            problems.append(f"property_id {row.property_id} is not accessible")

        if problems:
            errors.append(AssetImportError(row_number=row.row_number, errors=problems))
            continue

        seen_in_file.add(number)
        to_create.append(row)

    if errors and not payload.skip_invalid:
        # Nothing is written — the caller fixes the file and retries.
        return AssetImportResult(
            imported=0,
            failed=len(errors),
            errors=errors,
            committed=False,
        )

    for row in to_create:
        asset = Asset(
            company_id=current_user.company_id,
            created_by=current_user.id,
            asset_number=row.asset_number.strip(),
            name=row.name.strip(),
            description=row.description,
            category=row.category,
            subcategory=row.subcategory,
            asset_type=row.asset_type,
            make=row.make,
            model=row.model,
            serial_number=row.serial_number,
            year_manufactured=row.year_manufactured,
            unit_of_measure=row.unit_of_measure,
            current_stock=row.current_stock,
            minimum_stock=row.minimum_stock,
            cost_per_unit=row.cost_per_unit,
            property_id=row.property_id,
            location_label=row.location_label,
        )
        db.add(asset)

    db.commit()

    logger.info(
        f"Imported {len(to_create)} asset(s) for company {current_user.company_id} "
        f"by user {current_user.id} ({len(errors)} skipped)"
    )
    return AssetImportResult(
        imported=len(to_create),
        failed=len(errors),
        errors=errors,
        committed=True,
    )


@router.post("", response_model=AssetResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=AssetResponse, status_code=status.HTTP_201_CREATED)
def create_asset(
    asset_in: AssetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new asset"""
    if not current_user.has_permission("assets", "create"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions to create assets"
        )
    logger.info(f"Creating asset: {asset_in.name} for company {current_user.company_id}")
    
    # Check if asset number already exists for this company
    existing_asset = db.query(Asset).filter(
        Asset.company_id == current_user.company_id,
        Asset.asset_number == asset_in.asset_number
    ).first()
    
    if existing_asset:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Asset number already exists for this company"
        )
    
    # Validate property_id if set — must be in user's visible scope
    if asset_in.property_id is not None:
        visible = get_visible_property_ids(db, current_user)
        if asset_in.property_id not in visible:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Property not accessible")

    # Create asset — extract spatial + non-column fields before passing to ORM
    asset_data = asset_in.dict(exclude={'latitude', 'longitude', 'location_geojson', 'first_calibration_date', 'calibration_specs'})
    asset = Asset(
        **asset_data,
        company_id=current_user.company_id,
        created_by=current_user.id
    )

    # Convert GeoJSON → PostGIS GEOMETRY (for lines/polygons) — takes priority
    if asset_in.location_geojson and isinstance(asset_in.location_geojson, dict):
        from shapely.geometry import shape
        from geoalchemy2.shape import from_shape
        geom = shape(asset_in.location_geojson)
        asset.location_geometry = from_shape(geom, srid=4326)
        asset.location_point = None  # line/polygon is the primary geometry
    elif asset_in.latitude is not None and asset_in.longitude is not None:
        # Convert lat/lng → PostGIS POINT (only when no line/polygon)
        asset.location_point = f"SRID=4326;POINT({asset_in.longitude} {asset_in.latitude})"

    db.add(asset)
    db.commit()
    db.refresh(asset)

    logger.info(f"Asset {asset.id} created successfully by user {current_user.id}")

    # If the asset requires calibration, auto-create an initial pending schedule due today.
    # The user will see it as "due now" in the unified feed and can perform the baseline
    # calibration; that POST consumes this schedule and rolls forward by asset interval.
    # Spec fields (parameter, units, target, tolerances) are inherited from the Asset.
    # Seed calibration specs + initial schedules.
    # New path: caller supplies `calibration_specs` array → one spec row + one initial
    # schedule per entry. Legacy path: requires_calibration=True with no array → fall
    # back to the asset's inline columns (single spec).
    if asset_in.calibration_specs:
        try:
            from api.v1.calibrations import create_pending_schedule
            for spec_in in asset_in.calibration_specs:
                spec_row = AssetCalibrationSpec(
                    asset_id=asset.id,
                    company_id=current_user.company_id,
                    calibration_type=spec_in.calibration_type,
                    parameter_name=spec_in.parameter_name,
                    unit_of_measure=spec_in.unit_of_measure,
                    target_value=spec_in.target_value,
                    tolerance_min=spec_in.tolerance_min,
                    tolerance_max=spec_in.tolerance_max,
                    interval_days=spec_in.interval_days,
                    notes=spec_in.notes,
                    is_active=True,
                )
                db.add(spec_row)
                db.flush()  # need spec_row.id before scheduling
                create_pending_schedule(
                    db, asset, due_date=(spec_in.first_due_date or date.today()),
                    calibration_type=spec_in.calibration_type,
                    parameter_name=spec_in.parameter_name,
                    unit_of_measure=spec_in.unit_of_measure,
                    target_value=spec_in.target_value,
                    tolerance_min=spec_in.tolerance_min,
                    tolerance_max=spec_in.tolerance_max,
                    created_by=current_user.id,
                    notes="Initial calibration on asset registration",
                )
            db.commit()
        except Exception as e:
            logger.warning(f"Multi-spec calibration setup failed for asset {asset.id}: {e}")
    elif asset.requires_calibration:
        try:
            from api.v1.calibrations import create_pending_schedule
            initial_due = asset_in.first_calibration_date or date.today()
            create_pending_schedule(
                db, asset, due_date=initial_due,
                calibration_type=asset.calibration_type or "general",
                parameter_name=asset.calibration_parameter_name,
                unit_of_measure=asset.calibration_unit_of_measure,
                target_value=asset.calibration_target_value,
                tolerance_min=asset.calibration_tolerance_min,
                tolerance_max=asset.calibration_tolerance_max,
                created_by=current_user.id,
                notes="Initial calibration on asset registration",
            )
            db.commit()
        except Exception as e:
            logger.warning(f"Initial calibration schedule creation failed for asset {asset.id}: {e}")

    # Notify admins and managers when a new asset is registered
    try:
        from services.notification_service import NotificationService
        from db.models.notification import NotificationType
        notification_service = NotificationService(db)
        notification_service.notify_admins(
            company_id=current_user.company_id,
            notification_type=NotificationType.system,
            title=f"New asset: {asset.name}",
            body=f"#{asset.asset_number} ({asset.category}) added by {current_user.first_name or current_user.username}",
            data={"asset_id": asset.id, "asset_number": asset.asset_number},
        )
        notification_service.notify_managers(
            company_id=current_user.company_id,
            notification_type=NotificationType.system,
            title=f"New asset: {asset.name}",
            body=f"#{asset.asset_number} ({asset.category}) added by {current_user.first_name or current_user.username}",
            data={"asset_id": asset.id, "asset_number": asset.asset_number},
        )
        db.commit()
    except Exception as e:
        logger.warning(f"Asset creation notification failed: {e}")

    return asset

@router.get("", response_model=List[AssetResponse])
@router.get("/", response_model=List[AssetResponse])
def list_assets(
    category: Optional[str] = None,
    asset_type: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    location: Optional[str] = None,
    requires_maintenance: Optional[bool] = None,
    requires_calibration: Optional[bool] = None,
    low_stock_only: bool = False,
    # NEW: Certification filtering
    certification_scheme: Optional[str] = None,
    certified_only: bool = False,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user_or_contractor: Union[User, Contractor] = Depends(get_current_user_or_contractor)
):
    """List assets with filtering options"""
    logger.info(f"Listing assets with filters - category: {category}, type: {asset_type}")
    
    # Get company_id based on user type
    if isinstance(current_user_or_contractor, User):
        company_id = current_user_or_contractor.company_id
    else:
        company_id = None
    
    query = db.query(Asset)
    
    # Filter by company for regular users
    if company_id:
        query = query.filter(Asset.company_id == company_id)

    # Property scope filter (only for User type, not Contractor)
    if isinstance(current_user_or_contractor, User):
        scope = build_asset_scope_filter(db, current_user_or_contractor)
        if scope is not None:
            query = query.filter(scope)

    # Apply filters
    if category:
        query = query.filter(Asset.category == category)
    if asset_type:
        query = query.filter(Asset.asset_type == asset_type)
    if status_filter:
        query = query.filter(Asset.status == status_filter)
    if location:
        query = query.filter(Asset.location_label.ilike(f"%{location}%"))
    if requires_maintenance is not None:
        query = query.filter(Asset.requires_maintenance == requires_maintenance)
    if requires_calibration is not None:
        query = query.filter(Asset.requires_calibration == requires_calibration)
    if low_stock_only:
        query = query.filter(
            and_(
                Asset.asset_type == "consumable",
                Asset.current_stock <= Asset.minimum_stock
            )
        )
    
    # NEW: Certification filtering
    if certification_scheme and certified_only:
        # Filter for consumables certified for the specified scheme
        query = query.filter(
            Asset.asset_type == "consumable",
            Asset.certified_for[certification_scheme].astext.cast(db.Boolean) == True
        )
    
    # Filter active assets only
    query = query.filter(Asset.is_active == True)
    
    # Apply pagination
    assets = query.offset(skip).limit(limit).all()

    logger.info(f"Retrieved {len(assets)} assets")
    return assets

@router.get("/geojson", response_model=dict)
def get_assets_geojson(
    category: Optional[str] = None,
    property_id: Optional[int] = None,
    db: Session = Depends(get_db),
    actor=Depends(get_current_user_or_contractor),
):
    """Return company assets as GeoJSON FeatureCollection for map display.

    Company users: company-scoped + property visibility via UserPropertyScope.
    Contractors: scoped to active relationship companies. property_id must be
    one of the contractor's accessible properties.
    """
    from db.models.contractor_relationship import ContractorRelationship
    from db.models.property import Property
    from geoalchemy2.shape import to_shape
    from shapely.geometry import mapping

    is_contractor = isinstance(actor, Contractor)

    if is_contractor:
        active_company_ids = [
            r.company_id for r in db.query(ContractorRelationship).filter(
                ContractorRelationship.contractor_id == actor.id,
                ContractorRelationship.status == "active",
            ).all()
        ]
        if not active_company_ids:
            return {"type": "FeatureCollection", "features": []}

        if property_id is not None:
            prop = db.query(Property).filter(Property.id == property_id).first()
            if not prop or prop.owner_company_id not in active_company_ids:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="No active relationship with this property's owner",
                )

        query = db.query(Asset).filter(
            Asset.company_id.in_(active_company_ids),
            Asset.is_active == True,
            or_(Asset.location_point.isnot(None), Asset.location_geometry.isnot(None)),
        )
    else:
        current_user = actor
        query = db.query(Asset).filter(
            Asset.company_id == current_user.company_id,
            Asset.is_active == True,
            or_(Asset.location_point.isnot(None), Asset.location_geometry.isnot(None))
        )
        scope = build_asset_scope_filter(db, current_user)
        if scope is not None:
            query = query.filter(scope)
    if category:
        query = query.filter(Asset.category == category)
    # Property scoping for the mobile map. Includes company-wide assets (NULL
    # property_id) so unscoped equipment still appears when one property is
    # selected — they're visible regardless.
    if property_id is not None:
        query = query.filter(
            or_(Asset.property_id == property_id, Asset.property_id.is_(None))
        )

    features = []
    for asset in query.all():
        try:
            # Prefer line/polygon geometry over point (point is just for centering)
            if asset.location_geometry is not None:
                geom = mapping(to_shape(asset.location_geometry))
            elif asset.location_point is not None:
                geom = mapping(to_shape(asset.location_point))
            else:
                continue
            features.append({
                "type": "Feature",
                "geometry": geom,
                "properties": {
                    "id": asset.id,
                    "name": asset.name,
                    "asset_number": asset.asset_number,
                    "category": asset.category,
                    "subcategory": asset.subcategory,
                    "status": asset.status,
                    "location_label": asset.location_label,
                    "property_id": asset.property_id,
                }
            })
        except Exception as e:
            logger.error(f"Error serializing asset {asset.id} geometry: {e}")
            continue

    return {"type": "FeatureCollection", "features": features}


@router.get("/summary", response_model=List[AssetSummary])
def get_assets_summary(
    category: Optional[str] = None,
    asset_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user_or_contractor: Union[User, Contractor] = Depends(get_current_user_or_contractor)
):
    """Get lightweight asset summary for dropdowns and selection"""
    if isinstance(current_user_or_contractor, User):
        company_id = current_user_or_contractor.company_id
    else:
        company_id = None
    
    query = db.query(Asset).filter(Asset.is_active == True)

    if company_id:
        query = query.filter(Asset.company_id == company_id)

    if isinstance(current_user_or_contractor, User):
        scope = build_asset_scope_filter(db, current_user_or_contractor)
        if scope is not None:
            query = query.filter(scope)

    if category:
        query = query.filter(Asset.category == category)
    if asset_type:
        query = query.filter(Asset.asset_type == asset_type)

    assets = query.all()
    return assets

@router.get("/stats", response_model=AssetStats)
def get_asset_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)  # Only company users have asset stats
):
    """Get asset statistics for dashboard"""
    company_id = current_user.company_id
    logger.info(f"Getting asset stats for company {company_id}")
    
    # Total assets
    total_assets = db.query(func.count(Asset.id)).filter(
        Asset.company_id == company_id,
        Asset.is_active == True
    ).scalar() or 0
    
    # Equipment vs consumables
    equipment_count = db.query(func.count(Asset.id)).filter(
        Asset.company_id == company_id,
        Asset.asset_type == "physical",
        Asset.is_active == True
    ).scalar() or 0
    
    consumable_count = db.query(func.count(Asset.id)).filter(
        Asset.company_id == company_id,
        Asset.asset_type == "consumable",
        Asset.is_active == True
    ).scalar() or 0
    
    # Assets needing maintenance (simplified check)
    today = date.today()
    assets_needing_maintenance = db.query(func.count(func.distinct(AssetMaintenance.asset_id))).filter(
        AssetMaintenance.company_id == company_id,
        AssetMaintenance.scheduled_date.isnot(None),
        AssetMaintenance.scheduled_date < today,  # Overdue
        AssetMaintenance.status.in_(['scheduled', 'in_progress'])  # Not completed or cancelled
    ).scalar() or 0
    
    # Assets needing calibration (overdue or due soon)
    assets_requiring_calibration = db.query(Asset).filter(
        Asset.company_id == company_id,
        Asset.requires_calibration == True,
        Asset.calibration_interval_days.isnot(None),
        Asset.is_active == True
    ).all()
    
    assets_needing_calibration = 0
    for asset in assets_requiring_calibration:
        # Get the most recent calibration for this asset
        latest_calibration = db.query(AssetCalibration).filter(
            AssetCalibration.asset_id == asset.id,
            AssetCalibration.company_id == company_id
        ).order_by(AssetCalibration.calibration_date.desc()).first()
        
        if latest_calibration:
            # Calculate next due date based on last calibration + interval
            next_due = latest_calibration.calibration_date + timedelta(days=asset.calibration_interval_days)
            if next_due <= today:
                assets_needing_calibration += 1
        else:
            # No calibration record exists - needs initial calibration
            assets_needing_calibration += 1
    
    # Low stock consumables
    low_stock_consumables = db.query(func.count(Asset.id)).filter(
        Asset.company_id == company_id,
        Asset.asset_type == "consumable",
        Asset.current_stock <= Asset.minimum_stock,
        Asset.is_active == True
    ).scalar() or 0
    
    # Compliance alerts (WOF, registration, insurance due within 30 days)
    today = date.today()
    thirty_days_from_now = today + timedelta(days=30)
    compliance_alerts = db.query(func.count(Asset.id)).filter(
        Asset.company_id == company_id,
        Asset.is_active == True,
        or_(
            and_(Asset.wof_due.isnot(None), Asset.wof_due <= thirty_days_from_now),
            and_(Asset.registration_expiry.isnot(None), Asset.registration_expiry <= thirty_days_from_now),
            and_(Asset.insurance_expiry.isnot(None), Asset.insurance_expiry <= thirty_days_from_now)
        )
    ).scalar() or 0
    
    return AssetStats(
        total_assets=total_assets,
        equipment_count=equipment_count,
        consumable_count=consumable_count,
        assets_needing_maintenance=assets_needing_maintenance,
        assets_needing_calibration=assets_needing_calibration,
        low_stock_consumables=low_stock_consumables,
        compliance_alerts=compliance_alerts
    )

@router.get("/compliance-alerts", response_model=List[ComplianceAlert])
def get_compliance_alerts(
    days_ahead: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get compliance alerts (WOF, registration, insurance expiring soon)"""
    company_id = current_user.company_id
    today = date.today()
    cutoff_date = today + timedelta(days=days_ahead)
    
    alerts = []
    
    # Query assets with upcoming expiries
    assets = db.query(Asset).filter(
        Asset.company_id == company_id,
        Asset.is_active == True,
        or_(
            and_(Asset.wof_due.isnot(None), Asset.wof_due <= cutoff_date),
            and_(Asset.registration_expiry.isnot(None), Asset.registration_expiry <= cutoff_date),
            and_(Asset.insurance_expiry.isnot(None), Asset.insurance_expiry <= cutoff_date)
        )
    ).all()
    
    for asset in assets:
        # Check WOF
        if asset.wof_due and asset.wof_due <= cutoff_date:
            days_until = (asset.wof_due - today).days
            severity = "critical" if days_until <= 7 else "warning" if days_until <= 14 else "info"
            alerts.append(ComplianceAlert(
                asset_id=asset.id,
                asset_name=asset.name,
                alert_type="wof_due",
                due_date=asset.wof_due,
                days_until_due=days_until,
                severity=severity
            ))
        
        # Check registration
        if asset.registration_expiry and asset.registration_expiry <= cutoff_date:
            days_until = (asset.registration_expiry - today).days
            severity = "critical" if days_until <= 7 else "warning" if days_until <= 14 else "info"
            alerts.append(ComplianceAlert(
                asset_id=asset.id,
                asset_name=asset.name,
                alert_type="registration_expiry",
                due_date=asset.registration_expiry,
                days_until_due=days_until,
                severity=severity
            ))
        
        # Check insurance
        if asset.insurance_expiry and asset.insurance_expiry <= cutoff_date:
            days_until = (asset.insurance_expiry - today).days
            severity = "critical" if days_until <= 7 else "warning" if days_until <= 14 else "info"
            alerts.append(ComplianceAlert(
                asset_id=asset.id,
                asset_name=asset.name,
                alert_type="insurance_expiry",
                due_date=asset.insurance_expiry,
                days_until_due=days_until,
                severity=severity
            ))
    
    return sorted(alerts, key=lambda x: x.days_until_due)

@router.get("/stock-alerts", response_model=List[StockAlert])
def get_stock_alerts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get stock level alerts for consumables"""
    company_id = current_user.company_id
    
    # Query consumables with stock issues
    consumables = db.query(Asset).filter(
        Asset.company_id == company_id,
        Asset.asset_type == "consumable",
        Asset.is_active == True,
        or_(
            Asset.current_stock <= 0,
            Asset.current_stock <= Asset.minimum_stock
        )
    ).all()
    
    alerts = []
    for asset in consumables:
        if asset.current_stock <= 0:
            stock_status = "out_of_stock"
        elif asset.minimum_stock and asset.current_stock <= asset.minimum_stock:
            stock_status = "low_stock"
        else:
            stock_status = "adequate"
        
        if stock_status != "adequate":
            alerts.append(StockAlert(
                asset_id=asset.id,
                asset_name=asset.name,
                current_stock=asset.current_stock,
                minimum_stock=asset.minimum_stock or 0,
                unit_of_measure=asset.unit_of_measure or "units",
                stock_status=stock_status
            ))
    
    return alerts

@router.get("/{asset_id}", response_model=AssetResponse)
def get_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user_or_contractor: Union[User, Contractor] = Depends(get_current_user_or_contractor)
):
    """Get a specific asset by ID"""
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found"
        )

    if isinstance(current_user_or_contractor, User):
        user = current_user_or_contractor
        if not getattr(user, 'is_auxein_admin', False) and asset.company_id != user.company_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
        check_asset_scope(db, user, asset)

    if asset.requires_calibration and asset.calibration_interval_days:
        latest_calibration = db.query(AssetCalibration).filter(
            AssetCalibration.asset_id == asset.id,
            AssetCalibration.company_id == asset.company_id
        ).order_by(AssetCalibration.calibration_date.desc()).first()
    
        if latest_calibration:
            next_due = latest_calibration.calibration_date + timedelta(days=asset.calibration_interval_days)
            today = date.today()
            days_until_due = (next_due - today).days
            
            # Add computed fields (these would need to be added to AssetResponse schema)
            asset.last_calibration_date = latest_calibration.calibration_date
            asset.next_calibration_due = next_due
            asset.calibration_days_until_due = days_until_due
            asset.calibration_is_overdue = days_until_due < 0

    return asset

@router.get("/consumables/by-certification", response_model=List[AssetResponse])
def get_consumables_by_certification(
    scheme: str = Query(..., description="Certification scheme: organics, regenerative, biodynamic, swnz"),
    include_uncertified: bool = False,
    low_stock_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get consumables filtered by certification scheme"""
    company_id = current_user.company_id
    
    query = db.query(Asset).filter(
        Asset.company_id == company_id,
        Asset.asset_type == "consumable",
        Asset.is_active == True
    )
    
    if not include_uncertified:
        # Only show items certified for this scheme
        query = query.filter(
            Asset.certified_for[scheme].astext.cast(db.Boolean) == True
        )
    
    if low_stock_only:
        query = query.filter(Asset.current_stock <= Asset.minimum_stock)
    
    consumables = query.all()
    
    logger.info(f"Retrieved {len(consumables)} consumables for scheme: {scheme}")
    return consumables

@router.get("/consumables/certification-summary")
def get_certification_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get summary of consumables by certification scheme"""
    company_id = current_user.company_id
    
    consumables = db.query(Asset).filter(
        Asset.company_id == company_id,
        Asset.asset_type == "consumable",
        Asset.is_active == True
    ).all()
    
    summary = {
        "organics": 0,
        "regenerative": 0,
        "biodynamic": 0,
        "swnz": 0,
        "total_consumables": len(consumables)
    }
    
    for consumable in consumables:
        if consumable.certified_for:
            for scheme, certified in consumable.certified_for.items():
                if certified and scheme in summary:
                    summary[scheme] += 1
    
    return summary

@router.put("/{asset_id}", response_model=AssetResponse)
def update_asset(
    asset_id: int,
    asset_update: AssetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)  # Only company users can update
):
    """Update an asset"""
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found"
        )
    
    # Check permissions
    if not current_user.is_auxein_admin and asset.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    check_asset_scope(db, current_user, asset)

    # Validate new property_id if being changed
    update_data_check = asset_update.dict(exclude_unset=True)
    if 'property_id' in update_data_check and update_data_check['property_id'] is not None:
        visible = get_visible_property_ids(db, current_user)
        if update_data_check['property_id'] not in visible:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Target property not accessible")

    # Update asset attributes — handle spatial fields separately
    update_data = asset_update.dict(exclude_unset=True)
    lat = update_data.pop('latitude', None)
    lng = update_data.pop('longitude', None)
    geojson = update_data.pop('location_geojson', None)

    # Line/polygon geometry takes priority over point
    if geojson and isinstance(geojson, dict):
        from shapely.geometry import shape
        from geoalchemy2.shape import from_shape
        geom = shape(geojson)
        asset.location_geometry = from_shape(geom, srid=4326)
        asset.location_point = None  # line/polygon is the primary geometry
    elif lat is not None and lng is not None:
        asset.location_point = f"SRID=4326;POINT({lng} {lat})"
        asset.location_geometry = None  # clear any previous line/polygon

    # Snapshot pre-update value so we can detect a transition into requires_calibration=true
    was_requiring_calibration = bool(asset.requires_calibration)

    for key, value in update_data.items():
        setattr(asset, key, value)

    db.commit()
    db.refresh(asset)

    # Calibration schedule sync — applies whenever requires_calibration is true after the update.
    # The asset's spec is the source of truth for forward schedules. Past/completed event rows
    # are immutable — they keep their snapshot.
    #
    # Strategy: the partial unique index allows at most one pending row per (asset, type), but
    # legacy state can leave multiple pending rows for the same asset across different types
    # (backfill picked one type, then the asset's actual type was set later). Mass-updating all
    # of them to the new asset.calibration_type would collide with that index. So:
    #   - 0 pending rows → create one fresh
    #   - 1 pending row  → sync its spec (incl. calibration_type) to the asset
    #   - >1 pending rows → keep the earliest-due one, delete the rest, then sync the keeper.
    #     We preserve the keeper's due_date so the user's existing schedule date isn't lost.
    if asset.requires_calibration:
        try:
            from db.models.asset import AssetCalibrationSchedule
            from api.v1.calibrations import create_pending_schedule
            from sqlalchemy import asc

            pending = db.query(AssetCalibrationSchedule).filter(
                AssetCalibrationSchedule.asset_id == asset.id,
                AssetCalibrationSchedule.status == 'pending',
            ).order_by(asc(AssetCalibrationSchedule.due_date)).all()

            new_type = asset.calibration_type or "general"

            if not pending:
                create_pending_schedule(
                    db, asset, due_date=date.today(),
                    calibration_type=new_type,
                    parameter_name=asset.calibration_parameter_name,
                    unit_of_measure=asset.calibration_unit_of_measure,
                    target_value=asset.calibration_target_value,
                    tolerance_min=asset.calibration_tolerance_min,
                    tolerance_max=asset.calibration_tolerance_max,
                    created_by=current_user.id,
                    notes=(
                        "Initial calibration after asset registration update"
                        if not was_requiring_calibration
                        else "Schedule created after asset spec update"
                    ),
                )
            else:
                keeper = pending[0]
                extras = pending[1:]
                for extra in extras:
                    db.delete(extra)
                # Flush deletes before mutating the keeper, so the unique index sees the
                # extras gone before the keeper's type changes.
                if extras:
                    db.flush()
                keeper.calibration_type = new_type
                keeper.parameter_name = asset.calibration_parameter_name
                keeper.unit_of_measure = asset.calibration_unit_of_measure
                keeper.target_value = asset.calibration_target_value
                keeper.tolerance_min = asset.calibration_tolerance_min
                keeper.tolerance_max = asset.calibration_tolerance_max

            db.commit()
        except Exception as e:
            logger.warning(f"Calibration schedule sync on asset update failed for {asset.id}: {e}")
            db.rollback()

    logger.info(f"Asset {asset_id} updated by user {current_user.id}")
    return asset

@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)  # Only company users can delete
):
    """Soft delete an asset"""
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found"
        )
    
    # Check permissions
    if not current_user.is_auxein_admin and asset.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    check_asset_scope(db, current_user, asset)

    # Soft delete
    asset.is_active = False
    asset.status = "disposed"
    
    db.commit()
    logger.info(f"Asset {asset_id} deleted by user {current_user.id}")
    
    return None

@router.get("/category/{category}", response_model=List[AssetSummary])
def get_assets_by_category(
    category: str,
    db: Session = Depends(get_db),
    current_user_or_contractor: Union[User, Contractor] = Depends(get_current_user_or_contractor)
):
    """Get assets by category"""
    if isinstance(current_user_or_contractor, User):
        company_id = current_user_or_contractor.company_id
    else:
        company_id = None
    
    query = db.query(Asset).filter(
        Asset.category == category,
        Asset.is_active == True
    )
    
    if company_id:
        query = query.filter(Asset.company_id == company_id)
    
    assets = query.all()
    return assets

@router.get("/consumables/low-stock", response_model=List[AssetResponse])
def get_low_stock_consumables(
    certification_scheme: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get consumables with low stock levels, optionally filtered by certification"""
    query = db.query(Asset).filter(
        Asset.company_id == current_user.company_id,
        Asset.asset_type == "consumable",
        Asset.current_stock <= Asset.minimum_stock,
        Asset.is_active == True
    )
    
    # NEW: Filter by certification if specified
    if certification_scheme:
        query = query.filter(
            Asset.certified_for[certification_scheme].astext.cast(db.Boolean) == True
        )
    
    consumables = query.all()
    
    return consumables

@router.post("/{asset_id}/files/{file_id}")
def associate_file_with_asset(
    asset_id: int,
    file_id: str,
    file_category: str = "document",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Associate an existing file with an asset"""
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found"
        )
    
    # Check permissions
    if not current_user.is_auxein_admin and asset.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    # Verify file exists and belongs to same company
    from db.models.file import File
    file = db.query(File).filter(
        File.id == file_id,
        File.company_id == asset.company_id,
        File.is_active == True
    ).first()
    
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found or access denied"
        )
    
    # Add file reference to asset
    asset.add_file_reference(file_id, file_category)
    
    db.commit()
    logger.info(f"File {file_id} associated with asset {asset_id}")
    
    return {"message": "File associated successfully"}

@router.delete("/{asset_id}/files/{file_id}")
def remove_file_from_asset(
    asset_id: int,
    file_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Remove file association from asset"""
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found"
        )
    
    # Check permissions
    if not current_user.is_auxein_admin and asset.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    # Remove file reference
    asset.remove_file_reference(file_id)

    db.commit()
    logger.info(f"File {file_id} removed from asset {asset_id}")


# ──────────────────────────────────────────────────────────────────────────────
# Calibration Specs — per-(asset, calibration_type) spec rows.
# Replaces the single-spec inline columns on the Asset row by normalising into
# their own table so one asset can hold multiple independently-managed
# calibration types (e.g. a sprayer with both `pressure` and `spray_output_rate`).
# Each spec drives the schedule auto-spawn loop in create_calibration_record.
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/{asset_id}/calibration-specs", response_model=List[CalibrationSpecResponse])
def list_calibration_specs(
    asset_id: int,
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List calibration specs for an asset."""
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    if not current_user.is_auxein_admin and asset.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Access denied")
    check_asset_scope(db, current_user, asset)

    q = db.query(AssetCalibrationSpec).filter(AssetCalibrationSpec.asset_id == asset_id)
    if not include_inactive:
        q = q.filter(AssetCalibrationSpec.is_active.is_(True))
    return q.order_by(AssetCalibrationSpec.calibration_type.asc()).all()


@router.post("/{asset_id}/calibration-specs", response_model=CalibrationSpecResponse, status_code=status.HTTP_201_CREATED)
def create_calibration_spec(
    asset_id: int,
    spec_in: CalibrationSpecCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a new calibration spec to an asset, and seed its initial pending schedule."""
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    if not current_user.is_auxein_admin and asset.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Access denied")
    if not current_user.has_permission("assets", "update"):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    check_asset_scope(db, current_user, asset)

    # Reject duplicates — partial unique index would reject anyway but a cleaner 400 here.
    existing = db.query(AssetCalibrationSpec).filter(
        AssetCalibrationSpec.asset_id == asset_id,
        AssetCalibrationSpec.calibration_type == spec_in.calibration_type,
        AssetCalibrationSpec.is_active.is_(True),
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"An active spec for {spec_in.calibration_type} already exists on this asset",
        )

    spec = AssetCalibrationSpec(
        asset_id=asset.id,
        company_id=asset.company_id,
        calibration_type=spec_in.calibration_type,
        parameter_name=spec_in.parameter_name,
        unit_of_measure=spec_in.unit_of_measure,
        target_value=spec_in.target_value,
        tolerance_min=spec_in.tolerance_min,
        tolerance_max=spec_in.tolerance_max,
        interval_days=spec_in.interval_days,
        notes=spec_in.notes,
        is_active=True,
    )
    db.add(spec)
    db.flush()

    # Seed initial schedule. Only spawn one if no pending schedule exists for this type
    # (in case the user is replacing a deactivated spec — leave the existing schedule alone).
    from api.v1.calibrations import create_pending_schedule
    create_pending_schedule(
        db, asset, due_date=(spec_in.first_due_date or date.today()),
        calibration_type=spec_in.calibration_type,
        parameter_name=spec_in.parameter_name,
        unit_of_measure=spec_in.unit_of_measure,
        target_value=spec_in.target_value,
        tolerance_min=spec_in.tolerance_min,
        tolerance_max=spec_in.tolerance_max,
        created_by=current_user.id,
        notes="Initial calibration on spec creation",
    )
    # Make sure the parent asset still has `requires_calibration` set so the auto-respawn
    # loop fires on subsequent completions.
    if not asset.requires_calibration:
        asset.requires_calibration = True
    db.commit()
    db.refresh(spec)
    return spec


@router.patch("/calibration-specs/{spec_id}", response_model=CalibrationSpecResponse)
def update_calibration_spec(
    spec_id: int,
    update_in: CalibrationSpecUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edit a calibration spec. New values apply to future auto-respawned schedules.
    Existing pending schedule for this type is NOT auto-edited (keeps history stable)."""
    spec = db.query(AssetCalibrationSpec).filter(AssetCalibrationSpec.id == spec_id).first()
    if not spec:
        raise HTTPException(status_code=404, detail="Spec not found")
    if not current_user.is_auxein_admin and spec.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Access denied")
    if not current_user.has_permission("assets", "update"):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    payload = update_in.dict(exclude_unset=True)
    for field, value in payload.items():
        setattr(spec, field, value)

    db.add(spec)
    db.commit()
    db.refresh(spec)
    return spec


@router.delete("/calibration-specs/{spec_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_calibration_spec(
    spec_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft-delete via is_active=False. Existing schedule/event history is preserved
    and the auto-respawn loop stops on next completion for this type."""
    spec = db.query(AssetCalibrationSpec).filter(AssetCalibrationSpec.id == spec_id).first()
    if not spec:
        return
    if not current_user.is_auxein_admin and spec.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Access denied")
    if not current_user.has_permission("assets", "update"):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    spec.is_active = False
    db.add(spec)
    db.commit()

    return {"message": "File association removed successfully"}


@router.get("/{asset_id}/spray-capability")
def get_asset_spray_capability(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Asset-level spray-coverage pre-check for the task wizard: does this asset
    have a swath width + a flow rate resolvable to L/s? Lets the create flow flag a
    misconfigured sprayer before the task exists (block + GPS are known client-side).
    Returns {spray_capable, has_swath, swath_width_m, has_flow, flow_l_s, missing[]}."""
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    if not current_user.is_auxein_admin and asset.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Access denied")
    from services.spray_coverage import assess_asset_spray_capability
    return assess_asset_spray_capability(asset, db)