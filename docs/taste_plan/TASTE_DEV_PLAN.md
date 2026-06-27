# Auxein Taste — Development Plan (Claude Code build doc)

**Owner:** Pete Taylor / Auxein
**Status:** In build — P1–P5.1 shipped (frontend, untested in-browser). **Reconciliation retrofit (R1–R3) in progress.**
**Canonical spec (2026-06-27):** [`TASTE_BUILD_SPEC.md`](./TASTE_BUILD_SPEC.md) — **supersedes** the earlier `AUXEIN_TASTE_MVP_SPEC.md` for scope/priority.
**This doc:** canonical resume pointer for the build (build order, repo grounding, backend dev/deploy).

---

## Decision update — 2026-06-27 (reconciliation retrofit)

`TASTE_BUILD_SPEC.md` landed and is now the canonical product spec. It reframes Taste
around a **reconciliation engine** (its Epic 1) that the P1–P5.1 build does not have.
Confirmed decisions this session:

- **BUILD_SPEC supersedes; retrofit (do NOT restart).** The existing UI / CMS workbook
  seed / geo tree / builder / capture / flights all stand and map to BUILD_SPEC Epics 2–3.
  We insert a reconciliation retrofit (**R1–R3**, see §8) before resuming the phase order,
  rather than rebuilding from scratch.
