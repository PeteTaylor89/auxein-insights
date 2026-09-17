# api/v1/admin_planner.py — the admin's personal task planner.
#
# Every route is scoped to the CALLING admin. `owner_user_id` is taken from the
# token on every read and every write and is never accepted from the client, so
# one admin cannot see or touch another's tasks even by guessing an id. That
# matters more here than it looks: `require_admin` is a single flag, so every
# admin would otherwise be able to read every other admin's notes.
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, func, delete
from sqlalchemy.orm import Session, selectinload

from db.session import get_db
from db.models.admin_task import AdminTask, AdminTaskSubtask, URGENCIES, STATUSES
from db.models.admin_project import (
    AdminProject, AdminProjectNote, AdminTimeEntry, PROJECT_STATUSES,
)
from db.models.public_user import PublicUser
from core.admin_security import require_admin

router = APIRouter()


# ---------------------------------------------------------------- serialising

def _subtask_out(s: AdminTaskSubtask) -> dict:
    return {"id": s.id, "title": s.title, "done": s.done, "position": s.position}


def _task_out(t: AdminTask) -> dict:
    return {
        "id": t.id,
        "title": t.title,
        "notes": t.notes,
        "client": t.client,
        "urgency": t.urgency,
        "status": t.status,
        # ISO date, no time part and no zone. The client renders it in a
        # calendar cell; giving it a timestamp would invite a local-time
        # conversion that shifts the task into the wrong day.
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
        "project_id": t.project_id,
        "position": t.position,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
        "subtasks": [_subtask_out(s) for s in t.subtasks],
        "subtask_counts": {
            "done": sum(1 for s in t.subtasks if s.done),
            "total": len(t.subtasks),
        },
    }


# -------------------------------------------------------------------- payloads

class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    notes: Optional[str] = None
    client: Optional[str] = Field(None, max_length=200)
    project_id: Optional[int] = None
    urgency: str = "normal"
    status: str = "todo"
    due_date: Optional[date] = None
    position: int = 0

    @field_validator("urgency")
    @classmethod
    def _urgency(cls, v):
        if v not in URGENCIES:
            raise ValueError(f"urgency must be one of {', '.join(URGENCIES)}")
        return v

    @field_validator("status")
    @classmethod
    def _status(cls, v):
        if v not in STATUSES:
            raise ValueError(f"status must be one of {', '.join(STATUSES)}")
        return v

    @field_validator("client")
    @classmethod
    def _client(cls, v):
        # Trimmed, and empty becomes NULL. Otherwise the autocomplete fills up
        # with '' and 'Acme ' as if they were distinct clients.
        v = (v or "").strip()
        return v or None


class TaskUpdate(BaseModel):
    """Every field optional — a PATCH. Unset fields are left alone.

    `notes`, `client` and `due_date` are all nullable, so "clear this field" and
    "do not touch this field" are genuinely different requests. Pydantic cannot
    tell them apart from the parsed model alone, so the handler consults
    `model_fields_set` rather than testing for None.
    """
    title: Optional[str] = Field(None, min_length=1, max_length=300)
    notes: Optional[str] = None
    client: Optional[str] = Field(None, max_length=200)
    project_id: Optional[int] = None
    urgency: Optional[str] = None
    status: Optional[str] = None
    due_date: Optional[date] = None
    position: Optional[int] = None

    @field_validator("urgency")
    @classmethod
    def _urgency(cls, v):
        if v is not None and v not in URGENCIES:
            raise ValueError(f"urgency must be one of {', '.join(URGENCIES)}")
        return v

    @field_validator("status")
    @classmethod
    def _status(cls, v):
        if v is not None and v not in STATUSES:
            raise ValueError(f"status must be one of {', '.join(STATUSES)}")
        return v

    @field_validator("client")
    @classmethod
    def _client(cls, v):
        if v is None:
            return None
        v = v.strip()
        return v or None


class SubtaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    position: int = 0


class SubtaskUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=300)
    done: Optional[bool] = None
    position: Optional[int] = None


class ReorderPayload(BaseModel):
    """Ids in their new order. Position becomes the index."""
    ids: list[int]


# --------------------------------------------------------------------- helpers

