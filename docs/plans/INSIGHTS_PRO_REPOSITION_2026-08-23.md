# Insights Pro — repositioning the site page around the current season

> **STATUS 2026-08-23: PARKED, deliberately.** Pete is completing the
> interpolation engine; this resumes when that lands, because §2 of this plan is
> gated on it — there is no daily surface, and two of the four requested trackers
> have no recent site history until the temperature era is re-run with the offset
> applied to daily values. **Do not start §4 Phase 1 before then.**
>
> Work continuing in the meantime is in §6.

**Drafted 2026-08-23. A plan, not a spec — three decisions below are Pete's and
nothing should be built until they are taken.**

Ground truth was checked against prod on 2026-08-23. Every row count and every
date below came out of the RDS instance or `surface_run`, not from a doc.

---

## 1. The page being asked for

Top to bottom:

| # | Section | Change |
|---|---|---|
| 1 | **Hero** | Absorbs "What this site usually does". The climatology stops being its own section. |
| 2 | **Current season trackers** | GDD10, rainfall, frost nights, hot days. Each against the site's own normal **and** the regional tracker. Updates daily. |
| 3 | **Season picker** | A grid of vintage pills. Picking one re-renders the same four trackers for that season, site and region. Replaces "previous season". |
| 4 | **Models** | Phenology + disease. Unchanged. |
| 5 | **Projections** | Unchanged (still the placeholder pending projection surfaces). |
| 6 | **Season-by-season + month-by-month charts** | Kept. The season pills anchor here. |

Cadence requirement: the season trackers update **daily**, the monthly chart
updates **monthly**.

---

## 2. What the data can actually support today

### 2.1 There is no daily surface. None.

`surface_run` holds **zero rows** at `granularity='daily'`. `insights_site_daily`
is **empty**. The whole current-season panel built on 2026-08-21 is therefore
inert by construction, and will stay inert until the live surface engine
(`LIVE_SURFACE_ENGINE_2026-08-20.md`) ships, publishes and indexes.

The **regional** half of every tracker works today and is genuinely daily:

    climate_zone_daily   2025-09-01 .. 2026-08-21, 14 of 23 zones
    Waipara              354 rows, written 05:18 UTC the following morning

Two ways to get the site half. **DECISION 1.**

* **A1 — wait for the daily surface.** Correct by construction; the trackers ship
  empty and turn on later.
* **A2 — interim: rescale the regional daily series to the site.** Take
  `climate_zone_daily` and apply the site's own per-month offsets — the exact
  `month_adjustments` machinery `insights_site_baseline.build` already uses to
  build the baseline curve (additive for temperature, ratio for rain). Ships now,
  updates daily, and every number is honestly a regional shape at the site's own
  level.

  Recommended, with a `source` field on every daily point
  (`"surface" | "regional_rescaled"`) so the page captions itself and the swap to
  real daily surfaces is a source change, not a rewrite.

  Note `climate_zone_daily.gdd_daily` is **base 0** — it equals `temp_mean` (21
  Aug: tmean 3.20, gdd_daily 3.20) and `gdd_cumulative` is its running sum on a
  **July–June** vintage. Neither can be used directly for a Sep–Apr GDD10 season.
  Compute `greatest(0, temp_mean - 10)` per day, as `LIVE_METRICS` already does.

### 2.2 The record ends 2023-12 for two reasons, and only one is about data

1. **`FIRST_VINTAGE, LAST_VINTAGE = 1987, 2023` is hardcoded**
   (`insights_site_service.py:57`). `derive_season` loops `range(1987, 2024)`
   whatever the surfaces hold.
2. Fancrest was populated **2026-08-19**, two days before the 08-21 publish.

`extract_monthly` has no date bound, so lifting the constant and re-populating is
most of the fix. What the surfaces now carry:

| band | published to |
|---|---|
| `temp_mean/min/max` mean, sd, min, max, median | **2026-07** |
| `rainfall` sum, wet_days, max, max_dry_spell, days_over_10/25mm | **2026-07** |
| **`temp_min/frost_days`, `last_frost_day`, `first_frost_day`** | **2024-09** |
| **`temp_max/days_over_25`, `days_over_30`** | **2024-09** |

