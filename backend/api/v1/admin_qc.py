# api/v1/admin_qc.py - Daily QC monitoring endpoints
"""Surfaces the daily QC stage: did it run, what did it find, who keeps failing.

`daily_qc.py` writes two tables and until now nothing read either of them.

  * `weather_qc_run`  — one row per invocation. This is the HEALTH signal, and
    it is the only one there is: a pass that finds nothing writes no finding, so
    before this table existed "ran clean" and "never ran" were the same
    observation.
  * `weather_daily_qc` — one row per finding, keyed by the day JUDGED rather
    than the day the pass ran.

That distinction drives the whole design here. Coverage ("has every day been
examined") can only be answered from the run windows, and the finding counts
alone can never answer it — which is exactly how a stalled QC stage would have
looked healthy.

## The rate is the alarm, not the finding

One neighbour rejection is a thunderstorm. The same station every day is a
broken sensor, and it is a SOURCE problem the fit-time screen cannot fix. So the
offenders list is ranked by trip RATE against the days that were actually
examined, not by raw count, and anything at or above the persistence threshold
is called out.

## Performance

Everything here reads `weather_qc_run` and `weather_daily_qc`, both ordinary
small tables, joined to `weather_stations` for names. **Nothing touches
`weather_data`**, which is a view over 47 partitions where an unbounded query
once aggregated 96M rows. Keep it that way — if a future panel needs a raw
observation, bound it by timestamp.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from typing import Optional

from db.session import get_db
from db.models.public_user import PublicUser
from core.admin_security import require_admin
from schemas.admin import (
    QcRunItem,
    QcRunsResponse,
    QcSummaryResponse,
    QcHealth,
    QcCoverageDay,
    QcCheckCount,
    QcOffender,
    QcFindingItem,
    QcFindingsResponse,
)

router = APIRouter(prefix="/qc", tags=["Admin - QC"])


# The scheduled cadence. QC rides `daily-aggregation.yml`, which fires every six
# hours; GitHub's scheduler then adds 24-106 minutes of its own. A gap of two
# whole intervals is therefore the first point at which lateness stops being
# ordinary and starts meaning something is wrong.
EXPECTED_INTERVAL_HOURS = 6
STALE_AFTER_HOURS = EXPECTED_INTERVAL_HOURS * 2

# A run still 'running' this long after it opened did not finish. The row is
# opened before the first day is fetched and a full pass over a few days takes
# a couple of minutes, so an hour is generous rather than tight.
RUNNING_STUCK_HOURS = 1.0

# Matches PERSISTENT_TRIP_RATE in daily_qc / run_live. A station tripping on
# this share of the days it was examined is a source fault, not weather.
PERSISTENT_TRIP_RATE = 0.20

MAX_WINDOW_DAYS = 180


def _rows(db: Session, sql: str, **params):
    return db.execute(text(sql), params).mappings().all()


@router.get("/summary", response_model=QcSummaryResponse)
def get_qc_summary(
    days: int = Query(14, ge=1, le=MAX_WINDOW_DAYS),
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    """Everything the top of the QC page needs, in one call."""
    now = datetime.now(timezone.utc)
    end = now.date()
    start = end - timedelta(days=days - 1)

    # ---- health, from the runs -------------------------------------------
    last = _rows(db, """
        SELECT run_id, status, started_at, finished_at, window_start,
               window_end, n_station_days, n_findings, n_reject, n_flag,
               n_quarantined_rows, n_cleared_rows, n_late_enforced,
               reject_rate, max_reject_rate, reaggregated, error
        FROM weather_qc_run ORDER BY started_at DESC LIMIT 1
    """)
    last_run = dict(last[0]) if last else None

    tallies = _rows(db, """
        SELECT status, count(*) AS n FROM weather_qc_run
        WHERE started_at >= :since GROUP BY status
    """, since=now - timedelta(days=days))
    by_status = {r["status"]: r["n"] for r in tallies}

    # A run left at 'running' is the signature of a pass that was killed. It is
    # only meaningful once enough time has passed that it cannot still be going.
    stuck = _rows(db, """
        SELECT count(*) AS n FROM weather_qc_run
        WHERE status = 'running' AND started_at < :cutoff
    """, cutoff=now - timedelta(hours=RUNNING_STUCK_HOURS))[0]["n"]

    hours_since = None
    if last_run and last_run["started_at"]:
        hours_since = (now - last_run["started_at"]).total_seconds() / 3600.0

    if last_run is None:
        health_status = "unknown"
    elif stuck or by_status.get("failed") or by_status.get("aborted"):
        # An abort is not a failure of the network — it is the guard refusing to
        # act — but it means nothing was cleaned, so it needs a human either way.
        health_status = "attention"
    elif hours_since is not None and hours_since > STALE_AFTER_HOURS:
        health_status = "stale"
    else:
        health_status = "healthy"

    health = QcHealth(
        status=health_status,
        hours_since_last_run=round(hours_since, 2) if hours_since is not None else None,
        expected_interval_hours=EXPECTED_INTERVAL_HOURS,
        n_runs=sum(by_status.values()),
        n_complete=by_status.get("complete", 0),
        n_aborted=by_status.get("aborted", 0),
        n_failed=by_status.get("failed", 0),
        n_running=by_status.get("running", 0),
        n_stuck=stuck,
        last_run=QcRunItem(**last_run) if last_run else None,
    )

    # ---- coverage: which days were actually examined ----------------------
    # Answered from the run WINDOWS, never from the findings. A day with no
    # findings and a day never checked produce identical finding rows: none.
    covered = {
        r["day"]: r["n_runs"] for r in _rows(db, """
            -- CAST(), not `:start::date`. SQLAlchemy's bind parser reads the
            -- second colon of `::` as the start of another parameter name and
            -- leaves a bare `:` in the SQL it sends.
            SELECT d::date AS day,
                   count(r.run_id) AS n_runs
            FROM generate_series(CAST(:start AS date),
                                 CAST(:end AS date), '1 day') AS d
            LEFT JOIN weather_qc_run r
                   ON d::date BETWEEN r.window_start AND r.window_end
                  AND r.status IN ('complete', 'aborted')
            GROUP BY d::date
        """, start=start, end=end)
    }
    coverage = [
        QcCoverageDay(date=d, n_runs=covered.get(d, 0), examined=covered.get(d, 0) > 0)
        for d in (start + timedelta(days=i) for i in range(days))
    ]

    # ---- what fired, and what did not ------------------------------------
    # Counts come from the findings; the FULL check list comes from the most
    # recent run's `checks` key set, so a check that fired zero times is still
    # listed. Without that a check dropped in a refactor looks like one that is
    # passing, forever.
    fired = {
        (r["check_name"], r["severity"]): r for r in _rows(db, """
            SELECT check_name, severity, count(*) AS n,
                   count(DISTINCT station_id) AS n_stations
            FROM weather_daily_qc
            WHERE date BETWEEN :start AND :end
            GROUP BY check_name, severity
        """, start=start, end=end)
    }
    reg = _rows(db, """
        SELECT checks FROM weather_qc_run
        WHERE checks IS NOT NULL ORDER BY started_at DESC LIMIT 1
    """)
    registered = sorted((reg[0]["checks"] or {}).keys()) if reg else []

    checks = [QcCheckCount(check_name=name, severity=sev, n=r["n"],
                           n_stations=r["n_stations"])
              for (name, sev), r in sorted(fired.items(), key=lambda kv: -kv[1]["n"])]
    silent = sorted(n for n in registered
                    if not any(c.check_name == n for c in checks))

    # ---- repeat offenders -------------------------------------------------
    # `n_days_examined` is the honest denominator: the days in the window that a
    # run actually covered. Dividing by the window length would understate every
    # rate whenever the scheduler had been down — which is precisely when the
    # rate matters most.
    n_examined = sum(1 for c in coverage if c.examined) or 1
    offenders = [
        QcOffender(
            station_id=r["station_id"],
            station_name=r["station_name"],
            station_code=r["station_code"],
            data_source=r["data_source"],
            n_findings=r["n_findings"],
            n_reject=r["n_reject"],
            n_days=r["n_days"],
            n_days_examined=n_examined,
            trip_rate=round(r["n_days"] / n_examined, 3),
            persistent=(r["n_days"] / n_examined) >= PERSISTENT_TRIP_RATE,
            first_seen=r["first_seen"],
            last_seen=r["last_seen"],
            checks=r["checks"],
        )
        for r in _rows(db, """
            SELECT q.station_id,
                   s.station_name, s.station_code, s.data_source,
                   count(*) AS n_findings,
                   count(*) FILTER (WHERE q.severity = 'reject') AS n_reject,
                   count(DISTINCT q.date) AS n_days,
                   min(q.date) AS first_seen, max(q.date) AS last_seen,
                   array_agg(DISTINCT q.check_name) AS checks
            FROM weather_daily_qc q
            LEFT JOIN weather_stations s ON s.station_id = q.station_id
            WHERE q.date BETWEEN :start AND :end
            GROUP BY q.station_id, s.station_name, s.station_code, s.data_source
            ORDER BY count(DISTINCT q.date) DESC, count(*) DESC
            LIMIT 50
        """, start=start, end=end)
    ]

    totals = _rows(db, """
        SELECT count(*) AS n_findings,
               count(*) FILTER (WHERE severity = 'reject') AS n_reject,
               count(*) FILTER (WHERE severity = 'flag') AS n_flag,
               count(DISTINCT station_id) AS n_stations
        FROM weather_daily_qc WHERE date BETWEEN :start AND :end
    """, start=start, end=end)[0]

    return QcSummaryResponse(
        window_start=start, window_end=end, days=days,
        health=health, coverage=coverage, checks=checks,
        silent_checks=silent, offenders=offenders,
        n_findings=totals["n_findings"], n_reject=totals["n_reject"],
        n_flag=totals["n_flag"], n_stations=totals["n_stations"],
    )


@router.get("/runs", response_model=QcRunsResponse)
def list_qc_runs(
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    """The run log — the only record that a pass happened at all."""
    rows = _rows(db, """
        SELECT run_id, status, started_at, finished_at, window_start,
               window_end, n_station_days, n_findings, n_reject, n_flag,
               n_quarantined_rows, n_cleared_rows, n_late_enforced,
               reject_rate, max_reject_rate, reaggregated, error
        FROM weather_qc_run ORDER BY started_at DESC LIMIT :limit
    """, limit=limit)
    return QcRunsResponse(runs=[QcRunItem(**dict(r)) for r in rows],
                          total=len(rows))


@router.get("/findings", response_model=QcFindingsResponse)
def list_qc_findings(
    days: int = Query(14, ge=1, le=MAX_WINDOW_DAYS),
    severity: Optional[str] = Query(None, pattern="^(reject|flag)$"),
    check_name: Optional[str] = None,
    station_id: Optional[int] = None,
    run_id: Optional[str] = None,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    """Findings, filterable. `detail` carries the per-check evidence as JSON."""
    end = datetime.now(timezone.utc).date()
    start = end - timedelta(days=days - 1)

    where = ["q.date BETWEEN :start AND :end"]
    params = {"start": start, "end": end, "limit": limit, "offset": offset}
    if severity:
        where.append("q.severity = :severity"); params["severity"] = severity
    if check_name:
        where.append("q.check_name = :check_name"); params["check_name"] = check_name
    if station_id:
        where.append("q.station_id = :station_id"); params["station_id"] = station_id
    if run_id:
        # A run id filter deliberately drops the date window: the point of
        # clicking a run is to see what THAT pass found, and its window may sit
        # outside the page's current range.
        where = ["q.run_id = :run_id"]
        params = {"run_id": run_id, "limit": limit, "offset": offset}
    clause = " AND ".join(where)

    total = db.execute(text(
        f"SELECT count(*) FROM weather_daily_qc q WHERE {clause}"),
        {k: v for k, v in params.items() if k not in ("limit", "offset")}
    ).scalar()

    rows = _rows(db, f"""
        SELECT q.id, q.station_id, s.station_name, s.station_code,
               s.data_source, q.date, q.variable, q.check_name, q.severity,
               q.value, q.expected, q.detail, q.action, q.run_id, q.created_at
        FROM weather_daily_qc q
        LEFT JOIN weather_stations s ON s.station_id = q.station_id
        WHERE {clause}
        ORDER BY q.date DESC, q.severity, q.station_id
        LIMIT :limit OFFSET :offset
    """, **params)

    return QcFindingsResponse(
        findings=[QcFindingItem(**dict(r)) for r in rows],
        total=total, limit=limit, offset=offset,
    )
