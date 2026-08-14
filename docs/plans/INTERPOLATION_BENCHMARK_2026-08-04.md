# Interpolator benchmark vs NIWA / ANUSPLIN — research findings

**Date:** 2026-08-04, with §3.11–3.12 and §5.2 added 2026-08-05
**Scope:** `backend/scripts/interpolation/tps.py` (and its on-prem parent
`backend/models/Spline_Temp_V1.7.py`, `Spline_Precip_V1.py`) compared against
NIWA's VCSN methodology and its published error statistics.
**Status:** §1–4 are research and measurement. §5 is built and **`ridge` is now
the default engine** in `tps.py`. The legacy path is untouched and still
reachable via `engine="legacy"`; parity against the on-prem grids re-run and
passing at 1.9e-9 °C.

Everything numeric below was measured on the 15 golden dates in
`backend/models/example data/` (146–195 stations per date, daily Tmean),
not quoted from the plan docs. §3.11–3.12 are the exception: they are measured
on the live rainfall network, and say so.

> **All of it is provisional on station coverage.** These numbers come from a
> 146–195 station historical fixture (temperature) and a 534-station network
> with entire regions missing (rainfall — zero stations from Waikato, Bay of
> Plenty, Taranaki, Horizons or Otago). Pete's call, 2026-08-05: **re-measure
> once, after the remaining councils are seeded and backfilled**, rather than
> chasing a moving network. Nothing below should be re-litigated before then.

---

## 1. What NIWA actually does

VCSN is **not** the same algorithm as ours, and the differences are structural.

| | NIWA VCSN | Auxein TPS today |
|---|---|---|
| Engine | ANUSPLIN v4.2 (Hutchinson) | `scipy.interpolate.Rbf`, legacy |
| Spline | **Trivariate** 2nd-order thin-plate smoothing spline | Bivariate thin-plate RBF |
| 3rd variable | A **pattern covariate** — elevation for temperature; **1951–80 mean annual rainfall** (digitised expert contour map) for rainfall | None. Elevation enters as a fixed 0.6 °C/100 m detrend/retrend |
| Coordinates | Easting / northing (metric) | **Raw degrees lon/lat** |
| Smoothing | Roughness penalty λ chosen by **minimising GCV**; reports effective dof ("signal") | `smooth` grid + 5-fold CV MSE |
| Range handling | None — the smoothing does the work | Hard clip to observed range |
| Grid | 0.05° (~5 km), 11,491 points | 5 km fixture; 500 m national planned |
| Input stations | ~200 (rainfall) | 607 active today, ~1,000 target |

