# Insights Pro — current season, frost, projections, models, markets

**Drafted 2026-08-21. Decisions taken 2026-08-21 — this is now a spec, not a proposal.**
Scope: the `/my-site` Pro page, plus a new free-but-signed-in Markets tab and its
home-page summary.

Ground truth was checked against prod on 2026-08-21. Where a fact carries a row
count, it came out of the RDS instance.

---

## 0. What already exists (do not rebuild)

| Thing | State in prod | Consequence |
|---|---|---|
| `climate_zone_daily_baseline` | 8,008 rows = **22 zones x 364 day_of_vintage**, **1986-2005 daily climatology** (`upload_baseline.py`) | The current-season baseline curve. No month pro-rating needed. |
| `climate_projections` | 2,484 rows = **23 zones x 3 SSP x 3 periods x 12 months** | Projections is a *wiring* job, not a data job |
| `climate_projection_extremes` | 189 rows, **21 of 23 zones** | frost / hot-days / r99p projections exist; 2 zones render empty |
| `climate_baseline_monthly` | 276 rows = 23 x 12, **1986-2005** | The baseline the SSP deltas are measured from |
| `phenology_estimates` | 30,510 rows, 13 zones, vintage **2027** | Already running for the coming season |
| `disease_pressure` | 3,981 rows, 12 zones | Powdery / botrytis / downy already running |
| `climate_zone_daily` | 2025-09-01 → 2026-08-19, **14 of 23 zones** | Regional live series; superseded for Pro by the site's own cell |
| `insights_site_monthly` | 1986-2023, 7,296 rows for site 16 | The site's 1986-2005 monthly level |

### Facts about `climate_zone_daily_baseline` that will bite

1. **`day_of_vintage` 1 = 1 July**, not 1 September. Confirmed empirically:
   Waipara reads 6.48 °C at day 1 and 17.26 °C at day 180. **Sep 1 = day 63,
   Apr 30 = day 304**, so the vintage season is days 63–304 (242 slots, 241
   present).
2. **Day 243 is absent in every zone — that is 28 February**, and February
   therefore carries only 27 days. Verified: the reference year is a **non-leap
   365-day** one, and integrating the daily baseline by month reproduces
   `climate_baseline_monthly` for Waipara to within 0.05 °C in 10 of 12 months.
   Two consequences. A Sep–Apr season is 241 present days out of 242, so an
   uncorrected cumulative under-counts by ~0.65% (~7.5 GDD at Waipara) — fill
   day 243 by interpolating 242 and 244. And a real 29 February has no slot at
   all, so the date → day_of_vintage mapping must map it explicitly rather than
   let `date - season_start` shift every later day by one.
3. **There is no base-10 cumulative column.** `gdd_base0_cumulative_avg` is
   cumulative *tmean* — the identical base-0 trap as `climate_zone_daily.gdd_cumulative`.
   The GDD10 curve is a running sum of `gdd_base10_avg`. Never read the stored
   cumulative as GDD10.
4. **`gdd_base0_cumulative_sd` is NULL.** No stored spread for a cumulative
   curve. Summing daily sd assumes perfect correlation (overstates); quadrature
   assumes independence (understates). To band the cumulative curve properly,
   recompute per-year cumulative percentiles from the source
   `*_daily_climatology_1986_2005.csv` files. Until then, show the curve
   unbanded rather than banded wrongly.
5. **Zone 21 "South Coast" has no daily baseline** (22 of 23).

---

## 1. Current season panel

### 1.1 Season definition — DECIDED
**1 September – 30 April**, labelled by the ending year, matching the archive,
`insights_site_season`, `climate_zone_surface_season` and
`insights_site_service.SEASON_MONTHS`. Sep–Mar was rejected: it would make the
live season non-comparable with every archived season on the platform.

### 1.2 Two panels, not one
`insights_dashboard._season_window` returns one season and picks by date. It
becomes two:

```
season_current    2027, 1 Sep 2026 – 30 Apr 2027   state: not_started | in_progress | complete
season_previous   2026, 1 Sep 2025 – 30 Apr 2026   state: complete
```

`season_previous` is the block that exists today and is being kept as-is.

`state: not_started` is not an edge case — it is what shows for **four months of
every year** (May–Aug) and it is the state the panel ships in. It renders the
season dates, the countdown, and last season's outcome as the thing to compare
against. Never an empty box, never a spinner.

