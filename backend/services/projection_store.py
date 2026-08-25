"""Read side of the MfE 2024 projection surfaces — S3 COGs indexed by Postgres.

The projection twin of `surface_store`. `surface_projection_run` says which
object holds a given (variable, statistic, scenario, period, season); the pixels
come from the same bucket over the same range reads, and the tile is rendered by
`surface_store.render_tile`, which takes an s3_key and knows nothing about where
the key came from.

## Why this is a separate module, not four more branches in surface_store

The same argument the `surface_projection_run` migration makes for the table.
`surface_store.resolve` is built around (granularity, statistic, valid_at) and a
fitted spline's provenance — `cv_rmse`, `n_stations_fit`, `edf`. A projection
has no date, no stations and no cross-validated error. Threading it through the
observational lookup is how a 2090 scenario ends up being served as measured
weather, and `resolve`'s `ORDER BY model_version DESC` means that failure would
be silent.

## The colour domain, which is the part that is easy to get wrong

A projected field is an ABSOLUTE value — our 1986-2005 normal with MfE's change
composed onto it — so it renders on a value scale, not a change scale. The
question is whose scale.

  * **Temperature means share the measured Atlas scale, deliberately.** A
    seasonal or annual mean sits in the same range as a monthly one (measured:
    the widest is projected DJF Tmax at p99.9 = 27.8 against a 26.0 ceiling, so
    0.1% of cells saturate, which is the documented policy in
    `surface_store.DOMAINS`, not an accident). Sharing the scale is the entire
    value of the mode: flipping Measured -> Projected recolours the country, and
    it only means something if the colours mean the same thing on both.

  * **Everything else gets its own measured domain**, because it is not the same
    SHAPE of quantity. The measured rainfall archive is monthly and a projected
    ANN rainfall total is twelve months — p99.9 of 9,945 mm against a monthly
    ceiling of 1,228 mm. Rendering that on the monthly scale would paint two
    thirds of the country in the top colour.

`PROJECTION_DOMAINS` below is MEASURED by `scripts/scan_projection_domains.py`,
never guessed, exactly as `surface_store.DOMAINS` is. Re-run that script if the
surfaces are ever rebuilt.
"""
from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from services import surface_store as store

log = logging.getLogger(__name__)

MODEL_VERSION_PREFIX = "mfe2024"

# THE BASELINE LIVES IN THE SAME TABLE (migration `projection_baseline_kind`).
#
# `surface_projection_run` now holds two kinds of row: the 576 MfE projections
# and the 36 rows of our own 1986-2005 normal, told apart by `kind` and keyed
# with these sentinels in `scenario` and `period` — a CHECK makes the two agree
# in both directions, so a baseline cannot claim a scenario and a projection
# cannot wear the sentinel.
#
# **Every query that describes the projection MATRIX must filter on
# `kind = 'projection'`.** Miss it and 'baseline' appears as a fourth emissions
# scenario in the catalogue, which is both wrong and, on a chart, a lie.
KIND_PROJECTION = "projection"
KIND_BASELINE = "baseline"
BASELINE_SENTINEL = "baseline"
_PROJECTION_ONLY = f"kind = '{KIND_PROJECTION}'"


class ProjectionNotFound(LookupError):
    """No indexed projection matches the request."""


# --- what may be served -----------------------------------------------------

# FROST IS NOT SERVED, and this is not an oversight.
#
# Every frost metric was withdrawn from the product on 2026-08-24: the count is
# thresholded off a lapse-retrended Tmin field, and on frost nights the real
# lapse rate INVERTS, so the field loads frost onto the tops and erases it from
# the valley floors — which is where the vineyards are. The sampling was proven
# not to be the cause.
#
# The projection inherits that defect wholesale, because it is composed onto the
# same 1986-2005 normal. `scan_projection_domains.py` measures the projected
# annual frost field at p99.9 = 209 days and max = 297 — nearly a year of frost
# nights, which is corroboration rather than coincidence.
#
# The rows stay in `surface_projection_run` and the objects stay in the bucket,
# because a withdrawn layer that still exists can be re-served the day the
# engine is fixed. What must not happen is a withdrawn metric reappearing
# through a new endpoint because nobody wired the exclusion into it.
WITHHELD: set[tuple[str, str]] = {("temp_min", "frost_days")}

# Layers that render on the measured Atlas's own scale — see the module note.
SHARE_MEASURED_DOMAIN: set[tuple[str, str]] = {
    ("temp_mean", "mean"), ("temp_min", "mean"), ("temp_max", "mean"),
}

