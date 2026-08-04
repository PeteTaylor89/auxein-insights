#!/usr/bin/env python
"""Probe an NZ council Hilltop server and dump a station/measurement inventory.

Written 2026-07-16 for the HBRC/MDC ingestion expansion. Findings from this script are
recorded in docs/plans/INGESTION_EXPANSION_2026-07-16.md.

WHY THIS EXISTS
---------------
Station configs must be GENERATED from the live API, never hand-typed. The prior HBRC
discovery pass hand-typed its inventory and got the date ranges wrong (it claimed wind was
1997-1999; it is actually 1994 -> live) and counted decommissioned stations as live. 6 of
HBRC's 23 "Climate" sites are dead.

FOUR GOTCHAS THIS SCRIPT ENCODES (all fail SILENTLY -- see doc section 2)
------------------------------------------------------------------------
1. Hilltop does NOT decode '+' as a space. urlencode() emits '+' by default, so the server
   looks for a literal site named "Bridge+Pa+Climate", finds nothing, and returns VALID XML
   with zero <DataSource> elements -- no error. Looks exactly like "station has no data".
   -> quote_via=quote  (=> %20)
2. HBRC 403s any request without a User-Agent, and Cloudflare intermittently returns HTTP
   522 (~1 call in 5). -> set a UA, retry with backoff.
3. From/To live on <DataSource>, NOT <Measurement>. Liveness must be read from DataSource/To.
   Parsing Measurement for From/To yields nothing.
4. SiteList&Location=Yes returns PROJECTED coords (HBRC returns NZMG / EPSG:27200 easting +
   northing). -> Location=LatLong returns <Latitude>/<Longitude> and skips reprojection.

USAGE
-----
    python probe_hilltop.py --agency hbrc --filter Climate --out hbrc_climate.json
    python probe_hilltop.py --agency mdc  --collection Climate --out mdc_climate.json
    python probe_hilltop.py --agency mdc  --collection MDCAWS2 --out mdc_aws.json
    python probe_hilltop.py --agency nrc  --collection Climate_soil --out nrc_climate.json
    python probe_hilltop.py --agency hbrc --collection HBRC_Rainfall --out hbrc_rain.json

    # then:
    python probe_hilltop.py --report hbrc_climate.json

A bare --out/--report filename resolves into scripts/probes/ (gitignored — dumps are
large regenerable artefacts, not source). Pass an absolute path to override.

Read-only. Hits public endpoints only. No credentials required for any agency below.
"""
import argparse
import gzip
import json
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

# Probe dumps are large regenerable artefacts, so they live in a gitignored dir
# rather than the repo root. A bare filename resolves here; absolute paths pass through.
PROBES = Path(__file__).resolve().parent / "probes"


def probe_path(name):
    p = Path(name)
    if p.is_absolute() or p.parent != Path("."):
        return p
    PROBES.mkdir(exist_ok=True)
    return PROBES / p.name


AGENCIES = {
    # agency -> base .hts endpoint. All keyless.
    "hbrc": "https://data.hbrc.govt.nz/Envirodata/EMAR.hts",
    "mdc": "https://hydro.marlborough.govt.nz/data.hts",
    "nrc": "https://hilltop.nrc.govt.nz/data.hts",
    "gw": "https://hilltop.gw.govt.nz/Data.hts",
    "tdc": "http://envdata.tasman.govt.nz/data.hts",
    "gdc": "http://hilltop.gdc.govt.nz/data.hts",
    "orc": "https://gisdata.orc.govt.nz/hilltop/Global.hts",
    # WCRC answers on any .hts path (every one reports the same DefaultFile
    # websitedata*.hts), so the filename here is not load-bearing.
    "wcrc": "https://hilltop.wcrc.govt.nz/data.hts",
    # Horizons runs two Hilltop servers: the environmental one below, and
    # flood.horizons.govt.nz (flood-warning telemetry, older build). Probe both
    # before deciding which carries the climate network.
    "horizons": "https://hilltopserver.horizons.govt.nz/data.hts",
    "horizons-flood": "https://flood.horizons.govt.nz/data.hts",
}

# GOTCHA 2: HBRC 403s without this.
UA = {"User-Agent": "Mozilla/5.0 (compatible; AuxeinIngest/1.0)"}

