# Auxein Taste — Development Plan (Claude Code build doc)

**Owner:** Pete Taylor / Auxein
**Status:** Planned — locked decisions, not yet started (no code as of 2026-06-06)
**Source spec:** [`AUXEIN_TASTE_MVP_SPEC.md`](./AUXEIN_TASTE_MVP_SPEC.md)
**This doc:** canonical resume pointer for the build. Supersedes the deleted earlier `TASTE_DEV_PLAN.md`.

---

## 0. One-paragraph summary

A personal, local-first PWA for wine tasting notes captured in a template-driven grid, fully usable offline (Dexie/IndexedDB is the system of record at capture), syncing to a **separate** FastAPI service when online. Taste is provisioned **off to the side** of Grow/Insights: its own Elastic Beanstalk environment, its own Postgres `taste` schema, its own Alembic history. It shares only the RDS *instance*, the S3 bucket, and the JWT `SECRET_KEY` — it never reads or writes a Grow/Insights table, and identifies the user by validating the existing Insights public JWT (`public_users.id`).

---

## 1. Locked decisions (confirmed 2026-06-06)

| Decision | Choice | Rationale |
|---|---|---|
| **Backend topology** | **Own EB environment** `auxein-taste-api` at `taste-api.auxein.co.nz` | Grow/Insights deploys never touch Taste; independent scale/health/logs; true "not intertwined". Cost: ~one extra small instance. |
| **Auth / identity** | **Reuse `public_users` SSO** | Validate the existing Insights public JWT (shared `SECRET_KEY`); identify the user via `public_users.id`. No new account, no auth surface to build, no table coupling. |
| **Repo location** | **This monorepo** | New `backend_taste/` module beside `backend/`; new `packages/taste/` workspace. Shares tooling/secrets conventions, deployed independently. |
| **Frontend stack** | React + Vite + **TypeScript** + `vite-plugin-pwa` + **Dexie** | Spec wants TS; `packages/web` already proves the `vite-plugin-pwa` setup to copy from. |
| **Geo storage** | Discrete text fields | `geo_country / geo_region / geo_subregion_appellation / geo_vineyard` — PostGIS-ready, no reshaping later. |
| **IDs** | Client-generated UUIDv4 everywhere | Offline records valid before they reach the server; no server-assigned PKs. |
| **Conflict policy v1** | Last-write-wins by `updated_at` | Single user; `version`/`updated_at` stored on every row to allow a better policy later. |

---

## 2. Grounding in the current architecture (verified)

These are the real facts the plan is built on (checked against the repo, not assumed):

- **Alembic is centralized at repo root**: `./alembic.ini`, `./alembic/env.py`, `./alembic/versions/`. `env.py` uses `Base.metadata` and imports models explicitly. Current Grow head: `add_task_source_task_id`. → Taste gets a **separate** migration root so its history never tangles with this chain.
- **No Postgres `schema=` usage exists yet** — everything is in `public`. Taste's `__table_args__={'schema':'taste'}` will be the first. Migration must `CREATE SCHEMA IF NOT EXISTS taste` before creating tables.
- **Auth is already split**: company `users` (Grow, has `company_id`) vs `public_users` (Insights, **no company_id**, separate JWT in `backend/core/public_security.py`, endpoints under `/api/v1/public/auth/*`). The spec's "user-scoped, no company_id" maps directly onto `public_users`.
- **Backend is a single EB monolith**: `gunicorn main:app -k uvicorn.workers.UvicornWorker`, t3.micro, `backend/.ebextensions/`, health path `/api/health`. CORS is a hardcoded allow-list in `backend/main.py:100`.
- **S3 presign already exists**: `backend/services/file_storage.py::generate_presigned_url` (currently unused for downloads). The spec's presign flow is a small extension, reusing `UPLOADS_S3_BUCKET` config.
- **Frontend template = `packages/insights/`**: port 5174, `@vineyard/insights`, own `publicApi.js` axios instance (token in `localStorage.public_access_token`, no refresh), own `PublicAuthContext`, S3+CloudFront **manual** deploy (no CI for SPAs). Insights has **no** PWA — copy the PWA config from **`packages/web/vite.config.js`** instead.
- **Monorepo**: npm workspaces (`packages/*`), root scripts like `dev:insights` / `build:insights`. `@vineyard/shared` is a local `file:../shared` workspace.

---

## 3. Target topology

