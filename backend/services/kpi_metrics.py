# services/kpi_metrics.py — every platform KPI, in one place.
#
# Scoped in docs/plans/KPI_DASHBOARD_SCOPE_2026-09-15.md, which records why each
# metric is defined the way it is and what was measured to decide.
#
# CONTRACT: every metric function takes (db, as_at) and returns a MetricResult.
# `as_at` is the snapshot instant — always the 1st of a month, 00:00 UTC — and
# the value is the state AT that instant. Nothing here reads "now": a metric that
# quietly used the wall clock would make backfill and live disagree, which is the
# hardest kind of KPI bug to notice.
#
# STOCK vs FLOW. A stock metric is a level (users, companies, hectares) and sets
# only `value`. A flow metric is an increment (tasks completed, observations
# made) and sets `value` to the cumulative total AND `period_value` to that
# month's own count. Summing a stock metric over months would re-count the same
# users; that is why they are separate fields rather than one.
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone, date, timedelta
from typing import Optional, Callable

from sqlalchemy import func, and_, or_, text
from sqlalchemy.orm import Session

from db.models.company import Company
from db.models.user import User
from db.models.public_user import PublicUser
from db.models.block import VineyardBlock
from db.models.property import Property
from db.models.task import Task
from db.models.asset import Asset
from db.models.user_enrichment import UserEvent


# ── Definitions that the numbers depend on ────────────────────────────────────

# Blocks in these states are not under management. "Ha under management" should
# not count land taken out of production. Decision recorded 2026-09-15.
EXCLUDED_BLOCK_STATUSES = ("mothballed", "removed")

# A draft task was never actually scheduled.
EXCLUDED_TASK_STATUSES = ("draft",)

DEFINITIONS_VERSION = "2026-09-15"


@dataclass
class MetricResult:
    value: float
    period_value: Optional[float] = None
    meta: dict = field(default_factory=dict)


# ── The internal-company filter ───────────────────────────────────────────────

def internal_company_ids(db: Session) -> list[int]:
    """Companies excluded from every Grow KPI.

    Reads `companies.is_internal` — NOT a list of names. A name list fails in
    the wrong direction: rename a company, or add "Auxein Demo", and the filter
    silently stops matching, so the test data counts as real and every figure
    inflates with no error. As at 2026-09-15 this removes 3 of 8 companies and
    9 of 18 Grow users.
    """
    rows = db.query(Company.id).filter(Company.is_internal.is_(True)).all()
    return [r[0] for r in rows]


def _external_company_ids(db: Session) -> list[int]:
    rows = db.query(Company.id).filter(Company.is_internal.is_(False)).all()
    return [r[0] for r in rows]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _month_start(as_at: datetime) -> datetime:
    return as_at.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _prev_month_start(as_at: datetime) -> datetime:
    first = _month_start(as_at)
    prev_end = first - timedelta(days=1)
    return prev_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _created_before(db: Session, model, as_at: datetime, extra=None):
    """Count rows created strictly before the snapshot instant.

    `< as_at`, never `<=`: the snapshot describes the state at the moment the
    month begins, so a row created at exactly 00:00 on the 1st belongs to the
    new month, not the one being closed.
    """
    q = db.query(func.count(model.id)).filter(model.created_at < as_at)
    if extra is not None:
        q = q.filter(extra)
    return q.scalar() or 0


# ── Insights metrics ──────────────────────────────────────────────────────────

def verified_users(db: Session, as_at: datetime) -> MetricResult:
    """Verified Insights accounts.

    NOTE `is_verified` is mutable, so for a backfilled month this counts users
    created before that month who are verified NOW. Verification is effectively
    one-way in practice, so the drift is small — but it is drift, and it is why
    the row carries `approx` for any date before the job started running.
    """
    total = _created_before(db, PublicUser, as_at)
    verified = _created_before(db, PublicUser, as_at, PublicUser.is_verified.is_(True))
    return MetricResult(
        value=verified,
        meta={"total_users": total, "note": "is_verified is mutable; backfill is approximate"},
    )


