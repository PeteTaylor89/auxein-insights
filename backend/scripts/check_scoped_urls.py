"""Acceptance suite for the scoped URL space — Phase 2.

    backend/venv/Scripts/python.exe backend/scripts/check_scoped_urls.py

Runs against the real database, calls the router functions directly, writes
nothing.

The sitemap is the piece worth testing hardest. It is the only part of the URL
restructure with no visible failure mode: a wrong sitemap does not break a page,
it just quietly stops the strongest organic-search assets on the site from being
submitted — which is exactly the defect that was already live here once, when
`robots.txt` pointed at a one-URL static stub.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv                                      # noqa: E402

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
os.environ.setdefault("AWS_REGION", "ap-southeast-2")

from sqlalchemy import text                                         # noqa: E402

from api.v1 import seo                                              # noqa: E402
from api.v1 import regions as REG                                   # noqa: E402
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
        xml = asyncio.run(seo.sitemap(db=db)).body.decode("utf-8")
        locs = [line.split("<loc>")[1].split("</loc>")[0]
                for line in xml.split("\n") if "<loc>" in line]
        paths = [u.replace(seo.SITE_URL, "") for u in locs]

        zones = [r[0] for r in db.execute(text("""
            SELECT z.slug FROM climate_zones z
              JOIN countries c ON c.id = z.country_id
              JOIN industries i ON i.id = z.industry_id
             WHERE z.is_active AND c.iso2 = 'NZ' AND i.key = 'wine'
             ORDER BY z.display_order""")).all()]

        print("\n[sitemap — the scoped hub and region pages]")
        check("/nz/wine hub is present", "/nz/wine" in paths)
        check("every active NZ wine zone is present",
              all(f"/nz/wine/{s}" in paths for s in zones),
              f"missing {[s for s in zones if f'/nz/wine/{s}' not in paths]}")
        check(f"all {len(zones)} zones emitted, none dropped",
              sum(1 for p in paths if p.startswith("/nz/wine/")) == len(zones),
              f"got {sum(1 for p in paths if p.startswith('/nz/wine/'))}")

        print("\n[sitemap — what must NOT be in it]")
        check("no /regions URL survives — it is a redirect now",
              not any(p == "/regions" or p.startswith("/regions/") for p in paths),
              f"found {[p for p in paths if p.startswith('/regions')]}")
        check("Australia is NOT submitted while it has no data",
              not any(p.startswith("/au/") for p in paths),
              f"found {[p for p in paths if p.startswith('/au/')]}")
        for pending in ("kiwifruit", "apples", "cherries", "hops"):
            check(f"pending industry '{pending}' is not submitted",
                  not any(f"/{pending}" in p for p in paths))

        print("\n[sitemap — nothing else regressed]")
        for must in ("/", "/map", "/articles", "/about", "/pro", "/legal"):
            check(f"{must} still present", must in paths)
        check("/research index still deliberately absent",
              "/research" not in paths)
        check("article URLs unchanged at /articles/{slug}",
              any(p.startswith("/articles/") for p in paths))
        check("no duplicate URLs", len(paths) == len(set(paths)),
              f"{len(paths) - len(set(paths))} duplicates")
        check("every loc is absolute", all(u.startswith("https://") for u in locs))

        print("\n[/public/regions — Atlas sidebar scoping]")

        class _U:  # the endpoint only needs a truthy user object
            id = 0

        unscoped = asyncio.run(REG.list_regions(
            country=None, industry=None, current_user=_U(), db=db))
        scoped = asyncio.run(REG.list_regions(
            country='NZ', industry='wine', current_user=_U(), db=db))
        check("unscoped == explicit NZ+wine",
              [r.slug for r in unscoped] == [r.slug for r in scoped])
        check("returns the wine regions", len(unscoped) > 0, f"got {len(unscoped)}")
        check("bounds still present for fly-to",
              all(r.bounds is not None for r in unscoped),
              f"{sum(1 for r in unscoped if r.bounds is None)} without bounds")

        au = asyncio.run(REG.list_regions(
            country='AU', industry='wine', current_user=_U(), db=db))
        check("AU returns empty, not an error", len(au) == 0)

    finally:
        db.close()

    print(f"\n{PASS} passed, {FAIL} failed")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
