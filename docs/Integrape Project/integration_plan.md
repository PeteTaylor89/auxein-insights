# Integrape integration — plan

Date: 2026-09-16 · Status: proposed, nothing built
Inputs: `plan.md` (the brief), `email_plan.md` (the thread to 16 Sep)

---

## 1. What is actually being asked for

Two different things, and they are on different clocks.

**Joris wants, this week:** a short data specification he can hand to Mirjam
(their database/integrations person) so she can flag problems. That is a
*document*, not a deployment. It costs us nothing but writing time and it is
the only thing standing between a July quote and a live evaluation.

**`plan.md` asks for:** table/schema specification for the four listed areas,
the gaps, whether a bespoke API should exist, and the risk of accreting one API
per client.

The commercial position is asymmetric: $35k + GST p.a. quoted in July, no board
decision, one deferral, and a reply that is warm but non-committal. **Nothing
should be built before a signed order.** The spec is the deliverable that moves
it; code is what follows a signature.

---

## 2. What we can supply today — verified against the schema

Each of Joris's four areas, mapped to the tables that actually hold the data.

### 2.1 Region-level overview (and sub-regional)

| Item | Source | Status |
|---|---|---|
| Zone definitions, hierarchy | `climate_zones` (`parent_zone_id`, `zone_level`) | Live — sub-regional is a real hierarchy, not a label |
| Monthly history 1986→ | `climate_history_monthly_surface` | Live — mean + SD per variable |
| Season metrics by vintage | `climate_zone_surface_season`, `climate_zone_season_stats` | Live |
| Daily zone record | `climate_zone_daily` (+ `climate_zone_daily_baseline`) | Live |
| Hourly zone record | `climate_zone_hourly` | Live — drives disease |
| Baseline (1986–2005) | `climate_zone_daily_baseline_surface`, `climate_baseline_monthly` | Live, BCSD-derived |
| Projections | `climate_zone_projection`, `climate_projections` | Live — SSP × period × season |

Already exposed on `/api/v1/public-climate/zones/*` (history, seasons, baseline,
projections, dashboard, compare). A partner feed is a re-shape of existing
queries, not new science.

### 2.2 Vineyard-specific interpolated climate (the "my site" ask)

This is the `insights_site*` family and it is the strongest part of the offer.

| Table | Grain | Contents |
|---|---|---|
| `insights_site` | one point | lat/lon, elevation, resolved 500 m grid cell, zone, variety + `variety_code`, `requested_metrics`, owner, status |
| `insights_site_daily` | site × date | `temp_min/max/mean`, `rainfall_mm`, GDD (two bases), `eto_mm`, `etc_mm`, `water_balance_mm`, `eto_method`, `model_version` |
| `insights_site_hourly` | site × hour UTC | temp, RH, dewpoint, precip, wind, wet-hour flag + wetness source, **per-variable station count and nearest-station distance** |
| `insights_site_monthly` | site × var × stat × month | long-run monthly record at the cell |
| `insights_site_season` | site × vintage × metric | season aggregates, with `baseline` named |
| `insights_site_projection` | site × scenario × period | projected, baseline, and stored delta |
| `insights_site_phenology` | site × variety × vintage × estimate date | GDD, stage, budburst/flowering/veraison/harvest dates, actual-vs-modelled flags, **zone comparators stored alongside** |
| `insights_site_disease` | site × date | PM (UC Davis), botrytis (González-Domínguez + Bacchus), DM (3-10 + Goidanich), `hours_used`, `humidity_available` |
| `insights_site_yield` | site × vintage × variety | client-entered only — **no yield model exists** |

**Joris's open question — baseline or actual record — answer: both, and they are
different tables.** `insights_site_daily` is the actual interpolated daily
record; the 1986–2005 baseline is a separate named surface. Conflating them is
the single easiest way for this integration to produce a wrong number, so the
spec must make the distinction explicit and carry `baseline` as a value, never
an assumption.

The provenance columns (`temp_station_count`, `*_nearest_km`, `confidence`,
`model_version`, `eto_method`) are a genuine differentiator for a partner:
Mirjam can tell a well-observed site from an extrapolated one. Those columns
should be in the contract, not stripped for tidiness.

### 2.3 Private weather stations (e.g. Harvest)

The ingestion platform exists: `data_sources`, `ingestion_credentials` (Secrets
Manager ARN + env fallback, optional `company_id`), `measurement_catalog`,
`device_measurements`, `weather_stations`, `weather_data` (partitioned view),
`ingestion_log`. Harvest is already a wired provider. Twelve councils, ~805
stations running.

