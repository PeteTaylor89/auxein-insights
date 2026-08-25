"""Assemble the exact tree that gets synced to the surface bucket.

Publishing is the one irreversible step in this pipeline, and the bucket holds
two eras of the same variables that must not overwrite each other. This script
exists so that what gets synced is built and inspected as a unit, rather than
assembled by a sequence of `aws s3 cp` calls whose combined effect nobody can
see.

## Option B: the boundary is 2024-09, and it is NOT the same for every variable

CLIFLO's per-station extract runs to 2024-10-19, so the archive can be extended
nine months on its own datum with no correction at all. Temperature therefore
splits at 2024-09/2024-10.

Rainfall does NOT. The DB carries 838 gauges against CLIFLO's ~343, so extending
the CLIFLO rainfall archive into 2024 would mean serving a third of the gauges we
have, and no offset is applied to rainfall for the same reason -- correcting the
DB toward CLIFLO would be correcting toward the worse network. Rainfall keeps its
2023-12 boundary and the DB era runs uncorrected from 2024-01.

    temp_mean/min/max   CLIFLO 1986-01..2024-09 | corrected DB 2024-10..2026-07
    rainfall            CLIFLO 1986-01..2023-12 | raw DB       2024-01..2026-07

## Two kinds of publish, and they are not interchangeable

**An ARCHIVE EXTENSION** (the CLIFLO 2024 months, and GDD vintage 2024) merges
into the archive's OWN `manifest.json` and keeps `model_version =
tps-2.0.0-ridge`. It is the same estimator over the same source; a reader must
not be able to tell where the old extract stopped.

**A LIVE-ERA publish** (corrected DB, rainfall, GDD 2025-2026) writes
`manifest-live.json` and `validation_stats-live.csv` instead, because a
variable's metadata lives at ONE key per tree and the live era's 22-month
manifest would otherwise replace the archive's 465-month one. `index_surfaces.py
--suffix live` reads those.

## What is deliberately NOT staged

`*/records/*`. The DB era's all-time layers have keys byte-identical to the
archive's, and `store.resolve` orders `model_version DESC`, so a 3-year record
would win the lookup for "all time". Record statistics are stripped from every
live manifest as well, so nothing indexes them either.

    python backend/scripts/stage_publish.py --dry-run
    python backend/scripts/stage_publish.py
"""
from __future__ import annotations

import argparse
import csv
import json
import logging
import shutil
import sys
from pathlib import Path
from typing import Optional

REPO = Path(__file__).resolve().parents[2]
LS = REPO / "scratchpad" / "live_surfaces"
ARCHIVE = REPO / "scratchpad" / "climate_history" / "bucket"

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("stage")

TEMPS = ("temp_mean", "temp_min", "temp_max")
RECORD_STATS = {"all_time_max", "all_time_max_day",
                "all_time_min", "all_time_min_day"}

# Threshold COUNTS, which a POST-HOC era correction cannot touch.
#
# A post-hoc offset is a temperature shift applied to a monthly aggregate.
# `frost_days` is a count of days below zero, derived from DAILY values inside
# the fit -- so there is nothing to shift. Adding degrees to a count is
# meaningless, and copying the uncorrected count through beside a corrected
# `mean` would publish two bands that disagree about the same month: the DB
# reads +0.248 degC warm on tmin before correction, so its frost counts run low.
#
# **RESOLVED 2026-08-23.** `run_history.py --era-offset` now subtracts the field
# from every DAY before the monthly reduction, so the counts are computed from
# corrected temperatures and are correct by construction. A tree fitted that way
# says so in its manifest, and `_thresholds_publishable` reads that rather than
# taking it on trust -- so the strip below still protects any tree that was
# corrected the old way.
THRESHOLD_STATS = {"frost_days", "first_frost_day", "last_frost_day",
                   "days_over_25", "days_over_30", "growing_days"}


