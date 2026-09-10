"""This season, for one Grow property: weather to date and disease pressure.

The two panels behind the "This Season" tab. Both answer the same question at
two grains, and both degrade in the same direction:

    REGIONAL  the property's climate zone. Live, current, and needs only a zone
              on the property — which nearly every company already has.
    SITE      the property's own point. Better, and needs a climate site.

## THE LESSON FROM PHASE 3, APPLIED UP FRONT

The phenology assembly initially derived its season from the site alone, so a
company with no site got no regional track either — the one thing that needs no
setup was switched off by the absence of the thing that does. So here the
regional track is fetched FIRST and independently, and the site track is added
where it exists. Neither can suppress the other.

## WHY THIS IS SERVER-SIDE RATHER THAN TWO FETCHES FROM THE PANEL

The regional data lives behind `/public/realtime/*`, which is unauthenticated
and keyed on a zone SLUG; the site data is authenticated and keyed on a site id.
A panel doing both would have to hold two base URLs, two auth models and a slug
it has to look up — and Grow web has no client for the realtime endpoints at
all, so it would mean a second HTTP layer in the frontend. Assembling here means
the panel makes one call with the property id it already has.

The regional season is produced by CALLING `realtime_climate` in process rather
than re-deriving it. That endpoint already resolves the vintage, the baseline
and the GDD base, and it is the same function the public widget serves — so the
Grow panel and a published article cannot disagree about what the season has
done.

## DISEASE IS A ROLLING WINDOW, NOT A SEASON

`disease_pressure` is the last N days, and asking it "which vintage" is the
wrong question — the models are about what the weather has just done. So the
disease half takes a day count and the weather half takes a vintage.
"""
import logging
from datetime import date, timedelta
from typing import Dict, List, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from db.models.insights_site import InsightsSite
from db.models.property import Property
from core.local_time import local_today

log = logging.getLogger(__name__)

#: Metrics worth putting on a season panel, in the order they are read. The
#: table holds fifteen; a panel showing all of them says nothing. GDD and
#: rainfall are what a grower plans on, the heat and rain-day counts are what
#: they compare against a memory of last year.
SEASON_METRICS = ("gdd10", "rain", "tmean", "tmax", "hot_days_25", "rain_days_over_10mm")

METRIC_LABELS = {
    "gdd10": "Growing degree days (base 10)",
    "rain": "Rainfall",
    "tmean": "Mean temperature",
    "tmax": "Mean daily maximum",
    "hot_days_25": "Days over 25 °C",
    "rain_days_over_10mm": "Days over 10 mm rain",
    "frost_days": "Frost days",
}

#: Ordered worst-first. Used to pick the headline risk out of three diseases.
RISK_ORDER = ("high", "moderate", "low")

#: The baseline period, matching `services/insights_site_baseline.BASELINE_LO/HI`
#: so a Grow panel and the Pro site page compare against the same twenty years.
BASELINE_LO, BASELINE_HI = 1986, 2005

#: Fewest seasons that can average to something worth calling a normal. The
#: extraction starts at 1986 and the first vintage is partial, so a complete
#: site has 19 — anything far below that is a site whose extraction is thin.
MIN_BASELINE_SEASONS = 10


def _zone_season(db: Session, slug: str, as_of: date) -> Optional[dict]:
    """The region's season to date, from the public realtime endpoint's own code.

    Imported inside the function, not at module scope: `api.v1.realtime_climate`
    pulls in the whole FastAPI router layer, and importing it at the top of a
    service that `api.v1.properties` imports would close an import cycle.

    Every failure is swallowed to None. This is the SECOND of two tracks on a
    panel whose first track is the disease pressure beside it — a zone with no
    daily data yet must leave the weather card empty, not 500 the page.

    **EVERY argument is passed explicitly, including the ones with defaults.**
    Calling an endpoint function directly bypasses FastAPI's dependency
    resolution, so a parameter left out arrives as the `Query(...)` OBJECT
    rather than its default value. Omitting `vintage_year` here produced
    `can't adapt type 'Query'` from psycopg2 — a failure that looked like a
    database problem and was a calling-convention one.
    """
    try:
        from api.v1.realtime_climate import (get_current_season_climate,
                                             DEFAULT_GDD_BASE)
        resp = get_current_season_climate(zone_slug=slug, recent_days=14,
                                          base=DEFAULT_GDD_BASE, as_of=as_of,
                                          vintage_year=None, db=db)
    except Exception as exc:  # noqa: BLE001 - see docstring
        log.info("regional season unavailable for %s: %s", slug, exc)
        return None
    data = resp.model_dump() if hasattr(resp, "model_dump") else dict(resp)
    season = data.get("season") or {}
    return {
        # Nested inside `season`, not at the top level of the response. Reading
        # it from the top gave None, which would have labelled the card with no
        # season at all while the figures below it were real.
        "vintage_year": season.get("vintage_year"),
        "label": season.get("label"),
        "season": season,
        "recent": data.get("recent_days") or data.get("recent"),
        "zone_name": data.get("zone_name"),
    }


