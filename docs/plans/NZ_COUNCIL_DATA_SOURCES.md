# NZ Council & Aggregator Environmental Data Sources

**Purpose:** Source map for Auxein's environmental data moat — every NZ regional council, unitary authority, and notable district/city council assessed for *programmatic* access to weather/rainfall, river flow/level, groundwater, and irrigation/water-take restriction data.

**Compiled:** 2026-06-25 · **Method:** deep multi-source web research (5-angle fan-out, 23 sources fetched, 25 claims adversarially verified 3-vote). Confidence is marked per row.

**Confidence legend:**
- ✅ **Verified** — endpoint/platform confirmed live or via primary source during this research (3-0 or 2-1 vote).
- 🟡 **Lead** — strong single-source signal (council page / vendor case study) but not independently re-verified. Confirm before building.
- ⚪ **Unknown** — no source found in this pass. *Absence of a finding is not absence of a source* — needs a dedicated probe.

> ⚠️ Server version strings and exact site counts drift over time; **URL patterns are stable**. Treat counts as order-of-magnitude.

---

## 1. TL;DR for engineering

1. **Build one Hilltop client and you unlock most of the country.** NZ regional councils overwhelmingly converge on **three** hydrometric platforms — **Hilltop Server** (NZ-built), **AQUARIUS WebPortal** (Aquatic Informatics/Danaher), and a long tail of **ArcGIS Hub** open-data portals. Hilltop is the single highest-leverage target: one stable, **key-free** URL pattern (`http://host/data.hts?Service=Hilltop&Request=...`) verified live at **Marlborough, Otago, Greater Wellington, Hawke's Bay, and Horizons**. Same request grammar (`SiteList` / `MeasurementList` / `GetData`) across all of them → one connector, many councils.

2. **Build a second generic connector for AQUARIUS WebPortal.** Confirmed at **Otago** (`envdata.orc.govt.nz/AQWebPortal`), **NIWA national** (`hydrowebportal.niwa.co.nz`), and (leads) **Bay of Plenty** and **Auckland**. Distinct vendor/stack from Hilltop — different connector, but again reusable across councils.

3. **ECan is the odd one out — and the most valuable for irrigation.** Environment Canterbury runs a modern, **gated** Azure-APIM developer portal (`apidevelopers.ecan.govt.nz`) with an *Environmental Observations API* (river flow @155 sites) and a *Water Abstraction API* — plus **daily irrigation-restriction data with numeric trigger levels (m³/s) and restriction bands**. This is the scarcest and most moat-relevant domain. Requires registration + `Ocp-Apim-Subscription-Key`.

4. **Aggregators don't (yet) beat per-council integration.** **LAWA** aggregates all 16 councils but only as **manual bulk download (Excel/Google Sheets), no documented API** — useful for backfill/reference, not live ingestion. **NIWA Hydro Web Portal** is AQUARIUS-based (national river data) and is the best single national vector once the AQUARIUS connector exists.

5. **District/city councils are mostly empty** for this domain (environmental monitoring is a Regional Council RMA function). Christchurch City's open-data portal carries **no** hydrological/weather telemetry — only static District Plan layers. Treat TAs as opportunistic, not core.

---

## 2. What Auxein already ingests (baseline)

| Source | Domain | Access | Notes |
|---|---|---|---|
| **Tasman DC (TDC)** | Weather/rainfall (+ hydro) | Custom integration | Already wired. Platform not re-assessed here; TDC is a unitary authority and a likely Hilltop/AQUARIUS candidate worth confirming for river/groundwater expansion. |
| **Gisborne DC (GDC)** | Weather/rainfall (+ hydro) | Custom integration | Already wired (5 stations: 1 climate + 4 rainfall). Unitary authority; confirm whether a Hilltop/AQUARIUS endpoint exists for river/bore expansion. |
| **NOAA NCEI** | Weather/climate baseline | GHCNh hourly + GHCN-Daily | Credential-free historical/baseline. |
| **MetService / WMO SYNOP** | Weather | Ogimet scrape | SYNOP-only zones flagged with rainfall-coverage badge. |

The councils below are the **expansion targets** that layer river flow, groundwater, and irrigation-restriction data on top of this weather baseline.

---

