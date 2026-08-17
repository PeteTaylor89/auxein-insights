// maps-v2/utils/mapChrome.js — Composite title, legend, scale, north arrow and
// attribution onto an exported map canvas.
//
// A printed map is not just the map image. Everything here is a DOM element on
// screen (Mapbox's ScaleControl and attribution are HTML, the legend is React),
// so none of it exists in the WebGL canvas and all of it has to be redrawn.
//
// ATTRIBUTION IS NOT OPTIONAL. Mapbox's terms require attribution to remain on
// exported and printed imagery. It is drawn last, over the map, and there is no
// flag to turn it off — getting this wrong is a licence breach, not a cosmetic
// bug.
import { MANAGEMENT_LAYERS } from '../components/managementLayerRegistry';
import { MAP_FEATURE_TYPES } from '../components/mapFeatureTypes';

const ATTRIBUTION = '© Mapbox  © OpenStreetMap';

/** Nice round scale-bar distances, metres. */
const SCALE_STEPS = [
  1, 2, 5, 10, 20, 50, 100, 200, 500,
  1000, 2000, 5000, 10000, 20000, 50000, 100000,
];

/**
 * Metres per pixel at a given latitude and zoom, for the canvas pixel ratio in
 * play. Web Mercator: 156543.03392 m/px at zoom 0 on the equator, shrinking by
 * cos(latitude) and halving per zoom level.
 */
