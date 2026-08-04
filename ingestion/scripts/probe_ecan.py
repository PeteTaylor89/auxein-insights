#!/usr/bin/env python
"""Probe the ECan open data portal for the full Canterbury rainfall site catalogue.

ECan is not a Hilltop agency — `hilltop.ecan.govt.nz` does not resolve — so the
Hilltop probe does not apply. Its open data portal exposes per-method endpoints
under `/data/{MethodId}/{Collection}/{MethodName}/{format}`, and method 51
("Rainfall summary by area", Sites=NORTH|SOUTH) is the only one that enumerates
sites: it returns every site either side of the Rakaia River with SITE_NO,
WGS84 coordinates, owner and last-sample time.

Only rainfall is available. The portal's other collections are air quality,
water quality/quantity and transport — there is **no climate/temperature
collection**, so ECan contributes rainfall density only.

The `/data/...` endpoints do not require the portal's terms-acceptance cookie;
only the human-facing `/Catalogue/...` pages do.

Usage:
    python ingestion/scripts/probe_ecan.py            # writes probes/ecan_sites.json
"""
import argparse
import json
import sys
from pathlib import Path

import requests

PROBES = Path(__file__).resolve().parent / "probes"
OUT_FILE = PROBES / "ecan_sites.json"

SUMMARY_URL = ("https://data.ecan.govt.nz/data/51/Rainfall/"
               "Rainfall%20summary%20by%20area/JSON")
AREAS = ("NORTH", "SOUTH")

# The portal serialises its column names with XML name-escaping.
KEY_NAME = "Site_x0020_Name"
KEY_LAST = "Last_x0020_Sample"


def fetch_area(area: str, timeout: int = 90) -> list:
    resp = requests.get(SUMMARY_URL, params={"Sites": area, "zip": "0"},
                        timeout=timeout,
                        headers={"User-Agent": "Auxein-Insights/1.0 (weather ingestion)"})
    resp.raise_for_status()
    payload = resp.json()
    items = payload.get("data", {}).get("item", [])
    if isinstance(items, dict):  # single-item responses collapse to an object
        items = [items]
    return items


def main():
    ap = argparse.ArgumentParser(description="Probe ECan rainfall site catalogue")
    ap.add_argument("--out", default=str(OUT_FILE))
    args = ap.parse_args()

    sites = {}
    for area in AREAS:
        print(f"Fetching {area} ...")
        items = fetch_area(area)
        print(f"  {len(items)} sites")
        for it in items:
            site_no = (it.get("SITE_NO") or "").strip()
            if not site_no:
                continue
            lat, lon = it.get("WGS84_Latitude"), it.get("WGS84_Longitude")
            sites[site_no] = {
                "site_no": site_no,
                "name": (it.get(KEY_NAME) or "").strip(),
                "short_name": (it.get("ShortName") or "").strip(),
                "lat": float(lat) if lat else None,
                "lon": float(lon) if lon else None,
                # Owner casing is inconsistent in the feed (ECan/Ecan/ECAN).
                "owner": (it.get("SiteOwner") or "").strip(),
                "area": area,
                "last_sample": it.get(KEY_LAST),
            }

    with_coords = sum(1 for s in sites.values() if s["lat"] and s["lon"])
    out = {
        "source": "ECAN",
        "endpoint": SUMMARY_URL,
        "site_count": len(sites),
        "with_coords": with_coords,
        "measurements": ["rainfall"],
        "sites": sites,
    }
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(out, indent=2), encoding="utf-8")

    print(f"\n{'='*60}")
    print(f"ECan probe complete — {len(sites)} sites ({with_coords} with coords)")
    print(f"Written to {args.out}")
    print(f"{'='*60}")
    missing = [s["name"] for s in sites.values() if not (s["lat"] and s["lon"])]
    if missing:
        print(f"No coordinates ({len(missing)}): {', '.join(missing)}")


if __name__ == "__main__":
    main()