def _thresholds_publishable(man: dict, variable: str) -> tuple[bool, str]:
    """May this tree's threshold counts be published? Returns (ok, reason).

    The question is only ever about an ERA-CORRECTED tree. An uncorrected one
    (rainfall) has counts that agree with its own mean by construction, because
    nothing was shifted after the fact.
    """
    if not LIVE_MODEL[variable].endswith("-adj"):
        return True, "era is not corrected, so nothing can disagree"
    stage = str((man.get("era_offset") or {}).get("stage", ""))
    if stage.startswith("applied to daily"):
        return True, "offset applied to daily values before the reduction"
    return False, ("the offset was applied after the monthly reduction, so the "
                   "counts were never corrected")

# variable -> (raster root, manifest root, first month, last month).
#
# The two roots used to differ for the temperatures: `era_offset.py apply` wrote
# corrected rasters into `publish/` but no manifest, because a manifest describes
# a FIT and a post-hoc shift is not one, so the manifest had to come from the
# uncorrected fit at `final/`. Splitting them was also what made the threshold
# counts unpublishable -- the manifest's bands and the rasters beside them had
# been produced by two different processes.
#
# `daily_adj/` is a single fit that corrects each day on the way through, so it
# is both the rasters and the manifest, and the counts come with it.
# The adjusted-temperature root is a variable so a re-fit can be staged without
# editing this file. A re-fit is not hypothetical: the DB-era temperatures were
# re-run on 2026-08-24 after `temp_mean` was found to be a record-weighted
# average rather than an hour-weighted one, which biased 13 Waipara stations
# cold by 2.2-3.4 degC.
ADJ_ROOT = LS / "daily_adj"
# Same reasoning for the derived GDD seasons, which are built FROM temp_mean and
# therefore move whenever it is re-fitted.
GDD_ADJ_ROOT = LS / "gdd_out_adj"


def live_spans(adj_root: Path = None) -> dict:
    r = adj_root or ADJ_ROOT
    return {
        "temp_mean": (r, r, "2024-10", "2026-07"),
        "temp_min":  (r, r, "2024-10", "2026-07"),
        "temp_max":  (r, r, "2024-10", "2026-07"),
        "rainfall":  (LS / "rebuild" / "rainfall", LS / "rebuild" / "rainfall",
                      "2024-01", "2026-07"),
    }


# A per-variable root works too — `run_history --out <root>` puts the rasters at
# `<root>/surfaces/v2/<var>/` and the manifest at `<root>/<var>/manifest.json`,
# so one root holding several variables resolves for each of them.
LIVE_SPANS = live_spans()
LIVE_MODEL = {"temp_mean": "tps-2.0.0-ridge-db-adj",
              "temp_min": "tps-2.0.0-ridge-db-adj",
              "temp_max": "tps-2.0.0-ridge-db-adj",
              "rainfall": "tps-2.0.0-ridge-db"}

# The CLIFLO 2024 extension, per variable (temp only).
CLIFLO24 = {"temp_mean": LS / "cliflo_2024",
            "temp_min": LS / "cliflo_2024_temp_min",
            "temp_max": LS / "cliflo_2024_temp_max"}
EXT_SPAN = ("2024-01", "2024-09")


def _months(man: dict) -> list:
    return man["months"]


def _in(span, ym):
    return span[0] <= ym <= span[1]


def copy_tree(src: Path, dst: Path, variable: str, lo: str, hi: str) -> int:
    """Copy every monthly raster for `variable` in [lo, hi]. Never records/."""
    n = 0
    base = src / "surfaces" / "v2" / variable / "monthly"
    if not base.exists():
        raise SystemExit(f"no monthly tree at {base}")
    for year_dir in sorted(base.iterdir()):
        for tif in sorted(year_dir.glob("*.tif")):
            # The YYYYMM token by SHAPE, not by position. `temp_mean` contains an
            # underscore, so the date sits at index 3 for it and index 2 for
            # `rainfall` -- indexing positionally silently matched nothing.
            stamp = next((t for t in tif.stem.split("_")
                          if len(t) == 6 and t.isdigit()), None)
            if stamp is None:
                raise SystemExit(f"cannot read a YYYYMM stamp from {tif.name}")
            ym = f"{stamp[:4]}-{stamp[4:6]}"
            if not _in((lo, hi), ym):
                continue
            d = dst / "surfaces" / "v2" / variable / "monthly" / year_dir.name / tif.name
            d.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(tif, d)
            n += 1
    return n


