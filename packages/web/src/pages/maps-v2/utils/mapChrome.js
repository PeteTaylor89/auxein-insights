// maps-v2/utils/mapChrome.js — Composite the title block, legend, scale, north
// arrow, neatline and attribution onto an exported map canvas.
//
// A printed map is not just the map image. Everything here is a DOM element on
// screen (Mapbox's ScaleControl and attribution are HTML, the legend is React),
// so none of it exists in the WebGL canvas and all of it has to be redrawn.
//
// WHAT IS DRAWN comes from utils/legendModel.js — the same rows the on-screen
// MapLegend renders. It used to be a second, cruder list built right here: one
// flat coloured square per layer and a plain circle per POI type. So the screen
// showed an olive badge with binoculars in it and the print showed an olive
// square, four risk severities collapsed to one amber block, and POI glyphs
// vanished entirely. The printed sheet is the copy that gets filed and argued
// over, so it was the wrong one to have approximate.
//
// The marker swatches now come from drawMarkerSwatch() in mapIcons.js, which is
// the SAME drawing code as the map images themselves — same badge, ring, glyph
// paths and proportions, just at legend size.
//
// ATTRIBUTION IS NOT OPTIONAL. Mapbox's terms require attribution to remain on
// exported and printed imagery. It is drawn last, over the map, and there is no
// flag to turn it off — getting this wrong is a licence breach, not a cosmetic
// bug.
import { drawMarkerSwatch } from './mapIcons';
import { legendSections } from './legendModel';
import logoMark from '../../../assets/logo-mark.png';

const ATTRIBUTION = '© Mapbox  © OpenStreetMap';

// Brand palette, mirroring styles/theme.css. Canvas cannot read CSS custom
// properties, so these are the one place they are repeated — if the theme moves,
// move them here too.
const OLIVE = '#5B6830';
const TERRACOTTA = '#D1583B';
const INK = '#2F2F2F';
const MUTED = '#6b7280';
const PANEL_BG = 'rgba(255,255,255,0.94)';
const HAIRLINE = 'rgba(47,47,47,0.18)';

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
 * The representative fraction — the "1:5,000" a printed map is expected to
 * carry. Derived from the OUTPUT canvas against the physical paper width, so it
 * stays true even when the dpi was clamped down. Only meaningful if the sheet is
 * actually printed at the chosen paper size, which the PDF guarantees.
 */
function representativeFraction(metresPerOutputPx, canvasWidthPx, paperWidthMm) {
  if (!paperWidthMm || !canvasWidthPx) return null;
  const pxPerMm = canvasWidthPx / paperWidthMm;
  const ratio = metresPerOutputPx * pxPerMm * 1000; // ground mm per paper mm
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  // Round to something a person would write down rather than 1:4,732.
  const mag = 10 ** Math.floor(Math.log10(ratio) - 1);
  const rounded = Math.round(ratio / mag) * mag;
  return `1:${rounded.toLocaleString('en-NZ')}`;
}

/**
 * Truncate to fit, with an ellipsis. The title block and the legend live in
 * opposite top corners of the same sheet, so unbounded text is not a cosmetic
 * problem — a long title grows its panel until it slides under the legend.
 * Caller sets ctx.font first.
 */
function fitText(ctx, text, maxWidth) {
  if (!text || ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(`${text.slice(0, mid)}…`).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? `${text.slice(0, lo)}…` : '';
}

/**
 * The logo, loaded once and cached. Never rejects: a print without the mark is
 * a great deal better than a print that failed.
 */
let logoPromise = null;
function loadLogo() {
  if (!logoPromise) {
    logoPromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = logoMark;
    });
  }
  return logoPromise;
}

