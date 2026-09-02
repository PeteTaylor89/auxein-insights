"""Read side of the climate surface archive — S3 COGs indexed by Postgres.

SURFACE_CONTRACT_V2 §1 and §5. `surface_run` says which object holds a given
(variable, granularity, statistic, valid_at) and how accurate it is; the pixels
come from `s3://auxein-climate-surfaces` over HTTP range requests. Nothing is
downloaded whole: a 500 m national surface is 2856 x 2667 and a 256 px tile
touches a few blocks of one overview level.

Everything here is blocking — GDAL range reads and a sync SQLAlchemy Session.
Callers must be plain `def` FastAPI handlers so they land in the threadpool.
An `async def` sharing this code would park the event loop on network I/O and
has already taken both workers down on this platform once.

## Why the ramp domain is fixed per (variable, statistic)

The stub stretched each tile between its own 2nd and 98th percentile, which is
fine for one tile and wrong for a map: adjacent tiles get different scales, so
the coastline of the ramp lands mid-ocean and the same temperature reads as two
different colours a tile apart. Worse across time — scrubbing January to July
would recolour rather than change, hiding the seasonal cycle that is the whole
point.

So the domain is a property of the variable and statistic, not of the data in
view. `DOMAINS` below is measured from the published archive, not guessed, and
callers may override with explicit min/max per contract §5.4.
"""
from __future__ import annotations

import logging
import os
import struct
import zlib
from calendar import monthrange
from datetime import datetime, timedelta, timezone
from typing import Optional, Sequence

import numpy as np
from sqlalchemy import text
from sqlalchemy.orm import Session

log = logging.getLogger(__name__)

BUCKET = os.getenv("SURFACE_BUCKET", "auxein-climate-surfaces")
AWS_REGION = os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION") or "ap-southeast-2"

TILE_PX = 256
CONTRACT_VERSION = "v2"

UNITS = {"temp_mean": "C", "temp_min": "C", "temp_max": "C",
         "rainfall": "mm", "rh": "%", "pet": "mm",
         # Derived seasonal accumulations. The unit is NOT degrees, which is
         # what makes the cv_units guard suppress their inherited degC error
         # instead of printing it beside a degree-day figure.
         "gdd10": "GDD", "gdd0": "GDD"}


# Granularities whose surfaces are keyed by a STATISTIC as well as a date.
# Daily and hourly are a single field per timestep and carry statistic NULL.
#
# **This list is duplicated in three places by necessity** — here, in
# `api/v1/surfaces._default_statistic`, and in the `surface_run` CHECK
# constraints — and adding `season` to only some of them is exactly how the GDD
# surfaces first indexed fine and then 404'd on every tile. The constraint is
# the backstop that fails loudly; this one fails as "not found", which is far
# quieter, so keep them in step.
STATISTIC_KEYED = ("monthly", "records", "season")

# Granularities that cover a PERIOD rather than an instant, and therefore carry
# `period_start`. Mirrors ck_surface_run_period_start.
PERIOD_GRANULARITIES = ("records", "season")


class SurfaceNotFound(LookupError):
    """No indexed surface matches the request."""


# --- bands withheld from serving --------------------------------------------
#
# WITHHELD 2026-08-27: rainfall/max_dry_spell.
#
# Every published month from 1986-02 onward is wrong. The producer carried the
# running dry-spell length across month boundaries as a single NATIONAL SCALAR
# (`monthly.monthly_stats`, `carry_out = int(run.max())`) and broadcast it back
# into every cell, so the driest cell in the country set a floor under the whole
# map and the floor could only ever rise. Measured on the live archive:
#
#     1986-01  min  2  p50  7  max 12     <- the first month, carry 0, correct
#     2020-06  min 68  p50 70  max 73     <- a 68-day dry spell in every cell
#     2026-06  min 42  p50 42  max 65     <- in the middle of the wet season
#
# The producer is fixed (per-cell carry, `best` starting at zero) but the
# ARCHIVE still holds the bad values, and a band that is visibly impossible is
# worse on a public map than an absent one. This is the holding line until
# rainfall is republished; it is one entry to delete when it has been.
#
# Withholding here rather than in the client for the same reason the projection
# exclusion lives in `projection_store`: every consumer — tiles, /probe, /point,
# the catalogue — inherits it from one place, and a client that has not been
# redeployed cannot keep serving it.
WITHHELD_STATISTICS: set[tuple[str, str]] = {
    ("rainfall", "max_dry_spell"),
}


# --- colour ramps -----------------------------------------------------------

