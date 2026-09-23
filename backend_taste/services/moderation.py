# backend_taste/services/moderation.py — hide, suspend, resolve (F4).
#
# Every action here writes a `moderation_log` row in the same transaction as the
# change it describes. That is the whole discipline: an action without a record
# is indistinguishable, a month later, from a bug — and the person most likely
# to need the record is the moderator who took the action.
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from db.models import SHAREABLE_MODELS, ModerationLog, Report, User

# What can be hidden: exactly the rows that can be shared. Anything not in here
# is either reference data (regions, wine_ref) or not reachable by another user.
HIDEABLE = SHAREABLE_MODELS


def _now() -> datetime:
    return datetime.now(timezone.utc)


def record(db: Session, action: str, subject_type: str, subject_id: str, actor: User,
           *, reason: Optional[str] = None, report_id: Optional[int] = None,
           detail: Optional[dict] = None) -> ModerationLog:
    entry = ModerationLog(
        action=action, subject_type=subject_type, subject_id=str(subject_id),
        actor_id=actor.id, reason=reason, report_id=report_id, detail=detail,
    )
    db.add(entry)
    return entry


def load_subject(db: Session, subject_type: str, subject_id: str):
    """Resolve a report's subject to a row, or None. Users included."""
    if subject_type == "user":
        try:
            return db.query(User).filter(User.id == int(subject_id)).first()
        except (TypeError, ValueError):
            return None
    model = HIDEABLE.get(subject_type)
    if model is None:
        return None
    return db.query(model).filter(model.id == subject_id).first()


def hide(db: Session, subject_type: str, subject_id: str, actor: User,
         reason: str, report_id: Optional[int] = None) -> None:
    """Hide a row from everyone except its owner and moderators.

    Not a delete, and not a visibility change. The owner keeps seeing their own
    row together with the reason, because content that vanishes without
    explanation reads as a broken product rather than a decision — and a person
    who cannot see what was actioned cannot appeal it or learn from it.

    `visibility` is left exactly as it was, so unhiding restores what the owner
    chose rather than silently making a public row private.
    """
    model = HIDEABLE.get(subject_type)
    if model is None:
        raise ValueError(f"'{subject_type}' cannot be hidden")
    row = db.query(model).filter(model.id == subject_id).first()
    if row is None:
        raise ValueError("Not found")
    if row.hidden_at is not None:
        raise ValueError("Already hidden")

    row.hidden_at = _now()
    row.hidden_reason = reason
    record(db, "hide", subject_type, subject_id, actor, reason=reason, report_id=report_id,
           detail={"owner_id": row.user_id, "visibility": row.visibility})


def unhide(db: Session, subject_type: str, subject_id: str, actor: User,
           reason: Optional[str] = None) -> None:
    model = HIDEABLE.get(subject_type)
    if model is None:
        raise ValueError(f"'{subject_type}' cannot be hidden")
    row = db.query(model).filter(model.id == subject_id).first()
    if row is None:
        raise ValueError("Not found")
    if row.hidden_at is None:
        raise ValueError("Not hidden")

    row.hidden_at = None
    row.hidden_reason = None
    record(db, "unhide", subject_type, subject_id, actor, reason=reason)


def suspend(db: Session, target: User, actor: User, reason: str,
            report_id: Optional[int] = None) -> None:
    """Suspend an account. Takes effect on the target's NEXT REQUEST.

    Two things together do that: `status` is checked on every authenticated
    request, and `token_version` is bumped so tokens already issued stop
    validating. Without the bump a suspended user keeps working until their
    access token expires, which is exactly the window in which someone who has
    just been suspended is most motivated to act.
    """
    if target.id == actor.id:
        raise ValueError("You cannot suspend yourself")
    if target.role in ("admin",) and actor.role != "admin":
        raise ValueError("A moderator cannot suspend an admin")
    if target.status == "suspended":
        raise ValueError("Already suspended")

    target.status = "suspended"
    target.token_version = (target.token_version or 1) + 1
    record(db, "suspend", "user", str(target.id), actor, reason=reason, report_id=report_id,
           detail={"handle": target.handle})


def unsuspend(db: Session, target: User, actor: User, reason: Optional[str] = None) -> None:
    if target.status != "suspended":
        raise ValueError("Not suspended")
    target.status = "active"
    # token_version is NOT rolled back. It only ever moves forward; the user
    # signs in again, which is the correct amount of friction for an account
    # that was just reinstated.
    record(db, "unsuspend", "user", str(target.id), actor, reason=reason)


def resolve_report(db: Session, report: Report, actor: User, *, state: str,
                   note: Optional[str] = None) -> None:
    if report.state != "open":
        raise ValueError("Report is already %s" % report.state)
    if state not in ("actioned", "dismissed"):
        raise ValueError("state must be 'actioned' or 'dismissed'")

    report.state = state
    report.reviewed_by = actor.id
    report.reviewed_at = _now()
    report.review_note = note

    if state == "dismissed":
        # Logged even though nothing changed: a pattern of one account reporting
        # another is a thing a moderator needs to be able to see, and it is
        # invisible if dismissals leave no trace.
        record(db, "dismiss", report.subject_type, report.subject_id, actor,
               reason=note, report_id=report.id)
