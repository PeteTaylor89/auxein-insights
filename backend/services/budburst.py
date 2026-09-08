"""Budburst by chilling-forcing, after Chuine (2000).

The one phenological stage the platform has never modelled. `phenology_service`
starts at flowering, and budburst existed only as a label in `utils/el_scale.py`
and the unreachable multiplier `'budburst': 0.1` in `disease_service_v2`.

## The model, and why it is not a GDD threshold

Four steps, and the order is the whole point:

  1. Endo-dormancy OPENS when daylength falls below the critical photoperiod.
  2. Chilling accumulates as a decreasing sigmoid of hourly temperature.
  3. Endo-dormancy RELEASES when the chilling requirement C* is met.
  4. Only then does forcing accumulate, to F*, and budburst occurs.

A forcing-only model with a fixed start date cannot do this, because it has no
way to know when dormancy broke. Both Leolini et al. (2020) across Europe and
Zhu et al. (2021) in New Zealand tested forcing-only, chilling-forcing, and
chilling-forcing-with-overlap against observed budburst, and both chose
chilling-forcing.

Parameters live in `budburst_parameters`, seeded from APSIM NG
`Models/Resources/Grapevine.json`. See the migration
`budburst_chilling_forcing` for why they are not in the paper.

## THREE RULES THAT KEEP THIS HONEST

**Recompute the whole season, every run. Never carry a running total.** The
weekly surface refit rewrites D-9..D-3, which changes `temp_min`/`temp_max`,
which changes chilling. A stored cumulative would outlive the inputs that
produced it and there would be nothing on the row to say so. This is the same
reason `aggregate_zone_daily_surface` re-derives `gdd_cumulative` across the
whole vintage instead of carrying it forward.

**Refuse when the series does not cover the trigger.** A site whose daily record
begins after its own photoperiod trigger will happily accumulate from whenever
its data starts and return a confident, late date. That is not hypothetical: on
2026-09-08 zone 13 had rows only from 1 July, accumulated 47.6 chill-days
instead of ~100, and produced a plausible-looking C_endo with nothing anywhere
saying the window had been truncated. `estimate` returns a reason instead.

**Freeze the date once it has happened.** After F* is reached the stored date is
the day the accumulation actually crossed it, not a projection recomputed from a
warm October. The zone job keeps the same rule for flowering.

## The hourly interpolation is the known residual

Both responses are non-linear in temperature and both are evaluated HOURLY and
averaged, not applied to the daily mean. APSIM interpolates the diurnal curve
with `HourlySinPpAdjusted` -- a photoperiod-adjusted sine. This module uses a
plain sine with the minimum at 05:00 and the maximum at 15:00.

Measured against the 2026 season that difference is small but signed: it does
not cancel, because `Rc` is steepest around `Xo` and the sign of the error flips
either side of it. Validated 2026-09-08 against 333 observed site-seasons, the
model ran 1-6 days early where it fell outside the observed range. Replacing
this function with the photoperiod-adjusted form is the first place to look for
that.
"""
from __future__ import annotations

import math
from datetime import date, timedelta
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

# Matches `site_phenology.GDD_RATE_LOOKBACK_DAYS`. The projected date is a
# forcing shortfall divided by this rate, so a different window here would make
# budburst disagree with every other projected date on the same row for a reason
# that has nothing to do with the vine.
RATE_LOOKBACK_DAYS = 14

# The photoperiod trigger cannot fall before this. Searching from 1 January
# rather than the solstice keeps the scan cheap and covers every New Zealand
# latitude, where the crossing runs from 20 February at -35.4 to 1 March at
# -45.1.
TRIGGER_SEARCH_FROM = (1, 1)
TRIGGER_SEARCH_DAYS = 200


def parameters(db: Session) -> dict[str, dict]:
    """Active cultivars, keyed on variety code."""
    return {r["variety_code"]: dict(r) for r in db.execute(text("""
        SELECT variety_code, variety_name, c_star, xo, b, f_star, t_b,
               critical_photoperiod
          FROM budburst_parameters
         WHERE is_active = true
    """)).mappings().all()}


def daylength(day: date, latitude: float) -> float:
    """Hours between sunrise and sunset, sun centre on the geometric horizon.

    GEOMETRIC, not civil twilight, because the source resource sets
    `Twilight = 0.0` alongside the 13.14 h threshold. The distinction is not
    cosmetic: at -41.5 the geometric crossing is 26 February and the civil one
    is 22 March, a 23-day difference in when chilling starts counting.
    """
    doy = day.timetuple().tm_yday
    decl = math.radians(23.45 * math.sin(math.radians(360.0 * (284 + doy) / 365.0)))
    lat = math.radians(latitude)
    cos_ws = max(-1.0, min(1.0, -math.tan(lat) * math.tan(decl)))
    return 24.0 / math.pi * math.acos(cos_ws)


def trigger_date(year: int, latitude: float, critical: float) -> Optional[date]:
    """First day of `year` whose daylength drops below the critical photoperiod.

    This is astronomy, so it is effectively a regional constant -- across every
    Auxein zone it moves only nine days. All of the spatial signal in a budburst
    date comes from temperature, none of it from here.
    """
    start = date(year, *TRIGGER_SEARCH_FROM)
    for offset in range(TRIGGER_SEARCH_DAYS):
        day = start + timedelta(days=offset)
        if daylength(day, latitude) < critical:
            return day
    return None


