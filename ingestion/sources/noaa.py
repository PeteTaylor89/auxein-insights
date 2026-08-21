"""NOAA NCEI ingestion — authoritative daily + hourly backfill for SYNOP stations.

Phase B3 of NOAA_NCEI_INGESTION_SCOPE.md. The SYNOP_GTS devices seeded in B1
each carry a NOAA crosswalk id in `notes` (`ghcnh_id`, `ghcnd_id`). This class
fills their AUTHORITATIVE history from NOAA NCEI — the slow-but-correct tier of
the two-tier model. The fast-but-provisional tier (live SYNOP) is B2.

Two modes, two NOAA datasets, two targets:

  hourly  (GHCNh)        -> timeseries_observations  (the real obs table;
                            `weather_data` is a SELECT* view and Postgres
                            rejects ON CONFLICT on views, so we write the
                            table directly). 8 variables, AUTHORITATIVE
                            (quality_rank=3, source='GHCNH'), upsert-with-
                            precedence so a re-run never downgrades and a
                            provisional SYNOP row (rank 1) is promoted in place.
                            Access: per-station-per-year .psv bulk files,
                            values already metric (degC / hPa / m/s / % / mm),
                            DATE is ISO-8601 UTC.

  daily   (GHCN-Daily)   -> weather_data_daily (TMAX/TMIN/PRCP/TAVG + derived
                            mean & GDD). Access: NCEI data service with
                            units=metric (returns degC/mm already converted;
                            the bulk CSV ships raw tenths, so we use the API).
                            NB: weather_data_daily has no provenance column, so
                            these are unconditional upserts. Guarding GHCN-Daily
                            vs a SYNOP-derived daily rollup is B4's job.

Backfill targets are locked in the scope doc: GHCN-Daily from 2022-01-01,
GHCNh hourly from 2025-09-01, both to present.

Usage:
    python -m ingestion.sources.noaa --mode hourly --dry-run
    python -m ingestion.sources.noaa --mode hourly                 # 2025-09-01 -> today
    python -m ingestion.sources.noaa --mode daily --start 2022-01-01
    python -m ingestion.sources.noaa --mode hourly --station SYNOP_93110
"""

import csv
import io
import sys
import time
import requests
from pathlib import Path
from datetime import datetime, date, timezone, timedelta

sys.path.insert(0, str(Path(__file__).parent.parent))

# Windows consoles default to cp1252; status glyphs below would raise
# UnicodeEncodeError. Force UTF-8 stdout where supported.
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

from sqlalchemy import text
from psycopg2.extras import execute_values, Json

from db_connection import get_ingestion_session, get_ingestion_engine
from sources.db_util import screen_daily_rows, screen_records

DATA_SOURCE = 'SYNOP_GTS'  # NOAA fills the authoritative tier for SYNOP devices

GHCNH_BY_YEAR_URL = (
    "https://www.ncei.noaa.gov/oa/global-historical-climatology-network/"
    "hourly/access/by-year/{year}/psv/GHCNh_{station}_{year}.psv"
)
GHCND_DATA_SERVICE = "https://www.ncei.noaa.gov/access/services/data/v1"

# Locked backfill start dates (scope doc §10).
DEFAULT_DAILY_START = date(2022, 1, 1)
DEFAULT_HOURLY_START = date(2025, 9, 1)

# GHCNh .psv element column -> (variable code, canonical unit). The four trailing
# metadata columns per element (Measurement/Quality/Report/Source code +
# Source_Station_ID) are read positionally relative to the value column.
GHCNH_ELEMENTS = {
    'temperature':            ('temp', 'C'),
    'dew_point_temperature':  ('dewpoint', 'C'),
    'relative_humidity':      ('rh', 'percent'),
    'station_level_pressure': ('pressure', 'hPa'),
    'sea_level_pressure':     ('pressure_msl', 'hPa'),
    'wind_direction':         ('wind_direction', 'deg'),
    'wind_speed':             ('wind_speed', 'm/s'),
    'precipitation':          ('rainfall', 'mm'),
}

