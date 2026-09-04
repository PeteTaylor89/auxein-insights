"""Reclaim the 23.6 GB `climate_historical_data` heap, behind a pre-flight gate.

    backend/venv/Scripts/python.exe backend/scripts/truncate_climate_historical_data.py
    backend/venv/Scripts/python.exe backend/scripts/truncate_climate_historical_data.py --execute --confirm-table climate_historical_data

Default is a DRY RUN: it reports and runs every check, and touches nothing.

WHY THIS TABLE
--------------
`climate_historical_data` is 44% of the database (23.6 GB of 53.3 GB): 121.3 M
rows, 8,744 blocks x 13,879 days, 1986-01-01 to 2023-12-31, every row
`data_quality = 'interpolated'`. It was written once in January 2026 and never
updated. The vineyard-block climate record it serves has been superseded by the
surface-derived Insights path (`climate_zone_surface_*`, `insights_site_*`).

The only reader is `backend/api/v1/climate.py` at `/api/climate`, whose only
front-end consumer is `packages/web/src/components/climate/ClimateContainer.jsx`
-- which nothing imports and no route mounts. Mobile has no climate code at all.
`RegionalClimateHistory.jsx`, the component actually on `/insights`, reads the
zone tables through `publicClimateService`, not this table.

WHY TRUNCATE AND NOT DELETE
---------------------------
`DELETE FROM` would write ~22 GB of WAL, run for hours on a db.t3.medium, spike
backup storage, and still leave the 23.6 GB as bloat -- reclaiming it would then
need a `VACUUM FULL` that wants 23.6 GB of free space and the same
ACCESS EXCLUSIVE lock TRUNCATE takes for a fraction of a second. TRUNCATE
returns the pages to the filesystem at commit.

WHAT THIS DOES NOT BUY YOU
--------------------------
Money, directly. gp2 bills the 100 GB ALLOCATED, not the 50 GB used, and RDS
cannot shrink allocated storage in place. Only `ChargedBackupUsage` moves
(~$0.64/mo). What it buys is runway: FreeStorageSpace is ~49.5 GB falling
~92 MB/day with storage autoscaling OFF (MaxAllocatedStorage == 100), so the
instance hits a hard wall in ~18 months. Reclaiming this pushes that to ~26.

IT IS REVERSIBLE
----------------
The source of truth is 8,744 CSVs on Z:, one per block id, and check C8 below
refuses to run unless they are present and consistent with what is in the table.
To restore:

    python backend/scripts/data_import/import_climate_csvs_optimized.py \\
        --csv-dir "Z:\\Data\\NZ_Climate_History\\Vineyards\\Merged" --workers 8

The table, the model, the router and the endpoints all survive untouched --
`climate_calculations.py` guards every empty-data path, so they degrade to empty
responses rather than 500s.
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv                                      # noqa: E402

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
os.environ.setdefault("AWS_REGION", "ap-southeast-2")

from sqlalchemy import text                                         # noqa: E402

from db.session import SessionLocal, engine                         # noqa: E402


TABLE = "climate_historical_data"
DEFAULT_CSV_DIR = r"Z:\Data\NZ_Climate_History\Vineyards\Merged"
EXPECTED_HEADER = "Date,ID,Tmean(C),Tmin(C),Tmax(C),Amount(mm),Amount(MJm2)"
EXPECTED_FIRST_DATE = "1986-01-01"
EXPECTED_LAST_DATE = "2023-12-31"
SAMPLE_CSVS = 25
ROW_TOLERANCE = 0.05          # sampled CSV row estimate vs reltuples
SNAPSHOT_MAX_AGE_HOURS = 24

checks: list[tuple[str, str, str]] = []   # (id, state, message); state in PASS/WARN/FAIL


def record(cid: str, state: str, message: str) -> None:
    checks.append((cid, state, message))
    icon = {"PASS": "  ok  ", "WARN": " warn ", "FAIL": " FAIL "}[state]
    print(f"[{icon}] {cid}  {message}")


def failed() -> list[str]:
    return [c for c, s, _ in checks if s == "FAIL"]


def human(n: int | None) -> str:
    if n is None:
        return "n/a"
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(n) < 1024:
            return f"{n:.1f} {unit}"
        n /= 1024.0
    return f"{n:.1f} PB"


# --------------------------------------------------------------------------
# reporting
# --------------------------------------------------------------------------

def describe(db) -> dict:
    """Sizes and identity. Uses reltuples, never count(*) -- an exact count is a
    full seq scan of the 19 GB heap and takes ~5 minutes on this instance."""
    row = db.execute(text("""
        select current_database(), current_user,
               inet_server_addr()::text,
               pg_database_size(current_database()),
               coalesce(pg_total_relation_size(to_regclass(:t)), 0),
               coalesce(pg_relation_size(to_regclass(:t)), 0),
               coalesce(pg_indexes_size(to_regclass(:t)), 0)
    """), {"t": TABLE}).one()
    dbname, user, server_ip, db_size, tot, heap, idx = row

    reltuples = db.execute(text(
        "select coalesce(c.reltuples, -1)::bigint from pg_class c where c.oid = to_regclass(:t)"
    ), {"t": TABLE}).scalar()

    host = engine.url.host or "unknown"
    pct = (tot / db_size * 100.0) if db_size else 0.0

    print()
    print("=" * 78)
    print(f"  host      {host}")
    print(f"  database  {dbname}   user {user}   server {server_ip}")
    print(f"  ENV       {os.getenv('ENV', 'local')}")
    print("-" * 78)
    print(f"  database total        {human(db_size)}")
    print(f"  {TABLE}   {human(tot)}  ({pct:.1f}% of the database)")
    print(f"      heap              {human(heap)}")
    print(f"      indexes           {human(idx)}")
    print(f"      est. rows         {reltuples:,}")
    print("=" * 78)
    print()

    return {
        "host": host, "database": dbname, "user": user,
        "db_size": db_size, "total": tot, "heap": heap, "indexes": idx,
        "reltuples": reltuples, "pct_of_db": round(pct, 2),
    }


# --------------------------------------------------------------------------
# pre-flight checks
# --------------------------------------------------------------------------

def check_host(db, host_contains: str) -> None:
    host = engine.url.host or ""
    if host_contains.lower() in host.lower():
        record("C1", "PASS", f"connected to a host matching '{host_contains}' ({host})")
    else:
        record("C1", "FAIL",
               f"host '{host}' does not contain '{host_contains}'. "
               f"Pass --host-contains to accept it deliberately.")


def check_table_exists(db) -> None:
    oid = db.execute(text("select to_regclass(:t)"), {"t": TABLE}).scalar()
    if oid:
        record("C2", "PASS", f"{TABLE} exists")
    else:
        record("C2", "FAIL", f"{TABLE} does not exist -- nothing to do")


def check_no_inbound_fks(db) -> None:
    rows = db.execute(text("""
        select conrelid::regclass::text, conname
        from pg_constraint
        where confrelid = to_regclass(:t) and contype = 'f'
    """), {"t": TABLE}).all()
    if not rows:
        record("C3", "PASS", "no foreign key references this table (TRUNCATE needs no CASCADE)")
    else:
        detail = ", ".join(f"{r[0]}.{r[1]}" for r in rows)
        record("C3", "FAIL", f"{len(rows)} inbound FK(s) -- child data would be orphaned: {detail}")


def check_no_dependent_views(db) -> None:
    rows = db.execute(text("""
        select distinct dv.relkind, dn.nspname || '.' || dv.relname
        from pg_depend d
        join pg_rewrite r on r.oid = d.objid
        join pg_class dv on dv.oid = r.ev_class
        join pg_namespace dn on dn.oid = dv.relnamespace
        where d.refobjid = to_regclass(:t) and dv.oid <> to_regclass(:t)
    """), {"t": TABLE}).all()
    if not rows:
        record("C4", "PASS", "no view or materialised view depends on this table")
    else:
        detail = ", ".join(f"{r[1]} ({r[0]})" for r in rows)
        record("C4", "FAIL", f"{len(rows)} dependent relation(s) would go empty: {detail}")


def check_usage_stats(db) -> None:
    row = db.execute(text("""
        select coalesce(idx_scan, 0), coalesce(seq_scan, 0),
               coalesce(n_tup_upd, 0), coalesce(n_tup_ins, 0)
        from pg_stat_user_tables where relname = :t
    """), {"t": TABLE}).first()
    if row is None:
        record("C5", "WARN", "no pg_stat_user_tables row -- cannot judge read activity")
        return
    idx_scan, seq_scan, n_upd, n_ins = row
    if idx_scan == 0 and n_upd == 0:
        record("C5", "PASS",
               f"never index-scanned and never updated since it was written "
               f"(idx_scan=0, n_tup_upd=0, seq_scan={seq_scan:,}, n_tup_ins={n_ins:,})")
    else:
        record("C5", "WARN",
               f"the table has seen activity: idx_scan={idx_scan:,}, n_tup_upd={n_upd:,}. "
               f"Confirm what is reading it before proceeding.")


def check_no_active_queries(db) -> None:
    rows = db.execute(text("""
        select pid, state, left(query, 90)
        from pg_stat_activity
        where pid <> pg_backend_pid()
          and query ilike '%' || :t || '%'
          and query not ilike '%pg_stat_activity%'
          and state <> 'idle'
    """), {"t": TABLE}).all()
    if not rows:
        record("C6", "PASS", "no other backend is currently querying the table")
    else:
        detail = "; ".join(f"pid {r[0]} [{r[1]}] {r[2]}" for r in rows)
        record("C6", "FAIL", f"{len(rows)} live query/queries would block the lock: {detail}")


def check_recent_snapshot(instance_id: str, require: bool) -> None:
    if not require:
        record("C7", "WARN", "snapshot check skipped by --no-snapshot-check -- you are flying without a net")
        return
    try:
        import boto3                                                # noqa: PLC0415
    except ImportError:
        record("C7", "FAIL", "boto3 not installed, cannot verify a snapshot exists. "
                             "Take one in the console, then pass --no-snapshot-check.")
        return
    try:
        rds = boto3.client("rds", region_name=os.environ["AWS_REGION"])
        resp = rds.describe_db_snapshots(DBInstanceIdentifier=instance_id, SnapshotType="manual")
    except Exception as exc:                                         # noqa: BLE001
        record("C7", "FAIL", f"could not list snapshots for '{instance_id}': {str(exc)[:160]}")
        return

    now = datetime.now(timezone.utc)
    fresh = [
        s for s in resp.get("DBSnapshots", [])
        if s.get("Status") == "available" and s.get("SnapshotCreateTime")
        and (now - s["SnapshotCreateTime"]).total_seconds() < SNAPSHOT_MAX_AGE_HOURS * 3600
    ]
    if fresh:
        newest = max(fresh, key=lambda s: s["SnapshotCreateTime"])
        age_h = (now - newest["SnapshotCreateTime"]).total_seconds() / 3600.0
        record("C7", "PASS",
               f"manual snapshot '{newest['DBSnapshotIdentifier']}' is {age_h:.1f} h old")
    else:
        record("C7", "FAIL",
               f"no available manual snapshot of '{instance_id}' in the last "
               f"{SNAPSHOT_MAX_AGE_HOURS} h. Take one first:\n"
               f"           aws rds create-db-snapshot --region {os.environ['AWS_REGION']} \\\n"
               f"               --db-instance-identifier {instance_id} \\\n"
               f"               --db-snapshot-identifier pre-truncate-chd-"
               f"{now:%Y%m%d}")


def check_source_csvs(csv_dir: str, reltuples: int, require: bool) -> None:
    """The recoverability gate. Refuses to truncate unless the CSVs that built
    the table are present and roughly account for the rows that are in it."""
    if not require:
        record("C8", "WARN", "source-CSV check skipped by --skip-source-check -- "
                             "this makes the truncate irreversible")
        return

    d = Path(csv_dir)
    if not d.is_dir():
        record("C8", "FAIL", f"source directory not reachable: {csv_dir} "
                             f"(is the Z: drive mounted?)")
        return

    files = sorted(d.glob("*.csv"))
    if not files:
        record("C8", "FAIL", f"no CSVs in {csv_dir}")
        return

    sample = random.sample(files, min(SAMPLE_CSVS, len(files)))
    line_counts: list[int] = []
    for f in sample:
        try:
            with f.open("r", encoding="utf-8", errors="replace") as fh:
                lines = fh.read().splitlines()
        except OSError as exc:
            record("C8", "FAIL", f"could not read {f.name}: {exc}")
            return
        if not lines or lines[0].strip() != EXPECTED_HEADER:
            got = repr(lines[0][:60]) if lines else "<empty file>"
            record("C8", "FAIL",
                   f"{f.name} header is not the expected import shape (got {got})")
            return
        body = [ln for ln in lines[1:] if ln.strip()]
        if not body:
            record("C8", "FAIL", f"{f.name} has a header but no rows")
            return
        if not body[0].startswith(EXPECTED_FIRST_DATE) or not body[-1].startswith(EXPECTED_LAST_DATE):
            record("C8", "FAIL",
                   f"{f.name} spans {body[0][:10]}..{body[-1][:10]}, "
                   f"expected {EXPECTED_FIRST_DATE}..{EXPECTED_LAST_DATE}")
            return
        line_counts.append(len(body))

    mean_rows = sum(line_counts) / len(line_counts)
    estimated = int(mean_rows * len(files))
    if reltuples <= 0:
        record("C8", "WARN",
               f"{len(files):,} CSVs look sound ({estimated:,} rows estimated) but "
               f"reltuples is unavailable, so they could not be reconciled")
        return

    drift = abs(estimated - reltuples) / float(reltuples)
    msg = (f"{len(files):,} CSVs at {csv_dir}, {EXPECTED_FIRST_DATE}..{EXPECTED_LAST_DATE}, "
           f"~{estimated:,} rows vs {reltuples:,} in the table ({drift * 100:.1f}% drift)")
    if drift <= ROW_TOLERANCE:
        record("C8", "PASS", "source is intact and reconciles: " + msg)
    else:
        record("C8", "FAIL",
               f"source does not reconcile with the table -- restoring would not "
               f"reproduce what you are about to delete: {msg}")


# --------------------------------------------------------------------------
# execution
# --------------------------------------------------------------------------

def do_truncate(db, restart_identity: bool, lock_timeout: str) -> None:
    clause = f"TRUNCATE TABLE {TABLE}" + (" RESTART IDENTITY" if restart_identity else "")
    print(f"\n  executing: {clause}")
    db.execute(text(f"SET lock_timeout = '{lock_timeout}'"))
    db.execute(text("SET statement_timeout = '0'"))
    started = datetime.now(timezone.utc)
    db.execute(text(clause))
    db.commit()
    elapsed = (datetime.now(timezone.utc) - started).total_seconds()
    print(f"  committed in {elapsed:.2f}s\n")


def main() -> int:
    ap = argparse.ArgumentParser(description=f"Pre-flight and TRUNCATE for {TABLE}.")
    ap.add_argument("--execute", action="store_true",
                    help="actually truncate. Without it this is a dry run.")
    ap.add_argument("--confirm-table", default="",
                    help=f"must be exactly '{TABLE}' when --execute is given")
    ap.add_argument("--host-contains", default="auxein-db",
                    help="substring the connected DB host must contain (default: auxein-db)")
    ap.add_argument("--csv-dir", default=DEFAULT_CSV_DIR,
                    help=f"source CSVs used for the recoverability check (default: {DEFAULT_CSV_DIR})")
    ap.add_argument("--skip-source-check", action="store_true",
                    help="do not verify the source CSVs. Makes the truncate irreversible.")
    ap.add_argument("--no-snapshot-check", action="store_true",
                    help="do not require a recent manual RDS snapshot")
    ap.add_argument("--keep-identity", action="store_true",
                    help="do not RESTART IDENTITY (default is to reset the id sequence)")
    ap.add_argument("--lock-timeout", default="30s",
                    help="give up rather than queue behind a long query (default: 30s)")
    ap.add_argument("--receipt", default="",
                    help="optional path to write a JSON receipt of before/after sizes")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        before = describe(db)

        instance_id = (before["host"] or "").split(".")[0] or "auxein-db"

        print("pre-flight")
        print("-" * 78)
        check_host(db, args.host_contains)
        check_table_exists(db)
        if before["reltuples"] > 0:
            check_no_inbound_fks(db)
            check_no_dependent_views(db)
            check_usage_stats(db)
            check_no_active_queries(db)
        check_recent_snapshot(instance_id, require=not args.no_snapshot_check)
        check_source_csvs(args.csv_dir, before["reltuples"], require=not args.skip_source_check)
        print("-" * 78)

        bad = failed()
        warned = [c for c, s, _ in checks if s == "WARN"]
        print(f"\n{len(checks) - len(bad) - len(warned)} passed, "
              f"{len(warned)} warned, {len(bad)} failed")

        if bad:
            print(f"\nBLOCKED by {', '.join(bad)}. Nothing was changed.")
            return 1

        if not args.execute:
            print("\nDRY RUN -- nothing was changed. Every check passed.")
            print("To go ahead:")
            print(f"    ... truncate_climate_historical_data.py --execute "
                  f"--confirm-table {TABLE}")
            print(f"\nThis would return {human(before['total'])} to the filesystem "
                  f"({before['pct_of_db']}% of the database).")
            return 0

        if args.confirm_table != TABLE:
            print(f"\nREFUSED: --execute requires --confirm-table {TABLE} "
                  f"(got {args.confirm_table!r}). Nothing was changed.")
            return 1

        do_truncate(db, restart_identity=not args.keep_identity,
                    lock_timeout=args.lock_timeout)

        after = describe(db)
        reclaimed = before["total"] - after["total"]
        print(f"  reclaimed {human(reclaimed)}   "
              f"database {human(before['db_size'])} -> {human(after['db_size'])}")
        print()
        print("  The table, model, router and endpoints are untouched; the "
              "/api/climate\n  endpoints now return empty rather than 500 "
              "(climate_calculations.py guards\n  every empty-data path).")
        print()
        print("  To restore from source:")
        print(f"      python backend/scripts/data_import/import_climate_csvs_optimized.py \\")
        print(f"          --csv-dir \"{args.csv_dir}\" --workers 8")
        print()
        print("  NOTE: RDS does not shrink AllocatedStorage. This frees space "
              "inside the\n  100 GB volume -- it buys runway, not a smaller bill.")

        if args.receipt:
            payload = {
                "table": TABLE,
                "truncated_at": datetime.now(timezone.utc).isoformat(),
                "before": before, "after": after, "reclaimed_bytes": reclaimed,
                "checks": [{"id": c, "state": s, "message": m} for c, s, m in checks],
                "restore_csv_dir": args.csv_dir,
            }
            Path(args.receipt).write_text(json.dumps(payload, indent=2), encoding="utf-8")
            print(f"  receipt written to {args.receipt}")

        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
