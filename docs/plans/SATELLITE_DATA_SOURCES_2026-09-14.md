# Free Satellite Data Sources - Insights & Grow

**Research brief, 2026-09-14.** Scope agreed at the outset: **NZ + Australia**,
**all primary industries**, **both products assessed separately**, **existing
pipeline preferred with new-infra cost flagged**.

"Free" here means **free AND redistributable in a commercial product**. Every
source below has been checked on that basis; the ones that fail it are named in
Section 7 rather than quietly dropped.

---

## 0. The one finding that outranks the rest

**Corrected 2026-09-14 (second pass).** An earlier draft of this section said
there was no terrain raster in the fit. That was wrong: a 500 m DEM *is* in the
pipeline. `consolidate_history.py` - "Station elevation detrends the
observations and DEM elevation retrends the grid" - and
`verify_week.build_grid_elevation()` reads it from the grid CSV's `elevation`
column.

What is absent is **everything else terrain**: slope, aspect, topographic
position index, sky-view factor, cold-air drainage accumulation. Elevation
enters as a single scalar lapse rate and nothing more.

The distinction is the whole argument, because **the lapse retrend is already
applied and the error survives it.**
`backend/scripts/interpolation/era_offset.py` documents the residual in its own
words:

> Alexandra ... reads -0.14 degC against its own co-located CLIFLO twin, so it
> is not biased, yet the fitted surface above it is still 76 GDD10 low. ... The
> DB has no thermometer above 488 m within 150 km of there, so the smoother
> pulls a continental interior toward the coastal regime, and no amount of
> station hygiene changes that.

A station that is correct, under a surface that is wrong, *after* the lapse
correction has run, is a **missing-covariate error** - and `era_offset` is an
empirical patch over it. Cold-air pooling is a function of basin geometry, not
of height, so no single lapse rate can represent it however well the elevation
is known. The structural fix is the **rest of the terrain** - slope, aspect,
TPI, sky-view factor, drainage accumulation - derived from a DEM finer than the
500 m grid and carried into the fit as covariates. Free, static, and it lands in
the raster pipeline that already exists.

Everything else here is new product. This one is **repair of a known,
documented, quantified defect** in the thing already shipped, and it should be
read as the first recommendation regardless of what is done with the rest.

---

## 1. Four integration shapes (this is the cost model)

Every source below is tagged with one of these. The tag *is* the build estimate.

| Shape | What it means | What it touches | Relative cost |
|---|---|---|---|
| **A - Raster into the surface pipeline** | Gridded national product at 100 m or coarser. Reproject to the NZ grid, write LERC COG to `auxein-climate-surfaces` under `surfaces/v2/`, index in `surface_run`, roll to zones via `aggregate_zone_daily_surface.py`, serve from `/api/v1/surfaces`. | Existing. Vocabulary entry in SURFACE_CONTRACT_V2 section 1.2. | **Low** |
| **B - Point extraction** | Sample an existing raster at `insights_site.latitude/longitude` into `insights_site_daily` / `_monthly`. | Existing, same code path as the climate extraction. | **Very low** (once A exists) |
| **C - HTTP feed, no raster** | An API returns rows. Straight into `ingestion/sources/` beside `ecan_air.py`, a table, a GiST index. | Existing ingest framework. | **Very low** |
| **D - Field-scale imagery** | 10-30 m pixels over a 5 ha block. Does **not** fit the surface pipeline - `resolution_m` is a controlled vocabulary of `500/1000/2000/5000` and a 5 ha block is a single cell at 500 m. Needs per-block clipping, a zonal-statistics time series, and on-demand tiling. | **New store, new serving path, new tenancy model.** | **High** |

**Shape D is the whole Grow imagery question.** It is not a variation on the
surfaces work; it is a second raster system with per-company access control.
Treating it as "just another surface" is the main way this goes wrong.

---

## 2. Tier 1 - build first

### 2.1 Copernicus DEM GLO-30 + LINZ 1 m LiDAR DEM

