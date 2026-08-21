# BOPRC: temp / rh / pressure stop dead at 2026-08-01 on 10 stations

Found 2026-08-19 while running coverage discovery for the live interpolation
engine. Open. **Live data loss, still losing** — 18 days and counting.

Handoff note for whoever owns the ingestion classes. I have not touched
`ingestion/` or re-run anything; this is diagnosis only.

## Symptom

BoP air-temperature station count fell **14 → 4 on 2026-08-02** and has been 4
every day since. Every other month of 2026 shows 14.

```
2026-07-31 | 14
2026-08-01 | 14
2026-08-02 |  4     <- cutover
...
2026-08-19 |  4
```

## It is three variables, not one, and the same ten stations

Distinct BOPRC stations per variable, the fortnight before 2026-08-02 vs after:

| variable | before | after | delta |
|---|---|---|---|
| rainfall | 52 | 52 | 0 |
| soil_temp | 12 | 12 | 0 |
| soil_moisture_vwc | 12 | 12 | 0 |
| solar_radiation | 1 | 1 | 0 |
| **temp** | 14 | **4** | **−10** |
| **rh** | 12 | **2** | **−10** |
| **pressure** | 16 | **6** | **−10** |

Exactly −10 on all three. Same ten stations.

## The ten are BoP's air-quality sites; the four survivors are hydrology sites

Lost (`temp` records after 2026-08-02 = 0):

```
906  BOPRC_MOUNT_MAUNGANUI_AT_BRIDGE_MARINA_ENTRANCE
907  BOPRC_MOUNT_MAUNGANUI_AT_RANCH_RD
908  BOPRC_MOUNT_MAUNGANUI_AT_RATA_ST
909  BOPRC_MOUNT_MAUNGANUI_AT_TOTARA_ST
910  BOPRC_MOUNT_MAUNGANUI_AT_TOTARA_ST_RAIL_CROSSING
911  BOPRC_MOUNT_MAUNGANUI_AT_WHAREROA_MARAE
933  BOPRC_ROTORUA_AT_EDMUND_RD
934  BOPRC_ROTORUA_AT_MOSES_RD
942  BOPRC_TAURANGA_AT_OTUMOETAI
959  BOPRC_WHAKATANE_AT_KOPEOPEO
```

Still reporting:

```
897  BOPRC_BORE_1001238_AT_LOCHINVER
899  BOPRC_EDGECUMBE_AT_EDGECUMBE
900  BOPRC_GALATEA_BASIN_AT_HOROMANGA_RD
916  BOPRC_OHOPE_SPIT_AT_OHOPE_GOLF_COURSE
```

Six Mount Maunganui sites, two Rotorua, one Tauranga, one Whakatane — that is
BoP's urban **air-quality** network. The four that survived are hydrology /
climate sites. The split is by network, not by geography or by station health.

## The ingester is not failing — it is succeeding and returning a stale window

This is the part that matters for diagnosis.

`ingestion_log` for BOPRC since 2026-07-25: **15,508 SUCCESS, 19 NO_DATA, 1
FAILED**. Station 959 — one of the ten — logged SUCCESS with 19–22 records
inserted at 2026-08-19 00:15.

But station 959's own data:

| variable | rows since 2026-07-01 | last timestamp (NZT) | last `created_at` |
|---|---|---|---|
| rainfall | 5,203 | **2026-08-19 11:50** | 2026-08-19 00:15 |
| temp | 4,393 | **2026-08-01 00:00** | 2026-08-19 00:15 |
| rh | 2,833 | **2026-08-01 00:00** | 2026-08-19 00:15 |
| pressure | 2,833 | **2026-08-01 00:00** | 2026-08-19 00:15 |

Same station, same run, same minute. Rainfall advances to today. Temp, rh and
pressure are being **re-written every day into a window that ends 2026-08-01
00:00 NZT and never moves**. Station 906 is identical.