def insights_mau(db: Session, as_at: datetime) -> MetricResult:
    """Distinct Insights users with a tracked event in the month just ended.

    Calendar month from `user_events`, NOT `last_active >= now() - 30 days`.
    Two reasons, both measured:

      1. `last_active` is written in exactly ONE place — the event endpoints in
         enrichment.py. Not on login, not on authenticated requests. So it means
         the same population as user_events but as a single MUTABLE column,
         which cannot be backfilled at all.
      2. The rolling window and the calendar month disagree by ~38% (24 vs 15 on
         2026-09-15). A dashboard showing both without saying why invites the
         wrong conclusion.

    `user_events` is append-only from 2026-02-27, so this backfills honestly.
    """
    start = _prev_month_start(as_at)
    end = _month_start(as_at)
    count = (
        db.query(func.count(func.distinct(UserEvent.user_id)))
        .filter(UserEvent.created_at >= start, UserEvent.created_at < end)
        .scalar()
        or 0
    )
    return MetricResult(
        value=count,
        meta={"window": f"{start.date()}..{end.date()}", "basis": "user_events calendar month"},
    )


def insights_wau(db: Session, as_at: datetime) -> MetricResult:
    """Distinct active users in the final 7 days before the snapshot."""
    end = _month_start(as_at)
    start = end - timedelta(days=7)
    count = (
        db.query(func.count(func.distinct(UserEvent.user_id)))
        .filter(UserEvent.created_at >= start, UserEvent.created_at < end)
        .scalar()
        or 0
    )
    return MetricResult(value=count, meta={"window": f"{start.date()}..{end.date()}"})


def wau_mau_ratio(db: Session, as_at: datetime) -> MetricResult:
    """WAU as a percentage of MAU — the stickiness ratio.

    Returns 0 rather than dividing by zero in a month with no activity. A month
    with no actives has no meaningful ratio; 0 is the honest floor and the
    accompanying counts in `meta` make the emptiness visible.
    """
    mau = insights_mau(db, as_at).value
    wau = insights_wau(db, as_at).value
    pct = round((wau / mau) * 100, 2) if mau else 0.0
    return MetricResult(value=pct, meta={"wau": wau, "mau": mau})


def newsletter_opt_in_pct(db: Session, as_at: datetime) -> MetricResult:
    """Newsletter opt-ins as a percentage of VERIFIED users.

    Both columns are mutable with no history, so a computed value for a past
    month is not a measurement of that month. Real history for this metric comes
    from the hand-kept sheet seeded by scripts/seed_kpi_history.py — those rows
    are `source: manual` and should be preferred wherever they exist.
    """
    verified = _created_before(db, PublicUser, as_at, PublicUser.is_verified.is_(True))
    opted = _created_before(
        db, PublicUser, as_at,
        and_(PublicUser.is_verified.is_(True), PublicUser.newsletter_opt_in.is_(True)),
    )
    pct = round((opted / verified) * 100, 2) if verified else 0.0
    return MetricResult(
        value=pct,
        meta={"opted_in": opted, "verified": verified,
              "note": "mutable columns; prefer seeded manual history for past months"},
    )


def active_weather_stations(db: Session, as_at: datetime) -> MetricResult:
    """Weather stations flagged active.

    `is_active` is mutable, so this cannot be reconstructed for a past month:
    a station created in June and deactivated in September reads as inactive in
    any reconstruction, however far back it reaches. That is exactly why the
    hand-kept figures (70/71/145/438/932 for May-Sep 2026) are the better record
    and are seeded as `source: manual`.

    Live cross-check on 2026-09-15: 932 flagged active, 922 distinct stations
    actually reporting in the previous 7 days — so the flag is honest to ~1%.
    """
    from db.models.weather import WeatherStation

    # PK is `station_id`, not `id` — this table predates the convention.
    count = (
        db.query(func.count(WeatherStation.station_id))
        .filter(WeatherStation.created_at < as_at, WeatherStation.is_active.is_(True))
        .scalar()
        or 0
    )
    return MetricResult(
        value=count,
        meta={"note": "is_active is mutable; historical months are reconstructions, "
                      "prefer seeded manual history"},
    )


# ── Grow metrics ──────────────────────────────────────────────────────────────

