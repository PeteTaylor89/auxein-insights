
# app/services/timesheet_rules.py
from __future__ import annotations
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session, selectinload

from db.models.timesheet import TimesheetDay, TimeEntry, TimesheetStatus, MAX_DAY_HOURS  # adjust import to your project layout


# --------- Editability ---------
#
# The one definition of when a day may be written to. It lived in three places
# and disagreed three ways (F6 in docs/Bugs/Current/TIMESHEET_WORKFLOW_2026-08-28.md):
# the backend allowed `submitted`, mobile did not, and web allowed `approved`
# but not `rejected` — the exact inverse of mobile.
#
# DRAFT AND REJECTED ONLY. Rejected is editable on purpose: it is the whole
# point of rejecting, and `submit_timesheet_day` accepts a rejected day back.
# Submitted is NOT, because a day that changes after submission is a day the
# manager approves without having seen it (F4).
#
# The client mirrors are packages/shared/src/utils/timesheetStatus.js and
# packages/mobile/src/utils/timesheetStatus.js. Change one, change all three.
DAY_EDITABLE_STATUSES = (TimesheetStatus.draft, TimesheetStatus.rejected)


def day_is_editable(day: TimesheetDay) -> bool:
    """True when the day's OWNER may still write to it."""
    return day.status in DAY_EDITABLE_STATUSES


def day_lock_reason(day: TimesheetDay) -> Optional[str]:
    """Why a write was refused, phrased for the person who attempted it.

    None when the day is editable, so it cannot be made to produce a sentence
    explaining a refusal that never happened. Mirrors `dayLockReason` in
    packages/shared/src/utils/timesheetStatus.js.
    """
    if day_is_editable(day):
        return None
    if day.status == TimesheetStatus.approved:
        return "Day is approved, not editable (ask a manager/admin to release)"
    if day.status == TimesheetStatus.submitted:
        return (
            "Day is submitted and waiting on approval, not editable "
            "(ask a manager to reject it back to you)"
        )
    return f"Day is {getattr(day.status, 'value', day.status)}, not editable"


def recalc_day(session: Session, day_id: int) -> TimesheetDay:
    """
    Load the TimesheetDay with entries, recompute aggregates, and persist.
    Useful to call after any entry or day_hours change if you don't wire events.
    """
    day = (
        session.query(TimesheetDay)
        .options(selectinload(TimesheetDay.entries))
        .filter(TimesheetDay.id == day_id)
        .with_for_update()
        .one()
    )
    day.recalc_hours()
    session.add(day)
    session.flush()
    return day


def set_day_hours(session: Session, day_id: int, hours: Optional[Decimal]):
    """Returns (day, warning). The warning is non-None when the requested total
    was below the hours already coded to tasks, in which case nothing was
    changed — see TimesheetDay.set_day_hours. Callers must surface it; dropping
    it puts us back to reporting success for a write that did not happen."""
    day = (
        session.query(TimesheetDay)
        .options(selectinload(TimesheetDay.entries))
        .filter(TimesheetDay.id == day_id)
        .with_for_update()
        .one()
    )
    warning = day.set_day_hours(hours)
    session.add(day)
    session.flush()
    return day, warning


def set_uncoded_hours(session: Session, day_id: int, hours: Optional[Decimal]) -> TimesheetDay:
    """Set the time not against any task. The day total follows from it."""
    day = (
        session.query(TimesheetDay)
        .options(selectinload(TimesheetDay.entries))
        .filter(TimesheetDay.id == day_id)
        .with_for_update()
        .one()
    )
    day.set_uncoded_hours(hours)
    session.add(day)
    session.flush()
    return day


def create_entry(session: Session, timesheet_day_id: int, task_id: Optional[int], hours: Decimal) -> TimeEntry:
    day = (
        session.query(TimesheetDay)
        .options(selectinload(TimesheetDay.entries))
        .filter(TimesheetDay.id == timesheet_day_id)
        .with_for_update()
        .one()
    )
    entry = TimeEntry(task_id=task_id)
    entry.set_hours(hours)

    # Check the caps BEFORE the row exists. The old order flushed the entry and
    # only then recalculated, so a recalc that raised left the entry committed
    # (complete_task catches and logs) while the day's totals kept their stale
    # values. Nothing can half-apply if the arithmetic is done first.
    projected = day.entry_hours_with(entry.hours)
    if projected > MAX_DAY_HOURS:
        raise ValueError(
            f"That would put {projected}h of task time on one day; the limit is {MAX_DAY_HOURS}h."
        )

    # APPEND TO THE RELATIONSHIP, do not just set the FK.
    #
    # This was the "my hours are listed but not in the total" bug. `day` is
    # loaded with selectinload(entries), so `day.entries` is materialised BEFORE
    # the new row exists. Constructing TimeEntry(timesheet_day_id=...) sets a raw
    # foreign key, which SQLAlchemy does not back-populate into that already
    # loaded collection — so `recalc_hours` summed the OLD set and the day total
    # lagged by exactly one entry, every time.
    #
    # It looked intermittent because the next request gets a fresh session: open
    # the entry and save it and `update_entry` re-queries, now sees the row, and
    # the total corrects itself. Hence "I have to go in and save it to make it
    # count". Appending keeps the in-memory collection and the FK in step.
    day.entries.append(entry)
    session.flush()  # allocate entry.id for downstream logs

    # Recalc day after entry change
    day.recalc_hours()
    session.add(day)
    session.flush()
    return entry


def update_entry(session: Session, entry_id: int, *, task_id: Optional[int] = None, hours: Optional[Decimal] = None) -> TimeEntry:
    entry = session.query(TimeEntry).filter(TimeEntry.id == entry_id).one()
    day = (
        session.query(TimesheetDay)
        .options(selectinload(TimesheetDay.entries))
        .filter(TimesheetDay.id == entry.timesheet_day_id)
        .with_for_update()
        .one()
    )

    if task_id is not None:
        entry.task_id = task_id
    if hours is not None:
        entry.set_hours(hours)

    session.add(entry)
    session.flush()

    day.recalc_hours()
    session.add(day)
    session.flush()
    return entry


def delete_entry(session: Session, entry_id: int) -> TimesheetDay:
    entry = session.query(TimeEntry).filter(TimeEntry.id == entry_id).one()
    day = (
        session.query(TimesheetDay)
        .options(selectinload(TimesheetDay.entries))
        .filter(TimesheetDay.id == entry.timesheet_day_id)
        .with_for_update()
        .one()
    )

    # Remove it from the loaded collection as well as deleting the row. The
    # mirror of the append above: `session.delete()` alone leaves the deleted
    # instance sitting in `day.entries`, so the recalculated total still counted
    # it, and the cascading `session.add(day)` then raised
    # "Instance <TimeEntry> has been deleted".
    if entry in day.entries:
        day.entries.remove(entry)
    session.delete(entry)
    session.flush()

    day.recalc_hours()
    session.add(day)
    session.flush()
    return day