# Council QA/derived series that are not observations. We compute roll-ups in the
# aggregation layer; ingesting these would double-count or write junk.
NOISE_EXACT = {
    "Comment", "Comments", "Recorder Time", "Recorder Total", "Check Gauge Total",
    "Hydro Monitoring Form", "Hazard", "Injury or Incident", "WQ Sample", "Validation",
    "Observer", "Dry Days", "Wet Days", "Storage Gauge Total", "Consecutive Dry Days",
    "Time Maximum Wind", "Site Inspection Interval", "Recorded Water Level",
    "Surface Alpha", "Gauged Flow",
}
NOISE_PREFIX = ("LAWA", "Audit", "Backup", "Gauging", "Rainfall Site", "Monthly Site")
NOISE_SUFFIX = (
    "Reference", "Verification", "Comment", "Score", "Difference", "Raw",
    "(Incremental)", "Total", "repack",
)


def is_noise(name: str) -> bool:
    if name in NOISE_EXACT:
        return True
    if name.startswith(NOISE_PREFIX):
        return True
    if name.endswith(NOISE_SUFFIX):
        return True
    return False


def build_ctx():
    ctx = ssl.create_default_context()
    # Some council servers have incomplete chains; we read public data only.
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def _maybe_gunzip(body):
    """GOTCHA 5: NRC's IIS returns gzip even though urllib never sent Accept-Encoding.

    curl transparently hides this, so a curl probe succeeds where a naive Python client
    sees binary garbage and (with a parse-guard) retries forever. Sniff the magic bytes
    rather than trusting Content-Encoding.
    """
    if body[:2] == b"\x1f\x8b":
        return gzip.decompress(body)
    return body


def get(base, params, tries=6, timeout=90):
    """GET + parse-guard, with backoff. Returns bytes or None.

    GOTCHA 1: quote_via=quote gives %20. The default (+) makes Hilltop silently return an
    empty-but-valid document instead of an error.
    GOTCHA 2: retries absorb HBRC's intermittent Cloudflare 522s.
    GOTCHA 5: some agencies (NRC) return gzip unrequested -- sniff and decompress.
    """
    url = base + "?" + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
    headers = dict(UA, **{"Accept-Encoding": "identity"})
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers=headers)
            body = urllib.request.urlopen(req, timeout=timeout, context=build_ctx()).read()
            body = _maybe_gunzip(body)
            if body.strip().startswith(b"<"):
                return body
            sys.stderr.write(f"  non-XML response (attempt {attempt + 1}): {body[:80]!r}\n")
        except urllib.error.HTTPError as e:
            sys.stderr.write(f"  HTTP {e.code} (attempt {attempt + 1}) {url[:90]}\n")
        except Exception as e:  # noqa: BLE001 - probe tool, surface and retry
            sys.stderr.write(f"  {type(e).__name__} (attempt {attempt + 1}): {e}\n")
        time.sleep(2 * (attempt + 1))
    return None


def fetch_sites(base, collection=None):
    """Site list with lat/lon. GOTCHA 4: Location=LatLong, not Location=Yes."""
    params = {"Service": "Hilltop", "Request": "SiteList", "Location": "LatLong"}
    if collection:
        params["Collection"] = collection
    body = get(base, params)
    if not body:
        raise SystemExit("FATAL: SiteList fetch failed")
    root = ET.fromstring(body)
    out = []
    for s in root.findall(".//Site"):
        out.append({
            "name": s.get("Name"),
            "lat": s.findtext("Latitude"),
            "lon": s.findtext("Longitude"),
        })
    return out


def fetch_measurements(base, site):
    """GOTCHA 3: From/To hang off <DataSource>, not <Measurement>."""
    body = get(base, {"Service": "Hilltop", "Request": "MeasurementList", "Site": site})
    if not body:
        return None
    root = ET.fromstring(body)
    datasources = []
    for d in root.findall(".//DataSource"):
        datasources.append({
            "datasource": d.get("Name"),
            "from": d.findtext("From"),
            "to": d.findtext("To"),
            "measurements": [
                {"name": m.get("Name"), "units": m.findtext("Units")}
                for m in d.findall("Measurement")
            ],
        })
    return datasources


def latest_of(datasources):
    tos = [d["to"] for d in datasources if d.get("to")]
    return max(tos) if tos else None