/**
 * Compose the finished sheet: white ground, the map image inset by its margin,
 * a neatline hugging the map, then all the furniture.
 *
 * The map is drawn 1:1 — it was RENDERED at the inner size, not scaled down to
 * fit — so nothing is resampled and metres-per-pixel is the same on the sheet as
 * it was on the map canvas. That is what keeps the scale bar and the 1:N ratio
 * honest once a margin exists.
 *
 * @param {HTMLCanvasElement} mapCanvas  from renderMapToCanvas
 * @param {Object} opts  sheet `width`/`height`/`margin`, plus every drawChrome option
 * @returns {Promise<HTMLCanvasElement>} the full sheet
 */
export async function composeSheet(mapCanvas, { width, height, margin = 0, ...chrome }) {
  const sheet = document.createElement('canvas');
  sheet.width = width;
  sheet.height = height;
  const ctx = sheet.getContext('2d');

  // The margin is paper, so it is white — not transparent. A transparent margin
  // would print as whatever the viewer composited behind it, and JPEG (the PDF
  // path) has no alpha at all, so it would come out black.
  // Read the size BEFORE the release below — zeroing the canvas zeroes these,
  // and a mapRect of w:0,h:0 does not fail loudly. It lays the furniture out
  // against a nothing-sized map: the legend, scale bar and north arrow walk off
  // the top-left edge, the neatline collapses to a speck, and the title block
  // stays put because it is the only piece anchored to the near corner. The
  // sheet still exports, which is what makes it worth a comment.
  const mapRect = { x: margin, y: margin, w: mapCanvas.width, h: mapCanvas.height };

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(mapCanvas, margin, margin);

  // Release the map canvas as soon as it has been copied. At A0 each of these
  // is ~190 MB of backing store, and holding both while the furniture is drawn
  // is what tips a tablet over.
  mapCanvas.width = 0;
  mapCanvas.height = 0;

  await drawChrome(sheet, { ...chrome, mapRect });
  return sheet;
}

/**
 * Draw everything onto the canvas in place.
 *
 * Async only because of the logo — everything else is synchronous canvas work.
 *
 * @param {HTMLCanvasElement} canvas  the sheet
 * @param {Object} opts
 * @param {Object} [opts.mapRect]  where the map image sits on the sheet; the
 *                                 frame hugs it and every panel is anchored
 *                                 inside it. Defaults to the whole canvas.
 * @param {string}  opts.title
 * @param {string}  opts.subtitle
 * @param {Date}    opts.date
 * @param {Object}  opts.layerVisibility  what was actually rendered
 * @param {Array}   opts.featureTypes  the company POI vocabulary, so the printed
 *                                     key names the same types the map drew
 * @param {number}  opts.latitude   map centre, for the scale bar
 * @param {number}  opts.zoom
 * @param {number}  opts.bearing    degrees; north arrow rotates by -bearing
 * @param {number}  opts.scaleFactor  output px per map CSS px (renderMapToCanvas
 *                                    returns it) — the scale bar is wrong by
 *                                    exactly this ratio without it
 * @param {number}  opts.paperWidthMm  physical sheet width, for the 1:N ratio
 * @param {boolean} opts.showLegend
 * @param {boolean} opts.showScale
 * @param {boolean} opts.showNorth
 * @param {boolean} opts.showFrame   neatline around the sheet
 */
