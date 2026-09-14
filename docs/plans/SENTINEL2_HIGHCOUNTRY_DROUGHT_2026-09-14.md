# Sentinel-2 for High Country Drought Monitoring

**Build design, 2026-09-14.** Companion to
[`SATELLITE_DATA_SOURCES_2026-09-14.md`](SATELLITE_DATA_SOURCES_2026-09-14.md).

**Driver:** a new contract covering drought monitoring plus field observations
for high country farmers, supplementing the rainfall, ET and rainfall-anomaly
products already produced.

---

## 1. High country is a better fit than viticulture, and the reason matters

The main caveat in the parent brief - a 10 m pixel over 2.4 m row spacing is a
mixture of canopy, inter-row sward and shadow - **does not apply here.** Tussock
and high country pasture are a continuous canopy. The pixel measures the thing
you want it to measure.

Three further ways this use case is favourable:

- **Low covers sit in the linear part of the curve.** NDVI saturates at moderate
  to high pasture density, which is the standard objection to satellite pasture
  measurement on dairy. High country covers are typically well below that.
  Published NZ work retrieved green biomass to **RMSE ~260 kg/ha across a
  70-4000 kg/ha range** from three bands; high country sits at the bottom of
  that range where the relationship is most nearly linear.
- **Properties are large enough for stable statistics.** A 10,000 ha station is
  about a million Sentinel-2 pixels. Paddock and block aggregates have real
  sample sizes, and per-pixel noise averages out.
- **The method has NZ precedent including tussock.** National mapping of NZ
  pasture productivity from temporal Sentinel-2 has been published with a
  standard error of prediction of 2.2 t/ha/yr, explicitly covering indigenous
  grasslands. This is not a first attempt.

---

## 2. What it adds: the missing third term

The drought stack as it stands is **supply and demand**:

| Term | Where it lives | Grain |
|---|---|---|
| Supply - rainfall | `interpolation/precip.py`, climatological-ratio method on LENZ MAR | National surface |
| Demand - reference and crop ET | `populate_site_water.py`, Penman-Monteith or Hargreaves-Samani | **Point, per site** |
| Deficit - running water balance | `site_water.py`, cumulative from 1 September | **Point, per site** |

There is no **response** term. Nothing in the stack measures what the pasture
actually did. The official national product has the same shape: the NZ Drought
Index (NIWA/MPI, 2017) blends SPI, soil moisture deficit, SMD anomaly and
potential evapotranspiration deficit - four climate indicators, no vegetation
observation, resolved to district.

**That is the opening, and it is the whole commercial argument.** Sentinel-2 is
not a fourth moisture estimate. It is the term that closes the loop:

- Deficit **and** vegetation response = drought, with evidence.
- Deficit **without** response = the property carried it. Feed budget held, or
  the soil had reserves the model did not know about.
- Response **without** deficit = not climate. Overgrazing, snow, fire, or a
  management event.

Separating those three is what a farmer, a rural support trust and a funding
body all actually need, and neither a climate-only index nor a satellite-only
product can do it. It is also the argument for why the field observations and
the satellite layer are sold **together** rather than as two line items.

Positioning: **complement NZDI, do not replace it.** NZDI is the official
district-level trigger MPI uses to classify an adverse event. This is
property-level impact evidence - which is exactly what a farmer needs when
applying against that classification.

---

## 3. Index selection, and a trade-off with a sharp edge

| Index | Bands | Res | Topography | Best for |
|---|---|---|---|---|
| **NDVI** | B8, B4 | 10 m | **Robust** - the ratio largely cancels the illumination factor | Total biomass. The operational backbone. |
| **NDMI / NDWI** | B8A, B11 | 20 m | Robust (ratio) | **Canopy water content - leads greenness loss.** The early-warning term. |
| SAVI / EVI / NIRv | + B2 | 10 m | **Sensitive - needs correction** | Green biomass, measurably better than NDVI |
| Fractional cover | multi-band unmixing | 10-20 m | Sensitive | Green / brown / bare separation |

**The trade-off: the index that measures green biomass better is the one that
breaks on a steep face.** The literature is consistent that NDVI is largely
insensitive to topographic illumination because it is a ratio, while EVI, SAVI
and NIRv require topographic correction in mountainous terrain. And the biomass
literature is equally consistent that SAVI outperforms NDVI for *green* biomass
(R^2 0.52, RMSE 487 kg DM/ha) while NDVI is better for *total* biomass
(R^2 0.43, RMSE 1124 kg DM/ha).

**Recommendation:**

1. **NDVI anomaly as the headline number.** Robust without terrain correction,
   which means it works on day one and does not inherit a correction bug.
