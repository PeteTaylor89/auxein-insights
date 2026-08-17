# GrapeLink → Grow integration

**Scoping only. No code written.** 2026-08-17.

Source material in this folder: `email.txt` and
`GrapeLink NZ Foliar Application Record-Operator Sheet-Associated JSON Files 040826.pdf`
(9 pages; pages 2-3 are scanned form images, pages 4-9 are the two JSON samples).

---

## 1. The shape of it, in one paragraph

GrapeLink processes agrichemical application records for NZ vineyards and transmits them
onward. Two outbound formats exist. **Grow consumes exactly one of them**: the "Wine Company"
JSON (PDF p4), the format sent to wine companies that want all job data. The second (NuPoint,
p5-9) is spray-rig dosing telemetry — tank counts, flow rate, tractor speed — for controller
hardware, and is **not ours**. Grow reads; **GrapeLink accepts nothing back**.

That last constraint is the most valuable thing about this integration, and the design should
lean on it hard. See §3.

---

## 2. What the payload actually carries

One JSON = one **spray job**, covering one or more blocks.

```
Job level        reportId, ArchiveID, Version, Spray_Type, Vintage,
                 Spray_Event_Start_Date, Spray_Event_End_Date, Send_Date,
                 Applicator, Spray_Head_Target, Cover, Spray_Width_Metres,
                 Water_Rate + Water_Rate_Units

Products[]       Treatment_Product, Product_Number (ACVM, e.g. P008587), Target, Alert,
                 Concentration_Factor,
                 Chosen_Label_Rate_100L + units, Chosen_Label_Rate_Ha + units

Blocks[]         GrapeLink_Block_ID, Block_Name, WineCompany_Grower_Code,
                 SWNZ_Vineyard_ID, Variety, Growth_Stage, Ha,
                 >>> Earliest_Harvest_Date <<<
```

**`Earliest_Harvest_Date` is the payload's whole point.** It is the withholding-period-cleared
date, per block, already computed by GrapeLink. The email confirms it: *"system integrations
moving 'cleared' earliest harvest dates."* Everything else is provenance around that one date.

### Traps visible in the sample

| Trap | Detail |
|---|---|
| **Two date formats in one PDF** | Wine Company JSON uses `"2026/08/03"` (slashes). NuPoint uses `"2026-07-13 00:00:00"`. Parse the Wine Company format explicitly; don't hand it to a generic parser and hope. |
| **No timezone anywhere** | Every date and the `Send_Date` timestamp are naked. Presumed NZ local. **Confirm** — a harvest-clearance date landing a day early is a compliance failure, not a display bug. |
| **`Vintage` is not derivable from the date** | Sample is `"Vintage": 2027` on an August **2026** spray. Southern-hemisphere vintage labelling. Store what they send; never compute it. |
| **A "job" spans weeks, not a day** | Sample runs 2026-07-13 → 2026-08-03. So an application record is an *interval* across multiple blocks, and each block has its own `Earliest_Harvest_Date`. Don't model it as a point event. |
| **Units are free-text strings** | `g/100L`, `g/Ha`, `L/Ha`, `g`, `Kg`. Never do arithmetic across records without normalising first, and store the original string alongside whatever you normalise to. |
| **`Version` is already 2 in the sample** | Records get **revised and re-sent**. This is an upsert-with-history problem from day one, not an append-only feed. See §5. |
| **The sample is anonymised** | Every numeric is `999.99` / `9999` / `99991`. Field *types* are inferable; real magnitudes, ID formats and cardinalities are **not**. Get one real payload before building the parser. |
| **`Alert` is present and empty** | An empty string in the only sample. Its populated form is unknown and it sounds like exactly the field you don't want to silently drop. Ask. |

---

## 3. Read-only is a design gift — take it

Because Grow never writes back:

- No write credentials to hold, no OAuth dance, no rate-limit budget for writes
- No conflict resolution, no last-writer-wins, no reconciliation of divergent edits
- **No idempotency keys of our own** — GrapeLink already supplies `ArchiveID` + `Version`
- **Grow must never recompute withholding periods.** Consume `Earliest_Harvest_Date`, display it,
  and attribute it to GrapeLink on screen. Recomputing it would create a second source of truth
  for a compliance date and put the liability on us for no product gain.

Corollary: GrapeLink data in Grow should be **visibly read-only** in the UI — no edit affordance
on an ingested record, ever. If a value is wrong, it's wrong in GrapeLink and gets fixed there.

