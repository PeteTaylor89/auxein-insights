"""The 1986-2005 baseline curve for a Pro site, at daily resolution.

A current-season panel needs something to plot the season against, day by day.
This module builds it.

## Zone shape, site level

There is no daily baseline for a single cell and there cannot be one: the
surface archive holds no daily rasters before 2024, and the 1986-2005 daily
climatology CSVs behind `climate_zone_daily_baseline` are per ZONE. So the curve
takes its **day-to-day shape from the zone** and its **level from the site's own
1986-2005 monthly normal** — an additive offset for temperature, a ratio for
rainfall, computed per calendar month.

The zone's monthly level is derived by integrating the daily baseline itself,
NOT by reading `climate_zone_surface_monthly`. That is what makes the rescaled
curve integrate back to exactly the site's monthly normal. Level it against a
different table and a residual survives the rescale, and a residual that varies
by month looks exactly like a climate signal.

This is not a cosmetic correction. Waipara's zone Sep-Apr GDD10 baseline is
1,147.8; Fancrest, a site inside that zone, averages 1,040.9. Plotted against
the raw zone curve, that site runs a 107 GDD deficit in every season it will
ever have.

## GDD is not rescaled, it is recomputed

Shifting a GDD10 climatology by a temperature offset is not linear: a site 1 degC
warmer than its region gains a full degree-day in midsummer but only a fraction
of one in the shoulders, where many days sit below the base. So the zone's daily
*tmean* curve is shifted and GDD is re-integrated from the shifted mean and the
zone's day-of-vintage sd, using the same normal-integral estimator as
`scripts/interpolation/gdd_season.gdd_from_normal` and
`insights_site_service.derive_gdd10`. Live GDD and archived GDD therefore remain
the same estimator, which is the only reason they can be compared at all.

`sd` here is the spread of that day-of-vintage ACROSS the twenty baseline years,
which is the right quantity: the baseline for a day is the expectation of
max(0, T - 10) over years, and T varies between years with exactly that sd. Note
this is a different quantity from `insights_site_monthly`'s `temp_mean/sd`, which
is the within-month spread of daily values. They are not interchangeable.

## Two defects in the source table, both handled here

* **Day 243 is missing in every zone.** In this table's numbering — day 1 is
  1 July of a non-leap 365-day reference year — that is 28 February, so February
  carries 27 days. Left alone, a Sep-Apr cumulative under-counts by about 0.65%.
  It is filled by interpolating days 242 and 244.
* **`gdd_base0_cumulative_avg` is cumulative TMEAN**, base zero, the same trap as
  `climate_zone_daily.gdd_cumulative`. Nothing here reads it.
"""
from __future__ import annotations

import math
from calendar import monthrange
from datetime import date, timedelta
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

# The season the product is defined on, matching `insights_site_service`.
SEASON_START_MONTH, SEASON_START_DAY = 9, 1
SEASON_END_MONTH, SEASON_END_DAY = 4, 30

# The baseline the whole Pro page is on: the period the SSP projection deltas
# are measured from, and the period this daily climatology covers.
BASELINE_LO, BASELINE_HI = 1986, 2005

# `climate_zone_daily_baseline.day_of_vintage` 1 = 1 July of a NON-LEAP year.
# Any non-leap year works as the anchor; 2001 is arbitrary and never surfaces.
_REF_YEAR = 2001
_REF_ANCHOR = date(_REF_YEAR, 7, 1)
_DAYS_IN_REF = 365

# Filled by interpolation — see the module docstring.
MISSING_DOV = 243

GDD_BASE = 10.0
FROST_THRESHOLD = 0.0
HOT_DAY_THRESHOLD = 25.0


def day_of_vintage(d: date) -> int:
    """Calendar date -> the source table's day-of-vintage.

    29 February is mapped onto 28 February's slot rather than allowed to shift
    every later day of the season by one. The reference year has no 29th and the
    table has 365 slots, so a naive day count against the season start silently
    puts March onto February's climatology in a leap vintage.
    """
    month, day = d.month, d.day
    if (month, day) == (2, 29):
        day = 28
    dov = (date(_REF_YEAR, month, day) - _REF_ANCHOR).days + 1
    return dov if dov > 0 else dov + _DAYS_IN_REF


