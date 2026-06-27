import { describe, it, expect } from 'vitest';
import {
  CMS_BANDS,
  bandLabel,
  buildOrdinalValue,
  buildRawValue,
  buildScoreValue,
  isCmsLabels,
  reconcile,
  renderInScale,
  toCanonicalOrdinal,
  toNormalisedScore,
  type OrdinalScale,
} from './index';

const CMS_SCALE: OrdinalScale = { min: 1, max: 5, labels: [...CMS_BANDS] };
const TEN_SCALE: OrdinalScale = { min: 1, max: 10, step: 1 };

describe('toCanonicalOrdinal — numeric scales (Story 1.2)', () => {
  it('maps the spec example: 8 on a 1–10 scale → Med+ (band 3)', () => {
    const c = toCanonicalOrdinal(8, TEN_SCALE);
    expect(c.band).toBe(3); // Med+
    expect(c.position).toBeCloseTo(0.7778, 3);
    expect(bandLabel(c.band)).toBe('Med+');
  });

  it('puts the scale minimum in the bottom band', () => {
    const c = toCanonicalOrdinal(1, TEN_SCALE);
    expect(c.band).toBe(0);
    expect(c.position).toBe(0);
  });

  it('puts the scale maximum in the top band (no phantom 6th band)', () => {
    const c = toCanonicalOrdinal(10, TEN_SCALE);
    expect(c.band).toBe(4); // High, not floor(5)
    expect(c.position).toBe(1);
  });

  it('clamps out-of-range values into 0..4', () => {
    expect(toCanonicalOrdinal(99, TEN_SCALE).band).toBe(4);
    expect(toCanonicalOrdinal(-5, TEN_SCALE).band).toBe(0);
  });

  it('handles a degenerate zero-span scale without dividing by zero', () => {
    const c = toCanonicalOrdinal(5, { min: 5, max: 5 });
    expect(c.position).toBe(0);
    expect(c.band).toBe(0);
  });
});

describe('toCanonicalOrdinal — CMS labelled scales (Story 1.2)', () => {
  it('maps CMS labels 1:1 by index with no banding drift', () => {
    expect(toCanonicalOrdinal('Low', CMS_SCALE)).toEqual({ band: 0, position: 0 });
    expect(toCanonicalOrdinal('Med-', CMS_SCALE)).toEqual({ band: 1, position: 0.25 });
    expect(toCanonicalOrdinal('Medium', CMS_SCALE)).toEqual({ band: 2, position: 0.5 });
    expect(toCanonicalOrdinal('Med+', CMS_SCALE)).toEqual({ band: 3, position: 0.75 });
    expect(toCanonicalOrdinal('High', CMS_SCALE)).toEqual({ band: 4, position: 1 });
  });

  it('maps a non-CMS labelled scale by normalised index position', () => {
    const threePoint: OrdinalScale = { min: 1, max: 3, labels: ['Delicate', 'Moderate', 'Powerful'] };
    expect(toCanonicalOrdinal('Delicate', threePoint).position).toBe(0);
    expect(toCanonicalOrdinal('Moderate', threePoint).position).toBe(0.5);
    expect(toCanonicalOrdinal('Powerful', threePoint).band).toBe(4);
  });

  it('coerces a numeric-string label that is not in the label list', () => {
    expect(toCanonicalOrdinal('8', TEN_SCALE).band).toBe(3);
  });

  it('throws on an unknown non-numeric label', () => {
    expect(() => toCanonicalOrdinal('Nonsense', CMS_SCALE)).toThrow();
  });
});

describe('isCmsLabels / bandLabel', () => {
  it('detects the exact CMS 5-band label set only', () => {
    expect(isCmsLabels([...CMS_BANDS])).toBe(true);
    expect(isCmsLabels(['Low', 'Medium', 'High'])).toBe(false);
    expect(isCmsLabels(undefined)).toBe(false);
  });

  it('renders every band label and clamps out-of-range bands', () => {
    expect(CMS_BANDS.map((_, i) => bandLabel(i))).toEqual([...CMS_BANDS]);
    expect(bandLabel(99)).toBe('High');
    expect(bandLabel(-1)).toBe('Low');
  });
});