def hourly(tmin: float, tmax: float) -> list[float]:
    """A day's 24 hourly temperatures from its min and max.

    Plain sine, minimum at 05:00 and maximum at 15:00. See the module docstring:
    APSIM uses a photoperiod-adjusted sine and this is the known residual.
    """
    mean = (tmin + tmax) / 2.0
    amplitude = (tmax - tmin) / 2.0
    return [mean + amplitude * math.sin(2 * math.pi * (h - 11.0) / 24.0)
            for h in range(24)]


def chill_unit(tmin: float, tmax: float, xo: float, b: float) -> float:
    """Chill-days contributed by one day, at most 1.0.

    A decreasing sigmoid with its half-response at `xo`; `b` is negative, which
    is what makes it decreasing. Evaluated hourly and AVERAGED, matching APSIM's
    `SubDailyInterpolation`, so the unit is days rather than hours.
    """
    return sum(1.0 / (1.0 + math.exp(-(t - xo) / b))
               for t in hourly(tmin, tmax)) / 24.0


def forcing_unit(tmin: float, tmax: float, t_b: float) -> float:
    """Degree-days above `t_b` contributed by one day, hourly and averaged.

    Not the same as `max(0, tmean - t_b)`. With `t_b` near zero the two agree
    only when no hour of the day goes below it; on a frosty day the hourly form
    is HIGHER, because clipping hour by hour discards less than averaging first.
    """
    return sum(max(0.0, t - t_b) for t in hourly(tmin, tmax)) / 24.0


def season_series(db: Session, site_id: int, since: date,
                  until: date) -> list[tuple]:
    """The site's daily min/max over the accumulation window, in date order."""
    return [(r["date"], float(r["temp_min"]), float(r["temp_max"]))
            for r in db.execute(text("""
                SELECT date, temp_min, temp_max
                  FROM insights_site_daily
                 WHERE site_id = :sid AND date BETWEEN :a AND :b
                   AND temp_min IS NOT NULL AND temp_max IS NOT NULL
                 ORDER BY date
            """), {"sid": site_id, "a": since, "b": until}).mappings().all()]


def estimate(db: Session, site, on: date, vintage: int,
             params: dict, series: Optional[list[tuple]] = None) -> dict:
    """Budburst for one site, one cultivar, as at `on`.

    `vintage` is the harvest year. The budburst that opens vintage V happens in
    the spring of year V-1, and its chilling window opens the previous February
    -- so the whole accumulation lives in calendar year V-1.

    Returns a dict of the storable columns plus `reason`, which is None on
    success and otherwise says why there is no date. Never returns a partial
    accumulation dressed as a result.
    """
    blank = {"budburst_date": None, "endodormancy_date": None,
             "chill_units": None, "forcing_units": None}

    if site.latitude is None:
        return {**blank, "reason": "the site has no latitude"}

    critical = float(params["critical_photoperiod"])
    trigger = trigger_date(vintage - 1, float(site.latitude), critical)
    if trigger is None or trigger > on:
        return {**blank,
                "reason": f"the {critical:g} h photoperiod trigger for vintage "
                          f"{vintage} has not been reached"}

    if series is None:
        series = season_series(db, site.id, trigger, on)
    rows = [r for r in series if trigger <= r[0] <= on]

    # THE GUARD. A series that starts after the trigger cannot be accumulated
    # from -- see the module docstring. Judged on the first row's date, not on
    # whether rows exist, because rows always exist.
    if not rows:
        return {**blank,
                "reason": f"no daily record between {trigger} and {on}"}
    if rows[0][0] > trigger:
        return {**blank,
                "reason": f"daily record starts {rows[0][0]}, after the "
                          f"{trigger} photoperiod trigger: the chilling window "
                          f"is truncated"}

    c_star = float(params["c_star"])
    f_star = float(params["f_star"])
    xo, b, t_b = (float(params["xo"]), float(params["b"]), float(params["t_b"]))

    chill = forcing = 0.0
    endodormancy = burst = None
    daily_forcing: list[float] = []

    for day, tmin, tmax in rows:
        if endodormancy is None:
            chill += chill_unit(tmin, tmax, xo, b)
            if chill >= c_star:
                endodormancy = day
            continue
        unit = forcing_unit(tmin, tmax, t_b)
        forcing += unit
        daily_forcing.append(unit)
        # Frozen on the day it actually crossed, not re-projected afterwards.
        if burst is None and forcing >= f_star:
            burst = day

    result = {
        "endodormancy_date": endodormancy,
        "chill_units": round(chill, 2),
        "forcing_units": round(forcing, 2) if endodormancy else None,
        "budburst_date": burst,
        "reason": None,
    }
    if burst is not None or endodormancy is None:
        # Either it has happened, or chilling is still running and there is
        # nothing to project from. Both are complete answers.
        return result

    # Still forcing. Project on the trailing rate, over the days PRESENT rather
    # than over the window, so a gap in the record cannot understate the rate
    # and push the date later.
    window = daily_forcing[-RATE_LOOKBACK_DAYS:]
    rate = sum(window) / len(window) if window else 0.0
    if rate <= 0:
        return result
    # `date + timedelta` reads only whole days, so a fractional projection would
    # always truncate downward and buy back half a day of bias for free.
    result["budburst_date"] = on + timedelta(
        days=round((f_star - forcing) / rate))
    return result