def read_manifest(root: Path, variable: str) -> dict:
    for cand in (root / variable / "manifest.json",
                 root / variable / variable / "manifest.json"):
        if cand.exists():
            return json.loads(cand.read_text())
    raise SystemExit(f"no manifest for {variable} under {root}")


def manifest_dir(root: Path, variable: str) -> Path:
    for cand in (root / variable, root / variable / variable):
        if (cand / "manifest.json").exists():
            return cand
    raise SystemExit(f"no manifest dir for {variable} under {root}")


def stage_archive_extension(out: Path, variable: str) -> dict:
    """Merge the CLIFLO 2024 months into the archive's own manifest."""
    src = CLIFLO24[variable]
    lo, hi = EXT_SPAN
    n = copy_tree(src, out, variable, lo, hi)

    arc = read_manifest(ARCHIVE, variable)
    ext = read_manifest(src, variable)
    if arc["model_version"] != "tps-2.0.0-ridge":
        raise SystemExit(f"{variable}: archive model_version is "
                         f"{arc['model_version']!r}, refusing to extend it")

    have = {m["valid_at"] for m in _months(arc)}
    added = [m for m in _months(ext) if _in((lo, hi), m["valid_at"])
             and m["valid_at"] not in have]
    merged = sorted(_months(arc) + added, key=lambda m: m["valid_at"])

    man = dict(arc)
    man["months"] = merged
    man["first"] = merged[0]["valid_at"]
    man["last"] = merged[-1]["valid_at"]
    man["n_months"] = len(merged)
    man["n_days_fitted"] = sum(int(m["n_days"]) for m in merged)
    man["extension_note"] = (
        "2024-01..2024-09 added 2026-08-21 from the per-STATION CLIFLO extract "
        "(STATION_TEMP_DAILY_CLIFLO), verified byte-equivalent to the per-day "
        "spline extract on 2023. Same estimator, same source, so it carries the "
        "archive's own model_version. CLIFLO closed 2024-10; this is the end of "
        "the reference record.")
    d = out / variable
    d.mkdir(parents=True, exist_ok=True)
    (d / "manifest.json").write_text(json.dumps(man, indent=2))

    # validation_stats.csv is the archive's, plus the extension's rows.
    rows = list(csv.DictReader((manifest_dir(ARCHIVE, variable) /
                                "validation_stats.csv").open()))
    seen = {r["valid_at"] for r in rows}
    for r in csv.DictReader((manifest_dir(src, variable) /
                             "validation_stats.csv").open()):
        if r["valid_at"] not in seen and lo <= r["valid_at"][:7] <= hi:
            rows.append(r)
    # DEDUPE on valid_at. `run_history.py` APPENDS validation rows as each month
    # commits, so a fit that was interrupted and re-run (rather than --resume'd)
    # leaves every day in its CSV twice. Identical rows, so the index would not
    # be wrong -- but `execute_values` sends a page as ONE statement and
    # Postgres rejects `ON CONFLICT DO UPDATE` that touches a row twice, so it
    # fails the whole upsert instead.
    unique: dict = {}
    for r in rows:
        unique[r["valid_at"]] = r
    rows = sorted(unique.values(), key=lambda r: r["valid_at"])
    # UNION of columns, not the first row's. `run_history.py` gained `cv_units`
    # after the 1986-2023 archive was written, so the archive's CSV and the 2024
    # extension's do not have the same header. Taking the first row's keys drops
    # the newer column and then throws on the first row that has it.
    fields: list[str] = []
    for r in rows:
        for k in r:
            if k not in fields:
                fields.append(k)
    with (d / "validation_stats.csv").open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=fields, restval="")
        w.writeheader()
        w.writerows(rows)

    log.info("%-10s archive extension: %d rasters, manifest %d -> %d months "
             "(%s..%s)", variable, n, len(_months(arc)), len(merged),
             man["first"], man["last"])
    return {"rasters": n, "months": len(merged)}