### 1.3 Source — DECIDED: the site's own cell
The interpolation surface is being extended to current and runs daily from
1 September. The current season is therefore read from **the site's own 500 m
cell in the live daily surface**, not from regional stations. No delta
downscaling, no regional proxy.

This requires a new extraction and a new table:

```sql
insights_site_daily (
  site_id, date,
  temp_min, temp_max, temp_mean, rainfall_mm,
  model_version, extracted_at,
  PRIMARY KEY (site_id, date)
)
```

Filled by a hook after the engine's daily run writes day D's COGs: for every
`ready` site, a point read at its `grid_row`/`grid_col` from each of the four
daily COGs. N sites x 4 point reads — negligible.

**It must UPSERT, and season totals must be recomputed rather than accumulated.**
The engine's weekly D-9…D-3 re-fit *changes values that were already written*
(`LIVE_SURFACE_ENGINE_2026-08-20.md` §2). A running total that adds each new day
once will silently diverge from the surface within a fortnight.

Every panel must also degrade per-day: a missing day is a gap in the series, not
a zero. A zero rainfall day and an absent rainfall day are not the same fact.

### 1.4 Baseline — DECIDED: zone shape, site level
No daily site baseline can exist — the archive has no daily rasters before 2024
and the climatology CSVs are per-zone. So the site's baseline curve takes its
**day-to-day shape from the zone** and its **level from the site's own
1986-2005 monthly normal**:

```
offset_m  = site_monthly_normal[m] − zone_monthly_level[m]      # temperature
ratio_m   = site_monthly_normal[m] / zone_monthly_level[m]      # rainfall
```

where `zone_monthly_level[m]` is derived by integrating `climate_zone_daily_baseline`
over month `m` — **not** taken from `climate_zone_surface_monthly`. Deriving it
from the daily baseline itself is what guarantees the rescaled curve integrates
back to exactly the site's monthly normal. Two different sources for the level
would leave a residual that looks like a climate signal.

This is not a cosmetic correction. Waipara's zone Sep–Apr GDD10 baseline is
**1,147.8**; Fancrest's own 1986-2005 mean is **1,040.9** — a 107 GDD gap, 9%.
Against the raw zone curve that site would read as running a permanent deficit
in every season it ever has.

**GDD10 is not rescaled directly.** Applying a temperature offset to a GDD10
climatology is not linear — a +1 °C site gains more than 1 GDD/day in the
shoulders and exactly 1 in midsummer. Instead: shift the zone's daily *tmean*
curve by the site's monthly offset, then recompute GDD10 from the shifted mean
and the zone's `tmean_sd` using the same mean-and-sd integration the archive
uses. That keeps the live GDD10 and the archived GDD10 the same estimator.

Note `insights_site_season` holds **19** usable vintages in 1986-2005, not 20 —
`insights_site_service.FIRST_VINTAGE` is 1987, because vintage 1986 starts in
September 1985, before the archive.

### 1.5 Era offset — DECIDED: state it, do not correct
The live era carries a measured offset against the 1986-2005 archive. It is
disclosed beside the comparison and left in the numbers. **The disclosure says
two different things**, because the two terms have different causes and
different futures:

- **tmean −0.27 °C is provenance** and was measured *co-located, with the
  network term removed*: the DB day is midnight-to-midnight, CLIFLO's is the
  24 h ending 9am. It is stable at ±0.12 °C across 2020–2023 and **more stations
  will not move it** — it is a day-definition difference, not a sampling one.
- **tmin +0.374 °C is network**, and survives elevation matching because
  cold-air pooling needs local stations to see it. The few hundred gauges coming
  online before 1 September **will** shrink this one.

Do not compress those into a single sentence. See
[[project_overlap_bias_study]].

### 1.6 What the panel shows
Per metric (`gdd10`, `rain`, `frost_days`, `hot_days_25`, `tmean`):

- **Accumulation to date** at the site, from 1 Sep to the last day with surface data.
- **The 1986-2005 baseline curve to the same day-of-season**, rescaled per 1.4.
- **The anomaly** between them — a genuine like-for-like, since both are now
  site-level and both stop at the same day of season.
- A progress indicator: day of season / 242, so a to-date figure is never read
  as a season total.