## 3. Platform landscape (the reusable connectors)

### 3a. Hilltop Server — the priority connector ✅
- **Vendor:** Hilltop Software (NZ). De-facto standard for NZ council hydrometry.
- **Access:** Native HTTP API, **plain HTTP, no auth, no API key**.
- **Endpoint pattern:** `http://<host>/<file>.hts?Service=Hilltop&Request=<type>`
- **Core requests:**
  - `Status` → agency name + server version.
  - `SiteList` → all sites; `Location=Yes` (NZTM easting/northing) or `Location=LatLong` (NZGD2000 lat/long); supports **BBox** filter (lat/long, NZMG, NZTM2000) and **Measurement** filter (only sites carrying a given measurement).
  - `MeasurementList` → variables available per site + their time range.
  - `CollectionList` → named groupings.
  - `GetData` → time series. Default = Hilltop XML, **ISO8601** timestamps. `Format=WML2` → OGC **WaterML 2** (+ server-side stats). `Format=Native` → original Mowsecs.
- **Also exposes OGC services on the same host:** full **WFS** (`GetCapabilities`/`DescribeFeatureType`/`GetFeature`) and a restricted **SOS** (`GetCapabilities`+`GetObservation` only, WaterML 2 output). MDC's WFS declares feature types `SiteList`, `MeasurementList`, `MonitoringSiteReferenceData`, `BoreReferenceData`, `BoreInfo` (EPSG:4326/2193, GML 3.1.1, BBOX).
- **Open-source clients:** `hilltop-py` (Python — note: wrapper lacks BBox even though the server supports it), `jeffcnz/Hilltop` (R).
- **Reference doc:** HBRC "Hilltop Server" PDF (dated 2016/17 but API is stable & still-live).

> **Engineering takeaway:** write a `HilltopClient` that takes a base `.hts` URL + agency label, and a thin per-council config (host, file, known measurement names). `SiteList`+`MeasurementList` give full self-discovery, so onboarding a new Hilltop council is mostly a config row.

### 3b. AQUARIUS WebPortal — the second connector ✅/🟡
- **Vendor:** Aquatic Informatics (Danaher).
- **Signature:** URL path contains `/AQWebPortal`; page footer renders `AQUARIUS WebPortal v<x>` + "Aquatic Informatics".
- **Access:** Web portal (dashboards). Programmatic access is via the AQUARIUS **Publish API** / data export endpoints rather than Hilltop's simple URL grammar — a structurally different, heavier connector. Auth requirements per-council still to be confirmed.
- **Confirmed installs:** Otago RC (`envdata.orc.govt.nz/AQWebPortal`), NIWA national (`hydrowebportal.niwa.co.nz`, v2025.3.37). **Leads:** Bay of Plenty (`envdata.boprc.govt.nz`), Auckland (`environmentauckland.org.nz`).

### 3c. ArcGIS Hub open-data portals — geospatial, not time-series ⚪/🟡
- **Vendor:** Esri. Used by Auckland, Waikato (LASS), Christchurch, GWRC for **open geospatial data**.
- **Access:** ArcGIS GeoServices **REST** (`/arcgis/rest/...`), multi-format export (JSON/GeoJSON/PBF/CSV/Shapefile/KML), **no key** for public layers, ~1,000 records/query. Typically CC-BY 4.0 per item.
- **Caveat:** These portals mostly carry **site reference/geometry and static layers, not live telemetry time series.** Good for *station metadata & spatial joins*, not for the rainfall/flow feed itself (which lives in Hilltop/AQUARIUS). Christchurch's portal had **no** monitoring datasets at all.

### 3d. ECan Developer Portal (Azure APIM) — gated REST/GraphQL ✅
- **Endpoint:** `apidevelopers.ecan.govt.nz` (sign-up). GraphQL at `apis.ecan.govt.nz/waterdata/observations/graphql`.
- **Auth:** **Required** — `Ocp-Apim-Subscription-Key` header; unkeyed requests rejected.
- **APIs:** *Environmental Observations API* (river flow @155 river/lake sites, rainfall, freshwater, air quality; csv/json/xml) + separate *Water Abstraction API* (consent/allocation/take). ECan **also** runs an open `data.ecan.govt.nz` and Hilltop `.hts` endpoints — so there may be an unauthenticated path too.

