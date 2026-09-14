# National Drought Service - Fed Farmers Scoping

**2026-09-14.** Assessment of scoping the Marlborough drought index to
Federated Farmers for funding and an initial national rollout. Follows
[`MARLBOROUGH_DROUGHT_PROPOSAL_ASSESSMENT_2026-09-14.md`](MARLBOROUGH_DROUGHT_PROPOSAL_ASSESSMENT_2026-09-14.md).

---

## 1. Federated Farmers is the channel, not the cheque

Worth being direct about this before anything is built around it. Federated
Farmers is a **voluntary-membership advocacy body** - about 13,000 members,
funded by subscriptions, since the compulsory meat levy ended in 1996. It is
not a research funder and will not write a $250k cheque.

**What it actually is, and it is worth more than the money:**

- **24 provinces with standing structures.** This is the only organisation in
  New Zealand with a national provincial network across pastoral farming. For
  recruiting and retaining a farmer observation network, that is the asset, and
  nothing else substitutes for it.
- **Industry groups that map onto the problem** - Meat & Fibre, Dairy, Arable,
  Goats, Rural Butchers and **High Country**. The High Country group is a
  distinct Fed Farmers sector and is exactly the constituency the original
  high-country framing was aimed at.
- **Political weight on drought declarations.** MPI classifies adverse events;
  Fed Farmers argues about those classifications on members' behalf. A
  finer-grained, evidence-backed product is directly useful to their advocacy,
  which makes them a motivated partner rather than a polite one.
- **A credible co-applicant** on a Crown bid.

**So the structure is: scope it *with* Fed Farmers, fund it from PSGF plus levy
bodies.** Fed Farmers contributes endorsement, recruitment and in-kind network
access. Treating them as the funder gets a polite decline; treating them as the
distribution partner gets a letter of support that materially strengthens a
PSGF application.

---

## 2. What the funding stack actually looks like

**SFF Futures is closed.** It was replaced by the **Primary Sector Growth Fund
(PSGF)** on 23 May 2025. Anything drafted against SFF Futures needs rewriting.

**PSGF terms, and they are demanding:**

| Term | Figure |
|---|---|
| MPI contribution | **Up to 40%** of total project cost |
| Minimum Crown investment | **$250,000** |
| Minimum matching industry investment | **$375,000** |
| Implied minimum total project | **$625,000** |
| Co-investment form | Cash preferred; in-kind considered case by case |
| Process | Expression of interest, then invited full application |

Assessment is against four criteria: net benefit to New Zealand (it must
increase profit or reduce cost in the food and fibre value chain), a clear
rationale for Crown funding, **a strong project plan with substantiated
evidence**, and organisational capability to deliver.

**Two consequences:**

1. **This is not a small pilot.** The floor is a $625k programme. Auxein and
   partners have to find $375k, of which in-kind is negotiable but not assumed.
   The 40-year archive, the interpolation engine and the platform are the
   obvious in-kind contribution, and they need to be valued formally.
2. **"Substantiated evidence" is the criterion Marlborough exists to satisfy.**
   See section 7.

**The natural cash co-investors are the levy bodies** - Beef + Lamb NZ, DairyNZ,
FAR for arable. Which leads directly to the competitive problem.

---

## 3. The competitive map, and it is more crowded than it looks

This is the finding that should change the pitch.

| What exists | Who | What it does | What it does not do |
|---|---|---|---|
| **NZ Drought Index** | NIWA / Earth Sciences NZ, with MPI | SPI, soil moisture deficit, SMD anomaly, PED. Daily, district-level. The official declaration trigger. | No vegetation observation. No farmer input. No published per-district uncertainty. |
| **Virtual Climate Station Network** | NIWA / Earth Sciences NZ | Modelled 5 km national climate grid. The input layer under most NZ agri tools. | Virtual stations, not observations. |
| **Pasture Growth Forecaster / Pasture Vibe** | **Funded by B+LNZ and DairyNZ**, built by Rezare with Farmax | Free weekly pasture growth **forecast** for a typical dryland dairy or sheep-and-beef farm, 44 districts on 5 km grids, driven by VCSN. | Forecasts a typical farm. Does not measure what actually happened, produces no drought index, carries no farmer observations. |
| **LIC SPACE** | LIC, commercial | Satellite per-paddock pasture measurement, dairy-focused. Now consumes Pasture Growth Forecaster rates. | Per-farm and commercial. Not a regional or national picture. |