export async function drawChrome(canvas, {
  title = '',
  subtitle = '',
  date = null,
  layerVisibility = {},
  featureTypes = [],
  latitude = -41,
  zoom = 14,
  bearing = 0,
  scaleFactor = 1,
  paperWidthMm = null,
  mapRect = null,
  showLegend = true,
  showScale = true,
  showNorth = true,
  showFrame = true,
} = {}) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  // Everything is positioned against the MAP, not the sheet: on a framed print
  // the two differ by the margin, and furniture in the margin would sit on bare
  // paper rather than on the map it describes.
  const mr = mapRect || { x: 0, y: 0, w: W, h: H };

  // Everything scales off the canvas width so an A4 and an A0 print look like
  // the same design rather than one having comically small furniture.
  const u = Math.max(1, W / 1000); // ~1 unit at 1000px wide
  const pad = 16 * u;
  const FAMILY = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  const font = (size, weight = '400') => `${weight} ${Math.round(size * u)}px ${FAMILY}`;
  const fontPx = (px, weight = '400') => `${weight} ${Math.round(px)}px ${FAMILY}`;

  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  const mppOut = metresPerPixel(latitude, zoom, scaleFactor);

  // ---- Neatline ----------------------------------------------------------
  // Drawn first so every panel sits on top of it.
  const lw = 2 * u;
  const roomOutside = Math.min(mr.x, mr.y, W - (mr.x + mr.w), H - (mr.y + mr.h));
  if (showFrame) {
    ctx.lineJoin = 'miter';
    if (roomOutside >= lw) {
      // Framed sheet: the line lives entirely in the white margin, its inner
      // edge flush with the map, so it frames the image without covering any
      // of it.
      ctx.strokeStyle = INK;
      ctx.lineWidth = lw;
      ctx.strokeRect(mr.x - lw / 2, mr.y - lw / 2, mr.w + lw, mr.h + lw);
    } else {
      // Full-bleed: no margin to sit in, so it is inset over the map and needs
      // a white line beneath to stay readable on dark satellite imagery.
      const inset = 10 * u;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 5 * u;
      ctx.strokeRect(mr.x + inset, mr.y + inset, mr.w - inset * 2, mr.h - inset * 2);
      ctx.strokeStyle = INK;
      ctx.lineWidth = lw;
      ctx.strokeRect(mr.x + inset, mr.y + inset, mr.w - inset * 2, mr.h - inset * 2);
    }
  }

  // Panels sit inside the map, clear of the neatline.
  const framePad = showFrame && roomOutside < lw ? 10 * u : 0;
  const left = mr.x + framePad + pad * 0.6;
  const top = mr.y + framePad + pad * 0.6;
  const right = mr.x + mr.w - framePad - pad * 0.6;
  const bottom = mr.y + mr.h - framePad - pad * 0.6;

  const logo = await loadLogo();

  // ---- Title block (top-left) --------------------------------------------
  if (title || subtitle || date) {
    const P = 14 * u;                       // inner padding
    const accentH = 4 * u;                  // brand rule, as on .card in theme.css
    const logoS = logo ? 34 * u : 0;
    const logoGap = logo ? 12 * u : 0;

    const rf = representativeFraction(mppOut, W, paperWidthMm);
    const metaBits = [];
    if (date) {
      metaBits.push(date.toLocaleDateString('en-NZ', {
        day: 'numeric', month: 'long', year: 'numeric',
      }));
    }
    if (rf) metaBits.push(`Scale ${rf}`);
    const meta = metaBits.join('   ·   ');

    // The legend owns the opposite corner, so the title block is capped at 40%
    // of the map width and its text truncated to suit.
    const textCap = mr.w * 0.4 - (P * 2 + logoS + logoGap);

    // Measure before drawing — the panel has to be sized to its contents.
    ctx.font = font(21, '700');
    title = fitText(ctx, title, textCap);
    const titleW = title ? ctx.measureText(title).width : 0;
    ctx.font = font(12);
    subtitle = fitText(ctx, subtitle, textCap);
    const subW = subtitle ? ctx.measureText(subtitle).width : 0;
    ctx.font = font(10, '600');
    const metaW = meta ? ctx.measureText(meta).width : 0;

    const textW = Math.max(titleW, subW, metaW);
    const boxW = P + logoS + logoGap + textW + P;

    const titleH = title ? 26 * u : 0;
    const subH = subtitle ? 17 * u : 0;
    const metaH = meta ? 20 * u : 0;   // includes the divider above it
    const bodyH = Math.max(titleH + subH + metaH, logoS);
    const boxH = accentH + P + bodyH + P * 0.6;

    const x = left;
    const y = top;

    panel(ctx, x, y, boxW, boxH, 5 * u);

    // Accent rule across the top, clipped to the panel's rounded corners.
    ctx.save();
    roundedPath(ctx, x, y, boxW, boxH, 5 * u);
    ctx.clip();
    ctx.fillStyle = TERRACOTTA;
    ctx.fillRect(x, y, boxW, accentH);
    ctx.restore();

    if (logo) {
      ctx.drawImage(logo, x + P, y + accentH + P, logoS, logoS);
    }

    let ty = y + accentH + P;
    const tx = x + P + logoS + logoGap;
    if (title) {
      ctx.font = font(21, '700');
      ctx.fillStyle = OLIVE;
      ctx.fillText(title, tx, ty);
      ty += titleH;
    }
    if (subtitle) {
      ctx.font = font(12);
      ctx.fillStyle = INK;
      ctx.fillText(subtitle, tx, ty);
      ty += subH;
    }
    if (meta) {
      ctx.strokeStyle = HAIRLINE;
      ctx.lineWidth = 1 * u;
      ctx.beginPath();
      ctx.moveTo(tx, ty + 4 * u);
      ctx.lineTo(x + boxW - P, ty + 4 * u);
      ctx.stroke();
      ctx.font = font(10, '600');
      ctx.fillStyle = MUTED;
      ctx.fillText(meta, tx, ty + 9 * u);
    }
  }

  // ---- Legend (top-right) — only what was actually rendered ---------------
  if (showLegend) {
    drawLegend(ctx, {
      sections: legendSections(layerVisibility, { featureTypes }),
      right,
      top,
      maxWidth: mr.w * 0.34,
      u,
      font,
    });
  }

  // ---- Scale bar (bottom-left) -------------------------------------------
  if (showScale) {
    // The export canvas holds the screen's field of view at a higher density,
    // so a zoom level buys `scaleFactor` more output pixels per metre than it
    // does on screen. Passing 1 here makes the bar too long by exactly the
    // paper:screen ratio — on an A3 print, four times too long.
    const targetPx = mr.w * 0.16;
    const targetM = mppOut * targetPx;
    const step = SCALE_STEPS.find((s) => s >= targetM) || SCALE_STEPS[SCALE_STEPS.length - 1];
    const barPx = step / mppOut;

    const boxH = 34 * u;
    const boxW = barPx + 24 * u;
    const x = left;
    const y = bottom - boxH;

    panel(ctx, x, y, boxW, boxH, 5 * u);

    const bx = x + 12 * u;
    const by = y + boxH - 12 * u;

    ctx.strokeStyle = INK;
    ctx.lineWidth = 2 * u;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + barPx, by);
    ctx.moveTo(bx, by - 5 * u);
    ctx.lineTo(bx, by + 5 * u);
    ctx.moveTo(bx + barPx, by - 5 * u);
    ctx.lineTo(bx + barPx, by + 5 * u);
    ctx.stroke();
    // Half-way tick, so the bar can be read at a glance.
    ctx.lineWidth = 1.2 * u;
    ctx.beginPath();
    ctx.moveTo(bx + barPx / 2, by - 3 * u);
    ctx.lineTo(bx + barPx / 2, by + 3 * u);
    ctx.stroke();

    ctx.font = font(10, '700');
    ctx.fillStyle = INK;
    ctx.fillText('0', bx, y + 7 * u);
    ctx.textAlign = 'right';
    ctx.fillText(formatDistance(step), bx + barPx, y + 7 * u);
    ctx.textAlign = 'left';
  }

  // ---- North arrow (bottom-right) ----------------------------------------
  // On a framed sheet the attribution moves off the map into the margin, so the
  // arrow can use the full corner; full-bleed, it has to leave room above it.
  const framed = roomOutside >= lw;
  const attrReserve = framed ? 0 : 26 * u;

  if (showNorth) {
    const boxS = 52 * u;
    const x = right - boxS;
    const y = bottom - attrReserve - boxS;
    panel(ctx, x, y, boxS, boxS, 5 * u);

    const cx = x + boxS / 2;
    const cy = y + boxS / 2 - 3 * u;
    const r = 15 * u;
    ctx.save();
    ctx.translate(cx, cy);
    // Map bearing rotates the world clockwise, so north on the page moves the
    // other way. Without this the arrow lies the moment anyone rotates the map.
    ctx.rotate((-bearing * Math.PI) / 180);
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.55, r * 0.7);
    ctx.lineTo(0, r * 0.3);
    ctx.closePath();
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(-r * 0.55, r * 0.7);
    ctx.lineTo(0, r * 0.3);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2 * u;
    ctx.stroke();
    ctx.restore();

    ctx.font = font(10, '700');
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.fillText('N', cx, y + boxS - 14 * u);
    ctx.textAlign = 'left';
  }

  // ---- Attribution (bottom-right) — MANDATORY ----------------------------
  // It has to be on the sheet, not necessarily on the image. Given a margin it
  // reads better set in the collar under the map, like a source credit; without
  // one it goes back to a chip over the imagery.
  const bottomMargin = H - (mr.y + mr.h);
  // The furniture scales with sheet PIXELS (u) but the margin is a fixed 10 mm
  // of PAPER, and the two part company on a clamped A0: 9u of text is 74 px
  // against a 69 px collar. So the credit is sized to the collar it sits in
  // rather than dropping back onto the map.
  const collarPx = Math.min(9 * u, bottomMargin * 0.42);

  if (framed && collarPx >= 5) {
    ctx.font = fontPx(collarPx);
    ctx.fillStyle = MUTED;
    ctx.textAlign = 'right';
    ctx.fillText(
      ATTRIBUTION,
      mr.x + mr.w,
      mr.y + mr.h + Math.max(2, (bottomMargin - collarPx * 1.2) / 2),
    );
    ctx.textAlign = 'left';
  } else {
    ctx.font = font(9);
    const attrW = ctx.measureText(ATTRIBUTION).width;
    const ax = right - attrW - 6 * u;
    const ay = bottom - 15 * u;
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fillRect(ax - 5 * u, ay - 3 * u, attrW + 10 * u, 15 * u);
    ctx.fillStyle = '#444444';
    ctx.fillText(ATTRIBUTION, ax, ay);
  }

  return canvas;
}

