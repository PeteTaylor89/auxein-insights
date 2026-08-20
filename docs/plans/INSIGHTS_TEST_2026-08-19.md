# Insights test sheet — 2026-08-19

What changed today, and what has to be looked at in a browser. Separate from
`TEST_TOMORROW_2026-08-19.md`, which is the parallel Grow session's sheet.

**Nothing here is deployed.** The backend and the Insights frontend are both
still on the 08-17 snapshot: `/surfaces/zones` 404s, `/insights/sites` 404s,
`gdd10` 422s, and the published bundle is still `index-D8ZbVisM.js`.

Two migrations were applied to prod today. Head moved
`surface_season_granularity` → `zone_coastal_clip` → **`zone_label_point`**.

---

## 1. The 403 — the bug that made the free tier unreachable

`backend/core/public_security.py` declared `security = HTTPBearer()`.
`auto_error` defaults to **True**, which raises **403 Not authenticated** when
the `Authorization` header is missing — and raises it while *resolving* the
dependency, before the endpoint body runs. So `get_optional_public_user`'s own
`if credentials is None: return None` was unreachable in production, and every
endpoint declaring it rejected anonymous callers.

Fixed with a second scheme, `optional_security = HTTPBearer(auto_error=False)`,
used only by the optional dependency. `security` is untouched, so required-auth
routes keep their behaviour.

**Why it survived the suite:** `check_entitlements.py` called `require_pro(user=None)`
directly, which is not how an anonymous request arrives. It answered 401 in the
suite and 403 in production. Section 5 of that suite now tests the scheme itself.

- [ ] `/map` signed out: the surface renders, the scrubber holds one month, the
      unlock bar names the archive span
- [ ] Signing in unlocks the scrubber **without a page reload**
- [ ] Signed out, the browser console shows **no 403** from `/surfaces/available`
- [ ] `/surfaces/point` signed out returns **401**, and signed-in-not-Pro **402**
      (it returned 403 for both, which the client cannot tell apart)
- [ ] Articles still load signed out — `articles.py` uses the same dependency

---

## 2. Atlas controls

**Variability removed from mean temperature.** `sd` is no longer a chip on
`temp_mean`. On a fixed ramp it rendered as a near-uniform field that reads as a
broken layer. The band is untouched in the archive and is still what the GDD
integration is built on.

- [ ] Mean temperature offers **Mean / Coldest day / Warmest day** and nothing else
- [ ] The other layers are unchanged — rainfall still has four, temp_max still
      has days over 25 and 30

**Arrows.** A pair either side of the slider: single step, and same-month-last-year.

- [ ] `‹ ›` move one month; `« »` move a year and land on the **same month**
- [ ] On GDD (seasonal) they become previous/next **season**, holding the
      position within the run — October compares with October
- [ ] A year jump across an archive gap moves to the nearest month on that side
      rather than doing nothing
- [ ] Both are disabled signed out, along with the slider and play
- [ ] 44px targets — usable with a thumb

---

## 3. Wine regions clipped to the coast

LINZ *NZ Coastlines and Islands Polygons (Topo 1:50k)*, layer 51153, CC BY 4.0,
fetched with the existing `LINZ_API_KEY` into a new `nz_land` table (1,517
polygons under the 23 zone envelopes). `backend/scripts/fetch_nz_coastline.py`
is idempotent and re-runnable.

**This is cartography only.** Every zone statistic comes from
`climate_zone_cell_mask`, built from the vineyard register, which never read the
polygon. Nothing measured moved. The clip lives in a separate column —
`climate_zones.geometry_clipped` — because `geometry` is what
`insights_site_service.resolve_zone` matches a Pro site against, and a coastal
site whose 500 m cell is water must still resolve to its region.

What the water actually was:

| zone | before | after | was sea |
|---|---|---|---|
| waiheke | 130.1 km² | 76.1 km² | **41.5%** |
| auckland | 315.9 | 245.8 | **22.2%** |
| northland | 117.6 | 103.2 | 12.3% |
| hawkes-bay | 1006.3 | 948.3 | 5.8% |
| nelson | 262.1 | 260.6 | 0.6% |
| lower-wairau | 263.9 | 263.1 | 0.3% |
| marlborough | 10478.8 | 10472.3 | 0.1% |
| the other 16 | | | 0.0% |

**Render-time simplification was undoing most of it.** At the client's old
tolerance of 0.004° (~440 m) the simplifier cuts across bays and put **96.6 km²**
of sea back inside the outlines — half the work, invisibly. Tolerance is now
0.001° (~110 m), leaving 23.4 km². That costs payload, so parts under 0.05 km²
are dropped from the *drawn* outline (Marlborough clips into 238 parts, most of
them rocks in the Sounds): region layer 220 KB → 193 KB, no zone lost.

`/public/climate-zones/geojson` — the Wine regions tab — was clipped too. Fixing
one and not the other would leave the same polygons spilling into the sea on the
other tab.

- [ ] Waiheke and Auckland no longer draw over open water
- [ ] Hawke's Bay's edge follows the shoreline, at zoom 8+ as well as national
- [ ] The **Wine regions** tab shows the same trimmed outlines as the Atlas
- [ ] Attribution "Coastline: LINZ CC BY 4.0" appears in the map attribution
- [ ] The layer still feels responsive on a phone (193 KB, gzips hard)
- [ ] Pro site placement still resolves a coastal point to its region — that
      path reads `geometry`, not the clip, and this is the check that proves it

---

## 4. Region labels

Names now draw from a stored anchor per zone, on a point-on-surface of one part.

**The part is chosen by registered vine count, not by area.** Auckland is why:
its largest land part is 51.9 km² out in the gulf against 49.0 km² at Kumeu, so
ranking by area put "Auckland" on Waiheke by a 6% margin. Blocks inside a
sub-zone are excluded from the parent's ranking — 280 of Auckland's 417
registered blocks are on Waiheke, which is its own zone with its own label.

All 23 anchors verified on land.

- [ ] Every visible region is labelled, and the label sits **on** the region
- [ ] "Auckland" is at Kumeu/Matakana, not on Waiheke
- [ ] Zooming past 8 swaps to sub-zones and the labels swap with them
- [ ] Labels collide rather than stack at national zoom
- [ ] The label does not swallow a click meant for the polygon

---

## 5. The zone card follows the map

`ZoneOverviewCard` took whatever the newest season was, regardless of what the
Atlas was showing. Open a zone while scrubbed to 2014 and the card silently
described a different decade — both numbers plausible, the contradiction
invisible.

It now takes the vintage from the map: `season` from the server on seasonal
layers, and the Sep–Apr rule on monthly ones (May–August is attributed to the
season that has just finished, so scrubbing through winter does not blank it).

- [ ] Scrub to 2014, click Marlborough → the card header reads **2013/14**
- [ ] The GDD/temp/rain numbers change as you scrub, not just the header
- [ ] Scrub to a month past the end of the zone season table → the card says
      "The 2024 season is not published yet — showing 2023" rather than
      silently showing 2023
- [ ] Scrub into winter (June 2015) → the card stays on the 2015 season
- [ ] The vs-1987–2016 deltas still make sense against the shown year

---

## 5b. Pro: how somebody becomes one, and how to test it

### There was no onboarding path at all

Nothing in the product ever wrote `subscription_tier='pro'`. There is no billing
integration, no Stripe, no checkout. The admin panel listed users but did not
show or edit a tier — its `PATCH` accepted `is_active` and `notes` and nothing
else. The only way to sell a subscription was an `UPDATE` in psql.

**Three ways to hold Pro, one helper that decides.** `core/entitlements.is_pro`
is the single definition:

| how | who writes it | expiry |
|---|---|---|
| `subscription_tier='grow'` | `insights_profile.ensure_insights_profile`, on the one-way SSO handshake | never — it follows the Grow relationship |
| `subscription_tier='pro'` | an operator, after payment is arranged off-platform | `pro_expires_at`; NULL means open-ended |
| anything else | — | not Pro |