| | |
|---|---|
| **Source** | ESA Copernicus DEM GLO-30, AWS Open Data `copernicus-dem-30m`, free and commercially usable, global. NZ: LINZ national LiDAR DEM 1 m, CC-BY 4.0, where flown. AU: Geoscience Australia 5 m / 1 s DEM, CC-BY 4.0. |
| **Integration** | **Shape A**, and the easiest possible instance of it - static, one ingest, no schedule, no latency, no continuity risk. |
| **Frequency** | Static. Ingested once, revised on a multi-year cycle. |
| **Data type** | Elevation raster (GLO-30 is a DSM; LINZ is a true DEM). COG. |
| **Use case - Insights** | Terrain covariates in the interpolation fit. Directly attacks the Central Otago `cv_rmse` problem and the frost coverage artefact already documented in the per-region CV work. Also makes the withheld frost band defensible for the first time. |
| **Use case - Grow** | Per-block slope, aspect, elevation range, frost-pocket map, cold-air drainage path. Aspect-corrected ripening. Row direction against slope for erosion and machinery. Runoff and sediment risk (forestry slash, a live NZ regulatory exposure). |
| **Modelling** | Regression-kriging / external drift on Tmin with elevation + TPI + a cold-air pooling index; slope-aspect correction on `solar_rad` (`backend/models/Radiation_Correction.py` already exists and currently has no terrain grid to act on); TWI for soil wetness priors in the water balance. |
| **Expansion** | Every industry, immediately. Terrain is the universal covariate - pasture growth, arable waterlogging, forestry harvest planning, horticulture frost. It also unlocks a defensible 500 m or finer product where the current 1000 m grid is limited by station geometry rather than by data. |

**Recommendation: do this one first, and treat it as interpolation repair rather
than as a new feature.**

---

### 2.2 Sentinel-2 MSI, and NASA HLS as the harmonised path

| | |
|---|---|
| **Source** | ESA Copernicus. Free, full and open, **commercial use explicitly permitted**. Access options in order of practicality: **Microsoft Planetary Computer** STAC (free, token, no egress charge); **AWS Open Data** `sentinel-s2-l2a-cogs` via Element84 Earth Search STAC (no auth, but us-west-2 - egress to ap-southeast-2 costs); **Copernicus Data Space Ecosystem** (free with quotas, Europe-hosted, and large-scale download moves to commercial terms - see Section 7). **NASA HLS v2.0** harmonises Landsat 8/9 with Sentinel-2 A/B/C onto a common 30 m grid, near-global, **median repeat under 1.4 days in 2025 with five satellites**, 2-3 day latency, COG on Earthdata Cloud with an Earthdata login. |
| **Integration** | **Shape D** for Grow (per-block). **Shape A** is possible for Insights only if aggregated to a coarse regional anomaly first. |
| **Frequency** | Sentinel-2 nominal 5-day (2B + 2C), better while the **2A extension runs to 31 Dec 2026**. Effective usable revisit in NZ is materially worse - cloud. Assume 10-20 days of usable optical in a South Island winter and roughly weekly in summer. HLS at under 1.4 days median repeat is the answer to that, at 30 m instead of 10 m. |
| **Data type** | 13 bands; 10 m visible/NIR, 20 m red-edge and SWIR; L2A surface reflectance. HLS is 30 m, all-band harmonised, with a vegetation-indices companion product. |
| **Use case - Grow** | Within-block vigour and variability; zoning a block for differential pruning and selective harvest; canopy development curve against the phenology model already built; inter-row cover and bare-soil fraction; missing-vine and replant-patch detection; **validating `vineyard_blocks.geometry` against where the canopy actually is** - a quiet data-quality win across the whole tenant base. |
| **Use case - Insights** | Regional vigour anomaly against a long-term mean. Note the gating rule already established: **nothing regional is Pro**, so the Insights expression of this is free-tier colour and the monetisable expression is per-block in Grow. |
| **Modelling** | **NDRE over NDVI** for vines - NDVI saturates over a developed canopy, and the red-edge bands are the reason 20 m matters. LAI and FAPAR via the SNAP biophysical processor. NDVI-to-Kc for the crop coefficient in the water balance (see 3.2). **The honest constraint: a vineyard at 2.4 m row spacing inside a 10 m pixel is a mixture of canopy, inter-row sward and shadow. Absolute index values across blocks are not comparable and must not be presented as such.** Only within-block relative patterns and same-block time-series deltas survive scrutiny. Orchards and closed-canopy crops do not have this problem; pasture and arable have it least of all. |
| **Expansion** | The same pipeline serves pipfruit and kiwifruit (better - closed canopy), arable (excellent - uniform canopy, clear phenology), and pasture (excellent - the feed wedge is the single largest addressable use case in NZ primary industry by hectare). |

