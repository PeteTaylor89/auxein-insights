# Auxein Insights — Platform Specification

> **Modernising climate, phenology and disease reporting for wine regions.**
>
> Version 1.0 · 2026-04-29
> Authoring context: this document is written to be converted into a presentation deck.
> Each H2 should map to roughly one slide; each H3 to a panel within it.

---

## 1. Executive Summary

Auxein Insights is a public, regionally-scoped intelligence layer for wine-growing zones. It replaces the patchwork of council spreadsheets, NIWA PDFs, consultant memos and ad-hoc Excel pivots that growers, regional bodies and researchers currently rely on to answer three recurring questions:

1. **Climate** — what has the season actually been like, and how does it compare to baseline and to projections?
2. **Phenology** — where are the key varieties in their growth cycle, and when will the next stage hit?
3. **Disease pressure** — what is the current risk for downy mildew, powdery mildew and botrytis, and why?

The platform consolidates these answers into a single, always-current web product (`insights.auxein.co.nz`) backed by a unified ingestion pipeline that pulls from regional council APIs, Harvest Electronics weather stations, NIWA BCSD downscaled projections, and grower-contributed observations.

**The core proposition:** what used to take a regional body weeks of manual compilation per quarterly report is delivered live, per zone, on a public URL, and remains queryable for every prior season.

---

## 2. The Problem with How Wine Regions Report Today

### 2.1 Climate reporting is retrospective and fragmented

- Regional climate snapshots are produced once per season, often as static PDFs, by NIWA, councils, or industry bodies.
- Underlying station data lives in disparate council systems (TDC Hilltop, GDC Hilltop, ECAN, HBRC, CODC) and commercial networks (Harvest Electronics) — each with its own API, cadence and units.
- Comparisons across seasons, against long-term baseline, or against future climate projections require manual reconciliation.

### 2.2 Phenology is modelled in spreadsheets

- Stage prediction (budburst → flowering → véraison → harvest) is typically run by individual consultants in private GDD spreadsheets, varying by base temperature, start date and variety calibration.
- Outputs are not durable, not comparable across vineyards, and not refreshed as new daily data arrives.

### 2.3 Disease decisions rely on memory and local rules-of-thumb

- Downy mildew, powdery mildew and botrytis pressure depends on the interaction of temperature, leaf wetness, humidity and rainfall — but most growers never see a regional pressure score, only their own block conditions.
- Spray-decision support, where it exists, is locked behind enterprise software or vendor portals.

### 2.4 The cost

- **Time** — analysts spend days per report assembling data they will throw away after one cycle.
- **Latency** — by the time the report is published, the season has moved on.
- **Inequity** — only well-resourced operators see the full picture; smaller growers, contractors and regional bodies get a thinner view.

---

## 3. What Auxein Insights Is

