"""
Horizons (Manawatu-Whanganui Regional Council) weather data ingestion
API: Hilltop Server at https://hilltopserver.horizons.govt.nz/data.hts

**Depth warning.** Horizons' public Hilltop exposes a single SCADA-fed file
(`EnvironmentalData.hts`) — every .hts path on both hilltopserver and
flood.horizons.govt.nz is a catch-all onto it. It is a telemetry file, not an
archive: 101 of 116 live weather sites begin in **2024**, 8 in 2023, 2 in 2022.
Asking GetData for 2010 returns nothing before the advertised From, so the
depth is real and not a metadata artefact. Horizons therefore densifies the
*current* network but adds almost nothing to the 2020-2024 surface backfill.
Backfill floor is 2022 because nothing earlier is published.

Horizons also publishes an unusually large amount of derived/QA series
alongside the raw ones; the exclusions live in seed_horizons_from_probe.py.
"""

import requests
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import sys
from pathlib import Path
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).parent.parent))
from db_connection import get_ingestion_session
from sources.db_util import bulk_upsert_observations
from sources.http_util import get_with_hard_timeout
from sources.hilltop_util import aggregation_query
from sources.window_util import MAX_INCREMENTAL_DAYS, incremental_start
# Incremental window + gap-close policy: see sources/window_util.py.

HORIZONS_API_BASE = 'https://hilltopserver.horizons.govt.nz/data.hts'


def base_measurement(qualified: str) -> str:
    """Strip the `[DataSource]` qualifier from a stored measurement string.

    Horizons stations store measurements as `Rainfall [SCADA Rainfall]` because
    Hilltop's default datasource resolution is unreliable on this server (see
    seed_horizons_from_probe.py). The qualifier is required on the wire but the
    measurement_map is keyed on the bare name.
    """
    return qualified.split(' [', 1)[0] if ' [' in qualified else qualified


