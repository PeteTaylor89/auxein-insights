"""Shared DB helpers for the ingestion sources.

Why this exists: the per-source `insert_data` implementations pass a list of dicts to
`session.execute(text(...), records)`, which psycopg2 turns into an executemany — one
network round-trip PER ROW. Against RDS in Sydney that is ~30-60 ms each, so a single
365-day hourly series (~8,800 rows) takes 5-9 minutes and blows the backfill driver's
per-station timeout. `execute_values` sends the same rows in pages of 1,000, cutting a
full-year series to a couple of seconds.
"""
import math

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


def _finite(value):
    """Reject NaN and +/-inf before they reach the DB.

    `float('NaN')` succeeds, so a Hilltop <I1>NaN</I1> element parses cleanly and
    lands in `weather_data.value` as a real NaN. Postgres then makes it very hard
    to see: `NaN <> NaN` is FALSE under Postgres float ordering (unlike IEEE), so
    the obvious `WHERE value <> value` audit reports zero rows while `avg()` over
    the column returns NaN for the whole source. Horizons put 10 such rows in
    before this guard; one station silently poisoned every wind aggregate.
    """
    return isinstance(value, (int, float)) and math.isfinite(value)


def bulk_upsert_observations(session, records, page_size=1000):
    """Batched equivalent of the per-source INSERT ... ON CONFLICT upsert.

    Takes the same list-of-dicts the sources already build. Runs inside the caller's
    transaction — the caller still owns commit/rollback.
    """
    if not records:
        return 0
    records = [r for r in records if _finite(r['value'])]
    if not records:
        return 0
    rows = [tuple(r[c] for c in OBS_COLUMNS) for r in records]
    # .connection unwraps the SQLAlchemy Connection to the pooled DBAPI connection,
    # so execute_values gets a real psycopg2 cursor.
    raw = session.connection().connection
    with raw.cursor() as cur:
        execute_values(cur, _UPSERT_SQL, rows, page_size=page_size)
    return len(records)
