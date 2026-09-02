# api/v1/costs.py — pay rates and company cost settings.
#
# Every endpoint here is gated on the `costs` permission module, which is
# auxein_admin and company_admin only. It is deliberately NOT `timesheets`,
# which company_manager holds: reusing that would have answered "who may see
# salaries" as a side effect of a permission granted for a different reason.
#
# The read gate is as tight as the write gate on purpose. A task cost plus its
# hours reveals an hourly rate, so anything derived from a rate has to be behind
# the same door as the rate itself.
import logging
from datetime import date
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from db.session import get_db
from db.models.user import User
from db.models.asset import Asset
from db.models.costing import (
    UserPayRate, CompanyCostSettings, STOCK_COSTING_METHODS, UNCODED_HOURS_POLICIES,
)
from schemas.costing import (
    PayRateCreate, PayRateUpdate, PayRateOut,
    CostSettingsIn, CostSettingsOut, StaffRateSummary,
    EquipmentRateIn, EquipmentRateOut,
)
from services.pay_rates import (
    get_cost_settings, resolve_pay_rate, list_rates, add_rate,
)
from api.deps import get_current_user
from core.local_time import local_today

logger = logging.getLogger(__name__)
router = APIRouter()


def _require_costs(current_user: User, action: str):
    """One gate, used by every route in this file.

    A generic 403 message on read: "not enough permissions to view costs" tells
    a company_manager that costs exist and they are excluded, which is fine and
    honest. What it must never do is leak a figure in the detail.
    """
    if not current_user.has_permission("costs", action):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions to view or change cost settings",
        )


def _display_name(u: User) -> str:
    full = " ".join(x for x in [u.first_name, u.last_name] if x).strip()
    return full or u.username or f"User {u.id}"


def _settings_gaps(settings: Optional[CompanyCostSettings]) -> List[str]:
    """What is not configured, and what each gap actually costs.

    Written as consequences rather than field names. "on_cost_multiplier is
    null" tells an admin nothing; "wages are being counted at bare rate, which
    understates true employment cost" tells them whether they care.
    """
    gaps = []
    if settings is None:
        return [
            "Nothing is configured yet, so no task will be costed. "
            "Set at least an on-cost multiplier and a standard day length."
        ]
    if settings.on_cost_multiplier is None:
        gaps.append(
            "No on-cost multiplier: wages are counted at the bare hourly rate, which "
            "understates true employment cost by roughly 15-20% once holiday pay, ACC "
            "and KiwiSaver are included."
        )
    if settings.standard_day_hours is None:
        gaps.append(
            "No standard day length: contractors on a DAILY rate cannot be costed and "
            "will show as uncosted rather than being divided by an assumed 8-hour day."
        )
    if settings.default_hourly_rate is None:
        gaps.append(
            "No default hourly rate: staff with no rate on file leave their tasks "
            "reported as incompletely costed rather than costed at zero."
        )
    return gaps


def _to_out(settings: Optional[CompanyCostSettings], company_id: int) -> CostSettingsOut:
    if settings is None:
        return CostSettingsOut(company_id=company_id, gaps=_settings_gaps(None))
    return CostSettingsOut(
        company_id=settings.company_id,
        default_hourly_rate=settings.default_hourly_rate,
        on_cost_multiplier=settings.on_cost_multiplier,
        standard_day_hours=settings.standard_day_hours,
        currency=settings.currency or "NZD",
        stock_costing_method=settings.stock_costing_method,
        uncoded_hours_policy=settings.uncoded_hours_policy,
        updated_at=settings.updated_at,
        gaps=_settings_gaps(settings),
    )


# ---------------------------------------------------------------------------
# Company cost settings
# ---------------------------------------------------------------------------

@router.get("/settings", response_model=CostSettingsOut)
def get_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The company's cost settings. Returns defaults plus `gaps` when unset.

    Never 404s on an unconfigured company: "you have not set this up" is a
    normal state with something useful to say, not an error.
    """
    _require_costs(current_user, "read")
    return _to_out(get_cost_settings(db, current_user.company_id), current_user.company_id)


@router.put("/settings", response_model=CostSettingsOut)
def update_settings(
    payload: CostSettingsIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create or update the settings row. Fields absent from the body are left
    alone; fields present as null are cleared."""
    _require_costs(current_user, "update")

    provided = payload.model_fields_set

    if "stock_costing_method" in provided and payload.stock_costing_method is not None:
        if payload.stock_costing_method not in STOCK_COSTING_METHODS:
            raise HTTPException(
                status_code=400,
                detail=f"stock_costing_method must be one of: {', '.join(STOCK_COSTING_METHODS)}",
            )
    if "uncoded_hours_policy" in provided and payload.uncoded_hours_policy is not None:
        if payload.uncoded_hours_policy not in UNCODED_HOURS_POLICIES:
            raise HTTPException(
                status_code=400,
                detail=f"uncoded_hours_policy must be one of: {', '.join(UNCODED_HOURS_POLICIES)}",
            )

    settings = get_cost_settings(db, current_user.company_id)
    if settings is None:
        settings = CompanyCostSettings(company_id=current_user.company_id)
        db.add(settings)

    for field in ("default_hourly_rate", "on_cost_multiplier", "standard_day_hours"):
        if field in provided:
            setattr(settings, field, getattr(payload, field))
    # These three are non-clearable: they have server defaults and no meaningful
    # empty state, so a null in the body is ignored rather than nulling a NOT
    # NULL column.
    for field in ("currency", "stock_costing_method", "uncoded_hours_policy"):
        if field in provided and getattr(payload, field) is not None:
            setattr(settings, field, getattr(payload, field))

    settings.updated_by = current_user.id
    db.commit()
    db.refresh(settings)

    logger.info(f"Cost settings updated for company {current_user.company_id} by user {current_user.id}")
    return _to_out(settings, current_user.company_id)


