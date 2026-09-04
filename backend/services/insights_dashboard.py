"""The Pro site dashboard: a climatology, and this season beside it.

Two things are on this screen and they do NOT come from the same place. Getting
that wrong is the single most damaging mistake available here, because both
numbers look equally plausible and the error is a silent one.

**The tiles** are the site's own 1986-2023 record, extracted cell-by-cell from
the interpolated 500 m surface archive. That is what `insights_site_season`
holds. It ends at the 2023 vintage because the archive does.

**The season strip** is `climate_zone_daily` — station observations aggregated
to the ZONE, starting 2025-09. It is a different source (measured, not
interpolated), a different geography (the region, not the cell) and a different
era. It is here because a grower opens a dashboard in February to ask "how is
this season going", and refusing to answer that at all is worse than answering
it at regional scale with the scale stated. Every field on the strip carries
its own `source`, and the strip is never merged into a tile.

## Three traps in `climate_zone_daily`, all of them silent

1. **`gdd_cumulative` is NOT gdd10.** `gdd_daily` equals `temp_mean` in that
   table — it is base ZERO — and Marlborough's 2026 figure is 4,591 against a
   Sep-Apr gdd10 of about 1,370. Dropping it into a tile beside the archive
   normal would render as a 235% anomaly. GDD is recomputed here from
   `temp_mean` with base 10 over Sep-Apr.

2. **`vintage_year` in that table is a JULY-to-JUNE season**, not the Sep-Apr
   vintage the surface archive and every zone statistic use: 2026-07-01 is
   already labelled 2027. So the strip filters by DATE and never by
   `vintage_year`.

3. **The daily GDD sum and the archive's are different estimators.** The archive
   integrates monthly mean and sd (no daily rasters exist), while a daily series
   can sum `max(0, T-10)` directly. The integration was validated against the
   zone tables to 0.00 GDD, so the comparison is fair, but it is a comparison of
   two methods and is labelled as one.

## The comparison is over COMPLETE MONTHS only

A season in progress is compared against the normal for the months it has
actually finished. Comparing eleven weeks of a season against an eight-month
normal reads as a catastrophic drought. `climate_zone_surface_monthly` carries
`(temp_mean, gdd10)`, `(rainfall, sum)`, `(temp_min, frost_days)` and
`(temp_max, days_over_25)` per month, which is exactly what that needs.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from services import insights_site_baseline as baseline_svc
from services import phenology_basis as basis
from services.insights_site_service import FROST_DISCLAIMER, FROST_METRICS

# The season the whole product is defined on: September through April, labelled
# by the year it ends in. `insights_site_service.SEASON_MONTHS` is the same
# statement in a different shape; both are the Sep-Apr vintage.
SEASON_START_MONTH = 9
SEASON_END_MONTH = 4

# Tiles, in reading order. `direction` is which way is "good" for a grower and
# only drives the arrow's colour — it is never used to hide a number.
# The unit here is the DISPLAY unit and it WINS over the one stored on the row.
# They are not the same vocabulary: `insights_site_season` records
# `last_spring_frost_doy` as "day of year", which is what it is, but a tile that
# prints "268.8 day of year" has told a grower nothing — the display unit
# "date" is what makes the client render it as 25 September. Same reason
# temp_mean's stored "C" becomes "°C" and frost_days' "days" becomes "nights".
TILES = [
    ("gdd10", "Growing degree days", "GDD", "up"),
    ("tmean", "Mean temperature", "°C", None),
    ("rain", "Growing-season rain", "mm", None),
    ("frost_days", "Frost nights", "nights", "down"),
    ("hot_days_25", "Days over 25°C", "days", None),
    ("last_spring_frost_doy", "Last spring frost", "date", "down"),
]

# What the live strip can measure, and the archive band it is measured against.
# The pairing is the load-bearing part: each live metric is computed with the
# SAME definition as the monthly archive row it is compared to.
LIVE_METRICS = [
    # key, label, unit, live SQL, (archive variable, statistic)
    ("gdd10", "Growing degree days", "GDD",
     "sum(greatest(0, temp_mean - 10))", ("temp_mean", "gdd10")),
    ("rain", "Rainfall", "mm",
     "sum(rainfall_mm)", ("rainfall", "sum")),
    ("frost_days", "Frost nights", "nights",
     "count(*) FILTER (WHERE temp_min < 0)", ("temp_min", "frost_days")),
    ("hot_days_25", "Days over 25°C", "days",
     "count(*) FILTER (WHERE temp_max >= 25)", ("temp_max", "days_over_25")),
]


def current_vintage(today: date) -> int:
    """The season a grower is currently thinking about.

    Sep-Apr, labelled by the year it ends in, which makes the mapping less
    obvious than it looks:

        Sep-Dec 2026   the 2027 season, under way
        Jan-Apr 2027   the 2027 season, still under way
        May-Aug 2026   the 2027 season, NOT YET STARTED

    Those four months in the middle are the interesting case. The season a
    grower cares about in June is the one about to begin, not the one that
    finished in April — but it has no data at all, so the panel has to be able
    to say "starts in 11 days" rather than show an empty chart. That is
    `not_started`, and it is the state this panel spends a THIRD of every year
    in, including the day it ships.
    """
    return today.year + 1 if today.month >= SEASON_END_MONTH + 1 else today.year


def _season_state(vintage: int, today: date) -> str:
    start, end = baseline_svc.season_bounds(vintage)
    if today < start:
        return "not_started"
    if today > end:
        return "complete"
    return "in_progress"


def _season_window(vintage: int, today: date) -> tuple[date, date, bool]:
    """The dates a vintage spans, and how far the data can honestly run."""
    start, end = baseline_svc.season_bounds(vintage)
    return start, min(today, end), today >= end


def _end_of_month(y: int, m: int) -> date:
    nxt = date(y + 1, 1, 1) if m == 12 else date(y, m + 1, 1)
    return date.fromordinal(nxt.toordinal() - 1)


def _complete_months(start: date, through: date) -> list[tuple[int, int]]:
    """(year, month) pairs the season has actually finished.

    A month is complete when the data runs past its last day. The partial month
    at the end is deliberately excluded from BOTH sides of the comparison
    rather than being compared against a whole-month normal.
    """
    out: list[tuple[int, int]] = []
    y, m = start.year, start.month
    while (y, m) <= (through.year, through.month):
        # Complete when the data reaches the month's LAST DAY — not past it.
        # Testing the first of the next month instead drops the final month of
        # every finished season: a record running to 30 April would report a
        # Sep-Mar comparison and quietly leave the harvest month out.
        if _end_of_month(y, m) <= through:
            out.append((y, m))
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def _slope_per_decade(points: list[tuple[int, float]]) -> Optional[float]:
    """Ordinary least squares on (vintage, value), scaled to a decade.

    Deliberately plain: no significance test is reported, because a p-value on
    37 autocorrelated seasons would be dressing up a trend line as a finding.
    The number is shown as "about X per decade over 37 seasons" and the reader
    can see the series it came from.
    """
    pts = [(x, y) for x, y in points if y is not None]
    if len(pts) < 10:
        return None
    n = len(pts)
    mx = sum(x for x, _ in pts) / n
    my = sum(y for _, y in pts) / n
    den = sum((x - mx) ** 2 for x, _ in pts)
    if den == 0:
        return None
    num = sum((x - mx) * (y - my) for x, y in pts)
    return (num / den) * 10.0


def _tiles(db: Session, site, lo: int, hi: int) -> list[dict]:
    rows = db.execute(text("""
        SELECT s.metric, s.vintage_year, s.value, s.unit,
               z.mean AS zone_mean, z.p10 AS zone_p10, z.p90 AS zone_p90
          FROM insights_site_season s
          LEFT JOIN climate_zone_surface_season z
                 ON z.zone_id = :zid AND z.vintage_year = s.vintage_year
                AND z.metric = s.metric
         WHERE s.site_id = :sid
         ORDER BY s.metric, s.vintage_year
    """), {"sid": site.id, "zid": site.zone_id}).mappings().all()

    by_metric: dict[str, list] = {}
    for r in rows:
        by_metric.setdefault(r["metric"], []).append(r)

    out = []
    for key, label, unit, direction in TILES:
        series = by_metric.get(key) or []
        if not series:
            continue
        values = [(r["vintage_year"], r["value"]) for r in series
                  if r["value"] is not None]
        if not values:
            continue

        base = [v for y, v in values if lo <= y <= hi]
        normal = sum(base) / len(base) if base else None
        last = series[-1]
        best = max(values, key=lambda p: p[1])
        worst = min(values, key=lambda p: p[1])

        # Where the site sits in the spread of PLANTED cells around it. "Warmer
        # than the regional mean" is a weak claim; "outside the range 90% of the
        # region sits in" is the one worth paying for.
        #
        # Except for frost, which gets no comparison at all — see
        # `insights_site_service.FROST_METRICS`. The site's own value stays on
        # the tile, including the last spring frost DATE; only the claim about
        # its neighbours is withheld, and it is withheld HERE rather than in the
        # client so the payload never carries it for the next consumer to render.
        regional = key not in FROST_METRICS
        position = None
        if regional and last["zone_p10"] is not None \
                and last["zone_p90"] is not None \
                and last["value"] is not None:
            if last["value"] > last["zone_p90"]:
                position = "above"
            elif last["value"] < last["zone_p10"]:
                position = "below"
            else:
                position = "within"

        out.append({
            "metric": key, "label": label,
            # Declared display unit first — see the TILES comment. The stored
            # unit travels alongside rather than being discarded, so anything
            # reading the payload can still tell what the number actually is.
            "unit": unit or last["unit"], "direction": direction,
            "stored_unit": last["unit"],
            "normal": normal,
            "latest": {"vintage": last["vintage_year"], "value": last["value"]},
            # Against the site's OWN normal, not the region's. The tile is about
            # this place; the region is the separate comparison below it.
            "anomaly": (last["value"] - normal
                        if normal is not None and last["value"] is not None
                        else None),
            "trend_per_decade": _slope_per_decade(values),
            # TWO different counts, and the tile shows the wrong one if it
            # confuses them. `normal_years` is how many seasons the NORMAL was
            # averaged over — the baseline period, 19 at a site whose record
            # starts in 1987. `n_seasons` is the whole series, 37, which is what
            # the range and the trend are drawn from. Captioning the normal
            # "37 seasons" claims a period it was not computed over.
            "normal_years": len(base),
            "n_seasons": len(values),
            "warmest": {"vintage": best[0], "value": best[1]},
            "coolest": {"vintage": worst[0], "value": worst[1]},
            "zone": ({"mean": last["zone_mean"], "p10": last["zone_p10"],
                      "p90": last["zone_p90"], "position": position}
                     if regional else None),
            "regional_comparison": regional,
            "no_comparison_reason": None if regional else FROST_DISCLAIMER,
            # Pairs with the season strip's `normal_scope: "region"`. The two
            # panels carry different normals for the same metric because they
            # describe different places, and each says which.
            "normal_scope": "site",
        })
    return out


def _season_strip(db: Session, site, lo: int, hi: int, vintage: int,
                  today: Optional[date] = None) -> Optional[dict]:
    """One season at the REGION, from stations, against the regional normal.

    The vintage is passed in rather than derived. It used to be worked out from
    today's date, which was right while this was the only season panel and wrong
    the moment a second one appeared beside it: in October both would have
    resolved to the same vintage and the page would have shown the current
    season twice, once labelled "previous".

    Returns None when the site has no zone — without one there is nothing to
    read a live season from, and inventing a national figure would be worse
    than an absent panel.
    """
    if not site.zone_id:
        return None

    today = today or datetime.now(timezone.utc).date()
    start, through, complete = _season_window(vintage, today)

    # The zone's display name, for the strip's heading. `insights_site` stores
    # the id only and the name is denormalised nowhere — a panel headed
    # "region 11" is not a product.
    zone_name = db.execute(text(
        "SELECT name FROM climate_zones WHERE id = :zid"),
        {"zid": site.zone_id}).scalar()

    have = db.execute(text("""
        SELECT min(date) AS first, max(date) AS last, count(*) AS n_days,
               min(station_count) AS min_stations,
               max(station_count) AS max_stations
          FROM climate_zone_daily
         WHERE zone_id = :zid AND date BETWEEN :start AND :through
    """), {"zid": site.zone_id, "start": start,
           "through": through}).mappings().first()

    if not have or not have["n_days"]:
        # The live series starts 2025-09; every earlier season legitimately has
        # nothing. Say so rather than rendering zeros.
        return {"available": False, "vintage": vintage,
                "reason": "No station record for this season yet.",
                "zone_name": zone_name}

    months = _complete_months(start, have["last"])
    # The complete months are contiguous from the start of the season, so the
    # set is a DATE RANGE and not a list of (year, month) pairs. Expressing it
    # as a range keeps the query index-friendly and sidesteps binding a
    # row-constructor IN, which SQLAlchemy's text() does not expand.
    through_complete = (_end_of_month(*months[-1]) if months else None)

    metrics = []
    for key, label, unit, expr, (variable, statistic) in LIVE_METRICS:
        # Live side: complete months only, so it lines up with the normal. With
        # no complete month yet the season is days old — report what there is
        # and leave the comparison empty rather than inventing one.
        span_end = through_complete or have["last"]
        value = db.execute(text(f"""
            SELECT {expr} FROM climate_zone_daily
             WHERE zone_id = :zid AND date BETWEEN :start AND :through
        """), {"zid": site.zone_id, "start": start,
               "through": span_end}).scalar()

        # Archive side: the same months, averaged over the baseline years. The
        # month-to-year mapping matters — September belongs to the PREVIOUS
        # calendar year of the vintage.
        #
        # A YEAR IS ONLY COUNTED IF IT HAS EVERY MONTH. `sum(m) / count(DISTINCT
        # yr)` looks equivalent and is not: vintage 1986 needs September to
        # December 1985, which is before the archive starts, so it contributes
        # four months to the numerator while counting as a whole year in the
        # denominator. That dragged Waipara's regional GDD normal from 1,098 to
        # 1,080 — every metric understated, 1.3% on rain up to 5.0% on frost
        # nights, in all 23 zones. It is the same defect `_complete_months`
        # guards against on the live side, one level up: a partial YEAR rather
        # than a partial month.
        normal, normal_years = None, 0
        if months:
            row = db.execute(text("""
                SELECT avg(total) AS normal, count(*) AS n_years FROM (
                    SELECT yr, sum(m) AS total
                      FROM (
                        SELECT CASE WHEN month >= :sm THEN year + 1 ELSE year END AS yr,
                               mean AS m
                          FROM climate_zone_surface_monthly
                         WHERE zone_id = :zid AND variable = :v AND statistic = :s
                           AND month = ANY(:months)
                           AND mean IS NOT NULL
                      ) t
                     WHERE yr BETWEEN :lo AND :hi
                     GROUP BY yr
                    HAVING count(*) = :n_months
                ) whole_years
            """), {"zid": site.zone_id, "v": variable, "s": statistic,
                   "months": [m for _, m in months], "n_months": len(months),
                   "sm": SEASON_START_MONTH, "lo": lo,
                   "hi": hi}).mappings().first()
            normal = row["normal"] if row else None
            normal_years = (row["n_years"] or 0) if row else 0

        metrics.append({
            "metric": key, "label": label, "unit": unit,
            "value": float(value) if value is not None else None,
            "normal": float(normal) if normal is not None else None,
            # How many baseline years actually stand behind that normal. A
            # normal quietly built from fewer years than the stated period is
            # the failure this makes visible.
            "normal_years": normal_years,
            # Kept apart on purpose. One is measured at 3 stations, the other is
            # a 1986-2023 interpolated surface averaged over planted cells.
            "value_source": "stations, aggregated to the region",
            "normal_source": "500 m surface archive, planted-cell mean",
            # The scale marker. The tiles beside this panel carry the SITE's own
            # normal for the same metric and the two differ — Waipara's regional
            # GDD normal is 1,098 where Fancrest's own is 1,041. Both are right;
            # they are different places. Without this on the metric itself, the
            # page shows two numbers called "usual" and no way to tell them
            # apart.
            "normal_scope": "region",
        })

    return {
        "available": True,
        "vintage": vintage,
        "complete": complete,
        "scope": "region",
        "zone_name": zone_name,
        "from": start.isoformat(),
        "through": (through_complete or have["last"]).isoformat(),
        "data_to": have["last"].isoformat(),
        "months_compared": [f"{y}-{m:02d}" for y, m in months],
        "n_days": have["n_days"],
        "stations": {"min": have["min_stations"], "max": have["max_stations"]},
        "metrics": metrics,
        "note": ("This season is measured at weather stations and reported for "
                 f"the whole region. Your site's own record is modelled from "
                 f"the climate surface and ends in 2023, so the two are shown "
                 f"side by side rather than combined."),
    }


# The current season, at the SITE. Each entry is
# (key, label, unit, kind, live reducer, baseline field).
#
# `kind` drives how the two sides are combined, and it is not decoration:
#
#   accumulation  the season total so far. Sums.
#   count         a number of days. The live side counts days that crossed the
#                 threshold; the baseline side sums PROBABILITIES, because
#                 "how many frost nights would a usual season have had by now"
#                 is an expectation, not a count of days whose average minimum
#                 happened to fall below zero.
#   mean          an average over the days present, on both sides.
#
# Every metric is compared over EXACTLY the days the live side has a value for.
# Summing a full baseline season against a live season with a three-day gap
# would report the gap as a deficit.
CURRENT_SEASON_METRICS = [
    ("gdd10", "Growing degree days", "GDD", "accumulation",
     lambda r: max(0.0, r["temp_mean"] - 10.0) if r["temp_mean"] is not None else None,
     "gdd10"),
    ("rain", "Rainfall", "mm", "accumulation",
     lambda r: r["rainfall_mm"], "rain"),
    ("frost_days", "Frost nights", "nights", "count",
     lambda r: (1.0 if r["temp_min"] < 0 else 0.0) if r["temp_min"] is not None else None,
     "frost_probability"),
    ("hot_days_25", "Days over 25°C", "days", "count",
     lambda r: (1.0 if r["temp_max"] >= 25 else 0.0) if r["temp_max"] is not None else None,
     "hot_day_probability"),
    ("tmean", "Mean temperature", "°C", "mean",
     lambda r: r["temp_mean"], "tmean"),
]

# Stated beside the comparison, not corrected out of it. The two terms have
# different causes and different futures, and collapsing them into one sentence
# would make the second one false.
ERA_OFFSET_NOTE = {
    "why": ("This season is read from the live surface; the normal beside it is "
            "the 1986-2005 archive. The two share an estimator but not their "
            "observations, and the difference between them is measured rather "
            "than assumed."),
    "terms": [
        {"variable": "tmean", "offset_c": -0.27, "kind": "provenance",
         "note": ("Measured with the station network held constant: our day runs "
                  "midnight to midnight, the archive's ran to 9am. It is stable "
                  "to ±0.12 °C and more stations will not change it.")},
        {"variable": "tmin", "offset_c": 0.374, "kind": "network",
         "note": ("Cold-air pooling needs local stations to see it, so a sparser "
                  "network reads warm. This one shrinks as gauges come online.")},
    ],
}


def _current_season(db: Session, site, lo: int, hi: int, vintage: int,
                    today: date) -> dict:
    """This season at the SITE's own cell, against its own 1986-2005 curve.

    Unlike the regional strip below it, both sides of this comparison describe
    the SAME PLACE: the live side is this cell read from the daily surface, and
    the baseline is the zone's daily climatology rescaled to this cell's own
    monthly level. That is the whole reason the panel exists, and it is why the
    comparison can run from day one of the season instead of waiting for a month
    to close — a daily baseline needs no pro-rating.
    """
    state = _season_state(vintage, today)
    start, through, _ = _season_window(vintage, today)
    season_start, season_end = baseline_svc.season_bounds(vintage)
    total_days = (season_end - season_start).days + 1

    curve = baseline_svc.build(db, site, vintage, lo, hi)
    shell = {
        "vintage": vintage,
        "state": state,
        "scope": "site",
        "baseline": f"{lo}-{hi}",
        "from": season_start.isoformat(),
        "to": season_end.isoformat(),
        "days_total": total_days,
        "days_elapsed": max(0, (min(today, season_end) - season_start).days + 1)
        if today >= season_start else 0,
        "starts_in_days": max(0, (season_start - today).days),
        "zone_id": site.zone_id,
    }

    if curve is None:
        # No zone, or a zone with no daily climatology (South Coast). There is
        # nothing honest to plot a season against, so the panel says so rather
        # than borrowing a neighbouring region's curve.
        return {**shell, "available": False, "metrics": [],
                "reason": ("This site has no regional daily climatology to "
                           "measure a season against.")}

    # What a usual season looks like in full, which is what the panel shows
    # before the season starts. It is not a forecast and is not labelled as one.
    shell["baseline_season_totals"] = curve["season_totals"]
    shell["baseline_method"] = curve["meta"]["method"]

    if state == "not_started":
        return {**shell, "available": False, "metrics": [],
                "reason": (f"The {vintage} season starts on "
                           f"{season_start.isoformat()}.")}

    rows = db.execute(text("""
        SELECT date, temp_min, temp_max, temp_mean, rainfall_mm, model_version
          FROM insights_site_daily
         WHERE site_id = :sid AND date BETWEEN :start AND :through
         ORDER BY date
    """), {"sid": site.id, "start": start,
           "through": through}).mappings().all()

    if not rows:
        # The season is under way and nothing has been extracted. Distinct from
        # `not_started`, and it is an operational fault rather than a fact about
        # the calendar, so it must not be worded as one.
        return {**shell, "available": False, "metrics": [],
                "reason": ("No daily surface has been read for this site yet "
                           "this season.")}

    by_date = {d["date"]: d for d in curve["days"] if d.get("available")}

    metrics = []
    for key, label, unit, kind, reduce_live, field in CURRENT_SEASON_METRICS:
        live_values, base_values = [], []
        for row in rows:
            value = reduce_live(row)
            if value is None:
                # A day the surface had no value for. It is skipped on BOTH
                # sides, so the comparison stays like-for-like instead of
                # charging the site for a hole in its own data.
                continue
            day = by_date.get(row["date"].isoformat())
            if day is None or day.get(field) is None:
                continue
            live_values.append(value)
            base_values.append(day[field])

        if not live_values:
            metrics.append({"metric": key, "label": label, "unit": unit,
                            "kind": kind, "value": None, "normal": None,
                            "days_used": 0})
            continue

        if kind == "mean":
            value = sum(live_values) / len(live_values)
            normal = sum(base_values) / len(base_values)
        else:
            value = sum(live_values)
            normal = sum(base_values)

        metrics.append({
            "metric": key, "label": label, "unit": unit, "kind": kind,
            "value": value, "normal": normal,
            "anomaly": value - normal,
            # Which way is "worse for a grower", taken from the tile vocabulary
            # rather than restated. It drives a colour and nothing else, and two
            # lists would eventually disagree about frost.
            "direction": dict((k, d) for k, _, _, d in TILES).get(key),
            "days_used": len(live_values),
            # Frost is site-versus-its-own-history here, never
            # site-versus-neighbours. That distinction is the whole of the frost
            # rule: the surfaces cannot resolve cold-air pooling BETWEEN places,
            # which says nothing about comparing one cell to its own record.
            "regional_comparison": False,
            "normal_scope": "site",
        })

    versions = sorted({r["model_version"] for r in rows if r["model_version"]})
    return {
        **shell,
        "available": True,
        "data_to": max(r["date"] for r in rows).isoformat(),
        "days_with_data": len(rows),
        "metrics": metrics,
        "era": {**ERA_OFFSET_NOTE, "model_versions": versions},
        "note": ("Both numbers describe your own 500 m cell: this season from "
                 "the live surface, the usual from the same cell's 1986-2005 "
                 "record."),
    }


# The projection vocabulary, server-side so the panel's shell is data-driven.
# The keys are the values stored in `climate_projections.ssp` and `.period`;
# the labels match `ClimateWidgetRenderer` so a subscriber reading the regional
# page and the Pro page sees one naming, not two.
PROJECTION_SCENARIOS = [
    ("SSP126", "SSP1-2.6", "Low emissions"),
    ("SSP245", "SSP2-4.5", "Middle road"),
    ("SSP370", "SSP3-7.0", "High emissions"),
]
PROJECTION_PERIODS = [
    ("2021_2040", "Near-term", "2021-2040"),
    ("2041_2060", "Mid-century", "2041-2060"),
    ("2080_2099", "End of century", "2080-2099"),
]


def _projections(db: Session, site) -> dict:
    """The regional link and the axis vocabulary. NOT the numbers any more.

    This was the placeholder for the whole projections panel until 2026-08-31,
    on the stated grounds that "there is no projection surface to sample". That
    ceased to be true when the 612 projection rasters were published on
    2026-08-25, and `insights_site_projection` now holds this site's own cell
    sampled from them — 576 rows, delta against the same cell's 1986-2005
    baseline.

    What survives here is the part that still belongs on the dashboard payload:
    the link out to the region, and whether that region has anything to link to.
    The grid itself is fetched by the panel from
    `GET /insights/sites/{id}/projections`, because it is ~112 rows per season
    and the season is a control the reader changes.

    The shortcut this docstring used to refuse is still refused, and is now moot:
    applying the zone's monthly deltas to the site's own normal would have put a
    regional number on screen wearing the site's baseline. The surfaces made
    that unnecessary rather than merely unwise.

    The available shortcut would be to apply the zone's monthly deltas to the
    site's own monthly normal. That is a standard method and it is deliberately
    NOT done here: it would put a site-level number on screen that is really a
    regional number wearing the site's baseline, and it would have to be
    unpicked once the projection surfaces exist. Projection surfaces are being
    built precisely so that regions and sites can be sampled from the same
    thing, the way the climate archive already is.

    So the panel reserves its space, names what will fill it, and sends the
    subscriber to the regional projections that DO exist today.
    """
    zone = None
    if site.zone_id:
        zone = db.execute(text(
            "SELECT name, slug FROM climate_zones WHERE id = :i"),
            {"i": site.zone_id}).mappings().first()

    # Whether the REGION has projections is a different question from whether
    # this site can be projected, and the panel must not let one stand in for
    # the other.
    regional_rows = 0
    if site.zone_id:
        regional_rows = db.execute(text("""
            SELECT count(*) FROM climate_projections WHERE zone_id = :z
        """), {"z": site.zone_id}).scalar() or 0

    return {
        "available": False,
        "scope": "site",
        "scenarios": [{"key": k, "label": lab, "detail": d}
                      for k, lab, d in PROJECTION_SCENARIOS],
        "periods": [{"key": k, "label": lab, "years": y}
                    for k, lab, y in PROJECTION_PERIODS],
        "baseline": "1986-2005",
        # Kept for callers that still read it; the panel no longer displays
        # it, because the thing it apologised for has shipped.
        "reason": ("Site-level projections are sampled from the projection "
                   "surfaces at this site's own cell."),
        "regional_available": regional_rows > 0,
        "zone_name": zone["name"] if zone else None,
        "zone_slug": zone["slug"] if zone else None,
    }


# Regional model panels. The models are real and already running; what this
# does is tell the page whether THIS site's region is covered, before the client
# spends a round trip finding out.
MODEL_DISCLAIMER = ("Regional model — run for the whole region, not downscaled "
                    "to your site.")

# Which sugar targets a grower is actually picking against. The model stores six
# (170 through 220); showing all six turns a harvest window into a wall of dates
# that differ by a few days each and says nothing about when to pick.
#
# THE NUMBER IS GRAMS PER LITRE, NOT BRIX. 210 is 210 g/L, which is about 19.5
# Brix — it is not "21.0 Brix", and labelling it that way overstates ripeness by
# a point and a half at the exact moment a grower is deciding whether to pick.
# The Brix equivalents are carried alongside rather than derived, because the
# conversion is not linear and the region endpoint already publishes this
# mapping (`realtime_climate.harvest_levels`); two derivations would drift.
PHENOLOGY_HARVEST_TARGETS = ((210, 19.5), (220, 20.3))
HARVEST_KEYS = tuple(sugar for sugar, _ in PHENOLOGY_HARVEST_TARGETS)

# The basis test for a phenology date lives in  so
# that the Pro page and the public region pages cannot disagree about which
# dates are trustworthy.


def _phenology_varieties(db: Session, zone_id: int, vintage: int) -> tuple[list, bool, Optional[str]]:
    """The latest estimate per variety, with unprojectable dates WITHHELD.

    Two independent tests, and a date must pass both:

    1. **There has to be accumulation to project from.** Zero GDD means the
       model is extrapolating from nothing.
    2. **The date has to land inside the vintage it belongs to.** A 2027 harvest
       predicted for June 2028 is not a distant estimate, it is a wrong one, and
       it stays wrong even if GDD is non-zero.

    Withheld rather than deleted: the row keeps its stage and its accumulation,
    which are both true and both useful. It is only the projected dates that go.
    """
    rows = db.execute(text("""
        SELECT DISTINCT ON (p.variety_code)
               p.variety_code, p.estimate_date, p.gdd_accumulated, p.current_stage,
               p.flowering_date, p.flowering_is_actual,
               p.veraison_date, p.veraison_is_actual,
               p.harvest_210_date, p.harvest_220_date,
               p.days_vs_baseline,
               t.variety_name, t.gdd_flowering, t.gdd_veraison
          FROM phenology_estimates p
          LEFT JOIN phenology_thresholds t ON t.variety_code = p.variety_code
         WHERE p.zone_id = :z AND p.vintage_year = :v
         ORDER BY p.variety_code, p.estimate_date DESC
    """), {"z": zone_id, "v": vintage}).mappings().all()
    if not rows:
        return [], False, "Phenology is not modelled for this region yet."

    season_start, season_end = baseline_svc.season_bounds(vintage)

    def classify(value, is_actual, gdd) -> str:
        return basis.classify(value, is_actual, gdd, season_start, season_end)

    out, any_projected = [], False
    for r in rows:
        gdd = float(r["gdd_accumulated"]) if r["gdd_accumulated"] is not None else None
        stages = {
            "flowering": (r["flowering_date"], r["flowering_is_actual"]),
            "veraison": (r["veraison_date"], r["veraison_is_actual"]),
            f"harvest_{HARVEST_KEYS[0]}": (r["harvest_210_date"], False),
            f"harvest_{HARVEST_KEYS[1]}": (r["harvest_220_date"], False),
        }
        shown = {}
        for key, (value, is_actual) in stages.items():
            status = classify(value, is_actual, gdd)
            shown[key] = {
                # The date travels ONLY when it is fit to show. A withheld date
                # left in the payload is a withheld date the next client renders.
                "date": value.isoformat() if (value and basis.is_shown(status)) else None,
                "is_actual": bool(is_actual),
                "status": status,
            }
            if basis.is_shown(status):
                any_projected = True

        # Same gate as the Pro site page, from the same module. A region page
        # showing a 220 g/L date the site page withholds would be the two
        # surfaces disagreeing about what the model can see.
        progress = basis.stage_progress(shown, date.today())
        for key, state in progress.items():
            shown[key].update(state)
            if state["role"] == "awaiting":
                shown[key]["date"] = None

        out.append({
            "code": r["variety_code"],
            "name": r["variety_name"] or r["variety_code"],
            "stage": r["current_stage"],
            "gdd": gdd,
            "gdd_flowering": float(r["gdd_flowering"]) if r["gdd_flowering"] else None,
            "gdd_veraison": float(r["gdd_veraison"]) if r["gdd_veraison"] else None,
            "days_vs_baseline": r["days_vs_baseline"],
            "stages": shown,
            "next_stage": basis.next_stage(progress),
        })

    reason = None if any_projected else basis.no_basis_reason()
    return out, any_projected, reason


def _models(db: Session, site, today: date) -> dict:
    """Phenology and disease pressure coverage for this site's region.

    Both models run per ZONE and neither is downscaled, so this is a pointer
    with a badge rather than a site-level product. The panels themselves are the
    existing `PhenologyExplorer` and `DiseasePressureExplorer`, which fetch by
    zone slug; all that is needed here is enough to decide whether to render
    them at all.

    ## The two vintages do not always agree, and the panel must not pretend they do

    `phenology_estimates.vintage_year` follows the JULY-June cycle used by
    `climate_zone_daily` and `realtime_climate.get_current_vintage_year`. The
    Pro page's season is Sep-Apr (`current_vintage`). They agree for eight
    months of the year and diverge in **May and June**: on 1 June 2027 the
    phenology model is still reporting vintage 2027 — the season that has just
    finished — while this page has already rolled to 2028.

    Neither is wrong; they label different things. So the reported vintage
    travels with the payload and the panel prints THAT, rather than assuming the
    model is talking about the season named at the top of the page.
    """
    if not site.zone_id:
        # Pro is not wine-only. A site outside every mapped zone has no regional
        # model to point at, and saying so is better than an empty explorer.
        return {"scope": "region", "zone_id": None,
                "disclaimer": MODEL_DISCLAIMER,
                "phenology": {"available": False,
                              "reason": "This site sits outside every mapped "
                                        "wine region."},
                "disease": {"available": False,
                            "reason": "This site sits outside every mapped "
                                      "wine region."}}

    zone = db.execute(text("SELECT name, slug FROM climate_zones WHERE id = :i"),
                      {"i": site.zone_id}).mappings().first()

    phen = db.execute(text("""
        SELECT max(vintage_year) AS vintage,
               count(DISTINCT variety_code) AS varieties,
               max(estimate_date) AS estimated
          FROM phenology_estimates WHERE zone_id = :z
    """), {"z": site.zone_id}).mappings().first()

    dis = db.execute(text("""
        SELECT max(date) AS latest, count(*) AS days
          FROM disease_pressure WHERE zone_id = :z
    """), {"z": site.zone_id}).mappings().first()

    page_vintage = current_vintage(today)
    phen_vintage = phen["vintage"] if phen else None

    varieties, predictions_available, predictions_reason = (
        _phenology_varieties(db, site.zone_id, phen_vintage)
        if phen_vintage else ([], False, None))

    latest_disease = None
    if dis and dis["latest"]:
        latest_disease = db.execute(text("""
            SELECT date, downy_mildew_risk, powdery_mildew_risk, botrytis_risk,
                   growth_stage, humidity_available
              FROM disease_pressure
             WHERE zone_id = :z ORDER BY date DESC LIMIT 1
        """), {"z": site.zone_id}).mappings().first()

    return {
        "scope": "region",
        "zone_id": site.zone_id,
        "zone_name": zone["name"] if zone else None,
        "zone_slug": zone["slug"] if zone else None,
        "disclaimer": MODEL_DISCLAIMER,
        "phenology": {
            "available": bool(phen_vintage),
            "vintage_year": phen_vintage,
            # True in May and June. The client uses it to say which season the
            # model is describing instead of inheriting the page's heading.
            "vintage_differs_from_page": bool(
                phen_vintage and phen_vintage != page_vintage),
            "page_vintage": page_vintage,
            "variety_count": (phen["varieties"] or 0) if phen else 0,
            "estimated_at": phen["estimated"].isoformat()
            if phen and phen["estimated"] else None,
            "reason": None if phen_vintage else
            "Phenology is not modelled for this region yet.",
            # Stage and accumulation are always true and always shown. Only the
            # projected dates depend on there being a basis for them.
            "varieties": varieties,
            "harvest_targets": [{"sugar_g_l": g, "brix": b}
                                for g, b in PHENOLOGY_HARVEST_TARGETS],
            "predictions_available": predictions_available,
            "predictions_reason": predictions_reason,
        },
        "disease": {
            "available": bool(dis and dis["days"]),
            "latest_date": dis["latest"].isoformat()
            if dis and dis["latest"] else None,
            "days": (dis["days"] or 0) if dis else 0,
            "reason": None if (dis and dis["days"]) else
            "Disease pressure is not modelled for this region yet.",
            "latest": {
                "date": latest_disease["date"].isoformat(),
                "downy_mildew": latest_disease["downy_mildew_risk"],
                "powdery_mildew": latest_disease["powdery_mildew_risk"],
                "botrytis": latest_disease["botrytis_risk"],
                "growth_stage": latest_disease["growth_stage"],
                "humidity_available": latest_disease["humidity_available"],
            } if latest_disease else None,
        },
    }


def build(db: Session, site, baseline: tuple[int, int],
          today: Optional[date] = None) -> dict:
    lo, hi = baseline
    today = today or datetime.now(timezone.utc).date()
    current = current_vintage(today)
    return {
        "baseline": f"{lo}-{hi}",
        "tiles": _tiles(db, site, lo, hi),
        # Two seasons, and they are NOT the same shape. The current one is the
        # site's own cell against its own curve; the previous one is the region,
        # from stations, because that is the only complete record of a finished
        # season that exists today. Each says which it is.
        "season_current": _current_season(db, site, lo, hi, current, today),
        "season_previous": _season_strip(db, site, lo, hi, current - 1, today),
        # A placeholder that reserves its shape rather than an absent section.
        # See `_projections` for why no site-level number is offered.
        "projections": _projections(db, site),
        # Phenology and disease pressure, both regional. Coverage is resolved
        # here so the page never renders an explorer that has nothing to show.
        "models": _models(db, site, today),
        "meta": {
            "tiles_source": "the site's own cell, 1986-2023 surface archive",
            "current_season_source": "the site's own cell, live daily surface",
            "previous_season_source": (
                "station observations aggregated to the region"),
            "why_two_sources": (
                "A finished season is only fully recorded at station scale. The "
                "season in progress is read from the site's own cell, so it is "
                "compared against that cell's own normal rather than a "
                "regional one."),
        },
    }
