# Auxein Taste — MVP Build Spec (Claude Code Handoff)

**Owner:** Pete Taylor / Auxein
**Status:** v1 personal-use MVP, designed to expand into the full Auxein Taste platform
**Audience:** Claude Code (greenfield build, provisioned as a separate service alongside Auxein Insights/Grow)

---

## 1. Purpose & Scope

A personal, **local-first PWA** for capturing wine tasting notes in a **grid format**, where the grid is driven by a swappable **template** (built-in CMS deductive grid + user-defined custom grids). It must work fully offline (tasting rooms / vineyards have patchy signal) and sync to a FastAPI backend when connectivity returns.

### In scope for v1 (all required day one)
- **CMS grid** built in as a seeded template (deductive: Sight / Nose / Palate / Initial & Final Conclusions).
- **Custom template builder** — define your own grids (sections → fields) without redeploying.
- **Saved style** — a default template + display preferences.
- **Single tasting note** — one wine evaluated against one template.
- **Flights** — ordered set of notes in one session, with **swap-between-wines on the go**.
- **Blind / known** mode — geography & identity hidden until reveal.
- **Event-level general notes** — date, location, host/attendees, theme, free notes.
- **Geographic / appellation structure** — structured text fields in v1 (country → region → subregion/appellation → vineyard), designed to wire to PostGIS later.
- **Photos** — capture/attach, local blob first, S3 on sync.
- **Stats dashboard** — light: counts, varieties, regions, score distribution, over time.
- **Export** — versioned JSON to a documented "wide schema" mapping.