describe('toNormalisedScore (Story 1.3)', () => {
  it('normalises the built-in systems onto 0..100', () => {
    expect(toNormalisedScore(50, 'parker')).toBe(0);
    expect(toNormalisedScore(100, 'parker')).toBe(100);
    expect(toNormalisedScore(95, 'parker')).toBe(90); // (95-50)/50
    expect(toNormalisedScore(20, 'ucdavis')).toBe(100);
    expect(toNormalisedScore(4, 'stars')).toBe(80);
    expect(toNormalisedScore(73, 'percent')).toBe(73);
  });

  it('accepts an explicit {min,max} system and clamps out-of-range', () => {
    expect(toNormalisedScore(15, { system: 'x', min: 0, max: 30 })).toBe(50);
    expect(toNormalisedScore(200, 'parker')).toBe(100);
    expect(toNormalisedScore(0, 'parker')).toBe(0);
  });

  it('throws on an unknown named system', () => {
    expect(() => toNormalisedScore(5, 'nope')).toThrow();
  });
});

describe('renderInScale (Story 1.4)', () => {
  it('renders a canonical projection into the CMS labels', () => {
    const c = toCanonicalOrdinal(8, TEN_SCALE); // band 3
    expect(renderInScale(c, CMS_SCALE)).toBe('Med+');
  });

  it('renders a CMS entry back onto a numeric 1–5 grid', () => {
    const c = toCanonicalOrdinal('Med+', CMS_SCALE); // position 0.75
    expect(renderInScale(c, { min: 1, max: 5, step: 1 })).toBe(4);
  });

  it('snaps to the nearest step and stays within bounds', () => {
    const c = toCanonicalOrdinal('High', CMS_SCALE); // position 1
    expect(renderInScale(c, { min: 0, max: 10, step: 2 })).toBe(10);
    const low = toCanonicalOrdinal('Low', CMS_SCALE); // position 0
    expect(renderInScale(low, { min: 0, max: 10, step: 2 })).toBe(0);
  });
});

describe('non-destructive constructors (Story 1.5)', () => {
  it('ordinal value keeps raw verbatim alongside canonical', () => {
    const v = buildOrdinalValue('Med+', CMS_SCALE);
    expect(v.raw).toBe('Med+'); // read back verbatim, never reconstructed
    expect(v.raw_scale).toEqual(CMS_SCALE);
    expect(v.canonical).toEqual({ band: 3, position: 0.75 });
  });

  it('score value keeps raw + system alongside the normalised projection', () => {
    const v = buildScoreValue(95, 'parker');
    expect(v.raw).toBe(95);
    expect(v.raw_scale).toEqual({ system: 'parker', min: 50, max: 100 });
    expect(v.canonical).toEqual({ normalised_score: 90 });
  });

  it('none value is raw only — no canonical projection', () => {
    const v = buildRawValue(['Lemon', 'Lime']);
    expect(v.raw).toEqual(['Lemon', 'Lime']);
    expect(v.raw_scale).toBeUndefined();
    expect(v.canonical).toBeUndefined();
  });
});

describe('reconcile() dispatch', () => {
  it('routes by reconciliation_type', () => {
    expect(reconcile('ordinal', 'Medium', { scale: CMS_SCALE }).canonical).toEqual({ band: 2, position: 0.5 });
    expect(reconcile('score', 90, { score_system: 'parker' }).canonical).toEqual({ normalised_score: 80 });
    expect(reconcile('none', 'free text').canonical).toBeUndefined();
  });

  it('stores an unanswered ordinal/score as raw only (no spurious projection)', () => {
    expect(reconcile('ordinal', '', { scale: CMS_SCALE })).toEqual({ raw: '' });
    expect(reconcile('score', null, { score_system: 'parker' })).toEqual({ raw: null });
  });

  it('demands a scale / score_system for the projected types', () => {
    expect(() => reconcile('ordinal', 'Medium')).toThrow();
    expect(() => reconcile('score', 90)).toThrow();
  });
});
