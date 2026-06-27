# Auxein Taste — Wide-Schema Mapping (v1 → full platform)

**Schema id:** `auxein.taste.v1` (the export envelope in `packages/taste/src/export/exportData.ts`)
**Status:** authored P7 (2026-06-27). Companion to `TASTE_BUILD_SPEC.md` Epic 9 (Story 9.2).

This doc maps **every v1 field** to its destination in the planned wide Auxein Taste
schema, or marks it explicitly **"v1-only / derive later"**. The contract (BUILD_SPEC
D1/D5): **no silent data loss** — the v1 export already carries both `raw` and
`canonical` for every reconciled value, so the migration is a projection, never a
reconstruction.

**Conventions**
- *Wide destination* names are planned tables/columns, not yet built.
- *Resolver* = a one-time backfill step that maps a v1 string to a wide FK.
- IDs are client-generated UUIDv4 in v1 and **carry through unchanged** (offline-valid PKs).
- Sync columns on every row — `id`, `created_at`, `updated_at`, `version`, `deleted` —
  map 1:1 to the wide rows and are omitted from the per-field tables below.

---

## Identity / ownership

| v1 | Wide destination | Notes |
|---|---|---|
| *(none — `user_id` is server-side)* | `taste.user_id` (int, = `public_users.id`) | v1 client is single-user + local; the Taste backend (P8) stamps `user_id` from the public JWT on sync. The PWA never stores it. See DEV_PLAN §5.5. Auth = reuse `public_users` SSO (overrides BUILD_SPEC D3 — no `taste.user` table). |

---

## `template`

| v1 field | Wide destination | Notes |
|---|---|---|
| `id` | `taste.templates.id` | UUID carries through. |
| `name` | `taste.templates.name` | |
| `kind` (`cms`/`custom`) | `taste.templates.kind` | |
| `is_builtin` | `taste.templates.is_builtin` | |
| `sections[]` (JSON) | `taste.templates.sections` (JSONB) | Template stays document-shaped; the grid is data, not relational rows. |
| `sections[].fields[].reconciliation_type` | same (in JSONB) | **Load-bearing** — drives the canonical projection of every note value. |
| `sections[].fields[].scale` / `score_system` | same (in JSONB) | The reconciliation scale defs travel with the template. |
| `version` | `taste.templates.version` | Notes pin the version they were captured against. |

---

## `event`

| v1 field | Wide destination | Notes |
|---|---|---|
| `id` | `taste.events.id` | |
| `name`, `date`, `location_text`, `host`, `theme`, `general_notes` | same columns | |
| `attendees[]` | `taste.events.attendees` (JSONB) | Free-text names in v1. **Derive later:** resolve to `participant`/`public_users` when multi-user lands. |
| `default_blind`, `default_template_id` | same columns | |

---

## `wine`

| v1 field | Wide destination | Notes |
|---|---|---|
| `id` | `taste.wines.id` | |
| `producer`, `label`, `vintage`, `abv`, `price`, `source` | same columns | `source` (`manual`/`scan`) is the Vivino-scan seam (v1 always `manual`). |
| `variety[]` | `taste.wines.variety` (JSONB) → **derive** `wine_variety` join to a `variety` ontology | Free strings in v1; resolver maps to canonical varietal rows later. |
| `geo_country` | → `geography.gi_id` via resolver | Discrete free text in v1. |
| `geo_region` | → `geography.gi_id` via resolver | |
| `geo_subregion_appellation` | → `geography.gi_id` via resolver | |
| `geo_vineyard` | → `geography.gi_id` via resolver (finest grain) | |
| `geo_ref_id` | **direct FK** → `taste.geo_regions.id` → `geography.gi_id` | Set when the user picked a node from the typeahead (non-lossy; null when free-typed). This is the clean migration path — `geo_ref_id` → `GeoRegion.gi_id` → Insights GI/boundary tables. Free `geo_*` text is the fallback resolver input. |

---

## `note`  *(the reconciliation spine)*