# Light physical sanity bounds — drop obvious sentinels / corrupt values.
VALUE_BOUNDS = {
    'temp': (-50.0, 60.0),
    'dewpoint': (-60.0, 50.0),
    'rh': (0.0, 100.0),
    'pressure': (800.0, 1100.0),
    'pressure_msl': (800.0, 1100.0),
    'wind_direction': (0.0, 360.0),
    'wind_speed': (0.0, 120.0),
    'rainfall': (0.0, 500.0),
}

# ISD/GHCNh quality codes that mark a reading erroneous or suspect — skip these.
BAD_QC_CODES = {'2', '3', '6', '7'}

INSERT_HOURLY_SQL = """
    INSERT INTO timeseries_observations
        (station_id, timestamp, variable, value, unit, quality, source,
         quality_flags, quality_rank)
    VALUES %s
    ON CONFLICT (station_id, timestamp, variable) DO UPDATE
    SET value = EXCLUDED.value,
        unit = EXCLUDED.unit,
        quality = EXCLUDED.quality,
        source = EXCLUDED.source,
        quality_flags = EXCLUDED.quality_flags,
        quality_rank = EXCLUDED.quality_rank,
        created_at = NOW()
    WHERE EXCLUDED.quality_rank >= timeseries_observations.quality_rank
"""
HOURLY_TEMPLATE = (
    "(%(station_id)s, %(timestamp)s, %(variable)s, %(value)s, %(unit)s, "
    "%(quality)s, %(source)s, %(quality_flags)s, %(quality_rank)s)"
)

INSERT_DAILY_SQL = """
    INSERT INTO weather_data_daily
        (station_id, date, temp_min, temp_max, temp_mean, rainfall_mm,
         gdd_base0, gdd_base10)
    VALUES %s
    ON CONFLICT (station_id, date) DO UPDATE
    SET temp_min = EXCLUDED.temp_min,
        temp_max = EXCLUDED.temp_max,
        temp_mean = EXCLUDED.temp_mean,
        rainfall_mm = EXCLUDED.rainfall_mm,
        gdd_base0 = EXCLUDED.gdd_base0,
        gdd_base10 = EXCLUDED.gdd_base10
"""
DAILY_TEMPLATE = (
    "(%(station_id)s, %(date)s, %(temp_min)s, %(temp_max)s, %(temp_mean)s, "
    "%(rainfall_mm)s, %(gdd_base0)s, %(gdd_base10)s)"
)


