# api/v1/admin_kpis.py — the platform KPI dashboard's data.
#
# Scoped in docs/plans/KPI_DASHBOARD_SCOPE_2026-09-15.md.
#
# READS NEVER COMPUTE. Every number here comes from `kpi_snapshots`, written by
# the monthly job or the backfill script. A dashboard that recomputed on load
# would be slow, would disagree with its own history the moment a definition
# changed, and — worse — would quietly show a "past" month recalculated under
# today's rules. Recomputation is an explicit, per-month act (see /recompute).
from datetime import datetime, timezone, date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from db.session import get_db
from db.models.kpi_snapshot import KpiSnapshot
from db.models.public_user import PublicUser
from core.admin_security import require_admin
from services.kpi_metrics import ALL_METRIC_DEFS, METRICS, compute_all

router = APIRouter()


def _serialise(row: KpiSnapshot) -> dict:
    return {
        "date": row.snapshot_date.isoformat(),
        "value": float(row.value) if row.value is not None else None,
        "period_value": float(row.period_value) if row.period_value is not None else None,
        # Surfaced, not buried: the dashboard marks the seam where a series
        # switches from hand-tracked to computed. A method change that looks
        # like a step change is the classic way these charts mislead.
        "source": (row.meta or {}).get("source", "computed"),
        "meta": row.meta or {},
    }


@router.get("/kpis")
def get_kpis(
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
    months: int = Query(24, ge=1, le=120, description="How many months back to return."),
):
    """Every KPI series, plus the latest value and month-over-month delta."""
    rows = db.execute(
        select(KpiSnapshot).order_by(KpiSnapshot.metric_key, KpiSnapshot.snapshot_date)
    ).scalars().all()

    by_metric: dict[str, list] = {}
    for r in rows:
        by_metric.setdefault(r.metric_key, []).append(r)

    out = []
    for key, definition in ALL_METRIC_DEFS.items():
        series = [_serialise(r) for r in by_metric.get(key, [])][-months:]
        latest = series[-1] if series else None
        previous = series[-2] if len(series) > 1 else None

        delta = None
        if latest and previous and previous["value"] not in (None, 0):
            delta = round(
                ((latest["value"] - previous["value"]) / previous["value"]) * 100, 1
            )

        out.append({
            "key": key,
            "label": definition.label,
            "group": definition.group,
            "unit": definition.unit,
            "kind": definition.kind,
            # No function computes this one — it exists as seeded history only.
            "computed": definition.fn is not None,
            "latest": latest,
            "previous": previous,
            "delta_pct": delta,
            "series": series,
        })

    return {
        "metrics": out,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/kpis/recompute")
def recompute_month(
    month: str = Query(..., description="Month to recompute, YYYY-MM."),
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    """Recompute one month's computed metrics.

    Deliberately explicit and one month at a time. Snapshots are a historical
    record; silently recomputing the whole series after a definition change
    would rewrite history rather than show it changing.

    Manual rows are never touched — for the months they cover they are the more
    accurate record (the underlying flags are mutable, so any reconstruction
    reports today's state against an old population).
    """
    try:
        year, mon = map(int, month.split("-"))
        as_at = datetime(year, mon, 1, tzinfo=timezone.utc)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="month must be YYYY-MM")

    if as_at > datetime.now(timezone.utc):
        raise HTTPException(
            status_code=400,
            detail="Cannot snapshot a future month — the period has not closed.",
        )

    snapshot_date = as_at.date()

    # Which of this month's rows are hand-kept, and so must not be overwritten.
    manual = {
        r[0]
        for r in db.execute(
            select(KpiSnapshot.metric_key, KpiSnapshot.meta).where(
                KpiSnapshot.snapshot_date == snapshot_date
            )
        ).all()
        if isinstance(r[1], dict) and r[1].get("source") == "manual"
    }

    results = compute_all(db, as_at)
    written, skipped = 0, []
    for m in METRICS:
        if m.key in manual:
            skipped.append(m.key)
            continue
        r = results[m.key]
        db.execute(
            pg_insert(KpiSnapshot.__table__).values(
                snapshot_date=snapshot_date,
                metric_key=m.key,
                value=r.value,
                period_value=r.period_value,
                meta=r.meta,
            ).on_conflict_do_update(
                constraint="uq_kpi_snapshot",
                set_={"value": r.value, "period_value": r.period_value, "meta": r.meta},
            )
        )
        written += 1

    db.commit()
    return {
        "month": month,
        "written": written,
        "skipped_manual": skipped,
    }
