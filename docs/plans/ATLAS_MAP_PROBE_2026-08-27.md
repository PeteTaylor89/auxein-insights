# Atlas: basemaps, surface opacity, and click-to-value

2026-08-27. ALL THREE ARE BUILT. Basemap + opacity in `SurfaceMap.jsx` /
`SurfaceMap.css`; the probe in `backend/api/v1/surfaces.py`,
`surfaceService.js` and `SurfaceMap.jsx`, with 36 new assertions in
`check_surfaces_live.py` (114/114 green against prod). Nothing is deployed and
nothing has been driven in a browser.

---

## PART 1 — BUILT: basemap picker and opacity slider

The surface is a continuous field with no landmarks in it. Read alone it is a
coloured blob that happens to be New Zealand-shaped; everything that lets a
grower locate themselves — the town they drive to, the river, the range that
makes the frost — lives in the basemap UNDER it, and a flat `raster-opacity`
of 0.85 hid all of it. Both halves of the ask are the same fix from either side,
so they are one panel.

- **Three basemaps**: Plain (`light-v11`, default), Terrain (`outdoors-v12`),
  Satellite (`satellite-streets-v12`). `light-v11` stays the default because the
  legend is calibrated against a pale ground.
- **Opacity slider**, 20%–100%, default 85%. The floor is not 0 on purpose: an
  invisible layer under a live legend is a bug report, not a setting.
- Bottom-right of the canvas — the one free corner (legend bottom-left, the
  Baseline/Projected flip top-left, Mapbox navigation top-right). On <=640px it
  moves above the legend, which is nearly canvas-width on a phone.

### Two implementation points worth keeping

**`setStyle` destroys every layer this component added** — the raster, the zone
fill, line and labels, and their sources. Mapbox has no "keep my layers" option.
Rather than re-adding them in the swap handler (a second copy of two effects,
which drifts from the originals the first time either changes), the swap drops
`mapReady` to false and raises it again on `style.load`. Both existing effects
are already keyed on `mapReady` and already rebuild from current state, so they
do the right thing for free. `appliedBasemap` is a ref because `mapReady`
cycling would otherwise re-enter the effect and `setStyle` forever.

**Opacity is read through a ref inside the raster effect, not as a dependency.**
As a dependency, every tick of the slider would remove and re-add the source —
a full tile refetch per pixel of drag. As a ref it is the initial paint value,
and a separate effect calls `setPaintProperty` on the live layer, which costs
nothing and refetches nothing.

Mapbox GL v3.12 renders the globe by default below ~z5 and `setStyle` keeps the
camera and projection, so switching basemaps does not lose the globe view.

---

## PART 2 — BUILT: click a cell, read the value

### What already exists

`GET /api/v1/surfaces/point` (contract §5.1) already does the read: it resolves
a `surface_run` row and calls `store.sample(s3_key, [(lon, lat)])`, which returns
`None` for nodata rather than 0. That is exactly the operation a probe needs.

It is the wrong endpoint to call from the Atlas for four reasons:

1. **It is `require_pro`** — 401 anonymous, 402 signed-in-not-Pro. Deliberately:
   it answers "what is it at MY site", which is the sentence Pro is sold on.
2. **It returns a SERIES**, not a probe: `start`/`end` walk months and build
   `Series`/`SeriesPoint` per variable. A tooltip wants one value.
3. **It refuses `granularity=daily`** on the real path with a 422 saying the
   published archive is monthly and seasonal. **That message is now stale** —
   daily surfaces exist from the live engine. Whoever builds the probe should
   fix that in the same change or the Pro daily path stays closed.
4. **It has no projections path at all.** The Atlas has a Projected mode reading
   `surface_projection_run`; `/point` knows nothing about it.

### Recommendation: a new `GET /surfaces/probe`

One point, one variable, one step. `{ value, unit, valid_at, statistic,
resolution_m, reason }` and nothing else — **no confidence block**, which is
where the Pro line sits. `/point` stays Pro and untouched: it keeps the series,
the `expected_error` band, distance-to-nearest-station, and multi-variable.

**It inherits the same gate as the tile on screen**, via the existing
`_gate_steps` order — cadence first, then date. Anonymous gets the newest step
at a free cadence, registered gets the 1986 archive, Pro gets daily. A probe can
never answer for a step the caller's own scrubber is not allowed to show.

Projected mode needs its own address, `GET /surfaces/projections/probe`, against
`projection_store.resolve`, inheriting `PROJECTIONS_REQUIRE` and the `WITHHELD`
frost exclusion. Same reasoning as the two separate tile routes: no URL should be
one path parameter away from turning a scenario into a measurement.

### Do NOT read the pixel client-side

Inverting the colour ramp off the rendered canvas looks free and is wrong. The
ramp is not invertible once `raster-opacity` blends it over a basemap — and Part
1 just made that opacity user-adjustable — and `raster-fade-duration` cross-fades
two months during a scrub. It would return plausible wrong numbers silently.
Server probe or nothing.

### Interaction

- **Click, not hover.** Each probe is a GDAL range read against S3 on the EB box,
  which saturates around 55 req/s. Hover would issue one per mousemove. If hover
  is wanted later: debounce >=250 ms and cache on the client keyed on
  `(variable, statistic, valid_at, cell)`, snapping to the cell with
  `resolution_m` — the answer is constant across a 500 m cell, so the hit rate is
  high at any useful zoom.
- **Ride the existing touch bridge.** `map.on('click')` is dead on touch in this
  component (MapboxDraw suppresses tap->click); the zone layer already bridges
  from `touchstart`/`touchend` with an 8 px move guard. A probe wired only to
  `click` silently does not work on a phone, which is where it gets demoed.
