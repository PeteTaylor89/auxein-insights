#!/usr/bin/env python
"""Probe a KiWIS (Kisters WISKI) server and dump a weather-station inventory.

Written 2026-08-21 for the Waikato Regional Council build. Findings are recorded in
`docs/plans/PROBE_WAIKATO_KIWIS_2026-08-21.md`.

READ-ONLY. Keyless. Makes GET requests only.

WHY THIS EXISTS
---------------
Station configs must be GENERATED from the live API, never hand-typed — the same rule
`probe_hilltop.py` encodes. KiWIS makes that especially true: every station carries
10-20 derived series (long-term climatology, month/year totals, manual observer
readings, migrated legacy files) alongside the one real observation series, and
picking the wrong one is silent.

Written generic rather than Waikato-specific because KiWIS is a product, not a
council. Any other agency found running it is `--host` away.

SIX GOTCHAS THIS SCRIPT ENCODES
-------------------------------
1. `getTimeseriesList` REFUSES an unfiltered request ("This datasource does not allow
   getTimeseriesList requests without filters"). Filters accept `*`, so
   `parametertype_name=*` is how you enumerate everything.

2. TRAINING STATIONS ARE IN THE CATALOGUE. Waikato publishes `GW_Training_Master`,
   `GW_Training2..7` — which are 7 of the 12 barometric-pressure stations in the whole
   network — plus `Doug_/Jess_/Tane_DP-Training2023` under `site_no=99999`. Both
   families are excluded, by name AND by the sentinel site number.

3. THE `to` ON A CLIMATOLOGY SERIES RUNS INTO THE FUTURE, so it cannot judge liveness.
   `60 - LongTermMonthMax` reports `to = 2026-12-01`. Keyed on the naive max over all
   series, every station looks live. Liveness is read from OBSERVATION series only.
   This is the WCRC "liveness is judged per weather series" rule in a new disguise.

4. QUALITY CODE 130 IS SYNTHETIC — modelled infill, not an observation. The NEMS code
   table (`getQualityCodes`) also carries 228 estimated/forecast/extrapolated and 234
   external-doubtful. Ingesting those would feed a model's own output back in as an
   observation. `--quality` reports the distribution so the reject set can be set from
   evidence rather than assumption. Note the table starts at 0 but real payloads also
   carry -1, which is NOT in it.

5. THERE IS A ROW CAP, NOT A TIME CAP. A 2-year window returning 209,066 rows succeeds
   and a 3-year one answers HTTP 500 `DatasourceError`. A fixed chunk LENGTH is
   therefore wrong: a busy station fails where a quiet one succeeds. Any client built
   from this needs the halving retry `ecan_air.py` uses.

6. THE HOST REFUSES CONNECTIONS UNDER RAPID OR CONCURRENT LOAD (WinError 10060 /
   connection timeout), and recovers on its own. Requests are serialised with a delay
   and retried with backoff. Do not parallelise this.

USAGE
-----
    python probe_kiwis.py --host envdata.waikatoregion.govt.nz:8080 --out waikato_kiwis.json
    python probe_kiwis.py --report waikato_kiwis.json
    python probe_kiwis.py --host ... --quality --year 2015

A bare --out/--report filename resolves into scripts/probes/ (gitignored — dumps are
large regenerable artefacts, not source). Pass an absolute path to override.
"""
import argparse
import collections
import csv
import io
import json
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

PROBES = Path(__file__).resolve().parent / "probes"

UA = "Auxein-Insights/1.0 (climate data ingestion; pete.taylor@auxein.co.nz)"

# parametertype_name in KiWIS -> our canonical variable. Keys are matched EXACTLY
# (KiWIS filters are exact unless you pass a wildcard), so every accepted spelling
# has to be listed. Nothing is inferred from a substring: "Water Temperature" is a
# river reading and "Enclosure Temperature" is an instrument internal, and both would
# pass a naive match on "Temperature".
MET_PARAMETERS = {
    "Precipitation": "rainfall",
    "Air Temperature": "temp",
    "Humidity": "rh",
    "Wind Speed": "wind_speed",
    "Wind Direction": "wind_direction",
    "Barometric Pressure": "pressure",
    "Solar Radiation": "solar_radiation",
    "Global Radiation": "solar_radiation",
    "Soil Moisture": "soil_moisture_vwc",
    "Soil Temperature": "soil_temp",
    "Dew Point Temperature": "dewpoint",
    "Evapotranspiration": "et",
}