The threshold bands have **no `tps-2.0.0-ridge-db-adj` rows at all** — that is
WS2's known "you cannot apply a temperature offset to a day count" gap.

So after lifting the constant and re-populating:

    GDD10, tmean, tmin, tmax, rain, wet days, dry spell, rx1day  ->  vintage 2026
    frost nights, days over 25, days over 30                     ->  vintage 2024

`derive_season.total()` returns `None` on a partial season, so vintages 2025 and
2026 come back **NULL rather than wrong** for frost and hot days. It fails safe.

**But two of the four requested trackers would have no site history for the two
most recent seasons.** Unblocking that is WS2's Monday job — apply the era offset
to daily values inside `run_history.py`, before the monthly accumulators reduce
them, then republish 2024-10..2026-07 and re-index.

### 2.3 The regional side stops in 2023 as well

    climate_zone_surface_monthly   198601 .. 202312
    climate_zone_surface_season    1987   .. 2023

The zone aggregation job has **not** been re-run against the extended archive. If
the site is re-populated to 2026 and the zone is not, the season chart's regional
band and the tiles' regional comparison go blank for exactly the three new
seasons — the page would look like it lost data by gaining it.

**The zone re-run ships with the site re-population, not after it.**

### 2.4 What resolution each vintage can have

This constrains the pill design more than anything else.

| vintage | site series | regional series |
|---|---|---|
| 1987–2025 | monthly only | monthly only |
| 2026 | monthly only | **daily** (`climate_zone_daily` from 2025-09-01) |
| 2027 (current) | daily *if* A2 or the surface engine | **daily** |

There are no daily surfaces anywhere in the archive, so a historic season can
never have a daily curve at the site. **The pills give monthly-resolution history
and daily-resolution only for the current season** (and the regional half of
2026). A pill grid that renders a daily cumulative curve for 2027 and a monthly
step chart for 1998 is honest; one that renders the same chart shape for both is
not. **DECISION 3.**

---

## 3. Fold the audit fix in here

The 2026-08-23 audit found the same site metric carrying two different normals:

| metric | tile (counted) | current-season panel (modelled) | gap |
|---|---|---|---|
| gdd10 | 1,040.88 | 1,050.49 | +0.9% |
| rain | 421.44 | 425.75 | +1.0% |
| hot_days_25 | 36.11 | 34.94 | −3.2% |
| **frost_days** | **3.84** | **6.00** | **+56.1%** |

The reposition merges those two sections, so it forces the choice rather than
letting both numbers sit on one page. **DECISION 2.**

Frost detail — the modelled side sums `P(tmin<0)` with the **zone's** day-of-
vintage tmin sd (~3.3 °C) against the site's shifted mean:

    month   counted  modelled
    9         2.850     3.126
    10        0.500     1.065
    11        0.050     0.500
    12–3      0.000     0.358    <- months that have never recorded a frost
    4         0.350     0.949
    TOTAL     3.750     5.998

Two failure modes: Gaussian tail leakage into frost-free months, and
overstatement on the shoulders where the mean sits near the threshold. The
comment in `insights_site_baseline.build` justifies the zone sd because "assuming
a narrower one would understate frost risk" — measured, it **overstates by 56%**.

Options: use the counted seasonal normal for the tracker line; or calibrate the
daily probability so its Sep–Apr sum reproduces the counted normal and floor the
tail where the counted month normal is zero. The second keeps a daily curve,
which the trackers need, so it is the one that fits this design.

Also fold in: **`site_month_normal` filters `year BETWEEN 1986 AND 2005`
(calendar) while `insights_site_season` filters `vintage_year`** — the two site
normals average different sets of seasons under one "1986-2005" label. Align them
on vintage.

---

## 4. Build order

Nothing here is frontend-first; the page cannot be laid out honestly until it is
known what each panel can hold.

