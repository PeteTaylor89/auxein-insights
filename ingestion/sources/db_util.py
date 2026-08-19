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
    records = _dedupe(records)
    rows = [tuple(r[c] for c in OBS_COLUMNS) for r in records]
    # .connection unwraps the SQLAlchemy Connection to the pooled DBAPI connection,
    # so execute_values gets a real psycopg2 cursor.
    raw = session.connection().connection
    with raw.cursor() as cur:
        execute_values(cur, _UPSERT_SQL, rows, page_size=page_size)
    return len(records)