---

## 4. What already exists in Grow — and what doesn't

### Already built and unused: the ID mapping table

`backend/db/models/external_alias.py` → `external_aliases`, with a full CRUD API at
`backend/api/v1/aliases.py`. Its `system_name` column comment **already names `'grapelink'`**:

```python
system_name = Column(String(100))   # 'grapelink', 'swnz', 'acvm', 'supplier', 'custom'
```

Prod, 2026-08-17: the table exists and holds **0 rows**. Built in "Grow V1, Revision 2",
never used. Unique constraint is `(company_id, entity_type, entity_id, system_name)` — one alias
per entity per system, which is right for this.

**This is the single biggest reason the integration is cheap.** The mapping layer is already
built, migrated and deployed; it just needs rows and a UI.

### Not built: any concept of a spray application record

Grow has **no application-record model, no agrichemical product model, and no withholding
concept anywhere**. Confirmed by search: the only `harvest_date` columns in the codebase are in
the blockchain module (being removed — see `BLOCKCHAIN_REMOVAL.md`) and the Insights
seasonal-stats form. `task_template.task_subcategory` has a `"spraying"` string and that is the
extent of it.

So this integration **creates a new domain** in Grow rather than syncing an existing one. That
is where the real cost sits — not in the HTTP.

> **Do not confuse this with `spray_coverage`.** That model is the mothballed GPS spray-coverage
> heatmap (see the GPS mothball). It is derived from a phone GPS track, has nothing to do with
> application records, and must not be reused as a landing table.

---

## 5. Proposed data model

Two tables, both prefixed as external-sourced so nobody mistakes them for Grow-authored data.

```
grapelink_jobs
  id                    serial PK
  company_id            FK companies(id) NOT NULL, indexed
  archive_id            bigint NOT NULL          -- GrapeLink ArchiveID
  version               int    NOT NULL          -- GrapeLink Version
  report_id             varchar(120)             -- "999999-20260804-SprayRecord-V2"
  spray_type            varchar(50)              -- "Foliar"
  vintage               int
  event_start_date      date
  event_end_date        date
  send_date             timestamp
  applicator            varchar(255)
  spray_head_target     varchar(100)
  cover_pct             numeric
  spray_width_m         numeric
  water_rate            numeric
  water_rate_units      varchar(20)
  products              jsonb NOT NULL           -- Products[] verbatim
  raw_payload           jsonb NOT NULL           -- the whole POST body, untouched
  received_at           timestamp
  superseded_by_id      FK grapelink_jobs(id) NULL
  UNIQUE (company_id, archive_id, version)

grapelink_job_blocks
  id                    serial PK
  job_id                FK grapelink_jobs(id) ON DELETE CASCADE, indexed
  grapelink_block_id    bigint NOT NULL, indexed
  block_id              FK vineyard_blocks(id) NULL, indexed   -- resolved via external_aliases
  block_name            varchar(255)             -- as GrapeLink sent it
  grower_code           varchar(50)
  swnz_vineyard_id      varchar(50)
  variety               varchar(100)
  growth_stage          int
  area_ha               numeric
  earliest_harvest_date date
```

### Five rules that make it safe

1. **Store `raw_payload` verbatim, always, before parsing.** Land it, ack it, then parse. A parse
   failure must never lose a compliance record, and the anonymised sample means the first real
   payloads *will* surprise us.
2. **Upsert on `(company_id, archive_id, version)`; never delete.** A new `Version` for an
   existing `ArchiveID` inserts a new row and stamps `superseded_by_id` on the old one. History
   is the whole value of a compliance record — the previous version must remain readable.
3. **`block_id` is nullable and that is deliberate.** An unmapped `GrapeLink_Block_ID` still
   lands, with `block_id NULL`. It appears in a reconciliation queue. It is **never** dropped and
   **never** silently guessed by name — `Block_Name` collisions across growers are near-certain,
   and a mis-attributed harvest-clearance date is worse than a missing one.
4. **The credential identifies the company, not the payload.** `WineCompany_Grower_Code` and
   `SWNZ_Vineyard_ID` are *hints for reconciliation only*. Tenancy comes from the authenticated
   connection. Trusting a payload field for `company_id` is a cross-tenant data leak.
5. **Products stay `jsonb` in phase 1.** Don't build an agrichemical product master until there's
   a second consumer for it. `Product_Number` is an ACVM registration and would be the join key
   if that day comes.

---

## 6. Transport — the one genuinely open question

