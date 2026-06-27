// The field bank — the curated, ALWAYS-reconcilable set of tasting fields a custom
// grid can be assembled from. Derived from the CMS canon (cms-seed), grouped by
// section. Custom grids pick from this bank only (no free-text field creation);
// users may adjust a few constrained params (score system, numeric scale) that the
// reconciliation engine still validates.
import cmsSeed from './cms-seed.json';
import { uuidv4 } from '@/db';
import type { TemplateField, TemplateSection } from './types';

export interface BankCategory {
  label: string;
  fields: TemplateField[];
}

const SEED = cmsSeed as unknown as { sections: TemplateSection[] };

export const FIELD_BANK: BankCategory[] = SEED.sections.map((s) => ({
  label: s.label,
  fields: s.fields,
}));

// Clone a bank field for insertion into a draft: fresh id, key preserved (the
// machine key drives export mapping + reconciliation). Deep-cloned so edits to the
// instance never mutate the shared bank definition.
export function instantiateField(field: TemplateField): TemplateField {
  return structuredClone({ ...field, id: uuidv4() });
}

// Suggested section names (also the bank categories) — keeps section labelling
// off free-text where possible.
export const SECTION_SUGGESTIONS: string[] = FIELD_BANK.map((c) => c.label);