### 3e. LAWA (Land Air Water Aotearoa) — aggregator, download-only 🟡
- **What:** National aggregator of all 16 regional/unitary councils (+ Cawthron, MfE, Massey). Domains include water quality, water quantity (river flow, rainfall, groundwater levels, water use).
- **Access:** **Bulk download only — Excel (.xlsx) / Google Sheets. No documented public API.** Most datasets CC-BY 4.0 (commercial use OK). Water-quantity coverage is **incomplete** across councils.
- **Use for Auxein:** historical backfill & cross-council reference, **not** live ingestion. (A LAWA site-reference layer is also exposed via an Auckland-hosted ArcGIS MapServer `NonCouncil/LAWA` in JSON/GeoJSON/PBF.)

---

## 4. Master comparison table (council × access)

> Domains: **W** = weather/rainfall · **R** = river flow/level · **G** = groundwater/bores · **I** = irrigation/water-take restrictions & consents.
> "Platform" is the primary programmatic vector. Counts are approximate.

| Council | Type | Primary platform | Base endpoint | Auth | Domains | ~Sites | Format / freq | Licence | Conf. |
|---|---|---|---|---|---|---|---|---|---|
| **Marlborough DC** | Unitary | Hilltop | `hydro.marlborough.govt.nz/data.hts` | None | W R G I | **~4,439** (incl. vineyards, irrigation takes, wells) | XML/WaterML2 · telemetry | TBC | ✅ |
| **Otago RC** | Regional | Hilltop **+** AQUARIUS | `gisdata.orc.govt.nz/hilltop/Global.hts` · `envdata.orc.govt.nz/AQWebPortal` | None (Hilltop) | W R G | ~1,100–1,270 (Hilltop); 250+ (AQUARIUS) | XML/WaterML2 · real-time | TBC | ✅ |
| **Greater Wellington RC** | Regional | Hilltop | `hilltop.gw.govt.nz/Data.hts` | None | W R G | hundreds | XML/WaterML2 · real-time | TBC | ✅ |
| **Hawke's Bay RC** | Regional | Hilltop | `data.hbrc.govt.nz/envirodata/emar.hts` (+ `EMARDiscrete.hts`) | None | W R G | 100+ wells; full climate set | XML/WaterML2 · telemetered + manual | **CC-BY 4.0** | ✅ |
| **Horizons (Manawatū-Whanganui) RC** | Regional | Hilltop | `*.hts` (confirmed Hilltop agency) | None | W R G | TBC | XML/WaterML2 | TBC | ✅ |
| **Environment Canterbury (ECan)** | Regional | Azure APIM REST/GraphQL (+ open `data.ecan.govt.nz`, Hilltop `.hts`) | `apidevelopers.ecan.govt.nz` · `apis.ecan.govt.nz/waterdata/observations/graphql` | **Key req.** | W R G **I** | 155 river/lake (flow) | json/xml/csv · **daily restrictions (3pm/5pm)** + real-time obs | API terms TBC | ✅ |
| **NIWA (national)** | Aggregator | AQUARIUS | `hydrowebportal.niwa.co.nz` (v2025.3.37) | TBC | R (W/G unconfirmed) | national | AQUARIUS export | TBC | ✅ |
| **LAWA** | Aggregator | Bulk download | `lawa.org.nz/download-data` | None | W R G I (partial) | all 16 councils | **xlsx / Google Sheets, no API** | mostly CC-BY 4.0 | 🟡 |
| **Bay of Plenty RC** | Regional | AQUARIUS | `envdata.boprc.govt.nz` | TBC | W R G | TBC (AQUARIUS since 2014) | AQUARIUS export | TBC | 🟡 |
| **Auckland Council** | Unitary | AQUARIUS (`environmentauckland.org.nz`) + ArcGIS Hub (`data-aucklandcouncil.opendata.arcgis.com`) | portal + `services1.arcgis.com/n4yPwebTjJCmXB6W/...` | None (ArcGIS) | W R G | live rainfall 24h totals at all rain sites | AQUARIUS + ArcGIS REST (GeoJSON/CSV) | likely CC-BY 4.0 | 🟡 |
| **Waikato RC** | Regional | ArcGIS Hub (`data-waikatolass.opendata.arcgis.com`, via Waikato LASS) | ArcGIS REST | None | (geo layers; telemetry TBC) | TBC | GeoJSON/CSV | CC-BY 4.0 | 🟡 |
| **Tasman DC** | Unitary | *Already integrated (custom)* | — | — | W (+R/G TBC) | — | — | — | ✅ (own) |
| **Gisborne DC** | Unitary | *Already integrated (custom)* | — | — | W (+R/G TBC) | 5 | — | — | ✅ (own) |
| **Northland RC** | Regional | ⚪ likely Hilltop/AQUARIUS | TBC | TBC | TBC | TBC | TBC | TBC | ⚪ |
| **Taranaki RC** | Regional | ⚪ | TBC | TBC | TBC | TBC | TBC | TBC | ⚪ |
| **Nelson City** | Unitary | ⚪ (shares some monitoring with TDC) | TBC | TBC | TBC | TBC | TBC | TBC | ⚪ |
| **West Coast RC** | Regional | ⚪ | TBC | TBC | TBC | TBC | TBC | TBC | ⚪ |
| **Environment Southland** | Regional | ⚪ likely Hilltop | TBC | TBC | TBC | TBC | TBC | TBC | ⚪ |
| **Christchurch City** | TA | ArcGIS Hub | `opendata-christchurchcity.hub.arcgis.com` | None | **none (static District Plan only)** | 0 env | — | CC-BY 4.0 | ✅ (negative) |
| **Dunedin City / Wellington Water / Watercare** | TA/CCO | ⚪ | TBC | TBC | water-supply telemetry possible | TBC | TBC | TBC | ⚪ |

