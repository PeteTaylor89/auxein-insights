# Projection surfaces — plan for 2026-08-24

Written 2026-08-23 after a recon of `Z:\Data\NZ_Climate_Projections_MfE_GeoTIFF`.
**Nothing is built.** This is the plan, the decisions that have to be made before
code, and the traps already identified.

Context: the era-offset work finished today, so `frost_days`, `days_over_25` and
`days_over_30` are continuous 1986-01..2026-07 for the first time. Those are
exactly the bands the projection dataset also carries, which is why this is the
right next thing.

---

## 1. What we have

Two parallel trees on `Z:`, same content:

    NZ_Climate_Projections_MfE_2024/       3,128 NetCDF
    NZ_Climate_Projections_MfE_GeoTIFF/    3,129 GeoTIFF   <- USE THIS ONE
    NZ_Climate_Projections_MfE_GeoTIFF_test/  18 sample

**Use the GeoTIFF tree.** The NetCDF tree has one 0-byte file
(`CD18_historical_MMM_CCAM_base_bp1986-2005_ANN_NZ5km.nc`); the GeoTIFF tree has
none. Nothing else distinguishes them, and we already have a GeoTIFF toolchain.

This is the **MfE 2024 national climate projections** — CMIP6 downscaled to New
Zealand with CCAM, multi-model mean (`MMM`).

### Filename grammar

    <VAR>_<scenario>_MMM_CCAM_<base|change>_<period>_<baseline>_<season>_NZ5km.tif

| token | values |
|---|---|
| scenario | `historical`, `ssp126`, `ssp245`, `ssp370` — **no ssp585** |
| base/change | `base` = absolute historical field; `change` = **delta from baseline** |
| period | `fp2021-2040`, `fp2041-2060`, `fp2080-2099`, `wl1.5`, `wl2`, `wl3` (ssp370 only) |
| baseline | **`bp1986-2005`**, `bp1995-2014` |
| season | `ANN` + `DJF`/`MAM`/`JJA`/`SON` (17 vars); `ANN` only (6 vars) |

34 combos per variable per season = 2 base + 10 ssp126 + 10 ssp245 + 12 ssp370.

### Geometry

243 x 260 at **0.05 deg (~5.5 km)**, **EPSG:4167** (NZGD2000 geographic),
float64, bounds 166.425..178.575 E / -47.374..-34.374 S, **11,491 valid cells**
against our 1,429,944 land cells.

> **`nodata` is UNSET — sea is NaN.** Mask with `np.isfinite`, never with a
> sentinel comparison. This is the same class of trap as
> "Postgres hides NaN" (`NaN <> NaN` is FALSE): a sentinel test finds nothing
> and the sea silently enters the statistics.

---

## 2. The finding that shapes everything

**`bp1986-2005` is exactly the baseline the Pro page uses.** The whole Pro page
was moved to a 1986-2005 normal on 08-21, and `climate_zone_daily_baseline` IS
that climatology.

So the composition is:

    projected = our own 1986-2005 normal  +  MfE change field (bp1986-2005 arm)

with **no rebasing step, no era correction, and no dependence on the MfE
`base` field at all**. That is the standard delta / change-factor method, and it
is what the `change` files exist for. It also means our own surface supplies the
spatial detail (500 m, our station network) while MfE supplies only the climate
signal (5.5 km, smooth).

**Ignore the `bp1995-2014` arm entirely.** Using it would require rebasing our
normals onto a period we have not computed, for no benefit.

---

## 3. The variables, and where they land

| MfE | ours | status |
|---|---|---|
| **GDD10** | `gdd10` season surfaces | ANN only — see the trap below |
| **FD** | `frost_days` | has seasonal arms |
| **TX25 / TX30** | `days_over_25` / `days_over_30` | has seasonal arms |
| T / TN / TX | `temp_mean` / `temp_min` / `temp_max` | has seasonal arms |
| PR | `rainfall` | has seasonal arms |
| DTR, TXx, TNn, RR1mm, RR25mm, DD1mm, R99pVAL | — | no equivalent yet |
| GDD5, HD18, CD18, hurs, rsds, sfcWind, Wd10, Wd99pVAL, PEDsrad | — | outside our set |

Values spot-checked and commensurate with ours:

| file | median | range |
|---|---|---|
| GDD10 base bp1986-2005 | 745 | 0.01 .. 2,408 |
| GDD10 ssp245 fp2041-2060 change | **+297** | +3 .. +470 |
| FD ssp245 fp2041-2060 change | **-14.1 days/yr** | -75 .. +1 |

GDD10 = 745 for 1986-2005 sits sensibly below our published 2020-23 vintage p50
of 775-886 — right direction, right magnitude for a 20-year-older baseline. That
is a useful independent sanity check that the two datasets are commensurate, and
it should be repeated properly (see §6).

---

## 4. THE DECISION TO MAKE FIRST — annual vs seasonal

