#!/usr/bin/env python3
"""BSI's nominated reference stations — the measured equivalent of each site.

    python backend/scripts/seed_reference_stations.py              # dry run
    python backend/scripts/seed_reference_stations.py --apply
    python backend/scripts/seed_reference_stations.py --account bsi --apply

DRY RUN BY DEFAULT. Seeding is the one operation on this platform that has
already created duplicates in production by being run bare, and a pairing is a
client's own decision — re-seeding over a hand-edited row would silently revert
whatever they asked for.

## The pairing is BSI's, the fills are not

Eight Regional sites, nominated by the client. Two of those nominations cannot
supply every variable, and rather than leave the headline number blank the
nearest station that does measure it is used and MARKED `fill`:

* **GREYSTONE BASE has no thermometer.** Precipitation, humidity and radiation
  only — Greystone's thermometers are all on blocks at 60-82 m while BASE is at
  120 m. Waipara West's temperature and GDD come from block B4, the nearest one
  (11.02 km from the site), and carry a 67 m elevation difference that the
  screen shows rather than absorbs.
* **HBRC St Johns has no rain gauge at all** — zero rainfall days in the whole
  record. Lawn Rd's rainfall comes from HBRC Farndon, 2.51 km from the site with
  a complete year behind it.

## A patchy variable is reported, never spliced

`SYNOP_93546` carries rainfall on 174 of the last 365 days and MDC Blenheim
Bowling on 276. Those are PARTIAL, not absent. Nothing is filled over them:
silently covering the gaps from a second gauge would make one column two
different instruments with no way to say which day came from which. The coverage
is reported and the client renominates if they want to — **an absent variable is
a fill, a patchy one is a fact**.

Appleby is what that loop looks like when it works. It was seeded on SYNOP for
all three variables; the coverage figure showed 174 of 365 days of rainfall
against a TDC gauge 2.61 km from the site with a complete year, and BSI moved
the rainfall pairing on 2026-09-17. That is a second NOMINATION and stays
`primary`. Nelson AWS still reads rainfall from SYNOP at 47.7% and Marlborough
from Blenheim Bowling at 75.6%, both untouched and both visible.

Solar is seeded only where the nominated mast measures it (Cromwell,
Martinborough, Waipara). Nothing is borrowed to manufacture a solar series that
was never asked for.

## Keyed on business keys, never ids

`external_ref` for the site and `station_code` for the station, both resolved at
run time and both FATAL if they do not resolve. A seed written against database
ids is a seed that silently attaches itself to the wrong row the first time it
runs anywhere but the machine it was written on.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv                                      # noqa: E402
from sqlalchemy import text                                         # noqa: E402

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from db.session import SessionLocal                                 # noqa: E402


# (site external_ref, variable, station_code, role, note)
#
# `primary` is the mast the client named. `fill` is the platform covering a
# variable that mast does not measure, and the note says why.
PAIRINGS = [
    # --- Appleby: Nelson Aerodrome AWS at 8.93 km for temperature and
    # humidity, and a SECOND NOMINATION for rainfall.
    #
    # `primary` on all three, including the Waimea gauge. It is not a fill —
    # SYNOP measures rainfall perfectly well, it just measures it on 174 days of
    # 365 — it is the client choosing a different instrument for one variable
    # once they could see the coverage. Marking it `fill` would have been
    # cheaper and wrong: that badge means "the nominated mast cannot measure
    # this at all", and it is only worth reading while it means exactly that.
    ("regional|Appleby|1", "temp", "SYNOP_93546", "primary", None),
    ("regional|Appleby|1", "humidity", "SYNOP_93546", "primary", None),
    ("regional|Appleby|1", "rainfall", "TDC_WAIMEA_NURSERY", "primary",
     "Nominated for rainfall 2026-09-17 in place of SYNOP_93546: 2.61 km "
     "against 8.93, and a complete year against 174 days of 365"),

    # --- Cromwell EWS: CODC Cromwell, 0.82 km. ONE MAST, FOUR STATION IDS.
    ("regional|Cromwell EWS, Cliflo: 26381|1", "temp",
     "HARV_CODC_CROM_TEMP", "primary", None),
    ("regional|Cromwell EWS, Cliflo: 26381|1", "humidity",
     "HARV_CODC_CROM_HUMIDITY", "primary", None),
    ("regional|Cromwell EWS, Cliflo: 26381|1", "rainfall",
     "HARV_CODC_CROM_PRECIP", "primary", None),
    ("regional|Cromwell EWS, Cliflo: 26381|1", "solar",
     "HARV_CODC_CROM_RADIATION", "primary", None),

    # --- Gisborne AWS: the airport met station, 110 m away. The closest
    # pairing on the account and complete on every variable it carries.
    ("regional|Gisborne AWS, Cliflo: 2810|1", "temp",
     "GDC_AIRPORT_MET", "primary", None),
    ("regional|Gisborne AWS, Cliflo: 2810|1", "humidity",
     "GDC_AIRPORT_MET", "primary", None),
    ("regional|Gisborne AWS, Cliflo: 2810|1", "rainfall",
     "GDC_AIRPORT_MET", "primary", None),

    # --- Lawn Rd: HBRC St Johns, 5.80 km, which has NO RAIN GAUGE.
    ("regional|Lawn Rd|1", "temp", "HBRC_ST_JOHNS", "primary", None),
    ("regional|Lawn Rd|1", "humidity", "HBRC_ST_JOHNS", "primary", None),
    ("regional|Lawn Rd|1", "rainfall", "HBRC_FARNDON_RAINFALL", "fill",
     "St Johns has no rain gauge; Farndon is 2.51 km from the site"),

    # --- Marlborough Research Station: Blenheim Bowling Club, 3.33 km.
    ("regional|Marlborough Research Station Cliflo: 12430|1", "temp",
     "MDC_BLENHEIM_BOWLING", "primary", None),
    ("regional|Marlborough Research Station Cliflo: 12430|1", "humidity",
     "MDC_BLENHEIM_BOWLING", "primary", None),
    ("regional|Marlborough Research Station Cliflo: 12430|1", "rainfall",
     "MDC_BLENHEIM_BOWLING", "primary",
     "Rainfall present on 292 of the last 381 days"),

    # --- Martinborough: Tauherenikau at Racecourse, 14.70 km. The furthest
    # pairing but the best equipped — complete on all four variables.
    ("regional|Martinborough, Cliflo: 21938|1", "temp",
     "GW_TAUHERENIKAU_AT_RACECOURSE", "primary", None),
    ("regional|Martinborough, Cliflo: 21938|1", "humidity",
     "GW_TAUHERENIKAU_AT_RACECOURSE", "primary", None),
    ("regional|Martinborough, Cliflo: 21938|1", "rainfall",
     "GW_TAUHERENIKAU_AT_RACECOURSE", "primary", None),
    ("regional|Martinborough, Cliflo: 21938|1", "solar",
     "GW_TAUHERENIKAU_AT_RACECOURSE", "primary", None),

    # --- Nelson AWS: Nelson Aerodrome AWS, 1.35 km.
    ("regional|Nelson AWS, Cliflo: 4271|1", "temp",
     "SYNOP_93546", "primary", None),
    ("regional|Nelson AWS, Cliflo: 4271|1", "humidity",
     "SYNOP_93546", "primary", None),
    ("regional|Nelson AWS, Cliflo: 4271|1", "rainfall", "SYNOP_93546",
     "primary", "SYNOP rainfall is intermittent — 178 of the last 381 days"),

    # --- Waipara West: GREYSTONE BASE, 11.75 km, WHICH HAS NO THERMOMETER.
    ("regional|Waipara West Ews, Cliflo: 26607|1", "temp",
     "HARV_GREYSTONE_05_TEMP", "fill",
     "Greystone Base has no thermometer; B4 is the nearest one at 11.02 km "
     "and 67 m below the site"),
    ("regional|Waipara West Ews, Cliflo: 26607|1", "humidity",
     "HARV_GREYSTONE_07_HUMIDITY", "primary", None),
    ("regional|Waipara West Ews, Cliflo: 26607|1", "rainfall",
     "HARV_GREYSTONE_07_PRECIP", "primary", None),
    ("regional|Waipara West Ews, Cliflo: 26607|1", "solar",
     "HARV_GREYSTONE_07_RADIATION", "primary", None),
]


def resolve(db, account_slug: str):
    """Business keys to ids, or a fatal list of what did not resolve.

    Every miss is collected before anything is reported, rather than raising on
    the first: a seed that fails one line at a time takes as many runs to fix as
    it has mistakes.
    """
    sites = {r[0]: (r[1], r[2]) for r in db.execute(text("""
        SELECT s.external_ref, s.id, s.label
          FROM insights_site s
          JOIN insights_account a ON a.id = s.account_id
         WHERE a.slug = :slug AND s.external_ref IS NOT NULL
    """), {"slug": account_slug}).all()}
    stations = {r[0]: r[1] for r in db.execute(text("""
        SELECT station_code, station_id FROM weather_stations
         WHERE station_code = ANY(:codes)
    """), {"codes": sorted({p[2] for p in PAIRINGS})}).all()}

    rows, missing = [], []
    for ref, variable, code, role, note in PAIRINGS:
        if ref not in sites:
            missing.append(f"site external_ref {ref!r} not on account {account_slug!r}")
            continue
        if code not in stations:
            missing.append(f"station_code {code!r} does not exist")
            continue
        site_id, label = sites[ref]
        rows.append({"site_id": site_id, "label": label, "variable": variable,
                     "station_id": stations[code], "code": code,
                     "role": role, "note": note})
    return rows, missing


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--account", default="bsi")
    ap.add_argument("--apply", action="store_true",
                    help="write. Without it nothing is written and the plan "
                         "is printed.")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        rows, missing = resolve(db, args.account)
        if missing:
            print(f"REFUSING: {len(missing)} key(s) did not resolve")
            for m in missing:
                print(f"  - {m}")
            return 1

        existing = {(r[0], r[1]): (r[2], r[3]) for r in db.execute(text("""
            SELECT f.site_id, f.variable, f.station_id, f.role
              FROM insights_site_reference_station f
              JOIN insights_site s ON s.id = f.site_id
              JOIN insights_account a ON a.id = s.account_id
             WHERE a.slug = :slug
        """), {"slug": args.account}).all()}

        creates = [r for r in rows if (r["site_id"], r["variable"]) not in existing]
        # A CHANGE IS NOT A CREATE, and the difference is the whole reason for
        # the dry run. An existing row pointing at a different station is a
        # decision somebody made; overwriting it silently is how a client's
        # renomination gets reverted by a routine re-seed.
        updates = [r for r in rows
                   if (r["site_id"], r["variable"]) in existing
                   and existing[(r["site_id"], r["variable"])]
                   != (r["station_id"], r["role"])]
        unchanged = len(rows) - len(creates) - len(updates)

        print(f"account {args.account}: {len(rows)} pairing(s) in this file")
        print(f"  create {len(creates)}   change {len(updates)}   unchanged {unchanged}")
        for r in creates:
            print(f"  + {r['label'][:38]:<38} {r['variable']:<9} "
                  f"{r['code']:<30} {r['role']}")
        for r in updates:
            was = existing[(r["site_id"], r["variable"])]
            print(f"  ~ {r['label'][:38]:<38} {r['variable']:<9} "
                  f"{r['code']:<30} {r['role']}  (was station {was[0]}, {was[1]})")

        if not args.apply:
            print("\nDRY RUN — nothing written. Re-run with --apply.")
            return 0

        for r in creates + updates:
            db.execute(text("""
                INSERT INTO insights_site_reference_station
                       (site_id, variable, station_id, role, note)
                VALUES (:site_id, :variable, :station_id, :role, :note)
                ON CONFLICT (site_id, variable) DO UPDATE
                   SET station_id = EXCLUDED.station_id,
                       role       = EXCLUDED.role,
                       note       = EXCLUDED.note,
                       updated_at = now()
            """), r)
        db.commit()
        print(f"\nAPPLIED: {len(creates)} created, {len(updates)} changed.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