**Being Pro is not the same as having a site.** `pro_site_quota` defaults to 0
and is a separate purchase that stacks, so a brand-new Pro subscriber opens
`/my-site`, sees the placement map, and is correctly refused with a 402. That is
the single most likely thing to look like a bug.

Prod today: **5 accounts are Pro, all of them Grow-origin, all with quota 0.**
There has never been a paid `pro` row.

### What was built for it

- `PATCH /api/v1/admin/users/{id}` now takes `subscription_tier`,
  `pro_expires_at`, `clear_pro_expiry` and `pro_site_quota`. It refuses `'grow'`
  (422) and refuses to touch a row whose `origin='grow'` (409), because that
  tier describes where the row came from and the next sign-in would overwrite
  it. The first grant stamps `pro_started_at`; a re-grant after a lapse keeps
  the original date. Every subscription change is logged with the admin's email.
- The admin user list gained a **Plan** column and the detail page a
  **Subscription** card. Both read `is_pro`, never the tier string.
- `backend/scripts/grant_pro.py` does the same from the command line, which is
  how to test before any of this is deployed.

### Testing it

```
python backend/scripts/grant_pro.py --list
python backend/scripts/grant_pro.py you@example.com --quota 1
```

- [ ] Register a fresh account on Insights, verify the email, sign in →
      **no "Your site" in the nav**
- [ ] `/my-site` directly → the Pro gate, and its button now **does something**
      (it used to be a dead `null` handler for a signed-in free user; it opens a
      mail to insights@ instead, because there is nothing to self-serve)
- [ ] Grant Pro **without** a quota → "Your site" appears, the placement map
      loads, placing is refused with the quota line explaining why
- [ ] Grant `--quota 1` → placement succeeds, the site populates, the dashboard
      appears
- [ ] Set `pro_expires_at` to yesterday → the nav entry disappears and
      `/my-site` re-gates. The account still says tier `pro`; the entitlement is
      what lapsed
- [ ] In the admin panel: the Plan column shows Pro / Pro · Grow / Lapsed / Free
- [ ] Try to change a Grow user's tier in the admin panel → refused with the
      reason, not a silent no-op

**The cron still does not exist**, so in prod a placed site stays `populating`
forever. Until it is wired, run `python backend/scripts/populate_insights_sites.py`
by hand after placing.

---

## 5c. The Pro dashboard

`/my-site` now opens with a summary above the two charts. It is **two panels
from two sources and they are never merged**:

**Tiles — the site's own record.** Its own 500 m cell, every season 1986–2023,
from the surface archive. Each tile carries the 1991–2020 normal, the latest
season against that normal, the range with the seasons that produced it, an
OLS trend per decade, and where the site sits against the p10–p90 spread of
planted cells in its region.

**Season strip — this season, at the region, from stations.** `climate_zone_daily`,
which starts 2025-09. Different source, different geography, different era, and
the panel says so in its own heading.

Three traps in that table, all silent, all handled in
`services/insights_dashboard.py`:

1. **`gdd_cumulative` is not gdd10.** `gdd_daily` equals `temp_mean` — base
   **zero** — and Marlborough's 2026 figure is **4,591** against a Sep–Apr gdd10
   near 1,370. Rendering the stored column would show a 235% anomaly. GDD is
   recomputed at base 10.
2. **`vintage_year` there is a July–June season**, not Sep–Apr: 2026-07-01 is
   already labelled 2027. The strip filters by date and never by that column.
3. **Only complete months are compared.** Eleven weeks of a season against an
   eight-month normal reads as a drought.

- [ ] Open `/my-site` on a **phone** first: tiles stack one per row, nothing
      overflows, the strip reads as a different kind of panel from the tiles
- [ ] The strip is headed with the region name and says "not at your site"
- [ ] Right now (August) it should read **"2026 season · complete"** — Sep 2025
      to Apr 2026. In September it flips to "in progress"
