#!/usr/bin/env python
"""Find the backing data APIs for Waikato Regional Council and Taranaki Regional Council.

Neither council answered the Hilltop/AQUARIUS host sweep in
discover_endpoints.py, but both publish live monitoring pages that update every
15 minutes — so an API exists, it is just not on a guessable hostname. This
walks the public pages, pulls every script/fetch/XHR-looking URL out of the
HTML and the JS bundles they load, and reports anything that smells like a data
endpoint.

Read-only and keyless.

Usage:
    python ingestion/scripts/probe_wrc_trc.py
    python ingestion/scripts/probe_wrc_trc.py --council taranaki
"""
import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

PROBE_DIR = Path(__file__).resolve().parent / "probes"
UA = {"User-Agent": "Mozilla/5.0 (compatible; AuxeinIngest/1.0)"}

PAGES = {
    "waikato": [
        "https://www.waikatoregion.govt.nz/environment/envirohub/environmental-maps-and-data/",
        "https://www.waikatoregion.govt.nz/environment/envirohub/",
        "https://www.waikatoregion.govt.nz/services/data-catalogue/",
    ],
    "taranaki": [
        "https://www.trc.govt.nz/MyTRC",
        "https://www.trc.govt.nz/environment/maps-and-data/regional-overview",
        "https://www.trc.govt.nz/environment/maps-and-data",
    ],
}

# URL shapes that look like a data API rather than a static asset.
INTERESTING = re.compile(
    r"(api|json|data|rest|service|telemetry|hilltop|aquarius|aqwebportal|"
    r"getdata|sites?|measurement|observation|feed|odata|graphql|\.hts|\.ashx)",
    re.I,
)
BORING_EXT = re.compile(r"\.(png|jpe?g|gif|svg|woff2?|ttf|eot|ico|css|mp4|webp|pdf)(\?|$)", re.I)

URL_RE = re.compile(r"""["'`](https?://[^"'`\s]{6,200}|/[A-Za-z0-9_\-./]{4,160})["'`]""")


def fetch(url, session, timeout=25):
    try:
        r = session.get(url, headers=UA, timeout=timeout, verify=False)
        if r.status_code >= 400:
            return None
        return r
    except Exception:
        return None


def harvest(text, base):
    out = set()
    for m in URL_RE.finditer(text):
        u = m.group(1)
        if BORING_EXT.search(u):
            continue
        if not INTERESTING.search(u):
            continue
        out.add(urljoin(base, u))
    return out


def probe_council(name, session):
    print(f"\n=== {name} ===", flush=True)
    found = set()
    scripts = set()

    for page in PAGES[name]:
        r = fetch(page, session)
        if not r:
            print(f"  ! could not fetch {page}")
            continue
        print(f"  fetched {page} ({len(r.text)} bytes)")
        found |= harvest(r.text, page)
        for m in re.finditer(r'<script[^>]+src=["\']([^"\']+)["\']', r.text):
            src = urljoin(page, m.group(1))
            if urlparse(src).netloc.endswith(("waikatoregion.govt.nz", "trc.govt.nz")):
                scripts.add(src)

    print(f"  walking {len(scripts)} same-origin script(s)")
    for src in sorted(scripts):
        r = fetch(src, session, timeout=40)
        if not r:
            continue
        hits = harvest(r.text, src)
        if hits:
            print(f"    {src.split('/')[-1][:60]}: {len(hits)} candidate(s)")
        found |= hits

    ranked = sorted(found, key=lambda u: (-len(INTERESTING.findall(u)), u))
    print(f"\n  {len(ranked)} candidate endpoint(s):")
    for u in ranked[:60]:
        print(f"    {u}")
    return ranked


def verify(urls, session):
    """Hit each candidate and report which return JSON/XML rather than HTML."""
    print("\n  --- verifying candidates ---")
    live = []
    for u in urls[:60]:
        r = fetch(u, session, timeout=20)
        if not r:
            continue
        ct = r.headers.get("Content-Type", "")
        body = (r.text or "")[:200]
        if "json" in ct.lower() or "xml" in ct.lower() or body.lstrip()[:1] in "[{<":
            if body.lstrip().lower().startswith("<!doctype") or body.lstrip().lower().startswith("<html"):
                continue
            live.append({"url": u, "content_type": ct, "snippet": " ".join(body.split())[:160]})
            print(f"    [DATA] {u}\n           {ct} :: {' '.join(body.split())[:120]}")
    return live


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--council", choices=sorted(PAGES))
    ap.add_argument("--out", default="wrc_trc_discovery.json")
    args = ap.parse_args()

    councils = [args.council] if args.council else sorted(PAGES)
    session = requests.Session()

    results = {}
    for name in councils:
        cands = probe_council(name, session)
        results[name] = {"candidates": cands, "data_endpoints": verify(cands, session)}

    PROBE_DIR.mkdir(parents=True, exist_ok=True)
    out = PROBE_DIR / args.out
    out.write_text(json.dumps(results, indent=2))
    print(f"\nWrote {out}")


if __name__ == "__main__":
    sys.exit(main())
