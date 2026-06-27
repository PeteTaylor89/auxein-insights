// EPIC 1 — Reconciliation Engine (BUILD_SPEC §Epic 1). The architectural spine:
// every reconciled value is stored as { raw, raw_scale?, canonical? } and the raw
// is NEVER reconstructed from the canonical projection. Pure, dependency-free
// (imports nothing — must stay unit-testable without Dexie/DOM).
//
// Three code paths, one engine (BUILD_SPEC D2):
//   ordinal → CMS 5-band + 0..1 position
//   score   → store-as-entered + normalised 0..100
//   none    → raw only (categorical / tags / free text)

// ── Canonical reference standards ───────────────────────────────────────────

// The fixed CMS 5-band ordinal scale. Index 0..4 ↔ label.
export const CMS_BANDS = ['Low', 'Med-', 'Medium', 'Med+', 'High'] as const;
export type CmsBandLabel = (typeof CMS_BANDS)[number];

// Built-in score systems. Extensible: callers may pass an explicit {min,max}.
export const SCORE_SYSTEMS: Record<string, { min: number; max: number }> = {
  parker: { min: 50, max: 100 },
  ucdavis: { min: 0, max: 20 },
  stars: { min: 0, max: 5 },
  percent: { min: 0, max: 100 },
};

// ── Types ───────────────────────────────────────────────────────────────────

export type ReconciliationType = 'ordinal' | 'score' | 'none';

// An ordinal scale definition carried by an `ordinal` field (BUILD_SPEC 1.1).
// Labelled scales (e.g. the CMS single-selects) store the label as `raw`; numeric
// scales (e.g. a custom 1–10 acidity) store the number.
export interface OrdinalScale {
  min: number;
  max: number;
  step?: number;
  labels?: string[];
}

// A score system carried by a `score` field (BUILD_SPEC 1.1 / 1.3).
export interface ScoreSystem {
  system: string;
  min: number;
  max: number;
}

// Canonical ordinal projection: band 0..4 + normalised 0..1 position within source.
export interface CanonicalOrdinal {
  band: number; // 0..4
  position: number; // 0..1, the normalised location of the entry in its source scale
}

// Canonical score projection.
export interface CanonicalScore {
  normalised_score: number; // 0..100
}

// The non-destructive storage envelope for a single note value (BUILD_SPEC 1.5).
// `none` values carry raw only; ordinal/score also carry raw_scale + canonical.
export interface ReconciledValue<T = unknown> {
  raw: T;
  raw_scale?: OrdinalScale | ScoreSystem;
  canonical?: CanonicalOrdinal | CanonicalScore;
}

// ── Small helpers ─────────────────────────────────────────────────────────