# Which ts_name to take per variable, best first. Anything not listed here is
# DERIVED, MANUAL or LEGACY and is never a candidate:
#   60/61 - LongTerm*      climatology, and its `to` runs into the future
#   40/30/25 - Year/Month/Week totals, 20 - DayAccum, 20 - DayMovTotal   accumulations
#   05 - Observer*         manual flask/dip readings
#   90 - Migrated_*, 99 - *_Old, 01 - CurrentMonthAccum
#   .P2                    a second processing stage that lags the primary
#
# HourTotal is preferred over the native event series for rainfall because it is an
# EXACT aggregate of it (verified: 39.50 mm both ways over one day at Pinnacles) at a
# quarter of the rows.
SERIES_PREFERENCE = {
    "rainfall": ["10 - HourTotal", "00 - Continuous5m.P", "00 - Continuous.P",
                 "00 - Continuous.O", "20 - DayTotal"],
    "_default": ["10 - HourMean", "10 - HourMovMean", "00 - Continuous.P",
                 "00 - Continuous.O", "20 - DayMean"],
}

# Station names matching this, or sitting under SENTINEL_SITE_NO, are staff training
# fixtures rather than instruments. See gotcha 2.
TRAINING = re.compile(r"training", re.I)
SENTINEL_SITE_NO = "99999"

LIVE_WITHIN_DAYS = 30

STATION_FIELDS = ("site_no,site_name,station_no,station_name,station_id,site_id,"
                  "station_latitude,station_longitude,object_type,catchment_name")
TS_FIELDS = ("ts_id,ts_path,ts_name,parametertype_name,stationparameter_name,"
             "ts_unitname,station_no,station_name,coverage")


def kiwis(host, request, delay=1.0, retries=3, **params):
    """One KiWIS query, returned as a list of dicts. Serialised and retried.

    The host drops connections under rapid load and recovers by itself, so a failure
    here is usually pace, not a broken route (gotcha 6).
    """
    params.update(service="kisters", type="queryServices", datasource="0",
                  request=request, format="csv")
    url = f"http://{host}/KiWIS/KiWIS"
    last = None
    for attempt in range(retries):
        try:
            r = requests.get(url, params=params, timeout=(15, 180),
                             headers={"User-Agent": UA})
            r.raise_for_status()
            if r.text.lstrip().startswith("<?xml"):
                # KiWIS reports errors as an ExceptionReport with HTTP 200.
                raise RuntimeError(re.sub(r"<[^>]+>", " ", r.text).strip())
            time.sleep(delay)
            return list(csv.DictReader(io.StringIO(r.text), delimiter=";"))
        except Exception as exc:            # noqa: BLE001 - reported below
            last = exc
            if attempt < retries - 1:
                time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"{request} failed after {retries} attempts: {last}")


