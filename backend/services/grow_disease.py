"""Disease pressure for one Grow property, as numbers rather than three words.

`grow_season` already answers "what is the risk today" with a label per disease.
This answers the question that follows — how did it get there, and is it rising
— which needs the indices the models actually compute.

## FOUR MODELS, NOT THREE DISEASES

Botrytis is modelled twice, by two different models, and they are not two views
of one number:

    Powdery mildew   UC Davis / Gubler-Thomas   pm_cumulative_index   0-100
    Botrytis         Gonzalez-Dominguez         botrytis_severity     0-100
    Botrytis         Bacchus                    bacchus_peak          0-1.5
    Downy mildew     3-10 primary + Goidanich   dm_goidanich_index    0-100

So the series are named for their MODEL, not for the disease. A column called
"botrytis" that silently changes which model produced it is how a spreadsheet
outlives the screen it came from and starts lying.

## THE QUANTITY MUST BE THE ONE THE LABEL CAME FROM

`botrytis_risk` is banded off **severity** (20/50/75), while every Pro screen
used to plot **cumulative** — a decayed accumulator — under the POWDERY bands
(30/50/60). On 2026-09-04 that made 32 of 67 rows contradict their own number:
"high" printed beside 25.8. Fixed 2026-09-05, and this module inherits the
contract: **plot severity, carry cumulative beside it under its own name, and
look bands up per model.** There is no shared band table, because four
rectangles cannot mean three things at once.

Bacchus is not a 0-100 index and never shares that axis — on the left axis it
draws as a flat line on the floor. It carries its own range and its infection
threshold, and it reports `bacchus_peak` rather than `bacchus_index`: a period
that reaches 0.9 and then resets ends the day at 0.00.

## SITE FIRST, REGION AS A LABELLED FALLBACK

The property's own cell wins when it has rows. Most sites have very few — the
series is written nightly and only from the day a site was created — so the
region is the fallback, and the scope is on the payload rather than implied.
This is the treatment `RegionalModelsPanel` already gives phenology, and the
thing the Insights site page still does NOT do (it shows the zone's model with
no site attempt at all).
"""
from __future__ import annotations

import logging
from datetime import date
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from db.models.insights_site import InsightsSite
from db.models.property import Property
from core.local_time import local_today

log = logging.getLogger(__name__)

#: Fewest days worth drawing. One point is not a trend, and a two-day chart
#: beside a 30-day regional one invites reading the shorter as the quieter.
MIN_SERIES_DAYS = 5

#: Every model's own bands, keyed by the SERIES they band. Thresholds are the
#: lower bound of each level. Looked up per model — see the module docstring.
BANDS = {
    "pm_cumulative_index": [("low", 0), ("moderate", 30), ("high", 50), ("extreme", 60)],
    "botrytis_severity": [("low", 0), ("moderate", 20), ("high", 50), ("extreme", 75)],
    "bacchus_peak": [("no infection", 0), ("infection", 1.0)],
}

MODELS = [
    {
        "key": "powdery",
        "disease": "Powdery mildew",
        "model": "Gubler (UC Davis)",
        "column": "pm_cumulative_index",
        "risk_column": "powdery_mildew_risk",
        "unit": "index",
        "axis": "index",
        "note": ("The UC Davis / Gubler-Thomas index. It rises on hours in the "
                 "favourable temperature band and falls on lethal heat, so it is "
                 "a running score rather than a reading of today."),
    },
    {
        "key": "botrytis_gd",
        "disease": "Botrytis",
        "model": "González-Domínguez",
        "column": "botrytis_severity",
        "risk_column": "botrytis_risk",
        "unit": "severity",
        "axis": "index",
        # Named, separate, and NOT the series the label is banded off.
        "extra": {"column": "botrytis_cumulative",
                  "label": "Cumulative (decayed)",
                  "note": "A decayed accumulator, not the quantity the risk "
                          "level is read from."},
        "note": ("Today's infection severity. The risk level above is banded "
                 "off this number, so the two always agree."),
    },
    {
        "key": "bacchus",
        "disease": "Botrytis",
        "model": "Bacchus",
        "column": "bacchus_peak",
        "risk_column": None,
        "unit": "index",
        # Its own axis, because 0-1.5 on a 0-100 scale is a flat line.
        "axis": "bacchus",
        "threshold": 1.0,
        "note": ("Developed in New Zealand (Balasubramaniam and Edwards) and "
                 "run here from wet hours and temperature. An infection period "
                 "is reached at 1.0. The peak within the day is reported, "
                 "because a period that reaches 0.9 and resets ends at zero."),
    },
    {
        "key": "downy",
        "disease": "Downy mildew",
        "model": "3-10 primary · Goidanich",
        "column": "dm_goidanich_index",
        "risk_column": "downy_mildew_risk",
        "unit": "index",
        "axis": "index",
        "note": ("Primary infection needs the 3-10 rule met first; the "
                 "Goidanich index then tracks secondary cycles."),
    },
]