RAMPS: dict[str, list[list[int]]] = {
    # One ramp for every temperature-valued layer, so a colour means the same
    # thing whichever temperature you are looking at. Purple = deep cold,
    # blue = cold, pale yellow = mild, orange/red = hot. Before this, temp_mean
    # rendered viridis, temp_min blues and temp_max magma — three different
    # colour languages for one quantity, and purple meant "coldest" on one map
    # and "hottest" on another.
    "temperature": [[59, 15, 112], [49, 76, 186], [110, 174, 220],
                    [248, 244, 173], [247, 168, 78], [214, 45, 32],
                    [124, 16, 22]],
    # MetService-idiom precipitation: white through blue, green, yellow, orange,
    # red, to magenta at the extreme. Two variants share the colours and differ
    # only in stop placement — see RAMP_POSITIONS.
    "rain": [[240, 249, 255], [186, 223, 240], [110, 180, 224], [42, 122, 190],
             [44, 160, 90], [190, 214, 60], [253, 224, 70], [247, 148, 50],
             [218, 47, 40], [140, 28, 110]],
    "rain_depth": [[240, 249, 255], [186, 223, 240], [110, 180, 224],
                   [42, 122, 190], [44, 160, 90], [190, 214, 60],
                   [253, 224, 70], [247, 148, 50], [218, 47, 40],
                   [140, 28, 110]],
    # Warm sequential for counts and spreads DERIVED from temperature but not
    # measured in it. These must not use the `temperature` ramp: purple there
    # means deep cold, and "few hot days" is not cold.
    "heat": [[255, 245, 215], [254, 217, 142], [254, 173, 84], [240, 118, 50],
             [204, 53, 38], [130, 20, 30]],
    # Retained so an explicit ?ramp= override keeps working, and for the
    # day-of-month index bands where no ramp is meaningful anyway.
    "viridis": [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98],
                [253, 231, 37]],
    "magma": [[0, 0, 4], [81, 18, 124], [183, 55, 121], [252, 137, 97],
              [252, 253, 191]],
    "blues": [[247, 251, 255], [198, 219, 239], [107, 174, 214], [33, 113, 181],
              [8, 48, 107]],
}

# Where each stop sits in 0..1. Absent = evenly spaced, which is right for any
# roughly symmetric quantity.
#
# Rainfall DEPTHS are not symmetric — they are strongly right-skewed, and an
# even ramp puts the median month in the first colour and spends most of the
# scale on the wettest 1%. Measured over the whole published archive
# (`scratchpad/scan_rainfall_domain.py`, 653 M cells per layer):
#
#   rainfall/sum   p50 113.8   p90 314.9   p99 757.2   p99.9 1268   max 2913
#   rainfall/max   p50  29.0   p90  79.6   p99 183.4   p99.9  320   max  807
#
# Both distributions land at almost exactly the same FRACTION of their domain
# (p50 at 0.095, p90 at 0.26), so one front-loaded stop vector serves both.
# Counts (wet days, days over 10 mm) are not skewed and keep even spacing —
# hence `rain` and `rain_depth` sharing colours but not positions.
RAMP_POSITIONS: dict[str, list[float]] = {
    "rain_depth": [0.0, 0.017, 0.05, 0.10, 0.167, 0.267, 0.383, 0.517, 0.70, 1.0],
}


def ramp_positions(ramp: str) -> list[float]:
    """Stop positions in 0..1. Evenly spaced unless the ramp declares otherwise."""
    stops = RAMPS.get(ramp, RAMPS["viridis"])
    declared = RAMP_POSITIONS.get(ramp)
    if declared and len(declared) == len(stops):
        return list(declared)
    n = len(stops)
    return [i / (n - 1) for i in range(n)] if n > 1 else [0.0]

# (variable, statistic) -> (min, max, ramp).
#
# **Domains are set from the POOLED CELL DISTRIBUTION, not from the extremes.**
# The distinction is the difference between a readable map and a uniformly green
# one. A full scan of all 456 temp_mean/mean months gives -17.62 .. +22.64 C,
# but those are single alpine and El-Nino-summer cells: pooled across cells and
# months, p0.5 is -4.2 and p99.5 is +20.8. Stretching the ramp over the extremes
# spends ~85% of it on <1% of the data and leaves every real map inside one
# colour band, with the seasonal cycle invisible.
#
# So each domain covers roughly the central 99% and DELIBERATELY SATURATES the
# tails. That is a display choice with a cost — an alpine winter cell and a
# colder alpine winter cell render identically — and callers who need the tail
# pass explicit min/max per contract §5.4. Measured figures, sampled seasonally
# across the archive:
#
#   temp_mean/mean   p0.5 -4.24  p50 10.37  p99.5 20.83   (full range -17.6..22.6)
#   temp_min/mean    p0.5 -6.65  p50  6.41  p99.5 16.68
#   temp_max/mean    p0.5  0.18  p50 14.77  p99.5 26.03
#   rainfall/sum     p0.5  8.75  p50 118.6  p99.5 849.5   (max 2450)
#
# Rainfall is the awkward one: the distribution is strongly right-skewed, so a
# linear ramp to p99.5 leaves the median month in the bottom seventh. 800 mm is
# a compromise that keeps Fiordland legible without flattening the east coast.
#
# Day-of-month bands (argmin_day, first_frost_day, ...) are 1..31 with 0 meaning
# "never", so they share a 0..31 domain; they are indices, not magnitudes, and
# a continuous ramp over them is a weak visual at best.
# A SHARED temperature domain, not one per variable. A common ramp with
# per-variable domains would be worse than the old three-ramp arrangement: every
# map would look plausible while red meant 17 C on the minimum-temperature layer
# and 26 C on the maximum. Switching variable is the main thing a visitor does
# here, so the two must be directly comparable.
#
# Two scales, because the question changes: TYPICAL layers (mean, median) share
# one, EXTREME-DAY layers (the coldest/warmest single day in the month) share a
# wider one. Comparing a mean to a monthly extreme is not a journey the map
# offers, and forcing both onto one scale would flatten every typical map.
TEMP_TYPICAL = (-7.0, 26.0)     # covers temp_min p0.5 -6.65 .. temp_max p99.5 26.03
TEMP_EXTREME = (-15.0, 32.0)    # covers temp_mean/min .. temp_max/max