---

### 2.3 NASA FIRMS active fire

| | |
|---|---|
| **Source** | NASA LANCE FIRMS REST API. Free with a registered MAP_KEY, 5000 transactions per 10 minutes. MODIS (Terra/Aqua), VIIRS (S-NPP, NOAA-20, NOAA-21) at 375 m, and Landsat. Global detections within **3 hours** of observation. |
| **Integration** | **Shape C.** The lowest-build item in the document - an HTTP GET returning CSV, a table, a GiST index, a row in `run_all.sh`. It reuses the ingestion framework verbatim. |
| **Frequency** | 4-6 satellite passes per day over NZ/AU, 3 h latency. |
| **Data type** | Point detections: lat/lon, acquisition time, fire radiative power, confidence, sensor. Not a raster. |
| **Use case - Grow** | **Smoke taint exposure for viticulture.** The highest-differentiation, lowest-cost pairing available: FIRMS detections plus the phenological stage model already built. Smoke sensitivity concentrates between veraison and harvest, which Grow already knows per block. An exposure flag with the stage weighting attached is a product nobody in this market currently sells. Australia's 2020 vintage losses are the commercial argument and they are not hypothetical. |
| **Use case - Insights** | Regional fire and burn activity layer; forestry risk; pastoral burn detection; post-event evidence for insurance and compliance. |
| **Modelling** | FRP-weighted, distance-decayed exposure along an upwind back-trajectory, staged by phenology. **Honest limit: without a dispersion model this is a risk flag, not a dose.** Do not label it a concentration. Corroborate with the Sentinel-5P UV aerosol index or Himawari AOD before escalating a flag to an alert. Note that **wind is not currently ingested as a modelled surface** - `climate_historical.wind_speed` is commented "for future" - so the trajectory term needs a wind field first. |
| **Expansion** | Forestry (fire risk and post-fire assessment), pastoral (burn compliance), and a cross-Tasman story that works better in Australia than in New Zealand - which is the right shape for the AU expansion. |

---

### 2.4 VIIRS land surface temperature and vegetation

| | |
|---|---|
| **Source** | NASA LP DAAC. VIIRS VNP21 (LST, 750 m, twice-daily) and VNP13 (vegetation indices, 500 m, 16-day). Free, no redistribution restriction. **Prefer VIIRS over MODIS** - Terra and Aqua are far past design life and their orbits have drifted, which corrupts the overpass-time consistency any LST time series depends on. |
| **Integration** | **Shape A** for the LST grid; **Shape B** for site extraction. |
| **Frequency** | Day and night overpass, daily, cloud permitting. |
| **Data type** | Land surface temperature (skin), emissivity, NDVI/EVI. |
| **Use case - Insights** | **Night LST as a covariate in the Tmin fit.** After terrain, the second-largest available improvement to the interpolation, because it observes the space *between* the 805 stations, which is exactly where the surface is currently unconstrained. Also drought and dry-spell context, and regional pasture growth. |
| **Use case - Grow** | Limited directly - 750 m is coarser than most blocks. Value is indirect, through a better Tmin surface. |
| **Modelling** | LST as an external covariate in the ridge/GCV fit, or as an independent validation surface for `verify_week`. **Two failure modes to design against, both of which this platform has hit before in other guises:** (1) **LST is skin temperature, not 1.5 m air temperature** - the relationship is land-cover and wind dependent and must be fitted, never assumed; (2) **cloud gaps are not missing at random.** Cloudy nights are the warm, humid, non-frost nights. Gap-filling LST naively imports a cold bias into exactly the nights the frost product cares about. Structurally the same defect as the accumulator-reading-its-own-output bug and the incremental-window seam. |
| **Expansion** | Pastoral and arable drought monitoring at regional scale; irrigation scheduling context; the thermal half of any future ET model that does not depend on Landsat. |

