"""ECan (Environment Canterbury) air-quality network — meteorological ingestion.

Fills Canterbury's temperature hole. ECan's rainfall and Hilltop feeds carry 102
gauges and no thermometers; the air-quality network carries air temperature and
wind at ~10 live sites with hourly history back past 2020. Rationale, licence,
probe results and the deliberate omissions are in `config/ecan_air_sites.py`.

Public, keyless, CC BY 4.0 — attribute Environment Canterbury.

Three things about this feed that are not obvious from the payload:

1. **Field names are XML-name-escaped.** `Temperature 2m (DegC)` arrives as
   `Temperature_x0020_2m_x0020__x0028_DegC_x0029_`. The JSON is generated from
   XML, and XML element names may not contain spaces or parentheses, so the
   serialiser encodes them as `_xHHHH_`. Decode before matching — a substring
   match on "Temperature" would work by accident today and break on the first
   field whose escaping differs.

2. **Timestamps are hour-ENDING; we store hour-STARTING.** See `_hour_start`.

3. **A single-row window returns `item` as a bare object, not a list.** Same
   XML-to-JSON artefact that bit `ecan.py` on ECAN_MOUNT_BYRNE — iterating the
   dict yields key strings and the first field access raises "string indices
   must be integers". Normalised in `fetch_window`.
"""

import logging
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional

import pytz
import requests
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).parent.parent))
from db_connection import get_ingestion_session

from config.ecan_air_sites import (
    API_BASE, BACKFILL_START, CHUNK_DAYS, DATA_SOURCE, ENDPOINTS,
    IGNORED_FIELDS, MEASUREMENT_MAP, VALUE_RANGES,
)
from sources.db_util import bulk_upsert_observations
from sources.http_util import get_with_hard_timeout
from sources.window_util import MAX_INCREMENTAL_DAYS, incremental_start

logger = logging.getLogger(__name__)

_ESCAPE = re.compile(r"_x([0-9A-Fa-f]{4})_")

# Re-fetch a little before the last stored point. The AQ series is revised
# upstream (ratified pollutant data replaces provisional), and while temperature
# is rarely edited, the upsert makes an overlap free.
INCREMENTAL_OVERLAP_HOURS = 3


def decode_field(name: str) -> str:
    """`Temperature_x0020_2m_x0020__x0028_DegC_x0029_` -> `Temperature 2m (DegC)`."""
    return _ESCAPE.sub(lambda m: chr(int(m.group(1), 16)), name)


def _normalise(name: str) -> str:
    """Lookup key: case-folded, whitespace-collapsed.

    ECan's field names come from each channel's `MonitorFullName`, which is
    hand-entered per station and not consistent: Ashburton 2 publishes
    `'Temperature 2m '` where every other site publishes `'Temperature 2m (DegC)'`.
    Only case and whitespace are normalised — the unit suffix is NOT stripped,
    so every accepted spelling still has to be listed in MEASUREMENT_MAP.
    """
    return " ".join(name.split()).casefold()


# Built once. Keys of MEASUREMENT_MAP / IGNORED_FIELDS are the human spellings;
# these are what `transform` actually matches against.
_MEASUREMENTS = {_normalise(k): v for k, v in MEASUREMENT_MAP.items()}
_IGNORED = {_normalise(k) for k in IGNORED_FIELDS}


class ECanAirError(Exception):
    """A contract breach — an endpoint shape or field set we do not recognise."""