_COLUMNS = """
    date, powdery_mildew_risk, downy_mildew_risk, botrytis_risk,
    pm_cumulative_index, pm_daily_index,
    botrytis_severity, botrytis_cumulative, botrytis_wet_hours,
    bacchus_peak, bacchus_infection, bacchus_wet_hours,
    dm_goidanich_index, dm_primary_met,
    growth_stage, humidity_available
"""


def _rows(db: Session, table: str, key_column: str, key: int, days: int,
          as_of: date) -> list[dict]:
    # Table and column are from this module's own constants, never from a
    # caller — the two shapes are identical and parameterising the identifier
    # is the only way to avoid writing the query twice.
    sql = text(f"""
        SELECT {_COLUMNS}
          FROM {table}
         WHERE {key_column} = :k AND date <= :d
         ORDER BY date DESC
         LIMIT :n
    """)
    rows = db.execute(sql, {"k": key, "d": as_of, "n": days}).mappings().all()
    return list(reversed(rows))


def band_for(column: str, value) -> Optional[str]:
    """The band a value falls in, by ITS OWN model's thresholds."""
    if value is None or column not in BANDS:
        return None
    name = None
    for label, floor in BANDS[column]:
        if float(value) >= floor:
            name = label
    return name


def _series(rows: list[dict], model: dict) -> dict:
    values = [None if r[model["column"]] is None else round(float(r[model["column"]]), 2)
              for r in rows]
    out = {
        "key": model["key"],
        "disease": model["disease"],
        "model": model["model"],
        # The label a chart legend should carry: the model, never the disease
        # alone. Two of these are botrytis.
        "label": f"{model['disease']} · {model['model']}",
        "column": model["column"],
        "unit": model["unit"],
        "axis": model["axis"],
        "note": model["note"],
        "values": values,
        "bands": [{"label": l, "from": f} for l, f in BANDS.get(model["column"], [])],
        "threshold": model.get("threshold"),
        "latest": values[-1] if values else None,
        "latest_band": band_for(model["column"], values[-1] if values else None),
        # The word the rest of the UI shows for this disease, so a reader can
        # see that the number and the label come from the same place.
        "risk": rows[-1][model["risk_column"]] if rows and model["risk_column"] else None,
        "has_data": any(v is not None for v in values),
    }
    extra = model.get("extra")
    if extra:
        out["extra"] = {
            "label": extra["label"],
            "note": extra["note"],
            "values": [None if r[extra["column"]] is None
                       else round(float(r[extra["column"]]), 2) for r in rows],
        }
    return out


def property_disease(db: Session, prop: Property, days: int = 30,
                     as_of: Optional[date] = None) -> dict:
    """Numeric disease pressure for a property: its own cell, or its region."""
    as_of = as_of or local_today()
    site = (db.get(InsightsSite, prop.insights_site_id)
            if prop.insights_site_id else None)
    site_ready = site is not None and site.status == "ready"

    rows: list[dict] = []
    scope, scope_name, zone_id = None, None, None

    if site_ready:
        rows = _rows(db, "insights_site_disease", "site_id", site.id, days, as_of)
        if len(rows) >= MIN_SERIES_DAYS:
            scope, scope_name = "site", prop.name

    if not scope:
        # The region: the site has too few days of its own, which is the normal
        # state for a site created this season.
        site_days = len(rows)
        zone_id = (site.zone_id if site else None) or prop.climate_zone_id
        rows = _rows(db, "disease_pressure", "zone_id", zone_id, days, as_of) if zone_id else []
        if rows:
            scope = "region"
            scope_name = db.execute(
                text("SELECT name FROM climate_zones WHERE id = :z"),
                {"z": zone_id}).scalar()
        else:
            return {
                "available": False,
                "scope": None,
                "reason": (
                    "No disease model has run for this property's region yet."
                    if zone_id else
                    "This property has no climate zone set, so there is no "
                    "disease model to report. Set one in Manage → Weather."),
                "site_days": site_days,
            }

    latest = rows[-1]
    return {
        "available": True,
        "scope": scope,
        "scope_name": scope_name,
        "zone_id": zone_id,
        # Said plainly rather than implied by which block it is in: a regional
        # model is run for the whole zone, not downscaled to this cell.
        "scope_note": (
            "Modelled at this property's own point."
            if scope == "site" else
            "Regional model — run for the whole region, not downscaled to this "
            "property. Its own series starts the day its climate site was created."),
        "as_of": latest["date"].isoformat(),
        "days": len(rows),
        "dates": [r["date"].isoformat() for r in rows],
        "growth_stage": latest["growth_stage"],
        # FALSE means the models ran without a hygrometer, which changes what
        # they can see — botrytis in particular is a wetness model.
        "humidity_available": bool(latest["humidity_available"]),
        "models": [_series(rows, m) for m in MODELS],
    }