```
                    taste.auxein.co.nz                 taste-api.auxein.co.nz
                 ┌──────────────────────┐            ┌──────────────────────────┐
  Browser/iPad → │ packages/taste (PWA) │ ──HTTPS──► │ backend_taste (FastAPI)  │
                 │  Dexie = SoR @ capture│   sync    │  EB env: auxein-taste-api │
                 │  Service worker       │ ◄──────── │  prefix /taste            │
                 │  Local photo blobs    │           │                          │
                 └──────────────────────┘            └────────────┬─────────────┘
                          │                                         │
                          │  login (reuse public JWT)               │ schema `taste` only
                          ▼                                         ▼
                 api.auxein.co.nz/api/v1/public/auth      shared RDS (ap-southeast-2)
                 (existing Insights public auth)          shared S3 bucket (presigned)
```

**Shared primitives:** RDS instance (separate `taste` schema), S3 bucket, JWT `SECRET_KEY`, deploy pipeline conventions.
**Never shared:** any Grow/Insights table, the Grow Alembic history, the EB process/deploy.

---

## 4. Frontend — `packages/taste/`

### 4.1 Scaffold
```
packages/taste/
├── package.json          # @vineyard/taste, "dev"/"build" on port 5175, deps: dexie, vite-plugin-pwa
├── vite.config.ts        # aliases @ → src, @shared → ../shared/src; proxy /api → :8000; PWA manifest
├── tsconfig.json
├── index.html
├── public/
│   ├── manifest.webmanifest  # name "Auxein Taste", standalone, theme #5B6830
│   └── icons/                # from packages/mobile/assets/brand (logo-mark.png etc.)
├── src/
│   ├── main.tsx
│   ├── App.tsx               # router: capture / flights / events / wines / stats / templates / settings
│   ├── db/
│   │   ├── schema.ts         # Dexie tables: templates, events, wines, notes, flights, photos, outbox, meta
│   │   ├── ids.ts            # uuidv4 + helpers
│   │   └── repo.ts           # upsert/softDelete that stamp updated_at/version + enqueue outbox
│   ├── templates/
│   │   ├── types.ts          # Template / TemplateSection / TemplateField / FieldType (spec §3)
│   │   ├── cms-seed.json     # CMS deductive grid (Sight/Nose/Palate/Initial+Final Conclusions)
│   │   └── seed.ts           # seed builtin template on first run
│   ├── sync/
│   │   ├── outbox.ts         # push pending mutations
│   │   ├── pull.ts           # apply server deltas (LWW)
│   │   └── controller.ts     # online listener / periodic / manual triggers
│   ├── features/
│   │   ├── capture/          # grid renderer driven by a template + denormalised snapshot
│   │   ├── builder/          # custom template builder (section → field → type → options/scale)
│   │   ├── flights/          # ordered notes + on-the-go wine swap
│   │   ├── events/           # event-level general notes
│   │   ├── wines/            # wine entity + geo typeahead (seeded NZ + classic regions, free entry)
│   │   ├── blind/            # blind/reveal display gate
│   │   ├── stats/            # client-side dashboard over Dexie
│   │   └── export/           # versioned JSON envelope export
│   ├── components/           # field widgets (single/multi-select chips, scale slider, score, tags…)
│   ├── services/
│   │   ├── tasteApi.ts       # axios → taste-api; attaches public token
│   │   └── photoSync.ts      # presign → PUT → confirm
│   └── auth/                 # read public_access_token; redirect to login if absent
```

### 4.2 Wiring
- Root `package.json`: add `dev:taste` and `build:taste` scripts (mirror the insights ones).
- Reuse `@vineyard/shared` **only** for the public-auth token helpers; do **not** import Grow domain code.
- Dexie is the **system of record at capture**. Stages P1–P7 ship a fully working app with **zero backend**.

### 4.3 PWA
- Copy the `vite-plugin-pwa` / Workbox config from `packages/web/vite.config.js`; adjust manifest name/icons.
- Standalone display, installable, works at zero connectivity.
- Deploy must serve the service worker and `index.html` with correct cache-control (no-cache on SW + HTML) — captured in the deploy runbook.

### 4.4 Deployment (taste.auxein.co.nz)
Same manual pattern as insights:
1. New S3 bucket (per `docs/runbooks/provision-s3-buckets.md`), new CloudFront distribution, ACM cert in **us-east-1**, Route53 alias `taste.auxein.co.nz`.
2. `npm run build:taste` → `aws s3 sync dist/ s3://<taste-bucket>/ --delete` → CloudFront invalidation `/*`.
3. New runbook `docs/runbooks/deploy-taste.md`.

