# db/models/admin_task.py — the admin's own task planner.
#
# Personal task management for whoever is signed into admin.auxein.co.nz. NOT
# the Grow `tasks` table: that one is company-scoped vineyard work with rows,
# GPS tracks, assets and costing hanging off it, and it answers to a tenant.
# These rows answer to one admin user and never leave the admin app.
#
# Read and written by /api/v1/admin/planner/*.
from sqlalchemy import (
    Column, Integer, BigInteger, String, Text, Date, Boolean, DateTime,
    ForeignKey, CheckConstraint, Index
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from db.base_class import Base

URGENCIES = ("low", "normal", "high", "urgent")
STATUSES = ("todo", "in_progress", "blocked", "done")


class AdminTask(Base):
    __tablename__ = "admin_tasks"

    id = Column(BigInteger, primary_key=True, index=True)

    # Insights identity. Every /api/v1/admin/* route resolves the caller through
    # `require_admin` -> `get_current_public_user`, so the owner is the
    # `public_users` row, not the Grow `users` row the person signed in with.
    owner_user_id = Column(
        Integer, ForeignKey("public_users.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Optional. A task need not belong to a project, and deleting a project
    # must not take its tasks with it — hence SET NULL rather than CASCADE.
    project_id = Column(
        BigInteger, ForeignKey("admin_projects.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )

    title = Column(String(300), nullable=False)
    notes = Column(Text, nullable=True)

    # Free text by choice: a task can be about a prospect, a supplier or someone
    # who will never be a row in `companies` or `insights_accounts`. The API
    # offers autocomplete over the caller's own past values, which gets the
    # consistency of a picklist without the constraint of one.
    client = Column(String(200), nullable=True)

    # VARCHAR + CHECK, not a Postgres ENUM. SQLAlchemy's `Enum` does not create
    # a real ENUM type consistently in this codebase, and there are already
    # three separate task-status vocabularies in the schema; a fourth ENUM type
    # would be a migration every time a value is added.
    urgency = Column(String(20), nullable=False, server_default="normal")
    status = Column(String(20), nullable=False, server_default="todo")

    # DATE, deliberately, not a timestamp. A personal deadline is a calendar
    # day. Storing an instant would force every read to choose UTC or NZ, and
    # that choice is the recurring bug in this repo — a server-UTC `today` is
    # yesterday for the whole NZ morning. A DATE cannot pose the question.
    due_date = Column(Date, nullable=True)

    # Set when status becomes 'done', cleared on reopen. An event, not just
    # state: without it "finished this week" can only ever be answered as
    # "created this week and finished at some point since", which is exactly
    # the gap the Grow `tasks` table has.
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Manual ordering within a day. Ties break on id so the order is total.
    position = Column(Integer, nullable=False, server_default="0")

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False,
                        server_default=func.now(), onupdate=func.now())

    subtasks = relationship(
        "AdminTaskSubtask",
        back_populates="task",
        cascade="all, delete-orphan",
        order_by="AdminTaskSubtask.position, AdminTaskSubtask.id",
    )

    __table_args__ = (
        CheckConstraint(
            "urgency IN ('low','normal','high','urgent')", name="ck_admin_tasks_urgency"
        ),
        CheckConstraint(
            "status IN ('todo','in_progress','blocked','done')", name="ck_admin_tasks_status"
        ),
        # The calendar's only query shape: one owner, a month of due dates.
        Index("ix_admin_tasks_owner_due", "owner_user_id", "due_date"),
        # The agenda's second shape: open work for one owner, newest first.
        Index("ix_admin_tasks_owner_status", "owner_user_id", "status"),
    )

    def __repr__(self):
        return f"<AdminTask {self.id} {self.status} {self.title[:30]!r}>"


class AdminTaskSubtask(Base):
    __tablename__ = "admin_task_subtasks"

    id = Column(BigInteger, primary_key=True, index=True)

    # Indexed explicitly. An unindexed FK in this schema means a seq scan per
    # parent row on delete, which is how a block delete came to scan 22 GB.
    task_id = Column(
        BigInteger, ForeignKey("admin_tasks.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    title = Column(String(300), nullable=False)
    done = Column(Boolean, nullable=False, server_default="false")
    position = Column(Integer, nullable=False, server_default="0")

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    task = relationship("AdminTask", back_populates="subtasks")

    def __repr__(self):
        return f"<AdminTaskSubtask {self.id} done={self.done} {self.title[:30]!r}>"
