#!/usr/bin/env python
"""Seed the Bay of Plenty station set from the live SOS catalogue.

Replaces `seed_boprc_from_probe.py`, which read the AQUARIUS WebPortal capture. BoP granted
access via an OGC SOS server instead of the portal, and the SOS catalogue is richer,
authoritative and regenerable — so the portal probe is no longer the seed source. See the
`ingestion/sources/boprc.py` docstring for the full contract.

Three catalogue requests, in this order:

  1. GetCapabilities        the queryable offering list
  2. GetFeatureOfInterest   every monitoring point's name and WGS84 coordinates
  3. GetDataAvailability    per-location period of record, one request per candidate

**Read the offering list from `<ows:Parameter name="offering">`, NOT from the
`<sos:ObservationOffering>` blocks.** The blocks are a truncated subset — 4,450 of 22,405
— and the truncation is not random: `Soil Moisture.Primary` and `Soil Temp.Primary` have
no block at all while both serve data normally. Seeding off the blocks silently drops two
variables and 13 sites. This cost real time to find; do not "simplify" it back.

**Liveness is judged per series, not per site.** BoP publishes long-dead sensors beside
live ones at the same location — the same failure that seeded dead river gauges for
HBRC/MDC/WCRC and later needed hand-deactivation. A (location, parameter) pair is kept
only if its own `Primary` offering's period of record ends after --live-cutoff.

**Deduped on COORDINATES, never on name.** BoP republishes other councils' gauges
(`Operational_GDC` 9, `Operational_HBRC` 3, `ESNZ` 2, plus `External` and `MetService`
feeds). Label filtering already excludes those — we take `Primary` only — but the
coordinate check is kept as the backstop, because two councils label the same physical
gauge differently and a name match would never catch it. A BoP site within
--dedupe-metres of an existing platform station is reported and skipped, so the
interpolation never sees one location twice.

Not set here: zone_id (deliberately NULL — see the 2026-07-28 decision); elevation (run
fill_elevation_from_dem.py afterwards).

Usage:
    python ingestion/scripts/seed_boprc_from_sos.py --refresh --dry-run
    python ingestion/scripts/seed_boprc_from_sos.py --refresh
"""
import argparse
import json
import math
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # ingestion/
from db_connection import get_ingestion_session
from sources.boprc import (LABEL, MEASUREMENT_MAP, SERVER_HOURLY, BoPRCIngestion, NS,
                           parse_offering)
from sqlalchemy import text

PROBES = Path(__file__).resolve().parent / "probes"
PROBE_FILE = PROBES / "boprc_sos.json"
DATA_SOURCE = "BOPRC"
REGION = "Bay of Plenty"

# Series ending before this are treated as dead and not seeded. Same convention as
# probe_hilltop.py's --live-cutoff; raise it over time.
LIVE_CUTOFF = "2026-04"

# A BoP site this close to an existing platform station is assumed to be the same
# physical gauge republished. Matches the 150 m used in the earlier BoP scoping.
DEDUPE_METRES = 150.0

# Strip the trailing "(ID)" the server appends to every feature title:
# "Galatea Basin at Horomanga Rd (JH105608)" -> "Galatea Basin at Horomanga Rd"
NAME_SUFFIX_RE = re.compile(r"\s*\([A-Za-z0-9]+\)\s*$")

# GetFeatureOfInterest returns a handful of unusable points — a literal `Test_Site` and
# numerically-named entries sitting at null island. They would seed as stations at
# (0, 0), which the interpolation would happily accept as a real observation location in
# the Gulf of Guinea. Bounds cover mainland NZ and the Chathams.
NZ_LAT = (-48.0, -34.0)
NZ_LON = (166.0, 179.5)

# BoP marks retired sites in the location name itself. `Galatea Basin at Horomanga Rd
# (discontinued)` (JH097609) is the superseded twin of the live `Galatea Basin at
# Horomanga Rd` (JH105608) a few metres away, and it survives the liveness check only
# because its soil series carry no period of record. Two stations at one location would
# double-weight that spot in the interpolation, and the cross-source coordinate dedupe
# below cannot catch it — that compares against OTHER data sources, not BoP against
# itself. This is explicit council metadata, not an inference, so honour it.
RETIRED_NAME_RE = re.compile(r"discontinu", re.I)


