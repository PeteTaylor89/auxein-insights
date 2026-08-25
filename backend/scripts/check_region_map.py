"""Acceptance suite for the clickable region map — Phase 4b.

    backend/venv/Scripts/python.exe backend/scripts/check_region_map.py

Runs against the real database, calls the router function directly, writes
nothing.

Two things are being defended here, and neither is about the picture looking
nice:

1. **The payload budget.** This ships on the landing page, the highest-traffic
   URL on the domain. GeoJSON of the same shapes is ~75 KB; the whole point of
   projecting server-side and rounding to integers is to get well under that.
   A regression here is invisible until someone measures it.

2. **Country-agnosticism.** The map exists in this form so Australia is a row in
   `country_outline` rather than a second component. If anything NZ-shaped
   creeps back into the response contract, that promise quietly dies.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv                                      # noqa: E402

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
os.environ.setdefault("AWS_REGION", "ap-southeast-2")

from fastapi import HTTPException                                   # noqa: E402
from sqlalchemy import text                                         # noqa: E402

from api.v1 import public_map as M                                  # noqa: E402
from db.session import SessionLocal                                 # noqa: E402


PASS, FAIL = 0, 0

# The landing page budget. Generous against the 20.5 KB measured on
# 2026-08-24, tight enough that doubling it fails.
MAX_PAYLOAD_KB = 40


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
        M._CACHE.clear()
        r = M.region_map(country=None, industry=None, level="region", db=db)

        print("\n[the default scope draws]")
        check("available", r.get("available") is True, r.get("reason"))
        check("has a land outline", bool(r.get("land")))
        check("has regions", len(r.get("regions", [])) > 0)
        check("width and height are set",
              r.get("width", 0) > 0 and r.get("height", 0) > 0)

        n_region_zones = db.execute(text("""
            SELECT count(*) FROM climate_zones z
              JOIN countries c ON c.id = z.country_id
              JOIN industries i ON i.id = z.industry_id
             WHERE z.is_active AND z.zone_level = 'region'
               AND c.iso2 = 'NZ' AND i.key = 'wine'""")).scalar()
        check(f"all {n_region_zones} region-level zones are drawn",
              len(r["regions"]) == n_region_zones, f"got {len(r['regions'])}")

        print("\n[payload budget — this sits on the landing page]")
        size = len(json.dumps(r))
        check(f"under {MAX_PAYLOAD_KB} KB", size < MAX_PAYLOAD_KB * 1024,
              f"{size / 1024:.1f} KB")
        print(f"        (actual: {size / 1024:.1f} KB, "
              f"land {len(r['land']) / 1024:.1f} KB)")

        # The saving comes from integers. A stray float means the rounding was
        # lost somewhere and the payload will creep.
        floats = [d for d in (r["land"], *[x["d"] for x in r["regions"]])
                  if "." in d]
        check("every coordinate is an integer — no floats leaked into the paths",
              not floats, f"{len(floats)} paths contain decimals")

        print("\n[the paths are well formed]")
        for z in r["regions"]:
            if not z["d"].startswith("M") or not z["d"].endswith("Z"):
                check(f"{z['slug']} path is closed", False, z["d"][:40])
                break
        else:
            check("every region path starts with M and closes with Z", True)
        check("land path is closed",
              r["land"].startswith("M") and r["land"].endswith("Z"))

        # Every drawn point must sit inside the declared viewBox, or the shape
        # is clipped and nobody finds out until they look.
        def coords(d):
            for chunk in d.replace("M", " ").replace("Z", " ").split():
                yield chunk
        out_of_box = 0
        for z in r["regions"]:
            nums = [int(c) for c in coords(z["d"])]
            xs, ys = nums[0::2], nums[1::2]
            if xs and (min(xs) < -2 or max(xs) > r["width"] + 2):
                out_of_box += 1
            elif ys and (min(ys) < -2 or max(ys) > r["height"] + 2):
                out_of_box += 1
        check("every region sits inside the viewBox", out_of_box == 0,
              f"{out_of_box} regions outside")

        print("\n[what the client needs to render it]")
        check("every region has a slug and a name",
              all(z["slug"] and z["name"] for z in r["regions"]))
        check("every region reports live-data coverage",
              all(isinstance(z["has_live_data"], bool) for z in r["regions"]))
        n_labels = sum(1 for z in r["regions"] if z["label"])
        check("regions carry label points", n_labels > 0, f"{n_labels} labelled")
        for z in r["regions"]:
            if z["label"]:
                inside = (0 <= z["label"]["x"] <= r["width"]
                          and 0 <= z["label"]["y"] <= r["height"])
                check("label points are inside the viewBox too", inside,
                      f"{z['slug']} at {z['label']}")
                break

        print("\n[country-agnostic — the reason it is built this way]")
        au = M.region_map(country="AU", industry="wine", level="region", db=db)
        check("Australia returns available:false, NOT an error",
              au.get("available") is False)
        check("and explains itself", bool(au.get("reason")))
        check("with an empty region list rather than a missing key",
              au.get("regions") == [])

        # `country_outline` is what makes AU a row rather than a code change.
        cols = {c[0] for c in db.execute(text("""
            SELECT column_name FROM information_schema.columns
             WHERE table_name = 'country_outline'""")).all()}
        check("country_outline is keyed by country, not hardcoded",
              "country_id" in cols and "geometry" in cols)
        check("and records how coarse it is",
              "simplify_tolerance" in cols and "source" in cols)

        print("\n[scope behaviour]")
        kiwi = M.region_map(country="NZ", industry="kiwifruit",
                            level="region", db=db)
        check("an industry with no zones draws the land but no regions",
              kiwi["available"] is True and kiwi["regions"] == [],
              f"{len(kiwi.get('regions', []))} regions")
        try:
            M.region_map(country="XX", industry="wine", level="region", db=db)
            check("an unknown country 404s", False, "no raise")
        except HTTPException as e:
            check("an unknown country 404s", e.status_code == 404)

        allz = M.region_map(country="NZ", industry="wine", level="all", db=db)
        check("level=all includes sub-zones",
              len(allz["regions"]) > len(r["regions"]),
              f"all={len(allz['regions'])} region={len(r['regions'])}")

        print("\n[caching]")
        M._CACHE.clear()
        first = M.region_map(country=None, industry=None, level="region", db=db)
        second = M.region_map(country=None, industry=None, level="region", db=db)
        check("a repeat request is served from cache", first is second)

    finally:
        db.close()

    print(f"\n{PASS} passed, {FAIL} failed")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