def stage_live(out: Path, variable: str) -> dict:
    src, man_root, lo, hi = LIVE_SPANS[variable]
    n = copy_tree(src, out, variable, lo, hi)

    man = dict(read_manifest(man_root, variable))
    months = [m for m in _months(man) if _in((lo, hi), m["valid_at"])]
    if not months:
        raise SystemExit(f"{variable}: no months in {lo}..{hi}")
    man["months"] = months
    man["first"], man["last"] = months[0]["valid_at"], months[-1]["valid_at"]
    man["n_months"] = len(months)
    man["n_days_fitted"] = sum(int(m["n_days"]) for m in months)
    man["model_version"] = LIVE_MODEL[variable]
    thresholds_ok, why = _thresholds_publishable(man, variable)
    drop = set(RECORD_STATS) if thresholds_ok else (RECORD_STATS | THRESHOLD_STATS)
    before = list(man.get("statistics", []))
    man["statistics"] = [s for s in before if s not in drop]
    # `index_surfaces.build_rows` reads each MONTH's own statistics list, not the
    # top-level one, so stripping only the top level leaves every row still
    # indexed and the write fails on keys that were never written.
    for mrec in man["months"]:
        if "statistics" in mrec:
            mrec["statistics"] = [x for x in mrec["statistics"] if x not in drop]
    present = sorted(set(before) & THRESHOLD_STATS)
    if present and not thresholds_ok:
        man["threshold_note"] = (
            "threshold counts (" + ", ".join(present) + ") are NOT published "
            "for this era: " + why + ". Refit with "
            "`run_history.py --era-offset` to correct the daily values before "
            "the monthly reduction, which makes every band correct by "
            "construction.")
        log.warning("%-10s threshold counts STRIPPED — %s", variable, why)
    elif present:
        man["threshold_note"] = (
            "threshold counts (" + ", ".join(present) + ") ARE published for "
            "this era: " + why + ", so each count was taken against corrected "
            "temperatures rather than shifted after the fact.")
        log.info("%-10s threshold counts published: %s", variable,
                 ", ".join(present))
    if len(before) != len(man["statistics"]):
        man["records_note"] = (
            "all-time record statistics are deliberately NOT indexed for this "
            "era: their keys collide with the archive's and store.resolve "
            "orders model_version DESC, so a short record would win 'all time'.")
    if variable in TEMPS:
        # Name the field the manifest actually records, rather than restating a
        # hardcoded one — the three variables use three different fields
        # (offset_final, offset_final_temp_min, offset_final_temp_max) and a
        # constant here was right only for temp_mean.
        man["era_offset_applied"] = (man.get("era_offset") or {}).get(
            "field_dir", "unknown")

    d = out / variable
    d.mkdir(parents=True, exist_ok=True)
    (d / "manifest-live.json").write_text(json.dumps(man, indent=2))

    keep = {m["valid_at"] for m in months}
    seen_live: dict = {}
    for r in csv.DictReader((manifest_dir(man_root, variable) /
                             "validation_stats.csv").open()):
        if r["valid_at"][:7] in keep:
            seen_live[r["valid_at"]] = r          # same dedupe, same reason
    rows = sorted(seen_live.values(), key=lambda r: r["valid_at"])
    with (d / "validation_stats-live.csv").open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()), restval="")
        w.writeheader()
        w.writerows(rows)

    log.info("%-10s live era: %d rasters, %d months (%s..%s), %s, %d val rows",
             variable, n, len(months), man["first"], man["last"],
             man["model_version"], len(rows))
    return {"rasters": n, "months": len(months)}


