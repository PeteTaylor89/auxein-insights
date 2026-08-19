// maps-v2/components/mapFeatureTypes.js — POI appearance resolution.
//
// This file USED to be the vocabulary: a static five-entry array that the form,
// the map layer and the legend all read. The vocabulary now lives in the
// database and arrives through hooks/useMapFeatureTypes — a company defines its
// own types, so a hardcoded list cannot be the source of truth any more.
//
// What is left here is the resolution rule (which glyph and colour does THIS
// feature draw with) plus the original five, kept only as the offline fallback
// that useMapFeatureTypes seeds itself with when the list request fails.
//
// WHY THERE ARE NO `match` EXPRESSIONS ANY MORE
// --------------------------------------------
// The layer used to style points with `['match', ['get','feature_type'], ...]`,
// built from the static array. With a per-company vocabulary that becomes a
// trap: a Mapbox expression is baked into the layer at addLayer time and will
// not notice a type added afterwards, so every new type would draw as the
// default note pin until something forced a rebuild.
//
// So the DATA carries the answer instead. `decorateFeatures` resolves each
// feature to a concrete marker id and colour and writes them into its
// properties, and the layer just does `['get','marker_id']`. There is nothing
// stale to rebuild, and it is the only way to honour a PER-FEATURE style
// override — an expression keyed on feature_type cannot express "this one gate
// is different".
//
// There is deliberately NO `hazard` type — hazards belong in SiteRisk, which is
// the WorkSafe register. The reserved-word guard in the API enforces it.

// The original five. NOT the vocabulary — the fallback seed only.
import { poiMarkerId } from '../utils/mapIcons';

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

// FEATURE_TYPE_BY_VALUE was removed 2026-08-19. It indexed the STATIC five, so
// every remaining caller was a latent bug: a company type had no entry and the
// UI fell back to a placeholder or to the raw slug. Both the popup and the
// sidebar list did exactly that. Use resolveAppearance with the vocabulary's
// typeBySlug instead.

export const DEFAULT_FEATURE_ICON = 'v2-poi-note';
export const DEFAULT_FEATURE_ICON_KEY = 'poiNote';
export const DEFAULT_FEATURE_COLOR = '#2F2F2F';

/** Property names the decorated GeoJSON carries. Exported so the layer and the
    popup agree on them without either re-typing a string. */
export const MARKER_ID_PROP = 'marker_id';
export const MARKER_COLOUR_PROP = 'marker_colour';

/**
 * How one feature draws.
 *
 * Precedence is per-feature style, then its type, then the default. The
 * per-feature branch is what the dormant `map_features.style` JSONB column was
 * always for — one odd gate wanting a different glyph should not need a whole
 * type of its own.
 *
 * A feature whose type was retired, or whose type list failed to load, still
 * resolves — to the note pin in charcoal. Drawing nothing would lose the
 * feature entirely, and a POI you cannot see is worse than one drawn plainly.
 */
export function resolveAppearance(featureType, style, typeBySlug = {}) {
  const t = typeBySlug[featureType];
  // `colour` and `color` both accepted: the API spells it one way, and anything
  // hand-written into the JSONB is as likely to use the other.
  const styleColour = style?.colour || style?.color || null;
  return {
    icon: style?.icon || t?.icon || DEFAULT_FEATURE_ICON_KEY,
    colour: styleColour || t?.colour || DEFAULT_FEATURE_COLOR,
    label: t?.label || featureType || 'Feature',
  };
}

/**
 * Resolve a whole FeatureCollection.
 *
 * Returns the decorated data plus the distinct (icon, colour) pairs it uses —
 * which is exactly the set of marker images that must be registered before the
 * layer is added, on the live map AND on the export clone.
 *
 * Built from the FEATURES, not from the vocabulary: a feature carrying a style
 * override, or one whose type has since been retired, needs its image too and
 * would be missed by walking the type list.
 */
export function decorateFeatures(geojson, types = []) {
  const typeBySlug = Object.fromEntries((types || []).map((t) => [t.slug, t]));
  const specs = new Map();

  const features = (geojson?.features || []).map((f) => {
    const props = f?.properties || {};
    const look = resolveAppearance(props.feature_type, props.style, typeBySlug);
    const key = `${look.icon}|${look.colour}`;
    if (!specs.has(key)) {
      specs.set(key, { icon: look.icon, colour: look.colour, label: look.label });
    }
    return {
      ...f,
      properties: {
        ...props,
        [MARKER_ID_PROP]: poiMarkerId(look.icon, look.colour),
        [MARKER_COLOUR_PROP]: look.colour,
      },
    };
  });

  return {
    data: { type: 'FeatureCollection', features },
    specs: [...specs.values()],
  };
}
