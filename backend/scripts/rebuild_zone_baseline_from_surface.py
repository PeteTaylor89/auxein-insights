#!/usr/bin/env python3
"""Re-level the 1986-2005 zone daily baseline onto the surface archive.

## The defect this fixes

`climate_zone_daily_baseline` is NIWA BCSD downscaled MODEL output, not
observations. Against our own surface archive over the same 1986-2005 window
and the same zones, the spring level differs by a median 0.27 degC and up to
1.29 degC. Those look negligible and are not: a temperature offset COMPOUNDS
through a GDD accumulation rather than dividing once into the daily rate. Re-
accumulated, a surface-derived crossing date measured against that baseline
moves three days or more in 14 of 22 zones, and 21 days in Ngaruroro.

Phenology is about to start reporting crossing dates from the daily surface. If
it compares them against a BCSD baseline, that offset publishes as climate.

## What this builds, stated honestly

**Surface level, BCSD shape.** No daily rasters exist before 2026 — the archive
is monthly — so there can be no literally daily surface climatology. Only the
monthly LEVEL is replaced: an additive offset per calendar month for
temperature, a ratio for rainfall. The within-month day-to-day structure is
still BCSD's, and this script does not pretend otherwise.

That is precisely the defect that was measured, though. The disagreement is a
level disagreement; the shape was never the complaint.

## Three rules carried over from `services/insights_site_baseline.py`

This is the same operation that module performs one level down (zone shape,
site level), so it reuses that module's functions rather than restating them.

1. **The source level is integrated from the daily curve ITSELF**, never read
   from another table. Level against a different table and a residual survives
   the rescale — and a residual that varies by month looks exactly like a
   climate signal.
2. **GDD is re-integrated, never rescaled.** Shifting a GDD climatology by a
   temperature offset is not linear: a degree gained in midsummer is a whole
   degree-day, the same degree in the shoulders is a fraction of one. So the
   tmean curve is shifted and GDD is re-integrated from the shifted mean and the
   day-of-vintage sd, with the same normal-integral estimator as
   `gdd_season.gdd_from_normal`.
3. **The sd bands are carried across UNCHANGED.** They are the spread of a day
   across the twenty baseline years, which is what the GDD integral needs.
   `climate_zone_surface_monthly.sd` is a different quantity and would silently
   corrupt every derived count if substituted.

Rainfall is scaled by RATIO, not offset: a zone catching 20% more catches 20%
more in a wet month and a dry one, and a fixed millimetre offset would invent
rain on days the source recorded none and drive a dry month negative.

Usage:
    python backend/scripts/rebuild_zone_baseline_from_surface.py            # dry run
    python backend/scripts/rebuild_zone_baseline_from_surface.py --apply
    python backend/scripts/rebuild_zone_baseline_from_surface.py --zone-id 7 --apply
"""
from __future__ import annotations

import argparse
import logging
import sys
from datetime import timedelta
from pathlib import Path

from sqlalchemy import text as sa_text

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

logger = logging.getLogger("rebuild_baseline")

BASELINE_LO, BASELINE_HI = 1986, 2005

# Which (variable, statistic) in climate_zone_surface_monthly carries each band.
# `rain` is a monthly SUM, the others are monthly means, matching the quantities
# `zone_month_level` integrates out of the daily curve.
_SURFACE_BANDS = {
    "tmean": ("temp_mean", "mean"),
    "tmin": ("temp_min", "mean"),
    "tmax": ("temp_max", "mean"),
    "rain": ("rainfall", "sum"),
}


def zone_surface_month_normal(db, zone_id: int,
                              lo: int = BASELINE_LO,
                              hi: int = BASELINE_HI) -> dict[int, dict]:
    """Calendar month -> the zone's 1986-2005 level from the SURFACE archive.

    Mirrors `insights_site_baseline.site_month_normal`, one level up: the target
    is a zone rather than a site, and the source is the published monthly
    surface rather than a site's extracted record.
    """
    out: dict[int, dict] = {}
    for key, (variable, statistic) in _SURFACE_BANDS.items():
        rows = db.execute(sa_text("""
            SELECT month, avg(mean) AS level, count(DISTINCT year) AS n_years
              FROM climate_zone_surface_monthly
             WHERE zone_id = :zid AND variable = :var AND statistic = :stat
               AND year BETWEEN :lo AND :hi
             GROUP BY month
        """), {"zid": zone_id, "var": variable, "stat": statistic,
               "lo": lo, "hi": hi}).mappings().all()
        for r in rows:
            slot = out.setdefault(int(r["month"]), {})
            slot[key] = float(r["level"])
            slot["n_years"] = int(r["n_years"])
    return out


