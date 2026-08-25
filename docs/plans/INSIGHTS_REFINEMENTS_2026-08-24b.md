# Home, explorer and projections — refinement pass

Plan written 2026-08-24 from Pete's list, after the country/industry work and
the 2023 history fix. Everything below was verified against prod, not recalled.

Predecessor: `COUNTRY_INDUSTRY_REGIONS_2026-08-24.md`.

---

## 1. "How would an Australian context appear — `/aus/`?"

**It would be `/au/wine/`, not `/aus/`.** The URL grammar settled on 08-24 is
`/{country}/{industry}/{region}`, and the country segment is the **ISO2** code,
matched case-insensitively against `countries.iso2`:

    /nz/wine                /nz/wine/marlborough
    /au/wine                /au/wine/barossa

`/aus/wine` 404s today, because `resolve()` only matches iso2.

**Change proposed:** accept **ISO3 as an alias** and redirect it to the ISO2
form. People will type `/aus/`, and a 404 on a guessable URL is a worse outcome
than a redirect. It stays one canonical URL for search — the alias 301s rather
than serving a duplicate.

Australia already exists in `countries` (`AU`/`AUS`, Southern Hemisphere,
vintage month 7, `is_active = false`) and already renders a coherent
"coming soon" page: the map returns `available: false` with a reason, the zone
lists return empty, and the country switcher stays hidden until a second country
goes active. So `/au/wine` works *now* — it just has nothing to show.

## 2. Hero: the three weather stats are too tall

They are stacked in a single column at `grid-template-columns: 1fr`, so three
tiles make the middle column the tallest of the three. Make them **square and
side by side in one row**, which is also what "three columns of even
proportion" needs.

## 3. The region map needs to zoom "a bit, not too far"

Add bounded zoom + pan to `RegionMap`. Constraints:
- **Cap it.** The geometry is simplified to ~2 km; past roughly 3x the coastline
  visibly polygonises. Max scale 3, min 1 (never zoom out past the country).
- Pan must be clamped so the country cannot be dragged off screen.
- It must not break the links: a drag has to be distinguishable from a click, or
  every pan navigates.
- Wheel-zoom must not hijack page scroll — ctrl/⌘+wheel or the buttons only.

## 4. Drop "frost nights" from the overview

Pete: frost nights and spring frosts are essentially the same, both being
growing-season gated.

**Measured, and he is right for most of the country** — correlation **0.970**
across 920 zone-seasons, national means 3.88 vs 3.07 nights, a gap of 0.81.

One nuance worth recording rather than acting on: in the coldest inland zones
the gap is real — Bendigo 13.5 vs 9.9, Central Otago 13.2 vs 9.7, so about a
quarter of their growing-season frost falls outside spring. That residue is
autumn frost, which matters far less than a frost at budburst or flowering. So
keeping **spring frost** and dropping the total is the right editorial call as
well as the tidier one.

## 5. Climate explorer: drop three views

`VIEW_ORDER` is `['currentseason', 'phenology', 'disease', 'seasons',
'projections']`. The first three are now on the overview, so the explorer keeps
**climate history and projections** only.

Care needed:
- `VIEW_ALIASES` in `RegionDetail` maps `?view=` to these ids. Removed views
  must resolve to the overview rather than 404 — those links are live in sent
  email and in article widgets.
- `PublicClimateContainer` lazy-imports all five; the dropped three should stop
  being imported, or they stay in the bundle for nothing.
- `WinterHoldingPage` and the `seasonGated` flags exist for the season views —
  check what is left referring to them.

## 6. Climate history: point at the surface-derived data

Today `/zones/{slug}/history` reads `climate_history_monthly` and
`/zones/{slug}/seasons` reads `climate_zone_season_stats` — both stop at 2023.
The equivalents run to 2026 after this morning's re-run.

Field-by-field, the surfaces carry everything the explorer renders:

| explorer needs | old | surface source |
|---|---|---|
| monthly tmean/tmin/tmax | `climate_history_monthly` | `climate_zone_surface_monthly` `temp_*`/`mean` |
| monthly gdd | `gdd_mean` | `temp_mean`/`gdd10` |
| monthly rain | `rain_mean` | `rainfall`/`sum` |
| monthly rx1day, frost | `rx1day_mean`, `frost_days_mean` | `rainfall`/`max`, `temp_min`/`frost_days` |
| season totals + extremes | `climate_zone_season_stats` | `climate_zone_surface_season` |
| **solar** | `solar_mean` | **not carried** |