DOMAINS: dict[tuple[str, str], tuple[float, float, str]] = {
    ("temp_mean", "mean"): (*TEMP_TYPICAL, "temperature"),
    ("temp_mean", "median"): (*TEMP_TYPICAL, "temperature"),
    ("temp_mean", "min"): (*TEMP_EXTREME, "temperature"),
    ("temp_mean", "max"): (*TEMP_EXTREME, "temperature"),
    ("temp_min", "mean"): (*TEMP_TYPICAL, "temperature"),
    ("temp_min", "median"): (*TEMP_TYPICAL, "temperature"),
    ("temp_min", "min"): (*TEMP_EXTREME, "temperature"),
    ("temp_min", "max"): (*TEMP_EXTREME, "temperature"),
    ("temp_max", "mean"): (*TEMP_TYPICAL, "temperature"),
    ("temp_max", "median"): (*TEMP_TYPICAL, "temperature"),
    ("temp_max", "min"): (*TEMP_EXTREME, "temperature"),
    ("temp_max", "max"): (*TEMP_EXTREME, "temperature"),
    # Ceilings sit AT the measured p99.9, not eyeballed. The old 150 mm ceiling
    # on the wettest-day layer saturated 1.82% of all cells — every heavy-rain
    # event in the archive rendered as one flat colour. At p99.9 only 0.1%
    # saturates, and the front-loaded `rain_depth` stops keep the median month
    # legible despite the wider range. Both ceilings are also divisible by four,
    # so the legend's quarter ticks come out as whole millimetres.
    #
    # RE-MEASURED 2026-08-18 against the LENZ-conditioned archive
    # (`scratchpad/scan_rainfall_domain.py`), which replaced every rainfall COG:
    #
    #                p99.9 before -> after     archive max before -> after
    #   rainfall/max   319.9 -> 308.8 (-3.5%)     806.7 -> 623.1 (-22.8%)
    #   rainfall/sum  1268.0 -> 1225.7 (-3.3%)   2913.0 -> 2374.6 (-18.5%)
    #
    # **Do not derive one of these from the other.** The 3 km log-space
    # smoothing compresses the extreme tail hard and the body of the
    # distribution barely at all, so the maxima moved ~20% while the p99.9 that
    # actually sets these ceilings moved ~3%. Reading the ceiling off the
    # headline maximum would have cut it by a fifth and flattened every heavy
    # fall — the exact defect the 150 mm ceiling caused.
    ("rainfall", "sum"): (0.0, 1228.0, "rain_depth"),
    ("rainfall", "mean"): (0.0, 40.0, "rain_depth"),
    ("rainfall", "median"): (0.0, 20.0, "rain_depth"),
    # 312, not 308: the ceiling must CLEAR p99.9 (308.8), so it rounds UP to the
    # next multiple of four. Rounding down for tidier ticks puts heavy falls back
    # into saturation, which is the whole defect this domain was retuned to fix.
    ("rainfall", "max"): (0.0, 312.0, "rain_depth"),
    # Growing degree days. `heat` rather than `temperature`, because these are
    # DERIVED from temperature and not measured in it — purple on the
    # temperature ramp means deep cold, and "few degree days" is not cold.
    #
    # Ceilings at the pooled p99.5 of the SEASON TOTAL across all 37 vintages
    # (measured by gdd_season.py --stats-only): gdd10 2,156 of a 2,314 max;
    # gdd0 4,576 of 4,734. Rounded up to keep the legend's quarter ticks whole.
    #
    # **`cumulative` shares the season-total domain deliberately.** Rescaling
    # each accumulation month to its own range would make September look like
    # April and hide the one thing the animation exists to show. An early-season
    # map reading dark is the message, not a defect — the same argument the
    # monthly scrubber's fixed domain is built on.
    ("gdd10", "sum"): (0.0, 2200.0, "heat"),
    ("gdd10", "cumulative"): (0.0, 2200.0, "heat"),
    ("gdd0", "sum"): (0.0, 4600.0, "heat"),
    ("gdd0", "cumulative"): (0.0, 4600.0, "heat"),
}

