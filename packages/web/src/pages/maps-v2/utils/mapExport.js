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
//
// HOW THE FIELD OF VIEW IS HELD
// -----------------------------
// Mapbox zoom is metres-per-PIXEL, not a field of view. Carrying the live zoom
// straight onto a print-sized canvas therefore shows far MORE ground, in exact
// proportion to the extra pixels — A3 at 300 dpi against a 1200 px map is 4x
// wider, so it prints 16x the area and the block you were looking at becomes a
// speck. That is a size change masquerading as a zoom change.
//
// The fix is to make the extra pixels DENSER, not WIDER: the off-screen map is
// laid out at (near enough) the on-screen CSS size and rendered at a pixel
// ratio equal to the paper:screen ratio. Ground coverage then matches the
// screen, and every label, icon and line width scales with the paper instead of
// staying screen-sized on a five-thousand-pixel sheet.
//
// Aspect ratio cannot match — a 16:9 screen is not 1.41:1 paper — so the export
// CONTAINS the on-screen view and picks up a little extra on one axis. Extra is
// the only safe direction; cropping would silently drop something you could see.
import mapboxgl from 'mapbox-gl';
import { registerMapIcons, registerKnownPoiMarkers } from './mapIcons';
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

// White margin around the map image on a framed sheet. Expressed in millimetres
// because it is a property of the PAPER, not of the pixels — 10 mm reads the
// same on A4 as on A0, where 3% of the width would be a 25 mm border.
export const SHEET_MARGIN_MM = 10;

/**
 * The margin in output pixels for a given sheet.
 * Falls back to a proportion of the short edge if the paper size is unknown,
 * which should not happen from the print dialog but is not worth crashing over.
 */
export function sheetMarginPx(sheetWidthPx, sheetHeightPx, paperWidthMm, marginMm = SHEET_MARGIN_MM) {
  if (!paperWidthMm) return Math.round(Math.min(sheetWidthPx, sheetHeightPx) * 0.03);
  return Math.round(marginMm * (sheetWidthPx / paperWidthMm));
}

/**
 * Split a sheet into the white margin and the map image inside it.
 * `margin: 0` gives the full-bleed sheet back unchanged.
 */
export function sheetLayout(sheetWidthPx, sheetHeightPx, margin) {
  const m = Math.max(0, Math.min(margin, Math.floor(Math.min(sheetWidthPx, sheetHeightPx) / 4)));
  return {
    margin: m,
    mapWidth: Math.max(1, sheetWidthPx - m * 2),
    mapHeight: Math.max(1, sheetHeightPx - m * 2),
  };
}

// Bounds on the paper:screen density ratio. Below 0.25 the render is so soft it
// is not worth producing; above 8 the glyph atlases and raster overzoom cost
// more than the detail is worth, and 8 already covers A0 against a laptop.
const MIN_RENDER_RATIO = 0.25;
const MAX_RENDER_RATIO = 8;

/**
 * Work out the off-screen map's layout size and pixel ratio so that its field
 * of view CONTAINS the live map's.
 *
 * Both maps run at the same zoom, so ground-per-CSS-pixel is identical; the
 * export container is sized in CSS pixels to be at least as large as the live
 * one, and the pixel ratio makes up the difference to the requested output.
 *
 * `min()` on the two axes is what makes it contain rather than crop: the
 * constraining axis is the one where the paper is proportionally narrowest, and
 * matching it means the other axis can only gain.
 */
export function exportLayout(liveMap, width, height) {
  const cv = liveMap.getCanvas();
  // clientWidth is CSS pixels; `.width` is the backing store and already has
  // devicePixelRatio baked in, which would double the ratio on a retina screen.
  const srcW = cv.clientWidth || cv.width || 1;
  const srcH = cv.clientHeight || cv.height || 1;

  const ratio = Math.min(
    MAX_RENDER_RATIO,
    Math.max(MIN_RENDER_RATIO, Math.min(width / srcW, height / srcH)),
  );

  const cssW = Math.max(1, Math.round(width / ratio));
  const cssH = Math.max(1, Math.round(height / ratio));

  // Rounding the CSS size moves the true density a hair off `ratio`; the scale
  // bar is drawn against the OUTPUT canvas, so report what actually landed.
  return { cssW, cssH, ratio, scaleFactor: width / cssW };
}