The email says integrations *"run as scheduled tasks with connections to endpoint URL's at
frequencies relevant to the life cycle of the grapes. More frequent up to and including harvest.
Less frequent post-harvest and in winter."*

That is ambiguous between two very different builds:

| | **A — GrapeLink pushes to us** | **B — we poll GrapeLink** |
|---|---|---|
| We build | An authenticated inbound endpoint | A scheduled client + cursor state |
| Auth | We issue GrapeLink a credential | They issue us one |
| Backfill | Needs a separate request from them | Free — just widen the window |
| Failure mode | Their retry policy (must ask) | Ours, and we control it |
| Their phrasing | *"connections to endpoint URLs"* fits | *"scheduled tasks"* fits |

**Recommendation: ask, and design the parser so it doesn't care.** Put the normalisation in a
`services/grapelink_ingest.py` that takes a dict and returns rows. Then A is a thin FastAPI route
and B is a thin scheduled script over the same function; whichever they confirm costs a day, not
a rewrite. Lean toward **A** as the default guess — *"connections to endpoint URL's"* reads like
they initiate — but do not build the transport until it's confirmed.

**Ask them, in this order:**

1. Push or pull? If push, what's the retry policy on a non-2xx, and how do we request a backfill?
2. Auth mechanism — bearer token, HMAC signature, mTLS, IP allowlist?
3. Is `ArchiveID` unique per wine company or globally? *(Determines whether the unique constraint
   needs `company_id` — it's in the proposal above defensively.)*
4. Timezone of every date field, and of `Send_Date`.
5. What values can `Alert` take?
6. Do ground sprays / spread fertiliser use the **same** schema with different fields populated,
   or a different schema? The email says *"some small differences in data fields"* — small
   differences in a compliance feed still need enumerating.
7. Can we have **one real, non-anonymised payload** (under NDA if needed) before we build?
8. Is there a test/sandbox endpoint, or is first contact against production?

---

## 7. Phasing

**Phase 0 — answers, no code.** §6's eight questions plus one real payload. Everything below is
guesswork until this lands, and phases 2+ are unbuildable without it.

**Phase 1 — mapping UI (buildable NOW, independent of every answer).**
`external_aliases` and its API already exist. Add a small "External IDs" panel on block
admin — link a Grow block to its `grapelink` and `swnz` IDs. Nothing depends on transport, and
it must exist before any data can resolve. **This is the sensible thing to build first.**

**Phase 2 — land raw.** Endpoint (or poller) + auth + `grapelink_jobs.raw_payload` + ack.
No parsing, no UI. Prove records arrive and survive.

**Phase 3 — parse + resolve.** Normalise into `grapelink_job_blocks`, resolve `block_id` via
alias, upsert on `(company_id, archive_id, version)` with supersession. Add the reconciliation
queue for unmapped blocks — **this needs a UI, not a log line**, or unmapped records rot.

**Phase 4 — surface it.** Block detail gains a **Spray history** card (read-only, GrapeLink
badged) and a **Cleared for harvest from** date, showing which job set it and when it was
received. This is the phase the customer actually feels.

**Phase 5 — optional linkage.** Match an ingested job to a Grow spraying task by block + date
window. Genuinely useful, entirely deferrable, and shouldn't gate phases 1-4.

Gate the UI on `Company.has_feature("grapelink")` — `feature_overrides` defaults OFF, so this is
a one-row JSON edit per customer, no migration and no deploy.

---

## 8. Open commercial questions — not engineering

- **Who is the customer here?** GrapeLink's client is the *wine company*; Grow's user may be the
  *grower*. The p4/p5 split in the email is exactly this: two of seven blocks belonged to the
  contracting wine company, five to "Other Winery". If Grow ingests as the grower, we may only
  ever see the subset a given wine company contracted — a partial spray history presented as
  complete. **Establish whose feed we're on before promising completeness.**
- Does GrapeLink charge for the integration, or the wine company?
- Is there an agreement needed before we hold their application-record data?

---

## 9. Cross-references

- `docs/plans/SUB_BLOCK_SECTIONS.md` §7.3 — Grow has no harvest/tonnage model. GrapeLink supplies
  harvest **dates**, not yield, so it does not close that gap.
- `docs/plans/BLOCKCHAIN_REMOVAL.md` — the outgoing blockchain module holds the only other
  `harvest_date` columns in Grow. Remove it first; don't build on it.
- GPS mothball — `spray_coverage` is unrelated. Do not reuse.
