"""
Bay of Plenty Regional Council (BoP) weather data ingestion — AQUARIUS WebPortal.
Portal: https://envdata.boprc.govt.nz  (same vendor build as ORC and Auckland.)

*** THE DATA LEG IS GATED. THIS CLASS CANNOT INGEST YET. ***

Catalogue metadata is deliberately public; every value path is closed to an anonymous
session. Verified again 2026-08-11 from the ingestion box:

  POST /Data/Data_List              200  447 locations WITH WGS84 coordinates   OPEN
  GET  /Data/Datasets/?locationId=  200  5,534 datasets, parameter + period     OPEN
  GET  /Data/DatasetBase/           200  95 KB of Kendo grid SHELL, no values    GATED
  GET  /Map/Values                  200  Statistics group is []                  GATED

`/Map/Values` is the decisive one: it returns the column-picker options for the grid,
and anonymously its `Statistics` group comes back empty, so no value column can be
selected. That single empty list IS the gate — it explains why `Data_List` declares
`DatasetId`/`Value`/`ValueNumber` in its schema and never populates them. Note that
`/Data/DatasetBase/` answers **HTTP 200**, not 403: judging access by status code says
"open" when it is shut. Use `check_access()` below, which tests the Statistics group.

BoP does NOT expose the vendor's AQUARIUS Publish API. Probed 2026-08-11:
`/AQUARIUS/Publish/v2/*`, `/Acquisition/v2/*` and `/Provisioning/v1/*` all return the
portal's empty-200 unmatched-route signature. (Auckland DOES expose it — those paths
return 401 there — so if the three councils are ever bundled into one integration,
Auckland is the one with a documented vendor API and should be built first.)

WHAT UNBLOCKS THIS: a portal account or API credential from BoP. An IP allowlist alone
is not expected to lift a permission gate, though it may be how BoP chooses to attach
the grant. When credentials land, the remaining work is exactly two things:
  1. Authenticate the session (add the login POST to `open_session`).
  2. Fill in `fetch_dataset_points()` — the one function below with no verified body.
Everything else (catalogue, mapping, station selection, upsert, logging) is complete.

DO NOT SEED BOP STATIONS UNTIL check_access() PASSES. Seeding 118 stations that cannot
be fed reproduces the ECan 4-of-102 failure; the AQUARIUS catalogue is 447 locations and
the same mistake here is bigger.

------------------------------------------------------------------------------------
DATASET SELECTION — two traps, both measured from the 2026-08-11 catalogue capture
------------------------------------------------------------------------------------
A dataset's `DisplayText` is `<Label>.<Qualifier>@<LocationIdentifier>`, e.g.
`Wind Vel.HourMean@DP650467`. The qualifier carries the AGGREGATION, and BoP spreads one
parameter across several:

  Rainfall            HourTotal 52, Primary 52, Operational_GDC 9, DayTotal 6,
                      Operational_HBRC 3, ESNZ 2
  Air Temperature     FieldResult 35, Primary 17, Operational 3
  Wind Speed          FieldResult 35, Primary 16, HourMean 12, DayMean 2
  Wind Direction      Primary 16, DayMean 13, HourMean 13
  Wind Gust Speed     Primary 16, DayMean 1, HourMean 1
  Atmospheric Pressure / Relative Humidity / Soil Moisture / Soil Temp  Primary only

1. **`FieldResult` is manual spot sampling, not telemetry.** Those 35 "Air Temperature"
   FieldResult datasets are readings taken by hand during water-quality sampling runs —
   irregular, sparse, and biased toward working hours. Ingesting them as `temp` would
   inject a daytime-warm, low-cadence series into the temperature surface. BoP's real
   continuous air-temperature network is ~20 sites, NOT the 53 the raw parameter count
   suggests. Same for Wind Speed.

2. **`Day*` qualifiers are daily aggregates**, excluded for the same reason TRC's
   365-day window is rainfall-only: a daily mean is not an observation, and one value per
   day makes daily min = max = mean downstream.

QUALIFIER_PREFERENCE below encodes raw-first, hourly-if-nothing-better, never-daily,
never-field-sample.

------------------------------------------------------------------------------------
CROSS-COUNCIL REPUBLISHING — do not double-count
------------------------------------------------------------------------------------
`Operational_GDC` (9), `Operational_HBRC` (3) and `ESNZ` (2) are Gisborne DC, Hawke's Bay
and Environment Southland sites REPUBLISHED through BoP's portal. We already ingest all
three councils directly. Seeding them again under BoP would put two stations at one
coordinate and double-weight that location in the interpolation. The seeder drops any
dataset whose qualifier names a foreign agency, and additionally dedupes against existing
stations on coordinates — matching on name would not catch it, because the two councils
label the same gauge differently.

UNITS ARE UNKNOWN. Unlike Auckland, BoP's `DisplayText` carries no unit string
(`Air Temp.Operational@DP650467`, not `Air Temp... (degC)`), and no other catalogue field
exposes one. Wind could be m/s or km/h — a 3.6x error that looks entirely plausible in
the data. MEASUREMENT_MAP therefore records unit as None for anything not physically
unambiguous, and `parse_points()` REFUSES to convert until the unit is confirmed from a
real data response. Resolve this before the first backfill, not after.

Timestamps: datasets declare `Timezone: 12.0` (NZST). Whether the value endpoint returns
offset-aware stamps or naive NZ local is unverified — confirm against a known local
reading, the way TRC's UTC basis was confirmed, before trusting any of it.
"""