### Explicitly NOT in scope for v1
- Multi-user / sharing / permissions.
- PostGIS spatial queries (structured text now; FK migration later).
- The full Auxein Taste platform schema (we map *to* it, we don't build it).
- Social / publishing features.

---

## 2. Architecture

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│  React + Vite PWA           │         │  FastAPI "taste" service     │
│  (iPad + phone, installable)│  HTTPS  │  (separate, beside Insights/ │
│                             │ ──────► │   Grow; reuses auth + deploy)│
│  Dexie (IndexedDB)          │  sync   │                              │
│  = source of truth at capture│ ◄────── │  Postgres schema: `taste`    │
│  Service worker (offline)   │         │  on shared RDS (PostGIS-ready)│
│  Local photo blobs          │         │  S3 photos (presigned)       │
└─────────────────────────────┘         └──────────────────────────────┘
```

### Frontend
- **React + Vite**, TypeScript, PWA (vite-plugin-pwa or hand-rolled SW + manifest).
- **Dexie** wrapping IndexedDB. The device store is the **system of record at capture time**; the backend is the system of record once synced + the bridge to the wide schema.
- Installable, standalone display, works with zero connectivity.
- Touch-first UI (iPad/phone). Grid capture optimised for one-handed, fast entry.

### Backend
- **FastAPI**, provisioned **off to the side** of Insights/Grow — own service, own Postgres **schema `taste`** on the shared RDS instance (ap-southeast-2). Reuse existing auth pattern and deployment pipeline (Elastic Beanstalk or equivalent, consistent with current Auxein infra).
- PostGIS extension available but **not used in v1** beyond being present for later migration.
- REST endpoints (see §6).
- S3 for photos via **presigned upload**.

### Sync model — local-first + background sync
- All writes go to Dexie immediately; UI never blocks on network.
- A sync queue (outbox) holds pending mutations with client-generated UUIDs.
- On connectivity (online event / periodic / manual), push outbox → backend, then pull deltas.
- **Conflict policy v1:** last-write-wins by `updated_at`; single user so conflicts are rare. Keep a `version`/`updated_at` on every record to make a better policy possible later.
- IDs are **client-generated UUIDv4** everywhere so offline records are valid before they ever reach the server (no server-assigned PKs).

---

## 3. The Template Abstraction (most important design decision)

A **template is data, not code.** CMS is just a seeded template; the custom builder writes the exact same structure. This is what survives into the wide Auxein Taste schema, so model it cleanly.

```ts
type FieldType =
  | 'single_select'   // chip set, pick one
  | 'multi_select'    // chip set, pick many
  | 'scale'           // slider / stepped (e.g. intensity 1–5)
  | 'text_short'      // single line
  | 'text_long'       // free notes
  | 'tag_structured'  // grouped descriptor tags (e.g. aroma families)
  | 'boolean'
  | 'number'
  | 'score';          // overall score (define scale on field)

interface TemplateField {
  id: string;            // uuid, stable across versions
  key: string;           // machine key, snake_case (used in export mapping)
  label: string;
  type: FieldType;
  options?: string[];    // for selects / tags
  scale?: { min: number; max: number; step?: number; labels?: string[] };
  required?: boolean;
  help?: string;
}

interface TemplateSection {
  id: string;
  label: string;         // e.g. "Sight", "Nose", "Palate", "Conclusions"
  fields: TemplateField[];
}

interface Template {
  id: string;            // uuid
  name: string;          // "CMS Deductive", "My Pinot Grid"
  kind: 'cms' | 'custom';
  version: number;       // bump on edit; notes pin the version they used
  sections: TemplateSection[];
  is_builtin: boolean;   // CMS = true, locked from deletion
  created_at: string;
  updated_at: string;
}
```

- **Notes pin the template id + version they were captured against**, plus a denormalised snapshot of the field keys/labels, so old notes render correctly even after a template is edited. (Editing a template bumps `version`; never mutate prior notes.)
- The **custom builder UI** is a section/field editor producing the structure above. Keep it simple: add section → add field → choose type → set options/scale.
- Seed the **CMS deductive grid** as a builtin template on first run (Sight, Nose, Palate, Initial Conclusions, Final Conclusions, with the standard deductive descriptors). Provide it as a JSON seed file.

---

## 4. Data Model (v1, Dexie + Postgres `taste` schema)

All records: `id` (uuid, client-gen), `created_at`, `updated_at`, `version`, `deleted` (soft delete for sync).

| Entity | Key fields |
|---|---|
| `template` | as §3 |
| `event` | name, date, location_text, host, attendees[], theme, general_notes (long), default_blind (bool), default_template_id |
| `wine` | producer, label, vintage, variety[], **geo fields** (country, region, subregion_appellation, vineyard — structured text), price, source/provenance, abv |
| `note` | wine_id, event_id?, template_id, template_version, template_snapshot, values (JSON keyed by field.key), blind (bool), revealed (bool), score?, flight_id?, flight_position?, photos[] (refs) |
| `flight` | event_id?, name, blind (bool), ordered note_ids[] |
| `photo` | note_id, local_blob_ref (Dexie), s3_key? (null until synced), status: 'local'|'uploading'|'synced', width, height, taken_at |

### Geographic fields (v1 = structured text, PostGIS-ready)
Store as discrete columns/keys, **not** one free-text blob:
`geo_country`, `geo_region`, `geo_subregion_appellation`, `geo_vineyard`.
This makes the later migration a matter of resolving these strings to a `gi_id` FK against the Insights GI/boundary tables — no reshaping. Provide a typeahead seeded with common NZ + classic regions, but allow free entry.

### Blind handling
- When `blind = true`: hide `wine` identity + all geo fields in the capture/flight UI until `revealed = true`.
- The data is still stored; it's a **display gate**, not a storage difference. Reveal flips `revealed` and unlocks the fields in UI + stats.

---

## 5. Photo Lifecycle (offline-safe)

S3 presigned upload **cannot** happen offline, so:

1. Capture/attach → write blob to Dexie, create `photo` record `status='local'`, attach ref to note. **Note is never blocked on the photo.**
2. On sync, for each `status='local'` photo: request presigned PUT URL from backend → upload blob to S3 → set `s3_key`, `status='synced'`, drop/keep local blob per storage budget.
3. Display: prefer local blob if present (instant, offline), else S3 URL.

Backend endpoint issues presigned PUT + records the pending `s3_key`; a confirm step marks it live.

---

## 6. Backend API (FastAPI, prefix `/taste`)

REST + a sync envelope. All entities support the standard CRUD + soft delete. Auth via existing Auxein pattern.

- `GET /taste/bootstrap` — pull everything for the user (initial hydrate).
- `POST /taste/sync` — body: `{ outbox: Mutation[], last_pulled_at }` → returns `{ applied: id[], pull: { ...changed records since last_pulled_at } }`. This is the core local-first endpoint.
- `POST /taste/photos/presign` — `{ note_id, content_type }` → `{ s3_key, upload_url }`.
- `POST /taste/photos/confirm` — `{ s3_key }` → marks live, returns view URL.
- `GET /taste/export?format=wide` — server-side wide-schema export (see §7); the client can also export locally from Dexie.

`Mutation = { entity, op: 'upsert'|'delete', id, payload, updated_at, version }`.

---

## 7. Wide-Schema Mapping (v1 → full Auxein Taste)

v1 uses a **simple schema**; ship a **documented mapping**, not the full platform schema. Deliver:

- `wide_schema_mapping.md` — table mapping each v1 entity/field → its destination in the planned wide Auxein Taste schema (e.g. v1 `wine.geo_subregion_appellation` → wide `geography.gi_id` via resolver; v1 `note.values[key]` → wide `descriptor` rows keyed by canonical descriptor ontology).
- Export format: **versioned JSON envelope** `{ schema: "auxein.taste.v1", exported_at, entities: {...} }`. Photos exported as S3 keys (+ optional base64 fallback for fully-local archives).
- Design rule: every v1 field must have a **non-lossy** path into the wide schema, or be explicitly marked "v1-only / derive later". No silent data loss.

---

## 8. Stats Dashboard (light, v1)

- Total tastings, this month, by template.
- By variety, by region (geo_region), vintage spread.
- Score distribution (histogram) + average.
- Tastings over time (line/area).
- Blind vs known split.
Keep computation client-side over Dexie for offline; mirror server-side later if needed.

---

## 9. Build Sequence (suggested)

1. Scaffold Vite React TS PWA + manifest + service worker; installable shell.
2. Dexie schema + UUID + soft-delete + outbox plumbing (no backend yet — app fully usable offline first).
3. Template model + CMS seed + custom builder UI.
4. Note capture screen (grid renderer driven by template) + photo capture (local blob).
5. Wine + event + flight + blind/reveal + on-the-go wine swap.
6. Stats dashboard.
7. Local JSON export + `wide_schema_mapping.md`.
8. FastAPI `taste` service: bootstrap + sync + presign/confirm; wire background sync.
9. S3 photo upload on sync.
10. Deploy backend beside Insights/Grow; ship PWA.

Stages 1–7 deliver a fully working personal app with **zero backend dependency**; 8–10 add sync/persistence/infra. Pete can use it after stage 7.

---

## 10. Non-negotiables / gotchas

- **Client-generated UUIDs** for all records (offline validity).
- **Notes pin template version + snapshot** (templates evolve; notes must not break).
- **Photos never block note save**; presign is sync-time only.
- **Geo as discrete fields**, never one free-text string (PostGIS migration path).
- **Soft delete + updated_at/version on everything** (sync correctness).
- Backend is a **separate service / separate `taste` schema**, not bolted into Insights/Grow tables.
- Touch-first, fast capture; the grid is the product — make entry frictionless.
