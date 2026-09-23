import { describe, expect, it } from 'vitest';
import { buildCompareRows } from './CompareView';
import type { ComparableNote } from './CompareView';

const ordinal = (key: string, label: string) => ({
  id: key, key, label, type: 'single_select' as const, reconciliation_type: 'ordinal' as const,
  options: ['Low', 'Med-', 'Medium', 'Med+', 'High'],
});

const prose = (key: string, label: string) => ({
  id: key, key, label, type: 'text_long' as const, reconciliation_type: 'none' as const,
});

const note = (
  fields: ReturnType<typeof ordinal | typeof prose>[],
  values: Record<string, { raw: unknown; canonical?: { band: number; position: number } }>,
): ComparableNote => ({
  template_snapshot: { sections: [{ fields }] },
  values: values as ComparableNote['values'],
});

const ord = (raw: string, position: number) => ({ raw, canonical: { band: 0, position } });

describe('buildCompareRows', () => {
  const fields = [ordinal('acid', 'Acidity'), ordinal('tannin', 'Tannin'), prose('nose', 'Nose')];

  it('needs at least two notes', () => {
    expect(buildCompareRows([])).toEqual([]);
    expect(buildCompareRows([note(fields, { acid: ord('High', 1) })])).toEqual([]);
  });

  it('compares only ordinal fields — prose is not commensurable', () => {
    const rows = buildCompareRows([
      note(fields, { acid: ord('High', 1), nose: { raw: 'lifted' } }),
      note(fields, { acid: ord('Low', 0), nose: { raw: 'muted' } }),
    ]);
    expect(rows.map((r) => r.key)).toEqual(['acid']);
  });

  it('computes spread across the selected notes', () => {
    const rows = buildCompareRows([
      note(fields, { acid: ord('High', 1), tannin: ord('Medium', 0.5) }),
      note(fields, { acid: ord('Low', 0), tannin: ord('Medium', 0.5) }),
    ]);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.acid.spread).toBeCloseTo(1);
    expect(byKey.tannin.spread).toBe(0); // identical -> not worth remarking on
  });

  it('drops a row no one answered, but keeps a partially answered one', () => {
    const rows = buildCompareRows([
      note(fields, { acid: ord('High', 1) }),
      note(fields, {}),
    ]);
    expect(rows.map((r) => r.key)).toEqual(['acid']);
    expect(rows[0].cells[1].raw).toBe('—');
    // one known value cannot form a spread
    expect(rows[0].spread).toBe(0);
  });

  it('keeps the first note field order, then adds fields only later notes have', () => {
    const a = [ordinal('acid', 'Acidity')];
    const b = [ordinal('oak', 'Oak'), ordinal('acid', 'Acidity')];
    const rows = buildCompareRows([
      note(a, { acid: ord('High', 1) }),
      note(b, { oak: ord('Marked', 0.75), acid: ord('Low', 0) }),
    ]);
    expect(rows.map((r) => r.key)).toEqual(['acid', 'oak']);
  });

  it('handles three notes', () => {
    const rows = buildCompareRows([
      note(fields, { acid: ord('High', 1) }),
      note(fields, { acid: ord('Medium', 0.5) }),
      note(fields, { acid: ord('Low', 0) }),
    ]);
    expect(rows[0].cells).toHaveLength(3);
    expect(rows[0].spread).toBeCloseTo(1);
  });

  it('renders array and boolean raws readably', () => {
    const f = [ordinal('a', 'A')];
    const rows = buildCompareRows([
      note(f, { a: { raw: ['x', 'y'], canonical: { band: 0, position: 0.2 } } }),
      note(f, { a: { raw: true, canonical: { band: 0, position: 0.8 } } }),
    ]);
    expect(rows[0].cells[0].raw).toBe('x, y');
    expect(rows[0].cells[1].raw).toBe('Yes');
  });

  it('survives a note with no snapshot or values', () => {
    const rows = buildCompareRows([
      note(fields, { acid: ord('High', 1) }),
      { template_snapshot: null, values: null },
    ]);
    expect(rows.map((r) => r.key)).toEqual(['acid']);
    expect(rows[0].cells[1].raw).toBe('—');
  });
});
