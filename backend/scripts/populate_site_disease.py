#!/usr/bin/env python3
"""Disease pressure at a POINT — the hourly interpolation and the four models.

    python backend/scripts/populate_site_disease.py --days 10 --apply
    python backend/scripts/populate_site_disease.py --site 16 --from 2026-08-20 --to 2026-08-29 --apply
    python backend/scripts/populate_site_disease.py --site 16 --days 3          # dry run

Two stages behind one command, because the second is useless without the first:

  1. **hourly** — synthesise this site's hourly series from the stations near it
     (`services.point_climate`) and derive wetness at the point. Writes
     `insights_site_hourly`.
  2. **disease** — run the three models the zone path runs, plus Bacchus,
     against those rows. Writes `insights_site_disease`.

## Two botrytis models, side by side

González-Domínguez and Bacchus are both scored for every site. They are not
alternatives to be picked between here: 23 of BSI's 67 sites asked for
Bacchus by name and the presentation layer decides what to show whom, but a
site that switches later must not have a hole in its history. They disagree
most in early spring, because only one of them scales by growth stage.

## Nothing about the models is re-implemented here

`UCDavisPMIndex`, `BotrytisModel`, `BacchusModel` and `DownyMildewModel` are
imported from
`disease_service_v2`, and `estimate_leaf_wetness` / `calculate_dew_point` from
`hourly_aggregation`. Only the SPATIAL SOURCE differs between a zone and a
point; a second copy of a peer-reviewed model that drifts from the first is the
worst outcome available here.

## Why the record starts 15 August 2026

Most disease is inactive over winter, and that date sits eleven days after the
hourly rain-gauge network stepped from ~140 stations to ~620. It is both the
agronomically safe choice and the earliest one the data supports. Ask for
earlier and you get a warning and whatever the thin network can give.

## hours_since_rain is carried in memory, not re-queried per hour

The zone path issues a lookback query for every hour. Walking the window
ascending and carrying the counter is the same answer for a fraction of the
cost, and a backfill is thousands of hours. It is SEEDED from the database for
the hour before the window opens, so a resumed or re-run window does not restart
the counter at "no rain in 24 h" and invent a dry spell.
"""
from __future__ import annotations

import argparse
import logging
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv                                      # noqa: E402
from sqlalchemy import text                                         # noqa: E402

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

import pytz                                                         # noqa: E402

from db.models.insights_site import InsightsSite                    # noqa: E402
from db.session import SessionLocal                                 # noqa: E402
from scripts.disease_service_v2 import (                            # noqa: E402
    BacchusModel, BotrytisModel, DownyMildewModel, UCDavisPMIndex,
)
from scripts.hourly_aggregation import (                            # noqa: E402
    estimate_leaf_wetness, get_hourly_station_data, get_vintage_year,
)
from services import point_climate as pc                            # noqa: E402

log = logging.getLogger("site_disease")
NZ = pytz.timezone("Pacific/Auckland")

# See the module docstring. Earlier than this the hourly rain-gauge network was
# a quarter of its present size and the wetness term has no rainfall behind it.
RECORD_STARTS = date(2026, 8, 15)

NO_RAIN_SENTINEL = 999          # matches `track_hours_since_rain`


# --- stage 1: hourly ---------------------------------------------------------

def seed_hours_since_rain(db, site_id: int, first_hour: datetime) -> int:
    """The counter as it stood entering the window.

    Without this a re-run starts at "no rain for 24 h", which drives
    `p_post_rain` to zero and silently dries out the first hours of every
    backfill.
    """
    row = db.execute(text("""
        SELECT timestamp_utc FROM insights_site_hourly
         WHERE site_id = :s AND timestamp_utc < :h
           AND timestamp_utc >= :lb AND precipitation > 0
         ORDER BY timestamp_utc DESC LIMIT 1
    """), {"s": site_id, "h": first_hour,
           "lb": first_hour - timedelta(hours=24)}).fetchone()
    if not row:
        return NO_RAIN_SENTINEL
    last = row[0]
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    return int((first_hour - last).total_seconds() / 3600)