- **Click collides with the zone card.** A click on a zone polygon currently
  opens `ZoneOverviewCard`. Three options: (a) let both happen — popup anchored
  at the lngLat, card in the panel, they answer different questions;
  (b) probe only when Wine regions is off; (c) an explicit probe mode.
  **(a) is the recommendation** — least modal, no hidden state.
- **The popup must carry the same statistic and step as the legend** —
  "Mean 14.2 degC · March 2019 · 500 m". Without it, a probe of a monthly mean
  gets read as a maximum. Null is "outside the land mask", never 0.

### Effort

Backend ~80 lines reusing `store.resolve`, `store.sample` and `_gate_steps`.
Frontend ~120 lines in `SurfaceMap.jsx` (popup + touch bridge) plus a `getProbe`
in `surfaceService.js`. Roughly half a day each side once the gate is decided.

### THE DECISION, TAKEN 2026-08-27

**Pete: free at the visible cadence.** The alternative was on the table and was
not chosen:

- *For free at the visible cadence*: the tile is already on screen and `/tiles`
  is ungated. The value is legible off the legend to within a ramp step already,
  so what is actually withheld is precision and the confidence metadata, not the
  number. It makes the Atlas answer the first question every visitor asks.
- *For Pro*: "what is it at my place" is the sentence Pro is sold on, and a probe
  answers it at 500 m for nothing.

What shipped takes the first position and keeps the confidence block — the part
that is genuinely the product — behind `/point`.

---

## WHAT ACTUALLY SHIPPED, AND THE FOUR THINGS NOT TO UNDO

**`GET /surfaces/probe`** — one cell, one step. Runs `_gate_steps`, the SAME
gate `/available` runs, against `store.availability`, then matches the requested
step against the GATED list. `ProbeResponse` has no `confidence` field at all:
absent, not empty, or the split is decorative. 401 when signing in would open
it, 402 when only Pro would, and the sentence comes from the catalogue's own
`access.unlock` so the probe and the scrubber cannot make two different offers
for one gate.

**A withheld step and an absent one are told apart** against the UNGATED step
list. Reporting a month behind sign-in as a 404 would tell a visitor the archive
has a hole where it does not.

**`GET /surfaces/projections/probe`** — separate route, `PROJECTIONS_REQUIRE`,
and **the unit comes off the row**: a projected rainfall change field is a
percentage while the measured layer is millimetres. `projection_store.resolve`
already refuses WITHHELD layers with the same error as an absent one, so frost
is unreachable here without restating the exclusion.

**`stampFor(valid_at, granularity)`** is now shared by `tileUrlTemplate` and
`getProbe`. It used to be `monthStamp(valid_at) || valid_at` inline in the tile
builder, which was right only because no daily layer had reached the Atlas. Two
copies of one truncation rule is exactly how a popup ends up quoting a month the
map is not showing.

**The popup is a real `mapboxgl.Popup`** with React rendering into it through a
portal — it tracks pan and zoom natively where a React-positioned div would
re-render every frame of a drag — and it deliberately survives a basemap swap,
because popups are DOM on the container rather than style layers.

### THE UNIT IS A PROPERTY OF THE BAND, NOT OF THE VARIABLE

Caught in review on 2026-08-27: the popup labelled counts with the variable's
unit, so a frost count read "12.4 C" and a wet-day count "9.0 mm".

`UNITS[variable]` answers "what is temp_min measured in" and the answer is
degrees — but `temp_min/frost_days` is a COUNT OF DAYS, and `rainfall/wet_days`
is a count of days too. Same shape as the rainfall `cv_units` trap: a number
whose unit is inherited rather than stated.

`surface_store.unit_for(variable, statistic)` now decides it, keyed on the
statistic first, and `/probe`, `/point` and `/available` all read through it —
the legend and the popup must not disagree about one number on one screen.
Three kinds of band, and they are NOT interchangeable:

- **counts** (`frost_days`, `wet_days`, `days_over_*`, `max_dry_spell`) → `days`
- **day-of-month indices** (`argmin_day`, `argmax_day`, `first_frost_day`,
  `last_frost_day`) → `day of month`. "Day 27" is not "27 days", and a reader
  who adds two of them together is wrong in a way nothing will catch.
- **days since the epoch** (`all_time_max_day`, `all_time_min_day`) →
  `days since 1986-01-01`, which is `run_history.EPOCH` and the manifest's
  `date_epoch`.

`sd` keeps the variable's unit — a dispersion in degrees IS in degrees — and so
do `wet_top1..5`, which are rainfall depths and not counts.

The client rounds on `INTEGER_UNITS`, mirroring the server set, rather than on a
list of statistic names: the server sends the unit with the value, so a band
added there needs no client change. And the suite now asserts EXHAUSTIVELY that
every statistic in `surface_run` either appears in `STATISTIC_UNITS` or is named
in the check's value-band allowlist, so a new band cannot inherit a unit by
accident.

### One stale thing fixed on the way past

`_real_point` rejected `granularity=daily` with a 422 saying the published
archive was monthly and seasonal. True when written, stale from the day
`run_live.py` first published. It now walks days like the month branch, and the
acceptance suite's assertion flipped with it.

### Still open

- **A click on a wine region opens the zone card AND the probe popup.** That is
  option (a) and it was deliberate — they answer different questions — but it has
  not been seen on a phone, where both compete for the same screen.
- **Nothing is deployed.** Backend needs an EB deploy (from the working
  DIRECTORY, not git HEAD) and the frontend needs a publish.
