# backend_taste/api/moderation.py — reporting and the moderation queue (F4).
#
# Mounted at /taste/v1. One route is open to any signed-in user (report
# something); everything else is moderator-only.
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import schemas as s
from core import ratelimit
from core.auth import get_current_user, require_admin
from db.base import get_db
from db.models import ModerationLog, Report, User
from services import moderation

router = APIRouter()

# Filing a report costs the reporter nothing and costs a moderator attention, so
# it is limited. Generous enough that nobody reporting in good faith notices.
REPORT_LIMIT = 10
REPORT_WINDOW = timedelta(hours=1)

# Mirrors the CHECK constraints on taste.report. Validated HERE as well, because
# letting the database reject it surfaces as a 500 from a constraint violation —
# an unhandled error where the honest answer is "that is not one of the reasons".
VALID_REASONS = ("spam", "abuse", "wrong_data", "copyright", "other")
VALID_SUBJECT_TYPES = (
    "note", "flight", "event", "wine", "template", "map_layer",
    "knowledge_entry", "user",
)


def _report_or_404(db: Session, report_id: int) -> Report:
    row = db.query(Report).filter(Report.id == report_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    return row


def _user_or_404(db: Session, user_id: int) -> User:
    row = db.query(User).filter(User.id == user_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    return row


# ---------------------------------------------------------------- any user
@router.post("/reports", response_model=s.ReportOut, status_code=201)
def create_report(
    body: s.ReportCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Report a row or an account.

    Deliberately does NOT check that the reporter can see the subject. A link
    shared outside the app, a public page, a screenshot — there are legitimate
    ways to encounter something reportable without holding a grant on it, and an
    access check here would reject exactly the reports most worth having.

    It does check the subject EXISTS, so the queue is not filled with reports
    about nothing.
    """
    if body.reason not in VALID_REASONS:
        raise HTTPException(status_code=422, detail=f"reason must be one of {VALID_REASONS}")
    if body.subject_type not in VALID_SUBJECT_TYPES:
        raise HTTPException(status_code=422, detail=f"subject_type must be one of {VALID_SUBJECT_TYPES}")

    # Counted after validation, so a malformed request does not spend the
    # reporter's budget for the hour.
    if not ratelimit.hit(f"report:{user.id}", limit=REPORT_LIMIT, window=REPORT_WINDOW):
        raise HTTPException(status_code=429, detail="Too many reports. Try again later.")

    subject = moderation.load_subject(db, body.subject_type, body.subject_id)
    if subject is None:
        raise HTTPException(status_code=404, detail="Not found")

    if body.subject_type == "user" and str(user.id) == str(body.subject_id):
        raise HTTPException(status_code=422, detail="You cannot report yourself")

    existing = (
        db.query(Report)
        .filter(
            Report.subject_type == body.subject_type,
            Report.subject_id == str(body.subject_id),
            Report.reported_by == user.id,
            Report.state == "open",
        )
        .first()
    )
    if existing is not None:
        # Not an error. The reporter wanted this looked at; it is already in the
        # queue, and telling them so is friendlier than a 409 they cannot act on.
        return existing

    report = Report(
        subject_type=body.subject_type,
        subject_id=str(body.subject_id),
        reported_by=user.id,
        reason=body.reason,
        detail=body.detail,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


@router.get("/reports/mine", response_model=list[s.ReportOut])
def my_reports(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    limit: int = Query(50, le=200),
):
    """What I have reported, and what came of it."""
    return (
        db.query(Report)
        .filter(Report.reported_by == user.id)
        .order_by(Report.created_at.desc())
        .limit(limit)
        .all()
    )


# ---------------------------------------------------------------- moderator
@router.get("/reports", response_model=list[s.ReportOut])
def list_reports(
    state: Optional[str] = "open",
    subject_type: Optional[str] = None,
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin),
    limit: int = Query(100, le=500),
):
    q = db.query(Report)
    if state:
        q = q.filter(Report.state == state)
    if subject_type:
        q = q.filter(Report.subject_type == subject_type)
    return q.order_by(Report.created_at.asc()).limit(limit).all()


@router.get("/reports/{report_id}/subject")
def report_subject(
    report_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin),
):
    """What is being complained about, plus how often.

    A moderator has to see the content to judge it, and this is the one place
    that deliberately bypasses `resolve_access` — reviewing a private row is the
    job. It is also why every read of it lands in the log.
    """
    report = _report_or_404(db, report_id)
    subject = moderation.load_subject(db, report.subject_type, report.subject_id)
    if subject is None:
        raise HTTPException(status_code=404, detail="Subject no longer exists")

    open_reports = (
        db.query(Report)
        .filter(
            Report.subject_type == report.subject_type,
            Report.subject_id == report.subject_id,
        )
        .count()
    )

    if report.subject_type == "user":
        payload = {
            "id": subject.id, "handle": subject.handle, "display_name": subject.display_name,
            "status": subject.status, "role": subject.role, "created_at": subject.created_at,
        }
    else:
        payload = {
            "id": subject.id, "owner_id": subject.user_id, "visibility": subject.visibility,
            "hidden_at": subject.hidden_at, "deleted": subject.deleted,
            # Enough to judge, not the whole row: a moderator does not need
            # every tasting value to decide whether a label is abusive.
            "summary": {
                k: getattr(subject, k, None)
                for k in ("name", "producer", "label", "general_notes")
                if getattr(subject, k, None)
            },
        }
    return {"report_id": report.id, "subject_type": report.subject_type,
            "reports_total": open_reports, "subject": payload}


@router.post("/reports/{report_id}/resolve", status_code=204)
def resolve_report(
    report_id: int,
    body: s.ResolveReport,
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin),
):
    report = _report_or_404(db, report_id)
    try:
        moderation.resolve_report(db, report, actor, state=body.state, note=body.note)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    db.commit()


@router.post("/moderation/hide", status_code=204)
def hide_content(
    body: s.HideRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin),
):
    try:
        moderation.hide(db, body.subject_type, body.subject_id, actor, body.reason, body.report_id)
    except ValueError as exc:
        code = 404 if str(exc) == "Not found" else 409
        raise HTTPException(status_code=code, detail=str(exc))
    db.commit()


@router.post("/moderation/unhide", status_code=204)
def unhide_content(
    body: s.UnhideRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin),
):
    try:
        moderation.unhide(db, body.subject_type, body.subject_id, actor, body.reason)
    except ValueError as exc:
        code = 404 if str(exc) == "Not found" else 409
        raise HTTPException(status_code=code, detail=str(exc))
    db.commit()


@router.post("/moderation/users/{user_id}/suspend", status_code=204)
def suspend_user(
    user_id: int,
    body: s.SuspendRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin),
):
    target = _user_or_404(db, user_id)
    try:
        moderation.suspend(db, target, actor, body.reason, body.report_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    db.commit()


@router.post("/moderation/users/{user_id}/unsuspend", status_code=204)
def unsuspend_user(
    user_id: int,
    body: s.UnhideRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin),
):
    target = _user_or_404(db, user_id)
    try:
        moderation.unsuspend(db, target, actor, body.reason)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    db.commit()


@router.get("/moderation/log", response_model=list[s.ModerationLogOut])
def read_log(
    subject_type: Optional[str] = None,
    subject_id: Optional[str] = None,
    actor_id: Optional[int] = None,
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin),
    limit: int = Query(100, le=500),
):
    """The append-only record. Filterable by subject or by who acted.

    Filtering by actor is the point of keeping `actor_id`: reviewing a
    moderator's own decisions is a thing that has to be possible without
    reading every row.
    """
    q = db.query(ModerationLog)
    if subject_type:
        q = q.filter(ModerationLog.subject_type == subject_type)
    if subject_id:
        q = q.filter(ModerationLog.subject_id == str(subject_id))
    if actor_id:
        q = q.filter(ModerationLog.actor_id == actor_id)
    return q.order_by(ModerationLog.created_at.desc()).limit(limit).all()
