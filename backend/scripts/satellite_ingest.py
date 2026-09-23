"""Sentinel-2 index statistics for every active monitored area.

Phase 2 of the satellite indices plan. Reads Sentinel-2 L2A from Planetary
Computer through `services/satellite_reader.py` and writes one
`area_index_obs` row per (area, scene) with at least one clear pixel. A dry run
unless `--apply`.

    # scheduled: scenes from the last 10 days not yet read against every area
    python backend/scripts/satellite_ingest.py --mode daily --apply --require-items

    # one-off archive, split across N Fargate tasks (shard i of N), then one
    # unsharded sweep that retries failures and marks history complete
    python backend/scripts/satellite_ingest.py --mode backfill --from 2017-01-01 --shard 0/8 --apply
    python backend/scripts/satellite_ingest.py --mode backfill --from 2017-01-01 --apply

    # history for areas that lack it: new on-demand outlines, changed blocks
    python backend/scripts/satellite_ingest.py --mode areas --incomplete --apply

## Full-set vs subset runs, and `sat_scene.processed_at`

`daily` and `backfill` are FULL-SET runs: every scene is read against every
active area, then stamped `processed_at`, and later full-set runs skip it. That
stamp is what keeps the daily job from re-reading ten days of cloudy scenes
every night.

`areas` is a SUBSET run. It reads scenes for a handful of areas, so it must not
stamp `processed_at` - that would tell the daily job the scene had been read for
everyone. It inserts the `sat_scene` rows its observations reference and leaves
the stamp alone. See migration `sat_scene_processed`.

A scene that errors is not stamped, so the next run retries it. Observation
writes are upserts on (area_id, item_id), so a retry is idempotent.

## Why `--require-items`

The designed-in failure mode of a scheduled job here is a silent no-op that
exits 0. Ten days with no Sentinel-2 item at all over New Zealand, even a
cloudy one, means the search broke rather than the sky, so the daily run turns
"found nothing" into a non-zero exit.
"""
import argparse
import sys
import time
import zlib
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from shapely import wkb  # noqa: E402
from sqlalchemy import text  # noqa: E402

from db.session import SessionLocal  # noqa: E402
from services import satellite_reader as sr  # noqa: E402

NZ = ZoneInfo("Pacific/Auckland")
ARCHIVE_START = "2017-01-01"
ERROR_RATE_FAIL = 0.2

OBS_COLS = (["area_id", "item_id", "obs_date", "geom_hash",
             "n_total_10", "n_valid_10", "n_total_20", "n_valid_20"]
            + [f"{ix}_{s}" for ix in sr.INDICES_10 + sr.INDICES_20 for s in sr.STATS]
            + list(sr.SCL_COUNTS))

UPSERT_OBS = text(f"""
INSERT INTO area_index_obs ({", ".join(OBS_COLS)})
VALUES ({", ".join(":" + c for c in OBS_COLS)})
ON CONFLICT (area_id, item_id) DO UPDATE SET
  {", ".join(f"{c} = EXCLUDED.{c}" for c in OBS_COLS[2:])}, created_at = now()
""")

UPSERT_SCENE = text("""
INSERT INTO sat_scene (item_id, collection, acquired_at, mgrs_tile, relative_orbit, platform,
                       processing_baseline, boa_offset, epsg, cloud_cover, processed_at)
VALUES (:item_id, :collection, :acquired_at, :mgrs_tile, :relative_orbit, :platform,
        :processing_baseline, :boa_offset, :epsg, :cloud_cover, :processed_at)
ON CONFLICT (item_id) DO UPDATE SET
  processing_baseline = EXCLUDED.processing_baseline,
  boa_offset = EXCLUDED.boa_offset,
  processed_at = COALESCE(EXCLUDED.processed_at, sat_scene.processed_at)
""")


def load_areas(db, area_ids=None, incomplete=False) -> list[sr.Area]:
    where = ["status = 'active'"]
    params = {}
    if area_ids:
        where.append("id = ANY(:ids)")
        params["ids"] = area_ids
    if incomplete:
        where.append("NOT history_complete")
    rows = db.execute(text(f"""SELECT id, ST_AsBinary(geometry), geom_hash, land_use
                               FROM monitored_area WHERE {' AND '.join(where)}
                               ORDER BY id"""), params)
    return [sr.Area(r[0], wkb.loads(bytes(r[1])), r[2], r[3]) for r in rows]