**Phase 0 — unblock the record** (backend, no UI)
1. Replace `FIRST_VINTAGE/LAST_VINTAGE` with bounds derived from `surface_run`.
2. Pin `extract_monthly` to a model_version set per era. It currently has no
   `model_version` filter; the eras happen not to overlap today, and a re-fit
   that overlapped would silently mix them into one series.
3. Re-run the zone aggregation to 2026-07.
4. Re-populate every ready site. Assert the new spans, and assert frost/hot stop
   at 2024 **by design** rather than by accident.

**Phase 1 — the daily site series** (backend)
Per DECISION 1. Either `populate_site_daily.py` against real surfaces, or the
rescaled regional series behind the same `insights_site_daily` table and the same
`source` field. Scheduled daily; `--require-surfaces` on every scheduled run.

**Phase 2 — one season endpoint, parameterised by vintage** (backend)
The current split of `season_current` / `season_previous` becomes
`GET /sites/{id}/season/{vintage}` returning one shape for any vintage, plus a
`GET /sites/{id}/seasons` index for the pill grid (which vintages exist, what
resolution each has, which metrics are present). The pills need the index to know
what to grey out — a pill that renders an empty panel is worse than no pill.

**Phase 3 — the page** (frontend)
Hero absorbs the climatology; trackers; pill grid; charts anchored to the pill.
`dash["season_to_date"]` is already gone; `season_current`/`season_previous` go
too, so anything reading them breaks — they are two days old and unshipped, so
the blast radius is this repo only.

**Phase 4 — cadence**
Daily site extraction, and a monthly refresh of `extract_monthly` +
`derive_season` + the zone job. The monthly trigger should be **"a new monthly
`surface_run` row appeared"**, not a calendar date — the surface publish is
manual and a 1st-of-the-month cron would routinely run against nothing and
report success.

---

## 5. Decisions needed before any of this is built

1. **Daily site series** — wait for the surface engine (A1), or ship the rescaled
   regional series now (A2)?
2. **Frost normal** — counted, or calibrated daily probability?
3. **Historic pills** — monthly step chart for pre-2026 vintages and a daily curve
   only for the current one, or seasonal totals only for everything historic?

And one to be aware of rather than decide: **frost and hot days at the site have
no 2025 or 2026 history until WS2 re-runs the temperature era with the offset
applied to daily values.** Two of the four trackers are gated on another
workstream's Monday job.

---

## 6. What runs while this is parked

Three items, none of which touch the surfaces or the interpolation engine, so
all three are safe to build against the paused Pro work. Ordered by how much
damage they are doing right now.

### 6.1 Stale season widgets in published articles — FIXED 2026-08-23, 50/50 green

**Audited 2026-08-23 against prod. 18 articles, 11 of them carrying live
current-season widgets that have followed the season past what the article says.**

Widgets embed via `ClimateWidgetRenderer` and carry an `isStatic` +
`snapshotData` pair. Where a snapshot was saved, the widget froze correctly and
is fine. Where it was not, the widget re-fetches **the current season** on every
page view, with **no vintage pinned anywhere in the attrs** (`vintages: None` on
every one of them).

| article | published | live widgets | what it now renders |
|---|---|---|---|
| 4 Waipara Week ending 27 Feb 2026 | 2026-02-27 | `gdd_progress` captioned **"2025 - 2026 Season GDD"** | the 2027 season |
| 5 Awatere, 6 Lower Wairau | 2026-02-27 | same, + a live `current_season_summary` on 6 | 2027 |
| 7 Waipara Week ending 6 Mar | 2026-03-06 | `gdd_progress` captioned **"2026 Season GDD"**, live summary | 2027 |
| 8, 9, 10, 11 (4 regions) | 2026-03-13 | `gdd_progress` + `disease_pressure` + `current_season_summary`, all live | 2027 |
| **12 End of Season Wrap** | 2026-03-27 | **5 live widgets across 4 zones** | a wrap-up of 2026 showing 2027 |

24 live current-season widgets in total. Under Sep–Apr the 2027 season **has not
started**, so these render empty or near-zero under a heading naming a finished
season.

Not affected, and worth knowing so the fix does not over-reach:

* **Article 14** pins `vintages: "2020,2015,2010,2005"` explicitly. Safe. This is
  the pattern that already works.
* **Articles 16 and 19** — `historical_trend`, `projection_outlook`,
  `region_trend_compare`. Long-run trends; they gain a year and stay correct.
* **Articles 1, 2, 13, 15, 17, 18** carry no widgets at all.

**The fix is a default change, not a data migration.** Today an unpinned widget
resolves the vintage at *read* time. It should resolve it at the article's
`published_at` — "the season this article was written in" — which corrects all 24
in one change with no backfill and no editorial pass. Keep `snapshotData` as the
freeze-forever option, because D13 retires `zone_aggregation` and these articles
are the long pole for that ([[project_insights_ws3_state]] §2).

Then, separately: `gdd_progress` on article 12 points at **bendigo** while the
other four widgets in that article point at Hawke's Bay, Lower Wairau, Awatere
and Waipara. Probably an editing slip rather than a bug — confirm with Pete
before touching it.

#### Shipped 2026-08-23

`as_of` added to `/current-season`, `/gdd-progress` and `/disease-pressure`;
`ClimateWidgetRenderer` gained an `asOf` prop; `ArticleDetail` passes
`article.published_at` and `AdminArticleEditor` passes `form.published_at`, so
the author's preview matches the reader's page.

**Pinning the vintage alone was not enough.** It would have drawn the whole
finished season under a heading written mid-season, so `as_of` truncates the data
as well — both halves, or the fix is cosmetic.

`disease_pressure` takes `as_of` and **no vintage**, deliberately: it is a rolling
window of recent days, not a season, so "which season" is the wrong question.

`AS_OF_WIDGETS` is the pinned set. `historical_trend`, `region_trend_compare*` and
`projection_outlook` are deliberately excluded — they are long-run series that
should gain a year, and freezing them would make an article about long-term
trends go stale on purpose.

Pinned widgets caption themselves "As at 27 February 2026". Without it a pinned
widget is indistinguishable from a broken one — the season stops partway and the
reader has no reason why.

Verified: `backend/scripts/check_article_widget_pinning.py`, **50/50**, against
the real articles. Waipara at 2026-02-27 now returns **180 days and 878.8 GDD**
of the 2025-26 season where it previously returned **51 days** of vintage 2027.
Defaults are asserted unchanged, and an `as_of` before the record 404s rather
than rendering an empty chart.

### 6.2 Article CSS is not on the theme at all — DONE 2026-08-23

Measured, not estimated:

| file | lines | `var(--…)` uses | hardcoded hex |
|---|---|---|---|
| `pages/ArticleDetail.css` | — | **0** | 57 |
| `pages/ArticlesPage.css` | — | **0** | 20 |
| `components/SiteBanner.css` | 332 | **0** | 19 |

Ninety-six hardcoded colours across three files and **not one theme token**,
while `index.css` has defined `--primary --olive --terracotta --charcoal --text
--card-bg` and the whole `--font-xs … --font-3xl` scale since the rebuild.

The visible consequence is not just drift: the articles and the banner are keyed
to `#5B6830` (`--olive`) while the rebuilt nav, region card and Pro card are keyed
to `#446145` (`--primary`). **They are literally a different green from the rest
of the site.** Font sizes are hardcoded px against a rem scale, so they do not
respond to the type ramp either.

#### Shipped 2026-08-23 — and the brief above was wrong on one point

**Do NOT resolve `#5B6830` to `var(--primary)`.** That instruction came from
assuming the rebuilt chrome is `--primary`; it is not. `SiteHeader.css` — the
nav on every page — uses `#5B6830` eight times. The split is real and roughly
even:

    olive #5B6830   17 files   SiteHeader, Landingpage, PublicClimate,
                               ArticleShowcase, SurfaceMap, 4 Pro panels …
    --primary       18 files   Pro page, RegionLauncher, NationalPulse,
                               RegionDetail, RegionsPage, About, AccessGate …

