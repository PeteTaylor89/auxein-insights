// maps-v2/utils/pdfExport.js — Wrap an exported map image in a PDF.
//
// WHY THERE IS NO PDF LIBRARY HERE
// --------------------------------
// The project has no PDF dependency (backend has Pillow, web has mapbox/turf
// and nothing else), and adding jsPDF for one feature means a dependency, a
// lockfile change and an npm install before anyone can build.
//
// A single-full-page-image PDF does not need a library. PDF supports embedding
// a JPEG byte-for-byte via the /DCTDecode filter, so the JPEG the canvas already
// produces is copied in verbatim — no recompression, no deflate, no zlib. What
// is left is ~60 lines of object plumbing and a correct xref table.
//
// This is deliberately NOT a general PDF writer. It does exactly one thing:
// one page, one image, filling the page. If PDFs ever need text, vector overlays
// or multiple pages, stop extending this and take the jsPDF dependency.
//
// NOTE: JPEG, not PNG. PNG in PDF needs /FlateDecode and a zlib implementation.
// Map imagery is photographic (satellite raster), so JPEG at high quality is the
// right format anyway — but it does mean labels and outlines get very slight
// compression artefacts. Users wanting a lossless file should export PNG.

const PT_PER_MM = 72 / 25.4;

/** Serialise a JS string to bytes (PDF structure is ASCII/Latin-1). */
function latin1Bytes(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i += 1) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}

/**
 * Build a one-page PDF containing `jpegBytes` scaled to fill the page.
 *
 * @param {Uint8Array} jpegBytes  raw JPEG file bytes
 * @param {number} pxWidth        image pixel width
 * @param {number} pxHeight       image pixel height
 * @param {number} pageWmm        page width in millimetres
 * @param {number} pageHmm        page height in millimetres
 * @returns {Blob} application/pdf
 */
export function jpegToPdfBlob(jpegBytes, pxWidth, pxHeight, pageWmm, pageHmm) {
  const pageW = +(pageWmm * PT_PER_MM).toFixed(2);
  const pageH = +(pageHmm * PT_PER_MM).toFixed(2);

  const chunks = [];
  let length = 0;
  const offsets = []; // byte offset of each object, indexed from 1

  const push = (bytes) => {
    chunks.push(bytes);
    length += bytes.length;
  };
  const pushStr = (s) => push(latin1Bytes(s));
  const startObject = (n) => { offsets[n] = length; };

  pushStr('%PDF-1.4\n');
  // Binary comment marks the file as containing binary data, so naive tools
  // don't mangle it as text.
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  startObject(1);
  pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  startObject(2);
  pushStr('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  startObject(3);
  pushStr(
    '3 0 obj\n<< /Type /Page /Parent 2 0 R '
    + `/MediaBox [0 0 ${pageW} ${pageH}] `
    + '/Resources << /XObject << /Im0 5 0 R >> >> '
    + '/Contents 4 0 R >>\nendobj\n',
  );

  // Content stream: scale the unit image to the full page.
  // `q ... Q` brackets the graphics state so the CTM change is scoped.
  const content = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im0 Do\nQ\n`;
  startObject(4);
  pushStr(`4 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);

  startObject(5);
  pushStr(
    '5 0 obj\n<< /Type /XObject /Subtype /Image '
    + `/Width ${pxWidth} /Height ${pxHeight} `
    + '/ColorSpace /DeviceRGB /BitsPerComponent 8 '
    + `/Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`,
  );
  push(jpegBytes);
  pushStr('\nendstream\nendobj\n');

  const xrefOffset = length;
  const objCount = 6; // 0 (free) + 5 real objects
  let xref = `xref\n0 ${objCount}\n0000000000 65535 f \n`;
  for (let i = 1; i < objCount; i += 1) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pushStr(xref);
  pushStr(
    `trailer\n<< /Size ${objCount} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );

  return new Blob(chunks, { type: 'application/pdf' });
}

/** Canvas -> JPEG bytes. */
export async function canvasToJpegBytes(canvas, quality = 0.92) {
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Canvas is empty — nothing to export'))),
      'image/jpeg',
      quality,
    );
  });
  return new Uint8Array(await blob.arrayBuffer());
}