def stage_gdd(out: Path) -> dict:
    """Vintage 2024 extends the archive; 2025-2026 are a live-era publish."""
    total = 0
    for var in ("gdd10", "gdd0"):
        arc = json.loads((ARCHIVE.parent / "gdd_out" / var /
                          "manifest.json").read_text())
        new24 = json.loads((LS / "gdd_out_final" / var / "manifest.json").read_text())
        adj = json.loads((GDD_ADJ_ROOT / var / "manifest.json").read_text())

        for src in (LS / "gdd_out_final", GDD_ADJ_ROOT):
            base = src / "surfaces" / "v2" / var / "season"
            for season_dir in sorted(base.iterdir()):
                for tif in sorted(season_dir.glob("*.tif")):
                    d = (out / "surfaces" / "v2" / var / "season" /
                         season_dir.name / tif.name)
                    d.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(tif, d)
                    total += 1

        have = {s["season"] for s in arc["seasons"]}
        merged = sorted(arc["seasons"] + [s for s in new24["seasons"]
                                          if s["season"] not in have],
                        key=lambda s: s["season"])
        man = dict(arc)
        man["seasons"] = merged
        man["first"], man["last"] = str(merged[0]["season"]), str(merged[-1]["season"])
        man["n_seasons"] = len(merged)
        d = out / var
        d.mkdir(parents=True, exist_ok=True)
        (d / "manifest.json").write_text(json.dumps(man, indent=2))

        live = dict(adj)
        live["model_version"] = "tps-2.0.0-ridge-db-adj"
        (d / "manifest-live.json").write_text(json.dumps(live, indent=2))
        log.info("%-10s archive %d seasons (%s..%s) + live %d seasons (%s..%s)",
                 var, len(merged), man["first"], man["last"],
                 live["n_seasons"], live["first"], live["last"])
    return {"rasters": total}


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", type=Path, default=LS / "publish_tree")
    ap.add_argument("--adj-root", type=Path, default=None,
                    help="root of the era-corrected temperature fit "
                         "(default scratchpad/live_surfaces/daily_adj)")
    ap.add_argument("--gdd-adj-root", type=Path, default=None,
                    help="root of the re-derived GDD seasons for the live era "
                         "(default scratchpad/live_surfaces/gdd_out_adj)")
    ap.add_argument("--dry-run", action="store_true",
                    help="report what would be staged without copying")
    a = ap.parse_args(argv)
    if a.gdd_adj_root:
        global GDD_ADJ_ROOT
        GDD_ADJ_ROOT = a.gdd_adj_root
        log.info("staging live GDD from %s", a.gdd_adj_root)
    if a.adj_root:
        global LIVE_SPANS
        LIVE_SPANS = live_spans(a.adj_root)
        log.info("staging adjusted temperatures from %s", a.adj_root)

    if a.dry_run:
        for v in TEMPS:
            log.info("%-10s would extend archive %s..%s and publish live %s..%s",
                     v, *EXT_SPAN, LIVE_SPANS[v][2], LIVE_SPANS[v][3])
        log.info("%-10s live only %s..%s (no correction, no extension)",
                 "rainfall", LIVE_SPANS["rainfall"][2], LIVE_SPANS["rainfall"][3])
        log.info("gdd10/gdd0: vintage 2024 extends the archive, 2025-2026 live")
        return 0

    if a.out.exists():
        shutil.rmtree(a.out)
    a.out.mkdir(parents=True)

    total = 0
    for v in TEMPS:
        total += stage_archive_extension(a.out, v)["rasters"]
        total += stage_live(a.out, v)["rasters"]
    total += stage_live(a.out, "rainfall")["rasters"]
    total += stage_gdd(a.out)["rasters"]

    strays = [p for p in a.out.rglob("*") if p.is_file() and "/records/" in
              p.as_posix()]
    if strays:
        raise SystemExit(f"{len(strays)} record rasters staged - they must not be")
    log.info("staged %d objects into %s", total, a.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
