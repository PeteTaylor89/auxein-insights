# Auxein Taste — Build Spec (Claude Code Handoff)

**Owner:** Pete Taylor / Auxein
**Status:** v1 MVP, agile delivery. Designed to grow into the full Auxein Taste platform.
**Audience:** Claude Code — greenfield build, provisioned as a separate service alongside Auxein Insights/Grow.
**Format:** Epics → User Stories → Acceptance Criteria. Build in epic order; each story is independently testable. Definition of Done at the bottom.

---

## 0. Product One-Liner

A mobile-first PWA for capturing wine tasting notes against swappable templates, where **every structural scale reconciles back to a canonical CMS standard without losing the raw entry** — plus a linked knowledge centre, blind-tasting accuracy review, and a geography baseline that ties tastings, notes and knowledge together.

Must be **clean and beautiful to use**. Touch-first, fast capture, no friction. The grid is the product.

---

## 1. Confirmed Decisions (do not relitigate)

These were settled before this spec was written. Treat as fixed constraints.

| # | Decision | Implication for build |
|---|---|---|
| D1 | **Scale reconciliation: store raw + canonical, never lose either.** Every field declares a `reconciliation_type`. | Build the reconciliation engine first (Epic 1). It is load-bearing. |
| D2 | `reconciliation_type` ∈ `ordinal` \| `score` \| `none`. **Ordinal** → CMS band + 0–1 position. **Score** → store-as-entered + normalised 0–100. **None** → raw only (categorical/tags). | Three code paths, one engine. No field escapes classification. |
| D3 | **Auth: separate now, same pattern as Insights, link later.** | Own user table in `taste` schema. Mirror Insights' JWT/session pattern so a later SSO merge is a migration, not a rewrite. |
| D4 | **MVP day-one = Solo notes + templates + reconciliation, Knowledge Centre (TipTap/photos/docs/comments), Review/stats incl. blind accuracy.** | These three are MUST. |
| D5 | **Live multi-user flights + invites + live dashboard = FAST-FOLLOW, not MVP.** | Model flights and a `participant` concept now so the realtime layer slots in later, but do not build realtime/invites in v1. |
| D6 | **Blind accuracy graded on: variety / country / region / vintage(±band) / age-range**, each scored independently, plus an overall blind-accuracy %. | Grading logic in Epic 5. |
| D7 | **Knowledge ↔ tasting linking is FUNCTIONAL day-one** via a polymorphic `link` table. Bidirectional click-through works in MVP. | Not deferred. Build the link table active. |
| D8 | **Backend = separate FastAPI service**, own EB app, own Postgres `taste` schema on the **shared RDS** that hosts `auxein-api-prod` (`eb auxein-api-prod-lb`). PostGIS present, not used in v1 beyond being available. | Clean isolation from Insights/Grow. Same RDS instance, separate schema. |
| D9 | **Offline policy split:** *tasting capture* is local-first (Dexie/IndexedDB, works with zero signal). *Knowledge Centre* is online-first (sync when connected). | Two persistence strategies, deliberately. |

---

## 2. Architecture

```
┌──────────────────────────────┐         ┌───────────────────────────────┐
│  React + Vite PWA            │         │  FastAPI "taste" service       │
│  mobile-first, installable   │  HTTPS  │  (separate EB app, beside      │
│                              │ ──────► │   auxein-api-prod)             │
│  Tasting capture:            │  sync   │                                │
│   Dexie (IndexedDB) = SoR    │ ◄────── │  Postgres schema: `taste`      │
│   at capture, offline-first  │         │   on shared RDS (PostGIS-ready)│
│  Knowledge Centre:           │         │  Auth: own user table,         │
│   online-first, sync when up │         │   Insights JWT pattern         │
│  Service worker (offline)    │         │  S3 photos + docs (presigned)  │
│  Local photo blobs           │         │                                │
└──────────────────────────────┘         └───────────────────────────────┘
```