Re-keying the banner to `--primary` would have made it disagree with the header
directly above it. **Which green is the theme is a brand decision, not a
mechanical one, and it is now a ONE-TOKEN change — which is the whole point of
tokenising first.**

So brand hues were mapped to the token holding that exact value and nothing
brand-coloured changed: `#5B6830 → var(--olive)`, `#D1583B → var(--terracotta)`.

**Result: 121 `var()` uses, zero hardcoded hex, every token resolving.** 90 colour
substitutions + 27 font-size substitutions.

New tokens in `index.css`, because there was nothing to swap onto — the theme had
no neutral scale, no link colour and no danger colour:

    --primary-hover --terracotta-hover     both already hand-copied into ~6 files
    --surface --surface-sunken             was #f9fafb / #fafafa / #f3f4f6
    --border --border-strong               was #e5e7eb / #d1d5db
    --text-muted --text-faint              was #6b7280 / #9ca3af
    --link --link-hover                    was Tailwind blue #2563eb / #1d4ed8
    --danger --danger-bg --danger-border   was #ef4444 / #fef2f2 / #fecaca

The neutrals are the **same lightnesses warmed** towards the cream/olive palette,
so the swap changes hue and not contrast.

Four things changed visibly, all deliberate:

1. **The article hero was a navy gradient** (`#1e3a5f → #2d5a87`) — neither the
   theme nor Tailwind. Now `--primary → --olive`.
2. **Prose links were Tailwind blue.** Now `--link`, which points at `--primary`.
3. **Blockquotes and tag chips were pale blue on blue text.** Now the same
   `rgba(68, 97, 69, 0.06)` tint the region and Pro cards use.
