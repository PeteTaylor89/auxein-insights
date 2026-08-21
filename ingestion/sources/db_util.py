"""Shared DB helpers for the ingestion sources.

Why this exists: the per-source `insert_data` implementations pass a list of dicts to
`session.execute(text(...), records)`, which psycopg2 turns into an executemany — one
network round-trip PER ROW. Against RDS in Sydney that is ~30-60 ms each, so a single
365-day hourly series (~8,800 rows) takes 5-9 minutes and blows the backfill driver's
per-station timeout. `execute_values` sends the same rows in pages of 1,000, cutting a
full-year series to a couple of seconds.
"""
import math
from datetime import timezone

from psycopg2.extras import execute_values

OBS_COLUMNS = ('station_id', 'timestamp', 'variable', 'value', 'unit', 'quality')

_UPSERT_SQL = """
    INSERT INTO weather_data (station_id, timestamp, variable, value, unit, quality)
    VALUES %s
    ON CONFLICT (station_id, timestamp, variable)
    DO UPDATE SET value = EXCLUDED.value,
                  quality = EXCLUDED.quality,
                  created_at = NOW()
"""


# weather_data.value is numeric(10,4): six digits before the point, so anything
# at or above 1e6 cannot be stored and aborts the ENTIRE multi-row statement with
# "numeric field overflow" — one bad reading destroys a whole year-chunk. TDC
# published 214699991.0 as an air temperature on 2026-08-15, which is what found
# this. The bound is deliberately a STORAGE limit, not a plausibility one: no real
# reading of any variable we carry approaches it (solar ~1400 W/m2, pressure ~1030
# hPa), so it cannot silently discard good data the way a per-variable range would.
VALUE_ABS_MAX = 1e6


# Physical plausibility, per variable. The ingest half of LIVE_SURFACES_DISCOVERY
# §5 Phase 0.1.
#
# VALUE_ABS_MAX above is a STORAGE bound and cannot see the difference between a
# reading and a telemetry no-data sentinel. -100, -7999 and -9999 all store fine,
# and they were reaching `weather_data_daily`: 63 station-days at or below -30 degC
# (worst -6,999), 35 above 45 degC (worst +278.1), 30 rainfall days above 700 mm
# (worst 232,036 mm). The counts read as noise in a row count, which is exactly the
# danger — ONE of them destroys a whole day's national TPS fit, and GCV accommodates
# an outlier rather than rejecting it.
#
# `variable` is known here and this is the single funnel for 14 of 17 sources, so
# the gate lives here rather than being copied into each one. ecan_air.py keeps its
# own copy deliberately: it screens at parse time, before a record is even built.
#
# Bounds reject the impossible and nothing else. NZ's record low is -25.6 degC
# (Ranfurly 1903), its record high 42.4 degC (Rangiora 1973), and the 1986-2023
# rainfall archive's daily maximum is 691.8 mm. A variable absent from this map is
# unconstrained, which is the safe default for one whose range we have not measured.
VARIABLE_RANGES = {
    'temp': (-30.0, 45.0),
    'temperature': (-30.0, 45.0),
    'air_temperature': (-30.0, 45.0),
    'soil_temp': (-30.0, 60.0),
    'dewpoint': (-40.0, 40.0),
    'rainfall': (0.0, 750.0),
    'precipitation': (0.0, 750.0),
    'rh': (0.0, 100.0),
    'humidity': (0.0, 100.0),
    'solar_radiation': (0.0, 1500.0),
    'wind_speed': (0.0, 75.0),
    'wind_gust': (0.0, 90.0),
    'wind_direction': (0.0, 360.0),
    'pressure': (800.0, 1100.0),
    'pressure_msl': (800.0, 1100.0),
    'soil_moisture_vwc': (0.0, 100.0),
}