# Measured by `scripts/scan_projection_domains.py --decimate 6` on 2026-08-25,
# pooling ssp126/fp2021-2040, ssp370/fp2080-2099 and ssp370/wl3 (plus the other
# two scenarios at fp2080-2099 for rainfall, whose multiplicative change is not
# monotone in warming). Ceilings CLEAR the pooled p99.9 and round up to a value
# with whole quarter ticks, the same rule `surface_store.DOMAINS` was set by.
#
#   layer                        p50      p99.9        ceiling
#   rainfall/sum ANN          1422.4     9945.5        10000
#   rainfall/sum DJF           333.3     2305.6         2400
#   rainfall/sum MAM           335.5     2183.5         2400
#   rainfall/sum JJA           419.7     2684.7         2800
#   rainfall/sum SON           333.6     2847.2         3200
#   days_over_25 ANN            29.3      130.6          160
#   days_over_30 ANN             0.9       27.1           28
#   gdd10/cumulative SEPAPR   1141.1     2590.8         2800
PROJECTION_DOMAINS: dict[tuple[str, str, str], tuple[float, float, str]] = {
    # gdd10 is the one entry that departs from its measured twin on purpose.
    # The observational GDD season domain tops out at 2,200 (p99.5 of the season
    # total over 37 vintages); ssp370 at 2080-2099 reaches 2,591. Holding the
    # measured ceiling would saturate every hot future into one colour and hide
    # the increase, which is the single thing this layer exists to show. The
    # cost is that a projected GDD map is NOT colour-comparable with the
    # measured one; the legend prints the domain, so the scale is on screen.
    ("gdd10", "cumulative", "SEPAPR"): (0.0, 2800.0, "heat"),

    # Rainfall totals over 3- and 12-month windows. Front-loaded `rain_depth`
    # stops, as the monthly depths use, because the distribution is just as
    # right-skewed at this window length.
    ("rainfall", "sum", "ANN"): (0.0, 10000.0, "rain_depth"),
    ("rainfall", "sum", "DJF"): (0.0, 2400.0, "rain_depth"),
    ("rainfall", "sum", "MAM"): (0.0, 2400.0, "rain_depth"),
    ("rainfall", "sum", "JJA"): (0.0, 2800.0, "rain_depth"),
    ("rainfall", "sum", "SON"): (0.0, 3200.0, "rain_depth"),

    # Hot-day counts. Every season carries an explicit entry rather than letting
    # the two that happen to fit fall back to the monthly domain — a layer whose
    # scale is measured for three seasons and inherited for two is a provenance
    # question nobody should have to ask.
    ("temp_max", "days_over_25", "ANN"): (0.0, 160.0, "heat"),
    ("temp_max", "days_over_25", "DJF"): (0.0, 84.0, "heat"),
    ("temp_max", "days_over_25", "MAM"): (0.0, 44.0, "heat"),
    ("temp_max", "days_over_25", "SON"): (0.0, 20.0, "heat"),
    # p99.9 = 0.18 and max = 0.56. Winter days over 25 C essentially do not
    # happen under any scenario, and a near-flat map IS the finding.
    ("temp_max", "days_over_25", "JJA"): (0.0, 1.0, "heat"),

    ("temp_max", "days_over_30", "ANN"): (0.0, 28.0, "heat"),
    ("temp_max", "days_over_30", "DJF"): (0.0, 24.0, "heat"),
    ("temp_max", "days_over_30", "MAM"): (0.0, 4.0, "heat"),
    ("temp_max", "days_over_30", "SON"): (0.0, 2.0, "heat"),
    # Measured max is exactly 0.00 across every scenario and period.
    ("temp_max", "days_over_30", "JJA"): (0.0, 1.0, "heat"),

    # Frost, measured but WITHHELD — see `WITHHELD`. Kept so that re-serving the
    # layer after the engine is fixed does not need another scan.
    #
    # **These four ceilings are sized off the PROJECTION and the BASELINE
    # exceeds them** (measured 2026-08-25: DJF 20.8 against 20, JJA 90.6 against
    # 88, MAM 60.2 against 56, SON 67.3 against 60). That is not a mistake in
    # the measurement — warming REDUCES frost, so the 1986-2005 normal is the
    # high end of this layer and every other layer's is the low end. Harmless
    # while the layer is withheld and never rendered; **re-measure against the
    # baseline, not the projection, before ever serving it.** The baseline's
    # annual maximum is 327 frost days, which says more about the field than any
    # ceiling could.
    #
    # Every other layer was verified the other way round on 2026-08-25: all 31
    # SERVED baselines fall inside the domain sized for their projection, so a
    # Baseline/Projected flip saturates on neither side.
    ("temp_min", "frost_days", "ANN"): (0.0, 240.0, "blues"),
    ("temp_min", "frost_days", "DJF"): (0.0, 20.0, "blues"),
    ("temp_min", "frost_days", "MAM"): (0.0, 56.0, "blues"),
    ("temp_min", "frost_days", "JJA"): (0.0, 88.0, "blues"),
    ("temp_min", "frost_days", "SON"): (0.0, 60.0, "blues"),
}