---

### 2.5 Himawari-9 AHI

| | |
|---|---|
| **Source** | JMA, distributed by NOAA, **AWS Open Data `noaa-himawari9`**, free and openly redistributable. Full-disk archive back to July 2015. |
| **Integration** | **New infra, but bounded.** Not Shape A as it stands - this is raw radiance requiring a retrieval step before it becomes a surface. A NZ+AU window subset at 2-3 bands is tractable; the full disk every 10 minutes is not something to pull to ap-southeast-2 casually. |
| **Frequency** | **10 minutes.** The only sub-hourly observation available anywhere on this list, and the only route to a *nowcast* product tier. |
| **Data type** | 16 bands, 500 m to 2 km, visible through thermal IR. |
| **Use case - Insights** | Solar radiation at 10 min / 5 km, where the station network for `solar_rad` is thinnest. Cloud fraction. Fog. |
| **Use case - Grow** | **Frost nowcasting.** Radiative frost requires clear sky and calm air; a 10-minute cloud mask over a block, combined with the Tmin surface and terrain-derived cold-air pooling, is a several-hour lead-time alert on the specific nights that matter. That is an operational alert with direct dollar value, not an analytic. Also spray-window clear-sky input and smoke-plume confirmation via AOD. |
| **Modelling** | Surface shortwave radiation from AHI cloud properties by look-up table is an established published method at 10 min / 5 km; a cheaper first pass is a clear-sky index from the visible band modulating a clear-sky model. **Caveat that must be stated in any product built on it: New Zealand sits near the edge of the disc at 140.7E.** The viewing angle over Otago and Southland is oblique, which degrades parallax and cloud-height geometry exactly where the frost risk is highest. Validate against the station network before publishing a southern frost nowcast. |
| **Expansion** | Nowcasting is a different commercial tier from a daily archive, and this is the only free source that supports it. It is also a genuine differentiator - not a repackaging of anything a competitor can buy. |

---

## 3. Tier 2 - high value, new infrastructure

### 3.1 Sentinel-1 SAR

| | |
|---|---|
| **Source** | ESA Copernicus, free and commercially usable. **Constellation status as of Sept 2026: 1A ended operations around July 2026; 1C (launched Dec 2024) and 1D (launched 4 Nov 2025, user data open 17 Apr 2026) are the operational pair, with the 6-day nominal revisit re-established between them in late June 2026.** |
| **Integration** | **Shape D, with a shortcut.** Raw GRD needs radiometric terrain correction, which is a real processing pipeline (SNAP or equivalent). **Microsoft Planetary Computer publishes Sentinel-1 RTC as analysis-ready COG for free**, and Digital Earth Australia publishes AU backscatter - taking either avoids building the SAR processor entirely. Take the shortcut. |
| **Frequency** | 6 days, **regardless of cloud**. |
| **Data type** | C-band backscatter, VV/VH, 10-20 m. |
| **Use case - Grow** | The cloud-proof complement to Sentinel-2. West Coast, Southland and Taranaki have optical gaps measured in weeks. **Management-event detection is the strongest honest application: was the paddock actually grazed, was the silage actually cut, was the block actually harvested.** That maps directly onto the Grow task system and turns into a task-integrity feature - the platform can tell you whether the recorded task shows up in the ground truth. Also waterlogging and ponding, a genuine pastoral and arable constraint. |
| **Use case - Insights** | Flood extent for regional events; soil wetness anomaly. |
| **Modelling** | **Change detection is defensible; absolute soil moisture from Sentinel-1 alone is not** - vegetation structure and surface roughness confound the backscatter and the retrieval is not identifiable without ancillary data. Present it as a relative index or fuse it with a radiometer product. Note that the **Copernicus 1 km Surface Soil Moisture product is European-only**; the global equivalents are SWI at 0.1 degree and SMAP at 9 km, both far coarser. SMAP's Sentinel-1 fusion product was additionally **paused on 1 July 2026** pending migration off Sentinel-1A. |
| **Expansion** | Forestry (clear-fell detection, biomass proxy), arable (harvest progress), aquaculture (sea-surface roughness), flood insurance. |

