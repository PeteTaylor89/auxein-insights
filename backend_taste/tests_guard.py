"""A refusal to run destructive test fixtures against a database that matters.

WHY THIS EXISTS: the suites in this directory TRUNCATE tables and delete rows to
get a known starting state. Run against a scratch database that is correct and
necessary. Run against the local dev database it silently destroys seeded data —
which is exactly what happened on 2026-09-21, when a fixture's
`DELETE FROM taste.templates WHERE id <> 'tpl-builtin'` removed both seeded
builtin grids from the dev database and the only sign was one unrelated
assertion failing.

So the fixtures now ask permission from the database name. A name containing
"test" or "scratch" is assumed disposable; anything else has to be opted into
out loud with TASTE_TEST_DB_OK=1.
"""
import os
import sys


def require_scratch_db(url: str) -> None:
    """Abort unless `url` names a database that is safe to truncate."""
    name = (url or "").rsplit("/", 1)[-1].split("?")[0].lower()

    # A dev box can run with ENV=staging against the shared RDS (config.py), so
    # the name check alone is not enough: no flag makes a remote host OK.
    host = (url or "").split("@")[-1].split("/")[0].split(":")[0].lower()
    if host not in ("localhost", "127.0.0.1", "::1", "[::1]"):
        sys.exit(f"\nREFUSING TO RUN: '{host}' is not a local database. These fixtures\n"
                 f"TRUNCATE tables. Set ENV=local in backend_taste/.env first.\n")

    if any(marker in name for marker in ("test", "scratch", "tmp")):
        return
    if os.getenv("TASTE_TEST_DB_OK") == "1":
        print(f"!! running destructive fixtures against '{name}' (TASTE_TEST_DB_OK=1)\n")
        return

    sys.exit(
        f"\nREFUSING TO RUN: '{name}' does not look like a scratch database, and these\n"
        f"fixtures TRUNCATE tables and delete rows.\n\n"
        f"Create a throwaway database and point LOCAL_DATABASE_URL at it, e.g.\n"
        f"  .../{name}_test\n\n"
        f"Or, if you really mean this database, re-run with TASTE_TEST_DB_OK=1.\n"
    )