A public-access regional intelligence platform with five integrated reporting surfaces, a regional map, an authored content layer, and a free seasonal-stats widget. All views are zone-aware: every metric, chart and recommendation is scoped to a defined climate zone (e.g. Wairau Valley, Bendigo, Ōpaki, Hawke's Bay).

### 3.1 The five climate explorers

| Explorer | What it answers | Refresh cadence |
|---|---|---|
| **Current Season** | How is this season tracking vs. baseline? GDD, rainfall, frost count, hot days, growing-season summary. | Daily |
| **Phenology** | Where are the key varieties — Pinot Noir, Chardonnay, Sauvignon Blanc, plus extended list — in their growth cycle? When is the next stage? | Daily |
| **Disease Pressure** | What is the current risk score for downy mildew, powdery mildew and botrytis? What's driving it? 14-day trend chart. | Daily |
| **Climate History** | How does any prior season compare? Year-by-year metric playback against long-term baseline. | Daily |
| **Climate Projections** | What does this zone look like under SSP2-4.5, SSP3-7.0, SSP5-8.5 for 2041–2060 and 2081–2100? | Static (re-run on new NIWA BCSD release) |

### 3.2 The regional map

- Pan/zoom map of all NZ wine zones (Mapbox GL JS), with PostGIS-stored zone polygons.
- Click any zone → live climate panel for that zone.
- Click any registered geographical indication (IPoNZ GI) → designation popup with metadata, parent region, status.
- Click any registered Auxein-managed block (where visible) → block summary popup, deep-linked into the relevant climate explorer.

### 3.3 Seasonal Stats Widget

- Free-to-use widget on the landing page.
- User picks zone, variety and harvest date.
- Engine returns the climate fingerprint of that season-to-harvest window: GDD10, GDD0, mean temp, diurnal range, rainfall, mean min/max, frost count, hot-days (>30°C).
- User selects which metrics to show and in what order.
- Submissions are stored (with consent) to grow a proprietary harvest-date × variety × climate dataset for future modelling.

### 3.4 Articles & Research

- An editorial layer (TipTap-based authoring, season picker, embedded charts, working deep-links into the explorers) hosts seasonal commentary, regional research summaries and methodology notes.
- Every article can deep-link a reader directly to a live explorer view for the zone it discusses, removing the need to publish static charts.

### 3.5 Authentication, pricing, gating

- Open access for browsing and the seasonal widget.
- Account creation enables saved zones, deeper history, and contribution back to the dataset.
- The same backend powers the paid Auxein Pro and Auxein Grow products — Insights is the public face of one shared data platform.

---

## 4. How Insights Modernises Regional Reporting

This is the heart of the deck: each subsection is a "before / after" pairing.

### 4.1 From static PDF to live URL

- **Before:** Regional climate report is compiled in Excel and Word, exported to PDF, emailed once per season.
- **After:** Every zone has a permanent URL. Every metric on it is current to the last 24 hours. Last season, the season before, the season ten years ago — all queryable from the same surface.

### 4.2 From single-source to consolidated ingestion

- **Before:** Each council, each commercial network, each NIWA dataset is its own integration job.
- **After:** A unified ingestion platform (see §6) maps every source to a common device + timeseries model. New regions plug into the same shape — NZ South Island first, Australia (BoM) by September 2026.

### 4.3 From point-station to zone-level intelligence

- **Before:** A grower reads one nearest station; a consultant aggregates a handful by hand.
- **After:** Zones have a hierarchy (sub-zone → region overview), and the platform rolls station data up the tree using a recursive CTE. A Marlborough overview row is the synthesised average of Wairau, Awatere, Southern Valleys and Waihopai. A grower in Bendigo can also see the Central Otago overview without losing local resolution.

### 4.4 From private GDD spreadsheet to versioned phenology service

- **Before:** Consultant maintains their own GDD model, base 10°C, manual reset each season, no audit trail.
- **After:** A phenology service (`backend/scripts/phenology_service.py`) recalculates every variety × zone daily, with documented base temperatures, season-start logic, and variety calibration. Output is the same for every reader — and is comparable across years.

### 4.5 From "I think pressure is high today" to scored risk

- **Before:** Disease pressure is a felt sense from walking the rows and watching the forecast.
- **After:** A disease service (`backend/scripts/disease_service_v2.py`) emits a low/moderate/high/extreme risk score per disease per zone per day, with the contributing factors (temperature window, leaf wetness proxy, recent rainfall) shown alongside. Trend charted across the last 14 days.

### 4.6 From projection report to projection explorer

- **Before:** NIWA BCSD downscaled projections are released as a tabular dataset; few growers ever see them.
- **After:** Every zone exposes a Projections view — pick SSP and period, see the projected change in tmean, GDD, frost frequency, hot days, rainfall, with uncertainty bands. The same dataset that informed the IPCC AR6 regional outlook is now a click on the zone page.

### 4.7 From bespoke reporting to compounding dataset

- **Before:** Each year's analysis throws away the working data.
- **After:** Every grower-supplied harvest date and variety entered through the Seasonal Stats Widget joins a structured table. Over seasons, this builds a proprietary harvest-date × climate dataset that no public agency has — feeding back into improved phenology calibration and into research outputs in the Articles layer.

---

## 5. Use Cases & Audiences

| Audience | What they get | Time saved |
|---|---|---|
| **Regional bodies** (e.g. NZ Winegrowers regional committees) | Season-summary content for member comms, derived from a live source instead of a spreadsheet. | Days per quarterly report. |
| **Vineyard owners & growers** | A free, current view of their zone's climate, phenology and disease pressure without subscribing to enterprise software. | Continuous — replaces multiple "where am I in the season?" lookups. |
| **Consultants & viticulturists** | Defensible, shareable, version-stable charts to embed in client reports; deep-links from their own write-ups. | Hours per client report. |
| **Wine companies (multi-property)** | Cross-zone comparison and projection planning for plantings, variety decisions, regional expansion. | Replaces a manual "send me the climate workup" email loop. |
| **Researchers & academic users** | Public, citable zone metrics; exportable history; transparent methodology in the Articles layer. | Avoids per-project data wrangling. |
| **Council & government users** | Public-good visibility into how regional climate data is being used by the industry; partnership pathway for ingestion. | Frames councils as data contributors, not bottlenecks. |

---

## 6. Architecture (in brief)

A presentation should keep this to one slide — the audience cares about the outcomes, not the tables.

### 6.1 Stack

- **Backend:** FastAPI on AWS Elastic Beanstalk (`api.auxein.co.nz`).
- **Database:** PostgreSQL 14 + PostGIS on AWS RDS, ap-southeast-2.
- **Frontend (Insights):** React + Vite SPA, S3 + CloudFront, served at `insights.auxein.co.nz`.
- **Mapping:** Mapbox GL JS, zone geometry stored in PostGIS.
- **Ingestion:** GitHub Actions cron jobs — weather every 6 hours, daily processing at 05:00 UTC.

### 6.2 Data sources today

- **Harvest Electronics** — commercial 10-minute station network (most NZ regions).
- **ECAN** — Environment Canterbury, hourly.
- **HBRC** — Hawke's Bay Regional Council, hourly.
- **TDC** — Tasman District Council Hilltop API (Nelson/Tasman), 10 stations.
- **GDC** — Gisborne District Council Hilltop API.
- **CODC** — Central Otago District Council (rolling out — Alexandra, Cromwell, Roxburgh).
- **NIWA BCSD** — bias-corrected, statistically-downscaled climate projection dataset (history, baseline, projections).

### 6.3 The unified data model

Weather sources have been generalised into a device + timeseries + measurement-catalog model so that:

- Adding a new region or a new sensor type is a configuration change, not a new pipeline.
- Each device has a credential reference (provider/name) resolved via AWS Secrets Manager.
- Ownership is explicit: source-public, council-owned, company-owned, asset-owned.
- The same model carries forward into operational telemetry (soil, irrigation, frost fans) — Insights becomes one face of a wider environmental data platform.

### 6.4 Multi-tenancy & permissions

- Company-based tenancy. Most operational tables carry `company_id`. Properties are gated through `UserPropertyScope`.
- Public Insights uses a separate `public_users` table + admin flag — fully isolated from the Pro/Grow operational data.
- Five-tier permission hierarchy on the operational side: Auxein Admin → Company Admin → Manager → User → Contractor.

---

## 7. What Has Already Shipped (v1.1)

As of 2026-04-10, all of the following are live in production:

- Five climate explorers (Current Season, Phenology, Disease, History, Projections) for every NZ zone with active data.
- Mobile-responsive layout, accessibility pass.
- Regional map with zone polygons, GI overlays, block popups, deep-links.
- Seasonal Stats Widget on the landing page.
- Articles layer with TipTap authoring, season picker, embeds and deep-links.
- SEO meta tag injection at the FastAPI catch-all (rather than migrating to Next.js).
- TDC integration — 10 stations across Nelson/Tasman, ingestion + backfill complete.
- GDC integration — ingestion complete; zone aggregation pending a second climate station.
- Data ingestion platform Phase 0 → B1.5 — generalised model deployed; credential resolver live; CODC rolling out.

---

## 8. Roadmap

| Horizon | Focus | Outcome |
|---|---|---|
| **Now → mid-2026** | Finish CODC rollout, deploy weather endpoint for Grow, build Company Admin "Weather Stations" onboarding wizard. | Customers can self-onboard their own Harvest stations and have them flow into the same intelligence views. |
| **Mid-2026** | Variable-cadence ingestion (live 15-minute alongside 6-hour batch), alerts schema. | Foundation for frost / spray-window alerting. |
| **September 2026** | Australia launch — full AU wine region seed, BoM ingestion, hemisphere-aware vintage logic. | Insights becomes a multi-country product on day one of AU release. |
| **Late 2026** | Grow weather module v1; deeper integration with Auxein Pro property/block model. | A grower's own block telemetry sits alongside regional context in the same UI. |
| **2027+** | Disease and phenology models trained on the Seasonal Stats Widget contribution dataset. | Proprietary intelligence that no public agency has equivalent of. |

---

## 9. Differentiators

A presentation closer — distil to one slide, three points, large type.

- **Zone-first, not station-first.** Every metric is rolled up to the zone a wine reader actually thinks in (Wairau, Bendigo, Hawke's Bay), with sub-zones and region overviews handled automatically.
- **One platform, three lenses.** Climate, phenology and disease are not three products — they are three views over the same daily-recomputed dataset. A reader never has to reconcile.
- **Public by default, proprietary by design.** The public surface is open; the value compounds in the underlying dataset and ingestion footprint, which is hard to replicate.

---

## 10. One-Line Pitch

> Auxein Insights replaces the wine industry's seasonal climate report cycle with a live, zone-aware intelligence layer — current season, phenology, disease pressure and downscaled projections, on every zone, every day.