### 4.5 Geo reference table — global appellations, one nested table (decided 2026-06-07)

The spec stores geo as discrete free-text on each wine (`geo_country / geo_region / geo_subregion_appellation / geo_vineyard`). That stays — free entry must always work. But the **typeahead seed** behind it is a single, self-referential reference table so we can seed the world's appellations cleanly and grow it country-by-country.

**Shape — adjacency list (one table, nests to parent):**

```ts
interface GeoRegion {
  id: string;            // stable slug, e.g. "nz-marlborough-wairau-valley"
  parent_id: string|null;// self-FK; null at country level
  level: number;         // 0 country · 1 region · 2 subregion/appellation · 3 vineyard
  kind: string;          // label for the level: 'country'|'region'|'appellation'|'commune'|'gi'|'vineyard'
  name: string;          // "Wairau Valley"
  country_code: string;  // ISO-3166 "NZ" (denormalised onto every node for cheap filtering)
  path: string;          // materialised display path: "New Zealand › Marlborough › Wairau Valley"
  aliases?: string[];    // typeahead synonyms ("Hawke's Bay" / "Hawkes Bay")
  gi_id?: string|null;   // reserved — resolver target into the wide Insights GI/boundary tables
}
```

- **Adjacency list, not nested-set:** simplest model for a typeahead tree; depth varies by country (NZ region→subregion; Burgundy region→commune→1er cru→grand cru) so `level` is an ordinal, not a fixed enum of named tiers. `kind` carries the human label.
- **`path` materialised** on each node → instant breadcrumb display + substring search without recursive joins.
- **`country_code` denormalised** on every node → one-line filter to scope the typeahead ("NZ + AU only" today, global later).
- **Wine link is additive, non-lossy:** keep the discrete `geo_*` free-text fields exactly as specced, and add an **optional** `geo_ref_id` on the wine set when the user picks a node from the typeahead. Free typing leaves it null; picking populates it. This gives the wide-schema migration a clean path (`geo_ref_id → GeoRegion.gi_id → geography.gi_id`) while never blocking free entry. Add this `geo_ref_id` row to `wide_schema_mapping.md` (P7).

**Seeding & expansion:**
- Ship `src/templates/geo-seed.json` (versioned, like `cms-seed.json`), seeded into Dexie `geoRegions` on first run alongside the builtin template.
- v1 corpus: **NZ** (NZW GIs: regions + subregions) + **Australia** (national GI register: states → zones → regions). Classic Old-World regions can be a thin starter set; global is just more rows in the same file — no schema change.
- Backend mirror: a `taste.geo_regions` table (same columns) populated from the same seed in P8, so server-side export and any future resolver share the canonical tree. Reference data — not user-scoped, no `user_id`, not synced via the outbox (seed-shipped on both ends; versioned by a `meta` row).

**Touch points this creates for later phases:** Dexie `geoRegions` table (P2), `geo-seed.json` authored (P5), wine `geo_ref_id` + typeahead picker (P5), `taste.geo_regions` mirror + seed (P8), mapping row (P7).

---

## 5. Backend — `backend_taste/` (separate EB service)

### 5.1 Module layout
```
backend_taste/
├── main.py                 # FastAPI(); prefix /taste; CORS allow-list = taste.auxein.co.nz + localhost:5175
├── Procfile                # gunicorn main:app -k uvicorn.workers.UvicornWorker  (mirror backend/)
├── requirements.txt
├── .ebextensions/          # health path /taste/health, port 8000, t3.micro
├── core/
│   ├── config.py           # DATABASE_URL, SECRET_KEY, UPLOADS_S3_BUCKET (same envs as backend/)
│   └── auth.py             # decode existing public JWT → public_users.id (copy public_security logic)
├── db/
│   ├── base.py             # its own declarative Base (taste models only)
│   ├── session.py
│   └── models/             # template, event, wine, note, flight, photo — all schema='taste'
├── api/
│   ├── deps.py             # get_current_taste_user() → returns public user id from token
│   ├── bootstrap.py
│   ├── sync.py
│   ├── photos.py
│   ├── export.py
│   └── health.py
└── alembic_taste.ini + alembic_taste/   # OWN migration root, version_table_schema='taste'
```