# ---------------------------------------------------------------------------
# Pay rates
# ---------------------------------------------------------------------------

@router.get("/rates/staff", response_model=List[StaffRateSummary])
def list_staff_rates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Every staff member with the rate that applies TODAY, for the admin screen.

    Today's date is correct here and only here: this is "what are we paying
    people now", not "what did this task cost". Anything costing a task resolves
    on the task's own date.
    """
    _require_costs(current_user, "read")

    users = (
        db.query(User)
        .filter(User.company_id == current_user.company_id, User.is_active == True)
        .order_by(User.first_name, User.username)
        .all()
    )
    settings = get_cost_settings(db, current_user.company_id)
    today = local_today()

    counts = {}
    for r in list_rates(db, current_user.company_id):
        counts[r.user_id] = counts.get(r.user_id, 0) + 1

    out = []
    for u in users:
        res = resolve_pay_rate(db, u.id, today, settings=settings)
        current_from = None
        if res.source == "pay_rate" and res.pay_rate_id:
            row = db.query(UserPayRate).filter(UserPayRate.id == res.pay_rate_id).first()
            current_from = row.effective_from if row else None
        out.append(StaffRateSummary(
            user_id=u.id,
            user_name=_display_name(u),
            user_type=u.user_type,
            current_rate=res.hourly_rate,
            current_from=current_from,
            currency=res.currency,
            source=res.source,
            history_count=counts.get(u.id, 0),
        ))
    return out


@router.get("/rates", response_model=List[PayRateOut])
def list_pay_rates(
    user_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Rate history for the company, or for one person."""
    _require_costs(current_user, "read")

    rows = list_rates(db, current_user.company_id, user_id=user_id)
    names = {
        u.id: _display_name(u)
        for u in db.query(User).filter(User.company_id == current_user.company_id).all()
    }
    out = []
    for r in rows:
        item = PayRateOut.model_validate(r, from_attributes=True)
        item.user_name = names.get(r.user_id)
        out.append(item)
    return out