What does **not** exist is the consent and attribution layer for a grower's
*private* station flowing to a *third party*. That is section 4.3.

### 2.4 Disease pressure + current-season phenology

Live at zone level (`disease_pressure`) and site level (`insights_site_disease`),
computed from hourly data by `scripts/disease_service_v2.py`. Phenology is live
at both levels, including the budburst chilling–forcing model.

---

## 3. The recommendation: one partner API, not an Integrape API

`plan.md` asks whether to build a bespoke API. **No.** Build one versioned
partner data API — `/api/v1/partner/*` — and make Integrape its first tenant.

The difference is not cosmetic:

- A bespoke endpoint set is priced once and maintained forever. Client #2 gets a
  second set, and every schema change then has to be made N times or not at all.
  That is how a data business turns into a bespoke integrations business at the
  same revenue.
- A single contract means one place where the honesty rules live — units, nulls,
  baselines, model versions, provenance. Those rules are the product.
  Duplicating them is how one client quietly gets a stale definition.
- Entitlements make the commercial model enforceable in code. Integrape at $35k
  buys a defined slice; the next client's slice is a row, not a sprint.

**Shape it as a schema, not as screens.** Integrape consumes into their own
database. Resource-per-grain endpoints with cursor paging and an `updated_since`
filter beat any dashboard-shaped response. Offer:

- `GET /partner/sites` — the entitled site list, with grid/zone/variety
- `GET /partner/sites/{id}/daily?from=&to=` — interpolated daily record
- `GET /partner/sites/{id}/hourly?from=&to=` — hourly with provenance
- `GET /partner/sites/{id}/phenology?vintage=` — current-season estimates
- `GET /partner/sites/{id}/disease?from=&to=` — daily indices
- `GET /partner/zones` + `/zones/{slug}/{daily,seasons,baseline}` — regional
- `GET /partner/changes?since=` — a change feed, so they pull deltas not the world
- Bulk: signed-URL Parquet/CSV for a first backfill. A 40-year daily record
  should not be paged out over HTTP.

Every response carries `model_version`, `extracted_at`, units, and explicit
nulls. **Never a zero for an absent value** — that trap has already been paid
for twice on this platform.

---

## 4. Gaps — the honest list

These belong in the spec sent to Mirjam, stated plainly. A gap disclosed now is
a scoping note; the same gap found by Mirjam in evaluation is a credibility
problem.

### 4.1 There is no disease *forecast*

`email_plan.md` promises "disease pressure **and forecasting**". What exists is
retrospective: `disease_service_v2.py` processes yesterday from observed hourly
data. `services/forecast_service.py` is a MetOcean **weather** proxy — it has
never been joined to the disease models.

This is the largest gap between the email and the platform. Options:

1. Sell the current-season *observed* pressure and phenology (which is real and
   defensible), and scope forecast as a named roadmap item.
2. Build forward disease: run the same models over MetOcean forecast hours.
   Material work, plus a licensing question (4.2).

Recommend (1) for the spec, with (2) priced separately. Do not let the July
wording set an expectation the schema cannot meet.

### 4.2 MetOcean redistribution rights

Our MetOcean licence covers our own products. Feeding forecast-derived values
into a third party's platform is a different use and must be checked before it
appears in any spec. **Unresolved — check the contract before drafting §4.1
option 2.**

### 4.3 Private station sharing has no consent model

Joris's own note: this "will require schemas and data sharing agreements with
each user." Correct, and we have neither the agreement template nor the tables.
Needed: a per-station, per-grower, per-recipient grant with scope (which
measurements), term, and revocation — plus what happens to already-delivered
data on revoke. Until that exists, private-station pass-through should be
explicitly **out of scope for phase 1**.

### 4.4 No machine-to-machine authentication

Verified: there is no API key or client-credential path in the backend. Every
public endpoint authenticates a `public_users` JWT. The nearest analogue is the
server-verified embed grant in `surfaces.py`, which is purpose-built for article
widgets and is not a general mechanism. Rate limiting exists on two endpoints
only.

A partner API needs client credentials, entitlement scoping, per-client rate
limits, and a request log. That is the single largest piece of net-new build and
it is reusable — see §5.

### 4.5 New Zealand only

Australia is seeded in `countries` but **inactive, with no data**. Joris raised
BOM and Australia directly. The spec must say NZ-only, or the first Australian
grower on their platform becomes our problem in evaluation.

### 4.6 Smaller, but must be disclosed