class ECanAirIngestion:
    def __init__(self):
        self.data_source = DATA_SOURCE
        self.nz_tz = pytz.timezone("Pacific/Auckland")
        self.Session = get_ingestion_session()

    # ------------------------------------------------------------------ fetch

    def _api_date(self, moment: datetime) -> str:
        """Format a bound as the API's dd/mm/yyyy, in NZ local time.

        The bounds are whole-day and the service is a New Zealand one reporting NZ
        local timestamps, so the day has to be the NZ day. Formatting a UTC
        datetime directly is right for most of the day and wrong for the last
        12-13 hours of it: at 22:00 UTC it is already tomorrow in Canterbury, and
        an incremental run would ask for a window ending yesterday and quietly
        return nothing new.
        """
        if moment.tzinfo is None:
            moment = moment.replace(tzinfo=timezone.utc)
        return moment.astimezone(self.nz_tz).strftime("%d/%m/%Y")

    def fetch_window(self, site_id: str, start: datetime, end: datetime) -> List[Dict]:
        """One hourly window for one site. Both bounds are whole-day INCLUSIVE."""
        url = f"{API_BASE}/{ENDPOINTS['hourly']}/JSON"
        params = {
            "SiteId": site_id,
            "StartDate": self._api_date(start),
            "EndDate": self._api_date(end),
        }
        response = get_with_hard_timeout(url, total_timeout=180, params=params)
        response.raise_for_status()

        # A gateway timeout on an over-long window arrives as HTML, not JSON.
        # Say which window failed — the caller retries by halving it.
        try:
            payload = response.json()
        except ValueError as exc:
            raise ECanAirError(
                f"non-JSON response for site {site_id} "
                f"{params['StartDate']}..{params['EndDate']}: {exc}") from exc

        data = payload.get("data")
        if not data:
            return []
        items = data.get("item")
        if items is None:
            return []
        return [items] if isinstance(items, dict) else items

    # -------------------------------------------------------------- transform

    @staticmethod
    def _hour_start(ts: datetime) -> datetime:
        """Convert ECan's hour-ENDING stamp to the start of the hour it covers.

        A full-year request returns 01:00 on 1 Jan through 00:00 on 1 Jan of the
        following year — 8,760 slots labelled 01:00..24:00. That is the air-quality
        convention: the stamp is the END of the averaging period.

        Everything else in `weather_data` is an instantaneous reading stamped at
        its observation time, and `daily_aggregation.py` bins by NZ-local calendar
        date. Left as-is, each day would receive the hour ending at 00:00 — which
        belongs to the PREVIOUS day — and lose its own final hour. That is a
        one-hour shear in every daily min/max.

        It would rarely change Tmin (dawn) or Tmax (mid-afternoon), which is
        exactly why it would never be noticed. Shift once, here, and the rest of
        the pipeline needs to know nothing.

        The subtraction is on an aware datetime with a fixed UTC offset (that is
        what `fromisoformat` produces), so it is an absolute shift and carries no
        DST ambiguity of its own.
        """
        return ts - timedelta(hours=1)

    def transform(self, raw: List[Dict], station_id: int) -> List[Dict]:
        out = []
        unknown = set()
        for record in raw:
            decoded = {decode_field(k): v for k, v in record.items()}
            stamp = decoded.get("DateTime")
            if not stamp:
                continue
            try:
                ts = self._hour_start(datetime.fromisoformat(stamp))
            except ValueError:
                logger.warning("unparseable DateTime %r for station %s", stamp, station_id)
                continue

            for field, value in decoded.items():
                key = _normalise(field)
                if key in _IGNORED:
                    continue
                mapping = _MEASUREMENTS.get(key)
                if not mapping:
                    unknown.add(field)
                    continue
                if value in (None, "", "NaN"):
                    continue
                variable, unit, scale = mapping
                try:
                    numeric = float(value) * scale
                except (TypeError, ValueError):
                    continue

                lo, hi = VALUE_RANGES.get(variable, (None, None))
                if lo is not None and not (lo <= numeric <= hi):
                    # Loud, per the Phase 0.1 finding: a value silently vanishing
                    # is how bad data becomes invisible data. These are the
                    # telemetry sentinels (-100, -7999) that a storage-level guard
                    # cannot distinguish from a reading.
                    logger.warning(
                        "station %s %s: rejected %s (outside %s..%s) at %s",
                        station_id, variable, numeric, lo, hi, ts.isoformat())
                    continue

                out.append({
                    "station_id": station_id,
                    "timestamp": ts,
                    "variable": variable,
                    "value": numeric,
                    "unit": unit,
                    "quality": "GOOD",
                })

        if unknown:
            # PRINTED, not logged. `run_ingestion.py` configures no logging, so a
            # logger.info here is invisible — and this is the one report that
            # catches a station whose field names do not match the map. It went
            # unnoticed exactly once: Ashburton 2's `'Temperature 2m '` returned
            # 17,800 rows that transformed to nothing, and only the
            # rows -> observations counter showed it.
            print(f"      ⚠ unmapped fields ignored: {', '.join(sorted(unknown))}")
        return out

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
        """Accept dd/mm/yyyy (the API's own format and the driver's) or ISO."""
        for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
            try:
                return datetime.strptime(value, fmt).replace(tzinfo=timezone.utc)
            except ValueError:
                continue
        raise ValueError(f"unrecognised date {value!r}; use DD/MM/YYYY or YYYY-MM-DD")

    def _fetch_chunked(self, site_id, start, end, station_id, dry_run):
        """Walk a window in CHUNK_DAYS steps, halving a chunk that times out.

        **Both bounds are whole-day INCLUSIVE.** `StartDate=EndDate=01/06/2024`
        returns 24 rows covering all of 1 June, and `01/06..07/06` returns 168.
        So a chunk covers `CHUNK_DAYS` days when it ends on
        `cursor + CHUNK_DAYS - 1`, and the next chunk starts the day AFTER that.
        Advancing the cursor to `chunk_end` instead would re-fetch a whole day per
        chunk — harmless, because the upsert key absorbs it, but ~14 wasted days
        per station on a 2020→now backfill.

        A two-year request 504s at the gateway and a one-year request succeeds, so
        CHUNK_DAYS is a guess about a boundary ECan does not document. Halving on
        failure means a slow day degrades into more requests rather than a lost
        station.
        """
        parsed = inserted = 0
        day = timedelta(days=1)
        cursor = start
        while cursor <= end:
            span = CHUNK_DAYS
            chunk_end = min(cursor + timedelta(days=span - 1), end)
            while True:
                try:
                    raw = self.fetch_window(site_id, cursor, chunk_end)
                    break
                except (ECanAirError, requests.exceptions.RequestException) as exc:
                    span //= 2
                    if span < 8:
                        raise
                    chunk_end = min(cursor + timedelta(days=span - 1), end)
                    print(f"      retrying smaller window ({span}d) after: {exc}")
                    time.sleep(2)

            records = self.transform(raw, station_id)
            parsed += len(records)
            print(f"      {cursor:%Y-%m-%d}..{chunk_end:%Y-%m-%d}: "
                  f"{len(raw)} rows -> {len(records)} observations")
            if dry_run:
                if records:
                    last = records[-1]
                    print(f"      [DRY RUN] last {last['timestamp'].isoformat()} "
                          f"{last['variable']}={last['value']:.4g} {last['unit']}")
            else:
                inserted += self.insert_data(records)

            cursor = chunk_end + day
            time.sleep(0.3)          # politeness
        return parsed, inserted

    def run(self, period="incremental", backfill_days=None, start_date=None,
            end_date=None, dry_run=False, interval=None, station_code=None):
        """Ingest ECan air-quality met data.

        `interval` is accepted for `backfill_driver.py` compatibility and ignored:
        the feed serves one fixed hourly resolution and offers no resampling
        parameter.

        Unlike `ecan.py` there is **no daily/hourly seam to guard**. The rainfall
        portal switches to midnight daily totals on windows longer than a month,
        so a backfill overlapping the hourly era would double-count in
        `daily_aggregation`. This endpoint was probed at one week, one month and
        one full year and returned hourly every time, so a backfill and an
        incremental may overlap freely — the upsert key absorbs it.
        """
        print(f"Starting ECan air-quality ingestion at {datetime.now(timezone.utc)}")
        print(f"Period: {period}")

        stations = self.get_active_stations()
        if station_code:
            stations = [s for s in stations if s[1] == station_code]
            if not stations:
                print(f"⚠ Station '{station_code}' not found in active {DATA_SOURCE} stations")
                return
        if not stations:
            print(f"⚠ No active {DATA_SOURCE} stations — run seed_ecan_air.py first")
            return

        print(f"Found {len(stations)} active {DATA_SOURCE} station(s)\n")
        now = datetime.now(timezone.utc)
        total_parsed = total_inserted = 0

        # An explicit --start means a range backfill even without --period backfill.
        # backfill_driver.py invokes sources as `--station CODE --start DATE` and
        # never passes --period; keying only on `period` would silently run a
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
                  f"in {CHUNK_DAYS}-day chunks\n")
        else:
            window_start = window_end = None

        for station_id, code, site_id, _notes in stations:
            print(f"Processing: {code}  (SiteId {site_id})")
            start_time = datetime.now(timezone.utc)
            try:
                if backfilling:
                    start, end = window_start, window_end
                else:
                    # One window serves every variable — the endpoint returns them
                    # all together — so the incremental start is taken from `temp`,
                    # the variable this source exists for and the one present at
                    # every live site.
                    last = self.get_last_timestamp(station_id, "temp")
                    start, note = incremental_start(
                        last, now, overlap_hours=INCREMENTAL_OVERLAP_HOURS)
                    if note:
                        print(f"    {note}")
                    end = now

                parsed, inserted = self._fetch_chunked(
                    site_id, start, end, station_id, dry_run)
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

        print(f"{'='*60}")
        print(f"ECan air-quality ingestion complete at {datetime.now(timezone.utc)}")
        print(f"Total records {'parsed' if dry_run else 'inserted'}: "
              f"{total_parsed if dry_run else total_inserted}")
        print(f"{'='*60}\n")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Run ECan air-quality meteorological ingestion")
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
    ECanAirIngestion().run(
        period=args.period, backfill_days=args.days, start_date=args.start,
        end_date=args.end, dry_run=args.dry_run, interval=args.interval,
        station_code=args.station)