| v1 field | Wide destination | Notes |
|---|---|---|
| `id`, `wine_id`, `event_id`, `flight_id`, `flight_position` | same / FKs | |
| `template_id`, `template_version`, `template_snapshot` (JSON) | same | Snapshot is denormalised so old notes render unchanged; **kept verbatim** in the wide schema for audit. |
| `values[key].raw` + `raw_scale` | `note_value.raw` (+ `raw_scale` JSONB) — one row per field | **Never derived from canonical.** The raw entry is the source of truth. |
| `values[key].canonical` | `note_value.canonical` → `descriptor` / `structural` rows on the canonical ontology | Ordinal → `{band, position}`; score → `{normalised_score}`. The wide schema indexes these for cross-note analytics; v1 stores them inline. |
| `general_notes` | `taste.notes.general_notes` | |
| `tasted_at` | `taste.notes.tasted_at` | |
| `blind`, `revealed` | same | Display gate; data always stored. |
| `blind_conclusions` (JSON) | `taste.notes.blind_conclusions` (JSONB) → **derive** `blind_grade` rows | The pre-reveal guesses. The wide schema may persist computed grades (Epic 5) as first-class rows; v1 computes them client-side on the fly. |
| `score` | `taste.notes.score_raw` (+ normalised via `values`) | Convenience copy of the score field's raw value; the canonical normalised score lives in `values`. |
| `photos[]` (id refs) | `photo.note_id` FK (inverse) | |

---

## `flight`

| v1 field | Wide destination | Notes |
|---|---|---|
| `id`, `event_id`, `name`, `blind`, `general_notes` | same | |
| `note_ids[]` (ordered) | `taste.notes.flight_id` + `flight_position` | Order is mirrored onto the note; `note_ids[]` is the v1 ordering SoR. |

---

## `participant`  *(seam — not built in v1)*

Modelled in the spec but **not created in v1** (no realtime/invites). When multi-user
lands: `taste.participant { flight_id, user_id (= public_users.id), role }`. v1 notes
carry no `author_id` (single-user); the wide schema adds it defaulting to the owner.

---

## `photo`

| v1 field | Wide destination | Notes |
|---|---|---|
| `id`, `note_id`, `status`, `width`, `height`, `taken_at` | same | |
| `s3_key` | `taste.photos.s3_key` | Set at sync time (P9 presign). |
| `blob` (local IndexedDB) | **v1-only / not exported** unless `includePhotoData` | Local-first cache. Export with `includePhotoData:true` base64-encodes it into `data_base64` for a fully-local archive; otherwise photos travel as S3 keys. |

---

## `geo_regions`  *(reference data — not user-scoped, not synced)*

| v1 field | Wide destination | Notes |
|---|---|---|
| `id` (slug), `parent_id`, `level`, `kind`, `name`, `country_code`, `path`, `aliases[]` | `taste.geo_regions.*` (server mirror, P8) | Seed-shipped on both ends; versioned by a `meta` row. Not in the export envelope. |
| `gi_id` | **resolver target** → Insights `geography.gi_id` | Reserved in v1; populated when the GI/boundary resolver runs. |

---

## `outbox`, `meta`  *(client infra — not exported)*

`outbox` (pending sync mutations) and `meta` (kv: `last_pulled_at`, seed versions,
`default_template_id`, prefs) are **v1-only client mechanics**. They are not part of the
wide schema and are excluded from the export envelope. Prefs that should persist across
devices migrate to `taste.user.prefs` (JSONB) when accounts merge.

---

## Reconciliation audit (proves D1/D5)

For every `note.values[key]`:
- `raw` (+ `raw_scale`) is exported and read back **verbatim** — never reconstructed.
- `canonical` is the derived projection (ordinal band/position or normalised score).
- An importer can recompute `canonical` from `raw` + the pinned `template_snapshot`
  field def and assert equality — a zero-raw-loss check. The engine is
  `packages/taste/src/reconcile/` (pure, unit-tested).
