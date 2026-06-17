// Template abstraction (spec §3). A template is DATA, not code: the CMS grid is a
// seeded instance and the custom builder writes this exact shape.
// Only the type definitions live here in P2 (the notes row references them);
// the CMS seed + builder UI land in P3.

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
  options?: string[]; // single_select / multi_select
  groups?: TemplateOptionGroup[]; // tag_structured — grouped descriptor chips
  scale?: { min: number; max: number; step?: number; labels?: string[] };
  required?: boolean;
  help?: string;
}

export interface TemplateSection {
  id: string;
  label: string; // e.g. "Sight", "Nose", "Palate", "Conclusions"
  fields: TemplateField[];
  // Deductive sections (Initial/Final Conclusion) — only shown when tasting blind.
  // Hidden for a known/non-blind note (you already know the wine).
  blind_only?: boolean;
}

// Denormalised copy pinned onto a note at capture time so the note renders
// unchanged even after its template is edited (editing bumps the template version).
export interface TemplateSnapshot {
  template_id: string;
  name: string;
  version: number;
  sections: TemplateSection[];
}
