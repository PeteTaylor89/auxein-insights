# Insights test sheet — 2026-08-17 build

Everything below is **built and unverified in a browser**. The backend suites
pass (`check_surfaces_live.py` 41/41, `check_surface_stub.py` all pass) but no
human has looked at any of it.

---

## 0. Deployment state — UPDATED after the 08-17 backend deploy

The backend was deployed late on 08-17, from a dirty tree. The snapshot landed
**after** the colour-ramp work and **before** Phase 4.

Verified live:

| | |
|---|---|
| ✅ **Rasterio + LERC + private-bucket S3 on EB** | A tile renders: 200, 256×256 RGBA PNG, 20,785 bytes. The biggest architectural risk in the design is **cleared in production** |
| ✅ **Colour ramps** | `x-surface-domain: -7.0,26.0` (temp) and `0.0,320.0` (rainfall/max) |
| ✅ **Blockchain removal** | `/api/v1/blockchain/*` 404s — code and schema agree again, incident closed |
| ❌ **Phase 4** | `/region` still 501, `/zones` 404 — **needs a second deploy** |
| ❌ **Frontend** | Still `index-D8ZbVisM.js`, predating the 08-13 rebuild |

Remaining prerequisites:

| # | Step | Why |
|---|---|---|
| 0.1 | **Commit.** Nothing from 08-17 is committed, and prod is running code that exists only on disk | Scope the `git add` — the tree mixes Insights work with the parallel Grow session's |
| 0.2 | `eb deploy auxein-api-prod-lb` again | Ships Phase 4. No longer a rasterio risk |
| 0.3 | Rebuild + publish `packages/insights` | Unblocks **every** §1 and §2 test |
| 0.4 | **Delete the stale `sitemap.xml` object on S3** | Publishing over it is not enough if the file was removed from the build |

**So: §1 and §2 need 0.3; §3 needs 0.2.** Nothing in §1–§3 is testable yet.
§4.10 (block→company assignment) **is** testable now and is the highest-value
single check on this sheet.

---

## 1. Colour ramps and labels (Atlas)

| # | Test | Expect |
|---|---|---|
| 1.1 | Open `/map`, select **Rainfall** | The statistic chip reads **"Wettest day"**, never "Warmest day" |
| 1.2 | Select **Minimum temperature** → extremes | Chips read **"Coldest night" / "Warmest night"**, not "day" |
| 1.3 | Select **Maximum temperature** → extremes | **"Coolest day" / "Hottest day"** |
| 1.4 | Switch temp_mean → temp_min → temp_max on the **same month** | All three use the **same purple→blue→yellow→red ramp** AND the same legend range (−7…26). tmin should look coolest, tmax warmest — a visible progression |
| 1.5 | Scrub temperature from **January to July** | Colour changes dramatically (red→blue). If it barely moves, the fixed domain is not being applied |
| 1.6 | Rainfall, any month | MetService-style white→blue→green→yellow→orange→red. **Most of the country should NOT be one flat pale colour** |
| 1.7 | Rainfall → "Wettest day", pick a known storm month (**Jan 2023**, Auckland) | Auckland reads orange/red, not saturated flat. Legend tops out at **320 mm** |
| 1.8 | Read the legend on any layer | Tick values match the ramp; note "· ends saturate" |
| 1.9 | Rainfall layers | **No cv_rmse / confidence figure is shown** (it is dimensionless — showing it implies micron accuracy) |

---

## 2. Zone overlay (the new work)

| # | Test | Expect |
|---|---|---|
| 2.1 | Open `/map` at default zoom | **10 region polygons**, thin dark outline, near-transparent fill — the surface underneath must stay readable |
| 2.2 | Hover a zone (desktop) | Fill darkens slightly, cursor becomes a pointer |
| 2.3 | Zoom in past ~z8 | Polygons **swap to the 13 sub-zones** (Awatere, Bannockburn, Gibbston…). Regions disappear — both levels must never draw at once |
| 2.4 | Toggle **"Wine regions"** off / on | Polygons disappear / return; any open card closes on toggle-off |
| 2.5 | Confirm the **"Projections · soon"** chip | Visibly greyed and inert. Must not look broken, must not look clickable |
| 2.6 | Click **Marlborough** | Card appears bottom-left with GDD, mean temp, rainfall, frost days |
| 2.7 | Check Marlborough's mean temperature on the card | **~15 °C, NOT ~11 °C.** 11 means the mask is not being applied and it is averaging the Sounds and the ranges |
| 2.8 | Read the "vs 1987–2016" deltas | Present and signed; GDD should read **warmer than baseline** for a recent season |
| 2.9 | Read the "Across vineyards in this zone" line | A range, e.g. ~12.6–15.9 °C for Marlborough. Not a single value |
| 2.10 | Click **Explore Marlborough →** | Navigates to `/regions/marlborough` and that page loads |
| 2.11 | Click a zone with no frost (**Auckland / Northland**) | Card renders; frost days ~0. It must not show a blank or NaN |
| 2.12 | Click **Waitaki** (24 cells, 56 ha) | Card still renders. Note whether the small sample feels overstated — a confidence caveat may be needed |
| 2.13 | Close the card (×) | Card dismisses, map still interactive |