@router.post("/rates", response_model=PayRateOut, status_code=status.HTTP_201_CREATED)
def create_pay_rate(
    payload: PayRateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Record a rate for a staff member from a given date.

    The previous open-ended rate is closed the day before this one starts, so
    exactly one rate covers any date. See services/pay_rates.add_rate.
    """
    _require_costs(current_user, "create")

    target = db.query(User).filter(User.id == payload.user_id).first()
    if target is None or target.company_id != current_user.company_id:
        # Same message either way — whether a user id exists in another company
        # is not something this endpoint should confirm.
        raise HTTPException(status_code=404, detail="User not found in your company")

    rate = add_rate(
        db,
        company_id=current_user.company_id,
        user_id=payload.user_id,
        hourly_rate=payload.hourly_rate,
        effective_from=payload.effective_from,
        created_by=current_user.id,
        currency=payload.currency,
        notes=payload.notes,
    )
    db.commit()
    db.refresh(rate)

    out = PayRateOut.model_validate(rate, from_attributes=True)
    out.user_name = _display_name(target)
    return out


@router.get("/rates/resolve", response_model=dict)
def resolve_rate_for_date(
    user_id: int = Query(...),
    on_date: date = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """What a person's rate was on a given date, and where the figure came from.

    Exists so a disputed cost can be checked without reading the rate table by
    hand — `source` says whether it was their own rate, the company fallback, or
    nothing at all.
    """
    _require_costs(current_user, "read")

    target = db.query(User).filter(User.id == user_id).first()
    if target is None or target.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="User not found in your company")

    res = resolve_pay_rate(db, user_id, on_date, company_id=current_user.company_id)
    return {
        "user_id": user_id,
        "on_date": on_date.isoformat(),
        "hourly_rate": str(res.hourly_rate) if res.is_resolved else None,
        "currency": res.currency,
        "source": res.source,
        "pay_rate_id": res.pay_rate_id,
    }


@router.patch("/rates/{rate_id}", response_model=PayRateOut)
def update_pay_rate(
    rate_id: int,
    payload: PayRateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Correct a rate row. For a genuine pay CHANGE, post a new rate instead —
    editing an existing row rewrites history rather than recording a change."""
    _require_costs(current_user, "update")

    rate = db.query(UserPayRate).filter(UserPayRate.id == rate_id).first()
    if rate is None or rate.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Pay rate not found")

    provided = payload.model_fields_set
    for field in ("hourly_rate", "effective_from", "effective_to", "notes"):
        if field in provided:
            setattr(rate, field, getattr(payload, field))

    if rate.effective_to is not None and rate.effective_to < rate.effective_from:
        raise HTTPException(status_code=400, detail="effective_to cannot be before effective_from")

    db.commit()
    db.refresh(rate)

    target = db.query(User).filter(User.id == rate.user_id).first()
    out = PayRateOut.model_validate(rate, from_attributes=True)
    out.user_name = _display_name(target) if target else None
    return out


@router.delete("/rates/{rate_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pay_rate(
    rate_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a rate row entered in error.

    Deliberately does NOT reopen the row it superseded. Guessing which previous
    range should grow back is how you end up with two rates covering one day;
    fixing the neighbour is an explicit edit.
    """
    _require_costs(current_user, "delete")

    rate = db.query(UserPayRate).filter(UserPayRate.id == rate_id).first()
    if rate is None or rate.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Pay rate not found")

    db.delete(rate)
    db.commit()
    logger.info(f"Pay rate {rate_id} deleted by user {current_user.id}")

# ---------------------------------------------------------------------------
# Equipment operating rates
# ---------------------------------------------------------------------------

@router.get("/equipment-rates", response_model=List[EquipmentRateOut])
def list_equipment_rates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Every piece of equipment and what an hour of it costs to run.

    Lives here rather than on the asset form on purpose. An operating rate is
    cost data — it is a depreciation and maintenance position, and combined
    with task hours it says what a job cost. It belongs behind the same door as
    pay rates, not on a screen every field user can open.

    `current_hours` comes along because it is the number that tells an admin
    whether a rate is worth setting: an implement with 4 hours on it does not
    move a total, and a tractor with 900 does.
    """
    _require_costs(current_user, "read")

    assets = (
        db.query(Asset)
        .filter(
            Asset.company_id == current_user.company_id,
            Asset.asset_type != "consumable",
            Asset.is_active == True,  # noqa: E712
        )
        .order_by(Asset.name)
        .all()
    )
    return [
        EquipmentRateOut(
            asset_id=a.id,
            asset_number=a.asset_number,
            asset_name=a.name,
            category=a.category,
            hourly_operating_rate=a.hourly_operating_rate,
            rate_basis=a.rate_basis,
            current_hours=a.current_hours,
            status=a.status,
        )
        for a in assets
    ]


@router.put("/equipment-rates/{asset_id}", response_model=EquipmentRateOut)
def set_equipment_rate(
    asset_id: int,
    payload: EquipmentRateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Set or clear an asset's hourly operating rate.

    Clearing it (null) does not zero anything — it returns the asset to
    UNCOSTED, and tasks that used it report as understated rather than cheaper.

    Changing a rate does NOT restate past task costs. Those are snapshots, by
    the same decision that stops a pay rise repricing last season: a recompute
    on the task is the deliberate act that picks a new rate up. Unlike a
    consumable there is no per-use price ledger, so machinery cost is the one
    component a recompute genuinely re-derives.
    """
    _require_costs(current_user, "update")

    asset = (
        db.query(Asset)
        .filter(Asset.id == asset_id, Asset.company_id == current_user.company_id)
        .first()
    )
    if asset is None:
        raise HTTPException(status_code=404, detail="Equipment not found in your company")
    if asset.asset_type == "consumable":
        raise HTTPException(
            status_code=400,
            detail="A consumable is costed per unit used, not per hour. Set its cost per unit "
                   "on the asset instead.",
        )

    asset.hourly_operating_rate = payload.hourly_operating_rate
    asset.rate_basis = "manual" if payload.hourly_operating_rate is not None else None

    db.commit()
    db.refresh(asset)

    logger.info(
        f"Operating rate for asset {asset_id} set to {asset.hourly_operating_rate} "
        f"by user {current_user.id}"
    )
    return EquipmentRateOut(
        asset_id=asset.id,
        asset_number=asset.asset_number,
        asset_name=asset.name,
        category=asset.category,
        hourly_operating_rate=asset.hourly_operating_rate,
        rate_basis=asset.rate_basis,
        current_hours=asset.current_hours,
        status=asset.status,
    )
