import { uuidv4 } from '@/db';
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

// Flat option list (chips, pick one or many).
export const hasOptions = (t: FieldType): boolean => t === 'single_select' || t === 'multi_select';

// Grouped descriptor options.
export const hasGroups = (t: FieldType): boolean => t === 'tag_structured';

export const hasScale = (t: FieldType): boolean => t === 'scale' || t === 'score';

// snake_case machine key from a human label (used in export mapping).
export function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function newField(type: FieldType = 'single_select'): TemplateField {
  const field: TemplateField = { id: uuidv4(), key: '', label: '', type };
  if (hasOptions(type)) field.options = [];
  if (hasGroups(type)) field.groups = [];
  if (hasScale(type)) field.scale = type === 'score' ? { min: 50, max: 100, step: 1 } : { min: 1, max: 5, step: 1 };
  return field;
}

export function newSection(): TemplateSection {
  return { id: uuidv4(), label: '', fields: [] };
}
