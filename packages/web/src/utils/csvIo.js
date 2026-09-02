// utils/csvIo.js — CSV round-trip primitives shared by the asset, block and row
// importers.
//
// The workflow this exists for: export what is already in the register, edit it
// in Excel, upload it back. That is a different job from a one-way import, and
// two rules fall out of it:
//
//   1. Lines are matched on the BUSINESS key the user already owns — an asset
//      number, a block name, a block plus row number. Database ids never appear
//      in the file: a primary key is meaningless to read, and one stray edit
//      would repoint a line at a different record with nothing to notice it.
//      The cost, stated plainly: changing a business key in the sheet reads as
//      a new record, not a rename. Renaming belongs on screen, and the change
//      preview shows the addition before anything is written.
//   2. A column PRESENT in the file is authoritative — a blank cell clears the
//      field. To leave a field alone you delete its whole column. This is what
//      makes the round-trip exact: what you see in the sheet is what the
//      database holds afterwards. It also means the parser must distinguish
//      "column absent" from "column present but empty", which a naive parser
//      that skips empty cells cannot do.
//
// Parsing is hand-rolled: the format is small enough that a dependency isn't
// worth it, but it does handle quoted fields containing commas, doubled quotes
// and the BOM Excel writes.

// ---------------------------------------------------------------------------
// Column spec
// ---------------------------------------------------------------------------
// Each entity passes an array of column definitions:
//   {
//     key:       field name sent to the API
//     header:    header written on export
//     aliases:   extra headers accepted on import (normalised)
//     type:      'string' | 'lower' | 'int' | 'number' | 'bool' | 'date'
//     required:  a blank cell is an error, not a clear
//     readOnly:  exported for orientation, ignored on import
//     clearable: false = a blank cell leaves the field alone (for columns with
//                a server-side default, where NULL is not a real state)
//     enum:      allowed values; anything else is a per-line error
//   }

const normaliseHeader = (h) => h.trim().toLowerCase().replace(/\s+/g, '_').replace(/^﻿/, '');

/**
 * Split one CSV line, respecting double-quoted fields.
 * "a,b" stays one field; "" inside a quoted field is a literal quote.
 */
export function splitCsvLine(line) {
  const out = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else current += char;
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      out.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  out.push(current);
  return out.map(v => v.trim());
}

const TRUE_WORDS = new Set(['true', 'yes', 'y', '1', 't']);
const FALSE_WORDS = new Set(['false', 'no', 'n', '0', 'f']);

const MONTH_NAMES = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Two-digit years: 70-99 are 1900s, 00-69 are 2000s.
 * A planted_date of '98 means 1998, not 2098 — and vines planted in 2069 are
 * not this decade's problem.
 */
const expandYear = (y) => (y.length === 4 ? Number(y) : (Number(y) >= 70 ? 1900 + Number(y) : 2000 + Number(y)));

/** Build an ISO date, rejecting the ones that do not exist (31 February). */
function isoDate(year, month, day) {
  if (!(month >= 1 && month <= 12) || !(day >= 1 && day <= 31)) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Parse a date written the way people here write them, and normalise to ISO.
 *
 * THE MONTH IS ALWAYS IN THE MIDDLE. That single rule covers both forms that
 * matter — `01/08/2011` and `2011-08-01` — and excludes the American
 * `08/01/2011`, which would otherwise make every ambiguous date a coin toss
 * between two real dates with nothing to signal which was meant.
 *
 * This exists because the export writes ISO and Excel does not give it back.
 * Open the file in a New Zealand locale and `2011-08-01` is displayed and then
 * SAVED as `01/08/2011`, so a strict ISO parser rejected every date column on
 * a file the user had merely opened and closed.
 *
 * Accepted:
 *   2011-08-01  2011/08/01        year first, month middle
 *   01/08/2011  1-8-2011  1.8.11  day first, month middle
 *   1-Aug-2011  01 Aug 11         day first, month named
 * Rejected on purpose:
 *   08/25/2011                    month first — the middle value is not a month
 *
 * Returns an ISO string, or null.
 */
function parseFlexibleDate(raw) {
  // Excel sometimes appends midnight to a date cell.
  const t = String(raw).trim().replace(/[T\s]+\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\s*(am|pm|z)?$/i, '').trim();
  if (!t) return null;

  // Year first: 2011-08-01, 2011/08/01
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return isoDate(Number(m[1]), Number(m[2]), Number(m[3]));

  // Day first, month named: 1-Aug-2011, 01 Aug 11, 1/Sept/2011
  m = t.match(/^(\d{1,2})[-/.\s]([A-Za-z]{3,9})[-/.\s](\d{2}|\d{4})$/);
  if (m) {
    const month = MONTH_NAMES[m[2].toLowerCase().slice(0, 3)];
    if (!month) return null;
    return isoDate(expandYear(m[3]), month, Number(m[1]));
  }

  // Day first, numeric: 01/08/2011, 1-8-11, 1.8.2011
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) return isoDate(expandYear(m[3]), Number(m[2]), Number(m[1]));

  return null;
}

