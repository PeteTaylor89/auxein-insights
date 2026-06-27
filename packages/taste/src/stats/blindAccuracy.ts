// EPIC 5 / Story 5.2 — blind-tasting accuracy grading. Pure + dependency-free so
// it's unit-testable (BUILD_SPEC DoD requires tests on the grading logic).
//
// Grades the five D6 dimensions independently — variety, country, region,
// vintage(±band), age-range — comparing the PRE-REVEAL guesses (note.blind_conclusions,
// frozen at reveal in R3) against the revealed truth (the wine). Only revealed
// blind notes are graded.

export type BlindDimension = 'variety' | 'country' | 'region' | 'vintage' | 'age_range';
export const BLIND_DIMENSIONS: BlindDimension[] = ['variety', 'country', 'region', 'vintage', 'age_range'];
export const DIMENSION_LABELS: Record<BlindDimension, string> = {
  variety: 'Variety',
  country: 'Country',
  region: 'Region',
  vintage: 'Vintage',
  age_range: 'Age',
};

// CMS age buckets (must match the CMS grid's ic_age_range option strings).
export const AGE_BUCKETS = ['1-3 yrs', '3-5 yrs', '5-10 yrs', '10 yrs+'] as const;

export interface BlindGradingOptions {
  vintageBandYears?: number; // ± tolerance on the vintage guess (default 2)
}

// Minimal structural shapes — real Note/Wine rows satisfy these (kept local so the
// module has no Dexie dependency).
export interface GradableNote {
  id: string;
  wine_id: string;
  blind: boolean;
  revealed: boolean;
  tasted_at: string | null;
  blind_conclusions: Record<string, unknown> | null;
  template_snapshot: { sections: { fields: { key: string; label: string }[] }[] };
}
export interface GradableWine {
  variety: string[];
  geo_country: string;
  geo_region: string;
  vintage: number | null;
}

export interface DimensionGrade {
  dimension: BlindDimension;
  guess: string | number | null;
  truth: string | number | null;
  correct: boolean | null; // null = not gradable (guess or truth missing)
}

export interface NoteGrade {
  noteId: string;
  tastedAt: string | null;
  varietyTruth: string | null; // first revealed variety, for the per-variety breakdown
  regionTruth: string | null;
  dimensions: DimensionGrade[];
  correctCount: number;
  gradableCount: number;
  accuracy: number | null; // 0..1 across gradable dims; null if none gradable
}

// ── matching helpers ─────────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function textEqual(a: string, b: string): boolean {
  return normalize(a) === normalize(b);
}

// Equality, or a containment match for multi-word names (e.g. "Pinot" ↔ "Pinot Noir").
function textMatch(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 3 && nb.includes(na)) return true;
  if (nb.length >= 3 && na.includes(nb)) return true;
  return false;
}

export function ageYears(vintage: number | null, tastedAt: string | null): number | null {
  if (vintage == null || !tastedAt) return null;
  const year = Number(tastedAt.slice(0, 4));
  if (!Number.isFinite(year)) return null;
  return Math.max(0, year - vintage);
}

export function ageBucket(years: number): (typeof AGE_BUCKETS)[number] {
  if (years < 3) return '1-3 yrs';
  if (years < 5) return '3-5 yrs';
  if (years < 10) return '5-10 yrs';
  return '10 yrs+';
}

// ── guess resolution ───────────────────────────────────────────────────────

const DIMENSION_PATTERNS: Record<BlindDimension, RegExp> = {
  variety: /variet|grape/i,
  country: /countr/i,
  region: /region|appellation|subregion/i,
  vintage: /vintage|year/i,
  // "age" but NOT the "age" inside "vintage" — else fc_vintage hijacks this dim.
  age_range: /(?<![a-z])age/i,
};

// Prefer a final-conclusion guess over an initial one over anything else.
function keyRank(key: string): number {
  if (/^fc_|final/i.test(key)) return 0;
  if (/^ic_|initial/i.test(key)) return 1;
  return 2;
}

// Pull the raw guess for a dimension from blind_conclusions, matching keys/labels
// against the dimension pattern. Only considers keys actually present in the frozen
// conclusions (blind_only fields), so non-conclusion fields (e.g. nose "Age
// assessment") can't leak in.
export function resolveGuess(note: GradableNote, dim: BlindDimension): string | number | null {
  const bc = note.blind_conclusions ?? {};
  const fieldByKey = new Map(
    note.template_snapshot.sections.flatMap((s) => s.fields).map((f) => [f.key, f]),
  );
  const pattern = DIMENSION_PATTERNS[dim];
  const entries = Object.entries(bc)
    .filter(([k]) => {
      const f = fieldByKey.get(k);
      return pattern.test(`${k} ${f?.label ?? ''}`);
    })
    .sort(([a], [b]) => keyRank(a) - keyRank(b));
  for (const [, v] of entries) {
    if (v !== undefined && v !== null && v !== '') return v as string | number;
  }
  return null;
}

// ── grading ──────────────────────────────────────────────────────────────