def domain_for(variable: str, statistic: str,
               season: str) -> tuple[float, float, str]:
    """Fixed display domain and ramp for a projected layer. Never derived from
    the data in view — see the module note for which layers share the measured
    Atlas scale and which carry their own."""
    if (variable, statistic) in SHARE_MEASURED_DOMAIN:
        return store.domain_for(variable, statistic)
    key = (variable, statistic, season)
    if key in PROJECTION_DOMAINS:
        return PROJECTION_DOMAINS[key]
    # No measured domain. Refusing is the point: the alternative is a
    # plausible-looking map at an invented scale, which is worse than no map.
    raise ProjectionNotFound(
        f"no measured display domain for {variable}/{statistic} {season}; "
        f"run scripts/scan_projection_domains.py")


# --- labels -----------------------------------------------------------------
#
# Served by the API rather than hardcoded in the client, for the same reason the
# domain is: two places that both name SSP3-7.0 will eventually disagree, and
# the one on the screen is the one that matters.

SCENARIO_LABELS = {
    "ssp126": {"label": "SSP1-2.6", "detail": "Strong mitigation"},
    "ssp245": {"label": "SSP2-4.5", "detail": "Middle of the road"},
    "ssp370": {"label": "SSP3-7.0", "detail": "High emissions"},
}

# Two genuinely different KINDS of horizon, and the client groups them on this
# field. A fixed period is a date range and a warming level is a threshold that
# different scenarios reach in different decades — putting them in one
# undifferentiated row invites reading "+3 C" as a fourth time period.
PERIOD_LABELS = {
    "fp2021-2040": {"label": "2021–2040", "kind": "period", "order": 1},
    "fp2041-2060": {"label": "2041–2060", "kind": "period", "order": 2},
    "fp2080-2099": {"label": "2080–2099", "kind": "period", "order": 3},
    "wl1.5": {"label": "+1.5 °C", "kind": "warming", "order": 4},
    "wl2": {"label": "+2 °C", "kind": "warming", "order": 5},
    "wl3": {"label": "+3 °C", "kind": "warming", "order": 6},
}

SEASON_LABELS = {
    "ANN": {"label": "Annual", "order": 1},
    "SEPAPR": {"label": "Growing season", "detail": "Sep–Apr", "order": 2},
    "DJF": {"label": "Summer", "detail": "Dec–Feb", "order": 3},
    "MAM": {"label": "Autumn", "detail": "Mar–May", "order": 4},
    "JJA": {"label": "Winter", "detail": "Jun–Aug", "order": 5},
    "SON": {"label": "Spring", "detail": "Sep–Nov", "order": 6},
}

LAYER_LABELS = {
    ("temp_mean", "mean"): "Mean temperature",
    ("temp_min", "mean"): "Minimum temperature",
    ("temp_max", "mean"): "Maximum temperature",
    ("rainfall", "sum"): "Rainfall",
    ("temp_max", "days_over_25"): "Days over 25 °C",
    ("temp_max", "days_over_30"): "Days over 30 °C",
    ("gdd10", "cumulative"): "Growing degree days",
    ("temp_min", "frost_days"): "Frost days",
}


def _withheld_clause(alias: str = "") -> str:
    """SQL that removes every withheld layer. One place, so a new endpoint
    cannot forget it."""
    if not WITHHELD:
        return "TRUE"
    p = f"{alias}." if alias else ""
    terms = " AND ".join(
        f"NOT ({p}variable = '{v}' AND {p}statistic = '{s}')"
        for v, s in sorted(WITHHELD))
    return terms


# --- index queries ----------------------------------------------------------

def layers(db: Session) -> list[dict]:
    """Every (variable, statistic) pair published and servable."""
    rows = db.execute(text(f"""
        SELECT variable, statistic, unit, rule, count(*) AS n
        FROM surface_projection_run
        WHERE status = 'ok' AND {_PROJECTION_ONLY} AND {_withheld_clause()}
        GROUP BY variable, statistic, unit, rule
        ORDER BY variable, statistic
    """)).mappings().all()
    return [{"variable": r["variable"], "statistic": r["statistic"],
             "unit": r["unit"], "rule": r["rule"], "count": r["n"],
             "label": LAYER_LABELS.get((r["variable"], r["statistic"]),
                                       f'{r["variable"]} {r["statistic"]}')}
            for r in rows]


