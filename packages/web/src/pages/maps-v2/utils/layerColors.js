// maps-v2/utils/layerColors.js — Colour constants for map layers

// Block fill — own company vs others
export const BLOCK_FILL_OWN = '#58e23c';
export const BLOCK_FILL_OTHER = 'rgba(255, 255, 255, 0.005)';
export const BLOCK_OUTLINE = '#ffffff';

// Risk level colours
export const RISK_COLORS = {
  low: '#28a745',
  medium: '#f59e0b',
  high: '#dc2626',
  critical: '#7c2d12',
};

// Spatial area fill
export const SPATIAL_AREA_FILL = 'rgba(91, 104, 48, 0.15)';
export const SPATIAL_AREA_OUTLINE = '#5B6830';

// Asset category colours (used for point markers)
export const ASSET_COLORS = {
  equipment: '#3b82f6',      // blue
  vehicle: '#6b7280',        // grey
  tool: '#8b5cf6',           // purple
  infrastructure: '#92400e', // brown
  consumable: '#059669',     // green
};

// Asset line colours by lowercased subcategory. Picked for high contrast
// against satellite imagery; fall back to amber when subcategory is unknown.
// Used with a 5px white casing layer underneath for legibility.
export const ASSET_LINE_COLORS = {
  irrigation: '#22d3ee',  // cyan
  drip:       '#22d3ee',
  water:      '#22d3ee',
  fence:      '#fbbf24',  // amber
  fencing:    '#fbbf24',
  power:      '#ec4899',  // magenta
  electric:   '#ec4899',
  electrical: '#ec4899',
  drainage:   '#14b8a6',  // teal
  drain:      '#14b8a6',
  road:       '#f97316',  // orange
  track:      '#f97316',
  pipeline:   '#a855f7',  // violet
};
export const ASSET_LINE_DEFAULT = '#fbbf24'; // amber
export const ASSET_LINE_CASING = '#ffffff';

// GPS track colours by task status — used by the GPS Tracks layer in
// Maps V2. White casing under each line for contrast on satellite.
export const GPS_TRACK_COLORS = {
  in_progress: '#D1583B',  // orange — matches the legacy single-track colour
  ready:       '#5B6830',  // olive
  scheduled:   '#3b82f6',  // blue
  paused:      '#f59e0b',  // amber
  completed:   '#5B6830',  // olive
  cancelled:   '#6b7280',  // grey
  draft:       '#9ca3af',  // light grey
};
export const GPS_TRACK_DEFAULT = '#5B6830';
export const GPS_TRACK_CASING = '#ffffff';
