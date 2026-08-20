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


def _season_window(today: date) -> tuple[int, date, date, bool]:
    """Which season to show, and the dates it spans.

    Sep-Apr, so for four months of the year there is no season in progress at
    all. In May-August the honest thing to show is the season that has just
    finished, flagged complete — not an empty strip, and certainly not a season
    that has not started, which would read as a total crop failure.
    """
    if today.month >= SEASON_START_MONTH:
        vintage = today.year + 1
    else:
        vintage = today.year
    start = date(vintage - 1, SEASON_START_MONTH, 1)
    end = date(vintage, SEASON_END_MONTH, 30)
    if today.month > SEASON_END_MONTH and today.month < SEASON_START_MONTH:
        # Between seasons: report the one that ended in April just gone.
        return vintage, start, end, True
    return vintage, start, min(today, end), today >= end


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
        position = None
        if last["zone_p10"] is not None and last["zone_p90"] is not None \
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
            "n_seasons": len(values),
            "warmest": {"vintage": best[0], "value": best[1]},
            "coolest": {"vintage": worst[0], "value": worst[1]},
            "zone": {"mean": last["zone_mean"], "p10": last["zone_p10"],
                     "p90": last["zone_p90"], "position": position},
        })
    return out


def _season_strip(db: Session, site, lo: int, hi: int,
                  today: Optional[date] = None) -> Optional[dict]:
    """This season at the REGION, from stations, against the regional normal.

    Returns None when the site has no zone — without one there is nothing to
    read a live season from, and inventing a national figure would be worse
    than an absent panel.
    """
    if not site.zone_id:
        return None

    today = today or datetime.now(timezone.utc).date()
    vintage, start, through, complete = _season_window(today)

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
        normal = None
        if months:
            normal = db.execute(text("""
                SELECT sum(m) / count(DISTINCT yr) FROM (
                    SELECT CASE WHEN month >= :sm THEN year + 1 ELSE year END AS yr,
                           mean AS m
                      FROM climate_zone_surface_monthly
                     WHERE zone_id = :zid AND variable = :v AND statistic = :s
                       AND month = ANY(:months)
                       AND mean IS NOT NULL
                ) t WHERE yr BETWEEN :lo AND :hi
            """), {"zid": site.zone_id, "v": variable, "s": statistic,
                   "months": [m for _, m in months],
                   "sm": SEASON_START_MONTH, "lo": lo, "hi": hi}).scalar()

        metrics.append({
            "metric": key, "label": label, "unit": unit,
            "value": float(value) if value is not None else None,
            "normal": float(normal) if normal is not None else None,
            # Kept apart on purpose. One is measured at 3 stations, the other is
            # a 1986-2023 interpolated surface averaged over planted cells.
            "value_source": "stations, aggregated to the region",
            "normal_source": "500 m surface archive, planted-cell mean",
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


def build(db: Session, site, baseline: tuple[int, int],
          today: Optional[date] = None) -> dict:
    lo, hi = baseline
    return {
        "baseline": f"{lo}-{hi}",
        "tiles": _tiles(db, site, lo, hi),
        "season_to_date": _season_strip(db, site, lo, hi, today),
        "meta": {
            "tiles_source": "the site's own cell, 1986-2023 surface archive",
            "season_source": "station observations aggregated to the region",
            "why_two_sources": (
                "There is no live surface yet, so a current season can only be "
                "reported from stations and only at regional scale."),
        },
    }
