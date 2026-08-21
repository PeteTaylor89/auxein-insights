#!/usr/bin/env python
"""Probe a HydroTel Web Service and dump a weather-station inventory.

Written 2026-08-21 for Otago (ORC). Findings and the access position are in
`docs/plans/PROBE_WAIKATO_KIWIS_2026-08-21.md`.

READ-ONLY. Makes GET requests only.

**THIS SCRIPT CANNOT RUN WITHOUT CREDENTIALS AND HAS NEVER BEEN RUN AGAINST LIVE
DATA.** It is written to the vendor's published contract (the API documents itself
at `https://hydrotel.orc.govt.nz/api/`), not against observed responses, so treat
every response-shape assumption below as unverified until someone runs it. It
exists so that the moment ORC grants an account the work is a run, not a build.

ACCESS
------
ORC runs HydroTel (HyQuest Solutions / Kisters) at `hydrotel.orc.govt.nz`, entirely
separate from the AQUARIUS portal at `envdata.orc.govt.nz/AQWebPortal` and NOT
subject to its permission model (the empty `Statistics` group / "Permission Denied"
panel documented 2026-08-05).

Two surfaces, both credential-gated as of 2026-08-21:
  * `/api/hydapi.dll/*`  — the Web Service. **HTTP Basic auth only**, same
    credentials as the HydroTel desktop client. 401 anonymously AND with the
    vendor's documented `guest`/`guest` (those work only on the vendor's own demo
    host, `data.kisters.co.nz`).
  * `/hydrotel/cgi-bin/hydweb.cgi` — "ORC: Online Data Network Portal", the human
    UI. Every route 302s to a login.

So the ask is narrow and nameable: **a HydroTel Web Service account for
hydrotel.orc.govt.nz**. That is a routine product credential rather than a bespoke
data agreement, which is why ORC is the most likely of the remaining councils to
open next.

THE CONTRACT, AND FOUR THINGS TO GET RIGHT
------------------------------------------
1. **`GetLoggedData` returns at most 1000 records per request**, in DESCENDING date
   order, and signals truncation with `"DataLimited": true` plus `"NextDT"` — the
   timestamp to use as the *FinishDT* of the next request, because you are walking
   backwards. This is a small page: a 5-minute series is ~3.5 days per request, so
   a 2020-onward backfill is several hundred requests per point. Page on the
   server's own `NextDT`, never on a computed window.

2. **Timestamps carry NO TIMEZONE.** The docs say so explicitly: "times in HydroTel
   are not referenced to a specific time zone". Everything else we ingest either
   carries an offset (KiWIS, ECan) or is documented NZ-local (Hilltop). **Which one
   this is must be MEASURED before any backfill** — compare a known rainfall event
   against a neighbouring ORC gauge we already hold, or against SYNOP. Getting it
   wrong is a silent 12-13 hour shear, and if it is naive-local it carries the
   spring-forward collision that `db_util._utc_key` exists for.

3. **Quality is an integer with a documented vocabulary**: 1=Telemetered,
   2=Imported, 3=Edited, 4=Partial (avg or sum), **5=Missing/Invalid**. Reject 5.
   Treat 4 with care — a "Partial" sum is not a full-interval total and summing it
   into a daily figure understates.

4. **The tree is five levels** — District > Catchment > Site > Object > Point — and
   a "Point" is the series. Coordinates live on the Site (`LocationX`/`LocationY`,
   and note the docs' example has X=latitude, Y=longitude, which is the opposite of
   the usual convention — VERIFY before seeding, a transposed NZ coordinate lands
   in the Indian Ocean and is obvious, but a plausible-looking one would not be).

Usage:
    python probe_hydrotel.py --host hydrotel.orc.govt.nz --user U --password P \
        --out orc_hydrotel.json
    python probe_hydrotel.py --report orc_hydrotel.json

Credentials may also come from HYDROTEL_USER / HYDROTEL_PASSWORD.
"""
import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

import requests
from requests.auth import HTTPBasicAuth

PROBES = Path(__file__).resolve().parent / "probes"
UA = "Auxein-Insights/1.0 (climate data ingestion; pete.taylor@auxein.co.nz)"

# Point Name -> our canonical variable. HydroTel point names are site-configured
# free text, so this WILL need extending once a real catalogue is in hand — that is
# the first thing --report is for. Matched case-insensitively on the whole name.
#
# Deliberately exact-match, not substring: "Water Temperature" is a river reading
# and "Enclosure Temperature" / "BAM Air Temperature" are instrument internals, and
# all three contain "Temperature". WCRC's Reefton BAM sites are the standing
# example of why a naive name filter injects a warm bias.
MEASUREMENT_MAP = {
    "rainfall": "rainfall",
    "rain": "rainfall",
    "precipitation": "rainfall",
    "air temperature": "temp",
    "temperature": "temp",
    "relative humidity": "rh",
    "humidity": "rh",
    "wind speed": "wind_speed",
    "wind direction": "wind_direction",
    "wind gust": "wind_gust",
    "barometric pressure": "pressure",
    "atmospheric pressure": "pressure",
    "solar radiation": "solar_radiation",
    "soil temperature": "soil_temp",
    "soil moisture": "soil_moisture_vwc",
}

# Names that look meteorological and are not. See trap 4 in the module docstring.
EXCLUDE_NAME = re.compile(
    r"water temp|enclosure|cabinet|board temp|bam |internal|battery|logger temp",
    re.I)

QUALITY = {1: "Telemetered", 2: "Imported", 3: "Edited",
           4: "Partial (avg or sum)", 5: "Missing/Invalid"}
REJECT_QUALITY = {5}