### 3.2 Satellite evapotranspiration - and the recommendation not to build on it

| | |
|---|---|
| **Source** | ECOSTRESS on ISS, 70 m, L3 ET at global scale, COG, free (v1 deprecated Sept 2025; use `ECO_L3G_JET` / `ECO_L3T_JET` v2). MOD16A2 v6.1, 500 m, 8-day composite, free. |
| **Integration** | Shape A or B for MOD16; ECOSTRESS is irregular enough that it does not form a series. |
| **Frequency** | MOD16 8-day. **ECOSTRESS samples from a non-sun-synchronous orbit - the revisit is irregular by design.** Excellent for calibration, useless as an operational daily series. |
| **Use case** | `project_site_et_water_balance` records that no measured ET exists. The tempting move is to fill that with satellite ET. **That is the wrong call and this brief recommends against it.** |
| **Modelling** | **Build the water balance on Penman-Monteith computed from the surfaces already owned** - temperature, RH, solar radiation, plus a wind surface that does not yet exist and should be added. Use satellite ET as an **independent validation layer** and as the route to a **remotely-sensed crop coefficient** (NDVI-to-Kc from 2.2), which is the part satellites genuinely do better than a point model. This inverts the usual vendor pitch and it is the correct engineering call: a physically-based ET from owned inputs is reproducible, gap-free and explainable; a satellite ET series is none of those. |
| **Expansion** | Irrigation scheduling and water-consent compliance reporting - both regulated, both painful, both worth paying for. Irrigation compliance in Canterbury alone is a defensible standalone product. |

### 3.3 DEA Fractional Cover, and the NZ gap it exposes

| | |
|---|---|
| **Source** | Digital Earth Australia, Geoscience Australia. **Free, CC-BY 4.0.** WMS/WMTS/WCS, plus AWS and NCI. Fractional Cover splits every 30 m cell into green, brown and bare fractions **from 1986 to present**. Companion products: Water Observations from Space, DEA Land Cover, DEA Coastlines. |
| **Integration** | **Shape A** for AU. `surface_run` already carries `country_id` with a New Zealand default, and it is part of both partial unique indexes - the schema is already correct for a second country's archive, which is unusually good luck. |
| **Frequency** | Landsat-derived, roughly 16-day, 40-year archive. |
| **Use case** | Australian pastoral and arable: groundcover compliance (a regulatory requirement in several AU jurisdictions), feed availability, erosion risk, drought. Forty years of history means a real baseline rather than a three-year impression. |
| **Modelling** | Spectral unmixing into three endmembers, already done and validated by GA - consume it, do not rebuild it. |
| **Expansion** | **New Zealand has no equivalent, and this is the clearest IP opportunity in this document.** The same unmixing approach applied to Sentinel-2 over NZ at 10 m would produce a national green/brown/bare product that does not currently exist, at higher resolution than the Australian one, using a method that is published and validated. A defensible national dataset built on free inputs. |

### 3.4 Sentinel-3 OLCI and SLSTR - the aquaculture opening

