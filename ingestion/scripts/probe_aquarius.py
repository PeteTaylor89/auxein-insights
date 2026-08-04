#!/usr/bin/env python
"""Probe the AQUARIUS Web Portal deployments (ORC, Bay of Plenty, Auckland).

All three councils run byte-identical AQUARIUS Web Portal instances, so one
client covers them — see docs and [[project_council_platform_discovery]].

The portal was previously believed to need a browser HAR capture. It does not,
for the site catalogue: the gate is an ordinary anti-forgery form, and the
autocomplete endpoint behind it enumerates every location.

    GET  /Disclaimer                     -> __RequestVerificationToken
    POST /AcceptDisclaimer               -> session cookie
    GET  /Data/SearchLocations?term=<s>  -> JSON array of locations

Three things about that last call are non-obvious and each one silently
returns nothing rather than erroring:

1. The parameter is `term`, NOT `searchTerm`. `searchTerm` returns the literal
   body `[{}]` with HTTP 200 — it looks like an empty result set, not a bad
   request.
2. The body is DOUBLE-ENCODED JSON — a JSON string that itself contains the
   JSON array. `r.json()` hands back a `str`; it needs a second `json.loads`.
3. Unmatched `/Data/*` routes answer **200 with an empty body**, so an empty
   200 is not evidence a route exists. POST is the reliable discriminator: a
   real route answers 200, an unmatched one answers a genuine 404.

There is no wildcard, so the catalogue is enumerated by sweeping single
characters and deduping on `IDNumber`.

Read-only and keyless.

Usage:
    python ingestion/scripts/probe_aquarius.py
    python ingestion/scripts/probe_aquarius.py --council orc
"""
import argparse
import json
import re
import string
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

# Single characters to sweep. Digits matter: many AQUARIUS location codes are
# numeric, and a letter-only sweep misses them entirely.
SWEEP = string.ascii_lowercase + string.digits

TOKEN_RE = re.compile(
    r'name="__RequestVerificationToken"[^>]*value="([^"]+)"')


def open_session(base: str) -> requests.Session:
    """Accept the disclaimer and return a session carrying the portal cookie."""
    s = requests.Session()
    s.headers["User-Agent"] = UA
    r = s.get(base + "/Disclaimer", timeout=30)
    r.raise_for_status()
    m = TOKEN_RE.search(r.text)
    if not m:
        raise RuntimeError(f"no anti-forgery token on {base}/Disclaimer")
    s.post(base + "/AcceptDisclaimer",
           data={"__RequestVerificationToken": m.group(1)},
           headers={"Referer": base + "/Disclaimer"},
           timeout=30)
    s.headers.update({"X-Requested-With": "XMLHttpRequest",
                      "Referer": base + "/Data"})
    return s


def search(s: requests.Session, base: str, term: str):
    """One autocomplete call. Returns [] on any shape we do not recognise."""
    r = s.get(base + "/Data/SearchLocations", params={"term": term}, timeout=45)
    if r.status_code != 200 or not r.content:
        return []
    try:
        body = r.json()
    except ValueError:
        return []
    if isinstance(body, str):          # double-encoded — see module docstring
        try:
            body = json.loads(body)
        except ValueError:
            return []
    if not isinstance(body, list):
        return []
    return [x for x in body if isinstance(x, dict) and x.get("IDNumber")]


def datasets_of(entry: dict) -> int:
    """`Subtext` is the string 'Data Sets: N' — pull N out of it."""
    m = re.search(r"Data Sets:\s*(\d+)", entry.get("Subtext") or "")
    return int(m.group(1)) if m else 0


def probe(key: str, delay: float):
    region, base = COUNCILS[key]
    print(f"\n{'=' * 72}\n{key.upper()}  {region}  {base}")
    s = open_session(base)
    found = {}
    for ch in SWEEP:
        hits = search(s, base, ch)
        new = 0
        for h in hits:
            if h["IDNumber"] not in found:
                found[h["IDNumber"]] = h
                new += 1
        print(f"  term={ch!r:5} hits={len(hits):5}  new={new:5}  total={len(found)}")
        time.sleep(delay)

    with_data = [v for v in found.values() if datasets_of(v) > 0]
    print(f"  -> {len(found)} locations, {len(with_data)} carrying at least one data set")

    out = PROBE_DIR / f"aquarius_{key}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({
        "council": key,
        "region": region,
        "base": base,
        "locations": list(found.values()),
    }, indent=1), encoding="utf-8")
    print(f"  wrote {out}")
    return found


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--council", choices=sorted(COUNCILS), action="append",
                    help="repeatable; default is all three")
    ap.add_argument("--delay", type=float, default=0.4,
                    help="seconds between autocomplete calls")
    a = ap.parse_args()
    for key in (a.council or sorted(COUNCILS)):
        try:
            probe(key, a.delay)
        except Exception as e:
            print(f"  FAILED {key}: {type(e).__name__}: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