Because the baseline is daily, the comparison is live from **day one of the
season**. The complete-months rule that governs `season_previous` does not apply
here and should not be carried over.

---

## 2. Frost — regional only, with one deliberate exception

The rule: **our surfaces do not model cold-air drainage or pooling, so a
site-level frost figure claims a precision it does not have.**

| Surface | Change |
|---|---|
| Dashboard tiles | `frost_days`, `early_frost_days`: the server stops emitting the `zone` block. Suppressing it client-side only is wrong — another consumer would render it. |
| **`last_spring_frost_doy` tile** | **DECIDED: keeps the site's own date.** The date is a timing statement the surface supports; frost *risk* against neighbours is what it does not. Its region-comparison line goes; the date stays. |
| Current-season panel | `frost_days` compares site to site baseline like any other metric, but carries no regional comparison. |
| Season by season | Frost metrics plot **the regional average only** — no site series, no p10/p90 — behind a `regional_only: true` flag set server-side, plus the disclaimer. |
| Projections | `frost_days` / `spring_frost` stay regional. `hot_days30` may be site-level. |

Disclaimer copy, defined once and reused:

> Frost is a micro-climate effect. Our 500 m surfaces do not model cold-air
> drainage or pooling, so frost is reported as the regional average rather than
> at your site.

---

## 3. Baseline — DECIDED: the whole Pro page on 1986-2005

```python
PRO_BASELINE = "1986-2005"   # the baseline the SSP projections are measured from
```

Tiles, season strip, season-by-season and month-by-month all move. One baseline
on the page, nothing to reconcile, and every panel is directly comparable with
the projections section.

Three consequences:

1. **The docstring at `insights_sites.py:50-54` argues explicitly against
   1986-2005** — "reusing it as the everyday normal would quietly make every
   site look warmer than it is". That comment must be rewritten to state the new
   reason (projection comparability and a matching daily baseline), not left
   contradicting the code.
2. **Anomalies will get larger.** Against a 1986-2005 normal rather than
   1991-2020, every site reads warmer. That is correct and intended, but it is a
   visible change to numbers already shown, so the page states its baseline
   plainly.
3. **`climate_baseline_monthly` is a second 1986-2005 zone normal** of different
   provenance. Keep deriving zone levels from the daily baseline and the surface
   archive. Cross-check the two once, record the difference, never mix them
   inside one number.

---

## 4. Projections — REVISED 2026-08-21: placeholder, pending surfaces

**The earlier plan for this section was wrong and has been replaced.** It
proposed a Phase B that applied the zone's monthly deltas to the site's own
1986-2005 normal. Pete's direction: **projection surfaces are being built, and
both regions and sites will sample from those** — the way the climate archive
already works.

That is the better answer, and it makes the delta shortcut actively harmful.
Applying zone deltas to a site's baseline puts a number on screen that is
regional wearing the site's clothes, and every one of them would have to be
unpicked and re-explained once the surfaces land. The existing
`climate_projections` rows are real, but they were produced per REGION off the
engine; there is nothing per-cell to sample yet.

**Built instead: a placeholder that reserves the shape.** `_projections` in
`insights_dashboard` returns `available: false` with the 3x3 vocabulary
server-side (`SSP126/SSP245/SSP370` x `2021_2040/2041_2060/2080_2099`, labels
matching `ClimateWidgetRenderer` so the Pro page and the region page name them
identically). `ProjectionsPanel.jsx` draws the empty grid, states why, and links
through to the region page where the regional projections already render today.

`regional_available` is a SEPARATE field from `available` on purpose: whether
the region has projections and whether this site can be projected are different
questions, and one must not stand in for the other.

**When the surfaces exist**, this becomes a sampling job on the same pattern as
`insights_site_monthly`: read the site's cell out of each projection surface,
and the panel's `available` flips. No delta arithmetic, no second estimator.

Frost extremes stay regional regardless (§2). Two zones have no extremes row.

### One knock-on for §3
The 1986-2005 baseline decision was justified partly by the delta-application
argument, which is now gone. **It still stands**, on the other two grounds: the
only daily climatology that exists is 1986-2005, and the projections — however
they are eventually sampled — are still expressed against that baseline.

---

## 5. Phenology and disease — DONE: live regional panels