def slim(item: dict) -> dict:
    """Drop everything the reader does not use: NZ-wide archive searches return
    tens of thousands of items, and full STAC items are ~15 KB each."""
    keep = ("datetime", "platform", "proj:epsg", "eo:cloud_cover", "s2:mgrs_tile",
            "s2:processing_baseline", "s2:datatake_id", "sat:relative_orbit")
    return {"id": item["id"], "geometry": item["geometry"],
            "properties": {k: item["properties"].get(k) for k in keep},
            "assets": {b: {"href": item["assets"][b]["href"]} for b in ("SCL",) + sr.BANDS}}


def shard_of(item: dict, n: int) -> int:
    """Shard on the ACQUISITION, not the item, so the overlap de-duplication in
    `plan_reads` sees every tile of an acquisition inside one shard."""
    p = item["properties"]
    key = f"{p.get('platform')}|{p.get('s2:datatake_id') or p['datetime']}"
    return zlib.crc32(key.encode()) % n


def windows(start: date, end: date, days: int):
    cur = start
    while cur <= end:
        nxt = min(cur + timedelta(days=days - 1), end)
        yield cur, nxt
        cur = nxt + timedelta(days=1)


def process_item(item, cells, token):
    rows = []
    for cell in cells:
        rows += sr.read_cell(item, cell, token)
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--mode", choices=("daily", "backfill", "areas"), required=True)
    ap.add_argument("--from", dest="start", help=f"first date (default: daily lookback, else {ARCHIVE_START})")
    ap.add_argument("--to", dest="end", help="last date (default: today, NZ)")
    ap.add_argument("--lookback-days", type=int, default=10)
    ap.add_argument("--chunk-days", type=int, default=31, help="search window per pass")
    ap.add_argument("--shard", help="i/N: this task's share of a backfill")
    ap.add_argument("--area-ids", help="comma-separated monitored_area ids (areas mode)")
    ap.add_argument("--incomplete", action="store_true", help="areas lacking history (areas mode)")
    ap.add_argument("--max-areas", type=int, default=0,
                    help="areas mode: skip (exit 0) if more areas than this need history - "
                         "that is the archive backfill's job, not a nightly top-up's")
    ap.add_argument("--workers", type=int, default=12)
    ap.add_argument("--max-items", type=int, default=0, help="stop after N items (testing)")
    ap.add_argument("--require-items", action="store_true",
                    help="exit non-zero if the search finds no items at all")
    ap.add_argument("--apply", action="store_true", help="write (default: read and report only)")
    args = ap.parse_args()

    today = datetime.now(NZ).date()
    end = date.fromisoformat(args.end) if args.end else today
    if args.start:
        start = date.fromisoformat(args.start)
    elif args.mode == "daily":
        start = end - timedelta(days=args.lookback_days)
    else:
        start = date.fromisoformat(ARCHIVE_START)
    full_set = args.mode in ("daily", "backfill")
    shard = tuple(int(x) for x in args.shard.split("/")) if args.shard else None
    if shard and args.mode != "backfill":
        ap.error("--shard is for backfill only")
    if args.mode == "areas" and not (args.area_ids or args.incomplete):
        ap.error("areas mode needs --area-ids or --incomplete")

    db = SessionLocal()
    run_started = datetime.now(timezone.utc)
    ids = [int(x) for x in args.area_ids.split(",")] if args.area_ids else None
    areas = load_areas(db, ids, args.incomplete if args.mode == "areas" else False)
    if not areas:
        print("[satellite] no active areas to read")
        return
    if args.mode == "areas" and args.max_areas and len(areas) > args.max_areas:
        print(f"[satellite] {len(areas)} areas need history, over --max-areas {args.max_areas}: "
              f"skipping - run the archive backfill instead")
        return
    cells = sr.build_cells(areas)
    b = [c.bounds for c in cells]
    bbox = [min(x[0] for x in b), min(x[1] for x in b), max(x[2] for x in b), max(x[3] for x in b)]
    print(f"[satellite] mode={args.mode} {start}..{end} areas={len(areas)} cells={len(cells)} "
          f"shard={args.shard or '-'} apply={args.apply}")

    token = sr.SasToken()
    tot = {"found": 0, "skipped": 0, "read": 0, "cell_reads": 0, "rows": 0, "errors": 0}
    t0 = time.time()
    stop = False
    for w0, w1 in windows(start, end, args.chunk_days):
        items = [slim(it) for it in sr.stac_search(bbox, w0.isoformat(), w1.isoformat())]
        tot["found"] += len(items)
        if shard:
            items = [it for it in items if shard_of(it, shard[1]) == shard[0]]
        if full_set and items:
            done = {r[0] for r in db.execute(
                text("SELECT item_id FROM sat_scene WHERE item_id = ANY(:ids) "
                     "AND processed_at IS NOT NULL"), {"ids": [it["id"] for it in items]})}
            tot["skipped"] += len(done)
            items = [it for it in items if it["id"] not in done]
        plan = sr.plan_reads(items, cells)
        by_id = {it["id"]: it for it in items}
        # Items whose footprint touches no cell are still "processed" for the
        # full set: stamping them stops the next run searching them again.
        idle = [it for it in items if it["id"] not in plan]
        if args.max_items:
            room = args.max_items - tot["read"]
            plan = dict(list(plan.items())[:max(room, 0)])
            stop = len(plan) >= room
        print(f"[satellite] {w0}..{w1}: {len(items)} new items, {len(plan)} to read, "
              f"{sum(len(c) for c in plan.values())} cell reads", flush=True)

        if args.apply and full_set and idle:
            for it in idle:
                db.execute(UPSERT_SCENE, {**sr.scene_row(it), "processed_at": run_started})
            db.commit()

        with ThreadPoolExecutor(args.workers) as ex:
            futs = {ex.submit(process_item, by_id[iid], cl, token): iid for iid, cl in plan.items()}
            for n, fut in enumerate(as_completed(futs), 1):
                iid = futs[fut]
                try:
                    rows = fut.result()
                except Exception as e:  # noqa: BLE001 - one bad scene must not stop the run
                    tot["errors"] += 1
                    print(f"[satellite] ERROR {iid}: {str(e)[:200]}", flush=True)
                    continue
                tot["read"] += 1
                tot["cell_reads"] += len(plan[iid])
                tot["rows"] += len(rows)
                if args.apply:
                    db.execute(UPSERT_SCENE, {**sr.scene_row(by_id[iid]),
                                              "processed_at": run_started if full_set else None})
                    if rows:
                        db.execute(UPSERT_OBS, [{c: r.get(c) for c in OBS_COLS} for r in rows])
                    db.commit()
                if n % 25 == 0:
                    rate = tot["read"] / (time.time() - t0)
                    print(f"[satellite]   {n}/{len(plan)} items, {rate:.2f} items/s, "
                          f"{tot['rows']} rows", flush=True)
        if stop:
            break

    elapsed = time.time() - t0
    print(f"[satellite] found={tot['found']} already_done={tot['skipped']} read={tot['read']} "
          f"cell_reads={tot['cell_reads']} obs_rows={tot['rows']} errors={tot['errors']} "
          f"in {elapsed / 60:.1f} min")

    # History flags. Only an unsharded, error-free run that started at the
    # archive start can vouch for an area's whole history.
    complete = (args.apply and not shard and tot["errors"] == 0 and not args.max_items
                and start <= date.fromisoformat(ARCHIVE_START) and args.mode != "daily")
    if complete:
        n = db.execute(text("""UPDATE monitored_area
                               SET history_from = LEAST(COALESCE(history_from, :s), :s),
                                   history_complete = true, updated_at = now()
                               WHERE id = ANY(:ids) AND created_at <= :t"""),
                       {"s": start, "ids": [a.id for a in areas], "t": run_started}).rowcount
        db.commit()
        print(f"[satellite] marked history complete from {start} on {n} area(s)")
    db.close()

    if args.require_items and tot["found"] == 0:
        print("[satellite] FATAL: search returned no items at all - the search is broken, "
              "not the sky", file=sys.stderr)
        sys.exit(1)
    attempted = tot["read"] + tot["errors"]
    if attempted and tot["errors"] / attempted > ERROR_RATE_FAIL:
        print(f"[satellite] FATAL: {tot['errors']}/{attempted} items failed", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