- **Auth = reuse `public_users` SSO** (this doc's original decision). **This OVERRIDES
  BUILD_SPEC D3** ("own `taste.user` table"). There is **no Taste user table** — identity is
  the existing Insights public JWT → `public_users.id`. Build the `external_auth_id` seam
  in the wide-schema mapping only; do not create a user table or auth surface.
- **No real captured data yet** → the `Note.values` reshape (R3) is free: bump the Dexie
  schema version / wipe, no data migration to engineer.

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

### 5.7 Backend dev & deploy workflow (concrete) — added 2026-06-27

**Why a second EB app (not a router prefix on `backend/`).** The whole point of Taste is
isolation: its own health/scale/logs, and a Grow/Insights deploy must never risk Taste
(and vice-versa). The cost is one extra t3.micro + one EB env. Locked per §1.

#### Local dev loop
- **Module**: new `backend_taste/` beside `backend/` — its own FastAPI app, `requirements.txt`,
  and **its own venv** (`backend_taste/venv`). Do not share `backend/venv` — dependency drift
  between the two services must be allowed.
- **Run it**: add a root script `dev:taste-api` mirroring `dev:backend` but pointing at
  `backend_taste` on **port 8001** (8000 is Grow/Insights), e.g.
  `cd backend_taste && venv\Scripts\python -m uvicorn main:app --reload --port 8001`.
  Add `dev:taste-stack` = `concurrently` of `dev:taste-api` + `dev:taste` (like `dev:regional`).
- **Frontend proxy**: point `packages/taste/vite.config.ts` `server.proxy['/api']` (or a new
  `/taste` proxy) at `http://localhost:8001` so the PWA's data calls hit the Taste API locally.
  *(Auth login still calls the existing main API's `/api/v1/public/auth/login` — see §5.5.)*
- **DB in dev**: same shared RDS, schema `taste`. The **first** Alembic migration runs
  `CREATE SCHEMA IF NOT EXISTS taste`. Use the **same `DATABASE_URL`** as `backend/` (one
  instance, different schema). `.env` for `backend_taste` carries `DATABASE_URL`, `SECRET_KEY`
  (must match the main API so the public JWT validates), `UPLOADS_S3_BUCKET`.
- **Migrations**: own root `alembic_taste.ini` + `alembic_taste/` with
  `version_table='alembic_version'`, **`version_table_schema='taste'`** — a separate history
  table inside the `taste` schema, so it never tangles with the Grow chain at `public.alembic_version`.
  Run `alembic -c alembic_taste.ini upgrade head`. Keep slugs ≤32 chars (documented limit).

#### Provision (one-time, P10) — mirror the Insights/Grow infra pattern
1. **EB application + environment** `auxein-taste-api` (t3.micro, single instance or LB), same
   region (ap-southeast-2), `Procfile` = `gunicorn main:app -k uvicorn.workers.UvicornWorker`,
   health path `/taste/health`. Reuse the `backend/.ebextensions/` patterns.
2. **Env vars** on the EB env: `DATABASE_URL` (shared RDS), `SECRET_KEY` (**identical** to main
   API), `UPLOADS_S3_BUCKET`. Set via `eb setenv` or the saved-config pattern in
   [`project_aws_infra`].
3. **RDS access**: put the Taste EB env's instances in the **same security group / subnet** that
   already reaches the shared RDS (the main API's SG). No new DB, no new credentials.
4. **DNS + TLS**: `taste-api.auxein.co.nz` CNAME → EB env URL; ACM cert on the EB load balancer
   (region ap-southeast-2, **not** us-east-1 — that's only for CloudFront/SPA certs).
5. **CORS**: `backend_taste/main.py` has its **own** allow-list = `https://taste.auxein.co.nz` +
   `http://localhost:5175`. Do **not** import or extend `backend/main.py`'s list.

#### Deploy (each release)
- From **`backend_taste/`**: `eb deploy auxein-taste-api`. ⚠️ Per [`project_eb_deploy_from_directory`],
  EB ships the **working directory** (`sc:null`), not git HEAD — commit/clean first so on-disk
  state == intended state.
- **Migrations run separately from deploy** (EB does not auto-migrate): after a successful deploy,
  run `alembic -c alembic_taste.ini upgrade head` against the shared RDS (same as the Grow flow).
- **Frontend (`taste.auxein.co.nz`)** deploys independently: `npm run build:taste` →
  `aws s3 sync dist/ s3://<taste-bucket>/ --delete` → CloudFront invalidation `/*`
  (SW + `index.html` served `no-cache`). See §4.4.
- **Two separate runbooks**: `docs/runbooks/deploy-taste-api.md` (backend) and
  `docs/runbooks/deploy-taste.md` (PWA). Provision steps captured in
  `docs/runbooks/provision-s3-buckets.md` (extend for the Taste bucket + the new EB env).

**Isolation invariants (must hold):** Taste never imports a Grow/Insights model; never writes
outside schema `taste`; never shares the EB process or Alembic history; its only shared
primitives are the RDS *instance*, the S3 bucket, and the JWT `SECRET_KEY`.

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
| **P5** | ✅ **BUILT 2026-06-13** Wine + event + flight + blind/reveal + on-the-go wine swap | no |
| **R1** | ✅ **BUILT 2026-06-27** Reconciliation engine (BUILD_SPEC Epic 1) — pure `src/reconcile/`, unit-tested. No UI. | no |
| **R2** | ✅ **BUILT 2026-06-27** Template model + CMS classification: `reconciliation_type` (required) + `score_system` on `TemplateField`; builder forces the choice + validates; CMS seed reclassified + new Assessment section (score axis); cms-seed v4→v5 | no |
| **R3** | ✅ **BUILT 2026-06-27** Value shape + blind set: `Note.values` → `{raw, raw_scale?, canonical?}` (built at save via `reconcileNoteValues`); `Note.blind_conclusions` frozen at reveal; reader unwraps `.raw`; Dexie v1→v2 clears note-shaped stores | no |
| **P6** | ✅ **BUILT 2026-06-27** Stats dashboard (client-side over Dexie) + blind accuracy on the five D6 dimensions (Epic 5). Pure `src/stats/` (dashboard + blindAccuracy, unit-tested) → `features/stats/StatsScreen` | no |
| **P7** | ✅ **BUILT 2026-06-27** Local JSON export (`auxein.taste.v1`, raw+canonical, optional base64 photos) via `src/export/` + Settings UI; `docs/taste_plan/wide_schema_mapping.md` authored | no |
| — | **← fully usable personal app (P1–P7 complete)** | — |
| **D1** | **Design/mobile polish — claret/cream colour + Grow-style compact** (Pete: refs in `design_ideas`, then "refer to Grow management page: pills, clean lines, fonts, much more compact"). **Sub-pass 1 ✅** foundation · **Sub-pass 2 ✅** reskin → **2b ✅ re-tuned to Grow** (Calibri, compact 13–14px, pill badges, thin lines, dense; serif dropped). Sub-pass 3 (taste-slider component + per-screen detailing) remains | no |
| **P8** | `backend_taste` service: `taste` schema migration, bootstrap + sync; wire outbox/pull. **Backend half ✅ BUILT 2026-06-27** (service+migration+endpoints, generic-records store). **Frontend sync wiring ✅ BUILT 2026-06-28** (auth seam + tasteApi + sync engine/triggers + Settings panel). | yes |
| **P9** | Presign/confirm + S3 photo upload on sync ✅ **BUILT 2026-06-28** (backend endpoints + frontend upload-on-sync + remote display) | yes |
| **P10** | Provision EB env + S3/CloudFront/Route53 + DNS/certs; ship PWA; write runbooks. **Runbooks + prod wiring ✅ BUILT 2026-06-28**; AWS provisioning = Pete-run (deploy stage). | yes |

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

**P5 shipped 2026-06-13** — `src/features/wines/` + `events/` + `flights/`, plus a CaptureScreen rework:
- **Wine entity** (`WinesScreen` + `WineForm` + `emptyWine` + `wineLabel`/`wineOrigin`): real CRUD list, producer/label/vintage, variety quick-pick chips + free add, price/abv/source. Replaces the P4 inline quick-entry.
- **Geo typeahead** (`GeoPicker` + `geo-seed.json` v1 + `geo-seed.ts` + `geo` repo helper): self-referential `geoRegions` tree (dev-plan §4.5) seeded NZ + AU + FR/IT/ES/DE/US (nested authoring JSON flattened to slug/path/country_code at seed time, version-gated re-seed). Search by name/path/alias; picking a node fills the 4 discrete `geo_*` fields + stamps `geo_ref_id`; hand-editing a field clears the ref (non-lossy free entry preserved). Wired into App `useEffect` via `seedGeo()`.
- **Wine picker for capture** (`WinePicker`): search saved wines or "+ New" → inline `WineForm` takeover, then select. Capture no longer mints wines inline.
- **Events** (`EventsScreen` + `EventForm` + `emptyEvent`): occasion CRUD — name/date/location/host/attendees(chips)/theme/general_notes + **defaults** (`default_blind`, `default_template_id`). Delete detaches member notes/flights (nulls their FK, no orphans). List shows per-event note counts.
- **Flights** (`FlightsScreen` + `FlightForm` + `emptyFlight` + `FlightDetail`): flight CRUD (name, optional event, blind). Detail = ordered notes (`note_ids` is the order SoR, mirrored to `note.flight_position`), reorder ↑/↓, per-note + whole-flight reveal, detach note, revealed-wines summary. Creating a flight jumps straight into its detail.
- **Blind / reveal** (`noteWineLabel` in `wineLabel.ts`): blind notes store all data but mask the wine identity ("Wine N" / "Hidden wine") until `revealed`. A flight owns the blind decision; standalone notes use a per-note toggle.
- **CaptureScreen rework**: WinePicker + collapsible **Tasting context** (event select → applies its defaults + scopes flights; flight select + inline "+ Flight" quick-create; blind toggle, disabled+driven by the flight when one is chosen). On save, the note gets `event_id`/`flight_id`/`flight_position`/`blind`/`revealed`, appends into the flight's `note_ids`, then **resets the wine/values/photos but KEEPS the event/flight/blind/grid context** — the on-the-go wine swap (next pour is one tap away).
- Wired real `WinesScreen`/`EventsScreen`/`FlightsScreen` exports in `screens/index.tsx` (routing in `App.tsx` already pointed at them); added the P5 CSS block (wine picker, geo typeahead dropdown, toggle rows, context disclosure, flight-note rows).

`npm run tsc --noEmit` (via `npx tsc --noEmit`) **passes clean; untested in-browser** — Pete runs `npm run dev:taste` (port 5175). Suggested smoke test: add a wine with a geo pick (verify ✓ Linked + discrete fields fill); create an event with default blind + grid; create a flight; in Capture pick the event→flight, save 2–3 wines back-to-back (context should persist, wine clears each time); open the flight, reorder, reveal.

**P5.1 UX redesign 2026-06-13** (Pete feedback: capture too clunky / ~5 pages of scroll; flow should be Home → start tasting → wines added *inline*, forward-only; Wines tab = review archive, not an add-then-return surface). `npx tsc --noEmit` clean, **untested in-browser**. Locked answers: accordion guided walk · blind = hide-until-reveal (deductive) · Home default tab · dedicated flight-notes spot · wines added inside the tasting.
- **Model/seed**: `Note.tasted_at` (date, backdate-able) + `Flight.general_notes` + `TemplateSection.blind_only`; flagged CMS `initial_conclusion`+`final_conclusion` sections `blind_only:true`, bumped cms-seed v3→v4 (mergeSeed preserves the flag + user terms).
- **Home hub** (`features/home/HomeScreen.tsx`): default landing; tiles Quick taste / Start a flight / New event / My wines + recent feed. Bottom nav reworked to Home·Wines·Events·Flights·Grids·Settings (Capture + Stats are routes only, reached via Home/flow). Tiles navigate to `/capture` with `state:{mode}`; New event → `/events` `state:{create:true}` (EventsScreen auto-opens the form).
- **Capture rewrite** (`CaptureScreen.tsx`): two phases — **setup** (grid picker + blind + tasting date; flight name + event when starting a flight) → **taste**. Sticky save bar; date editable inline (backdating). Wine identity is entered **inline** (`WineFields`): non-blind shows it up front + hides conclusion sections; blind hides identity, walks the grid incl. conclusions, then **Reveal** unlocks identity entry. Save: non-blind quick → `/wines`; flight → **resets wine + grid but keeps context** and appends to `flight.note_ids` (forward-only). Dedicated **Flight notes** toggle (saves to `flight.general_notes`). Photos + per-wine notes retained. No WinePicker (deleted — the library-then-return pattern is gone).
- **Guided walk** (`features/capture/SectionWalk.tsx`): accordion, one section open, Back/Next + progress + answered-count badges; `key={noteId}` resets to section 1 per pour. `GridRenderer` refactored to export `SectionFields`.
- **Widgets**: short ordered single-selects + Yes/No render as a segmented "rotator"; `tag_structured` got a cross-group descriptor **autopicker** (search) above the grouped browse chips; tighter CSS throughout.
- **Wines = review archive** (`WinesScreen.tsx` rewrite): lists only *tasted* wines (have a note), newest first, score pill; tap → `WineReview` read-only render of the pinned snapshot values + general notes + photos per note. Edit exists only to correct identity; no "+ New".
- **Shared**: `WineFields` extracted (used by WineForm + Capture); `emptyWine` moved there (WineForm re-exports); `noteWineLabel` blind mask reused on Home.

Smoke test: Home → Quick taste (pick grid, leave blind off) → wine details up front, walk grid (no conclusions), Save → lands in Wines. Then Home → Start a flight (blind on) → name it → taste: identity hidden, walk incl. conclusions, Reveal, enter wine, Save & next → wine 2 starts fresh, Flight notes persists; open Flights → reorder/reveal; Wines shows both with scores.

**R1 shipped 2026-06-27** — reconciliation engine, BUILD_SPEC Epic 1. `src/reconcile/index.ts`:
pure, dependency-free (no Dexie/DOM import) so it's unit-testable in isolation. Exports:
`CMS_BANDS` + `SCORE_SYSTEMS` constants; types `ReconciliationType` / `OrdinalScale` /
`ScoreSystem` / `CanonicalOrdinal` / `CanonicalScore` / `ReconciledValue`; functions
`toCanonicalOrdinal` (numeric position-banding + 1:1 CMS-label mapping, clamps 0..4, no phantom
6th band, label/numeric-string handling), `bandLabel`, `isCmsLabels`, `toNormalisedScore`
(parker/ucdavis/stars/percent + explicit `{min,max}`, clamped 0..100), `renderInScale` (Story 1.4
lossy-direction render via `position`), and the non-destructive constructors `buildOrdinalValue` /
`buildScoreValue` / `buildRawValue` + a `reconcile(type, raw, {scale|score_system})` dispatcher
(Story 1.5 — never stores canonical instead of raw; unanswered → raw only). Tests:
`src/reconcile/reconcile.test.ts` (vitest). **`vitest` added to taste devDeps + `test`/`test:watch`
scripts** — run `npm install` (in `packages/taste`) then `npm test`. Engine math independently
verified 32/32 via a plain-node mirror; **vitest suite untested by Pete** (needs the install).

**R2 shipped 2026-06-27** — template model + CMS classification. `TemplateField` gains a
**required** `reconciliation_type` ('ordinal'|'score'|'none') + optional `score_system`
(`src/templates/types.ts` imports both from `@/reconcile`; no cycle — reconcile imports nothing).
`src/templates/factory.ts` adds: `RECON_TYPES` + `SCORE_SYSTEM_OPTIONS` (builder selectors),
`defaultReconciliation(type)` (score→score, scale→ordinal, else none), `defaultScoreSystem()`,
and the template→engine bridges `ordinalScaleForField()` (numeric `scale` wins, else a
single_select's `options` ARE the ordered labels — single source of truth, survives "+ add"
merges) / `scoreSystemForField()` / `fieldReconError()` (BUILD_SPEC 1.1 validation). `newField`
now stamps reconciliation_type (+ score_system for score). Builder (`TemplateBuilder.tsx`): a
"Reconciles" selector + hint on every field card, a score-system picker for score fields
(`changeRecon` / `changeScoreSystem` sync min/max + slider scale), `changeType` re-suggests the
default, and `handleSave` blocks ordinal/score fields lacking a scale def. CMS seed: every field
carries `reconciliation_type`; the nine structural fields → `ordinal` (tannin/acid/alcohol/
viscosity use the exact CMS Low…High labels → 1:1 band map; finish/intensity/complexity/sweetness
band by position); descriptors/categoricals/conclusions → `none`; **new non-blind `Assessment`
section** with `quality_level` (ordinal Faulty…Outstanding) + `score` (percent 0–100, the score
axis). **`palate_body` options changed** `Tart/Light/Medium/Full/Creamy/Round` → monotonic
`Light/Med-/Medium/Med+/Full` (the old list wasn't a valid ordinal scale; texture terms move to
notes). cms-seed **v4→v5** (mergeSeed re-applies reclassification from the seed; ⚠️ it also unions
the OLD body options back as if user-added — **clear app storage / wipe Dexie so v5 seeds clean**,
which R3's schema bump will force anyway). `src/index.css` adds `.recon-row`/`.recon-hint`.
Typecheck: `npx tsc --noEmit` clean except the known `vitest`-not-installed error in the R1 test
file (run `npm install` in `packages/taste`). **Untested in-browser** — Pete: wipe storage, open
Grids → duplicate CMS → confirm each field shows a Reconciles control + the Assessment section.

**R3 shipped 2026-06-27** — value shape + blind set. `Note.values` is now
`Record<string, ReconciledValue>` (`{raw, raw_scale?, canonical?}`) and `Note` gains
`blind_conclusions: Record<string, unknown> | null` (`db/types.ts` imports `ReconciledValue` from
`@/reconcile`). **Key design: widgets stay raw during editing; the envelope is built once at save**
via `reconcileNoteValues(sections, rawValues)` (new in `factory.ts` — routes each field through
`reconcile()` using `ordinalScaleForField`/`scoreSystemForField`, defensively falling back to
raw-only). So **`GridRenderer`/`SectionWalk` need no change** — reconciliation lives in one place.
`CaptureScreen`: a `reveal()` helper freezes `blind_conclusions` (raw answered values of
`blind_only` sections) the moment before the truth is entered; save reconciles values + sets
`blind_conclusions` (null when known); `resetWine` clears it. Reader `WinesScreen`/`NoteReview`
unwraps `note.values[key]?.raw`. **Dexie v1→v2** (`schema.ts`): same indexes, an `.upgrade()`
clears `notes`/`photos`/`outbox` and resets `flights.note_ids` (pre-R3 flat-value notes are
shape-incompatible; no production data). `npx tsc --noEmit` clean bar the known `vitest` test
error. **Untested in-browser** — Pete (after `npm install`, wipe storage): capture a non-blind
note (ordinal/score fields project; raw shows unchanged in the Wines review); a blind flight note
(fill conclusions → Reveal → enter wine → Save) — `blind_conclusions` should hold the pre-reveal
guesses for Epic 5.

**P6 shipped 2026-06-27** — stats dashboard + blind accuracy (Epic 5). Two **pure, dependency-free**
modules under `src/stats/`: `dashboard.ts` (`computeDashboard(notes, wines, {month})` → totals /
this-month / blind·known / by-template / by-variety / by-region / vintage spread / **score
distribution via the canonical `normalised_score`** + average / over-time) and `blindAccuracy.ts`
(`computeBlindStats` → grades only revealed blind notes on the five D6 dims — variety / country /
region / vintage(±band, default 2) / age-range — comparing `blind_conclusions` against the revealed
wine; pooled per-dimension + per-variety + per-region + monthly-trend accuracy). Guess resolution
matches conclusion field keys/labels by dimension pattern, preferring final over initial. **Two real
bugs caught by the verification mirrors:** the age pattern `/age/i` matched "vint·age" so `fc_vintage`
hijacked the age dim → fixed to `/(?<![a-z])age/i`; and the top score band only caught exactly 100 →
fixed to `>= 90` (inclusive 90–100). UI `features/stats/StatsScreen.tsx` (stat cards, accuracy panel
with per-dimension bars, count-bar breakdowns) + Home "Insights" tile + `.stat-*`/`.bar*` CSS. Tests
`src/stats/blindAccuracy.test.ts` (vitest); blind-grading verified 20/20 + dashboard banding/score
checks via node mirrors. `npx tsc --noEmit` clean bar the two known `vitest`-not-installed test
errors. **Untested in-browser** — Pete (after `npm install`): wipe storage, capture a few notes incl.
a blind flight with conclusions, open Home → Insights.

**P7 shipped 2026-06-27** — local JSON export + wide-schema mapping. `src/export/exportData.ts`:
`buildExport({includePhotoData})` dumps live (non-deleted) Dexie data as `{schema:'auxein.taste.v1',
exported_at, entities:{templates,events,wines,notes,flights,photos}}` — note `values` carry both raw
and canonical (verbatim, proving D1/D5); photos export as S3 keys + metadata, optionally base64
(`data_base64`) for a fully-local archive; geoRegions/outbox/meta excluded. `downloadJson` +
`exportToFile` (dated filename). Settings screen gains an **Export** section (JSON / Export with
photos, with a result line). `docs/taste_plan/wide_schema_mapping.md` authored — every v1 entity/field
→ wide-schema destination or "v1-only / derive later", incl. the geo `geo_ref_id → GeoRegion.gi_id →
geography.gi_id` path and the raw/canonical audit. `npx tsc --noEmit` clean bar the two known `vitest`
test errors. **Untested in-browser** — Pete (after `npm install`): Settings → Export JSON, confirm the
file downloads and notes carry `{raw, canonical}`.

**P1–P7 milestone reached: fully usable personal app (zero backend).**

**D1 in progress — design/mobile polish (decided 2026-06-27: run NOW before backend; Pete: use my
judgement, no render refs; the `frontend-design` skill is NOT installed in this env, so work from the
brand tokens — #5B6830 brand, Auxein mark).** Pure CSS/markup, no logic change.

**D1 design direction (decided 2026-06-27):** Pete supplied refs in `docs/taste_plan/design_ideas/`
(Vivino-style wine apps — deep wine-red chrome, center-FAB nav, bipolar taste sliders, round-icon
chips, big stat numbers) and chose **"editorial wine + cream"**: claret + cream paper, **serif** wine
names/display, olive demoted to a quiet tertiary. (No styling skill is installed in this env — the
spec's `frontend-design` is absent; `DesignSync` only syncs to claude.ai design-system projects — so
the reskin is hand-built from the brand tokens.)

**D1 sub-pass 2 ✅ BUILT 2026-06-27 — editorial reskin.** `src/index.css`: new palette
(`--claret #7b2e3c` / `--claret-dark` / `--claret-tint`, `--paper #f6f1e7` cream bg, `--surface
#fffdf8` warm white, `--ink #2a2018`, `--muted` warm, `--olive` tertiary, `--gold`); **aliased
`--brand`→claret + `--bg`→paper** so all prior `var(--brand)`/`var(--bg)` usages recolour for free;
`--font-serif` (system serif stack — offline PWA) on wine names, screen titles, masthead, big stat
numbers; `.screen-title` gets a short claret underline rule; editorial masthead (serif claret
"Auxein", italic "Taste"); recoloured all hardcoded olive tints (`#eef0e7`→`var(--brand-tint)`);
**center capture FAB** in the bottom nav (`.nav-fab`, claret, lifted). `App.tsx`: nav restructured to
4 tabs (Home·Wines·[FAB]·Flights·Insights) — **Events/Grids/Settings moved to Home** via a new
`.home-links` row (`HomeScreen.tsx`). PWA `theme_color`→`#7B2E3C` + bg cream (`vite.config.ts` +
`index.html`). CSS verified balanced (194/194) + no undefined vars; `tsc` clean bar the known vitest
errors. **Untested on device.**

**D1 sub-pass 1 ✅ BUILT 2026-06-27 — foundation (`src/index.css` only):** expanded `:root` tokens
(spacing `--s1..6`, radii `--r-*`, `--shadow-card`, `--brand-tint`, `--danger`, `--tap: 44px`); body
base 16px + line-height + `text-size-adjust`; global touch resets (`-webkit-tap-highlight-color`
transparent, `touch-action: manipulation`) + `:focus-visible` ring; **44px min tap targets** on `.btn`
(+disabled/active), `.segmented-item`, larger `.icon-btn` (40px), `.chip` (40px); **`.form-input`
font-size 16px (kills iOS focus-zoom)** + focus ring + custom select chevron; card elevation on
grid-section/template-card/stat-card/stat-panel/home-tile/kv; ≤640px centred layout for tablet/desktop;
taller home tiles. CSS verified balanced (187/187 braces) + no undefined `var()`. **Untested on device.**

**D1 sub-pass 2b — re-tuned to Grow (2026-06-27).** Pete: "refer to the Grow management page — pills,
clean lines, fonts, a lot more compact, too bulky still." Studied `packages/web/src/styles/theme.css`
+ `CompanyAdmin.css`: **Calibri** font (`--font-sans: Calibri,…`; `--font-serif` re-aliased to it, so
the editorial serif is dropped), compact 13–14px scale, pill `.badge` (`2px 10px`/11px/600), thin 1px
lines, dense rhythm. Compacted everything: screen-title 27→19 (underline rule removed), screen padding
24→16, btn 44→40, chip 40→32, segmented 44→36, icon-btn 40→34, input 44→40 (kept 16px font for iOS),
cards 14→11–12 padding + radius 12→10, home tiles de-bulked (min-height 92→0), stat numbers 28→22 /
accuracy 38→30, list/grid gaps tightened; removed the stray sub-pass-1 `.home-tile{min-height:88px}`.
Claret/cream colour kept (Pete's earlier pick); only density/type/structure moved to Grow. CSS
balanced (192/192) + no undefined vars; `tsc` clean bar known vitest errors. **Untested on device.**

**D1 sub-pass 2c + builder redesign (2026-06-27).** Pete: "still bulky / not refined — clean tight pill
style for selectors, especially capture; and the create-template page must NOT use free-text fields —
a bank of fields users pick from, adjusting only params that still reconcile."
- **Capture selectors tightened** (`index.css`): `.chip` 32→28px / `3px 11px`, `.segmented` pill radius +
  item 36→30px, accordion `.walk-*` de-bulked (header 14→10/12, radius 12→10), grid fields/sections +
  descriptor groups tightened. Clean tight pills throughout capture.
- **Field-bank builder** (replaces free-text creation): new `src/templates/fieldBank.ts` (`FIELD_BANK`
  = the reconcilable CMS canon grouped by section + `instantiateField`); `TemplateBuilder.tsx` rewritten
  — "+ Add fields" opens a bank picker (pills, grouped, already-added greyed); added fields show as
  read-only cards with a recon tag and ONLY constrained params (score-system for score, numeric min/max
  for `scale` fields, required) — no label/option/type/recon free editing. `fieldReconError` still gates
  save. Section labels use a `<datalist>` of the bank categories. `tsc` clean; CSS balanced (210/210).
  **Untested in-browser.**

**D1 sub-pass 3 ✅ BUILT 2026-06-27 — capture redesign (Pete: "uninspiring/boring, pills different
sizes/untidy; want sliders, icons, an aroma-wheel modal instead of long lists").** Decided via
AskUserQuestion: aroma-wheel **modal** (category tiles → terms) + **both** icon mediums (lucide for
chrome, emoji for aroma categories). Added `lucide-react ^0.510.0` to taste deps (already hoisted at
repo root via Grow). New: `src/features/capture/icons.tsx` (`sectionIcon` lucide Eye/Wind/Wine/Grape/
Award/ClipboardList by section keyword; `aromaEmoji` per descriptor category), `AromaModal.tsx`
(full-screen: selected pills + search + colour-coded emoji **category tiles** → term chips + add-your-
own), and a rewritten `GridRenderer.tsx`: **ordinal single_selects → discrete labelled slider**
(`.oslider`, claret `--fill` gradient + thumb, current-band label) — kills the segmented bars;
**all categorical/multi/boolean → one uniform `.chip` pill** (fixes the different-sizes mess);
**tag_structured → AromaField** (selected pills + "Add aromas" → modal); scale/score → numeric slider.
`SectionWalk` headers gained the lucide section icon. **CSS cleaned**: removed 21 now-dead rule blocks
(`.segmented*`, `.descriptor-picker`, `.tag-group*`, `.scale-input/value`, `.chip--add`,
`.recon-*`, `.field-card`, `.group-*`); added `.oslider*`, `.aroma-*`, `.walk-header-icon`. Balanced
(219/219), `tsc` clean bar known vitest. **Untested in-browser** — needs `npm install` (lucide).

**D1 sub-pass 4 ✅ BUILT 2026-06-27 — WineReview ordinal mini-sliders.** `WinesScreen.tsx`: review rows
now carry the full `{field, val}`; ordinal fields render via a new `ReviewValue` as a compact read-only
bar (`.rslider` — claret fill to the stored `canonical.position` + the raw band label) so the review
mirrors the capture slider and surfaces the reconciliation; everything else stays text. `tsc` clean,
CSS balanced (223/223). **Untested on device.**

**D1 remaining (optional, low priority):** per-screen phone audit of the Events/Flights/Grids lists +
empty states. The true radial SVG aroma wheel was offered but Pete picked the tile modal.

**P8 backend half ✅ BUILT 2026-06-27 — `backend_taste/` service.** Pete chose P8 next (durability/sync).
**Design deviation (flagged for veto):** instead of the dev-plan's 7 typed tables, a single generic
**`taste.records`** store (`id` client-UUID PK, `entity`, `user_id` int, `payload` JSONB, `updated_at`,
`version`, `deleted`) — client is SoR, server is a durable LWW relay; far less bug surface in a backend
I can't run here, and a later migration can normalise if server-side querying is needed. Files: `core/
config.py` (lean settings, DATABASE_URL from env, no Secrets-Manager coupling), `core/auth.py`
(`get_current_taste_user` → decode public JWT with shared SECRET_KEY → `public_users.id`; no DB query,
no Taste user table), `db/base.py` (own engine/session/Base), `db/models.py` (`Record` + `ENTITIES`),
`api/health.py|bootstrap.py|sync.py` (`GET /taste/health`, `GET /taste/bootstrap`, `POST /taste/sync`
with LWW-by-updated_at + soft-delete + delta pull), `main.py` (own CORS allow-list, `/taste` prefix),
`requirements.txt` / `Procfile` / `.ebextensions/01_python.config` (health `/taste/health`, port 8000)
/ `alembic_taste.ini` + `alembic_taste/env.py` (`version_table_schema='taste'`, creates schema) +
`versions/0001_init_taste.py` / `.env.example` / `README.md`. Root scripts `dev:taste-api` (port 8001)
+ `dev:taste-stack`. **All Python `py_compile`-clean (system py3.13); not run against a DB.** Needs a
`backend_taste/venv` + `pip install -r requirements.txt` + `.env` + `alembic -c alembic_taste.ini
upgrade head` before it serves.

**P8 remaining (frontend sync wiring) — NEXT:** `packages/taste/src/services/tasteApi.ts` (axios/fetch
to taste-api with the public token), `src/sync/` (push outbox → `POST /taste/sync`, apply pull deltas
LWW into Dexie, `last_pulled_at` in `meta`, online-event + manual triggers), an auth seam (read the
public token; the SPA logs in via the main API's `/api/v1/public/auth/login`), and the Vite proxy /
API-base wiring (data calls → :8001 local, taste-api in prod). Then P9 (photos) → P10 (infra/deploy).

Then **P8–P10 — backend service + infra** (per §5 incl. §5.7 dev/deploy): `backend_taste` `taste`
schema, bootstrap+sync, presign/S3 photos, EB env + DNS.

**Flight glass-rack + photo UX ✅ BUILT 2026-06-28 (untested in-browser).** Replaces the
forward-only "Save & next" flight flow with a **persistent rack of glasses you switch between
freely** (tap glass 4 → 6 → 1, non-linear). Decided via AskUserQuestion: tap-a-dot to cycle
colour + a camera button in the save bar.
- **Model**: new `Note.glass_color: GlassColor|null` (`'red'|'white'|'rose'|'sparkling'`, observed
  pour — visible even blind; feeds stats later) in `db/types.ts`. Non-indexed → **no Dexie bump**.
- **`features/capture/glass.ts`** (new): `Glass` editor-state interface (own wine/values/photos/
  reveal per glass), `emptyGlass`, `glassHasContent` (identity OR any value OR photo OR notes),
  `GLASS_COLOR_HEX`/`_LABEL`, `nextColor` (cycle none→red→white→rosé→sparkling→none).
- **`features/capture/GlassRack.tsx`** (new): horizontal rack — numbered glasses tinted by colour
  (lucide `Wine` fill), tap glass body to select, tap colour dot to cycle, "+" to add a glass,
  wine label or "Hidden"/"—" beneath.
- **`CaptureScreen.tsx`** (rewritten): glasses array + `activeId`; all editor mutations target the
  active glass. Each glass **persists to Dexie as a Note (+ Wine) the moment it has content** —
  flushed when you switch away / add a glass / Finish (so jumping between glasses is lossless and
  survives leaving the screen). Wine saved only once it has identity → **empty/untouched glasses
  never pollute the Wines archive or stats** (note carries no wine_id). Blind reveal is **per glass**.
  Setup gains a **"Glasses" count** (default 1) for flight mode; flight bar primary is **Finish**
  (rack drives the flow), quick-taste stays a single glass → Save → /wines. Resuming a flight
  (`init.flightId`) rebuilds the rack from its notes via `noteToGlass`.
- **Photo UX**: prominent **camera button (lucide `Camera` + "Photo") in the sticky save bar**
  opening the camera directly; the in-note strip's "+" is now a camera icon too.
- `index.css`: `.rack*` / `.capture-bar-actions` / `.capture-photo-btn` added (braces 236/236).
- `npx tsc --noEmit` **clean** (vitest/lucide now installed — the previously-known test errors are
  gone). **Untested in-browser** — Pete: Home → Start a flight, set 3 glasses, taste glass 1, tap
  glass 3 then 1 (state persists), cycle a glass colour, add a photo from the bar, Finish; open
  Flights to confirm the rack's wines landed in order.

**P8 frontend sync wiring ✅ BUILT 2026-06-28 (untested — needs the backend running).** Connects
the PWA's Dexie outbox to the `backend_taste` `/taste/sync` relay. Local-first preserved: sync is
opportunistic and a complete no-op until signed in, so P1–P7 still work with zero backend.
- **Auth seam** `src/auth/publicAuth.ts`: NO Taste user table — identity is the existing Insights
  public JWT. `login(email,password)` POSTs the **main API** `{VITE_API_URL||'/api'}/public/auth/login`
  → stores `public_access_token` + `public_user` (same keys Insights uses). `getToken`/`isAuthed`/
  `logout`/`clearToken`.
- **Client** `src/services/tasteApi.ts`: `fetch` wrapper to the **taste-api** (`{VITE_TASTE_API_URL||''}
  /taste/*`), attaches the bearer token, clears it on 401. `tasteSync`/`tasteBootstrap`/`tasteHealth`.
- **Engine** `src/sync/engine.ts`: `syncNow()` drains the outbox (ordered by seq) → `POST /taste/sync`
  `{outbox, last_pulled_at}` → on success deletes exactly the sent seqs, applies pull deltas, stores
  `last_pulled_at = server_time` in `meta`. Single-flight + offline/unauthed guards. Photo `blob` is
  stripped from any payload (binary syncs via presign in P9; notes still carry photo id refs). Tiny
  pub/sub (`subscribeSync`/`getSyncStatus`) drives the UI. `src/sync/pull.ts`: LWW apply (by
  `updated_at`, parsed to ms) written **direct to the Dexie table, never via repo** (no re-enqueue loop).
- **Triggers** `src/sync/controller.ts`: `startAutoSync()` — initial pass on boot + `online` event +
  60s heartbeat; wired in `App.tsx`. (First sync sends `last_pulled_at:null` → server returns ALL the
  user's rows, so `/sync` doubles as bootstrap; `tasteBootstrap` kept for completeness, unused.)
- **UI** `src/features/sync/SyncPanel.tsx` in Settings: signed-out → email/password sign-in (optional,
  explains local-first); signed-in → status (up-to-date/syncing/offline/error) + pending-change count +
  last-synced + **Sync now** + Sign out. `index.css` `.sync-panel`/`.sync-form`.
- **Vite**: added `/taste` proxy → `http://localhost:8001` (auth `/api` stays → :8000).
- `npx tsc --noEmit` **clean**; CSS braces 238/238. **Untested** — to exercise sync Pete needs
  `backend_taste` up (`venv` + `pip install -r requirements.txt` + `.env` with shared `SECRET_KEY` +
  `alembic -c alembic_taste.ini upgrade head`) on :8001, and the main API reachable on :8000 (or set
  `VITE_API_URL` to prod) for login. Without them the app is unaffected (stays local-only). **Next:
  P9** (presign + S3 photo upload on sync) → **P10** (provision EB env + S3/CloudFront/Route53 + DNS).

**P9 presign + S3 photo upload on sync ✅ BUILT 2026-06-28 (untested — needs S3 + backend).**
Implements the dev-plan §6 photo lifecycle: blobs captured locally, uploaded to S3 on sync,
displayed from the local blob (instant/offline) or a presigned URL (cross-device).
- **Backend** `backend_taste/services/file_storage.py` (standalone — can't import `backend/`):
  `presign_put` / `presign_get` / `object_exists` via boto3, reusing the shared `UPLOADS_S3_BUCKET`.
  `api/photos.py` (registered in `main.py`): `POST /taste/photos/presign {note_id, photo_id?,
  content_type}` → `{s3_key, upload_url}` (PUT); `POST /taste/photos/confirm {s3_key}` → HEAD-checks
  then `{view_url}` (GET); `GET /taste/photos/view?key=` → `{view_url}` for cross-device display.
  Objects are keyed `taste/<user_id>/<note_id>/<photo_id><ext>` and **every call asserts the key
  belongs to the caller** (prefix check). 503 when S3 unconfigured (dev) → client skips gracefully.
  `boto3` already in requirements; all `py_compile`/`compileall`-clean (not run against AWS).
- **Frontend** `src/services/photoSync.ts`: `syncPhotos()` uploads every `status==='local'` photo
  with a blob — presign → **direct `fetch` PUT to S3** → confirm → `repo.photos.save({s3_key,
  status:'synced'})` (keeps the blob for instant local display; enqueues the sans-blob metadata so it
  reaches other devices). Best-effort per photo (failure stays 'local', retried next sync). Wired
  into `engine.syncNow()` **before** the outbox drain so photo metadata rides the same push.
  `resolvePhotoUrl()` returns a cached presigned GET for blob-less photos. `tasteApi.ts` gained
  `tastePresign`/`tasteConfirm`/`tastePhotoView`.
- **Display** `src/features/capture/usePhotoUrl.ts`: a hook returning the blob object-URL (revoked on
  cleanup) or the remote presigned URL; both thumbnail renderers (CaptureScreen `Thumb`,
  WinesScreen `ReviewThumb`) now use it.
- `npx tsc --noEmit` **clean**; `npx vitest run` **36/36 pass**. **Untested end-to-end** — needs the
  taste-api up with `UPLOADS_S3_BUCKET` set + the EB instance role's S3 perms (or local AWS creds).
  Without S3 the app is unaffected: photos stay local. **Next: P10** (provision EB env + S3 prefix /
  CloudFront / Route53 / DNS + runbooks) — the last phase.

**P10 infra prep ✅ BUILT 2026-06-28 (code + runbooks; AWS provisioning is Pete-run at deploy).** The
actual EB/S3/CloudFront/Route53 provisioning is outward-facing AWS work for Pete; this delivers the
turnkey config + step-by-step runbooks so the deploy is mechanical.
- **Prod FE wiring**: `packages/taste/.env.production` (`VITE_API_URL=https://api.auxein.co.nz/api/v1`,
  `VITE_TASTE_API_URL=https://taste-api.auxein.co.nz`). **Fixed** the dev auth-base default `/api`→
  **`/api/v1`** in `auth/publicAuth.ts` (the public-login path is `/api/v1/public/auth/login`; the
  Vite `/api`→:8000 proxy still covers it in dev).
- **Main API CORS**: added `https://taste.auxein.co.nz` + `http://localhost:5175` to
  `backend/main.py` `allowed_origins` (Taste's cross-origin login). Ships on the next main-API deploy.
- **Runbooks** (`docs/runbooks/`): `provision-taste-infra.md` (one-time: EB env `auxein-taste-prod`
  under app `auxein-taste-api`, env vars incl. shared `SECRET_KEY`/`DATABASE_URL` + `UPLOADS_S3_BUCKET=
  auxein-uploads`, RDS SG access, ACM on the ALB + Route53 for taste-api, then the SPA bucket
  `auxein-taste-web` + CloudFront OAC + us-east-1 ACM + Route53 for taste.auxein.co.nz; photos reuse
  `auxein-uploads` under `taste/<user_id>/...`, no new bucket/IAM since the default instance role
  already has `AuxeinUploadsRW`), `deploy-taste-api.md` (eb deploy from working dir + `alembic -c
  alembic_taste.ini upgrade head`), `deploy-taste.md` (build → `s3 sync` with immutable-asset vs
  no-cache HTML/SW split → CloudFront invalidation → end-to-end smoke).
- `npx tsc --noEmit` clean; backend `main.py` compiles. **Provisioning + end-to-end test pending
  (Pete runs the deploy next).** After provisioning, update `project_aws_infra` with the new bucket/
  CF id/EB env/ACM ARNs.

**P1–P10 code-complete.** Remaining is the live AWS provisioning + the full end-to-end deploy/test.

This doc is the source of truth; update the phase table + resume pointer as phases land.