**Solar is the only loss, and the explorer does not render it** — grepped, zero
references. It is dropped rather than kept from a stale table.

Same level of detail, current to 2026, and the old tables become retirable.

## 7. Projection surfaces — they landed, so use them

`surface_projection_run`: **576 rows, 500 m, `mfe2024-ccam-mmm-v1`**, baseline
**1986-2005** — which is exactly the Pro/region baseline, so no rebasing.
Composed onto our own normals, not MfE's:

> "MfE 2024 New Zealand climate projections (CMIP6 downscaled with CCAM,
> multi-model mean), © Ministry for the Environment, licensed CC BY 4.0;
> composed onto Auxein tps-2.0.0-ridge 1986-2005 normals"

| axis | values |
|---|---|
| scenario | ssp126, ssp245, ssp370 |
| period | fp2021-2040, fp2041-2060, fp2080-2099, wl1.5, wl2, wl3 |
| season | ANN, DJF, MAM, JJA, SON, **SEPAPR** |
| variable/statistic | gdd10/cumulative, rainfall/sum, temp_mean/mean, temp_min/{mean,frost_days}, temp_max/{mean,days_over_25,days_over_30} |
| rule | additive, multiplicative, season_resolved |

**`SEPAPR` is the headline.** The recon note said MfE's GDD10 was annual-only
with no seasonal arm, which was the blocker on composing it with our Sep-Apr
season. It has been resolved — `gdd10/cumulative` exists at `SEPAPR`, national
median **697 → 961 GDD (+261)** under ssp245 mid-century.

### What has to be built

The rows carry **national** medians. A region needs the raster sampled through
its own planted-cell mask, exactly as `aggregate_zone_monthly` does:

1. Sync the 576 COGs (**1,026 MB**) into the mirror.
2. `aggregate_zone_projection.py` — windowed reads per zone, weighted by planted
   hectares, writing a new `climate_zone_projection` table.
3. Repoint the dashboard's projections block off `climate_projections` (the old
   zone table) onto it.

The old `climate_projections` stays until the new path is proven, then is
retirable alongside the history tables.

### Why prefer SEPAPR over ANN

Ours is a growing-season product. An annual mean folds in a winter warming
signal nobody plans against, and it is not comparable to anything else on the
page. Where a variable has SEPAPR, use it; fall back to ANN and **say so**.

---

## Order of work

Cheap and self-contained first, so the risky one lands last:

1. ISO3 alias (§1)
2. Hero stats square, one row (§2)
3. Map zoom (§3)
4. Drop frost nights (§4)
5. Trim the explorer (§5)
6. Repoint history to surfaces (§6)
7. Projection surfaces (§7) — sync, aggregate, wire


---

# DELIVERED — 2026-08-24

**143 checks green** across four suites (region-dashboard 50, region-map 23,
country-industry 47, scoped-urls 23). Nothing committed, nothing deployed,
nothing in a browser.

| § | done |
|---|---|
| 1 | ISO3 accepted as an alias; `/aus/wine` resolves and **redirects** to `/au/wine` |
| 2 | Three square stat tiles on one row in the hero's middle column |
| 3 | Bounded zoom + pan on the region map, 1x–3x |
| 4 | Frost nights dropped from the overview; spring frost kept |
| 5 | Explorer trimmed to climate history + projections |
| 6 | Both history endpoints repointed at the surfaces — **now 1986–2026** |
| 7 | Per-zone projections from the 500 m MfE surfaces — new table, 13,248 rows |

## Migrations applied

`country_map_outline` → `history_surface_view` → **`merge_qc_and_map`** →
`zone_projection_table`.

### The branch, and why there is a merge revision

`SELECT version_num` returned **two rows**. Two sessions had branched off
`surface_projection_run` within hours:

    surface_projection_run
    ├── country_map_outline -> history_surface_view   (this work)
    └── weather_daily_qc                              (ingest/QC)

Both applied cleanly and the DDL is independent, so nothing was broken — but two
heads means the next `upgrade head` is ambiguous and `revision --autogenerate`
refuses to run, and it lands on whoever adds the next migration rather than on
whoever caused it. `merge_qc_and_map` is a no-DDL merge that collapses them.
Single head restored.

It also broke the ancestry check in `check_country_industry.py`, which walked
`down_revision` as a chain and read a merge's TUPLE as one revision id. Now a
breadth-first walk over both parents.

## §6 — the history repoint, done as a view