def slug(name):
    return "BOPRC_" + re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_").upper()


def haversine_m(lat1, lon1, lat2, lon2):
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


# ---------------------------------------------------------------- catalogue capture

def parse_offering_list(body):
    """The queryable offerings, from the operations metadata AllowedValues."""
    root = ET.fromstring(body)
    for param in root.iter(f"{{{NS['ows']}}}Parameter"):
        if param.get("name") != "offering":
            continue
        return sorted({v.text for v in param.iter(f"{{{NS['ows']}}}Value") if v.text})
    raise RuntimeError("no <ows:Parameter name='offering'> in GetCapabilities — the "
                       "catalogue shape changed; do NOT fall back to the truncated "
                       "ObservationOffering blocks (see the module docstring)")


def parse_features(body):
    """{location_id: {'name', 'lat', 'lon'}} from GetFeatureOfInterest."""
    root = ET.fromstring(body)
    out = {}
    for mp in root.iter(f"{{{NS['wml2']}}}MonitoringPoint"):
        ident = mp.find(f"{{{NS['gml']}}}identifier")
        name = mp.find(f"{{{NS['gml']}}}name")
        pos = None
        for node in mp.iter(f"{{{NS['gml']}}}pos"):
            pos = node
            break
        if ident is None or ident.text is None or pos is None or not pos.text:
            continue
        try:
            # EPSG:4326 axis order is lat lon.
            lat_s, lon_s = pos.text.split()[:2]
            lat, lon = float(lat_s), float(lon_s)
        except ValueError:
            continue
        if not (NZ_LAT[0] < lat < NZ_LAT[1] and NZ_LON[0] < lon < NZ_LON[1]):
            continue                       # null island / test rig — see NZ_LAT above
        display = (name.text if name is not None and name.text else ident.text)
        out[ident.text] = {
            "name": NAME_SUFFIX_RE.sub("", display).strip() or ident.text,
            "lat": lat, "lon": lon,
        }
    return out


def parse_availability(body):
    """{offering: (begin, end)} from GetDataAvailability, ISO strings.

    **Periods are shared by GML xlink back-reference.** Only the FIRST member with a given
    span carries an inline `<gml:TimePeriod gml:id="tp_6">`; every later member with the
    identical span carries `<gda:phenomenonTime xlink:href="#tp_6"/>` and no dates of its
    own. Reading only inline periods therefore returns None for a large minority of
    series — at the reference site that was Wind Vel, Solar Rad and Atmos Pres, all three
    of which are live and serving. Treating those as dead would have silently dropped the
    only Solar Rad site on BoP's network. So: index every gml:id in the document first,
    then resolve.
    """
    root = ET.fromstring(body)
    gda = "http://www.opengis.net/sosgda/2.0"
    xlink_href = "{http://www.w3.org/1999/xlink}href"
    gml_id = f"{{{NS['gml']}}}id"

    def span_of(tp):
        b = tp.find(f"{{{NS['gml']}}}beginPosition")
        e = tp.find(f"{{{NS['gml']}}}endPosition")
        return ((b.text if b is not None else None),
                (e.text if e is not None else None))

    periods = {tp.get(gml_id): span_of(tp)
               for tp in root.iter(f"{{{NS['gml']}}}TimePeriod") if tp.get(gml_id)}

    out = {}
    for member in root.iter(f"{{{gda}}}dataAvailabilityMember"):
        off = member.find(f"{{{gda}}}offering")
        offering = off.get(xlink_href) if off is not None else None
        if not offering:
            continue
        begin = end = None
        pt = member.find(f"{{{gda}}}phenomenonTime")
        if pt is not None:
            inline = pt.find(f"{{{NS['gml']}}}TimePeriod")
            if inline is not None:
                begin, end = span_of(inline)
            else:
                ref = (pt.get(xlink_href) or "").lstrip("#")
                begin, end = periods.get(ref, (None, None))
        out[offering] = (begin, end)
    return out


# Liveness-probe window for series that have no period of record. See the call site.
VERIFY_DAYS = 30