---

## 5. Per-council notes

### Verified Hilltop councils (build first)
- **Marlborough DC** ✅ — Live Hilltop `v2404.x`, agency "Marlborough DC", **no auth**. Deterministic count = **4,439 `<Site>`** elements. Named sites include `1323 Brancott Vineyard`, `Wither Hills Vineyard`, `1156 Hoare Irrigation`, `0074 Robbins Irrigation Well`, `Awatere River at Mouth`. **The single most viticulture-relevant council** — vineyard + irrigation-take + bore sites directly on a key-free API. Top priority.
- **Otago RC** ✅ — Two stacks: Hilltop (`gisdata.orc.govt.nz/hilltop/Global.hts`, agency "ORC" v2.10, ~1,100–1,270 sites: streams, rivers, lakes, bores, AWS weather) **and** AQUARIUS (`envdata.orc.govt.nz/AQWebPortal`, switched Nov 2023, 250+ water sites). Use the Hilltop endpoint; it's the simpler vector. Central Otago = significant viticulture.
- **Greater Wellington RC** ✅ — `hilltop.gw.govt.nz`, agency "GWRC" v2509.x, no auth, hundreds of sites (rivers, streams, wells, beaches, rainfall, WQ). Wairarapa viticulture relevance.
- **Hawke's Bay RC** ✅ — `data.hbrc.govt.nz/envirodata/emar.hts` (+ discrete sibling). **Explicit CC-BY 4.0.** Full climate variable set verified verbatim: soil moisture, soil temp, air temp, wind speed/direction, humidity, solar radiation — plus river level/flow, telemetered + non-telemetered rainfall, groundwater level/quality across **100+ wells**. Major wine region; richest verified variable set. *Note: direct page fetch returns 403 to bots — hit the `.hts` endpoint, not the HTML.*
- **Horizons RC** ✅ — Hilltop endpoint confirmed (agency level). Site/variable census still to run.

### Verified non-Hilltop
- **ECan** ✅ — See §3d. The **only verified source of structured irrigation-restriction data**: per-site current/projected flow, restriction **band** (e.g. "Band 1"), **trigger level in m³/s**, consent groups, computed on **24-hour average flow**, updated **daily** (3pm telemetered / 5pm field-gauged). Gated behind a subscription key. *The river-flow dashboard being "dashboard-only with no API" was refuted (0-3) — programmatic paths exist; map the open `data.ecan.govt.nz` + `.hts` options before assuming you must use the keyed API.* Canterbury irrigation = high commercial value.
- **NIWA** ✅ — National AQUARIUS portal. Best single national river vector once an AQUARIUS connector exists. **Caveat:** the claim it also serves groundwater/WQ/climate was **refuted (1-2)** — treat as river-flow/hydrometry until proven otherwise.

