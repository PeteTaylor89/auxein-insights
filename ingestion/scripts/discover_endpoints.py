#!/usr/bin/env python
"""Discover which environmental-data platform a council runs, and where.

The councils already on the platform were each found by hand. The six
remaining ones (Horizons, Waikato, Bay of Plenty, Taranaki, Auckland, West
Coast) run an unknown mix of Hilltop, AQUARIUS and bespoke portals, so this
sweeps a candidate matrix of hosts x endpoint paths and reports what answers.

Read-only and keyless. Nothing here writes to the DB.

A host is classified by what it returns:
  hilltop   - an XML body carrying <HilltopServer> / Agency / a SiteList
  aquarius  - an AQUARIUS Web Portal / WebService fingerprint
  http-ok   - responds, but is not obviously either (worth a human look)

Usage:
    python ingestion/scripts/discover_endpoints.py
    python ingestion/scripts/discover_endpoints.py --council horizons
    python ingestion/scripts/discover_endpoints.py --timeout 8 --out probes/discovery.json
"""
import argparse
import concurrent.futures
import json
import sys
from pathlib import Path

import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

PROBE_DIR = Path(__file__).resolve().parent / "probes"

UA = {"User-Agent": "Auxein-Insights/1.0 (climate data ingestion; pete.taylor@auxein.co.nz)"}

# Hilltop servers answer Service=Hilltop&Request=Status on their .hts endpoint.
HILLTOP_QUERY = {"Service": "Hilltop", "Request": "Status"}

# Endpoint filenames seen across the councils already integrated: data.hts
# (most), EMAR.hts (HBRC), Global.hts / Telemetry.hts (ORC).
HTS_PATHS = [
    "/data.hts", "/Data.hts", "/EMAR.hts", "/Global.hts", "/Telemetry.hts",
    "/hilltop/data.hts", "/hilltop/Global.hts", "/wgn/data.hts",
]

# AQUARIUS Web Portal exposes a public JSON/REST surface under these prefixes.
AQ_PATHS = [
    "/AQWebPortal", "/AQWebPortal/Data", "/Data",
    "/AQUARIUS/Publish/v2/session",
]

COUNCILS = {
    "horizons": [
        "https://hilltop.horizons.govt.nz", "http://hilltop.horizons.govt.nz",
        "https://envdata.horizons.govt.nz", "http://hydrology.horizons.govt.nz",
        "https://data.horizons.govt.nz",
    ],
    "waikato": [
        "https://hilltop.waikatoregion.govt.nz", "http://hilltop.waikatoregion.govt.nz",
        "https://data.waikatoregion.govt.nz", "https://envdata.waikatoregion.govt.nz",
        "https://hydrology.waikatoregion.govt.nz",
    ],
    "boprc": [
        "https://envdata.boprc.govt.nz", "http://envdata.boprc.govt.nz",
        "https://hilltop.boprc.govt.nz", "https://monitoring.boprc.govt.nz",
        "https://data.boprc.govt.nz",
    ],
    "taranaki": [
        "https://hilltop.trc.govt.nz", "https://extranet.trc.govt.nz",
        "https://envdata.trc.govt.nz", "https://data.trc.govt.nz",
    ],
    "auckland": [
        "https://environmentdata.aucklandcouncil.govt.nz",
        "https://hilltop.aucklandcouncil.govt.nz",
        "https://envdata.aucklandcouncil.govt.nz",
    ],
    "westcoast": [
        "https://hilltop.wcrc.govt.nz", "http://hilltop.wcrc.govt.nz",
        "https://envdata.wcrc.govt.nz", "https://data.wcrc.govt.nz",
        "https://webportal.wcrc.govt.nz",
    ],
}


def classify(body: str, ctype: str):
    low = body[:4000].lower()
    if "hilltopserver" in low or "<agency>" in low or "<sitelist" in low:
        return "hilltop"
    if "aquarius" in low or "aqwebportal" in low:
        return "aquarius"
    if "hilltop" in low:
        return "hilltop?"
    return "http-ok"


def probe(url: str, params, timeout: int):
    try:
        r = requests.get(url, params=params, headers=UA, timeout=timeout, verify=False)
    except requests.exceptions.SSLError as e:
        return {"url": url, "error": f"ssl: {type(e).__name__}"}
    except requests.exceptions.ConnectionError:
        return {"url": url, "error": "no-connect"}
    except requests.exceptions.Timeout:
        return {"url": url, "error": "timeout"}
    except Exception as e:  # noqa: BLE001 - discovery sweep, report anything
        return {"url": url, "error": f"{type(e).__name__}: {e}"}

    if r.status_code >= 400:
        return {"url": url, "error": f"http {r.status_code}"}

    body = r.text or ""
    return {
        "url": r.url,
        "status": r.status_code,
        "kind": classify(body, r.headers.get("Content-Type", "")),
        "content_type": r.headers.get("Content-Type", ""),
        "snippet": " ".join(body[:300].split()),
    }


def targets_for(hosts):
    for host in hosts:
        for p in HTS_PATHS:
            yield host + p, HILLTOP_QUERY
        for p in AQ_PATHS:
            yield host + p, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--council", choices=sorted(COUNCILS), help="probe just one")
    ap.add_argument("--timeout", type=int, default=10)
    ap.add_argument("--out", default="discovery.json")
    args = ap.parse_args()

    councils = {args.council: COUNCILS[args.council]} if args.council else COUNCILS

    results = {}
    for name, hosts in councils.items():
        print(f"\n=== {name} ===", flush=True)
        jobs = list(targets_for(hosts))
        found = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
            futs = {ex.submit(probe, u, p, args.timeout): u for u, p in jobs}
            for fut in concurrent.futures.as_completed(futs):
                res = fut.result()
                if "error" in res:
                    continue
                found.append(res)
                print(f"  [{res['kind']:9}] {res['url']}")
                print(f"              {res['snippet'][:160]}")
        if not found:
            print("  (nothing responded)")
        results[name] = found

    out = Path(args.out)
    if not out.is_absolute() and out.parent == Path("."):
        PROBE_DIR.mkdir(parents=True, exist_ok=True)
        out = PROBE_DIR / out
    out.write_text(json.dumps(results, indent=2))
    print(f"\nWrote {out}")


if __name__ == "__main__":
    sys.exit(main())