function gradeDimension(
  dim: BlindDimension,
  guess: string | number | null,
  wine: GradableWine,
  note: GradableNote,
  band: number,
): DimensionGrade {
  let truth: string | number | null = null;
  let correct: boolean | null = null;

  if (dim === 'variety') {
    const truths = (wine.variety ?? []).filter(Boolean);
    truth = truths.join(', ') || null;
    if (guess != null && truths.length) correct = truths.some((t) => textMatch(String(guess), t));
  } else if (dim === 'country') {
    truth = wine.geo_country || null;
    if (guess != null && truth) correct = textEqual(String(guess), truth);
  } else if (dim === 'region') {
    truth = wine.geo_region || null;
    if (guess != null && truth) correct = textMatch(String(guess), truth);
  } else if (dim === 'vintage') {
    truth = wine.vintage ?? null;
    if (guess != null && truth != null) {
      const g = Number(guess);
      correct = Number.isFinite(g) ? Math.abs(g - truth) <= band : null;
    }
  } else {
    // age_range
    const years = ageYears(wine.vintage, note.tasted_at);
    truth = years == null ? null : ageBucket(years);
    if (guess != null && truth) correct = normalize(String(guess)) === normalize(truth);
  }

  return { dimension: dim, guess, truth, correct };
}

export function gradeNote(note: GradableNote, wine: GradableWine, opts: BlindGradingOptions = {}): NoteGrade {
  const band = opts.vintageBandYears ?? 2;
  const dimensions = BLIND_DIMENSIONS.map((dim) => gradeDimension(dim, resolveGuess(note, dim), wine, note, band));
  const gradable = dimensions.filter((d) => d.correct !== null);
  const correctCount = gradable.filter((d) => d.correct).length;
  return {
    noteId: note.id,
    tastedAt: note.tasted_at,
    varietyTruth: (wine.variety ?? []).filter(Boolean)[0] ?? null,
    regionTruth: wine.geo_region || null,
    dimensions,
    correctCount,
    gradableCount: gradable.length,
    accuracy: gradable.length ? correctCount / gradable.length : null,
  };
}

// ── aggregate ──────────────────────────────────────────────────────────────

export interface DimensionStat {
  dimension: BlindDimension;
  correct: number;
  gradable: number;
  accuracy: number | null;
}
export interface GroupStat {
  key: string;
  correct: number;
  gradable: number;
  graded: number; // notes contributing
  accuracy: number | null;
}
export interface BlindStats {
  graded: number; // revealed blind notes graded
  correct: number;
  gradable: number;
  overallAccuracy: number | null; // pooled correct / gradable across all dims
  byDimension: DimensionStat[];
  trend: GroupStat[]; // by month, ascending
  byVariety: GroupStat[];
  byRegion: GroupStat[];
  grades: NoteGrade[];
}

function pooled(grades: NoteGrade[], pick: (g: NoteGrade) => string | null): GroupStat[] {
  const map = new Map<string, { correct: number; gradable: number; graded: number }>();
  for (const g of grades) {
    const key = pick(g);
    if (!key) continue;
    const acc = map.get(key) ?? { correct: 0, gradable: 0, graded: 0 };
    acc.correct += g.correctCount;
    acc.gradable += g.gradableCount;
    acc.graded += 1;
    map.set(key, acc);
  }
  return [...map.entries()].map(([key, v]) => ({
    key,
    ...v,
    accuracy: v.gradable ? v.correct / v.gradable : null,
  }));
}

// Grade every revealed blind note and roll up. `notes` may contain any notes; only
// revealed blind ones with a matching wine are graded.
export function computeBlindStats(
  notes: GradableNote[],
  wines: Record<string, GradableWine>,
  opts: BlindGradingOptions = {},
): BlindStats {
  const grades: NoteGrade[] = [];
  for (const n of notes) {
    if (!n.blind || !n.revealed) continue;
    const wine = wines[n.wine_id];
    if (!wine) continue;
    grades.push(gradeNote(n, wine, opts));
  }

  const byDimension: DimensionStat[] = BLIND_DIMENSIONS.map((dim) => {
    let correct = 0;
    let gradable = 0;
    for (const g of grades) {
      const d = g.dimensions.find((x) => x.dimension === dim)!;
      if (d.correct === null) continue;
      gradable += 1;
      if (d.correct) correct += 1;
    }
    return { dimension: dim, correct, gradable, accuracy: gradable ? correct / gradable : null };
  });

  const correct = grades.reduce((s, g) => s + g.correctCount, 0);
  const gradable = grades.reduce((s, g) => s + g.gradableCount, 0);

  return {
    graded: grades.length,
    correct,
    gradable,
    overallAccuracy: gradable ? correct / gradable : null,
    byDimension,
    trend: pooled(grades, (g) => (g.tastedAt ? g.tastedAt.slice(0, 7) : null)).sort((a, b) => a.key.localeCompare(b.key)),
    byVariety: pooled(grades, (g) => g.varietyTruth).sort((a, b) => (b.accuracy ?? -1) - (a.accuracy ?? -1)),
    byRegion: pooled(grades, (g) => g.regionTruth).sort((a, b) => (b.accuracy ?? -1) - (a.accuracy ?? -1)),
    grades,
  };
}
