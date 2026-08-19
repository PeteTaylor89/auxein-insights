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