| | |
|---|---|
| **Source** | ESA Copernicus, free and commercially usable. OLCI 300 m ocean colour; SLSTR 1 km sea-surface temperature. |
| **Integration** | Shape A over a coastal mask; Shape B for farm points. |
| **Frequency** | Roughly daily. |
| **Use case** | **Marine farming - a vertical with essentially no NZ SaaS incumbent.** SST drives salmon thermal stress and mortality (Big Glory Bay is the standing example); chlorophyll-a drives mussel food availability and is a harmful-algal-bloom precursor. Marlborough Sounds mussels and Southland salmon are concentrated, high-value, and currently unserved by anything resembling this platform. |
| **Modelling** | **Caveat that is not optional: NZ coastal water is optically complex (Case-2).** Standard open-ocean chlorophyll algorithms are biased there by sediment and CDOM. Use regional algorithms or, more honestly, publish anomalies against a per-pixel local climatology rather than absolute concentrations. |
| **Expansion** | An entirely new industry on the existing surface machinery. Worth a scoping conversation on its own merits rather than as a satellite footnote. |

### 3.5 Sentinel-5P TROPOMI

| | |
|---|---|
| **Source** | ESA, free. NO2, CH4, CO, SO2, UV aerosol index at 5.5 x 3.5 km, daily. |
| **Integration** | Shape A, coarse. |
| **Use case** | The **UV aerosol index is the smoke-plume confirmation layer for 2.3**, and that is its strongest role here. Methane has an obvious ESG narrative for dairy. |
| **Modelling** | **Be straight about this one: 5.5 x 3.5 km cannot attribute methane to a farm, a herd or a property.** It is regional context and nothing else. Any product implying farm-level emissions measurement from TROPOMI is wrong, and the claim would not survive a technical buyer. Regional trend only. |
| **Expansion** | Emissions reporting context if and when NZ agricultural emissions pricing lands. Watch rather than build. |

---

## 4. Tier 3 - strategic watch

| Source | Why it matters | Status |
|---|---|---|
| **GEDI + ICESat-2 canopy height** | Forestry biomass, shelterbelt mapping. Harmonised global 30 m canopy-height products now exist that fuse both with Sentinel-1/2. | Free. Sampling is transect-based, not wall-to-wall - consume a derived product rather than raw shots. |
| **PALSAR-2 annual mosaics (JAXA)** | L-band, free, annual global forest/non-forest and biomass. L-band sees structure C-band cannot. | Free, annual cadence, low effort. Good forestry adjunct. |
| **ESA WorldCover 10 m / Dynamic World** | Global 10 m land cover; Dynamic World is near-real-time. Crop-area context and a block-boundary sanity check. | Free. |
| **NISAR (NASA-ISRO)** | L- and S-band SAR, 12-day, free and open. Materially better soil moisture and biomass than Sentinel-1 if it performs to spec. | **Verify current operational status before planning around it** - not confirmed in this research pass. |
| **SWOT** | Surface water elevation. Irrigation reservoir volume without a gauge. | Free, novel, niche. |
| **Landsat archive 1984 onward** | A 40-year vigour and land-use-change baseline. The archive is safe regardless of what happens to future missions. | Free. See the continuity risk in Section 7. |
| **LINZ Imagery (AWS Open Data)** | NZ public aerial and satellite imagery under an **open licence**, COG with STAC, down to 5 cm in places, plus annual Sentinel-2 national mosaics. | Free. Excellent Grow basemap; already COG+STAC so it drops into a tile-serving path with almost no work. |
| **Manaaki Whenua LRIS - LCDB v5, S-map soils** | Not satellite, but the natural companion. Land cover and soils as covariates. | CC-BY, but **check each layer individually** - terms vary across LRIS. |

---

## 5. Industry coverage matrix

Strength of fit, and which product surface it lands on. **G** = Grow (per-block,
monetisable), **I** = Insights (regional).