### Frontend
- **React + Vite + TypeScript**, PWA (`vite-plugin-pwa`), installable, standalone display.
- **Dexie** wrapping IndexedDB = system of record at capture time for tasting data.
- Touch-first UI. One-handed fast entry. Mobile breakpoint is the primary design target; tablet/desktop are progressive enhancements.
- See `frontend-design` skill for visual direction — this app must look intentional, not templated.

### Backend
- **FastAPI**, separate EB application, **own Postgres schema `taste`** on the shared RDS (ap-southeast-2).
- Reuse Insights' auth *pattern* (JWT, refresh, password hashing) but with its own `taste.user` table.
- PostGIS extension available, not used in v1 beyond being present for the later geography FK migration.
- S3 for photos and knowledge-centre documents via **presigned upload**.

### Sync model (tasting capture only)
- All tasting writes hit Dexie immediately; UI never blocks on network.
- Outbox queue holds pending mutations with **client-generated UUIDv4** IDs.
- On connectivity → push outbox → pull deltas.
- **Conflict policy v1:** last-write-wins by `updated_at`. Single user; conflicts rare. Keep `version` + `updated_at` on every record for a better policy later.
- Knowledge Centre is online-first: optimistic UI, but treat the server as SoR; no offline-create requirement for v1.

---

## EPIC 1 — Reconciliation Engine (build first, everything depends on it)

> This is the architectural spine. "Change your acidity scale and it still reconciles to a common standard" lives here. Build and unit-test this **before** any UI.

### Canonical standards (the fixed reference)

**Ordinal structural scale (CMS 5-band):**
`Low → Med- → Medium → Med+ → High`
Canonical representation = `{ band: enum(0..4), position: float 0..1 }` where position is the normalised 0–1 location of the entry within its source scale.

**Score axis:**
Canonical = `normalised_score: float 0..100`, alongside `raw_score` + `raw_scale` (e.g. `{system:'parker', min:50, max:100}` or `{system:'ucdavis', min:0, max:20}` or `{system:'stars', min:0, max:5}`).

**None:** stored raw only. No canonical projection. Categorical fields, descriptor tags, free text.

### Story 1.1 — Field reconciliation classification
**As** the system, **I** require every template field to declare how it reconciles.
**AC:**
- `TemplateField` carries `reconciliation_type: 'ordinal' | 'score' | 'none'`.
- `ordinal` fields carry a `scale` definition: `{ min, max, step?, labels?[] }`.
- `score` fields carry `{ system, min, max }`.
- Validation rejects a template where an `ordinal`/`score` field lacks its scale definition.

### Story 1.2 — Ordinal → CMS band mapping
**As** a taster using any acidity/tannin/body scale, **I want** my entry projected onto the CMS 5-band standard, **so that** a custom 1–10 acidity and a CMS "Med+" are comparable.
**AC:**
- A pure function `toCanonicalOrdinal(rawValue, scale) → { band, position }`.
- Mapping is **banding by normalised position**: position = `(rawValue - min) / (max - min)`; band = `floor(position * 5)` clamped to `0..4`. (e.g. 1–10 scale: value 8 → position 0.78 → band 3 = "Med+".)
- If `scale.labels` are provided and already equal the CMS 5 labels, map 1:1 by index (no banding drift).
- **Raw value is always stored** alongside the canonical projection. Round-trip test: raw is never reconstructed *from* canonical — it is read back verbatim.
- Inverse helper `bandLabel(band) → 'Low'|'Med-'|'Medium'|'Med+'|'High'` for rendering.

### Story 1.3 — Score normalisation
**As** a taster scoring on any system, **I want** a comparable 0–100 score, **so that** Parker/UC Davis/5-star wines sit on one axis in stats.
**AC:**
- `toNormalisedScore(rawScore, system) → 0..100`.
- Built-in systems: `parker (50–100)`, `ucdavis (0–20)`, `stars (0–5)`, `percent (0–100)`. Extensible via `{min,max}`.
- Both `raw_score` (+ its system) and `normalised_score` persist. Stats use normalised; display defaults to raw.