HOURLY_UPSERT = text("""
    INSERT INTO insights_site_hourly
        (site_id, timestamp_utc, timestamp_local, vintage_year,
         temp_mean, rh_mean, dewpoint, precipitation, wind_mean,
         is_wet_hour, wetness_probability, wetness_source, hours_since_rain,
         temp_station_count, temp_nearest_km, rh_station_count, rh_nearest_km,
         rain_station_count, rain_nearest_km, wind_station_count,
         confidence, created_at)
    VALUES
        (:site_id, :timestamp_utc, :timestamp_local, :vintage_year,
         :temp_mean, :rh_mean, :dewpoint, :precipitation, :wind_mean,
         :is_wet_hour, :wetness_probability, :wetness_source, :hours_since_rain,
         :temp_station_count, :temp_nearest_km, :rh_station_count, :rh_nearest_km,
         :rain_station_count, :rain_nearest_km, :wind_station_count,
         :confidence, now())
    ON CONFLICT (site_id, timestamp_utc) DO UPDATE SET
        timestamp_local = EXCLUDED.timestamp_local,
        vintage_year = EXCLUDED.vintage_year,
        temp_mean = EXCLUDED.temp_mean,
        rh_mean = EXCLUDED.rh_mean,
        dewpoint = EXCLUDED.dewpoint,
        precipitation = EXCLUDED.precipitation,
        wind_mean = EXCLUDED.wind_mean,
        is_wet_hour = EXCLUDED.is_wet_hour,
        wetness_probability = EXCLUDED.wetness_probability,
        wetness_source = EXCLUDED.wetness_source,
        hours_since_rain = EXCLUDED.hours_since_rain,
        temp_station_count = EXCLUDED.temp_station_count,
        temp_nearest_km = EXCLUDED.temp_nearest_km,
        rh_station_count = EXCLUDED.rh_station_count,
        rh_nearest_km = EXCLUDED.rh_nearest_km,
        rain_station_count = EXCLUDED.rain_station_count,
        rain_nearest_km = EXCLUDED.rain_nearest_km,
        wind_station_count = EXCLUDED.wind_station_count,
        confidence = EXCLUDED.confidence,
        created_at = now()
""")


def build_hourly(db, site, start: date, end: date) -> dict:
    """Stage 1 — interpolate every hour in [start, end] to this site."""
    interp = pc.build_interpolator(db, site)
    if not interp.station_ids:
        return {"hours": 0, "reason": "no active station within range"}

    # THE WINDOW IS LOCAL DAYS, SO THE UTC BOUNDS MUST BE DERIVED FROM THEM.
    #
    # Stage 2 groups by `timestamp_local`, but the fetch is in UTC. Aligning the
    # fetch to UTC midnight instead loses the first 12-13 hours of the first
    # local day and gains a stray half of the day after the last — measured: the
    # first local day came back with 12 hours and was scored as if that were a
    # whole day, which under-counts wet hours and therefore under-calls every
    # model on it.
    #
    # `localize` rather than `replace(tzinfo=...)`, because New Zealand's offset
    # is 12 or 13 hours depending on daylight saving and a fixed offset would be
    # wrong for half the year.
    start_dt = NZ.localize(
        datetime.combine(start, datetime.min.time())).astimezone(timezone.utc)
    end_dt = NZ.localize(
        datetime.combine(end + timedelta(days=1),
                         datetime.min.time())).astimezone(timezone.utc)
    by_hour = get_hourly_station_data(db, interp.station_ids, start_dt, end_dt)

    hsr = seed_hours_since_rain(db, site.id, start_dt)
    written = 0
    wet = 0
    with_rh = 0

    # ASCENDING, because the counter is a recurrence over the hours.
    for hour in sorted(by_hour):
        est = interp.interpolate_hour(by_hour[hour])
        if est["temp_mean"] is None and est["rh_mean"] is None:
            continue

        rain = est["precipitation"]
        if rain is not None and rain > 0:
            hsr = 0
        elif hsr != NO_RAIN_SENTINEL:
            hsr = min(hsr + 1, NO_RAIN_SENTINEL)

        is_wet, prob, source = estimate_leaf_wetness(
            est["temp_mean"], est["rh_mean"], rain or 0.0,
            None if hsr == NO_RAIN_SENTINEL else hsr,
            est["wind_mean"])

        aware = hour if hour.tzinfo else hour.replace(tzinfo=timezone.utc)
        row = {
            "site_id": site.id,
            "timestamp_utc": aware,
            "timestamp_local": aware.astimezone(NZ).replace(tzinfo=None),
            "vintage_year": get_vintage_year(aware),
            "is_wet_hour": is_wet,
            "wetness_probability": prob,
            "wetness_source": source,
            "hours_since_rain": hsr,
            "confidence": pc.confidence_for(est),
            **{k: est[k] for k in (
                "temp_mean", "rh_mean", "dewpoint", "precipitation", "wind_mean",
                "temp_station_count", "temp_nearest_km",
                "rh_station_count", "rh_nearest_km",
                "rain_station_count", "rain_nearest_km", "wind_station_count")},
        }
        # Written unconditionally, INSIDE the transaction. Stage 2 reads
        # `insights_site_hourly`, so gating this on --apply would make a dry run
        # silently score zero days — the run would look like a failure of the
        # models rather than of the dry run. The rollback at the end is what
        # makes it a dry run.
        db.execute(HOURLY_UPSERT, row)
        written += 1
        wet += 1 if is_wet else 0
        with_rh += 1 if est["rh_mean"] is not None else 0

    nearest = min((n.distance_km for n in interp.by_id.values()), default=None)
    return {"hours": written, "wet_hours": wet, "hours_with_rh": with_rh,
            "neighbours": len(interp.station_ids),
            "nearest_km": nearest, "reason": None}