/**
 * Turn one raw cell into a typed value.
 * Returns { value } or { error } — a bad number is a row error, never a silent
 * drop, because a silently dropped cell reads to the user as a saved edit that
 * did not save.
 */
function coerce(raw, col) {
  switch (col.type) {
    case 'int': {
      const n = Number(raw);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        return { error: `${col.header} must be a whole number (got "${raw}")` };
      }
      return { value: n };
    }
    case 'number': {
      const n = Number(raw);
      if (!Number.isFinite(n)) return { error: `${col.header} must be a number (got "${raw}")` };
      return { value: n };
    }
    case 'bool': {
      const v = raw.toLowerCase();
      if (TRUE_WORDS.has(v)) return { value: true };
      if (FALSE_WORDS.has(v)) return { value: false };
      return { error: `${col.header} must be true or false (got "${raw}")` };
    }
    case 'date': {
      // Day first or year first — the month is always the middle value. See
      // parseFlexibleDate for why the American order is refused rather than
      // guessed at.
      const iso = parseFlexibleDate(raw);
      if (!iso) {
        return {
          error: `${col.header} "${raw}" is not a date this understands — write it `
            + 'day first (01/08/2011) or year first (2011-08-01). The month is always '
            + 'the middle number, so 08/25/2011 is refused rather than guessed at.',
        };
      }
      return { value: iso };
    }
    case 'lower':
      return { value: raw.toLowerCase() };
    default:
      return { value: raw };
  }
}

/**
 * Parse a CSV against a column spec.
 *
 * @returns {{
 *   rows: Array<{ line_number: number, values: Object, errors: string[] }>,
 *   presentKeys: string[],   // writable columns actually found in the file
 *   problems: string[],      // file-level issues; any starting "Missing" blocks the upload
 * }}
 *
 * `values` holds a key for every writable column present in the file, with
 * `null` for a blank cell. Callers rely on key-presence to mean "this column is
 * being written", so never add keys for absent columns.
 */