### Story 1.4 — Render in any scale
**As** a taster, **I want** to view a note captured under one scale rendered in another, **so that** I can read someone else's CMS note on my 1–5 grid (and vice versa) without data loss.
**AC:**
- `renderInScale(canonical, targetScale)` returns the nearest target-scale value from the canonical band/position.
- Lossy-direction warning surfaced in dev (band→fine-scale is an estimate); raw original always retrievable.

### Story 1.5 — Reconciliation is non-destructive everywhere
**AC:** No write path stores canonical *instead of* raw. Every reconciled value persists as `{ raw, raw_scale, canonical }`. A migration/export audit proves zero raw loss across all note values.

---

## EPIC 2 — Templates & Tasting Capture (the core loop)

### The template abstraction (template is data, not code)

```ts
type FieldType =
  | 'single_select' | 'multi_select' | 'scale' | 'text_short'
  | 'text_long' | 'tag_structured' | 'boolean' | 'number' | 'score';

interface TemplateField {
  id: string;                 // uuid, stable across versions
  key: string;                // snake_case machine key (export mapping)
  label: string;
  type: FieldType;
  reconciliation_type: 'ordinal' | 'score' | 'none';   // EPIC 1
  options?: string[];         // selects / tags
  scale?: { min: number; max: number; step?: number; labels?: string[] };
  score_system?: { system: string; min: number; max: number };
  required?: boolean;
  help?: string;
}

interface TemplateSection { id: string; label: string; fields: TemplateField[]; }

interface Template {
  id: string; name: string; kind: 'cms' | 'custom';
  version: number;            // bump on edit; notes pin the version used
  sections: TemplateSection[];
  is_builtin: boolean;        // CMS = true, locked from deletion
  created_at: string; updated_at: string;
}
```

### Story 2.1 — Seed the CMS deductive grid
**As** a new user, **I want** the CMS deductive grid available immediately, **so that** I can taste without building anything.
**AC:**
- CMS grid seeded as a builtin (`is_builtin: true`, `kind:'cms'`) on first run, from a JSON seed file.
- Sections: **Sight, Nose (Aroma), Palate (Structure), Palate (Flavour), Initial Conclusion, Final Conclusion** — matching the CMS Europe Deductive Tasting Grid.
- Structural fields (Sweetness, Tannin, Acid, Alcohol, Body, Length, Complexity) declared `ordinal` with CMS labels.
- Descriptor fields (Primary Fruit, Non-Fruit, Secondary, Tertiary) declared `none`, seeded with the CMS descriptor lists (white/red/rosé fruits, non-fruit families).
- Conclusion fields (variety, country, region, vintage, quality hierarchy) are the blind-gradable set (Epic 5).
- CMS grid cannot be deleted or structurally edited (can be cloned to a custom grid).

### Story 2.2 — Custom template builder
**As** a taster, **I want** to define my own grids, **so that** I can taste my way without redeploying.
**AC:**
- Add section → add field → choose type → set options/scale → **set `reconciliation_type`** (the builder forces this choice; default suggested by field type).
- Clone-from-CMS starts a custom grid pre-populated.
- Editing a template **bumps `version`**; existing notes are untouched.
- Builder is mobile-usable but can assume two-handed (creation is not the patchy-signal scenario).

### Story 2.3 — Note capture (grid renderer)
**As** a taster, **I want** to evaluate one wine against one template fast, **so that** capture keeps pace with the glass.
**AC:**
- Note renders from `template_id + template_version` with a **denormalised `template_snapshot`** (field keys/labels) so old notes render correctly after a template edit.
- Values stored as `{ [field.key]: { raw, raw_scale?, canonical? } }` per Epic 1.
- Ordinal fields use chip/stepped controls (Low…High or the custom scale); descriptors use tag pickers seeded from the descriptor sheet; score uses the configured system.
- One-handed entry; large touch targets; no modal traps.
- Save is instant to Dexie; never blocks on network or photo.

