
# app/services/timesheet_rules.py
from __future__ import annotations
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session, selectinload

from db.models.timesheet import TimesheetDay, TimeEntry  # adjust import to your project layout


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


def set_day_hours(session: Session, day_id: int, hours: Optional[Decimal]) -> TimesheetDay:
    day = (
        session.query(TimesheetDay)
        .options(selectinload(TimesheetDay.entries))
        .filter(TimesheetDay.id == day_id)
        .with_for_update()
        .one()
    )
    day.set_day_hours(hours)
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
    entry = TimeEntry(timesheet_day_id=timesheet_day_id, task_id=task_id)
    entry.set_hours(hours)
    session.add(entry)
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
    day_id = entry.timesheet_day_id
    session.delete(entry)
    session.flush()

    return recalc_day(session, day_id)