def _parse(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def build(host, delay):
    print(f"KiWIS host: {host}")
    stations = {}
    for row in kiwis(host, "getStationList", delay=delay, returnfields=STATION_FIELDS):
        stations[(row["site_no"], row["station_no"])] = row
    print(f"  catalogue: {len(stations)} stations")

    found = {}
    for param, variable in MET_PARAMETERS.items():
        try:
            rows = kiwis(host, "getTimeseriesList", delay=delay,
                         parametertype_name=param, returnfields=TS_FIELDS)
        except RuntimeError as exc:
            print(f"  {param:24s} -> query failed: {exc}")
            continue
        pref = SERIES_PREFERENCE.get(variable, SERIES_PREFERENCE["_default"])
        kept = 0
        for row in rows:
            if row["ts_name"] not in pref:
                continue                      # derived / manual / legacy
            frm, to = _parse(row["from"]), _parse(row["to"])
            if to is None or frm is None:
                continue                      # a declared-but-empty series
            site, station = row["ts_path"].split("/")[:2]
            if site == SENTINEL_SITE_NO or TRAINING.search(row["station_name"]):
                continue                      # gotcha 2
            rank, span = pref.index(row["ts_name"]), (to - frm).days
            series = found.setdefault((site, station), {})
            current = series.get(variable)
            if current is None or (rank, -span) < (current["_rank"], -current["_span"]):
                series[variable] = {
                    "_rank": rank, "_span": span, "ts_id": row["ts_id"],
                    "ts_path": row["ts_path"], "ts_name": row["ts_name"],
                    "unit": row["ts_unitname"],
                    "from": row["from"][:10], "to": row["to"][:10],
                }
            kept += 1
        print(f"  {param:24s} {len(rows):5d} series -> {kept:4d} candidate")

    now = datetime.now(timezone.utc)
    out, skipped = [], 0
    for (site, station), series in found.items():
        meta = stations.get((site, station))
        if not meta or not meta.get("station_latitude"):
            skipped += 1
            continue
        # Liveness from OBSERVATION series only — gotcha 3.
        latest = max(_parse(v["to"] + "T00:00:00+12:00") for v in series.values())
        stale = (now - latest).days
        for v in series.values():
            v.pop("_rank"), v.pop("_span")
        out.append({
            "site_no": site, "station_no": station,
            "station_name": meta["station_name"].strip(),
            "site_name": meta["site_name"].strip(),
            "station_id": meta["station_id"],
            "object_type": meta.get("object_type", ""),
            "lat": float(meta["station_latitude"]),
            "lon": float(meta["station_longitude"]),
            "live": stale <= LIVE_WITHIN_DAYS, "stale_days": stale,
            "series": series,
        })
    out.sort(key=lambda r: (not r["live"], r["station_name"]))
    if skipped:
        print(f"  {skipped} station(s) dropped: no coordinates")
    return {"host": host, "probed": now.isoformat(), "stations": out}


def report(payload):
    rows = payload["stations"]
    live = [r for r in rows if r["live"]]
    print(f"host {payload['host']}   probed {payload['probed'][:19]}")
    print(f"{len(rows)} weather stations with coordinates, {len(live)} live "
          f"(reported within {LIVE_WITHIN_DAYS}d)\n")

    counts = collections.Counter(v for r in live for v in r["series"])
    for variable, n in counts.most_common():
        depth = min(r["series"][variable]["from"] for r in live if variable in r["series"])
        print(f"  {variable:20s} {n:4d} live station(s), earliest {depth}")

    chosen = collections.Counter(v["ts_name"] for r in live for v in r["series"].values())
    print("\n  series chosen: " + ", ".join(f"{k} x{n}" for k, n in chosen.most_common()))

    stale = [r for r in rows if not r["live"]]
    if stale:
        print(f"\n  STALE, not seeded ({len(stale)}):")
        for r in sorted(stale, key=lambda r: -r["stale_days"]):
            print(f"    {r['station_name'][:36]:36s} {r['stale_days']:6d}d")


def quality(host, payload, year, delay, limit):
    """Quality-code distribution over one year — the evidence for the reject set."""
    codes = {int(c["key"]): c["description"]
             for c in json.loads(requests.get(
                 f"http://{host}/KiWIS/KiWIS", params=dict(
                     service="kisters", type="queryServices", datasource="0",
                     request="getQualityCodes", format="csv"),
                 timeout=(15, 120), headers={"User-Agent": UA}).text)
             if c["description"] != "-"}
    live = [r for r in payload["stations"] if r["live"] and "rainfall" in r["series"]]
    total, fetched = collections.Counter(), 0
    for r in live[:limit]:
        try:
            rows = kiwis(host, "getTimeseriesValues", delay=delay,
                         ts_id=r["series"]["rainfall"]["ts_id"],
                         **{"from": f"{year}-01-01", "to": f"{year}-12-31",
                            "returnfields": "Timestamp,Value,Quality Code"})
        except RuntimeError as exc:
            print(f"  {r['station_name'][:30]}: {exc}")
            continue
        fetched += 1
        for row in rows:
            code = list(row.values())[-1]
            if code:
                total[int(code)] += 1
    n = sum(total.values()) or 1
    print(f"\n=== quality codes, chosen rainfall series, {year}, "
          f"{fetched} station(s), {n:,d} values ===")
    for code, count in total.most_common():
        label = codes.get(code, "NOT IN getQualityCodes")
        print(f"  {code:4d} {label[:44]:46s} {count:9,d}  {100 * count / n:5.2f}%")


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", help="e.g. envdata.waikatoregion.govt.nz:8080")
    p.add_argument("--out", help="dump file (bare name resolves into scripts/probes/)")
    p.add_argument("--report", help="summarise an existing dump")
    p.add_argument("--quality", action="store_true",
                   help="also report the quality-code distribution")
    p.add_argument("--year", default="2015", help="year to sample for --quality")
    p.add_argument("--limit", type=int, default=14,
                   help="stations to sample for --quality")
    p.add_argument("--delay", type=float, default=1.0,
                   help="seconds between requests; the host drops rapid load")
    args = p.parse_args()

    def resolve(name):
        path = Path(name)
        return path if path.is_absolute() else PROBES / path

    if args.report:
        payload = json.loads(resolve(args.report).read_text(encoding="utf-8"))
        report(payload)
        if args.quality:
            if not args.host:
                sys.exit("--quality with --report needs --host too")
            quality(args.host, payload, args.year, args.delay, args.limit)
        return

    if not args.host:
        sys.exit("--host is required (or use --report)")
    payload = build(args.host, args.delay)
    if args.out:
        path = resolve(args.out)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=1), encoding="utf-8")
        print(f"\nwrote {path}")
    report(payload)
    if args.quality:
        quality(args.host, payload, args.year, args.delay, args.limit)


if __name__ == "__main__":
    main()