def build_zone(db, zone_id: int, model_version: str | None):
    """Return the re-levelled daily rows for one zone, or None."""
    from services import insights_site_baseline as SB

    curve = SB.zone_curve(db, zone_id)
    if not curve:
        return None, "no BCSD daily baseline"

    source_level = SB.zone_month_level(curve)
    target_level = zone_surface_month_normal(db, zone_id)
    if not target_level:
        return None, "no surface monthly rows for 1986-2005"

    adjustments = SB.month_adjustments(source_level, target_level)
    if not adjustments:
        return None, "no overlapping months"

    rows = []
    for dov in sorted(curve):
        src = curve[dov]
        month = (SB._REF_ANCHOR + timedelta(days=dov - 1)).month
        adj = adjustments.get(month, {})

        t_off = adj.get("tmean_offset", 0.0)
        rain_ratio = adj.get("rain_ratio", 1.0)

        tmean = None if src["tmean_avg"] is None else src["tmean_avg"] + t_off
        tmin = (None if src["tmin_avg"] is None
                else src["tmin_avg"] + adj.get("tmin_offset", t_off))
        tmax = (None if src["tmax_avg"] is None
                else src["tmax_avg"] + adj.get("tmax_offset", t_off))

        # Re-integrated from the SHIFTED mean and the ORIGINAL interannual sd.
        # Never rescaled — see rule 2 in the module docstring.
        sd = src["tmean_sd"]
        if tmean is not None and sd is not None:
            gdd10 = SB.expected_excess(tmean, sd, 10.0)
            gdd0 = SB.expected_excess(tmean, sd, 0.0)
        else:
            gdd10 = gdd0 = None

        rows.append({
            "zone_id": zone_id, "day_of_vintage": dov,
            "tmean_avg": tmean, "tmean_sd": sd,
            "tmin_avg": tmin, "tmin_sd": src["tmin_sd"],
            "tmax_avg": tmax, "tmax_sd": src["tmax_sd"],
            "gdd_base10_avg": gdd10, "gdd_base0_avg": gdd0,
            "rain_avg": (None if src["rain_avg"] is None
                         else src["rain_avg"] * rain_ratio),
            "rain_sd": (None if src["rain_sd"] is None
                        else src["rain_sd"] * rain_ratio),
            "tmean_offset": t_off, "rain_ratio": rain_ratio,
            "interpolated": bool(src.get("interpolated")),
            "source_model_version": model_version,
        })

    # Cumulative GDD0 runs over the whole vintage year in day order, so it has
    # to be a second pass rather than folded into the loop above.
    cum = 0.0
    for r in rows:
        if r["gdd_base0_avg"] is not None:
            cum += r["gdd_base0_avg"]
        r["gdd_base0_cumulative_avg"] = cum

    return rows, None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--zone-id", type=int)
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
    from db.session import SessionLocal

    db = SessionLocal()
    try:
        mv = db.execute(sa_text("""
            SELECT model_version FROM climate_zone_surface_monthly
             WHERE year BETWEEN :lo AND :hi
             GROUP BY model_version ORDER BY count(*) DESC LIMIT 1
        """), {"lo": BASELINE_LO, "hi": BASELINE_HI}).scalar()
        logger.info("surface archive model_version: %s", mv)

        zones = db.execute(sa_text(
            "SELECT id, name FROM climate_zones"
            + (" WHERE id = :zid" if args.zone_id else "")
            + " ORDER BY id"),
            {"zid": args.zone_id} if args.zone_id else {}).fetchall()

        logger.info("%-4s %-34s %8s %8s %9s", "zone", "name",
                    "tmeanoff", "rainrat", "GDD10 Sep-Apr")
        total = skipped = 0
        for zid, name in zones:
            rows, why = build_zone(db, zid, mv)
            if rows is None:
                logger.warning("%-4s %-34s SKIPPED - %s", zid, name[:34], why)
                skipped += 1
                continue

            # Sep-Apr GDD10, the number phenology actually accumulates.
            season = sum(r["gdd_base10_avg"] or 0.0 for r in rows
                         if 62 <= r["day_of_vintage"] <= 304)
            offs = [r["tmean_offset"] for r in rows]
            rr = [r["rain_ratio"] for r in rows]
            logger.info("%-4s %-34s %+8.2f %8.3f %9.1f", zid, name[:34],
                        sum(offs) / len(offs), sum(rr) / len(rr), season)

            if args.apply:
                db.execute(sa_text(
                    "DELETE FROM climate_zone_daily_baseline_surface "
                    "WHERE zone_id = :zid"), {"zid": zid})
                db.execute(sa_text("""
                    INSERT INTO climate_zone_daily_baseline_surface
                        (zone_id, day_of_vintage, tmean_avg, tmean_sd,
                         tmin_avg, tmin_sd, tmax_avg, tmax_sd,
                         gdd_base0_avg, gdd_base10_avg,
                         gdd_base0_cumulative_avg, rain_avg, rain_sd,
                         tmean_offset, rain_ratio, interpolated,
                         source_model_version)
                    VALUES (:zone_id, :day_of_vintage, :tmean_avg, :tmean_sd,
                            :tmin_avg, :tmin_sd, :tmax_avg, :tmax_sd,
                            :gdd_base0_avg, :gdd_base10_avg,
                            :gdd_base0_cumulative_avg, :rain_avg, :rain_sd,
                            :tmean_offset, :rain_ratio, :interpolated,
                            :source_model_version)
                """), rows)
            total += len(rows)

        if args.apply:
            db.commit()
            logger.info("wrote %d row(s) across %d zone(s), %d skipped",
                        total, len(zones) - skipped, skipped)
        else:
            logger.info("dry run - %d row(s) would be written, %d zone(s) "
                        "skipped. Re-run with --apply.", total, skipped)
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
