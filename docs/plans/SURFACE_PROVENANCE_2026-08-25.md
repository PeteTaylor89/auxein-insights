# Where the surface pipeline is up to — 25 August 2026

Plain-language status for Pete. Three parts: what changed today and why it
mattered, what all the test runs were actually doing, and what is genuinely
left before this is a production system.

---

## Part 1 — What changed today

### The problem, in one sentence

Every script that builds a climate surface wrote its results into a fixed
folder, so **running it again silently destroyed the evidence of the run before
it.**

That sounds like housekeeping. It isn't, for two reasons.

**First, we can never re-measure the past.** CLIFLO closed in October 2024. The
1986–2024 reference record on `Z:` is the only copy that will ever exist, and
the accuracy scores we've measured against it can never be recomputed. The
held-out validation of the era-offset field — the one that showed a 43% error
reduction — existed only in a memory note and whatever terminal scrollback
happened to survive. If someone had asked "show me the working," we couldn't
have.

**Second, we couldn't tell our own runs apart.** There are currently **sixteen
folders** on this machine called `inputs`, `inputs2`, `inputs3`, `inputs4`,
`inputs_final`, `inputs_final_v2`, `inputs_noThames`, `inputs_excluded`, and so
on. They contain between 112 and 260 weather stations. Nothing on disk recorded
which one produced which published surface, or whether the Thames station — the
one bad sensor we deliberately exclude — was in or out of any given file.

### What we built

A shared piece of machinery (`runrecord.py`) that every product-building script
now uses. Each time one runs, it writes a small permanent folder beside its
output containing:

- **What you asked it to do** — every command-line setting, in full
- **What code did it** — a fingerprint of the actual source files that compute
  the numbers, so we can tell whether two runs used the same maths
- **Which git commit, and whether there were uncommitted edits**
- **Which weather stations were used**, and how many days each one reported
- **What came out** — accuracy scores, counts, timings
- **Copies of the results files**, taken at the moment of completion

The key rule: **nothing ever writes into another run's folder.** The old output
folder still gets overwritten — it has to, because that's what the publishing
step reads — but the evidence beside it accumulates instead.

Twelve scripts now do this: the two that fit surfaces, the three that build
derived products (era offsets, projections, GDD seasons), the three that
assemble the station data files, the two that build climate normals, and the
two that measure accuracy.

### Three things worth knowing about how it behaves

**A run that dies leaves a record saying so.** The folder is written *before*
the expensive work starts, not after. If a run is killed at 1%, we still have
the station list and the code fingerprint — exactly when they're hardest to
reconstruct. The record just stays marked `running`, which is itself the
evidence that it never finished.

**A run that half-works is not called complete.** If the daily job publishes
three surfaces but was told to produce four, it records itself as `incomplete`
and still fails loudly. Calling that a success is the exact failure mode the
check exists to prevent.

**Resuming across a code change now warns.** There was already a guard stopping
you resuming an interrupted run with different settings. It couldn't see whether
someone had *edited the code* in between — which would silently weld two
different models into one history. It now warns and names the changed files. It
warns rather than blocks, deliberately: these runs get killed often enough that
making resume hard to use would cause more damage than it prevents.

### The one that mattered most

The era-offset validation step used to print its scores to the screen and throw
them away. It now saves them. Those numbers are unrepeatable, and they are the
only evidence that correcting the modern data onto the historical scale actually
works.

---

## Part 2 — What all the test runs were doing

A fair question, since a lot of the day was running things.

**Nothing published. No product changed. No number moved.** The accuracy figure
for a test surface was 1.025 before the changes and 1.025 after; the on-premise
parity check — which proves we can still exactly reproduce the old system's
output — passed throughout. That was the point: this work adds a paper trail
without touching the maths.

The runs fell into three groups.

### Group 1 — Proving the record-keeping works

For each script, a real run against real data, then opening the resulting folder
to check it contained what it claimed. Notable ones:

- **A deliberately killed run, then resumed.** Stopped a surface fit after one
  month, edited a source file, resumed it. Confirmed: two records, the dead one
  untouched by the live one, the code-change warning fired and named the right
  file, and the resumed run only refitted the month it still owed.
- **A full read of the CLIFLO archive** — all 13,878 daily files off `Z:`,
  512 stations, 38 years. Completed in about a minute and recorded correctly.
- **A live database extract**, 41 days, 247 stations, with the Thames station
  excluded — and the record proves it was excluded.

### Group 2 — Finding things that were already broken

Four defects surfaced. Three of them pre-dated today's work entirely.

| What | Why it mattered |
|---|---|
| The rainfall accuracy measurement had been **dead since 17 August** — it crashed instantly on a missing argument | This is why rainfall accuracy had never been measured. It looked like something nobody had got around to; it was actually broken. |
| The staleness monitor **crashed with a meaningless error** when no region had enough data | This is meant to run on a schedule. It would have failed in the night with nothing useful in the log. |
| One script **couldn't import shared code at all** | Would have failed the moment anyone ran it. |
| A results file was being **silently not copied** into its record | Mine. The record looked complete while holding none of the evidence it named. Caught by opening the folder rather than trusting the exit code. |