export function metresPerPixel(latitude, zoom, scaleFactor = 1) {
  return (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / (2 ** zoom) / scaleFactor;
}

function formatDistance(m) {
  return m >= 1000 ? `${m / 1000} km` : `${m} m`;
}

/**
 * Draw everything onto the canvas in place.
 *
 * @param {HTMLCanvasElement} canvas  the copied 2D canvas from renderMapToCanvas
 * @param {Object} opts
 * @param {string}  opts.title
 * @param {string}  opts.subtitle
 * @param {Date}    opts.date
 * @param {Object}  opts.layerVisibility
 * @param {number}  opts.latitude   map centre, for the scale bar
 * @param {number}  opts.zoom
 * @param {number}  opts.bearing    degrees; north arrow rotates by -bearing
 * @param {boolean} opts.showLegend
 * @param {boolean} opts.showScale
 * @param {boolean} opts.showNorth
 */
export function drawChrome(canvas, {
  title = '',
  subtitle = '',
  date = null,
  layerVisibility = {},
  latitude = -41,
  zoom = 14,
  bearing = 0,
  showLegend = true,
  showScale = true,
  showNorth = true,
} = {}) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  // Everything scales off the canvas width so an A4 and an A0 print look like
  // the same design rather than one having comically small furniture.
  const u = Math.max(1, W / 1000); // ~1 unit at 1000px wide
  const pad = 16 * u;
  const font = (size, weight = '400') =>
    `${weight} ${Math.round(size * u)}px "Helvetica Neue", Helvetica, Arial, sans-serif`;

  ctx.textBaseline = 'top';

  // ---- Title block (top-left) --------------------------------------------
  if (title || subtitle || date) {
    const lines = [];
    if (title) lines.push({ text: title, size: 20, weight: '700' });
    if (subtitle) lines.push({ text: subtitle, size: 12, weight: '400' });
    if (date) {
      lines.push({
        // A printed map with no date is useless in a compliance file six months
        // later, so the date is not optional.
        text: date.toLocaleDateString('en-NZ', {
          day: 'numeric', month: 'long', year: 'numeric',
        }),
        size: 11,
        weight: '400',
      });
    }

    let boxW = 0;
    for (const l of lines) {
      ctx.font = font(l.size, l.weight);
      boxW = Math.max(boxW, ctx.measureText(l.text).width);
    }
    const lineH = lines.reduce((sum, l) => sum + l.size * 1.5 * u, 0);
    const boxH = lineH + pad;

    roundedBox(ctx, pad, pad, boxW + pad * 2, boxH, 6 * u);

    let y = pad + pad / 2;
    for (const l of lines) {
      ctx.font = font(l.size, l.weight);
      ctx.fillStyle = l.weight === '700' ? '#2F2F2F' : '#555555';
      ctx.fillText(l.text, pad * 2, y);
      y += l.size * 1.5 * u;
    }
  }

  // ---- Legend (top-right) — only what was actually rendered ---------------
  if (showLegend) {
    const items = legendItems(layerVisibility);
    if (items.length) {
      ctx.font = font(11);
      let itemW = 0;
      for (const it of items) itemW = Math.max(itemW, ctx.measureText(it.label).width);

      const swatch = 10 * u;
      const rowH = 18 * u;
      const boxW = itemW + swatch + pad * 2.5;
      const headerH = 20 * u;
      const boxH = headerH + items.length * rowH + pad;
      const x = W - boxW - pad;

      roundedBox(ctx, x, pad, boxW, boxH, 6 * u);

      ctx.font = font(12, '700');
      ctx.fillStyle = '#2F2F2F';
      ctx.fillText('Legend', x + pad, pad + pad / 2);

      let y = pad + headerH + pad / 2;
      for (const it of items) {
        ctx.fillStyle = it.color;
        if (it.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(x + pad + swatch / 2, y + swatch / 2, swatch / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(x + pad, y, swatch, swatch);
        }
        ctx.font = font(11);
        ctx.fillStyle = '#2F2F2F';
        ctx.fillText(it.label, x + pad + swatch + 6 * u, y - 1 * u);
        y += rowH;
      }
    }
  }

  // ---- North arrow (top-centre-right) ------------------------------------
  if (showNorth) {
    const cx = W - 40 * u;
    const cy = H - 90 * u;
    const r = 18 * u;
    ctx.save();
    ctx.translate(cx, cy);
    // Map bearing rotates the world clockwise, so north on the page moves the
    // other way. Without this the arrow lies the moment anyone rotates the map.
    ctx.rotate((-bearing * Math.PI) / 180);
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.55, r * 0.7);
    ctx.lineTo(0, r * 0.35);
    ctx.lineTo(-r * 0.55, r * 0.7);
    ctx.closePath();
    ctx.fillStyle = '#2F2F2F';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 * u;
    ctx.stroke();
    ctx.fill();
    ctx.restore();

    ctx.font = font(11, '700');
    ctx.fillStyle = '#2F2F2F';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3 * u;
    ctx.textAlign = 'center';
    ctx.strokeText('N', cx, cy + r * 0.9);
    ctx.fillText('N', cx, cy + r * 0.9);
    ctx.textAlign = 'left';
  }

  // ---- Scale bar (bottom-left) -------------------------------------------
  if (showScale) {
    // The export canvas is the full print size, so metres-per-pixel must be
    // computed against THAT, not the on-screen map — otherwise the bar is wrong
    // by the ratio between screen and paper size, which is the whole point of
    // printing large.
    const mpp = metresPerPixel(latitude, zoom, 1);
    const targetPx = W * 0.18;
    const targetM = mpp * targetPx;
    const step = SCALE_STEPS.find((s) => s >= targetM) || SCALE_STEPS[SCALE_STEPS.length - 1];
    const barPx = step / mpp;

    const x = pad;
    const y = H - pad - 26 * u;

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(x - 4 * u, y - 6 * u, barPx + 8 * u, 30 * u);

    ctx.strokeStyle = '#2F2F2F';
    ctx.lineWidth = 2 * u;
    ctx.beginPath();
    ctx.moveTo(x, y + 10 * u);
    ctx.lineTo(x + barPx, y + 10 * u);
    ctx.moveTo(x, y + 4 * u);
    ctx.lineTo(x, y + 16 * u);
    ctx.moveTo(x + barPx, y + 4 * u);
    ctx.lineTo(x + barPx, y + 16 * u);
    ctx.stroke();

    ctx.font = font(10, '700');
    ctx.fillStyle = '#2F2F2F';
    ctx.fillText(formatDistance(step), x, y - 4 * u);
  }

  // ---- Attribution (bottom-right) — MANDATORY ----------------------------
  ctx.font = font(10);
  const attrW = ctx.measureText(ATTRIBUTION).width;
  const ax = W - attrW - pad * 1.5;
  const ay = H - 18 * u;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(ax - 5 * u, ay - 3 * u, attrW + 10 * u, 16 * u);
  ctx.fillStyle = '#333333';
  ctx.fillText(ATTRIBUTION, ax, ay);

  return canvas;
}

function roundedBox(ctx, x, y, w, h, r) {
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = Math.max(1, r / 6);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/**
 * Legend rows for the layers that were actually rendered.
 * A legend describing a hidden layer is worse than no legend — it makes the
 * reader look for something that is not on the page.
 */
export function legendItems(layerVisibility) {
  const items = [];
  for (const entry of MANAGEMENT_LAYERS) {
    if (!layerVisibility[entry.id]) continue;
    if (entry.id === 'mapFeatures') {
      // POIs expand to one row per type, since the colours differ per type and
      // a single "Points of Interest" swatch would be meaningless.
      for (const t of MAP_FEATURE_TYPES) {
        items.push({ label: t.label, color: t.color, shape: 'circle' });
      }
    } else {
      items.push({ label: entry.label, color: entry.color, shape: 'square' });
    }
  }
  return items;
}