# Statistic-only fallbacks, applied when the pair above has no entry. Counts and
# day indices behave the same whatever the variable.
#
# Counts do NOT go on the `temperature` ramp even when they are derived from
# temperature: purple there means deep cold, and "no hot days" is not cold.
# They get single-direction sequential ramps that read as a magnitude —
# `heat` for warm/dry counts, `blues` for frost, `rain` (evenly spaced) for wet.
STATISTIC_DOMAINS: dict[str, tuple[float, float, str]] = {
    "sd": (0.0, 6.0, "heat"),
    "frost_days": (0.0, 31.0, "blues"),
    "days_over_25": (0.0, 22.0, "heat"),
    "days_over_30": (0.0, 12.0, "heat"),
    "wet_days": (0.0, 31.0, "rain"),
    "days_over_10mm": (0.0, 31.0, "rain"),
    "days_over_25mm": (0.0, 20.0, "rain"),
    "max_dry_spell": (0.0, 31.0, "heat"),
    "argmin_day": (0.0, 31.0, "viridis"),
    "argmax_day": (0.0, 31.0, "viridis"),
    "first_frost_day": (0.0, 31.0, "blues"),
    "last_frost_day": (0.0, 31.0, "blues"),
    # wet_top1 IS the month's wettest day, so it shares rainfall/max's ceiling;
    # the rest step down as the ranked falls do.
    "wet_top1": (0.0, 320.0, "rain_depth"),
    "wet_top2": (0.0, 220.0, "rain_depth"),
    "wet_top3": (0.0, 180.0, "rain_depth"),
    "wet_top4": (0.0, 150.0, "rain_depth"),
    "wet_top5": (0.0, 130.0, "rain_depth"),
    "all_time_max": (-15.0, 40.0, "temperature"),
    "all_time_min": (-30.0, 20.0, "temperature"),
    "all_time_max_day": (0.0, 13880.0, "viridis"),
    "all_time_min_day": (0.0, 13880.0, "viridis"),
}


# A DAILY SURFACE IS NOT A MONTHLY STATISTIC, and until 2026-09-01 it was
# rendered as though it were. Daily granularity carries no statistic, so
# `domain_for` fell through to its `statistic or "mean"` default and handed the
# daily rainfall layer the domain built for a month's MEAN DAY — ceiling 40 mm.
#
# Measured against `weather_data_daily`, all station-days over three years:
#
#     p50 0.0   p90 12.8   p99 62.9   p99.9 155.7   p99.99 290.9   max 802.8
#
# **40 mm saturated 2.33% of station-days.** The 150 mm ceiling this file
# already removed from `rainfall/max` was condemned for saturating 1.82%, so
# the daily layer was clipping harder than the defect that rework existed to
# fix — and clipping it in the mountains and on the West Coast, where the
# heaviest falls are the whole point of looking.
#
# 156 is the p99.9 rounded UP to the next multiple of four, the same rule the
# monthly ceilings follow: 0.1% saturates and the legend's quarter ticks are
# whole millimetres (39 / 78 / 117 / 156).
#
# Station gauges are POINT values and the surface is smoothed, so a rendered
# cell reaches lower than a gauge does — but do not scale this down to
# compensate. The LENZ conditioning compresses the extreme tail ~20% while
# moving the p99.9 that sets ceilings only ~3%, which is exactly why the
# percentile and not the maximum is the statistic to read.
#
# TEMPERATURE HAD THE SAME DEFECT AND IT BIT HARDER. `TEMP_TYPICAL` covers
# "temp_min p0.5 .. temp_max p99.5" measured on the MONTHLY archive, where
# averaging over a month pulls both tails in. Applied to a single day it clipped
# **5.33% of station-days** on temp_max — a hot Central Otago afternoon rendered
# the same colour as a mild one, all summer.
#
# Same rule, daily data, three years of `weather_data_daily`:
#
#     temp_min   p0.5  -4.96    p99.5 19.42
#     temp_mean  p0.5   0.03    p99.5 23.00
#     temp_max   p0.5   3.85    p99.5 30.79
#
# `TEMP_DAILY` keeps the property that matters about the shared scale: the three
# variables stay visually distinct on it. Their medians land at 0.41 / 0.51 /
# 0.63 of the range — better separated than on TEMP_TYPICAL (0.46 / 0.59 / 0.73)
# — and only 0.23% of temp_max days now exceed the ceiling. Quarter ticks are
# whole degrees: -8 / 2 / 12 / 22 / 32.
#
# All three move together, deliberately. A shared ramp with per-variable domains
# is the failure this file's header describes — every map looks plausible while
# red means one thing on the minimum layer and another on the maximum.
#
# CAVEAT ON THE BASIS, and it is not the same basis the monthly ceilings used.
# These percentiles come from STATION OBSERVATIONS; the monthly domains were
# measured over GRID CELLS. The station network has almost nothing on the
# alpine spine, so it understates both the cold and the wet where the surface
# does not. That is why the floor is -8 rather than the -5 the rule alone would
# give: the headroom stands in for stations that do not exist.
#
# **Do not re-measure these on the daily COG archive yet.** It holds 61 days per
# variable and every one of them is WINTER (2026-07-01..08-30). A temp_max
# ceiling read off a July raster would be lower than the one being replaced, and
# a rainfall ceiling read off two winter months carries the West Coast fronts
# and none of the summer convection. Seasonal coverage, not depth, is what these
# percentiles need — the station basis has three full years of it. Revisit after
# the daily archive spans a complete annual cycle.
TEMP_DAILY = (-8.0, 32.0)