### 2.14 — MOBILE, and this one is load-bearing
**Tap a zone polygon on a real touch device.** MapboxDraw suppresses tap→click,
so this is bridged through `touchend` with an 8 px drag guard. Verify:
- a **tap** opens the card;
- a **drag/pan** does **not** open it;
- the "Explore →" button is comfortably tappable (44 px).

If tapping does nothing, the touch bridge is not firing — that is the single most
likely failure on this sheet.

---

## 3. Zone numbers (spot-check the science)

Open `/regions/:slug` or query the API directly.

```
curl "https://api.auxein.co.nz/api/v1/surfaces/zones/marlborough/season?metrics=gdd10,rain,rx1day"
curl "https://api.auxein.co.nz/api/v1/surfaces/region?zone_id=<id>&variables=temp_mean&start=2022-09&end=2023-04&granularity=monthly"
```

| # | Test | Expect |
|---|---|---|
| 3.1 | GDD ordering across zones | Northland ~1848 highest, **Gibbston ~903 lowest**. Gibbston must be the coldest Central Otago sub-zone |
| 3.2 | Bannockburn / Bendigo vs Gibbston | Bannockburn and Bendigo **warmer** (~13.9/14.0 vs 13.1) |
| 3.3 | Gimblett Bridge Pa vs Hawkes Bay | Gimblett **warmer** than the HB average |
| 3.4 | Lower Wairau vs Awatere | Lower Wairau ~0.7 °C warmer |
| 3.5 | Season count on any zone | **37 seasons, 1987–2023** |
| 3.6 | `rx1day` for vintage **1988, Gisborne** | Elevated — this is **Cyclone Bola** |
| 3.7 | `rx1day` for vintage **2023, Auckland** | Elevated — Auckland Anniversary flood |
| 3.8 | `weighting=area` on `/region` | **422**, not a silent fallback |
| 3.9 | `granularity=daily` on `/region` | **422** — the zone archive is monthly |
| 3.10 | Any zone response `meta` | Says `weighting: blocks`, `extent: planted cells only`, and warns that zones overlap |

---

## 4. Regression — things that must not have broken

| # | Test | Expect |
|---|---|---|
| 4.1 | Home page loads signed out | National pulse strip, mini map, articles rail |
| 4.2 | SSO from Grow (`/#insights_sso=…`) | Still lands and signs in — the hash is read **before** routing |
| 4.3 | `/articles/:slug` and `/research/:slug` | Unchanged paths (they are RSS guids) |
| 4.4 | An article with an embedded climate widget | Still renders — the DB path is frozen, not migrated |
| 4.5 | `/regions` and `/regions/:slug` | Load; explorers gated behind registration but **h1 + description visible signed out** |
| 4.6 | Old deep link `/?view=X&zone=Y` | Redirects to `/regions/:slug?view=X` |
| 4.7 | A mistyped URL | Real 404 page, not a redirect to `/` |
| 4.8 | `insights.auxein.co.nz/sitemap.xml` | **Many URLs including every region**, not the one-URL 2026-02-17 stub |
| 4.9 | View source on an article | `<link rel="canonical">` points at **the article**, not the homepage |
| 4.10 | **Grow: assign a block to a company** | Works. This is the blockchain-drop casualty — verify after 0.1 |

---

## 5. Known-and-accepted (do not raise as bugs)

- **Waipara and North Canterbury show near-identical numbers.** Waipara is
  essentially all of North Canterbury's planting. Correct, but it will look like
  a duplicate in a list.
- **Zones nest and overlap** — Marlborough contains Lower Wairau, Awatere and
  Upper Wairau. Never sum across zones.
- **`max_dry_spell_within_month`** truncates a dry spell at a month boundary. The
  dailies were never written; unfixable without re-running the history.
- **Frost is the least trustworthy metric.** Per-region CV found a warm bias in
  the frost valleys (Upper Wairau −0.97 °C), so `frost_days` reads **low exactly
  where frost matters most**. A disclosure item, not a bug.
- The **archive is not clipped**; measured range −17.6…+22.6 °C with no blow-ups.
- Ramp domains for temp_min/max/rainfall came from a reduced-resolution 38-month
  sample (temp_mean had a full scan).

---

## 6. Decisions still open (block launch, not testing)

1. **r99p baseline** — 1986-2005 (used now, stamped per row) vs 1987-2006
   (`SeasonExtremesBaseline`). Affects r99p only.
2. **`/map`'s sign-in wall** — still gated, still dead-ends the home hero, still
   contradicts "one surface load then a prompt".
3. **Disclose or correct** the unclipped archive and the frost warm bias.
4. `solar_rad` never run; per-region cv_rmse owes three variables.
