"""Near-real-time SYNOP ingestion — PROVISIONAL live tier (Ogimet bootstrap).

Phase B2 of NOAA_NCEI_INGESTION_SCOPE.md, dev-bootstrap variant. The SYNOP_GTS
devices seeded in B1 each carry their WMO block in `source_id` (and `notes`).
This class pulls the *live* synoptic obs for those blocks, decodes the FM-12
report, and writes hourly spot obs to `timeseries_observations` as PROVISIONAL
(quality_rank=1) — the fast-but-rough tier of the two-tier model. The slow-but-
correct AUTHORITATIVE tier is the NOAA class (`noaa.py`), which later supersedes
these rows in place via the same upsert-with-precedence guard.

Two transports for the live tier (scope doc §9.2):
  * v1 (this file)  Ogimet `getsynop` HTTP — ~4-month rolling window, no infra.
                    Dev bootstrap ONLY; rate-limited and fragile.
  * v2 (deferred)   Unidata IDD/LDM `IDS|DDPLUS` firehose — persistent service,
                    needs an always-on host + feed registration. The decode +
                    upsert functions here are reused unchanged by that node.

Decoder: a self-contained minimal FM-12 (land AAXX) parser for the Section-1
groups we map — temperature, dew point, station + MSL pressure, wind, precip —
plus derived relative humidity (Magnus). Cloud / weather / Section 3+ regional
groups are skipped. This avoids a `pymetdecoder` dependency for the bootstrap;
swap in pymetdecoder when hardening for the LDM node if fuller decoding is
wanted. Every value is sanity-bounded, and anything ambiguous is skipped rather
than guessed — provisional rows self-heal on the NOAA reconcile pass anyway.

Usage:
    python -m ingestion.sources.synop --dry-run               # last 48h, all stations
    python -m ingestion.sources.synop                         # last 48h -> upsert PROVISIONAL
    python -m ingestion.sources.synop --station SYNOP_93110 --dry-run
    python -m ingestion.sources.synop --start 2026-06-01 --end 2026-06-15
    python -m ingestion.sources.synop --reconcile             # promote via NOAA authoritative pass
"""

import csv
import io
import sys
import math
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
from config.synop_sites import OGIMET_GETSYNOP

DATA_SOURCE = 'SYNOP_GTS'

# Default live re-pull window — re-fetch the last 48h every run to catch late /
# COR-corrected reports (scope doc §9.7). Upsert keying makes it idempotent.
DEFAULT_LOOKBACK_DAYS = 2

# Knots -> m/s for wind reported with iw indicator 3/4.
KT_TO_MS = 0.514444

# Light physical sanity bounds — drop obvious sentinels / corrupt decodes.
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

UNITS = {
    'temp': 'C', 'dewpoint': 'C', 'rh': 'percent',
    'pressure': 'hPa', 'pressure_msl': 'hPa',
    'wind_direction': 'deg', 'wind_speed': 'm/s', 'rainfall': 'mm',
}

# Section separators — Section 1 (the groups we read) ends at the first of these.
SECTION_SEPARATORS = ('222', '333', '444', '555', '666')

