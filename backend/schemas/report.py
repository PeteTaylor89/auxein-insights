# backend/schemas/report.py — report summary schemas
from pydantic import BaseModel
from typing import Dict, List, Optional


class StatusCount(BaseModel):
    status: str
    count: int


class CategoryCount(BaseModel):
    category: str
    count: int


class TaskReportSummary(BaseModel):
    total: int = 0
    by_status: List[StatusCount] = []
    by_priority: List[StatusCount] = []
    by_category: List[CategoryCount] = []
    total_hours: float = 0
    completion_rate: float = 0  # percentage
    overdue_count: int = 0


class ObservationReportSummary(BaseModel):
    total_plans: int = 0
    total_runs: int = 0
    completed_runs: int = 0
    avg_spots_per_run: float = 0
    runs_by_month: Dict[str, int] = {}  # "2026-01": 5


class TimesheetReportSummary(BaseModel):
    total_days: int = 0
    by_status: List[StatusCount] = []
    total_hours: float = 0
    avg_hours_per_day: float = 0
    uncoded_hours: float = 0


class AssetReportSummary(BaseModel):
    total_assets: int = 0
    by_status: List[StatusCount] = []
    by_category: List[CategoryCount] = []
    total_value: float = 0
    maintenance_due: int = 0
