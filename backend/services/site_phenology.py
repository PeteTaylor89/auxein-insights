"""Phenology at a point: the zone model, driven by the site's own GDD.

`phenology_estimates` is keyed on `zone_id`, and the Pro site page reads it
through `site.zone_id` — so a subscriber's own point has been showing their
REGION's dates while looking site-specific. This computes it properly.

## Nothing about the model is re-implemented

`estimate_date`, `determine_stage` and the thresholds are IMPORTED from
`scripts.phenology_service`. A second copy of a calibrated model that drifts
from the first is worse than no second copy: the two would disagree by a few
days, both would look plausible, and there would be no way to tell which was
right. Only the SOURCE of the accumulation changes.

## Three things the site path gets for free, and one it has to work for

FREE — `insights_site_daily.gdd_cumulative` already accumulates base-0 GDD from
1 SEPTEMBER (`insights_site_service.accumulate_daily`). The zone job has to
subtract an Aug-31 offset from a 1-July running total to get there; here it is
simply the stored value.

FREE — the daily surface record starts 2026-07-01 and the 2027 vintage starts
2026-07-01, so the first vintage this can run on is covered from day one. There
is no partial-accumulation problem to guard against for 2027.

FREE — the trailing GDD rate is a mean over `gdd_daily`, which is stored.

WORKED FOR — the baseline. `insights_site_baseline` builds the site's curve for
GDD **base 10**; the phenology thresholds are **base 0**. So the base-0 site
baseline is rebuilt here from the same ingredients: the zone's daily `tmean_avg`
shifted by the site's own monthly temperature offset, summed as max(0, ·) from
1 September.

That shift-then-sum is exact rather than approximate at base 0, and the reason
is worth stating because it does NOT hold at base 10. Base-0 GDD is max(0,
tmean), and over a NZ Sep-Apr season tmean is above zero on effectively every
day, so the function is linear over the range and shifting the mean shifts the
sum by the same amount. At base 10 the threshold bites in the shoulders, the
function is convex, and a site 1 degC warmer gains a full degree-day in midsummer
but a fraction of one in October — which is exactly why
`insights_site_baseline` re-integrates rather than rescaling.
"""
from __future__ import annotations

import sys
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from scripts.phenology_service import (                             # noqa: E402
    estimate_date, determine_stage, get_vintage_year)
from services import insights_site_baseline as baseline_svc         # noqa: E402
from services import phenology_basis as basis                       # noqa: E402

# Matches the zone job. Not a preference — the projected date is a GDD shortfall
# divided by this rate, so a different window here would make a site's date
# differ from its region's for a reason that has nothing to do with the site.
GDD_RATE_LOOKBACK_DAYS = 14

# The two calibration origins. Flowering and veraison are calibrated from
# 1 September, harvest from 1 October, and a single accumulation cannot serve
# both — the zone job carries the same pair as day-of-vintage 62 and 92.
SEASON_START = (9, 1)
HARVEST_ORIGIN = (10, 1)


def thresholds(db: Session) -> list[dict]:
    """Active varieties, as plain dicts. Same table the zone job reads."""
    return [dict(r) for r in db.execute(text("""
        SELECT variety_code, variety_name, gdd_flowering, gdd_veraison,
               gdd_harvest_170, gdd_harvest_180, gdd_harvest_190,
               gdd_harvest_200, gdd_harvest_210, gdd_harvest_220
          FROM phenology_thresholds
         WHERE is_active = true
         ORDER BY variety_name
    """)).mappings().all()]


def site_gdd(db: Session, site_id: int, vintage: int,
             on: date) -> Optional[dict]:
    """The site's accumulation and trailing rate on one day.

    `gdd_cumulative` is already base 0 from 1 September, so `sep1` is read
    rather than derived. `oct1` needs the value at 30 September subtracted,
    which is one lookup rather than the zone job's offset machinery.
    """
    row = db.execute(text("""
        SELECT gdd_cumulative, gdd_daily
          FROM insights_site_daily
         WHERE site_id = :sid AND date = :d
    """), {"sid": site_id, "d": on}).mappings().first()
    if not row or row["gdd_cumulative"] is None:
        return None

    sep1 = Decimal(str(row["gdd_cumulative"]))

    # The harvest origin. Before 1 October there is nothing to accumulate from
    # and the answer is zero, not a negative number.
    oct1_anchor = date(vintage - 1, *HARVEST_ORIGIN)
    oct1 = Decimal("0")
    if on >= oct1_anchor:
        at_sep30 = db.execute(text("""
            SELECT gdd_cumulative FROM insights_site_daily
             WHERE site_id = :sid AND date < :anchor
               AND date >= :season_start
             ORDER BY date DESC LIMIT 1
        """), {"sid": site_id, "anchor": oct1_anchor,
               "season_start": date(vintage - 1, *SEASON_START)}).scalar()
        oct1 = max(Decimal("0"),
                   sep1 - Decimal(str(at_sep30 or 0)))

    # Trailing rate. Mean over the days PRESENT, not over 14 — a gap in the
    # daily record would otherwise divide by a full window and understate the
    # rate, pushing every projected date later.
    rate = db.execute(text("""
        SELECT avg(gdd_daily) FROM insights_site_daily
         WHERE site_id = :sid AND gdd_daily IS NOT NULL
           AND date <= :d AND date > :from_d
    """), {"sid": site_id, "d": on,
           "from_d": on - timedelta(days=GDD_RATE_LOOKBACK_DAYS)}).scalar()

    return {"sep1": sep1, "oct1": oct1,
            "rate": Decimal(str(rate)) if rate is not None else None}