Sources: [VCSN technical description](https://niwa.co.nz/climate/our-services/virtual-climate-stations/virtual-climate-station-network-vcsn-data-technical-description),
[Tait et al. 2012](https://research-groups.usask.ca/hydrology/documents/pubs/papers/tait_et_al_2012.pdf),
[MfE Atmosphere & Climate Indicators 2023](https://environment.govt.nz/assets/publications/Environmental-Reporting/Atmosphere-and-climate-indcators-2023-updated-datasets.pdf).

The single most important thing Tait et al. established: for daily rainfall,
**using a mean-annual-rainfall climatology as the covariate reduces error more
than using elevation does.** Our precip model has neither.

---

## 2. Published NZ accuracy numbers (the benchmark set)

| Study | Variable | Metric | Value |
|---|---|---|---|
| Tait, Sturman & Clark 2012 | daily rainfall vs **718 independent** council gauges (3.6 M station-days) | MAE, all days | **2.6 mm** |
| " | days both VCS and gauge > 1 mm (30.2% of days) | MAE / median bias | **6.9 mm** / +0.3 mm |
| " (after bias correction) | daily > 1 mm, **below** 500 m | MAE | **2–4 mm** |
| " | daily > 1 mm, **above** 500 m | MAE | **5–15 mm** |
| " | daily > 40 mm | MAE | 8–12 mm low / 10–40 mm high |
| " | monthly totals | MAE | 10–15 mm low / **10–120 mm** high |
| Tait et al. 2006 | mean **annual** rainfall (validated via river flows) | RMSE / bias | ~15% / −7%; **up to 50%** in high-elevation catchments |
| [Tait & Woods 2007](https://journals.ametsoc.org/jhm/article/8/3/430/5709/Spatial-Interpolation-of-Daily-Potential) | daily PET, 20 validation sites | RMSE | ~1 mm (summer) → ~0.4 mm (winter). Paper explicitly advises **caution above 500 m** |
| Jobst, Wilson & Tait 2019 † | daily Tmax / Tmin, **high-elevation** NZ, improved methods | mean RMSE | 2.38 °C / 2.93 °C; VCSN warm-biased at elevation, temporal RMSE **>3 °C** in places |
| [HOTRUNZ 2022](https://essd.copernicus.org/articles/14/2817/2022/) | **monthly** 1 km grids | cross-val MAE | T ~0.5 °C (<500 m) / ~0.7 °C (≥500 m); rain ~18 / ~24 mm |
| **Auxein TPS, measured 2026-08-04** | **daily Tmean**, nested 10-fold CV | RMSE | **median 1.27 °C** (current) → **1.12 °C** (proposed) |

† Jobst numbers taken from indexed abstracts; the full text was paywalled (403).
Treat as indicative until the PDF is obtained.

**Read this carefully before quoting it in marketing.** NIWA has never published
a directly comparable daily-Tmean cross-validation RMSE. Our 1.27 °C is measured
at station locations, on a network that is 93% below 500 m, with the clip
applied. It is *in the right family* and it is measured more honestly than most
published figures — that is the defensible claim. "More accurate than NIWA" is
not.

---

## 3. Measured findings on our own code

### 3.1 The smoothing search is a no-op, and the fit is an exact interpolant

Across all 15 dates the CV picks the **bottom of the smoothing grid** (1e-4) on
11/15 dates. Extending the grid to `logspace(-4, 4, 17)` changes nothing —
1e-4 wins on **15/15**. Larger smoothing never helps.

The reason is in scipy itself:

```python
# scipy/interpolate/_rbfinterp... legacy Rbf._init_function caller:
return self._init_function(r) - np.eye(self.N) * self.smooth
```

`smooth` is **subtracted** from the kernel diagonal, not added as a ridge. For
`function='thin_plate'` the kernel is `r²·log(r)`, whose sign flips at `r = 1` —
so whether `smooth` damps or amplifies **depends on the numeric scale of your
coordinates**. It is not a normalised smoothing parameter, and it is not
ANUSPLIN's GCV-optimised roughness penalty.

Consequence: **in-sample RMSE has a median of 0.014 °C** while out-of-sample is
1.27 °C — a 90× gap. The surface passes through essentially every station and
oscillates between them. 35 spline fits per timestep are being spent to select
"no smoothing".

### 3.2 The clip is load-bearing, not cosmetic

| | median | mean | worst |
|---|---|---|---|
| LOOCV RMSE, clipped (production) | 1.309 | 1.310 | 1.592 |
| LOOCV RMSE, **unclipped** | 1.330 | 1.868 | **7.286** |

On 01_01_1998 the unclipped model is off by 7.3 °C RMSE. The clip is masking an
ill-conditioned fit rather than fixing it. ANUSPLIN needs no clip because the
GCV-selected penalty keeps the surface tame.

### 3.3 The `rmse_target=0.4` escalation ladder fires, and when it does it deletes stations to flatter a meaningless number

`fit_surface` compares **in-sample** RMSE against a 0.4 °C target and, if it
fails, escalates declustering from 0.5 km out to 10 km — deleting real stations
and refitting until the number comes down.

On the production path it fires on **2 of the 15 golden dates**:

| Date | escalated to | stations dropped | in-sample RMSE before → after |
|---|---|---|---|
| 01_01_1987 | 4 km | 195 → 192 | 0.751 → 0.004 |
| 01_01_1991 | 6 km | 179 → 168 | 0.913 → 0.002 |

That "improvement" is the signature of the failure, not a fix: handing the
spline a sparser set lets it interpolate more exactly, so the residual collapses
by two orders of magnitude while eleven genuine observations are thrown away.
The out-of-sample number does not improve — 1991 has the *worst* `cv_rmse` of any
date in the set either way.

*(An earlier draft said this never fires. That measurement used shuffled 10-fold
smoothing selection; production uses unshuffled 5-fold, which lands on a
different smoothing and does trip the gate.)*

### 3.4 `snr = mean(y) / rmse` is not a signal-to-noise ratio

`mean(y)` is the mean detrended temperature (~19 °C on 1 Jan). Express the same
surface in Kelvin and the "SNR" rises ~15×. It measures the arbitrariness of the
Celsius origin. ANUSPLIN's *signal* is the **effective degrees of freedom** —
`trace` of the influence matrix — with the guidance that signal should stay below
about n/2. That is the diagnostic worth having; the ridge engine now computes it
(§5), the legacy engine cannot.

### 3.5 Degrees vs metres: a free ~3% and a correctness fix

At −41° latitude, 1° longitude ≈ 84 km and 1° latitude ≈ 111 km. Thin-plate
splines are **isotropic** — they assume distance in the input space is physically
meaningful. Fitting in degrees imposes a 32% east–west stretch with no physical
basis, on a country whose climate gradients run mostly perpendicular to the main
divide.

Switching to a local metric projection alone: mean LOOCV 1.310 → 1.272,
worst 1.592 → 1.515.

### 3.6 The elevation blind spot — and CV cannot see it

Station network vs the 5 km grid, 01_01_1986:

| | stations | grid cells |
|---|---|---|
| above 200 m | 27.2% | 68.0% |
| above 500 m | 6.5% (12 of 184) | 38.7% |
| above 1000 m | **0.0%** | 14.5% |

**17.3% of grid cells sit above the highest station in the network.** For those
cells the *only* thing determining the answer is the fixed 0.6 °C/100 m lapse
rate. Measured empirically per day on these same 15 dates, the actual lapse rate
ranges **0.25 to 0.81 °C/100 m** (median 0.46). We are using 0.6 everywhere.

Cross-validation cannot detect any of this — it can only score where stations
exist, which is below 500 m. This is exactly the failure mode Tait & Woods
flagged ("use above 500 m with caution") and that Jobst et al. quantified as a
VCSN warm bias with >3 °C RMSE at elevation.

For a vineyard product this is *commercially* survivable — vineyards are low —
but the published confidence figure must be scoped to the elevation band it was
measured in.

### 3.7 A related, invisible bias: two different elevations

Detrend uses **station metadata height** (CliFlo). Retrend uses **grid DEM
elevation**. Those are different vertical references — a valley-floor station can
sit in a 500 m DEM cell whose mean elevation is a hundred metres higher. The
resulting bias is systematic, elevation-dependent, and invisible to every metric
we currently compute.

### 3.8 Naive "go trivariate like ANUSPLIN" makes it worse

Tested: elevation as a third spline dimension (scaled 0.5–4 km horizontal per km
vertical), best scale per date, LOOCV in real space.

| | median | mean | worst |
|---|---|---|---|
| detrend/retrend (current) | 1.311 | 1.272 | 1.515 |
| trivariate, best scale | 1.466 | 1.482 | 1.840 |

**Worse on every date.** ANUSPLIN's trivariate works because it uses a proper
m-th-order thin-plate basis with a GCV-optimised penalty and calibrated elevation
exaggeration. scipy's fixed `r²log r` basis in 3D is simply the wrong kernel.
The original author's detrend/retrend choice was correct — keep it.

### 3.9 The declustered holdout is not an independent test set

Stations within 0.5 km of a fitted station are ~0 km away. `t_rmse` measures
instrument agreement between colocated sensors, not interpolation skill, and it
will always flatter. Also, `decluster` keeps `members[0]` — whichever station
happens to come first in the file — rather than the longest-record or
best-quality one, or an average of the cluster.

### 3.10 Memory risk at the national 500 m grid

`evaluate_on_grid` chunks at 250,000 cells. Legacy `Rbf.__call__` materialises a
dense `(n_eval × n_nodes)` distance matrix *and* a same-sized kernel matrix. At
607 stations that is ~2.4 GB of transient allocation per chunk; at the 1,000-
station target, ~4 GB. Drop `chunk_size` to ~25,000 or move to
`RBFInterpolator(neighbors=k)`.

### 3.11 The projection has no antimeridian wrap, and silently deletes stations

*(2026-08-05. Fixed — see §5.2.)*

`project_km` was a plain equirectangular projection:

```python
x = (lon - lon0) * 111.320 * np.cos(np.radians(lat0))
```

Raoul Island reports **177.93 west**. Against a network centroid near 173 east
that arithmetic placed it at **x = −29,371 km** — about 30,000 km to the west of
New Zealand, when it physically sits ~756 km to the east.

The interesting part is the failure mode. A station that far out is not
corrupted so much as **erased**: at 30,000 km its kernel contribution is
constant-plus-linear across the whole fitting domain, and the spline's own
polynomial term `P = [1, x, y]` already spans exactly that, so the bordered
system absorbs it into the trend. Measured over the rainfall network the
national MAE effect was **under 0.1%**. Raoul has nothing to say about New
Zealand rainfall either way, so the bug was harmless *by luck*.

**The case that matters is the Chatham Islands** — ~870 km east, genuinely
informative for eastern surfaces, and 682 km from the nearest grid cell. They
would project to −29,256 km and contribute nothing, with no error raised. Raoul
already arrived via NOAA SYNOP, so that is a live ingest path.

`haversine_km` never had this bug: `sin(dlon/2)²` is periodic, so declustering
and every distance statistic in this document were always correct.

### 3.12 Offshore stations: excluding them is *worse*, and the reason is the southern edge

*(2026-08-05. Measured on the live rainfall network, not the golden fixture:
`island_experiment.py`, 534 stations, 60 days spanning 2020–2024, 10-fold CV by
station, 26,644 held-out station-days per arm.)*

The hypothesis was that three far-offshore stations — Campbell Island,
the Auckland Islands and Raoul — were tugging the global linear trend and should
be dropped. **The hypothesis was wrong.**

The test set is **identical in every arm**: mainland stations only, islands
fitted but never scored. Otherwise dropping three high-error stations from the
test set would "improve" the mean while saying nothing about the surface over
land.

| arm | national MAE | vs baseline | southern band (lat < −44) |
|---|---|---|---|
| **A baseline** (all 534) | **1.9229** | — | **1.8175** |
| B no islands | 1.9352 | +0.64% | 2.0239 (**+11.4%**) |
| C Raoul wrapped | 1.9244 | +0.08% | 1.8304 (+0.7%) |
| D no Raoul | 1.9245 | +0.09% | 1.8303 (+0.7%) |
| E no southern pair | 1.9333 | +0.54% | 1.9906 (**+9.5%**) |

Cluster-bootstrapped by station (2,000 resamples), all four arms are
significantly worse than baseline.

**The whole effect is Campbell + the Auckland Islands, and it is a benefit.**
They are the only stations south of the mainland, so they convert the southern
coast from an extrapolation edge — where the TPS linear term runs free — into
interpolation interior. 29 Southland/Otago stations gain ~9.5% MAE from their
presence. Caveat: only 1,485 station-days behind that, and the bootstrap CI is
[+0.0001, +0.65] mm — the sign is solid, the magnitude is not.

**Raoul is inert.** Removing it and correctly projecting it both move the
national number by <0.1%.

Expect this result to **shrink** as the network fills. The islands are worth
9.5% precisely *because* the southern coast is an extrapolation edge today;
seeding Otago and Southland moves that edge offshore. That is a good outcome
which will look like the islands stopped mattering. Keep them regardless.

**A trap for anyone re-running this:** do not identify islands by
distance-to-nearest-peer. Station 187 on the Taranaki coast is 179 km from its
nearest neighbour purely because Taranaki has no council feed yet, so an
isolation test flags an ordinary mainland station as an island — and dropping it
in the exclusion arm confounds the very thing being measured. The script uses a
mainland bounding box. This was caught only because the first run's exclusion arm
degraded the *northern* band, which no island hypothesis explains.

---

## 4. The headline experiment: proper TPS vs current

Standard thin-plate spline — bordered system with a linear trend, **`n·λ·I` added
to the kernel diagonal**, λ selected by **minimising GCV** (what ANUSPLIN does),
fitted in **metric coordinates**, **no clip**.

Scored by nested 10-fold CV with the smoothing parameter re-selected inside every
training fold, so neither arm sees held-out data:

| | median | mean | worst |
|---|---|---|---|
| current (degrees, scipy `Rbf`, CV-picked `smooth`, clipped) | 1.269 | 1.301 | 1.579 |
| **proposed (km, ridge TPS, GCV-picked λ, no clip)** | **1.116** | **1.145** | **1.486** |

**Better on 15 of 15 dates. Median −12.3%, best −17.6%, worst −5.9%.**

Effective degrees of freedom of the GCV fit: median **52% of n** — right on
ANUSPLIN's "signal below n/2" guidance, versus the current model's ~100%
(interpolating). The clip becomes unnecessary because the surface no longer
overshoots.

Reproduce: `scratchpad/diag.py`, `diag2.py`, `diag3.py`.

---

## 5. Built: the ridge + GCV engine — now the default

Implemented in `backend/scripts/interpolation/tps.py`. `fit_surface()` now fits
with `engine="ridge"` unless told otherwise; `engine="legacy"` still reaches the
on-prem-faithful path, which is untouched.

`parity_check.py` keeps defaulting to `--engine legacy` deliberately — that
suite exists to guarantee the *port* is faithful, and only the legacy engine can
be. Use `--engine both` to run the guarantee and the production comparison
together.

`RidgeTPS` solves the standard bordered system

```
(K + n·λ·I) c + P d = y
P^T c = 0
```

with `K[i,j] = φ(|xᵢ - xⱼ|)`, `φ(r) = r²·log r`, `P = [1, x, y]`, in kilometres
about the station centroid. The whole λ grid comes off **one** eigendecomposition:
writing `P = [Q₁ Q₂][R; 0]` and substituting `c = Q₂z` reduces it to
`(Q₂ᵀKQ₂ + n·λ·I) z = Q₂ᵀy`, so with `G = Q₂ᵀKQ₂ = U diag(g) Uᵀ` computed once,
every λ costs O(n). Two identities give the diagnostics without ever forming the
n×n influence matrix:

```
residual      = y - fitted = n·λ·c
trace(I - A)  = n·λ · Σⱼ 1/(gⱼ + n·λ)
```

Verified against an independent brute-force build of the full bordered system:
`edf` agrees to 0.02, GCV to 4 dp, predictions to ~1e-2 °C (the brute-force
reference is the *less* accurate of the two — it `pinv`s a badly conditioned
(n+3)² matrix). λ = 10 is a genuine interior optimum, unchanged when the grid is
extended to 1e6.

Also changed: `_cdist` uses the `|a|² + |b|² - 2ab` expansion rather than
broadcasting (the broadcast form materialises an `(n_eval, n_nodes, 2)`
intermediate — 2.4 GB at a 250k-cell chunk against 600 stations), and
`evaluate_on_grid`'s default `chunk_size` dropped 250k → 50k.

### Parity re-run — `parity_check.py --all --engine both`

**Legacy engine: PASS.** Worst `max|diff|` across all 15 golden dates is
**1.9e-9 °C**, unchanged. The port still reproduces the on-prem model exactly.

**Ridge engine, same 15 dates:**

| | median | mean | worst |
|---|---|---|---|
| legacy `cv_rmse` | 1.324 | 1.316 | 1.585 |
| **ridge `cv_rmse`** | **1.106** | **1.116** | **1.334** |

**−13.8% median, better on 15/15 dates**, best −27.9%, worst −1.9%. Signal (edf)
median **47% of n** — on ANUSPLIN's guidance. No clip. Runtime per date drops
from ~0.5–3.3 s to ~0.15–0.20 s, because one eigendecomposition replaces 35
spline fits.

**Divergence from on-prem is broad, not alpine.** Mean |ridge − on-prem| is
0.3–0.7 °C and is *flat across elevation bands* (e.g. 01_01_2000: 0.64 at
0–200 m, 0.71 at 500–1000 m). The largest single divergence on 01_01_1996 is
5.4 °C at **260 m**, not in the mountains. This is not a clipping artefact — the
two engines genuinely smooth differently everywhere, by about the same magnitude
as the accuracy gain. Any switch is a visible change to every map.

### 5.0 Why the maps move ~0.44 °C

Measured, not asserted (`scratchpad/whymove.py`):

| | legacy | ridge |
|---|---|---|
| RMS distance the surface sits from its own stations | 0.021 °C | **0.587 °C** |
| Spline-field roughness, mean \|cell − neighbour mean\| | 0.0182 | **0.0077** (2.4× smoother) |
| Mean \|ridge − legacy\| over the grid | — | **0.441 °C** |
| Out-of-sample `cv_rmse` (median) | 1.324 °C | **1.106 °C** |

The old engine passed through every station exactly, so every station's departure
from its neighbours — instrument offset, siting, observation timing, real
microclimate — was written into the surface as a bump. Ridge keeps only the part
that is reproducible. The 0.44 °C *is* that discarded per-station wiggle.

The decisive row is the last one: **out-of-sample error went down.** Had the
wiggle been real signal, removing it would have hurt predictions. It helped, on
15/15 dates.

Spatially the difference is flat, not concentrated: mean |ridge − legacy| is
0.448 / 0.444 / 0.433 / 0.445 °C in the 0–2 / 2–5 / 5–10 / 10–20 km bands from
the nearest station, rising only to 0.504 at 20–40 km and 0.588 beyond 40 km. At
~40% of the surfaces' own out-of-sample error, the two maps are within each
other's uncertainty at any single point — the gain is statistical, visible across
many points rather than at one.

*(A first pass measured roughness on the final retrended output and found the two
engines identical. That metric was dominated by the DEM's own roughness, which
the lapse retrend adds to both surfaces alike. The table above measures the
spline field before retrending, which isolates what actually changed.)*

**The honest limit.** CV cannot distinguish measurement noise from real
microclimate observed by only one station — a frost hollow and a miscalibrated
sensor look the same to it, and ridge smooths both. For vineyard frost risk that
is a real loss, and the remedy is more stations or site-level correction, not
less smoothing: with a single observation the two are not separable.

### 5.1 GCV penalty inflation — tested, and the obvious version does not work

Ordinary GCV under-smoothed on 3 of 15 dates (edf 91–94% of n). The textbook fix
is to charge more per degree of freedom:

    V_γ(λ) = n·RSS / (n − γ·edf)²

Swept γ over 1.0–3.0, scored by shuffled 10-fold CV with λ re-selected inside
every fold (`gamma_experiment.py`):

| γ | median | mean | worst | edf/n | vs γ=1 |
|---|---|---|---|---|---|
| **1.0** | **1.106** | 1.138 | 1.490 | 49% | — |
| 1.1 | 1.122 | 1.112 | 1.352 | 33% | +1.5% |
| 1.2 | 1.114 | 1.117 | 1.345 | 25% | +0.7% |
| 1.4 | 1.151 | 1.148 | 1.400 | 21% | +4.2% |
| 2.0 | 1.258 | 1.235 | 1.453 | 10% | +13.8% |
| 3.0 | 1.323 | 1.375 | 1.754 | 5% | +19.6% |

**Every fixed γ > 1 is worse on median than ordinary GCV.** Choosing γ by
leave-one-date-out (picked on 14 dates, scored on the 15th) gives +1.5% median
and wins on only 5/15. So my proposed fix, applied as proposed, was wrong.

What the per-date detail shows is that γ helps *only* where ordinary GCV had
already visibly failed. On 01_01_1996, γ=1 lands at edf 94% and RMSE 1.262;
γ=1.1 lands at edf 37% and RMSE 1.158 — better on both. On the well-behaved
dates it costs. So apply it conditionally:

> Select λ by ordinary GCV. If that choice spends more than 80% of the available
> degrees of freedom, re-select at γ = 1.2.

| | median | mean | worst |
|---|---|---|---|
| ordinary GCV | 1.106 | 1.138 | 1.490 |
| **guarded** | **1.106** | **1.116** | **1.334** |

Identical median, **−2.0% mean, −10.0% worst**, better on 7/15 and worse on
none. It fires on 33 of 150 folds. The three problem dates drop from edf
93/91/94% to 22/17/37%.

Checked for knife-edge tuning across a 5×4 grid (threshold 0.70–0.90 ×
γ 1.05–1.4): **all 20 cells beat plain GCV, and none beats another by more than
0.4%** — median 1.106 in every cell, mean 1.112–1.128, worst 1.324–1.375. The
shipped constants (0.80, 1.2) sit mid-grid for that reason, not because they
scored best.

Now the ridge default: `DEFAULT_GCV_GUARD_EDF = 0.80`,
`DEFAULT_GCV_GUARD_GAMMA = 1.2`, overridable per call, `None` to disable.

### 5.2 Built: the antimeridian wrap and an explicit relevance rule

*(2026-08-05. Answers §3.11 and §3.12.)*

**The wrap.** `project_km` now wraps longitude differences into (−180, 180]:

```python
dlon = (np.asarray(lon, dtype=float) - lon0 + 180.0) % 360.0 - 180.0
```

Raoul moves −29,371 km → **+756 km**, Chathams −29,256 km → **+872 km**. The
wrap is the *identity* whenever `|lon − lon0| < 180`, so it cannot disturb any
fit whose stations lie on one side of the antimeridian: verified bit-for-bit
identical on all 531 mainland stations (`np.array_equal` True, max difference
exactly 0.0, not merely within tolerance). `project_km` is not on the legacy
path, so the parity guarantee is untouched — `parity_check.py --all --engine
both` re-run and passing, ridge stats unchanged at 1.106 / 1.116 / 1.334.

Precondition, documented in the docstring: `lon0` must lie within 180° of the
data. A naive `lon.mean()` satisfies that for any network clustered on one side,
including ours, and the spline is invariant to a shift of origin anyway. A
network genuinely split across the antimeridian would need a circular mean.

**The relevance rule.** `tps.screen_relevance(stations, targets, max_km=800)`
returns `(kept, rejected)` with `distance_to_grid_km` and `reject_reason`, and
logs a warning — never a silent drop, for the same reason as §3.3.

Distance is measured to the nearest **output grid cell**. Neither obvious
alternative works. Station-to-station distance is circular — it defines
relevance by the clustering being screened. A bounding box is worse than
useless: Raoul is ~605 km from the NZ mainland box while Campbell is ~560 km, so
a rectangle *reverses* the ranking, having no idea which corner is land.
Against the 5 km grid:

| | distance to nearest grid cell | |
|---|---|---|
| Auckland Islands | 367 km | keep |
| Campbell Island | 598 km | keep |
| Chatham Islands | 682 km | keep |
| **Raoul Island** | **983 km** | **drop** |

800 km sits in the gap. Thresholds of 700 / 750 / 800 / 850 / 900 / 950 km all
select the identical 533 stations; the true stable band is 598–983 km, so 600
would be knife-edge — Campbell survives it by 2 km. The constant is calibrated
against **three** offshore stations, which is a small sample; re-measure if the
network ever gains stations in that band. Chunked at 5,000 target cells with a
running minimum, because a dense station × cell matrix at 1.44M cells and ~1,000
stations would allocate tens of GB.

**What this buys, stated honestly: almost nothing in accuracy.** Post-wrap,
dropping Raoul moves national MAE 1.9244 → 1.9245 mm. The whole wrap-plus-rule
change is +0.09% against the original buggy state — significant on 26,644 paired
station-days, irrelevant in practice. **The justification is correctness**: it
stops Chathams being silently discarded by arithmetic.

One oddity worth recording rather than chasing: the *buggy* baseline was
marginally the best of the three arms. A ghost station at −29,371 km weakly
regularises the linear trend. That is an accident, not a design, and not a
reason to keep it.

---

## 6. Recommendations, in priority order

### P0 — do before the national backfill

1. ~~**Replace scipy's `smooth` with a real ridge penalty and select λ by GCV.**~~
   **Built and defaulted** (§5, §5.1).

   **Contract minted at v2** — `SURFACE_CONTRACT_V2.md`. `smoothing` keeps its
   name but changes meaning and scale by four orders of magnitude (scipy
   `smooth` ~1e-4 → λ typically 0.3–30), and `rmse` changes from an artefact to
   a real statistic. Those are semantic changes to published fields, which the
   contract's own rule says force a bump — even though the migration cost is
   zero, because no v1 surface was ever generated and no v1 route implemented.

   v2 carries: re-measured §3.2 ranges, §3.3 scoring rules (λ re-selected per
   fold; no clip), §3.4 distance bands re-measured under ridge plus the
   elevation-blindness caveat, new §3.5 on why the maps move,
   `engine`/`edf`/`edf_frac`/`clipped` on `surface_run`, and the new
   `AUXEIN_*` COG tags. S3 prefix `surfaces/v2/`; **the route stays at
   `/api/v1/surfaces`** — v2 decouples the route version from the contract
   version, so the contract version now travels in `meta.contract_version`
   instead of the URL. §5 is otherwise byte-identical to v1, URLs included, so
   any stub already built against v1 satisfies v2 unchanged.
   `model_version` → `tps-2.0.0`.

   `SURFACE_CONTRACT_V1.md` is retained, marked superseded, and left describing
   the legacy engine accurately. **Anything that hardcodes a `smoothing` range
   or assumes `rmse ≈ 0` must be checked.**

2. ~~**Fit in a metric CRS.**~~ **Built** — local equirectangular about the
   station centroid, no pyproj dependency, generalises to regional runs and AU.

3. ~~**Retire the `rmse_target` / escalation ladder.**~~ **Disabled under the
   ridge engine** — GCV controls smoothness, so `rmse_target` now only sets the
   `degraded` flag and is compared against `cv_rmse`. Still live under `legacy`,
   deliberately, because parity depends on it.

4. ~~**Replace `snr` with effective degrees of freedom.**~~ **Built** — `edf`,
   `edf_fraction` and `gcv` are on `SurfaceFit`. `snr` is retained but now
   carries a comment explaining why it means nothing. Still to do: persist `edf`
   on `surface_run` and surface it in the contract.

5. **Sample station elevation from the same DEM as the grid.** Detrend and
   retrend must share a vertical reference. Keep the CliFlo height as metadata
   and log the discrepancy — it is a free data-quality signal on the station
   network.

6. **Scope the published accuracy figure to its elevation band.** Add
   `elevation_band` and `n_stations_within_20km` to the confidence payload in
   `SURFACE_CONTRACT_V1.md`. The distance-banded confidence you already specified
   is the right idea; it needs an elevation axis alongside it.

7. ~~**Wrap longitude at the antimeridian, and screen stations on distance to
   the grid.**~~ **Built** (§5.2). Correctness, not accuracy — worth +0.09% MAE
   in the wrong direction, and justified entirely by Chathams.

### P1 — the precipitation bake-off: RUN. The result was not what I predicted.

Built (`backend/scripts/interpolation/precip.py`,
`precip_bakeoff.py`) and measured against the live database: **534 usable
rainfall stations, 60 sample days spanning 2020–2024, 10-fold cross-validation
by station, 26,798 held-out station-days per method.**

Folds are by *station*, not station-day, and the climatology is refitted from
the training fold every time. A held-out station's own mean annual rainfall is
never used to reconstruct its own prediction — that leak would have made the
ratio method look far better than it is.

| method | MAE all | MAE wet-wet | RMSE | MAE <500 m | MAE ≥500 m |
|---|---|---|---|---|---|
| `raw` (current behaviour) | 2.212 | 7.129 | 9.185 | 1.788 | 3.427 |
| **`sqrt`** | **2.051** (−7%) | 7.200 | 9.237 | **1.636** | 3.244 |
| `ratio` (Tait's method) | 2.387 (**+8%**) | 7.516 | 15.451 | 2.120 | 3.154 |
| `ratio_sqrt` | 2.306 (+4%) | 7.968 | 15.188 | 2.034 | **3.087** |
| *`ratio_true`* † | *1.738 (−21%)* | *5.618* | *6.342* | *1.380* | *2.765* |
| *`ratio_sqrt_true`* † | *1.642 (−26%)* | *5.868* | *6.474* | *1.298* | *2.629* |

† Diagnostic arms only — they leak the held-out station's true MAR. **Not
achievable.** They exist to measure the method's ceiling.

**The climatology ratio does not work here, and the reason is precise.** With a
*perfect* climatology it is worth −21% to −26% MAE, nearly halves RMSE
(9.2 → 6.3) and cuts heavy-rain MAE from 27.9 to 20.7 mm. With *our* climatology
it is 8% worse than doing nothing. The entire gap is the climatology's own
error.

Break-even, binning each prediction by how wrong the interpolated MAR was at
that station:

| climatology error | n | `raw` | `sqrt` | `ratio` | ratio vs raw |
|---|---|---|---|---|---|
| 0–5% | 5,757 | 1.768 | 1.592 | 1.534 | −13% |
| 5–10% | 4,861 | 1.566 | 1.402 | 1.402 | −10% |
| 10–20% | 6,449 | 1.373 | 1.232 | 1.313 | −4% |
| 20–40% | 6,714 | 2.918 | 2.762 | 2.628 | −10% |
| **>40%** | 3,017 | 4.321 | 4.143 | **7.362** | **+70%** |

The ratio beats raw in every band up to 40% error and detonates beyond it. Our
climatology has a **median error of 14.4%, a 90th percentile of 43.9%** — so 11%
of station-days land in the band that destroys it, and they dominate the average.

**Why ours is not good enough, and why Tait's was.** Tait's covariate was a
hand-drawn, expert-guided contour map of *1951–80* mean annual rainfall — 30
years of quality-controlled record, with orographic knowledge in it that the
station network alone does not reveal. Ours is ~6 years of council telemetry
(2020–2026 is all we hold) interpolated with the same thin-plate spline that
struggles with rainfall in the first place. A covariate has to carry
*information the daily data lacks*; ours is derived from the same sparse network,
so it mostly carries the same noise twice.

Against `sqrt` specifically, our `ratio` is a wash even in the well-constrained
bands (1.534 vs 1.592, 1.402 vs 1.402, 1.313 vs **1.232**). An oracle hybrid that
somehow knew when to fall back to `sqrt` scores 2.025 — barely better than plain
`sqrt` at 2.051. So a confidence-gated hybrid is not worth the complexity.
Climatology quality is the binding constraint, full stop.

**Ship `sqrt`.** It is a free −7%, better in both elevation bands, and it fixes
the dry-day problem: false-wet rate drops from 6.8% to 3.8%, against VCSN's 5.0%.
Daily rainfall is heavily right-skewed and non-negative; interpolating its square
root stabilises the variance and, with the non-negativity clamp, stops the spline
predicting negative rain. No new data required.

**Then buy or build a real climatology**, and the −21% is waiting. Ranked:
NIWA rainfall normals (1991–2020); the LENZ mean-annual-rainfall layer; or
extend our own record backwards via CliFlo/GHCN — the crosswalk script already
in `ingestion/scripts/crosswalk_ghcnd.py` is the start of that. The climatology
is a much easier fitting problem than a daily field (smooth, averaged, no
timing), so it can also afford a richer model — elevation and a topographic
exposure index as covariates — which a daily fit cannot.

#### Dry-day handling: tested, and the trade runs the wrong way for this product

Also tested (`--pop-threshold 0.5`): interpolate a wet/dry indicator alongside
the depth and zero any cell whose interpolated probability of rain falls below
the threshold.

| | MAE all | false wet | false dry |
|---|---|---|---|
| `raw` | 2.212 | 6.8% | 3.5% |
| `raw` + mask | 2.087 (−6%) | 3.0% | 5.4% |
| `sqrt` | 2.051 | 3.8% | 4.4% |
| `sqrt` + mask | **2.025** (−1%) | **2.7%** | 5.5% |
| *VCSN (Tait 2012)* | *2.6* | *5.0%* | *5.4%* |

The mask works — it lands the contingency table almost exactly on VCSN's — but
almost all of its benefit is already captured by `sqrt`, which gets there by
being non-negative rather than by thresholding. On top of `sqrt` it buys 1%.

And it buys that 1% by **trading false-wet for false-dry**, which is the wrong
direction for this product. Telling a grower it stayed dry when 3 mm fell is
worse than the reverse: it is the error that sends someone out to spray into
rain, or leaves a disease model under-counting a wetness event. Recommend
shipping `sqrt` *without* the mask, and revisiting only if a specific consumer
asks for the false-wet rate to come down.

#### Benchmark against NIWA, with the caveat stated

| Statistic | Auxein `sqrt` | VCSN (Tait et al. 2012) |
|---|---|---|
| MAE, all days | **2.05 mm** | 2.6 mm |
| MAE, wet-wet days | 7.20 mm | 6.9 mm |
| MAE, below 500 m | **1.64 mm** | 2–4 mm |
| MAE, above 500 m | **3.24 mm** | 5–15 mm |
| False wet | **3.8%** | 5.0% |
| False dry | **4.4%** | 5.4% |
| MAE, heavy rain (≥40 mm) | 27.9 mm | 8–12 mm low / 10–40 mm high |

**This is not a like-for-like comparison and must not be published as one.**
Tait validated against 718 *fully independent* council gauges that were never
input to VCSN, over 1960–2004, from a ~200-station input network. Ours is
10-fold cross-validation *within* a 534-station network — the held-out stations
are interpolated from their own neighbours, which is an easier task, and our
network is denser than the one VCSN ran on. The favourable columns mostly
measure station density, which is exactly what we have more of.

The heavy-rain row is the honest bad news: **27.9 mm MAE with a −16.5 mm bias.**
We systematically under-predict extremes, which is the standard failure of any
smoothing spline and is the single worst thing about our rainfall surfaces. It
is also the number a customer will notice first, since heavy-rain days are the
ones they look up.

### P1 (original recommendations, retained for the record)

This is the largest quality gap and NIWA has already published the answer.

7. **Build a mean-annual-rainfall climatology and interpolate the ratio, not the
   depth.** For each station, `ratio = daily_rain / mean_annual_rain`; interpolate
   the ratio; multiply by the climatology at each grid cell. This is Tait et al.
   2006's central result — it beat elevation as a covariate — and it is the single
   change most likely to make our precip surfaces defensible. Sources for the
   climatology: NIWA rainfall normals, LENZ, or derive from our own long-record
   stations plus a DEM-based orographic term.

8. **Transform before interpolating rainfall.** Daily rainfall is strongly
   right-skewed and non-negative; a plain TPS on raw depths produces negative
   rain and understates peaks. Square-root or cube-root, interpolate, invert,
   clamp at zero.

9. **Handle dry days explicitly.** Tait et al. 2012 found 5.0% of days where VCS
   is wet and the gauge is dry, and 5.4% the reverse. Interpolate a
   rain/no-rain probability field alongside the amount and threshold it, rather
   than letting a continuous surface smear drizzle across a dry region.

10. **Benchmark against Tait 2012 directly.** We have 439 rainfall stations —
    more than double VCSN's ~200. Hold out a spatially stratified 20%, and report
    MAE on wet-wet days below and above 500 m. If we land under 6.9 mm / 2–4 mm
    we have a genuine, citable comparison. That is a marketing asset worth the
    week it costs.

### P2 — once the above is in

11. **Per-day empirical lapse rate with shrinkage.** Regress observation on
    elevation each timestep, shrink toward a seasonal climatological prior
    weighted by how well the network constrains it (`n` and elevation range).
    Measured effect on Tmean LOOCV is small (1.277 vs 1.272) — *because CV is
    blind to the mountains*. The real payoff is at elevation, and it matters far
    more for Tmin than Tmean: nocturnal inversions give genuinely **negative**
    lapse rates that a fixed +0.6 gets backwards. Validate against the handful of
    high-elevation stations we can find, not against CV.

12. **Test a coastal-distance covariate.** Hutchinson notes ANUSPLIN temperature
    fits often add proximity-to-coast. NZ is narrow; almost every vineyard is
    maritime-influenced. Cheap to test once the GCV machinery exists.

13. **Average colocated stations rather than keeping the first.** And stop
    reporting `t_rmse` as an accuracy figure — it measures sensor agreement.

14. **Re-measure everything on the 607-station network.** All numbers here come
    from the 146–195 station historical fixture. Our own distance-banded table
    shows RMSE running 1.02 °C at 5–10 km against 1.76 °C at 40–80 km, so density
    is the dominant lever. Going from ~180 to 607 stations should beat every
    algorithmic change on this list combined — and it is already done.

---

## 7. What not to do

- **Don't go trivariate** just because ANUSPLIN is described that way (§3.8).
- **Don't quote "more accurate than NIWA."** No comparable published daily-Tmean
  figure exists, and our number is measured in a friendlier place than theirs.
- **Don't drop the southern islands.** Campbell and the Auckland Islands are the
  only stations south of the mainland and are worth ~9.5% MAE in the southern
  band (§3.12). "Remote station, must be noise" is the intuition that this
  experiment refuted.
- **Don't classify stations as offshore by distance-to-nearest-peer.** It flags
  Taranaki (§3.12). Use geography.
- **Don't re-run these benchmarks piecemeal as councils land.** One clean
  re-measure after seeding and backfill complete — see the note at the top.
- **Don't switch to `RBFInterpolator` as a like-for-like swap** (plan item 6).
  If P0.1 lands, the engine becomes our own bordered solve anyway, and the
  parity fixture stops being the right regression target — the golden files
  encode the on-prem model's *defects* as well as its behaviour. Keep
  `parity_check.py` as a historical record; add a new accuracy-regression suite
  against nested CV.
