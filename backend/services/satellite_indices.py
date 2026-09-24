"""Satellite vegetation indices for a zone - the read side of the satellite plan.

Phase 5 of the satellite indices plan. Phases 1-3 fill `area_index_obs`,
`area_index_composite`, `area_index_baseline` and `zone_index_monthly`; this is
the first thing that READS them for a customer.

KEYED ON A ZONE, NEVER ON AN INDUSTRY. Nothing here knows what grows in the
zone: the rollup decides which areas belong to it, and the labels below describe
the index, not the crop. The same functions serve a wine region today and a
dairy region once pasture areas are rolled up to dairy zones, which is why the
index meanings are written for vegetation in general.

## What the zone numbers are

* `mean` - the planted-weighted mean of the areas' monthly composites.
* `anomaly` - the planted-weighted mean of each area's anomaly against ITS OWN
  2017+ baseline. Not the zone mean minus a zone baseline: which blocks were
  clear changes month to month, and a month where only the cooler blocks were
  seen would otherwise read as a zone-wide anomaly. The rollup writes it; this
  module only reads it.
* `coverage` - the share of the zone's register hectares observed that month.

## The normal

Per calendar month, across COMPLETE years before this one: the mean of the
zone's monthly means and their p10/p90. A month enters the normal, the season
line and the headline only at `MIN_COVERAGE` or more. Below that it is a few
blocks between clouds and its mean is a sample of whichever blocks those were.

## Honest limits, stated on the page

At 10-20 m a pixel over a vineyard mixes vine canopy with inter-row sward and
soil. Phase 0 found winter NDVI - no vine leaves at all - running at 96-108% of
summer in the four test zones. So a vineyard zone's index measures the whole
block floor and canopy together, and the note says so. Pasture has no such
mixture; the note is chosen by the zone's industry, the numbers are not.
"""
from datetime import date
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

MIN_COVERAGE = 0.3
MIN_NORMAL_YEARS = 3

# What each index responds to, written for a reader and for any vegetation.
INDICES = (
    {"key": "ndvi", "label": "NDVI", "meaning": "Greenness and vigour",
     "resolution_m": 10},
    {"key": "ndmi", "label": "NDMI", "meaning": "Canopy water content",
     "resolution_m": 20},
    {"key": "ndre", "label": "NDRE", "meaning": "Chlorophyll, less prone to saturate",
     "resolution_m": 20},
)

ATTRIBUTION = ("Contains modified Copernicus Sentinel-2 data, processed by Auxein "
               "from Microsoft Planetary Computer.")

NOTES = {
    "wine": ("A 10-20 m pixel over a vineyard mixes vine canopy with inter-row cover "
             "and soil, so these figures track the whole block, not the vines alone. "
             "Anomalies compare each block with its own record since 2017."),
    None: "Anomalies compare each area with its own record since 2017.",
}

# What the page calls one monitored area. A grower reads "blocks"; anything
# else gets the neutral word.
AREA_NOUN = {"wine": ("block", "blocks"), None: ("area", "areas")}

SERIES_SQL = text("""
SELECT index_name, year, month, mean, p10, p90, anomaly, n_areas, n_obs,
       planted_ha, coverage
FROM zone_index_monthly
WHERE zone_id = :z
ORDER BY index_name, year, month
""")

ZONE_INDUSTRY_SQL = text("""
SELECT i.key FROM climate_zones z LEFT JOIN industries i ON i.id = z.industry_id
WHERE z.id = :z
""")


def _f(v, digits=4) -> Optional[float]:
    return None if v is None else round(float(v), digits)


def _row(r) -> dict:
    return {"year": int(r["year"]), "month": int(r["month"]),
            "mean": _f(r["mean"]), "p10": _f(r["p10"]), "p90": _f(r["p90"]),
            "anomaly": _f(r["anomaly"]), "coverage": _f(r["coverage"], 3),
            "n_areas": int(r["n_areas"]), "n_obs": int(r["n_obs"])}


