# Grow Insights portal — wiring plan

**Scoped 2026-09-10.** Covers the Insights portal restructure, the phenology path end to end,
the "My Site" link from Insights into Grow, and where W2 (management units) and W5 (counts →
surface → yield) sit relative to them.

Supersedes nothing in `GREYSTONE_SCOPE_2026-09-01.md` — this is W8 in detail, plus a revised
position on W2/W5 sequencing.

---

## 1. The findings that shape this

All four verified against prod on 2026-09-10, read-only.

### 1a. The W8c commercial question is already answered by shipped code

`core/entitlements.py` puts `'grow'` in `PRO_TIERS`, so a Grow user **already passes
`require_pro`** once SSO projects them into `public_users` (5 rows carry `origin='grow'` today).
But `site_quota()` reads `pro_site_quota`, which is **0** for a grow-tier user — Pro by
relationship, with no point.

The route out is also already built. `ck_insights_site_one_owner` forces a site to be owned by
*either* `public_user_id` *or* `account_id`, and BSI's 67 sites are `source='account'`: they
consume nobody's personal quota, and membership of an active account is the third route to Pro
(`project_insights_account_membership`).

**D1. A Grow company becomes an Insights account. Its properties become account sites. Grow
users are members.** No quota slot, no separate point subscription, no new commercial model —
the Grow subscription is the payment. This needs no new machinery, which the original framing
("does a property consume a quota slot?") assumed it would.

### 1b. One site covers every variety

`insights_site_phenology` is keyed **`(site_id, variety_code, vintage_year)`**, and
`services/site_phenology.py` writes one row per variety in the model's set for every site, every
day — all 68 sites, 10 varieties, 18,088 rows. `variety_is_assumed` is TRUE where the site names
no variety, which is exactly the Grow case.

**So a property needs ONE site, and phenology for everything planted on it falls out free.** No
site per block, no site per variety, no quota explosion. The same holds for the other two
This Season panels: `insights_site_disease` (874 rows) and `insights_site_season` (39,814 rows)
are per-site and already populated nightly.

### 1c. The real blocker is the variety join

`vineyard_blocks.variety` is **free text**. Live values across 107 customer blocks:

    Pinot Noir 38 · Sauvignon Blanc 24 · Chardonnay 13 · Riesling 9
    Pinot noir 9                          <- same variety, different case
    Pinot Gris 4 · Chenin Blanc 3 · Cabernet Franc · Syrah · Gewurztraminer
    Pinotage · Aglianico
    "Viognier/Riesling/Pinot Noir"        <- one block, three varieties
    "Pinot Gris (2.0ha) and Pinot Noir"   <- one block, two, with an area in the string

Model codes: `CF CH CS GR ME PG PN RI SB SY` — and **the two models do not cover the same
varieties**, which a single "has a model" flag would hide:

    phenology_thresholds  (GDD: flowering, veraison, harvest)
        CF CS CH GR ME PN RI SB SY        <- nine, no Pinot gris
    budburst_parameters   (APSIM chilling-forcing: budburst)
        CH ME PG PN SB SY                 <- six

So **Pinot gris has a budburst date and no stages**, and **Cabernet franc, Cabernet sauvignon,
Grenache and Riesling have stages but no budburst date**.

**`GR` is Grenache, not Gewurztraminer** — the codes read like initials and that one is a trap.
So Gewurztraminer has no model either. Measured after building the normaliser: **6 of 107
customer blocks resolve to nothing** — Chenin blanc x3, Pinotage, Aglianico, Gewurztraminer. The
two compound strings both parse.

**D2. The normaliser answers "no model for this variety" as a first-class result.** Never a
fallback to PN. A block whose variety has no model shows no phenology and says why — the same
rule costing uses for a missing denominator. And coverage is **two flags, not one**: `has_gdd`
and `has_budburst`, so a caller showing a blank flowering date knows whether it is missing or
not modelled. That also settles the 09-08 question about the four Pinot gris `variety_code`
rows — Pinot gris is budburst-only, and saying so is the answer.

### 1d. Phenology observations are categorical — the counts machinery will not carry them

Six real phenology spots exist, holding `{"scale": "EL", "el_stage": "EL-2", "row_label": "177"}`.
There is no number to average, so the counts report's weighted mean and suppressed SD are the
wrong tools.

**D3. A phenology report aggregates to the MODAL and MOST-ADVANCED stage per block**, with the
spread expressed as a range of stages, not an SD.

The upside: `PhenologyPanel`'s existing mock already has exactly the three tracks real data can
fill — **Regional** (zone estimates), **Local** (`insights_site_phenology` for the property's
site), **Observed** (these spots). Wiring it is filling in, not redesigning.

---

## 2. Portal structure

| Tab | Today |
|---|---|
| **Reports** | exists. Add Phenology alongside the count pills under Observations |
| **Climate** | merge the existing Climate History + Climate Projections pills, sub-tabbed |
| **This Season** | weather · disease · phenology — **all three placeholder or mock**; the bulk of the work, all three off the property's site |
| **Latest Industry Insights** | exists (`ArticlesCarousel`) |

Absorbed: `currentseason`, `phenology` and `disease` fold into This Season.

**Open, needs Pete:** `sprayprogram` has a real `SprayProgramPanel` but no home in the four tabs,
and GPS/spray is mothballed — drop or park? `biosecurity` is a placeholder with nothing behind it.

---

## 3. Build order

    1  Property -> site link + account provisioning     prerequisite for This Season
    2  Variety normaliser                               prerequisite for phenology
    3  Phenology end to end                             panel + report; kills the mock
    4  This Season shell + weather and disease panels
    5  Tab restructure
    6  W2 management units                              independent
    7  W5 surface + yield                               needs W2 grain + capture density