So: not auth, not the `http://`-only constraint, not a station outage, not a
`temporalFilter` that failed loudly. `GetObservation` returns a 200 with data
that stops at Aug 1 for these offerings while the rainfall offering on the same
station is current.

## Where I would look first

`ingestion/sources/boprc.py:144`, `LABEL = 'Primary'`.

The offering key is `<Parameter>.<Label>@<LocationId>` and the label rule is
documented at :78 as a **whitelist of exactly one**, chosen so that a new label
appearing in the portal is *ignored rather than silently ingested at the wrong
aggregation*. That is the right call for correctness, and it is also precisely
the mechanism that would produce this: if BoP moved the AQ network's met
parameters off `Air Temp.Primary` on 1 August — to a new label, a new procedure,
or a separate AQ offering — the whitelist drops them with no error, the run
still reports SUCCESS on the rainfall it did get, and the loss is invisible in
`ingestion_log`.

The hypothesis is cheap to falsify. `GetCapabilities` and grep the
`<ows:Parameter name="offering">` value list for location 959, then diff the
labels present on `Air Temp` for 959 (AQ, broken) against 900 (hydrology,
working). If 959 now only publishes air temp under a non-`Primary` label, that
is the whole bug. If `Air Temp.Primary@959` still exists and simply has no data
after 1 August, it is upstream at BoP and worth an email rather than a code
change.

## Why it is worth fixing rather than writing off

Ten of the fourteen BoP thermometers is most of the region's temperature signal.
Bay of Plenty currently contributes 14 genuine-DTR stations to a live national
network of 210; losing 10 of them takes BoP from adequately sampled to
essentially SYNOP-only, and it is one of the regions where the 2020–2023 record
was already carried by BOPRC alone (11 of the ~50 genuine-DTR stations that
existed before the Hilltop repopulation).

Also worth a general note: **`ingestion_log` cannot see this failure.** A run
that fetches 3 of 4 variables logs SUCCESS. A per-station-per-variable
last-seen watchdog — alert when a (station, variable) pair that reported daily
for 30 days goes 48 h silent — would have caught it on 2026-08-03 rather than
on day 18. Same class of blind spot as the incremental-clamp gap: the row count
looks healthy because the rows that remain are real.

## Related

- `HILLTOP_TEMPERATURE_DEGENERATE_2026-08-19.md` — separate defect, same
  variable, opposite direction (archive vs live). Unrelated cause.
- `docs/plans/LIVE_SURFACES_DISCOVERY_2026-08-19.md` §4 — this is listed there
  as a Phase 0 blocker for the live daily surfaces.

---

# DIAGNOSIS 2026-08-20 — the `LABEL = 'Primary'` hypothesis is FALSIFIED

Not our bug. No code change will recover this data. It needs an email to BoP.

The SOS endpoint is IP-allowlisted to the ingestion box and is unreachable from a
workstation, so this was settled from an artefact already on disk:
`ingestion/scripts/probes/boprc_sos.json`, captured **2026-08-13T03:06Z — eleven
days AFTER the cutover**, and therefore a picture of the server *during* the
outage.

That probe's `series` map is built as `f"{parameter}.{LABEL}@{loc}"` with
`LABEL = 'Primary'` (`seed_boprc_from_sos.py:258`), and a location only enters it
at all if `label == LABEL` (:230). So every figure below is specifically
`Air Temp.Primary`.

## `Air Temp.Primary` still exists for all ten. Its record simply stops.

Period of record from BoP's own `GetDataAvailability`:

| station | Air Temp.Primary begin → end |
|---|---|
| Mount Maunganui at Bridge Marina Entrance | 2024-09-26 → **2026-07-31T12:00** |
| Mount Maunganui at Ranch Rd | 2024-02-01 → **2026-07-31T12:00** |
| Mount Maunganui at Rata St | 2018-12-13 → **2026-07-31T12:00** |
| Mount Maunganui at Totara St | 2006-03-02 → **2026-07-31T12:00** |
| Mount Maunganui at Totara St Rail Crossing | 2024-01-19 → **2026-07-31T12:00** |
| Mount Maunganui at Whareroa Marae | 2015-09-25 → **2026-07-31T12:00** |
| Rotorua at Edmund Rd | 2006-02-04 → **2026-07-31T12:00** |
| Rotorua at Moses Rd | 2018-01-08 → **2026-07-31T12:00** |
| Tauranga at Otumoetai | 1998-07-27 → **2026-07-31T12:00** |
| Whakatane at Kopeopeo | 2006-07-12 → **2026-07-31T12:00** |