### Leads to confirm
- **Bay of Plenty RC** 🟡 — AQUARIUS (`envdata.boprc.govt.nz`), running since 2014. Confirm export API + auth.
- **Auckland Council** 🟡 — AQUARIUS portal (`environmentauckland.org.nz`, live 24h rainfall totals at all rain sites) **plus** ArcGIS Hub open data (REST/GeoJSON/CSV, no key). Big rainfall network.
- **Waikato RC** 🟡 — ArcGIS Hub via Waikato LASS (`data-waikatolass.opendata.arcgis.com`). Confirm whether hydrometry time series is exposed or only geo layers; check for a separate Hilltop/AQUARIUS host.

### Unknown (need a dedicated probe)
- **Northland, Taranaki, Nelson City, West Coast, Environment Southland** ⚪ — no source surfaced this pass. Most are likely Hilltop or AQUARIUS (NZ council norm). First step: probe `data.<council>.govt.nz/*.hts?Service=Hilltop&Request=Status` and look for an `/AQWebPortal` path.
- **District/city & water CCOs** (Dunedin City, Wellington Water, Watercare) ⚪ — may hold water-supply/reservoir telemetry; not core environmental monitoring. Christchurch City confirmed **empty** of env data.

---

## 6. Recommended ingest order

Given the existing weather baseline (TDC, GDC, NOAA, SYNOP), prioritise the **new domains** (river, groundwater, irrigation restrictions) where the lift is lowest:

1. **Build the `HilltopClient`** (key-free, self-discovering). Onboard in this order — all verified, all no-auth:
   1. **Marlborough DC** — vineyard/irrigation/bore goldmine, 4,400+ sites.
   2. **Hawke's Bay RC** — CC-BY 4.0 confirmed, full climate + river + 100+ wells.
   3. **Otago RC** (Hilltop endpoint) — Central Otago viticulture.
   4. **Greater Wellington RC** — Wairarapa.
   5. **Horizons RC** — fills the lower North Island.
2. **Probe the ⚪ councils** for `.hts` / `/AQWebPortal` (Northland, Taranaki, Southland, Nelson, West Coast) and fold the Hilltop ones into the same client config.
3. **Build the `AquariusClient`** (AQUARIUS Publish/export API) → unlocks Otago (2nd stack), Bay of Plenty, Auckland, and **NIWA national** in one connector.
4. **ECan integration** (keyed) — register for `apidevelopers.ecan.govt.nz`; ingest the **Environmental Observations API** and especially the **irrigation-restriction / Water Abstraction** data. Highest-value *unique* domain (low-flow triggers + allocation), worth the auth friction.
5. **LAWA bulk download** as a one-off **historical backfill / cross-council reference** layer — not a live feed.

**Reusable-connector payoff:** two clients (Hilltop + AQUARIUS) plausibly cover **10+ councils + NIWA national**; ECan is the one bespoke build. That is the efficient shape of the moat.

---

## 7. Caveats & open questions

**Caveats (from the research pass):**
- Server versions/URLs current as of **June 2026**; URL patterns stable, version strings drift.
- Large-`SiteList` counts from LLM reads are unreliable — authoritative grep gives MDC = **4,439**, ORC ≈ **1,100–1,270**. ECan **155** flow sites is from the API page.
- Several council HTML pages return **HTTP 403 to bots** (HBRC especially) — corroborated via the live `.hts` endpoints and search index, not page fetch. Hit the data endpoint, not the marketing page.
- The HBRC Hilltop PDF is dated 2016/17 (stable, still-live features, but old).
- **Coverage is incomplete:** firm findings only for HBRC, MDC, ORC, GWRC, Horizons, ECan (Hilltop/APIM) + ORC/NIWA (AQUARIUS). **No verified finding** for Northland, Taranaki, Nelson, West Coast, Southland, or the named TAs/CCOs.
- **LAWA aggregator API not verified** — only confirmed as bulk download. **Kisters WISKI** was hypothesised but **no NZ council was confirmed on it** in this pass.
- NIWA portal domain breadth beyond river data was **explicitly refuted**.