REQUEST_DELAY = 0.5


class HydroTel:
    def __init__(self, host, user, password, delay=REQUEST_DELAY):
        self.base = f"https://{host}/api/hydapi.dll"
        self.auth = HTTPBasicAuth(user, password)
        self.delay = delay
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": UA})

    def call(self, request, **params):
        r = self.session.get(f"{self.base}/{request}", params=params,
                             auth=self.auth, timeout=(15, 120), verify=False)
        if r.status_code == 401:
            raise SystemExit(
                "401 Unauthorized — HydroTel takes HTTP Basic auth with the same\n"
                "credentials as the desktop client. Anonymous and guest/guest are\n"
                "both refused on ORC's instance; this needs a real account.")
        r.raise_for_status()
        time.sleep(self.delay)
        try:
            payload = r.json()
        except ValueError as exc:
            raise SystemExit(f"{request}: non-JSON response ({exc}); "
                             f"first 200 chars: {r.text[:200]!r}")
        result = payload.get("result")
        if result is None:
            return []
        # "For most requests it will be a JSON Object if there are 0 or 1 results
        # in the data set, otherwise a JSON Array" — the same single-item-collapses
        # trap ECan and Hilltop both have.
        return [result] if isinstance(result, dict) else result

    def tree(self, level, parent_id=None):
        params = {"Level": level}
        if parent_id is not None:
            params["ParentID"] = parent_id
        return self.call("GetTreeItems", **params)

    def details(self, level, item_id):
        got = self.call("GetItemDetails", Level=level, ItemID=item_id)
        return got[0] if got else {}


def walk(api, verbose=True):
    """District > Catchment > Site > Object > Point. Returns seedable sites."""
    sites = []
    districts = api.tree("District")
    if verbose:
        print(f"  districts: {len(districts)}")
    for d in districts:
        did = d.get("District")
        for c in api.tree("Catchment", did):
            cid = c.get("Catchment")
            for s in api.tree("Site", cid):
                sid = s.get("Site")
                meta = api.details("Site", sid)
                points = []
                for o in api.tree("Object", sid):
                    oid = o.get("Object")
                    for p in api.tree("Point", oid):
                        name = (p.get("Name") or "").strip()
                        if EXCLUDE_NAME.search(name):
                            continue
                        variable = MEASUREMENT_MAP.get(name.casefold())
                        if not variable:
                            points.append({"point": p.get("Point"), "name": name,
                                           "variable": None})
                            continue
                        points.append({"point": p.get("Point"), "name": name,
                                       "variable": variable})
                mapped = [p for p in points if p["variable"]]
                if not mapped:
                    continue
                sites.append({
                    "site": sid,
                    "name": (s.get("Name") or "").strip(),
                    "long_name": s.get("LongName"),
                    "district": d.get("Name"),
                    "catchment": c.get("Name"),
                    # NOTE: docs show LocationX as the LATITUDE. Verify before use.
                    "location_x": meta.get("LocationX"),
                    "location_y": meta.get("LocationY"),
                    "elevation": meta.get("Elevation"),
                    "established": meta.get("EstablishedDate"),
                    "points": points,
                })
                if verbose:
                    print(f"    {s.get('Name','?')[:44]:44s} "
                          f"{len(mapped)} mapped / {len(points)} point(s)")
    return sites


def report(payload):
    sites = payload["sites"]
    print(f"host {payload['host']}   {len(sites)} site(s) with a mapped met point\n")
    counts, unmapped = {}, {}
    for s in sites:
        for p in s["points"]:
            if p["variable"]:
                counts[p["variable"]] = counts.get(p["variable"], 0) + 1
            else:
                unmapped[p["name"]] = unmapped.get(p["name"], 0) + 1
    for variable, n in sorted(counts.items(), key=lambda x: -x[1]):
        print(f"  {variable:20s} {n:4d} site(s)")
    if unmapped:
        print("\n  UNMAPPED point names — extend MEASUREMENT_MAP if any are "
              "meteorological, and check none is an instrument internal:")
        for name, n in sorted(unmapped.items(), key=lambda x: -x[1])[:40]:
            print(f"    {name[:56]:56s} x{n}")
    missing = [s["name"] for s in sites
               if not s.get("location_x") or not s.get("location_y")]
    if missing:
        print(f"\n  {len(missing)} site(s) WITHOUT coordinates — not seedable: "
              f"{', '.join(missing[:8])}")


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="hydrotel.orc.govt.nz")
    p.add_argument("--user", default=os.environ.get("HYDROTEL_USER"))
    p.add_argument("--password", default=os.environ.get("HYDROTEL_PASSWORD"))
    p.add_argument("--out")
    p.add_argument("--report")
    p.add_argument("--delay", type=float, default=REQUEST_DELAY)
    args = p.parse_args()

    def resolve(name):
        path = Path(name)
        return path if path.is_absolute() else PROBES / path

    if args.report:
        report(json.loads(resolve(args.report).read_text(encoding="utf-8")))
        return

    if not args.user or not args.password:
        sys.exit("HydroTel needs HTTP Basic credentials: pass --user/--password or "
                 "set HYDROTEL_USER / HYDROTEL_PASSWORD.\n"
                 "ORC has not granted an account as of 2026-08-21 — see the module "
                 "docstring for the exact ask.")

    api = HydroTel(args.host, args.user, args.password, args.delay)
    print(f"HydroTel host: {args.host}")
    sites = walk(api)
    payload = {"host": args.host, "sites": sites}
    if args.out:
        path = resolve(args.out)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=1), encoding="utf-8")
        print(f"\nwrote {path}")
    report(payload)


if __name__ == "__main__":
    main()
