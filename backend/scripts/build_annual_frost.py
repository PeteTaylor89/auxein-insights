"""Add a CALENDAR-YEAR frost count to the seasonal roll-up.

    backend/venv/Scripts/python.exe backend/scripts/build_annual_frost.py --dry-run
    backend/venv/Scripts/python.exe backend/scripts/build_annual_frost.py

Writes metric `frost_days_annual` into `climate_zone_surface_season`, summing
the monthly `temp_min`/`frost_days` band over **January to December of the
vintage year**.

## Why this exists

`frost_days` on that table is the **Sep-Apr** count — the growing season only.
For Gibbston that is 13.7 nights against a spring count of 9.7, because almost
all growing-season frost IS spring frost. Two rows on a page showing 13.7 and
9.7 read as the same statistic twice, and they very nearly are.

The annual count is a different quantity and a much larger one: Gibbston 80.9
nights. That is the number a grower recognises, and it is the number external
frost statistics are published on, so it can be checked against something.

## Calendar year, on a vintage-labelled row

Pete's call, 2026-08-24, and the reason is comparability with published frost
data. It does mean this one metric spans different months from every other
metric on the row: vintage 2024's GDD is Sep 2023 - Apr 2024 while its frost is
Jan - Dec 2024. **Anything rendering it must say so**, or the page implies the
two cover the same period.

## Partial years are SKIPPED, not summed

A calendar year missing months would silently under-count — the exact failure
that understated every regional normal once before. The archive currently runs
to 2026-07, so calendar 2026 has seven months and is omitted rather than
reported as a very mild year. It appears on its own when the archive extends.
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import text                                         # noqa: E402

from db.session import SessionLocal                                 # noqa: E402

METRIC = "frost_days_annual"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)

    db = SessionLocal()
    try:
        # One row per (zone, calendar year) but ONLY where all twelve months
        # are present. `HAVING count(*) = 12` is the guard.
        rows = db.execute(text("""
            SELECT zone_id, year,
                   sum(mean)  AS annual,
                   min(mean)  AS mn,
                   max(mean)  AS mx,
                   sum(p10)   AS p10,
                   sum(p90)   AS p90,
                   max(n_cells) AS n_cells,
                   max(planted_ha) AS planted_ha,
                   max(grid_key) AS grid_key
              FROM climate_zone_surface_monthly
             WHERE variable = 'temp_min' AND statistic = 'frost_days'
             GROUP BY zone_id, year
            HAVING count(*) = 12
             ORDER BY zone_id, year
        """)).mappings().all()

        years = sorted({r["year"] for r in rows})
        print(f"{len(rows):,} complete zone-years, {years[0]}..{years[-1]}")

        # Only years that are also a vintage on the table, so nothing appears
        # under a vintage the rest of the page does not have.
        vintages = {v for (v,) in db.execute(text("""
            SELECT DISTINCT vintage_year FROM climate_zone_surface_season
        """)).all()}
        out = [r for r in rows if r["year"] in vintages]
        skipped = len(rows) - len(out)
        print(f"{len(out):,} land on an existing vintage"
              + (f", {skipped} outside the vintage range" if skipped else ""))

        incomplete = sorted(set(years) ^ {y for y in range(years[0], years[-1] + 1)})
        if incomplete:
            print(f"years with fewer than 12 months, skipped: {incomplete}")

        sample = [r for r in out if r["year"] in (1990, 2000, 2020)][:4]
        for r in sample:
            print(f"   zone {r['zone_id']} {r['year']}: "
                  f"{float(r['annual']):.1f} nights")

        if args.dry_run:
            print("\ndry run — nothing written")
            return 0

        from psycopg2.extras import execute_values
        conn = db.connection().connection
        values = [(r["zone_id"], r["year"], METRIC, float(r["annual"]),
                   float(r["mn"]), float(r["mx"]),
                   float(r["p10"]) if r["p10"] is not None else None,
                   float(r["p90"]) if r["p90"] is not None else None,
                   "nights", r["n_cells"], r["planted_ha"], r["grid_key"])
                  for r in out]
        with conn.cursor() as cur:
            execute_values(cur, """
                INSERT INTO climate_zone_surface_season
                    (zone_id, vintage_year, metric, mean, min, max, p10, p90,
                     unit, n_cells, planted_ha, grid_key)
                VALUES %s
                ON CONFLICT (zone_id, vintage_year, metric) DO UPDATE SET
                    mean = EXCLUDED.mean, min = EXCLUDED.min,
                    max = EXCLUDED.max, p10 = EXCLUDED.p10,
                    p90 = EXCLUDED.p90, unit = EXCLUDED.unit,
                    n_cells = EXCLUDED.n_cells,
                    planted_ha = EXCLUDED.planted_ha,
                    grid_key = EXCLUDED.grid_key
            """, values, page_size=1000)
        db.commit()
        print(f"written: {len(values):,} rows")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