def steps(db: Session, variable: str, statistic: str) -> list[dict]:
    """Every published (scenario, period, season) for one layer, with the
    summary medians the index already carries.

    Returned WHOLE rather than one row per selection. It is 80 rows for a layer
    and it means the client can show "+1.8 C against the 1986-2005 normal" the
    instant a chip is pressed, with no round trip and no spinner on a number
    that was already in the payload.
    """
    if (variable, statistic) in WITHHELD:
        return []
    rows = db.execute(text(f"""
        SELECT scenario, period, season, unit, rule, baseline,
               baseline_median, projected_median,
               delta_median, delta_p5, delta_p95
        FROM surface_projection_run
        WHERE status = 'ok' AND {_PROJECTION_ONLY}
          AND variable = :v AND statistic = :s
        ORDER BY scenario, period, season
    """), {"v": variable, "s": statistic}).mappings().all()
    return [dict(r) for r in rows]


def meta(db: Session) -> dict:
    """Model version, baseline and the ATTRIBUTION STRING.

    The MfE projections are CC BY 4.0, which REQUIRES the attribution to travel
    with the work. It is stored per row by `index_projections.py` precisely so
    the API serves it rather than a doc holding it — this is the field the UI
    must render wherever a projection is shown.
    """
    row = db.execute(text(f"""
        SELECT model_version, baseline, source, count(*) AS n,
               max(created_at) AS published_at
        FROM surface_projection_run
        WHERE status = 'ok' AND {_PROJECTION_ONLY} AND {_withheld_clause()}
        GROUP BY model_version, baseline, source
        ORDER BY count(*) DESC
        LIMIT 1
    """)).mappings().first()
    if row is None:
        return {}
    return {"model_version": row["model_version"], "baseline": row["baseline"],
            "source": row["source"], "count": row["n"],
            "published_at": row["published_at"]}


def baselines(db: Session, variable: str, statistic: str) -> dict:
    """The 1986-2005 normal for one layer, keyed by season.

    Returned as its own block rather than folded into `steps` because a baseline
    is not a step of the matrix — it is the single thing every step is measured
    against, and one per season regardless of how many scenarios exist.

    **Its `source` is OUR attribution, not MfE's.** A normal is a reduction of
    our own published archive; carrying the projection's CC BY 4.0 credit on it
    would attribute our work to someone else, which is the one direction a
    licence notice must never be wrong in.
    """
    if (variable, statistic) in WITHHELD:
        return {}
    rows = db.execute(text(f"""
        SELECT season, unit, baseline, baseline_median, model_version, source
        FROM surface_projection_run
        WHERE status = 'ok' AND kind = '{KIND_BASELINE}'
          AND variable = :v AND statistic = :s
        ORDER BY season
    """), {"v": variable, "s": statistic}).mappings().all()
    return {r["season"]: dict(r) for r in rows}


def resolve(db: Session, variable: str, statistic: str, scenario: str,
            period: str, season: str) -> dict:
    """One indexed projection OR baseline, or ProjectionNotFound.

    Deliberately ONE function for both. The baseline carries the 'baseline'
    sentinel in `scenario` and `period`, so it resolves through exactly the same
    lookup and is served by exactly the same tile endpoint — which is what makes
    a Baseline/Projected flip a change of two path segments rather than a second
    route with a second renderer that could drift from this one.

    Never invents a row."""
    if (variable, statistic) in WITHHELD:
        # Deliberately the same error as a genuinely absent layer. A withheld
        # metric should not advertise itself by returning a distinguishable
        # refusal to anyone probing the URL space.
        raise ProjectionNotFound(f"no {variable}/{statistic} projection")
    row = db.execute(text("""
        SELECT kind, variable, statistic, scenario, period, season, baseline,
               resolution_m, model_version, rule, unit, s3_key, source,
               baseline_median, projected_median, delta_median,
               delta_p5, delta_p95, status
        FROM surface_projection_run
        WHERE status = 'ok'
          AND variable = :v AND statistic = :s
          AND scenario = :sc AND period = :p AND season = :se
        ORDER BY resolution_m ASC, model_version DESC
        LIMIT 1
    """), {"v": variable, "s": statistic, "sc": scenario,
           "p": period, "se": season}).mappings().first()
    if row is None:
        raise ProjectionNotFound(
            f"no {variable}/{statistic} projection for "
            f"{scenario}/{period}/{season}")
    return dict(row)


def describe(variable: str, statistic: str, season: str) -> dict:
    """The domain block the legend is drawn from. Same shape as
    `/surfaces/available`'s `meta.domain`, so one legend component serves both
    modes."""
    lo, hi, ramp = domain_for(variable, statistic, season)
    return {"min": lo, "max": hi, "ramp": ramp,
            "stops": store.RAMPS[ramp],
            "positions": store.ramp_positions(ramp),
            "saturates": True,
            # Whether this scale is the one the measured Atlas uses. The client
            # shows the comparison as meaningful only when it is.
            "shared_with_measured": (variable, statistic) in SHARE_MEASURED_DOMAIN}