| Source | Viticulture | Pipfruit/Kiwifruit | Pastoral/Dairy | Arable | Forestry | Aquaculture |
|---|---|---|---|---|---|---|
| Terrain (DEM) | **High G+I** | High G+I | High I | Med G | **High G** | - |
| Sentinel-2 / HLS | Med G (row mixing) | **High G** | **High G+I** | **High G** | Med G | - |
| FIRMS | **High G** (smoke) | Low | Med I | Low | **High G+I** | - |
| VIIRS LST/VI | Med I | Med I | **High I** | High I | Med I | - |
| Himawari | **High G** (frost) | **High G** (frost) | Med I | Med I | Med I (fire wx) | Low |
| Sentinel-1 | Med G | Med G | **High G** (grazing) | **High G** (harvest) | **High G** (clear-fell) | Low |
| Satellite ET | Med (as Kc) | High G | Med | **High G** | Low | - |
| DEA Frac Cover | Low | Low | **High G+I (AU)** | **High (AU)** | Med | - |
| Sentinel-3 | - | - | - | - | - | **High G** |
| GEDI / PALSAR | Low | Low | Low | Low | **High** | - |

**Read across the rows, not down the columns.** Terrain and Sentinel-2 pay for
themselves across every column; FIRMS and Himawari are narrow but deep;
Sentinel-3 is a separate business.

---

## 6. What satellite data cannot do

Stating this up front is cheaper than retracting a claim later, and this
platform has a documented history of finding these the hard way.

1. **It cannot measure what happens under a canopy.** Disease pressure, bunch
   condition, soil at depth, pest presence. The disease models stay
   weather-driven; satellite adds context, never the measurement.
2. **It cannot see through cloud in the optical bands, and the gaps are not
   random.** Cloudy days differ systematically from clear ones in temperature,
   humidity and disease pressure. Any composite or gap-fill imports that bias.
   Same defect class as the dry-spell scalar carry and the cumulative
   date-bound bug.
3. **A 10 m pixel over a 2.4 m row spacing is a mixture.** Absolute vigour
   indices are not comparable between blocks, varieties, or training systems.
   Only within-block relative patterns and same-block time series survive.
4. **Resolution is not accuracy.** A 70 m ET product with irregular revisit is
   worse for a water balance than a 1 km daily one, and both are worse than a
   physical model on owned inputs.
5. **Skin temperature is not air temperature**, and the difference is largest
   under exactly the conditions the frost product cares about.
6. **Nothing here substitutes for the station network.** These are covariates
   that constrain the surface between stations. They improve the interpolation;
   they do not replace the observations it is fitted to.

---

## 7. Licensing and continuity risks

