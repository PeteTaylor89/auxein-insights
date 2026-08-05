#!/usr/bin/env python
"""Probe the AQUARIUS Web Portal deployments (ORC, Bay of Plenty, Auckland).

All three councils run the same AQUARIUS Web Portal build, so one client covers
them — see [[project_council_platform_discovery]].

WHAT WORKS ANONYMOUSLY: the full station catalogue — identifiers, names, WGS84
coordinates, and per-location dataset metadata including parameter name and
period of record. That is everything `seed_*_from_probe.py` needs.

WHAT DOES NOT: the observation points themselves. `/Data/DatasetBase/` answers
`Permission Denied` on all three portals for an anonymous session, so this
probe cannot be turned into an ingestion client as-is. See MISSING below.

    GET  /Disclaimer                        -> __RequestVerificationToken
    POST /AcceptDisclaimer                  -> session cookie
    POST /Data/Data_List                    -> paged locations WITH LocX/LocY
    GET  /Data/Datasets/?locationId={id}    -> datasets at that location
    GET  /Data/SearchLocations?term={s}     -> autocomplete (no coordinates)

Traps, each of which returns HTTP 200 and looks like an empty result rather
than an error:

1. `/Data/SearchLocations` takes `term`, NOT `searchTerm`. It also returns
   DOUBLE-ENCODED JSON — a JSON string containing the array — so `r.json()`
   hands back a `str` needing a second `json.loads`. It carries no coordinates,
   which is why `Data_List` is the endpoint that actually matters.
2. `/Data/Datasets/` takes `locationId` (or `LocationId`). `id`, `location`
   and `locId` all return `[]`.
3. Unmatched `/Data/*` routes answer 200 with an EMPTY BODY. An empty 200 is
   not evidence a route exists; POST is the discriminator, since a real route
   answers 200 and an unmatched one a genuine 404.

The route table is not guessable and was not in the file previous notes point
at. `aqPortalMin.min.js` is Kendo vendor code, but **`dataControl.min.js` and
`admin.min.js` contain the complete list of ~70 routes** as plain literals.
Re-read those two bundles if this ever breaks.

MISSING — the observation-point route. `/Export/BulkExportJson` and the rest of
the `/Export/*` controller return empty 200s because that controller keeps
server-side state across `ExportBase` -> `ValidateExport` -> `RunExport`.
`/Data/DatasetBase/` is permission-gated. The untried lead is the `/Widget/*`
controller (`/Widget/SaveWidget` is referenced from `/Data/ShowWidget/`), since
the public dashboards do render real data anonymously.

Read-only and keyless.

Usage:
    python ingestion/scripts/probe_aquarius.py
    python ingestion/scripts/probe_aquarius.py --council orc --datasets
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path

import requests

PROBE_DIR = Path(__file__).resolve().parent / "probes"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

COUNCILS = {
    "orc":   ("Otago", "https://envdata.orc.govt.nz/AQWebPortal"),
    "boprc": ("Bay of Plenty", "https://envdata.boprc.govt.nz"),
    "akl":   ("Auckland", "https://environmentauckland.org.nz"),
}

PAGE_SIZE = 200

TOKEN_RE = re.compile(r'name="__RequestVerificationToken"[^>]*value="([^"]+)"')


def open_session(base):
    """Accept the disclaimer and return a session carrying the portal cookie."""
    s = requests.Session()
    s.headers["User-Agent"] = UA
    r = s.get(base + "/Disclaimer", timeout=30)
    r.raise_for_status()
    m = TOKEN_RE.search(r.text)
    if not m:
        raise RuntimeError(f"no anti-forgery token at {base}/Disclaimer")
    s.post(base + "/AcceptDisclaimer",
           data={"__RequestVerificationToken": m.group(1)},
           headers={"Referer": base + "/Disclaimer"}, timeout=30)
    s.headers.update({"X-Requested-With": "XMLHttpRequest",
                      "Referer": base + "/Data"})
    return s


def locations(s, base):
    """Every location with coordinates, via the Kendo grid behind the list tab."""
    out, skip = [], 0
    while True:
        r = s.post(base + "/Data/Data_List",
                   data={"page": skip // PAGE_SIZE + 1, "pageSize": PAGE_SIZE,
                         "take": PAGE_SIZE, "skip": skip},
                   timeout=90)
        body = r.json()
        rows = body.get("Data") or []
        out.extend(rows)
        total = body.get("Total") or 0
        skip += PAGE_SIZE
        print(f"    {len(out)}/{total}")
        if len(out) >= total or not rows:
            return out


def datasets(s, base, location_id):
    """Datasets at one location: parameter name, label, and period of record."""
    r = s.get(base + "/Data/Datasets/",
              params={"locationId": location_id}, timeout=60)
    try:
        body = r.json()
    except ValueError:
        return []
    return body if isinstance(body, list) else []


def probe(key, want_datasets, delay):
    region, base = COUNCILS[key]
    print(f"\n{'=' * 72}\n{key.upper()}  {region}  {base}")
    s = open_session(base)

    print("  locations:")
    locs = locations(s, base)
    with_coords = [l for l in locs if l.get("LocX") and l.get("LocY")]
    print(f"  -> {len(locs)} locations, {len(with_coords)} with coordinates")

    if want_datasets:
        print("  datasets (one call per location):")
        for i, l in enumerate(locs, 1):
            l["Datasets"] = datasets(s, base, l["LocationId"])
            if i % 25 == 0:
                print(f"    {i}/{len(locs)}")
            time.sleep(delay)
        n = sum(len(l.get("Datasets") or []) for l in locs)
        print(f"  -> {n} datasets across {len(locs)} locations")

    out = PROBE_DIR / f"aquarius_{key}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(
        {"council": key, "region": region, "base": base, "locations": locs},
        indent=1), encoding="utf-8")
    print(f"  wrote {out}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--council", choices=sorted(COUNCILS), action="append",
                    help="repeatable; default is all three")
    ap.add_argument("--datasets", action="store_true",
                    help="also pull per-location dataset metadata (slow: one call each)")
    ap.add_argument("--delay", type=float, default=0.2)
    a = ap.parse_args()
    for key in (a.council or sorted(COUNCILS)):
        try:
            probe(key, a.datasets, a.delay)
        except Exception as e:
            print(f"  FAILED {key}: {type(e).__name__}: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