# --- stage 2: disease --------------------------------------------------------

def hourly_for_day(db, site_id: int, day: date) -> list[dict]:
    rows = db.execute(text("""
        SELECT timestamp_local, temp_mean, rh_mean, precipitation, is_wet_hour
          FROM insights_site_hourly
         WHERE site_id = :s AND timestamp_local >= :d0 AND timestamp_local < :d1
         ORDER BY timestamp_local
    """), {"s": site_id, "d0": datetime.combine(day, datetime.min.time()),
           "d1": datetime.combine(day + timedelta(days=1),
                                  datetime.min.time())}).fetchall()
    return [{"timestamp": r[0],
             "temp": float(r[1]) if r[1] is not None else None,
             "rh": float(r[2]) if r[2] is not None else None,
             "precipitation": float(r[3]) if r[3] is not None else 0.0,
             "is_wet": bool(r[4])} for r in rows]


def conditions_48h(db, site_id: int, day: date) -> dict:
    start = datetime.combine(day - timedelta(days=2), datetime.min.time())
    r = db.execute(text("""
        SELECT min(temp_mean), sum(coalesce(precipitation, 0)),
               sum(CASE WHEN is_wet_hour THEN 1 ELSE 0 END)
          FROM insights_site_hourly
         WHERE site_id = :s AND timestamp_local >= :d0 AND timestamp_local < :d1
    """), {"s": site_id, "d0": start,
           "d1": datetime.combine(day + timedelta(days=1),
                                  datetime.min.time())}).fetchone()
    return {"min_temp_48h": float(r[0]) if r[0] is not None else None,
            "total_rain_48h": float(r[1]) if r[1] is not None else 0.0,
            "wet_hours_48h": r[2] or 0}


# --- growth stage -------------------------------------------------------------
#
# THE BOTRYTIS MODEL IS SCALED BY TISSUE SUSCEPTIBILITY and this is where that
# term comes from. It used to come from nowhere: `BotrytisModel.calculate` was
# called without a stage, so every site-day scored on the model's own default of
# `ripening` — stage_factor 1.0, the MAXIMUM in the table — while the row stored
# `growth_stage = 'unknown'`, which is 0.5. A dormant vine in August was being
# scored as ripe fruit, and 32 of the 67 BSI sites were reading moderate or high
# on 4 September with no fruit on the vine.
#
# The zone path has always passed a real stage (`disease_service_v2`). This is
# the same lookup against the POINT model, which now exists.

# The five-word phenology vocabulary is normalised onto the model's eight-word
# susceptibility table by `BotrytisModel.stage_factor`, NOT here — the zone path
# feeds it the same five words and a second copy of that mapping is how the two
# paths start disagreeing. This module passes the stage through verbatim.

