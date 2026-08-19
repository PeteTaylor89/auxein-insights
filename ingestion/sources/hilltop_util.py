"""Shared Hilltop GetData aggregation semantics.

**Never send `Interval` without `Method`.** That single omission cost seven
councils their entire 2020-2026 temperature record.

Hilltop given `Interval` and no `Method` does not aggregate the interval. It
returns the *instantaneous value at the interval boundary* — so `Interval=1 day`
on air temperature yields the temperature at midnight, not the daily mean, and
certainly not a min or a max. Every driver requested it that way, the daily
rollup dutifully took MIN/MAX/AVG of that one value, and `temp_min`, `temp_max`
and `temp_mean` came out identical on 177,536 station-days. Measured against the
councils' own native record the stored values ran Tmax 7.4 degC low and GDD10 32
percent low. See `docs/Bugs/Current/HILLTOP_TEMPERATURE_DEGENERATE_2026-08-19.md`.

Two rules follow, and this module exists so they are stated once rather than
seven times:

1. **Native is the default.** Omitting `Interval` returns the series at its
   recording resolution, which is what a daily min/max actually needs. It is not
   slower — a year of HBRC temperature is 0.2s native against 0.7s at
   `Interval=1 hour`, same 445 KB — because Hilltop is resampling either way.
2. **An explicit `Interval` gets an explicit `Method`.** Which method depends on
   whether the quantity accumulates over the interval or is sampled at an instant.

A note on why this is not merely a taste question for rainfall: Hilltop *does*
default to totalling a cumulative series, so the missing `Method=Total` did not
corrupt the rainfall values. But an `Interval` bin is labelled at the END of the
interval, so a `1 day` rainfall row stamped date D holds the rain that fell on
D-1. `Method=Total` does not fix that — it is inherent to interval binning.
Fetching native and letting `daily_aggregation` bin by NZ-local day avoids it.
"""

# Canonical variables that ACCUMULATE across an interval, so an interval query
# must total them rather than sample them. Everything else is an instantaneous
# reading (temperature, humidity, pressure, wind, soil, solar flux density) and
# is averaged. Keyed on the canonical variable, not the council's measurement
# name, because every council spells those differently.
CUMULATIVE_VARIABLES = frozenset({
    'rainfall',
    'evapotranspiration',
})

METHOD_CUMULATIVE = 'Total'
METHOD_INSTANTANEOUS = 'Average'


def canonical_variable(measurement: str, measurement_map: dict):
    """Canonical variable code for a council measurement name, or None.

    Tolerates both map shapes in use: `(variable, unit)` and
    `(variable, unit, scale)`.
    """
    entry = measurement_map.get(measurement)
    if not entry:
        return None
    return entry[0]


def aggregation_query(measurement: str, measurement_map: dict, interval, quote) -> str:
    """Build the `&Interval=...&Method=...` fragment for a GetData URL.

    Returns an empty string when `interval` is falsy — that is the native-
    resolution request, and the correct default. When an interval IS given, a
    `Method` always accompanies it; there is no code path that emits one without
    the other.

    `quote` is passed in rather than imported so the caller keeps using the same
    urllib quoting it already builds the rest of the URL with (Hilltop does not
    decode `+`, so these URLs are assembled by hand with %20).
    """
    if not interval:
        return ""

    variable = canonical_variable(measurement, measurement_map)
    method = (METHOD_CUMULATIVE if variable in CUMULATIVE_VARIABLES
              else METHOD_INSTANTANEOUS)
    return f"&Interval={quote(interval)}&Method={method}"