# How far outside its range a value may sit and still be INSTRUMENT DRIFT rather
# than a sentinel. Inside the tolerance the value is snapped to the bound; beyond
# it the record is rejected.
#
# This distinction is not decoration — measured against 2026 raw, a plain reject
# gate discards 5.52% of all solar_radiation, and every one of those 19,930 rows
# sits between -9.31 and 0.00 W/m2 with NONE below -20. That is the nighttime
# thermal offset of a pyranometer: the dome radiates to a cold sky and the
# thermopile reads slightly negative. It is real behaviour of a working
# instrument, and zero is the physically correct value. The daily table's
# -12,085 "sentinel" is a SUM of a day of those small offsets, not one bad point.
#
# RH splits the same way and proves the shape is general: 678 rows in 100-110%
# (supersaturation drift near saturation, snap to 100) against 992 rows at exactly
# -100.00 (a Hilltop no-data sentinel, reject). One tolerance separates them.
#
# Rainfall gets a deliberately tight tolerance. Its single 2026 negative is
# -6.87 mm, which is a gauge reset or an accumulator rolling over, NOT rounding
# noise, and inventing a 0 for it would hide a fault worth seeing.
VARIABLE_CLAMPS = {
    'solar_radiation': (20.0, 0.0),
    'rh': (5.0, 10.0),
    'humidity': (5.0, 10.0),
    'rainfall': (0.2, 0.0),
    'precipitation': (0.2, 0.0),
}


def _screen(record):
    """Return the value to store, or None to reject the record.

    A value inside the range passes through unchanged. A value outside it by no
    more than the variable's clamp tolerance is snapped to the bound it crossed.
    Anything further out is rejected.
    """
    lo, hi = VARIABLE_RANGES.get(record['variable'], (None, None))
    value = record['value']
    if lo is None:
        return value
    if lo <= value <= hi:
        return value
    lo_tol, hi_tol = VARIABLE_CLAMPS.get(record['variable'], (0.0, 0.0))
    if lo - lo_tol <= value < lo:
        return lo
    if hi < value <= hi + hi_tol:
        return hi
    return None


def _finite(value):
    """Reject NaN and +/-inf before they reach the DB.

    `float('NaN')` succeeds, so a Hilltop <I1>NaN</I1> element parses cleanly and
    lands in `weather_data.value` as a real NaN. Postgres then makes it very hard
    to see: `NaN <> NaN` is FALSE under Postgres float ordering (unlike IEEE), so
    the obvious `WHERE value <> value` audit reports zero rows while `avg()` over
    the column returns NaN for the whole source. Horizons put 10 such rows in
    before this guard; one station silently poisoned every wind aggregate.
    """
    return (isinstance(value, (int, float)) and math.isfinite(value)
            and abs(value) < VALUE_ABS_MAX)



def _dedupe(records):
    """Collapse repeated (station_id, timestamp, variable) keys, keeping the last.

    Postgres refuses `ON CONFLICT DO UPDATE` when one statement proposes the same
    conflict key twice — "cannot affect row a second time" — and `execute_values`
    sends a whole year-chunk as ONE statement. So a single duplicated key aborts
    the entire chunk, and the source's insert_data catches it, prints, and returns
    0. The 2026-08-19 temperature re-backfill lost every year that way while
    reporting success.

    The duplicate is real and unavoidable, not a source bug: at the NZ spring-forward
    the local hour 02:00-03:00 does not exist, and `datetime.replace(tzinfo=ZoneInfo)`
    maps both 02:00 NZST (+12) and 03:00 NZDT (+13) onto the same UTC instant.
    Hilltop publishes both, so one point per station per year collides — 2023 hit
    2023-09-23 14:00Z.

    Keeping the last is arbitrary between two readings an hour apart on one day a
    year. That is a bounded, documented imprecision; silently discarding the year
    was not.
    """
    seen = {}
    for r in records:
        seen[(r['station_id'], _utc_key(r['timestamp']), r['variable'])] = r
    return list(seen.values())


def _utc_key(ts):
    """Normalise a timestamp to the UTC instant Postgres will actually store.

    Keying on the datetime itself does NOT work, and the reason is worth stating:
    two aware datetimes sharing one tzinfo compare by WALL CLOCK, not by instant.
    Python skips the offset when `a.tzinfo is b.tzinfo`. At the spring-forward the
    two colliding points are 02:00+12:00 and 03:00+13:00 with the same ZoneInfo, so

        a == b     -> False      (02:00 != 03:00, offsets never consulted)
        hash(a)    == hash(b)    (hashing DOES normalise to UTC)

    They land in the same dict bucket, compare unequal, and both survive — while
    `timestamptz` stores both as 2023-09-23 14:00Z and the upsert sees one row
    twice. Converting explicitly is the only key that matches Postgres.
    """
    return ts.astimezone(timezone.utc) if ts.tzinfo is not None else ts