# What the phenology model can never say. `determine_stage` has no branch below
# `pre_flowering` because `phenology_thresholds` carries no `gdd_budburst`
# column, so `dormant` (0.0) and `budburst` (0.1) are unreachable and every
# winter and early-spring day floors at `pre_flowering` (0.3). See the note in
# the module docstring — this fix takes Appleby from 1.0 to 0.3, not to the 0.0
# that a dormant vine on 4 September actually warrants.
STAGE_FLOOR = "pre_flowering"


def stage_timeline(db, site) -> dict[date, str]:
    """Every day's growth stage at this site, as one query.

    Keyed by `estimate_date`; `stage_on` carries the last known value forward.
    Prefetched per site rather than queried per day because a backfill is 67
    sites x 21 days and the zone path's per-day lookup is 1,407 round trips for
    a table that fits in a dict.

    WHICH VARIETY. The site's own where it named one, because that is the grape
    in the ground. Where it did not — a met station, or a variety
    `phenology_thresholds` does not carry, which is the four BSI Pinot gris
    sites — the MOST ADVANCED stage across the varieties that are modelled.
    That is the precautionary reading for a disease warning: susceptibility
    rises through the season, so the most advanced variety is the one at risk
    first. It overstates a mixed block slightly and it is a judgement call
    rather than a fact; flipping it to a fixed reference variety is a one-line
    change if you would rather it did not.
    """
    order = {s: i for i, s in enumerate(
        ["pre_flowering", "flowering", "veraison", "ripening", "harvest_ready"])}
    rows = db.execute(text("""
        SELECT estimate_date, variety_code, current_stage
          FROM insights_site_phenology
         WHERE site_id = :s AND current_stage IS NOT NULL
         ORDER BY estimate_date
    """), {"s": site.id}).fetchall()

    by_day: dict[date, str] = {}
    for est_date, variety_code, stage in rows:
        if site.variety_code and variety_code != site.variety_code:
            continue
        best = by_day.get(est_date)
        if best is None or order.get(stage, -1) > order.get(best, -1):
            by_day[est_date] = stage
    return by_day


def zone_stage_timeline(db, site) -> dict[date, str]:
    """The surrounding zone's stages, as the fallback.

    A site placed today has no point phenology and would otherwise fall through
    to the model default, which is the bug this whole block exists to remove. A
    neighbouring zone's stage is not this site's, but it is the same model on
    the same calendar and it is vastly closer than `ripening`.
    """
    if not site.zone_id:
        return {}
    rows = db.execute(text("""
        SELECT estimate_date, current_stage
          FROM phenology_estimates
         WHERE zone_id = :z AND current_stage IS NOT NULL
         ORDER BY estimate_date
    """), {"z": site.zone_id}).fetchall()
    return {r[0]: r[1] for r in rows}


def stage_on(timelines: list[dict[date, str]], day: date) -> tuple[str, str]:
    """The stage in force on `day`, and where it came from.

    Carries the last estimate on or before `day` forward, matching
    `disease_service_v2.get_growth_stage`. Falls to `STAGE_FLOOR`, NOT to the
    model's `.get()` default of 0.5 and never to `ripening` — a site with no
    phenology at all is at the earliest stage the system can express, not the
    most susceptible one.
    """
    for source, timeline in zip(("site", "zone"), timelines):
        known = [d for d in timeline if d <= day]
        if known:
            return timeline[max(known)], source
    return STAGE_FLOOR, "floor"


def previous_state(db, site_id: int, vintage: int, day: date) -> dict:
    """State of the day BEFORE `day`.

    `date < :day` is LOAD-BEARING, for exactly the reason it is load-bearing in
    the zone path. Both cumulative models are `cumulative = prev * decay +
    today * weight`, so without the bound a recompute reads the newest row —
    which on a replay is the day being recomputed — and feeds a day's own
    cumulative back into itself. The decay becomes a ratchet and only the
    accumulator moves, which is what made it invisible for 45% of the 2026 zone
    vintage.
    """
    r = db.execute(text("""
        SELECT pm_cumulative_index, botrytis_cumulative, dm_goidanich_index,
               bacchus_index, bacchus_dry_run, date
          FROM insights_site_disease
         WHERE site_id = :s AND vintage_year = :v AND date < :d
         ORDER BY date DESC LIMIT 1
    """), {"s": site_id, "v": vintage, "d": day}).fetchone()
    if not r:
        return {"pm": 0.0, "botrytis": 0.0, "goidanich": 0.0,
                "bacchus_index": 0.0, "bacchus_dry_run": 0}
    # BACCHUS DOES NOT CARRY ACROSS A GAP. Its state is a live wet period, and
    # an unscored day is not four dry hours — it is no information. Carrying an
    # index over a hole in the record would let a wet Tuesday and a wet Friday
    # add up to an infection that never happened. The other three models are
    # seasonal accumulators with a decay and are unharmed by a gap, so only this
    # one resets.
    contiguous = r[5] == day - timedelta(days=1)
    return {"pm": float(r[0] or 0), "botrytis": float(r[1] or 0),
            "bacchus_index": float(r[3] or 0) if contiguous else 0.0,
            "bacchus_dry_run": int(r[4] or 0) if contiguous else 0,
            "goidanich": float(r[2] or 0)}