def base0_baseline(db: Session, site, vintage: int) -> Optional[dict]:
    """The site's own 1986-2005 base-0 cumulative, by day of vintage.

    The zone's daily `tmean_avg`, shifted by the site's own monthly temperature
    offset, summed as max(0, .) from 1 September. See the module docstring for
    why shift-then-sum is exact at base 0 and would not be at base 10.

    Returns None where the site has no zone, or the zone has no daily baseline —
    the caller stores NULL and says which, rather than falling back to a
    regional stand-in that would defeat the purpose.
    """
    if not site.zone_id:
        return None
    curve = baseline_svc.zone_curve(db, site.zone_id)
    if not curve:
        return None

    adjustments = baseline_svc.month_adjustments(
        baseline_svc.zone_month_level(curve),
        baseline_svc.site_month_normal(db, site.id,
                                       baseline_svc.BASELINE_LO,
                                       baseline_svc.BASELINE_HI))

    out: dict[int, float] = {}
    total = 0.0
    for day in baseline_svc.season_days(vintage):
        dov = baseline_svc.day_of_vintage(day)
        rec = curve.get(dov)
        if not rec or rec.get("tmean_avg") is None:
            continue
        offset = (adjustments.get(day.month) or {}).get("tmean_offset", 0.0)
        total += max(0.0, rec["tmean_avg"] + offset)
        out[dov] = total
    return out or None