import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).parent.parent))
from db_connection import get_ingestion_session
from sources.db_util import bulk_upsert_observations

BASE_URL = 'https://envdata.boprc.govt.nz'
TOKEN_RE = re.compile(r'name="__RequestVerificationToken"[^>]*value="([^"]+)"')

# ParameterName -> (canonical_variable, canonical_unit_or_None, scale_or_None)
# unit=None means "not yet confirmed from a real data response" — see the docstring.
# Physically unambiguous ones (degrees, %, hPa) are still asserted with care: they are
# the conventional units for these parameters and carry no plausible alternative.
MEASUREMENT_MAP = {
    'Rainfall':                 ('rainfall',          'mm',      1.0),
    'Air Temperature':          ('temp',              'C',       1.0),
    'Soil Temperature':         ('soil_temp',         'C',       1.0),
    'Soil Moisture, by volume': ('soil_moisture_vwc', 'percent', 1.0),
    'Relative Humidity':        ('rh',                'percent', 1.0),
    'Atmospheric Pressure':     ('pressure',          'hPa',     1.0),
    'Wind Direction':           ('wind_direction',    'deg',     1.0),
    # UNRESOLVED UNIT — could be m/s or km/h. Left as None so parse_points() refuses
    # rather than silently applying (or omitting) a 3.6x scale.
    'Wind Speed':               ('wind_speed',        None,      None),
    'Wind Gust Speed':          ('wind_gust',         None,      None),
}

# Deliberately NOT mapped:
#   'Standardised Precipitation Index' — a derived drought index, not a measurement.
#   'Rainfall Infiltration Recharge'   — modelled groundwater recharge, not rainfall.
#   'Water Temperature'                — river temperature, not a weather variable.
EXCLUDED_PARAMETERS = {
    'Standardised Precipitation Index',
    'Rainfall Infiltration Recharge',
    'Water Temperature',
}

# Best qualifier first. Anything not listed is rejected, so a new qualifier appearing in
# the portal fails loudly at selection time instead of being ingested at the wrong
# aggregation.
QUALIFIER_PREFERENCE = ('Primary', 'Operational', 'HourTotal', 'HourMean')

# Qualifiers that must never be selected, with the reason (surfaced by the seeder).
QUALIFIER_REJECT = {
    'FieldResult': 'manual spot sample from water-quality runs, not telemetry',
    'EntireRecord_FieldResult': 'manual spot sample, whole-record export',
    'DayMean': 'daily aggregate, not an observation',
    'DayTotal': 'daily aggregate, not an observation',
}

# Qualifiers marking another council's site republished through BoP.
FOREIGN_AGENCY_RE = re.compile(r'_(GDC|HBRC|ES|ESNZ|NIWA|WCRC|TDC)$|^ESNZ$', re.I)


class BoPAccessGated(RuntimeError):
    """Raised when the portal is reachable but the value path is still permission-gated."""


def parse_display_text(display_text):
    """`Wind Vel.HourMean@DP650467` -> ('Wind Vel', 'HourMean', 'DP650467')."""
    if not display_text:
        return (None, None, None)
    head, _, loc = display_text.partition('@')
    label, _, qualifier = head.partition('.')
    return (label or None, qualifier or None, loc or None)