**Two hard conclusions:**

1. **Do not build a pasture growth forecast.** It exists, it is free, it is levy
   funded, and it is incumbent. Competing with a free product funded by the
   organisations you want as co-investors is a losing position twice over.
2. **Do not build a per-paddock measurement tool.** LIC SPACE has that, and the
   Sentinel-2 kg DM/ha work scoped in the high country brief walks directly into
   it.

**What is genuinely unoccupied:** an **observed, regional-to-provincial** layer.
Everything above is either modelled at regional scale or observed at farm scale.
Nobody is measuring what actually happened, across the country, at the grain a
province or a district uses - and nobody at all has a structured national
farmer observation network.

---

## 4. Three defensible differentiators, and only three

Worth being disciplined here. These are the claims that survive contact with a
levy body that already funds a pasture tool.

1. **805 real stations against a virtual grid.** VCSN is modelled. The Auxein
   archive is fitted to an actual national network with published per-region
   cross-validation. The honest form of the claim is not "more accurate
   everywhere" - it is **"we can tell you where it is accurate and where it is
   not"**, which is a thing NZDI does not publish and which matters enormously
   during a declaration argument.
2. **Observed response, not modelled growth.** A satellite vegetation anomaly
   measures what the pasture did. A growth forecast models what a typical farm
   should do. In a drought those two diverge, and the divergence is the
   information.
3. **A structured national farmer observation network.** Nobody has this.
   It is only buildable through Fed Farmers' 24 provinces, and it is the part
   that cannot be replicated by a better model.

Everything else - the zones, the index, the maps - is table stakes.

---

## 5. National inverts the sensor choice

This is a real technical reversal of the high-country brief and it should be
stated plainly.

That brief recommended Sentinel-2 at 10 m, with a Landsat 30 m baseline behind
it, because the product was per-property and needed within-block detail. **For a
national, monthly, province-level product, that is the wrong sensor.**

| | Sentinel-2 | **MODIS / VIIRS** |
|---|---|---|
| Resolution | 10 m | 250-500 m |
| Archive depth | ~9 usable seasons (L2A consistent from July 2015) | **MODIS from 2000 - 26 years** |
| Revisit | 5 days nominal, far worse under NZ cloud | **Daily** - cloud gaps fill |
| Volume at national scale | Large | **Small** |
| Right for | Marker-farm zoom | **The national anomaly layer** |

At provincial aggregation, 250 m is ample - a Fed Farmers province is hundreds
of thousands of hectares. What actually binds is **baseline depth**, and that is
the axis MODIS wins by a factor of three. The high-country brief identified
baseline depth as the thing most likely to break the product; going national
solves it by changing sensor rather than by bolting Landsat underneath.

**Revised sensor plan:** VIIRS and MODIS NDVI anomaly at 250-500 m as the
national response layer with a 2000-present baseline; Sentinel-2 retained only
for marker-farm zoom and zone validation. Note the MODIS end-of-life risk from
the parent brief - build the operational series on **VIIRS**, use MODIS for the
historical baseline only.

---

## 6. Zoning at national scale is easier, not harder

Marlborough needed 10-12 hand-drawn zones. Extrapolated, national would be 500
or more, which is not a hand-drawing exercise. It should not be one.

**The top level should be administrative, because that is what declarations and
advocacy actually use:** territorial authority districts, which align with both
MPI's adverse-event declarations and Fed Farmers' provincial structure. Free
boundaries from LINZ and StatsNZ.

**The bottom level is physical and algorithmic:** elevation band from the 500 m
DEM, crossed with land cover from **LCDB v5** (free, CC-BY, from LRIS). That
produces strata within each district without anyone drawing a polygon.

**What this needs from the existing model:** a new **pastoral** industry zone
set. `climate_zones` carries `industry_id` precisely because "a kiwifruit zone
is a DIFFERENT polygon from the wine zone of the same name" - so pastoral zones
are new rows, not a reinterpretation of the wine polygons. Unlike wine, pastoral
zones are not block-intersected against plantings; LCDB gives the land-use mask
directly.

**And the PET surface is national by construction.** The Hargreaves-Samani
derivation from the existing temperature surfaces has **zero marginal cost to go
national** - the temperature surfaces are already national and the Fargate
pipeline already runs at that grain. The gap that blocked the Marlborough
proposal disappears at national scale rather than multiplying.