def _percentile(values: list[float], q: float) -> Optional[float]:
    """Linear-interpolated percentile, the same definition as percentile_cont."""
    if not values:
        return None
    s = sorted(values)
    pos = (len(s) - 1) * q
    lo = int(pos)
    hi = min(lo + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (pos - lo)


def _normal(rows: list[dict], this_year: int) -> tuple[list[dict], Optional[tuple[int, int]]]:
    """Per calendar month over complete years, from months with enough coverage."""
    by_month: dict[int, list[dict]] = {}
    for r in rows:
        if r["year"] < this_year and r["mean"] is not None and \
                (r["coverage"] or 0) >= MIN_COVERAGE:
            by_month.setdefault(r["month"], []).append(r)
    normal, years = [], set()
    for m in range(1, 13):
        pts = by_month.get(m, [])
        if len(pts) < MIN_NORMAL_YEARS:
            normal.append({"month": m, "mean": None, "p10": None, "p90": None,
                           "n_years": len(pts)})
            continue
        vals = [p["mean"] for p in pts]
        years.update(p["year"] for p in pts)
        normal.append({"month": m, "mean": _f(sum(vals) / len(vals)),
                       "p10": _f(_percentile(vals, 0.1)), "p90": _f(_percentile(vals, 0.9)),
                       "n_years": len(pts)})
    span = (min(years), max(years)) if years else None
    return normal, span


def _season_months(vintage: int) -> list[tuple[int, int]]:
    """July of the year before the vintage to June of the vintage year."""
    return [(vintage - 1, m) for m in range(7, 13)] + [(vintage, m) for m in range(1, 7)]


def zone_indices(db: Session, zone_id: int, vintage: int, today: date,
                 full_series: bool = False) -> dict:
    """The zone's satellite indices: latest month, this season, the normal.

    `full_series` adds every month on record, for API consumers; the region
    dashboard does not draw it and leaves it off.
    """
    rows = [dict(r) for r in db.execute(SERIES_SQL, {"z": zone_id}).mappings()]
    if not rows:
        return {"available": False,
                "reason": "No satellite record for this region yet."}

    industry = db.execute(ZONE_INDUSTRY_SQL, {"z": zone_id}).scalar()
    season_keys = _season_months(vintage)
    out = []
    for spec in INDICES:
        ix_rows = [_row(r) for r in rows if r["index_name"] == spec["key"]]
        if not ix_rows:
            continue
        normal, span = _normal(ix_rows, today.year)
        usable = [r for r in ix_rows
                  if r["mean"] is not None and (r["coverage"] or 0) >= MIN_COVERAGE]
        latest = usable[-1] if usable else None
        if latest:
            n = normal[latest["month"] - 1]
            latest = {**latest,
                      "to_date": (latest["year"], latest["month"]) == (today.year, today.month),
                      "normal_mean": n["mean"], "normal_p10": n["p10"],
                      "normal_p90": n["p90"]}
        by_key = {(r["year"], r["month"]): r for r in ix_rows}
        season = []
        for y, m in season_keys:
            r = by_key.get((y, m))
            ok = r is not None and r["mean"] is not None and (r["coverage"] or 0) >= MIN_COVERAGE
            season.append({"year": y, "month": m,
                           "mean": r["mean"] if ok else None,
                           "anomaly": r["anomaly"] if ok else None,
                           "coverage": r["coverage"] if r else None,
                           "to_date": (y, m) == (today.year, today.month)})
        entry = {**spec, "latest": latest, "season": season, "normal": normal,
                 "normal_span": list(span) if span else None}
        if full_series:
            entry["series"] = ix_rows
        out.append(entry)

    if not out:
        return {"available": False,
                "reason": "No satellite record for this region yet."}
    first = min(r["year"] for r in rows)
    return {
        "available": True,
        "vintage": vintage,
        "record_from": first,
        "min_coverage": MIN_COVERAGE,
        "indices": out,
        "note": NOTES.get(industry, NOTES[None]),
        "area_noun": list(AREA_NOUN.get(industry, AREA_NOUN[None])),
        "attribution": ATTRIBUTION,
    }