def screen_records(records):
    """Apply the physical-range gate to a list of observation dicts.

    Public because three sources — synop, harvest, noaa — do not go through
    `bulk_upsert_observations`. SYNOP writes a wider column set (source,
    quality_flags, quality_rank) and NOAA writes daily rows as well as hourly, so
    they cannot share the upsert itself; there is no reason for them to skip the
    screen too. Sentinels are not a per-source phenomenon.

    Returns the kept records, with clamped values already substituted.
    """
    kept, rejected, clamped = [], {}, {}
    for r in records:
        screened = _screen(r)
        if screened is None:
            rejected.setdefault(r['variable'], []).append(r['value'])
            continue
        if screened != r['value']:
            clamped.setdefault(r['variable'], []).append(r['value'])
            r = dict(r, value=screened)
        kept.append(r)
    # Print, don't log. `ingestion_log` records a run-level SUCCESS/FAILED and is
    # structurally blind to "fetched fine, discarded 144 rows" — three silent
    # outages were found in one day that way. Anything reporting discarded or
    # altered data has to reach the run output. Clamps are reported as loudly as
    # rejections: quietly rewriting a reading is its own invisible-data problem.
    for variable, values in sorted(rejected.items()):
        lo, hi = VARIABLE_RANGES[variable]
        print(f"      {len(values)} {variable} value(s) outside {lo}..{hi} "
              f"REJECTED (min {min(values):g}, max {max(values):g})")
    for variable, values in sorted(clamped.items()):
        print(f"      {len(values)} {variable} value(s) clamped to bound "
              f"(min {min(values):g}, max {max(values):g})")
    return kept


# weather_data_daily column -> the raw variable whose range governs it. Used by
# the one source that writes daily rows directly (NOAA GHCN-Daily) rather than
# being aggregated up from raw observations.
DAILY_COLUMN_VARIABLES = {
    'temp_min': 'temp',
    'temp_max': 'temp',
    'temp_mean': 'temp',
    'rainfall_mm': 'rainfall',
    'solar_radiation': 'solar_radiation',
    'humidity_min': 'rh',
    'humidity_max': 'rh',
    'humidity_mean': 'rh',
}


def screen_daily_rows(rows):
    """Apply the same physical-range gate to pre-aggregated daily rows.

    A failing column is set to None rather than the row being dropped: a bad
    rainfall total is no reason to discard that day's temperatures, and the
    daily table is explicitly nullable per column.

    A row left with no usable measurement at all is dropped, since
    `weather_data_daily` gains nothing from a row of NULLs and it would read as
    "station reported" to every downstream count.
    """
    kept, dropped = [], {}
    for row in rows:
        out = dict(row)
        for column, variable in DAILY_COLUMN_VARIABLES.items():
            value = out.get(column)
            if value is None:
                continue
            screened = _screen({'variable': variable, 'value': value})
            if screened is None:
                dropped.setdefault(column, []).append(value)
                out[column] = None
            elif screened != value:
                out[column] = screened
        if any(out.get(c) is not None for c in DAILY_COLUMN_VARIABLES):
            kept.append(out)
    for column, values in sorted(dropped.items()):
        print(f"      {len(values)} daily {column} value(s) out of range, "
              f"nulled (min {min(values):g}, max {max(values):g})")
    return kept


def bulk_upsert_observations(session, records, page_size=1000):
    """Batched equivalent of the per-source INSERT ... ON CONFLICT upsert.

    Takes the same list-of-dicts the sources already build. Runs inside the caller's
    transaction — the caller still owns commit/rollback.
    """
    if not records:
        return 0
    n_in = len(records)
    records = [r for r in records if _finite(r['value'])]
    if len(records) != n_in:
        # Say so. A value silently vanishing is how bad data becomes invisible data.
        print(f"      {n_in - len(records)} unstorable value(s) dropped "
              f"(non-finite or |value| >= {VALUE_ABS_MAX:g})")
    if not records:
        return 0
    n_finite = len(records)
    records = screen_records(records)
    if not records:
        print(f"      all {n_finite} record(s) rejected as out of range")
        return 0
    records = _dedupe(records)
    rows = [tuple(r[c] for c in OBS_COLUMNS) for r in records]
    # .connection unwraps the SQLAlchemy Connection to the pooled DBAPI connection,
    # so execute_values gets a real psycopg2 cursor.
    raw = session.connection().connection
    with raw.cursor() as cur:
        execute_values(cur, _UPSERT_SQL, rows, page_size=page_size)
    return len(records)