export function parseCsvWithSpec(text, columns) {
  const clean = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = clean.split('\n').filter(l => l.trim().length > 0);
  if (lines.length < 2) {
    return { rows: [], presentKeys: [], problems: ['The file needs a header row and at least one data row.'] };
  }

  // Header -> column, accepting the canonical header and any alias.
  const lookup = new Map();
  columns.forEach(col => {
    lookup.set(normaliseHeader(col.header), col);
    (col.aliases || []).forEach(a => lookup.set(normaliseHeader(a), col));
  });

  const headers = splitCsvLine(lines[0]).map(normaliseHeader);
  const mapped = headers.map(h => lookup.get(h) || null);

  const problems = [];
  const seenHeaders = new Set();
  headers.forEach((h, i) => {
    if (!mapped[i]) return;
    if (seenHeaders.has(mapped[i].key)) {
      problems.push(`Column "${h}" appears twice — the rightmost one wins.`);
    }
    seenHeaders.add(mapped[i].key);
  });

  // A required column that is absent blocks the upload outright; the user has
  // deleted something we cannot reconstruct.
  columns.filter(c => c.required && !c.readOnly).forEach(col => {
    if (!seenHeaders.has(col.key)) problems.push(`Missing required column: ${col.header}`);
  });

  const unknown = headers.filter((h, i) => !mapped[i] && h);
  if (unknown.length > 0) {
    problems.push(`Ignoring unrecognised column${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`);
  }

  const ignoredReadOnly = headers.filter((h, i) => mapped[i]?.readOnly);
  if (ignoredReadOnly.length > 0) {
    problems.push(`Read-only column${ignoredReadOnly.length === 1 ? '' : 's'} shown for reference, not updated: ${ignoredReadOnly.join(', ')}`);
  }

  if (problems.some(p => p.startsWith('Missing'))) {
    return { rows: [], presentKeys: [], problems };
  }

  const presentKeys = columns
    .filter(c => !c.readOnly && seenHeaders.has(c.key))
    .map(c => c.key);

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    // +1 because the header is line 1 in the user's spreadsheet — error
    // messages point at the line they can actually see.
    const row = { line_number: i + 1, values: {}, errors: [] };

    mapped.forEach((col, c) => {
      if (!col || col.readOnly) return;
      const raw = cells[c];

      if (raw === undefined || raw === '') {
        if (col.required) {
          row.errors.push(`${col.header} is required and cannot be blank`);
        } else if (col.clearable === false) {
          // A column with a server-side default (status, and anything else
          // where NULL is not a meaningful state) is left alone when blank
          // rather than nulled. Omitting the key is what tells the API that.
        } else {
          // Present-but-empty clears the field. This is the whole point of the
          // round-trip; see the header comment.
          row.values[col.key] = null;
        }
        return;
      }

      const { value, error } = coerce(raw, col);
      if (error) {
        row.errors.push(error);
      } else if (col.enum && !col.enum.includes(value)) {
        // Caught here rather than server-side, where it surfaces as an opaque
        // pydantic 422 that doesn't name the line in the user's sheet.
        row.errors.push(`${col.header} must be one of: ${col.enum.join(', ')} (got "${raw}")`);
      } else {
        row.values[col.key] = value;
      }
    });

    rows.push(row);
  }

  return { rows, presentKeys, problems };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