That is the counter-intuitive core of this: **national is cheaper per unit than
the regional pilot, because the fixed costs are already paid and national is the
native grain of everything already built.**

---

## 7. Marlborough is the evidence, not a detour

The instinct to skip straight to national should be resisted, for a reason
internal to PSGF rather than to the science.

PSGF assesses on "a strong project plan with **substantiated evidence**". The
Marlborough proposal states its own purpose as generating "evidence to support
applications for larger-scale external funding". **It is the evidence package
for the national bid.** Running it first produces exactly what the PSGF
application needs: a working zone delineation, a demonstrated observation
network with real retention data, and a validated index.

**Recommended sequencing:**

1. **Run Marlborough** as scoped, with the additions from the previous
   assessment - PET surface, HS-SPEI, zone validation, NZDI reconciliation.
   Six to twelve months.
2. **Bring Fed Farmers in during the pilot**, not after. A letter of support
   costs nothing; a national provincial rollout plan co-designed with them is
   worth a great deal in a PSGF application, and their High Country group is a
   natural second pilot region.
3. **Approach the levy bodies with the supply play** (section 8) rather than a
   competing product.
4. **PSGF expression of interest** once the pilot has results, targeting the
   national rollout at $625k-plus with Auxein infrastructure formally valued as
   in-kind.

---

## 8. The alternative play worth considering seriously

**Be the climate layer under other people's tools rather than a competing
farmer-facing product.**

Pasture Vibe runs on VCSN. LIC SPACE runs on Pasture Vibe. Farmax, and most NZ
agri-modelling, runs on VCSN. **If the Auxein surfaces are better - and 805 real
stations against a modelled 5 km grid is a real argument - then the addressable
opportunity is supplying that layer**, not competing with the tools built on it.

This is less visible and possibly a better business:

- It makes the levy bodies **allies rather than competitors**, which fixes the
  section 3 problem outright.
- It is a recurring data licence rather than a subscription product requiring
  farmer acquisition.
- It does not require winning a farmer-facing market against free incumbents.
- It is compatible with the national drought service rather than an alternative
  to it - the same surfaces feed both.

It also reframes the PSGF pitch in a way MPI's criteria like: national
infrastructure improvement benefiting every tool downstream, rather than one
more app.

---

## 9. Risks specific to going national

1. **Head-to-head with a Crown research institute on its own index.** NZDI, VCSN
   and the drought forecasting all sit with NIWA / Earth Sciences NZ. A national
   competing drought index is a political fight. **Reconcile, complement, and
   consider partnering** - the observation network and the response term are
   additive to NZDI, not substitutes for it, and framing them that way is both
   truer and safer.
2. **Coverage honesty becomes a national liability.** The per-region cv_rmse
   work already records performance as catastrophic in Central Otago, and frost
   bias as a coverage artefact. A national product will be least reliable in
   some of the places drought bites hardest. **Publishing per-district
   confidence turns that from a liability into differentiator #1** - but only if
   it is published from day one rather than retrofitted after a challenge.
3. **Observation network decay at national scale.** Marlborough at 12 farms is
   manageable by hand. A hundred farms across 24 provinces is not. The retention
   mechanism - giving the farmer their own zone's index next to their own
   observation - has to be built, not intended.
4. **Levy body duplication.** B+LNZ and DairyNZ already fund a pasture tool.
   Approaching them with anything that looks like a second one invites the
   comparison you cannot win.
5. **In-kind valuation.** MPI considers in-kind case by case and prefers cash.
   A $375k industry match resting entirely on a valuation of the existing
   archive is a fragile application. Some partner cash is probably necessary.

---

## 10. Questions

1. **Is the Marlborough contract signed, or is this a choice between the two?**
   If Marlborough is not yet committed, the sequencing argument in section 7 is
   the main thing to weigh. If it is committed, this is purely additive.
2. **Does Auxein have an existing relationship with any levy body, or with
   NIWA / Earth Sciences NZ?** Either changes the approach to sections 3, 8
   and 9.
3. **Is there appetite for the supply play (section 8)**, which is a different
   business model from the Pro subscription, or is the farmer-facing product the
   strategic priority regardless?
4. **What could Auxein realistically put up as cash co-investment**, as distinct
   from in-kind? This sets whether PSGF is reachable at all, or whether the
   right first target is a smaller regional council or levy-body contract.