Two real panels on `/my-site`, badged **"Regional model — run for the whole
region, not downscaled to your site"**.

The explorers are **reused, not rebuilt**: `PhenologyExplorer` and
`DiseasePressureExplorer` already render these payloads on the region pages and
already fetch by zone slug. Both are lazy-loaded here — they carry chart.js and
sit below the fold. Their four stylesheets come along in the container's order
(the guardrails file must stay LAST); all four are class-scoped with no bare
element selectors, so they cannot leak into the rest of the Pro page.

### Coverage is worse than "10-11 zones" and it is UNEVEN

Measured 2026-08-21:

| | zones |
|---|---|
| both models | **10 of 23** |
| neither | 8 — Auckland, Gibbston, Gimblett Bridge Pa, Martinborough, Ngaruroro, South Coast, **Upper Wairau and Southern Valleys**, Waiheke |
| phenology only | Northland, Gisborne, Waitaki |
| disease only | Gladstone, Bannockburn |

That list includes Martinborough, Waiheke and core Marlborough, so this is a
commercial gap and not a rounding error. **`/pro` must not promise these two
unconditionally.**

Because five zones carry exactly one of the two, `_models` resolves each model's
coverage **independently** — a single "models available" flag would be wrong for
every one of them. Coverage is decided server-side before either explorer is
rendered, so a subscriber outside the covered set gets the absent state with the
page rather than watching a component mount, fetch and apologise.

### The phenology model is INVALID before the season starts

Found 2026-08-21 while styling the panel. With `gdd_accumulated = 0` the model
extrapolates from nothing and its projections run off the end of the calendar.
Waipara, vintage 2027, estimated 2026-08-19:

| variety | flowering | veraison | harvest 22.0 | confidence |
|---|---|---|---|---|
| CF | 2027-04-30 | 2028-02-22 | 2028-05-17 | **high** |
| PN | 2027-04-29 | 2028-01-22 | 2028-04-20 | **high** |

Flowering in New Zealand is November-December. These are ~650 days out, in the
following vintage, and stamped high confidence. **All 5,733 rows of the 2027
vintage sit at zero GDD**; the 2026 vintage has none, so the model is sound
in-season and fails only before one starts. `confidence` cannot be the gate — it
says "high" for precisely these rows.

**Gated in `_phenology_varieties` with two independent tests.** A date is shown
only if there is accumulation to project from (`MIN_GDD_FOR_PREDICTION`) AND it
falls inside its own vintage's Sep-Apr window. Withheld dates are stripped from
the payload rather than hidden in the client. Five statuses replace a bare
date-or-nothing: `observed`, `projected`, `no_basis`, `beyond_season`,
`not_modelled` — `beyond_season` matters, because a variety whose 21-Brix date
falls past 30 April is not missing a date, it is not expected to reach that
sugar.

**FIXED ON THE REGION PAGES TOO.** The gate now lives in
`services/phenology_basis` and both `insights_dashboard` and
`realtime_climate.get_phenology_estimates` call it — one rule, two surfaces. Two
surfaces disagreeing about which dates are trustworthy would be worse than
either rule alone.

`PhenologyStage` gains an optional `status` (additive, so nothing breaks), the
date and `days_from_now` are stripped when the status is not showable, and
`PhenologyExplorer` renders one explanatory line instead of nine varieties'
worth of "N/A" chips. Verified: all 63 stages for Waipara currently return
`no_basis` with no date attached.

### Veraison is modelled but never observed

`veraison_is_actual` and `flowering_is_actual` are false on **all 30,510 rows**.
Nothing in this model has been confirmed against an observation; every date is a
GDD-threshold projection off `phenology_thresholds` (CF 2655, CH 2541, CS 2641,
GR 2750 for veraison). Worth knowing before it is described to a subscriber as a
prediction of anything.

### Display: Pro gets its own panels

`PhenologyPanel` and `DiseasePanel` replace the reused explorers ON THE PRO PAGE
only; the region pages keep theirs. Harvest targets cut from six to two.
Dropping the explorers also removed four climate stylesheets from the Pro bundle.

