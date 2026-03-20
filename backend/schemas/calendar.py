# backend/schemas/calendar.py — unified calendar event schema
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from enum import Enum


class CalendarEventType(str, Enum):
    task = "task"
    observation = "observation"
    training = "training"
    risk_action = "risk_action"
    maintenance = "maintenance"


class CalendarEvent(BaseModel):
    id: int
    event_type: CalendarEventType
    title: str
    start: datetime
    end: Optional[datetime] = None
    all_day: bool = False
    color: Optional[str] = None
    status: Optional[str] = None
    location: Optional[str] = None
    assignees: List[str] = []
    url: Optional[str] = None  # deep-link path e.g. /tasks/123

    class Config:
        from_attributes = True


# Colour palette per event type (olive/terracotta design system)
EVENT_TYPE_COLORS = {
    CalendarEventType.task: "#5B6830",         # olive
    CalendarEventType.observation: "#2d5a87",   # info blue
    CalendarEventType.training: "#7c3aed",      # purple
    CalendarEventType.risk_action: "#D1583B",   # terracotta
    CalendarEventType.maintenance: "#f59e0b",   # warning amber
}
