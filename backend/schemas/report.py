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


class TopContractor(BaseModel):
    contractor_id: int
    contractor_name: str
    jobs_completed: int = 0
    hours_worked: float = 0


class PropertyVisitCount(BaseModel):
    property_id: Optional[int] = None
    property_name: Optional[str] = None
    visit_count: int = 0


class ContractorReportSummary(BaseModel):
    total_active_relationships: int = 0
    jobs_completed: int = 0
    total_hours_worked: float = 0
    total_visits: int = 0
    unique_contractors_visited: int = 0
    top_contractors_by_hours: List[TopContractor] = []
    visits_by_property: List[PropertyVisitCount] = []
