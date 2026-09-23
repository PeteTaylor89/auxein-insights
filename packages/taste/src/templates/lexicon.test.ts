import { describe, expect, it } from 'vitest';
import { LEXICON, banksFor, insertTerm } from './lexicon';

describe('banksFor', () => {
  it('accepts a single key or a list, in order', () => {
    expect(banksFor('quality').map((b) => b.key)).toEqual(['quality']);
    expect(banksFor(['structure', 'suggests']).map((b) => b.key)).toEqual(['structure', 'suggests']);
  });

  it('is empty for undefined, and drops unknown keys rather than throwing', () => {
    expect(banksFor(undefined)).toEqual([]);
    expect(banksFor(['nope', 'oak']).map((b) => b.key)).toEqual(['oak']);
  });
});

describe('lexicon data', () => {
  it('has unique bank keys and no empty/duplicated terms', () => {
    const keys = LEXICON.map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const bank of LEXICON) {
      expect(bank.terms.length).toBeGreaterThan(0);
      expect(bank.terms.every((t) => t.trim() === t && t.length > 0)).toBe(true);
      expect(new Set(bank.terms).size).toBe(bank.terms.length);
    }
  });

  it('covers every dimension the MW template asks for', () => {
    // Keep in step with mw-seed.json's lexicon_dimension values.
    for (const key of ['colour', 'nose', 'fruit', 'texture', 'tannin', 'structure',
      'quality', 'maturity', 'suggests', 'proves', 'positives']) {
      expect(banksFor(key), `missing bank: ${key}`).toHaveLength(1);
    }
  });
});

describe('insertTerm', () => {
  it('inserts into an empty field with no leading space', () => {
    expect(insertTerm('', 0, 0, 'ripe')).toEqual({ text: 'ripe', caret: 4 });
  });

  it('adds a separating space when appending after a word', () => {
    const r = insertTerm('deeply', 6, 6, 'ripe');
    expect(r.text).toBe('deeply ripe');
    expect(r.caret).toBe(11);
  });

  it('does not double a space that is already there', () => {
    expect(insertTerm('deeply ', 7, 7, 'ripe').text).toBe('deeply ripe');
  });

  it('splices mid-sentence and spaces both sides', () => {
    // caret between "very " and "concentrated"
    const r = insertTerm('very concentrated', 5, 5, 'ripe');
    expect(r.text).toBe('very ripe concentrated');
    expect(r.caret).toBe(9);
  });

  it('does not push a space in front of punctuation', () => {
    const r = insertTerm('the wine is , with grip', 12, 12, 'racy');
    expect(r.text).toBe('the wine is racy, with grip');
  });

  it('replaces a selection rather than duplicating it', () => {
    // "dull" selected (chars 10-14)
    const r = insertTerm('the nose is dull', 12, 16, 'fragrant');
    expect(r.text).toBe('the nose is fragrant');
    expect(r.caret).toBe(20);
  });

  it('handles a multi-word term after an opening bracket', () => {
    const r = insertTerm('structure (', 11, 11, 'low intensity');
    expect(r.text).toBe('structure (low intensity');
  });

  it('leaves the caret ready to keep typing', () => {
    const r = insertTerm('ripe', 4, 4, 'opulent');
    expect(r.text.slice(0, r.caret)).toBe('ripe opulent');
  });
});