def grow_companies(db: Session, as_at: datetime) -> MetricResult:
    # Via the id helper rather than filtering on the column here, so the
    # exclusion is expressed in exactly ONE place for every metric.
    external = _external_company_ids(db)
    if not external:
        return MetricResult(value=0, meta={"excludes": "is_internal"})
    return MetricResult(
        value=_created_before(db, Company, as_at, Company.id.in_(external)),
        meta={"excludes": "is_internal"},
    )


def grow_users(db: Session, as_at: datetime) -> MetricResult:
    external = _external_company_ids(db)
    if not external:
        return MetricResult(value=0, meta={"excludes": "is_internal"})
    return MetricResult(
        value=_created_before(db, User, as_at, User.company_id.in_(external)),
        meta={"excludes": "is_internal"},
    )


def grow_active_users(db: Session, as_at: datetime) -> MetricResult:
    """Grow users who CREATED something in the month just ended.

    Grow has no activity event stream — `users` carries `last_login` and
    `login_count` but no `last_active`. Login is a poor proxy: refresh tokens
    mean a working user may not re-authenticate for weeks, so it undercounts.

    Authorship of tasks and observation runs is backfillable and means something
    closer to "used the product". Named `grow_active_users` rather than MAU
    precisely because it is a different measurement from the Insights one.
    """
    from db.models.observation_run import ObservationRun

    start = _prev_month_start(as_at)
    end = _month_start(as_at)
    external = _external_company_ids(db)
    if not external:
        return MetricResult(value=0)

    task_authors = (
        db.query(Task.created_by)
        .filter(Task.created_at >= start, Task.created_at < end,
                Task.company_id.in_(external), Task.created_by.isnot(None))
    )
    run_authors = (
        db.query(ObservationRun.created_by)
        .filter(ObservationRun.created_at >= start, ObservationRun.created_at < end,
                ObservationRun.company_id.in_(external), ObservationRun.created_by.isnot(None))
    )
    authors = {r[0] for r in task_authors.all()} | {r[0] for r in run_authors.all()}
    return MetricResult(
        value=len(authors),
        meta={"basis": "distinct created_by across tasks + observation_runs",
              "window": f"{start.date()}..{end.date()}"},
    )


def ha_under_management(db: Session, as_at: datetime) -> MetricResult:
    """Hectares under management — SUM(vineyard_blocks.area) BY blocks.company_id.

    THE COMPANY KEY IS ON THE BLOCK, NOT THE PROPERTY. This is the whole finding.
    `vineyard_blocks` holds 8,803 rows of which only 112 have a company_id; the
    rest are a reference dataset (~43,097 ha, roughly the national estate), so an
    unfiltered SUM is meaningless. And joining through `properties` is
    structurally blind: Mt Beautiful's 35 blocks and 112.56 ha — the largest
    holding on the platform — have NO property_id at all, so the property route
    reported it as zero. Fancrest and Barbour likewise.

    Excludes mothballed/removed blocks: land out of production is not under
    management. Decision 2026-09-15. Live: 203.28 ha all-status, 201.35 excluding.

    `properties.total_area_ha` is known-unreliable and must not be used — it
    disagrees with the blocks for Black Estate (48.00 vs 25.94) and is null for
    the companies holding most of the area.
    """
    external = _external_company_ids(db)
    if not external:
        return MetricResult(value=0.0)

    total = (
        db.query(func.coalesce(func.sum(VineyardBlock.area), 0.0))
        .filter(
            VineyardBlock.created_at < as_at,
            VineyardBlock.company_id.in_(external),
            VineyardBlock.status.notin_(EXCLUDED_BLOCK_STATUSES),
        )
        .scalar()
        or 0.0
    )
    return MetricResult(
        value=round(float(total), 2),
        meta={"source": "vineyard_blocks.company_id",
              "excluded_statuses": list(EXCLUDED_BLOCK_STATUSES)},
    )


def grow_blocks(db: Session, as_at: datetime) -> MetricResult:
    external = _external_company_ids(db)
    if not external:
        return MetricResult(value=0)
    return MetricResult(
        value=_created_before(
            db, VineyardBlock, as_at,
            and_(VineyardBlock.company_id.in_(external),
                 VineyardBlock.status.notin_(EXCLUDED_BLOCK_STATUSES)),
        ),
        meta={"source": "vineyard_blocks.company_id"},
    )