INSERT_SQL = """
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
INSERT_TEMPLATE = (
    "(%(station_id)s, %(timestamp)s, %(variable)s, %(value)s, %(unit)s, "
    "%(quality)s, %(source)s, %(quality_flags)s, %(quality_rank)s)"
)


# ---------------------------------------------------------------------------- #
# FM-12 decode helpers (module-level so the LDM node can reuse them verbatim)   #
# ---------------------------------------------------------------------------- #
def _reconstruct_pressure(four: str):
    """4-digit tenths-hPa with thousands dropped -> hPa. '0140'->1014.0,
    '9998'->999.8. Deterministic: real encodings never collide in-range."""
    if not four.isdigit():
        return None
    tenths = int(four) / 10.0
    if tenths < 100.0:        # leading 0/1 was the dropped thousands digit
        tenths += 1000.0
    return round(tenths, 1)


def _rh_from_dewpoint(t: float, td: float):
    """Magnus relative humidity (%) from temperature + dew point (°C)."""
    a, b = 17.625, 243.04
    try:
        rh = 100.0 * math.exp((a * td) / (b + td) - (a * t) / (b + t))
    except (ZeroDivisionError, ValueError):
        return None
    return round(max(0.0, min(100.0, rh)), 1)


def decode_synop(report: str) -> dict:
    """Decode an FM-12 land (AAXX) report into a {variable: value} dict.

    Reads only Section 1 (groups before the first 222/333/444/555 separator)
    plus the positional wind group. Returns canonical metric values; RH is
    derived from T/Td when not reported directly. Missing / ambiguous groups
    are skipped, not guessed.
    """
    out = {}
    if not report:
        return out
    toks = report.replace('==', ' ').replace('=', ' ').split()
    # Expected layout: AAXX  YYGGiw  IIiii  iRixhVV  Nddff  <section-1 groups...>
    if len(toks) < 5 or toks[0] != 'AAXX':
        return out

    # --- wind indicator (iw) from YYGGiw -> m/s vs knots ---------------- #
    iw = toks[1][4] if len(toks[1]) >= 5 and toks[1][4].isdigit() else None

    # --- wind group Nddff (positional, index 4) ------------------------- #
    wind = toks[4]
    if len(wind) >= 5:
        dd, ff = wind[1:3], wind[3:5]
        if dd.isdigit() and ff.isdigit():
            ddi, ffi = int(dd), int(ff)
            if dd == '00':                       # calm
                out['wind_speed'] = 0.0
            elif ffi != 99:                      # 99 => speed in following 00fff
                spd = float(ffi)
                if iw in ('3', '4'):
                    spd *= KT_TO_MS
                out['wind_speed'] = round(spd, 1)
                if dd != '99':                   # 99 => variable direction
                    out['wind_direction'] = float(ddi * 10)

    # --- Section 1 numbered groups from index 5 until a section sep ------ #
    for g in toks[5:]:
        if g in SECTION_SEPARATORS or g[:3] in SECTION_SEPARATORS:
            break
        if len(g) != 5 or '/' in g[1:]:
            continue
        lead = g[0]

        if lead == '1':                          # 1snTTT  air temperature
            body = g[2:5]
            if body.isdigit():
                v = int(body) / 10.0
                out['temp'] = -v if g[1] == '1' else v

        elif lead == '2':                        # 2snTdTdTd  dewpoint / RH
            body = g[2:5]
            if body.isdigit():
                if g[1] == '9':                  # 29UUU -> RH directly
                    out['rh'] = float(int(body))
                else:
                    v = int(body) / 10.0
                    out['dewpoint'] = -v if g[1] == '1' else v

        elif lead == '3':                        # 3PoPoPoPo  station pressure
            p = _reconstruct_pressure(g[1:5])
            if p is not None:
                out['pressure'] = p

        elif lead == '4':                        # 4PPPP MSL  vs  4a3hhh geopot.
            if g[1] in ('9', '0'):               # 900-1099 hPa => MSL pressure
                p = _reconstruct_pressure(g[1:5])
                if p is not None:
                    out['pressure_msl'] = p

        elif lead == '6':                        # 6RRRtr  precipitation
            rrr = g[1:4]
            if rrr.isdigit():
                r = int(rrr)
                if r == 990:
                    mm = 0.0                      # trace
                elif 991 <= r <= 999:
                    mm = round((r - 990) * 0.1, 1)
                elif r <= 989:
                    mm = float(r)
                else:
                    mm = None
                if mm is not None:
                    out['rainfall'] = mm
                    out['_precip_tr'] = g[4]      # accumulation-window code

    # Derive RH from T + Td when not reported directly.
    if 'rh' not in out and 'temp' in out and 'dewpoint' in out:
        rh = _rh_from_dewpoint(out['temp'], out['dewpoint'])
        if rh is not None:
            out['rh'] = rh

    return out


class SynopIngestion:
    """Provisional live SYNOP backfill/poll for the seeded SYNOP_GTS stations."""

    def __init__(self):
        self.data_source = DATA_SOURCE
        self.Session = get_ingestion_session()
        self.engine = get_ingestion_engine()
        self.session = requests.Session()
        self.session.headers.update({'User-Agent': 'Auxein-Insights/1.0 (weather ingestion)'})

    # ------------------------------------------------------------------ #
    # Station discovery                                                    #
    # ------------------------------------------------------------------ #
    def get_active_stations(self, station_code: str = None):
        """SYNOP_GTS devices with a WMO block (source_id) to poll Ogimet with."""
        with self.Session() as session:
            rows = session.execute(text("""
                SELECT station_id, station_code, station_name,
                       COALESCE(source_id, notes->>'wmo_block') AS wmo_block
                FROM weather_stations
                WHERE data_source = :ds
                  AND is_active = true
                  AND COALESCE(source_id, notes->>'wmo_block') IS NOT NULL
                ORDER BY station_code
            """), {'ds': self.data_source}).fetchall()
        if station_code:
            rows = [r for r in rows if r[1] == station_code]
        return rows

    # ------------------------------------------------------------------ #
    # HTTP (Ogimet getsynop)                                               #
    # ------------------------------------------------------------------ #
    def fetch_synop(self, wmo_block: str, start: date, end: date) -> str:
        """Pull raw SYNOP CSV for one WMO block over [start, end]. None on miss."""
        params = {
            'block': wmo_block,
            'begin': f"{start.strftime('%Y%m%d')}0000",
            'end': f"{end.strftime('%Y%m%d')}2359",
        }
        max_retries = 3
        for attempt in range(1, max_retries + 1):
            try:
                resp = self.session.get(OGIMET_GETSYNOP, params=params, timeout=120)
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
    # Parse                                                                #
    # ------------------------------------------------------------------ #
    def parse_response(self, station_id: int, csv_text: str) -> list:
        """Ogimet CSV (block,Y,M,D,H,m,AAXX-report) -> PROVISIONAL obs records."""
        records = []
        if not csv_text:
            return records

        for line in csv_text.splitlines():
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            parts = line.split(',')
            if len(parts) < 7:
                continue
            try:
                ts = datetime(int(parts[1]), int(parts[2]), int(parts[3]),
                              int(parts[4]), int(parts[5]), tzinfo=timezone.utc)
            except (ValueError, IndexError):
                continue

            report = ','.join(parts[6:]).strip()
            if not report.startswith('AAXX'):
                continue

            decoded = decode_synop(report)
            precip_tr = decoded.pop('_precip_tr', None)

            for variable, value in decoded.items():
                lo, hi = VALUE_BOUNDS[variable]
                if not (lo <= value <= hi):
                    continue
                flags = None
                if variable == 'rainfall' and precip_tr is not None:
                    flags = {'synop_tr': precip_tr}   # accumulation window code
                records.append({
                    'station_id': station_id,
                    'timestamp': ts,
                    'variable': variable,
                    'value': value,
                    'unit': UNITS[variable],
                    'quality': 'PROVISIONAL',
                    'source': 'SYNOP',
                    'quality_flags': Json(flags) if flags else None,
                    'quality_rank': 1,
                })
        return records

    # ------------------------------------------------------------------ #
    # Insert                                                               #
    # ------------------------------------------------------------------ #
    def insert_data(self, records: list) -> int:
        """Upsert-with-precedence into timeseries_observations. A PROVISIONAL
        row (rank 1) never overwrites a CONFIRMED/AUTHORITATIVE one."""
        if not records:
            return 0
        conn = self.engine.raw_connection()
        try:
            cur = conn.cursor()
            execute_values(cur, INSERT_SQL, records,
                           template=INSERT_TEMPLATE, page_size=1000)
            conn.commit()
            return len(records)
        except Exception as e:
            conn.rollback()
            print(f"      ✗ DB error: {e}")
            return 0
        finally:
            conn.close()

    # ------------------------------------------------------------------ #
    # Logging                                                              #
    # ------------------------------------------------------------------ #
    def log_ingestion(self, station_id: int, processed: int, inserted: int,
                      status: str, error_msg: str = None):
        with self.Session() as session:
            try:
                session.execute(text("""
                    INSERT INTO ingestion_log
                        (data_source, station_id, start_time, end_time,
                         records_processed, records_inserted, status, error_msg)
                    VALUES (:source, :sid, NOW(), NOW(), :p, :i, :st, :err)
                """), {'source': 'SYNOP', 'sid': station_id, 'p': processed,
                       'i': inserted, 'st': status, 'err': error_msg})
                session.commit()
            except Exception as e:
                print(f"      (failed to log ingestion: {e})")

    # ------------------------------------------------------------------ #
    # Reconcile delegation (promote provisional -> authoritative)          #
    # ------------------------------------------------------------------ #
    def reconcile(self, days: int = 60, station_code: str = None,
                  dry_run: bool = False):
        """Run the NOAA authoritative pass over the recent window. The upsert
        precedence guard promotes any PROVISIONAL/CONFIRMED rows in place.
        (Scope doc §9.6 — full daily-layer supersede/recompute is S2.)"""
        from sources.noaa import NoaaIngestion
        end = datetime.now(timezone.utc).date()
        start = end - timedelta(days=days)
        print(f"\nReconcile: NOAA authoritative pass {start} → {end} "
              f"(promotes provisional rows via precedence)\n")
        noaa = NoaaIngestion()
        noaa.run(mode='hourly', start_date=start.isoformat(),
                 end_date=end.isoformat(), dry_run=dry_run, station_code=station_code)
        noaa.run(mode='daily', start_date=start.isoformat(),
                 end_date=end.isoformat(), dry_run=dry_run, station_code=station_code)

    # ------------------------------------------------------------------ #
    # Entry point                                                          #
    # ------------------------------------------------------------------ #
    def run(self, start_date: str = None, end_date: str = None,
            dry_run: bool = False, station_code: str = None,
            reconcile: bool = False, reconcile_days: int = 60):
        if reconcile:
            self.reconcile(days=reconcile_days, station_code=station_code,
                           dry_run=dry_run)
            return

        end = _parse_date(end_date) if end_date else datetime.now(timezone.utc).date()
        start = _parse_date(start_date) if start_date else (
            end - timedelta(days=DEFAULT_LOOKBACK_DAYS))

        print(f"\n{'='*60}")
        print(f"SYNOP live ingestion (Ogimet bootstrap) — PROVISIONAL")
        print(f"Window: {start.isoformat()} → {end.isoformat()}")
        if station_code:
            print(f"Station filter: {station_code}")
        if dry_run:
            print("*** DRY RUN - nothing will be written ***")
        print(f"{'='*60}\n")

        stations = self.get_active_stations(station_code)
        print(f"Found {len(stations)} SYNOP station(s) with a WMO block\n")

        total = 0
        for sid, code, name, wmo_block in stations:
            print(f"Processing {code} ({name}) — WMO {wmo_block}")
            csv_text = self.fetch_synop(wmo_block, start, end)
            recs = self.parse_response(sid, csv_text)
            if not recs:
                print(f"    no obs decoded in window")
                if not dry_run:
                    self.log_ingestion(sid, 0, 0, 'SUCCESS')
                time.sleep(1.0)
                continue

            if dry_run:
                sample = recs[0]
                print(f"    [DRY RUN] would upsert {len(recs)} obs "
                      f"(e.g. {sample['timestamp'].isoformat()} "
                      f"{sample['variable']}={sample['value']})")
                total += len(recs)
            else:
                n = self.insert_data(recs)
                self.log_ingestion(sid, len(recs), n, 'SUCCESS')
                total += n
                print(f"    ✓ upserted {n} obs")
            time.sleep(1.0)  # Ogimet is rate-limited — be polite, sequential

        label = 'parsed' if dry_run else 'upserted'
        print(f"\n{'='*60}\nSYNOP live complete — {total} obs {label}\n{'='*60}")


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

    parser = argparse.ArgumentParser(description='Run SYNOP live ingestion (Ogimet bootstrap)')
    parser.add_argument('--start', type=str,
                        help='Start date YYYY-MM-DD (default: 48h ago)')
    parser.add_argument('--end', type=str,
                        help='End date YYYY-MM-DD (default: today)')
    parser.add_argument('--station', type=str,
                        help='Single station_code (e.g. SYNOP_93110)')
    parser.add_argument('--dry-run', action='store_true',
                        help='Fetch and decode but do not write')
    parser.add_argument('--reconcile', action='store_true',
                        help='Run NOAA authoritative pass to promote provisional rows')
    parser.add_argument('--reconcile-days', type=int, default=60,
                        help='Reconcile look-back window in days (default 60)')
    args = parser.parse_args()

    SynopIngestion().run(
        start_date=args.start,
        end_date=args.end,
        dry_run=args.dry_run,
        station_code=args.station,
        reconcile=args.reconcile,
        reconcile_days=args.reconcile_days,
    )
