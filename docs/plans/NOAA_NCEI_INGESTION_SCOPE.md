# NOAA NCEI Ingestion — Scoping Assessment

**Status:** Scoping only — not started
**Author:** Claude + Peter
**Date:** 2026-06-17
**Question asked:** Should we integrate the NOAA NCEI Access Data Service as a high-volume source of current + historical weather/climate data for Insights and the Data Ingestion Platform?
**Related:** `docs/plans/DATA_INGESTION_PLATFORM_PLAN.md` (esp. Phase D station-discovery + Phase E AU launch), `docs/plans/SEASON_AWARENESS_AND_CLIMATE_METRICS.md`, `docs/plans/CLIMATE_EXTREMES_HISTORY_PROJECTIONS.md`

---

## TL;DR — the one decision that shapes everything

**NOAA NCEI is a *climate baseline + historical* source, not a real-time observation source. Two datasets, two distinct payoffs: GHCN-Daily/GSOM is the *global expansion* engine; GHCNh (hourly) is a genuine *NZ* upgrade.**

> **Update 2026-06-17 (GHCNh probe):** The original verdict below dismissed NZ on the basis of `daily-summaries` alone (11 stations, no Marlborough, temp/precip only). The **hourly** dataset (`GHCNh`) overturns that for NZ — see §2a. It brings **~50 active NZ stations *with* relative humidity, dew point, wind and hourly temperature, including stations inside Marlborough and Central Otago**, deep history (1950s). That's directly useful for GDD/frost/disease climatology, not just international.

| If you think of NOAA as… | Verdict |
|---|---|
| A denser/live NZ weather feed | ❌ Still no for *live* — all NOAA datasets lag ~1–2 weeks. Not for real-time ops/alerts. |
| **Deeper NZ *historical/climatology* coverage with RH + wind + hourly temp** | ✅ **Yes, via GHCNh** — ~50 active NZ stations (vs 11 daily), inc. Marlborough (NZM00093546/597) & Central Otago (NZM00093831/747/817); 58 elements inc. RH, dew point, wet-bulb, wind; hourly back to 1950s. Enables hourly GDD/frost-hour/disease climatology the NIWA monthly/daily baselines can't. **No solar radiation** (ISD limitation) — still needs existing sources. |
| Deep historical baselines at a few NZ points (daily) | 🟡 Marginal on its own — Paraparaumu TMAX 1972→now @ 96.7%, Alexandra 1949→now. Subsumed by GHCNh. |
| **The free, global, zero-key historical/baseline engine for every country on the roadmap** | ✅ **The other prize.** Australia alone has **423 GHCN-Daily stations near Adelaide/Barossa**. One uniform API replaces a bespoke historical loader per country (BoM SILO, AEMET, Météo-France, ECCC, …). |
| A source of pre-computed frost / hot-day / degree-day metrics | ✅ Yes. GSOM/GSOY ship DT32 (frost days), DX90 (hot days), EMXT/EMNT (extremes), HTDD/CLDD (degree days) — the exact metrics the Season-Awareness + Climate-Extremes work computes by hand. |

**Recommendation:** Adopt NOAA NCEI as a **new `data_source` feeding the climate-baseline / historical layer** (`climate_history_monthly`, `climate_baseline_monthly`, daily/hourly baselines), implemented as the **first real instance of the Phase D "discover stations by geometry+buffer" admin flow**. Two parallel payoffs: **GHCNh** gives NZ richer hourly historical climatology (RH/wind/dew-point) now; **GHCN-Daily/GSOM** accelerates the Phase E Australia launch and every later country. Do **not** wire any of it into the real-time `timeseries_observations` / Grow-live path (all datasets lag ~1–2 weeks).

---

## 1. What the NCEI Access Data Service actually is (verified by live queries)

Three cooperating HTTP services, all **public, no API key, no rate-limit published** (be polite — sequential, backoff on 429/500):

| Service | Endpoint | Purpose | Verified |
|---|---|---|---|
| **Search** | `…/access/services/search/v1/data` | Find stations in a `bbox`, with per-dataType coverage %, date range, station name/coords, file path | ✅ |
| **Data** | `…/access/services/data/v1` | Pull observations for explicit `stations=` list, choose `dataTypes`, `format=json/csv`, `units=metric` | ✅ |
| **Bulk files** | `…/data/{dataset}/access/{STATION}.csv` | Whole-station history as one CSV, updated daily, no API at all (e.g. Paraparaumu daily file = 2.36 MB, all elements) | ✅ |

### Data service params (confirmed)
`dataset`, `stations` (CSV, **required** — bbox alone is rejected), `dataTypes` (CSV, case-sensitive), `startDate`/`endDate` (ISO-8601), `format` (`json|csv|ssv|pdf|netcdf`), `units` (`metric|standard`), `includeStationName`, `includeStationLocation`, `includeAttributes`. `units=metric` already returns °C / mm (no tenths-of-degree conversion needed — verified TMAX `22.0`).

### Datasets that matter to us
| Dataset id | Grain | Use for Auxein |
|---|---|---|
| `daily-summaries` (GHCN-Daily) | daily | Historical daily TMAX/TMIN/PRCP/TAVG/SNWD → feeds daily baselines + GDD backfill |
| `global-summary-of-the-month` (GSOM) | monthly | **Direct fill for `climate_history_monthly` / `climate_baseline_monthly`** + frost/hot/degree-day metrics |
| `global-summary-of-the-year` (GSOY) | yearly | Long-run trend / vintage-year context |
| **`global-historical-climatology-network-hourly` (GHCNh)** | **hourly** | **The NZ upgrade — see §2a.** Hourly temp + RH + dew point + wind + pressure, deep history, inc. wine-region stations |
| `global-hourly` (ISD) | hourly | Superseded by GHCNh; same underlying ISD network |

---

## 2. Live probe results (the evidence)

```
NZ GHCN-Daily stations (whole country)............ 11    elements: PRCP, SNWD, TAVG, TMAX, TMIN
  Marlborough (Blenheim) bbox..................... 0     ← NZ's largest wine region: no daily station
  Central Otago bbox.............................. 1     Alexandra NZ000937470, daily from 1949-11
  Paraparaumu NZ000093417......................... TMAX 1972→present @ 96.7%, PRCP 1987→present
Australia — Adelaide/Barossa bbox................. 423   ← the contrast that makes the global case
daily-summaries freshness......................... endDate 2026-06-02 (today 06-17) → ~2-week lag
GSOM/GSOY via data service........................ ✅ returns JSON, metric units, already converted
Bulk station CSV.................................. ✅ single GET, updated daily (Last-Modified today)
```

## 2a. GHCNh (hourly) — the NZ-relevant discovery

The hourly network is a different, much denser story than daily-summaries:

```
NZ GHCNh active stations (since 2024).............. ~50   (vs 11 in daily-summaries)
  Marlborough bbox................................ 2 active: NZM00093546, NZM00093597 (daily had 0!)
  Central Otago bbox.............................. 3 active: NZM00093831, NZM00093747, NZM00093817
58 elements, inc. variables daily LACKS:.......... temperature, relative_humidity, dew_point_temperature,
                                                   wet_bulb_temperature, wind_speed/direction/gust,
                                                   station_level_pressure, sea_level_pressure,
                                                   precipitation (+5/15-min & 3–24h buckets), visibility, sky/cloud
NO solar radiation................................ ISD network limitation — existing sources still needed
Granularity....................................... hourly (24 rows/day verified), metric, pre-converted
History........................................... synoptic stations (NZM*) back to 1950s
Freshness......................................... data through ~2026-06-05 when queried 06-17 → ~1–2 wk lag
File format....................................... .psv (pipe-separated), per-station-per-year
Sample (NZM00093546, 2025-01-15)................... temp 16.5°C / RH 82%, hourly
```

**Why this matters for Auxein specifically:**
- **Station type:** GHCNh stations are synoptic/aviation (airports/aerodromes). For wine country that's often *in-region* — Marlborough (Woodbourne/Blenheim), Hawke's Bay (Napier), Gisborne, etc. Not in-vineyard, but regionally representative with decades of hourly record.
- **RH + dew point + wet-bulb + wind** unlock things the NIWA BCSD monthly/daily baselines and GHCN-Daily can't: hourly **disease-pressure climatology** (botrytis/downy/powdery leaf-wetness proxies), **frost context** (dew-point/wet-bulb/inversion, wind for fan logic), and **hourly GDD / frost-hour counts** rather than min/max-derived approximations.
- **Caveat:** still **no solar radiation**, and the ~1–2 week lag means it's a *climatology/baseline* input, **not** a live-ops feed. It complements — never replaces — the council Hilltop + Harvest real-time network.

