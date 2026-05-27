// Eligibility helper for the "Insights" action on observation runs.
// Two insight kinds are surfaced:
//   - 'phenology' — per-block EL stage progression
//   - 'yield'     — rolling harvest / growth estimate from bud/flower/bunch/yield observations
// `templateType` is the `observation_templates.type` column (string).

export const PHENOLOGY_TYPES = new Set(['phenology']);

export const YIELD_TYPES = new Set([
  'bud_count',
  'bunch_count',
  'flower_count',
  'pre_veraison_yield',
  'post_veraison_yield',
  'maturity_sampling',
  'growth',
  'yield_estimate'
]);

export function getInsightKind(templateType) {
  if (!templateType) return null;
  const t = String(templateType).toLowerCase();
  if (PHENOLOGY_TYPES.has(t)) return 'phenology';
  if (YIELD_TYPES.has(t)) return 'yield';
  return null;
}