def season_bounds(vintage: int) -> tuple[date, date]:
    """The Sep-Apr season labelled by the year it ends in."""
    return (date(vintage - 1, SEASON_START_MONTH, SEASON_START_DAY),
            date(vintage, SEASON_END_MONTH, SEASON_END_DAY))


def season_days(vintage: int) -> list[date]:
    start, end = season_bounds(vintage)
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


def _ndtr(z: float) -> float:
    """Standard normal CDF.

    `math.erf` is correctly rounded, so this is exact rather than an
    approximation, and it keeps scipy out of the API image — `backend/venv` is
    what EB installs and it has no scipy. Mirrors `gdd_season._ndtr` and
    `insights_site_service.derive_gdd10` deliberately.
    """
    return 0.5 * (1.0 + math.erf(z / math.sqrt(2.0)))


def expected_excess(mu: float, sd: float, base: float) -> float:
    """E[max(0, T - base)] for T ~ N(mu, sd). One day's degree-days."""
    sd = max(float(sd), 1e-6)
    z = (float(mu) - base) / sd
    phi = math.exp(-0.5 * z * z) / math.sqrt(2.0 * math.pi)
    return (float(mu) - base) * _ndtr(z) + sd * phi


def prob_below(mu: float, sd: float, threshold: float) -> float:
    """P(T < threshold). The expected count of frost nights, one day at a time.

    A frost night is a probability at climatological scale, not a yes or no: on
    a day whose mean minimum is 2 degC with an interannual sd of 3, roughly a
    quarter of years froze. Counting only days whose MEAN is below zero would
    report zero frost nights for most of a real spring.
    """
    sd = max(float(sd), 1e-6)
    return _ndtr((threshold - float(mu)) / sd)


def prob_at_or_above(mu: float, sd: float, threshold: float) -> float:
    """P(T >= threshold). Same argument as `prob_below`, other tail."""
    return 1.0 - prob_below(mu, sd, threshold)


# --- the zone's own curve ----------------------------------------------------

_ZONE_FIELDS = ("tmean_avg", "tmean_sd", "tmin_avg", "tmin_sd",
                "tmax_avg", "tmax_sd", "gdd_base10_avg", "rain_avg", "rain_sd")


def zone_curve(db: Session, zone_id: int) -> dict[int, dict]:
    """day_of_vintage -> the zone's 1986-2005 daily climatology.

    Returns {} when the zone has no baseline at all — zone 21, South Coast, is
    the one such zone. The caller renders an absent panel; it does not fall back
    to another zone's climate.
    """
    rows = db.execute(text(f"""
        SELECT day_of_vintage, {', '.join(_ZONE_FIELDS)}
          FROM climate_zone_daily_baseline
         WHERE zone_id = :zid
         ORDER BY day_of_vintage
    """), {"zid": zone_id}).mappings().all()
    if not rows:
        return {}

    curve = {r["day_of_vintage"]: {f: (float(r[f]) if r[f] is not None else None)
                                   for f in _ZONE_FIELDS}
             for r in rows}
    _fill_missing_day(curve)
    return curve


def _fill_missing_day(curve: dict[int, dict]) -> None:
    """Interpolate day 243 (28 February) from its neighbours, in place."""
    if MISSING_DOV in curve:
        return
    before, after = curve.get(MISSING_DOV - 1), curve.get(MISSING_DOV + 1)
    if not before or not after:
        return
    curve[MISSING_DOV] = {
        f: (None if before[f] is None or after[f] is None
            else (before[f] + after[f]) / 2.0)
        for f in _ZONE_FIELDS
    }
    curve[MISSING_DOV]["interpolated"] = True


