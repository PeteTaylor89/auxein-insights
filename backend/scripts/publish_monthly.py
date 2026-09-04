"""Publish one reduced month: upload, merge the manifest, append the stats.

    python backend/scripts/publish_monthly.py --month 2026-08 --dry-run
    python backend/scripts/publish_monthly.py --month 2026-08

Takes the tree `reduce_monthly.py` wrote and makes it live. This is the
irreversible step, kept in its own file so it can be read and dry-run on its
own — the same reason `stage_publish.py` exists.

## THE MANIFEST MERGE IS THE WHOLE JOB

A variable's live-era metadata lives at ONE key: `<variable>/manifest-live.json`
holds every month of the era in a single `months` array, and
`validation_stats-live.csv` holds every fitted day. `index_surfaces.py --suffix
live` reads those, not the rasters, so a month whose COGs are uploaded and whose
manifest is not merged **exists in the bucket and is invisible to everything**.
Worse, it stays invisible: a later re-index from the bucket would not find it
either, because the manifest is the index's source of truth.

`stage_publish.py` cannot do this. Its spans are hardcoded `2024-10..2026-07`
and it rebuilds a whole-era manifest from local roots that only ever existed on
the workstation that ran the backfill. This merges instead: read what is live,
add or replace one month, write it back.

## Idempotent, and re-running is the repair

A month already in `months` is REPLACED, not appended, and the stats rows for
that month are dropped before the new ones go in. So a failed publish is fixed
by running it again rather than by hand-editing JSON in a bucket.

## The previous manifest is copied to `_backup/` first

One key holds the whole era. An overwrite that goes wrong takes 22 months of
metadata with it, and the rasters alone cannot rebuild it — `n_days`,
`mean_cv_rmse` and the per-day validation series exist nowhere else.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import logging
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv                                      # noqa: E402

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
os.environ.setdefault("AWS_REGION", "ap-southeast-2")

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("publish-monthly")

BUCKET = os.environ.get("SURFACE_BUCKET", "auxein-climate-surfaces")
SUFFIX = "live"

# The archive's column order. Written back exactly, so a consumer reading the
# whole era does not meet a row shaped differently from the ones around it.
STATS_COLUMNS = ["valid_at", "variable", "n_fit", "n_test", "cv_rmse", "rmse",
                 "t_rmse", "edf", "edf_fraction", "lambda", "cv_units"]


def s3():
    import boto3
    return boto3.client("s3")


def get_json(client, key: str) -> dict:
    return json.loads(client.get_object(Bucket=BUCKET, Key=key)["Body"].read())


def backup(client, key: str, stamp: str, dry: bool) -> str:
    dst = f"_backup/{stamp}/{key}"
    log.info("  backup %s -> %s", key, dst)
    if not dry:
        client.copy_object(Bucket=BUCKET, Key=dst,
                           CopySource={"Bucket": BUCKET, "Key": key})
    return dst


def merge_manifest(man: dict, entry: dict) -> dict:
    """Add or replace one month, then re-derive everything computed from months."""
    months = [m for m in man.get("months", []) if m["valid_at"] != entry["valid_at"]]
    months.append(entry)
    months.sort(key=lambda m: m["valid_at"])

    cvs = sorted(m["mean_cv_rmse"] for m in months
                 if m.get("mean_cv_rmse") is not None)

    def pct(p):
        if not cvs:
            return None
        i = min(len(cvs) - 1, int(round((len(cvs) - 1) * p)))
        return cvs[i]

    man["months"] = months
    man["first"] = months[0]["valid_at"]
    man["last"] = months[-1]["valid_at"]
    man["n_months"] = len(months)
    man["n_days_fitted"] = sum(m.get("n_days", 0) for m in months)
    if cvs:
        man["cv_rmse"] = {
            "median": pct(0.5),
            "mean": sum(cvs) / len(cvs),
            "p90": pct(0.9),
            "max": cvs[-1],
        }
    # A statistic present in the era's manifest but absent from this month would
    # make the top-level list a promise the newest month does not keep. Say so
    # rather than quietly widening or narrowing it.
    declared = set(man.get("statistics") or [])
    got = set(entry.get("statistics") or [])
    if declared and declared != got:
        log.warning("  %s: month bands %s differ from the manifest's declared "
                    "%s", entry["valid_at"], sorted(got - declared) or "-",
                    sorted(declared - got) or "-")
    return man


def merge_stats(existing: str, rows: list[dict], month: str) -> str:
    """Drop this month's rows from the CSV, append the new ones, re-sort."""
    keep = []
    if existing:
        for row in csv.DictReader(io.StringIO(existing)):
            if not row["valid_at"].startswith(month):
                keep.append(row)
    for r in rows:
        keep.append({c: ("" if r.get(c) is None else r.get(c))
                     for c in STATS_COLUMNS})
    keep.sort(key=lambda r: (r["valid_at"], r["variable"]))

    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=STATS_COLUMNS, lineterminator="\n",
                       extrasaction="ignore")
    w.writeheader()
    w.writerows(keep)
    return buf.getvalue()


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--month", required=True, help="YYYY-MM")
    ap.add_argument("--tree", type=Path,
                    default=Path("scratchpad/live_surfaces/monthly_reduce"))
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--skip-index", action="store_true",
                    help="upload and merge but do not reindex. Leaves the "
                         "bucket correct and the DB stale; only for a run that "
                         "will be indexed separately.")
    args = ap.parse_args(argv)

    root = args.tree / args.month
    summary = json.loads((root / "month.json").read_text())
    if summary["month"] != args.month:
        raise SystemExit(f"{root}/month.json is for {summary['month']}")

    client = s3()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    log.info("publishing %s from %s%s", args.month, root,
             "  [DRY RUN]" if args.dry_run else "")

    n_objects = 0
    for variable, block in summary["variables"].items():
        log.info("[%s]", variable)

        # 1. The rasters. Uploaded FIRST: a manifest that names a key which is
        #    not there yet fails the indexer's key cross-check, which is the
        #    right way round — the alternative is an indexed month with no
        #    pixels behind it.
        for rel in block["files"]:
            src = root / rel
            log.info("  put %s (%.1f MB)", rel, src.stat().st_size / 1e6)
            if not args.dry_run:
                client.upload_file(str(src), BUCKET, rel)
            n_objects += 1

        # 2. The manifest.
        key = f"{variable}/manifest-{SUFFIX}.json"
        man = get_json(client, key)
        before = man.get("n_months")
        backup(client, key, stamp, args.dry_run)
        man = merge_manifest(man, block["manifest"])
        log.info("  manifest %s -> %s months, last %s", before,
                 man["n_months"], man["last"])
        if not args.dry_run:
            client.put_object(Bucket=BUCKET, Key=key,
                              Body=json.dumps(man, indent=1).encode(),
                              ContentType="application/json")

        # 3. The per-day validation series.
        #
        #    `rmse` and `t_rmse` are left EMPTY. They are the fit's in-sample
        #    residuals, and `surface_run` does not carry them — only the daily
        #    engine's own run records do, and those exist for four days of
        #    August, not thirty-one. A column populated for four days with no
        #    visible reason is worse than one consistently empty. `cv_rmse`, the
        #    cross-validated number and the one that is actually read, is
        #    present for every day.
        skey = f"{variable}/validation_stats-{SUFFIX}.csv"
        existing = client.get_object(Bucket=BUCKET, Key=skey)["Body"].read().decode()
        backup(client, skey, stamp, args.dry_run)
        merged = merge_stats(existing, block["stats"], args.month)
        log.info("  stats %d -> %d rows", existing.count("\n") - 1,
                 merged.count("\n") - 1)
        if not args.dry_run:
            client.put_object(Bucket=BUCKET, Key=skey, Body=merged.encode(),
                              ContentType="text/csv")

    log.info("%d object(s) uploaded", n_objects)

    if args.skip_index or args.dry_run:
        log.info("not indexing (%s)",
                 "--skip-index" if args.skip_index else "dry run")
        return 0

    # 4. Index. Straight through `index_surfaces.py` against the BUCKET rather
    #    than a local mirror, because the bucket is the authority on what is
    #    actually served and the merge above is exactly what needs verifying.
    cmd = [sys.executable, str(Path(__file__).with_name("index_surfaces.py")),
           "--source", f"s3://{BUCKET}", "--suffix", SUFFIX]
    for variable in summary["variables"]:
        cmd += ["--variable", variable]
    log.info("indexing: %s", " ".join(cmd))
    return subprocess.call(cmd)


if __name__ == "__main__":
    raise SystemExit(main())