class NoaaIngestion:
    """Authoritative NOAA NCEI backfill for the seeded SYNOP_GTS stations."""

    def __init__(self):
        self.data_source = DATA_SOURCE
        self.Session = get_ingestion_session()
        self.engine = get_ingestion_engine()
        self.session = requests.Session()
        self.session.headers.update({'User-Agent': 'Auxein-Insights/1.0 (weather ingestion)'})

    # ------------------------------------------------------------------ #
    # Station discovery                                                    #
    # ------------------------------------------------------------------ #
    def get_stations(self, id_field: str, station_code: str = None):
        """SYNOP devices that carry the requested NOAA crosswalk id.

        id_field: 'ghcnh_id' (hourly) or 'ghcnd_id' (daily).
        """
        with self.Session() as session:
            rows = session.execute(text(f"""
                SELECT station_id, station_code, station_name,
                       notes->>'{id_field}' AS noaa_id
                FROM weather_stations
                WHERE data_source = :ds
                  AND is_active = true
                  AND notes->>'{id_field}' IS NOT NULL
                ORDER BY station_code
            """), {'ds': self.data_source}).fetchall()

        if station_code:
            rows = [r for r in rows if r[1] == station_code]
        return rows

    # ------------------------------------------------------------------ #
    # HTTP                                                                 #
    # ------------------------------------------------------------------ #
    def fetch(self, url: str, params: dict = None, timeout: int = 120) -> str:
        """GET with polite sequential retry/backoff. Returns text, or None.

        A 404 (no file for that station/year) returns None silently.
        """
        max_retries = 3
        for attempt in range(1, max_retries + 1):
            try:
                resp = self.session.get(url, params=params, timeout=timeout)
                if resp.status_code == 404:
                    return None
                resp.raise_for_status()
                return resp.text
            except requests.exceptions.RequestException as e:
                if attempt < max_retries:
                    wait = 5 * (3 ** (attempt - 1))
                    print(f"      attempt {attempt}/{max_retries} failed ({e}), retry in {wait}s...")
                    time.sleep(wait)
                else:
                    print(f"      ✗ HTTP error after {max_retries} attempts: {e}")
                    return None

    # ------------------------------------------------------------------ #
    # GHCNh hourly                                                         #
    # ------------------------------------------------------------------ #
    def parse_ghcnh(self, station_id: int, psv_text: str,
                    start: date, end: date) -> list:
        """Parse a GHCNh .psv into observation records within [start, end]."""
        records = []
        if not psv_text:
            return records

        reader = csv.reader(io.StringIO(psv_text), delimiter='|')
        try:
            header = next(reader)
        except StopIteration:
            return records
        col = {name: i for i, name in enumerate(header)}

        # Pre-resolve the value column index for each element we care about.
        elem_cols = {
            name: col[name]
            for name in GHCNH_ELEMENTS
            if name in col
        }
        date_idx = col.get('DATE')
        if date_idx is None:
            return records

        for row in reader:
            if len(row) <= date_idx or not row[date_idx]:
                continue
            try:
                ts = datetime.fromisoformat(row[date_idx])
            except ValueError:
                continue
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            d = ts.date()
            if d < start or d > end:
                continue

            for elem, vidx in elem_cols.items():
                variable, unit = GHCNH_ELEMENTS[elem]
                if vidx >= len(row):
                    continue
                raw = row[vidx].strip()
                if raw == '':
                    continue
                try:
                    value = float(raw)
                except ValueError:
                    continue

                # Quality code sits at value_idx + 2 (Measurement, Quality, ...).
                qc = row[vidx + 2].strip() if vidx + 2 < len(row) else ''
                if qc in BAD_QC_CODES:
                    continue

                lo, hi = VALUE_BOUNDS[variable]
                if not (lo <= value <= hi):
                    continue

                flags = {'ghcnh_qc': qc} if qc and qc not in ('0', '1', '9') else None

                records.append({
                    'station_id': station_id,
                    'timestamp': ts,
                    'variable': variable,
                    'value': value,
                    'unit': unit,
                    'quality': 'AUTHORITATIVE',
                    'source': 'GHCNH',
                    'quality_flags': Json(flags) if flags else None,
                    'quality_rank': 3,
                })
        return records

    def insert_hourly(self, records: list) -> int:
        """Upsert-with-precedence into timeseries_observations (chunked)."""
        if not records:
            return 0
        records = screen_records(records)
        if not records:
            return 0
        conn = self.engine.raw_connection()
        try:
            cur = conn.cursor()
            execute_values(cur, INSERT_HOURLY_SQL, records,
                           template=HOURLY_TEMPLATE, page_size=1000)
            conn.commit()
            return len(records)
        except Exception as e:
            conn.rollback()
            print(f"      ✗ DB error (hourly): {e}")
            return 0
        finally:
            conn.close()

    def run_hourly(self, start: date, end: date, dry_run: bool = False,
                   station_code: str = None):
        stations = self.get_stations('ghcnh_id', station_code)
        print(f"Found {len(stations)} SYNOP station(s) with a GHCNh id\n")

        years = list(range(start.year, end.year + 1))
        total = 0
        for sid, code, name, ghcnh_id in stations:
            print(f"Processing {code} ({name}) — GHCNh {ghcnh_id}")
            station_total = 0
            station_parsed = 0
            for year in years:
                url = GHCNH_BY_YEAR_URL.format(year=year, station=ghcnh_id)
                psv = self.fetch(url)
                if psv is None:
                    print(f"    {year}: no file")
                    continue
                recs = self.parse_ghcnh(sid, psv, start, end)
                station_parsed += len(recs)
                if not recs:
                    print(f"    {year}: 0 records in window")
                    continue
                if dry_run:
                    print(f"    {year}: [DRY RUN] would upsert {len(recs)} records "
                          f"(e.g. {recs[0]['timestamp'].isoformat()} {recs[0]['variable']}={recs[0]['value']})")
                else:
                    n = self.insert_hourly(recs)
                    station_total += n
                    print(f"    {year}: ✓ upserted {n} records")
                time.sleep(0.5)  # be polite to NCEI

            if not dry_run:
                self.log(sid, station_total, station_total,
                         'SUCCESS' if station_total or not station_parsed else 'PARTIAL')
                total += station_total
                print(f"  Total upserted: {station_total}\n")
            else:
                total += station_parsed
                print(f"  Total parsed: {station_parsed}\n")

        label = 'parsed' if dry_run else 'upserted'
        print(f"{'='*60}\nGHCNh hourly complete — {total} records {label}\n{'='*60}")

    # ------------------------------------------------------------------ #
    # GHCN-Daily                                                           #
    # ------------------------------------------------------------------ #
    def parse_ghcnd(self, station_id: int, csv_text: str) -> list:
        """Parse a GHCN-Daily data-service CSV into daily rows."""
        rows = []
        if not csv_text:
            return rows
        reader = csv.DictReader(io.StringIO(csv_text))
        for r in reader:
            try:
                d = datetime.strptime(r['DATE'], '%Y-%m-%d').date()
            except (ValueError, KeyError):
                continue

            def num(key):
                v = (r.get(key) or '').strip()
                if v == '':
                    return None
                try:
                    return float(v)
                except ValueError:
                    return None

            tmax, tmin, tavg, prcp = num('TMAX'), num('TMIN'), num('TAVG'), num('PRCP')
            if tavg is not None:
                tmean = tavg
            elif tmax is not None and tmin is not None:
                tmean = round((tmax + tmin) / 2, 2)
            else:
                tmean = None

            # Skip wholly empty days.
            if tmax is None and tmin is None and tmean is None and prcp is None:
                continue

            rows.append({
                'station_id': station_id,
                'date': d,
                'temp_min': tmin,
                'temp_max': tmax,
                'temp_mean': tmean,
                'rainfall_mm': prcp,
                'gdd_base0': round(max(0.0, tmean), 2) if tmean is not None else None,
                'gdd_base10': round(max(0.0, tmean - 10.0), 2) if tmean is not None else None,
            })
        return rows

    def insert_daily(self, rows: list) -> int:
        if not rows:
            return 0
        # GHCN-Daily is the AUTHORITATIVE writer of weather_data_daily.rainfall_mm,
        # so its values win the B4.1 COALESCE outright. A sentinel arriving here is
        # not diluted by a rollup average the way a raw one is — it lands whole.
        rows = screen_daily_rows(rows)
        if not rows:
            return 0
        conn = self.engine.raw_connection()
        try:
            cur = conn.cursor()
            execute_values(cur, INSERT_DAILY_SQL, rows,
                           template=DAILY_TEMPLATE, page_size=1000)
            conn.commit()
            return len(rows)
        except Exception as e:
            conn.rollback()
            print(f"      ✗ DB error (daily): {e}")
            return 0
        finally:
            conn.close()

    def run_daily(self, start: date, end: date, dry_run: bool = False,
                  station_code: str = None):
        stations = self.get_stations('ghcnd_id', station_code)
        print(f"Found {len(stations)} SYNOP station(s) with a GHCN-Daily id\n")

        total = 0
        for sid, code, name, ghcnd_id in stations:
            print(f"Processing {code} ({name}) — GHCN-Daily {ghcnd_id}")
            params = {
                'dataset': 'daily-summaries',
                'stations': ghcnd_id,
                'startDate': start.isoformat(),
                'endDate': end.isoformat(),
                'format': 'csv',
                'units': 'metric',
                'dataTypes': 'TMAX,TMIN,PRCP,TAVG',
            }
            csv_text = self.fetch(GHCND_DATA_SERVICE, params=params)
            rows = self.parse_ghcnd(sid, csv_text)
            if not rows:
                print(f"    no daily rows returned")
                continue
            if dry_run:
                print(f"    [DRY RUN] would upsert {len(rows)} days "
                      f"({rows[0]['date']} → {rows[-1]['date']})")
                total += len(rows)
            else:
                n = self.insert_daily(rows)
                self.log(sid, n, n, 'SUCCESS')
                total += n
                print(f"    ✓ upserted {n} days")
            time.sleep(0.5)

        label = 'parsed' if dry_run else 'upserted'
        print(f"{'='*60}\nGHCN-Daily complete — {total} day-rows {label}\n{'='*60}")

    # ------------------------------------------------------------------ #
    # Logging + entry point                                               #
    # ------------------------------------------------------------------ #
    def log(self, station_id: int, processed: int, inserted: int, status: str,
            error_msg: str = None):
        with self.Session() as session:
            try:
                session.execute(text("""
                    INSERT INTO ingestion_log
                        (data_source, station_id, start_time, end_time,
                         records_processed, records_inserted, status, error_msg)
                    VALUES (:source, :sid, NOW(), NOW(), :p, :i, :st, :err)
                """), {'source': 'NOAA', 'sid': station_id, 'p': processed,
                       'i': inserted, 'st': status, 'err': error_msg})
                session.commit()
            except Exception as e:
                print(f"      (failed to log ingestion: {e})")

    def run(self, mode: str = 'hourly', start_date: str = None,
            end_date: str = None, dry_run: bool = False, station_code: str = None):
        start = _parse_date(start_date) if start_date else (
            DEFAULT_HOURLY_START if mode == 'hourly' else DEFAULT_DAILY_START)
        end = _parse_date(end_date) if end_date else datetime.now(timezone.utc).date()

        print(f"\n{'='*60}")
        print(f"NOAA NCEI ingestion — mode={mode}")
        print(f"Window: {start.isoformat()} → {end.isoformat()}")
        if station_code:
            print(f"Station filter: {station_code}")
        if dry_run:
            print("*** DRY RUN - nothing will be written ***")
        print(f"{'='*60}\n")

        if mode == 'hourly':
            self.run_hourly(start, end, dry_run, station_code)
        elif mode == 'daily':
            self.run_daily(start, end, dry_run, station_code)
        else:
            print(f"✗ Unknown mode '{mode}' (expected hourly|daily)")


def _parse_date(s: str) -> date:
    """Accept ISO (YYYY-MM-DD) or DD/MM/YYYY."""
    for fmt in ('%Y-%m-%d', '%d/%m/%Y'):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Unrecognised date '{s}' (use YYYY-MM-DD or DD/MM/YYYY)")


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Run NOAA NCEI weather ingestion')
    parser.add_argument('--mode', choices=['hourly', 'daily'], default='hourly',
                        help='GHCNh hourly (default) or GHCN-Daily')
    parser.add_argument('--start', type=str,
                        help='Start date YYYY-MM-DD (default: locked backfill start)')
    parser.add_argument('--end', type=str,
                        help='End date YYYY-MM-DD (default: today)')
    parser.add_argument('--station', type=str,
                        help='Single station_code (e.g. SYNOP_93110)')
    parser.add_argument('--dry-run', action='store_true',
                        help='Fetch and parse but do not write')
    args = parser.parse_args()

    NoaaIngestion().run(
        mode=args.mode,
        start_date=args.start,
        end_date=args.end,
        dry_run=args.dry_run,
        station_code=args.station,
    )