**Important "count" gotcha:** the search service `count` for GHCNh is **per-station-per-year file count**, not distinct stations (files are named `GHCNh_<STATION>_<YEAR>.psv`). Marlborough's "126" is ~4 stations × ~30 years. Dedupe the station id (`GHCNh_(STATION)_YEAR`) before reporting coverage.

GSOM column set per station includes (all free, pre-computed):
`TMAX TMIN TAVG PRCP EMXT EMNT EMXP HTDD CLDD CDSD HDSD DT00 DT32 DX32 DX70 DX90 DP01 DP10 DP1X DYNT DYXT …`
→ **DT32 = frost days, DX90 = hot days, EMXT/EMNT = temperature extremes, HTDD/CLDD = degree days.** These mirror the metrics in the Season-Awareness + Climate-Extremes features almost 1:1.

---

## 2b. Why the ~2-week lag — and why it's not NOAA's fault (it's the data path)

The lag is **not** a NOAA processing delay and it is **not** uniform — it's a function of *how each country's data physically reaches NCEI*. Probed across countries (queried 2026-06-17):

| Country | Latest daily obs | Lag | Recent-value source flag |
|---|---|---|---|
| **US** (NYC, USW00094728) | 2026-06-14 | **~3 days** | `,,1` — native daily observation |
| **AU** (ASN00023000) | 2026-06-04 | ~13 days | (GTS-derived) |
| **NZ** (Paraparaumu, NZ000093417) | 2026-06-02 | ~15 days | **`H,,2` — measurement flag `H` = derived from hourly synoptic readings** |

**The mechanism (confirmed against the GHCN-Daily readme + NCEI product docs):**

1. **GHCN-Daily is a *reconstructed archive*, not a feed.** NCEI rebuilds it (usually weekly, 7 days/week capable) by merging ~30 source datasets. A station only refreshes when one of *its* sources delivers — so freshness is upstream-bound.
2. **US is fast** because NCEI ingests its own domestic networks directly and frequently (ASOS/AWOS hourly, COOP, CoCoRaHS) → current within days.
3. **For most non-US stations (incl. NZ & AU), the only near-real-time source NCEI has is "Global Summary of the Day" (source `S`)** — daily values *derived from the climatological-code group in SYNOP reports exchanged over the GTS* (Global Telecommunication System). That GTS→GSOD→weekly-rebuild path is inherently batched (~2 weeks). The readme explicitly warns these values "may differ significantly from 'true' daily data, particularly for precipitation."
4. **The authoritative national records (NIWA for NZ, BoM for AU) arrive much later** — bulk monthly/annual loads from the met service — and *retroactively replace* the provisional GTS values at higher quality. So recent NZ data is both **laggier and provisional**; older NZ data is clean and authoritative.

The `H` flag on NZ's recent TMAX is the fingerprint: it's a max **pulled from hourly synoptic (GTS) readings**, not a true daily max from NIWA's daily climate record. The US `,,1` value is a native daily observation. Same archive, different upstream plumbing.

**Implication for Auxein:** NOAA will *structurally never* be a fresh NZ source — NZ data only reaches it via the lagged GTS path (and later, delayed NIWA bulk loads). Anything live must come from where you already get it: the regional-council Hilltop networks + Harvest (NIWA-upstream, real-time). NOAA's lag is irrelevant to its actual job here — **deep, free, global *historical/climatology* baselines**. For Australia the same ~2-week GTS lag means NOAA covers AU *history*, but BoM-direct is still required for anything live.

---

## 2c. Could we bypass the lag by intercepting the SYNOP/GTS data ourselves?

**Idea:** grab the near-real-time synoptic obs directly (what NOAA *eventually* turns into lagged GSOD), ingest as provisional, then retro-replace with the authoritative 2-week-lagged archive. Investigated live.

### Can you tap the GTS directly? No — and you don't need to.
The **GTS (Global Telecommunication System)** is the WMO's *closed* inter-government backbone linking national met services. Access is restricted to NMHSs and authorised bodies; NZ's GTS gateway is **MetService**, not a feed a private company gets a node on. **But the same SYNOP/METAR messages are publicly redistributed in near-real-time** through several free channels — you consume the redistribution, not the GTS:

| Channel | Content | Latency (verified) | Notes |
|---|---|---|---|
| **aviationweather.gov** (NOAA NWS) | METAR (decoded JSON) | **~5–10 min** ✅ | Global, free, US-gov public domain. **NZAA: obs 02:00Z, received 02:04Z, fetched 02:10Z.** |
| Ogimet | decoded SYNOP (FM-12) | ~hours | Free but rate-limited/fragile (returned empty under test) |
| NOAA tgftp (`tgftp.nws.noaa.gov`) | raw SYNOP/METAR collectives | near-real-time | Self-decode |
| Unidata IDD / LDM (`IDS|DDPLUS`) | full synoptic firehose | seconds | Requires running an LDM node — heavy |
| Synoptic Data PBC (commercial) | mesonet+METAR+SYNOP, clean API | near-real-time | Paid; broadest aggregator |

So freshness is **solvable** — aviationweather.gov alone proves it (10-minute-old NZ obs with temp/dew-point/wind/pressure).

### Two different streams, very different coverage — and SYNOP *does* reach Marlborough (live)
There are **two** redistributed streams, and they are not the same set of sites:

**METAR stream** (aviationweather.gov / tgftp) — only the major aerodromes. Enumerated live over an NZ bbox: **just 5 NZ stations** — `NZAA` Auckland, `NZCH` Christchurch, `NZWN` Wellington, `NZQN` Queenstown, `NZOH` Ohakea. Misses Marlborough (`NZWB` is RNZAF, no civil METAR), Nelson, Hawke's Bay, Gisborne.