**Open questions for the next research pass:**
1. Platform census for the ~10 unverified councils (Hilltop vs AQUARIUS vs WISKI) — sizes the reusable-connector payoff precisely.
2. Is ECan's irrigation/low-flow/consent data reachable via the keyed **Water Abstraction API** programmatically, or only the dashboard? **Do any *other* councils expose water-take/consent allocation at all?** (Scarcest, highest-value domain.)
3. Does **LAWA** or **NIWA Environmental Data Explorer / NEON** expose a real programmatic aggregation API that would beat per-council Hilltop for breadth?
4. Exact licensing per platform — HBRC = CC-BY 4.0 confirmed; is CC-BY uniform across Hilltop/AQUARIUS councils? ECan API subscription terms + rate limits?
5. Confirm **TDC & GDC** (already integrated) platform — if they're Hilltop/AQUARIUS, the new client could replace/extend the custom code and add river/groundwater for free.

---

## 8. Appendix — Hilltop quick reference (for the connector)

```
# Server identity
http://<host>/<file>.hts?Service=Hilltop&Request=Status

# All sites with lat/long (NZGD2000), filtered to a measurement, within a bbox
http://<host>/<file>.hts?Service=Hilltop&Request=SiteList&Location=LatLong&Measurement=Flow&BBox=<minLat,minLon,maxLat,maxLon>

# Variables + time ranges available at a site
http://<host>/<file>.hts?Service=Hilltop&Request=MeasurementList&Site=<site>

# Time series (ISO8601 XML default; add &Format=WML2 for OGC WaterML 2)
http://<host>/<file>.hts?Service=Hilltop&Request=GetData&Site=<site>&Measurement=<m>&From=<ISO>&To=<ISO>

# OGC alternatives on the same host
...?Service=WFS&Request=GetCapabilities
...?Service=SOS&Request=GetObservation   # WaterML 2 only
```

**Known live `.hts` hosts (no auth):**
- `hydro.marlborough.govt.nz/data.hts` (MDC)
- `gisdata.orc.govt.nz/hilltop/Global.hts` (ORC)
- `hilltop.gw.govt.nz/Data.hts` (GWRC)
- `data.hbrc.govt.nz/envirodata/emar.hts` + `.../EMARDiscrete.hts` (HBRC)

**Clients:** `hilltop-py` (Python; no BBox in wrapper — call the URL directly if you need it), `jeffcnz/Hilltop` (R).

---

## 9. Key sources

- HBRC Hilltop Server API reference (PDF) — `hbrc.govt.nz/.../20170426-HilltopServerTrimmed.pdf`
- HBRC open data / time-series — `hbrc.govt.nz/our-council/open-data/time-series-data/`
- MDC live Hilltop — `hydro.marlborough.govt.nz/data.hts`
- ORC Hilltop — `gisdata.orc.govt.nz/hilltop/Global.hts`; ORC AQUARIUS — `envdata.orc.govt.nz/AQWebPortal`; ORC env-data hub — `orc.govt.nz/environment/maps-and-data/environmental-data/`
- GWRC Hilltop — `hilltop.gw.govt.nz/Data.hts`; dashboard — `graphs.gw.govt.nz`
- ECan developer portal — `apidevelopers.ecan.govt.nz`; irrigation restrictions — `ecan.govt.nz/data/irrigation-restrictions`
- NIWA Hydro Web Portal — `hydrowebportal.niwa.co.nz`
- BoP env data — `boprc.govt.nz/environment/maps-and-data/environmental-data/`
- Auckland — `environmentauckland.org.nz`, `data-aucklandcouncil.opendata.arcgis.com`
- Waikato — `waikatoregion.govt.nz/.../waikato-data-portal/`, `data-waikatolass.opendata.arcgis.com`
- LAWA — `lawa.org.nz/download-data`, `lawa.org.nz/explore-data/water-quantity`
- Aquatic Informatics ORC case study — `aquaticinformatics.com/resources/case-studies/otago-regional-council-upgrades-key-water-data/`
- Christchurch open data — `opendata-christchurchcity.hub.arcgis.com`
