# api/v1/site_attendance.py — signing on and off a property.
#
# The point of this module is oversight of who is on site, and the only way it
# works is if people actually use it. So the whole design is bent toward one
# thing: **signing on must be one tap.** Everything else follows from that.
#
#   * `/status` returns the current attendance AND the property list in ONE
#     call, with the person's most recent property first. A gateway with one bar
#     of signal is where this gets used.
#   * Signing on is idempotent at the same property — a double tap or an offline
#     replay returns the existing record instead of failing.
#   * GPS is optional. A sign-on that fails because a fix was slow under canopy
#     is a sign-on that did not happen.
#   * Signing off does not need a property: there is only one thing to close.
#
# The one thing NOT bent for convenience is being on two properties at once.
# That is refused, because the headcount it would corrupt is the number read out
# during an evacuation.
import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from api.deps import get_db, get_current_user, require_company_user_permission
from db.models.user import User
from db.models.property import Property
from db.models.site_attendance import SiteAttendance
from schemas.site_attendance import (
    SignInRequest, SignOutRequest, AttendanceOut, AttendanceStatus,
    PropertyOption, OnSiteSummary, OnSitePropertyRow,
)
from services.property_service import get_visible_property_ids

logger = logging.getLogger(__name__)

router = APIRouter()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _minutes(row: SiteAttendance) -> Optional[int]:
    start = row.signed_in_at
    if start is None:
        return None
    end = row.signed_out_at or _now()
    # Rows written before timezone awareness was consistent can be naive; treat
    # them as UTC rather than crashing the whole list on one bad row.
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    return max(0, int((end - start).total_seconds() // 60))


def _out(row: SiteAttendance, property_names: dict = None) -> AttendanceOut:
    names = property_names or {}
    user = row.user
    full = None
    if user is not None:
        full = f"{user.first_name or ''} {user.last_name or ''}".strip() or user.email
    return AttendanceOut(
        id=row.id,
        user_id=row.user_id,
        user_name=full,
        property_id=row.property_id,
        property_name=names.get(row.property_id),
        signed_in_at=row.signed_in_at,
        signed_out_at=row.signed_out_at,
        on_site=row.signed_out_at is None,
        minutes=_minutes(row),
        notes=row.notes,
        sign_out_reason=row.sign_out_reason,
    )


def _open_attendance(db: Session, user_id: int) -> Optional[SiteAttendance]:
    return (
        db.query(SiteAttendance)
        .options(joinedload(SiteAttendance.user))
        .filter(SiteAttendance.user_id == user_id,
                SiteAttendance.signed_out_at.is_(None))
        .first()
    )


def _property_names(db: Session, ids) -> dict:
    if not ids:
        return {}
    return {
        p.id: (p.name or f"Property {p.id}")
        for p in db.query(Property).filter(Property.id.in_(list(ids))).all()
    }


def _signable_property_ids(db: Session, user: User) -> List[int]:
    """Properties this person may sign on to.

    Straight from `get_visible_property_ids`, with NO extra company filter.

    **A Property has no `company_id`.** It carries a nullable
    `owner_company_id`, and a company usually reaches a property through an
    active ManagementRelationship instead — so `Property.company_id` is not a
    column and filtering on it does not merely return the wrong rows, it fails.
    That service already resolves owned + managed, applies UserPropertyScope
    where it exists, and falls back to everything the company can see when it
    does not. Adding a second opinion here can only disagree with it.

    An empty list therefore means genuinely nothing to sign on to, and the
    caller must say so rather than showing every property in the database.
    """
    return get_visible_property_ids(db, user)


@router.get("/status", response_model=AttendanceStatus)
def attendance_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Everything the sign-on screen needs, in one request.

    Returns the open attendance if there is one, and the properties this person
    can sign on to — **most recently used first**, which is what makes the
    common case a single tap.
    """
    open_row = _open_attendance(db, current_user.id)
    ids = _signable_property_ids(db, current_user)
    names = _property_names(db, ids)

    # Their own last few sign-ons decide the order. One query, not one per
    # property.
    recent = [
        r[0] for r in db.query(SiteAttendance.property_id)
        .filter(SiteAttendance.user_id == current_user.id)
        .order_by(SiteAttendance.signed_in_at.desc())
        .limit(10).all()
    ]
    most_recent = recent[0] if recent else None

    counts = dict(
        db.query(SiteAttendance.property_id, func.count(SiteAttendance.id))
        .filter(SiteAttendance.company_id == current_user.company_id,
                SiteAttendance.signed_out_at.is_(None))
        .group_by(SiteAttendance.property_id).all()
    )

    options = [
        PropertyOption(
            id=pid,
            name=names.get(pid, f"Property {pid}"),
            on_site_count=counts.get(pid, 0),
            is_recent=(pid == most_recent),
        )
        for pid in ids
    ]
    # Most recent first, then the busiest, then by name — so the top of the list
    # is almost always the right answer.
    options.sort(key=lambda o: (not o.is_recent, -o.on_site_count, o.name.lower()))

    return AttendanceStatus(
        current=_out(open_row, names) if open_row else None,
        properties=options,
    )


@router.post("/sign-in", response_model=AttendanceOut, status_code=status.HTTP_201_CREATED)
def sign_in(
    payload: SignInRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_company_user_permission("site_attendance", "create")),
):
    """Sign yourself on to a property.

    **Idempotent at the same property.** A double tap, a retry on a bad
    connection, or an offline replay returns the record that already exists
    rather than failing — the alternative is a person tapping again because
    nothing happened and ending up signed on twice.

    Signing on while already on a DIFFERENT property is refused with a 409
    unless `switch` is set, so a client has to show where they were before
    moving them. That refusal is also enforced by a partial unique index, so it
    holds even if two requests race.

    You can only ever sign yourself on. There is no user_id in the payload.
    """
    # Scope first, existence second: answering 404 for a property that exists
    # but belongs to someone else tells the caller it exists.
    allowed = _signable_property_ids(db, current_user)
    if payload.property_id not in allowed:
        raise HTTPException(
            status_code=403,
            detail="That property is not one you can sign on to",
        )
    prop = db.query(Property).filter(Property.id == payload.property_id).first()
    if prop is None:
        raise HTTPException(status_code=404, detail="Property not found")

    existing = _open_attendance(db, current_user.id)
    names = _property_names(db, {payload.property_id} | (
        {existing.property_id} if existing else set()))

    if existing is not None:
        if existing.property_id == payload.property_id:
            return _out(existing, names)
        if not payload.switch:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"You are already signed on at "
                    f"{names.get(existing.property_id, 'another property')}. "
                    f"Sign out there first, or confirm the move."
                ),
            )
        # An explicit switch: close the old one with a reason, so a shift that
        # ended because someone drove to another block is tellable from one they
        # signed off themselves.
        existing.signed_out_at = _now()
        existing.signed_out_by_id = current_user.id
        existing.sign_out_reason = "auto_switch"
        db.add(existing)
        db.flush()

    row = SiteAttendance(
        company_id=current_user.company_id,
        user_id=current_user.id,
        property_id=payload.property_id,
        signed_in_at=_now(),
        sign_in_latitude=payload.latitude,
        sign_in_longitude=payload.longitude,
        notes=payload.notes,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    logger.info(
        f"User {current_user.id} signed on to property {payload.property_id}"
        f"{' (switched)' if existing else ''}"
    )
    return _out(row, names)


@router.post("/sign-out", response_model=AttendanceOut)
def sign_out(
    payload: SignOutRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_company_user_permission("site_attendance", "create")),
):
    """Sign yourself off. No property needed — there is only one thing to close.

    Returns 409 rather than 404 when there is nothing open: "you are not signed
    in" is a state the screen has to render, not a missing resource.
    """
    row = _open_attendance(db, current_user.id)
    if row is None:
        raise HTTPException(status_code=409, detail="You are not signed on anywhere")

    row.signed_out_at = _now()
    row.sign_out_latitude = payload.latitude
    row.sign_out_longitude = payload.longitude
    row.signed_out_by_id = current_user.id
    row.sign_out_reason = "self"
    if payload.notes:
        row.notes = f"{row.notes}\n{payload.notes}" if row.notes else payload.notes
    db.add(row)
    db.commit()
    db.refresh(row)
    logger.info(f"User {current_user.id} signed off property {row.property_id}")
    return _out(row, _property_names(db, {row.property_id}))


@router.post("/{attendance_id}/sign-out", response_model=AttendanceOut)
def sign_out_someone(
    attendance_id: int,
    payload: SignOutRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_company_user_permission("site_attendance", "update")),
):
    """Close somebody else's attendance. Managers and admins only.

    The self-service `/sign-out` above covers the normal case. This exists
    because the one thing an open attendance is read for is a headcount, and
    people forget: someone drives home still signed on and stays on the
    evacuation list until a manager can close it. Without this the site-access
    report's `never_signed_out` only ever grows.

    Recorded as `sign_out_reason='manager'` with `signed_out_by_id` set, so the
    register distinguishes a person who signed themselves off from one who was
    signed off for them. No GPS is stored — the manager's location is not
    evidence of where that person was.
    """
    row = db.query(SiteAttendance).filter(
        SiteAttendance.id == attendance_id,
        SiteAttendance.company_id == current_user.company_id,
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Attendance not found")
    if row.signed_out_at is not None:
        raise HTTPException(status_code=409, detail="Already signed off")

    visible = _signable_property_ids(db, current_user)
    if row.property_id not in visible:
        raise HTTPException(status_code=403, detail="That property is not in your scope")

    row.signed_out_at = _now()
    row.signed_out_by_id = current_user.id
    row.sign_out_reason = "manager"
    if payload.notes:
        row.notes = f"{row.notes}\n{payload.notes}" if row.notes else payload.notes
    db.add(row)
    db.commit()
    db.refresh(row)
    logger.info(
        f"User {current_user.id} signed off attendance {row.id} "
        f"(user {row.user_id}, property {row.property_id})"
    )
    return _out(row, _property_names(db, {row.property_id}))


@router.get("/on-site", response_model=OnSiteSummary)
def who_is_on_site(
    property_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_company_user_permission("site_attendance", "read")),
):
    """Who is on site right now. The number that matters in an evacuation."""
    visible = _signable_property_ids(db, current_user)
    q = (
        db.query(SiteAttendance)
        .options(joinedload(SiteAttendance.user))
        .filter(SiteAttendance.company_id == current_user.company_id,
                SiteAttendance.signed_out_at.is_(None))
    )
    if property_id is not None:
        if property_id not in visible:
            raise HTTPException(status_code=403, detail="That property is not in your scope")
        q = q.filter(SiteAttendance.property_id == property_id)
    elif visible:
        q = q.filter(SiteAttendance.property_id.in_(visible))

    rows = q.order_by(SiteAttendance.signed_in_at.asc()).all()
    names = _property_names(db, {r.property_id for r in rows})

    by_property: dict = {}
    for r in rows:
        by_property[r.property_id] = by_property.get(r.property_id, 0) + 1

    return OnSiteSummary(
        total=len(rows),
        by_property=[
            OnSitePropertyRow(property_id=pid, property_name=names.get(pid), count=n)
            for pid, n in sorted(by_property.items(), key=lambda kv: -kv[1])
        ],
        people=[_out(r, names) for r in rows],
    )


@router.get("/me", response_model=List[AttendanceOut])
def my_attendance(
    limit: int = Query(30, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Your own recent sign-ons, newest first."""
    rows = (
        db.query(SiteAttendance)
        .options(joinedload(SiteAttendance.user))
        .filter(SiteAttendance.user_id == current_user.id)
        .order_by(SiteAttendance.signed_in_at.desc())
        .limit(limit).all()
    )
    return [_out(r, _property_names(db, {r.property_id for r in rows})) for r in rows]
