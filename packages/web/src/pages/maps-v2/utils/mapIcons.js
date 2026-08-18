// maps-v2/utils/mapIcons.js — Register custom SVG icons with Mapbox GL
// Renders lucide icon SVGs to canvas images for use as map markers

const ICON_SIZE = 32; // logical px (rendered at 2x for retina)

// The glyph occupies 55% of the badge, and its stroke is 2 device px on the
// 64px marker image. Both numbers are exported as PROPORTIONS so a swatch drawn
// at any size — a 20px legend chip on screen, a 140px one on an A0 sheet — is
// the same drawing as the marker on the map rather than a lookalike.
export const GLYPH_FRACTION = 0.55;
export const GLYPH_STROKE = 2 / ((ICON_SIZE * 2 * GLYPH_FRACTION) / 24); // in 24x24 glyph units
export const BADGE_RING_FRACTION = 3 / (ICON_SIZE * 2); // white ring, as a fraction of diameter

/**
 * SVG draw instructions from lucide-react icons (24x24 viewBox).
 * Each element is { type, attrs } matching the lucide icon definition.
 */
const ICON_DEFS = {
  // TriangleAlert (risks) — ! inside triangle
  risk: [
    { type: 'path', attrs: { d: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' } },
    { type: 'path', attrs: { d: 'M12 9v4' } },
    { type: 'path', attrs: { d: 'M12 17h.01' } },
  ],
  // Wrench (assets)
  wrench: [
    { type: 'path', attrs: { d: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z' } },
  ],
  // ClipboardList (tasks)
  tasks: [
    { type: 'rect', attrs: { x: 8, y: 2, width: 8, height: 4, rx: 1 } },
    { type: 'path', attrs: { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' } },
    { type: 'path', attrs: { d: 'M12 11h4' } },
    { type: 'path', attrs: { d: 'M12 16h4' } },
    { type: 'path', attrs: { d: 'M8 11h.01' } },
    { type: 'path', attrs: { d: 'M8 16h.01' } },
  ],
  // --- Map features (POIs) ---
  // These are simple geometric glyphs rather than transcribed lucide paths.
  // Everything here is stroked (see drawElement — there is no fill path), so
  // plain M/L/arc shapes read more cleanly at 32px than a detailed outline
  // would, and there is no risk of a mis-copied bezier rendering as garbage.

  // Gate / access — two posts and two rails
  poiAccess: [
    { type: 'path', attrs: { d: 'M4 6 L4 19' } },
    { type: 'path', attrs: { d: 'M20 6 L20 19' } },
    { type: 'path', attrs: { d: 'M4 10 L20 10' } },
    { type: 'path', attrs: { d: 'M4 15 L20 15' } },
  ],
  // Infrastructure — a simple building outline with a pitched roof
  poiInfrastructure: [
    { type: 'path', attrs: { d: 'M4 20 L4 10 L12 4 L20 10 L20 20 Z' } },
    { type: 'path', attrs: { d: 'M10 20 L10 14 L14 14 L14 20' } },
  ],
  // Water — two stacked waves
  poiWater: [
    { type: 'path', attrs: { d: 'M3 9 Q7 5 12 9 T21 9' } },
    { type: 'path', attrs: { d: 'M3 15 Q7 11 12 15 T21 15' } },
  ],
  // Amenity — a circle with a centred dot
  poiAmenity: [
    { type: 'circle', attrs: { cx: 12, cy: 12, r: 8 } },
    { type: 'circle', attrs: { cx: 12, cy: 12, r: 2 } },
  ],
  // Note — a page with a folded corner and two text lines
  poiNote: [
    { type: 'path', attrs: { d: 'M6 3 L14 3 L19 8 L19 21 L6 21 Z' } },
    { type: 'path', attrs: { d: 'M14 3 L14 8 L19 8' } },
    { type: 'path', attrs: { d: 'M9 13 L16 13' } },
    { type: 'path', attrs: { d: 'M9 17 L16 17' } },
  ],
  // Binoculars (observations) — matches sidebar icon
  binoculars: [
    { type: 'path', attrs: { d: 'M10 10h4' } },
    { type: 'path', attrs: { d: 'M19 7V4a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v3' } },
    { type: 'path', attrs: { d: 'M20 21a2 2 0 0 0 2-2v-3.851c0-1.39-2-2.962-2-4.829V8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v11a2 2 0 0 0 2 2z' } },
    { type: 'path', attrs: { d: 'M 22 16 L 2 16' } },
    { type: 'path', attrs: { d: 'M4 21a2 2 0 0 1-2-2v-3.851c0-1.39 2-2.962 2-4.829V8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2z' } },
    { type: 'path', attrs: { d: 'M9 7V4a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v3' } },
  ],
};

/**
 * Draw a lucide icon element onto a canvas context.
 */
function drawElement(ctx, el) {
  if (el.type === 'path') {
    const path = new Path2D(el.attrs.d);
    ctx.stroke(path);
  } else if (el.type === 'rect') {
    const { x, y, width, height, rx } = el.attrs;
    const r = rx || 0;
    if (r > 0) {
      // Rounded rect
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + width - r, y);
      ctx.arcTo(x + width, y, x + width, y + r, r);
      ctx.lineTo(x + width, y + height - r);
      ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
      ctx.lineTo(x + r, y + height);
      ctx.arcTo(x, y + height, x, y + height - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
      ctx.stroke();
    } else {
      ctx.strokeRect(x, y, width, height);
    }
  } else if (el.type === 'circle') {
    ctx.beginPath();
    ctx.arc(el.attrs.cx, el.attrs.cy, el.attrs.r, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/**
 * Create a circular marker image with a lucide icon inside.
 */
function createMarkerImage(bgColor, iconColor, elements) {
  const size = ICON_SIZE * 2; // 2x for retina
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Circle background
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Draw icon scaled from 24x24 viewBox to fit ~55% of circle
  const iconScale = (size * GLYPH_FRACTION) / 24;
  const offsetX = (size - 24 * iconScale) / 2;
  const offsetY = (size - 24 * iconScale) / 2;

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(iconScale, iconScale);
  ctx.strokeStyle = iconColor;
  ctx.lineWidth = GLYPH_STROKE; // Keep consistent stroke weight
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  elements.forEach((el) => drawElement(ctx, el));
  ctx.restore();

  const imageData = ctx.getImageData(0, 0, size, size);
  return { width: size, height: size, data: new Uint8Array(imageData.data.buffer) };
}

/**
 * Register all custom marker icons with the map.
 * Safe to call multiple times — skips already-registered icons.
 */
/**
 * Every marker image the map registers, in one place.
 *
 * The legend renders its swatches from this same list (see MapLegend.jsx), so
 * a marker whose colour or glyph changes here changes in the legend too — the
 * failure mode of a hand-maintained legend is that it quietly starts lying.
 */
export const MARKER_SPECS = [
  { id: 'v2-tasks-icon', bg: '#D1583B', fg: '#ffffff', def: ICON_DEFS.tasks, label: 'Task' },
  { id: 'v2-tasks-icon-inactive', bg: '#94a3b8', fg: '#ffffff', def: ICON_DEFS.tasks, label: 'Task (done / cancelled)' },
  { id: 'v2-obs-icon', bg: '#5B6830', fg: '#ffffff', def: ICON_DEFS.binoculars, label: 'Observation' },
  { id: 'v2-risk-icon-low', bg: '#28a745', fg: '#ffffff', def: ICON_DEFS.risk, label: 'Risk — low' },
  { id: 'v2-risk-icon-medium', bg: '#f59e0b', fg: '#ffffff', def: ICON_DEFS.risk, label: 'Risk — medium' },
  { id: 'v2-risk-icon-high', bg: '#dc2626', fg: '#ffffff', def: ICON_DEFS.risk, label: 'Risk — high' },
  { id: 'v2-risk-icon-critical', bg: '#7c2d12', fg: '#ffffff', def: ICON_DEFS.risk, label: 'Risk — critical' },
  { id: 'v2-asset-icon', bg: '#5B6830', fg: '#ffffff', def: ICON_DEFS.wrench, label: 'Asset' },
  // Map features (POIs). One image per feature_type — the layer picks between
  // them with a `match` on the type, so adding a type means adding a spec here
  // AND an entry in MAP_FEATURE_TYPES (components/mapFeatureTypes.js).
  // There is deliberately no `hazard` type: hazards live in SiteRisk.
  { id: 'v2-poi-access', bg: '#0369a1', fg: '#ffffff', def: ICON_DEFS.poiAccess, label: 'Access' },
  { id: 'v2-poi-infrastructure', bg: '#6b7280', fg: '#ffffff', def: ICON_DEFS.poiInfrastructure, label: 'Infrastructure' },
  { id: 'v2-poi-water', bg: '#0891b2', fg: '#ffffff', def: ICON_DEFS.poiWater, label: 'Water' },
  { id: 'v2-poi-amenity', bg: '#7c3aed', fg: '#ffffff', def: ICON_DEFS.poiAmenity, label: 'Amenity' },
  { id: 'v2-poi-note', bg: '#2F2F2F', fg: '#ffffff', def: ICON_DEFS.poiNote, label: 'Note' },
];

const SPEC_BY_ID = Object.fromEntries(MARKER_SPECS.map((s) => [s.id, s]));

/**
 * Paint one marker badge onto a 2D context, centred on (cx, cy).
 *
 * This is the same drawing as the map image — same badge, same ring, same glyph
 * paths, same proportions — just at an arbitrary radius, so the printed legend
 * shows the marker rather than an approximation of it. Returns false for an
 * unknown id so the caller can fall back rather than leave a blank row.
 */
export function drawMarkerSwatch(ctx, specId, cx, cy, radius) {
  const spec = SPEC_BY_ID[specId];
  if (!spec) return false;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = spec.bg;
  ctx.fill();
  ctx.lineWidth = Math.max(1, radius * 2 * BADGE_RING_FRACTION);
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  const glyph = radius * 2 * GLYPH_FRACTION;
  const scale = glyph / 24;
  ctx.translate(cx - glyph / 2, cy - glyph / 2);
  ctx.scale(scale, scale);
  ctx.strokeStyle = spec.fg;
  // Proportional to the badge, but never finer than 2 output pixels — below
  // that a stroked glyph disappears into the paper. At print sizes the
  // proportional term always wins, so the swatch matches the marker exactly.
  ctx.lineWidth = Math.max(GLYPH_STROKE, 2 / scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  spec.def.forEach((el) => drawElement(ctx, el));
  ctx.restore();
  return true;
}

export function registerMapIcons(map) {
  if (!map) return;

  MARKER_SPECS.forEach(({ id, bg, fg, def }) => {
    if (map.hasImage(id)) return;
    try {
      const img = createMarkerImage(bg, fg, def);
      map.addImage(id, img, { pixelRatio: 2 });
    } catch (e) {
      console.warn('Failed to register map icon:', id, e);
    }
  });
}
