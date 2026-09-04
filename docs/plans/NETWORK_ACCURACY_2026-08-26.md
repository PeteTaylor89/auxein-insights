# What the two networks are actually good at — 26 August 2026

Follows `SURFACE_PROVENANCE_2026-08-25.md`. That one was about being able to
prove what we did. This one is about what the proof says.

Yesterday we finished per-zone accuracy for all four variables. Every one of
those runs measured the **CLIFLO archive** — the 1986-2024 record off `Z:`,
512 stations. But the daily product going live on 1 September is fitted from
the **database**, a different network entirely. Nobody had ever measured that
one per zone. Today we did.

Four runs, about a minute each, recorded at
`scratchpad/per_region_cv/_runs/20260826T005801Z`, `...005925Z` and
`...010111Z`. Results in `scratchpad/per_region_cv/_db_era_2026-08-26/`, with
the CLIFLO set preserved beside it in `_cliflo_2026-08-26/`.

---

## The short version

**The database network is better than CLIFLO almost everywhere in the country,
and much worse in Central Otago.** The national average hides both facts.

That single sentence has more consequence than anything in the tables below,
because Central Otago is where our GDD and frost claims are most specific and
where customers are most able to tell whether we are right.

---

## 1. National figures

| variable | CLIFLO era | DB era | change |
|---|---|---|---|
| mean temperature | 1.204 | **1.272** | +6% |
| minimum temperature | 1.881 | **2.128** | +13% |
| maximum temperature | 1.485 | **1.646** | +11% |
| rainfall | 5.421 mm | **7.650 mm** | +41% |

Read those as *different measurements*, not as the model getting worse. They
are different networks over different eras and they are not competing to answer
the same question. The CLIFLO figure describes the published 1986-2023 archive.
The DB figure describes the daily surface a subscriber will read next week.

The rainfall gap is the least meaningful of the four and should not be quoted:
the DB scores 791 gauges against CLIFLO's 648, and the extra ones are council
tipping buckets in wet hill country rather than CLIFLO climate stations. We
measured last week that zone rainfall error tracks zone wetness at 0.915, so
most of that +41% is the scored population being wetter, not the model being
worse.

---

## 2. Central Otago falls apart

It was among the best-served zones in the CLIFLO archive. In the database era
it is the **worst zone in the country on every single variable**.

| | CLIFLO | DB | |
|---|---|---|---|
| mean temperature | 1.038 | **1.889** | +82% |
| minimum temperature | 1.543 | **2.580** | +67% |
| maximum temperature | 1.248 | **2.314** | +85% |
| rainfall | 1.874 mm | **14.290 mm** | 7.6x |

Its neighbours go the same way — Bendigo maximum temperature 1.108 to 2.539,
Gibbston 1.268 to 2.004, Bannockburn rainfall 1.411 mm to 10.058 mm.

**The rainfall number is the one to look at hardest.** Central Otago is the
driest region in New Zealand, so the wetness explanation that covers the
national gap does not apply here — a seven-fold increase in a dry basin is a
real collapse, not an artefact of scale. The bias confirms it: Bannockburn
−1.539 mm, Bendigo −1.526, Gibbston −1.412, all meaning **we predict
substantially wetter than the gauges record**. We are raining on Central Otago.

### Why

Station counts, and nothing more exotic:

| zone | CLIFLO temp | DB temp | CLIFLO gauges | DB gauges |
|---|---|---|---|---|
| Central Otago | 23 | **6** | 17 | **7** |
| Gibbston | 7 | **2** | 6 | 3 |
| Bendigo | 6 | **3** | 4 | 3 |
| Bannockburn | 9 | **0** | 6 | **2** |

Every other zone in the country gained stations or held roughly steady. Central
Otago lost three quarters of them. This is the same deficit the era-offset field
exists to correct — the database has no thermometer above 488 m within 150 km of
there, so the smoother pulls a continental interior toward the coastal regime.
What is new is that we can now put a number on it per zone, and the number is
far larger than the national figure suggests.

---

## 3. The frost-valley bias is a coverage problem, not a model limit

This is the genuinely good news, and it changes what we should say about frost.

The CLIFLO archive shows a clear warm bias on minimum temperature in the
Marlborough frost valleys — we predict warmer than observed, so frost days read
low exactly where growers care. It has been on the disclosure list for a
fortnight as a probable sub-grid limit we could not fix.

**In the database era it is essentially gone.**

