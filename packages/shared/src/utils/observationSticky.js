// utils/observationSticky.js — which values carry forward to the next spot.
//
// The Greystone complaint, in Pete's words: "on bud counts, the vines sampled
// per spot is generally always 1, and the target buds is the same — so both
// could persist from the first spot." Thirty spots means those two fields were
// typed thirty times each for no reason.
//
// THE DANGEROUS VERSION OF THIS FEATURE is "carry everything forward". Do that
// and a tired observer taps Save & next and records the previous vine's bud
// count, thirty times, and the run looks perfect. So:
//
//   * A field is sticky only if it is a RUN CONSTANT — something true of the
//     whole run, not of the vine in front of you.
//   * The MEASUREMENT never carries, whatever anything else says. That guard is
//     absolute and deliberately not overridable by a template flag.
//   * Free text, photos and computed fields never carry.
//
// A template can opt a field in or out with `sticky: true|false` on its field
// descriptor. The measurement guard still wins.

/** Values true of the run, not of the individual vine. Safe to carry. */
const RUN_CONSTANT_FIELDS = {
  bud_count: ['vines_sampled', 'target_buds_per_vine'],
  bunch_count: ['vines_sampled'],
  flower_set: ['shoots_sampled'],
  growth: ['leaf_layer_number'],
  maturity_sampling: ['berries_sampled', 'bunches_sampled'],
  pre_veraison_yield: ['vines_sampled'],
  post_veraison_yield: ['vines_sampled'],
};

/**
 * The numbers the observer is actually there to record. These must be re-read
 * at every spot, so they never carry — no matter what a template declares.
 */
const MEASUREMENT_FIELDS = new Set([
  'buds_per_vine', 'bud_count',
  'bunches_total', 'bunches_per_vine', 'bunch_count',
  'active_shoot_count', 'shoots_per_vine',
  'inflorescences_per_shoot', 'flowers_per_inflorescence', 'flowers_per_bunch',
  'flower_count', 'set_percent',
  'internode_count', 'shoot_length_class', 'exposure_rating',
  'brix', 'ph', 'ta',
]);

/** Types where carrying a value forward is always wrong. */
const NEVER_STICKY_TYPES = new Set([
  'textarea', 'photo', 'file', 'files', 'image', 'json', 'signature',
]);

/**
 * Should this field's value carry to the next spot in the run?
 *
 * @param {{name: string, type?: string, sticky?: boolean, computed?: boolean}} field
 * @param {string} templateType the `observation_templates.type` of the run
 */
export function isStickyField(field, templateType) {
  if (!field || !field.name) return false;
  // Absolute, and checked first: a template cannot opt its measurement in.
  if (MEASUREMENT_FIELDS.has(field.name)) return false;
  if (field.computed) return false;
  if (NEVER_STICKY_TYPES.has(String(field.type || '').toLowerCase())) return false;

  if (field.sticky === true) return true;
  if (field.sticky === false) return false;

  const constants = RUN_CONSTANT_FIELDS[String(templateType || '').toLowerCase()] || [];
  return constants.includes(field.name);
}

/**
 * The value map for the next spot: sticky values kept, everything else back to
 * the template's own defaults.
 *
 * A value is only carried if the observer actually entered something — a blank
 * sticky field stays blank rather than resurrecting a default they cleared.
 */
export function nextSpotValues(previousValues, fields, templateType) {
  const next = {};
  for (const field of fields || []) {
    if (!field?.name) continue;
    if (field.default !== undefined && field.default !== null) next[field.name] = field.default;
  }
  for (const field of fields || []) {
    if (!isStickyField(field, templateType)) continue;
    const carried = previousValues?.[field.name];
    if (carried === undefined || carried === null || carried === '') continue;
    next[field.name] = carried;
  }
  return next;
}

/** Names of the fields that carried, for telling the observer what was kept. */
export function carriedFieldNames(previousValues, fields, templateType) {
  return (fields || [])
    .filter((f) => isStickyField(f, templateType))
    .filter((f) => {
      const v = previousValues?.[f.name];
      return v !== undefined && v !== null && v !== '';
    })
    .map((f) => f.label || f.name);
}