def probe_points(client, offering):
    """Point count for `offering` over the last VERIFY_DAYS. -1 if the request failed.

    A liveness probe, not a data fetch — the records are counted and discarded.
    """
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    parameter = offering.split(".")[0]
    try:
        body = client.fetch_observation(offering, now - timedelta(days=VERIFY_DAYS), now)
        return len(client.parse_observation(0, body, parameter))
    except Exception as e:
        print(f"        verify failed for {offering}: {e}")
        return -1


def refresh_probe(live_cutoff):
    """Capture the full weather catalogue from the live SOS server and write the dump."""
    client = BoPRCIngestion()

    print("  GetCapabilities...")
    offerings = parse_offering_list(client.capabilities())
    print(f"    {len(offerings)} queryable offerings")

    wanted = {}
    # Which locations also publish a server-side hourly series we know how to consume.
    # Recorded per station so a resampled backfill can read the pre-aggregated series
    # instead of pulling every native point — see SERVER_HOURLY in sources/boprc.py.
    hourly_by_loc = {}
    server_hourly_labels = {p: (lbl, var)
                            for var, (p, lbl, _shift) in SERVER_HOURLY.items()}
    for off in offerings:
        parameter, label, loc = parse_offering(off)
        if not loc or parameter not in MEASUREMENT_MAP:
            continue
        if label == LABEL:
            wanted.setdefault(loc, set()).add(parameter)
        else:
            want = server_hourly_labels.get(parameter)
            if want and label == want[0]:
                hourly_by_loc.setdefault(loc, set()).add(parameter)
    print(f"    {len(wanted)} locations carry a weather '{LABEL}' series")
    for parameter, (label, _var) in sorted(server_hourly_labels.items()):
        n = sum(1 for v in hourly_by_loc.values() if parameter in v)
        print(f"    {n} locations also publish {parameter}.{label} (server-side hourly)")

    print("  GetFeatureOfInterest...")
    features = parse_features(client.feature_of_interest())
    print(f"    {len(features)} monitoring points with coordinates")

    print(f"  GetDataAvailability for {len(wanted)} locations...")
    sites = {}
    for i, (loc, params) in enumerate(sorted(wanted.items()), 1):
        feat = features.get(loc)
        if not feat:
            print(f"    [{i}/{len(wanted)}] {loc}: no coordinates, skipping")
            continue
        try:
            avail = parse_availability(client.data_availability(loc))
        except Exception as e:
            print(f"    [{i}/{len(wanted)}] {loc}: GetDataAvailability failed ({e})")
            avail = {}
        series = {}
        for parameter in sorted(params):
            offering = f"{parameter}.{LABEL}@{loc}"
            begin, end = avail.get(offering, (None, None))
            entry = {"begin": begin, "end": end}
            if not end:
                # No period of record: GetDataAvailability omits some queryable series
                # entirely (the whole soil network among them) and back-references
                # others. Rather than guess, ASK THE SERVER — one short GetObservation
                # is the only unambiguous liveness test.
                #
                # Measured 2026-08-13 across all 36 unknown-period series: 27 returned
                # data within 2 days, 9 returned nothing in 730 days. A short window
                # separates them cleanly and keeps the response small; a live 5-minute
                # series cannot be empty for 30 days.
                entry["verify_points"] = probe_points(client, offering)
            series[parameter] = entry
        sites[loc] = {**feat, "series": series,
                      "hourly_offerings": sorted(hourly_by_loc.get(loc, ()))}
        if i % 10 == 0 or i == len(wanted):
            print(f"    [{i}/{len(wanted)}]")

    payload = {
        "source": DATA_SOURCE, "region": REGION, "base": client.base_url,
        "captured": datetime.now(timezone.utc).isoformat(),
        "live_cutoff": live_cutoff, "sites": sites,
    }
    PROBE_FILE.parent.mkdir(parents=True, exist_ok=True)
    PROBE_FILE.write_text(json.dumps(payload, indent=1), encoding="utf-8")
    print(f"  wrote {PROBE_FILE}")


# ---------------------------------------------------------------- seeding

