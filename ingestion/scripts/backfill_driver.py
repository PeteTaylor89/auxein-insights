#!/usr/bin/env python
"""Hang-proof per-station backfill driver.

The plain `hbrc.py --start ...` backfill wedged mid-run: HBRC's Cloudflare front-end
stalled a GetData connection past the request timeout, hanging the whole process
after ~6 stations. requests' timeout doesn't cap total time against a trickling
connection, so a single bad station blocks all the rest.

This driver runs EACH station as its own subprocess with a HARD wall-clock timeout.
A station that hangs is killed and skipped; the driver moves on. It is resumable:
`--skip-existing-before DATE` skips stations that already have data before DATE
(i.e. already deep-backfilled), so re-runs don't refetch completed stations.

Sources come in two backfill styles (see SOURCE_MODULE):
  "range" — Hilltop councils; arbitrary history via --start/--interval.
  "days"  — Environment Southland; forward-only API that only accepts a look-back
            window anchored to now, capped at 365 days. --start is meaningless there.

Usage:
    python ingestion/scripts/backfill_driver.py --source hbrc --start 01/01/2020 \
        --interval "1 day" --per-station-timeout 1200 --skip-existing-before 2021-01-01

    python ingestion/scripts/backfill_driver.py --source southland --days 365 \
        --per-station-timeout 1200 --skip-existing-before 2026-07-25
"""
import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # ingestion/
from db_connection import get_ingestion_session
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

REPO = Path(__file__).resolve().parents[2]
SOURCE_MODULE = {  # source -> (data_source in DB, source script, backfill style)
    "hbrc":      ("HBRC",      "ingestion/sources/hbrc.py",      "range"),
    "mdc":       ("MDC",       "ingestion/sources/mdc.py",       "range"),
    "gw":        ("GW",        "ingestion/sources/gw.py",        "range"),
    "tdc":       ("TDC",       "ingestion/sources/tdc.py",       "range"),
    "gdc":       ("GDC",       "ingestion/sources/gdc.py",       "range"),
    "nrc":       ("NRC",       "ingestion/sources/nrc.py",       "range"),
    "wcrc":      ("WCRC",      "ingestion/sources/wcrc.py",      "range"),
    "horizons":  ("HORIZONS",  "ingestion/sources/horizons.py",  "range"),
    "southland": ("SOUTHLAND", "ingestion/sources/southland.py", "days"),
}

# Per-style progress counter: how far back a row has to be to count as "backfilled".
# Range sources reach deep history, so pre-2025 rows are the signal. Southland can
# only ever reach ~12 months, so count everything instead.
PROGRESS = {"range": ("2025-01-01", "pre-2025 rows"),
            "days":  ("2100-01-01", "total rows")}


def station_pre_count(session, station_id, before):
    return session.execute(text(
        "SELECT count(*) FROM timeseries_observations "
        "WHERE station_id=:id AND timestamp < :b"
    ), {"id": station_id, "b": before}).scalar()


def pre_count_retry(Session, station_id, before, retries=4):
    """station_pre_count with its own session + retry, so a transient RDS
    connection timeout (a NZ->Sydney network blip) doesn't abort an overnight run."""
    for attempt in range(retries):
        try:
            with Session() as s:
                return station_pre_count(s, station_id, before)
        except OperationalError:
            if attempt == retries - 1:
                raise
            time.sleep(5 * (attempt + 1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True, choices=sorted(SOURCE_MODULE))
    ap.add_argument("--start", help="DD/MM/YYYY (range-style sources only)")
    ap.add_argument("--interval", default="1 day")
    ap.add_argument("--days", type=int, default=365,
                    help="look-back window for days-style sources (ES caps at 365)")
    ap.add_argument("--per-station-timeout", type=int, default=1200, help="seconds per station")
    ap.add_argument("--skip-existing-before", default=None,
                    help="YYYY-MM-DD; skip stations that already have data before this date")
    ap.add_argument("--only", default=None,
                    help="comma-separated station_code(s) to process exclusively "
                         "(targeted re-run; ignores --skip-existing-before for these)")
    args = ap.parse_args()

    data_source, module, style = SOURCE_MODULE[args.source]
    if style == "range" and not args.start:
        ap.error(f"--start is required for {args.source} (range-style backfill)")
    progress_before, progress_label = PROGRESS[style]

    Session = get_ingestion_session()
    with Session() as s:
        stations = s.execute(text(
            "SELECT station_id, station_code FROM weather_stations "
            "WHERE data_source=:ds AND is_active=true ORDER BY station_code"
        ), {"ds": data_source}).fetchall()

    only = None
    if args.only:
        only = {c.strip() for c in args.only.split(",")}
        stations = [st for st in stations if st[1] in only]
        args.skip_existing_before = None  # targeted re-run: always reprocess

    window = (f"start={args.start} interval='{args.interval}'" if style == "range"
              else f"look-back={args.days}d (forward-only API)")
    print(f"{data_source}: {len(stations)} active stations | {window} "
          f"timeout={args.per_station_timeout}s "
          f"skip-before={args.skip_existing_before or '-'}\n", flush=True)

    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    done = skipped = timed_out = errored = 0
    for i, (sid, code) in enumerate(stations, 1):
        if args.skip_existing_before:
            if pre_count_retry(Session, sid, args.skip_existing_before) > 0:
                skipped += 1
                print(f"[{i}/{len(stations)}] {code}: SKIP (already has data before "
                      f"{args.skip_existing_before})", flush=True)
                continue
        if style == "days":
            cmd = [sys.executable, str(REPO / module), "--station", code,
                   "--period", "backfill", "--days", str(args.days)]
        else:
            cmd = [sys.executable, str(REPO / module), "--station", code,
                   "--start", args.start, "--interval", args.interval]
        try:
            r = subprocess.run(cmd, cwd=str(REPO), env=env,
                               capture_output=True, text=True,
                               timeout=args.per_station_timeout)
            # count backfilled rows for visibility
            pre = pre_count_retry(Session, sid, progress_before)
            tag = "OK" if r.returncode == 0 else f"RC={r.returncode}"
            if r.returncode != 0:
                errored += 1
            else:
                done += 1
            print(f"[{i}/{len(stations)}] {code}: {tag} | {progress_label} now {pre}", flush=True)
        except subprocess.TimeoutExpired:
            timed_out += 1
            print(f"[{i}/{len(stations)}] {code}: *** TIMEOUT after "
                  f"{args.per_station_timeout}s — killed, moving on", flush=True)

    print(f"\n{'='*56}\n{data_source} driver complete: "
          f"done {done} | skipped {skipped} | TIMEOUT {timed_out} | errored {errored} "
          f"| total {len(stations)}", flush=True)
    if timed_out:
        print(f"Re-run to retry the {timed_out} timed-out station(s) — idempotent, "
              f"and --skip-existing-before will skip the ones that succeeded.", flush=True)


if __name__ == "__main__":
    main()