| Risk | Detail | Response |
|---|---|---|
| **Landsat thermal continuity** | The FY2026 NASA budget requests **no funding for Landsat Next**, and the project is assessing cheaper architectures meeting only Landsat-9's minimum capability. Landsat 8 and 9 are both ageing; L9 had a safehold in Oct 2025. | **Do not make Landsat thermal load-bearing.** The strongest single argument for the Section 3.2 recommendation to build ET on owned inputs rather than satellite thermal. |
| **CDSE quotas** | Copernicus **Sentinel data** is free, full and open including commercial use. But CDSE applies per-account quotas, large-scale download moves to commercial terms via CREODIAS, and **other portal content is non-commercial**. | Source Sentinel data from **AWS Open Data or Planetary Computer**, not CDSE, for anything operational. Read the licence per product, not per portal. |
| **MODIS end of life** | Terra and Aqua are far beyond design life with drifted orbits. An LST series built on MODIS has a hard stop and a drift artefact ahead of it. | Build on **VIIRS** from the start. Use MODIS only for the historical baseline. |
| **Sentinel-2A retirement** | 2A is on a temporary extension to **31 Dec 2026**, after which revisit returns to the two-satellite 5-day nominal until 2D launches (not yet launched as of Sept 2026). | Do not baseline a product's cadence on 2026 revisit rates. |
| **Aggregator licences** | Convenience APIs that fuse satellite sources (Open-Meteo's satellite radiation API and similar) are often free for non-commercial use only. | Verify the commercial tier before an aggregator reaches production. Prefer the primary source. |
| **Per-layer NZ licences** | LINZ imagery and LDS are open; LRIS layers vary. | Check each LRIS layer individually before shipping. |
| **Egress** | Most open buckets are us-west-2 or us-east-1; the platform is ap-southeast-2. | Planetary Computer (no egress charge), or a one-off bulk pull into S3 for static products. Egress is the hidden cost in "free". |

---

## 8. Recommended sequence

1. **Terrain covariate grid into the interpolation.** Static, free, Shape A, and
   it repairs a defect already documented and quantified in the codebase. Expect
   the `era_offset` magnitude to fall - which is itself the test of whether it
   worked.
2. **FIRMS ingest.** Shape C, days of work, and it yields a smoke-taint product
   with no competitor. Needs a wind surface to reach its full form, which is
   worth adding on its own merits.
3. **VIIRS night LST as a Tmin covariate.** Shape A. The second structural
   improvement to the surface after terrain.
4. **Decide the Shape D question deliberately.** Per-block Sentinel-2 is the
   largest single Grow opportunity here and the largest build. It deserves its
   own scoping pass rather than being absorbed into the surfaces roadmap,
   because it is a second raster system with per-tenant access control, not an
   extension of the first.
5. **Himawari frost nowcast** once terrain exists - the two combine, and neither
   is as strong alone.
6. **Australia via DEA** when the AU expansion is real. `surface_run.country_id`
   is already shaped correctly for it.

Open questions for the next pass, listed because they change the above rather
than decorate it: whether a wind surface is in scope; whether SURFACE_CONTRACT
v2 section 1.2 treats a new `variable` as additive or as a version bump; and
whether aquaculture (3.4) is a business the company wants at all.

---

## Sources

Mission status, access terms and product specifications verified 2026-09-14:

- Sentinel-1D user data opening and future plans - https://dataspace.copernicus.eu/news/2026-4-2-sentinel-1d-user-data-opening-and-future-plans
- Sentinel-1 orbital reconfiguration dates - https://dataspace.copernicus.eu/news/2026-5-28-sentinel-1-orbital-reconfiguration-dates
- Sentinel-2A extension campaign prolonged until end 2026 - https://dataspace.copernicus.eu/news/2026-5-15-sentinel-2a-extension-campaign-prolonged-until-end-2026
- Copernicus Data Space Ecosystem terms and conditions - https://dataspace.copernicus.eu/terms-and-conditions
- NASA HLS data products - https://hls.gsfc.nasa.gov/data-products/
- NASA HLS about - https://hls.gsfc.nasa.gov/about-hls/
- NASA FIRMS API - https://firms.modaps.eosdis.nasa.gov/api/
- JMA Himawari-8/9 on AWS Open Data - https://registry.opendata.aws/noaa-himawari/
- ECOSTRESS L3 Global 70 m ET v2 - https://www.earthdata.nasa.gov/data/catalog/lpcloud-eco-l3g-jet-002
- MOD16A2 v6.1 - https://developers.google.com/earth-engine/datasets/catalog/MODIS_061_MOD16A2
- DEA Fractional Cover - https://knowledge.dea.ga.gov.au/data/product/dea-fractional-cover-landsat/
- DEA data and products - https://www.dea.ga.gov.au/products
- Copernicus SSM 1 km Sentinel-1D integration - https://land.copernicus.eu/en/production-updates/integration-of-sentinel-1d-data-in-surface-soil-moisture-ssm-1-km-v1-product
- SMAP/Sentinel-1 L2 soil moisture - https://nsidc.org/data/spl2smap_s/versions/3
- Landsat, What's Next? (CRS) - https://www.congress.gov/crs-product/IN12281
- Landsat Next - https://science.nasa.gov/mission/landsat/landsat-next/
- New Zealand Imagery on AWS Open Data - https://registry.opendata.aws/nz-imagery/
- LINZ aerial imagery access - https://www.linz.govt.nz/products-services/data/types-linz-data/aerial-imagery/access-aerial-imagery
- LCDB v5.0 (LRIS) - https://lris.scinfo.org.nz/layer/104400-lcdb-v50-land-cover-database-version-50-mainland-new-zealand/