UPSERT_UPDATE = text("""
    UPDATE weather_stations SET
        station_name=:name, source_id=:source_id, latitude=:lat, longitude=:lon,
        location=ST_SetSRID(ST_MakePoint(:lon,:lat),4326)::geography,
        region=:region, notes=CAST(:notes AS jsonb), is_active=true,
        updated_at=NOW()
    WHERE station_id=:sid
""")
UPSERT_INSERT = text("""
    INSERT INTO weather_stations
        (station_code, station_name, data_source, source_id, latitude, longitude,
         elevation, location, region, notes, is_active)
    VALUES (:code,:name,:ds,:source_id,:lat,:lon,NULL,
            ST_SetSRID(ST_MakePoint(:lon,:lat),4326)::geography,:region,
            CAST(:notes AS jsonb),true)
""")


def run(dry_run, refresh, live_cutoff, dedupe_metres):
    if refresh:
        print("Refreshing BoP SOS catalogue...")
        refresh_probe(live_cutoff)

    if not PROBE_FILE.exists():
        print(f"! missing catalogue dump {PROBE_FILE} — run with --refresh")
        return

    payload = json.loads(PROBE_FILE.read_text(encoding="utf-8"))
    sites = payload.get("sites") or {}

    Session = get_ingestion_session()
    with Session() as s:
        mine = s.execute(text(
            "SELECT station_code, source_id FROM weather_stations WHERE data_source=:ds"),
            {"ds": DATA_SOURCE}).fetchall()
        others = s.execute(text(
            "SELECT station_code, data_source, latitude, longitude FROM weather_stations "
            "WHERE data_source <> :ds AND latitude IS NOT NULL AND longitude IS NOT NULL"),
            {"ds": DATA_SOURCE}).fetchall()
    existing_by_source_id = {r[1]: r[0] for r in mine}
    used_codes = set(existing_by_source_id.values())

    created = updated = errors = 0
    skipped_dead = skipped_dup = skipped_retired = 0
    dead_detail, dup_detail, unknown_detail, retired_detail = [], [], [], []
    counts = {}

    with Session() as s:
        for loc, cfg in sorted(sites.items(), key=lambda kv: kv[1].get("name") or kv[0]):
            lat, lon = cfg.get("lat"), cfg.get("lon")
            if lat is None or lon is None:
                continue
            if RETIRED_NAME_RE.search(cfg.get("name") or ""):
                skipped_retired += 1
                retired_detail.append(f"{cfg.get('name')} ({loc})")
                continue

            # Per-series liveness. Three outcomes, and the third one matters:
            #   end >= cutoff   -> live, seed it
            #   end <  cutoff   -> dead, drop it
            #   end is unknown  -> SEED IT ANYWAY.
            # GetDataAvailability is not exhaustive: `Soil Moisture.Primary` is absent
            # from it at the reference site yet serves 289 points/day. We have positive
            # evidence the series is queryable (it is in the offering AllowedValues), so
            # absence of a period of record is missing metadata, not a dead sensor.
            # Dropping on unknown would silently discard live variables; seeding on
            # unknown at worst creates a station that reports zero rows on the first
            # dry-run, which is visible and easy to deactivate. Same stance as
            # seed_trc_from_probe.py, which has no period-of-record field at all.
            live, unknown = [], []
            for parameter, span in sorted((cfg.get("series") or {}).items()):
                span = span or {}
                end = span.get("end") or ""
                if not end:
                    # Verified against the server at capture time (see probe_points).
                    # A negative count means the probe itself failed — keep the series
                    # rather than drop it on a transient network error.
                    n = span.get("verify_points")
                    if n is None or n != 0:
                        live.append(parameter)
                        unknown.append(f"{cfg.get('name')} / {parameter} "
                                       f"(no period of record; "
                                       f"{'unverified' if n is None else f'{n} pts in last {VERIFY_DAYS}d'})")
                    else:
                        dead_detail.append(f"{cfg.get('name')} / {parameter} "
                                           f"(no period of record, 0 pts in last "
                                           f"{VERIFY_DAYS}d)")
                elif end[:7] >= live_cutoff:
                    live.append(parameter)
                else:
                    dead_detail.append(f"{cfg.get('name')} / {parameter} "
                                       f"(ends {end[:10]})")
            unknown_detail.extend(unknown)
            if not live:
                skipped_dead += 1
                continue

            # Coordinate dedupe against every non-BoP station on the platform.
            dup = None
            for code_o, src_o, lat_o, lon_o in others:
                d = haversine_m(lat, lon, float(lat_o), float(lon_o))
                if d <= dedupe_metres:
                    dup = (code_o, src_o, d)
                    break
            if dup:
                skipped_dup += 1
                dup_detail.append(f"{cfg.get('name')} ~ {dup[0]} ({dup[1]}, {dup[2]:.0f} m)")
                continue

            name = cfg.get("name") or loc
            code = existing_by_source_id.get(loc)
            if not code:
                code = slug(name)
                base, n = code, 2
                while code in used_codes:
                    code = f"{base}_{n}"
                    n += 1
            used_codes.add(code)

            for parameter in live:
                var = MEASUREMENT_MAP[parameter][0]
                counts[var] = counts.get(var, 0) + 1

            notes = json.dumps({
                "name": name, "site_name": name,
                "boprc_location_id": loc,
                # run-time contract: boprc.py reads these as SOS parameter names and
                # builds "<parameter>.Primary@<source_id>".
                "measurements": live,
                # Parameters for which this location also publishes a server-side hourly
                # series. Read at run time by boprc.py's resampled backfill only.
                "hourly_offerings": [p for p in (cfg.get("hourly_offerings") or [])
                                     if p in live],
                "record": {p: (cfg.get("series") or {}).get(p) for p in live},
            })
            p = {"code": code, "name": name, "source_id": loc,
                 "lat": float(lat), "lon": float(lon),
                 "region": REGION, "notes": notes, "ds": DATA_SOURCE}
            try:
                row = s.execute(text(
                    "SELECT station_id FROM weather_stations "
                    "WHERE data_source=:ds AND source_id=:source_id"),
                    {"ds": DATA_SOURCE, "source_id": loc}).fetchone()
                if row:
                    if not dry_run:
                        s.execute(UPSERT_UPDATE, {**p, "sid": row[0]})
                        s.commit()
                    updated += 1
                else:
                    if not dry_run:
                        s.execute(UPSERT_INSERT, p)
                        s.commit()
                    created += 1
            except Exception as e:
                errors += 1
                s.rollback()
                print(f"    ERROR {code}: {e}")

    print("\n" + "=" * 60)
    print("BoP seed from SOS catalogue" + ("  [DRY RUN]" if dry_run else ""))
    print("=" * 60)
    print(f"  Catalogue captured : {payload.get('captured')}")
    print(f"  Locations in dump  : {len(sites)}")
    print(f"  -> UPDATE existing : {updated}   INSERT new: {created}   Errors: {errors}")
    print(f"  Skipped, all series dead before {live_cutoff}: {skipped_dead}")
    print(f"  Skipped, duplicate of an existing station  : {skipped_dup}")
    for d in dup_detail:
        print(f"      {d}")
    print(f"  Skipped, name marks the site retired       : {skipped_retired}")
    for d in retired_detail:
        print(f"      {d}")
    if dead_detail:
        print(f"  Dead series excluded ({len(dead_detail)}):")
        for d in dead_detail[:20]:
            print(f"      {d}")
        if len(dead_detail) > 20:
            print(f"      ... and {len(dead_detail) - 20} more")
    if unknown_detail:
        print(f"  Seeded with NO period of record but VERIFIED serving "
              f"({len(unknown_detail)}) — GetDataAvailability is not exhaustive, so "
              f"these were probed against the server directly:")
        for d in unknown_detail[:20]:
            print(f"      {d}")
        if len(unknown_detail) > 20:
            print(f"      ... and {len(unknown_detail) - 20} more")
    print("  Variable coverage:")
    for v, c in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"    {c:4}  {v}")
    print("\n  NEXT: python ingestion/scripts/fill_elevation_from_dem.py --source BOPRC")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--refresh", action="store_true",
                    help="re-capture the SOS catalogue live and rewrite the dump")
    ap.add_argument("--live-cutoff", default=LIVE_CUTOFF,
                    help=f"YYYY-MM; series ending before this are dead (default {LIVE_CUTOFF})")
    ap.add_argument("--dedupe-metres", type=float, default=DEDUPE_METRES)
    a = ap.parse_args()
    run(a.dry_run, a.refresh, a.live_cutoff, a.dedupe_metres)