DISEASE_UPSERT = text("""
    INSERT INTO insights_site_disease
        (site_id, date, vintage_year, powdery_mildew_risk, downy_mildew_risk,
         botrytis_risk, pm_daily_index, pm_cumulative_index, pm_favorable_hours,
         pm_lethal_hours, botrytis_severity, botrytis_cumulative,
         botrytis_wet_hours, botrytis_sporulation_index, dm_primary_met,
         dm_primary_score, dm_goidanich_index, growth_stage,
         humidity_available, hours_used,
         bacchus_index, bacchus_peak, bacchus_infection,
         bacchus_wet_hours, bacchus_dry_run, created_at)
    VALUES
        (:site_id, :date, :vintage_year, :pm_risk, :dm_risk,
         :bot_risk, :pm_daily, :pm_cum, :pm_fav,
         :pm_lethal, :bot_sev, :bot_cum,
         :bot_wet, :bot_spor, :dm_primary,
         :dm_score, :dm_goid, :growth_stage,
         :humidity_available, :hours_used,
         :bac_index, :bac_peak, :bac_infection,
         :bac_wet, :bac_dry, now())
    ON CONFLICT (site_id, date) DO UPDATE SET
        vintage_year = EXCLUDED.vintage_year,
        powdery_mildew_risk = EXCLUDED.powdery_mildew_risk,
        downy_mildew_risk = EXCLUDED.downy_mildew_risk,
        botrytis_risk = EXCLUDED.botrytis_risk,
        pm_daily_index = EXCLUDED.pm_daily_index,
        pm_cumulative_index = EXCLUDED.pm_cumulative_index,
        pm_favorable_hours = EXCLUDED.pm_favorable_hours,
        pm_lethal_hours = EXCLUDED.pm_lethal_hours,
        botrytis_severity = EXCLUDED.botrytis_severity,
        botrytis_cumulative = EXCLUDED.botrytis_cumulative,
        botrytis_wet_hours = EXCLUDED.botrytis_wet_hours,
        botrytis_sporulation_index = EXCLUDED.botrytis_sporulation_index,
        dm_primary_met = EXCLUDED.dm_primary_met,
        dm_primary_score = EXCLUDED.dm_primary_score,
        dm_goidanich_index = EXCLUDED.dm_goidanich_index,
        growth_stage = EXCLUDED.growth_stage,
        humidity_available = EXCLUDED.humidity_available,
        hours_used = EXCLUDED.hours_used,
        bacchus_index = EXCLUDED.bacchus_index,
        bacchus_peak = EXCLUDED.bacchus_peak,
        bacchus_infection = EXCLUDED.bacchus_infection,
        bacchus_wet_hours = EXCLUDED.bacchus_wet_hours,
        bacchus_dry_run = EXCLUDED.bacchus_dry_run,
        created_at = now()
""")


