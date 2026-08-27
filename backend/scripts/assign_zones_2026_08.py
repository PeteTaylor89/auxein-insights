#!/usr/bin/env python3
"""Assign stations to the four zones that had no usable input (Pete, 2026-08-27).

Before this, 5 of 23 climate zones produced no hourly climate and therefore no
disease pressure at all. Four of them are fixed here; Waiheke is not, because no
station exists near it.

## Why moving a station DOWN the tree costs the parent nothing

`get_zone_station_mappings` resolves membership through a recursive CTE over
`climate_zones.parent_zone_id`, so a station tagged at a sub-zone contributes to
that sub-zone AND every ancestor. Gimblett Bridge Pa (6) and Ngaruroro (7) are
children of Hawke's Bay (5), so re-tagging Bridge Pa and Crownthorpe from 5 down
to 6 and 7 gives those sub-zones their own series while Hawke's Bay keeps both.

**That only holds for a move DOWN.** Moving a station sideways between siblings
takes it away from the first, because `zone_id` is single-valued.

## South Coast could NOT reuse Awatere's stations, and does not need to

South Coast (21) and Awatere (12) are siblings under Marlborough, so sharing is
impossible with a single `zone_id` column — assigning Awatere's stations to
South Coast would empty Awatere. It turned out not to matter: **station 328
`Ward NRFA` is active, unassigned, and sits at Ward itself** (-41.8386,
174.0772) reporting temperature, humidity, rainfall and wind. That is a better
answer than sharing, and it leaves Awatere untouched.

Usage:
    python backend/scripts/assign_zones_2026_08.py            # dry run
    python backend/scripts/assign_zones_2026_08.py --apply
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from sqlalchemy import text as sa_text

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

logger = logging.getLogger("assign_zones")

# (station_id, target_zone_id, note)
ASSIGNMENTS = [
    # --- South Coast (21), sibling of Awatere under Marlborough --------------
    (328, 21, "Ward NRFA — at Ward, T/H/R/W, previously unassigned"),

    # --- Ngaruroro (7), CHILD of Hawke's Bay (5): rolls up, HB keeps it ------
    (116, 7, "Crownthorpe Climate — moved DOWN from Hawke's Bay"),

    # --- Gimblett Bridge Pa (6), CHILD of Hawke's Bay (5) --------------------
    (115, 6, "Bridge Pa Climate — moved DOWN from Hawke's Bay"),
    (260, 6, "St Johns (Hastings) — T/H/W, no rain gauge, previously unassigned"),

    # --- Upper Wairau and Southern Valleys (13) -----------------------------
    # Was DARK despite two assigned MDC stations, because both are rain gauges
    # and the hourly stage skips an hour with no temperature. All three below
    # carry temperature AND humidity, so this turns the zone on outright.
    (308, 13, "Onamalutu at Hilltop Road NRFA — T/H/R/W"),
    (301, 13, "Lansdowne NRFA — T/H/R/W"),
    (320, 13, "Top Valley at Staircase Ridge — T/H/R"),
]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true",
                    help="write the assignments; without it nothing changes")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
    from db.session import SessionLocal

    db = SessionLocal()
    try:
        zones = {r[0]: (r[1], r[2]) for r in db.execute(sa_text(
            "SELECT id, name, parent_zone_id FROM climate_zones"))}

        logger.info("%-5s %-38s %-28s -> %s", "id", "station", "from", "to")
        moved_down, sideways, fresh = [], [], []
        for sid, zid, note in ASSIGNMENTS:
            row = db.execute(sa_text("""
                SELECT station_name, zone_id, is_active FROM weather_stations
                WHERE station_id = :sid"""), {"sid": sid}).first()
            if row is None:
                logger.error("station %s does not exist — aborting", sid)
                return 1
            name, cur, active = row
            if not active:
                logger.error("station %s (%s) is INACTIVE — aborting", sid, name)
                return 1

            cur_label = f"{cur} {zones[cur][0]}" if cur else "(unassigned)"
            logger.info("%-5s %-38s %-28s -> %s %s",
                        sid, (name or "")[:38], cur_label[:28], zid, zones[zid][0])
            logger.info("        %s", note)

            if cur is None:
                fresh.append(sid)
            elif zones[zid][1] == cur:
                moved_down.append(sid)
            else:
                # A sideways or upward move REMOVES the station from its current
                # zone. Nothing here should do that, so treat it as a mistake in
                # the table rather than something to warn about and proceed.
                logger.error(
                    "  station %s would move from zone %s to zone %s, which is "
                    "NOT its child — that REMOVES it from %s. Aborting.",
                    sid, cur, zid, zones[cur][0])
                sideways.append(sid)

        if sideways:
            return 1

        logger.info("\n%d newly assigned, %d moved down a level (parents keep them), "
                    "0 removed from any zone", len(fresh), len(moved_down))

        if not args.apply:
            logger.info("dry run — nothing written. Re-run with --apply.")
            return 0

        for sid, zid, _ in ASSIGNMENTS:
            db.execute(sa_text(
                "UPDATE weather_stations SET zone_id = :zid WHERE station_id = :sid"),
                {"zid": zid, "sid": sid})
        db.commit()
        logger.info("applied %d assignment(s)", len(ASSIGNMENTS))

        # Report the effective network per touched zone, resolved the same way
        # the rollup resolves it — the only check that means anything here.
        for zid in sorted({z for _, z, _ in ASSIGNMENTS} | {5, 12, 22}):
            n = db.execute(sa_text("""
                WITH RECURSIVE zone_tree(root_id, descendant_id) AS (
                    SELECT id, id FROM climate_zones WHERE is_active
                    UNION ALL
                    SELECT zt.root_id, cz.id FROM climate_zones cz
                    JOIN zone_tree zt ON cz.parent_zone_id = zt.descendant_id
                    WHERE cz.is_active)
                SELECT count(*) FROM zone_tree zt
                JOIN weather_stations ws ON ws.zone_id = zt.descendant_id
                 AND ws.is_active
                WHERE zt.root_id = :zid"""), {"zid": zid}).scalar()
            logger.info("  zone %-3s %-36s effective stations: %s",
                        zid, zones[zid][0], n)
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
