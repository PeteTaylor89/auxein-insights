# Marlborough Drought Index Proposal - Assessment

**2026-09-14.** Assessment of `docs/Drought/Marlborough Drought Index Research
Proposal.docx` against current Insights capability and the satellite scoping in
[`SATELLITE_DATA_SOURCES_2026-09-14.md`](SATELLITE_DATA_SOURCES_2026-09-14.md)
and
[`SENTINEL2_HIGHCOUNTRY_DROUGHT_2026-09-14.md`](SENTINEL2_HIGHCOUNTRY_DROUGHT_2026-09-14.md).

---

## 1. First: I over-scoped the Sentinel-2 brief

That brief assumed a per-property, near-real-time, kg DM/ha drought product and
built a seven-step sequence ending in display tiles and fractional cover. **This
proposal is none of those things.** It is:

- **monthly**, not near-real-time - monthly grower contact, monthly report;
- **regional**, not per-property - a zone map, with marker farms as samples;
- **a paper deliverable** - integrated into the Marlborough Research Centre's
  existing monthly Meteorological Services Report;
- explicitly **"useful before perfect"**, low-cost, and framed as a prototype
  that builds the case for larger external funding.

Steps 1, 3, 5, 6 and 7 of that build sequence are out of scope for this
contract. What survives is smaller and better targeted, and it is set out in
section 5 below.

---

## 2. Objective-by-objective alignment

| Proposal objective | Current capability | Verdict |
|---|---|---|
| **1.** Delineate 10-12 climate indicator zones from rainfall, PET, soil, topography | Rainfall surface (1986-2026, climatological-ratio on LENZ MAR); 500 m DEM; zone hierarchy with `parent_zone_id` / `zone_level`; Marlborough already a parent with Awatere and South Coast as siblings, 3,440 cells | **Strong, with one caveat** - see §4 |
| **2.** Marker farms per zone | `insights_site` (Pro slots, population, `requested_metrics`), `observation_spots` | **Exists** |
| **3.** Monthly grower observation programme | `observation_runs`, `observation_templates`, mobile app | **Exists** |
| **4.** PEI / SPEI maps | **No PET surface exists.** See §3 | **The one real gap** |
| **5.** Integrate into MRC monthly report | Article and reporting infrastructure | **Exists** |
| **6.** Evaluate feasibility of a real-time higher-resolution service | This is the Insights roadmap | **Strategically ideal** - see §7 |

Five of six objectives are substantially met by infrastructure that already
exists. One is not, and it happens to be the one the proposal is named after.

---

## 3. The gap, and the fix

### The gap

**PET is declared but never fitted.** `pet` appears in the SURFACE_CONTRACT_V2
variable vocabulary, in `surface_store.py`'s units map, and in `raster.py`'s
tolerance dict - and nowhere else. The live engine fits four variables:

    run_live.py:  ALL_VARIABLES = TEMP_VARIABLES + ("rainfall",)
                  # temp_mean, temp_min, temp_max, rainfall

Evapotranspiration exists **only at points**, in `populate_site_water.py`, for
sites whose `requested_metrics` include `et`.

SPEI is precipitation minus PET, accumulated over a window and standardised
against a long climatology. **Half of it does not exist as a surface**, and a
point ET at a handful of sites cannot produce a regional map.

### The fix, and it is unusually cheap

Hargreaves-Samani needs **only the three temperature surfaces**, plus
extraterrestrial radiation computable from latitude and day of year:

    ETo = 0.0023 (Tmean + 17.8) sqrt(Tmax - Tmin) Ra      FAO-56 eq. 52

Every input already exists as a published daily 1000 m surface back to 1986.
And **the equation is already implemented** - `backend/services/site_water.py`
carries FAO-56 eq. 52 and the eq. 21 extraterrestrial radiation term as point
functions.

So a PET surface is not a new model, a new ingest, a new station requirement or
a new fit. **It is an existing function applied to three existing rasters
instead of three point series.** That is days of work, not weeks, and it comes
with a 40-year baseline already in place - which is precisely what SPEI's
standardisation requires and what most regional drought products cannot offer.

### Why Hargreaves-Samani is defensible here specifically