DAILY_DOMAINS: dict[str, tuple[float, float, str]] = {
    "rainfall": (0.0, 156.0, "rain_depth"),
    "temp_mean": (*TEMP_DAILY, "temperature"),
    "temp_min": (*TEMP_DAILY, "temperature"),
    "temp_max": (*TEMP_DAILY, "temperature"),
}


def domain_for(variable: str, statistic: Optional[str],
               granularity: Optional[str] = None) -> tuple[float, float, str]:
    """Fixed display domain and default ramp. Never derived from the data in view."""
    if granularity == "daily" and variable in DAILY_DOMAINS:
        return DAILY_DOMAINS[variable]
    stat = statistic or "mean"
    if (variable, stat) in DOMAINS:
        return DOMAINS[(variable, stat)]
    if stat in STATISTIC_DOMAINS:
        return STATISTIC_DOMAINS[stat]
    # Unknown pair: a wide temperature-ish domain is a poor guess, so say so
    # rather than render a plausible-looking lie at an unknown scale.
    log.warning("no fixed domain for %s/%s; falling back to 0..1", variable, stat)
    return (0.0, 1.0, "viridis")


# THE UNIT IS A PROPERTY OF THE BAND, NOT OF THE VARIABLE.
#
# `UNITS` above answers "what is temp_min measured in" and the answer is degrees
# — but `temp_min/frost_days` is a COUNT OF DAYS, and `rainfall/wet_days` is a
# count of days too. Reading the unit off the variable labels both of those with
# the variable's own unit, which is how a frost count reaches a reader as
# "12 C" and a wet-day count as "9 mm". Same shape as the rainfall `cv_units`
# trap: a number whose unit is inherited rather than stated.
#
# Three kinds of band live here and they are NOT interchangeable:
#   * counts — how many days in the period met a condition;
#   * day-of-month INDICES — which day it happened on, 1..31. "Day 27" is not
#     "27 days", and a reader who adds them up is wrong in a way no error will
#     catch;
#   * days since the archive epoch — `all_time_*_day`, folded across the whole
#     record by `run_history.EPOCH`, which is 1986-01-01 and is also written
#     into the manifest as `date_epoch`.
#
# `sd` deliberately keeps the variable's unit: a dispersion in degrees IS in
# degrees. So do `wet_top1..K`, which are rainfall depths in mm and not counts —
# the same distinction `run_history.INTEGER_BANDS` draws for LERC tolerance.
STATISTIC_UNITS: dict[str, str] = {
    "frost_days": "days",
    "wet_days": "days",
    "days_over_25": "days",
    "days_over_30": "days",
    "days_over_10mm": "days",
    "days_over_25mm": "days",
    "max_dry_spell": "days",
    "argmin_day": "day of month",
    "argmax_day": "day of month",
    "first_frost_day": "day of month",
    "last_frost_day": "day of month",
    "all_time_max_day": "days since 1986-01-01",
    "all_time_min_day": "days since 1986-01-01",
}

# Units whose values are whole numbers. A count of 12.4 days is not a count, and
# a fractional day-of-month index is not a date. Clients round on this rather
# than on a list of statistic names, so a band added here needs no client change.
INTEGER_UNITS = frozenset({"days", "day of month", "days since 1986-01-01"})


def unit_for(variable: str, statistic: Optional[str]) -> Optional[str]:
    """The unit of the BAND, which is not always the unit of the variable.

    Statistic first: a count is days whatever it was counted from. Falls back to
    the variable's own unit, which is right for `mean`, `min`, `max`, `sd`, the
    ranked wet-day depths and the degree-day accumulations.
    """
    stat = statistic or "mean"
    if stat in STATISTIC_UNITS:
        return STATISTIC_UNITS[stat]
    return UNITS.get(variable)


# --- GDAL environment -------------------------------------------------------

def _configure_proj() -> None:
    """Point PROJ and GDAL at rasterio's own data, not another install's.

    Development workstations here have a PostGIS 3.5 install that sets
    machine-level `PROJ_LIB` / `GDAL_DATA`. Those win over rasterio's bundled
    copies and the PostGIS `proj.db` is an older schema, so every CRS lookup
    fails::

        PROJ: proj_create_from_database: ...postgis-3.5\\proj\\proj.db contains
        DATABASE.LAYOUT.VERSION.MINOR = 2 whereas a number >= 6 is expected.

    On the write path this fails as a GDAL *log line* and produces a COG with no
    usable spatial reference; here it raises outright from `WarpedVRT`, because
    reprojecting to EPSG:3857 needs the database. Either way the fix is the
    same, and it mirrors `scripts/interpolation/raster._configure_proj`.

    EB is unaffected — no PostGIS on the instance — but the override is
    unconditional so a run cannot silently depend on how the shell was launched.
    Set `AUXEIN_KEEP_PROJ_ENV=1` to keep the system PROJ deliberately.
    """
    if os.environ.get("AUXEIN_KEEP_PROJ_ENV"):
        return
    try:
        import rasterio
    except ImportError:
        return
    base = os.path.dirname(rasterio.__file__)
    for var, sub in (("PROJ_LIB", "proj_data"), ("PROJ_DATA", "proj_data"),
                     ("GDAL_DATA", "gdal_data")):
        bundled = os.path.join(base, sub)
        if os.path.isdir(bundled) and os.environ.get(var) != bundled:
            os.environ[var] = bundled


