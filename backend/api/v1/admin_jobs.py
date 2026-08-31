# api/v1/admin_jobs.py - Scheduled job health, for the admin dashboard
"""Is every scheduled job actually producing anything, and how late is it.

## Freshness of the OUTPUT, not the exit status of the job

Every check here asks the same question: **what is the newest row this job is
supposed to have written, and how old is it?** Nothing here reads a run log as
its primary signal, and that is the whole design.

The alternative was tried and failed repeatedly on this platform:

  * The daily surfaces workflow reported SUCCESS on every run for five days
    while publishing nothing — each green tick was a daylight-saving skip.
  * The 18:00 pipeline went dark for three days in August 2026 the same way. Both
    halves of a cron pair discarded themselves, the workflow went green, and the
    zone rollups, disease and phenology simply stopped. Nothing raised, because
    nothing was watching the OUTPUT.
  * `run_ingestion` once printed "Found 0 active Harvest stations" and exited 0
    for an entire fleet backfill.

A job that ran and did nothing is indistinguishable from a job that never ran,
unless you look at what it should have produced. So that is what this looks at.

## Thresholds are two intervals, not one

A job is `late` at one missed interval and `stale` at two. One interval absorbs
the ordinary lateness of a scheduler — GitHub's own has been measured at 24-106
minutes on this repository, and once at nine hours — so alarming at one would
cry wolf daily. Two consecutive misses is the point at which lateness stops
being lateness.

## Why some jobs are allowed to look old

`max_age_hours` is the job's cadence plus its designed-in data lag, and for the
surfaces that lag is deliberate and large. The daily fit targets D-2 because one
Canterbury source lands ~24.8 h behind wall clock and carries ten thermometers
in the largest temperature-deficit region in the country. So a *healthy*
surfaces job produces a valid_at that is two days old, and comparing it against
now() without that allowance would show permanent failure.

## Nothing here touches `weather_data` unbounded

That view spans 47 partitions and ~35M rows; an unbounded aggregate over it once
scanned 96M. Every query below either hits a small table or carries a timestamp
bound. Keep it that way.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.admin_security import require_admin
from db.models.public_user import PublicUser
from db.session import get_db
from schemas.admin import (JobHistoryDay, JobHistoryItem, JobHistoryResponse,
                           JobStatusItem, JobStatusResponse)

router = APIRouter(prefix="/jobs", tags=["Admin - Jobs"])


# One entry per scheduled job.
#
#   sql          -> must return a single timestamp: the newest thing this job
#                   produced. NULL means it has produced nothing at all.
#   max_age      -> cadence + designed data lag, in hours. Older than this is
#                   `late`; older than twice this is `stale`.
#   detail_sql   -> optional single scalar shown beside the age, for the one
#                   number that says whether the output is any good.
#
# `runs_on` is recorded because when something is late, where it runs is the
# first thing you need to know. As of 2026-08-31 NOTHING here runs on GitHub
# Actions: ingestion and Pro site population are cron on the auxein-ingest box,
# everything else is EventBridge Scheduler -> Fargate. If a label below ever
# says GitHub again, either the migration was reverted or this list went stale —
# both are worth stopping for.
JOBS = [
    {
        "key": "weather_ingestion",
        "name": "Weather ingestion",
        "runs_on": "EC2 cron :05",
        "cadence": "hourly",
        "produces": "timeseries_observations",
        "max_age": 3.0,
        # Bounded to 3 days: this is the one check that touches the partitioned
        # view, and an unbounded max() there fans out across all 47 partitions.
        "sql": """SELECT max(timestamp) FROM weather_data
                   WHERE timestamp > now() - interval '3 days'""",
        "detail_sql": """SELECT count(DISTINCT station_id) FROM weather_data
                          WHERE timestamp > now() - interval '6 hours'""",
        "detail_label": "stations reporting (6 h)",
    },
    {
        "key": "daily_aggregation",
        "name": "Daily aggregation",
        "runs_on": "Fargate, 6-hourly :20 NZ",
        "cadence": "every 6 h",
        "produces": "weather_data_daily",
        # 6 h cadence + up to 2 days of designed lag before a day is complete.
        "max_age": 54.0,
        "sql": "SELECT max(date)::timestamptz FROM weather_data_daily",
        "detail_sql": """SELECT count(*) FROM weather_data_daily
                          WHERE date = (SELECT max(date) FROM weather_data_daily)""",
        "detail_label": "stations on the newest day",
    },
    {
        "key": "daily_qc",
        "name": "Daily QC",
        "runs_on": "Fargate, 03:00 + 18:00 NZ",
        "cadence": "every 6 h",
        "produces": "weather_qc_run",
        "max_age": 12.0,
        # The run table, not the findings: a pass that finds nothing writes no
        # finding, so findings cannot distinguish "clean" from "never ran".
        "sql": "SELECT max(started_at) FROM weather_qc_run",
        "detail_sql": """SELECT count(*) FROM weather_qc_run
                          WHERE started_at > now() - interval '7 days'""",
        "detail_label": "runs in 7 days",
    },
    {
        "key": "zone_hourly",
        "name": "Hourly zone rollup",
        "runs_on": "Fargate, 18:00 NZ",
        "cadence": "daily",
        "produces": "climate_zone_hourly",
        "max_age": 48.0,
        "sql": "SELECT max(timestamp_utc) FROM climate_zone_hourly",
        "detail_sql": """SELECT count(DISTINCT zone_id) FROM climate_zone_hourly
                          WHERE timestamp_utc > now() - interval '48 hours'""",
        "detail_label": "zones covered",
    },
    {
        "key": "zone_daily",
        "name": "Daily zone rollup",
        "runs_on": "Fargate, 18:00 NZ",
        "cadence": "daily",
        "produces": "climate_zone_daily",
        "max_age": 60.0,
        "sql": "SELECT max(date)::timestamptz FROM climate_zone_daily",
        # 23 is the whole country. Anything less means a region page is empty,
        # which is the failure this rollup was rebuilt to fix.
        "detail_sql": """SELECT count(DISTINCT zone_id) FROM climate_zone_daily
                          WHERE date = (SELECT max(date) FROM climate_zone_daily)""",
        "detail_label": "of 23 zones",
    },
    {
        "key": "phenology",
        "name": "Phenology",
        "runs_on": "Fargate, 18:00 NZ",
        "cadence": "daily",
        "produces": "phenology_estimates",
        "max_age": 60.0,
        "sql": "SELECT max(estimate_date)::timestamptz FROM phenology_estimates",
        "detail_sql": None,
        "detail_label": None,
    },
    {
        "key": "disease_zone",
        "name": "Disease pressure (zones)",
        "runs_on": "Fargate, 18:00 NZ",
        "cadence": "daily",
        "produces": "disease_pressure",
        "max_age": 60.0,
        "sql": "SELECT max(date)::timestamptz FROM disease_pressure",
        "detail_sql": """SELECT count(DISTINCT zone_id) FROM disease_pressure
                          WHERE date = (SELECT max(date) FROM disease_pressure)""",
        "detail_label": "zones scored",
    },
    {
        "key": "surfaces",
        "name": "Daily surfaces",
        "runs_on": "Fargate, 03:00 NZ",
        "cadence": "daily",
        "produces": "surface_run",
        # 24 h cadence + the deliberate D-2 target. A healthy fit is two days
        # behind by design; see the module docstring.
        "max_age": 78.0,
        "sql": """SELECT max(valid_at) FROM surface_run
                   WHERE granularity = 'daily' AND statistic IS NULL""",
        # Four variables on the newest day. Three would mean the era pin or one
        # basis failed silently, which is exactly how the temperature variables
        # went missing for five days.
        "detail_sql": """SELECT count(DISTINCT variable) FROM surface_run
                          WHERE granularity = 'daily' AND statistic IS NULL
                            AND valid_at = (SELECT max(valid_at) FROM surface_run
                                             WHERE granularity = 'daily'
                                               AND statistic IS NULL)""",
        "detail_label": "of 4 variables",
    },
    {
        "key": "site_daily",
        "name": "Pro site dailies",
        "runs_on": "Fargate, after the fit",
        "cadence": "daily",
        "produces": "insights_site_daily",
        "max_age": 78.0,
        "sql": "SELECT max(date)::timestamptz FROM insights_site_daily",
        "detail_sql": """SELECT count(DISTINCT site_id) FROM insights_site_daily
                          WHERE date = (SELECT max(date) FROM insights_site_daily)""",
        "detail_label": "sites populated",
    },
    {
        "key": "site_disease",
        "name": "Disease pressure (points)",
        "runs_on": "Fargate, 6-hourly :20 NZ",
        "cadence": "every 6 h",
        # Scores whole LOCAL days and ends at yesterday, so ~48 h is healthy.
        "max_age": 60.0,
        "produces": "insights_site_disease",
        "sql": "SELECT max(date)::timestamptz FROM insights_site_disease",
        "detail_sql": """SELECT count(*) FROM insights_site_disease
                          WHERE date = (SELECT max(date) FROM insights_site_disease)
                            AND humidity_available""",
        "detail_label": "sites with humidity",
    },
]


# --- history ---------------------------------------------------------------
#
# `/status` answers "is it healthy right now". This answers "has it been healthy
# every day", which is a different question and the one that was missing. The
# three-day August outage was invisible precisely because the platform only ever
# looked at the newest row: a catch-up run repaired the newest day and the hole
# behind it stayed there, healthy-looking, for as long as nobody counted days.
#
#   sql       -> (day, count) rows, ONE ROW PER DAY THAT PRODUCED ANYTHING.
#                Days with no output are simply absent; the caller fills the
#                calendar, so a hole cannot be confused with a zero.
#   axis      -> "data": the day the rows DESCRIBE. A gap is missing data.
#                "run":  the day the job EXECUTED. A gap is a missed run.
#                They are not interchangeable. `daily_qc` is the only "run" job
#                here, because a clean pass writes no finding and its output day
#                is therefore meaningless.
#   expected  -> what a complete day reaches. None where there is no fixed
#                target and only presence can be judged.
#
# Kept beside JOBS rather than inside it so the status path — which is polled —
# carries no query it does not run. A job with no entry here reports the absence
# explicitly rather than disappearing from the page.
HISTORY = {
    "weather_ingestion": {
        "axis": "data", "expected": None, "unit": "stations",
        # NZ local days, because that is the day a grower means, and bounded by
        # the same timestamp predicate the status check uses — an unbounded
        # group-by here would fan out across all 47 partitions.
        "sql": """SELECT (timestamp AT TIME ZONE 'Pacific/Auckland')::date AS day,
                         count(DISTINCT station_id) AS n
                    FROM weather_data
                   WHERE timestamp >= now() - make_interval(days => :days)
                   GROUP BY 1 ORDER BY 1""",
    },
    "daily_aggregation": {
        "axis": "data", "expected": None, "unit": "station-days",
        "sql": """SELECT date AS day, count(*) AS n FROM weather_data_daily
                   WHERE date >= :start GROUP BY 1 ORDER BY 1""",
    },
    "daily_qc": {
        "axis": "run", "expected": None, "unit": "runs",
        "sql": """SELECT (started_at AT TIME ZONE 'Pacific/Auckland')::date AS day,
                         count(*) AS n
                    FROM weather_qc_run
                   WHERE started_at >= now() - make_interval(days => :days)
                   GROUP BY 1 ORDER BY 1""",
    },
    "zone_hourly": {
        # 22, not 23. The hourly rollup is STATION-based, and one zone has no
        # station inside it — measured at 22 of 23 every day since the quality
        # filter was widened on 2026-08-21. `zone_daily` reaches 23 because it
        # was moved onto the surface, which has a value for every cell whether a
        # station is there or not. Setting this to 23 would paint every healthy
        # day amber, and an expectation that cries wolf is worse than none.
        "axis": "data", "expected": 22, "unit": "zones",
        # `timestamp_utc` is `timestamp WITHOUT time zone` — naive UTC, unlike
        # every other timestamp on this page. A single `AT TIME ZONE
        # 'Pacific/Auckland'` therefore runs BACKWARDS on it: it interprets the
        # naive value as Auckland local instead of converting UTC to Auckland,
        # moving every row 12 hours the wrong way. The first version of this
        # query did exactly that and manufactured a hole on the newest day,
        # which looked precisely like the outage this endpoint exists to find.
        # Two clauses: label it UTC, then convert.
        "sql": """SELECT (timestamp_utc AT TIME ZONE 'UTC'
                            AT TIME ZONE 'Pacific/Auckland')::date AS day,
                         count(DISTINCT zone_id) AS n
                    FROM climate_zone_hourly
                   WHERE timestamp_utc >=
                         (now() - make_interval(days => :days)) AT TIME ZONE 'UTC'
                   GROUP BY 1 ORDER BY 1""",
    },
    "zone_daily": {
        "axis": "data", "expected": 23, "unit": "zones",
        "sql": """SELECT date AS day, count(DISTINCT zone_id) AS n
                    FROM climate_zone_daily
                   WHERE date >= :start GROUP BY 1 ORDER BY 1""",
    },
    "phenology": {
        "axis": "data", "expected": None, "unit": "estimates",
        "sql": """SELECT estimate_date AS day, count(*) AS n
                    FROM phenology_estimates
                   WHERE estimate_date >= :start GROUP BY 1 ORDER BY 1""",
    },
    "disease_zone": {
        # Scored from the hourly rollup, so it inherits its 22 — see zone_hourly.
        "axis": "data", "expected": 22, "unit": "zones",
        "sql": """SELECT date AS day, count(DISTINCT zone_id) AS n
                    FROM disease_pressure
                   WHERE date >= :start GROUP BY 1 ORDER BY 1""",
    },
    "surfaces": {
        # Four, every day. Three is the signature of the era-pin failure that
        # dropped the three temperature variables and published rainfall alone,
        # and it is silent by construction — the job still succeeds.
        "axis": "data", "expected": 4, "unit": "variables",
        "sql": """SELECT valid_at::date AS day, count(DISTINCT variable) AS n
                    FROM surface_run
                   WHERE granularity = 'daily' AND statistic IS NULL
                     AND valid_at >= :start GROUP BY 1 ORDER BY 1""",
    },
    "site_daily": {
        "axis": "data", "expected": None, "unit": "sites",
        "sql": """SELECT date AS day, count(DISTINCT site_id) AS n
                    FROM insights_site_daily
                   WHERE date >= :start GROUP BY 1 ORDER BY 1""",
    },
    "site_disease": {
        "axis": "data", "expected": None, "unit": "sites",
        "sql": """SELECT date AS day, count(*) AS n
                    FROM insights_site_disease
                   WHERE date >= :start GROUP BY 1 ORDER BY 1""",
    },
}

MAX_HISTORY_DAYS = 90


def _classify(age_hours: Optional[float], max_age: float) -> str:
    """ok / late / stale / never — two intervals, not one. See the docstring."""
    if age_hours is None:
        return "never"
    if age_hours <= max_age:
        return "ok"
    if age_hours <= max_age * 2:
        return "late"
    return "stale"


@router.get("/status", response_model=JobStatusResponse)
def get_job_status(
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    """Every scheduled job, by the age of what it last produced.

    One query per job against small tables (plus one bounded query against the
    partitioned view), so this is a handful of milliseconds and safe to poll
    from a dashboard.

    A failing check does NOT fail the endpoint. If one table is missing or
    renamed, that job reports `unknown` and the other nine still answer — a
    monitoring page that goes blank because one of its checks broke is worse
    than no page, because it looks like an outage.
    """
    now = datetime.now(timezone.utc)
    items: list[JobStatusItem] = []

    for job in JOBS:
        last_at = None
        detail_value = None
        error = None
        try:
            last_at = db.execute(text(job["sql"])).scalar()
            if job.get("detail_sql"):
                detail_value = db.execute(text(job["detail_sql"])).scalar()
        except Exception as exc:                                # noqa: BLE001
            # Roll back so one broken check cannot poison the session for the
            # checks that follow it.
            db.rollback()
            error = str(exc)[:200]

        age = None
        if last_at is not None:
            if last_at.tzinfo is None:
                last_at = last_at.replace(tzinfo=timezone.utc)
            age = (now - last_at).total_seconds() / 3600.0

        items.append(JobStatusItem(
            key=job["key"],
            name=job["name"],
            runs_on=job["runs_on"],
            cadence=job["cadence"],
            produces=job["produces"],
            last_at=last_at,
            age_hours=round(age, 1) if age is not None else None,
            max_age_hours=job["max_age"],
            status="unknown" if error else _classify(age, job["max_age"]),
            detail_value=int(detail_value) if detail_value is not None else None,
            detail_label=job.get("detail_label"),
            error=error,
        ))

    counts: dict[str, int] = {}
    for it in items:
        counts[it.status] = counts.get(it.status, 0) + 1

    # The banner reports the WORST job, not an average. Nine healthy jobs and one
    # dark pipeline is not 90% healthy — it is an outage with company.
    worst = "ok"
    for level in ("stale", "never", "unknown", "late"):
        if counts.get(level):
            worst = level
            break

    return JobStatusResponse(
        jobs=items,
        checked_at=now,
        counts_by_status=counts,
        overall=worst,
    )


@router.get("/history", response_model=JobHistoryResponse)
def get_job_history(
    days: int = Query(21, ge=1, le=MAX_HISTORY_DAYS),
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    """What each job produced on each of the last `days` days.

    `/status` says whether a job is healthy now. That is not the same as
    "it has been healthy", and the difference is what let a three-day outage
    pass unnoticed in August 2026: when the pipeline restarted it repaired the
    newest day, so the freshness check went green while the hole behind it
    stayed. Only counting days finds that.

    Days with no output are OMITTED from each job's list rather than returned
    as zero. The caller draws the calendar and every missing day is a hole —
    which means a job whose table was renamed reports an `error` and an empty
    list, and cannot be mistaken for a job that produced nothing.
    """
    now = datetime.now(timezone.utc)
    end = now.date()
    start = end - timedelta(days=days - 1)
    items: list[JobHistoryItem] = []

    for job in JOBS:
        spec = HISTORY.get(job["key"])
        if spec is None:
            # A job in JOBS with no history query is a gap in this file, not a
            # gap in the data. Say which it is.
            items.append(JobHistoryItem(
                key=job["key"], name=job["name"], axis="data",
                error="no history query is defined for this job"))
            continue

        rows, error = [], None
        try:
            result = db.execute(text(spec["sql"]),
                                {"days": days, "start": start}).fetchall()
            rows = [JobHistoryDay(day=r[0], count=int(r[1] or 0))
                    for r in result if r[0] is not None and r[0] >= start]
        except Exception as exc:                                # noqa: BLE001
            # Same contract as /status: one broken check must not blank the
            # page or poison the session for the checks after it.
            db.rollback()
            error = str(exc)[:200]

        items.append(JobHistoryItem(
            key=job["key"], name=job["name"], axis=spec["axis"],
            expected=spec.get("expected"), unit=spec.get("unit"),
            days=rows, error=error))

    return JobHistoryResponse(jobs=items, start=start, end=end, checked_at=now)
