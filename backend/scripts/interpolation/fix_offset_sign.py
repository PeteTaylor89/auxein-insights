#!/usr/bin/env python3
"""Correct the inverted `sign` metadata on era-offset fields built before 08-23.

`era_offset.build` used to stamp every field raster tag and every field
manifest with

    "sign": "ADD to a DB-era surface to express it on the CLIFLO archive scale"

**That is backwards.** The field is `DB - archive`, so expressing a DB-era
surface on the archive scale means SUBTRACTING it, which is what `apply_field`
and `run_history`'s daily path have always done. Adding would have DOUBLED the
Gibbston error instead of removing it. The code was right; the words were wrong.

`era_offset.py` was fixed on 2026-08-23, but fields already on disk still carry
the old text — `run_history.EraOffset.load` only warns about them. That warning
was adequate while the fields lived in one scratch directory on one workstation.
It is not adequate now they are becoming the canonical copy in S3 that a daily
cron consumes indefinitely: eventually someone writes a consumer that reads the
manifest and believes it.

**The rasters are NOT rebuilt.** Their values are validated (held-out 2023 RMSE
-43.3%, 2024 -48.3%) and must not move; rebuilding risks a different field from
a network that has since grown. Only the metadata string is rewritten, and the
pixels are hashed before and after to prove it.

Usage:
    python fix_offset_sign.py --dry-run
    python fix_offset_sign.py
"""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.interpolation import raster as R  # noqa: E402

logger = logging.getLogger(__name__)

DEFAULT_DIRS = (
    Path("scratchpad/live_surfaces/offset_final"),
    Path("scratchpad/live_surfaces/offset_final_temp_min"),
    Path("scratchpad/live_surfaces/offset_final_temp_max"),
)

CORRECT_TAG = ("SUBTRACT from a DB-era surface to express it on the CLIFLO "
               "archive scale")
CORRECT_MANIFEST = "SUBTRACT from a DB-era surface"


def _digest(path: Path) -> str:
    R._configure_proj()
    import rasterio

    with rasterio.open(path) as ds:
        arr = ds.read(1)
        n_ov = len(ds.overviews(1))
    return hashlib.sha256(arr.tobytes()).hexdigest(), n_ov


def fix_raster(path: Path, dry: bool) -> bool:
    R._configure_proj()
    import rasterio

    with rasterio.open(path) as ds:
        sign = ds.tags().get("sign", "")
    if not sign.upper().startswith("ADD"):
        return False
    if dry:
        logger.info("  would fix %s", path.name)
        return True

    before, ov_before = _digest(path)
    # GDAL refuses to edit a COG in place without this, warning that some
    # optimisations may be lost. Accepted deliberately: an offset field is
    # loaded WHOLE by `EraOffset.load`, never range-requested as map tiles, so
    # the internal layout buys nothing here — and re-encoding through
    # `write_cog` instead would put a SECOND LERC quantisation on top of the
    # first, moving validated values for the sake of a metadata string.
    # The assertions below are what make this safe rather than hopeful.
    # Note this is a GDAL OPEN OPTION passed to `open`, not a config option —
    # `rasterio.Env(IGNORE_COG_LAYOUT_BREAK=...)` is silently ineffective and
    # the refusal looks identical.
    with rasterio.open(path, "r+", IGNORE_COG_LAYOUT_BREAK="YES") as ds:
        ds.update_tags(sign=CORRECT_TAG)
    after, ov_after = _digest(path)

    if before != after:
        raise RuntimeError(
            f"{path} pixel data changed while rewriting metadata — "
            "the field is validated and must not move")
    if ov_before != ov_after:
        raise RuntimeError(
            f"{path} lost overviews ({ov_before} -> {ov_after}); the COG "
            "structure must survive a metadata edit")
    logger.info("  fixed %s  (pixels identical, %d overviews)",
                path.name, ov_after)
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dirs", nargs="*", type=Path, default=list(DEFAULT_DIRS))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    n_raster = n_manifest = 0
    for d in args.dirs:
        if not d.exists():
            logger.error("missing %s", d)
            return 1
        logger.info("%s", d)
        for tif in sorted(d.glob("*.tif")):
            n_raster += fix_raster(tif, args.dry_run)

        man_path = d / "manifest.json"
        man = json.loads(man_path.read_text())
        if str(man.get("sign", "")).upper().startswith("ADD"):
            if args.dry_run:
                logger.info("  would fix manifest.json")
            else:
                man["sign"] = CORRECT_MANIFEST
                # Keep what the file used to claim, so the correction is
                # auditable rather than a silent rewrite of history.
                man["sign_corrected_on"] = "2026-08-24"
                man["sign_previous_text"] = "ADD to a DB-era surface"
                man_path.write_text(json.dumps(man, indent=2))
                logger.info("  fixed manifest.json")
            n_manifest += 1

    logger.info("\n%d rasters, %d manifests %s",
                n_raster, n_manifest,
                "would be fixed" if args.dry_run else "fixed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