### Story 2.4 — Add the wine (image + details)
**As** a taster, **I want** to add a wine by photo + a few fields, **so that** I'm not typing a database entry mid-flight.
**AC:**
- Wine fields: producer, label, vintage, variety[], geo (country/region/subregion-appellation/vineyard as **discrete structured text**, typeahead-seeded, free entry allowed), price, provenance, abv.
- Photo capture/attach → local blob first (Epic 6 lifecycle).
- **Vivino-style label auto-fill is explicitly OUT of MVP** — leave a clean seam (a `wine.source: 'manual'|'scan'` field) for it later.

### Story 2.5 — Saved style / default
**AC:** User sets a default template + display-scale preference; new notes adopt it.

---

## EPIC 3 — Events, Flights & Blind/Known

> Flights exist in MVP as a **single-user** construct (your own flight of wines). The `participant` concept is modelled but **not realtime/invite-enabled** (that's fast-follow per D5).

### Story 3.1 — Event-level general notes
**AC:** `event` holds name, date, location_text, host, attendees[], theme, general_notes (long), default_blind, default_template_id.

### Story 3.2 — Known flight
**As** a taster, **I want** an ordered set of notes in one session, **so that** I can run a flight and swap between wines on the go.
**AC:** `flight` holds `event_id?`, name, blind flag, ordered `note_ids[]`. Swap-between-wines mid-session without losing entry. Re-order supported.

### Story 3.3 — Blind tasting, reveal at end
**As** a taster, **I want** to taste blind and add/reveal the wine at the end, **so that** my conclusions aren't anchored.
**AC:**
- `note.blind = true` → wine identity + all geo fields **hidden in capture/flight UI** until `revealed = true`. Data still stored; it's a **display gate**, not a storage difference.
- "Add wine at the end" flow: capture conclusions blind → attach/confirm actual wine → flip `revealed` → unlock identity in UI and feed Epic 5 accuracy.
- Blind flights: all member wines gated until revealed (individually or all-at-once).

### Story 3.4 — Participant seam (no realtime in v1)
**AC:** Schema includes a `participant` table (`flight_id`, `user_id`, role) and notes can carry an `author_id`. **No invite flow, no realtime, no live dashboard in v1.** Verify the live-flight fast-follow can be added without reshaping these tables.

---

## EPIC 4 — Knowledge Centre

> Online-first (D9). Linking to tasting notes is **functional day-one** via the polymorphic `link` table (D7).

### Story 4.1 — Rich entries (short + long form)
**As** a learner, **I want** to write short and long-form notes with rich text, **so that** I can capture what I learn properly.
**AC:**
- **TipTap** editor. Headings, lists, bold/italic, inline images, block quotes, links.
- Entry types: `short_note` and `article` (same model, different default chrome).
- Online-first persistence; optimistic save; server is SoR.

### Story 4.2 — Photos & documents
**AC:** Attach photos and documents (pdf/docx) to entries via presigned S3 upload. Documents listed with type icon + download. Photos render inline/gallery.

### Story 4.3 — Tagging
**As** a learner, **I want** to tag entries to learning outcomes and metadata, **so that** I can find and organise knowledge.
**AC:**
- Polymorphic tags: `cms_learning_outcome`, `mw_learning_outcome`, `geography`, `variety`, plus free `user_tag`.
- Tag schema is link-ready and browsable (filter the knowledge centre by any tag).
- Seed CMS + MW learning-outcome taxonomies as selectable tag sets.

### Story 4.4 — Bidirectional linking (functional in MVP)
**As** a user, **I want** an article that references a tasting note to be reachable from the note and vice versa, **so that** knowledge and tasting aren't two silos.
**AC:**
- **`link` table is polymorphic**: `{ id, from_type, from_id, to_type, to_id, relation, created_at }` where `*_type ∈ {'note','knowledge_entry','wine','geography','event','flight'}`.
- Insert a link from either side; both ends render the relationship.
- From a Pinot note → see linked knowledge entries; from an entry → see linked notes/wines. Click-through works both directions.
- Inline "note summary" chip (à la Insights) renders a compact note card inside an article with click-through to the full note.

### Story 4.5 — Comments / discussion (single-user-safe in v1)
**AC:** `comment` table (`entry_id`, `author_id`, body, created_at) wired and rendered. In v1 this is effectively your own annotation thread; it becomes multi-user discussion when auth links to Insights and sharing lands. **No sharing/permissions in v1** — entries are owner-scoped.

---

## EPIC 5 — Review & Stats (incl. blind accuracy)

> Computation client-side over Dexie for tasting data (offline); knowledge stats can be server-assisted.

### Story 5.1 — Light tasting dashboard
**AC:** Totals, this month, by template; by variety; by region (`geo_region`); vintage spread; **score distribution using `normalised_score`** + average; tastings over time; blind vs known split.

### Story 5.2 — Blind accuracy
**As** a taster, **I want** my blind guesses graded, **so that** I can track calibration over time.
**AC (grading set per D6):** independently score **variety, country, region, vintage(±band), age-range**.
- Compare the blind-capture conclusions (recorded *before* reveal) against the revealed truth.
- Each dimension scored correct/incorrect (vintage allows a ±band tolerance, configurable; age-range matches the CMS buckets).
- Overall **blind-accuracy %** = mean across the five dimensions; trend over time; per-variety and per-region breakdowns ("you nail Pinot variety but miss its region").
- Only `revealed` blind notes are graded.

### Story 5.3 — Wine / geography review
**AC:** Browse your wines and geographies; drill into a geography to see all notes/knowledge linked to it (uses Epic 4 links + geo fields). This is the surface the future PostGIS migration enriches.

---

## EPIC 6 — Photos, Documents & Sync Infra

### Story 6.1 — Offline-safe photo lifecycle
**AC:**
1. Capture → write blob to Dexie, `photo` record `status='local'`, attach to note. **Note never blocked on photo.**
2. On sync, per `status='local'`: request presigned PUT → upload → set `s3_key`, `status='synced'`.
3. Display: prefer local blob (instant/offline), else S3 URL.

### Story 6.2 — Sync envelope (tasting data)
**AC:**
- `GET /taste/bootstrap` — hydrate everything for the user.
- `POST /taste/sync` — `{ outbox: Mutation[], last_pulled_at } → { applied: id[], pull: {…changed since last_pulled_at} }`.
- `Mutation = { entity, op:'upsert'|'delete', id, payload, updated_at, version }`.
- Soft delete (`deleted` flag) + `updated_at`/`version` on every record.
- Client-generated UUIDv4 everywhere.

### Story 6.3 — Presign endpoints
**AC:** `POST /taste/photos/presign` `{note_id, content_type} → {s3_key, upload_url}`; `POST /taste/photos/confirm` `{s3_key} → {view_url}`. Same pattern reused for knowledge-centre documents.

---

## EPIC 7 — Auth & Account

### Story 7.1 — Login (Insights pattern, separate table)
**AC:**
- Own `taste.user` table; JWT + refresh mirroring Insights' scheme (same hashing, same token shape) so a later SSO/account merge is a migration not a rewrite.
- Email+password for v1. Sessions persist for offline use (token cached; tasting capture works offline once authed).
- A documented seam (`external_auth_id` nullable column) for the later Insights link.

---

## EPIC 8 — Backend Service & Data Model

### Story 8.1 — Provision separate `taste` service
**AC:** New EB application, own pipeline, Postgres **schema `taste`** on the shared RDS hosting `auxein-api-prod`. PostGIS available. No writes into Insights/Grow tables.

### Story 8.2 — Data model (Dexie + `taste` schema)
All records: `id` (uuid client-gen), `created_at`, `updated_at`, `version`, `deleted`.

| Entity | Key fields |
|---|---|
| `user` | email, password_hash, external_auth_id?, prefs |
| `template` | per Epic 2 (incl. `reconciliation_type` on fields) |
| `event` | name, date, location_text, host, attendees[], theme, general_notes, default_blind, default_template_id |
| `wine` | producer, label, vintage, variety[], geo_country, geo_region, geo_subregion_appellation, geo_vineyard, price, provenance, abv, source('manual'|'scan') |
| `note` | wine_id, event_id?, author_id, template_id, template_version, template_snapshot, values (JSON: `{key:{raw,raw_scale?,canonical?}}`), blind, revealed, blind_conclusions (the pre-reveal guesses for grading), score{raw,raw_scale,normalised}?, flight_id?, flight_position?, photos[] |
| `flight` | event_id?, name, blind, ordered note_ids[] |
| `participant` | flight_id, user_id, role *(seam; no realtime v1)* |
| `knowledge_entry` | type('short_note'|'article'), title, body(tiptap json), photos[], documents[], author_id |
| `tag` | type('cms_lo'|'mw_lo'|'geography'|'variety'|'user_tag'), value |
| `entry_tag` | entry_id, tag_id |
| `link` | from_type, from_id, to_type, to_id, relation *(polymorphic, active in v1)* |
| `comment` | entry_id, author_id, body |
| `photo` | owner_type, owner_id, local_blob_ref, s3_key?, status, width, height, taken_at |
| `document` | entry_id, s3_key, filename, content_type, status |

**Geo = discrete fields, never one free-text blob.** Later PostGIS migration resolves these strings to a `gi_id` FK against Insights GI/boundary tables — no reshaping.

---

## EPIC 9 — Export & Wide-Schema Mapping

### Story 9.1 — Versioned export
**AC:** `{ schema:'auxein.taste.v1', exported_at, entities:{…} }`. Note values export **with both raw and canonical** (proves D1/D5). Photos as S3 keys (+ optional base64 for fully-local archives). Client can export locally from Dexie; server offers `GET /taste/export?format=wide`.

### Story 9.2 — Mapping doc
**AC:** Deliver `wide_schema_mapping.md`: every v1 field → its destination in the planned wide Auxein Taste schema, or explicitly marked "v1-only / derive later." No silent loss. e.g. `wine.geo_subregion_appellation → geography.gi_id` via resolver; `note.values[key].canonical → descriptor/structural rows on the canonical ontology`.

---

## Build Sequence (suggested sprint order)

1. **Epic 1** — reconciliation engine + unit tests. *(Nothing real works without this.)*
2. **Epic 8.1 + 7** — service scaffold, `taste` schema, auth.
3. **Epic 2** — templates, CMS seed, builder, note capture. *(First usable loop.)*
4. **Epic 6** — Dexie/outbox/photo lifecycle + sync envelope. *(App now offline-capable + persistent.)*
5. **Epic 3** — events, flights, blind/reveal, on-the-go swap.
6. **Epic 5** — review/stats + blind accuracy.
7. **Epic 4** — knowledge centre + bidirectional links.
8. **Epic 9** — export + mapping doc.

Stages 1–6 deliver a complete solo tasting + review app. Stage 7 adds the knowledge layer. **Live multi-user flights/invites/live dashboard are a separate post-MVP epic** built on the `participant`/`link`/`author_id` seams.

---

## Definition of Done (every story)

- [ ] Reconciliation: no field stores canonical instead of raw; round-trip raw read-back verified.
- [ ] Client-generated UUIDs; soft delete; `updated_at`/`version` present.
- [ ] Tasting capture works fully offline; notes never block on network or photo.
- [ ] Notes pin template version + snapshot; editing a template never mutates prior notes.
- [ ] Mobile-first, one-handed capture; large touch targets; no modal traps.
- [ ] Geo stored as discrete fields.
- [ ] Backend isolated in `taste` schema/service; no Insights/Grow table writes.
- [ ] Unit tests on the reconciliation engine and blind-accuracy grading.
- [ ] Clean, intentional UI (consult `frontend-design`); not a templated default.

---

## Non-Negotiables / Gotchas

- **Reconciliation is the product's spine** — build and test it first, classify every field, never lose raw.
- **Blind grades only after reveal**, against pre-reveal `blind_conclusions`, on the five D6 dimensions.
- **Links are live in v1**, polymorphic, bidirectional.
- **Knowledge Centre online-first; tasting capture offline-first** — deliberately different.
- **No realtime/invites/sharing in v1** — seams only.
- **No Vivino scan in v1** — `wine.source` seam only.
- **Separate service, separate schema, same RDS, Insights auth pattern.**
- The grid is the product. Make entry frictionless and beautiful.
