// maps-v2/utils/mapExport.js — Render the map to a print-resolution image.
//
// WHY AN OFF-SCREEN MAP, not the live one
// ---------------------------------------
// `map.getCanvas().toDataURL()` on the interactive map returns a BLANK image:
// WebGL clears its drawing buffer after each frame unless the context was
// created with `preserveDrawingBuffer: true`. It fails silently — you get a
// valid PNG of nothing — which is the single most common way map export goes
// wrong.
//
// Setting that flag on the live map would work, but it taxes every frame of
// every pan and zoom for a feature used occasionally, AND it still gives the
// wrong output: whatever size and DPI the browser window happens to be.
//
// So exports get their own short-lived map, built at the requested pixel size
// with the flag on, and destroyed immediately after. Same code path serves
// "print what I'm looking at" and "print this block at A3" — only the bounds
// and size differ.
import mapboxgl from 'mapbox-gl';
import { registerMapIcons } from './mapIcons';
import { MANAGEMENT_LAYERS } from '../components/managementLayerRegistry';

// Paper sizes in millimetres, portrait (w x h). A0-A4 per Pete.
export const PAPER_SIZES = {
  A0: { w: 841, h: 1189, label: 'A0' },
  A1: { w: 594, h: 841, label: 'A1' },
  A2: { w: 420, h: 594, label: 'A2' },
  A3: { w: 297, h: 420, label: 'A3' },
  A4: { w: 210, h: 297, label: 'A4' },
};

export const DPI_OPTIONS = [96, 150, 200, 300];

// Browsers cap canvas dimensions (and WebGL renderbuffers) well below what A0
// at 300 dpi would need — A0 is 9933 x 14043 px, which no mainstream browser
// will allocate. Rather than hand back a blank or truncated image, the size is
// clamped and the caller is told what it actually got.
//
// 8192 is a deliberately conservative ceiling: Chrome/Firefox on desktop
// typically manage 16384, but plenty of tablet GPUs stop at 4096-8192, and this
// runs on tablets in the field.
export const MAX_CANVAS_PX = 8192;

/** Pixel dimensions for a paper size at a DPI, honouring orientation. */
export function paperPixels(paperKey, dpi, orientation = 'landscape') {
  const paper = PAPER_SIZES[paperKey] || PAPER_SIZES.A4;
  const mmW = orientation === 'portrait' ? paper.w : paper.h;
  const mmH = orientation === 'portrait' ? paper.h : paper.w;
  const pxPerMm = dpi / 25.4;
  return { width: Math.round(mmW * pxPerMm), height: Math.round(mmH * pxPerMm) };
}

/**
 * Clamp a requested size to something the browser will actually allocate.
 * Returns { width, height, scale, clamped } — `scale` < 1 means the effective
 * DPI is lower than asked for, and the caller MUST surface that rather than
 * quietly hand over a lower-resolution file than the user chose.
 */
export function clampToCanvasLimit({ width, height }, limit = MAX_CANVAS_PX) {
  const longest = Math.max(width, height);
  if (longest <= limit) return { width, height, scale: 1, clamped: false };
  const scale = limit / longest;
  return {
    width: Math.floor(width * scale),
    height: Math.floor(height * scale),
    scale,
    clamped: true,
  };
}

/** Effective DPI after clamping, for the "we gave you less" message. */
export function effectiveDpi(requestedDpi, scale) {
  return Math.round(requestedDpi * scale);
}

/**
 * Strip the layers the user unticked out of a cloned style.
 *
 * Only layers this app added are considered — basemap layers (roads, labels,
 * satellite raster) are always kept, because they are the map, not a data
 * overlay. Anything not owned by a registry entry is left alone, which is why
 * `mapLayerIds` has to stay in step with the hooks.
 */
function filterStyleLayers(style, layerVisibility) {
  const hiddenIds = new Set();
  for (const entry of MANAGEMENT_LAYERS) {
    if (layerVisibility[entry.id]) continue;
    for (const id of entry.mapLayerIds || []) hiddenIds.add(id);
  }

  // Drawing artefacts must never appear on a print — the dashed draft polygon
  // and MapboxDraw's own vertex handles are editing chrome, not map content.
  const layers = style.layers.filter((l) => {
    if (hiddenIds.has(l.id)) return false;
    if (l.id.startsWith('gl-draw-')) return false;
    if (l.id.startsWith('v2-draw-draft')) return false;
    return true;
  });

  return { ...style, layers };
}

