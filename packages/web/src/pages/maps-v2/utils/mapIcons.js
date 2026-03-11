// maps-v2/utils/mapIcons.js — Register custom SVG icons with Mapbox GL
// Renders lucide icon SVGs to canvas images for use as map markers

const ICON_SIZE = 32; // logical px (rendered at 2x for retina)

/**
 * SVG draw instructions from lucide-react icons (24x24 viewBox).
 * Each element is { type, attrs } matching the lucide icon definition.
 */
const ICON_DEFS = {
  // ClipboardList (tasks)
  tasks: [
    { type: 'rect', attrs: { x: 8, y: 2, width: 8, height: 4, rx: 1 } },
    { type: 'path', attrs: { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' } },
    { type: 'path', attrs: { d: 'M12 11h4' } },
    { type: 'path', attrs: { d: 'M12 16h4' } },
    { type: 'path', attrs: { d: 'M8 11h.01' } },
    { type: 'path', attrs: { d: 'M8 16h.01' } },
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
  const iconScale = (size * 0.55) / 24;
  const offsetX = (size - 24 * iconScale) / 2;
  const offsetY = (size - 24 * iconScale) / 2;

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(iconScale, iconScale);
  ctx.strokeStyle = iconColor;
  ctx.lineWidth = 2 / iconScale; // Keep consistent stroke weight
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
export function registerMapIcons(map) {
  if (!map) return;

  const icons = [
    { id: 'v2-tasks-icon', bg: '#D1583B', fg: '#ffffff', def: ICON_DEFS.tasks },
    { id: 'v2-tasks-icon-inactive', bg: '#94a3b8', fg: '#ffffff', def: ICON_DEFS.tasks },
    { id: 'v2-obs-icon', bg: '#5B6830', fg: '#ffffff', def: ICON_DEFS.binoculars },
  ];

  icons.forEach(({ id, bg, fg, def }) => {
    if (map.hasImage(id)) return;
    try {
      const img = createMarkerImage(bg, fg, def);
      map.addImage(id, img, { pixelRatio: 2 });
    } catch (e) {
      console.warn('Failed to register map icon:', id, e);
    }
  });
}