def build_disease(db, site, start: date, end: date) -> dict:
    written = skipped = 0
    bacchus_events = 0
    stages: dict[str, int] = {}
    # Both timelines fetched once, ahead of the walk. See `stage_timeline`.
    timelines = [stage_timeline(db, site), zone_stage_timeline(db, site)]
    day = start
    # ASCENDING: both cumulative models read the previous day.
    while day <= end:
        hours = hourly_for_day(db, site.id, day)
        if not hours:
            skipped += 1
            day += timedelta(days=1)
            continue

        vintage = get_vintage_year(datetime.combine(day, datetime.min.time()))
        prev = previous_state(db, site.id, vintage, day)
        temps = [h["temp"] for h in hours]
        has_rh = any(h["rh"] is not None for h in hours)
        c48 = conditions_48h(db, site.id, day)

        pm = UCDavisPMIndex.calculate(temps, prev["pm"])
        # Growth stage drives the botrytis susceptibility weighting, and it is
        # now READ rather than defaulted. `insights_site_phenology` did not
        # exist when this was written; it does now, for all 67 sites.
        stage, stage_source = stage_on(timelines, day)
        stages[f"{stage}/{stage_source}"] = stages.get(
            f"{stage}/{stage_source}", 0) + 1
        bot = BotrytisModel.calculate(hours, prev["botrytis"], stage)
        # BACCHUS RUNS ALONGSIDE, not instead. 23 of BSI's 67 sites asked for it
        # by name; the rest read González-Domínguez. Both are scored for every
        # site because the models are cheap and a site that switches later
        # should not have a hole in its history.
        bac = BacchusModel.calculate(hours, prev["bacchus_index"],
                                     prev["bacchus_dry_run"])
        if bac.infection:
            bacchus_events += 1
        dm = DownyMildewModel.calculate(
            hours, c48["min_temp_48h"], c48["total_rain_48h"],
            c48["wet_hours_48h"], prev["goidanich"])

        db.execute(DISEASE_UPSERT, {
                "site_id": site.id, "date": day, "vintage_year": vintage,
                "pm_risk": pm.risk_level, "dm_risk": dm.risk_level,
                "bot_risk": bot.risk_level,
                "pm_daily": pm.daily_index, "pm_cum": pm.cumulative_index,
                "pm_fav": pm.favorable_hours, "pm_lethal": pm.lethal_hours,
                "bot_sev": bot.severity, "bot_cum": bot.cumulative,
                "bot_wet": bot.wet_hours, "bot_spor": bot.sporulation_index,
                "dm_primary": dm.primary_met, "dm_score": dm.primary_score,
                "dm_goid": dm.goidanich_index,
                # THE STAGE ACTUALLY USED, not the word "unknown". The old value
                # was a third answer: the row claimed a stage of 0.5 while the
                # model had scored it at 1.0, so nothing on the row could be
                # used to check the number beside it.
                "growth_stage": stage,
                # NOT a diagnostic flag: without humidity the botrytis and downy
                # numbers are a different quantity, and a reader has to be able
                # to tell.
                "humidity_available": has_rh,
                "hours_used": len(hours),
                # Bacchus. `peak` is what a reader should see -- the index
                # a day ENDS on can be zero because a reset wiped a period
                # that got most of the way to an infection.
                "bac_index": bac.index, "bac_peak": bac.peak,
                "bac_infection": bac.infection,
                "bac_wet": bac.wet_hours, "bac_dry": bac.dry_run,
        })
        written += 1
        day += timedelta(days=1)
    # Reported per run so a rescore that silently fell back to the floor for
    # every day is visible without querying the table afterwards.
    return {"days": written, "days_without_hours": skipped,
            "stages": stages, "bacchus_events": bacchus_events}


# --- driver ------------------------------------------------------------------