def gdal_env():
    """rasterio.Env configured for reading COGs out of a private bucket.

    `GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR` is the load-bearing one: without it
    GDAL lists the object's whole prefix on every open, looking for sidecars, so
    each tile costs an extra LIST against a bucket with 19,624 objects in it.
    Credentials come from the EC2 instance profile on EB and from the shared
    credentials file on a workstation; neither is named here.
    """
    _configure_proj()
    import rasterio
    return rasterio.Env(
        AWS_REGION=AWS_REGION,
        GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
        CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
        GDAL_HTTP_MAX_RETRY="3",
        GDAL_HTTP_RETRY_DELAY="1",
        VSI_CACHE=True,
        VSI_CACHE_SIZE=int(os.getenv("SURFACE_VSI_CACHE_BYTES", str(64 * 1024 * 1024))),
    )


def object_url(s3_key: str) -> str:
    """GDAL virtual path, or a local file when SURFACE_LOCAL_ROOT is set.

    The local escape hatch exists for offline development against the mirror in
    `scratchpad/climate_history/bucket/`, which is byte-identical to the bucket.
    """
    local_root = os.getenv("SURFACE_LOCAL_ROOT")
    if local_root:
        return os.path.join(local_root, s3_key.replace("/", os.sep))
    return f"/vsis3/{BUCKET}/{s3_key}"


# --- index queries ----------------------------------------------------------

def _valid_at_for(granularity: str, when: str) -> datetime:
    """Parse the contract's `valid_at` for a granularity.

    Monthly surfaces are keyed on the first instant of the month, so both
    '2020-01' and '2020-01-17' resolve to the same object — a caller holding a
    day inside the month gets the month that contains it rather than a 404.
    """
    if granularity == "monthly":
        parts = when.split("-")
        if len(parts) < 2:
            raise ValueError(f"monthly valid_at must be YYYY-MM, got {when!r}")
        return datetime(int(parts[0]), int(parts[1]), 1, tzinfo=timezone.utc)
    if granularity == "season":
        # Season surfaces are accumulations, stamped at the END of the month
        # they accumulate through — 'cumulative through October' is a state
        # reached on the 31st. Callers still address them as YYYY-MM; the
        # end-of-month form is an index detail, not part of the URL.
        parts = when.split("-")
        if len(parts) < 2:
            raise ValueError(f"season valid_at must be YYYY-MM, got {when!r}")
        year, month = int(parts[0]), int(parts[1])
        return datetime(year, month, monthrange(year, month)[1],
                        tzinfo=timezone.utc)
    if granularity == "records":
        # There is exactly one records surface per (variable, statistic); the
        # caller does not need to know its end date.
        raise ValueError("records surfaces are resolved without a valid_at")
    parsed = datetime.fromisoformat(when)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def resolve(db: Session, variable: str, granularity: str,
            statistic: Optional[str], valid_at: Optional[str]) -> dict:
    """One indexed surface, or SurfaceNotFound. Never invents a row."""
    # Deliberately the same error as an absent surface. A withheld band should
    # not advertise itself by returning a distinguishable refusal, and every
    # read path (tiles, probe, point) reaches the archive through here.
    if statistic and (variable, statistic) in WITHHELD_STATISTICS:
        raise SurfaceNotFound(f"no {variable}/{statistic} surface")
    params: dict = {"variable": variable, "granularity": granularity}
    where = ["variable = :variable", "granularity = :granularity",
             "status <> 'failed'"]

    if granularity in STATISTIC_KEYED:
        if not statistic:
            raise ValueError(f"{granularity} surfaces require a statistic")
        where.append("statistic = :statistic")
        params["statistic"] = statistic
    else:
        where.append("statistic IS NULL")

    if granularity != "records":
        if not valid_at:
            raise ValueError("valid_at is required")
        where.append("valid_at = :valid_at")
        params["valid_at"] = _valid_at_for(granularity, valid_at)

    sql = text(f"""
        SELECT variable, granularity, statistic, valid_at, period_start,
               resolution_m, model_version, engine, s3_key,
               n_stations_fit, n_stations_test, cv_rmse, cv_rmse_max, cv_units,
               edf, edf_frac, status
        FROM surface_run
        WHERE {' AND '.join(where)}
        -- Highest resolution wins when an era overlaps: the contract allows a
        -- 5 km historical surface and a 500 m recompute to coexist for a date.
        ORDER BY resolution_m ASC, model_version DESC
        LIMIT 1
    """)
    row = db.execute(sql, params).mappings().first()
    if row is None:
        raise SurfaceNotFound(
            f"no {variable}/{granularity}"
            f"{'/' + statistic if statistic else ''} surface for {valid_at}")
    return dict(row)


