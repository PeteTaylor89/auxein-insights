#!/usr/bin/env python3
"""Daily QC — check and clean `weather_data_daily` before anything reads it.

Runs between `daily_aggregation` and everything downstream: the zone rollups,
disease pressure, phenology, and the daily spline. Putting it here rather than
at fit time is the point — a fit-time screen protects only the surface, while
the same bad value goes on poisoning `climate_zone_daily` and every model built
on it.

## What this exists to catch, all of it seen live

  * **473 Winton at Essex Street** began reading 15-19 degC too warm on
    2026-08-10 — 29.30 degC beside neighbours at 10 degC.
  * **100 Lake Elterwater** stuck at exactly 0.0000, 288 records a day.
  * **9 GREYSTONE B5/6** spiked to 28.10 degC, ~3 degC above New Zealand's
    entire winter record, while stations 400 m away read 20-22.
  * **330 Wye at Charlies Rest** recorded 45.00 degC and **636 Karori Stream**
    39.62 degC, in winter.

Every one of them passes the guards that existed before: the values are legal
numbers, the record counts are full, and only one is pinned to a constant.

## Two tiers, and the split is deliberate

**reject** — physically impossible or internally contradictory. The raw
observations are quarantined (flagged, never deleted), the daily columns are
cleared, and the day is re-aggregated from whatever survives. No judgement is
involved: a minimum above a maximum cannot be a real reading.

**flag** — suspicious but arguable. Recorded in `weather_daily_qc` and left in
place. The fit-time screen in `run_live` is the second line for these, and it
can afford to be softer because it only has to protect one surface.

The reason for the split is a lesson this platform has already paid for: in a
thin network **a biased station beats no station**, and removing the eight
highest-bias stations made the national surface measurably WORSE. Automated
deletion has to be reserved for things that cannot be true, not things that
look wrong.

## What is deliberately NOT checked

Rainfall is not neighbour-checked. Convective rain is genuinely cellular — a
gauge can record 40 mm while one 12 km away records nothing — so disagreement
is signal. Rainfall's failure mode is the stuck-zero RUN, which needs months of
context and is handled by its own quarantine, not by a daily check.

Usage:
    python scripts/daily_qc.py --start 2026-08-01 --end 2026-08-23
    python scripts/daily_qc.py --start ... --end ... --apply
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sqlalchemy import text as sa_text

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

logger = logging.getLogger("daily_qc")

TEMP_VARS = ('temp', 'temperature', 'air_temperature')
RH_VARS = ('rh', 'humidity', 'relative_humidity')
QUARANTINE_QUALITY = 'QUARANTINED'

# Which raw variables to quarantine, and which daily columns to clear, for a
# finding on a given daily column. Keeping these together is what stops an RH
# fault quarantining temperature, which is the obvious way to get this wrong.
FAMILIES = {
    "temp":      (TEMP_VARS, ("temp_min", "temp_max", "temp_mean"), "temp_record_count"),
    "temp_min":  (TEMP_VARS, ("temp_min", "temp_max", "temp_mean"), "temp_record_count"),
    "temp_max":  (TEMP_VARS, ("temp_min", "temp_max", "temp_mean"), "temp_record_count"),
    "temp_mean": (TEMP_VARS, ("temp_min", "temp_max", "temp_mean"), "temp_record_count"),
    "rh":        (RH_VARS, ("humidity_min", "humidity_max", "humidity_mean"), "humidity_record_count"),
    "humidity_min":  (RH_VARS, ("humidity_min", "humidity_max", "humidity_mean"), "humidity_record_count"),
    "humidity_max":  (RH_VARS, ("humidity_min", "humidity_max", "humidity_mean"), "humidity_record_count"),
    "humidity_mean": (RH_VARS, ("humidity_min", "humidity_max", "humidity_mean"), "humidity_record_count"),
}

# --- thresholds -------------------------------------------------------------
#
# Every one of these is set against a measured case rather than a round number,
# and each is loose enough that a real New Zealand extreme survives it.

# A diurnal range above this is not weather. The largest legitimate DTR in this
# network is ~16-20 degC at Molesworth (887 m) and the Central Otago vineyard
# basins, so 25 leaves real headroom; Winton's fault ran 15-20 and was caught by
# the neighbour test instead, which is the right division of labour.
MAX_DTR = 25.0

# Absolute bounds. Wide on purpose — these catch sentinels and hardware faults,
# NOT unusual weather. NZ's record maximum is ~42 degC and its record minimum
# about -25 degC, so nothing real is excluded. A 45.00 degC winter reading is.
ABS_MAX_TEMP = 45.0
ABS_MIN_TEMP = -30.0

# A whole day at one value, with enough records that it cannot be coincidence.
# Station 309 sat at exactly 3.96 degC with 288 records/day; station 100 sits at
# 0.0000 with the same. Below this count a flat day is plausible (a station
# reporting twice can legitimately report the same number twice).
FLATLINE_MIN_RECORDS = 12

# The mean must lie inside its own min and max. This is arithmetic, not
# meteorology — a violation means the three columns were not computed from the
# same set of observations.
MEAN_TOLERANCE = 0.05

# Neighbour test. `reject` only well beyond the fit-time screen's own floor, so
# the daily table is cleaned of the indefensible while the surface screen keeps
# handling the merely distinctive.
REJECT_FLOOR_MULTIPLE = 2.0

# --- relative humidity ------------------------------------------------------
#
# RH matters because DISEASE depends on it. Powdery mildew (UC Davis), Botrytis
# (Gonzalez-Dominguez) and downy mildew all run off dewpoint and leaf-wetness
# estimated from humidity, and none of them had any QC at all before this.
#
# RH is bounded 0-100 BY DEFINITION, which makes the range check meaningful in a
# way it never is for temperature. Observed in this database over 400 days:
# a -100 sentinel, and maxima to 110.
#
# Readings just over 100 are different in kind — near saturation a calibrated
# sensor commonly overshoots a point or two, so 100-105 is FLAGGED rather than
# rejected and only >105 is treated as a fault.
RH_MIN, RH_MAX = 0.0, 105.0
RH_OVERSHOOT = 100.0

# Same record-count gate as temperature, and it does even more work here:
# min == max over 400 days is 29,146 station-days at <12 records (stations that
# report once or twice a day, where it is meaningless) against 123 across 22
# stations at >=12 records, which is the real suspect set.
RH_FLATLINE_MIN_RECORDS = 12

# A whole day pinned at saturation is PHYSICALLY POSSIBLE in persistent fog, so
# a flatline at or above this is flagged, not rejected. A flatline anywhere else
# has no such excuse: nothing holds RH at exactly 58.5% for 24 hours.
RH_FOG = 99.0

# The slow fault that matters most for disease: a degraded sensor that reads
# permanently damp manufactures continuous leaf wetness and therefore permanent
# disease pressure.
#
# It CANNOT be detected from a high median. Measured over 120 days, eight
# genuinely wet central-North-Island stations have a median daily-minimum RH of
# 94-100% — Taihape sits at 100.0 — and they are all real. What separates them
# from a stuck sensor is that they still dry out: their 5th-percentile daily
# minima run 55-78% and Three Kings has reached 19.6%. So the test is whether
# the station EVER drops over a long window, never how high it usually sits.
RH_SATURATED_FLOOR = 95.0
RH_SATURATED_WINDOW = 60
RH_SATURATED_MIN_DAYS = 30

# Neighbour thresholds, measured rather than chosen. Over 4,142 station-days the
# residual against the 6 nearest stations within 60 km is bimodal: p50 4.6,
# p95 19.6, then a jump to p99 52.4 and a tail to 85.6 percentage points. 30 pp
# sits above ordinary variation and 50 pp inside the fault cluster.
#
# NO LAPSE REDUCTION. Relative humidity is not linear in elevation the way
# temperature is, so the correction that makes the temperature screen safe would
# be an invention here.
#
# AND THAT IS EXACTLY WHY THIS TEST NEVER REJECTS, only flags. The temperature
# screen can act automatically because the lapse rate genuinely removes the
# elevation signal before anything is compared. With no equivalent correction,
# an RH residual conflates real vertical structure with sensor fault — and the
# error lands on high stations, the ones this network can least afford to lose.
#
# Measured case: station 460 "Upper Waikaia at Hyde Rock" (1,622 m) read 17.63%
# on a dry day while its neighbours 36 km away and ~1,500 m below read ~77%, a
# -59 pp residual that a 50 pp reject threshold would have thrown out. Its RH is
# demonstrably healthy — median 82%, 5th percentile 22.4%, and it has reached
# 2.0% and 99.0% — so it is simply drier up there, above the valley air.
#
# Nothing is lost by flagging instead. The RH faults that are genuinely
# indefensible — a flatline off saturation, a -100 sentinel, a reading above
# 105 — are caught by tests that need no neighbour context at all.
RH_NEIGHBOUR_FLAG = 30.0


# Every check this build can emit. Recorded on the run row so a check that fired
# ZERO times stays visible: without the list, a check silently dropped in a
# refactor and a check that is simply passing look identical, forever. Keep it
# in step with `check_day` and `check_saturation` — the run summary counts these
# names and a finding under a name absent here is reported as unregistered
# rather than quietly folded into the totals.
CHECKS = (
    "order_violation",
    "mean_outside_range",
    "out_of_range",
    "extreme_dtr",
    "flatline",
    "neighbour_outlier",
    "rh_order_violation",
    "rh_out_of_range",
    "rh_overshoot",
    "rh_mean_outside_range",
    "rh_flatline",
    "rh_neighbour_outlier",
    "rh_saturated",
)


class QcRun:
    """One row in `weather_qc_run`, opened before the work and closed after.

    The findings table answers "what was wrong". It cannot answer "did the
    checks run", because a clean pass writes nothing — and this stage runs four
    times a day on a scheduler where silence is the normal case. Eight run ids
    existed in `weather_daily_qc` across three days of six-hourly execution;
    every other pass was invisible.

    **The row is inserted and committed BEFORE the first day is fetched.** A
    pass killed halfway therefore leaves `status='running'`, which is itself the
    evidence it did not finish. The alternative — writing the record at the end
    — records only the runs that did not need recording.
    """

    def __init__(self, run_id: str, lo: date, hi: date, max_reject_rate: float):
        self.run_id = run_id
        self.lo = lo
        self.hi = hi
        self.max_reject_rate = max_reject_rate

    def open(self, db) -> None:
        db.execute(sa_text("""
            INSERT INTO weather_qc_run
                (run_id, window_start, window_end, status, max_reject_rate,
                 checks)
            VALUES (:run_id, :lo, :hi, 'running', :mrr, :checks)
            ON CONFLICT (run_id) DO UPDATE SET
                status = 'running', started_at = now(), finished_at = NULL,
                window_start = EXCLUDED.window_start,
                window_end = EXCLUDED.window_end, error = NULL
        """), {"run_id": self.run_id, "lo": self.lo, "hi": self.hi,
               "mrr": self.max_reject_rate,
               "checks": json.dumps({c: None for c in CHECKS})})
        # Committed on its own so the row survives whatever happens next. Held
        # inside the main transaction it would be rolled back by the very
        # failure it exists to record.
        db.commit()

    def close(self, db, status: str, *, findings: list = None,
              n_station_days: int = 0, n_quarantined: int = None,
              n_cleared: int = None, n_late: int = None,
              reaggregated: bool = None, error: str = None) -> None:
        findings = findings or []
        counts = {c: 0 for c in CHECKS}
        unregistered = {}
        for f in findings:
            name = f["check_name"]
            if name in counts:
                counts[name] += 1
            else:
                unregistered[name] = unregistered.get(name, 0) + 1
        if unregistered:
            # Not fatal — the finding is already recorded and acted on. But a
            # name the registry has never heard of means CHECKS has drifted from
            # the code, and the zero-counts above are then no longer trustworthy.
            logger.warning("check(s) not in CHECKS: %s — update the registry",
                           ", ".join(sorted(unregistered)))
            counts.update(unregistered)

        n_reject = sum(1 for f in findings if f["severity"] == "reject")
        rate = (n_reject / n_station_days) if n_station_days else None

        db.execute(sa_text("""
            UPDATE weather_qc_run SET
                status = :status, finished_at = now(),
                n_station_days = :nsd, n_findings = :nf,
                n_reject = :nrj, n_flag = :nfl,
                n_quarantined_rows = :nq, n_cleared_rows = :nc,
                n_late_enforced = :nl, reject_rate = :rate,
                reaggregated = :reagg, checks = :checks, error = :error
            WHERE run_id = :run_id
        """), {"run_id": self.run_id, "status": status,
               "nsd": n_station_days, "nf": len(findings), "nrj": n_reject,
               "nfl": len(findings) - n_reject, "nq": n_quarantined,
               "nc": n_cleared, "nl": n_late, "rate": rate,
               "reagg": reaggregated, "checks": json.dumps(counts),
               "error": error})
        db.commit()

    def fail(self, db, exc: BaseException, **kw) -> None:
        """Close as `failed`, from an except block, without masking the error.

        The session is very likely poisoned by the exception that got us here,
        so roll it back before touching the row — otherwise the attempt to
        record the failure fails too, and the run is left at `running`, which
        reads as "killed" rather than "raised".
        """
        try:
            db.rollback()
            self.close(db, "failed",
                       error=f"{type(exc).__name__}: {exc}"[:2000], **kw)
        except Exception:                                       # noqa: BLE001
            logger.exception("could not record the QC run failure")


def enforce_standing(db, lo: date, hi: date) -> int:
    """Re-apply every open quarantine window to newly-arrived observations.

    **A quarantine is a one-time UPDATE, and that is not the same as a rule.**
    Station 473 was quarantined from 2026-08-10 with the window deliberately
    left open, and its bad values were back in `weather_data_daily` within the
    hour: the hourly ingest delivered late-arriving rows for days already
    covered, they landed as `GOOD` because nothing re-applied the decision, and
    the next re-aggregation pulled them in. The fix looked like it had silently
    reverted.

    So the standing rules are derived from the quarantine flags already stored —
    every distinct (station, variable, window) that has ever been quarantined —
    and re-applied to anything inside those windows that is currently GOOD.
    Idempotent, needs no second source of truth, and runs before every check so
    a decision taken once stays taken.

    The cost is the known one: a station whose window runs to 2099 can never
    announce its own recovery, because its rows stop reaching the rollup. That
    is what `weather_daily_qc` is dated for.
    """
    from sqlalchemy import text

    windows = db.execute(text("""
        SELECT DISTINCT
               station_id,
               variable,
               quality_flags -> 'quarantine' ->> 'reason'  AS reason,
               quality_flags -> 'quarantine' ->> 'window'  AS window
          FROM timeseries_observations
         WHERE quality = :q
           AND quality_flags -> 'quarantine' ->> 'window' IS NOT NULL
    """), {"q": QUARANTINE_QUALITY}).mappings().all()

    total = 0
    for w in windows:
        raw = (w["window"] or "").split("..")
        if len(raw) != 2:
            continue
        try:
            w_lo, w_hi = date.fromisoformat(raw[0]), date.fromisoformat(raw[1])
        except ValueError:
            continue
        # Only the part of the standing window that overlaps this run.
        s, e = max(w_lo, lo), min(w_hi, hi)
        if s > e:
            continue
        res = db.execute(text("""
            UPDATE timeseries_observations t
               SET quality = :q,
                   quality_flags = coalesce(t.quality_flags, '{}'::jsonb)
                       || jsonb_build_object('quarantine', jsonb_build_object(
                              'reason', :reason,
                              'note', 'standing window re-applied to late data',
                              'window', :window, 'ref', 'daily_qc --enforce'))
             WHERE t.station_id = :sid
               AND t.variable = :var
               AND (t.timestamp AT TIME ZONE 'Pacific/Auckland')::date
                   BETWEEN :s AND :e
               AND coalesce(t.quality, '') <> :q
        """), {"q": QUARANTINE_QUALITY, "reason": w["reason"],
               "window": w["window"], "sid": w["station_id"],
               "var": w["variable"], "s": s, "e": e})
        if res.rowcount:
            logger.warning("  re-quarantined %d late row(s) for station %s "
                           "%s (%s, window %s)", res.rowcount, w["station_id"],
                           w["variable"], w["reason"], w["window"])
            total += res.rowcount
    return total


def _fetch_day(db, day: date) -> pd.DataFrame:
    from sqlalchemy import text
    rows = db.execute(text("""
        SELECT w.station_id, w.temp_min, w.temp_max, w.temp_mean,
               w.temp_record_count,
               w.humidity_min, w.humidity_max, w.humidity_mean,
               w.humidity_record_count,
               s.latitude, s.longitude, coalesce(s.elevation, 0) AS elevation,
               s.station_name
          FROM weather_data_daily w
          JOIN weather_stations s ON s.station_id = w.station_id
         WHERE w.date = :d
           AND (w.temp_min IS NOT NULL OR w.temp_max IS NOT NULL
                OR w.temp_mean IS NOT NULL OR w.humidity_mean IS NOT NULL)
    """), {"d": day}).mappings().all()
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows)
    for c in ("temp_min", "temp_max", "temp_mean",
              "humidity_min", "humidity_max", "humidity_mean",
              "latitude", "longitude", "elevation"):
        df[c] = pd.to_numeric(df[c], errors="coerce")
    return df


def _count(v) -> int:
    """Record counts arrive as NaN for a station reporting one family but not
    the other, and `int(nan or 0)` RAISES — NaN is truthy, so the `or` never
    fires. Widening the day fetch to include humidity-only rows made that
    reachable immediately."""
    return 0 if v is None or pd.isna(v) else int(v)


def _finding(station_id, day, variable, check, severity, value=None,
             expected=None, **detail) -> dict:
    return {"station_id": int(station_id), "date": day, "variable": variable,
            "check_name": check, "severity": severity,
            "value": None if value is None else float(value),
            "expected": None if expected is None else float(expected),
            "detail": detail, "action": "none"}


def check_day(df: pd.DataFrame, day: date) -> list[dict]:
    """All checks for one day. Pure — returns findings, changes nothing."""
    out: list[dict] = []
    if df.empty:
        return out

    for _, r in df.iterrows():
        tmin, tmax, tmean = r.temp_min, r.temp_max, r.temp_mean
        n = _count(r.temp_record_count)

        # --- internal consistency: these cannot be true ---------------------
        if pd.notna(tmin) and pd.notna(tmax) and tmin > tmax:
            out.append(_finding(r.station_id, day, "temp", "order_violation",
                                "reject", value=tmin, expected=tmax,
                                temp_min=float(tmin), temp_max=float(tmax)))
            continue

        if (pd.notna(tmean) and pd.notna(tmin) and pd.notna(tmax)
                and not (tmin - MEAN_TOLERANCE <= tmean <= tmax + MEAN_TOLERANCE)):
            out.append(_finding(r.station_id, day, "temp", "mean_outside_range",
                                "reject", value=tmean,
                                temp_min=float(tmin), temp_max=float(tmax)))
            continue

        for col, v in (("temp_min", tmin), ("temp_max", tmax)):
            if pd.notna(v) and (v > ABS_MAX_TEMP or v < ABS_MIN_TEMP):
                out.append(_finding(r.station_id, day, col, "out_of_range",
                                    "reject", value=v,
                                    bounds=[ABS_MIN_TEMP, ABS_MAX_TEMP]))

        if pd.notna(tmin) and pd.notna(tmax) and (tmax - tmin) > MAX_DTR:
            out.append(_finding(r.station_id, day, "temp", "extreme_dtr",
                                "reject", value=float(tmax - tmin),
                                expected=MAX_DTR,
                                temp_min=float(tmin), temp_max=float(tmax)))
            continue

        if (pd.notna(tmin) and pd.notna(tmax) and tmin == tmax
                and n >= FLATLINE_MIN_RECORDS):
            out.append(_finding(r.station_id, day, "temp", "flatline",
                                "reject", value=tmin, records=n))

    # --- relative humidity ----------------------------------------------
    for _, r in df.iterrows():
        hmin, hmax, hmean = r.humidity_min, r.humidity_max, r.humidity_mean
        if pd.isna(hmean) and pd.isna(hmin) and pd.isna(hmax):
            continue
        hn = _count(r.humidity_record_count)

        if pd.notna(hmin) and pd.notna(hmax) and hmin > hmax:
            out.append(_finding(r.station_id, day, "rh", "rh_order_violation",
                                "reject", value=hmin, expected=hmax))
            continue

        bad_range = ((pd.notna(hmin) and hmin < RH_MIN)
                     or (pd.notna(hmax) and hmax > RH_MAX))
        if bad_range:
            out.append(_finding(r.station_id, day, "rh", "rh_out_of_range",
                                "reject",
                                value=float(hmin if pd.notna(hmin) else hmax),
                                bounds=[RH_MIN, RH_MAX],
                                humidity_min=None if pd.isna(hmin) else float(hmin),
                                humidity_max=None if pd.isna(hmax) else float(hmax)))
            continue

        # Overshoot near saturation is a calibration artefact, not a fault.
        if pd.notna(hmax) and RH_OVERSHOOT < hmax <= RH_MAX:
            out.append(_finding(r.station_id, day, "rh", "rh_overshoot",
                                "flag", value=hmax, expected=RH_OVERSHOOT))

        if (pd.notna(hmean) and pd.notna(hmin) and pd.notna(hmax)
                and not (hmin - MEAN_TOLERANCE <= hmean <= hmax + MEAN_TOLERANCE)):
            out.append(_finding(r.station_id, day, "rh", "rh_mean_outside_range",
                                "reject", value=hmean,
                                humidity_min=float(hmin), humidity_max=float(hmax)))
            continue

        if (pd.notna(hmin) and pd.notna(hmax) and hmin == hmax
                and hn >= RH_FLATLINE_MIN_RECORDS):
            fog = hmin >= RH_FOG
            out.append(_finding(
                r.station_id, day, "rh", "rh_flatline",
                "flag" if fog else "reject", value=hmin, records=hn,
                note=("pinned at saturation - possible persistent fog"
                      if fog else "no mechanism holds RH constant off saturation")))

    # --- neighbour test, per daily column -------------------------------
    from scripts.interpolation import tps

    for col, cold_floor in (("temp_min", 15.0), ("temp_mean", 12.0),
                            ("temp_max", 8.0)):
        sub = df[df[col].notna()][
            ["station_id", "latitude", "longitude", "elevation", col]
        ].rename(columns={col: "value"}).reset_index(drop=True)
        if len(sub) < 10:
            continue
        _, rej = tps.screen_outliers(sub, "value", min_abs_cold=cold_floor)
        for _, r in rej.iterrows():
            floor = float(r.floor_applied)
            hard = abs(float(r.residual)) > REJECT_FLOOR_MULTIPLE * floor
            out.append(_finding(
                r.station_id, day, col, "neighbour_outlier",
                "reject" if hard else "flag",
                value=float(r.value), expected=float(r.neighbour_median),
                residual=round(float(r.residual), 2),
                robust_z=round(float(r.robust_z), 2),
                neighbour_km=round(float(r.neighbour_km), 2),
                floor=round(floor, 2),
                n_neighbours=int(r.n_neighbours)))

    # RH gets its own neighbour pass: no lapse reduction, a symmetric floor
    # (nothing makes a station legitimately much drier OR much damper than its
    # neighbours the way cold-air drainage does for tmin), and thresholds taken
    # from the measured residual distribution rather than borrowed from
    # temperature, whose units these are not.
    sub = df[df.humidity_mean.notna()][
        ["station_id", "latitude", "longitude", "elevation", "humidity_mean"]
    ].rename(columns={"humidity_mean": "value"}).reset_index(drop=True)
    if len(sub) >= 10:
        _, rej = tps.screen_outliers(
            sub, "value", lapse_rate=0.0,
            min_abs=RH_NEIGHBOUR_FLAG, min_abs_cold=RH_NEIGHBOUR_FLAG,
            min_abs_near=RH_NEIGHBOUR_FLAG, floor_scale_km=1.0)
        for _, r in rej.iterrows():
            out.append(_finding(
                r.station_id, day, "rh", "rh_neighbour_outlier", "flag",
                value=float(r.value), expected=float(r.neighbour_median),
                residual=round(float(r.residual), 2),
                robust_z=round(float(r.robust_z), 2),
                neighbour_km=round(float(r.neighbour_km), 2),
                n_neighbours=int(r.n_neighbours)))
    return out


def check_saturation(db, lo: date, hi: date) -> list[dict]:
    """Stations whose humidity never drops — the slow fault disease cares about.

    A degraded RH sensor that reads permanently damp manufactures continuous
    leaf wetness, and therefore permanent disease pressure, without ever
    producing a value that looks wrong on its own.

    It cannot be found from a high median. Eight genuinely wet central-North-
    Island stations have median daily-minimum RH of 94-100% over 120 days and
    are all real; what distinguishes them is that they still dry out, with
    5th-percentile minima of 55-78%. So the test is whether the station reaches
    a sane low at ALL across a long window.

    Flagged, never rejected: this is a judgement about a sensor's health over
    two months, not about one day's value, and the evidence for acting on it is
    the trend in `weather_daily_qc` rather than any single row.
    """
    from sqlalchemy import text
    win_lo = hi - timedelta(days=RH_SATURATED_WINDOW)
    rows = db.execute(text("""
        SELECT station_id, count(*) AS n,
               min(humidity_min) AS lowest,
               avg(humidity_mean) AS avg_mean
          FROM weather_data_daily
         WHERE date BETWEEN :lo AND :hi
           AND humidity_min IS NOT NULL
           AND humidity_min BETWEEN 0 AND 100
         GROUP BY station_id
        HAVING count(*) >= :min_days AND min(humidity_min) >= :floor
    """), {"lo": win_lo, "hi": hi, "min_days": RH_SATURATED_MIN_DAYS,
             "floor": RH_SATURATED_FLOOR}).mappings().all()
    out = []
    for r in rows:
        out.append(_finding(
            r["station_id"], hi, "rh", "rh_saturated", "flag",
            value=float(r["lowest"]), expected=RH_SATURATED_FLOOR,
            window_days=RH_SATURATED_WINDOW, days_with_data=int(r["n"]),
            mean_rh=round(float(r["avg_mean"]), 1),
            note="never dropped below the floor across the window"))
    return out


def persist(db, findings: list[dict], run_id: str) -> int:
    from psycopg2.extras import execute_values, Json
    if not findings:
        return 0
    raw = db.connection().connection
    sql = """
        INSERT INTO weather_daily_qc
            (station_id, date, variable, check_name, severity, value,
             expected, detail, action, run_id)
        VALUES %s
        ON CONFLICT (station_id, date, variable, check_name) DO UPDATE SET
            severity = EXCLUDED.severity, value = EXCLUDED.value,
            expected = EXCLUDED.expected, detail = EXCLUDED.detail,
            action = EXCLUDED.action, run_id = EXCLUDED.run_id,
            created_at = now()
    """
    values = [(f["station_id"], f["date"], f["variable"], f["check_name"],
               f["severity"], f["value"], f["expected"], Json(f["detail"]),
               f["action"], run_id) for f in findings]
    with raw.cursor() as cur:
        execute_values(cur, sql, values, page_size=500)
    return len(findings)


def clean(db, findings: list[dict]) -> tuple[int, int]:
    """Quarantine the raw observations behind every `reject`, then clear the day.

    Both halves are required. Quarantining alone leaves the already-computed
    daily row in place, and re-aggregating alone cannot clear it either: the
    upsert COALESCEs a freshly computed NULL against what is stored, so a day
    whose observations have just been quarantined keeps its old value and the
    whole operation looks like a no-op. That is exactly how the stuck-rainfall
    work found its counts restored underneath it.
    """
    from sqlalchemy import text

    rejects = [f for f in findings if f["severity"] == "reject"]
    if not rejects:
        return 0, 0

    # Group by FAMILY as well as station and day. Without this an RH fault
    # would quarantine the station's temperature and blank its temp columns —
    # the two sensors fail independently and are quarantined independently.
    targets: dict = {}
    for f in rejects:
        fam = FAMILIES.get(f["variable"])
        if fam is None:
            logger.warning("no family for variable %r, skipping", f["variable"])
            continue
        targets.setdefault((f["station_id"], f["date"], fam), []).append(f)

    quarantined = cleared = 0
    for (station_id, day, fam), group in sorted(
            targets.items(), key=lambda kv: (kv[0][0], kv[0][1])):
        raw_vars, daily_cols, count_col = fam
        reasons = sorted({f["check_name"] for f in group})
        res = db.execute(text("""
            UPDATE timeseries_observations t
               SET quality = :q,
                   quality_flags = coalesce(t.quality_flags, '{}'::jsonb)
                       || jsonb_build_object('quarantine', jsonb_build_object(
                              'reason', :reason, 'note', :note,
                              'window', :window, 'ref', 'daily_qc'))
             WHERE t.station_id = :sid
               AND t.variable = ANY(:vars)
               -- The NZ-local day, matching how `daily_aggregation` buckets.
               AND (t.timestamp AT TIME ZONE 'Pacific/Auckland')::date = :d
               AND coalesce(t.quality, '') <> :q
        """), {"q": QUARANTINE_QUALITY,
               "reason": "auto_qc:" + ",".join(reasons),
               "note": "automatic daily QC",
               "window": str(day), "sid": station_id,
               "vars": list(raw_vars), "d": day})
        quarantined += res.rowcount

        sets = ", ".join(f"{c} = NULL" for c in daily_cols)
        res = db.execute(text(f"""
            UPDATE weather_data_daily
               SET {sets}, {count_col} = 0
             WHERE station_id = :sid AND date = :d
        """), {"sid": station_id, "d": day})
        cleared += res.rowcount

    for f in rejects:
        f["action"] = "quarantined"
    return quarantined, cleared


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--start")
    ap.add_argument("--end")
    ap.add_argument("--date")
    ap.add_argument("--lookback-days", type=int, default=3,
                    help="when no window is given, check the last N days")
    ap.add_argument("--apply", action="store_true",
                    help="quarantine and clear; without it nothing is written")
    ap.add_argument("--no-reaggregate", action="store_true")
    ap.add_argument("--max-reject-rate", type=float, default=0.05,
                    help="abort without writing if rejects exceed this share "
                         "of station-days")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")

    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
    from db.session import SessionLocal
    from zoneinfo import ZoneInfo

    if args.date:
        lo = hi = date.fromisoformat(args.date)
    elif args.start and args.end:
        lo, hi = date.fromisoformat(args.start), date.fromisoformat(args.end)
    else:
        # NZ, not UTC — `date.today()` on a UTC server is yesterday all NZ
        # morning and the window would silently slide by a day.
        today = datetime.now(ZoneInfo("Pacific/Auckland")).date()
        hi = today - timedelta(days=1)
        lo = hi - timedelta(days=args.lookback_days - 1)

    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    days = [lo + timedelta(days=i) for i in range((hi - lo).days + 1)]
    logger.info("QC %s .. %s (%d days), run_id=%s%s", lo, hi, len(days),
                run_id, "" if args.apply else "  [DRY RUN]")

    db = SessionLocal()
    # A dry run writes nothing and changes nothing, so there is no event whose
    # silence needs explaining. `--apply` is the scheduled path and the only one
    # that gets a record.
    run = QcRun(run_id, lo, hi, args.max_reject_rate) if args.apply else None
    # Bound before the try so the failure path can report how far the pass got
    # rather than raising a NameError while recording someone else's error.
    findings: list[dict] = []
    n_station_days = 0
    n_late = 0
    try:
        # Opened BEFORE the first day is fetched, so a pass that dies halfway
        # leaves `status='running'` rather than no trace at all.
        if run:
            run.open(db)

        # BEFORE any check: re-apply standing quarantine windows to data that
        # arrived since they were set. Without this the whole stage can report
        # a clean window while previously-rejected values sit in the daily
        # table, delivered late by the hourly ingest.
        if args.apply:
            n_late = enforce_standing(db, lo, hi)
            if n_late:
                db.commit()
                from scripts.daily_aggregation import run_daily_aggregation
                logger.info("re-aggregating after %d late row(s) were "
                            "re-quarantined", n_late)
                run_daily_aggregation(start_date=lo.isoformat(),
                                      end_date=hi.isoformat())
            else:
                logger.info("standing windows: nothing late to re-apply")

        for day in days:
            df = _fetch_day(db, day)
            n_station_days += len(df)
            got = check_day(df, day)
            findings.extend(got)
            if got:
                nr = sum(1 for f in got if f["severity"] == "reject")
                logger.info("  %s  %3d station-days  %d finding(s), %d reject",
                            day, len(df), len(got), nr)

        # Window-level, not per-day: a sensor reading permanently damp is a
        # trend, and one day of it is indistinguishable from fog.
        sat = check_saturation(db, lo, hi)
        if sat:
            logger.info("  saturation: %d station(s) never dropped below %.0f%% "
                        "in %d days", len(sat), RH_SATURATED_FLOOR,
                        RH_SATURATED_WINDOW)
            findings.extend(sat)

        rejects = [f for f in findings if f["severity"] == "reject"]
        flags = [f for f in findings if f["severity"] == "flag"]
        logger.info("\n%d finding(s): %d reject, %d flag, over %d station-days",
                    len(findings), len(rejects), len(flags), n_station_days)

        by_check: dict = {}
        for f in findings:
            by_check.setdefault((f["check_name"], f["severity"]), 0)
            by_check[(f["check_name"], f["severity"])] += 1
        for (check, sev), n in sorted(by_check.items(), key=lambda kv: -kv[1]):
            logger.info("  %-20s %-7s %d", check, sev, n)

        # A rule that suddenly rejects a large share of the network is far more
        # likely to be a broken rule than a broken network, and it would take
        # the whole day's surface down with it.
        rate = len(rejects) / n_station_days if n_station_days else 0.0
        if rate > args.max_reject_rate:
            logger.error("reject rate %.1f%% exceeds --max-reject-rate %.1f%% "
                         "— refusing to act. Review the findings first.",
                         100 * rate, 100 * args.max_reject_rate)
            # The findings are deliberately still NOT written — the guard's
            # whole point is that this pass does not act. But the run row is,
            # because "a check ran, saw N rejects at X%, and refused" was
            # previously indistinguishable from the pass never having happened.
            if run:
                run.close(db, "aborted", findings=findings,
                          n_station_days=n_station_days, n_late=n_late,
                          n_quarantined=0, n_cleared=0, reaggregated=False)
            return 1

        if not args.apply:
            for f in rejects[:15]:
                logger.info("  would reject: station %s %s %s %s value=%s %s",
                            f["station_id"], f["date"], f["variable"],
                            f["check_name"], f["value"], f["detail"])
            logger.info("dry run — nothing written. Re-run with --apply.")
            return 0

        q, c = clean(db, findings)
        n = persist(db, findings, run_id)
        db.commit()
        logger.info("quarantined %d raw row(s), cleared %d daily row(s), "
                    "recorded %d finding(s)", q, c, n)

        reaggregated = bool(q) and not args.no_reaggregate
        if reaggregated:
            # Rebuild any cleared day that still has surviving GOOD rows.
            from scripts.daily_aggregation import run_daily_aggregation
            logger.info("re-aggregating %s .. %s", lo, hi)
            run_daily_aggregation(start_date=lo.isoformat(),
                                  end_date=hi.isoformat())

        # Closed only here, after the re-aggregation. A pass that quarantined
        # rows and then died before rebuilding the days it emptied has left the
        # daily table with holes, and that must not read as `complete`.
        if run:
            run.close(db, "complete", findings=findings,
                      n_station_days=n_station_days, n_quarantined=q,
                      n_cleared=c, n_late=n_late, reaggregated=reaggregated)
    except BaseException as exc:                                # noqa: BLE001
        # BaseException so a KeyboardInterrupt is recorded too — an operator
        # stopping a pass mid-quarantine is exactly the state worth knowing
        # about later. Re-raised untouched.
        if run:
            run.fail(db, exc, findings=findings,
                     n_station_days=n_station_days, n_late=n_late)
        raise
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