def cmd_probe(args):
    base = AGENCIES[args.agency]
    sites = fetch_sites(base, args.collection)
    if args.filter:
        sites = [s for s in sites if args.filter.lower() in (s["name"] or "").lower()]
    print(f"{args.agency}: {len(sites)} sites to probe "
          f"(collection={args.collection or '-'}, filter={args.filter or '-'})")

    out = {}
    for s in sites:
        ds = fetch_measurements(base, s["name"])
        if ds is None:
            out[s["name"]] = {"error": "fetch failed"}
            print(f"  {s['name']:44s} FETCH-FAIL")
            continue
        out[s["name"]] = {"lat": s["lat"], "lon": s["lon"], "datasources": ds}
        print(f"  {s['name']:44s} ds={len(ds):2d} latest={latest_of(ds)}")
        time.sleep(args.sleep)

    payload = {"agency": args.agency, "base": base, "collection": args.collection,
               "filter": args.filter, "sites": out}
    dest = probe_path(args.out)
    with open(dest, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=1)
    print(f"\nwrote {dest}  ({len(out)} sites)")
    cmd_report(argparse.Namespace(report=str(dest), live_cutoff=args.live_cutoff,
                                  min_sites=args.min_sites))


def cmd_report(args):
    with open(probe_path(args.report), encoding="utf-8") as fh:
        payload = json.load(fh)
    sites = payload["sites"]
    live, dead = {}, {}
    for name, v in sites.items():
        if v.get("error"):
            continue
        lat = latest_of(v["datasources"]) or ""
        (live if lat >= args.live_cutoff else dead)[name] = (v, lat)

    print(f"\n=== {payload['agency'].upper()} — {len(live)} live / "
          f"{len(dead)} dead (cutoff {args.live_cutoff})")

    if dead:
        print("\n--- DEAD (exclude from config) ---")
        for n, (_, lat) in sorted(dead.items()):
            print(f"  {n:44s} last data {lat[:10]}")

    agg = defaultdict(lambda: {"sites": set(), "units": set(), "from": [], "to": []})
    for name, (v, _) in live.items():
        for ds in v["datasources"]:
            for m in ds["measurements"]:
                mn = m.get("name")
                if not mn or is_noise(mn):
                    continue
                a = agg[mn]
                a["sites"].add(name)
                if m.get("units"):
                    a["units"].add(m["units"])
                if ds.get("from"):
                    a["from"].append(ds["from"][:10])
                if ds.get("to"):
                    a["to"].append(ds["to"][:10])

    print(f"\n--- SIGNAL (>= {args.min_sites} live sites, QA/derived filtered out) ---")
    print(f"{'MEASUREMENT':40s} {'SITE':>4s} {'EARLIEST':10s} {'LATEST':10s} UNITS")
    for mn, a in sorted(agg.items(), key=lambda x: (-len(x[1]["sites"]), x[0])):
        if len(a["sites"]) < args.min_sites:
            continue
        units = ",".join(sorted(a["units"]))[:12]
        print(f"{mn:40s} {len(a['sites']):4d} {min(a['from']):10s} "
              f"{max(a['to']):10s} {units}")

    print("\n--- LIVE SITE COORDS (markdown, for the config/plan doc) ---")
    print("| Site | Lat | Lon |")
    print("|---|---|---|")
    for n, (v, _) in sorted(live.items()):
        print(f"| {n} | {v['lat']} | {v['lon']} |")


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--agency", choices=sorted(AGENCIES))
    p.add_argument("--collection", help="Hilltop Collection (MDC requires one)")
    p.add_argument("--filter", help="substring match on site name, e.g. Climate")
    p.add_argument("--out", default="hilltop_probe.json")
    p.add_argument("--sleep", type=float, default=0.5, help="politeness delay between sites")
    p.add_argument("--live-cutoff", default="2026-04",
                   help="YYYY-MM; sites with no data at/after this are reported dead")
    p.add_argument("--min-sites", type=int, default=3,
                   help="hide measurements present on fewer than N live sites")
    p.add_argument("--report", help="skip probing; re-report an existing JSON dump")
    args = p.parse_args()

    if args.report:
        cmd_report(args)
    elif args.agency:
        cmd_probe(args)
    else:
        p.error("need --agency (to probe) or --report (to re-read a dump)")


if __name__ == "__main__":
    main()
