// Template abstraction (spec §3). A template is DATA, not code: the CMS grid is a
// seeded instance and the custom builder writes this exact shape.
// Only the type definitions live here in P2 (the notes row references them);
// the CMS seed + builder UI land in P3.

import type { ReconciliationType, ScoreSystem } from '@/reconcile';

export type FieldType =
  | 'single_select' // chip set, pick one
  | 'multi_select' // chip set, pick many
  | 'scale' // slider / stepped (e.g. intensity 1–5)
  | 'text_short' // single line
  | 'text_long' // free notes
  | 'tag_structured' // grouped descriptor tags (e.g. aroma families)
  | 'boolean'
  | 'number'
  | 'score'; // overall score (scale defined on field)

// A named cluster of descriptor options (e.g. "Citrus": Lemon, Lime…) for
// tag_structured fields. Selected values are stored flat as term strings.
export interface TemplateOptionGroup {
  label: string;
  options: string[];
}

export interface TemplateField {
  id: string; // uuid, stable across versions
  key: string; // machine key, snake_case (used in export mapping)
  label: string;
  type: FieldType;
  // EPIC 1 — every field declares how it reconciles (BUILD_SPEC 1.1 / D1/D2):
  //   ordinal → projected onto the CMS 5-band standard (uses `scale`, or the
  //             single_select `options` as ordered labels)
  //   score   → normalised onto 0..100 (uses `score_system`)
  //   none    → raw only (categorical selects, tags, text, booleans, numbers)
  reconciliation_type: ReconciliationType;
  options?: string[]; // single_select / multi_select
  groups?: TemplateOptionGroup[]; // tag_structured — grouped descriptor chips
  scale?: { min: number; max: number; step?: number; labels?: string[] };
  score_system?: ScoreSystem; // type 'score' — parker/ucdavis/stars/percent/custom
  required?: boolean;
  help?: string;
  // T4: on a text_short field, render the funnel control — up to 4 candidate
  // answers, one of which is committed. The field's VALUE stays the committed
  // string (grading reads it), and the rejected candidates persist alongside it
  // under `<key>__alts`, which is not a template field and so never reaches
  // blind_conclusions.
  funnel?: boolean;
  // T4: on a text_long field, a self-check shown as toggles under the box and
  // stored at `<key>__checklist`. Used for BLICC — the guidelines are explicit
  // that the acronym is a reminder and must never appear in the answer itself.
  checklist?: string[];
  // T3: on a text_long field, names the IMW lexicon bank(s) whose terms render
  // as a tap-to-insert chip rail under the box (see templates/lexicon.ts). Also
  // used as the `dimension` when a term the taster types is saved to taste.vocab,
  // so builtin and personal vocabulary share one namespace.
  lexicon_dimension?: string | string[];
}

export interface TemplateSection {
  id: string;
  label: string; // e.g. "Sight", "Nose", "Palate", "Conclusions"
  fields: TemplateField[];
  // Deductive sections (Initial/Final Conclusion) — only shown when tasting blind.
  // Hidden for a known/non-blind note (you already know the wine).
  blind_only?: boolean;
  // 'cross' packs an all-ordinal section into a compact two-column grid of
  // mini-sliders — the MW "tasting cross", meant to be read and filled in one
  // screen. Anything else (or absent) renders as the normal stacked list.
  layout?: 'cross';
}

// Denormalised copy pinned onto a note at capture time so the note renders
// unchanged even after its template is edited (editing bumps the template version).
export interface TemplateSnapshot {
  template_id: string;
  name: string;
  version: number;
  sections: TemplateSection[];
}
