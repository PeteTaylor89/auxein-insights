import { uuidv4 } from '@/db';
import type { OrdinalScale, ReconciledValue, ReconciliationType, ScoreSystem } from '@/reconcile';
import { SCORE_SYSTEMS, buildRawValue, reconcile } from '@/reconcile';
import type { FieldType, TemplateField, TemplateSection } from './types';

export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'single_select', label: 'Single select' },
  { value: 'multi_select', label: 'Multi select' },
  { value: 'scale', label: 'Scale' },
  { value: 'score', label: 'Score' },
  { value: 'text_short', label: 'Short text' },
  { value: 'text_long', label: 'Long text' },
  { value: 'tag_structured', label: 'Tags' },
  { value: 'boolean', label: 'Yes / No' },
  { value: 'number', label: 'Number' },
];

// EPIC 1 — the three reconciliation paths (BUILD_SPEC D2). The builder forces
// this choice per field; this list drives its selector.
export const RECON_TYPES: { value: ReconciliationType; label: string; hint: string }[] = [
  { value: 'ordinal', label: 'Ordinal → CMS band', hint: 'Projected onto Low…High (acid, tannin, body…)' },
  { value: 'score', label: 'Score → 0–100', hint: 'Normalised onto a common axis (Parker, stars…)' },
  { value: 'none', label: 'None (raw only)', hint: 'Categorical, tags, free text — stored as entered' },
];

// Selectable score systems for a `score` field (custom = use the min/max below).
export const SCORE_SYSTEM_OPTIONS: { value: string; label: string }[] = [
  { value: 'parker', label: 'Parker (50–100)' },
  { value: 'ucdavis', label: 'UC Davis (0–20)' },
  { value: 'stars', label: 'Stars (0–5)' },
  { value: 'percent', label: 'Percent (0–100)' },
  { value: 'custom', label: 'Custom (min/max)' },
];

// Flat option list (chips, pick one or many).
export const hasOptions = (t: FieldType): boolean => t === 'single_select' || t === 'multi_select';

// Grouped descriptor options.
export const hasGroups = (t: FieldType): boolean => t === 'tag_structured';

export const hasScale = (t: FieldType): boolean => t === 'scale' || t === 'score';

// Default reconciliation_type suggested by field type (BUILD_SPEC 2.2). Score
// fields are scores; numeric scales are ordinal; a single_select COULD be ordinal
// (the builder lets the user flip it) but defaults to raw since most are
// categorical. Everything else is raw-only.
export function defaultReconciliation(type: FieldType): ReconciliationType {
  if (type === 'score') return 'score';
  if (type === 'scale') return 'ordinal';
  return 'none';
}

// Default score system for a freshly-typed `score` field.
export function defaultScoreSystem(): ScoreSystem {
  return { system: 'parker', ...SCORE_SYSTEMS.parker };
}

// Resolve the OrdinalScale a reconciliation should band against. A numeric `scale`
// wins; otherwise a single_select's `options` ARE the ordered labels (kept as the
// single source of truth so user-added options via "+ add" can't drift from a
// duplicated label list). Returns null when the field can't form an ordinal scale.
export function ordinalScaleForField(field: TemplateField): OrdinalScale | null {
  if (field.scale && field.scale.max > field.scale.min) return field.scale;
  if (field.type === 'single_select' && field.options && field.options.length >= 2) {
    return { min: 1, max: field.options.length, labels: field.options };
  }
  return null;
}

// Resolve the score system a `score` reconciliation should normalise against.
export function scoreSystemForField(field: TemplateField): ScoreSystem | null {
  if (field.score_system) return field.score_system;
  if (field.scale && field.scale.max > field.scale.min) {
    return { system: 'custom', min: field.scale.min, max: field.scale.max };
  }
  return null;
}

// Validation (BUILD_SPEC 1.1): reject an ordinal/score field that lacks the scale
// definition it needs to reconcile. Returns an error string, or null when valid.
export function fieldReconError(field: TemplateField): string | null {
  if (field.reconciliation_type === 'ordinal' && !ordinalScaleForField(field)) {
    return `"${field.label || field.key}" is ordinal but has no scale — give it a numeric min/max or 2+ select options.`;
  }
  if (field.reconciliation_type === 'score' && !scoreSystemForField(field)) {
    return `"${field.label || field.key}" is a score but has no system — pick a score system or set min/max.`;
  }
  return null;
}

// snake_case machine key from a human label (used in export mapping).
export function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function newField(type: FieldType = 'single_select'): TemplateField {
  const field: TemplateField = { id: uuidv4(), key: '', label: '', type, reconciliation_type: defaultReconciliation(type) };
  if (hasOptions(type)) field.options = [];
  if (hasGroups(type)) field.groups = [];
  if (hasScale(type)) field.scale = type === 'score' ? { min: 50, max: 100, step: 1 } : { min: 1, max: 5, step: 1 };
  if (type === 'score') field.score_system = defaultScoreSystem();
  return field;
}

export function newSection(): TemplateSection {
  return { id: uuidv4(), label: '', fields: [] };
}

// Project a note's raw editing values onto the non-destructive reconciliation
// envelope (EPIC 1 / R3). Capture binds widgets to raw values; this runs once at
// save time, classifying each field via its reconciliation_type + scale/system.
// Defensive: an ordinal/score field that somehow lacks its scale def falls back to
// raw-only rather than throwing (validation should have caught it at build time).
export function reconcileNoteValues(
  sections: TemplateSection[],
  raw: Record<string, unknown>,
): Record<string, ReconciledValue> {
  const byKey = new Map(sections.flatMap((s) => s.fields).map((f) => [f.key, f]));
  const out: Record<string, ReconciledValue> = {};
  for (const [key, value] of Object.entries(raw)) {
    const field = byKey.get(key);
    if (!field || field.reconciliation_type === 'none') {
      out[key] = buildRawValue(value);
      continue;
    }
    try {
      if (field.reconciliation_type === 'ordinal') {
        const scale = ordinalScaleForField(field);
        out[key] = scale ? reconcile('ordinal', value, { scale }) : buildRawValue(value);
      } else {
        const score_system = scoreSystemForField(field);
        out[key] = score_system ? reconcile('score', value, { score_system }) : buildRawValue(value);
      }
    } catch {
      out[key] = buildRawValue(value);
    }
  }
  return out;
}