def grow_properties(db: Session, as_at: datetime) -> MetricResult:
    external = _external_company_ids(db)
    if not external:
        return MetricResult(value=0)
    return MetricResult(
        value=_created_before(db, Property, as_at, Property.owner_company_id.in_(external)),
    )


# ── Flow metrics (cumulative + monthly increment) ─────────────────────────────

def _flow(db: Session, model, as_at: datetime, extra=None) -> tuple[int, int]:
    start = _prev_month_start(as_at)
    end = _month_start(as_at)
    cumulative = _created_before(db, model, as_at, extra)
    q = db.query(func.count(model.id)).filter(
        model.created_at >= start, model.created_at < end
    )
    if extra is not None:
        q = q.filter(extra)
    return cumulative, (q.scalar() or 0)


def tasks_scheduled(db: Session, as_at: datetime) -> MetricResult:
    """Tasks created, excluding drafts — a draft was never scheduled."""
    external = _external_company_ids(db)
    if not external:
        return MetricResult(value=0, period_value=0)
    extra = and_(Task.company_id.in_(external), Task.status.notin_(EXCLUDED_TASK_STATUSES))
    cumulative, period = _flow(db, Task, as_at, extra)
    return MetricResult(value=cumulative, period_value=period,
                        meta={"excluded_statuses": list(EXCLUDED_TASK_STATUSES)})


def tasks_completed(db: Session, as_at: datetime) -> MetricResult:
    """Tasks currently at status 'completed'.

    CAVEAT, and it is a real one: `tasks.status` is current state, not an event,
    and there is no `completed_at` column. So for a BACKFILLED month this counts
    tasks created in that month and completed at ANY time since — not tasks
    completed in that month. A task completed in July and reopened in August has
    vanished from July's figure.

    Once the monthly job is running this stops mattering: each snapshot freezes
    its own month and nothing can retroactively change it. Adding
    `tasks.completed_at` would make it exact for backfill too — a one-line
    migration, deliberately out of this scope.
    """
    external = _external_company_ids(db)
    if not external:
        return MetricResult(value=0, period_value=0)
    extra = and_(Task.company_id.in_(external), Task.status == "completed")
    cumulative, period = _flow(db, Task, as_at, extra)
    return MetricResult(
        value=cumulative, period_value=period,
        meta={"approx_for_backfill": True,
              "note": "status is mutable; no completed_at column"},
    )


def observation_runs(db: Session, as_at: datetime) -> MetricResult:
    """Scouting rounds — how often anyone goes out."""
    from db.models.observation_run import ObservationRun

    external = _external_company_ids(db)
    if not external:
        return MetricResult(value=0, period_value=0)
    cumulative, period = _flow(db, ObservationRun, as_at,
                               ObservationRun.company_id.in_(external))
    return MetricResult(value=cumulative, period_value=period)


def observation_spots(db: Session, as_at: datetime) -> MetricResult:
    """Individual records within runs — how much data came back.

    `observation_spots` has NO company_id; it joins through `observation_runs`,
    which does. Counting it standalone silently defeats the exclusion (95 raw vs
    51 net on 2026-09-15), so the join is not optional.
    """
    from db.models.observation_run import ObservationRun, ObservationSpot

    external = _external_company_ids(db)
    if not external:
        return MetricResult(value=0, period_value=0)

    start = _prev_month_start(as_at)
    end = _month_start(as_at)
    base = (
        db.query(func.count(ObservationSpot.id))
        .join(ObservationRun, ObservationRun.id == ObservationSpot.run_id)
        .filter(ObservationRun.company_id.in_(external))
    )
    cumulative = base.filter(ObservationSpot.created_at < as_at).scalar() or 0
    period = base.filter(
        ObservationSpot.created_at >= start, ObservationSpot.created_at < end
    ).scalar() or 0
    return MetricResult(value=cumulative, period_value=period,
                        meta={"basis": "joined via observation_runs.company_id"})


def risks_managed(db: Session, as_at: datetime) -> MetricResult:
    from db.models.site_risk import SiteRisk

    external = _external_company_ids(db)
    if not external:
        return MetricResult(value=0, period_value=0)
    cumulative, period = _flow(db, SiteRisk, as_at, SiteRisk.company_id.in_(external))
    return MetricResult(value=cumulative, period_value=period)


