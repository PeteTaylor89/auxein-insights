import { describe, it, expect } from 'vitest';
import {
  ageBucket,
  ageYears,
  computeBlindStats,
  gradeNote,
  resolveGuess,
  type GradableNote,
  type GradableWine,
} from './blindAccuracy';

// A CMS-shaped snapshot with the conclusion fields the grader looks for.
const SNAPSHOT = {
  sections: [
    {
      fields: [
        { key: 'ic_variety', label: 'Grape variety / blend' },
        { key: 'ic_countries', label: 'Possible countries' },
        { key: 'ic_age_range', label: 'Age range' },
      ],
    },
    {
      fields: [
        { key: 'fc_vintage', label: 'Vintage' },
        { key: 'fc_variety', label: 'Grape variety / blend' },
        { key: 'fc_country', label: 'Country of origin' },
        { key: 'fc_region', label: 'Region / appellation' },
      ],
    },
  ],
};

function note(conclusions: Record<string, unknown>, over: Partial<GradableNote> = {}): GradableNote {
  return {
    id: 'n1',
    wine_id: 'w1',
    blind: true,
    revealed: true,
    tasted_at: '2025-03-10',
    blind_conclusions: conclusions,
    template_snapshot: SNAPSHOT,
    ...over,
  };
}

const PINOT: GradableWine = {
  variety: ['Pinot Noir'],
  geo_country: 'New Zealand',
  geo_region: 'Central Otago',
  vintage: 2021,
};

describe('age helpers', () => {
  it('computes age and buckets to the CMS ranges', () => {
    expect(ageYears(2021, '2025-03-10')).toBe(4);
    expect(ageYears(null, '2025-01-01')).toBeNull();
    expect(ageBucket(2)).toBe('1-3 yrs');
    expect(ageBucket(4)).toBe('3-5 yrs');
    expect(ageBucket(8)).toBe('5-10 yrs');
    expect(ageBucket(15)).toBe('10 yrs+');
  });
});

describe('resolveGuess', () => {
  it('prefers the final-conclusion guess over the initial one', () => {
    const n = note({ ic_variety: 'Syrah', fc_variety: 'Pinot Noir' });
    expect(resolveGuess(n, 'variety')).toBe('Pinot Noir');
  });

  it('falls back to the initial guess when no final one', () => {
    const n = note({ ic_variety: 'Pinot Noir' });
    expect(resolveGuess(n, 'variety')).toBe('Pinot Noir');
  });

  it('returns null when the dimension was not guessed', () => {
    expect(resolveGuess(note({}), 'region')).toBeNull();
  });
});

describe('gradeNote — five dimensions', () => {
  it('scores a fully-correct blind call', () => {
    const n = note({
      fc_variety: 'Pinot Noir',
      fc_country: 'New Zealand',
      fc_region: 'Central Otago',
      fc_vintage: 2021,
      ic_age_range: '3-5 yrs',
    });
    const g = gradeNote(n, PINOT);
    expect(g.gradableCount).toBe(5);
    expect(g.correctCount).toBe(5);
    expect(g.accuracy).toBe(1);
  });

  it('matches variety by containment (Pinot ↔ Pinot Noir)', () => {
    const g = gradeNote(note({ fc_variety: 'Pinot' }), PINOT);
    expect(g.dimensions.find((d) => d.dimension === 'variety')!.correct).toBe(true);
  });

  it('applies the ±band vintage tolerance', () => {
    expect(gradeNote(note({ fc_vintage: 2023 }), PINOT).dimensions.find((d) => d.dimension === 'vintage')!.correct).toBe(true); // |2023-2021|=2
    expect(gradeNote(note({ fc_vintage: 2018 }), PINOT).dimensions.find((d) => d.dimension === 'vintage')!.correct).toBe(false); // 3 > 2
    expect(gradeNote(note({ fc_vintage: 2018 }), PINOT, { vintageBandYears: 5 }).dimensions.find((d) => d.dimension === 'vintage')!.correct).toBe(true);
  });

  it('marks a wrong country/region incorrect', () => {
    const g = gradeNote(note({ fc_country: 'France', fc_region: 'Burgundy' }), PINOT);
    expect(g.dimensions.find((d) => d.dimension === 'country')!.correct).toBe(false);
    expect(g.dimensions.find((d) => d.dimension === 'region')!.correct).toBe(false);
  });

  it('leaves a dimension ungradable when the guess is missing', () => {
    const g = gradeNote(note({ fc_variety: 'Pinot Noir' }), PINOT);
    expect(g.gradableCount).toBe(1);
    expect(g.dimensions.find((d) => d.dimension === 'country')!.correct).toBeNull();
  });

  it('leaves a dimension ungradable when the truth is missing', () => {
    const wineNoRegion = { ...PINOT, geo_region: '' };
    const g = gradeNote(note({ fc_region: 'Central Otago' }), wineNoRegion);
    expect(g.dimensions.find((d) => d.dimension === 'region')!.correct).toBeNull();
  });
});

describe('computeBlindStats', () => {
  const wines: Record<string, GradableWine> = { w1: PINOT, w2: { ...PINOT, variety: ['Riesling'], geo_region: 'Marlborough' } };

  const notes: (GradableNote & { wine_id: string })[] = [
    { ...note({ fc_variety: 'Pinot Noir', fc_country: 'New Zealand' }), id: 'a', wine_id: 'w1', tasted_at: '2025-01-05' },
    { ...note({ fc_variety: 'Chardonnay', fc_country: 'New Zealand' }), id: 'b', wine_id: 'w2', tasted_at: '2025-02-05' },
    // not graded: known note
    { ...note({ fc_variety: 'Pinot Noir' }), id: 'c', wine_id: 'w1', blind: false, tasted_at: '2025-02-06' },
    // not graded: blind but unrevealed
    { ...note({ fc_variety: 'Pinot Noir' }), id: 'd', wine_id: 'w1', revealed: false, tasted_at: '2025-02-07' },
  ];

  it('grades only revealed blind notes with a matching wine', () => {
    const s = computeBlindStats(notes, wines);
    expect(s.graded).toBe(2);
  });

  it('pools per-dimension accuracy', () => {
    const s = computeBlindStats(notes, wines);
    const variety = s.byDimension.find((d) => d.dimension === 'variety')!;
    expect(variety.gradable).toBe(2);
    expect(variety.correct).toBe(1); // a correct (Pinot Noir), b wrong (Chardonnay vs Riesling)
    expect(variety.accuracy).toBe(0.5);
    const country = s.byDimension.find((d) => d.dimension === 'country')!;
    expect(country.accuracy).toBe(1); // both NZ
  });

  it('breaks down by variety and by month', () => {
    const s = computeBlindStats(notes, wines);
    expect(s.byVariety.map((v) => v.key).sort()).toEqual(['Pinot Noir', 'Riesling']);
    expect(s.trend.map((t) => t.key)).toEqual(['2025-01', '2025-02']);
  });
});
