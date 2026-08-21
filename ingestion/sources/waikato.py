"""Waikato Regional Council (WRC) — KiWIS ingestion.

Closes the largest single component of the national rainfall coverage deficit: 37
live gauges across a region where the nearest station we already held was 20-53 km
away. Rationale, licence, probe results and the deliberate omissions are in
`config/waikato_sites.py` and `docs/plans/PROBE_WAIKATO_KIWIS_2026-08-21.md`.

Public, keyless, CC BY 4.0 — attribute Waikato Regional Council.

KiWIS is a new platform for us (Kisters/WISKI), not another Hilltop. Five things
about it that are not obvious from the payload:

1. **One request returns MANY series.** `ts_id` takes a comma-separated list and the
   response is one block per series, so a station's whole variable set costs a
   single request. This is why `_fetch_window` fetches per STATION, not per series.

2. **The window limit is a ROW cap, not a time cap.** Two years of event rainfall
   (209,066 rows) succeeds where three years 500s, and the same 3-year window that
   fails at a busy gauge succeeds at a quiet one. So chunks are sized optimistically
   and HALVED on failure, never fixed.

3. **Quality code 130 is SYNTHETIC — modelled infill, not an observation.** Rejected
   here, along with 228 (estimated/forecast) and 234 (external doubtful). Nothing
   downstream would catch it: it is a perfectly plausible number.

4. **Code -1 marks a gap and arrives with an EMPTY value.** Skipping empty values is
   not defensive coding, it is correctness — coercing an empty rainfall cell to 0.0
   would turn a 411-hour telemetry outage at Karamu Walkway into a dry spell.

5. **Timestamps carry an explicit +12:00/+13:00 offset**, so they parse to correctly
   aware datetimes and there is NO DST ambiguity — none of the spring-forward
   collision that Hilltop needs `_dedupe`/`_utc_key` for.
"""

import json
import logging
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional

import requests
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).parent.parent))
from db_connection import get_ingestion_session

from config.waikato_sites import (
    API_BASE, BACKFILL_START, CHUNK_DAYS, DATA_SOURCE, DATASOURCE,
    GAP_QUALITY_CODE, INCREMENTAL_OVERLAP_HOURS, MEASUREMENT_MAP, MIN_CHUNK_DAYS,
    REJECT_QUALITY_CODES, REQUEST_DELAY, RETRY_BACKOFF, SERIES_PREFERENCE,
    SUSPECT_QUALITY_CODES,
)
from sources.db_util import bulk_upsert_observations
from sources.http_util import get_with_hard_timeout
from sources.window_util import incremental_start

logger = logging.getLogger(__name__)

# Quality codes we accept AND consider fully good. Anything else that is not
# rejected outright is stored as PROVISIONAL — the code table demonstrably is not a
# closed vocabulary (it starts at 0 and payloads carry -1), so an unrecognised code
# must never be promoted to GOOD by default.
GOOD_QUALITY_CODES = {0, 40, 70, 100, 210, 213, 219}


class WaikatoError(Exception):
    """A contract breach — a response shape or error we do not recognise."""


