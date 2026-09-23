# My Site, in Grow

**Scoped 2026-09-23** with Pete. Goal: everything Insights presents on **My Site** is presented in
Grow, for the selected property, off that property's own `insights_site`.

Companion to `INSIGHTS_WIRING_2026-09-10.md` (which built the property→site link, This Season and
the phenology tracks). This is the rest of it.

---

## The rule that shapes the whole build

My Site reads from **four different scales** and never merges them:

    site cell        the property's own 500 m cell        tiles, month-by-month, season-in-progress
    region stations  observations aggregated to the zone  last completed season
    region model     phenology and disease, zone-run      badged "not downscaled to your site"
    projections      site cell against its own baseline   deltas only, region delta beside it

Every figure names its own scale on the figure, not in a header. Grow's `ThisSeasonPanel` already
does this with `ScopeTag`; the ported panels keep it.

Two more rules carried over, both load-bearing:

- **Nothing numeric is computed in the browser.** Normals, anomalies and trends arrive ready. The
  only client-side arithmetic on My Site is a progress-bar percentage.
- **Withheld is not zero and not missing.** A missing projection renders `—`. Frost carries no
  site-vs-region claim at all (500 m surfaces do not model cold-air drainage), though
  site-vs-its-own-history is fine. `r99p` is omitted per site, and the page says why.

---

## Phase 1 — backend passthroughs (FIRST, everything needs it)

My Site's endpoints authenticate an Insights `PublicUser` and resolve a **site id**. Grow
authenticates a Grow `User` and resolves a **property id**. The route bodies hold their SQL inline,
and a route function cannot be called directly — dependency defaults arrive as `Query` objects
(the `can't adapt type 'Query'` trap from 09-10).

So: lift each body into `backend/services/insights_site_views.py`, taking `(db, site, …)` and
returning the same payload. Then both routers are thin:

    /api/v1/insights/sites/{site_id}/…      Insights, by site id      (unchanged behaviour)
    /api/v1/properties/{id}/climate/…       Grow, by property id      (new)

`insights_dashboard.build(db, site, baseline)` already takes a bare site row and needs no change.

New Grow routes, all `properties:read` + `get_visible_property_ids`:

    GET /properties/{id}/climate/overview        the dashboard payload (tiles, both seasons)
    GET /properties/{id}/climate/seasons         season-by-season, optional ?metrics=
    GET /properties/{id}/climate/monthly         ?variable=&statistic=&baseline=
    GET /properties/{id}/climate/season-series   ?vintage=, the daily season-in-progress
    GET /properties/{id}/climate/projections     ?season=
    GET /properties/{id}/climate/phenology-site  ?vintage=, the POINT-level phenology (phase 5)

**Grow answers 200 with `{available: false, reason}` where Insights answers 409.** A Grow user who
has not created a site is in a normal state, not an error one, and every Grow panel is already
built to explain an absence rather than render an error.

## Phase 2 — History tab

Into the property card in the climate accordion, which today reads "Property-level climate coming
soon" (`RegionalClimateHistory.jsx:143`):

- **Season by season** — one point per vintage 1986–2023, the region's p10–p90 as a band, the
  region's mean dashed, the site solid. Frost metrics: regional mean only, with the reason.
- **Month by month** — anomaly bars against the site's own 1986–2005 normal, 5 years / 10 years /
  whole record. Server-computed anomalies.
- **The baseline note**, from the payload. Never hardcode the period.

**Port `chartDefaults.js` first.** Grow has no chart legend defaults, and Insights' zero-height
legend box is what makes a legend swatch a LINE that can show `borderDash` — without it the
dashed regional mean and the solid site line get identical swatches. See the chart-legend memory.

## Phase 3 — Projections

`climateprojection` is a visible pill wired to **no switch case** — it highlights and renders
nothing (`Insights.jsx:23`). It gets the site grid: 3 scenarios × 3 horizons (or warming levels),
signed deltas, tone from sign never magnitude, `—` for a missing combination, the region's delta
beneath each number, and the `stale_cells` warning.

Plus the button through to the region's own projections on Insights:
`/{country}/{industry}/{zone_slug}?view=projections`. **It must carry the sign-on handoff**
(`#insights_sso=<grow token>`) or a Grow user lands logged out — the open item from the SSO memory.

**Two vocabularies, do not mix**: the dashboard's `SSP126`/`2021_2040` versus the projections
payload's `ssp126`/`fp2021-2040`.

## Phase 4 — This Season

- **Season-in-progress chart** — daily, the site against **one** comparison at a time (its own
  baseline, or its region). Drawing both makes the gap unattributable.
- **The dashboard tiles** — "what this site usually does", each with its normal, the latest
  vintage's anomaly, the range with vintages, the trend per decade (null under 10 points), and the
  site's position within the region — except frost, which carries no regional claim.
- **The last completed season strip**, which is REGIONAL and station-fed, labelled as such.

## Phase 5 — Disease detail

Three named models — powdery (UC Davis), botrytis (González-Domínguez), downy (3-10 primary ·
Goidanich) — each expanding to a 30-day, 0–100 risk line, with the growth stage and the
"no humidity data in this region" caveat. Regional, and badged regional.

## Phase 6 — Phenology tidy

Today every variety renders a 3-source × 4-event grid, so early in the season it is a wall of
dashes. Pete, 2026-09-23: show **what has been, and the next stage.**

    Chardonnay   EL-9 · 412 GDD · 6 days ahead of average
      ✓ Budburst    21 Sep 2026   actual
      ✓ Flowering    2 Dec 2026   modelled
      → Veraison    14 Feb 2027   in 44 days
      show later stages ▾

**The rules already exist server-side** in `services/phenology_basis.py`: only the next stage
carries a date, later ones come back `role:'awaiting'` with the stage they follow, and a date with
no basis is dropped rather than shown. Grow's panel ignores all of it and renders the raw columns.
Adopt it via `/climate/phenology-site` rather than reimplementing the withholding in the client.

---

## Open questions

1. Does the History tab stay grouped by climate zone, with the property charts nested, or does a
   selected property get its own view? Phase 2 assumes nested, because that is the slot that
   exists.
2. `sprayprogram` and `biosecurity` still have no home in the tab structure (open since 09-10).
3. Does Grow want the **placement map**? Today a site is placed by typing a lat/lon in
   Manage → Weather; My Site places it on a map. Out of scope here, worth its own decision.

## Watch

- **Two demo sites are placed on points that are not vineyards.** Site 123 (Weka Pass) is in
  central Christchurch and site 126 (Glenmark) is in inland Waitaki; neither resolved a
  `zone_id`. Every "this property's own point" figure on those two is for the wrong place.
- A site's `label` is snapshotted at creation, so a property rename leaves it stale — site 123
  still reads "Testing Property".