2. **NDMI as the lead indicator.** Canopy water content falls before greenness
   does. This is the part that makes the product *early* rather than
   retrospective, and it is underused in NZ pasture work.
3. **SAVI/NIRv only after SCS+C correction** against the LINZ 8 m DEM, and only
   where slope is under about 30 degrees. Treat as v2.
4. **Fractional cover as the differentiator.** For extensive grazing it is the
   best single drought metric because it separates dry-off (brown fraction
   rises, green falls) from bare ground (overgrazing, erosion). DEA has run this
   operationally over Australian rangelands since 1986. **New Zealand has no
   equivalent.**

---

## 4. The thing most likely to break the product: baseline depth

Sentinel-2 Collection-1 L2A is reprocessed and consistent from **4 July 2015**
(S2A) and 17 March 2017 (S2B); global L2A coverage begins January 2017. Call it
**nine to eleven usable growing seasons**.

**A one-in-twenty-year drought cannot be assessed from nine seasons.** A
percentile estimated from nine samples has roughly 11% granularity at best -
decile 1 and decile 2 are not distinguishable. Any product that prints "lowest
on record" off a Sentinel-2-only baseline is printing "lowest in nine years",
and the first dry season that follows will expose it.

**The fix, and it must be decided before the first line of code:**

- **Baseline from Landsat at 30 m, 1984 to present** - forty seasons. Compute a
  per-pixel, per-day-of-year climatology once and store it.
- **Bridge with HLS** (harmonised Landsat + Sentinel-2, 30 m, 2013 onward) so
  the two eras are radiometrically consistent rather than spliced.
- **Sentinel-2 at 10 m supplies current-season detail only** - within-property
  pattern, paddock contrast, the map a farmer looks at.

So the anomaly is a 30 m product against 40 years, and the detail layer is a
10 m product for the current season. Those are two different grids doing two
different jobs, and conflating them is the failure mode.

This also means the parent brief's Landsat continuity risk applies here in a
specific way: the *archive* is safe and is what this depends on. Future Landsat
acquisitions are the uncertain part, and HLS plus Sentinel-2 covers that.

---

## 5. High country failure modes

These are the ones that will produce a visibly wrong map in front of a client.

**a) Snow.** Mackenzie, Lindis, Ahuriri, Otago high country. NDVI over snow is
near zero or negative, which reads as catastrophic drought. The Sentinel-2 scene
classification layer routinely confuses snow and cloud. **An NDSI mask (B3, B11)
is mandatory, not optional.** Note also that snow is itself a feed event - snow
lying on winter country is a destocking or snow-raking decision - so the snow
layer is a **product**, not merely a mask. Ship it.

**b) Terrain shadow.** At 44 degrees south the solar noon elevation in midwinter
is about 22 degrees. A 30 degree south-facing slope is in cast shadow for weeks.
Ratio indices become unstable as radiance approaches zero. **Mask by computed
illumination angle from the DEM, not by a brightness threshold** - a brightness
threshold cannot tell a shadowed slope from dark wet ground.

**c) Seasonal dry-off is not drought.** Tussock browns off every autumn. Only a
per-pixel, per-day-of-year anomaly carries meaning. **Never publish a raw
index.** This is the same class of error as reading a GDD accumulation without
its baseline.

**d) L2A is not reliably terrain-corrected.** Sen2Cor's topographic correction
is **optional and varies scene to scene** - it has to be read from each scene's
metadata. Assuming L2A is terrain-corrected is a silent, scene-dependent bug of
exactly the kind this platform has been bitten by before.

**e) Cloud, and honesty about it.** The Main Divide side of the high country is
cloudy. **Publish the usable-observation count alongside every composite.** A
16-day composite built from one clear scene is not the same product as one built
from four, and the client must be able to see which they are looking at. A
composite that hides its own sample size is the single easiest way to lose
credibility on a drought contract.

**f) ET will fall back to Hargreaves-Samani in the high country.** Penman-Monteith
needs solar, wind and humidity inside their refusal distances, and
`populate_site_water.py` notes solar is the binding input at **37 stations
nationally**. There will be no solar station near a Mackenzie run. Say so in the
contract rather than discovering it at delivery, and state which method produced
each number - `eto_method` already carries this per row.

---

## 6. Field observations: the calibration architecture

`observation_spots`, `observation_runs` and `observation_templates` already
exist. This is the half that makes the satellite layer defensible, and it should
be designed as such rather than bolted on.

**The loop:** the farmer records pasture cover at an observation spot; the
satellite gives wall-to-wall; a **local, per-property, per-season regression**
converts index to kg DM/ha.

**Be explicit that this relationship is fitted, not universal.** The published
error bars are large relative to a high country cover of roughly 800-1500 kg
DM/ha:

| Approach | Error |
|---|---|
| Three-band reflectance, green biomass, 70-4000 kg/ha | RMSE ~260 kg/ha |
| SAVI, green biomass | RMSE ~487 kg DM/ha |
| NDVI, total biomass | RMSE ~1124 kg DM/ha |

**Consequence for the product:** report the **anomaly or percentile as the
primary number**, and kg DM/ha only where enough calibration observations exist,
always with an interval attached. A bare kg DM/ha figure with an implied
precision it does not have is the claim that will be challenged first.

**Operational requirement on the farmer:** roughly 10-15 spots per property
spanning the cover range, sampled **within about two days of a clear overpass**.
That cadence constraint is the real ask, and it should be built into the
observation template rather than left to the farmer to infer - a pasture-cover
template that knows when the next usable overpass is and prompts accordingly.
That is a genuinely novel feature and it is cheap.

---

## 7. Access and build path

**Fastest to a contract deliverable - CDSE Sentinel Hub Statistical API or
openEO.** Server-side index computation and zonal statistics: send a polygon,
receive numbers, transfer no imagery. Every CDSE account gets **10,000 free
processing units per month**. That is a pilot budget across a handful of
properties, not a production one - past it, commercial terms apply via CREODIAS.

**Operational - STAC plus windowed COG reads.** Microsoft Planetary Computer
(free STAC and data, no egress charge) or AWS Earth Search. Read only the bands
needed, only over the property bounding box. The Landsat baseline comes from the
same place, computed once.

**Storage - do not store imagery.** This is what keeps the parent brief's
"Shape D" cost down, and it is the difference between a raster archive and a
statistics table:

1. **Per-pixel 30 m day-of-year climatology raster** - computed once from the
   Landsat archive, stored on S3 beside the existing surfaces.
2. **Per-property, per-date zonal statistics rows in Postgres** - the anomaly,
   the observation count, the masked fraction, per paddock or block. This is the
   product for most purposes and it is small.
3. **A clipped 10 m COG per property per composite, only for display** - and
   only retained for the current season.

Only item 3 is genuinely new infrastructure, and scoping it to display-only for
the current season makes it a cache rather than an archive.

---

## 8. Contract scoping - commit to these, not those

**Safe to commit:**

- Anomaly and percentile against a baseline of 30+ years.
- Usable-observation count published with every composite.
- Snow, cloud and terrain-shadow masks, with masked fraction reported.
- Aggregation to property, block and paddock.
- Calibrated kg DM/ha **where field observations support it**, with an interval.
- Regular cadence with a stated typical latency, not a guaranteed revisit.

**Do not commit:**

- Absolute biomass without ground calibration.
- A fixed revisit interval - cloud decides that, not the satellite.
- Soil moisture from optical imagery. It is not there.
- Anything at 10 m in the historical baseline.
- Drought declaration or classification. That is MPI's call via NZDI, and
  staying clearly on the evidence side of that line is a feature.

---

## 9. Build sequence

1. **LINZ 8 m DEM ingest, plus derived slope, aspect and illumination.** Needed
   for the shadow mask before any index is trustworthy, and it is the same asset
   the parent brief recommends for the interpolation. **The existing 500 m DEM
   is too coarse for 10 m illumination geometry** - this is a separate, finer
   asset, not the one already in the pipeline.
2. **Landsat 30 m day-of-year climatology**, 1984 to present, over the contract
   footprint. Compute once. This is the long pole and it should start first.
3. **Sentinel-2 ingest with the full mask stack** - cloud, cirrus, snow (NDSI),
   shadow (illumination angle) - producing NDVI and NDMI with a per-composite
   observation count.
4. **Zonal statistics to property, block and paddock**, into Postgres. At this
   point a deliverable exists without any tiling work.
5. **Observation template for pasture cover**, overpass-aware, and the
   per-property calibration regression.
6. **Display tiles**, current season only.
7. **Fractional cover**, as the v2 differentiator and the basis of a national NZ
   product that does not currently exist.

---

## 10. Questions that change the design

1. **Who is the counterparty, and is the deliverable a periodic report to an
   organisation or a live feature inside Grow?** The data layer is identical;
   the serving path and the tenancy model are not.
2. **How many properties, and at what total area?** This sets whether the CDSE
   free tier covers the pilot and where the Landsat baseline computation has to
   run.
3. **Does "field observations" mean the existing `observation_spots` system?**
   If so, the pasture-cover template and the overpass-aware prompt are the first
   mobile work, and 48 spots nationally is the starting point.
4. **Is a kg DM/ha number contractually required, or is an anomaly sufficient?**
   This is the single largest determinant of how much field calibration the
   contract has to fund.