Against the four hydrology survivors, all current as at the probe:
Lochinver 2026-08-13T02:40, Edgecumbe 02:50, Horomanga 03:00, Ohope 02:50.

**All ten stop at the same instant to the minute.** `2026-07-31T12:00:00Z` is
`2026-08-01 00:00` NZST. Ten independent sensors do not fail on the same second;
one upstream system does.

Our ingester fetched right up to that boundary and stopped because there was
nothing beyond it — the last stored record for each of the ten is exactly
2026-08-01 00:00 NZT (10 stations x 1 record in the 1-7 Aug window). It has been
behaving correctly the whole time.

## No alternative label carries them
`hourly_offerings` is empty for all ten (Kopeopeo has `Precip Total` only), and
their `series` sets are exactly `[Air Temp, Atmos Pres, Rel Humidity]` — the
three variables that stopped, and nothing else to fall back to. There is no
server-side hourly or renamed series to switch to.

## It is NOT an annual cycle
Worth ruling out, because three previously-decommissioned BoP sites carry end
stamps of `2023-07-31T12:00` and `2024-07-31T12:00` — the same 31 July boundary,
which looks like a seasonal pattern and is not one. Those are *different*
stations that stopped permanently in earlier years. Our own record for these ten:

| year | records 25-31 Jul | records 1-7 Aug |
|---|---|---|
| 2020 | 6,048 | 6,048 |
| 2021 | 7,045 | 7,015 |
| 2022 | 7,036 | 7,056 |
| 2023 | 7,051 | 6,587 |
| 2024 | 9,044 | 9,072 |
| 2025 | 10,010 | 10,080 |
| **2026** | **10,080** | **10** |

Six clean crossings, then a cliff. What the recurring `07-31T12:00` stamp does
suggest is that **BoP closes a decommissioned series at that reporting-year
boundary** — which makes "these ten AQ sites were decommissioned or migrated in
BoP's system on 1 August 2026" the hypothesis to put to them.

## Ask BoP
Whether the ten air-quality sites' met parameters (`Air Temp`, `Rel Humidity`,
`Atmos Pres`) were decommissioned, migrated to a new location id, or moved to a
separate AQ service on 1 August 2026 — and if migrated, what the new offering
key is. Rainfall on the same stations is unaffected and still current, so the
sites themselves are alive.

## The code change that IS warranted
Not a parser fix — a watchdog. `ingestion_log` recorded **15,508 SUCCESS** across
the fortnight this was losing ten stations, because a run that fetches 3 of 4
variables is a success. A per-(station, variable) last-seen alert — a pair that
reported daily for 30 days going 48 h silent — catches this on 2026-08-03 instead
of day 18. Same blind spot as INGEST_STATUS_REPORT_2026-08-19.md and the
incremental-clamp gap.

---

# CORRECTION 2026-08-20 (later) — the LABEL hypothesis was RIGHT for 3 of the 10

Pete noticed BoP's own portal showing **7** live air-temperature stations against
the 4 we store, which does not fit the "all ten stopped upstream" verdict above.
He was right and that verdict was wrong for three of them.

## What the portal shows

`envdata.boprc.govt.nz/Data/Map/Parameter/Air Temp/Interval/Latest`
(AQUARIUS WebPortal) legend reads **Temperature (7)** — Cool 4, Mild 3 — under
Value = *Latest - Continuous*.

Enumerating every BoP location's Air Temp datasets through the portal's own
`/Data/DataSets/?locationid=` endpoint:

| location | Air Temp datasets |
|---|---|
| FB471317 Bore 1001238 at Lochinver | `Air Temp.Primary` |
| JL671469 Edgecumbe at Edgecumbe | `Air Temp.Primary` |
| JH105608 Galatea Basin at Horomanga Rd | `Air Temp.Primary` |
| ML293777 Ohope Spit at Ohope Golf Course | `Air Temp.Primary` |
| **EK171423 Rotorua at Edmund Rd** | **`Air Temp.Operational`** + `Air Temp.Primary` |
| **EK687314 Rotorua at Moses Rd** | **`Air Temp.Operational`** + `Air Temp.Primary` |
| **DP650467 Tauranga at Otumoetai** | **`Air Temp.Operational`** + `Air Temp.Primary` |
| the other 7 dead AQ sites | `Air Temp.Primary` only |
| EK596409 RRF3180 at Sulphur Point | `Air Temp.FieldResult` (manual spot samples, correctly excluded, and the map's *Continuous* filter excludes it too) |

**4 still on Primary + 3 moved to Operational = 7.** The count reconciles exactly.

## Why the earlier diagnosis missed it

The falsification above rested on `ingestion/scripts/probes/boprc_sos.json`, and
that artefact **cannot express this failure**. `seed_boprc_from_sos.py:230` only
admits an offering `if label == LABEL`, and builds its series map as
`f"{parameter}.{LABEL}@{loc}"`. A series that MOVED TO A NEW LABEL is therefore
structurally invisible in it — it shows only that `Primary` stopped, which is
true and is not the whole truth.

The supporting claim "no alternative label carries them" was drawn from
`hourly_offerings` being empty, but that field only ever records `SERVER_HOURLY`
labels, never arbitrary ones. That inference was not sound.

Confirmed independently from the other artefact on disk: `aquarius_boprc.json`
contains **`Air Temp.Operational@EK171423`, `@EK687314`, `@DP650467`** and no
others — the same three, exposed through the same `<Parameter>.<Label>@<Location>`
offering grammar the SOS ingester uses.

## What remains TRUE from the earlier diagnosis

The other **seven** — six Mount Maunganui sites and Whakatane at Kopeopeo — have
`Air Temp.Primary` and nothing else, and their record still ends at
`2026-07-31T12:00:00Z`. For those, it is upstream at BoP and the question to put
to them stands. So the outage is 7 stations, not 10, and 3 are ours to fix.

## The fix, implemented

`ingestion/sources/boprc.py`: `FALLBACK_LABELS = ('Operational',)`, consulted
**only when `Primary` returns nothing for the window**, so a location publishing
both is never ingested twice into the same (station, variable, timestamp) key.
Records from a fallback label are stored `FALLBACK_QUALITY = 'PROVISIONAL'`, not
`GOOD` — `Operational` is unapproved data (BoP's export refuses to serve it for
that reason), and PROVISIONAL is the value SYNOP already uses for the same
meaning. The daily rollup accepts PROVISIONAL (only QUARANTINED is excluded), so
the three stations rejoin the surface fit while staying distinguishable in raw.

Bare `Operational` is BoP's OWN telemetry and is deliberately distinct from
`Operational_GDC` / `_HBRC` / `_ESNZ`, which remain excluded as another agency's
republication.

**NOT YET VERIFIED AGAINST THE LIVE SERVER.** `sos.boprc.govt.nz` is IP-allowlisted
to the ingestion box and unreachable from a workstation, so the offering's
existence is established from the probe artefact and the portal, not from a live
GetObservation. Run `python -m sources.boprc --station BOPRC_ROTORUA_AT_EDMUND_RD
--variable temp` from the ingestion box (or via the workflow) to confirm before
trusting it.

## The watchdog point is unchanged and now stronger
A per-(station, variable) last-seen alert would have caught this on 2026-08-03.
Note it would ALSO have caught the three that merely moved — which no amount of
reasoning about `ingestion_log` ever would, because those three never stopped
producing data at all.
