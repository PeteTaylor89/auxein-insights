# db/models/admin_project.py — projects, their note journal, and logged time.
#
# The outcome side of the admin planner. A task is a thing to do; a project is
# the thing the doing is FOR, and time entries are what connect the two so
# "hours towards this outcome" is answerable rather than guessed at.
#
# Read and written by /api/v1/admin/planner/*.
from sqlalchemy import (
    Column, Integer, BigInteger, String, Text, Date, Numeric, DateTime,
    ForeignKey, CheckConstraint, Index
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from db.base_class import Base

PROJECT_STATUSES = ("active", "on_hold", "done", "archived")


class AdminProject(Base):
    __tablename__ = "admin_projects"

    id = Column(BigInteger, primary_key=True, index=True)

    owner_user_id = Column(
        Integer, ForeignKey("public_users.id", ondelete="CASCADE"), nullable=False,
    )

    name = Column(String(200), nullable=False)

    # Free text, matching admin_tasks.client. The same autocomplete serves both,
    # so a client typed on a task is offered on a project and vice versa.
    client = Column(String(200), nullable=True)

    status = Column(String(20), nullable=False, server_default="active")

    # What the project is. Distinct from the note journal below: this is the
    # standing description, those are dated entries that accumulate.
    description = Column(Text, nullable=True)

    # A TOKEN NAME ('teal', 'amber'), never a hex value. Colours live in
    # theme.css; storing hex here would put a second palette in the database
    # that no theme change can reach.
    colour = Column(String(20), nullable=True)

    # The budget that makes logged time mean something. Nullable — a project
    # without a target still totals its hours, it just has nothing to sit against.
    target_hours = Column(Numeric(8, 2), nullable=True)

    started_on = Column(Date, nullable=True)
    due_on = Column(Date, nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False,
                        server_default=func.now(), onupdate=func.now())

    notes = relationship(
        "AdminProjectNote",
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="AdminProjectNote.created_at.desc()",
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('active','on_hold','done','archived')",
            name="ck_admin_projects_status",
        ),
        Index("ix_admin_projects_owner_status", "owner_user_id", "status"),
    )

    def __repr__(self):
        return f"<AdminProject {self.id} {self.status} {self.name[:30]!r}>"


class AdminProjectNote(Base):
    """A dated entry in a project's journal.

    Deliberately append-style rather than one editable blob: the value of a
    project note is that it is anchored to when it was written.
    """
    __tablename__ = "admin_project_notes"

    id = Column(BigInteger, primary_key=True, index=True)

    project_id = Column(
        BigInteger, ForeignKey("admin_projects.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    body = Column(Text, nullable=False)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False,
                        server_default=func.now(), onupdate=func.now())

    project = relationship("AdminProject", back_populates="notes")

    def __repr__(self):
        return f"<AdminProjectNote {self.id} project={self.project_id}>"


class AdminTimeEntry(Base):
    """One block of time, entered by hand after the fact.

    No timer: there is no `started_at`/`ended_at` pair, because a stop that
    never happens writes an entry that is wrong in a way nothing detects. A
    duration that was typed is a duration someone meant.
    """
    __tablename__ = "admin_time_entries"

    id = Column(BigInteger, primary_key=True, index=True)

    owner_user_id = Column(
        Integer, ForeignKey("public_users.id", ondelete="CASCADE"), nullable=False,
    )

    # Both nullable, with a CHECK that at least one is set. Time can go against
    # a project directly (a meeting about it) or against a task, in which case
    # the API also stamps the task's project so the roll-up stays correct even
    # if the task is later deleted.
    project_id = Column(
        BigInteger, ForeignKey("admin_projects.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    task_id = Column(
        BigInteger, ForeignKey("admin_tasks.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )

    # DATE, like due_date and for the same reason: the day you worked is a
    # calendar day, and a timestamp would drag the UTC/NZ question into a total.
    spent_on = Column(Date, nullable=False)

    # Minutes, integer. Decimal hours would accumulate float error across a sum
    # and 0.1h is not a thing anyone types; the UI renders 7.5h or 7:30 from it.
    minutes = Column(Integer, nullable=False)

    note = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        CheckConstraint(
            "project_id IS NOT NULL OR task_id IS NOT NULL",
            name="ck_admin_time_target",
        ),
        # A day has 1440 minutes. The upper bound catches a units slip — hours
        # typed into a minutes field — which otherwise silently inflates a
        # project total by sixty times and looks like diligence.
        CheckConstraint(
            "minutes > 0 AND minutes <= 1440", name="ck_admin_time_minutes"
        ),
        # The reporting shape: one owner, a date range.
        Index("ix_admin_time_owner_date", "owner_user_id", "spent_on"),
    )

    def __repr__(self):
        return f"<AdminTimeEntry {self.id} {self.spent_on} {self.minutes}m>"
