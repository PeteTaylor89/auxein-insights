"""Keep `monitored_area` in step with the national vineyard register.

One area per register block (`vineyard_blocks.company_id IS NULL`), created on
first sight and re-synced when the block's outline changes. Idempotent; a
dry run unless `--apply`.

    python backend/scripts/seed_monitored_areas.py            # report only
    python backend/scripts/seed_monitored_areas.py --apply

## Three cases

* **New register block** -> new area, `source='register'`, `status='active'`,
  `history_complete=false`, so the next backfill reads its history.
* **Outline changed** (`geom_hash` differs) -> the snapshot geometry is
  replaced, its observations are DELETED and `history_complete` reset. Index
  history computed over the old outline does not describe the new one, and a
  series that silently changes outline part-way is the error this prevents.
* **No longer a register block** (assigned to a company, or deleted) -> the
  area is paused, not deleted. Whether a customer block keeps being read is an
  entitlement decision (Phase 4); pausing keeps its history until then.

Customer (Grow) blocks are not seeded here: they are read only while entitled,
and that wiring arrives with the serving code.

`geom_hash` is md5 of the WKB of `ST_Multi(geometry)` - computed in the
database, so the comparison can never disagree with the stored geometry over a
Python/GEOS round trip.
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text  # noqa: E402

from db.session import SessionLocal  # noqa: E402

# 0.01 ha is one 10 m pixel. Below it the outline is degenerate, not small: on
# 2026-09-23 five register blocks (4413, 6730, 7279, 8115, 8116) had polygons of
# under 1 m2 while their stored `area` said 1.4-5.6 ha. Reading them is
# pointless and 0.0000 ha breaks ck_monitored_area_area_positive, so they are
# reported and skipped until the outlines are redrawn.
MIN_AREA_HA = 0.01

REGISTER = ("b.company_id IS NULL AND b.geometry IS NOT NULL AND ST_IsValid(b.geometry) "
            f"AND ST_Area(b.geometry::geography) / 1e4 >= {MIN_AREA_HA}")

DEGENERATE = f"""
SELECT b.id FROM vineyard_blocks b
WHERE b.company_id IS NULL AND b.geometry IS NOT NULL
  AND ST_Area(b.geometry::geography) / 1e4 < {MIN_AREA_HA}
ORDER BY b.id
"""

COUNTS = f"""
WITH blk AS (
  SELECT b.id, md5(ST_AsBinary(ST_Multi(b.geometry))) AS h FROM vineyard_blocks b WHERE {REGISTER}
)
SELECT
  (SELECT count(*) FROM blk WHERE id NOT IN
     (SELECT block_id FROM monitored_area WHERE block_id IS NOT NULL))               AS new,
  (SELECT count(*) FROM blk JOIN monitored_area a ON a.block_id = blk.id
     WHERE a.geom_hash <> blk.h)                                                    AS changed,
  (SELECT count(*) FROM monitored_area a
     WHERE a.source = 'register' AND a.status = 'active'
       AND (a.block_id IS NULL OR a.block_id NOT IN (SELECT id FROM blk)))           AS gone,
  (SELECT count(*) FROM monitored_area a JOIN blk ON a.block_id = blk.id
     WHERE a.source = 'register' AND a.status = 'paused')                           AS returning
"""

INSERT_NEW = f"""
INSERT INTO monitored_area (kind, land_use, source, block_id, geometry, geom_hash, area_ha)
SELECT 'vineyard_block', 'vineyard', 'register', b.id, ST_Multi(b.geometry),
       md5(ST_AsBinary(ST_Multi(b.geometry))), ST_Area(b.geometry::geography) / 1e4
FROM vineyard_blocks b
WHERE {REGISTER}
  AND NOT EXISTS (SELECT 1 FROM monitored_area a WHERE a.block_id = b.id)
"""

CHANGED_IDS = f"""
SELECT a.id FROM monitored_area a JOIN vineyard_blocks b ON b.id = a.block_id
WHERE {REGISTER} AND a.geom_hash <> md5(ST_AsBinary(ST_Multi(b.geometry)))
"""

RESYNC = """
UPDATE monitored_area a
SET geometry = ST_Multi(b.geometry), geom_hash = md5(ST_AsBinary(ST_Multi(b.geometry))),
    area_ha = ST_Area(b.geometry::geography) / 1e4,
    history_from = NULL, history_complete = false, updated_at = now()
FROM vineyard_blocks b
WHERE b.id = a.block_id AND a.id = ANY(:ids)
"""

PAUSE_GONE = f"""
UPDATE monitored_area a SET status = 'paused', updated_at = now()
WHERE a.source = 'register' AND a.status = 'active'
  AND (a.block_id IS NULL OR NOT EXISTS
       (SELECT 1 FROM vineyard_blocks b WHERE b.id = a.block_id AND {REGISTER}))
"""

REACTIVATE = f"""
UPDATE monitored_area a SET status = 'active', updated_at = now()
FROM vineyard_blocks b
WHERE b.id = a.block_id AND {REGISTER} AND a.source = 'register' AND a.status = 'paused'
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--apply", action="store_true", help="write (default: report only)")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        new, changed, gone, returning = db.execute(text(COUNTS)).one()
        print(f"[seed_areas] register blocks: new={new} outline_changed={changed} "
              f"no_longer_register={gone} returning={returning}")
        bad = [r[0] for r in db.execute(text(DEGENERATE))]
        if bad:
            print(f"[seed_areas] skipped {len(bad)} degenerate outline(s) under {MIN_AREA_HA} ha, "
                  f"block ids {bad} - redraw them")
        if not args.apply:
            print("[seed_areas] dry run - pass --apply to write")
            return

        ids = [r[0] for r in db.execute(text(CHANGED_IDS))]
        if ids:
            n_obs = db.execute(text("DELETE FROM area_index_obs WHERE area_id = ANY(:ids)"),
                               {"ids": ids}).rowcount
            db.execute(text("DELETE FROM area_index_composite WHERE area_id = ANY(:ids)"),
                       {"ids": ids})
            db.execute(text("DELETE FROM area_index_baseline WHERE area_id = ANY(:ids)"),
                       {"ids": ids})
            db.execute(text(RESYNC), {"ids": ids})
            print(f"[seed_areas] re-synced {len(ids)} changed outline(s), dropped {n_obs} obs rows")
        n_new = db.execute(text(INSERT_NEW)).rowcount
        n_paused = db.execute(text(PAUSE_GONE)).rowcount
        n_back = db.execute(text(REACTIVATE)).rowcount
        db.commit()
        total = db.execute(text("SELECT count(*) FROM monitored_area "
                                "WHERE source = 'register' AND status = 'active'")).scalar()
        print(f"[seed_areas] inserted {n_new}, paused {n_paused}, reactivated {n_back}; "
              f"{total} active register areas")
    finally:
        db.close()


if __name__ == "__main__":
    main()
