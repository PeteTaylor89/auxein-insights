"""Populate `surface_run` + `surface_validation_stats` from the published archive.

SURFACE_CONTRACT_V2 §3. The COGs are already on S3; this builds the Postgres
index that lets `/api/v1/surfaces` locate any one of them with a single query
and state how accurate it is. Nothing here reads or writes pixels — it reads
the four `manifest.json` files and the four `validation_stats.csv` files that
`run_history.py` emitted alongside them.

Run it against the bucket, which is the authority on what is actually served::

    python backend/scripts/index_surfaces.py --dry-run
    python backend/scripts/index_surfaces.py

Against the local mirror instead (no S3 credentials needed for the manifests,
but then the key cross-check is skipped unless --verify-keys is given)::

    python backend/scripts/index_surfaces.py --source scratchpad/climate_history/bucket

Idempotent. Both tables are upserted on their natural keys, so re-running after
a partial failure or after re-publishing a variable converges rather than
duplicating. It never deletes: a key that vanishes from S3 is reported as an
orphan, not silently dropped, because the far more likely cause is a bad
`--source` than a genuinely retracted surface.

## Two things this deliberately does NOT paper over

**`clipped` is False, for every row.** The contract's `clipped` flag means the
on-prem model's `np.clip(interpolated, observed_min, observed_max)`. The
production grid path does not do that: `run_history.py` projects through
`fastgrid.GridBasis.project`, which has no clipping at all, and the only clamp
applied is `maximum(block, 0)` on rainfall. Recording True here because the
legacy model clipped would assert a bound the archive does not have. Note that
CV scoring *does* clip (`tps.py`), so `cv_rmse` measures a slightly different
estimator than the one that produced the raster — a known, documented gap.

**Rainfall `cv_rmse` is dimensionless and is stored with `cv_units='ratio'`.**
The spline fits rainfall/MAR, so the number is ~0.0025 and is NOT millimetres.
Anything rendering a confidence figure must branch on `cv_units`; treating it as
mm understates the error by roughly three orders of magnitude and reads as
extraordinary precision. See `alembic/versions/surface_cv_units.py`.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import logging
import os
import sys
from calendar import monthrange
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Iterable, Iterator, Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

log = logging.getLogger("index_surfaces")

DEFAULT_BUCKET = "auxein-climate-surfaces"
VARIABLES = ("temp_mean", "temp_max", "temp_min", "rainfall")

# `screen_relevance` runs at the default in run_history.py, so every surface in
# this archive was fitted under an 800 km relevance rule.
RELEVANCE_KM = 800.0

# Statistics that describe the whole record rather than one month. They live
# under records/ and carry period_start..valid_at rather than a single month.
RECORD_STATISTICS = ("all_time_max", "all_time_max_day",
                     "all_time_min", "all_time_min_day")


# --- source abstraction -----------------------------------------------------
# Local mirror and bucket are the same tree — `run_history.py` writes the
# literal S3 key layout under `bucket/` precisely so publishing is a plain sync
# with no path rewriting. So one interface serves both.

class Source:
    """Read manifests and CSVs, and enumerate keys, from S3 or a local dir."""

    def describe(self) -> str:
        raise NotImplementedError

    def read_text(self, key: str) -> str:
        raise NotImplementedError

    def list_keys(self, prefix: str = "") -> set[str]:
        raise NotImplementedError


class S3Source(Source):
    def __init__(self, bucket: str):
        import boto3
        self.bucket = bucket
        self.s3 = boto3.client("s3")

    def describe(self) -> str:
        return f"s3://{self.bucket}"

    def read_text(self, key: str) -> str:
        obj = self.s3.get_object(Bucket=self.bucket, Key=key)
        return obj["Body"].read().decode("utf-8")

    def list_keys(self, prefix: str = "") -> set[str]:
        keys: set[str] = set()
        paginator = self.s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
            for item in page.get("Contents", ()):
                keys.add(item["Key"])
        return keys


class LocalSource(Source):
    def __init__(self, root: Path):
        self.root = root.resolve()
        if not self.root.is_dir():
            raise SystemExit(f"--source {root} is not a directory")

    def describe(self) -> str:
        return str(self.root)

    def read_text(self, key: str) -> str:
        return (self.root / key).read_text(encoding="utf-8")

    def list_keys(self, prefix: str = "") -> set[str]:
        base = self.root / prefix if prefix else self.root
        if not base.exists():
            return set()
        return {p.relative_to(self.root).as_posix()
                for p in base.rglob("*") if p.is_file()}


# --- key construction -------------------------------------------------------
# Contract §1.1. These two functions are the only place the layout is encoded;
# if the contract moves, it moves here and nowhere else.

def monthly_key(variable: str, year: int, month: int, res_m: int,
                statistic: str) -> str:
    return (f"surfaces/v2/{variable}/monthly/{year}/"
            f"{variable}_monthly_{year}{month:02d}_{res_m}m_{statistic}.tif")


def records_key(variable: str, res_m: int, statistic: str) -> str:
    return f"surfaces/v2/{variable}/records/{variable}_records_{res_m}m_{statistic}.tif"


# --- validation stats -------------------------------------------------------

def _f(row: dict, name: str) -> Optional[float]:
    raw = (row.get(name) or "").strip()
    if not raw:
        return None
    try:
        value = float(raw)
    except ValueError:
        return None
    # Postgres double precision accepts NaN, and it then poisons every
    # aggregate downstream while comparing unequal to itself — the exact trap
    # already logged against this platform. Drop it to NULL at the boundary.
    return None if value != value else value


def _i(row: dict, name: str) -> Optional[int]:
    value = _f(row, name)
    return None if value is None else int(value)


def read_validation_rows(source: Source, variable: str, res_m: int,
                         model_version: str) -> list[dict]:
    """One row per FIT — per variable per day. Mirrors validation_stats.csv."""
    text = source.read_text(f"{variable}/validation_stats.csv")
    rows: list[dict] = []
    for raw in csv.DictReader(io.StringIO(text)):
        valid_on = datetime.strptime(raw["valid_at"], "%Y-%m-%d").date()
        rows.append({
            "variable": variable,
            "valid_on": valid_on,
            "resolution_m": res_m,
            "model_version": model_version,
            "n_fit": _i(raw, "n_fit"),
            "n_test": _i(raw, "n_test"),
            "cv_rmse": _f(raw, "cv_rmse"),
            "rmse": _f(raw, "rmse"),
            "t_rmse": _f(raw, "t_rmse"),
            "snr": _f(raw, "snr"),
            "mae": _f(raw, "mae"),
            "bias": _f(raw, "bias"),
            "r2": _f(raw, "r2"),
            "max_abs_error": _f(raw, "max_abs_error"),
            "edf": _f(raw, "edf"),
            "lam": _f(raw, "lambda"),
            # Present only on rainfall, where it reads 'ratio'.
            "cv_units": (raw.get("cv_units") or "").strip() or None,
            # No column of its own on surface_validation_stats — carried only so
            # `summarise_by_month` can average it onto surface_run.edf_frac, and
            # stripped again before insert.
            "edf_fraction": _f(raw, "edf_fraction"),
        })
    return rows


def _median(values: list[float]) -> Optional[float]:
    if not values:
        return None
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[mid]
    return (ordered[mid - 1] + ordered[mid]) / 2.0


def summarise_by_month(rows: Iterable[dict]) -> dict[tuple[int, int], dict]:
    """Collapse daily fits to the month, for the summary columns on surface_run.

    A monthly raster is reduced from ~30 daily fits, so `cv_rmse` is their mean
    and `cv_rmse_max` the worst of them. The contract keeps both because they
    answer different questions: the mean belongs beside a monthly mean, the max
    beside a monthly extreme, which is driven by whichever single day was worst.
    """
    buckets: dict[tuple[int, int], list[dict]] = {}
    for row in rows:
        key = (row["valid_on"].year, row["valid_on"].month)
        buckets.setdefault(key, []).append(row)

    out: dict[tuple[int, int], dict] = {}
    for key, group in buckets.items():
        cv = [r["cv_rmse"] for r in group if r["cv_rmse"] is not None]
        edf = [r["edf"] for r in group if r["edf"] is not None]
        frac = [r["edf_fraction"] for r in group if r.get("edf_fraction") is not None]
        lam = [r["lam"] for r in group if r["lam"] is not None]
        n_fit = [r["n_fit"] for r in group if r["n_fit"] is not None]
        n_test = [r["n_test"] for r in group if r["n_test"] is not None]
        units = {r["cv_units"] for r in group if r["cv_units"]}
        out[key] = {
            "cv_rmse": (sum(cv) / len(cv)) if cv else None,
            "cv_rmse_max": max(cv) if cv else None,
            "edf": (sum(edf) / len(edf)) if edf else None,
            "edf_frac": (sum(frac) / len(frac)) if frac else None,
            # Median, not mean: lambda spans orders of magnitude (1e-4..1e6) and
            # a mean is dominated by whichever day pinned the GCV ceiling.
            "smoothing": _median(lam),
            "n_stations_fit": int(_median([float(v) for v in n_fit])) if n_fit else None,
            "n_stations_test": int(_median([float(v) for v in n_test])) if n_test else None,
            "cv_units": units.pop() if len(units) == 1 else None,
        }
    return out


# --- row construction -------------------------------------------------------

def build_rows(source: Source, variable: str) -> tuple[list[dict], list[dict], dict]:
    """Return (surface_run rows, validation rows, manifest) for one variable."""
    manifest = json.loads(source.read_text(f"{variable}/manifest.json"))
    res_m = int(manifest["resolution_m"])
    model_version = manifest["model_version"]
    unit = manifest["unit"]
    # Rainfall records 'ratio' here; temperature manifests have no such key and
    # their CV is in the variable's own unit.
    cv_units = manifest.get("cv_units") or unit

    validation = read_validation_rows(source, variable, res_m, model_version)
    by_month = summarise_by_month(validation)
    for row in validation:
        row.pop("edf_fraction", None)
        # Temperature CSVs have no cv_units column; the unit is the variable's.
        if row.get("cv_units") is None:
            row["cv_units"] = cv_units

    runs: list[dict] = []
    for month in manifest["months"]:
        year, mo = (int(part) for part in month["valid_at"].split("-"))
        month_res = int(month.get("resolution_m", res_m))
        summary = by_month.get((year, mo), {})
        valid_at = datetime(year, mo, 1, tzinfo=timezone.utc)
        for statistic in month["statistics"]:
            runs.append({
                "variable": variable,
                "granularity": "monthly",
                "statistic": statistic,
                "valid_at": valid_at,
                "period_start": None,
                "resolution_m": month_res,
                "model_version": model_version,
                "engine": "ridge",
                "s3_key": monthly_key(variable, year, mo, month_res, statistic),
                "s3_key_sd": None,
                "n_stations_fit": summary.get("n_stations_fit"),
                "n_stations_test": summary.get("n_stations_test"),
                "n_stations_excluded": None,
                "relevance_km": RELEVANCE_KM,
                "smoothing": summary.get("smoothing"),
                "edf": summary.get("edf"),
                "edf_frac": summary.get("edf_frac"),
                # Prefer the manifest's own figure where it exists — it is what
                # was written into the raster's tags, so index and object agree.
                "cv_rmse": (month.get("mean_cv_rmse")
                            if month.get("mean_cv_rmse") is not None
                            else summary.get("cv_rmse")),
                "cv_rmse_max": summary.get("cv_rmse_max"),
                "cv_units": summary.get("cv_units") or cv_units,
                "clipped": False,       # see module docstring
                "status": "ok",
            })

    # Records surfaces cover the whole archive, so they carry both bounds.
    first_year, first_month = (int(p) for p in manifest["first"].split("-"))
    last_year, last_month = (int(p) for p in manifest["last"].split("-"))
    period_start = datetime(first_year, first_month, 1, tzinfo=timezone.utc)
    period_end = datetime(last_year, last_month,
                          monthrange(last_year, last_month)[1],
                          tzinfo=timezone.utc)
    record_stats = [s for s in manifest["statistics"] if s in RECORD_STATISTICS]
    overall = manifest.get("cv_rmse") or {}
    for statistic in record_stats:
        runs.append({
            "variable": variable,
            "granularity": "records",
            "statistic": statistic,
            "valid_at": period_end,
            "period_start": period_start,
            "resolution_m": res_m,
            "model_version": model_version,
            "engine": "ridge",
            "s3_key": records_key(variable, res_m, statistic),
            "s3_key_sd": None,
            "n_stations_fit": None,
            "n_stations_test": None,
            "n_stations_excluded": None,
            "relevance_km": RELEVANCE_KM,
            "smoothing": None,
            "edf": None,
            "edf_frac": None,
            # An all-time surface is reduced from every fit in the record, so
            # the record-wide median and max are the right summaries.
            "cv_rmse": overall.get("median"),
            "cv_rmse_max": overall.get("max"),
            "cv_units": cv_units,
            "clipped": False,
            "status": "ok",
        })

    return runs, validation, manifest


# --- database ---------------------------------------------------------------

RUN_COLUMNS = ("variable", "granularity", "statistic", "valid_at",
               "period_start", "resolution_m", "model_version", "engine",
               "s3_key", "s3_key_sd", "n_stations_fit", "n_stations_test",
               "n_stations_excluded", "relevance_km", "smoothing", "edf",
               "edf_frac", "cv_rmse", "cv_rmse_max", "cv_units", "clipped",
               "status")

VALIDATION_COLUMNS = ("variable", "valid_on", "resolution_m", "model_version",
                      "n_fit", "n_test", "cv_rmse", "rmse", "t_rmse", "snr",
                      "mae", "bias", "r2", "max_abs_error", "edf", "lam",
                      "cv_units")


def upsert(conn, rows: list[dict], table: str, columns: tuple[str, ...],
           key_columns: tuple[str, ...], predicate: str = "",
           page_size: int = 1000) -> None:
    """Bulk upsert. `execute_values` sends one statement per page.

    `executemany` here would be one network round trip per row — 75,000 of them
    — which is the difference between seconds and an hour on RDS. Already a
    logged footgun on this platform's ingestion path; not repeating it.

    `key_columns` (+ `predicate`, for a partial index) spell the conflict
    target. Everything not in `key_columns` is refreshed on conflict, which is
    what makes a re-run after re-publishing a variable converge.
    """
    if not rows:
        return
    from psycopg2.extras import execute_values

    target = f"({', '.join(key_columns)})"
    if predicate:
        target += f" WHERE {predicate}"
    assignments = ", ".join(f"{c} = EXCLUDED.{c}"
                            for c in columns if c not in set(key_columns))
    sql = (f"INSERT INTO {table} ({', '.join(columns)}) VALUES %s "
           f"ON CONFLICT {target} DO UPDATE SET {assignments}")
    values = [tuple(r.get(c) for c in columns) for r in rows]
    with conn.cursor() as cur:
        execute_values(cur, sql, values, page_size=page_size)


# `uq_surface_run_aggregate` is a PARTIAL unique index, so the conflict target
# must repeat its predicate — naming a constraint would not resolve. Every row
# this script writes is monthly or records, so `statistic` is never NULL and the
# aggregate index is always the one that applies.
RUN_KEYS = ("variable", "granularity", "statistic", "valid_at",
            "resolution_m", "model_version")
RUN_PREDICATE = "statistic IS NOT NULL"
VALIDATION_KEYS = ("variable", "valid_on", "resolution_m", "model_version")


def connect():
    from dotenv import load_dotenv
    root = Path(__file__).resolve().parents[2]
    load_dotenv(root / ".env")
    import psycopg2
    host = os.getenv("RDS_ENDPOINT")
    if not host:
        raise SystemExit("RDS_ENDPOINT is not set; cannot reach the database")
    return psycopg2.connect(
        host=host, port=os.getenv("RDS_PORT", "5432"),
        user=os.environ["RDS_USER"], password=os.environ["RDS_PASSWORD"],
        dbname=os.environ["RDS_DATABASE"], connect_timeout=20)


# --- main -------------------------------------------------------------------

def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--source", default=f"s3://{DEFAULT_BUCKET}",
                        help="s3://bucket or a local path to the bucket mirror")
    parser.add_argument("--variable", action="append", choices=VARIABLES,
                        help="restrict to one variable (repeatable)")
    parser.add_argument("--dry-run", action="store_true",
                        help="build and check rows, write nothing")
    parser.add_argument("--verify-keys", action="store_true", default=None,
                        help="cross-check every s3_key against a listing "
                             "(default: on for S3 sources)")
    parser.add_argument("--no-verify-keys", dest="verify_keys",
                        action="store_false")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    if args.source.startswith("s3://"):
        source: Source = S3Source(args.source[5:].strip("/"))
        verify = True if args.verify_keys is None else args.verify_keys
    else:
        source = LocalSource(Path(args.source))
        verify = bool(args.verify_keys)

    variables = args.variable or list(VARIABLES)
    log.info("source %s | variables %s", source.describe(), ", ".join(variables))

    listing: set[str] = set()
    if verify:
        listing = source.list_keys("surfaces/")
        log.info("listed %d objects under surfaces/", len(listing))

    all_runs: list[dict] = []
    all_validation: list[dict] = []
    problems = 0

    for variable in variables:
        runs, validation, manifest = build_rows(source, variable)
        log.info("%-10s %4d months, %d run rows, %d validation rows "
                 "(cv median %s %s)", variable, manifest["n_months"], len(runs),
                 len(validation),
                 round(manifest.get("cv_rmse", {}).get("median", float("nan")), 5),
                 manifest.get("cv_units") or manifest["unit"])

        if verify:
            wanted = {r["s3_key"] for r in runs}
            missing = wanted - listing
            if missing:
                problems += len(missing)
                log.error("%s: %d indexed keys are NOT in the bucket, e.g. %s",
                          variable, len(missing), sorted(missing)[:3])
            prefix = f"surfaces/v2/{variable}/"
            present = {k for k in listing
                       if k.startswith(prefix) and k.endswith(".tif")}
            orphans = present - wanted
            if orphans:
                # Not an error: an orphan is an object nothing indexes, which is
                # wasted storage and a consumer trap, but it does not make the
                # index wrong. Report and continue.
                log.warning("%s: %d objects in the bucket are NOT indexed, "
                            "e.g. %s", variable, len(orphans),
                            sorted(orphans)[:3])

        all_runs.extend(runs)
        all_validation.extend(validation)

    log.info("TOTAL %d surface_run rows, %d surface_validation_stats rows",
             len(all_runs), len(all_validation))

    if problems:
        log.error("%d indexed keys are missing from the bucket — refusing to "
                  "write an index that points at objects that do not exist",
                  problems)
        return 2

    if args.dry_run:
        log.info("dry run: nothing written")
        return 0

    conn = connect()
    try:
        upsert(conn, all_runs, "surface_run", RUN_COLUMNS,
               RUN_KEYS, RUN_PREDICATE)
        upsert(conn, all_validation, "surface_validation_stats",
               VALIDATION_COLUMNS, VALIDATION_KEYS)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    log.info("committed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