def assets_managed(db: Session, as_at: datetime) -> MetricResult:
    external = _external_company_ids(db)
    if not external:
        return MetricResult(value=0, period_value=0)
    cumulative, period = _flow(db, Asset, as_at, Asset.company_id.in_(external))
    return MetricResult(value=cumulative, period_value=period)


def incidents_raised(db: Session, as_at: datetime) -> MetricResult:
    from db.models.incident import Incident

    external = _external_company_ids(db)
    if not external:
        return MetricResult(value=0, period_value=0)
    cumulative, period = _flow(db, Incident, as_at, Incident.company_id.in_(external))
    return MetricResult(value=cumulative, period_value=period)


# ── Registry ──────────────────────────────────────────────────────────────────
#
# `label` and `unit` live here rather than in the dashboard so the API can
# describe its own payload and a new metric needs no frontend change.

@dataclass
class MetricDef:
    key: str
    label: str
    group: str
    unit: str           # 'count' | 'percent' | 'hectares'
    fn: Callable[[Session, datetime], MetricResult]
    kind: str           # 'stock' | 'flow'


METRICS: list[MetricDef] = [
    MetricDef("insights.verified_users", "Verified users", "Insights", "count", verified_users, "stock"),
    MetricDef("insights.mau", "MAU", "Insights", "count", insights_mau, "stock"),
    MetricDef("insights.wau", "WAU", "Insights", "count", insights_wau, "stock"),
    MetricDef("insights.wau_mau_pct", "WAU/MAU", "Insights", "percent", wau_mau_ratio, "stock"),
    MetricDef("insights.newsletter_pct", "Newsletter opt-in", "Insights", "percent", newsletter_opt_in_pct, "stock"),
    MetricDef("data.active_stations", "Active weather stations", "Data", "count", active_weather_stations, "stock"),
    MetricDef("grow.companies", "Grow companies", "Grow", "count", grow_companies, "stock"),
    MetricDef("grow.users", "Grow users", "Grow", "count", grow_users, "stock"),
    MetricDef("grow.active_users", "Grow users active", "Grow", "count", grow_active_users, "stock"),
    MetricDef("grow.ha_managed", "Ha under management", "Grow", "hectares", ha_under_management, "stock"),
    MetricDef("grow.blocks", "Blocks", "Grow", "count", grow_blocks, "stock"),
    MetricDef("grow.properties", "Properties", "Grow", "count", grow_properties, "stock"),
    MetricDef("grow.tasks_scheduled", "Tasks scheduled", "Grow", "count", tasks_scheduled, "flow"),
    MetricDef("grow.tasks_completed", "Tasks completed", "Grow", "count", tasks_completed, "flow"),
    MetricDef("grow.observation_runs", "Observation runs", "Grow", "count", observation_runs, "flow"),
    MetricDef("grow.observation_spots", "Observation spots", "Grow", "count", observation_spots, "flow"),
    MetricDef("grow.risks", "Risks managed", "Grow", "count", risks_managed, "flow"),
    MetricDef("grow.assets", "Assets managed", "Grow", "count", assets_managed, "flow"),
    MetricDef("grow.incidents", "Incidents raised", "Grow", "count", incidents_raised, "flow"),
]

# Seeded by hand, never computed. `insights.live_subregions` has no rule yet —
# "complete view" was never defined (see the plan §3.4), and it moved 39% -> 61%
# in a month, so a definition IS being applied manually. Capturing it is what
# would let a function take this over.
MANUAL_ONLY_METRICS = {
    "insights.live_subregions": MetricDef(
        "insights.live_subregions", "Live sub-regions (complete)", "Insights",
        "percent", None, "stock",
    ),
}

METRICS_BY_KEY = {m.key: m for m in METRICS}
ALL_METRIC_DEFS = {**METRICS_BY_KEY, **MANUAL_ONLY_METRICS}


def compute_all(db: Session, as_at: datetime) -> dict[str, MetricResult]:
    """Every computed metric at one instant. Manual-only metrics are skipped."""
    out: dict[str, MetricResult] = {}
    for m in METRICS:
        result = m.fn(db, as_at)
        result.meta = {**(result.meta or {}),
                       "definitions_version": DEFINITIONS_VERSION,
                       "source": "computed"}
        out[m.key] = result
    return out