- [ ] The live GDD figure is in the hundreds-to-1,400 range, **not ~4,500**.
      4,500 means trap 1 has come back
- [ ] Last spring frost renders as a **date**, and its anomaly as **days**
- [ ] Trend per decade is plausible (GDD warming, tens per decade — not
      hundreds)
- [ ] A tile's "outside the range 90% of the region sits in" matches what the
      season chart below it shows

## 5d. Starting the extraction

`place_site` writes `status='populating'`, returns 202, and runs **nothing**
inline. Without a runner that row sits there for ever — and the asymmetry
matters: `useProSites` tells the customer at ten minutes, while nothing tells
us at all. A site nobody picks up never reaches `failed`, so there is no error
to find.

**Scheduled work on this platform is GitHub Actions, not EB cron**
(`weather-ingestion`, `daily-processing`, `synop-live`;
`backend/.ebextensions` has one Python config and nothing scheduled). So
`.github/workflows/insights-site-population.yml` is **independent of the EB
deploy and should be merged first** — otherwise the first customer to place a
point is the one who finds the gap.

Two triggers, deliberately unequal:

| | what it is | when |
|---|---|---|
| `workflow_dispatch` from `place_site` | the accelerator | seconds after placing |
| the `*/5` schedule | the guarantee, and the only alerting | within ~5 min, best-effort |

**Every dispatch failure is a no-op.** No token, GitHub unreachable, a 404, a
timeout — all log and return `False`, and the site stays queued for the sweep.
A dispatch failure that 500s a placement would turn a slow site into a lost
sale, which is worse than the wait it was avoiding.

Setup, in order:

1. Merge the workflow to **main**. `workflow_dispatch` only resolves from the
   default branch — until then the API answers 404, logs a warning, and the
   sweep covers it. Expect that warning; it is not a bug.
2. Add `GITHUB_DISPATCH_TOKEN` to the EB environment — fine-grained PAT,
   `actions: write` on the repo. Absent on a dev machine, which logs at INFO.
3. Then deploy the backend.

- [ ] Place a site with no token configured → still works, still populates via
      the sweep, log says "leaving insights-site-population.yml to its schedule"
- [ ] With the token set and the workflow on main → the Actions run appears
      within seconds of placing, and the page flips without the stalled message
- [ ] **Move** a site → re-dispatches. **Rename** it → does not
- [ ] Break the token deliberately → placement still returns 202
- [ ] Leave a site stuck past 30 minutes → the scheduled run goes **red** and
      GitHub emails. This is the only alerting the feature has

---

## 6. What is NOT done

- **Nothing is deployed.** Backend deploy ships the working directory, which now
  also carries the parallel Grow session's reporting and marketing work. Their
  four deploys are being held for this. Coordinate before `eb deploy`.
- The frontend has never been rebuilt — everything above is invisible until it is.
- A **daily** Pro refresh is deliberately NOT wired. Nothing forward exists
  (`surface_run` maxes at 2023-12), `populate` is a full rebuild of 7,296
  objects per site rather than incremental, and the record is monthly so a daily
  clock would run ~30 times to do one month's work. When forward surfaces land,
  the refresh hangs off `index_surfaces.py` per new month — and must ship in the
  SAME change as the first forward surface, or every Pro dashboard silently
  reads "latest: 2023" while the Atlas shows 2026.
- The stale one-URL `sitemap.xml` is still the live object on S3.
- `pro_site_quota` still defaults to 0; a Pro tester cannot place a site until
  it is set by hand.

## 7. Suites

| suite | venv | result |
|---|---|---|
| `check_surfaces_live.py` | `backend/venv` (needs rasterio **and** jinja2) | **70/70** (8 new) |
| `check_entitlements.py` | `backend/venv` | **ALL PASS** (3 new) |
| `check_insights_sites.py` | `backend/venv` | see run log |

The root `venv` has rasterio but no jinja2/boto3; the default system Python has
neither. `backend/venv` is the only one that runs the surface suites end to end.