/**
 * Render the map off-screen at an arbitrary size and return a canvas.
 *
 * @param {mapboxgl.Map} liveMap  the on-screen map, cloned for its style + camera
 * @param {Object} opts
 * @param {number} opts.width      output px
 * @param {number} opts.height     output px
 * @param {Object} opts.layerVisibility  registry id -> boolean
 * @param {Object} [opts.bounds]   LngLatBounds to fit; defaults to the live view
 * @param {number} [opts.timeoutMs=45000]
 * @returns {Promise<HTMLCanvasElement>}
 */
export function renderMapToCanvas(liveMap, {
  width,
  height,
  layerVisibility,
  bounds = null,
  timeoutMs = 45000,
}) {
  return new Promise((resolve, reject) => {
    if (!liveMap) return reject(new Error('No map to export'));

    // Off-screen but still in the document: Mapbox needs a laid-out container
    // with real dimensions to size its canvas. `visibility:hidden` would still
    // reserve space and can suppress painting in some engines, so it is parked
    // far off-viewport at its true size instead.
    const container = document.createElement('div');
    container.style.cssText =
      `position:fixed;left:-20000px;top:0;width:${width}px;height:${height}px;pointer-events:none;`;
    document.body.appendChild(container);

    let exportMap = null;
    let settled = false;
    let timer = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      try { exportMap?.remove(); } catch { /* already gone */ }
      try { container.remove(); } catch { /* already gone */ }
    };

    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    try {
      const style = filterStyleLayers(liveMap.getStyle(), layerVisibility);

      exportMap = new mapboxgl.Map({
        container,
        style,
        center: liveMap.getCenter(),
        zoom: liveMap.getZoom(),
        bearing: liveMap.getBearing(),
        pitch: liveMap.getPitch(),
        interactive: false,
        attributionControl: false, // composited manually; see drawChrome()
        // THE flag. Without it the canvas reads back blank — see the file header.
        preserveDrawingBuffer: true,
        fadeDuration: 0, // don't capture a half-faded label transition
      });

      if (bounds) {
        exportMap.fitBounds(bounds, { padding: 40, animate: false });
      }

      timer = setTimeout(
        () => fail(new Error('Map export timed out waiting for tiles to load')),
        timeoutMs,
      );

      exportMap.on('error', (e) => {
        // Tile 404s and missing sprites fire here but are not fatal to the
        // render, so they are logged rather than thrown. A genuine failure
        // surfaces as the timeout above.
        console.warn('Export map error (continuing):', e?.error?.message || e);
      });

      exportMap.once('style.load', () => {
        // Marker images live outside the style JSON, so a cloned style has none
        // of them. Without this every symbol layer renders nothing and the POI,
        // task, observation and asset markers are simply absent from the print.
        registerMapIcons(exportMap);
      });

      // 'idle' — NOT 'load'. `load` fires once the style and the first tiles are
      // in; `idle` waits until no further rendering is queued, which is the only
      // signal that every tile, glyph and sprite has actually painted. Reading
      // the canvas on `load` yields a half-drawn map.
      exportMap.once('idle', () => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        try {
          const src = exportMap.getCanvas();
          // Copy into a plain 2D canvas immediately: the WebGL canvas belongs to
          // the map and is destroyed with it, and drawing chrome onto a WebGL
          // context is not possible anyway.
          const out = document.createElement('canvas');
          out.width = src.width;
          out.height = src.height;
          out.getContext('2d').drawImage(src, 0, 0);
          cleanup();
          resolve(out);
        } catch (err) {
          cleanup();
          reject(err);
        }
      });
    } catch (err) {
      fail(err);
    }
  });
}

export function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas is empty — nothing to export'))),
      type,
      quality,
    );
  });
}

/** Trigger a browser download for a blob. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick — revoking synchronously can cancel the download
  // in some browsers before it has started reading the blob.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Filename-safe slug for the title. */
export function exportFilename(title, ext) {
  const base = (title || 'map').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'map';
  return `${base}.${ext}`;
}