**SYNOP stream** (Ogimet / tgftp / Unidata IDD) — the full WMO synoptic AWS network. This is the broader set GHCN/GHCNh are *built from*, and the SYNOP messages themselves are **live** (the 2-week lag is purely NOAA's archive rebuild, not the transmission). Probed directly — hourly obs, ~minutes old:

```
93110 Auckland Aero..... ✅ hourly   93439 Wellington Aero... ✅ hourly
93597 Cape Campbell...... ✅ hourly   93831 Queenstown........ ✅ hourly
```

**NZ ISD/SYNOP network = 54 active stations** (vs 5 METAR, vs 11 GHCN-Daily). All hourly, ~minutes latency, free.

> **Correction (reconciliation pass, §2e):** an earlier draft of this section claimed SYNOP "covers Marlborough via Woodbourne 93546." **Wrong on two counts:** `93546` is **Nelson Aerodrome**, and the Blenheim/Wairau station (`93577`) was **decommissioned in 2002**. So **SYNOP does *not* reach Marlborough's Wairau plain** — only coastal Marlborough (Cape Campbell `93597`, Stephens Island `93562`). The "misses the main Marlborough vineyards" caveat from the METAR analysis **still holds for SYNOP too**; only the council MDC network covers the Wairau plain.

Corrected per-region SYNOP coverage: Hawke's Bay (Napier `93373`, Takapau Plains `93441`), Central Otago (Queenstown `93831`, Tara Hills `93747`), Gisborne (`93292`), Wairarapa (Castlepoint `93498`, Ngawi `93479`), Nelson (`93546`), N. Canterbury (Christchurch `93780/781`), **Marlborough — coastal only** (`93597`/`93562`), Waitaki (Oamaru `93796`).

These ~54 national AWS are **coarser than what Auxein already runs** — the regional-council Hilltop networks (ECAN/MDC/GW/HBRC/TDC/GDC) are *denser per region* and already real-time. SYNOP's edge is **uniformity** (one standardized layer with RH/dew-point/pressure/wind) and **global scalability**, not NZ density. Still no solar.

### What building it would entail (two-tier "provisional → authoritative")
1. New source class (`metar.py` / `synop.py`) polling aviationweather.gov every ~30–60 min for a station list.
2. Decode — METAR is easy (aviationweather returns decoded JSON; libs exist); SYNOP FM-12 is fiddlier (`pymetdecoder`). Derive RH from temp+dew-point.
3. Insert **provisional** rows (`quality='PROVISIONAL'`, source `METAR_GTS`) into the same tables — fits the existing `ON CONFLICT DO UPDATE` upsert.
4. Reconciliation job: when the authoritative archive lands (GHCN 'S' → later NIWA), upsert over provisional rows and flip quality to GOOD. **Hard part:** station-ID crosswalk across namespaces — ICAO `NZAA` ↔ WMO block `93xxx` ↔ GHCN `NZM000931xx` — plus de-dupe.
5. Semantic caveat: METAR is an *instantaneous spot* ob; a true daily TMAX/TMIN/rainfall derived from spot obs is lossy (this is literally why GHCN flags GTS-derived values `H` and says "use with caution").

**Effort:** ~3–4d live METAR ingest + ~2–3d reconciliation/ID-crosswalk; ongoing live cron + crosswalk maintenance + no solar still.

### Verdict: technically the right way to de-lag the GHCN network — but NZ value is uniformity, not density
- **SYNOP interception works and reaches the wine regions** (incl. Marlborough) live — it's the correct way to get "the GHCN station network without the 2-week archive lag." Use **Unidata IDD/LDM** (`IDS|DDPLUS` feed — the real-time firehose carrying SYNOP+METAR globally) or **Ogimet/tgftp** for a lighter pull.
- **For NZ it's still partly redundant:** the ~54 national synoptic AWS are *coarser per region* than the council Hilltop networks you already ingest. SYNOP's NZ upside is a **single standardized national layer** (uniform RH/dew-point/pressure/wind, one decoder vs six council APIs) feeding regional aggregates — nice-to-have, not essential.
- **The strong case is international:** one SYNOP source class = near-real-time AWS coverage for *every* country before any per-country live integration exists (AU, CL, …). That's where the provisional→authoritative pattern earns its keep, and it pairs with NOAA archive as the authoritative replacement layer.
- **No licensing blocker:** essential SYNOP/METAR are free to reuse under the WMO Unified Data Policy (Res. 1, Cg-Ext-2021); aviationweather.gov is US-gov public domain. (Direct GTS access would carry obligations — another reason to use the redistribution, not the GTS.)

---

## 2d. The 54 NZ SYNOP stations mapped to `climate_zones` (additive layer)

**Framing:** these are an **additive** standardized national layer, **not** a replacement for any existing source. The regional-council Hilltop networks (ECAN/MDC/GW/HBRC/TDC/GDC) + Harvest stay the primary, denser, real-time feeds in the regions they already cover. SYNOP's role is (a) a uniform RH/dew-point/pressure/wind layer with one decoder, (b) **gap-fill** in regions where Auxein currently has *no* council source (Auckland, Northland, Waitaki, and Central Otago beyond the private Harvest stations), and (c) the global-scalable backbone for other countries. All stations below transmit hourly SYNOP in near-real-time (verified) and also exist in the GHCN/GHCNh archive for authoritative backfill.

### A — Stations that fall in / adjacent to a wine `climate_zone`

| WMO | Station | Lat, Lon | Wine region → zone | Existing Auxein source there | SYNOP adds |
|---|---|---|---|---|---|
| 931100 | Auckland Aero AWS | -37.00, 174.80 | Auckland → **Auckland** | *(none — no Auckland council feed)* | **Gap-fill** ✅ |
| 931190 | Auckland Intl (NZAA) | -37.01, 174.79 | Auckland → Auckland / Waiheke (marginal) | *(none)* | **Gap-fill** ✅ |
| 930210 | Kerikeri Aero AWS | -35.25, 173.90 | Northland → **Northland** | *(none)* | **Gap-fill** ✅ |
| 930570 | Whangarei Aerodrome | -35.77, 174.37 | Northland → Northland | *(none)* | **Gap-fill** ✅ |
| 930040 | Cape Reinga AWS | -34.43, 172.68 | Northland (far N, marginal) | *(none)* | Gap-fill (coastal) |
| 932920 | Gisborne (NZGS) | -38.66, 177.98 | Gisborne → **Gisborne** | GDC | Uniform layer (redundant-ish) |
| 933930 | Mahia AWS | -39.12, 177.95 | Gisborne/Hawke's Bay margin | GDC / HBRC | Coastal context |
| 933730 | Napier Aerodrome AWS | -39.47, 176.87 | Hawke's Bay → **Hawkes Bay / Ngaruroro / Gimblett** | HBRC | Uniform layer |
| 934410 | Takapau Plains AWS | -40.03, 176.27 | Central Hawke's Bay → Hawkes Bay | HBRC | Inland HB context |
| 934980 | Castlepoint | -40.90, 176.20 | Wairarapa → **Gladstone / Martinborough** (east coast) | GW | Uniform layer |
| 934790 | Ngawi | -41.58, 175.23 | Wairarapa → Martinborough (south coast) | GW | Coastal/wind context |
| 93546 | Nelson Aerodrome (NZNS) | -41.30, 173.20 | Nelson → **Nelson** | TDC | Uniform layer |
| 93527 | Farewell Spit AWS | -40.55, 173.00 | Nelson/Tasman (far N tip) | TDC | Coastal context |
| 93597 | Cape Campbell AWS | -41.72, 174.27 | Marlborough → **Awatere** (coastal only) | MDC | Coastal context — **not the Wairau plain** |
| 93562 | Stephens Island AWS | -40.65, 173.98 | Marlborough Sounds (maritime margin) | MDC | Maritime context |
| — | *(Wairau plain / Blenheim)* | -41.5, 173.9 | Marlborough → **Lower Wairau** (main SB) | MDC | **No SYNOP** — Blenheim stn 93577 decommissioned 2002; MDC only |
| 937810 | Christchurch Aero AWS | -43.48, 172.52 | North Canterbury → **North Canterbury / Waipara** (S of) | ECAN | Uniform layer |
| 937800 | Christchurch Intl (NZCH) | -43.49, 172.53 | North Canterbury → North Canterbury | ECAN | Uniform layer |
| 937920 | Le Bon Bay AWS | -43.73, 173.12 | Banks Peninsula → N. Canterbury (margin) | ECAN | Coastal context |
| 936780 | Kaikoura | -42.42, 173.70 | Marlborough/N. Canterbury margin | ECAN/MDC | Coastal gap between regions |
| 938310 | Queenstown Aerodrome | -45.02, 168.73 | Central Otago → **Gibbston** (adjacent) | *(Harvest only, private)* | **Gap-fill** (public CO reference) ✅ |
| 937470 | Tara Hills (Omarama) | -44.52, 169.90 | Waitaki (upper) / CO margin | *(none)* | **Gap-fill** ✅ |
| 937960 | Oamaru Airport AWS | -44.97, 171.08 | Waitaki → **Waitaki** (coastal end) | *(none)* | **Gap-fill** ✅ |

### B — Stations with **no** wine `climate_zone` (national/synoptic context only — not additive to a zone)

Useful for the national picture, frost-front tracking, and as neighbours in interpolation, but they don't sit in a wine region:

`939470 Campbell Is · 939290 Enderby Is · 939940 Raoul Is · 939850 Chatham Is · 939090 SW Cape · 938000 Secretary Is · 938050 Puysegur Pt · 937210 Milford Sound · 937380 Mt Cook · 937080 Haast · 936140 Hokitika · 935150 Westport · 938450 Invercargill · 938870 Nugget Pt · 938910 Dunedin · 937730 Timaru · 934040 Palmerston North · 934200 Paraparaumu · 934390/934360 Wellington · 933390 Waiouru · 932450 Taupo · 933090 New Plymouth · 933130 Hawera · 932010 Port Taharoa · 931730 Hamilton · 931670 Raglan · 931290 Whitianga · 930690 Mokohinau · 931960 Hicks Bay · 931910 Whakatane · 931860 Tauranga · 931190…`

### Takeaways for the additive layer

- **Genuine gap-fill (no existing Auxein source):** Auckland, Northland, Waitaki, and a *public* Central Otago reference (Queenstown/Tara Hills) — here SYNOP adds real new coverage, not just uniformity.
- **Uniform-layer-only (council already denser):** Marlborough, Hawke's Bay, Wairarapa, Nelson, Gisborne, North Canterbury — SYNOP is one standardized ob per region (RH/dew-point/pressure/wind, single decoder) but the council Hilltop network already has *more* stations there. Additive for consistency/QC cross-check, not for density.
- **~30 of 54 stations** map to no wine zone — they're national-context only.
- **Every one is additive:** new `devices` rows under a new `data_source` (`SYNOP_GTS` / `NOAA_*`), `contributes_to_regional=true` where in-zone, feeding the existing recursive zone CTE alongside — never instead of — the council/Harvest devices. The two-tier upsert means a SYNOP provisional row never overwrites a council reading (different `device_id`); they coexist and the aggregate draws on both.

---

## 2e. Cross-source reconciliation of the 54 stations (codes, coverage, values, backfill depth)

Ran the live SYNOP set against both NOAA archives. Four results that shape the build:

### (1) Backfill depth — Ogimet is shallow; **NOAA owns history**
Ogimet `getsynop` serves only a **~4-month rolling window** (data present at 2026-04 and 2026-06, *absent* by 2026-01). It cannot do deep backfill. So the division of labour is clean:
- **Live SYNOP class** pulls only the recent rolling window (the provisional tier + the 2-week gap-fill).
- **NOAA class (N1)** does *all* deep history — GHCN-Daily (to 1972/1949) and GHCNh hourly (to 1950s).
- Reconciliation (§9.6) bridges them. No need to make the live class historical.

### (2) Values — provisional vs authoritative agree to 0.1 °C
Same hour (2026-06-05 00:00Z), Ogimet SYNOP vs NOAA GHCNh:
```
93110 Auckland     SYNOP 18.3  | GHCNh 18.3
93439 Wellington   SYNOP 15.8  | GHCNh 15.8
93597 Cape Campbell SYNOP 14.6 | GHCNh 14.6
93831 Queenstown   SYNOP 12.2  | GHCNh 12.2
```
Identical (expected — GHCNh is *built from* these obs). Confirms the WMO↔GHCN crosswalk points at the same physical station, and that the provisional→authoritative promotion is a QC re-flag, not a value swap. Any future divergence is a genuine QC correction worth keeping.

### (3) Station codes — crosswalkable but **NOT identical** (use a validated lookup, not string math)
Three id namespaces for the same station, plus real per-station number drift:
| Source | Scheme | Example (Auckland Aero) |
|---|---|---|
| SYNOP / Ogimet / ISD | WMO block `93xxx` | `93110` |
| GHCNh / GHCN-Daily (M-net) | `NZM000` + WMO5 | `NZM00093110` |
| GHCN-Daily (0-net) | `NZ000` + 6-digit USAF | `NZ000093417` |
| METAR / GHCNh (intl airports) | ICAO | `NZAA` / `NZI0000NZAA` |

**Confirmed inconsistencies (same physical station, different number across products):**
- **Paraparaumu** — `93420` in ISD/GHCNh but `93417` in GHCN-Daily (identical coords −40.9, 174.983).
- **Invercargill** — `93845` in ISD/GHCNh but `93844` in GHCN-Daily.
→ The crosswalk **must** be a lookup table validated by coordinates/name, not `NZM000`+block string concatenation.

### (4) Coverage — most SYNOP stations have an authoritative archive
| | Count |
|---|---|
| SYNOP active (live) | 54 |
| …with **GHCNh hourly** archive (WMO-keyed) | **40 / 54** |
| …with **GHCN-Daily** archive | 5 / 54 (sparse curated set) |
| …no WMO-keyed match | 14 — but 4 of those (Auckland/Christchurch/Wellington **Intl**, Gisborne) exist in GHCNh under **ICAO** ids (`NZI0000NZxx`), so the true "no archive" set is ~10 remote/minor sites |

So ~40+ of the 54 live SYNOP stations can be deep-backfilled and reconciled against GHCNh; the rest run live-only (provisional) until/unless added to the archive.

---

## 3. The NZ play — historical climatology, not live ops

Originally scoped as "not an NZ play" on the basis of daily-summaries. The **GHCNh hourly** probe (§2a) changes that:

- **Yes for NZ historical/climatology:** ~50 active GHCNh stations with hourly temp + **RH + dew point + wet-bulb + wind**, including stations *in* Marlborough and Central Otago, back to the 1950s. This adds depth and variables the NIWA BCSD baselines and GHCN-Daily don't carry — useful for hourly GDD, frost-hour and disease-pressure climatology.
- **Still no for live ops:** every NOAA dataset lags ~1–2 weeks → not for Grow-live or frost *intervention* alerts. The council Hilltop + Harvest network stays the real-time backbone.
- **Still no solar radiation** in any NOAA dataset (ISD/GHCN limitation) — existing sources remain required for ET/GDD-context.

Net: NOAA is a **historical/baseline complement** for NZ (primarily via GHCNh), and the council/Harvest feeds remain the live layer. daily-summaries' deep point records (Paraparaumu 1972, Alexandra 1949) are a bonus, largely subsumed by GHCNh's richer hourly coverage.

## 4. Why this *is* a big international play

The Data Ingestion Platform roadmap commits to AU (Sep 2026) then UK, ZA, CL, AR, US, EU. Each currently implies **a bespoke historical/baseline loader per country** (BoM SILO/AGCD, AEMET, Météo-France, ECCC…). NOAA NCEI collapses that:

- **One source class** covers historical daily + monthly + yearly climate for *every* country, in metric, via one uniform API.
- **423 AU stations near Barossa alone** → instant, credible regional climate baselines for the AU GI seed (§6.1 of the platform plan) with zero BoM licence dependency. De-risks the September launch: even if the BoM *commercial* (live) licence slips, NOAA gives AU *historical/baseline* Insights on day one.
- Subsequent countries drop from "~2–3 days bespoke baseline loader" (plan §6.3 item 6) to "point the existing NOAA loader at a new bbox."

This directly advances Platform **Phase D** (station discovery by geometry+buffer — NOAA's search service *is* that interface) and **Phase E** (AU seed + ingestion).

---

## 5. Architecture fit (maps cleanly onto what's already built)

The platform already has `data_sources`, `measurement_catalog`, `devices`, `device_measurements`, `timeseries_observations`, `ingestion_credentials`, recursive zone CTE, and the established source-class shape (`get_active_stations → fetch → parse → insert_data → log_ingestion → run`). NOAA slots in:

| Layer | Change |
|---|---|
| `data_sources` | New row `NOAA_GHCND` (kind=`weather`, api_pattern=`rest`, requires_credentials=`false`, country_id=`NULL`/global, base_url set). Plus `NOAA_GSOM` / `NOAA_GSOY` or a single source with per-device dataset tag. |
| `ingestion_credentials` | **None** — NOAA needs no key. (First credential-free REST source; resolver already tolerates NULL ref.) |
| `measurement_catalog` | Map TMAX→`temp_max`, TMIN→`temp_min`, PRCP→`rainfall`, TAVG→`temp`, plus optional derived codes for DT32/DX90/EMXT if we want to store NOAA's pre-computed extremes. |
| `devices` | NOAA stations registered with `device_class='weather_station'`, `visibility='public'`, `contributes_to_regional=true`, `is_high_resolution=false`, `ingest_cadence_minutes` = daily/weekly. `source_id` = GHCN id (e.g. `NZ000093417`). |
| **Target tables** | **Key difference:** NOAA daily-summaries are *already daily* → write to the **daily baseline / `climate_history_monthly` / `climate_baseline_monthly`** layer, **bypassing** the sub-daily `timeseries_observations` → `weather_data_daily` aggregation that Harvest/Hilltop go through. GSOM → monthly tables directly. This is a *historical/baseline loader*, parallel to the NIWA BCSD CSV loader, not a clone of the real-time path. |
| `ingestion/sources/noaa.py` | New source class. Backfill-oriented (multi-decade), so reuse the B1.8 lessons: chunked date windows + `execute_values` batched insert + progress prints. |
| Station discovery | New `discover_stations(bbox)` method wrapping the search service → first concrete implementation of Platform Phase D admin flow. |

### Volume / scale note
A full station history is ~2–3 MB CSV (~50–100k daily rows over decades). Across hundreds of AU stations this is tens of millions of rows — but they land in **daily/monthly baseline tables**, not the partitioned high-frequency `timeseries_observations`, so the monthly-partition scale concern (plan §7) is **not** triggered. For whole-country backfills, prefer the **bulk per-station CSV** path over the data API (one GET per station vs paginated calls).

---

## 6. Proposed phasing (incremental, each independently shippable)

| Phase | Scope | Effort | Depends on |
|---|---|---|---|
| **N0 — Spike (½ day)** | This doc + a throwaway script that pulls Alexandra/Paraparaumu history and a 10-station AU sample, confirms metric units + element coverage, and lands rows in a scratch table. Mostly done — the probes above are the spike. | 0.5d | nothing |
| **N1 — NOAA source class + catalog wiring** | `data_sources` row(s); `ingestion/sources/noaa.py` (search + data + bulk-CSV fetch, chunked backfill, batched insert); measurement mapping; `--source noaa` in `run_ingestion.py`. Loads into a baseline/historical target. | ~3d | platform Phase 0 (done) |
| **N2 — NZ deep-baseline backfill (daily)** | Register the ~11 NZ GHCN-Daily stations, backfill long records (Paraparaumu, Alexandra) into daily/monthly baselines as a longer-history complement to NIWA BCSD. Validates the loader on home turf. | ~1d | N1 |
| **N2h — NZ GHCNh hourly climatology** | Add GHCNh fetch (.psv, per-station-per-year) to the source class; register the ~50 NZ hourly stations (esp. Marlborough/Central Otago/Hawke's Bay); backfill hourly temp/RH/dew-point/wind into an hourly-baseline/climatology target. Powers hourly GDD, frost-hour and disease-pressure climatology. Dedupe station-id from per-year file names. | ~3d | N1 |
| **N3 — Station discovery admin UI (Phase D, first instance)** | Admin: pick country + zone → search-service `bbox` query → review stations (coverage %, date range) → bulk-activate `devices`. Reusable for BoM and every future source. | ~3d | N1, platform Phase D shell |
| **N4 — AU historical baseline seed (feeds Phase E)** | Run discovery over the AU GI bbox set (§6.1 platform plan) → activate stations → backfill GSOM/daily → populate AU `climate_history_monthly` + baselines. AU Insights get real historical climate **without** waiting on the BoM commercial licence. | ~3d | N3, AU region seed |
| **N5 (optional) — derived-metric ingest** | Store GSOM DT32/DX90/EMXT/HTDD/CLDD as first-class metrics to back the Climate-Extremes UI internationally instead of recomputing. | ~2d | N1 |

**Critical insight for sequencing:** N3+N4 are the same work the platform plan already scoped as Phase D + Phase E's "baseline loader" — NOAA just makes them *easier and country-agnostic*. This isn't net-new scope; it's a better implementation of committed scope.

---

## 7. Risks / caveats

| Risk | Note |
|---|---|
| Treating NOAA as real-time | Don't. ~2-week lag; daily grain. Keep it out of Grow-live and frost-intervention alerting. |
| No solar / RH in GHCN-Daily | GDD/disease/ET still need the existing sub-daily sources. NOAA complements, never replaces, the NZ council/Harvest feeds. |
| Station-id namespacing | GHCN ids (`NZ000093417`) differ from GSOM/GSOY id formatting in places (one GSOM probe returned empty for a daily id) — resolve id-per-dataset during N1. |
| Quality flags | GHCN ships `*_ATTRIBUTES` quality/source/flag columns — map to our `quality` field rather than discarding. |
| Bbox semantics | Search `bbox` is `N,W,S,E`; tight boxes legitimately return 0 (sparse network), not an error — discovery UI must handle empty results gracefully. |
| Politeness | No published rate limit, but it's a public federal service — sequential calls, exponential backoff, prefer bulk CSV for big backfills, cache station inventory. |
| Licensing | NOAA/NCEI data is US-Government public domain — free to ingest and redisplay; attribute NOAA NCEI in the data-credits modal (already-planned per platform plan Q2). |

---

## 8. Recommendation

1. **Adopt NOAA NCEI** as a credential-free `data_source` feeding the **climate-baseline / historical** layer — explicitly *not* the real-time path.
2. **Frame it as the international accelerator**, not an NZ feature. Its job is to give every new country instant, credible historical climate context from one uniform API.
3. **Build N1 now** (small, self-contained, no migrations — the platform schema already supports it), validate via **N2** on NZ deep records, then **fold N3/N4 into the existing Phase D/E Australia work** so the September launch carries real AU historical Insights regardless of BoM commercial-licence timing.
4. Keep the NZ real-time pipeline exactly as-is.

---

## 9. Implementation scope — near-real-time SYNOP ingestion class + latency handling

This section specs the **provisional live SYNOP** source and how its data is reconciled against the **authoritative** (lagged) NOAA/NIWA archive. It follows the existing source-class pattern (`ingestion/sources/harvest.py`, `ecan.py`) and writes through the same `weather_data` table + `ON CONFLICT` upsert.

### 9.1 Responsibilities & boundaries
- **In scope:** poll near-real-time SYNOP (and optionally METAR) for a configured NZ (later: per-country) station set; decode FM-12; write hourly spot obs to `weather_data` as **provisional**; run a reconciliation pass that promotes/over-writes them with authoritative GHCN-Daily/NIWA values as they arrive.
- **Out of scope:** Grow-live frost *intervention* (these obs are airport-grade, hourly, ~minutes–hours late — fine for regional context, not for fan-trigger). Solar (not in SYNOP). In-vineyard density (stays council Hilltop + Harvest).
- **Additive guarantee:** new `data_source` + new `devices`; never overwrites a council/Harvest device row (different `station_id`/`device_id`). Coexists in the zone aggregate.

### 9.2 Channels (provisional live vs authoritative)
| Tier | Source | Transport | Latency | Use |
|---|---|---|---|---|
| **Provisional live** | SYNOP (WMO blocks) | Ogimet `getsynop` HTTP (v1) → Unidata IDD/LDM `IDS\|DDPLUS` (v2, firehose) | minutes–1h | hourly spot obs, current-conditions layer |
| *(optional)* | METAR (aerodromes) | aviationweather.gov JSON | ~10 min | 5 NZ aerodromes, already-decoded fallback |
| **Authoritative** | GHCN-Daily (later NIWA bulk) | NCEI data service / bulk CSV | ~2 wks / monthly | true daily TMAX/TMIN/PRCP, QC'd |

V1 uses **Ogimet HTTP** for provisional (simple, no infra) and **NCEI data service** for authoritative. Defer the LDM node to v2 (only needed for sub-hourly global scale / when Ogimet rate limits bite).

### 9.3 New class `ingestion/sources/synop.py` (methods mirror `harvest.py`)
```
class SynopIngestion:
  __init__()                         # data_source='SYNOP_GTS'; get_ingestion_session()
  get_active_stations(...)           # SELECT ... WHERE data_source='SYNOP_GTS' AND is_active
  fetch_synop(wmo_block, start, end) # Ogimet getsynop; returns raw AAXX bulletins
  decode_synop(raw)                  # FM-12 → {timestamp(UTC), groups...}; via pymetdecoder
  parse_response(station_id, decoded)# → rows [{station_id,timestamp,variable,value,unit,quality,source,flags}]
  insert_data(records)               # upsert-with-precedence (§9.6)
  log_ingestion(...)                 # existing ingestion_log
  run(start, end, station_code, dry_run, reconcile=False)
```
Register in `run_ingestion.py` with `--source synop` and a `--reconcile` flag that runs the authoritative pass (§9.6) instead of the live pull.

### 9.4 Station identity & crosswalk
SYNOP keys on **WMO block** (`93546`); authoritative keys on **GHCN id** (`NZM00093546`); METAR on **ICAO** (`NZWN`). Store all three so reconciliation can match:
- `devices.source_id` = WMO block (the live key).
- Add `devices.notes` JSONB keys `{ "ghcn_id": "...", "icao": "...", "wmo_block": "..." }` (no migration — `notes` exists), or a dedicated nullable `external_ids JSONB` column if we want it queryable. Seed from the §2d table + the NOAA `isd-history.csv` crosswalk (already pulled).
- **Build the crosswalk as a coordinate/name-validated lookup, NOT `NZM000`+block string math** — per §2e, Paraparaumu (`93420`/`93417`) and Invercargill (`93845`/`93844`) carry different numbers in different NOAA products despite identical coords, and intl airports are filed under ICAO (`NZI0000NZxx`) in GHCNh. A naive transform silently mismatches ~6+ of the 54.
- **Backfill division (per §2e):** the live class only ever pulls Ogimet's ~4-month window. *All* deep history comes from the NOAA class (N1) — GHCNh hourly for ~40/54 stations, GHCN-Daily for the rest. Don't make the live class historical.

### 9.5 Measurement mapping (SYNOP group → `measurement_catalog`)
| SYNOP group | Field | code | unit | notes |
|---|---|---|---|---|
| `1sTTT` | air temp | `temp` | C | tenths °C, sign from s |
| `2snTTT` | dew point | `dew_point` *(new)* | C | RH derivable |
| derived | rel. humidity | `rh` | percent | from T + Td (Magnus) |
| `3PPPP` | station pressure | `pressure` | hPa | |
| `4PPPP` | MSL pressure | `pressure_msl` *(new)* | hPa | |
| `Nddff` | wind dir/spd | `wind_direction`*, `wind_speed`* (new) | deg, m/s | `iw` indicator → kt vs m/s |
| `6RRRtr` | precip | `rainfall` | mm | `tr` = accumulation window; map carefully |
Existing codes (`temp/rh/rainfall/pressure`) reused; add 4 (`dew_point`, `pressure_msl`, `wind_speed`, `wind_direction`) to `measurement_catalog` via seed (idempotent `ON CONFLICT DO NOTHING`).

### 9.6 The latency problem → quality lifecycle + reconciliation (the core)

**Problem statement.** Live SYNOP is fast but (a) *provisional* and (b) *spot obs* — a daily TMAX derived from 24 hourly readings can miss the true max between readings (this is exactly why GHCN flags such values `H`/"use with caution"). The authoritative daily lands ~2 weeks later and is correct. We must serve the fast value now, then **silently upgrade** it without ever letting a stale/provisional value clobber a better one.

**Mechanism — a quality lifecycle with a precedence rank:**
```
PROVISIONAL  (rank 1)  SYNOP spot ob, just ingested
CONFIRMED    (rank 2)  matched by GHCN 'S' (GTS-derived) daily — still synoptic-grade
AUTHORITATIVE(rank 3)  GHCN national source / NIWA bulk — QC'd true daily
```
Add to `weather_data` (small migration): `source VARCHAR(20)` and `quality_flags JSONB` (raw provenance: message id, `COR` flag, derived flag, GHCN attribute triplet). Keep existing `quality` as the lifecycle field (values above) — or add `quality_rank SMALLINT` to avoid string compares.

**Upsert-with-precedence (never downgrade):**
```sql
INSERT INTO weather_data (station_id,timestamp,variable,value,unit,quality,source,quality_flags)
VALUES (...)
ON CONFLICT (station_id,timestamp,variable) DO UPDATE
SET value=EXCLUDED.value, unit=EXCLUDED.unit, quality=EXCLUDED.quality,
    source=EXCLUDED.source, quality_flags=EXCLUDED.quality_flags, created_at=NOW()
WHERE  rank(EXCLUDED.quality) >= rank(weather_data.quality);   -- guard: only equal-or-better wins
```
`rank()` is an inline `CASE`. Re-running the live pull can't overwrite an authoritative value; the authoritative pass *can* overwrite a provisional one. Same-rank restatements (GHCN QC re-issues) are allowed (`>=`) so corrections propagate.

**Two-tier writes for the daily grain mismatch:**
- Hourly SYNOP → `weather_data` (spot, `PROVISIONAL`). Feeds the *current-conditions* + provisional daily rollup (existing `zone_aggregation` derives TMAX/TMIN as max/min of the hourly spots, marked provisional).
- Authoritative GHCN-Daily → ingested **directly into the daily layer** (`weather_data_daily` / fed to `climate_zone_daily`) as `AUTHORITATIVE`, *superseding* the SYNOP-derived daily for TMAX/TMIN/PRCP. So the lossy hourly-max is shown for ~2 weeks, then replaced by the true daily. The daily recompute is re-triggered for any (station, date) whose provenance is below AUTHORITATIVE.

**Reconciliation pass (`--reconcile`, daily cron):**
1. Find days in the last **N=60** days with any `PROVISIONAL`/`CONFIRMED` rows.
2. For those stations, pull GHCN-Daily (and GHCNh hourly where we want hourly QC) for that window.
3. Upsert with precedence → provisional rows promote to CONFIRMED/AUTHORITATIVE in place; daily layer recomputes.
4. Log promotions to `ingestion_log` (records_updated count).
The 60-day window covers the GHCN archive lag plus the later NIWA restatement comfortably; tune per observed lag.

### 9.7 Operational latency robustness (live pull)
- **Sliding re-pull window:** each live run re-fetches the **last 48 h** of SYNOP (not just since-last) to catch late-arriving and `COR`-corrected reports; upsert makes it idempotent.
- **Out-of-order / duplicates:** keyed on `(station, timestamp, variable)` — natural dedupe.
- **Corrections (`AAXX … COR`):** same timestamp, re-issued value → upsert overwrites at equal rank; record `corrected:true` in `quality_flags`.
- **Missing groups (`/////`):** skip that variable for that ob, don't write nulls.
- **Cadence:** SYNOP main hours 00/06/12/18Z + intermediate 03/09/15/21Z; cron the live pull hourly (or 3-hourly to start). Reconcile daily. Authoritative/NIWA weekly.
- **Timezone:** SYNOP is UTC; store UTC tz-aware (platform already does).
- **Politeness:** Ogimet is rate-limited and fragile — sequential, backoff, a station-list cron rather than per-request fan-out; if it throttles, that's the trigger to move to the Unidata LDM feed (v2).

### 9.8 Effort & phasing (this class)
| Step | Scope | Effort |
|---|---|---|
| **S0** | Seed `data_sources` (`SYNOP_GTS`) + 4 new `measurement_catalog` codes; migration adds `source` + `quality_flags` (+ optional `quality_rank`) to `weather_data` | ~1d |
| **S1** | `synop.py`: Ogimet fetch + FM-12 decode (`pymetdecoder`) + parse + upsert-with-precedence; `--source synop` wiring; seed the §2d gap-fill stations (Auckland/Northland/Waitaki/Queenstown) as `devices` | ~4d |
| **S2** | Reconciliation pass `--reconcile` against GHCN-Daily (reuses the NOAA class from N1); daily-layer supersede + recompute trigger; precedence tests | ~3d |
| **S3** *(opt)* | METAR fallback via aviationweather for the 5 aerodromes; Unidata LDM node for the firehose | ~2–3d |
**Total v1 (S0–S2): ~8d.** Depends on N1 (NOAA authoritative class) for the reconcile half.

### 9.9 Open questions
- Keep SYNOP-derived daily visible during the provisional window, or withhold until CONFIRMED? (Lean: show, badge as provisional — freshness is the point.)
- `quality` as string lifecycle vs a separate `quality_rank SMALLINT` (cleaner guard SQL). Lean rank column.
- Do we expose provisional/authoritative provenance in the Insights UI, or silently upgrade? (Lean: a small "provisional" badge on <2-week-old points.)
- Ogimet ToS / sustained-poll acceptability → if marginal, jump straight to Unidata LDM.

---

## 10. Build breakdown (work plan)

Concrete, reviewable phases. Each mirrors the existing ingestion conventions: `ingestion/config/{src}_sites.py` (station dicts) → `ingestion/setup_{src}_stations.py` (idempotent seeder, dry-run) → `ingestion/sources/{src}.py` (class) → `run_ingestion.py --source {src}` → GH Actions cron. Prod-safety per platform-plan §1a (new columns nullable/defaulted; old code unaffected). User handles git; user runs the app.

### Decisions (locked 2026-06-17)
1. **Seed scope:** **all 54** stations. In-zone → `zone_id` set + `contributes_to_regional=true`. **Not in a wine zone → `zone_id` NULL, `region` NULL, `contributes_to_regional=false`** (national-context only).
2. **Live transport:** **Unidata IDD/LDM** for all stations, live, from now — *plus* NOAA. (Ogimet is dev-bootstrap only, not prod.) This makes the live tier a **persistent service**, not a GH cron — see B2/B5 infra notes + new decisions below.
3. **Backfill:** NOAA **GHCN-Daily from 2022-01-01**; NOAA **GHCNh hourly from 2025-09-01**.
4. **Quality storage:** add `quality_rank SMALLINT`.
5. **Insights provisional UX:** deferred (FE, not ingestion).

### New infra decisions (block B2 go-live, NOT B0/B1/B3)
- **LDM host:** the `ldmd` daemon needs an always-on host. *Rec: a small dedicated instance (e.g. t4g.small EC2 or a Fargate task) in `ap-southeast-2`*, separate from the EB API box so lifecycles don't couple. Decode→RDS runs there.
- **IDD feed access:** request an upstream `IDS|DDPLUS` feed (SYNOP/METAR) from a Unidata relay — free for legitimate use; needs a one-time registration/email and a feedme/upstream host. Pin down before B2 go-live.

> **Catalog correction:** `measurement_catalog` already has `temp/rh/rainfall/pressure/wind_speed/wind_direction/dewpoint`. So B0 adds **only `pressure_msl`**, not four codes. SYNOP maps station pressure→`pressure`, MSL→`pressure_msl`, dew point→`dewpoint`.

### Phase B0 — Schema & catalog groundwork *(migration, ~1d)* — **BUILT 2026-06-17**
- **Migration** `add_obs_provenance` (down_rev `add_monthly_frost`): on the **real table `timeseries_observations`** (not the `weather_data` view) add `source VARCHAR(20)` (nullable), `quality_flags JSONB` (nullable), `quality_rank SMALLINT NOT NULL DEFAULT 3` (existing rows → authoritative). All adds are metadata-only (constant default) — no table rewrite, prod-safe. Then `CREATE OR REPLACE VIEW weather_data AS SELECT *` so the new cols are visible to callers that write through the view.
- Seed `data_sources`: `SYNOP_GTS` (api_pattern `ldm`, no creds, global), `NOAA_GHCND` + `NOAA_GHCNH` (rest, no creds, global). `ON CONFLICT DO NOTHING`.
- Seed `measurement_catalog`: add **`pressure_msl`** only (others already exist).
- **Accept:** `alembic upgrade head` clean on a prod snapshot; existing ingestion still writes (defaults fill new cols); selects show new cols; `weather_data` view exposes them.

### Phase B1 — Station crosswalk + seed *(config + seeder, ~1.5d)* — **BUILT + SEEDED 2026-06-17**
- `ingestion/config/synop_sites.py` — generate the 54 stations from `isd-history.csv` (already pulled). Each entry: `{ wmo_block, ghcn_id, icao, name, lat, lon, elevation, region, zone_id, measurements:['temp','dew_point','rh','pressure','pressure_msl','wind_speed','wind_direction','rainfall'], contributes_to_regional }`. **Crosswalk validated by coords/name, not string math** (§2e — Paraparaumu/Invercargill drift).
- `ingestion/setup_synop_stations.py` — mirror `setup_gdc_stations.py`; INSERT into `weather_stations` with platform columns set: `data_source='SYNOP_GTS'`, `data_source_id`, `country_id=NZ`, `source_id=wmo_block`, `ingest_cadence_minutes=60`, `visibility='public'`, `contributes_to_regional`, `is_high_resolution=false`, `notes` JSONB `{ghcn_id, icao, wmo_block}`, `zone_id` from §2d map. Idempotent (skip existing by `station_code`+source), dry-run.
- **Accept:** `--dry-run` shows 54; live insert creates 54 rows; in-zone subset has `zone_id` + `contributes_to_regional=true`; spot-check Paraparaumu maps `93420`↔`NZM00093420` and links ghcn_id correctly.

### Phase B2 — Live SYNOP via Unidata LDM *(~6d — incl. infra)*
Persistent service, **not** a GH cron. Two parts:
- **Infra (host + feed):** provision the LDM host (decision above); install `ldm`/`ldmd`; register the `IDS|DDPLUS` upstream feed; `ldmd.conf` `REQUEST IDS|DDPLUS ".*" <upstream>`; `pqact.conf` filters the NZ surface bulletins (WMO headers `^S[MNI].* NZ` / region-V SYNOP collectives) and `EXEC`s the decoder, keeping product volume tiny.
- **Decoder service** `ingestion/sources/synop_ldm.py`: receives raw FM-12 bulletins from `pqact`, decodes via `pymetdecoder`, resolves WMO block → `station_id` via the crosswalk, writes rows `{station_id, timestamp(UTC), variable, value, unit, quality='PROVISIONAL', quality_rank=1, source='SYNOP', quality_flags}` (derive `rh` from T+Td Magnus) using **upsert-with-precedence** into `timeseries_observations` (§9.6 — `WHERE EXCLUDED.quality_rank >= timeseries_observations.quality_rank`). Logs to `ingestion_log`.
- **Dev bootstrap:** an Ogimet-backed `--source synop` path in `run_ingestion.py` for testing the decoder + DB write *without* the LDM node (recent ~4-mo window only). Reuses the same decode/insert functions.
- `requirements.txt`: add `pymetdecoder`.
- **Accept:** Ogimet-bootstrap dry-run decodes + inserts PROVISIONAL for the ~40 reporting stations, idempotent + no downgrade, values match GHCNh; then LDM node streams the same rows live (continuous), `ingestion_log` healthy.

> **UPDATE 2026-06-22 — Ogimet bootstrap BUILT + a cheaper v1 "always-on" path.** `ingestion/sources/synop.py` (`SynopIngestion`) is built and validated against live data (see §B2.1). Crucial realisation: **Ogimet is plain HTTP, so the live provisional tier needs NO persistent host.** A scheduled **GitHub Actions cron** (`.github/workflows/synop-live.yml`, mirroring `weather-ingestion.yml`) running `run_ingestion.py --source synop` every ~3h is a perfectly good "always-on" for the provisional tier — cloud, no infra, managed from the repo/CLI. **This becomes the v1 live transport; Unidata LDM is demoted to v2** (only needed when Ogimet rate-limits bite or for sub-hourly global firehose scale). The two infra decisions (LDM host + IDD feed) are therefore **no longer on the v1 critical path.**

#### B2.1 — Ogimet bootstrap, as built (2026-06-22)
- **Decoder:** self-contained minimal FM-12 (land AAXX) parser — **no `pymetdecoder` dependency** (not installed; the LDM/v2 path may swap it in if fuller cloud/weather decoding is wanted). Reads Section-1 groups only (stops at first `222/333/444/555/666` separator), maps temp / dewpoint / station+MSL pressure / wind, derives RH (Magnus), decodes precip with the accumulation-window code stashed in `quality_flags.synop_tr`. Every value sanity-bounded; ambiguous groups skipped, not guessed.
- **Validated** against live Auckland 93110: temp/dewpoint/pressure/MSL/wind/RH all correct; section-3 stop confirmed (so a section-3 `2xxxx` group is not misread as dewpoint); pressure thousands-reconstruction correct incl. high-elevation (`39550`→955.0); knots→m/s when `iw∈{3,4}`.
- **Writes** PROVISIONAL (`quality='PROVISIONAL', source='SYNOP', quality_rank=1`) into `timeseries_observations` via the **same upsert-with-precedence guard** as B3 — a provisional row never clobbers a CONFIRMED/AUTHORITATIVE one; the B3/B4 NOAA pass promotes it in place. Default window = last 48 h sliding re-pull (§9.7). `--reconcile` thinly delegates to `NoaaIngestion` (hourly+daily, last 60 d).
- **Live coverage (full-fleet dry-run 2026-06-22, 48 h):** ~19.5k obs across ~48–50 reporting stations. The non-reporting ones are the **ICAO aerodromes** (Wellington Intl/Christchurch Intl/Hokitika/Haast/Auckland Intl/Gisborne/Tauranga) — they transmit **METAR, not SYNOP**, so Ogimet has no synoptic bulletin (the optional METAR/aviationweather fallback, S3, would fill these 5–7 if wanted). All `NZM000…` M-net stations report cleanly.
- **Still untested:** the actual DB **write** path (only `--dry-run` exercised) — smoke-test a single-station live write before enabling the cron.

### Phase B3 — NOAA ingest class (authoritative + deep backfill) *(~4d)* — **BUILT 2026-06-19 (dry-run tested, no DB writes yet)**
- `ingestion/sources/noaa.py` `NoaaIngestion`: modes — **GHCNh hourly** and **GHCN-Daily** (authoritative). Built & smoke-tested:
  - **Hourly:** fetches per-station-per-year `.psv` bulk files from `…/hourly/access/by-year/{YEAR}/psv/GHCNh_{ghcnh_id}_{YEAR}.psv` (verified live; values already metric °C/hPa/m·s⁻¹/%/mm, DATE = ISO-8601 UTC). Maps 8 elements → `temp/dewpoint/rh/pressure/pressure_msl/wind_direction/wind_speed/rainfall`. Writes **directly to `timeseries_observations`** (the real table — `weather_data` is a SELECT* view and Postgres rejects `ON CONFLICT` on views) with `quality='AUTHORITATIVE', quality_rank=3, source='GHCNH'`, via **upsert-with-precedence** (`WHERE EXCLUDED.quality_rank >= timeseries_observations.quality_rank` — promotes provisional SYNOP, never downgrades, idempotent). Skips empty + ISD bad-QC (`2/3/6/7`) + out-of-bounds values; stores non-clean QC in `quality_flags`. `psycopg2.execute_values` page_size 1000.
  - **Daily:** NCEI **data service** (`dataset=daily-summaries&units=metric` — returns °C/mm already; the bulk CSV ships raw tenths, so the API is used) for `TMAX/TMIN/PRCP/TAVG`. Computes `temp_mean` (TAVG, else (TMAX+TMIN)/2) + `gdd_base0/base10`; upserts `weather_data_daily` on `(station_id, date)`. **NB:** `weather_data_daily` has no provenance column → unconditional upsert; guarding vs a SYNOP-derived daily rollup is B4.
  - Stations resolved from seeded SYNOP devices via `notes->>'ghcnh_id'` (46 stations) / `notes->>'ghcnd_id'` (7 stations). Polite sequential fetch + retry/backoff; 404 (missing station-year) skipped silently.
- `run_ingestion.py`: `--source noaa --mode {hourly,daily} [--start --end --station --dry-run]` (NOAA excluded from `all`). Also runnable standalone: `python -m ingestion.sources.noaa --mode hourly`. **Backfill targets (locked, default when no `--start`): GHCN-Daily from `2022-01-01`; GHCNh hourly from `2025-09-01`** — both to present.
- **Dry-run verified 2026-06-19:** hourly SYNOP_93110 parsed 478 recs/3 days; daily returned data for 6/7 ghcnd stations (Tara Hills `NZ000937470` returns no rows for the probe window — its record may start later / id variant; verify on full-range run).
- **NEXT (run, the user executes):** dry-run the full fleet, then live `--mode hourly` (2025-09-01→now) + `--mode daily` (2022-01-01→now) against prod. No migration needed (B0 already applied).
- **Accept:** GHCN-Daily backfill 2022-01-01→now lands in the daily layer; GHCNh hourly 2025-09-01→now lands AUTHORITATIVE in `timeseries_observations`; overlapping hours equal the SYNOP value (≤0.1°C); promotion guard overwrites PROVISIONAL but a later SYNOP re-run can't clobber it.

### Phase B4 — Reconciliation / data-audit pipeline *(daily cron job, ~3d)*
- `ingestion/reconcile_synop.py` (or `backend/scripts/`): the daily audit + promotion pass.
  - **Promote:** find `quality_rank < 3` rows in last `N=60d`; re-pull GHCN(h) authoritative for those `(station, date)`; upsert-with-precedence → provisional becomes authoritative; recompute affected daily rollups (trigger `zone_aggregation` for those station-days).
  - **Audit checks → report + `ingestion_log`:** (a) provisional rows older than `lag_days+buffer` still un-promoted → *source-gap* flag; (b) |provisional − authoritative| > threshold → *QC-divergence* flag (keep authoritative, log delta); (c) active SYNOP device with no live obs in 48h AND no authoritative → *dead-station* flag; (d) crosswalk integrity — every active SYNOP device resolves to a `ghcn_id` or is tagged `live_only`.
- **Accept:** dry-run lists would-promote counts; live run promotes + recomputes; emits audit summary (promoted N, diverged N, stale N, dead N); idempotent; safe to re-run same day.

#### B4.1 — `daily_aggregation` provenance guard (PREREQUISITE for any historical backdate) — scoped 2026-06-22
**Why this exists.** `backend/scripts/daily_aggregation.py` recomputes `weather_data_daily` from hourly `weather_data` and **upserts unconditionally — no `quality_rank`/`source` guard** (`upsert_daily_record`, ~L144-161). With SYNOP/GHCNh now present, that bites the **4 in-zone stations that also have authoritative GHCN-Daily** (Auckland 93110, Gisborne 93292, Christchurch Aero 93781, Tara Hills 93747) across the 2025-09→present overlap:
1. **Rainfall → 0 corruption.** GHCNh carries **no hourly precip** (confirmed: 0 rainfall rows in the 2M-row backfill), so the hourly `SUM` is NULL → coalesced to `Decimal('0')` (L132) → would **overwrite the real GHCN-Daily PRCP with zero.** This is a latent bug for *any* rainfall-less station and also makes the **forward nightly cron** write `rainfall=0` for SYNOP daily rows — fix needed regardless of backdate.
2. **TMAX/TMIN downgrade.** Hourly spot-derived extremes replace true daily extremes (the "use with caution" GHCN `H`-flag problem).

**The forward cron mostly dodges this** (GHCN-Daily lags ~2 wk so "yesterday" has no authoritative row yet, and the cron never revisits old dates) — **but a backdate hits it head-on.** So the guard is a hard prerequisite before re-running the pipeline over historical dates.

**The guard (small, ~15 lines in `daily_aggregation.py`):**
- When `rainfall_record_count == 0` → write `rainfall_mm = NULL`, **not** `0` (never clobber a real daily PRCP with an absent-source zero).
- Before overwriting an existing `weather_data_daily` row, **skip the fields that an authoritative GHCN-Daily value already populated for that (station, date).** `weather_data_daily` has no provenance column, so resolve "is this row authoritative?" by checking for a matching `source='GHCND'/'GHCNH'` provenance signal — cheapest is a `(station_id, date)` lookup against the NOAA-written set, or add a `source VARCHAR`/`quality_rank` column to `weather_data_daily` (mirrors the B0 change on `timeseries_observations`; cleanest, makes the guard a one-line `WHERE`). **Recommended:** add the column — it future-proofs the daily layer the same way B0 did the sub-daily layer.

**Then the scoped backdate (B6 flow-through):**
- Per affected zone (the 12 in-zone climate zones), loop `run_daily_processing.py --zone-id N --start 2025-09-01 --end <today>` (steps re-run daily→hourly→zone→phenology→disease). `daily_aggregation` now respects authoritative rows; `zone_aggregation`'s recursive CTE already includes `contributes_to_regional` SYNOP devices (no code change — confirm on one backdated day first).
- **Caveat to flag to the user before running:** backdating **shifts already-published 2025-26 season figures** for those 12 zones (airport SYNOP blended into zones that already have council/Harvest data). Intended, but visible.
- **Out of scope here:** climate *history*/baseline tables (`climate_history_monthly`, `climate_baseline_monthly`, `climate_zone_daily_baseline`) are **not** fed by `daily_processing` (they come from NIWA BCSD / upload scripts). GHCNh depth is only 2025-09→present so there's no climatology depth to roll up yet — that's the separate "calculate my climate history" rollup TODO.

**Accept:** with the guard in place, a backdate over a GHCN-Daily station-day leaves authoritative TMAX/TMIN/PRCP intact (verify Auckland 93110 on a 2025-10 day: PRCP unchanged, not zeroed); rainfall-less SYNOP days show NULL not 0; one-zone backdated day shows SYNOP folded into `climate_zone_daily`.

### Phase B5 — Service + cron wiring *(~1d)*
- **LDM = persistent service** (systemd unit on the host), not a cron — runs continuously, auto-restart. Monitored via `ldmadmin watch` + a heartbeat into `ingestion_log`.
- New `.github/workflows/synop-reconcile.yml` — daily (after `daily-processing`) → `run_ingestion.py --source noaa --mode hourly` recent window **then** `reconcile_synop.py`. Or fold into `daily-processing.yml`. Same env block as `weather-ingestion.yml`.
- **Accept:** LDM systemd unit survives reboot + streams continuously; reconcile workflow `workflow_dispatch` green; first scheduled tick promotes provisional + writes audit log.

### Phase B6 — Zone flow-through + provisional badging *(verify, ~0.5d + UI later)*
- Verify `zone_aggregation` recursive CTE already aggregates SYNOP `contributes_to_regional=true` devices into their zones (no code change expected — confirm on a backdated day).
- Insights "provisional" badge for <2-week points = separate FE task (deferred, decision #4).

### Rollup
| Phase | Deliverable | Effort | Depends |
|---|---|---|---|
| B0 | Migration + catalog seed | ~1d | — | ✅ applied to DB |
| B1 | 54-station crosswalk + seeder | ~1.5d | B0 | ✅ seeded (54 rows) |
| B2 (v1) | Live SYNOP via **Ogimet GH-cron** | ~0.5d | B1 | ✅ bootstrap built + dry-run validated; cron + live write smoke-test pending |
| B2 (v2) | Live SYNOP via Unidata LDM (+infra) | ~6d | B1 | ⏸ deferred — only if Ogimet rate-limits; needs host+feed |
| B3 | NOAA class (daily 2022 + hourly 2025-09) | ~4d | B1 | ✅ built + **backfill RUN 2026-06-22** (2.02M hourly + 9.1k daily landed) |
| B4 | Reconcile/audit daily pass | ~3d | B3 | |
| B4.1 | `daily_aggregation` provenance guard | ~0.5d | B3 | prereq for any backdate; fixes PRCP→0 |
| B5 | Service + cron wiring | ~1d | B2, B4 | |
| B6 | Zone flow-through verify + scoped backdate | ~0.5d | B4.1 | |
| **Total** | | **~10d** (LDM removed from v1) | B2∥B3 parallelable | |

**Critical path (revised 2026-06-22):** B0 → B1 → B3 (✅ done) → **B4.1 guard → B6 backdate**, with B2-v1 (Ogimet cron) standing up in parallel. B3 is also the N1 NOAA class from §6 — same code, so this absorbs that scope. **The LDM infra (host + IDD feed) is off the v1 critical path** — Ogimet HTTP via GH-cron covers the provisional tier without a persistent host; promote to LDM (v2) only if Ogimet throttling forces it.

*End of scope — 2026-06-17.*
