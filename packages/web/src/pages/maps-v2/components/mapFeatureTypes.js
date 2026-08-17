// maps-v2/components/mapFeatureTypes.js — the POI vocabulary, in one place.
//
// The form's dropdown, the map layer's icon `match` expression and the legend
// all read from this list, so a new type is one entry here plus one MARKER_SPEC
// in utils/mapIcons.js — not three edits in three files that drift apart.
//
// `value` MUST match the backend FeatureType enum in schemas/map_feature.py.
// There is deliberately NO `hazard` type — hazards belong in SiteRisk, which is
// the WorkSafe register, and the API rejects `hazard` outright. Two competing
// hazard registers would be worse than none.

export const MAP_FEATURE_TYPES = [
  {
    value: 'access',
    label: 'Access',
    iconId: 'v2-poi-access',
    color: '#0369a1',
    hint: 'Gate, ford, culvert, crossing',
  },
  {
    value: 'infrastructure',
    label: 'Infrastructure',
    iconId: 'v2-poi-infrastructure',
    color: '#6b7280',
    hint: 'Pump, tank, valve, shed, weather station',
  },
  {
    value: 'water',
    label: 'Water',
    iconId: 'v2-poi-water',
    color: '#0891b2',
    hint: 'Dam, bore, trough, race',
  },
  {
    value: 'amenity',
    label: 'Amenity',
    iconId: 'v2-poi-amenity',
    color: '#7c3aed',
    hint: 'Toilet, smoko shed, parking',
  },
  {
    value: 'note',
    label: 'Note',
    iconId: 'v2-poi-note',
    color: '#2F2F2F',
    hint: 'Free annotation',
  },
];

export const FEATURE_TYPE_BY_VALUE = Object.fromEntries(
  MAP_FEATURE_TYPES.map((t) => [t.value, t]),
);

export const DEFAULT_FEATURE_ICON = 'v2-poi-note';
export const DEFAULT_FEATURE_COLOR = '#2F2F2F';

/** Mapbox `match` expression: feature_type -> marker image id. */
export function featureIconExpression() {
  const stops = [];
  MAP_FEATURE_TYPES.forEach((t) => stops.push(t.value, t.iconId));
  return ['match', ['coalesce', ['get', 'feature_type'], ''], ...stops, DEFAULT_FEATURE_ICON];
}

/** Mapbox `match` expression: feature_type -> line/fill colour. */
export function featureColorExpression() {
  const stops = [];
  MAP_FEATURE_TYPES.forEach((t) => stops.push(t.value, t.color));
  return ['match', ['coalesce', ['get', 'feature_type'], ''], ...stops, DEFAULT_FEATURE_COLOR];
}