**Why the restructure is fifth, not first.** Doing it early only rearranges placeholders; the
tabs are cheap once the panels behind them are real.

**Why W5 stays last.** 79 observation spots now (up from 48 on 09-01) and capture is running
daily, but no single block is dense enough to validate an interpolated surface. Unchanged
constraint, better trajectory.

---

## Phase 1 — Property → site link — BUILT 2026-09-10, MIGRATION APPLIED

- Nullable unique `properties.insights_site_id` FK. **The Grow side owns the pointer** because
  the Grow side does the reading, and a property has at most one site.
- Site rows carry `source='grow'` and `company_id`, so the Insights side can tell a Grow-provisioned
  point from a subscriber's own without joining back.
- An `insights_account` per Grow company, and Grow users as members — the D1 mechanism.
- **Only 3 of 9 properties have a `forecast_latitude`/`forecast_longitude`**, which is the lat/lon
  a site needs. So this phase starts with a prompt, not a backfill: a property with no point
  cannot be given a site, and must say so rather than silently having none.

## Phase 2 — Variety normaliser — BUILT 2026-09-10

`backend/services/variety_codes.py`. Free text → `variety_code`, per D2. Handles case, accents,
parentheticals, and the compound strings (returns every variety found, in order, so a two-variety
block gets two phenology tracks). Coverage read from the two model tables rather than hardcoded,
because Pinot gris arrived in one of them and still is not in the other.

**The trap it is built around:** bare `"pinot"` is deliberately not an alias. It is ambiguous
between noir, gris and meunier, and including it would match **Pinotage** — a different grape
with no model, which must stay unmatched rather than silently becoming Pinot noir.

38 assertions in `check_variety_codes.py` (session scratchpad), run against every live Grow
variety string.

## Phase 3 — Phenology end to end — BUILT 2026-09-10

- `PhenologyPanel` wired to the three real tracks, per property, filtered to the varieties
  actually planted in that property's blocks.
- New phenology report under Reports → Observations, per D3.
- Removes the standing problem that the Phenology pill renders **mock data with no notice**
  (`PhenologyPanel.jsx` has said "All data below is mock" since 2026-05-29).

## Phase 4 — This Season — BUILT 2026-09-10

Weather (GDD vs baseline from `insights_site_season`), disease (`insights_site_disease` — powdery,
downy, botrytis, Bacchus), phenology (the phase 3 panel). One property, one site, three panels.

## Phase 5 — Tab restructure

Four tabs per §2. Deep links keep working: `?insight=&report=&metric=` already resolves through
`ReportsPanel`, and the absorbed pills need aliases so an old link lands on the right tab.

## Phases 6 and 7 — W2 and W5

As specced in `GREYSTONE_SCOPE_2026-09-01.md` §W2 and §W5. Neither has any code or schema today:
`block_sections` and `block_section_rows` do not exist, and alembic head is
`budburst_chilling_forcing`.

---

## Open questions

1. **Spray Program and Biosecurity** — drop, park, or a fifth tab? (§2)
2. **Which Grow company maps to which Insights account** — one account per company, created on
   demand, or provisioned by hand like BSI's? Phase 1 assumes on demand.
3. **Chenin blanc (3 blocks), Pinotage, Aglianico, Gewurztraminer** — add parameters for them,
   or accept "no model" indefinitely? D2 makes the absence honest either way. Separately: add
   budburst parameters for CF/CS/GR/RI, or GDD thresholds for PG?
4. **Do the two compound-variety blocks get split**, or does the normaliser return a list and the
   UI show several phenology tracks for one block? Phase 2 assumes a list.

---

## Built 2026-09-10 — notes worth keeping

**Phase 3.** `services/phenology_stages.py` (the sibling of `count_metrics`),
`GET /reports/phenology/{summary,export}`, `components/reports/PhenologyReport.jsx`,
`services/grow_phenology.py`, `GET /properties/{id}/phenology`, and `PhenologyPanel`
rewritten off the mock. The mock's fractional stage rail could not carry the real data —
the models produce DATES, not positions — so the panel is a date comparison instead.

*Bug the live data caught:* the first cut derived the season vintage from the site alone,
so a company with no site got **no regional track either**. The one track needing no
setup was switched off by the absence of the one that does. Zone fallback added.

**Phase 4.** `services/grow_season.py`, `GET /properties/{id}/season`,
`components/season/ThisSeasonPanel.jsx`. Weather and disease, each reporting regional and
site side by side with a scope tag on every figure — a regional average can span 60 km.

*Trap worth remembering:* the regional season is produced by calling
`realtime_climate.get_current_season_climate` IN PROCESS, so the Grow panel and a
published article cannot disagree. But calling a FastAPI endpoint function directly
**bypasses dependency resolution**, so an omitted parameter arrives as the `Query(...)`
OBJECT rather than its default — omitting `vintage_year` produced
`can't adapt type 'Query'` from psycopg2, which reads like a database fault and is a
calling-convention one. Pass every argument explicitly.

*Also:* `insights_site_season` is the EXTRACTED record — completed seasons, newest 2026 —
while the live regional figure is vintage 2027. The panel labels them separately rather
than putting both under "this season", which would be two claims under one heading.

**Pills collapsed.** `currentseason`, `phenology` and `disease` are now deep-link aliases
onto This Season, opening it on the matching section. `sprayprogram` and `biosecurity`
are UNTOUCHED pending the open question in §2.