def choose_dataset(datasets, parameter_name):
    """Pick the one dataset to ingest for a parameter at a location, or None.

    Returns (dataset, reason_if_rejected). Rejects foreign-agency republished series and
    anything whose qualifier is not an accepted raw/hourly form.
    """
    candidates = []
    for ds in datasets or []:
        if ds.get('ParameterName') != parameter_name:
            continue
        _label, qualifier, _loc = parse_display_text(ds.get('DisplayText'))
        if not qualifier:
            continue
        if FOREIGN_AGENCY_RE.search(qualifier):
            continue                                    # another council's gauge
        if qualifier in QUALIFIER_REJECT:
            continue
        if qualifier not in QUALIFIER_PREFERENCE:
            continue                                    # unknown aggregation — refuse
        candidates.append((QUALIFIER_PREFERENCE.index(qualifier), ds))
    if not candidates:
        return None
    candidates.sort(key=lambda t: t[0])
    return candidates[0][1]


class BoPRCIngestion:
    """AQUARIUS WebPortal client for Bay of Plenty. Catalogue works; values are gated."""

    def __init__(self):
        self.data_source = 'BOPRC'
        self.base_url = BASE_URL
        self.headers = {
            'User-Agent': 'Auxein-Insights/1.0 (climate data ingestion; pete.taylor@auxein.co.nz)',
        }
        self.session = None
        self.Session = get_ingestion_session()

    # ---------------------------------------------------------------- portal session

    def open_session(self):
        """Accept the disclaimer and return a session carrying the portal cookie.

        WHEN CREDENTIALS ARRIVE: the login POST goes here, after the disclaimer step.
        The portal's own login form is at /Account/Login and `/api/v1/locations` 302s to
        /Account/NoAccess for an anonymous session, so that is the route that should
        start answering 200 once authenticated.
        """
        s = requests.Session()
        s.headers.update(self.headers)
        r = s.get(self.base_url + '/Disclaimer', timeout=30)
        r.raise_for_status()
        m = TOKEN_RE.search(r.text)
        if not m:
            raise RuntimeError(f'no anti-forgery token at {self.base_url}/Disclaimer')
        s.post(self.base_url + '/AcceptDisclaimer',
               data={'__RequestVerificationToken': m.group(1)},
               headers={'Referer': self.base_url + '/Disclaimer'}, timeout=30)
        s.headers.update({'X-Requested-With': 'XMLHttpRequest',
                          'Referer': self.base_url + '/Data'})
        self.session = s
        return s

    def check_access(self):
        """Is the value path open? Returns (ok: bool, detail: str).

        Tests the Statistics group from /Map/Values rather than an HTTP status, because
        the gated data route answers 200 with a grid shell and would read as success.
        """
        s = self.session or self.open_session()
        r = s.get(self.base_url + '/Map/Values',
                  params={'interval': 'Latest', 'calendar': 'CALENDARYEAR'}, timeout=30)
        if r.status_code != 200 or not r.content:
            return (False, f'/Map/Values HTTP {r.status_code}, {len(r.content)} bytes')
        try:
            payload = r.json()
        except ValueError:
            return (False, '/Map/Values did not return JSON')
        groups = payload.get('Values') or []
        stats = next((g for g in groups if g.get('GroupId') == 'Statistic'), None)
        if stats is None:
            return (False, 'no Statistics group in /Map/Values')
        items = stats.get('Items') or []
        if not items:
            return (False, 'Statistics group is EMPTY — value columns still gated')
        return (True, f'Statistics group offers {len(items)} selectable value column(s)')

    # ---------------------------------------------------------------- catalogue (open)

    def locations(self, page_size=200):
        """Every location with WGS84 coordinates, via the Kendo grid behind the list tab."""
        s = self.session or self.open_session()
        out, skip = [], 0
        while True:
            r = s.post(self.base_url + '/Data/Data_List',
                       data={'take': page_size, 'skip': skip,
                             'page': skip // page_size + 1, 'pageSize': page_size},
                       timeout=60)
            r.raise_for_status()
            payload = r.json()
            rows = payload.get('Data') or []
            out.extend(rows)
            skip += page_size
            if skip >= (payload.get('Total') or 0) or not rows:
                break
            time.sleep(0.2)
        return out

    def datasets(self, location_id):
        """Datasets at one location: ParameterName, DisplayText, StartTime, EndTime."""
        s = self.session or self.open_session()
        r = s.get(self.base_url + '/Data/Datasets/',
                  params={'locationId': location_id}, timeout=60)
        r.raise_for_status()
        return r.json() if r.content else []

    # ---------------------------------------------------------------- values (GATED)

    def fetch_dataset_points(self, dataset_id, start=None, end=None):
        """Observation points for one dataset. NOT IMPLEMENTED — the route is gated.

        This is the single function that has no verified body, because nobody has yet
        seen an authenticated response from this portal. Do NOT guess a parser: the
        earlier reverse-engineering pass established that unmatched routes here answer
        200 with an empty body and that `/Data/DatasetBase/` answers 200 with a Kendo
        grid shell, so a speculative implementation would appear to work and silently
        ingest nothing.

        WHEN ACCESS LANDS:
          1. Run `ingestion/scripts/check_boprc_access.py` to confirm check_access() passes.
          2. Open a dataset in the portal with DevTools -> Network -> XHR and capture the
             call that returns points (`/Data/DatasetBase/` with a selected statistic is
             the likely candidate, now that the Statistics group is populated).
          3. Implement here; confirm the timezone against a known local reading before
             trusting any of it; confirm wind units before setting MEASUREMENT_MAP.
        """
        ok, detail = self.check_access()
        raise BoPAccessGated(
            'BoP value path is not available to this session — ' + detail + '. '
            'Catalogue metadata is public; observations require a portal account or API '
            'credential from Bay of Plenty Regional Council. See the module docstring.'
        )

    def parse_points(self, station_id, points, parameter_name):
        """Map raw points to records. Refuses parameters whose unit is unconfirmed."""
        mapping = MEASUREMENT_MAP.get(parameter_name)
        if not mapping:
            return []
        variable, unit, scale = mapping
        if unit is None or scale is None:
            raise BoPAccessGated(
                f"unit for '{parameter_name}' is still unconfirmed — BoP publishes no "
                f"unit string in its catalogue, and guessing between m/s and km/h is a "
                f"3.6x error that looks plausible in the data. Confirm from a real "
                f"response, then set it in MEASUREMENT_MAP."
            )
        records = []
        for ts, value in points or []:
            if value is None:
                continue
            records.append({
                'station_id': station_id, 'timestamp': ts, 'variable': variable,
                'value': float(value) * scale, 'unit': unit, 'quality': 'GOOD',
            })
        return records

    # ---------------------------------------------------------------- driver contract

    def get_active_stations(self):
        with self.Session() as session:
            return session.execute(text("""
                SELECT station_id, station_code, source_id, notes
                FROM weather_stations
                WHERE data_source = :source AND is_active = true
                ORDER BY station_code
            """), {'source': self.data_source}).fetchall()

    def run(self, period: str = 'incremental', backfill_days: int = None,
            start_date: str = None, end_date: str = None, dry_run: bool = False,
            interval: str = None, station_code: str = None):
        """Standard entry point. Fails fast and loudly while the portal is gated."""
        print(f"Starting BoP (BOPRC) ingestion at {datetime.now(timezone.utc)}")
        ok, detail = self.check_access()
        if not ok:
            print(f"\n  ⚠ BoP data access is still GATED: {detail}")
            print("    Catalogue metadata is public; observations need a portal account")
            print("    or API credential from Bay of Plenty Regional Council.")
            print("    Nothing to ingest — exiting without error so the hourly run of")
            print("    every other source is unaffected.\n")
            return
        # Access has landed — but the value parser still has to be written and verified.
        raise BoPAccessGated(
            'BoP access check PASSED — the Statistics group is now populated. '
            'fetch_dataset_points() still needs implementing against a captured '
            'authenticated response; see the module docstring for the three steps.'
        )


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Run Bay of Plenty (BOPRC) ingestion')
    parser.add_argument('--period', choices=['incremental', 'backfill'], default='incremental')
    parser.add_argument('--days', type=int, default=365)
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--interval', type=str, default=None)
    parser.add_argument('--station', type=str)
    parser.add_argument('--check-access', action='store_true',
                        help='report whether the value path has opened, then exit')
    args = parser.parse_args()

    ingester = BoPRCIngestion()
    if args.check_access:
        ok, detail = ingester.check_access()
        print(('OPEN  — ' if ok else 'GATED — ') + detail)
        sys.exit(0 if ok else 1)

    ingester.run(period=args.period, backfill_days=args.days,
                 dry_run=args.dry_run, station_code=args.station)
