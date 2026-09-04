// components/surfaces/surfaceMapConfig.js — the ONE shape of an embedded surface map.
//
// A surface map is now embeddable from two completely different authoring
// systems, and will be from more:
//
//   ARTICLES   a Tiptap node, `climateWidget` with widgetType 'surface_map'.
//              The settings live in the node's flat `attrs`.
//   RESEARCH   a `research_sections` row with section_type 'map'. The settings
//              live in its JSONB `content` column.
//
// Those are a ProseMirror document and a Postgres column, and nothing forces
// them to agree. THIS FILE IS WHAT FORCES THEM TO AGREE: both carry the same
// key names with the same meanings, both are read through `normaliseConfig`,
// and both reach the map through `surfaceMapProps`. A third host — an email, a
// dashboard tile, a printed report — adds a call here and nothing else.
//
// Why it matters more than it looks: a stored config is DATA THAT OUTLIVES THE
// CODE. A research row written today is read by whatever this component becomes
// in a year, so an unknown or missing key must degrade to a sensible default
// rather than to `undefined` reaching Mapbox. Every field below has a default
// and every reader goes through the normaliser.
//
// NO HEAVY IMPORTS. This module is pulled in by hosts that only want to
// describe a map, not draw one — `ArticleSurfaceMap` (and mapbox-gl behind it,
// ~800 kB) stays lazy at every call site.

export const DEFAULT_SURFACE_CONFIG = {
  variable: 'temp_mean',
  // 'monthly' | 'daily'. A REQUEST, not a guarantee: `cadenceFor` overrides it
  // for a variable with no such cadence (the GDD layers are seasonal), so the
  // stored value can safely be whatever the author picked.
  cadence: 'monthly',
  // 'YYYY-MM' or 'YYYY-MM-DD'. THE PIN, and the reason this config exists as a
  // stored thing rather than as defaults in a component: a published map must
  // stay on the step the surrounding text is about.
  validAt: '',
  statistic: '',
  // The opt-out from the pin, for a piece that is ABOUT the newest step.
  followLatest: false,
  mapHeight: 420,
  mapCentre: '',
  mapZoom: null,
  basemap: 'light',
};

const BASEMAPS = new Set(['light', 'outdoors', 'satellite']);
const CADENCES = new Set(['monthly', 'daily']);

/** A finite number from anything, or null. Form inputs hand back strings. */
function num(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * A complete, valid config from a partial, foreign or hostile one.
 *
 * Tolerant on purpose. The input is a Tiptap attribute bag written by an older
 * build, or a JSONB column edited by hand, or `undefined` — none of which are
 * worth crashing a published page over. An unrecognised value falls back to the
 * default rather than being passed through, because passing it through is how
 * `basemap: "satelite"` becomes a blank map with no error anywhere.
 */
export function normaliseConfig(source) {
  const src = source && typeof source === 'object' ? source : {};
  const height = num(src.mapHeight);
  const zoom = num(src.mapZoom);
  return {
    variable: typeof src.variable === 'string' && src.variable
      ? src.variable
      : DEFAULT_SURFACE_CONFIG.variable,
    cadence: CADENCES.has(src.cadence) ? src.cadence : DEFAULT_SURFACE_CONFIG.cadence,
    validAt: typeof src.validAt === 'string' ? src.validAt : '',
    statistic: typeof src.statistic === 'string' ? src.statistic : '',
    // Strictly `=== true`. A stored string 'false' is truthy, and this flag
    // decides whether a map ignores its own pin — the one setting where a loose
    // read silently un-pins a published map.
    followLatest: src.followLatest === true,
    mapHeight: height == null ? DEFAULT_SURFACE_CONFIG.mapHeight : height,
    mapCentre: typeof src.mapCentre === 'string' ? src.mapCentre.trim() : '',
    mapZoom: zoom,
    basemap: BASEMAPS.has(src.basemap) ? src.basemap : DEFAULT_SURFACE_CONFIG.basemap,
  };
}

/**
 * Config -> `ArticleSurfaceMap` props.
 *
 * The rename (`mapHeight` -> `height`) happens HERE and only here. The stored
 * keys are prefixed because they share a namespace with a Tiptap node's other
 * attributes, where a bare `height` would collide with the image node's; the
 * component's props are not in that namespace and should not carry the scar.
 */
export function surfaceMapProps(source) {
  const c = normaliseConfig(source);
  return {
    variable: c.variable,
    cadence: c.cadence,
    validAt: c.validAt,
    // `undefined`, not '', so the component's own default applies rather than
    // an empty statistic being sent on the wire.
    statistic: c.statistic || undefined,
    followLatest: c.followLatest,
    height: c.mapHeight,
    centre: c.mapCentre,
    zoom: c.mapZoom ?? undefined,
    basemap: c.basemap,
  };
}

/**
 * Is this config publishable?
 *
 * A map with neither a pinned step nor `followLatest` has no date to draw and
 * would render as a permanent placeholder. Everything else has a default.
 */
export function isConfigComplete(source) {
  const c = normaliseConfig(source);
  return c.followLatest || Boolean(c.validAt);
}