| zone | CLIFLO bias | DB bias | CLIFLO stns | DB stns |
|---|---|---|---|---|
| Upper Wairau and Southern Valleys | **−0.967** | **+0.035** | 7 | 15 |
| Lower Wairau | −0.548 | +0.050 | 7 | 10 |
| Awatere | −0.263 | +0.172 | 8 | 13 |
| Gladstone | −0.888 | −0.241 | 10 | 2 |

The bias tracks the station count. Double the thermometers inside the valley and
the spline can see the cold pooling; it was never an irreducible physical limit,
it was an absence of observations. **That is the strongest argument yet for the
manual zone-assignment pass** — the stations exist, they are simply not attached
to the right zones.

It moves rather than vanishes. Martinborough goes from −0.456 to **−1.272** on
three stations and Northland to **−1.426** on two. Both are too thin to act on
and neither should be quoted.

---

## 4. Where the database network is clearly better

Worth stating plainly, because the national table implies the opposite:

| zone | variable | CLIFLO | DB | |
|---|---|---|---|---|
| North Canterbury | mean temp | 1.359 | 0.836 | −38% |
| North Canterbury | min temp | 2.275 | 1.445 | −36% |
| Waipara | min temp | 2.181 | 1.445 | −34% |
| Gisborne | max temp | 1.466 | 1.009 | −31% |
| South Coast | max temp | 2.293 | 1.733 | −24% |
| Hawkes Bay | max temp | 1.202 | 0.944 | −21% |
| Nelson | rainfall | 4.530 | 3.598 | −21% |

Six years of council ingest has genuinely improved the surface across the North
Island, Nelson and Canterbury. The national average is dragged down by one
region.

---

## 5. What this means before 1 September

1. **A single national accuracy figure is now indefensible for the daily
   product.** The spread runs from 0.65 to 1.89 °C on mean temperature alone.
   The confidence badge must be per zone, and it must never show one variable's
   number for another.

2. **Central Otago needs either more stations or an explicit disclosure.** We
   should not publish a daily rainfall surface for Bannockburn at 10 mm error
   without saying so. The era-offset field corrects the temperature half of this
   for the archive join; it does nothing for rainfall, which is published
   uncorrected by design.

3. **The frost finding should change the roadmap.** Frost was parked as
   unfixable. It is fixable, and the fix is station assignment rather than
   modelling.

---

## 6. Caveats that limit what can be quoted

**Zone coverage is worse in the database network despite it being denser
overall.** 19 of 21 zones populated against 21 of 21, and 75 stations carrying a
zone membership against 142. Auckland drops from 37 stations to 2, Northland
from 16 to 2, and Waiheke and Waitaki have no DB temperature stations at all.
Any row with fewer than about five stations is an anecdote.

**North Canterbury and Waipara return identical rows** on all three temperatures
— same 11 stations, same error, same bias. At a 20 km buffer this network cannot
separate them. The same failure appeared on 14 August with strict membership and
it is back; the buffer distance needs settling rather than being left at a first
pass.

**These are cross-validation figures at stations.** They measure how well we
predict where we already observe, which flatters dense flat country relative to
remote terrain in the same zone.

**The zone rows are not a partition.** Zones overlap and nest; never sum them.

---

## 7. Still to run

- **The rainfall normalised column.** Until every rainfall figure is published
  either normalised or beside the zone's own annual rainfall, the table means
  something different from what it appears to mean. This matters more now, not
  less, because the DB rainfall network is much wetter than CLIFLO's.
- **A buffer sweep** at 10, 20, 30 and 40 km. It is the only arbitrary parameter
  in the measurement, and North Canterbury and Waipara prove it is load-bearing.
- **Re-cut the extracts.** Temperature came from `inputs_final_v2` and rainfall
  from `inputs4`, because `inputs_final_v2` has no rainfall file. One extract
  covering all four variables would make the comparison cleaner.

---

## Footnote: a live sensor fault is back

While choosing the input extract, station **473 Winton at Essex Street** turned
out to be reading 25.4 and 26.1 °C maximum on 22 and 23 August — in Southland,
in winter, against its own midsummer mean of 19.0. It is the fault we
quarantined on 24 August. A quarantine is a one-time update, not a standing
rule, and the hourly ingest keeps delivering late rows for days already covered,
so they land as good and the next re-aggregation pulls them back in.

The standing rule that fixes this **already exists** — `daily_qc.enforce_standing`
re-derives every open quarantine window from the flags already stored and
re-applies it before each run's checks. It is wired into `run_daily_processing`
step 1b and into the Fargate entrypoint. It has simply never run on a scheduler,
which is the same reason as everything else on the blocking list.

Immaterial to the numbers above (two station-days out of 79,073), but it needs
re-running before 1 September, and it needs to be on a schedule rather than run
by hand after somebody notices.
