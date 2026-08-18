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


# ── Work by block ─────────────────────────────────────────────────────
class BlockWorkRow(BaseModel):
    block_id: Optional[int] = None
    block_name: str
    property_name: Optional[str] = None
    variety: Optional[str] = None
    area_hectares: Optional[float] = None
    tasks_completed: int = 0
    hours: float = 0
    rows_completed: int = 0
    area_worked_hectares: float = 0
    hours_per_hectare: Optional[float] = None


class WorkByBlockSummary(BaseModel):
    blocks: List[BlockWorkRow] = []
    total_tasks: int = 0
    total_hours: float = 0
    total_area_worked: float = 0
    # Hours logged against tasks with no block. Reported separately rather than
    # spread across blocks, because attributing them would be a guess.
    unallocated_hours: float = 0
    unallocated_tasks: int = 0


# ── Outstanding & overdue ─────────────────────────────────────────────
class OutstandingBlockRow(BaseModel):
    block_id: Optional[int] = None
    block_name: str
    open_count: int = 0
    overdue_count: int = 0
    oldest_overdue_days: Optional[int] = None


class AssigneeRow(BaseModel):
    user_id: Optional[int] = None
    name: str
    open_count: int = 0
    overdue_count: int = 0


class OutstandingSummary(BaseModel):
    total_open: int = 0
    total_overdue: int = 0
    unscheduled: int = 0
    oldest_overdue_days: Optional[int] = None
    by_priority: List[StatusCount] = []
    by_status: List[StatusCount] = []
    by_block: List[OutstandingBlockRow] = []
    by_assignee: List[AssigneeRow] = []
    unassigned_open: int = 0


# ── Health & safety ───────────────────────────────────────────────────
class IncidentRow(BaseModel):
    id: int
    incident_number: str
    title: str
    incident_date: Optional[str] = None
    incident_type: Optional[str] = None
    severity: Optional[str] = None
    category: Optional[str] = None
    property_name: Optional[str] = None
    is_notifiable: bool = False
    worksafe_notified: bool = False
    worksafe_reference: Optional[str] = None
    days_to_notify: Optional[int] = None
    status: Optional[str] = None


class RiskRow(BaseModel):
    id: int
    risk_title: str
    risk_category: Optional[str] = None
    risk_type: Optional[str] = None
    inherent_risk_level: Optional[str] = None
    residual_risk_level: Optional[str] = None
    residual_risk_score: Optional[int] = None
    status: Optional[str] = None
    next_review_due: Optional[str] = None
    review_overdue_days: Optional[int] = None
    open_actions: int = 0


class HealthSafetySummary(BaseModel):
    total_incidents: int = 0
    by_severity: List[StatusCount] = []
    by_type: List[CategoryCount] = []
    notifiable_count: int = 0
    notified_count: int = 0
    # The number that matters: notifiable events WorkSafe was never told about.
    notifiable_not_notified: int = 0
    medical_treatment_count: int = 0
    lost_time_count: int = 0
    lost_time_days: int = 0
    incidents: List[IncidentRow] = []

    active_risks: int = 0
    risks_by_residual_level: List[StatusCount] = []
    risks_overdue_review: int = 0
    open_actions: int = 0
    overdue_actions: int = 0
    risks: List[RiskRow] = []


# ── Site access ───────────────────────────────────────────────────────
class VisitRow(BaseModel):
    id: int
    kind: str  # "visitor" | "contractor"
    name: str
    organisation: Optional[str] = None
    visit_date: Optional[str] = None
    purpose: Optional[str] = None
    property_name: Optional[str] = None
    host: Optional[str] = None
    signed_in: Optional[str] = None
    signed_out: Optional[str] = None
    inducted: Optional[bool] = None
    equipment_cleaned: Optional[bool] = None
    status: Optional[str] = None


class SiteAccessSummary(BaseModel):
    total_visits: int = 0
    visitor_visits: int = 0
    contractor_visits: int = 0
    unique_people: int = 0
    # Compliance holes, which is what an auditor opens this report to find.
    not_inducted: int = 0
    never_signed_out: int = 0
    equipment_not_cleaned: int = 0
    by_purpose: List[CategoryCount] = []
    by_property: List[PropertyVisitCount] = []
    training_current: int = 0
    training_expired: int = 0
    visits: List[VisitRow] = []


# ── Vineyard census ───────────────────────────────────────────────────
class CensusBlockRow(BaseModel):
    id: int
    block_name: str
    property_name: Optional[str] = None
    status: Optional[str] = None
    variety: Optional[str] = None
    clone: Optional[str] = None
    rootstock: Optional[str] = None
    area_hectares: Optional[float] = None
    planted_date: Optional[str] = None
    age_years: Optional[int] = None
    row_count: Optional[int] = None
    row_spacing: Optional[float] = None
    vine_spacing: Optional[float] = None
    vines_estimated: Optional[int] = None
    training_system: Optional[str] = None
    region: Optional[str] = None
    gi: Optional[str] = None
    certifications: List[str] = []


class AreaByKey(BaseModel):
    key: str
    blocks: int = 0
    area_hectares: float = 0


class VineyardCensusSummary(BaseModel):
    total_blocks: int = 0
    total_area_hectares: float = 0
    producing_area_hectares: float = 0
    by_variety: List[AreaByKey] = []
    by_status: List[AreaByKey] = []
    by_age_band: List[AreaByKey] = []
    by_certification: List[AreaByKey] = []
    blocks_missing_area: int = 0
    blocks_missing_planted_date: int = 0
    blocks: List[CensusBlockRow] = []
