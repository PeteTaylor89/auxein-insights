// Storage row shapes for Dexie (and, later, the taste.* Postgres mirror).
// Spec §4 + dev-plan §5.3. Every synced row carries the BaseRow sync columns.
import type { ReconciledValue } from '@/reconcile';
import type { TemplateSection, TemplateSnapshot } from '@/templates/types';

// Common columns on every user-scoped, sync-tracked row.
export interface BaseRow {
  id: string; // client-generated UUIDv4
  created_at: string; // ISO
  updated_at: string; // ISO — drives last-write-wins
  version: number; // bumped on every write
  deleted: boolean; // soft delete (sync correctness)
}

export type TemplateKind = 'cms' | 'custom';

// Glass colour/type for the flight rack — the observed pour, set from the rack
// (visible even when blind). Useful tasting metadata; feeds stats later.
export type GlassColor = 'red' | 'white' | 'rose' | 'sparkling';

export interface Template extends BaseRow {
  name: string;
  kind: TemplateKind;
  sections: TemplateSection[];
  is_builtin: boolean; // CMS = true, locked from deletion
}

// `event` collides with the DOM global; store it as TasteEvent.
export interface TasteEvent extends BaseRow {
  name: string;
  date: string | null;
  location_text: string;
  host: string;
  attendees: string[];
  theme: string;
  general_notes: string;
  default_blind: boolean;
  default_template_id: string | null;
}

export interface Wine extends BaseRow {
  producer: string;
  label: string;
  vintage: number | null;
  variety: string[];
  // Geo as discrete fields (spec §4) — free entry always allowed.
  geo_country: string;
  geo_region: string;
  geo_subregion_appellation: string;
  geo_vineyard: string;
  // Optional link to a canonical geoRegions node when picked from the typeahead
  // (dev-plan §4.5). Null when free-typed. Non-lossy path to the wide schema.
  geo_ref_id: string | null;
  price: number | null;
  source: string; // provenance
  abv: number | null;
}

export interface Note extends BaseRow {
  wine_id: string;
  event_id: string | null;
  template_id: string;
  template_version: number; // pinned version the note was captured against
  template_snapshot: TemplateSnapshot; // denormalised so old notes render unchanged
  // Non-destructive reconciliation envelope per field (EPIC 1): { raw, raw_scale?, canonical? }.
  // Keyed by TemplateField.key. Raw is always read back verbatim; canonical is derived.
  values: Record<string, ReconciledValue>;
  general_notes: string; // free text — thoughts, winemaker notes, context (not template-driven)
  tasted_at: string | null; // ISO date the wine was tasted (defaults today; editable for backdated notes)
  blind: boolean;
  revealed: boolean; // display gate only — data is always stored
  // Pre-reveal deductive guesses (raw values of blind_only-section fields), frozen
  // at reveal time so Epic 5 can grade them against the revealed truth. Null when known.
  blind_conclusions: Record<string, unknown> | null;
  score: number | null;
  flight_id: string | null;
  flight_position: number | null;
  glass_color: GlassColor | null; // observed pour colour/type (flight rack); null if unset
  photos: string[]; // Photo id refs
}

export interface Flight extends BaseRow {
  event_id: string | null;
  name: string;
  blind: boolean;
  general_notes: string; // flight-level notes captured during the tasting
  note_ids: string[]; // ordered
}

export type PhotoStatus = 'local' | 'uploading' | 'synced';

export interface Photo extends BaseRow {
  note_id: string;
  blob?: Blob; // local IndexedDB blob — present until (optionally) evicted post-sync
  s3_key: string | null; // null until synced
  status: PhotoStatus;
  width: number | null;
  height: number | null;
  taken_at: string | null;
}

// Reference data (dev-plan §4.5): one self-referential table, NOT user-scoped,
// NOT sync-tracked (seed-shipped on both ends, versioned via a `meta` row).
export interface GeoRegion {
  id: string; // stable slug, e.g. "nz-marlborough-wairau-valley"
  parent_id: string | null; // self-FK; null at country level
  level: number; // 0 country · 1 region · 2 subregion/appellation · 3 vineyard
  kind: string; // human label for the level
  name: string;
  country_code: string; // ISO-3166, denormalised onto every node
  path: string; // materialised breadcrumb "New Zealand › Marlborough › Wairau Valley"
  aliases?: string[]; // typeahead synonyms
  gi_id?: string | null; // reserved — resolver target into the wide schema
}

// Generic key/value store: last_pulled_at, seed versions, default template, prefs.
export interface Meta {
  key: string;
  value: unknown;
}

// Outbox: pending mutations to push at sync time (P8). Mutation shape per spec §6.
export type OutboxOp = 'upsert' | 'delete';
export type SyncEntity = 'template' | 'event' | 'wine' | 'note' | 'flight' | 'photo';

export interface OutboxItem {
  seq?: number; // auto-increment PK, preserves push order
  entity: SyncEntity;
  op: OutboxOp;
  id: string; // entity id
  payload: unknown; // row snapshot for upsert, null for delete
  updated_at: string;
  version: number;
}