All four fixed.

### Group 3 — Filling in the accuracy picture

We publish one national accuracy number per variable. It has always been
misleading, because the country is not uniform — the national figure is dragged
around by the Southern Alps, where we have few stations and complex terrain.

We now have per-zone accuracy for **all four variables** (previously only
minimum temperature). What it shows:

- **Mean temperature** is roughly a third better in Northland than the national
  figure suggests, and a third worse on the South Coast.
- **Maximum temperature** has a pattern worth taking seriously: several inland
  valleys — Gisborne, both Wairau zones, Waitaki — read systematically **colder**
  in the model than reality. Combined with the already-known problem that frost
  hollows read **warmer** than reality on minimum temperature, this means
  **we are squashing the day–night temperature range in exactly the valleys where
  growers care most.** Both GDD and disease models depend on that range.
- **Rainfall** now has its first honest millimetre-scale figure: 5.4 mm
  nationally.

### The rainfall trap — please don't quote the zone table as-is

The rainfall table appears to show the model performing dramatically better in
Central Otago than in Northland. It isn't. **It just rains far less there.**

I measured this rather than assuming it: zone rainfall accuracy correlates with
zone wetness at **0.915** — that is, over 80% of the apparent difference between
zones is explained by nothing more than how wet the zone is. Dividing each zone's
error by its own rainfall shrinks the spread from nearly 4× down to under 2×, and
completely reorders the table.

A Bannockburn grower shown "74% better than the national average" would draw a
conclusion that is simply false. Rainfall accuracy must be published either
normalised, or beside each zone's own rainfall total. **The script does not yet
compute the normalised figure** — that is on the list below.

---

## Part 3 — What is left before this is production

Today's work was about being able to trust and defend the numbers. It did not
move the system closer to running by itself. That list is unchanged, and it is
the real one.

### Blocking — nothing is production until these are done

**1. The daily job has never run on a scheduler.** Not once. It has been driven
by hand, end to end, every time. The GitHub workflow file is valid but has never
fired. Everything else depends on fixing this.

**2. Nothing is committed to git.** The entire surfaces workstream — the daily
engine, quality control, projections, and everything from today — exists only as
uncommitted files on this machine. A disk failure loses all of it. This is
yours to do, and it is the single highest-value thing outstanding.

**3. The AWS deployment is written but not applied.** The plan is settled — light
jobs on the existing ingest box, the heavy surface fit on Fargate at about
$2/month — and the files exist under `deploy/surfaces/`. Nothing has been
created in AWS. It needs you for the permissions setup.

**4. The model-version pin must be split per variable.** Temperatures publish
under one identifier and rainfall under another, and there is currently one
setting covering both. This has to ship *before* the first consumer reads a
daily surface, not after.

**5. Test surfaces must be cleared before 1 September.** Everything fitted so far
is a test artefact, refitted repeatedly while the underlying data was being
corrected. It needs purging in the same change that enables the real schedule, or
two jobs will race each other over the same files.

### Important, not blocking

**6. Wire the per-zone accuracy into the interface.** We now have honest per-zone
numbers for all four variables. The confidence badge still shows one national
figure, and it must never show mean temperature's number for a different
variable.

**7. Add the rainfall normalisation** described above, before any rainfall
accuracy figure is shown to a customer.

**8. Nothing schedules the staleness monitor.** The era-offset correction is
frozen forever — CLIFLO is closed, so it can never be retrained — and it will
slowly drift as our station network grows. The monitor that detects this now
keeps a permanent record of every run, but something still has to *run* it
regularly. Today's check: all ten regions stable.

**9. Pete's manual zone-assignment pass.** Highest-value single data fix
outstanding: zone 13, Upper Wairau and Southern Valleys — 11,531 planted
hectares with **zero humidity data**, while three suitable stations sit
unassigned within 4 km.

**10. Back up the two `Z:` CLIFLO trees.** You've confirmed a backup exists, so
this is closed — noting it only because it is the one piece of data in this
system that is genuinely irreplaceable.

### Deliberately not done

The two one-off experiment scripts (the rainfall method bake-off and the offshore
islands test) do not keep run records. Their results are already written down,
they write to explicitly named files, and they aren't part of the build chain.
Same reasoning for the diagnostic commands and the regression checks.

---

## The short version

The pipeline can now prove what it did, with what data, using which code — and
that evidence accumulates instead of being overwritten. Along the way we found
that one accuracy measurement had been quietly broken for a week, and that our
rainfall accuracy table means something different from what it appears to mean.

None of that makes it a production system. It still runs because someone types
the commands, and none of it is committed.
