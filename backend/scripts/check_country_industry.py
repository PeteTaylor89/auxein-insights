"""Acceptance suite for the country + industry dimension.

Phase 1 of `docs/plans/COUNTRY_INDUSTRY_REGIONS_2026-08-24.md`.

    backend/venv/Scripts/python.exe backend/scripts/check_country_industry.py

Runs against the real database and calls the router functions directly, so it
needs no running server. It writes nothing.

The point of this suite is not that the new endpoints work — that is the easy
half. It is that **every existing unscoped caller still gets exactly what it got
before**, because the defaults are the entire contents of the database. A
regression here is invisible in the new code and shows up as a blank region page
in production.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv                                      # noqa: E402

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
os.environ.setdefault("AWS_REGION", "ap-southeast-2")

from fastapi import HTTPException                                   # noqa: E402
from sqlalchemy import text                                         # noqa: E402

from api.v1 import public_taxonomy as T                             # noqa: E402
from api.v1 import public_climate as PC                             # noqa: E402
from api.v1 import realtime_climate as RC                           # noqa: E402
from core import scope as scope_mod                                 # noqa: E402
from db.session import SessionLocal                                 # noqa: E402


PASS, FAIL = 0, 0


def check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  PASS  {label}")
    else:
        FAIL += 1
        print(f"  FAIL  {label}   {detail}")


def main():
    db = SessionLocal()
    try:
        # ------------------------------------------------------- migration ran
        print("\n[schema]")
        head = db.execute(text("SELECT version_num FROM alembic_version")).scalars().all()
        # Dual rows are a known gotcha here — `alembic current` masks it and
        # only a direct SELECT reveals it. Worth asserting on its own.
        check("alembic has exactly one head row", len(head) == 1, f"got {head}")

        # Ancestry, NOT the tip. Pinning the head means this suite breaks every
        # time anyone lands an unrelated migration, which is exactly what
        # happened on 2026-08-24 when the surfaces session added
        # `surface_projection_run` on top of this one. What matters is that
        # `country_industry_dim` HAS been applied, so walk the on-disk chain
        # down from whatever the database says is current and look for it.
        # A MERGE revision has a TUPLE down_revision, so the ancestry is a
        # graph and not a list. Walking it as a chain worked until 2026-08-24,
        # when two sessions branched off `surface_projection_run` and the merge
        # that rejoined them made this report the literal string
        # "('weather_daily_qc', 'history_surface_view')" as one revision id.
        versions = Path(__file__).resolve().parents[2] / "alembic" / "versions"
        by_rev: dict = {}
        for f in versions.glob("*.py"):
            src = f.read_text(encoding="utf-8", errors="replace")
            rev = None
            downs: list = []
            for line in src.splitlines():
                if line.startswith("revision ="):
                    rev = line.split("=", 1)[1].strip().strip("'\"")
                elif line.startswith("down_revision ="):
                    raw = line.split("=", 1)[1].strip()
                    if raw == "None":
                        downs = []
                    elif raw.startswith("("):
                        downs = [x.strip().strip("'\"")
                                 for x in raw.strip("()").split(",")
                                 if x.strip()]
                    else:
                        downs = [raw.strip("'\"")]
            if rev:
                by_rev[rev] = downs

        # Breadth-first over every parent, so both sides of a merge are visited.
        chain: list = []
        seen: set = set()
        queue = [head[0]] if head else []
        while queue:
            cur = queue.pop(0)
            if not cur or cur in seen:
                continue
            seen.add(cur)
            chain.append(cur)
            queue.extend(by_rev.get(cur, []))

        check("country_industry_dim is in the applied ancestry",
              'country_industry_dim' in chain,
              f"head={head}, chain={chain[:5]}")
        if head and head[0] != 'country_industry_dim':
            print(f"        (head has moved on to {head[0]} — later "
                  f"migrations sit on top of this one; {len(chain)} revisions "
                  f"in the ancestry)")

        cols = {r[0] for r in db.execute(text("""
            SELECT column_name FROM information_schema.columns
             WHERE table_name = 'countries'""")).all()}
        check("countries.season_start_month exists", 'season_start_month' in cols)

        for table in ('climate_zones', 'wine_regions'):
            cols = {r[0] for r in db.execute(text("""
                SELECT column_name FROM information_schema.columns
                 WHERE table_name = :t"""), {"t": table}).all()}
            check(f"{table}.industry_id exists", 'industry_id' in cols)

        cols = {r[0] for r in db.execute(text("""
            SELECT column_name FROM information_schema.columns
             WHERE table_name = 'surface_run'""")).all()}
        check("surface_run.country_id exists", 'country_id' in cols)

        # The whole reason the column was added. Without country in the unique
        # index an Australian raster for a New Zealand date is a duplicate.
        for idx in ('uq_surface_run_timestep', 'uq_surface_run_aggregate'):
            defn = db.execute(text("""
                SELECT indexdef FROM pg_indexes WHERE indexname = :i"""),
                {"i": idx}).scalar()
            check(f"{idx} carries country_id",
                  defn is not None and 'country_id' in defn, f"def={defn}")

        # ------------------------------------------------------------ backfill
        print("\n[backfill — nothing may be left unassigned]")
        for table in ('climate_zones', 'wine_regions'):
            n = db.execute(text(
                f"SELECT count(*) FROM {table} WHERE industry_id IS NULL")).scalar()
            check(f"{table} has no NULL industry_id", n == 0, f"{n} nulls")

        n = db.execute(text(
            "SELECT count(*) FROM surface_run WHERE country_id IS NULL")).scalar()
        check("surface_run has no NULL country_id", n == 0, f"{n} nulls")

        n = db.execute(text("""
            SELECT count(*) FROM climate_zones z
              JOIN industries i ON i.id = z.industry_id
             WHERE i.key <> 'wine'""")).scalar()
        check("every existing zone is wine", n == 0, f"{n} non-wine")

        # A writer that knows nothing about the column must still be able to
        # insert. This is the guard against breaking index_surfaces.py.
        default = db.execute(text("""
            SELECT column_default FROM information_schema.columns
             WHERE table_name = 'surface_run' AND column_name = 'country_id'""")).scalar()
        check("surface_run.country_id has a server default", bool(default),
              f"default={default}")

        # ------------------------------------------------------------- seeding
        print("\n[seed]")
        inds = {r[0]: r[1] for r in db.execute(text(
            "SELECT key, is_active FROM industries")).all()}
        check("five industries seeded", len(inds) == 5, f"got {sorted(inds)}")
        check("wine is the only active industry",
              [k for k, v in inds.items() if v] == ['wine'],
              f"active={[k for k, v in inds.items() if v]}")

        countries = {r[0]: r[1] for r in db.execute(text(
            "SELECT iso2, is_active FROM countries")).all()}
        check("NZ and AU both present", set(countries) == {'NZ', 'AU'},
              f"got {sorted(countries)}")
        check("NZ active", countries.get('NZ') is True)
        check("AU present but INACTIVE — it has no data yet",
              countries.get('AU') is False)

        au = db.execute(text("""
            SELECT hemisphere, vintage_start_month, season_start_month
              FROM countries WHERE iso2 = 'AU'""")).mappings().first()
        check("AU is Southern Hemisphere", au['hemisphere'] == 'S')
        check("AU shares NZ's vintage convention", au['vintage_start_month'] == 7)
        check("AU shares NZ's growing season start", au['season_start_month'] == 9)

        nz = db.execute(text("""
            SELECT vintage_start_month, season_start_month
              FROM countries WHERE iso2 = 'NZ'""")).mappings().first()
        check("NZ vintage_start_month still 7 (untouched)",
              nz['vintage_start_month'] == 7)
        check("NZ season_start_month is 9, NOT the vintage month",
              nz['season_start_month'] == 9 and
              nz['season_start_month'] != nz['vintage_start_month'])

        # ------------------------------------------------------------- resolver
        print("\n[scope resolver]")
        sc = scope_mod.resolve(db)
        check("bare resolve() defaults to NZ wine",
              sc.country_iso2 == 'NZ' and sc.industry_key == 'wine')
        check("default scope is active", sc.active is True)

        sc = scope_mod.resolve(db, 'nz', 'wine')
        check("lowercase URL segments resolve", sc.country_iso2 == 'NZ')

        sc = scope_mod.resolve(db, 'AU', 'wine')
        check("AU resolves but is not active", sc.active is False)

        for bad in (('XX', 'wine'), ('NZ', 'llamas')):
            try:
                scope_mod.resolve(db, *bad)
                check(f"unknown scope {bad} raises 404", False, "no raise")
            except HTTPException as e:
                check(f"unknown scope {bad} raises 404", e.status_code == 404,
                      f"got {e.status_code}")

        # ---------------------------------------------------- taxonomy endpoints
        print("\n[taxonomy endpoints]")
        res = T.list_industries(active_only=False, db=db)
        check("/industries returns all five", len(res.industries) == 5)
        check("/industries is in display order",
              [i.key for i in res.industries][0] == 'wine')
        check("/industries carries the lucide icon name",
              res.industries[0].icon == 'Grape', f"got {res.industries[0].icon}")

        res = T.list_industries(active_only=True, db=db)
        check("/industries?active_only returns only wine",
              [i.key for i in res.industries] == ['wine'])

        res = T.list_countries(active_only=False, db=db)
        check("/countries returns both", len(res.countries) == 2)
        res = T.list_countries(active_only=True, db=db)
        check("/countries?active_only returns only NZ",
              [c.iso2 for c in res.countries] == ['NZ'])

        r = T.resolve_scope(country='nz', industry='wine', db=db)
        check("/resolve nz/wine is active", r['active'] is True)
        r = T.resolve_scope(country='au', industry='wine', db=db)
        check("/resolve au/wine is 200 and inactive, NOT 404",
              r['active'] is False and r['country']['is_active'] is False)
        try:
            T.resolve_scope(country='xx', industry='wine', db=db)
            check("/resolve unknown country 404s", False, "no raise")
        except HTTPException as e:
            check("/resolve unknown country 404s", e.status_code == 404)

        # ------------------------------------------- NO REGRESSION for old callers
        # This is the half that matters. An unscoped call must be identical.
        print("\n[no regression — unscoped calls are unchanged]")

        total_active = db.execute(text(
            "SELECT count(*) FROM climate_zones WHERE is_active")).scalar()

        unscoped = PC.list_zones(country=None, industry=None, db=db)
        check("/zones unscoped returns every active zone",
              len(unscoped.zones) == total_active,
              f"{len(unscoped.zones)} vs {total_active}")

        scoped = PC.list_zones(country='NZ', industry='wine', db=db)
        check("/zones explicit NZ+wine == unscoped",
              [z.slug for z in scoped.zones] == [z.slug for z in unscoped.zones])

        au_zones = PC.list_zones(country='AU', industry='wine', db=db)
        check("/zones for AU is empty, not an error", len(au_zones.zones) == 0)

        kiwi = PC.list_zones(country='NZ', industry='kiwifruit', db=db)
        check("/zones for an inactive industry is empty", len(kiwi.zones) == 0)

        regions_unscoped = PC.list_regions(country=None, industry=None, db=db)
        regions_scoped = PC.list_regions(country='NZ', industry='wine', db=db)
        check("/regions unscoped == explicit NZ+wine",
              [r.slug for r in regions_unscoped.regions] ==
              [r.slug for r in regions_scoped.regions])
        check("/regions returns the eleven wine regions' covered subset",
              len(regions_unscoped.regions) > 0,
              f"got {len(regions_unscoped.regions)}")

        rt_unscoped = RC.list_zones_with_current_data(
            region_id=None, country=None, industry=None, db=db)
        rt_scoped = RC.list_zones_with_current_data(
            region_id=None, country='NZ', industry='wine', db=db)
        check("realtime /zones unscoped == explicit NZ+wine",
              [z.slug for z in rt_unscoped.zones] ==
              [z.slug for z in rt_scoped.zones])

        # The coverage gap the dashboard has to design around.
        check("realtime /zones is a SUBSET of all zones — coverage is partial",
              len(rt_unscoped.zones) < total_active,
              f"{len(rt_unscoped.zones)} of {total_active}")
        print(f"        (coverage: {len(rt_unscoped.zones)} of {total_active} "
              f"zones have current-season data)")

        rt_au = RC.list_zones_with_current_data(
            region_id=None, country='AU', industry='wine', db=db)
        check("realtime /zones for AU is empty, not an error",
              len(rt_au.zones) == 0)

    finally:
        db.close()

    print(f"\n{PASS} passed, {FAIL} failed")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