def zone_month_level(curve: dict[int, dict]) -> dict[int, dict]:
    """Calendar month -> the zone's level, integrated from its OWN daily curve.

    Deliberately not read from `climate_zone_surface_monthly`. See the module
    docstring: levelling against a different table leaves a month-varying
    residual that survives the rescale and reads as a climate signal.
    """
    buckets: dict[int, list[dict]] = {}
    for dov, row in curve.items():
        d = _REF_ANCHOR + timedelta(days=dov - 1)
        buckets.setdefault(d.month, []).append(row)

    out = {}
    for month, rows in buckets.items():
        n = len(rows)
        out[month] = {
            "n_days": n,
            "tmean": sum(r["tmean_avg"] for r in rows) / n,
            "tmin": sum(r["tmin_avg"] for r in rows) / n,
            "tmax": sum(r["tmax_avg"] for r in rows) / n,
            "rain": sum(r["rain_avg"] for r in rows),
        }
    return out


# --- the site's level --------------------------------------------------------

_SITE_BANDS = {
    "tmean": ("temp_mean", "mean"),
    "tmin": ("temp_min", "mean"),
    "tmax": ("temp_max", "mean"),
    "rain": ("rainfall", "sum"),
}


def site_month_normal(db: Session, site_id: int,
                      lo: int = BASELINE_LO, hi: int = BASELINE_HI) -> dict[int, dict]:
    """Calendar month -> the site's own 1986-2005 normal.

    Note the site record starts at vintage 1987 (`insights_site_service.
    FIRST_VINTAGE`), so 1986-2005 yields 19 seasons rather than 20. That is the
    archive's start, not a gap in this site.
    """
    rows = db.execute(text("""
        SELECT variable, statistic, month, avg(value) AS avg, count(*) AS n
          FROM insights_site_monthly
         WHERE site_id = :sid AND year BETWEEN :lo AND :hi
           AND value IS NOT NULL
         GROUP BY variable, statistic, month
    """), {"sid": site_id, "lo": lo, "hi": hi}).mappings().all()

    indexed = {(r["variable"], r["statistic"], r["month"]): (float(r["avg"]), r["n"])
               for r in rows}
    out: dict[int, dict] = {}
    for month in range(1, 13):
        entry = {}
        for key, (variable, statistic) in _SITE_BANDS.items():
            hit = indexed.get((variable, statistic, month))
            if hit:
                entry[key], entry[f"{key}_n"] = hit
        if entry:
            out[month] = entry
    return out


def month_adjustments(zone_level: dict[int, dict],
                      site_level: dict[int, dict]) -> dict[int, dict]:
    """Per month: an additive offset for temperature, a ratio for rainfall.

    Rainfall is proportional, not additive. A site that catches 20% more than
    its region catches 20% more in a wet month and in a dry one; adding a fixed
    millimetre offset would invent rain on days the region recorded none and
    can drive a dry month negative.
    """
    out = {}
    for month, zone in zone_level.items():
        site = site_level.get(month)
        if not site:
            continue
        adj = {}
        for key in ("tmean", "tmin", "tmax"):
            if key in site and zone.get(key) is not None:
                adj[f"{key}_offset"] = site[key] - zone[key]
        if "rain" in site and zone.get("rain"):
            adj["rain_ratio"] = site["rain"] / zone["rain"]
        out[month] = adj
    return out


# --- the site's curve --------------------------------------------------------