- **Frost is withheld.** Per-region cross-validation showed frost bias is a
  coverage artefact. No frost metric ships until that is resolved.
- **Bacchus** was ticked by name but the `1/I` assembly is our inference, not a
  published specification. Label it as such.
- **Botrytis label vs index** — severity and cumulative are different numbers
  under different bands. A partner drawing one under the other's bands is a
  wrong chart with our name on it. The spec must band each explicitly.
- **Pinot gris has no `variety_code`** — four sites on the BSI list already hit
  this. Phenology cannot be produced for a variety we hold no thresholds for.
- **No yield model.** `insights_site_yield` is client-entered. Nothing in the
  feed may imply otherwise.
- **`insights_site_daily` carries no RH or solar.** RH is hourly-only. If they
  want daily humidity, it is a derivation we would have to define.
- **No SLA exists.** $35k/yr implies uptime, latency and support expectations
  that have never been written down. The morning chain is D-1 and ECAN_AIR lands
  ~5 h behind; freshness must be stated, not implied.

---

## 5. What gets built (only after signature)

New tables — deliberately generic, none named for Integrape:

- `partner_client` — the organisation, status, contract dates
- `partner_credential` — hashed client secret, rotation, last-used
- `partner_entitlement` — client × resource × scope (which zones, which sites,
  which variables, which history depth). This *is* the commercial model
- `partner_request_log` — request, entitlement decision, row count, latency.
  Needed for support, for abuse, and for the renewal conversation
- `station_share_grant` — grower → recipient consent for private stations
  (phase 2 only, per §4.3)

Plus: a `partner` router, an auth dependency, per-client rate limiting, a
published OpenAPI spec (currently `docs_url` is disabled in production), and a
sandbox dataset so Mirjam can build against something before go-live.

---

## 6. Risks of the API-per-client path

Stated for `plan.md`'s final question:

1. **Maintenance multiplies, revenue does not.** N bespoke contracts means every
   schema or model change is N migrations and N regression surfaces.
2. **Definitions drift between clients.** Two endpoints computing "GDD" from
   different bases is the same class of bug as the mirror drift and the two GDD
   bases already on this platform. Drift between *clients* is worse: it is
   invisible until two of them compare notes.
3. **The commercial model stops being enforceable.** Without entitlements, what a
   client can pull is whatever their endpoint happens to return, and upsell has
   no boundary to sell across.
4. **It anchors the price to effort, not value.** A bespoke build invites "what
   will you build for us" instead of "what does the data cost".
5. **Opportunity cost.** Every bespoke week is a week not spent on Grow, Insights
   Pro, or the Australian ingest that Joris himself gestured at.

The mitigation is the same in all five cases: one contract, entitlements as
data, and per-client work limited to configuration.

---

## 7. Phases

**Phase 0 — the spec document (this week, no code).**
A partner data specification: resource list, field-level schema for each grain,
units, null semantics, baseline vs actual, provenance columns, freshness and
update cadence, the §4 gaps stated plainly, and NZ-only scope. Sized to be read
by Mirjam in twenty minutes. This is what Joris asked for and it is the whole of
the near-term work.

**Phase 1 — partner auth + entitlements** (on signature). §5 tables, the auth
dependency, rate limiting, request log. No Integrape-specific anything.

**Phase 2 — the read endpoints.** Sites, daily, hourly, phenology, disease,
zones, changes feed. Bulk backfill export. Published OpenAPI + sandbox.

**Phase 3 — private station sharing.** Consent tables, grower-facing grant UI,
the data sharing agreement template. Only with a legal review.

**Phase 4 — disease forecast** (separately priced, and only if §4.2 clears).

---

## 8. Decisions needed from Pete

1. **Forecast wording.** Sell observed-only now and scope forecast separately, or
   hold the integration until forward disease exists?
2. **MetOcean licence** — does it permit third-party redistribution? Blocks 4.2.
3. **How much history** does $35k include? Full 1986→ daily record, or a window?
   This is the main entitlement dial.
4. **Site count.** Flat rate was quoted against "less than a full Insights
   Licence" — but an unbounded site count makes the flat rate unbounded too. A
   cap (or a band) belongs in the spec.
5. **Does the spec go out before a signed order?** Recommend yes: it is a sales
   asset, it costs a day, and it is what has been asked for. Mark it *commercial
   in confidence, indicative, subject to agreement*.
6. **Australia** — say NZ-only now, or position AU as a joint roadmap item? Joris
   raised it first, which makes it a lever rather than a weakness.