class HorizonsIngestion:
    """Ingestion class for Horizons Hilltop weather data"""

    def __init__(self):
        self.data_source = 'HORIZONS'
        self.base_url = HORIZONS_API_BASE
        self.Session = get_ingestion_session()
        self.nz_tz = ZoneInfo('Pacific/Auckland')

        # Map Horizons measurement name -> (canonical_variable, canonical_unit, scale).
        #
        # UNIT FOOTGUN: the bare `Wind Speed` series is NOT unit-consistent
        # across sites — Horizons publishes it as m/s on 18 sites, km/hr on 2
        # and mm/s on 1. Because this map is keyed on measurement *name*, a
        # single scale would silently corrupt the odd ones out, so `Wind Speed`
        # is deliberately NOT mapped. `Average Wind Speed` is uniformly m/s
        # across the same 18 sites and is the standard scalar-average met
        # observation (same choice HBRC makes), so it carries wind_speed.
        #
        # Solar is published as flux DENSITY in kW/m2 -> x1000 for W/m2.
        # `Total Solar Flux` (MJ/m2) is an accumulation, not an instantaneous
        # rate, and is excluded rather than rescaled.
        #
        # Unit labels in the feed are inconsistent even for the same quantity
        # ('°C' vs 'ºC', Soil Temperature as bare '°'), which is exactly why the
        # canonical unit here is authoritative and the XML <Units> is ignored.
        self.measurement_map = {
            'Rainfall': ('rainfall', 'mm', 1.0),

            # Preference order is applied at seed time; standard screen height first.
            'Air Temperature (1.5m)': ('temp', 'C', 1.0),
            'Air Temperature': ('temp', 'C', 1.0),
            'Air Temperature (5m)': ('temp', 'C', 1.0),
            'Air Temperature (10m)': ('temp', 'C', 1.0),

            'Relative Humidity': ('rh', 'percent', 1.0),
            'Dew Point Temperature': ('dewpoint', 'C', 1.0),
            'Atmospheric Pressure': ('pressure', 'hPa', 1.0),

            'Average Wind Speed': ('wind_speed', 'm/s', 1.0),
            'Wind Direction': ('wind_direction', 'deg', 1.0),
            'Maximum Wind Speed': ('wind_gust', 'm/s', 1.0),
            'Maximum Gust': ('wind_gust', 'm/s', 1.0),

            'Soil Temperature': ('soil_temp', 'C', 1.0),
            'Soil Moisture': ('soil_moisture_vwc', 'percent', 1.0),

            'Solar Flux Density': ('solar_radiation', 'W/m2', 1000.0),
        }

    def get_active_stations(self):
        with self.Session() as session:
            result = session.execute(text("""
                SELECT station_id, station_code, source_id, notes
                FROM weather_stations
                WHERE data_source = :source AND is_active = true
                ORDER BY station_code
            """), {'source': self.data_source})
            return result.fetchall()

    def get_last_timestamp(self, station_id: int, variable: str) -> datetime:
        with self.Session() as session:
            result = session.execute(text("""
                SELECT MAX(timestamp)
                FROM weather_data
                WHERE station_id = :station_id AND variable = :variable
            """), {'station_id': station_id, 'variable': variable})

            last_time = result.scalar()
            if last_time:
                if last_time.tzinfo is None:
                    last_time = last_time.replace(tzinfo=self.nz_tz)
                return last_time
            return datetime.now(self.nz_tz) - timedelta(days=2)

    def fetch_data(self, site_name: str, measurement: str,
                   start_time: datetime, end_time: datetime,
                   interval: str = None) -> str:
        from urllib.parse import quote

        from_str = start_time.astimezone(self.nz_tz).strftime('%Y-%m-%dT%H:%M:%S')
        to_str = end_time.astimezone(self.nz_tz).strftime('%Y-%m-%dT%H:%M:%S')

        # %20, never '+': Hilltop does not decode '+' as a space, and Horizons
        # site names are full of them ("Akitio at Toi Flat"). A '+' yields
        # "No Measurements available." rather than an error, so this fails silently.
        url = (
            f"{self.base_url}"
            f"?Service=Hilltop"
            f"&Request=GetData"
            f"&Site={quote(site_name)}"
            f"&Measurement={quote(measurement)}"
            f"&From={quote(from_str)}"
            f"&To={quote(to_str)}"
        )

        # Interval ALWAYS carries a Method. Interval alone makes Hilltop return
        # the value at the boundary rather than an aggregate of it — see
        # sources/hilltop_util.py. No interval at all means native resolution,
        # which is what a real daily min/max needs and is not slower.
        # base_measurement here too: the map is keyed on the bare name, and a miss
        # would quietly pick the instantaneous Method for a cumulative series.
        url += aggregation_query(base_measurement(measurement), self.measurement_map,
                                 interval, quote)

        # Retry with exponential backoff, matching the other Hilltop drivers. A single
        # unretried request turns a transient blip into a lost measurement for the run,
        # logged only as "No response for <X>". See gw.py for what that cost.
        max_retries = 3
        for attempt in range(1, max_retries + 1):
            try:
                print(f"      URL: {url}")
                response = get_with_hard_timeout(url, total_timeout=120)
                response.raise_for_status()
                return response.text
            except requests.exceptions.RequestException as e:
                if attempt < max_retries:
                    wait = 5 * (3 ** (attempt - 1))  # 5s, 15s, 45s
                    print(f"      Attempt {attempt}/{max_retries} failed ({e}), retrying in {wait}s...")
                    time.sleep(wait)
                else:
                    print(f"      API error after {max_retries} attempts: {e}")
                    return None

    def parse_response(self, station_id: int, xml_text: str,
                       measurement: str) -> list:
        records = []

        if not xml_text:
            return records

        if '<e>' in xml_text or '<Error>' in xml_text:
            import re
            match = re.search(r'<[eE]rror>([^<]+)</[eE]rror>', xml_text) or \
                re.search(r'<e>([^<]+)</e>', xml_text)
            error_msg = match.group(1) if match else xml_text[:300]
            print(f"      API error: {error_msg}")
            return records

        try:
            root = ET.fromstring(xml_text)
        except ET.ParseError as e:
            print(f"      XML parse error: {e}")
            return records

        base = base_measurement(measurement)
        if base not in self.measurement_map:
            print(f"      Unknown measurement: {measurement}")
            return records

        variable, unit, scale = self.measurement_map[base]

        for elem in root.iter('E'):
            try:
                t_elem = elem.find('T')
                i1_elem = elem.find('I1')

                if t_elem is None or i1_elem is None:
                    continue

                timestamp = datetime.strptime(t_elem.text, '%Y-%m-%dT%H:%M:%S')
                timestamp = timestamp.replace(tzinfo=self.nz_tz)

                value = float(i1_elem.text) * scale

                records.append({
                    'station_id': station_id,
                    'timestamp': timestamp,
                    'variable': variable,
                    'value': value,
                    'unit': unit,
                    'quality': 'GOOD'
                })
            except (ValueError, AttributeError):
                continue

        return records

    def insert_data(self, records: list) -> int:
        if not records:
            return 0

        with self.Session() as session:
            try:
                n = bulk_upsert_observations(session, records)
                session.commit()
                return n
            except Exception as e:
                session.rollback()
                # A failed write is not a successful station. Without this the caller
                # prints a tick against 0 records and exits 0, so the backfill driver
                # logs OK - how the DST-duplicate abort silently lost every full year
                # of the 2026-08-19 re-backfill.
                print(f"      *** DB WRITE FAILED: {e}")
                self.write_failed = True
                return 0

    def log_ingestion(self, station_id: int, start_time: datetime,
                      records_processed: int, records_inserted: int,
                      status: str, error_msg: str = None):
        with self.Session() as session:
            try:
                session.execute(
                    text("""
                        INSERT INTO ingestion_log
                            (data_source, station_id, start_time, end_time,
                             records_processed, records_inserted, status, error_msg)
                        VALUES (:source, :station_id, :start_time, NOW(),
                                :processed, :inserted, :status, :error_msg)
                    """),
                    {
                        'source': self.data_source,
                        'station_id': station_id,
                        'start_time': start_time,
                        'processed': records_processed,
                        'inserted': records_inserted,
                        'status': status,
                        'error_msg': error_msg
                    }
                )
                session.commit()
            except Exception as e:
                print(f"      Failed to log ingestion: {e}")

    def _year_chunks(self, start, end):
        """Yield (chunk_start, chunk_end) split on calendar-year boundaries."""
        cur = start
        while cur < end:
            year_end = datetime(cur.year + 1, 1, 1, tzinfo=self.nz_tz)
            chunk_end = min(year_end, end)
            yield cur, chunk_end
            cur = chunk_end

    def run(self, period: str = 'incremental', backfill_days: int = None,
            start_date: str = None, end_date: str = None, dry_run: bool = False,
            interval: str = None, station_code: str = None,
            variables: set = None):
        print(f"\n{'='*60}")
        print(f"Starting HORIZONS ingestion at {datetime.now()}")
        print(f"Period: {period}")
        if start_date:
            print(f"Date range: {start_date} to {end_date or 'today'}")
        if interval:
            print(f"Interval: {interval}")
        if station_code:
            print(f"Station filter: {station_code}")
        if dry_run:
            print(f"*** DRY RUN - No data will be inserted ***")
        print(f"{'='*60}\n")

        explicit_start = None
        explicit_end = None
        if start_date:
            explicit_start = datetime.strptime(start_date, '%d/%m/%Y').replace(tzinfo=self.nz_tz)
        if end_date:
            explicit_end = datetime.strptime(end_date, '%d/%m/%Y').replace(tzinfo=self.nz_tz)
        else:
            explicit_end = datetime.now(self.nz_tz)

        stations = self.get_active_stations()

        if station_code:
            stations = [s for s in stations if s[1] == station_code]
            if not stations:
                print(f"⚠ Station '{station_code}' not found in active HORIZONS stations")
                return

        print(f"Found {len(stations)} active HORIZONS station(s)\n")

        total_inserted = 0
        total_parsed = 0

        for station in stations:
            station_id = station[0]
            code = station[1]
            site_name = station[2]
            notes = station[3] or {}

            print(f"Processing: {code}")
            print(f"  Site: {site_name}")

            measurements = notes.get('measurements', [])
            if not measurements:
                print(f"  ⚠ No measurements configured, skipping")
                continue

            # Station-level quarantine. A sensor that has failed keeps publishing —
            # Horizons Hautapu emitted exactly -100.0 at 144 records/day for weeks —
            # so "still reporting" is not evidence of health. Skipping the variable
            # here stops new poison at the source; the rows already stored are marked
            # QUARANTINED rather than deleted, so the failure stays provable.
            quarantined = {q.get('variable') for q in (notes.get('quarantine') or [])}
            if quarantined:
                kept = []
                for m in measurements:
                    var = (self.measurement_map.get(base_measurement(m)) or (None,))[0]
                    if var in quarantined:
                        print(f"  QUARANTINED, skipping {m} ({var})")
                    else:
                        kept.append(m)
                measurements = kept
                if not measurements:
                    continue

            # Restrict to the requested canonical variables. Filtering on the
            # canonical code rather than the council's measurement name keeps one
            # flag working across every council, which spell air temperature seven
            # different ways. Without this a targeted temperature re-fetch also
            # drags rainfall, wind and soil to native resolution — for ~500 Hilltop
            # rain gauges that is roughly 116M rows nobody asked for.
            if variables:
                measurements = [
                    m for m in measurements
                    # Stored form is `Name [DataSource]`; the map is keyed on Name.
                    if (self.measurement_map.get(base_measurement(m))
                        or (None,))[0] in variables
                ]
                if not measurements:
                    print(f"  No measurements match {sorted(variables)}, skipping")
                    continue

            print(f"  Measurements: {measurements}")

            station_total = 0
            station_parsed = 0

            for measurement in measurements:
                # Stored form is `Name [DataSource]`; the map is keyed on Name.
                base = base_measurement(measurement)
                if base not in self.measurement_map:
                    print(f"    ⚠ Unknown measurement '{measurement}', skipping")
                    continue

                variable, _, _ = self.measurement_map[base]

                try:
                    if explicit_start:
                        start_time = explicit_start
                        end_time = explicit_end
                    else:
                        end_time = datetime.now(self.nz_tz)

                        if period == 'backfill' and backfill_days:
                            start_time = end_time - timedelta(days=backfill_days)
                        else:
                            start_time = self.get_last_timestamp(station_id, variable)

                    if not explicit_start and start_time >= end_time - timedelta(hours=1):
                        print(f"    {measurement}: Already up to date")
                        continue

                    if not explicit_start:
                        start_time, gap_note = incremental_start(start_time, end_time)
                        if gap_note:
                            print(f"    ⚠ {measurement}: {gap_note}")

                    print(f"    {measurement}: {start_time.date()} to {end_time.date()}")

                    for chunk_start, chunk_end in self._year_chunks(start_time, end_time):
                        xml_response = self.fetch_data(site_name, measurement,
                                                       chunk_start, chunk_end, interval)

                        if not xml_response:
                            if not dry_run:
                                self.log_ingestion(station_id, chunk_start, 0, 0,
                                                   'FAILED', f'No response for {measurement} '
                                                             f'{chunk_start.date()}..{chunk_end.date()}')
                            continue

                        records = self.parse_response(station_id, xml_response, measurement)

                        if not records:
                            print(f"      {chunk_start.year}: no records parsed")
                            continue

                        station_parsed += len(records)

                        if dry_run:
                            print(f"      [DRY RUN] {chunk_start.year}: would insert {len(records)} records")
                            print(f"      Sample: {records[0]['timestamp']} = "
                                  f"{records[0]['value']} {records[0]['unit']}")
                        else:
                            inserted = self.insert_data(records)
                            station_total += inserted
                            print(f"      ✓ {chunk_start.year}: inserted {inserted} records")

                except Exception as e:
                    print(f"      ✗ Error: {e}")
                    if not dry_run:
                        self.log_ingestion(station_id, datetime.now(self.nz_tz), 0, 0,
                                           'FAILED', str(e))

            if not dry_run and station_total > 0:
                self.log_ingestion(station_id, datetime.now(self.nz_tz),
                                   station_total, station_total, 'SUCCESS')
                total_inserted += station_total

            total_parsed += station_parsed

            if dry_run:
                print(f"  Total parsed: {station_parsed} records\n")
            else:
                print(f"  Total inserted: {station_total} records\n")

        print(f"{'='*60}")
        print(f"HORIZONS ingestion complete at {datetime.now()}")
        if dry_run:
            print(f"Total records parsed: {total_parsed} (DRY RUN - nothing inserted)")
        else:
            print(f"Total records inserted: {total_inserted}")
        print(f"{'='*60}\n")


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Run Horizons weather data ingestion')
    parser.add_argument('--period', choices=['incremental', 'backfill'],
                        default='incremental', help='Ingestion period')
    parser.add_argument('--days', type=int, default=90,
                        help='Days to backfill (only used with --period backfill)')
    parser.add_argument('--start', type=str, metavar='DD/MM/YYYY',
                        help='Explicit start date (overrides period logic)')
    parser.add_argument('--end', type=str, metavar='DD/MM/YYYY',
                        help='Explicit end date (defaults to today)')
    parser.add_argument('--dry-run', action='store_true',
                        help='Fetch and parse but do not insert to database')
    parser.add_argument('--interval', type=str, default=None,
                        help="Hilltop resampling interval, e.g. '1 hour'. Default: none — fetch at native recording resolution. An interval AVERAGES each bin, which smooths away the very peaks a daily min/max needs, so leave it off for temperature.")
    parser.add_argument('--station', type=str,
                        help='Limit to a single station_code')
    parser.add_argument('--variable', type=str, default=None,
                        help="Comma-separated canonical variable codes to fetch, "
                             "e.g. 'temp' or 'temp,rainfall'. Default: all configured "
                             "for the station.")
    args = parser.parse_args()

    ingester = HorizonsIngestion()
    ingester.run(
        period=args.period,
        backfill_days=args.days,
        start_date=args.start,
        end_date=args.end,
        dry_run=args.dry_run,
        interval=args.interval,
        station_code=args.station,
        variables={v.strip() for v in args.variable.split(',')} if args.variable else None
    )
    if getattr(ingester, 'write_failed', False):
        print('One or more database writes FAILED - see above. '
              'This run did NOT persist everything it fetched.')
        sys.exit(1)