### 5.2 Postgres `taste` schema
- Every model: `__table_args__ = {'schema': 'taste'}`.
- First migration: `op.execute("CREATE SCHEMA IF NOT EXISTS taste")` then create tables under that schema.
- `user_id` is a plain integer referencing the public user — **no cross-schema FK constraint** (loose coupling, keeps services independent).
- Heed the documented 32-char `version_num` limit on Alembic slugs.

### 5.3 Tables (all in `taste`)
Common columns on every row: `id` UUID PK (client-gen), `user_id` int, `created_at`, `updated_at`, `version` int, `deleted` bool.

| Table | Key columns |
|---|---|
| `templates` | name, kind (`cms`/`custom`), version, sections (JSONB), is_builtin |
| `events` | name, date, location_text, host, attendees (JSONB), theme, general_notes, default_blind, default_template_id |
| `wines` | producer, label, vintage, variety (JSONB), geo_country, geo_region, geo_subregion_appellation, geo_vineyard, price, source, abv |
| `notes` | wine_id, event_id?, template_id, template_version, template_snapshot (JSONB), values (JSONB by field.key), blind, revealed, score?, flight_id?, flight_position?, photos (JSONB refs) |
| `flights` | event_id?, name, blind, note_ids (JSONB ordered) |
| `photos` | note_id, s3_key?, status (`local`/`uploading`/`synced`), width, height, taken_at |
| `geo_regions` | **reference data, not user-scoped** (no `user_id`/sync): id (slug PK), parent_id (self-FK), level, kind, name, country_code, path, aliases (JSONB), gi_id? — see §4.5 |

### 5.4 Endpoints (prefix `/taste`)
| Endpoint | Body / behaviour |
|---|---|
| `GET /taste/health` | EB health check |
| `GET /taste/bootstrap` | full hydrate of all entities for the user |
| `POST /taste/sync` | `{ outbox: Mutation[], last_pulled_at }` → `{ applied: id[], pull: {changed records} }`. LWW by `updated_at`, upsert keyed on client UUID, soft-delete propagation. |
| `POST /taste/photos/presign` | `{ note_id, content_type }` → `{ s3_key, upload_url }` (reuse `file_storage.generate_presigned_url`, PUT) |
| `POST /taste/photos/confirm` | `{ s3_key }` → marks live, returns view URL |
| `GET /taste/export?format=wide` | server-side versioned JSON envelope (mirror of client export) |

`Mutation = { entity, op: 'upsert'|'delete', id, payload, updated_at, version }`.

### 5.5 Auth flow
- Login UI on `taste.auxein.co.nz` calls the **existing** `/api/v1/public/auth/login` on the main API → gets the public JWT.
- All Taste **data** calls go to `taste-api` with that token in the `Authorization` header.
- `taste-api` validates the token with the shared `SECRET_KEY` and extracts `public_users.id`; that's the `user_id` on every Taste row. No Taste-side user table.

### 5.6 Deployment
- New EB application/environment `auxein-taste-api`, t3.micro, same RDS secret/env wiring as `backend/`.
- CNAME `taste-api.auxein.co.nz` → EB env URL; ACM cert on the EB load balancer.
- Independent deploy: pushing Taste never redeploys Grow/Insights.
- Runbook `docs/runbooks/deploy-taste-api.md`.

---

## 6. Photo lifecycle (offline-safe)
1. Capture → write blob to Dexie, create `photo` record `status='local'`, attach ref to note. **Note never blocks on the photo.**
2. On sync, per `status='local'` photo: `presign` → PUT blob to S3 → set `s3_key`, `status='synced'` (keep/drop local blob per storage budget).
3. Display: prefer local blob (instant, offline), else S3 view URL.

---

## 7. Wide-schema mapping & export (spec §7)
- Deliver `docs/taste_plan/wide_schema_mapping.md`: every v1 entity/field → its destination in the planned full Auxein Taste schema, or an explicit **"v1-only / derive later"** tag. **No silent data loss.**
  - e.g. `wine.geo_subregion_appellation` → `geography.gi_id` via a later resolver against the Insights GI/boundary tables.
  - e.g. `note.values[key]` → canonical `descriptor` rows keyed by a descriptor ontology.
- Export envelope: `{ schema: "auxein.taste.v1", exported_at, entities: {...} }`. Photos as S3 keys (+ optional base64 fallback for fully-local archives).
- Client export from Dexie (offline) + server mirror at `/taste/export`.