4. **The Pro badge was `#f59e0b` + white — about 2.6:1, failing.** Mapping it to
   `--accent` (#FFC107) made it ~1.9:1, worse. It is now `--terracotta` + white
   (~4.6:1, AA), which is also how Pro is marked on the Pro page and the home
   ProTeaser.

Deliberately left: **eleven off-scale font sizes** (0.7/0.8/0.95/1.05/1.1/1.25/
1.5/2.25rem, 15px, 20px). Only exact matches to the ramp were converted —
rounding the rest would resize live article headings, which is a typography pass
and not a token swap. The two px leftovers are in the banner and belong to 6.3,
where sizing is deliberately on the table.

### 6.3 Banners — more prominent, more professional, same size — DONE 2026-08-23

Constraint from Pete: **more prominent but NOT larger.** So every lever has to be
contrast, hierarchy or weight, never padding or type scale.

Current state: `#FDF6E3` cream on a white page, a 1px 20%-alpha olive border, one
undifferentiated 14px text run, and elevation only on hover. Low contrast against
white is most of why it recedes.

Levers, all size-neutral:

1. **A left accent rule keyed to banner type**, matching `.map-cta-card`'s
   `border-left: 4px solid` which is already the site's pattern for a
   call-out. Type colour comes from the token set — `--primary` for update,
   `--terracotta` for coming-soon.
2. **Raise contrast on the surface** rather than enlarging it — a deeper tint of
   the type colour instead of the flat cream, which currently reads as an empty
   card.
3. **Introduce hierarchy inside the existing height**: a small uppercase eyebrow
   carrying the banner type, then the message at current size. One text run at
   one weight is what makes it look like a notice rather than an announcement.
4. **Elevation at rest**, not only on hover — a hover-only shadow means the
   default state is the flat one.
5. Re-key the accent from `--olive` to `--primary` so it belongs to the same
   palette as the rest of the chrome (this is 6.2's change, arriving here).

Do 6.2 first: re-styling the banner before it is on tokens means doing the colour
work twice.


#### 6.3 shipped 2026-08-23

Every lever was contrast, hierarchy or weight. Padding, gap, icon size and the
mobile block are untouched.

1. **4px left accent rule** in the banner's type colour — olive for `update`,
   terracotta for `coming_soon`. Already the site's call-out pattern
   (`.map-cta-card`), and with the global `box-sizing: border-box` it costs
   nothing in height. `border-color` is restated before `border-left-color` in
   the `coming_soon` rule; reversing those two lines silently drops the accent.
2. **The icon chip goes solid** instead of an 8% wash. One small saturated block
   is what gives a flat card a focal point. White on olive ~5.9:1, on terracotta
   ~4.6:1.
3. **Elevation at rest**, not only on hover — a hover-only shadow means the state
   every reader actually sees is the flat one.
4. **Hierarchy rebalanced.** The title was bigger AND bolder AND coloured: three
   signals for one distinction, with the message smaller and greyer beneath it.
   Both are now `--font-base` and differ by weight and colour; the type is
   carried by the accent and the icon, which do it better than olive-on-cream.
5. **Carousel arrows** were a 20%-alpha ring on white — very nearly invisible, so
   the carousel read as static. Same 32px, a real edge and a resting shadow.

**The line-height is load-bearing.** A single-line banner is sized by the 32px
icon, but `-webkit-line-clamp: 2` lets a long message run to two lines and there
the card is sized by its text. Raising the message from 13px to 14px would have
grown a two-line banner ~3px, so line-height went 1.5 -> 1.4: **13 x 1.5 = 19.5px
per line, 14 x 1.4 = 19.6px.** A point larger at the same height in both cases.

Also added `--primary-rgb / --olive-rgb / --terracotta-rgb`, because
`rgba(91, 104, 48, 0.2)` cannot reference a token — alpha has to apply to
components — so every tinted border on the site was a hand-written triple that
would survive a change of brand colour and quietly disagree with it.
`rgb(var(--olive-rgb) / 0.28)` follows the decision.

`SiteBanner.css` is now fully on the ramp: **zero hex, zero px font sizes, zero
raw brand rgba, no bare `white`.** The last two px sizes were in the MODAL — a
dialog, not the banner — so the size constraint did not apply: its heading is
`--font-xl` and its body `--font-md`, which are proper reading sizes.


### 6.4 The theme green — DECIDED 2026-08-23: olive

Pete's call: **`#5B6830` is the theme green.** `--primary` now holds it and
`--olive` is an alias, so the two families resolve to one colour and the green
is changed in `index.css` and nowhere else.

**233 replacements across 37 files**, all value-preserving except the 18 files
that had been on `#446145` and are now olive:

    103  #5B6830              -> var(--primary)
     58  rgba(91, 104, 48, x) -> rgb(var(--primary-rgb) / x)
     54  rgba(68, 97, 69, x)  -> rgb(var(--primary-rgb) / x)
      9  #35502F              -> var(--primary-hover)
      7  '#5B6830' in JSX     -> 'var(--primary)'   (React inline styles only —
                                  checked, no Mapbox paint props, which do not
                                  accept var())
      2  #4A5628              -> var(--primary-hover)

`--primary-hover` is **#4A5628**, not a newly mixed shade: it is the darker olive
the landing page and the climate explorers already ended their gradients on, so
hover states and gradient depth now share one value instead of three.

Dropped `--primary-dark` and `--primary-light` — Material greens belonging to
neither palette, referenced by nothing, and exactly what the next person reaches
for by mistake.

#### Four things a blind sweep would have broken, found by checking first

1. **Four gradients ran `#446145 -> #5B6830`** (SiteHeader, Landingpage x2,
   ArticleDetail). Sweeping both ends to one token renders a flat block. Now
   `var(--primary) -> var(--primary-hover)`.
2. **`.view-all-btn:hover` was `#446145` over a `#5B6830` base** — a hover that
   would have stopped doing anything. Now `var(--primary-hover)`.
3. **`var(--primary, #446145)`** in PublicClimate carried a stale fallback.
4. Two `--ghost:hover` rules restate `color: var(--primary)` identically to their
   base. **Pre-existing and harmless** — those buttons change `background` and
   `border-color` on hover — but they are what a collapse would look like, so
   they are recorded here rather than re-investigated next time.

Verified: all **55 CSS files parse**, zero green literals outside `index.css`,
zero flat gradients, no hover collapsed onto its base. White on olive is ~5.9:1
against ~7.6:1 on the old `#446145` — lighter, still clear of AA.
