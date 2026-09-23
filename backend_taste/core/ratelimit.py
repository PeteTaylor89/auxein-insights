# backend_taste/core/ratelimit.py — a limit that survives a deploy (F4).
#
# Replaces the in-process dicts this service shipped F1 with. Those reset on
# every deploy and were per-worker, so two EB instances gave an attacker two
# budgets and an autoscale event gave them more. A counter in the database the
# instances already share is the smallest thing that is actually a limit.
#
# THE DETAIL THAT MAKES THIS WORK: the counter is written on its OWN connection
# and committed immediately, never on the request's session.
#
# A failed login raises HTTPException. Its session is discarded without a commit,
# so a counter incremented there would be rolled back — and a login limiter that
# only counts SUCCESSFUL logins counts nothing at all. The same is true of any
# limit on an endpoint that rejects, which is most of them.
import logging
from datetime import timedelta
from typing import Optional

from sqlalchemy import text

from db.base import SessionLocal

log = logging.getLogger(__name__)

# One statement, so two instances racing the same bucket cannot both read 3 and
# both write 4. The CASE arms are what make it a fixed WINDOW rather than a
# counter that only ever grows: an expired window resets to 1 in the same
# statement that would otherwise have incremented it.
_HIT = text("""
INSERT INTO taste.rate_limit (bucket, window_start, count)
VALUES (:bucket, now(), 1)
ON CONFLICT (bucket) DO UPDATE
   SET count = CASE
           WHEN taste.rate_limit.window_start < now() - CAST(:window AS interval)
           THEN 1 ELSE taste.rate_limit.count + 1 END,
       window_start = CASE
           WHEN taste.rate_limit.window_start < now() - CAST(:window AS interval)
           THEN now() ELSE taste.rate_limit.window_start END
RETURNING count
""")


def hit(bucket: str, *, limit: int, window: timedelta) -> bool:
    """Record one attempt. True if it is WITHIN the limit, False if over.

    Never raises. A limiter that can 500 turns a database hiccup into an outage
    of the login route, so a failure here fails OPEN and is logged loudly. That
    is a deliberate trade: the alternative, failing closed, locks every user out
    of the product because one table is unavailable.
    """
    session = SessionLocal()
    try:
        count = session.execute(
            _HIT, {"bucket": bucket[:200], "window": f"{int(window.total_seconds())} seconds"}
        ).scalar()
        session.commit()
        return (count or 0) <= limit
    except Exception as exc:  # noqa: BLE001
        session.rollback()
        log.error("rate limiter unavailable for %s: %s", bucket, exc)
        return True
    finally:
        session.close()


def peek(bucket: str, *, window: timedelta) -> int:
    """Current count without recording an attempt. For diagnostics only."""
    session = SessionLocal()
    try:
        row = session.execute(text("""
            SELECT count FROM taste.rate_limit
             WHERE bucket = :bucket AND window_start >= now() - CAST(:window AS interval)
        """), {"bucket": bucket[:200], "window": f"{int(window.total_seconds())} seconds"}).first()
        return row[0] if row else 0
    except Exception:  # noqa: BLE001
        return 0
    finally:
        session.close()


def clear(bucket: str) -> None:
    """Forget a bucket. Called on a SUCCESSFUL login, so a person who mistypes
    their password four times and then gets it right is not still half way to a
    lockout."""
    session = SessionLocal()
    try:
        session.execute(text("DELETE FROM taste.rate_limit WHERE bucket = :bucket"),
                        {"bucket": bucket[:200]})
        session.commit()
    except Exception:  # noqa: BLE001
        session.rollback()
    finally:
        session.close()


def purge_expired(older_than: Optional[timedelta] = None) -> int:
    """Drop rows whose window closed long ago.

    Not called from a request path. The table is keyed by bucket, so it grows
    with distinct attempted emails rather than with traffic — slow, but
    unbounded without this.
    """
    older_than = older_than or timedelta(days=1)
    session = SessionLocal()
    try:
        n = session.execute(text("""
            DELETE FROM taste.rate_limit WHERE window_start < now() - CAST(:age AS interval)
        """), {"age": f"{int(older_than.total_seconds())} seconds"}).rowcount
        session.commit()
        return n or 0
    except Exception:  # noqa: BLE001
        session.rollback()
        return 0
    finally:
        session.close()