**The harvest numbers are GRAMS PER LITRE, not Brix.** 210 is 210 g/L, which is
about **19.5 Brix** — the region endpoint has published that mapping all along
(`Harvest (210g/L - 19.5 Brix)`). The first cut of `PhenologyPanel` labelled
them "21.0°Bx" and "22.0°Bx", overstating ripeness by a point and a half at
exactly the moment someone is deciding whether to pick. Corrected: the server
sends `{sugar_g_l, brix}` pairs and the column header prints g/L with the Brix
as a title. The conversion is not linear, so it is carried, never derived.

Disease pressure keeps its trend chart, **behind a click**. Three charts open at
once is the wall this panel exists to avoid; selecting one disease opens its
series and closes any other. The series is fetched on demand rather than shipped
in the dashboard payload, because most visits never open it, and the endpoint
already returns a ready `chart_data.daily`.

### Veraison — DECIDED 2026-08-21: stays on Pro

The region endpoint carries this comment:

> `# Note: Véraison removed - unreliable predictions pending better calibration`
> `# data. Will be re-added when regional véraison GDD thresholds are validated`

So the free pages pulled veraison as untrustworthy while `PhenologyPanel` shows
it. **Pete's call: it stays, because a bias correction for it is coming.** The
two surfaces therefore differ on purpose for now, not by oversight.

**What the number actually is, stated on both surfaces:** véraison is modelled
as roughly **50% colour change**, not measured on soluble solids — so it is not
comparable to a Brix or g/L reading taken in the vineyard, unlike the flowering
and harvest columns either side of it. Its thresholds carry a **northern
hemisphere bias** and can report véraison **later than it is actually recorded
here**. That wording now sits in `aboutContent.PHENOLOGY_NOTES` and as a caveat
under the Pro phenology table, replacing the old "deliberately not reported"
note that Pro had begun to contradict.

Two notes for whoever lands that correction:

* The region endpoint's own comment is the re-add trigger — "will be re-added
  when regional véraison GDD thresholds are validated". When the correction
  lands, `realtime_climate.harvest_levels` is where veraison goes back, and the
  two surfaces converge again.
* The basis gate needs no change to accommodate it. Veraison falls inside
  Sep-Apr naturally (January-March at Waipara), so the `beyond_season` test will
  pass corrected dates and keep catching uncorrected ones. `veraison_is_actual`
  stays false on all 30,510 rows either way — a corrected projection is still a
  projection, not an observation.

### The two vintages diverge in May and June

`phenology_estimates.vintage_year` follows the JULY-June cycle
(`realtime_climate.get_current_vintage_year`); the Pro page's season is Sep-Apr
(`current_vintage`). They agree for eight months and disagree in May and June —
on 1 June 2027 the model still reports vintage 2027, the season just finished,
while the page has rolled to 2028. Neither is wrong; they label different
things. `vintage_differs_from_page` travels with the payload and the panel
prints the model's own vintage rather than inheriting the page heading.

---

## 6. Markets tab — NZ wine export data

Free, but behind sign-in. Route `/markets`, in the nav, summary card on the home
page.

### 6.1 Framing — DECIDED
Same Stats NZ source and same statistics; our own presentation, our own words,
Stats NZ attributed on the page. Their page copy, report wording, design and
brand stay theirs.

### 6.2 Data model
| Code | Meaning |
|---|---|
| 2204.10 | Sparkling |
| 2204.21 | Bottled, containers <= 2 L |
| 2204.22 | Containers 2–10 L |
| 2204.29 | **Bulk**, containers > 10 L |
| 2204.30 | Grape must |

`wine_export_monthly (month, hs_code, country_code, value_nzd_fob,
quantity_litres)`, unique on the four dimensions, plus a rolling-12-month view.
Metrics: FOB value, litres, **implied $/litre** — the bottled-vs-bulk story is
entirely in that ratio — share, YoY, rolling 12-month.

### 6.3 Ingestion
Stats NZ publishes through Aotearoa Data Explorer / Infoshare. **The
machine-readable route and whether it needs an API key is an open question and
gets a spike before any schema is written.** Then a monthly GitHub Actions job —
not EB cron, same reasoning as the site-population trigger — around the 24th
with a catch-up window. A fixed single-day run that misses leaves a permanent
hole; that lesson is already written in blood in `ingestion/`.

### 6.4 Surfaces
- `/markets` — headline strip, top-20 market table with share and YoY, bottled
  vs bulk $/litre over time, per-market drill-down.