Rather than rewriting ~100 lines of ORM across two endpoints, the migration adds
**`climate_history_monthly_surface`**: a view over `climate_zone_surface_monthly`
pivoted into the exact column shape of `climate_history_monthly`. Both endpoints
swapped one model reference and kept every filter, group and sum — which is what
makes "the same level of detail" a checkable claim.

Verified on Marlborough: history **1986→2026** (487 rows), seasons **1987→2026**
(39, up from 37). Values agree closely with the old table where they overlap —
Jan 2023 tmean 17.52 vs 17.66, GDD 233.0 vs 237.6.

Two deliberate differences, both documented in the migration:
- **solar is NULL.** The surfaces do not carry it and nothing renders it. A 2023
  value in a 2026 row would be worse than an absent one.
- **`sd` is derived** as `(p90 - p10) / 2.5631`. The old `sd` was spatial; the
  roll-up stores percentiles instead. Fair for symmetric fields, understates the
  upper tail for rainfall and frost. The real spread is exposed as `*_p10`/`*_p90`.

## §7 — projections, and they are better than expected

`surface_projection_run` holds **576 surfaces at 500 m**, `mfe2024-ccam-mmm-v1`,
already composed onto our own 1986-2005 normals — so the baseline needs no
rebasing and the rasters are on our exact grid, meaning the existing zone mask
applied unchanged.

**`SEPAPR` exists for gdd10.** The recon had flagged MfE's GDD10 as annual-only
with no seasonal arm, which was the blocker on composing it with a Sep-Apr
season. It has been resolved upstream.

`aggregate_zone_projection.py` samples all 576 through each zone's planted-cell
mask — same mask, weighting and estimator as the history — into
`climate_zone_projection`: **13,248 rows**, 23 zones, 3 scenarios, 6 periods
(including the three warming levels, stored though nothing shows them yet).

The delta is `projected − our own zone baseline`, never
`surface_projection_run.baseline_median`, which is a NATIONAL median and the
wrong baseline for any single region.

Sign checks across all 368 zone-scenario-period combinations: temperature up
368/368, frost down 368/368, GDD up 368/368, rainfall mixed — which is what MfE
projects (drying east, wetting west). Marlborough mid-century ssp245: GDD
1153 → 1468, frost 22.4 → 10.8 nights, days over 25 26 → 47.

Only gdd10 has a growing-season arm, so the other four bands fall back to ANN
and **each headline names its own season** — an annual frost count and a
growing-season one are different claims about the same region. CC BY 4.0
attribution travels in the payload.

## §4 — the frost measurement

Pete's claim checked out: correlation **0.970** over 920 zone-seasons, national
means 3.88 vs 3.07. The residue is concentrated inland (Bendigo 13.5 vs 9.9) and
is autumn frost, which matters far less than frost at budburst — so dropping the
total and keeping spring is the better editorial call, not merely the tidier one.

## Still open

- `aggregate_zone_season.py:69` hardcodes `FIRST_VINTAGE, LAST_VINTAGE = 1987,
  2023` as its default range. It will go stale again — derive it.
- `insights_site_service.py:57 LAST_VINTAGE = 2023` still caps the Pro record,
  and needs the site re-population alongside it.
- `climate_history_monthly`, `climate_zone_season_stats` and
  `climate_projections` are now all superseded but still present. Retirable once
  this has been in a browser.

---

# SECOND PASS — 2026-08-24

**165 checks green** across five suites (climate-history 22, region-dashboard 50,
region-map 23, country-industry 47, scoped-urls 23). New suite:
`check_climate_history.py`.

## The three real bugs

**Vintage 2024 was hardcoded out of existence.** `EXCLUDED_VINTAGE_YEARS =
[1986, 2024]`. 2024 was excluded when the archive stopped part-way through it;
the season has all eight months across all 23 zones and has for a while. The
constant was hiding a complete season. Now `[1986]` only — and 1986 stays,
because it needs Sep-Dec 1985 and is impossible rather than merely unpublished.

**Frost, spring frost, hot days and extreme rain vanished after 2023.** The
season row was half repointed: totals came from the current surface view,
extremes still came from `climate_zone_season_stats`, which is frozen at 2023
and 100% `source='modelled'`. So a post-2023 row rendered with a GDD total and
four holes. `build_season_extremes` now reads `climate_zone_surface_season`,
which carries all four for **1987..2026**. Last-frost also became a real date
("28-Oct") instead of a day-of-year float.

**Ctrl+wheel zoom never fired.** React attaches `wheel` at the root as a
PASSIVE listener, so `preventDefault()` inside a React `onWheel` is a no-op —
the map zoomed *and* the page scrolled. Rebound as a direct listener with
`{ passive: false }`.