def _zone_slug(db: Session, zone_id: Optional[int]) -> Optional[str]:
    if zone_id is None:
        return None
    return db.execute(text("SELECT slug FROM climate_zones WHERE id = :z"),
                      {"z": zone_id}).scalar()


def _zone_disease(db: Session, zone_id: int, days: int,
                  as_of: date) -> Optional[dict]:
    """Zone disease pressure over the last `days`, latest first.

    Read straight from `disease_pressure` rather than through the public
    endpoint's response model: that model is shaped for an article widget and
    carries spray recommendations and contributing factors this panel does not
    show. What is wanted here is the risk levels and the trend.
    """
    rows = db.execute(text("""
        SELECT date, powdery_mildew_risk, downy_mildew_risk, botrytis_risk,
               growth_stage, humidity_available,
               pm_cumulative_index, botrytis_cumulative, dm_goidanich_index
          FROM disease_pressure
         WHERE zone_id = :z AND date <= :d
         ORDER BY date DESC
         LIMIT :n
    """), {"z": zone_id, "d": as_of, "n": days}).mappings().all()
    if not rows:
        return None

    latest = rows[0]
    return {
        "as_of": latest["date"].isoformat(),
        "powdery_mildew_risk": latest["powdery_mildew_risk"],
        "downy_mildew_risk": latest["downy_mildew_risk"],
        "botrytis_risk": latest["botrytis_risk"],
        "growth_stage": latest["growth_stage"],
        # FALSE means the models ran without a hygrometer, which changes what
        # they can see — botrytis in particular is a wetness model. Passed
        # through rather than hidden: a risk level computed without humidity is
        # not the same claim as one computed with it.
        "humidity_available": bool(latest["humidity_available"]),
        "headline_risk": _headline(latest),
        "series": [{
            "date": r["date"].isoformat(),
            "powdery": r["powdery_mildew_risk"],
            "downy": r["downy_mildew_risk"],
            "botrytis": r["botrytis_risk"],
        } for r in reversed(rows)],
    }


def _site_disease(db: Session, site_id: int, days: int,
                  as_of: date) -> Optional[dict]:
    """The same, at the property's own point."""
    rows = db.execute(text("""
        SELECT date, powdery_mildew_risk, downy_mildew_risk, botrytis_risk,
               growth_stage, humidity_available
          FROM insights_site_disease
         WHERE site_id = :s AND date <= :d
         ORDER BY date DESC
         LIMIT :n
    """), {"s": site_id, "d": as_of, "n": days}).mappings().all()
    if not rows:
        return None
    latest = rows[0]
    return {
        "as_of": latest["date"].isoformat(),
        "powdery_mildew_risk": latest["powdery_mildew_risk"],
        "downy_mildew_risk": latest["downy_mildew_risk"],
        "botrytis_risk": latest["botrytis_risk"],
        "growth_stage": latest["growth_stage"],
        "humidity_available": bool(latest["humidity_available"]),
        "headline_risk": _headline(latest),
        "series": [{
            "date": r["date"].isoformat(),
            "powdery": r["powdery_mildew_risk"],
            "downy": r["downy_mildew_risk"],
            "botrytis": r["botrytis_risk"],
        } for r in reversed(rows)],
    }


def _headline(row) -> dict:
    """The worst of the three risks, and which disease it is.

    A panel that showed three equal badges makes the reader do the ranking. The
    disease that is highest is the one that decides whether anybody goes out
    with a sprayer.
    """
    pairs = [
        ("powdery_mildew", row["powdery_mildew_risk"]),
        ("downy_mildew", row["downy_mildew_risk"]),
        ("botrytis", row["botrytis_risk"]),
    ]
    ranked = sorted(
        pairs,
        key=lambda kv: RISK_ORDER.index(kv[1]) if kv[1] in RISK_ORDER else len(RISK_ORDER),
    )
    disease, level = ranked[0]
    return {"disease": disease, "risk_level": level}


