"""The public regional dashboard: one region, four blocks, one payload.

Phase 3 of `docs/plans/COUNTRY_INDUSTRY_REGIONS_2026-08-24.md`. This is the
lighter, regional sibling of `insights_dashboard` (the Pro site page), and it
deliberately reuses that module rather than re-deriving anything:
`_season_strip` and `_models` there already take a zone and were always regional
products — neither phenology nor disease is downscaled to a cell.

## Why this page works when the Pro one does not

The Pro current-season panel is inert: `surface_run` has no rows at
`granularity='daily'` and `insights_site_daily` is empty, so there is no site
cell to read. The regional equivalent reads `climate_zone_daily`, which is
current to within a day or two. **The regional dashboard can ship and be
correct while the Pro page is still parked.**

## EVERY BLOCK HAS DIFFERENT COVERAGE, and that is the design constraint

Measured 2026-08-24 against 23 active zones:

    climate_zone_daily            13 zones   live season
    climate_zone_daily_baseline   22 zones   the normal curve
    phenology_estimates           13 zones
    disease_pressure              12 zones
    climate_zone_season_stats     21 zones   1987-2023
    climate_projections           23 zones

No single "does this region have data" flag can be right. Each block therefore
carries its own `available` and its own `reason`, and the client renders the
reason rather than an empty chart. A region can legitimately show a season
curve, no phenology, and a full projection panel.

## Three traps carried over from the Pro page, restated because they are silent

1. **`climate_zone_daily.gdd_cumulative` is base ZERO, not gdd10.** It is
   `temp_mean` summed. Marlborough reads ~4,591 against a Sep-Apr gdd10 near
   1,370. GDD is recomputed here as `sum(max(0, temp_mean - 10))`.
2. **`climate_zone_daily.vintage_year` is a JULY-June season**, not the Sep-Apr
   vintage this page uses. Filter by DATE, never by that column.
3. **A season in progress is compared over COMPLETE MONTHS only.** Eleven weeks
   against an eight-month normal reads as a catastrophic drought.

## And one that is specific to this module

`climate_zone_daily_baseline` is missing **day_of_vintage 243** for every zone —
that is 28 February, and it is missing because a 1986-2005 climatology built on
365-day years has nowhere to put it. It also has **no base-10 cumulative
column**, only base-0, so the gdd10 curve is accumulated here. Summing straight
over the present rows would leave a one-day flat spot in the cumulative curve in
late February, which is peak ripening and exactly where a grower is reading it.
Day 243 is interpolated from its neighbours instead. See `_baseline_curve`.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from services import insights_dashboard as pro
from services import insights_site_baseline as baseline_svc

# The season and the baseline are the Pro page's, deliberately. A region and a
# site inside it must not disagree about what "the normal" means, and the whole
# product moved to 1986-2005 on 2026-08-21.
BASELINE_LO = baseline_svc.BASELINE_LO
BASELINE_HI = baseline_svc.BASELINE_HI

# 1 July is day 1 of the vintage year in `climate_zone_daily_baseline`. The
# growing season runs 1 September to 30 April, so it starts 62 days in.
SEPT_1_DOY = 63
APRIL_30_DOY = 304

# The recent-conditions window, and the disease window below it. Same ten days
# deliberately: two charts over the same period read as one picture of the week
# rather than as two unrelated views.
RECENT_WINDOW_DAYS = 10

# The one gap in the daily climatology, for every zone. 28 February.
MISSING_BASELINE_DOY = 243

# The history block's headline metrics, read from `climate_zone_surface_season`.
#
# SOURCE CHANGED 2026-08-24, and this is the point of the whole exercise. It
# used to read `climate_zone_season_stats`, which is the pre-surface table and
# stops dead at vintage 2023 — three seasons stale, with every row still
# `source='modelled'` because the observed fold-in has never run.
# `climate_zone_surface_season` is the roll-up OF the published surface archive
# and now runs 1987..2026, so the region page finally reports the record the
# surfaces actually contain.
#
# Deliberately leads with the EXTREMES rather than the means: a regional page
# that opens with average temperature says less to a grower than one that opens
# with how many frost nights and how many days over 30. GDD and rain follow,
# because they are what a season is judged on.
#
# `direction` is which way is GOOD for a grower and only drives the arrow's
# colour. It never hides or reorders a number.
# NO FROST METRIC AT ALL, as of 2026-08-24.
#
# Total frost went first: the count is produced by thresholding a lapse-rate
# retrended Tmin field at 0 degC, and on calm frost nights the atmosphere
# INVERTS — cold air drains to the valley floor — so the lapse is wrong in SIGN
# for exactly the nights that make the count. Measured against stations in July
# 2025, Red Hills at 1328 m observed 1 frost night and its own pixel says 20,
# while Flaxbourne at 39 m observed 6 and its pixel says 0.
#
# SPRING FROST FOLLOWED, because it comes off the same field. It survived one
# round on the grounds that it is what growers act on and that its numbers are
# small — but small numbers hide the error, they do not avoid it. Marlborough's
# spring normal of 1.58 nights is subject to the same valley-floor erasure that
# took its annual count from 22 to 0.4.
#
# Frost returns when the engine does: interpolate the COUNT, or fit Tmin
# without the lapse retrend. Until then there is no frost figure here, which is
# the honest state.
#
# (Kept for the record: total frost was ALSO nearly indistinguishable from
# spring on the old Sep-Apr definition. Measured
# against `early_frost_days` over 920 zone-seasons it correlates at **0.970**,
# national means 3.88 vs 3.07 nights — two rows saying the same thing.
#
# The residue is not nothing: in the coldest inland zones the gap is real
# (Bendigo 13.5 vs 9.9, Central Otago 13.2 vs 9.7), so roughly a quarter of
# their growing-season frost falls outside spring. But that remainder is AUTUMN
# frost, which matters far less than a frost at budburst or flowering — so
# keeping spring and dropping the total is the better editorial call, not just
# the tidier one. `frost_days` is still in the table if it is ever wanted back.
HISTORY_METRICS = [
    ("hot_days_30", "Days over 30°C", "days", "hot_days_30", None),
    ("gdd10", "Growing degree days", "GDD", "gdd10", "up"),
    ("rain", "Growing-season rain", "mm", "rain", None),
    # The 99th percentile of the season's wet days. At season scale W is about
    # 70 wet days, so ceil(0.01 x W) is 1 or 2 — this is the heaviest or
    # second-heaviest fall of the season, and it measures within ~2 mm of
    # `rx1day` in every zone. "99th percentile" is technically exact and
    # practically opaque; the plain name is what it is.
    ("r99p", "Heaviest rainfall day", "mm", "r99p", None),
]

# Projections now come from `climate_zone_projection` — the MfE 2024 surfaces
# sampled through each zone's planted-cell mask, replacing the old
# `climate_projections` zone table on 2026-08-24.
PROJECTION_DEFAULT_SSP = "ssp245"
PROJECTION_DEFAULT_PERIOD = "fp2041-2060"

# The bands the summary leads with, in reading order, and the season each is
# taken from.
#
# **SEPAPR where it exists, ANN otherwise, and the payload says which.** Ours is
# a growing-season product: an annual mean folds in a winter warming signal
# nobody plans against and is not comparable with anything else on the page.
# Only gdd10 was published with a Sep-Apr arm — the seasonal resolution that the
# recon flagged as the blocker on composing it at all — so the rest fall back to
# annual and are labelled.
PROJECTION_BANDS = [
    # key, label, unit, variable, statistic, preferred season, direction
    ("gdd10", "Growing degree days", "GDD", "gdd10", "cumulative", "SEPAPR", "up"),
    ("tmean", "Mean temperature", "°C", "temp_mean", "mean", "SEPAPR", "up"),
    ("frost_days", "Frost nights", "nights", "temp_min", "frost_days", "SEPAPR", "down"),
    ("hot_days_30", "Days over 30°C", "days", "temp_max", "days_over_30", "SEPAPR", None),
    ("rain", "Rainfall", "mm", "rainfall", "sum", "SEPAPR", None),
]


@dataclass(frozen=True)
class ZoneRef:
    """The shim that lets `insights_dashboard`'s zone-level helpers be reused.

    `_season_strip` and `_models` take a Pro `site` but touch only `zone_id` —
    they were regional all along. Passing this rather than refactoring them
    keeps the Pro page and this page on literally the same code, which is the
    point: two implementations of "this region's current season" would drift,
    and the drift would be invisible.
    """
    zone_id: int


def _zone_row(db: Session, slug: str) -> Optional[dict]:
    row = db.execute(text("""
        SELECT z.id, z.name, z.slug, z.description, z.zone_level,
               r.name AS region_name, r.slug AS region_slug
          FROM climate_zones z
          LEFT JOIN wine_regions r ON r.id = z.region_id
         WHERE z.slug = :s AND z.is_active
    """), {"s": slug}).mappings().first()
    return dict(row) if row else None


def _baseline_curve(db: Session, zone_id: int) -> dict[int, dict]:
    """The 1986-2005 daily normal, accumulated, keyed by day_of_vintage.

    Two corrections happen here and neither is optional:

    * **Day 243 is absent** from the table for every zone (28 February). It is
      interpolated from 242 and 244 before accumulating, so the cumulative curve
      does not flat-spot for a day in late February.
    * **There is no base-10 cumulative column**, only base-0. Base-0 is not a
      growing-degree-day figure a viticulturist can use, so gdd10 is accumulated
      from `gdd_base10_avg` here.

    Returns {} when the zone has no climatology — 22 of 23 zones have one.
    """
    rows = db.execute(text("""
        SELECT day_of_vintage, gdd_base10_avg, rain_avg, tmean_avg
          FROM climate_zone_daily_baseline
         WHERE zone_id = :z
         ORDER BY day_of_vintage
    """), {"z": zone_id}).mappings().all()
    if not rows:
        return {}

    by_doy = {r["day_of_vintage"]: r for r in rows}

    # Fill the 28 February hole. Averaging the neighbours is the right estimator
    # for a climatology — the quantity is smooth at day scale — and it is only
    # ever one day out of 365.
    if (MISSING_BASELINE_DOY not in by_doy
            and MISSING_BASELINE_DOY - 1 in by_doy
            and MISSING_BASELINE_DOY + 1 in by_doy):
        a, b = by_doy[MISSING_BASELINE_DOY - 1], by_doy[MISSING_BASELINE_DOY + 1]

        def mid(field):
            av, bv = a[field], b[field]
            if av is None or bv is None:
                return None
            return (float(av) + float(bv)) / 2.0

        by_doy[MISSING_BASELINE_DOY] = {
            "day_of_vintage": MISSING_BASELINE_DOY,
            "gdd_base10_avg": mid("gdd_base10_avg"),
            "rain_avg": mid("rain_avg"),
            "tmean_avg": mid("tmean_avg"),
            "interpolated": True,
        }

    out, gdd, rain = {}, 0.0, 0.0
    for doy in range(SEPT_1_DOY, APRIL_30_DOY + 1):
        r = by_doy.get(doy)
        if r is None:
            continue
        gdd += float(r["gdd_base10_avg"] or 0.0)
        rain += float(r["rain_avg"] or 0.0)
        out[doy] = {
            "gdd10_cumulative": round(gdd, 1),
            "rain_cumulative": round(rain, 1),
            "tmean": float(r["tmean_avg"]) if r["tmean_avg"] is not None else None,
            "interpolated": bool(r.get("interpolated")),
        }
    return out



def _gdd_spread(db: Session, zone_id: int) -> dict:
    """Year-to-year spread of season-to-date GDD, at each month end.

    ## Why not accumulate the daily sd

    `climate_zone_daily_baseline` carries `gdd_base10_sd` per day — the spread
    ACROSS the twenty baseline years of that one day's GDD. Summing variances
    (`sqrt(sum(sd^2))`) would only be right if the years were independent day to
    day, and they are emphatically not: a warm season is warm all season. That
    assumption **understates** the true spread of a season total, and it does so
    by more the further into the season you go — the band would be tightest
    exactly where a grower most wants it honest.

    ## What this does instead

    Accumulates each baseline year's own monthly GDD into a running season
    total, then takes the standard deviation ACROSS years at each month end.
    That is the quantity the band should show: "how much do seasons differ by
    this point". Correlation between months is handled by construction, because
    each year is summed before anything is averaged.

    Month-end resolution, not daily — `climate_zone_surface_monthly` is the
    finest per-year record that exists. The client interpolates between points.
    """
    rows = db.execute(text("""
        SELECT year, month, mean
          FROM climate_zone_surface_monthly
         WHERE zone_id = :z AND variable = 'temp_mean' AND statistic = 'gdd10'
           AND year BETWEEN :lo - 1 AND :hi
         ORDER BY year, month
    """), {"z": zone_id, "lo": BASELINE_LO, "hi": BASELINE_HI}).mappings().all()
    if not rows:
        return {}

    by_ym = {(r["year"], r["month"]): float(r["mean"]) for r in rows}

    # Sep-Apr, labelled by the ending year. September belongs to the PREVIOUS
    # calendar year of the vintage — the mapping that has bitten this codebase
    # before.
    months = [(9, -1), (10, -1), (11, -1), (12, -1), (1, 0), (2, 0), (3, 0), (4, 0)]
    per_vintage: dict[int, list] = {}
    for vintage in range(BASELINE_LO, BASELINE_HI + 1):
        run, curve, complete = 0.0, [], True
        for month, offset in months:
            v = by_ym.get((vintage + offset, month))
            if v is None:
                complete = False
                break
            run += v
            curve.append((month, offset, run))
        # A partial year would drag every cumulative point below it. Whole
        # seasons only — the same rule the seasonal normals needed.
        if complete:
            per_vintage[vintage] = curve

    if len(per_vintage) < 5:
        return {}

    out = {}
    for idx, (month, offset) in enumerate(months):
        vals = [c[idx][2] for c in per_vintage.values()]
        n = len(vals)
        mean = sum(vals) / n
        var = sum((v - mean) ** 2 for v in vals) / (n - 1)
        # Day-of-vintage of that month's LAST day, so the band lines up with
        # the cumulative curve rather than leading it by a month.
        end = _end_of_month_doy(month, offset)
        out[end] = {"mean": round(mean, 1), "sd": round(var ** 0.5, 1),
                    "n_years": n}
    return out


def _end_of_month_doy(month: int, offset: int) -> int:
    """Day-of-vintage (1 July = 1) of the last day of a season month."""
    # A non-leap reference year: the climatology has 365 days and no 29 Feb.
    ref = 2001
    year = ref if offset == -1 else ref + 1
    last = _end_of_month(year, month)
    july1 = date(ref, 7, 1)
    return (last - july1).days + 1


def _end_of_month(y: int, m: int) -> date:
    nxt = date(y + 1, 1, 1) if m == 12 else date(y, m + 1, 1)
    return date.fromordinal(nxt.toordinal() - 1)


def _date_to_doy(d: date) -> int:
    """1 July is day 1. Same convention as `climate_zone_daily_baseline`."""
    july1 = date(d.year if d.month >= 7 else d.year - 1, 7, 1)
    return (d - july1).days + 1



def _recent(db: Session, zone_id: int, today: date,
            days: int = RECENT_WINDOW_DAYS) -> dict:
    """The last ten days of measured temperature and rainfall.

    Straight off `climate_zone_daily` — stations aggregated to the region, no
    interpolation, no baseline. It is the one block on this page that is purely
    observed, and it is the free tier's anchor: a grower can see what the region
    actually did this week without an account doing anything for them.

    Temperature comes as min/mean/max so the chart can draw a daily range band
    rather than three lines fighting each other. Rainfall is a daily total and
    belongs on its own axis — a 40 mm day and a 4 degC night share no scale.

    `station_count` travels per day because it varies: a day aggregated from
    three gauges is a weaker claim than one from nine, and the page should be
    able to say so rather than presenting both as the same line.
    """
    start = today - timedelta(days=days - 1)
    rows = db.execute(text("""
        SELECT date, temp_min, temp_mean, temp_max, rainfall_mm,
               station_count, confidence
          FROM climate_zone_daily
         WHERE zone_id = :z AND date BETWEEN :a AND :b
         ORDER BY date
    """), {"z": zone_id, "a": start, "b": today}).mappings().all()

    if not rows:
        return {"available": False, "window_days": days,
                "reason": "No station record for this region in the last "
                          f"{days} days."}

    def f(v):
        return float(v) if v is not None else None

    series = [{
        "date": r["date"].isoformat(),
        "temp_min": f(r["temp_min"]),
        "temp_mean": f(r["temp_mean"]),
        "temp_max": f(r["temp_max"]),
        "rain": f(r["rainfall_mm"]),
        "stations": r["station_count"],
        "confidence": r["confidence"],
    } for r in rows]

    rain_total = sum(p["rain"] or 0.0 for p in series)
    temps = [p["temp_max"] for p in series if p["temp_max"] is not None]
    lows = [p["temp_min"] for p in series if p["temp_min"] is not None]

    return {
        "available": True,
        "window_days": days,
        "from": series[0]["date"],
        "to": series[-1]["date"],
        # A gap is visible rather than implied: ten days requested, fewer
        # returned means the record has holes and the chart should show them.
        "days_present": len(series),
        "series": series,
        "summary": {
            "rain_total": round(rain_total, 1),
            "warmest": max(temps) if temps else None,
            "coldest": min(lows) if lows else None,
        },
        "source": "stations, aggregated to the region",
    }


def _season(db: Session, zone_id: int, vintage: int, today: date) -> dict:
    """The current-season graph: this season's curve against the normal.

    Three states, because this panel spends a third of every year — May through
    August — in a season that has not started. Rendering an empty chart then is
    a bug report waiting to happen; saying "starts in 8 days" is the answer.

    The totals table beside the graph comes from `insights_dashboard._season_strip`
    unchanged, so the region page and the Pro page compute "this season versus
    normal" with one implementation rather than two.
    """
    start, end = baseline_svc.season_bounds(vintage)
    state = pro._season_state(vintage, today)

    curve = _baseline_curve(db, zone_id)
    normal_available = bool(curve)

    if state == "not_started":
        return {
            "available": False,
            "state": state,
            "vintage": vintage,
            "starts_on": start.isoformat(),
            "days_until": (start - today).days,
            # `%-d` is glibc-only and raises "Invalid format string" on
            # Windows, where this is developed. Prod is Linux, so the platform
            # directive would have worked there and failed only locally — build
            # the day out of the integer instead and the question never arises.
            "reason": f"The {vintage} season starts on "
                      f"{start.day} {start:%B}.",
            "normal_available": normal_available,
            "series": [],
            "totals": None,
        }

    through = min(today, end)
    rows = db.execute(text("""
        SELECT date, temp_mean, rainfall_mm
          FROM climate_zone_daily
         WHERE zone_id = :z AND date BETWEEN :start AND :through
         ORDER BY date
    """), {"z": zone_id, "start": start, "through": through}).mappings().all()

    if not rows:
        return {
            "available": False,
            "state": state,
            "vintage": vintage,
            "reason": "No station record for this season yet.",
            "normal_available": normal_available,
            "series": [],
            "totals": None,
        }

    # Base 10, recomputed. NEVER `gdd_cumulative` from the table — see the
    # module docstring, that column is base zero.
    series, gdd, rain = [], 0.0, 0.0
    for r in rows:
        tmean = float(r["temp_mean"]) if r["temp_mean"] is not None else None
        if tmean is not None:
            gdd += max(0.0, tmean - 10.0)
        rain += float(r["rainfall_mm"] or 0.0)
        doy = _date_to_doy(r["date"])
        norm = curve.get(doy)
        series.append({
            "date": r["date"].isoformat(),
            "day_of_vintage": doy,
            "gdd10_cumulative": round(gdd, 1),
            "rain_cumulative": round(rain, 1),
            # The normal is carried per point rather than as a second series so
            # the client cannot mis-align them. A day with no climatology sends
            # null and the chart breaks its line, which is the truth.
            "gdd10_normal": norm["gdd10_cumulative"] if norm else None,
            "rain_normal": norm["rain_cumulative"] if norm else None,
        })

    # The spread band on the normal. Free users get the region's cumulative GDD
    # against its baseline WITH the year-to-year spread, which is the difference
    # between "you are ahead" and "you are ahead of most seasons".
    spread = _gdd_spread(db, zone_id)

    # The whole normal curve, so the chart can draw the season ahead of today
    # rather than stopping the reference line where the data stops.
    normal_full = [
        {"day_of_vintage": doy, **{k: v for k, v in curve[doy].items()
                                   if k in ("gdd10_cumulative", "rain_cumulative")}}
        for doy in sorted(curve)
    ]

    return {
        "available": True,
        "state": state,
        "vintage": vintage,
        # Month-end anchors for the +/- 1 SD band around the cumulative normal.
        # Keyed by day_of_vintage so the client can place them on the same axis
        # as the curve and interpolate between.
        "gdd10_spread": [
            {"day_of_vintage": doy, **vals} for doy, vals in sorted(spread.items())
        ],
        "season_start": start.isoformat(),
        "season_end": end.isoformat(),
        "through": through.isoformat(),
        "normal_available": normal_available,
        "baseline": f"{BASELINE_LO}-{BASELINE_HI}",
        "series": series,
        "normal_curve": normal_full,
        # Metric-by-metric against the archive, complete months only.
        "totals": _regional_totals(db, zone_id, vintage, today),
    }


def _regional_totals(db: Session, zone_id: int, vintage: int, today: date) -> dict:
    """`_season_strip`, with its Pro-page prose replaced.

    The computation is reused verbatim — that is the whole point of the shim.
    But `_season_strip` writes its own explanatory `note`, and that note is
    addressed to a Pro subscriber: it talks about "your site's own record" and
    why the two are shown side by side. On a public region page there is no
    site, so the sentence is simply false.

    Rewritten rather than dropped. The thing the note exists to say — these are
    STATION measurements at regional scale, not the interpolated surface — is
    just as important here, and deleting it would leave the comparison
    unexplained.
    """
    strip = pro._season_strip(db, ZoneRef(zone_id),
                              BASELINE_LO, BASELINE_HI, vintage, today)
    if strip and strip.get("available"):
        strip = dict(strip)
        # FROST IS DROPPED HERE, for the same reason it left the rest of the
        # page on 2026-08-24 — and one more that is specific to this table.
        #
        # The normal side is the lapse-biased surface count. The live side is
        # worse: `count(*) FILTER (WHERE temp_min < 0)` over `climate_zone_daily`
        # counts days the ZONE MEAN went below zero, not the mean number of days
        # each place went below zero. Marlborough's zone-mean Tmin never drops
        # below +1 degC in a whole year, so that column reads 0.0 regardless of
        # what actually happened. Two unreliable halves compared against each
        # other.
        #
        # Filtered here rather than in `insights_dashboard.LIVE_METRICS`, which
        # the Pro site page also reads. Pro is parked and unreviewed; changing
        # its content is not this change's business. The same argument applies
        # there and should be made when it is unparked.
        strip["metrics"] = [m for m in strip.get("metrics", [])
                            if "frost" not in m["metric"]]
        _fix_threshold_counts(db, zone_id, strip)
        strip["note"] = (
            "Measured at weather stations and aggregated to the whole region. "
            f"The normal is the {BASELINE_LO}-{BASELINE_HI} climate surface "
            "averaged over planted cells, so the two are different "
            "instruments reported side by side rather than combined."
        )
    return strip


# How much of the disease record the free chart draws.
#
# Cut from 90 to 10 days on 2026-08-24. A quarter-year of disease pressure is a
# browsing tool; what a grower checks a free page for is "is it building right
# now", and ten days is exactly the window that answers it. The longer record
# still exists and is what the paid view is for.
DISEASE_WINDOW_DAYS = 10



def _disease_series(db: Session, zone_id: int, days: int = DISEASE_WINDOW_DAYS) -> list:
    """The recent disease-pressure curve, for the chart.

    `_models` returns only the LATEST row, which is all the Pro panel needed —
    a badge and a number. A chart needs the shape, and the shape is the point:
    a botrytis index at 40 that has been climbing for a fortnight is a different
    instruction from the same 40 on its way down.

    Three indices, because they are the three models actually running and each
    has its own published scale:

      * `pm_cumulative_index`        UC Davis powdery, 0-100
      * `botrytis_sporulation_index` Gonzalez-Dominguez, 0-100
      * `dm_goidanich_index`         downy, Goidanich

    A ROLLING WINDOW, not a season. Disease pressure is a rolling quantity —
    that is why `disease_pressure` was deliberately left unpinned when the
    article widgets were pinned to `published_at` on 2026-08-23. Cutting it at
    the season boundary would blank the panel every September.
    """
    rows = db.execute(text("""
        SELECT date, pm_cumulative_index, botrytis_sporulation_index,
               dm_goidanich_index, downy_mildew_risk, powdery_mildew_risk,
               botrytis_risk, growth_stage
          FROM disease_pressure
         WHERE zone_id = :z AND date > current_date - :d
         ORDER BY date
    """), {"z": zone_id, "d": days}).mappings().all()

    def f(v):
        return float(v) if v is not None else None

    return [{
        "date": r["date"].isoformat(),
        "powdery": f(r["pm_cumulative_index"]),
        "botrytis": f(r["botrytis_sporulation_index"]),
        "downy": f(r["dm_goidanich_index"]),
        "powdery_risk": r["powdery_mildew_risk"],
        "botrytis_risk": r["botrytis_risk"],
        "downy_risk": r["downy_mildew_risk"],
        "growth_stage": r["growth_stage"],
    } for r in rows]



# Threshold counts on the live side, recomputed per STATION.
#
# `_season_strip` counts days the ZONE-AGGREGATED series crossed a threshold —
# a count-of-mean. The normal it is compared against is the mean of per-CELL
# counts out of the surface archive — a mean-of-counts. Those are different
# estimators and the gap is not small: Marlborough's 2026 season to February
# reads 14 days over 25 degC as a count-of-mean and 21.9 as a mean-of-counts,
# against a 26.0 normal. Averaging first flattens the hot places into the cool
# ones before the threshold is applied, so the count comes out low.
#
# Frost was withdrawn rather than fixed this way because BOTH its halves are
# unreliable; days over 25 sits inside the distribution, so matching the
# estimators is enough.
#
# The station set is resolved through the zone SUBTREE, matching
# `zone_aggregation.get_zone_stations_with_data`: a station tagged to
# Bannockburn contributes to Central Otago.
_THRESHOLD_COUNTS = {
    # metric key -> (column, SQL comparison)
    "hot_days_25": ("temp_max", ">= 25"),
    "hot_days_30": ("temp_max", ">= 30"),
}

# A station needs enough of the window to be worth averaging. Below this it is
# a partial record and would drag the mean down purely by being short.
_MIN_STATION_COVERAGE = 0.6


def _fix_threshold_counts(db: Session, zone_id: int, strip: dict) -> None:
    """Replace count-of-mean threshold values with mean-of-counts, in place."""
    start, through = strip.get("from"), strip.get("through")
    if not start or not through:
        return

    for m in strip.get("metrics", []):
        spec = _THRESHOLD_COUNTS.get(m["metric"])
        if spec is None:
            continue
        column, comparison = spec
        row = db.execute(text(f"""
            WITH RECURSIVE tree(id) AS (
                SELECT id FROM climate_zones WHERE id = :z
                UNION ALL
                SELECT c.id FROM climate_zones c JOIN tree t
                  ON c.parent_zone_id = t.id),
            stn AS (
                SELECT d.station_id,
                       count(*) FILTER (WHERE d.{column} {comparison}) AS n,
                       count(*) AS days
                  FROM weather_data_daily d
                  JOIN weather_stations w ON w.station_id = d.station_id
                 WHERE w.zone_id IN (SELECT id FROM tree)
                   AND d.date BETWEEN :a AND :b
                   AND d.{column} IS NOT NULL
                 GROUP BY 1)
            SELECT avg(n) AS mean_count, count(*) AS stations
              FROM stn
             WHERE days >= :min_days
        """), {"z": zone_id, "a": start, "b": through,
               "min_days": max(1, int(_MIN_STATION_COVERAGE * (
                   (__import__("datetime").date.fromisoformat(str(through))
                    - __import__("datetime").date.fromisoformat(str(start))).days
                   + 1)))}).mappings().first()

        if row and row["mean_count"] is not None and row["stations"]:
            m["value"] = round(float(row["mean_count"]), 1)
            m["value_stations"] = int(row["stations"])
            # The estimator is part of the claim, so it travels with it.
            m["value_source"] = (f"{row['stations']} stations, mean of each "
                                 "station's count")


def _history(db: Session, zone_id: int) -> dict:
    """Seasonal history back to 1987, with a trend, kept to a summary.

    Reads `climate_zone_surface_season` — the roll-up of the published surface
    archive — which as of 2026-08-24 runs **1987..2026**.

    ## Why not `climate_zone_season_stats`

    That is the pre-surface table and it stops at vintage **2023**. Every row in
    it is still `source='modelled'`; the observed fold-in that was supposed to
    extend it as seasons complete has never run. Reading it made this block
    three seasons stale while the surfaces underneath were current to 2026-07,
    which is precisely the discrepancy this page exists to avoid.

    The two tables also disagree on definitions — `climate_zone_season_stats`
    carries `hot_days30` as TX30 over the season, the surface roll-up carries
    `hot_days_30` per planted cell — so this is a source swap, not a column
    rename, and the numbers are expected to move slightly.

    ## The span is reported, never assumed

    `span.last` comes from the data. The previous version of this function
    hardcoded the 2023 ceiling into its own explanatory note, which would have
    gone stale the moment the archive was extended — and did, within days.

    ## The baseline is recomputed, not read

    `climate_zone_season_baseline` is stamped **1987-2006** while everything
    else on this page is 1986-2005. Different twenty-year windows. The normal is
    averaged over the page's own baseline from the season rows and the stored
    one is ignored: printing a 1987-2006 normal under a "1986-2005" heading is
    the kind of error that survives for months because both numbers look right.
    """
    wanted = tuple(m[3] for m in HISTORY_METRICS)
    rows = db.execute(text("""
        SELECT vintage_year, metric, mean
          FROM climate_zone_surface_season
         WHERE zone_id = :z AND metric = ANY(:metrics) AND mean IS NOT NULL
         ORDER BY vintage_year
    """), {"z": zone_id, "metrics": list(wanted)}).mappings().all()

    if not rows:
        return {"available": False,
                "reason": "Seasonal history is not modelled for this region yet."}

    by_metric: dict[str, list] = {}
    years: set[int] = set()
    for r in rows:
        by_metric.setdefault(r["metric"], []).append(
            (r["vintage_year"], float(r["mean"])))
        years.add(r["vintage_year"])

    metrics = []
    latest = max(years)
    for key, label, unit, column, direction in HISTORY_METRICS:
        points = by_metric.get(column)
        if not points:
            continue
        in_baseline = [v for y, v in points if BASELINE_LO <= y <= BASELINE_HI]
        # "Last ten seasons" is relative to the record's own end, not to today.
        # Anchoring it to today would silently shrink the window every year the
        # archive is not extended.
        recent = [v for y, v in points if y >= latest - 9]
        metrics.append({
            "key": key,
            "label": label,
            "unit": unit,
            "direction": direction,
            "normal": round(sum(in_baseline) / len(in_baseline), 2)
            if in_baseline else None,
            "recent_10yr": round(sum(recent) / len(recent), 2) if recent else None,
            "trend_per_decade": pro._slope_per_decade(points),
        })

    ordered = sorted(years)
    hot = dict(by_metric.get("hot_days_30", []))
    gdd = dict(by_metric.get("gdd10", []))

    return {
        "available": True,
        "baseline": f"{BASELINE_LO}-{BASELINE_HI}",
        "source": "500 m surface archive, planted-cell mean",
        "span": {"first": ordered[0], "last": ordered[-1],
                 "seasons": len(ordered)},
        "note": (f"{len(ordered)} growing seasons, {ordered[0]}-{ordered[-1]}, "
                 "rolled up from the 500 m climate surfaces over each region's "
                 "planted cells."),
        "metrics": metrics,
        "series": [
            {"vintage": y,
             "hot_days_30": hot.get(y),
             "gdd10": gdd.get(y)}
            for y in ordered
        ],
    }


def _projections(db: Session, zone_id: int) -> dict:
    """Downscaled projections for this region, sampled from the surfaces.

    ## What changed on 2026-08-24

    This used to read `climate_projections` — the zone-level product from the
    old engine, monthly, with no seasonal arm. It now reads
    `climate_zone_projection`: the **MfE 2024 CCAM multi-model-mean surfaces at
    500 m**, composed onto our own 1986-2005 normals and then sampled through
    each zone's planted-cell mask, weighted by planted hectares.

    That is the same mask, weighting and estimator the region's HISTORY uses, so
    for the first time a region's past and its future are measured the same way
    and the delta between them means something.

    ## Season

    `SEPAPR` where the band has it and `ANN` otherwise, with `season` on every
    headline so the client can say which. Only gdd10 was published with a
    Sep-Apr arm; the rest are annual, and an annual frost count is a different
    claim from a growing-season one.

    ## The baseline is ours

    `baseline_mean` is this zone's own 1986-2005 normal out of the archive, not
    MfE's and not a national median — the surfaces were built as
    `our_normal + MfE_change`, so that is what recovers the published change.
    It is also the same baseline the rest of this page reports, which is the
    only reason the projection can sit beside the history at all.
    """
    have = db.execute(text("""
        SELECT DISTINCT scenario, period FROM climate_zone_projection
         WHERE zone_id = :z
    """), {"z": zone_id}).mappings().all()
    if not have:
        return {"available": False,
                "reason": "Projections are not modelled for this region yet."}

    scenarios = sorted({r["scenario"] for r in have})
    # Calendar periods first and warming levels after: `fp` sorts before `wl`,
    # which is the order a grower reads them in anyway.
    periods = sorted({r["period"] for r in have})

    ssp = PROJECTION_DEFAULT_SSP if PROJECTION_DEFAULT_SSP in scenarios else scenarios[0]
    period = (PROJECTION_DEFAULT_PERIOD if PROJECTION_DEFAULT_PERIOD in periods
              else periods[0])

    rows = {
        (r["variable"], r["statistic"], r["season"]): r
        for r in db.execute(text("""
            SELECT variable, statistic, season, baseline_mean, projected_mean,
                   delta_mean, p10, p90, unit, rule
              FROM climate_zone_projection
             WHERE zone_id = :z AND scenario = :s AND period = :p
        """), {"z": zone_id, "s": ssp, "p": period}).mappings()
    }

    def f(v):
        return float(v) if v is not None else None

    headlines = []
    for key, label, unit, var, stat, want_season, direction in PROJECTION_BANDS:
        row = rows.get((var, stat, want_season)) or rows.get((var, stat, "ANN"))
        if row is None:
            continue
        headlines.append({
            "key": key,
            "label": label,
            "unit": unit,
            # Named per band, because they are not all the same season and
            # pretending otherwise is the error this whole block guards against.
            "season": row["season"],
            "seasonal": row["season"] == "SEPAPR",
            "baseline": f(row["baseline_mean"]),
            "projected": f(row["projected_mean"]),
            "delta": f(row["delta_mean"]),
            # Spread over the zone's planted cells — the same estimator the
            # history uses, so the two are comparable rather than merely similar.
            "p10": f(row["p10"]),
            "p90": f(row["p90"]),
            "direction": direction,
        })

    # The caveat belongs on ANY annual fallback, not only on an all-annual
    # panel. With gdd10 seasonal and the rest annual — which is today's shape —
    # the original test was false and the page said nothing at all.
    annual = [h["label"] for h in headlines if not h["seasonal"]]
    return {
        "available": bool(headlines),
        "scope": "region",
        "source": "MfE 2024 (CCAM multi-model mean) at 500 m, "
                  "composed onto the Auxein 1986-2005 normals",
        "baseline": f"{BASELINE_LO}-{BASELINE_HI}",
        "scenarios": scenarios,
        "periods": periods,
        "showing": {"ssp": ssp, "period": period},
        "headlines": headlines,
        "note": (
            "Sampled from the 500 m projection surfaces over this region's "
            "planted cells, against its own "
            f"{BASELINE_LO}-{BASELINE_HI} normal."
            + ("" if not annual else
               f" {', '.join(annual)} are ANNUAL figures — no growing-season "
               "arm is published for those bands.")),
        # Attribution is a licence condition, not decoration. CC BY 4.0.
        "attribution": ("Contains data from the Ministry for the Environment's "
                        "2024 New Zealand climate projections, CC BY 4.0."),
    }


# What the free tier gets, and why each one earns its place.
#
# The brief (Pete, 2026-08-24) was to make the free page genuinely useful and
# the paid page obviously worth paying for. The split is by TIME HORIZON, which
# is the honest axis:
#
#   FREE  — what is happening now and this season.
#           Ten days of measured temperature and rainfall; the season's
#           cumulative GDD against its baseline WITH the year-to-year spread;
#           ten days of disease pressure; phenology unchanged.
#
#   PAID  — what this region IS, and what it is becoming.
#           Forty seasons of history with per-decade trends, and the downscaled
#           projections. Neither answers "what do I do this week", which is why
#           giving them away weakened both halves: the free page was cluttered
#           with things a grower could not act on, and the paid page had no
#           clear line.
#
# The paid blocks are withheld SERVER-SIDE, not hidden in CSS. What is returned
# instead is a stub naming what sits behind it — the span, the metrics — because
# an upsell that cannot say what it is selling does not convert.
# GATED ON SIGN-IN, NOT ON PRO (Pete, 2026-08-25).
#
# History and projections were behind `is_pro`, which was wrong in the same
# direction the surface archive was wrong: it withheld what this REGION is and
# what it is becoming — the two things that make a region page worth linking to
# and worth landing on from a search. Neither is a decision anyone makes this
# week, so neither is what Pro sells; Pro sells the subscriber's own POINT.
#
# So the names below are about ANONYMOUS vs REGISTERED now. Nothing on the
# regional page is Pro.
OPEN_BLOCKS = ("recent", "season", "phenology", "disease")
REGISTERED_BLOCKS = ("history", "projections")

# Kept as aliases because `check_region_dashboard.py` and the client both read
# `free_blocks` / `paid_blocks` off the payload, and renaming a published field
# is a separate change from moving a gate.
FREE_BLOCKS = OPEN_BLOCKS
PAID_BLOCKS = REGISTERED_BLOCKS


def _season_holding_reason(vintage: int) -> str:
    """What phenology and disease say before the season opens.

    Both models accumulate from 1 September, so before that date there is
    nothing to report and that is a property of the CALENDAR, not of the
    region. Worded identically for both so the two blocks read as one state of
    the page rather than as two separate gaps in coverage.

    The date is derived from `insights_dashboard.SEASON_START_MONTH` rather than
    written out, because a season boundary that exists in two places is a season
    boundary that will eventually disagree with itself.
    """
    start = date(vintage - 1, pro.SEASON_START_MONTH, 1)
    # `start.day` rather than a strftime day code: %-d is glibc-only and %#d is
    # Windows-only, and this has to render the same on a dev box and on EB.
    return f"The {vintage} season starts on {start.day} {start.strftime('%B %Y')}."


def _locked(what: str, detail: str) -> dict:
    """A gated block, described but not served.

    `tier` is what the client renders its prompt from, so it says
    `registration` — a block that asks someone to buy Pro when a free account
    would open it is the most expensive kind of wrong copy.
    """
    return {
        "available": False,
        "tier": "registration",
        "locked": True,
        "reason": what,
        "detail": detail,
    }


def build(db: Session, slug: str, today: Optional[date] = None,
          registered: bool = False) -> Optional[dict]:
    """The whole page in one call. Returns None when the slug is not a zone.

    One payload rather than five requests: the Pro dashboard already proved the
    shape, and five round trips on a page whose blocks all key off the same zone
    is five chances for a partial render.

    `registered` gates history and projections — a FREE account opens both, and
    nothing on this page is Pro. It defaults to False so an anonymous caller,
    including a crawler, gets the open page and nothing leaks by omission of a
    parameter.
    """
    zone = _zone_row(db, slug)
    if not zone:
        return None

    today = today or datetime.now(timezone.utc).date()
    vintage = pro.current_vintage(today)
    zone_id = zone["id"]

    # Phenology and disease, straight from the Pro module. Both were always
    # regional; `ZoneRef` exists so they can be called without a Pro site.
    models = pro._models(db, ZoneRef(zone_id), today)

    # The Pro panel needed only the latest reading; a chart needs the shape.
    # Attached rather than folded into `_models` so the Pro page's payload does
    # not grow 90 rows it never draws.
    disease = dict(models["disease"])
    disease["series"] = (_disease_series(db, zone_id)
                         if disease.get("available") else [])
    disease["window_days"] = DISEASE_WINDOW_DAYS

    # ONE HOLDING LINE, NOT A COVERAGE EXCUSE (Pete, 2026-08-25).
    #
    # Both models fall back to "not modelled for this region yet", which was
    # true while they ran off station density — 13 zones of 23 carried phenology
    # and 12 carried disease. From 2026-09-01 the daily surfaces cover every
    # zone, so the honest answer stops being "not here" and becomes "not yet":
    # the season has not started.
    #
    # Overridden HERE rather than in `insights_dashboard`, which is shared with
    # the Pro site page. A site genuinely can sit outside every mapped zone and
    # that page must keep saying so.
    phenology = dict(models["phenology"])
    for block in (phenology, disease):
        if not block.get("available"):
            block["reason"] = _season_holding_reason(vintage)

    history = (_history(db, zone_id) if registered else _locked(
        "Sign in free to see this region's climate history.",
        "Forty growing seasons back to 1987, with per-decade trends for "
        "growing degree days, rainfall, heat and extreme rainfall."))
    projections = (_projections(db, zone_id) if registered else _locked(
        "Sign in free to see this region's projections.",
        "Downscaled MfE 2024 projections at 500 m for this region — three "
        "emissions scenarios and six periods, against its own 1986-2005 "
        "normal."))

    return {
        "tier": "registered" if registered else "anonymous",
        "free_blocks": list(FREE_BLOCKS),
        "paid_blocks": list(PAID_BLOCKS),
        "zone": {
            "id": zone_id,
            "name": zone["name"],
            "slug": zone["slug"],
            "description": zone["description"],
            "level": zone["zone_level"],
            "region_name": zone["region_name"],
            "region_slug": zone["region_slug"],
        },
        "baseline": f"{BASELINE_LO}-{BASELINE_HI}",
        "vintage": vintage,
        "as_of": today.isoformat(),
        # The free tier's anchor: purely observed, no interpolation, no
        # baseline. A grower can read it without an account doing anything.
        "recent": _recent(db, zone_id, today),
        "season": _season(db, zone_id, vintage, today),
        # The local copy, not `models["phenology"]` — the holding reason above
        # is applied to a copy so the shared Pro module's dict is left alone.
        "phenology": phenology,
        "disease": disease,
        "models_disclaimer": models["disclaimer"],
        "history": history,
        "projections": projections,
    }