Hargreaves-Samani is a known approximation to Penman-Monteith and is normally
the weaker choice. For **SPEI specifically it is far more defensible than it
would be for an absolute water balance**, because SPEI standardises P - PET
against its own climatology. A stable systematic bias in PET largely cancels in
the z-score. FAO-56 names Hargreaves as the substitute for exactly the situation
here - solar, wind and humidity unavailable across the network.

### What does not cancel, and it matters in Marlborough

**Hargreaves-Samani cannot see wind.** It has no wind or humidity term at all.
The Awatere's drought driver is the fohn nor'wester - the drying power that
makes that valley what it is is exactly the term the equation omits.

So HS-SPEI will **systematically under-represent drought severity in the
sub-zone that most needs it**, and the bias is not stable, because it scales
with a wind climate that itself varies between seasons.

This should be stated in the proposal rather than discovered. It is also the
single best-evidenced argument for the follow-on funding the proposal exists to
justify: **a wind surface is the thing that turns HS-SPEI into PM-SPEI**, and
naming that as the Phase 2 ask makes the pilot a deliberate stepping stone
rather than an incomplete product.

---

## 4. Zones: closer than it looks, but not the same zones

`climate_zones` are **wine zones**. The model comment is explicit: the
`industry_id` FK exists because "a kiwifruit zone is a DIFFERENT polygon from
the wine zone of the same name, because zones are block-intersected against that
industry's own plantings."

**Marlborough's pastoral hill country, its forestry in the Richmond Range and
the Sounds, and its orchards are therefore outside the existing polygons** -
they are intersected against vine plantings. The proposal covers Federated
Farmers, DairyNZ, Fonterra and the Top of the South Wood Council alongside Wine
Marlborough. Those members' land is largely not in the current zone set.

**What is genuinely in hand:**

- The **hierarchy mechanism** - `parent_zone_id`, `zone_level`, and Marlborough
  already carrying Awatere and South Coast as siblings. Going to 10-12 is
  extending an existing tree, not building a new one.
- The **multi-industry mechanism** - `industry_id`, `industries`,
  `country_industry_dim`. The right move is a new industry-agnostic or
  multi-industry Marlborough zone set, not a reinterpretation of the wine
  polygons.
- The **drawing inputs** - rainfall surface, the new PET surface, the 500 m DEM,
  and LCDB v5 for land cover (free, CC-BY, from LRIS).
- The **zone machinery** - cell masks, coastal clip, `aggregate_zone_daily_surface.py`,
  zone season stats and baselines.

**One design question to put to MRC before drawing anything:** the proposal asks
for zones uniform in *climatic and landscape* characteristics. Those are two
different zonings and they do not nest. A 2-level scheme - climate zone, then
landscape stratum within it - is almost certainly what is wanted, and it changes
what a marker farm represents. Worth settling on paper first; it is cheap to ask
and expensive to redo.

---

## 5. Where satellite actually belongs in *this* pilot

Much less than the earlier brief implied, and in two specific places.

### 5a. Zone validation - the highest-value, lowest-cost use

Delineate 10-12 zones on climate and terrain, then pull a **zone-mean monthly
NDVI anomaly time series** for each from the Landsat and Sentinel-2 archive and
ask one question: **do the zones actually separate?**

- If all twelve move together, the zoning is not carrying information and should
  be revised before the observation network is built on top of it.
- If they separate, that is **quantitative evidence the zones are real** - which
  is exactly the "evidence to support applications for larger-scale external
  funding" the proposal names as an outcome.

This is twelve polygons, monthly, not a raster product. It is Shape A/B in the
parent brief's cost model, **not Shape D** - no tiling, no per-block store, no
display cache, no calibration. Days to weeks of analysis, and it materially
de-risks Phases 1 and 2.

### 5b. Marker farm representativeness

One farm per zone is the proposal's weakest structural assumption. A zone with
600 m of relief is not represented by one sampling point. **Compare each
candidate marker farm's NDVI trajectory against its zone mean before committing
to it.** A farm that tracks its zone is a good marker; a farm that diverges is
either unrepresentative or evidence the zone is drawn wrong. Either finding is
worth having before the monthly contact programme starts.

### Not now

