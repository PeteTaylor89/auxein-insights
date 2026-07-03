// EPIC 5 / Story 5.1 — light tasting dashboard. Pure aggregations over notes +
// wines (client-side over Dexie). Score stats use the normalised 0–100 canonical
// projection (EPIC 1) so Parker / stars / percent sit on one axis.

export interface DashNote {
  wine_id: string;
  template_snapshot: { name: string };
  values: Record<string, { canonical?: unknown }>;
  tasted_at: string | null;
  blind: boolean;
  score: number | null;
}
export interface DashWine {
  variety: string[];
  geo_region: string;
  vintage: number | null;
}

export interface Count {
  key: string;
  count: number;
}
export interface ScoreStats {
  count: number;
  average: number | null; // mean normalised 0–100
  distribution: Count[]; // decile bands
}
export interface DashboardStats {
  total: number;
  thisMonth: number;
  blind: number;
  known: number;
  byTemplate: Count[];
  byVariety: Count[]; // per-grape participation (a blend contributes to each grape)
  byBlend: Count[]; // multi-grape wines, keyed by their composition ("Merlot / Cabernet")
  varietal: number; // notes whose wine is a single grape
  blendNotes: number; // notes whose wine is a blend (2+ grapes)
  byRegion: Count[];
  vintageSpread: { vintage: number; count: number }[];
  score: ScoreStats;
  overTime: Count[]; // by month, ascending
}

// The normalised 0–100 score for a note, read from the reconciliation envelope
// (the `score`-type field's canonical { normalised_score }). Null if none.
export function normalisedScore(note: DashNote): number | null {
  for (const v of Object.values(note.values ?? {})) {
    const c = v?.canonical as { normalised_score?: unknown } | undefined;
    if (c && typeof c.normalised_score === 'number') return c.normalised_score;
  }
  return null;
}

function tally(keys: string[]): Count[] {
  const map = new Map<string, number>();
  for (const k of keys) map.set(k, (map.get(k) ?? 0) + 1);
  return [...map.entries()].map(([key, count]) => ({ key, count }));
}

const byCountDesc = (a: Count, b: Count) => b.count - a.count || a.key.localeCompare(b.key);

function scoreBand(n: number): string {
  if (n >= 90) return '90–100'; // top band is inclusive of 100 (matches ALL_BANDS)
  const lo = Math.floor(n / 10) * 10;
  return `${lo}–${lo + 9}`;
}

const ALL_BANDS = ['0–9', '10–19', '20–29', '30–39', '40–49', '50–59', '60–69', '70–79', '80–89', '90–100'];

export function computeDashboard(
  notes: DashNote[],
  wines: Record<string, DashWine>,
  opts: { month?: string } = {},
): DashboardStats {
  const month = opts.month ?? '';
  const wineOf = (n: DashNote) => wines[n.wine_id];

  const varieties: string[] = [];
  const blends: string[] = [];
  const regions: string[] = [];
  const vintages: number[] = [];
  let varietal = 0;
  let blendNotes = 0;
  for (const n of notes) {
    const w = wineOf(n);
    if (!w) continue;
    const grapes = (w.variety ?? []).filter(Boolean);
    for (const v of grapes) varieties.push(v);
    // A blend (2+ grapes) is tagged as a blend: it still adds to each grape's
    // participation above, but is also counted once under its composition, so it
    // isn't silently read as a set of separate varietal wines.
    if (grapes.length >= 2) {
      blendNotes += 1;
      blends.push([...grapes].sort((a, b) => a.localeCompare(b)).join(' / '));
    } else if (grapes.length === 1) {
      varietal += 1;
    }
    if (w.geo_region) regions.push(w.geo_region);
    if (w.vintage != null) vintages.push(w.vintage);
  }

  const scores = notes.map(normalisedScore).filter((s): s is number => s != null);
  const scoreCounts = tally(scores.map(scoreBand));
  const distribution = ALL_BANDS.map((band) => ({ key: band, count: scoreCounts.find((c) => c.key === band)?.count ?? 0 }));

  return {
    total: notes.length,
    thisMonth: month ? notes.filter((n) => (n.tasted_at ?? '').slice(0, 7) === month).length : 0,
    blind: notes.filter((n) => n.blind).length,
    known: notes.filter((n) => !n.blind).length,
    byTemplate: tally(notes.map((n) => n.template_snapshot?.name || 'Untitled grid')).sort(byCountDesc),
    byVariety: tally(varieties).sort(byCountDesc),
    byBlend: tally(blends).sort(byCountDesc),
    varietal,
    blendNotes,
    byRegion: tally(regions).sort(byCountDesc),
    vintageSpread: tally(vintages.map(String))
      .map((c) => ({ vintage: Number(c.key), count: c.count }))
      .sort((a, b) => a.vintage - b.vintage),
    score: {
      count: scores.length,
      average: scores.length ? scores.reduce((s, x) => s + x, 0) / scores.length : null,
      distribution,
    },
    overTime: tally(notes.map((n) => (n.tasted_at ?? '').slice(0, 7)).filter(Boolean)).sort((a, b) => a.key.localeCompare(b.key)),
  };
}
