# Insights Pro — what makes it worth paying for

Written 2026-08-24 at the end of the country/industry + free-tier work. This is
the roadmap for the PAID product; the free tier is settled and shipped (see
`INSIGHTS_REFINEMENTS_2026-08-24b.md` §free tier).

Nothing here is built. Order is my recommendation; the items are independent
enough to reorder.

---

## Where Pro stands today

**The free tier is now genuinely useful**, which is the point — and it raises
the bar for what Pro has to be. Free gets: ten days of measured temperature and
rainfall, the season's cumulative GDD against its 1986-2005 normal with a
year-to-year spread band, ten days of disease pressure, and phenology. All of
that is regional.

**Pro today** is: the subscriber's own 500 m cell rather than the region, a
1987-2026 site record (the 2023 ceiling was lifted on 2026-08-24), the
month-by-month deviation from long-term average, regional history and
projections, and the regional models badged as regional.

**What changed underneath on 2026-08-24 and unblocks several items below:**

- **Daily surfaces are live.** `surface_run` has rows at `granularity='daily'`
  from 2026-08-01. `populate_daily` writes real rows for the first time. The
  Pro daily panel has data, and from 1 September it accumulates through the
  season.
- **The site record reaches 2026.** `last_vintage()` is derived from the
  archive instead of hardcoded, so the LTA deviation chart runs to the current
  season.
- **Projections are per-zone from 500 m surfaces** — `climate_zone_projection`,
  13,248 rows, three scenarios, six periods, composed onto our own baseline.

---

## 1. CSV / API export — smallest, and asked for

The whole season at daily resolution, downloadable. Consultants and larger
growers ask for this first, and it costs little: the data exists, the endpoint
is a serialisation.

Scope: per-site daily CSV (date, tmin, tmean, tmax, rain, GDD), per-site
monthly, per-site season. Plus the same for the subscriber's region so the
comparison travels with it.

**Get the provenance into the file, not just the screen.** Every row should
carry which era and model version produced it — a CSV outlives the page it came
from, and a 2023 archive value and a 2026 live value are not the same
measurement.

## 2. Alerts — the thing that changes Pro from a page to a service

A dashboard is something you remember to visit. An alert arrives.

- **Frost risk at the subscriber's site** — gated on §5 below. This is the one
  they would pay for on its own.
- **Heatwave alert on the home page when signed in** (Pete, 2026-08-24). Against
  monthly averages and a stated heatwave definition — settle which one first,
  because "heatwave" is not a single thing: the WMO five-consecutive-days-over-
  normal-by-5°C, a percentile-based definition against our own 1986-2005
  normals, or an agronomic one keyed to vine shutdown near 30-35°C. Our own
  percentile against our own normal is the most defensible and the easiest to
  explain, and we already publish the normal it would reference.
- **Disease index crossings** — botrytis or powdery crossing a threshold at
  their site.

Alerts need the daily surfaces, which now exist. They also need a delivery path
— `UnifiedEmailService` is already in place.

## 3. Disease FORECAST via the MetService commercial API

Pete is upgrading to the commercial licence for this (2026-08-24).

Today every disease number is **retrospective** — it says what the pressure has
been. A forecast says what to do this week, which is the difference between a
report and a decision tool.

Notes before building:

- The disease models already run on temperature, humidity and rainfall; a
  forecast feed substitutes the same inputs forward. The model code does not
  change, only its input horizon.
- **Forecast and observation must never be presented as the same series.** Draw
  the forecast as a distinct segment with its own styling and label. The moment
  a grower cannot tell which half is measured, the whole panel loses its
  authority.
- Licensing: check redistribution terms. A forecast we can compute against but
  not display is a different product from one we can chart.
- Verify the forecast against what actually happened, and publish the skill.
  A forecast without a track record is an opinion.

## 4. Site vs region vs peers

The Pro page already compares a site to its region. The claim people pay for is
**"you are in the warmest 20% of Marlborough"**. The p10/p90 across planted
cells is already computed for every zone and every metric, so this is mostly
presentation.

Careful: it is a comparison against *modelled cells*, not against named
neighbours, and it should say so.

## 5. Frost, done properly — the biggest single win

Every frost metric was **withdrawn** from the product on 2026-08-24 because the
interpolator cannot support it. See
[[project_insights_metric_definitions]]: the count is thresholded off a
lapse-retrended Tmin field, and on frost nights the atmosphere inverts, so the
model loads frost onto high ground and erases it from the valley floors where
the vines are. Red Hills at 1328 m observed 1 frost night and its own pixel says
20; Flaxbourne at 39 m observed 6 and its pixel says 0.

**Fixing this converts our largest current weakness into the clearest paid
differentiator.** Nobody else offers site-level frost risk at 500 m in New
Zealand.

Two routes, and they are not exclusive:

1. **Interpolate the COUNT rather than thresholding an interpolated
   temperature.** Sidesteps the threshold sensitivity entirely.
2. **Fit Tmin without the lapse retrend, or with an inversion-aware one.** The
   physically honest fix and the harder one.

Either way it needs a validation set. The station comparison in
`project_insights_metric_definitions` is the start of one.

## 6. Analogue seasons

"This season is tracking closest to 2019 and 2013 — here is how those finished."

Forty seasons of site-level data make it computable now, and it answers the
question a grower actually has, which is what happens next rather than what has
happened. Cheap relative to its impact: a distance metric over season-to-date
curves.

## 7. The AI assistant

Planned earlier, deferred at the platform-plan cut-line, revived by Pete
2026-08-24: let a subscriber ask questions about their current season, the
history and the projections, and have the assistant answer **from the data via
managed routes**.

The design constraint that matters: **the model must not invent numbers.** It
should call a small set of typed, server-side routes — "season to date for site
X", "normal for metric M at site X", "projected change for scenario S" — and
compose an answer from what comes back. Every figure in an answer should be
traceable to a route call, and the assistant should decline rather than
estimate when no route covers the question.

That also makes it cheap to evaluate: the routes are testable independently of
the model, and the model's job reduces to routing and prose.

Prerequisites: §1's export shapes are most of the route surface. Build the
routes for the export and the assistant gets them free.

---

## Sequencing

    1. CSV / API export            small, asked for, unblocks §7's routes
    2. Alerts (heatwave first)     needs a settled definition, not new data
    3. Disease forecast            gated on the MetService commercial licence
    4. Peer positioning            mostly presentation
    5. Frost, properly             engine work; the biggest win
    6. Analogue seasons            cheap, high impact
    7. AI assistant                last, and it rides on §1's routes

§2 and §3 are independent of §5 and can run in parallel with it.