---

## 8. Build sequence (phase-by-phase; auto-build then pause for review)

> Stages P1–P7 deliver a fully working personal app with **zero backend dependency** — usable after P7. P8–P10 add sync/persistence/infra.

| Phase | Deliverable | Backend? |
|---|---|---|
| **P1** | ✅ **BUILT 2026-06-07** Scaffold `packages/taste` TS PWA: installable shell, manifest, SW, routing | no |
| **P2** | ✅ **BUILT 2026-06-07** Dexie schema (incl. `geoRegions` — see §4.5) + UUID + soft-delete + `repo.ts` + outbox plumbing | no |
| **P3** | ✅ **BUILT 2026-06-07** Template types (done P2) + CMS deductive seed + custom builder UI | no |
| **P4** | ✅ **BUILT 2026-06-07** Grid-renderer note capture (template-driven) + local-blob photo capture | no |
| **P5** | Wine + event + flight + blind/reveal + on-the-go wine swap | no |
| **P6** | Stats dashboard (client-side over Dexie) | no |
| **P7** | Local JSON export + `wide_schema_mapping.md` | no |
| — | **← fully usable personal app** | — |
| **P8** | `backend_taste` service: `taste` schema migration, bootstrap + sync; wire outbox/pull | yes |
| **P9** | Presign/confirm + S3 photo upload on sync | yes |
| **P10** | Provision EB env + S3/CloudFront/Route53 + DNS/certs; ship PWA; write runbooks | yes |

Working agreement: each phase auto-builds, then pauses for your review before the next. Builds are **not** run by Claude — Pete tests the app.

---

## 9. Non-negotiables / gotchas (carry-over from spec §10 + repo specifics)
- **Client-generated UUIDs** for all records (offline validity).
- **Notes pin template id + version + denormalised snapshot** — templates evolve; old notes must render unchanged. Editing a template **bumps `version`**, never mutates prior notes.
- **Photos never block note save**; presign is sync-time only.
- **Geo as discrete fields**, never one free-text blob.
- **Soft delete + `updated_at`/`version` on everything** (sync correctness).
- **Taste backend is a separate service + separate `taste` schema + separate Alembic history** — never bolt into Grow/Insights tables or chain.
- **No cross-schema FK** from `taste` rows to `public_users` — loose int `user_id` keeps services independent.
- Touch-first, fast capture; **the grid is the product** — entry must be frictionless.
- CORS on `taste-api` is its own allow-list; don't reuse the Grow/Insights allow-list in `backend/main.py`.
- Alembic `version_num` is 32 chars — keep slugs short.

---

## 10. Open items to resolve before / during P8–P10
- Exact S3 bucket name + path convention for Taste photos (reuse `UPLOADS_S3_BUCKET` with a `taste/<user_id>/…` prefix vs. a dedicated bucket).
- Whether `taste-api` proxies a thin `/taste/auth/login` for convenience or the SPA calls the main API's public auth directly (lean: call main API directly).
- Periodic background-sync cadence + whether to use the Background Sync API or a simple online-event + interval trigger.
- Local photo blob retention budget (keep-after-sync vs. evict).

---