**MfE's GDD10 and FD are `ANN`: a calendar-year accumulation.** Ours are not.

- `gdd10` is a **Sep-Apr season labelled by its END year**.
- `frost_days` is a **monthly** band.

Adding an annual change to a seasonal normal is not obviously valid, and getting
it wrong is exactly the shape of the partial-vintage bug that understated every
regional normal in all 23 zones. Three candidate routes:

1. **Additive delta, annual applied to annual.** Only defensible for a product
   defined on the calendar year. We do not have one.
2. **Multiplicative ratio.** `projected_season = our_season * (1 + change/base)`.
   Uses the MfE `base` field as the denominator, which we otherwise do not need,
   and assumes the fractional change is season-invariant. For GDD10 this is the
   most plausible route, because almost all GDD10 accrues inside Sep-Apr anyway
   — but that assumption must be **measured**, not asserted.
3. **Compose from the seasonal arms.** FD, TX25, TX30, T/TN/TX and PR all have
   `DJF`/`MAM`/`JJA`/`SON`. **GDD10 does not.** So a seasonal route is available
   for frost and heat days but not for GDD.

**Proposal:** start with **FD and TX25/TX30 via the seasonal arms**, because the
mapping is clean, the bands just became continuous today, and frost is the
headline product. Treat **GDD10 as a second phase** once the ratio assumption
has been tested against the seasonal T arms.

---

## 5. Product shape — needs Pete's call

The `projections` item on the Pro page is currently a **placeholder that waits on
projection surfaces, by direction**. Open questions:

1. **Which scenario do we show by default?** ssp245 is the usual "middle"
   choice; ssp370 is closer to current trajectory. Showing all three invites a
   scenario-shopping conversation with growers.
2. **Periods or warming levels?** `fp2041-2060` is legible to a grower planning a
   replant. `wl2` is more scientifically honest but needs explaining.
3. **Is this a surface (map tiles) or a per-site number?** A Pro subscriber has a
   point; a number against their own site may be the whole product, in which case
   we may not need to publish tiles at all in phase 1.
4. **Do projections go in the free Atlas or Pro only?**

Recommendation: **per-site numbers first, ssp245 + ssp370 at fp2041-2060, Pro
only.** It is the smallest thing that is useful, and it avoids committing to a
tile pyramid and a colour ramp before we know the product works.

---

## 6. Verification before anything ships

- **Commensurability.** Compare MfE `base` bp1986-2005 against OUR OWN 1986-2005
  normal, cell by cell, for GDD10 / FD / TX25 / TX30 / T. This is the single
  most informative check available and it costs one script. A large disagreement
  means the delta method is standing on sand.
  **Caveat: this is NOT independent validation** — both are models over an
  overlapping station record. It bounds disagreement; it does not confirm truth.
- **Sign and magnitude sanity per region.** Frost must fall everywhere; GDD must
  rise everywhere. Any cell with the wrong sign is a bug, not a finding.
- **Resample decision.** Resample the **delta**, never the absolute — the delta
  is smooth at 5.5 km and the absolute is not. Bilinear onto our 500 m grid,
  and check the coastline: an EPSG:4167 -> our-grid reprojection at 11x will
  bleed NaN inland unless the mask is handled first.
- **PROJ_LIB.** The PostGIS 3.5 install sets a machine-level `PROJ_LIB` with an
  old `proj.db` schema, and CRS failures appear as a **GDAL log line, not an
  exception**. Call `raster._configure_proj()` before any rasterio work. A
  reprojection between EPSG:4167 and our grid is exactly where this bites.

---

## 7. Housekeeping to settle before publish

- **Licence and attribution.** Not yet checked. MfE data is usually CC BY 4.0,
  which would need in-product attribution the way the LENZ raster does — but
  confirm rather than assume.
- **`model_version` / contract.** A projection is not a fitted surface: it has no
  `cv_rmse`, no `n_stations_fit`, and no `valid_at` in the observational sense.
  Decide whether it is a new granularity in `surface_run` (like `season` was) or
  a separate table. **`season` was added by generalising a CHECK constraint that
  asserted "this row covers a period rather than an instant" — a projection is a
  third case, so the same rule may generalise again.**
- **Do NOT let a projection collide with the observational record.**
  `store.resolve` orders `model_version DESC`. A projection row that shares a
  variable + statistic + valid_at with a real surface would win the lookup. This
  is the same trap that nearly let a 3-year record win "all time".

---

## 8. Explicitly out of scope tomorrow

- Re-running or re-tuning the interpolation engine. Deferred until the remaining
  councils are seeded and backfilled.
- Anything with `bp1995-2014`.
- Publishing tiles or picking colour ramps.
- The remaining interpolation backlog (temp_max's weak correction, rebuilding
  `colocated_pairs.csv`, backing up the CLIFLO extracts, scheduling
  `offset_staleness.py`). Those are still open and still ahead of a new product
  in priority if anything has to give.