def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--site", type=int, help="one site id, else every ready site")
    ap.add_argument("--from", dest="start")
    ap.add_argument("--to", dest="end")
    ap.add_argument("--days", type=int, help="the last N days ending yesterday")
    ap.add_argument("--apply", action="store_true",
                    help="write; without it nothing is committed")
    ap.add_argument("--skip-hourly", action="store_true")
    ap.add_argument("--skip-disease", action="store_true")
    ap.add_argument("--require-rows", action="store_true",
                    help="exit non-zero if the window scored nothing. Every "
                         "scheduled run must pass this.")
    args = ap.parse_args()

    # Yesterday in NZ, not UTC: `date.today()` on a UTC host is the previous NZ
    # day for the whole New Zealand morning.
    yesterday = datetime.now(NZ).date() - timedelta(days=1)
    if args.days:
        start, end = yesterday - timedelta(days=args.days - 1), yesterday
    elif args.start and args.end:
        start, end = date.fromisoformat(args.start), date.fromisoformat(args.end)
    else:
        raise SystemExit("give --days, or both --from and --to")
    if end < start:
        raise SystemExit(f"empty window: {start} to {end}")
    if start < RECORD_STARTS:
        log.warning("%s is before the record starts (%s) — the hourly rain-gauge "
                    "network was a quarter of its present size, so the wetness "
                    "term has little rainfall behind it", start, RECORD_STARTS)

    db = SessionLocal()
    try:
        q = db.query(InsightsSite).filter(InsightsSite.status == "ready")
        if args.site:
            q = q.filter(InsightsSite.id == args.site)
        sites = q.order_by(InsightsSite.id).all()
        if not sites:
            log.info("no ready sites")
            return 0

        log.info("window %s .. %s over %d site(s)%s",
                 start, end, len(sites), "" if args.apply else "   DRY RUN")
        log.info("refusal distances: temp %.0f km, humidity %.0f km, "
                 "rain %.0f km", pc.MAX_TEMP_KM, pc.MAX_HUMIDITY_KM,
                 pc.MAX_RAIN_KM)

        totals = {"hours": 0, "days": 0, "no_rh": 0, "stages": {},
                  "bacchus_events": 0}
        for site in sites:
            if site.latitude is None or site.longitude is None:
                log.warning("  site %s has no coordinate — skipped", site.id)
                continue

            if not args.skip_hourly:
                h = build_hourly(db, site, start, end)
                if h.get("reason"):
                    log.warning("  site %-4s %-24s %s", site.id,
                                (site.label or "")[:24], h["reason"])
                    continue
                totals["hours"] += h["hours"]
                if h["hours_with_rh"] == 0:
                    totals["no_rh"] += 1
                log.info("  site %-4s %-24s %4d h, %3d wet, rh on %4d h, "
                         "%2d neighbours, nearest %.1f km",
                         site.id, (site.label or "")[:24], h["hours"],
                         h["wet_hours"], h["hours_with_rh"], h["neighbours"],
                         h["nearest_km"] or -1)

            if not args.skip_disease:
                d = build_disease(db, site, start, end)
                totals["days"] += d["days"]
                totals["bacchus_events"] += d["bacchus_events"]
                for key, n in d["stages"].items():
                    totals["stages"][key] = totals["stages"].get(key, 0) + n
                log.info("       %-29s %4d day(s) scored, %d without hours, "
                         "stages %s", "", d["days"], d["days_without_hours"],
                         ", ".join(f"{k} x{n}"
                                   for k, n in sorted(d["stages"].items())))

        log.info("")
        log.info("%d hour(s), %d site-day(s) %s", totals["hours"],
                 totals["days"], "written" if args.apply else "would be written")
        log.info("Bacchus: %d site-day(s) reached the 1.0 infection "
                 "threshold", totals["bacchus_events"])
        if totals["stages"]:
            log.info("botrytis susceptibility stages used: %s",
                     ", ".join(f"{k} x{n}"
                               for k, n in sorted(totals["stages"].items())))
            floored = sum(n for k, n in totals["stages"].items()
                          if k.endswith("/floor"))
            if floored:
                log.warning("%d site-day(s) had NO phenology at the site or its "
                            "zone and fell back to '%s'. That is the earliest "
                            "stage the model can express, not a measurement.",
                            floored, STAGE_FLOOR)
        if totals["no_rh"]:
            log.warning("%d site(s) got NO humidity at any hour — beyond %.0f km "
                        "the estimate is refused rather than guessed, so their "
                        "botrytis and downy numbers are not comparable",
                        totals["no_rh"], pc.MAX_HUMIDITY_KM)
        if args.apply:
            db.commit()
            log.info("committed")
        else:
            db.rollback()
            log.info("dry run - nothing written. Re-run with --apply.")

        # A SCHEDULED RUN ASSERTS ON A ROW COUNT, NOT AN EXIT CODE.
        #
        # Everything above returns 0 whether it scored fifteen days or none:
        # a site beyond every refusal distance, a station feed that stopped, an
        # empty window all look identical to success. That is this pipeline's
        # signature failure — `run_ingestion` once printed "Found 0 active
        # Harvest stations" and exited 0 for a whole fleet backfill.
        if args.require_rows and not totals["days"]:
            log.error("FAILED: --require-rows was set and no site-day was scored")
            return 1
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