function clampBand(b: number): number {
  return Math.max(0, Math.min(4, b));
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// position 0..1 → band 0..4. value at the top of the scale (position 1) lands in
// the top band, not a phantom 6th band (floor(1*5)=5 → clamped to 4).
function positionToBand(position: number): number {
  return clampBand(Math.floor(position * 5));
}

// True when a labelled scale already IS the CMS 5-band scale — map 1:1 by index,
// no banding drift (BUILD_SPEC 1.2).
export function isCmsLabels(labels: string[] | undefined): boolean {
  return !!labels && labels.length === 5 && labels.every((l, i) => l === CMS_BANDS[i]);
}

// ── Story 1.2 — Ordinal → CMS band ────────────────────────────────────────

/**
 * Project a raw ordinal entry onto the canonical { band, position } standard.
 * Banding is by normalised position (BUILD_SPEC 1.2). The raw value is the source
 * of truth and is stored separately — this never round-trips back to raw.
 */
export function toCanonicalOrdinal(rawValue: number | string, scale: OrdinalScale): CanonicalOrdinal {
  // Labelled entry (e.g. CMS single-selects, or any scale with `labels`).
  if (typeof rawValue === 'string') {
    const labels = scale.labels ?? [];
    const idx = labels.indexOf(rawValue);
    if (idx === -1) {
      // Unknown label — fall back to numeric coercion (e.g. "8" on a 1–10 scale).
      const num = Number(rawValue);
      if (Number.isNaN(num)) throw new Error(`toCanonicalOrdinal: unknown ordinal label "${rawValue}"`);
      return toCanonicalOrdinal(num, scale);
    }
    if (isCmsLabels(labels)) {
      // 1:1 index mapping — "Med+" (idx 3) → band 3, position 0.75.
      return { band: clampBand(idx), position: idx / (labels.length - 1) };
    }
    const position = labels.length > 1 ? idx / (labels.length - 1) : 0;
    return { band: positionToBand(position), position };
  }

  // Numeric entry — position = (raw - min) / (max - min).
  const span = scale.max - scale.min;
  const position = clamp01(span === 0 ? 0 : (rawValue - scale.min) / span);
  return { band: positionToBand(position), position };
}

// Inverse helper for rendering (BUILD_SPEC 1.2).
export function bandLabel(band: number): CmsBandLabel {
  return CMS_BANDS[clampBand(Math.round(band))];
}

// ── Story 1.3 — Score normalisation ───────────────────────────────────────

function resolveScoreSystem(system: string | ScoreSystem): { min: number; max: number; system?: string } {
  if (typeof system === 'string') {
    const def = SCORE_SYSTEMS[system];
    if (!def) throw new Error(`toNormalisedScore: unknown score system "${system}"`);
    return { ...def, system };
  }
  return system;
}

/**
 * Normalise a raw score onto a comparable 0..100 axis (BUILD_SPEC 1.3).
 * Stats use the normalised value; display defaults to raw.
 */
export function toNormalisedScore(rawScore: number, system: string | ScoreSystem): number {
  const def = resolveScoreSystem(system);
  const span = def.max - def.min;
  if (span === 0) return 0;
  return clamp01((rawScore - def.min) / span) * 100;
}

// ── Story 1.4 — Render canonical in any target scale ──────────────────────

/**
 * Render a canonical ordinal projection as the nearest value in `targetScale`
 * (BUILD_SPEC 1.4). Uses `position` (finer than band) to reconstruct. This is an
 * ESTIMATE in the lossy direction (band/position → fine scale); the raw original
 * is always retrievable from storage and must be preferred when present.
 */
export function renderInScale(canonical: CanonicalOrdinal, targetScale: OrdinalScale): number | string {
  const labels = targetScale.labels;
  if (labels && labels.length > 0) {
    if (isCmsLabels(labels)) return labels[clampBand(canonical.band)];
    const idx = Math.round(canonical.position * (labels.length - 1));
    return labels[Math.max(0, Math.min(labels.length - 1, idx))];
  }
  const span = targetScale.max - targetScale.min;
  const step = targetScale.step ?? 1;
  const raw = targetScale.min + canonical.position * span;
  const snapped = Math.round(raw / step) * step;
  // Guard against floating-point drift from the divide/multiply (e.g. 0.30000000004).
  const rounded = Number(snapped.toFixed(6));
  return Math.max(targetScale.min, Math.min(targetScale.max, rounded));
}

// ── Story 1.5 — Non-destructive value constructors ─────────────────────────
// One per reconciliation_type. Each persists raw verbatim alongside the canonical
// projection; none of them ever stores canonical INSTEAD of raw.

export function buildOrdinalValue(raw: number | string, scale: OrdinalScale): ReconciledValue {
  return { raw, raw_scale: scale, canonical: toCanonicalOrdinal(raw, scale) };
}

export function buildScoreValue(raw: number, system: string | ScoreSystem): ReconciledValue {
  const def = resolveScoreSystem(system);
  const raw_scale: ScoreSystem = { system: def.system ?? 'custom', min: def.min, max: def.max };
  return { raw, raw_scale, canonical: { normalised_score: toNormalisedScore(raw, system) } };
}

export function buildRawValue<T>(raw: T): ReconciledValue<T> {
  return { raw };
}

/**
 * Dispatch a raw entry to the right constructor by reconciliation_type. The field
 * scale/score_system are passed explicitly so this stays decoupled from the
 * TemplateField shape (which gains reconciliation_type in R2).
 */
export function reconcile(
  reconciliation_type: ReconciliationType,
  raw: unknown,
  opts?: { scale?: OrdinalScale; score_system?: ScoreSystem | string },
): ReconciledValue {
  switch (reconciliation_type) {
    case 'ordinal': {
      if (!opts?.scale) throw new Error('reconcile: ordinal field requires a scale');
      if (raw == null || raw === '') return buildRawValue(raw); // unanswered — no projection
      return buildOrdinalValue(raw as number | string, opts.scale);
    }
    case 'score': {
      if (!opts?.score_system) throw new Error('reconcile: score field requires a score_system');
      if (raw == null || raw === '') return buildRawValue(raw);
      return buildScoreValue(Number(raw), opts.score_system);
    }
    case 'none':
    default:
      return buildRawValue(raw);
  }
}
