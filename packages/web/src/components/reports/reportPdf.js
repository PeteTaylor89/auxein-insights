// components/reports/reportPdf.js — branded PDF for any report.
//
// One generator for all ten reports, so a compliance pack printed from Site
// Access looks like one printed from the Census. A report supplies a title,
// some headline figures and its tables; everything about how a page looks is
// decided here.
//
// NOT the same machinery as the map export. That writes a PDF by hand around a
// JPEG via /DCTDecode, which is perfect for one full-page image and useless for
// text and tables. This is jsPDF + autotable, which is the other way round.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoMark from '../../assets/logo-mark.png';

// Brand palette, mirroring styles/theme.css. jsPDF wants RGB triples.
const OLIVE = [91, 104, 48];
const TERRACOTTA = [209, 88, 59];
const INK = [47, 47, 47];
const MUTED = [107, 114, 128];
const HAIRLINE = [222, 222, 218];

const MARGIN = 14;      // mm
const HEADER_H = 26;    // mm — brand band at the top of page 1

/** The logo, loaded once. Never rejects: a PDF without the mark beats no PDF. */
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

const fmt = (v) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  return String(v);
};

/**
 * Plain text for a cell.
 *
 * Screen columns render JSX — pills, badges, formatted dates — which cannot go
 * into a PDF. A column therefore carries an optional `text(row)` alongside its
 * `render(row)`; without one the raw field is used. Keeping both on the same
 * column definition is what stops the printed table drifting from the screen.
 */
const cellText = (col, row) => {
  if (col.text) return fmt(col.text(row));
  return fmt(row[col.key]);
};

function drawHeader(doc, { title, subtitle, company, logo }) {
  const w = doc.internal.pageSize.getWidth();

  doc.setFillColor(...OLIVE);
  doc.rect(0, 0, w, HEADER_H, 'F');
  doc.setFillColor(...TERRACOTTA);
  doc.rect(0, HEADER_H, w, 1.2, 'F');

  let textX = MARGIN;
  if (logo) {
    // The mark is square; box it so a future non-square asset cannot distort.
    const s = 14;
    doc.addImage(logo, 'PNG', MARGIN, (HEADER_H - s) / 2, s, s);
    textX = MARGIN + s + 5;
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(title, textX, subtitle ? 12.5 : 15.5);

  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text(subtitle, textX, 18.5);
  }

  if (company) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(company, w - MARGIN, 15.5, { align: 'right' });
  }
}

/** Page numbers and the generated stamp, applied to every page at the end. */
function drawFooters(doc, generatedLabel) {
  const pages = doc.internal.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, h - 12, w - MARGIN, h - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(generatedLabel, MARGIN, h - 7.5);
    doc.text(`Page ${i} of ${pages}`, w - MARGIN, h - 7.5, { align: 'right' });
  }
}

/** The filter line — what this report is actually OF. */
function drawContext(doc, y, lines) {
  if (!lines.length) return y;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(lines.join('   ·   '), MARGIN, y);
  return y + 6;
}

/**
 * Headline figures as a row of boxed stats.
 * Wraps to a second row rather than shrinking below legibility.
 */
function drawStats(doc, y, stats) {
  if (!stats || !stats.length) return y;

  const w = doc.internal.pageSize.getWidth();
  const usable = w - MARGIN * 2;
  const perRow = Math.min(4, stats.length);
  const boxW = usable / perRow;
  const boxH = 16;

  stats.forEach((s, i) => {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const x = MARGIN + col * boxW;
    const yy = y + row * (boxH + 2);

    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.2);
    doc.roundedRect(x + 1, yy, boxW - 2, boxH, 1.5, 1.5, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    // A figure that means someone must act prints in the accent colour, the
    // same rule the screen uses — and only when it is non-zero, or a red zero
    // teaches people to ignore the colour.
    doc.setTextColor(...(s.alert && s.value && s.value !== '0' ? TERRACOTTA : INK));
    doc.text(fmt(s.value), x + 4, yy + 7.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(String(s.label).toUpperCase(), x + 4, yy + 12.5);
  });

  const rows = Math.ceil(stats.length / perRow);
  return y + rows * (boxH + 2) + 4;
}

/**
 * Build and save a report PDF.
 *
 * @param {Object} spec
 * @param {string} spec.title
 * @param {string} [spec.subtitle]
 * @param {string} [spec.company]
 * @param {string[]} [spec.context]  filter lines: date range, property, …
 * @param {Array} [spec.stats]       [{ label, value, alert }]
 * @param {Array} spec.sections      [{ title, columns, rows, note }]
 * @param {string} spec.filename
 * @param {'portrait'|'landscape'} [spec.orientation='landscape']
 */
export async function buildReportPdf({
  title,
  subtitle,
  company,
  context = [],
  stats = [],
  sections = [],
  filename,
  orientation = 'landscape',
}) {
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const logo = await loadLogo();

  drawHeader(doc, { title, subtitle, company, logo });

  let y = HEADER_H + 9;
  y = drawContext(doc, y, context);
  y = drawStats(doc, y, stats);

  for (const section of sections) {
    if (!section.rows || section.rows.length === 0) continue;

    if (section.title) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(...OLIVE);
      doc.text(section.title, MARGIN, y + 1);
      y += 5;
    }

    if (section.note) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      const wrapped = doc.splitTextToSize(section.note, doc.internal.pageSize.getWidth() - MARGIN * 2);
      doc.text(wrapped, MARGIN, y + 1);
      y += wrapped.length * 3.6 + 2;
    }

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN, bottom: 18 },
      head: [section.columns.map((c) => c.label)],
      body: section.rows.map((r) => section.columns.map((c) => cellText(c, r))),
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: 1.8,
        textColor: INK,
        lineColor: HAIRLINE,
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: OLIVE,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.5,
      },
      alternateRowStyles: { fillColor: [248, 248, 245] },
      columnStyles: Object.fromEntries(
        section.columns.map((c, i) => [i, { halign: c.align || 'left' }]),
      ),
      // Every page after the first gets the table header repeated but not the
      // brand band — a 26mm band on every page wastes a third of a landscape
      // A4 once a census runs to five pages.
      showHead: 'everyPage',
    });

    y = (doc.lastAutoTable?.finalY ?? y) + 8;
  }

  if (sections.every((s) => !s.rows || s.rows.length === 0)) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text('No data for this selection.', MARGIN, y + 4);
  }

  const generated = new Date().toLocaleString('en-NZ', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  drawFooters(doc, `Auxein Grow · generated ${generated}`);

  doc.save(filename);
}

/**
 * A `[{status|category, count}]` breakdown as a PDF section.
 *
 * The five original reports show these as bar charts on screen; bars do not
 * survive a print without turning into a chart library, and the number is the
 * point anyway, so they print as a two-column table.
 */
export function countSection(title, list, keyField) {
  return {
    title,
    columns: [
      { key: 'key', label: title.replace(/^By /, '') },
      { key: 'count', label: 'Count', align: 'right' },
    ],
    rows: (list || []).map((r) => ({
      key: String(r[keyField] ?? '').replace(/_/g, ' '),
      count: r.count,
    })),
  };
}

/** The standard context lines, so every report words its filters identically. */
export function contextLines({ startDate, endDate, propertyName, extra }) {
  const lines = [];
  if (startDate || endDate) {
    const from = startDate ? new Date(startDate).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }) : 'the beginning';
    const to = endDate ? new Date(endDate).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }) : 'today';
    lines.push(`${from} – ${to}`);
  }
  lines.push(propertyName ? `Property: ${propertyName}` : 'All properties');
  if (extra) lines.push(extra);
  return lines;
}