/**
 * The legend panel: an olive header bar, then the shared legendModel rows
 * grouped by section. Sized by measuring first — a legend that clips its own
 * labels is worse than none.
 */
function drawLegend(ctx, { sections, right, top, maxWidth, u, font }) {
  if (!sections.length) return;

  const P = 12 * u;
  const headerH = 24 * u;
  const rowH = 21 * u;
  const sectionH = 17 * u;
  const swatch = 17 * u;
  const gap = 9 * u;

  const labelCap = maxWidth - (P * 2 + swatch + gap);
  let labelW = 0;
  for (const s of sections) {
    ctx.font = font(9, '700');
    labelW = Math.max(labelW, ctx.measureText(s.title.toUpperCase()).width - swatch - gap);
    ctx.font = font(11);
    for (const it of s.items) {
      // Truncated in place so the measure pass and the draw pass agree.
      it.label = fitText(ctx, it.label, labelCap);
      labelW = Math.max(labelW, ctx.measureText(it.label).width);
    }
  }

  const boxW = P + swatch + gap + labelW + P;
  const rows = sections.reduce((n, s) => n + s.items.length, 0);
  const boxH = headerH + sections.length * sectionH + rows * rowH + P;
  const x = right - boxW;

  panel(ctx, x, top, boxW, boxH, 5 * u);

  // Header bar, clipped so it follows the panel's top corners.
  ctx.save();
  roundedPath(ctx, x, top, boxW, boxH, 5 * u);
  ctx.clip();
  ctx.fillStyle = OLIVE;
  ctx.fillRect(x, top, boxW, headerH);
  ctx.restore();

  ctx.font = font(11, '700');
  ctx.fillStyle = '#ffffff';
  ctx.fillText('LEGEND', x + P, top + 7 * u);

  let y = top + headerH + P * 0.5;
  for (const section of sections) {
    ctx.font = font(9, '700');
    ctx.fillStyle = MUTED;
    ctx.fillText(section.title.toUpperCase(), x + P, y + 3 * u);
    y += sectionH;

    for (const row of section.items) {
      drawRowSwatch(ctx, row, x + P, y + (rowH - swatch) / 2, swatch);
      ctx.font = font(11);
      ctx.fillStyle = INK;
      ctx.fillText(row.label, x + P + swatch + gap, y + (rowH - 11 * u) / 2);
      y += rowH;
    }
  }
}

