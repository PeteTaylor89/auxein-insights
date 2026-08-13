"""Reduce a month of daily surfaces into the published monthly statistics.

The history run never writes daily surfaces — at 500 m that would be 142 GB and
an extra nine hours for files nothing reads. Each month's dailies exist as one
in-memory block, get reduced here, and are discarded.

**That makes this module the last point at which daily information exists.**
Anything not computed here cannot be recovered from the published product
without re-running the whole backfill, so the band set is deliberately wider
than the mean/median/min/max that was asked for:

  recoverable from monthly stats later     NOT recoverable
  ------------------------------------     ---------------------------------
  all-time max (max of monthly maxima)     the DATE a record was set
  annual and seasonal means                threshold-day counts
  "wettest month on record"                dry/wet spell lengths
  inter-annual variability                 the date of the last spring frost
  GDD (see `mean` + `sd`, below)           upper-tail rainfall percentiles

`argmax_day` / `argmin_day` are the cheapest of these to get wrong by omission:
without them "the hottest day on record" can report a value but not when it
happened, which is most of the story.

**GDD does not need a band.** Summing `max(0, mean - base)` over months
under-counts, because `max(0, .)` is convex — measured at -20% on cool sites.
But `n * [(mu-B).Phi(z) + sigma.phi(z)]` with `z = (mu-B)/sigma`, i.e. the
normal-tail expectation using the `mean` and `sd` bands, reproduces daily-summed
season GDD to a bias of +0.1 and a p5-p95 of -6.7/+7.4 GDD (validated against
5,092 station-seasons, 1986-2023). `sd` is in `BASE_BANDS` for this reason;
do not drop it.

Full daily percentiles are still NOT computed — exact per-cell percentiles over
13,879 days x 1.43 M cells need a digest per cell. But threshold counts alone do
not answer everything: `r99p` (the 99th percentile of wet-day rainfall) is a
published metric and cannot be derived from counts. `wet_top1..wet_topK` carries
the upper tail exactly, which is the only part of the rainfall distribution
anything asks about, at K bands instead of a digest.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional, Sequence

import numpy as np

logger = logging.getLogger(__name__)

# Thresholds are in the variable's own unit and are part of the published
# product — changing one silently changes the meaning of a band that consumers
# may already have charted, so they are named here rather than passed in.
#
# Keyed BY VARIABLE, because a threshold is only meaningful on the right one.
# FD is `Tmin < 0`, SU25 and TX30 are `Tmax > x`; the same counts taken on
# `temp_mean` are not standard indices and not what the API serves. An earlier
# version applied all three to every `temp*` variable, so the completed
# `temp_mean` and `temp_max` runs carry extra bands that should be ignored —
# `temp_mean/.../frost_days` is days where the daily MEAN went below zero.
FROST_C = 0.0
TEMP_THRESHOLDS = {
    "temp_min": {"frost_days": ("lt", FROST_C)},      # ETCCDI FD
    "temp_max": {"days_over_25": ("gt", 25.0),        # ETCCDI SU25
                 "days_over_30": ("gt", 30.0)},       # ETCCDI TX30 -> API hot_days30
    "temp_mean": {},
}
# Variables for which a sub-zero day is a frost, and so carry the frost-date bands.
FROST_VARIABLES = ("temp_min",)

# Threshold bands are counted on the exact float32 block, BEFORE the surfaces are
# LERC-encoded, so they are right — but the `min`/`max` bands they look like they
# should agree with are lossy to 0.01 degC. Measured on 1986-09 temp_min: 938 of
# 1.43 M cells (0.07%) have `frost_days > 0` while the stored `min` reads >= 0, or
# the reverse, every one of them with |min| < 0.01. Do not cross-validate a count
# band against a value band at the threshold; the count is the authority.

WET_DAY_MM = 1.0                                      # Tait et al. wet-day definition
RAIN_THRESHOLDS = {"wet_days": ("ge", WET_DAY_MM),
                   "days_over_10mm": ("ge", 10.0),
                   "days_over_25mm": ("ge", 25.0)}
DRY_DAY_MM = WET_DAY_MM                               # a dry day is simply not a wet one
# How many of the month's largest daily falls to keep. A Sep-Apr season has
# ~60-90 wet days, so its 99th percentile is the 1st or 2nd largest and 5 per
# month determines it exactly; pooled over a 20-year baseline (~1,400 wet days)
# the 99th percentile is the 14th largest, and 5/month over 160 months covers
# that many times over.
WET_TOP_K = 5

BASE_BANDS = ("mean", "median", "min", "max", "sd", "argmin_day", "argmax_day")


@dataclass
class MonthlyResult:
    bands: dict                       # name -> (n_cells,) float32
    n_days: int                       # days actually fitted and included
    day_numbers: np.ndarray           # day-of-month for each column of the block
    dry_run_carry_out: Optional[int] = None   # trailing dry-run length, for chaining

    def band_names(self) -> list:
        return list(self.bands)


def _threshold_count(block: np.ndarray, op: str, value: float) -> np.ndarray:
    if op == "lt":
        m = block < value
    elif op == "gt":
        m = block > value
    elif op == "ge":
        m = block >= value
    else:
        raise ValueError(f"unknown threshold op {op!r}")
    return m.sum(axis=1, dtype=np.float32)


def _frost_dates(block: np.ndarray, day_numbers: np.ndarray) -> tuple:
    """Day-of-month of the first and last sub-zero day, or **0 for no frost**.

    `argmin_day` is not this: it is the day of the month's *coldest* reading,
    which in a frost-free month still points at some day. The API's
    `last_frost_doy` needs the last *crossing* of zero, and a monthly frost
    COUNT cannot give it — a September with three frost days locates the last
    one only to within the month, which is useless for spring-frost risk.

    Day-of-month is 1-31, so 0 is unambiguous as "no frost". Both loops are
    order-independent (min/max rather than first/last write), so they do not
    assume `day_numbers` is sorted.
    """
    n_cells = block.shape[0]
    first = np.full(n_cells, np.inf, dtype=np.float32)
    last = np.zeros(n_cells, dtype=np.float32)
    for j in range(block.shape[1]):
        frost = block[:, j] < FROST_C
        d = np.float32(day_numbers[j])
        np.minimum(first, d, out=first, where=frost)
        np.maximum(last, d, out=last, where=frost)
    first[np.isinf(first)] = 0.0
    return first, last


def _wet_day_tail(block: np.ndarray) -> list:
    """The `WET_TOP_K` largest daily falls per cell, descending, 0-padded.

    Entries below `WET_DAY_MM` are zeroed, so a month with fewer than K wet days
    is self-describing rather than trailing off into dry-day noise. `wet_top1`
    duplicates the `max` band whenever the month had any wet day at all; the
    redundancy is kept so the tail is usable without cross-referencing.
    """
    n_cells, n_days = block.shape
    ordered = np.sort(block, axis=1)[:, ::-1]
    out = []
    for i in range(WET_TOP_K):
        if i < n_days:
            col = np.array(ordered[:, i], dtype=np.float32)
            col[col < WET_DAY_MM] = 0.0
        else:
            col = np.zeros(n_cells, dtype=np.float32)
        out.append(col)
    return out


def monthly_stats(
    block: np.ndarray,
    variable: str,
    day_numbers: Sequence[int],
    *,
    dry_run_carry_in: int = 0,
) -> MonthlyResult:
    """Reduce `(n_cells, n_days)` of daily values into the published bands.

    `day_numbers[j]` is the day-of-month of column j. Columns are only the days
    that were actually fitted, so a month with an unfittable day (fewer than four
    reporting stations) has fewer columns than it has days — which is why
    `argmax_day` indexes through `day_numbers` rather than adding one to an
    array position.

    `dry_run_carry_in` is the length of the dry spell running at the end of the
    previous month, so `max_dry_spell` is not silently truncated at month
    boundaries. The driver threads `dry_run_carry_out` into the next call.
    """
    if block.ndim != 2:
        raise ValueError(f"block must be 2-D (cells, days); got {block.shape}")
    n_cells, n_days = block.shape
    day_numbers = np.asarray(day_numbers, dtype=np.int16)
    if len(day_numbers) != n_days:
        raise ValueError(f"day_numbers has {len(day_numbers)} entries for "
                         f"{n_days} columns")
    if n_days == 0:
        raise ValueError("no fitted days in this month")

    b: dict = {}
    b["mean"] = block.mean(axis=1, dtype=np.float64).astype(np.float32)
    b["median"] = np.median(block, axis=1).astype(np.float32)
    b["min"] = block.min(axis=1)
    b["max"] = block.max(axis=1)
    b["sd"] = block.std(axis=1, dtype=np.float64).astype(np.float32)
    # Record dates survive: map the argmin/argmax column back to a day of month.
    b["argmin_day"] = day_numbers[block.argmin(axis=1)].astype(np.float32)
    b["argmax_day"] = day_numbers[block.argmax(axis=1)].astype(np.float32)

    carry_out = None
    if variable.startswith("temp"):
        for name, (op, val) in TEMP_THRESHOLDS.get(variable, {}).items():
            b[name] = _threshold_count(block, op, val)
        if variable in FROST_VARIABLES:
            b["first_frost_day"], b["last_frost_day"] = _frost_dates(block, day_numbers)
    elif variable == "rainfall":
        b["sum"] = block.sum(axis=1, dtype=np.float64).astype(np.float32)
        for name, (op, val) in RAIN_THRESHOLDS.items():
            b[name] = _threshold_count(block, op, val)
        for i, col in enumerate(_wet_day_tail(block), start=1):
            b[f"wet_top{i}"] = col
        # Longest run of days below DRY_DAY_MM, carried across month boundaries.
        run = np.full(n_cells, float(dry_run_carry_in), dtype=np.float32)
        best = run.copy()
        for j in range(n_days):
            dry = block[:, j] < DRY_DAY_MM
            run = np.where(dry, run + 1.0, 0.0)
            np.maximum(best, run, out=best)
        b["max_dry_spell"] = best
        carry_out = int(run.max()) if n_days else dry_run_carry_in
    elif variable == "solar_rad":
        b["sum"] = block.sum(axis=1, dtype=np.float64).astype(np.float32)

    for k, v in b.items():
        b[k] = np.ascontiguousarray(v, dtype=np.float32)

    return MonthlyResult(bands=b, n_days=n_days, day_numbers=day_numbers,
                         dry_run_carry_out=carry_out)


def expected_bands(variable: str) -> tuple:
    """Band names a variable will produce, without running anything."""
    names = list(BASE_BANDS)
    if variable.startswith("temp"):
        names += list(TEMP_THRESHOLDS.get(variable, {}))
        if variable in FROST_VARIABLES:
            names += ["first_frost_day", "last_frost_day"]
    elif variable == "rainfall":
        names += ["sum"] + list(RAIN_THRESHOLDS) + ["max_dry_spell"]
        names += [f"wet_top{i}" for i in range(1, WET_TOP_K + 1)]
    elif variable == "solar_rad":
        names += ["sum"]
    return tuple(names)


class RecordAccumulator:
    """Running all-time extremes across the whole run, per cell.

    Derivable afterwards from the monthly bands, but accumulating here costs one
    comparison per month and means the records layer does not need a second pass
    over 456 monthly files per variable.
    """

    __slots__ = ("max_value", "max_date", "min_value", "min_date", "n_months")

    def __init__(self, n_cells: int):
        self.max_value = np.full(n_cells, -np.inf, dtype=np.float32)
        self.min_value = np.full(n_cells, np.inf, dtype=np.float32)
        # Encoded as YYYYMMDD in a float32? No — float32 cannot hold 8 digits
        # exactly (24-bit mantissa tops out at 16,777,216). Store days since
        # 1986-01-01 instead, which stays exact for ~46,000 years.
        self.max_date = np.zeros(n_cells, dtype=np.int32)
        self.min_date = np.zeros(n_cells, dtype=np.int32)
        self.n_months = 0

    def update(self, result: MonthlyResult, month_start_ordinal: int,
               epoch_ordinal: int) -> None:
        """Fold one month's extremes in. Dates become days since the epoch."""
        hi, lo = result.bands["max"], result.bands["min"]
        hi_day = result.bands["argmax_day"].astype(np.int32)
        lo_day = result.bands["argmin_day"].astype(np.int32)
        base = month_start_ordinal - epoch_ordinal - 1     # day-of-month is 1-based

        newer = hi > self.max_value
        self.max_value = np.where(newer, hi, self.max_value)
        self.max_date = np.where(newer, base + hi_day, self.max_date)

        lower = lo < self.min_value
        self.min_value = np.where(lower, lo, self.min_value)
        self.min_date = np.where(lower, base + lo_day, self.min_date)
        self.n_months += 1

    def bands(self) -> dict:
        return {"all_time_max": self.max_value,
                "all_time_max_day": self.max_date.astype(np.float32),
                "all_time_min": self.min_value,
                "all_time_min_day": self.min_date.astype(np.float32)}