def statistics_for(db: Session, variable: str, granularity: str) -> list[str]:
    rows = db.execute(text("""
        SELECT DISTINCT statistic FROM surface_run
        WHERE variable = :v AND granularity = :g AND statistic IS NOT NULL
        ORDER BY statistic
    """), {"v": variable, "g": granularity}).scalars().all()
    return [r for r in rows
            if r and (variable, r) not in WITHHELD_STATISTICS]


def variables_for(db: Session) -> list[dict]:
    rows = db.execute(text("""
        SELECT variable, granularity, count(*) AS n,
               min(valid_at) AS first, max(valid_at) AS last
        FROM surface_run WHERE status <> 'failed'
        GROUP BY variable, granularity ORDER BY variable, granularity
    """)).mappings().all()
    return [dict(r) for r in rows]


def availability(db: Session, variable: str, granularity: str,
                 statistic: Optional[str]) -> dict:
    """First/last covered date and the interior holes. Contract §5.3.

    **Gap endpoints are EXCLUSIVE.** A gap is emitted as
    `{last_available}/{next_available}`, so both endpoints DO have surfaces and
    only the interior is missing. The frontend already implements it that way
    (`surfaceService.parseGaps`); emitting inclusive intervals here would grey
    out two good months per hole with no error anywhere.
    """
    if statistic and (variable, statistic) in WITHHELD_STATISTICS:
        return {"variable": variable, "granularity": granularity,
                "statistic": statistic, "first": None, "last": None,
                "count": 0, "gaps": [], "resolutions": [], "steps": [],
                "unit": unit_for(variable, statistic),
                "contract_version": CONTRACT_VERSION}
    params: dict = {"v": variable, "g": granularity}
    where = ["variable = :v", "granularity = :g", "status <> 'failed'"]
    if statistic:
        where.append("statistic = :s")
        params["s"] = statistic

    # cv_rmse per timestep comes back with the timestep, so a scrubber can show
    # the confidence of the month on screen without a request per month. It is
    # ~456 small numbers for the whole archive.
    rows = db.execute(text(f"""
        SELECT valid_at, min(resolution_m) AS resolution_m,
               max(cv_rmse) AS cv_rmse, max(cv_rmse_max) AS cv_rmse_max,
               min(cv_units) AS cv_units, min(period_start) AS period_start
        FROM surface_run WHERE {' AND '.join(where)}
        GROUP BY valid_at ORDER BY valid_at
    """), params).mappings().all()

    if not rows:
        return {"variable": variable, "granularity": granularity,
                "statistic": statistic, "first": None, "last": None,
                "count": 0, "gaps": [], "resolutions": [], "steps": [],
                "contract_version": CONTRACT_VERSION}

    stamps = [r["valid_at"] for r in rows]
    resolutions = sorted({int(r["resolution_m"]) for r in rows})

    gaps: list[str] = []
    if granularity == "monthly":
        def _key(d: datetime) -> int:
            return d.year * 12 + (d.month - 1)
        for prev, nxt in zip(stamps, stamps[1:]):
            if _key(nxt) - _key(prev) > 1:
                gaps.append(f"{prev.date().isoformat()}/{nxt.date().isoformat()}")
    elif granularity in ("daily", "hourly"):
        step = timedelta(days=1) if granularity == "daily" else timedelta(hours=1)
        for prev, nxt in zip(stamps, stamps[1:]):
            if nxt - prev > step:
                gaps.append(f"{prev.date().isoformat()}/{nxt.date().isoformat()}")
    # `season` emits NO gaps on purpose. The series runs Sep-Apr and then jumps
    # to the next September, so calendar-month logic would report May-August as
    # a hole in every one of the 37 seasons. The winter is not missing data; it
    # is not part of a growing season.

    # One entry per timestep. `cv_rmse` is in `cv_units`, which for rainfall is
    # 'ratio' and NOT millimetres — a consumer that ignores the unit will render
    # 0.0025 mm and imply micron-scale accuracy.
    steps = [{
        # Season steps are stamped at month END in the index but addressed as
        # YYYY-MM, the same as monthly — a client should not have to know which
        # end of the month a surface was filed under to build a tile URL.
        "valid_at": (r["valid_at"].strftime("%Y-%m")
                     if granularity in ("monthly", "season")
                     else r["valid_at"].date().isoformat()),
        "resolution_m": int(r["resolution_m"]),
        "cv_rmse": r["cv_rmse"],
        "cv_rmse_max": r["cv_rmse_max"],
        "cv_units": r["cv_units"],
        # Which growing season this step accumulates into. Derived from the
        # stored `period_start` (September of the year before the vintage)
        # rather than from the step's own month, so the Sep-Apr rule lives in
        # the producer and is not restated by every consumer that wants to
        # group a series by season.
        **({"season": r["period_start"].year + 1}
           if granularity == "season" and r["period_start"] else {}),
    } for r in rows]

    return {
        "variable": variable,
        "granularity": granularity,
        "statistic": statistic,
        "first": stamps[0].date().isoformat(),
        "last": stamps[-1].date().isoformat(),
        "count": len(stamps),
        "gaps": gaps,
        "resolutions": resolutions,
        "steps": steps,
        # The BAND's unit, not the variable's: a `frost_days` catalogue that
        # says 'C' is the same defect as a popup that says it. See unit_for.
        "unit": unit_for(variable, statistic),
        "contract_version": CONTRACT_VERSION,
    }