/**
 * Paint one legendModel row into a `size` box with its top-left at (x, y).
 * Mirrors the SVG swatches in MapLegend.jsx element for element — if you change
 * one, change the other, or the two legends start describing different maps.
 */
function drawRowSwatch(ctx, row, x, y, size) {
  if (row.type === 'marker') {
    drawMarkerSwatch(ctx, row.specId, x + size / 2, y + size / 2, size / 2,
                     row.icon ? { icon: row.icon, colour: row.colour } : null);
    return;
  }

  const s = size / 20; // the SVG swatches are authored in a 20x20 box
  if (row.type === 'line') {
    const pts = [[2, 14], [8, 7], [13, 12], [18, 5]];
    const stroke = (color, width) => {
      ctx.beginPath();
      pts.forEach(([px, py], i) => (i ? ctx.lineTo(x + px * s, y + py * s) : ctx.moveTo(x + px * s, y + py * s)));
      ctx.strokeStyle = color;
      ctx.lineWidth = width * s;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([]);
      ctx.stroke();
    };
    stroke(row.casing || '#ffffff', 5);
    stroke(row.color, 2.5);
    return;
  }

  if (row.type === 'area') {
    const rx = x + 2.5 * s;
    const ry = y + 4.5 * s;
    const rw = 15 * s;
    const rh = 11 * s;
    const r = 2 * s;

    // The map's fills are translucent over satellite imagery, so the swatch
    // paints its own dark base first — otherwise a 12% fill on a white panel
    // reads as a completely different colour from the one on the map.
    roundedPath(ctx, rx, ry, rw, rh, r);
    // Same olive-grey stand-in for imagery as the on-screen legend uses; a
    // blue-grey base tinted every translucent fill away from what the map draws.
    ctx.fillStyle = '#646c4c';
    ctx.fill();

    ctx.save();
    ctx.globalAlpha = row.fillOpacity ?? 1;
    roundedPath(ctx, rx, ry, rw, rh, r);
    ctx.fillStyle = row.fill;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = row.outlineOpacity ?? 1;
    roundedPath(ctx, rx, ry, rw, rh, r);
    ctx.strokeStyle = row.outline;
    // Halved for the same reason the SVG halves it: the map draws at map scale,
    // this is a 20-unit box, and the raw width swamps it.
    ctx.lineWidth = Math.max(1, (row.outlineWidth ?? 2) / 2) * s;
    ctx.setLineDash(row.dash ? row.dash.map((d) => d * 2 * s) : []);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}

/** A white card with a hairline border — the shared look for every panel. */
function panel(ctx, x, y, w, h, r) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.18)';
  ctx.shadowBlur = r * 1.6;
  ctx.shadowOffsetY = r * 0.3;
  roundedPath(ctx, x, y, w, h, r);
  ctx.fillStyle = PANEL_BG;
  ctx.fill();
  ctx.restore();

  roundedPath(ctx, x, y, w, h, r);
  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = Math.max(1, r / 5);
  ctx.stroke();
}

/** Rounded-rectangle path. Leaves the path current so callers can fill/clip. */
function roundedPath(ctx, x, y, w, h, r) {
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
}