def build(db: Session, site, vintage: int,
          lo: int = BASELINE_LO, hi: int = BASELINE_HI) -> Optional[dict]:
    """The site's 1986-2005 daily baseline across one Sep-Apr season.

    Returns None when the site has no zone, or its zone has no daily baseline —
    the caller shows an absent panel rather than a regional stand-in.
    """
    if not site.zone_id:
        return None
    curve = zone_curve(db, site.zone_id)
    if not curve:
        return None

    zone_level = zone_month_level(curve)
    site_level = site_month_normal(db, site.id, lo, hi)
    adjustments = month_adjustments(zone_level, site_level)

    days = []
    cum = {"gdd10": 0.0, "rain": 0.0, "frost_nights": 0.0, "hot_days": 0.0}
    interpolated_days = 0
    unadjusted_months: set[int] = set()

    for index, d in enumerate(season_days(vintage), start=1):
        dov = day_of_vintage(d)
        row = curve.get(dov)
        if not row:
            # A hole the interpolation could not close. Emit the day as a gap so
            # the series stays date-aligned; do not drop it and do not zero it.
            days.append({"date": d.isoformat(), "day_of_season": index,
                         "day_of_vintage": dov, "available": False})
            continue

        adj = adjustments.get(d.month)
        if adj is None:
            unadjusted_months.add(d.month)
            adj = {}

        tmean = row["tmean_avg"] + adj.get("tmean_offset", 0.0)
        tmin = row["tmin_avg"] + adj.get("tmin_offset", 0.0)
        tmax = row["tmax_avg"] + adj.get("tmax_offset", 0.0)
        rain = (row["rain_avg"] or 0.0) * adj.get("rain_ratio", 1.0)

        # Re-integrated, never rescaled — see the module docstring. The zone's
        # day-of-vintage sd travels with the shifted mean; a site-level sd does
        # not exist and assuming a narrower one would understate frost risk.
        gdd10 = expected_excess(tmean, row["tmean_sd"], GDD_BASE)
        frost_p = prob_below(tmin, row["tmin_sd"], FROST_THRESHOLD)
        hot_p = prob_at_or_above(tmax, row["tmax_sd"], HOT_DAY_THRESHOLD)

        cum["gdd10"] += gdd10
        cum["rain"] += rain
        cum["frost_nights"] += frost_p
        cum["hot_days"] += hot_p

        if row.get("interpolated"):
            interpolated_days += 1

        days.append({
            "date": d.isoformat(), "day_of_season": index,
            "day_of_vintage": dov, "available": True,
            "tmean": tmean, "tmin": tmin, "tmax": tmax,
            "rain": rain, "gdd10": gdd10,
            "frost_probability": frost_p, "hot_day_probability": hot_p,
            "gdd10_cumulative": cum["gdd10"],
            "rain_cumulative": cum["rain"],
            "frost_nights_cumulative": cum["frost_nights"],
            "hot_days_cumulative": cum["hot_days"],
            "interpolated": bool(row.get("interpolated")),
        })

    return {
        "vintage": vintage,
        "baseline": f"{lo}-{hi}",
        "zone_id": site.zone_id,
        "days": days,
        "season_totals": {
            "gdd10": cum["gdd10"], "rain": cum["rain"],
            "frost_nights": cum["frost_nights"], "hot_days": cum["hot_days"],
        },
        "meta": {
            "method": ("zone daily shape, site monthly level; GDD re-integrated "
                       "from the shifted mean and the zone's day-of-vintage sd"),
            "shape_source": "climate_zone_daily_baseline (1986-2005, per zone)",
            "level_source": "insights_site_monthly (1986-2005, this cell)",
            "interpolated_days": interpolated_days,
            # A month with no site normal is left at the zone's own level. Say
            # so rather than presenting a partly-regional curve as site-level.
            "unadjusted_months": sorted(unadjusted_months),
            "adjustments": {str(m): a for m, a in sorted(adjustments.items())},
        },
    }


def totals_to(baseline: dict, through: date) -> dict:
    """Baseline cumulatives at one day of the season.

    The season-to-date comparison lives or dies on this: the live accumulation
    must be measured against the baseline's accumulation to the SAME day, not
    against a whole-season total.
    """
    stamp = through.isoformat()
    last = None
    for day in baseline["days"]:
        if not day.get("available"):
            continue
        if day["date"] > stamp:
            break
        last = day
    if last is None:
        return {"gdd10": None, "rain": None, "frost_nights": None,
                "hot_days": None, "through": None, "day_of_season": 0}
    return {
        "gdd10": last["gdd10_cumulative"],
        "rain": last["rain_cumulative"],
        "frost_nights": last["frost_nights_cumulative"],
        "hot_days": last["hot_days_cumulative"],
        "through": last["date"],
        "day_of_season": last["day_of_season"],
    }