- Home page — compact card: latest month, rolling 12-month, top three markets,
  biggest mover. Visible to anonymous visitors as a teaser; the tab needs an
  account (`AccessGate`, free tier).

---

## 7. Build order

| # | Work | Effort | Notes |
|---|---|---|---|
| 1 | `insights_site_daily` + extraction hook + upsert on re-fit | 1 d | Gated on the engine's daily run existing |
| 2 | Site daily baseline builder (zone shape, site level, GDD via mean+sd) | 1 d | Pure computation, testable against the 1,147.8 / 1,040.9 figures |
| 3 | Current-season panel, backend + frontend, incl. `not_started` | 2 d | Season opens 1 Sep |
| 4 | Whole Pro page to 1986-2005 + rewrite the contradicting docstring | 0.5 d | |
| 5 | Frost regional-only, server-side, all four surfaces | 1 d | Correctness fix, not a feature |
| 6 | Projections Phase A then B | 3 d | Data exists |
| 7 | Phenology + disease panels | 2 d | Data exists |
| 8 | Markets: source spike, ingest, tab | 4–6 d | Independent of 1–7 |

Items 1–3 are the only ones with a date attached. The backfill, the surfaces and
the forward engine are all in flight in parallel.

---

## 8. Test and deploy notes

- `backend/scripts/check_insights_sites.py` (56 checks) calls the router
  functions directly and asserts on the dashboard payload shape. Splitting
  `season_to_date` into current/previous **will** break it; extend it in the same
  commit.
- Moving the page to 1986-2005 changes numbers in `check_insights_sites.py`
  expectations too.
- Nothing from 2026-08-19 or 2026-08-20 is deployed: the backend is on
  `app-260819_151224` and `insights.auxein.co.nz` still serves the pre-08-13
  bundle. Publish that backlog first, or this work inherits a two-release debt.

---

## 8a. Build log

**2026-08-21 — items 1, 2, 3, 4 and 5 built.** Nothing deployed, nothing
committed. The `insights_site_daily` **migration IS applied to prod** — an
additive table that nothing reads yet, so it is safe ahead of the code. Head
moved `zone_order_global` → `insights_site_daily`.

| Item | State |
|---|---|
| 1. `insights_site_daily` + extraction | **DONE.** Migration applied to prod. `check_site_daily` **18/18**. Cannot run against real objects until a daily surface is indexed |
| 2. Site daily baseline builder | **DONE.** `backend/services/insights_site_baseline.py` + `check_site_baseline.py`, **29/29** |
| 3. Current-season panel | **DONE.** `_current_season` + `CurrentSeasonPanel.jsx`; `check_site_season.py` **33/33** |
| 4. Whole Pro page to 1986-2005 | **DONE.** `PRO_BASELINE` derived from the baseline service so the API and the curve builder cannot drift |
| 5. Frost regional-only | **DONE.** Server-side in both the tiles and `/season`; `SiteSeasonChart` honours `regional_only` |
| 6. Projections | **PLACEHOLDER, by direction.** Shape reserved, no numbers. Waits on projection surfaces — see the revised §4 |
| 7. Phenology + disease | **DONE.** Explorers reused and lazy-loaded, coverage resolved server-side per model. **Only 10 of 23 zones have both** — see §5 |

### The current-season panel (item 3)
`season_to_date` is gone, replaced by **two** panels that are deliberately
different shapes:

- **`season_current`** — the site's own cell from the live daily surface,
  against that same cell's rescaled 1986-2005 curve. Both sides, one place, so
  the comparison runs from **day one** of the season; a daily baseline needs no
  pro-rating and the complete-months rule does not apply here.
- **`season_previous`** — the existing regional strip, unchanged in substance.
  A finished season is only fully recorded at station scale.

The vintage is now passed INTO `_season_strip` rather than derived from today's
date. Derived, both panels would have resolved to the same vintage in October
and the page would have shown the current season twice, once labelled
"previous".

Three states, and `not_started` is the one it ships in — Sep-Apr means a third
of every year has no season under way. It renders the countdown and what a
usual season looks like at that site, never an empty chart.

Every metric is compared over **exactly the days the live side has a value
for**. A three-day hole in the surface must not be charged to the site as a
deficit, so the day is dropped from both sides. `days_used` travels with each
metric and is shown.