class WaikatoIngestion:
    def __init__(self):
        self.data_source = DATA_SOURCE
        self.Session = get_ingestion_session()

    # ------------------------------------------------------------------ fetch

    def _get(self, request: str, **params) -> str:
        """One KiWIS call, retried with backoff. Returns the raw body.

        The host drops connections under rapid load and recovers on its own, so a
        connection error here is usually pace rather than a broken route. Retrying
        is what makes an unattended backfill survive; see RETRY_BACKOFF.
        """
        params.update(service="kisters", type="queryServices",
                      datasource=DATASOURCE, request=request)
        last = None
        for delay in (0,) + RETRY_BACKOFF:
            if delay:
                time.sleep(delay)
            try:
                response = get_with_hard_timeout(API_BASE, total_timeout=240,
                                                 params=params)
                response.raise_for_status()
                body = response.text
                # KiWIS reports errors as an ExceptionReport with HTTP 200. The
                # row-cap failure is the exception: it is a genuine HTTP 500, which
                # raise_for_status above turns into the RequestException the chunk
                # halving catches.
                if body.lstrip().startswith("<?xml"):
                    raise WaikatoError(_strip_xml(body))
                time.sleep(REQUEST_DELAY)
                return body
            except (requests.exceptions.RequestException, WaikatoError) as exc:
                last = exc
        raise WaikatoError(f"{request} failed after {len(RETRY_BACKOFF) + 1} "
                           f"attempts: {last}")

    def fetch_series(self, ts_ids: List[str], start: datetime,
                     end: datetime) -> Dict[str, List]:
        """Values for several series over one window. Returns {ts_id: [(ts, value, qc)]}.

        `format=dajson` gives one object per series with a bare `[timestamp, value]`
        array, which is both the most compact form on the wire and the only one that
        stays unambiguous when several series come back together.
        """
        body = self._get(
            "getTimeseriesValues", format="dajson",
            ts_id=",".join(ts_ids),
            **{"from": start.strftime("%Y-%m-%d"),
               "to": end.strftime("%Y-%m-%d"),
               "returnfields": "Timestamp,Value,Quality Code"})
        try:
            payload = json.loads(body)
        except ValueError as exc:
            raise WaikatoError(f"non-JSON response for ts_id {ts_ids}: {exc}") from exc

        out = {}
        for block in payload:
            out[str(block.get("ts_id"))] = block.get("data") or []
        return out

    # -------------------------------------------------------------- transform

    def transform(self, rows: List, station_id: int, variable: str,
                  unit: str, counters: Dict) -> List[Dict]:
        """One series' rows -> observation dicts, screening on quality code."""
        records = []
        for row in rows:
            if len(row) < 2:
                continue
            stamp, value = row[0], row[1]
            code = int(row[2]) if len(row) > 2 and row[2] is not None else None

            # A gap. The value is empty, and inventing a number for it — 0.0 for
            # rainfall especially — would manufacture weather that did not happen.
            if value is None or value == "":
                counters["gap"] = counters.get("gap", 0) + 1
                continue

            if code in REJECT_QUALITY_CODES:
                counters.setdefault("rejected", {}).setdefault(code, 0)
                counters["rejected"][code] += 1
                continue
            if code == GAP_QUALITY_CODE:
                counters["gap"] = counters.get("gap", 0) + 1
                continue

            try:
                numeric = float(value)
                ts = datetime.fromisoformat(stamp)
            except (TypeError, ValueError):
                counters["unparseable"] = counters.get("unparseable", 0) + 1
                continue

            if code in GOOD_QUALITY_CODES:
                quality = "GOOD"
            else:
                # Includes SUSPECT_QUALITY_CODES and anything unrecognised.
                quality = "PROVISIONAL"
                if code not in SUSPECT_QUALITY_CODES:
                    counters.setdefault("unknown_codes", set()).add(code)

            records.append({
                "station_id": station_id, "timestamp": ts, "variable": variable,
                "value": numeric, "unit": unit, "quality": quality,
            })
        return records

    # --------------------------------------------------------------------- db

    def get_active_stations(self):
        with self.Session() as session:
            return session.execute(text("""
                SELECT station_id, station_code, source_id, notes
                FROM weather_stations
                WHERE data_source = :source AND is_active = true
                ORDER BY station_code
            """), {"source": self.data_source}).fetchall()

    def get_last_timestamp(self, station_id: int, variable: str) -> Optional[datetime]:
        with self.Session() as session:
            return session.execute(text("""
                SELECT MAX(timestamp) FROM weather_data
                WHERE station_id = :sid AND variable = :var
            """), {"sid": station_id, "var": variable}).scalar()

    def insert_data(self, records: List[Dict]) -> int:
        if not records:
            return 0
        with self.Session() as session:
            try:
                n = bulk_upsert_observations(session, records)
                session.commit()
                return n
            except Exception as exc:
                session.rollback()
                logger.error("database error: %s", exc)
                # Say so loudly. A swallowed write that returns 0 is how the
                # 2026-08-19 temperature re-backfill lost every year while
                # printing a tick.
                print(f"      ✗ DATABASE WRITE FAILED: {exc}")
                return 0

    def log_ingestion(self, station_id, start_time, processed, inserted,
                      status, error_msg=None):
        with self.Session() as session:
            try:
                session.execute(text("""
                    INSERT INTO ingestion_log
                        (data_source, station_id, start_time, end_time,
                         records_processed, records_inserted, status, error_msg)
                    VALUES
                        (:ds, :sid, :start, NOW(), :processed, :inserted, :status, :err)
                """), {"ds": self.data_source, "sid": station_id, "start": start_time,
                       "processed": processed, "inserted": inserted,
                       "status": status, "err": error_msg})
                session.commit()
            except Exception as exc:
                logger.error("failed to log ingestion: %s", exc)

    # -------------------------------------------------------------------- run

    @staticmethod
    def _parse_date(value: str) -> datetime:
        """Accept dd/mm/yyyy (the driver's format) or ISO."""
        for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
            try:
                return datetime.strptime(value, fmt).replace(tzinfo=timezone.utc)
            except ValueError:
                continue
        raise ValueError(f"unrecognised date {value!r}; use DD/MM/YYYY or YYYY-MM-DD")

    @staticmethod
    def _series_from_notes(notes) -> Dict[str, Dict]:
        """{variable: {ts_id, ts_name, unit}} as recorded by the seeder."""
        if isinstance(notes, str):
            notes = json.loads(notes)
        return (notes or {}).get("series", {})

    def resolve_series(self, site_no: str, station_no: str) -> Dict[str, Dict]:
        """Re-resolve a station's series from the live catalogue.

        Fallback for a station seeded before `notes.series` existed, or whose ts_ids
        have moved. Costs one request per parametertype, so it is never the hot path
        — the seeder banks the ids precisely so the hourly cron does not do this.
        """
        resolved = {}
        for param, (variable, unit) in MEASUREMENT_MAP.items():
            body = self._get("getTimeseriesList", format="csv",
                             site_no=site_no, station_no=station_no,
                             parametertype_name=param,
                             returnfields="ts_id,ts_name,ts_unitname")
            pref = SERIES_PREFERENCE.get(variable, SERIES_PREFERENCE["_default"])
            best = None
            for line in body.splitlines()[1:]:
                parts = line.split(";")
                if len(parts) < 3 or parts[1] not in pref:
                    continue
                rank = pref.index(parts[1])
                if best is None or rank < best[0]:
                    best = (rank, parts[0], parts[1])
            if best:
                resolved[variable] = {"ts_id": best[1], "ts_name": best[2],
                                      "unit": unit}
        return resolved

    def _fetch_chunked(self, series, start, end, station_id, dry_run):
        """Walk a window in chunks, halving any chunk the server refuses.

        THE CAP IS ON ROWS, NOT DAYS. A 3-year window succeeds at a quiet gauge and
        500s at a busy one, and a single gauge's own density changes over its record
        (Pinnacles: 3.6 MB for 2015, 0.4 MB for 2024). Halving turns a dense station
        into more requests rather than a lost station, and it self-tunes per chunk.
        """
        by_ts = {v["ts_id"]: (variable, v.get("unit", ""))
                 for variable, v in series.items()}
        parsed = inserted = 0
        counters: Dict = {}
        day = timedelta(days=1)
        cursor = start
        while cursor <= end:
            span = CHUNK_DAYS
            chunk_end = min(cursor + timedelta(days=span - 1), end)
            while True:
                try:
                    blocks = self.fetch_series(list(by_ts), cursor, chunk_end)
                    break
                except (WaikatoError, requests.exceptions.RequestException) as exc:
                    span //= 2
                    if span < MIN_CHUNK_DAYS:
                        raise
                    chunk_end = min(cursor + timedelta(days=span - 1), end)
                    print(f"      row cap or error — retrying {span}d window: "
                          f"{str(exc)[:110]}")

            records = []
            for ts_id, rows in blocks.items():
                mapping = by_ts.get(str(ts_id))
                if not mapping:
                    continue
                variable, unit = mapping
                records.extend(self.transform(rows, station_id, variable, unit,
                                              counters))
            parsed += len(records)
            print(f"      {cursor:%Y-%m-%d}..{chunk_end:%Y-%m-%d}: "
                  f"{sum(len(r) for r in blocks.values())} rows "
                  f"-> {len(records)} observations")
            if not dry_run:
                inserted += self.insert_data(records)

            cursor = chunk_end + day

        # PRINTED, not logged — run_ingestion.py configures no logging, and a
        # rejection count that nobody sees is exactly how bad data becomes invisible
        # data. Synthetic values are the whole reason the quality gate exists, so
        # they have to be visible when they are dropped.
        for code, n in sorted(counters.get("rejected", {}).items()):
            print(f"      {n} value(s) REJECTED on quality code {code} "
                  f"({'synthetic/modelled infill' if code == 130 else 'estimated or doubtful'})")
        if counters.get("gap"):
            print(f"      {counters['gap']} gap marker(s) skipped (empty value)")
        if counters.get("unparseable"):
            print(f"      {counters['unparseable']} unparseable value(s) skipped")
        if counters.get("unknown_codes"):
            print(f"      ⚠ quality code(s) not in getQualityCodes, stored "
                  f"PROVISIONAL: {sorted(counters['unknown_codes'])}")
        return parsed, inserted

    def run(self, period="incremental", backfill_days=None, start_date=None,
            end_date=None, dry_run=False, interval=None, station_code=None):
        """Ingest Waikato KiWIS data.

        `interval` is accepted for `backfill_driver.py` compatibility and ignored:
        KiWIS serves each series at the resolution the series is defined at and has
        no resampling parameter. The equivalent choice was made at SEED time by
        picking `Hour.Total` over the native event series.
        """
        print(f"Starting Waikato (WRC) ingestion at {datetime.now(timezone.utc)}")
        print(f"Period: {period}")

        stations = self.get_active_stations()
        if station_code:
            stations = [s for s in stations if s[1] == station_code]
            if not stations:
                print(f"⚠ Station '{station_code}' not found in active {DATA_SOURCE} stations")
                return
        if not stations:
            print(f"⚠ No active {DATA_SOURCE} stations — run "
                  f"ingestion/scripts/seed_waikato_from_probe.py first")
            return

        print(f"Found {len(stations)} active {DATA_SOURCE} station(s)\n")
        now = datetime.now(timezone.utc)
        total_parsed = total_inserted = 0

        # An explicit --start means a range backfill even without --period backfill:
        # backfill_driver.py invokes sources as `--station CODE --start DATE` and
        # never passes --period, so keying only on `period` would silently run a
        # 30-day incremental and report success.
        backfilling = (period == "backfill") or bool(start_date)
        if backfilling:
            if start_date:
                window_start = self._parse_date(start_date)
            elif backfill_days:
                window_start = now - timedelta(days=backfill_days)
            else:
                window_start = self._parse_date(BACKFILL_START)
            window_end = self._parse_date(end_date) if end_date else now
            print(f"Backfill window: {window_start:%Y-%m-%d} to {window_end:%Y-%m-%d} "
                  f"in chunks of up to {CHUNK_DAYS}d\n")
        else:
            window_start = window_end = None

        for station_id, code, source_id, notes in stations:
            series = self._series_from_notes(notes)
            if not series:
                site_no, _, station_no = (source_id or "//").partition("/")
                print(f"  {code}: no series in notes, re-resolving from catalogue")
                series = self.resolve_series(site_no, station_no)
                if not series:
                    print(f"  ✗ {code}: no mapped series found, skipping\n")
                    continue

            print(f"Processing: {code}  ({source_id}, "
                  f"{', '.join(sorted(series))})")
            start_time = datetime.now(timezone.utc)
            try:
                if backfilling:
                    start, end = window_start, window_end
                else:
                    # One request serves every variable at a station, so the
                    # incremental start is taken from the variable this source
                    # exists for and which is present at nearly every site.
                    anchor = "rainfall" if "rainfall" in series else sorted(series)[0]
                    last = self.get_last_timestamp(station_id, anchor)
                    start, note = incremental_start(
                        last, now, overlap_hours=INCREMENTAL_OVERLAP_HOURS)
                    if note:
                        print(f"    {note}")
                    end = now

                parsed, inserted = self._fetch_chunked(
                    series, start, end, station_id, dry_run)
                total_parsed += parsed
                total_inserted += inserted

                if not dry_run:
                    self.log_ingestion(station_id, start_time, parsed, inserted,
                                       "SUCCESS" if parsed else "NO_DATA")
                print(f"  ✓ {'parsed' if dry_run else 'inserted'} "
                      f"{parsed if dry_run else inserted} records\n")
            except Exception as exc:
                print(f"  ✗ {code}: {exc}\n")
                if not dry_run:
                    self.log_ingestion(station_id, start_time, 0, 0, "FAILED", str(exc))

        print(f"{'=' * 60}")
        print(f"Waikato ingestion complete at {datetime.now(timezone.utc)}")
        print(f"Total records {'parsed' if dry_run else 'inserted'}: "
              f"{total_parsed if dry_run else total_inserted}")
        print(f"{'=' * 60}\n")


def _strip_xml(body: str) -> str:
    import re
    return re.sub(r"<[^>]+>", " ", body).strip()[:200]


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Run Waikato (WRC) KiWIS ingestion")
    parser.add_argument("--period", choices=["incremental", "backfill"],
                        default="incremental")
    parser.add_argument("--days", type=int, default=None)
    parser.add_argument("--start", type=str, metavar="DD/MM/YYYY")
    parser.add_argument("--end", type=str, metavar="DD/MM/YYYY")
    parser.add_argument("--station", type=str)
    parser.add_argument("--interval", type=str, default=None,
                        help="accepted for driver compatibility; ignored")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO,
                        format="%(levelname)s %(name)s: %(message)s")
    WaikatoIngestion().run(
        period=args.period, backfill_days=args.days, start_date=args.start,
        end_date=args.end, dry_run=args.dry_run, interval=args.interval,
        station_code=args.station)
