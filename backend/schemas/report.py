# backend/schemas/report.py — report summary schemas
from pydantic import BaseModel
from typing import Dict, List, Optional


class StatusCount(BaseModel):
    status: str
    count: int


class CategoryCount(BaseModel):
    category: str
    count: int


# ── Costs ─────────────────────────────────────────────────────────────
class CostBreakdown(BaseModel):
    """What a set of tasks cost, and how much of that figure to trust.

    **A null container means "you may not see costs"; a null FIELD means "not
    known".** The two are different answers and the shape keeps them apart. Any
    row carrying costs at all has this object; a viewer without `costs:read`
    gets no object anywhere in the payload, so a client cannot mistake a
    withheld figure for an uncosted one.

    Nothing here is ever 0.00 to mean unknown. An unresolvable pay rate, an
    unpriced consumable or an unrated machine leaves its field None and says so
    in `warning` — 0.00 would assert the work was free, which is a claim nobody
    made.
    """
    currency: str = "NZD"
    labour_staff: Optional[float] = None
    labour_contractor: Optional[float] = None
    consumables: Optional[float] = None
    equipment: Optional[float] = None
    total: Optional[float] = None

    # Coverage. `uncosted_tasks` is the one that matters most: a task completed
    # before costing shipped has no snapshot and contributes nothing, so a total
    # over a historical period is an understatement by construction.
    costed_tasks: int = 0
    uncosted_tasks: int = 0
    incomplete_tasks: int = 0

    #: False when the total is knowably lower than the truth.
    is_complete: bool = True
    warning: Optional[str] = None


class TaskReportSummary(BaseModel):
    total: int = 0
    by_status: List[StatusCount] = []
    by_priority: List[StatusCount] = []
    by_category: List[CategoryCount] = []
    total_hours: float = 0
    completion_rate: float = 0  # percentage
    overdue_count: int = 0
    #: Absent without `costs:read`. Covers the COMPLETED tasks in range only —
    #: an unfinished task has no snapshot and no cost to report.
    costs: Optional[CostBreakdown] = None


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
    # Absent entirely without `costs:read` — see CostBreakdown.
    costs: Optional[CostBreakdown] = None
    cost_per_hectare: Optional[float] = None


class WorkByBlockSummary(BaseModel):
    blocks: List[BlockWorkRow] = []
    total_tasks: int = 0
    total_hours: float = 0
    total_area_worked: float = 0
    # Hours logged against tasks with no block. Reported separately rather than
    # spread across blocks, because attributing them would be a guess.
    unallocated_hours: float = 0
    unallocated_tasks: int = 0
    #: Company-wide totals, including the unallocated tasks. Absent without `costs:read`.
    costs: Optional[CostBreakdown] = None


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
    # "staff" rows come from SiteAttendance and carry no induction, purpose or
    # equipment fields — a person who works here is not signed in as a guest.
    kind: str  # "visitor" | "contractor" | "staff"
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
    # Staff sign-ons (SiteAttendance), added 2026-09-02. Before this the report
    # answered "who was on site" with only the people who do not work here.
    staff_attendances: int = 0
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


# ── Counts (bud / bunch / flower) ─────────────────────────────────────
class CountStat(BaseModel):
    """Observation counts for one block, run or the whole company.

    **A statistic that the data cannot support is None, never 0.** A standard
    deviation from one spot does not exist, and from two it is just the gap
    between them divided by root two — a number that looks like a measure of
    spread and is not one. `sd_note` says which case applies, so a blank cell
    is explainable rather than looking like a bug.
    """
    key: str
    label: str
    block_id: Optional[int] = None
    property_name: Optional[str] = None
    variety: Optional[str] = None
    #: Run rows only. A run's own `name` is frequently "Run — template 4", which
    #: identifies nothing: what tells one run from another is WHERE and WHEN.
    template_name: Optional[str] = None
    observed_on: Optional[str] = None

    spots: int = 0
    #: Vines behind the figure — the sum of `vines_sampled`, not the spot count.
    vines_sampled: float = 0
    #: Weighted by vines sampled: a spot covering 5 vines outweighs one covering 1.
    mean: Optional[float] = None
    #: Sample SD ACROSS SPOTS (n-1). See `sd_basis`.
    sd: Optional[float] = None
    sd_basis: Optional[str] = None
    sd_note: Optional[str] = None
    #: SD as a percentage of the mean — the comparable measure of evenness.
    cv_percent: Optional[float] = None
    min: Optional[float] = None
    max: Optional[float] = None

    target: Optional[float] = None
    percent_of_target: Optional[float] = None


class CountReportSummary(BaseModel):
    metric: str
    metric_label: str
    unit: Optional[str] = None
    overall: CountStat
    blocks: List[CountStat] = []
    runs: List[CountStat] = []
    #: Templates this metric could not read, and anything else worth saying
    #: before someone reads a number off the table.
    warnings: List[str] = []


# ── Cost report ───────────────────────────────────────────────────────
class OperationCostRow(BaseModel):
    """One operation type — pruning, spraying, mowing — across the period.

    The question this answers is "what does a pass of X cost us", which is the
    one a grower actually asks. Category is the closest thing the schema has to
    an operation type.
    """
    key: str
    tasks: int = 0
    hours: float = 0
    estimated_hours: Optional[float] = None
    #: Actual minus estimated. None when nothing in the group carried an estimate.
    hours_variance: Optional[float] = None
    area_worked_hectares: float = 0
    costs: CostBreakdown = CostBreakdown()
    cost_per_hour: Optional[float] = None
    cost_per_hectare: Optional[float] = None


class CostMixRow(BaseModel):
    """Labour vs materials vs machinery, as money and as a share of the total."""
    key: str
    amount: Optional[float] = None
    share_percent: Optional[float] = None


class CostReportSummary(BaseModel):
    currency: str = "NZD"
    costs: CostBreakdown = CostBreakdown()
    by_operation: List[OperationCostRow] = []
    by_variety: List[OperationCostRow] = []
    mix: List[CostMixRow] = []
    #: Tasks completed in range that have no live cost snapshot at all.
    uncosted_tasks: int = 0
    #: Whether the company has enough configured for a cost to mean anything.
    rates_configured: bool = False
    setup_warnings: List[str] = []


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