def estimate(db: Session, site, on: date) -> list[dict]:
    """One row per active variety for this site on this day."""
    vintage = get_vintage_year(on)
    gdd = site_gdd(db, site.id, vintage, on)
    if gdd is None:
        return []

    # THREE DIFFERENT REASONS FOR NO BASELINE, and they must not share one NULL.
    # "this site has no zone", "this zone has no daily climatology" and "the
    # season has not started" are separately actionable — the first is a
    # placement problem, the second is a known gap (zone 21, South Coast), and
    # the third resolves itself on 1 September. A single blank column would
    # send someone hunting for a bug in the third case.
    base_at = None
    if not site.zone_id:
        base_source = "no zone: this site sits outside every climate zone"
    else:
        base = base0_baseline(db, site, vintage)
        if base is None:
            base_source = f"zone {site.zone_id} has no daily baseline"
        else:
            base_at = base.get(baseline_svc.day_of_vintage(on))
            base_source = (
                f"site 1986-2005 (zone {site.zone_id} shape)"
                if base_at is not None
                else "before 1 September: the season has not started")

    days_vs = gdd_vs = None
    if base_at is not None and gdd["rate"] and gdd["rate"] > 0:
        gdd_vs = gdd["sep1"] - Decimal(str(base_at))
        days_vs = int(gdd_vs / gdd["rate"])

    # The regional figure for the SAME variety, vintage and estimate date, so
    # the pair stored on the row is a like-for-like comparison rather than
    # today's site number against whatever the zone table happens to hold.
    zone_rows = {}
    if site.zone_id:
        zone_rows = {r["variety_code"]: r for r in db.execute(text("""
            SELECT DISTINCT ON (variety_code)
                   variety_code, gdd_accumulated, flowering_date,
                   veraison_date, harvest_210_date
              FROM phenology_estimates
             WHERE zone_id = :z AND vintage_year = :v AND estimate_date <= :d
             ORDER BY variety_code, estimate_date DESC
        """), {"z": site.zone_id, "v": vintage, "d": on}).mappings().all()}

    # NO BASIS, NO DATES — applied here rather than left to every reader.
    #
    # Before 1 September the accumulation is zero by design, while `gdd_daily`
    # is not, so the projector happily divides a full threshold by a summer rate
    # and returns flowering in three months, stamped "high confidence". That is
    # not hypothetical: all 5,733 rows of the zone table's 2027 vintage sat at
    # zero GDD in exactly that state, which is why `phenology_basis` exists.
    #
    # The zone path stores those dates and filters them at read time. This one
    # does not store them at all. The difference is deliberate: a guard that
    # every consumer must remember is a guard that one consumer will forget,
    # and the stage and the accumulation — both true — are still stored.
    #
    # The SECOND test in `phenology_basis.classify` (a date must land inside its
    # own vintage) stays at read time, because it depends on the season bounds
    # the caller is asking about.
    projectable = float(gdd["sep1"]) >= basis.MIN_GDD_FOR_PREDICTION

    def project(current, target):
        return (estimate_date(current, target, gdd["rate"], on)
                if projectable else None)

    def zone_dates(z: dict) -> dict:
        """The zone's figures, with the SAME basis test applied to them.

        The zone table stores projections computed from zero accumulation and
        filters them at read time — `phenology_basis` exists because all 5,733
        rows of its 2027 vintage sat at zero GDD while projecting confident
        December flowering dates.

        Storing those beside a guarded site date would be worse than not
        comparing at all: the site column would correctly show nothing and the
        region column would show a date, and the obvious reading of that is
        "my site is late", which would be an artefact of one side being
        filtered and the other not.
        """
        if not z:
            return {}
        zg = z.get("gdd_accumulated")
        ok = zg is not None and float(zg) >= basis.MIN_GDD_FOR_PREDICTION
        return {
            "zone_gdd_accumulated": zg,
            "zone_flowering_date": z.get("flowering_date") if ok else None,
            "zone_veraison_date": z.get("veraison_date") if ok else None,
            "zone_harvest_210_date": z.get("harvest_210_date") if ok else None,
        }

    rows = []
    for variety in thresholds(db):
        z = zone_dates(zone_rows.get(variety["variety_code"]) or {})
        rows.append({
            "site_id": site.id, "variety_code": variety["variety_code"],
            "vintage_year": vintage, "estimate_date": on,
            "gdd_accumulated": gdd["sep1"], "gdd_from_oct1": gdd["oct1"],
            "current_stage": determine_stage(gdd["sep1"], gdd["oct1"], variety),
            "avg_daily_gdd": gdd["rate"],
            "flowering_date": project(gdd["sep1"], variety["gdd_flowering"]),
            "veraison_date": project(gdd["sep1"], variety["gdd_veraison"]),
            "harvest_170_date": project(gdd["oct1"], variety["gdd_harvest_170"]),
            "harvest_180_date": project(gdd["oct1"], variety["gdd_harvest_180"]),
            "harvest_190_date": project(gdd["oct1"], variety["gdd_harvest_190"]),
            "harvest_200_date": project(gdd["oct1"], variety["gdd_harvest_200"]),
            "harvest_210_date": project(gdd["oct1"], variety["gdd_harvest_210"]),
            "harvest_220_date": project(gdd["oct1"], variety["gdd_harvest_220"]),
            "days_vs_baseline": days_vs,
            "gdd_vs_baseline": gdd_vs,
            "baseline_source": base_source,
            "zone_id": site.zone_id,
            "zone_gdd_accumulated": z.get("zone_gdd_accumulated"),
            "zone_flowering_date": z.get("zone_flowering_date"),
            "zone_veraison_date": z.get("zone_veraison_date"),
            "zone_harvest_210_date": z.get("zone_harvest_210_date"),
            # The site's own record has no station-count notion, and inventing
            # one would be a confidence about the interpolation dressed up as a
            # confidence about the model.
            "confidence": None,
        })
    return rows


def upsert(db: Session, rows: list[dict]) -> int:
    """Write estimates, correcting a row already written for the same day."""
    if not rows:
        return 0
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from db.models.insights_site import InsightsSitePhenology

    stmt = pg_insert(InsightsSitePhenology).values(rows)
    update = {c: getattr(stmt.excluded, c) for c in rows[0]
              if c not in ("site_id", "variety_code", "vintage_year",
                           "estimate_date",
                           # An observed date is not overwritten by a model
                           # run. These are the columns a human fills in.
                           "flowering_is_actual", "veraison_is_actual")}
    stmt = stmt.on_conflict_do_update(
        index_elements=["site_id", "variety_code", "vintage_year",
                        "estimate_date"],
        set_=update)
    db.execute(stmt)
    return len(rows)


def populate(db: Session, site, on: date) -> dict:
    """Estimate and store one site's phenology for one day."""
    if not site.grid_row:
        return {"site_id": site.id, "rows": 0,
                "reason": "the site has no resolved cell"}
    rows = estimate(db, site, on)
    written = upsert(db, rows)
    db.commit()
    return {
        "site_id": site.id, "rows": written,
        "gdd": float(rows[0]["gdd_accumulated"]) if rows else None,
        "reason": None if rows else
                  f"no daily record at this site for {on}",
    }