Per-property 10 m imagery, kg DM/ha calibration, fractional cover, display
tiles, the LINZ 8 m DEM and the shadow mask stack. All of that belongs to the
real-time service in Objective 6, and the pilot's job is to justify funding it -
not to deliver it unpaid.

---

## 6. Risks in the proposal worth raising

1. **SPEI will sometimes disagree with NZDI, and MPI declares adverse events off
   NZDI.** NZDI blends SPI, soil moisture deficit, SMD anomaly and PED; SPEI is
   a different index and will not track it exactly. Recommend computing the NZDI
   component indicators alongside SPEI so the regional product can be
   *reconciled* to the national one rather than appearing to contradict it
   during an event. A divergence that is explained is a feature; one that is
   discovered live is a problem.

2. **Twelve zones times twelve months is 144 observations.** That is a
   network-building and sentiment exercise, not a statistical validation.
   Setting that expectation up front protects the follow-on bid - the pilot's
   claim should be "we established the network and showed the zones separate",
   not "we validated the index".

3. **Monthly reporting programmes decay.** There is no retention mechanism in
   the proposal. The mechanism that works is giving the grower something back -
   their own zone's index next to their own observation, in the app. That is
   cheap here and it is the difference between 12 months of data and 4.

4. **Forestry does not respond to a monthly SPEI the way pasture does.** The
   Wood Council's relevant risks are fire danger, seedling survival and growth,
   on different timescales. Either scope forestry's indicator separately or be
   explicit that the pilot's index is agricultural.

5. **PET method must be recorded per zone and per month.** `eto_method` already
   does this at site level. An SPEI computed from HS PET and one from PM PET are
   not the same index, and a report that mixes them silently is the kind of
   defect that surfaces a year later.

6. **IP.** Auxein would contribute a 40-year national surface archive, the
   interpolation engine, the zone machinery and the observation platform to a
   "low-cost prototype". Who owns the zone delineation, the index
   implementation, and the grower observations should be settled before Phase 1.

---

## 7. Commercial read

The pilot is small. The position it buys is not.

- **MPSAEN is the distribution.** Federated Farmers, Wine Marlborough, DairyNZ,
  Fonterra and the Top of the South Wood Council in one network - four primary
  industries, one introduction. That is the multi-industry expansion the
  satellite brief treated as a future question, arriving as a customer.
- **Objective 6 is a funded scoping exercise for the Insights roadmap.**
  Someone else is paying to evaluate the feasibility of the real-time service
  already being built.
- **Marlborough is the strongest existing region** - dense station network, the
  wine base, Blenheim.
- **Incumbency on the follow-on.** The proposal exists to generate evidence for
  a larger externally funded programme. Whoever builds the prototype is the
  default builder of what follows.

**The structural risk is pricing.** A "low-cost prototype" that consumes a
40-year archive, an interpolation engine and a mobile observation platform is
not a low-cost prototype - it is a licence to pre-existing infrastructure with a
small services layer on top. Structure it that way: a licence line plus a
services line, with the licence explicitly carrying forward into the follow-on.
Pricing the whole thing as a build anchors the relationship at prototype rates
for the programme that follows it.

---

## 8. What I would put back to MRC

1. **Yes to Objectives 1, 2, 3, 5.** They are substantially built.
2. **Yes to Objective 4, with the method named.** SPEI-3 (agricultural
   accumulation window) from a Hargreaves-Samani PET surface derived from the
   existing temperature surfaces, standardised against 1986-2026. State the wind
   limitation explicitly and name the wind surface as the Phase 2 ask.
3. **Propose adding zone validation** (§5a) as a deliverable. It is cheap, it is
   evidence, and it is the thing that makes the funding application credible.
4. **Raise the two-zonings question** (§4) before Phase 1 starts.
5. **Propose reconciliation to NZDI** (§6.1) as an explicit deliverable rather
   than a risk.
6. **Price as licence plus services**, not as a build.

---

## Open questions

- Is Auxein the delivery partner, a data supplier, or a named collaborator on
  the funding application? The three imply very different commercial structures.
- Does MRC already have a PET dataset in mind? The proposal says "modelled PET
  datasets" as if one exists - if it is NIWA VCSN PET, the licensing and the
  method both need checking before an SPEI is built on it.
- Is there an existing Meteorological Services Report format to slot into, and
  is it a PDF, a web page, or both?