def _owned(db: Session, task_id: int, admin: PublicUser) -> AdminTask:
    """One task belonging to the caller, or 404.

    404 and not 403 when it belongs to someone else: a 403 would confirm the id
    exists, which is a small leak but a free one to avoid.
    """
    task = db.execute(
        select(AdminTask)
        .options(selectinload(AdminTask.subtasks))
        .where(AdminTask.id == task_id, AdminTask.owner_user_id == admin.id)
    ).scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


# ---------------------------------------------------------------------- routes

@router.get("/planner/tasks")
def list_tasks(
    start: Optional[date] = Query(None, description="Earliest due date, inclusive."),
    end: Optional[date] = Query(None, description="Latest due date, inclusive."),
    include_undated: bool = Query(True, description="Include tasks with no due date."),
    include_done: bool = Query(True, description="Include completed tasks."),
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    """The caller's tasks, optionally windowed to a due-date range.

    The calendar asks for one month at a time. Undated tasks are returned
    alongside by default rather than being invisible until a date is set —
    a task with no deadline is the easiest kind to lose.
    """
    stmt = (
        select(AdminTask)
        .options(selectinload(AdminTask.subtasks))
        .where(AdminTask.owner_user_id == admin.id)
    )

    if start is not None or end is not None:
        dated = AdminTask.due_date.is_not(None)
        if start is not None:
            dated = dated & (AdminTask.due_date >= start)
        if end is not None:
            dated = dated & (AdminTask.due_date <= end)
        stmt = stmt.where(dated | AdminTask.due_date.is_(None)) if include_undated \
            else stmt.where(dated)
    elif not include_undated:
        stmt = stmt.where(AdminTask.due_date.is_not(None))

    if not include_done:
        stmt = stmt.where(AdminTask.status != "done")

    # Undated last, then by day, then by the manual order within the day.
    stmt = stmt.order_by(
        AdminTask.due_date.is_(None),
        AdminTask.due_date,
        AdminTask.position,
        AdminTask.id,
    )

    tasks = db.execute(stmt).scalars().all()
    return {"tasks": [_task_out(t) for t in tasks]}


@router.get("/planner/clients")
def list_clients(
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    """Distinct client names this admin has used, most-used first.

    Backs the free-text field's autocomplete: the consistency of a picklist
    without preventing a name that has never been used before.

    Drawn from tasks AND projects, so a client typed on one is offered on the
    other. Two separate lists would drift into 'Acme' and 'Acme Ltd' within a
    week, which is exactly what the autocomplete exists to prevent.
    """
    task_rows = db.execute(
        select(AdminTask.client, func.count())
        .where(AdminTask.owner_user_id == admin.id, AdminTask.client.is_not(None))
        .group_by(AdminTask.client)
    ).all()
    project_rows = db.execute(
        select(AdminProject.client, func.count())
        .where(AdminProject.owner_user_id == admin.id, AdminProject.client.is_not(None))
        .group_by(AdminProject.client)
    ).all()

    tally = {}
    for name, n in list(task_rows) + list(project_rows):
        tally[name] = tally.get(name, 0) + int(n)

    ordered = sorted(tally.items(), key=lambda kv: (-kv[1], kv[0].lower()))
    return {"clients": [{"name": name, "count": n} for name, n in ordered]}


@router.post("/planner/tasks", status_code=201)
def create_task(
    payload: TaskCreate,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    task = AdminTask(
        owner_user_id=admin.id,
        title=payload.title.strip(),
        notes=payload.notes,
        client=payload.client,
        project_id=payload.project_id,
        urgency=payload.urgency,
        status=payload.status,
        due_date=payload.due_date,
        position=payload.position,
        completed_at=datetime.now(timezone.utc) if payload.status == "done" else None,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return _task_out(task)


@router.get("/planner/tasks/{task_id}")
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    return _task_out(_owned(db, task_id, admin))


@router.patch("/planner/tasks/{task_id}")
def update_task(
    task_id: int,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    task = _owned(db, task_id, admin)
    sent = payload.model_fields_set

    if "title" in sent and payload.title is not None:
        task.title = payload.title.strip()
    for field in ("notes", "client", "due_date", "position", "urgency", "project_id"):
        if field in sent:
            value = getattr(payload, field)
            # position and urgency are not nullable; ignore an explicit null
            # rather than writing one and tripping the constraint.
            if value is None and field in ("position", "urgency"):
                continue
            setattr(task, field, value)

    if "status" in sent and payload.status is not None:
        # completed_at follows status, in both directions. Reopening a task
        # clears it, so the column never claims a completion that was undone.
        if payload.status == "done" and task.status != "done":
            task.completed_at = datetime.now(timezone.utc)
        elif payload.status != "done":
            task.completed_at = None
        task.status = payload.status

    db.commit()
    db.refresh(task)
    return _task_out(task)


@router.delete("/planner/tasks/{task_id}", status_code=204)
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    task = _owned(db, task_id, admin)
    # Subtasks go with it — ON DELETE CASCADE in the schema and
    # delete-orphan on the relationship, so neither layer leaves strays.
    db.delete(task)
    db.commit()
    return None


@router.post("/planner/tasks/reorder")
def reorder_tasks(
    payload: ReorderPayload,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    """Set `position` from the given order.

    Filtered to the caller's own ids, so a foreign id in the list is ignored
    rather than reordering someone else's task.
    """
    owned = {
        r[0] for r in db.execute(
            select(AdminTask.id).where(
                AdminTask.id.in_(payload.ids), AdminTask.owner_user_id == admin.id
            )
        ).all()
    }
    for index, task_id in enumerate(payload.ids):
        if task_id in owned:
            db.execute(
                AdminTask.__table__.update()
                .where(AdminTask.id == task_id)
                .values(position=index)
            )
    db.commit()
    return {"reordered": len(owned)}


@router.post("/planner/tasks/{task_id}/subtasks", status_code=201)
def create_subtask(
    task_id: int,
    payload: SubtaskCreate,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    task = _owned(db, task_id, admin)
    sub = AdminTaskSubtask(
        task_id=task.id, title=payload.title.strip(), position=payload.position
    )
    db.add(sub)
    db.commit()
    db.refresh(task)
    return _task_out(task)


@router.patch("/planner/tasks/{task_id}/subtasks/{subtask_id}")
def update_subtask(
    task_id: int,
    subtask_id: int,
    payload: SubtaskUpdate,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    # Ownership is checked on the PARENT, then the subtask is matched on both
    # ids. Matching on subtask_id alone would let any admin edit any subtask.
    task = _owned(db, task_id, admin)
    sub = next((s for s in task.subtasks if s.id == subtask_id), None)
    if sub is None:
        raise HTTPException(status_code=404, detail="Subtask not found")

    sent = payload.model_fields_set
    if "title" in sent and payload.title is not None:
        sub.title = payload.title.strip()
    if "done" in sent and payload.done is not None:
        sub.done = payload.done
    if "position" in sent and payload.position is not None:
        sub.position = payload.position

    db.commit()
    db.refresh(task)
    return _task_out(task)


@router.delete("/planner/tasks/{task_id}/subtasks/{subtask_id}", status_code=204)
def delete_subtask(
    task_id: int,
    subtask_id: int,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    task = _owned(db, task_id, admin)
    if not any(s.id == subtask_id for s in task.subtasks):
        raise HTTPException(status_code=404, detail="Subtask not found")
    db.execute(delete(AdminTaskSubtask).where(AdminTaskSubtask.id == subtask_id))
    db.commit()
    return None


# =============================================================== projects
#
# A task is a thing to do; a project is what the doing is FOR. Time entries
# join them, so "hours towards this outcome" is answerable instead of guessed.


def _project_out(p: AdminProject, minutes: int = 0, task_counts: dict = None) -> dict:
    target = float(p.target_hours) if p.target_hours is not None else None
    hours = round(minutes / 60.0, 2)
    return {
        "id": p.id,
        "name": p.name,
        "client": p.client,
        "status": p.status,
        "description": p.description,
        "colour": p.colour,
        "target_hours": target,
        "started_on": p.started_on.isoformat() if p.started_on else None,
        "due_on": p.due_on.isoformat() if p.due_on else None,
        "logged_minutes": minutes,
        "logged_hours": hours,
        # None rather than 0 when there is no target: a project without a
        # budget is not a project that is 0% through one.
        "pct_of_target": round(hours / target * 100, 1) if target else None,
        "over_target": bool(target and hours > target),
        "task_counts": task_counts or {"open": 0, "done": 0},
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


def _note_out(n: AdminProjectNote) -> dict:
    return {
        "id": n.id,
        "body": n.body,
        "created_at": n.created_at.isoformat() if n.created_at else None,
        "updated_at": n.updated_at.isoformat() if n.updated_at else None,
    }


def _time_out(e: AdminTimeEntry) -> dict:
    return {
        "id": e.id,
        "project_id": e.project_id,
        "task_id": e.task_id,
        "spent_on": e.spent_on.isoformat(),
        "minutes": e.minutes,
        "hours": round(e.minutes / 60.0, 2),
        "note": e.note,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    client: Optional[str] = Field(None, max_length=200)
    status: str = "active"
    description: Optional[str] = None
    colour: Optional[str] = Field(None, max_length=20)
    target_hours: Optional[float] = Field(None, ge=0)
    started_on: Optional[date] = None
    due_on: Optional[date] = None

    @field_validator("status")
    @classmethod
    def _status(cls, v):
        if v not in PROJECT_STATUSES:
            raise ValueError(f"status must be one of {', '.join(PROJECT_STATUSES)}")
        return v

    @field_validator("client")
    @classmethod
    def _client(cls, v):
        v = (v or "").strip()
        return v or None


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    client: Optional[str] = Field(None, max_length=200)
    status: Optional[str] = None
    description: Optional[str] = None
    colour: Optional[str] = Field(None, max_length=20)
    target_hours: Optional[float] = Field(None, ge=0)
    started_on: Optional[date] = None
    due_on: Optional[date] = None

    @field_validator("status")
    @classmethod
    def _status(cls, v):
        if v is not None and v not in PROJECT_STATUSES:
            raise ValueError(f"status must be one of {', '.join(PROJECT_STATUSES)}")
        return v

    @field_validator("client")
    @classmethod
    def _client(cls, v):
        if v is None:
            return None
        v = v.strip()
        return v or None


class NoteCreate(BaseModel):
    body: str = Field(..., min_length=1)


class NoteUpdate(BaseModel):
    body: str = Field(..., min_length=1)


class TimeEntryCreate(BaseModel):
    spent_on: date
    minutes: int = Field(..., gt=0, le=1440)
    project_id: Optional[int] = None
    task_id: Optional[int] = None
    note: Optional[str] = None


class TimeEntryUpdate(BaseModel):
    spent_on: Optional[date] = None
    minutes: Optional[int] = Field(None, gt=0, le=1440)
    note: Optional[str] = None


def _owned_project(db: Session, project_id: int, admin: PublicUser) -> AdminProject:
    project = db.execute(
        select(AdminProject).where(
            AdminProject.id == project_id, AdminProject.owner_user_id == admin.id
        )
    ).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _minutes_by_project(db: Session, admin: PublicUser) -> dict:
    """Logged minutes per project, in one query rather than one per project."""
    rows = db.execute(
        select(AdminTimeEntry.project_id, func.coalesce(func.sum(AdminTimeEntry.minutes), 0))
        .where(
            AdminTimeEntry.owner_user_id == admin.id,
            AdminTimeEntry.project_id.is_not(None),
        )
        .group_by(AdminTimeEntry.project_id)
    ).all()
    return {r[0]: int(r[1]) for r in rows}


def _task_counts_by_project(db: Session, admin: PublicUser) -> dict:
    rows = db.execute(
        select(AdminTask.project_id, AdminTask.status, func.count())
        .where(AdminTask.owner_user_id == admin.id, AdminTask.project_id.is_not(None))
        .group_by(AdminTask.project_id, AdminTask.status)
    ).all()
    out = {}
    for project_id, status, n in rows:
        bucket = out.setdefault(project_id, {"open": 0, "done": 0})
        bucket["done" if status == "done" else "open"] += n
    return out


@router.get("/planner/projects")
def list_projects(
    include_archived: bool = Query(False),
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    """The caller's projects, each with its logged hours and task counts.

    Three aggregate queries total, not three per project — the N+1 here would
    be invisible at ten projects and painful at two hundred.
    """
    stmt = select(AdminProject).where(AdminProject.owner_user_id == admin.id)
    if not include_archived:
        stmt = stmt.where(AdminProject.status != "archived")
    stmt = stmt.order_by(AdminProject.status, AdminProject.due_on, AdminProject.name)

    projects = db.execute(stmt).scalars().all()
    minutes = _minutes_by_project(db, admin)
    counts = _task_counts_by_project(db, admin)
    return {
        "projects": [
            _project_out(p, minutes.get(p.id, 0), counts.get(p.id)) for p in projects
        ]
    }


@router.post("/planner/projects", status_code=201)
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    project = AdminProject(
        owner_user_id=admin.id,
        name=payload.name.strip(),
        client=payload.client,
        status=payload.status,
        description=payload.description,
        colour=payload.colour,
        target_hours=payload.target_hours,
        started_on=payload.started_on,
        due_on=payload.due_on,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return _project_out(project)


@router.get("/planner/projects/{project_id}")
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    """One project with its note journal, its tasks and its time entries."""
    project = _owned_project(db, project_id, admin)

    tasks = db.execute(
        select(AdminTask)
        .options(selectinload(AdminTask.subtasks))
        .where(AdminTask.owner_user_id == admin.id, AdminTask.project_id == project.id)
        .order_by(AdminTask.due_date.is_(None), AdminTask.due_date, AdminTask.position)
    ).scalars().all()

    entries = db.execute(
        select(AdminTimeEntry)
        .where(
            AdminTimeEntry.owner_user_id == admin.id,
            AdminTimeEntry.project_id == project.id,
        )
        .order_by(AdminTimeEntry.spent_on.desc(), AdminTimeEntry.id.desc())
    ).scalars().all()

    minutes = sum(e.minutes for e in entries)
    counts = {"open": sum(1 for t in tasks if t.status != "done"),
              "done": sum(1 for t in tasks if t.status == "done")}

    out = _project_out(project, minutes, counts)
    out["notes_journal"] = [_note_out(n) for n in project.notes]
    out["tasks"] = [_task_out(t) for t in tasks]
    out["time_entries"] = [_time_out(e) for e in entries]
    return out


@router.patch("/planner/projects/{project_id}")
def update_project(
    project_id: int,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    project = _owned_project(db, project_id, admin)
    sent = payload.model_fields_set

    if "name" in sent and payload.name is not None:
        project.name = payload.name.strip()
    for field in ("client", "description", "colour", "target_hours",
                  "started_on", "due_on", "status"):
        if field in sent:
            value = getattr(payload, field)
            if value is None and field == "status":
                continue
            setattr(project, field, value)

    db.commit()
    db.refresh(project)
    minutes = _minutes_by_project(db, admin).get(project.id, 0)
    return _project_out(project, minutes, _task_counts_by_project(db, admin).get(project.id))


@router.delete("/planner/projects/{project_id}", status_code=204)
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    """Delete a project. Its tasks and time entries SURVIVE.

    Both FKs are ON DELETE SET NULL, so tasks fall back to having no project
    and time entries stay in the ledger unattributed. Deleting a project is a
    filing decision; it should not silently destroy a record of work done.
    The note journal does go, since a note has no meaning without its project.
    """
    project = _owned_project(db, project_id, admin)
    db.delete(project)
    db.commit()
    return None


@router.post("/planner/projects/{project_id}/notes", status_code=201)
def create_note(
    project_id: int,
    payload: NoteCreate,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    project = _owned_project(db, project_id, admin)
    note = AdminProjectNote(project_id=project.id, body=payload.body)
    db.add(note)
    db.commit()
    db.refresh(note)
    return _note_out(note)


@router.patch("/planner/projects/{project_id}/notes/{note_id}")
def update_note(
    project_id: int,
    note_id: int,
    payload: NoteUpdate,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    project = _owned_project(db, project_id, admin)
    note = next((n for n in project.notes if n.id == note_id), None)
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    note.body = payload.body
    db.commit()
    db.refresh(note)
    return _note_out(note)


@router.delete("/planner/projects/{project_id}/notes/{note_id}", status_code=204)
def delete_note(
    project_id: int,
    note_id: int,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    project = _owned_project(db, project_id, admin)
    if not any(n.id == note_id for n in project.notes):
        raise HTTPException(status_code=404, detail="Note not found")
    db.execute(delete(AdminProjectNote).where(AdminProjectNote.id == note_id))
    db.commit()
    return None


# ================================================================ time

@router.get("/planner/time")
def list_time(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    project_id: Optional[int] = Query(None),
    task_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    stmt = select(AdminTimeEntry).where(AdminTimeEntry.owner_user_id == admin.id)
    if start is not None:
        stmt = stmt.where(AdminTimeEntry.spent_on >= start)
    if end is not None:
        stmt = stmt.where(AdminTimeEntry.spent_on <= end)
    if project_id is not None:
        stmt = stmt.where(AdminTimeEntry.project_id == project_id)
    if task_id is not None:
        stmt = stmt.where(AdminTimeEntry.task_id == task_id)
    stmt = stmt.order_by(AdminTimeEntry.spent_on.desc(), AdminTimeEntry.id.desc())

    entries = db.execute(stmt).scalars().all()
    total = sum(e.minutes for e in entries)
    return {
        "entries": [_time_out(e) for e in entries],
        "total_minutes": total,
        "total_hours": round(total / 60.0, 2),
    }


@router.post("/planner/time", status_code=201)
def create_time_entry(
    payload: TimeEntryCreate,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    """Log time against a project, a task, or a task and its project.

    Given only a task, the entry inherits that task's project. That inheritance
    is stamped at write time rather than resolved on read: if the task is later
    deleted its FK goes NULL, and an entry that resolved its project through
    the task would silently drop out of the project total.
    """
    if payload.project_id is None and payload.task_id is None:
        raise HTTPException(
            status_code=400, detail="Provide a project_id, a task_id, or both."
        )

    project_id = payload.project_id
    task_id = None

    if payload.task_id is not None:
        task = _owned(db, payload.task_id, admin)
        task_id = task.id
        if project_id is None:
            project_id = task.project_id

    if project_id is not None:
        _owned_project(db, project_id, admin)

    entry = AdminTimeEntry(
        owner_user_id=admin.id,
        project_id=project_id,
        task_id=task_id,
        spent_on=payload.spent_on,
        minutes=payload.minutes,
        note=payload.note,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _time_out(entry)


@router.patch("/planner/time/{entry_id}")
def update_time_entry(
    entry_id: int,
    payload: TimeEntryUpdate,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    entry = db.execute(
        select(AdminTimeEntry).where(
            AdminTimeEntry.id == entry_id, AdminTimeEntry.owner_user_id == admin.id
        )
    ).scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=404, detail="Time entry not found")

    sent = payload.model_fields_set
    if "spent_on" in sent and payload.spent_on is not None:
        entry.spent_on = payload.spent_on
    if "minutes" in sent and payload.minutes is not None:
        entry.minutes = payload.minutes
    if "note" in sent:
        entry.note = payload.note

    db.commit()
    db.refresh(entry)
    return _time_out(entry)


@router.delete("/planner/time/{entry_id}", status_code=204)
def delete_time_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    entry = db.execute(
        select(AdminTimeEntry).where(
            AdminTimeEntry.id == entry_id, AdminTimeEntry.owner_user_id == admin.id
        )
    ).scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=404, detail="Time entry not found")
    db.delete(entry)
    db.commit()
    return None


@router.get("/planner/time/summary")
def time_summary(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    """Hours per project for a period, plus what fell outside any project.

    The unattributed bucket is the point of the whole feature: time that went
    somewhere untracked is exactly what an outcome-based view needs to show
    rather than quietly omit.
    """
    stmt = (
        select(AdminTimeEntry.project_id, func.coalesce(func.sum(AdminTimeEntry.minutes), 0))
        .where(AdminTimeEntry.owner_user_id == admin.id)
        .group_by(AdminTimeEntry.project_id)
    )
    if start is not None:
        stmt = stmt.where(AdminTimeEntry.spent_on >= start)
    if end is not None:
        stmt = stmt.where(AdminTimeEntry.spent_on <= end)

    rows = db.execute(stmt).all()
    by_id = {r[0]: int(r[1]) for r in rows}

    names = {
        p.id: p for p in db.execute(
            select(AdminProject).where(AdminProject.owner_user_id == admin.id)
        ).scalars().all()
    }

    projects = []
    for project_id, minutes in by_id.items():
        if project_id is None:
            continue
        p = names.get(project_id)
        target = float(p.target_hours) if p is not None and p.target_hours else None
        hours = round(minutes / 60.0, 2)
        projects.append({
            "project_id": project_id,
            "name": p.name if p is not None else "(deleted project)",
            "colour": p.colour if p is not None else None,
            "minutes": minutes,
            "hours": hours,
            "target_hours": target,
            "pct_of_target": round(hours / target * 100, 1) if target else None,
        })
    projects.sort(key=lambda r: r["minutes"], reverse=True)

    unattributed = by_id.get(None, 0)
    total = sum(by_id.values())
    return {
        "projects": projects,
        "unattributed_minutes": unattributed,
        "unattributed_hours": round(unattributed / 60.0, 2),
        "total_minutes": total,
        "total_hours": round(total / 60.0, 2),
    }