# --- raster reads -----------------------------------------------------------

def _merc_bounds(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    """Web-mercator bounds of a slippy tile, in EPSG:3857 metres."""
    span = 20037508.342789244
    size = 2 * span / (2 ** z)
    west = -span + x * size
    east = west + size
    north = span - y * size
    south = north - size
    return west, south, east, north


def render_tile(s3_key: str, z: int, x: int, y: int, ramp: str,
                vmin: float, vmax: float) -> bytes:
    """One 256 px RGBA PNG tile, reprojected to web mercator.

    Reprojection is real, via WarpedVRT to EPSG:3857, rather than reading a
    lat/lon window and squeezing it into a square. Our rasters are geographic,
    and mercator's y-stretch is ~35% at NZ latitudes — squeezing puts the
    coastline visibly off the basemap at low zoom, which is exactly where the
    whole country is in one tile and the error is most obvious.
    """
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.vrt import WarpedVRT
    from rasterio.windows import Window, from_bounds

    west, south, east, north = _merc_bounds(z, x, y)

    values = np.full((TILE_PX, TILE_PX), np.nan, dtype=np.float32)

    with gdal_env():
        with rasterio.open(object_url(s3_key)) as src:
            nodata = src.nodata
            with WarpedVRT(src, crs="EPSG:3857",
                           resampling=Resampling.bilinear,
                           src_nodata=nodata, nodata=nodata) as vrt:
                window = from_bounds(west, south, east, north, vrt.transform)
                full = Window(0, 0, vrt.width, vrt.height)
                # WarpedVRT forbids boundless reads, so clip to the raster and
                # paste back at the right offset. A plain `reproject` would
                # avoid the arithmetic but reads the WHOLE source per tile —
                # 2856 x 2667 pulled from S3 for a 256 px output — which throws
                # away the entire point of a Cloud Optimized GeoTIFF.
                try:
                    inner = window.intersection(full)
                except Exception:                                  # noqa: BLE001
                    inner = None

                if inner is not None and inner.width > 0 and inner.height > 0:
                    scale_x = TILE_PX / window.width
                    scale_y = TILE_PX / window.height
                    col = int(round((inner.col_off - window.col_off) * scale_x))
                    row = int(round((inner.row_off - window.row_off) * scale_y))
                    out_w = max(1, min(TILE_PX - col, int(round(inner.width * scale_x))))
                    out_h = max(1, min(TILE_PX - row, int(round(inner.height * scale_y))))

                    if out_w > 0 and out_h > 0 and col < TILE_PX and row < TILE_PX:
                        # `masked=True` keeps nodata out of the bilinear average,
                        # so the coastline stays a hard edge instead of bleeding
                        # -9999 inland as a band of impossibly cold cells.
                        data = vrt.read(1, window=inner,
                                        out_shape=(out_h, out_w),
                                        resampling=Resampling.bilinear,
                                        masked=True)
                        patch = np.ma.filled(data.astype(np.float32), np.nan)
                        values[row:row + out_h, col:col + out_w] = patch

    valid = ~np.isnan(values)
    if nodata is not None:
        valid &= values != nodata

    span = (vmax - vmin) or 1.0
    scaled = np.clip((np.nan_to_num(values, nan=vmin) - vmin) / span, 0.0, 1.0)

    # Interpolate against declared stop POSITIONS, not stop index, so a ramp can
    # be front-loaded for a skewed variable. The legend is drawn from the same
    # two arrays (`/available.meta.domain`), so the two cannot drift apart.
    stops = np.array(RAMPS.get(ramp, RAMPS["viridis"]), dtype=float)
    pos = np.array(ramp_positions(ramp), dtype=float)
    rgb = np.empty(scaled.shape + (3,), dtype=np.uint8)
    for channel in range(3):
        rgb[..., channel] = np.interp(scaled, pos, stops[:, channel]).astype(np.uint8)
    alpha = np.where(valid, 255, 0).astype(np.uint8)

    return encode_png(np.dstack([rgb, alpha]))


def sample(s3_key: str, points: Sequence[tuple[float, float]]) -> list[Optional[float]]:
    """Sample a surface at (lon, lat) degrees. Returns None for nodata."""
    import rasterio

    with gdal_env():
        with rasterio.open(object_url(s3_key)) as ds:
            nodata = ds.nodata
            out: list[Optional[float]] = []
            for value in ds.sample(points, indexes=1):
                v = float(value[0])
                # A nodata sample means the point is off the land mask — sea, or
                # outside New Zealand. That is None, never 0.
                if nodata is not None and v == nodata:
                    out.append(None)
                elif v != v:
                    out.append(None)
                else:
                    out.append(v)
    return out


# --- PNG --------------------------------------------------------------------

def encode_png(rgba: np.ndarray) -> bytes:
    """Minimal RGBA PNG encoder — avoids a Pillow round trip for one call."""
    height, width = rgba.shape[:2]
    raw = b"".join(b"\x00" + rgba[i].tobytes() for i in range(height))

    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 6))
            + chunk(b"IEND", b""))