def _site_season(db: Session, site_id: int) -> Optional[dict]:
    """The site's season metrics for its latest vintage, against its baseline.

    `insights_site_season` is the EXTRACTED record — the site's own history plus
    completed recent seasons. It is NOT the season in progress: the newest
    vintage in it today is 2026, while the phenology model is on 2027. So this
    is labelled by the vintage it actually describes and never presented as
    "so far this season", which would be a claim about a season it does not hold.
    """
    vintage = db.execute(text(
        "SELECT max(vintage_year) FROM insights_site_season WHERE site_id = :s"
    ), {"s": site_id}).scalar()
    if vintage is None:
        return None

    # **`insights_site_season.baseline` IS NULL ON ALL 39,814 ROWS.** The column
    # exists and nothing has ever written it — measured 2026-09-10. Reading it
    # would put a dash in the Baseline and Difference columns for every metric
    # of every site, for ever, which looks like a broken panel rather than an
    # unpopulated column.
    #
    # So the baseline is COMPUTED here from the site's own record, the same way
    # `insights_site_baseline` defines it: the mean over vintages 1986-2005 of
    # this site's own rows in this very table. One query for both, so the
    # comparison can only ever be a site against itself.
    rows = db.execute(text("""
        SELECT cur.metric, cur.value, cur.unit, base.mean_value AS baseline,
               base.n_seasons
          FROM insights_site_season cur
          LEFT JOIN (
                SELECT metric, avg(value) AS mean_value, count(*) AS n_seasons
                  FROM insights_site_season
                 WHERE site_id = :s AND vintage_year BETWEEN :lo AND :hi
                 GROUP BY metric
          ) base ON base.metric = cur.metric
         WHERE cur.site_id = :s AND cur.vintage_year = :v
           AND cur.metric = ANY(:m)
    """), {"s": site_id, "v": vintage, "m": list(SEASON_METRICS),
           "lo": BASELINE_LO, "hi": BASELINE_HI}).mappings().all()
    if not rows:
        return None

    metrics = []
    for r in rows:
        value = float(r["value"]) if r["value"] is not None else None
        baseline = float(r["baseline"]) if r["baseline"] is not None else None
        n = r["n_seasons"] or 0
        # A mean over three seasons is not a climate normal. Below the floor the
        # baseline is withheld rather than shown thin — the same rule the counts
        # report uses for a standard deviation under three spots.
        if n < MIN_BASELINE_SEASONS:
            baseline = None
        metrics.append({
            "metric": r["metric"],
            "label": METRIC_LABELS.get(r["metric"], r["metric"]),
            "value": value,
            "unit": r["unit"],
            "baseline": baseline,
            "baseline_seasons": n,
            # None, not zero, when there is no baseline to compare against. A
            # zero anomaly asserts "exactly average", which is a real finding
            # and must not be manufactured from a missing number.
            "vs_baseline": (round(value - baseline, 1)
                            if value is not None and baseline is not None else None),
        })
    order = {m: i for i, m in enumerate(SEASON_METRICS)}
    metrics.sort(key=lambda m: order.get(m["metric"], 99))
    return {"vintage_year": vintage, "metrics": metrics,
            "is_completed_season": True,
            "baseline_period": f"{BASELINE_LO}–{BASELINE_HI}"}


def property_season(db: Session, prop: Property, days: int = 14,
                    as_of: Optional[date] = None) -> dict:
    """Weather and disease for one property, regional and site side by side."""
    as_of = as_of or local_today()
    site = db.get(InsightsSite, prop.insights_site_id) if prop.insights_site_id else None
    site_ready = site is not None and site.status == "ready"

    zone_id = (site.zone_id if site else None) or prop.climate_zone_id
    slug = _zone_slug(db, zone_id)

    disease_regional = (_zone_disease(db, zone_id, days, as_of)
                        if zone_id else None)
    season_regional = _zone_season(db, slug, as_of) if slug else None
    disease_site = (_site_disease(db, site.id, days, as_of)
                    if site_ready else None)
    season_site = _site_season(db, site.id) if site_ready else None

    return {
        "property_id": prop.id,
        "property_name": prop.name,
        "as_of": as_of.isoformat(),
        "zone_id": zone_id,
        # The panel fetches the regional weather series itself, from the public
        # realtime endpoints, which are keyed on the slug and take no auth. It
        # is handed over here so the panel does not have to look it up.
        "zone_slug": slug,
        "zone_reason": (None if zone_id else
                        "No climate zone is set for this property. Set one in "
                        "Manage → Weather to see regional conditions."),
        "site": None if site is None else {
            "id": site.id, "status": site.status, "is_ready": site_ready,
            "latitude": site.latitude, "longitude": site.longitude,
            "label": site.label,
            # The pipeline's own words when it failed. Shown verbatim, as My
            # Site does: "no surfaces were readable for this cell" tells the
            # reader something, and "an error occurred" tells them nothing.
            "status_detail": site.status_detail,
        },
        "site_reason": (
            None if site_ready else
            "This property has no climate site yet, so conditions are reported "
            "for its region rather than its own point. Create one in "
            "Manage → Weather."
            if site is None else
            "This property's climate site is still building its history."
        ),
        "disease": {
            "window_days": days,
            "regional": disease_regional,
            "site": disease_site,
            "reason": (None if disease_regional or disease_site else
                       "No disease pressure has been modelled for this region yet."),
        },
        "season": {
            "regional": season_regional,
            "site": season_site,
            "reason": (None if (season_regional or season_site) else
                       "No season data is available for this region yet."),
            # Separate from `reason`: the regional track can be present while
            # the site track is absent, and that is the normal state.
            "site_reason": (None if season_site else
                            "Season totals for this property's own point need a "
                            "climate site." if not site_ready else
                            "This site has no extracted season record yet."),
        },
    }