Counts are compared against **summed probabilities**, not against days whose
mean crossed a threshold: "how many frost nights would a usual season have had
by now" is an expectation. Counting only days whose mean minimum is below zero
reports near-zero frost for a real spring.

The era offset is **stated, not corrected**, and the two terms are given
separately — tmean −0.27 °C is provenance and will not move, tmin +0.374 °C is
network and will shrink as gauges come online.

### What the baseline suite established
- The normal-integral GDD estimator reproduces the table's own
  `gdd_base10_avg` at zero offset — worst single day 0.147 GDD, annual total
  1816 vs 1826 (0.57%). That is what licenses using it on a shifted curve.
- The rescale returns the site's monthly level exactly: worst monthly tmean
  residual 0.000 °C, worst monthly rain residual 0.00 mm.
- Fancrest's season GDD10 comes out at 1,050.5 against its own archived
  1986-2005 mean of 1,040.9 (0.92%), from a zone curve at 1,147.8. It moved 97
  of the 107 GDD gap; the residual is two estimators of the same quantity
  disagreeing, not an error.

### Fixed on the way through
`/sites/{id}/monthly` echoed the raw `baseline` parameter rather than the period
it actually used. Over HTTP the two agree, because FastAPI substitutes the
default; called directly they do not, and the payload reported a `Query` object
as the baseline. It now rebuilds the label from the parsed bounds, so what is
reported is always what was applied.

### Found while reviewing the page — two "usual" numbers that disagreed
The 2026 season headline and the tiles beside it showed different normals for
the same metric. Both were right and the page said so nowhere useful. Under the
presentation problem sat a real bug.

**The bug.** `_season_strip` averaged the regional normal with
`sum(m) / count(DISTINCT yr)`. Vintage 1986 needs Sep-Dec 1985, before the
archive, so it contributed four months to the numerator and a whole year to the
denominator. Every regional normal was understated, **in all 23 zones**:

| metric | was | now | error |
|---|---|---|---|
| gdd10 | 1080.4 | 1098.0 | -1.6% |
| rain | 407.4 | 412.8 | -1.3% |
| frost_days | 2.9 | 3.1 | **-5.0%** |
| hot_days_25 | 38.1 | 38.7 | -1.7% |

Fixed with `HAVING count(*) = :n_months`, and the payload now carries
`normal_years` so the years behind a normal are visible rather than assumed.
It is the same defect `_complete_months` guards against on the live side, one
axis up — a partial YEAR rather than a partial month.
[[project_partial_vintage_normal]]

**The second misstatement.** The tile captioned its normal
"typical season · 37 seasons" when the normal was averaged over **19** — the
baseline period. `n_seasons` is the series length, which is what the range and
trend use. The caption now reads `normal_years`.

**The presentation.** Each metric now declares `normal_scope`, and the strip
prints "across Waipara · 19 seasons" under its usual while the tile reads
"typical season at this site". The remaining difference — 1,098 regional against
1,041 at Fancrest — is two different places, and the page now says so on the
figures themselves rather than only in a header paragraph. It resolves fully
when the current-season panel moves to the site's own cell (items 1 and 3).

### Still to do inside these items
- The cumulative baseline curve is **unbanded**. `gdd_base0_cumulative_sd` is
  NULL and neither summing daily sd (perfect correlation) nor quadrature
  (independence) is right. Banding it properly needs per-year cumulative
  percentiles recomputed from the source
  `*_daily_climatology_1986_2005.csv` files. Shown unbanded until then.
- Day 243 is interpolated and flagged, not sourced. If those CSVs are revisited,
  fix it at source.

---

## 9. Decisions taken 2026-08-21

1. Season is **1 Sep – 30 Apr**.
2. Current season reads **the site's own daily surface cell** — the surface is
   being extended to current and runs daily from 1 Sept.
3. Baseline curve is **zone daily shape rescaled to the site's 1986-2005 level**.
   Daily baseline exists, so no month pro-rating.
4. Era offset: **stated, not corrected** — with tmean (provenance, permanent) and
   tmin (network, shrinking) described separately.
5. **Whole Pro page on 1986-2005.**
6. Last-spring-frost tile **keeps the site's own date**; everything else frost is
   regional.
7. Phenology and disease ship as **live regional panels**.
8. Markets: **same source, our own product.**
