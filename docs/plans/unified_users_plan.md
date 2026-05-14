# Discovery Spec — Publisher Tenancy & Unified Users

**Subject.** Auxein platform: BSI publisher tenant feasibility and unified `users` table assessment.
**Mode.** **Discovery and design only.** No code changes. No database schema changes. No migrations. No commits. No PRs. Read-only access throughout.
**Audience.** Claude Code, executing against the live Auxein monorepo and a read-only connection to the production (or staging) database.
**Deliverables.** Three Markdown documents in `/discovery/bsi-tenancy/` (paths below). No source code touched.
**Estimated effort.** One focused day. Stop and ask if scope creeps.

---


PT NEW Context:
READ this and update all below to match the new context:
WE are proposing the unified user for Grow and Inisghts byt he following:
**Backend tasks (one Alembic migration + auth changes):**
- Alembic: add nullable `linked_public_user_id` FK on `users` → `public_users.id` (unique constraint on the FK so two `users` can't both point at the same `public_users` row)
- **Grow signup flow** (`auth.py`):
  - Create `users` row as today
  - Check for existing `public_users` row by email
    - If found: link via FK (don't overwrite the password)
    - If not: create new `public_users` row with the same hashed password, link via FK
- **Insights signup flow** (`public_auth.py`):
  - Create `public_users` row as today
  - If a Grow `users` row with that email already exists, link the FK back automatically. No password change.
- **Password reset / change:**
  - Propagate the new hash to the linked row in the same transaction
  - Applies in both directions (Grow password change → public_users hash; Insights password reset → users hash for the linked user)
- **Backfill** (lazy, opportunistic — no big-bang migration):
  - On next successful login of an existing Grow user without a linked `public_users` row, check for a matching email
    - If a public_users row exists: link it (use existing password — don't overwrite); flag for the user that their Insights login may differ
    - If no public_users row: create one with the just-validated password hash and link
  - Same behaviour on the Insights side for existing public_users without a Grow link
- **Edge cases to handle:**
  - Email change on either side must update the other if linked (or unlink — design decision: recommend re-link if new email also matches, else unlink and surface a "your Insights account is no longer linked" notice)
  - Account deletion: cascade or unlink? Recommend unlink (keep `public_users` since it may have content/articles attached; soft-delete on `users`)

**Test pass:**
- New Grow signup → can immediately log into Insights with same credentials
- New Insights signup of an existing Grow user's email → fails with "log in instead" prompt (or auto-links — confirm with Pete)
- Password reset in Grow → next Insights login uses the new password
- Existing Grow user (pre-FK) logs in → public_users row created + linked transparently

We need a means of gating for tenants for publishing purposes as per the below documents. Initially this will be for BSI delivering vinefacts, and we will roll out the same format to all regional associations in Australia for publishing to their members. 

UPDATE the entire below document on this new context. 

## 1. Background and intent

Auxein is preparing to host a tenanted publisher instance for BSI (the New Zealand Institute for Bioeconomy Science) to deliver VineFacts and other observational research outputs through the Auxein Insights platform. Two architecturally significant decisions sit upstream of any build:

1. **Publisher tenancy shape.** How BSI (and future publishers — NZW, regional bodies, AU equivalents) sit alongside the existing operational `company` tenancy used by Auxein Grow customers, and alongside the existing public Insights surface.
2. **User table unification.** Today there are (believed to be) two user tables — `public_users` for Insights signups and an operational `users` table for Grow customers. The proposal under consideration is to collapse to a single unified `users` table with nullable `company_id`, many-to-many `publisher_user`, and separate subscription records for Insights and Grow.

The purpose of this discovery is to ground both decisions in **what the codebase and database actually look like today**, not what the spec documents claim. The two may diverge.

This spec does not ask you to choose. It asks you to find out, document, and surface the trade-offs precisely enough that the architectural decision can be made from a position of knowledge.

---

## 2. Hard constraints

These are non-negotiable for the entire engagement:

- **Read-only.** No `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `CREATE`, `DROP`, `TRUNCATE` against the database. No migrations generated. No Alembic commands beyond `alembic history` and `alembic current`. If a tool offers a "fix" suggestion, do not apply it.
- **No code modification.** No edits to any file in the monorepo. No new files except the three discovery deliverables in `/discovery/bsi-tenancy/`. No commits. No branches created. No PRs.
- **No production side effects.** Do not call any backend endpoint that performs writes. Do not run any script that writes to S3, sends email, or invokes a third-party API. If unsure, default to not running it.
- **Confidentiality.** Any user PII observed in the database (emails, names) is summarised in aggregate only — counts, distributions. No specific user identifiers reproduced in the deliverables. Hash or redact where a specific row needs to be referenced.
- **If a question can only be answered by writing or running code, document the question and stop.** Do not write the code to answer it. The point is to find out, not to fix.

If any of these constraints conflicts with a step below, the constraint wins and the step is documented as deferred.

---

## 3. What you have access to

Confirm at the start of the session and document in deliverable 1:

- The Auxein monorepo on the local filesystem. Begin with `AUXEIN_GROW_MASTER_CONTEXT.md` and `GROW_V1_BUILD_PLAN.md` at the repo root for context. These are authoritative for build plan but may be ahead of or behind the actual code.
- A read-only PostgreSQL connection. Confirm it is read-only by attempting `SELECT pg_is_in_recovery();` and `SHOW default_transaction_read_only;`. If the connection has write privileges, **stop and ask** before proceeding — request a read-only role.
- Alembic migration history under `backend/alembic/` (or equivalent — confirm path).
- Existing API route definitions under `backend/app/api/` or equivalent.

If anything in the above is not present or accessible, document it as a gap in deliverable 1 §1, and continue with what is available.

---

## 4. Discovery scope — six investigation tracks

Run each track in order. Each track is read-only. Each track produces structured findings that feed into the deliverables in §5.

### Track A — Current user model (codebase)

Goal: a complete, source-of-truth picture of the user-shaped objects in the application code today.

1. Find every SQLAlchemy model (or equivalent ORM) representing a user, account, person, or contributor. Search for class names matching `User`, `PublicUser`, `Account`, `Person`, `Contributor`, `Member`, `Subscriber`. Document each one's fields, relationships, foreign keys, and the file path it lives in.
2. Find every authentication and authorisation code path. Search for password hashing, JWT issuance, session creation, OAuth handlers, magic-link flows. Document which user model each path resolves against.
3. Find every endpoint that creates or registers a user. List them by method, path, request shape, which model they write to, and what permission tier the resulting user receives.
4. Find every reference to "role", "permission", "tier", "scope" in the user context. Map the existing 5-tier operational permission hierarchy (Auxein Admin → Company Admin → Manager → User → Contractor) to the actual code that enforces it.
5. Identify whether Insights users and Grow users currently share *any* tables, foreign keys, or auth flows, or whether the separation is total.

Output: structured notes in `/discovery/bsi-tenancy/scratch/track-a.md` (will roll up into deliverables).

### Track B — Current user model (database)

Goal: confirm the codebase model matches the live database, and surface any drift.

1. Enumerate every table whose name suggests user identity: `users`, `public_users`, `accounts`, anything ending in `_users` or `_user`. Use `\dt *user*` and `\dt *account*` in psql.
2. For each user-shaped table, document: row count, column list with types and nullability, primary key, indexes, and all foreign keys *into* and *out of* it.
3. Sample (with explicit `LIMIT 5`) the structure of a row from each table — column names and types only, **values redacted or hashed**. Do not extract PII.
4. Cross-reference against Track A. Where the database has tables the ORM doesn't model, or vice versa, flag it. Where column nullability differs between ORM and DB, flag it. Where there are user rows in one table but no corresponding rows in the apparent join tables, flag it.
5. Run `SELECT count(*)` against each user-shaped table. Document totals. This is the migration-cost baseline.
6. Identify any users who appear in *both* `public_users` and the operational `users` table by email match (case-insensitive). **Report only the count and a redacted distribution** (e.g. "12 emails appear in both tables; of those, 8 have verified status in both, 4 in only one"). No specific emails reproduced.

Output: `/discovery/bsi-tenancy/scratch/track-b.md`.

### Track C — Operational tenancy (`company`)

Goal: understand the existing operational tenancy model deeply enough to assess whether publisher tenancy can sit alongside it cleanly, or whether the existing model needs adjustment.

1. Enumerate every table that carries `company_id` as a column. List them, with row counts.
2. Document the `company` table itself — fields, relationships, lifecycle (creation, suspension, deletion if any).
3. Document `UserPropertyScope` (or whatever the actual gating model is called). How is operational data scoped to users today? Is it row-level security, application-layer filtering, or both?
4. Identify whether Postgres row-level security (RLS) policies exist on any operational table. Run `SELECT * FROM pg_policies;` and document.
5. Document the 5-tier permission hierarchy as it actually exists in the database — is it a column on a user, a join table, a separate roles table, or hard-coded in application logic?
6. Find every place in the application code that reads `company_id` from a request context. This is the surface area an authorisation refactor would touch.

Output: `/discovery/bsi-tenancy/scratch/track-c.md`.

### Track D — Public Insights surface

Goal: understand exactly how isolated `public_users` actually is from the operational stack, and what would change if it were unified.

1. Identify the `public_users` table (or equivalent). Document its schema in full.
2. Find every code path that reads from `public_users`. Map it. Are there any joins from `public_users` into operational tables? Are there any FKs?
3. Identify Insights-specific concepts that live on or near `public_users` — saved zones, Seasonal Stats Widget submissions, contribution history. Document each as a separate object with its relationship to the user.
4. Document any Insights-related subscription, paywall, or gating logic that exists today (vs. is only described in product specs but not yet implemented).
5. Document the auth flow for `public_users` — is it the same JWT/session machinery as operational, or separate? What does signup, login, password reset look like for Insights users?

Output: `/discovery/bsi-tenancy/scratch/track-d.md`.

### Track E — Subscription and billing state

Goal: understand what subscription records exist, where they live, and whether the unified user proposal aligns with current billing identity.

1. Find any subscription, billing, plan, or tier tables in the database. Document them.
2. Find any Stripe (or other payment provider) integration in the code. Where do customer IDs live? Are they on `users`, `public_users`, `company`, or elsewhere?
3. Identify whether Grow is sold per-tenant or per-seat in the current code/data — i.e. does a subscription belong to a `company_id` or a `user_id`?
4. Identify whether Insights has any paid tier in the current code/data, even if dormant.
5. Document any users/companies that have a subscription record but no obvious matching login activity (or vice versa) — these are migration edge cases worth surfacing.

Output: `/discovery/bsi-tenancy/scratch/track-e.md`.

### Track F — Existing tenancy-shaped concepts that aren't `company`

Goal: surface anything in the codebase that already does tenant-shaped work outside the `company` model — because the publisher concept may already have a partial precedent.

1. Search the codebase for any concept resembling a publisher, content owner, editorial group, research group, or content tenant. Document anything found, even speculative.
2. Identify the Articles authoring layer (TipTap-based, per the spec). Where does article ownership live? Is it owned by a `user`, a `company`, or something else? Can articles already be scoped to a non-`company` owner?
3. Identify the Seasonal Stats Widget data model. Where do submissions accumulate? Whose data is it considered to be?
4. Find anything in the data model that hints at a "data sharing" or "consent" boundary — these are the seams a publisher tenancy will need to respect.

Output: `/discovery/bsi-tenancy/scratch/track-f.md`.

---

## 5. Deliverables

Three Markdown documents in `/discovery/bsi-tenancy/`. Nothing else committed. Word counts are guidance, not limits — be precise, not padded.

### Deliverable 1 — `01_current_state.md` (~3,000–5,000 words)

A factual, evidence-based picture of the current platform along the dimensions discovery touched. Sections:

1. **Access and constraints.** What was accessible, what wasn't, what gaps that creates in the findings.
2. **User model — codebase.** Tables/models, fields, relationships, file paths, with source references (e.g. `backend/app/models/user.py:42`).
3. **User model — database.** Live schema for every user-shaped table, row counts, FK map.
4. **Codebase vs database drift.** Every place the ORM and the live schema disagree, with severity assessment (cosmetic / behavioural / risky).
5. **Operational tenancy.** How `company`, `UserPropertyScope`, and the 5-tier permission model fit together in code and data today.
6. **Public Insights surface.** How `public_users` is wired in, and how isolated it actually is.
7. **Subscriptions and billing.** What exists, what doesn't, who pays for what.
8. **Adjacent tenancy concepts.** Anything found in track F.
9. **Cross-table user overlap.** Counts only — humans appearing in multiple user-shaped tables, by email match.

This document is purely descriptive. No design recommendations, no opinions, no "should". It is the foundation the next two documents reason from.

### Deliverable 2 — `02_publisher_tenancy_options.md` (~2,500–4,000 words)

An analysis of the four tenancy architecture options for hosting BSI as the first publisher, evaluated against the current state documented in Deliverable 1. Sections:

1. **The four options, named.**
   - **Option A** — BSI as another row in `company` with conditional UI.
   - **Option B** — A separate `publisher` table type, alongside `company`, in the same database.
   - **Option C** — A second database / fully isolated stack for publisher tenants.
   - **Option D** — A reusable `publisher` module in the same database, with BSI as the first instance and the architecture explicitly designed for NZW, regional bodies, and AU publishers as future tenants.
2. **Per-option assessment.** For each, in the same shape:
   - Schema impact (new tables, modified tables, drop tables — none of which are executed).
   - Code impact (which files, modules, services would need to change).
   - Migration impact (size of any data move, downtime implications).
   - Authorisation impact (how does scoping work, RLS or application layer).
   - Operational impact (backups, monitoring, exit obligations).
   - Strategic fit (does it scale to NZW and AU; does it lock in if BSI is the only publisher).
   - Risk register (what fails or gets messy in each).
3. **A trade-off matrix.** A single table comparing the four options across ~8 dimensions (build cost, operational cost, isolation guarantees, scalability to future publishers, blast radius of mistakes, exit cleanness, etc.).
4. **A recommendation.** Pick one. Justify with reference to specific findings in Deliverable 1 — do not recommend on first principles alone. The recommendation can be conditional ("Option D, *if* the existing user model can be unified — see Deliverable 3").
5. **Open questions.** Anything that requires Pete's input before the decision can be made firm. Frame each as a precise question, not a hand-wave.

### Deliverable 3 — `03_unified_users_assessment.md` (~3,000–5,000 words)

The deeper of the three documents. An evidence-based assessment of unifying `public_users` and operational `users` into a single `users` table with nullable `company_id`, many-to-many `publisher_user`, and separate subscription objects. Sections:

1. **The proposed shape.** A precise, schema-level description of the proposed unified model. SQL `CREATE TABLE` statements as **documentation only** — clearly marked "for design discussion, not for execution". Cover:
   - The unified `users` table itself (identity only, no operational fields).
   - The relationship objects: `publisher_user`, `insights_subscription`, `grow_subscription`, `user_saved_zone`, `user_property_scope`, `user_company_role`.
   - Auxein admin handling.
   - Auth identity handling (password, SSO, email verification).
2. **Migration shape.** Step-by-step description of how the migration would proceed, **as a design**. Not executable. Cover:
   - Dual-write or cutover strategy.
   - Treatment of users appearing in both source tables (per the count from Deliverable 1).
   - FK redirection across the operational schema.
   - Rollback story.
   - Estimated downtime window if a maintenance-window cutover is used.
3. **Authorisation refactor.** What changes in the application layer:
   - The `current_context()` resolver shape.
   - Where RLS could be introduced and where it shouldn't be.
   - Every code site identified in Track C §6 that would need to be re-evaluated. List them.
4. **Risk surface.** Honest. The five things most likely to break or surprise during a migration of this kind, scored by likelihood and blast radius. Include the auth-session-during-migration question and the Stripe identity question explicitly.
5. **Build effort estimate.** Rough order-of-magnitude in engineer-days. Distinguish:
   - The unified table itself.
   - The migration.
   - The authorisation refactor.
   - The publisher module that sits on top (if Option D in Deliverable 2).
6. **Decision recommendation.** Unify now (Sprint 1), unify later (after BSI is live), or don't unify (build publisher tenancy on top of the existing two-table split). Justify against Deliverable 1 findings.
7. **What would change the recommendation.** Specific findings from a deeper investigation (one-off scripts, additional database queries — none run by you) that, if produced, would shift the recommendation. Frame these so Pete knows what to commission next if the recommendation isn't yet sufficient to act on.

---

## 6. Methodology and rigour

A few things to apply throughout:

- **Cite source.** Every factual claim references either a file path with line range (`backend/app/models/user.py:42-58`) or a database query with timestamp. Claims without a source are flagged as inferred.
- **Distinguish observation from interpretation.** When you say "there are 14,332 rows in `public_users`", that is observed. When you say "this implies most signups never become Grow customers", that is interpretation. Mark interpretation explicitly.
- **No speculation about what the spec says.** This discovery is grounded in what the *code* and *data* show. The product specs (`AUXEIN_GROW_MASTER_CONTEXT.md`, the platform spec for BSI, the proposal document) are reference for *intent* but not authoritative for *current state*. Where the spec and the live system disagree, document the disagreement and proceed from the live system.
- **Use psql / sqlalchemy inspection / file search — not the application.** Do not rely on the running application to tell you what the schema is. Inspect the database directly.
- **Round numbers over 100 to nearest hundred or thousand.** Specific row counts where small (e.g. "12 overlap rows") are useful; specific row counts where large (e.g. "14,332 Insights users") are imprecise — round to "~14k".
- **Time-box.** This is one focused day, not an open-ended exploration. If a track is taking more than 90 minutes, document what's left as "deferred" and move on. The deliverables matter more than tracker completeness.

---

## 7. Out of scope

Explicitly **not** part of this discovery:

- Any code change of any kind, including formatting, comments, dead-code removal, or "drive-by" cleanups.
- Any schema change of any kind, including indexes, comments, or constraint additions.
- Drafting actual migration scripts. Migration *design* is in scope; migration *code* is not.
- Building or running tests against any of the proposed schemas. The proposals are for design discussion only.
- Any work on the BSI tenant itself (data input portal, custom modelling, report builder). That is downstream of this decision.
- Auth provider migration (e.g. moving to Cognito, Auth0). Out of scope for this discovery — assume the current auth stack is unchanged.
- Frontend impact analysis. The architecture decisions here are backend-and-database. Frontend follows.
- Performance benchmarking. If the recommendation hinges on performance, flag it as an open question and do not benchmark.
- Cost analysis (AWS, RDS, etc.). Out of scope unless a specific option (Option C — separate database) materially changes the cost picture, in which case a one-paragraph note is sufficient.

---

## 8. Stop conditions

Stop and ask Pete (do not proceed) if any of the following occur:

- The database connection turns out to have write privileges you cannot drop.
- A track requires running a script that writes anywhere (filesystem, database, network).
- A finding suggests the live schema is materially different from what the spec describes in a way that changes the question being asked (e.g. there is already a `publisher` table, or `public_users` does not exist).
- A finding suggests there is a third user-shaped table not anticipated in this spec.
- The investigation uncovers a security or data-integrity issue (e.g. orphaned PII, FK inconsistency at scale, plain-text credentials). Document and stop. Do not investigate further; do not attempt to remediate.

---

## 9. Output format and handoff

- Three Markdown files in `/discovery/bsi-tenancy/`, named exactly as in §5.
- Scratch notes in `/discovery/bsi-tenancy/scratch/` per Track. These are working files — they don't need to be polished but should be retained for traceability.
- Inline tables and code blocks where helpful. No images, no diagrams unless ASCII-art that adds genuine clarity.
- A short top-level `README.md` in `/discovery/bsi-tenancy/` (~10 lines) listing the three deliverables, the date, and the one-line recommendation from each.
- **Do not commit.** Leave the files staged in the working tree for Pete to review.

---

## 10. The standard Pete is looking for

Two things to hold in mind throughout:

1. The output should let Pete walk into a half-hour decision conversation and come out with a firm answer. If a deliverable leaves a major question unresolved, say so explicitly — do not paper over it with confident-sounding hedges.
2. Be honest about what you don't know. "The codebase suggests X but the live database doesn't confirm it" is more useful than "X" stated as fact. The downstream cost of a wrong assumption here is large; the downstream cost of an honest "I don't know yet" is small.

---

*End of discovery spec. Begin with §3 access confirmation. Stop and report after the access confirmation step before proceeding into Track A.*