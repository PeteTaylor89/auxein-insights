#!/usr/bin/env python3
"""Provision an enterprise account's sites from the client's own location list.

    # see what would happen, touching nothing
    python backend/scripts/import_account_sites.py \
        --account bsi --name "BSI" --file docs/clients/BSI_Locations.xlsx --dry-run

    # create the account and its sites, then extract them
    python backend/scripts/import_account_sites.py \
        --account bsi --name "BSI" --file docs/clients/BSI_Locations.xlsx
    python backend/scripts/populate_insights_sites.py

## The sheet has no unique identifier, and that had to be dealt with

`Location` is NOT a key. Measured on the 67-row BSI list: 11 names appear more
than once, and only 2 of those are the same coordinates twice. "Seaview Awatere"
is three distinct vineyard blocks; "Camshorn" is a met station plus two blocks.
Keying on Location alone would have collapsed 13 real sites into 4.

`Type` does not rescue it either — "Seaview Awatere" is three Phenology rows.

So `external_ref` is `TYPE|LOCATION|N`, where N counts occurrences within that
pair in SHEET ORDER. That is a positional key and it is worth being blunt about
what it costs: re-sorting the sheet, or inserting a row above an existing one,
re-numbers everything below it and the next import will look like a pile of
moves. The fix is a client-supplied identifier, and it is worth asking for
before the list grows.

Two rows at the SAME coordinates are reported separately. They would extract to
identical numbers from the same 500 m cell, which is a question for the client
rather than something to silently deduplicate — a client tracking two blocks
that share a cell may still want two rows on their dashboard.

Matching is never on `label` and never on coordinates. Labels get tidied and
coordinates get corrected; either would silently create a duplicate site and
start extracting it. Re-running against an updated sheet UPDATES matched rows
and reports what moved.

## A moved site is reported, never silently re-pointed

If a row's coordinates differ from what is stored, the cell changes, and every
extracted value already in `insights_site_daily`, `_monthly`, `_season`,
`_disease` and `_projection` describes the OLD cell. This script will not
quietly repoint a site: it lists the moves and requires `--apply-moves`, which
also clears the extraction so the next populate rebuilds rather than leaving a
site whose history is half one place and half another.

## Reading the workbook without a new dependency

xlsx is a zip of XML, and it is read here directly. The alternative is adding
openpyxl to a requirements file — and the two candidates are the interpolation
venv, which is pinned for the archive's reproducibility, and the surfaces image,
which every scheduled job now runs on. Neither should grow a dependency for a
one-off provisioning script.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv                                      # noqa: E402

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
os.environ.setdefault("AWS_REGION", "ap-southeast-2")

from sqlalchemy import text                                        # noqa: E402

from db.session import SessionLocal                                 # noqa: E402
from db.models.insights_account import InsightsAccount              # noqa: E402
from db.models.insights_site import InsightsSite                    # noqa: E402
from services import insights_site_service as svc                   # noqa: E402
from services.insights_site_service import PlacementError           # noqa: E402

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

# The sheet's own vocabulary, mapped to what the column stores. The three
# populations want different things on screen — a regional station shows ET and
# water balance, a phenology vineyard shows budburst through harvest — which is
# why this is carried through rather than discarded at import.
SITE_TYPE = {
    "regional": "regional",
    "sub-regional": "sub_regional",
    "subregional": "sub_regional",
    "phenology": "phenology",
}

# Coordinates that differ by less than this are the same place written to a
# different precision. 1e-5 degrees is about a metre — well inside one 500 m
# cell, so a difference this small cannot change the extraction and must not be
# reported as a move.
COORD_EPSILON = 1e-5


def read_rows(path: Path) -> list[dict]:
    """Every data row of the first sheet, keyed by header name."""
    z = zipfile.ZipFile(path)
    shared = [
        "".join(t.text or "" for t in si.iter(f"{NS}t"))
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall(f"{NS}si")
    ] if "xl/sharedStrings.xml" in z.namelist() else []

    sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
    raw = []
    for row in sheet.iter(f"{NS}row"):
        cells = {}
        for c in row.findall(f"{NS}c"):
            col = re.match(r"[A-Z]+", c.get("r")).group(0)
            v = c.find(f"{NS}v")
            inline = c.find(f"{NS}is")
            if c.get("t") == "s" and v is not None:
                val = shared[int(v.text)]
            elif inline is not None:
                val = "".join(t.text or "" for t in inline.iter(f"{NS}t"))
            else:
                val = v.text if v is not None else None
            cells[col] = val
        raw.append(cells)

    if not raw:
        raise SystemExit(f"{path}: no rows")
    header = {col: (name or "").strip() for col, name in raw[0].items()}
    out = []
    for cells in raw[1:]:
        rec = {header.get(col, col): val for col, val in cells.items()}
        # A row with no coordinates is not a site. Skipped loudly rather than
        # imported with NULLs that would fail placement much later.
        if not rec.get("Latitude") or not rec.get("Longitude"):
            continue
        out.append(rec)
    return out


def place(db, lat: float, lon: float, ref: str) -> tuple[dict, str | None]:
    """Resolve a cell, snapping to the nearest land cell when the point is wet.

    `resolve_cell` REFUSES an off-mask point rather than returning None — it
    raises `PlacementError` carrying the nearest land cell, because a Pro
    subscriber placing a pin should be offered the move rather than have it made
    for them. A bulk import of a client's existing monitoring network is the
    other case: 25.3% of Northland's planted hectares sit on cells the 500 m
    mask calls water, so refusing coastal sites outright would drop real
    vineyards from the client's own list.

    So this snaps, and RETURNS WHAT IT DID. A snap that is not reported is a
    site quietly describing somewhere the client did not ask about.
    """
    try:
        return svc.resolve_cell(db, lat, lon), None
    except PlacementError as exc:
        near = exc.detail.get("nearest_land")
        if not near:
            raise
        cell = svc.resolve_cell(db, near["lat"], near["lon"])
        return cell, (f"{ref}: {exc.code}, snapped {near['cells_away']} cell(s) "
                      f"to {near['lat']:.5f},{near['lon']:.5f}")


def parse(rec: dict, seen: dict) -> dict:
    kind = (rec.get("Type") or "").strip().lower()
    location = (rec.get("Location") or "").strip()
    site_type = SITE_TYPE.get(kind)
    # Positional within (type, location) — see the module docstring for why this
    # is the best key available and what it costs.
    n = seen[(site_type, location)] = seen.get((site_type, location), 0) + 1
    return {
        "external_ref": f"{site_type}|{location}|{n}",
        "label": location[:80],
        "latitude": float(rec["Latitude"]),
        "longitude": float(rec["Longitude"]),
        "site_type": SITE_TYPE.get(kind),
        "region": (rec.get("Region") or "").strip(),
        "data_kind": (rec.get("Data") or "").strip(),
    }


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--account", required=True, help="account slug")
    ap.add_argument("--name", help="display name; required when creating")
    ap.add_argument("--file", required=True, help="the client's .xlsx")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--apply-moves", action="store_true",
                    help="re-point sites whose coordinates changed, and CLEAR "
                         "their extracted record so it is rebuilt")
    args = ap.parse_args()

    seen: dict = {}
    rows = [parse(r, seen) for r in read_rows(Path(args.file))]
    unknown = sorted({r["site_type"] for r in rows if r["site_type"] is None})
    if unknown:
        raise SystemExit(f"unrecognised Type value(s): {unknown}")
    print(f"{len(rows)} site(s) in {args.file}")

    refs = [r["external_ref"] for r in rows]
    dupes = {r for r in refs if refs.count(r) > 1}
    if dupes:
        # Matching is on this string, so a collision would make one row
        # overwrite the other on every import, forever. The ordinal makes this
        # unreachable; it stays as an assertion rather than a hope.
        raise SystemExit(f"duplicate external_ref(s): {sorted(dupes)}")

    # Two rows on one 500 m cell extract to identical numbers. Reported, never
    # merged: a client tracking two blocks that share a cell may still want two
    # rows, and that is their call rather than this script's.
    by_coord: dict = {}
    for r in rows:
        by_coord.setdefault((round(r["latitude"], 5),
                             round(r["longitude"], 5)), []).append(r)
    shared_cells = {k: v for k, v in by_coord.items() if len(v) > 1}
    for (lat, lon), group in sorted(shared_cells.items()):
        print(f"  SAME COORDINATES {lat:.5f},{lon:.5f}: "
              + ", ".join(g["label"] for g in group))
    if shared_cells:
        print(f"  {len(shared_cells)} coordinate(s) carry more than one site — "
              "these will produce identical values")

    db = SessionLocal()
    try:
        account = db.query(InsightsAccount).filter_by(slug=args.account).one_or_none()
        if account is None:
            if not args.name:
                raise SystemExit("--name is required to create a new account")
            account = InsightsAccount(slug=args.account, name=args.name)
            if not args.dry_run:
                db.add(account)
                db.flush()
            print(f"account '{args.account}' CREATED")
        else:
            print(f"account '{args.account}' exists (id {account.id})")

        existing = {}
        if account.id:
            existing = {s.external_ref: s for s in db.query(InsightsSite)
                        .filter(InsightsSite.account_id == account.id).all()}

        created, updated, moves, unchanged = [], [], [], 0
        snaps: list[str] = []
        for r in rows:
            site = existing.get(r["external_ref"])
            if site is None:
                created.append(r)
                continue
            moved = (abs(site.latitude - r["latitude"]) > COORD_EPSILON
                     or abs(site.longitude - r["longitude"]) > COORD_EPSILON)
            meta = (site.site_type != r["site_type"] or site.label != r["label"])
            if moved:
                moves.append((site, r))
            elif meta:
                updated.append((site, r))
            else:
                unchanged += 1

        print(f"  {len(created)} new, {len(updated)} metadata change(s), "
              f"{len(moves)} MOVED, {unchanged} unchanged")

        for site, r in moves:
            print(f"  MOVED site {site.id} {site.external_ref}: "
                  f"{site.latitude:.5f},{site.longitude:.5f} -> "
                  f"{r['latitude']:.5f},{r['longitude']:.5f}")
        if moves and not args.apply_moves:
            # Every extracted value describes the old cell. Re-pointing without
            # clearing would leave a site whose record is half one place and
            # half another, with nothing on screen to say so.
            print("  refusing to re-point: pass --apply-moves to move these and "
                  "CLEAR their extracted record")

        if args.dry_run:
            print("\ndry run — nothing written")
            db.rollback()
            return 0

        for r in created:
            site = InsightsSite(
                account_id=account.id, public_user_id=None, source="account",
                external_ref=r["external_ref"], label=r["label"],
                latitude=r["latitude"], longitude=r["longitude"],
                site_type=r["site_type"], status="populating")
            try:
                cell, snapped = place(db, r["latitude"], r["longitude"],
                                      r["external_ref"])
                site.grid_row, site.grid_col = cell["row"], cell["col"]
                site.grid_key = cell["grid_key"]
                if snapped:
                    snaps.append(snapped)
            except PlacementError as exc:
                # No land within reach. Stored as failed with the reason, so it
                # appears on the account and can be corrected, rather than being
                # dropped from the import and noticed by nobody.
                site.status = "failed"
                site.status_detail = f"{exc.code}: {exc.message}"
                print(f"  NO CELL for {r['external_ref']} — {exc.code}")
            site.zone_id = svc.resolve_zone(db, r["latitude"], r["longitude"])
            db.add(site)

        for snap in snaps:
            print(f"  SNAPPED {snap}")

        for site, r in updated:
            site.site_type = r["site_type"]
            site.label = r["label"]

        if args.apply_moves:
            for site, r in moves:
                site.latitude, site.longitude = r["latitude"], r["longitude"]
                cell, snapped = place(db, r["latitude"], r["longitude"],
                                      r["external_ref"])
                site.grid_row, site.grid_col = cell["row"], cell["col"]
                site.grid_key = cell["grid_key"]
                if snapped:
                    print(f"  SNAPPED {snapped}")
                site.zone_id = svc.resolve_zone(db, r["latitude"], r["longitude"])
                site.status = "populating"
                site.populated_at = None
                for table in ("insights_site_daily", "insights_site_monthly",
                              "insights_site_season", "insights_site_disease",
                              "insights_site_hourly", "insights_site_projection"):
                    db.execute(text(f"DELETE FROM {table} WHERE site_id = :sid"),
                               {"sid": site.id})
                print(f"  re-pointed site {site.id} and cleared its record")

        db.commit()
        total = db.query(InsightsSite).filter(
            InsightsSite.account_id == account.id).count()
        print(f"\naccount '{args.account}' now holds {total} site(s)")
        print("next: python backend/scripts/populate_insights_sites.py")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