function escapeCell(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Render a record for one column — booleans as true/false, numbers unpadded. */
function cellFor(record, col) {
  const raw = record?.[col.key];
  if (raw === null || raw === undefined) return '';
  if (col.type === 'bool') return raw ? 'true' : 'false';
  if (col.type === 'number' || col.type === 'int') {
    // Numeric columns come back from the API as strings like "240.0000".
    // Excel would show that verbatim, so trim to the shortest exact form.
    const n = Number(raw);
    return Number.isFinite(n) ? String(n) : String(raw);
  }
  if (col.type === 'date') return String(raw).slice(0, 10);
  return raw;
}

/** Build CSV text from a column spec and a list of records. */
export function buildCsv(columns, records) {
  const header = columns.map(c => escapeCell(c.header)).join(',');
  const body = records.map(r => columns.map(c => escapeCell(cellFor(r, c))).join(','));
  return `${[header, ...body].join('\n')}\n`;
}

/**
 * Trigger a browser download. Prepends a BOM so Excel opens the file as UTF-8
 * rather than mangling accents — the parser strips BOMs on the way back in.
 */
export function downloadCsv(fileName, csvText) {
  const url = URL.createObjectURL(new Blob([`﻿${csvText}`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/** `auxein-equipment-2026-08-28.csv` — dated so successive exports don't collide. */
export function datedFileName(stem) {
  const d = new Date();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `auxein-${stem}-${iso}.csv`;
}

// ---------------------------------------------------------------------------
// Reference columns (lookups)
// ---------------------------------------------------------------------------
// A column may stand for a foreign key, showing the NAME and never the id:
//
//   { key: 'property', header: 'property', type: 'string',
//     lookup: { source: 'properties', idKey: 'property_id', labelField: 'name' } }
//
// The user sees "Home Block". The payload carries `property_id`. A raw id is
// never written into the file, because a number nobody recognises is both
// useless to read and dangerous to type — the wrong digit would silently point
// a record at something else.

const labelKeyOf = (v) => String(v ?? '').trim().toLowerCase();

/**
 * Fill in the label side of every lookup column so records can be exported and
 * diffed in the same terms the user edits them in.
 * `context` is { [source]: Array<option> }.
 */
export function decorateRecords(records, columns, context = {}) {
  const lookups = columns.filter(c => c.lookup);
  if (lookups.length === 0) return records || [];
  return (records || []).map(rec => {
    const out = { ...rec };
    lookups.forEach(col => {
      const options = context[col.lookup.source] || [];
      const match = options.find(o => o.id === rec[col.lookup.idKey]);
      out[col.key] = match ? match[col.lookup.labelField] : '';
    });
    return out;
  });
}

/**
 * Turn each lookup column's label back into its id, in place, adding a per-line
 * error when the name is not one the user is allowed to use.
 *
 * The options list is the caller's VISIBLE set — properties this user can see,
 * blocks in this company. Resolving against it is what makes an out-of-scope
 * reference unexpressable rather than merely rejected: there is no id to type.
 *
 * The label is kept alongside the id so the change preview can read
 * "property: Home Block -> North Block" instead of "14 -> 15".
 */
export function resolveLookups(rows, columns, context = {}) {
  const lookups = columns.filter(c => c.lookup && !c.readOnly);
  if (lookups.length === 0) return rows;

  return rows.map(row => {
    const values = { ...row.values };
    const errors = [...row.errors];

    lookups.forEach(col => {
      if (!(col.key in values)) return; // column absent from the file
      const raw = values[col.key];

      if (raw === null || raw === '') {
        values[col.lookup.idKey] = null;
        return;
      }

      const options = context[col.lookup.source] || [];
      const hits = options.filter(o => labelKeyOf(o[col.lookup.labelField]) === labelKeyOf(raw));

      if (hits.length === 0) {
        const names = options.map(o => o[col.lookup.labelField]).filter(Boolean);
        errors.push(
          `${col.header} "${raw}" is not one of yours`
          + (names.length ? ` — use one of: ${names.join(', ')}` : '')
        );
      } else if (hits.length > 1) {
        errors.push(`${col.header} "${raw}" matches more than one — rename one of them first`);
      } else {
        values[col.lookup.idKey] = hits[0].id;
        // Canonicalise the label to the stored spelling. Matching is
        // case-insensitive, so without this "home block" would resolve to the
        // right id and STILL diff as a change against "Home Block" — a no-op
        // update on every row whose capitalisation drifted in Excel.
        values[col.key] = hits[0][col.lookup.labelField];
      }
    });

    return { ...row, values, errors };
  });
}

// ---------------------------------------------------------------------------
// Diffing
// ---------------------------------------------------------------------------

/**
 * Compare a parsed cell against the value already held, tolerating the shapes
 * the API returns: Numeric columns arrive as strings ("2.4000"), empty strings
 * and nulls both mean "not set".
 */
function sameValue(a, b, col) {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty && bEmpty) return true;
  if (aEmpty !== bEmpty) return false;

  if (col.type === 'number' || col.type === 'int') return Number(a) === Number(b);
  if (col.type === 'bool') return Boolean(a) === Boolean(b);
  if (col.type === 'date') return String(a).slice(0, 10) === String(b).slice(0, 10);
  return String(a).trim() === String(b).trim();
}

/**
 * The key that ties a line in the sheet to a record in the database.
 *
 * This is the BUSINESS key the user already owns — an asset number, a block
 * name, a block plus row number — never the database id. A primary key in a
 * spreadsheet is meaningless to read, and one stray edit repoints a line at a
 * different record with no way to notice.
 *
 * The cost of that choice, stated plainly because it is real: changing a
 * business key in the sheet reads as a NEW record, not a rename. Renaming
 * belongs on screen. The change preview shows it as an addition, so it is
 * visible before anything is written.
 */
function keyFor(source, matchOn) {
  const parts = matchOn.map(k => labelKeyOf(source?.[k]));
  return parts.some(p => p === '') ? null : parts.join(' ');
}

/**
 * Work out what each parsed row would do, against the records currently held.
 *
 * @param parsed      rows from parseCsvWithSpec (after resolveLookups)
 * @param existing    current records, already through decorateRecords
 * @param columns     the same column spec
 * @param opts.matchOn      business-key column(s), e.g. ['asset_number']
 * @param opts.allowCreate  false for entities a CSV may only edit
 * @param opts.entityLabel  singular noun for messages, e.g. "block"
 * @returns per-row { line_number, action, key, changes[], errors[] } plus totals
 */
export function diffRows(parsed, existing, columns, opts = {}) {
  const {
    allowCreate = true,
    entityLabel = 'record',
    matchOn = ['id'],
  } = opts;

  const keyHeaders = matchOn
    .map(k => columns.find(c => c.key === k)?.header || k)
    .join(' + ');

  // Existing records by business key. A duplicate here is a pre-existing data
  // problem, not a file problem — flag it rather than silently picking one.
  const byKey = new Map();
  const ambiguous = new Set();
  (existing || []).forEach(rec => {
    const k = keyFor(rec, matchOn);
    if (k === null) return;
    if (byKey.has(k)) ambiguous.add(k);
    else byKey.set(k, rec);
  });

  const writable = columns.filter(c => !c.readOnly && !matchOn.includes(c.key));
  const seen = new Map();

  const results = parsed.map(row => {
    const errors = [...row.errors];
    const key = keyFor(row.values, matchOn);
    const label = matchOn.map(k => row.values[k]).filter(Boolean).join(' · ');

    if (key === null) {
      errors.push(`${keyHeaders} is required — it is how this line finds its ${entityLabel}`);
      return { line_number: row.line_number, action: 'error', key: null, label, changes: [], errors };
    }

    if (seen.has(key)) {
      errors.push(`${keyHeaders} "${label}" also appears on line ${seen.get(key)} of this file`);
    }
    seen.set(key, row.line_number);

    if (ambiguous.has(key)) {
      errors.push(`more than one ${entityLabel} is already called "${label}" — fix that first`);
    }

    const current = byKey.get(key);

    if (!current) {
      if (!allowCreate) {
        errors.push(
          `no ${entityLabel} called "${label}" — a CSV can edit existing ${entityLabel}s but not create them. `
          + `Check the spelling, or add it in the app first.`
        );
        return { line_number: row.line_number, action: 'error', key, label, changes: [], errors };
      }
      return {
        line_number: row.line_number,
        action: errors.length ? 'error' : 'create',
        key,
        label,
        changes: writable
          .filter(c => row.values[c.key] !== undefined && row.values[c.key] !== null && row.values[c.key] !== '')
          .map(c => ({ key: c.key, header: c.header, from: null, to: row.values[c.key] })),
        errors,
      };
    }

    const changes = [];
    writable.forEach(col => {
      if (!(col.key in row.values)) return; // column absent from the file
      const next = row.values[col.key];
      if (!sameValue(next, current[col.key], col)) {
        changes.push({ key: col.key, header: col.header, from: current[col.key], to: next });
      }
    });

    return {
      line_number: row.line_number,
      action: errors.length ? 'error' : (changes.length ? 'update' : 'unchanged'),
      key,
      label,
      changes,
      errors,
    };
  });

  const totals = {
    create: results.filter(r => r.action === 'create').length,
    update: results.filter(r => r.action === 'update').length,
    unchanged: results.filter(r => r.action === 'unchanged').length,
    error: results.filter(r => r.action === 'error').length,
  };

  return { results, totals };
}

/**
 * Build the payload sent to the API: one entry per row that would actually
 * write, carrying only the columns present in the file.
 *
 * Lookup columns contribute their RESOLVED id, not the label the user typed —
 * `property` becomes `property_id` and the label is dropped.
 *
 * Unchanged rows are dropped: re-sending them would bump `updated_at` on every
 * record in the register for a one-cell edit.
 */
export function buildPayloadRows(parsed, diffResults, columns) {
  const byLine = new Map(diffResults.map(d => [d.line_number, d]));
  const cols = columns || [];

  return parsed
    .filter(row => {
      const d = byLine.get(row.line_number);
      return d && (d.action === 'create' || d.action === 'update');
    })
    .map(row => {
      const out = { line_number: row.line_number };
      cols.filter(c => !c.readOnly).forEach(col => {
        if (!(col.key in row.values)) return;
        if (col.lookup) out[col.lookup.idKey] = row.values[col.lookup.idKey] ?? null;
        else out[col.key] = row.values[col.key];
      });
      return out;
    });
}