/**
 * Render denser than the screen for the duration of one export.
 *
 * GL JS v3 has no per-map density option — `pixelRatio` is not a `MapOptions`,
 * and there is no `setPixelRatio`. The buffer size comes from a live getter on
 * `window.devicePixelRatio`, so shadowing that global is the only lever. This is
 * what every Mapbox export plugin does, and it is why the override is put back
 * the moment the canvas has been read.
 *
 * Returns a restore function and never throws: if the property turns out to be
 * non-configurable, the export still FRAMES correctly — the container is
 * screen-sized either way — it is just rendered at screen density and resampled
 * up. Softer, not wrong.
 */
function overrideDevicePixelRatio(ratio) {
  const noop = () => {};
  try {
    // On Chrome the property lives on Window.prototype, so there is usually no
    // own descriptor to save and the restore is a `delete` that unshadows it.
    const own = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
    Object.defineProperty(window, 'devicePixelRatio', {
      get: () => ratio,
      configurable: true,
    });
    return () => {
      try {
        if (own) Object.defineProperty(window, 'devicePixelRatio', own);
        else delete window.devicePixelRatio;
      } catch { /* nothing sane left to do */ }
    };
  } catch {
    return noop;
  }
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
 * Render the map off-screen at an arbitrary size, holding the live field of view.
 *
 * @param {mapboxgl.Map} liveMap  the on-screen map, cloned for its style + camera
 * @param {Object} opts
 * @param {number} opts.width      output px
 * @param {number} opts.height     output px
 * @param {Object} opts.layerVisibility  registry id -> boolean
 * @param {Object} [opts.bounds]   LngLatBounds to fit; defaults to the live view
 * @param {number} [opts.timeoutMs=45000]
 * @returns {Promise<{canvas: HTMLCanvasElement, scaleFactor: number,
 *                    center: mapboxgl.LngLat, zoom: number, bearing: number}>}
 *          The camera is read back off the export map, not copied from the live
 *          one, so it stays right when `bounds` overrides it — the scale bar
 *          depends on that zoom and would otherwise lie.
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

    // The container is laid out at roughly the SCREEN's size, not the paper's —
    // see the file header. The density override below turns those CSS pixels
    // into the full print-resolution buffer.
    const { cssW, cssH, ratio, scaleFactor } = exportLayout(liveMap, width, height);

    // Off-screen but still in the document: Mapbox needs a laid-out container
    // with real dimensions to size its canvas. `visibility:hidden` would still
    // reserve space and can suppress painting in some engines, so it is parked
    // far off-viewport at its true size instead.
    const container = document.createElement('div');
    container.style.cssText =
      `position:fixed;left:-20000px;top:0;width:${cssW}px;height:${cssH}px;pointer-events:none;`;
    document.body.appendChild(container);

    let exportMap = null;
    let settled = false;
    let timer = null;
    let restoreDpr = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      try { exportMap?.remove(); } catch { /* already gone */ }
      try { container.remove(); } catch { /* already gone */ }
      // Put the global back BEFORE touching the live map. If it resized while
      // the override was up — a ResizeObserver firing as the dialog opens is
      // enough — its backing store is now several times too large, which on a
      // tablet GPU is a context loss waiting to happen. resize() re-reads the
      // real ratio and puts it right.
      restoreDpr?.();
      restoreDpr = null;
      try { liveMap.resize(); } catch { /* map already torn down */ }
    };

    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    try {
      const style = filterStyleLayers(liveMap.getStyle(), layerVisibility);

      // Must be in place before construction — the canvas is sized in the Map
      // constructor — and it stays up until the pixels have been read back.
      restoreDpr = overrideDevicePixelRatio(ratio);

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
        // The fixed markers above are only half of it now. A company POI type
        // draws with an image built on demand for its (icon, colour) pair, and
        // those are not in MARKER_SPECS — so the clone replays whatever the live
        // map registered. Skip this and custom POIs render perfectly on screen
        // and come out blank on the sheet.
        registerKnownPoiMarkers(exportMap);
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
          const center = exportMap.getCenter();
          const zoom = exportMap.getZoom();
          const bearing = exportMap.getBearing();
          // Copy into a plain 2D canvas immediately: the WebGL canvas belongs to
          // the map and is destroyed with it, and drawing chrome onto a WebGL
          // context is not possible anyway.
          //
          // Sized to the REQUESTED pixels, not the buffer's: rounding cssW/cssH
          // can leave the buffer a pixel or two out, and the PDF writer maps
          // canvas pixels onto a fixed paper size.
          const out = document.createElement('canvas');
          out.width = width;
          out.height = height;
          out.getContext('2d').drawImage(src, 0, 0, src.width, src.height, 0, 0, width, height);
          cleanup();
          resolve({ canvas: out, scaleFactor, center, zoom, bearing });
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