## The map overlaying the page

`.regionmap__svg` carried `overflow: visible`, set so edge labels were not
trimmed. Harmless until zoom arrived, at which point the country drew straight
over the rest of the page. Now `overflow: hidden` on both the SVG and the card.
Edge labels clip; that is the correct trade.

## "Coldest → lower-wairau" was not a bug

The coldest station right now is **Blenheim Bowling Club**, which really is in
the Lower Wairau sub-zone. It read as wrong because the compact tile CSS hid
`.pulse-tile__detail` — the station name. Showing it removes the mystery.

## Home tiles

Station name restored (two-line clamp, full name on `title` — station names run
to "Omaka at Ramshead Saddle"). Icon and label share a line. The word "now" is
stripped from the server's labels client-side and replaced with a **live dot**;
"Wettest 24h" keeps its qualifier because that one is a window, not an instant.
The timestamp is dropped at square size — the dot carries it.

## Explore page

Region tiles became **pills**. 23 tiles ran four rows deep and pushed most of
the choices below the fold, so picking a region meant scrolling past the
options. Still real `<Link>`s, still grouped by parent region, still marking
regions without live data. 36px rather than the usual 44px minimum: they sit in
a dense wrapped field, and every one is also in the 48px dropdown above.

## GDD projections are cumulative

`sortedMonthly` is already in growing-season order, so a running sum over it is
the season curve. Only GDD — temperature is a level and cannot be accumulated,
and rainfall's monthly pattern is what a grower reads it for. Axis and legend
both say "cumulative", because the same chart with a monthly axis label would
read as a single month topping 1,400 GDD.

## Explorer styling — a targeted pass, NOT a retheme

`PublicClimate.css` is **2,944 lines with 242 hardcoded hex and 21 tokens**.
Rewriting it blind would be a large unverifiable change. `climate-explorer-
tighten.css` instead restates what makes the explorers look like a different
product — the card frame, the spacing, the tab strip, tables, stat cards and the
leftover Tailwind greys and blues — in tokens, loaded after the originals and
before the mobile guardrails, which keep their "must stay LAST" invariant.

**The remaining hex is in states this sheet does not reach** — hover variants,
chart-internal colours, a few gradients. That wants a proper pass with the page
open.


---

# THIRD PASS — 2026-08-24, end of session

**405 checks green across nine suites.** Nothing committed, nothing in a
browser.

## Explorer
- Monthly **GDD is cumulative**, baseline accumulated with it, axis relabelled.
  **No band on the cumulative line**: that `sd` is the SPATIAL spread across
  cells and accumulating it needs a correlation assumption we cannot justify
  (sum if perfectly correlated, root-sum-square if independent, truth between).
  The overview's across-year band is the one to trust.
- **The explorer's own zone picker is gone.** The region page already carries
  one, so it was rendering a second picker for the same choice.
- **Regional comparison mothballed at its entry point** — picker removed,
  `comparisonZones` frozen to `[]`, zone-compare mode button removed. The
  branches inside SeasonExplorer are unreachable rather than deleted.

## The Pro 2023 ceiling — LIFTED
`insights_site_service.LAST_VINTAGE = 2023` became `last_vintage(db)`, derived
from `surface_run`. Re-populated site 16:

    seasons  1987-2023  ->  1987-2026
    monthly  1986-2023  ->  1986-2026

so the month-by-month LTA deviation reaches the current season.
`aggregate_zone_season`'s default bound was lifted too.

## Four suites had hardcoded spans, all stale the same way
The alembic head, the 2023 history ceiling, "37 vintages", "456 months". Each
was written when its number was true and each failed the moment the archive
moved. **All now derived. Never assert a constant the archive can move.**

## Daily surfaces are LIVE
`surface_run` has 92 rows at `granularity='daily'` from 2026-08-01 — the live
pipeline has come online. `check_site_daily` had asserted that **none existed**,
which is only ever right until someone fills it; both such assertions were
rewritten to test the BEHAVIOUR (an empty window is reported, not raised) rather
than the absence. `populate_daily` wrote 8 real days for the demo site.

**The Pro daily panel has data for the first time**, and from 1 September it
accumulates through the season.

## Also found
`temp_mean_monthly_200604_500m_max.tif` is corrupt — `TIFFReadEncodedTile`
fails. Site extraction warns and continues; the object wants re-publishing.

## Next
`docs/plans/INSIGHTS_PRO_ROADMAP_2026-08-24.md`.