## 11. Resume pointer
**P1 shipped 2026-06-07** — `packages/taste/` TS PWA scaffold: `package.json` (`@vineyard/taste`, port 5175), `vite.config.ts` (PWA config copied from `packages/web`, manifest theme #5B6830, icons from mobile brand), `tsconfig.json`, `index.html`, `src/main.tsx` + `src/App.tsx` (bottom-nav shell, 7 stub routes in `src/screens/index.tsx`), `src/index.css`, brand icons in `public/`. Root `dev:taste`/`build:taste` scripts added. Typechecks clean; **untested in-browser — Pete runs `npm run dev:taste`** (port 5175). No backend.

**P2 shipped 2026-06-07** — `src/db/`: `types.ts` (BaseRow + Template/TasteEvent/Wine/Note/Flight/Photo/GeoRegion/Meta/OutboxItem; `event`→`TasteEvent` to dodge the DOM global; Wine gained `geo_ref_id`), `schema.ts` (`TasteDB` v1, 9 stores incl. `geoRegions` + `++seq` outbox), `ids.ts` (`uuidv4`/`nowIso`/`newBase`), `repo.ts` (generic `put`/`softDelete` that stamp `updated_at`+bump `version` and enqueue an outbox mutation in one rw txn; `repo.{templates,events,wines,notes,flights,photos}` + reference-only `geo` + kv `meta`), `index.ts` barrel. **Brought template *types* forward** from P3 into `src/templates/types.ts` (interfaces only — the notes row needs them; CMS seed + builder UI stay P3). Settings screen has a P2 storage-diagnostics panel + self-test. Typechecks clean; **untested in-browser** — Pete verifies via Settings → "Run storage self-test".

**P3 shipped 2026-06-07** — `src/templates/`: `cms-seed.json` (**v3, faithful to the CMS Europe workbook `Deductive tasting book.pdf`** — grid page 2 for structure + descriptor sheet page 3 for aroma/flavour detail. 6 sections / 40 fields. Sight 11 + Palate-Structure 5 + Initial 4 + Final 5 use exact `single_select`/`boolean` option lists incl. Low/Med-/Medium/Med+/High scales, no invented score. Nose (8) + Palate-Flavour (7) use **`tag_structured` grouped descriptor fields** — Primary fruit / Non-fruit / Secondary(winemaking) / Tertiary, each carrying the full page-3 term lists grouped by category (Citrus, Orchard, Flower, Herb, Oak, MLF… 324 grouped terms total). Grouping required adding `TemplateField.groups: TemplateOptionGroup[]` to the type + `hasGroups()` in factory + a group editor in the builder. tag_structured values store flat term strings like multi_select. **Grouped-chip *rendering* is P4** (builder edits groups now; capture screen renders them next).), `seed.ts` (`seedBuiltins()` — idempotent via `meta` key `seed:cms:version`, re-seeds on version bump, writes builtin **direct to Dexie, not via outbox**; called from App `useEffect`), `factory.ts` (`FIELD_TYPES`, `hasOptions/hasScale`, `slugify`, `newField/newSection`). Builder: `src/features/builder/TemplateBuilder.tsx` (section→field→type→options/scale editor, reorder/remove, key auto-fill + dedup on save) + `src/features/templates/TemplatesScreen.tsx` (list builtin+custom, new/edit/duplicate/delete; builtins are duplicate-only, locked). Re-exported as Grids from `screens/index.tsx`. Typechecks clean; **untested in-browser** — verify via Grids tab (CMS grid should appear as Built-in; create/edit a custom grid).

**P4 shipped 2026-06-07** — `src/features/capture/`: `GridRenderer.tsx` (pure, template-driven; widgets for all 9 field types — single/multi chips, **grouped collapsible tag chips for tag_structured** (count badge, auto-open when selected), scale/score range, boolean Yes/No, number, short/long text) + `CaptureScreen.tsx` (template picker defaulting to `meta.default_template_id`→CMS; minimal inline wine quick-entry producer/label/vintage; local-blob photo capture via `<input capture>` → `createImageBitmap` for dims → stored **straight to Dexie, not the outbox** (sync via presign in P9); draft `noteId` so photos attach pre-save; on save writes Wine then Note with **pinned template snapshot** + values + photo-id refs via `repo`, extracts `score` from any score-type field, resets form + toast). Wired as real Capture screen. Note values store flat strings (tag terms included). **Capture extras added 2026-06-07 (per Pete):** (1) note-level **`general_notes`** free-text field on the Note model + a "Notes" textarea (thoughts / winemaker notes, not template-driven); (2) **inline "+ Add"** on **`tag_structured` (freeform aroma/flavour descriptor) fields only** — NOT on fixed-response single/multi-select fields (per Pete) → type a new descriptor; (3) added descriptors **persist to the live template** via `repo.templates.save` (works on the builtin CMS grid too — bumps version, selects the term, pins it in the note snapshot) and `seedBuiltins()` now **merge-preserves** user-added options/group-terms on a CMS seed bump (`mergeSeed()` union, no silent loss). Typechecks clean; **untested in-browser** — capture a note against CMS grid, add a custom flavour + a photo + general notes, Save; verify via Settings storage counts (notes/wines/photos/outbox increment).

Next action: **P5 — Wine entity + geo typeahead (geoRegions §4.5) + events + flights + blind/reveal + on-the-go wine swap**. The P4 inline wine quick-entry gets replaced/upgraded by the real wine entity + typeahead. This doc is the source of truth; update the phase table and "Open items" as phases land.
