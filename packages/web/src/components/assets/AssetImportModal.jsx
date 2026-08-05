// components/assets/AssetImportModal.jsx — CSV bulk import for the asset register.
//
// Greystone beta (Assets): "a CSV import option would make it much quicker to
// load in all our equipment at once."
//
// The CSV is parsed here rather than server-side, so the user gets a preview and
// per-row errors before anything is written, and the backend never has to deal
// with encodings or delimiters. Parsing is hand-rolled — the format we need is
// small enough that a dependency isn't worth it, but it does handle quoted
// fields containing commas and doubled quotes, which naive split(',') does not.
import { useRef, useState } from 'react';
import { X, Upload, FileText, AlertTriangle, CheckCircle2, Download, Loader2 } from 'lucide-react';
import { assetService } from '@vineyard/shared';
import { useToast } from '../ToastProvider';
import './AssetImportModal.css';

// Column header -> AssetImportRow field. Headers are matched case-insensitively
// with spaces/underscores normalised, so "Asset Number" and "asset_number" both
// land on asset_number.
const COLUMN_MAP = {
  asset_number: 'asset_number',
  name: 'name',
  description: 'description',
  category: 'category',
  subcategory: 'subcategory',
  asset_type: 'asset_type',
  type: 'asset_type',
  make: 'make',
  model: 'model',
  serial_number: 'serial_number',
  serial: 'serial_number',
  year_manufactured: 'year_manufactured',
  year: 'year_manufactured',
  unit_of_measure: 'unit_of_measure',
  unit: 'unit_of_measure',
  current_stock: 'current_stock',
  stock: 'current_stock',
  minimum_stock: 'minimum_stock',
  cost_per_unit: 'cost_per_unit',
  cost: 'cost_per_unit',
  location_label: 'location_label',
  location: 'location_label',
};

const NUMERIC_FIELDS = new Set([
  'year_manufactured', 'current_stock', 'minimum_stock', 'cost_per_unit',
]);

const VALID_CATEGORIES = ['equipment', 'vehicle', 'tool', 'consumable', 'infrastructure'];
const VALID_ASSET_TYPES = ['physical', 'consumable'];

// Equipment and consumables share one endpoint and one parser — they differ
// only in which optional columns are worth putting in front of the user.
// Consumables care about stock and cost; equipment cares about make/model/serial.
// Offering one combined template would hand everyone a dozen irrelevant columns.
const TEMPLATE_PRESETS = {
  equipment: {
    label: 'equipment',
    fileName: 'auxein-equipment-import-template.csv',
    headers: [
      'asset_number', 'name', 'category', 'asset_type', 'subcategory',
      'make', 'model', 'serial_number', 'year_manufactured', 'location_label', 'description',
    ],
    sample: [
      'TR-001,Kubota M7060,equipment,physical,tractor,Kubota,M7060,SN-KB-99213,2019,Main shed,Primary row tractor',
      'SPR-001,Croplands Quantum Mist,equipment,physical,sprayer,Croplands,Quantum Mist 2000,SN-CL-77310,2020,Implement bay,"Twin-fan, 2000L tank"',
    ],
  },
  consumable: {
    label: 'consumables',
    fileName: 'auxein-consumables-import-template.csv',
    headers: [
      'asset_number', 'name', 'category', 'asset_type', 'subcategory',
      'unit_of_measure', 'current_stock', 'minimum_stock', 'cost_per_unit',
      'location_label', 'description',
    ],
    sample: [
      'CHEM-001,Sulphur WG,consumable,consumable,fungicide,kg,240,50,4.85,Chemical store,Wettable granule',
      'FUEL-001,Diesel,consumable,consumable,fuel,L,1800,500,2.15,Fuel bay,Bulk tank',
    ],
  },
};

const normaliseHeader = (h) => h.trim().toLowerCase().replace(/\s+/g, '_').replace(/^﻿/, '');

/**
 * Split one CSV line, respecting double-quoted fields.
 * "a,b" stays one field; "" inside a quoted field is a literal quote.
 */
function splitCsvLine(line) {
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

function parseCsv(text) {
  // Strip a BOM (Excel adds one) and normalise line endings before splitting.
  const clean = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = clean.split('\n').filter(l => l.trim().length > 0);
  if (lines.length < 2) {
    return { rows: [], problems: ['The file needs a header row and at least one data row.'] };
  }

  const headers = splitCsvLine(lines[0]).map(normaliseHeader);
  const mapped = headers.map(h => COLUMN_MAP[h] || null);

  const problems = [];
  if (!mapped.includes('asset_number')) problems.push('Missing required column: asset_number');
  if (!mapped.includes('name')) problems.push('Missing required column: name');
  if (!mapped.includes('category')) problems.push('Missing required column: category');
  if (!mapped.includes('asset_type')) problems.push('Missing required column: asset_type');

  const unknown = headers.filter((h, i) => !mapped[i]);
  if (unknown.length > 0) {
    problems.push(`Ignoring unrecognised column${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`);
  }
  if (problems.some(p => p.startsWith('Missing'))) return { rows: [], problems };

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    // +1 because the header is line 1 in the user's spreadsheet.
    const row = { row_number: i + 1 };

    mapped.forEach((field, col) => {
      if (!field) return;
      const raw = values[col];
      if (raw === undefined || raw === '') return;

      if (NUMERIC_FIELDS.has(field)) {
        const n = Number(raw);
        if (!Number.isNaN(n)) row[field] = n;
        return;
      }
      if (field === 'category' || field === 'asset_type') {
        row[field] = raw.toLowerCase();
        return;
      }
      row[field] = raw;
    });

    rows.push(row);
  }

  return { rows, problems };
}

/** Local checks that would otherwise 422 as an opaque pydantic error. */
function preValidate(rows) {
  const issues = [];
  rows.forEach(r => {
    if (r.category && !VALID_CATEGORIES.includes(r.category)) {
      issues.push({ row_number: r.row_number, errors: [`category "${r.category}" must be one of: ${VALID_CATEGORIES.join(', ')}`] });
    }
    if (r.asset_type && !VALID_ASSET_TYPES.includes(r.asset_type)) {
      issues.push({ row_number: r.row_number, errors: [`asset_type "${r.asset_type}" must be one of: ${VALID_ASSET_TYPES.join(', ')}`] });
    }
  });
  return issues;
}

/**
 * @param {'equipment'|'consumable'} props.mode — only changes the downloadable
 *   template and the wording. Parsing, validation and the endpoint are shared:
 *   a file is accepted on its own merits, so an equipment row in the consumables
 *   importer still imports correctly rather than being rejected on a guess.
 */
export default function AssetImportModal({ open, onClose, onImported, mode = 'equipment' }) {
  const fileRef = useRef(null);
  const toast = useToast();
  const preset = TEMPLATE_PRESETS[mode] || TEMPLATE_PRESETS.equipment;

  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState([]);
  const [problems, setProblems] = useState([]);
  const [localIssues, setLocalIssues] = useState([]);
  const [serverErrors, setServerErrors] = useState([]);
  const [skipInvalid, setSkipInvalid] = useState(false);
  const [importing, setImporting] = useState(false);

  const reset = () => {
    setFileName(''); setRows([]); setProblems([]);
    setLocalIssues([]); setServerErrors([]); setSkipInvalid(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFile = async (file) => {
    if (!file) return;
    setServerErrors([]);
    setFileName(file.name);
    const text = await file.text();
    const { rows: parsed, problems: found } = parseCsv(text);
    setRows(parsed);
    setProblems(found);
    setLocalIssues(preValidate(parsed));
  };

  const downloadTemplate = () => {
    const csv = `${preset.headers.join(',')}\n${preset.sample.join('\n')}\n`;
    // Prepend a BOM so Excel opens it as UTF-8 rather than mangling accents.
    // The parser strips BOMs on the way back in.
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = preset.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    setImporting(true);
    setServerErrors([]);
    try {
      const result = await assetService.importAssets({ rows, skip_invalid: skipInvalid });
      if (!result.committed) {
        // Validation rejected the file — nothing was written.
        setServerErrors(result.errors || []);
        toast.error(`${result.failed} row${result.failed === 1 ? '' : 's'} need fixing — nothing was imported`);
        return;
      }
      toast.success(
        result.failed > 0
          ? `Imported ${result.imported} assets, skipped ${result.failed}`
          : `Imported ${result.imported} assets`,
      );
      onImported?.();
      reset();
      onClose?.();
    } catch (err) {
      console.error('Asset import failed:', err);
      const detail = err?.response?.data?.detail;
      toast.error(Array.isArray(detail) ? (detail[0]?.msg || 'Import failed') : (detail || 'Import failed'));
    } finally {
      setImporting(false);
    }
  };

  if (!open) return null;

  const blocking = problems.filter(p => p.startsWith('Missing'));
  const canImport = rows.length > 0 && blocking.length === 0
    && (localIssues.length === 0 || skipInvalid);

  return (
    <div className="aim-backdrop" onClick={onClose}>
      <div className="aim-modal" onClick={(e) => e.stopPropagation()}>
        <div className="aim-head">
          <h3 className="aim-title"><Upload size={18} /> Import {preset.label} from CSV</h3>
          <button className="aim-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="aim-body">
          <div className="aim-intro">
            <p>
              Upload a CSV with a header row. <code>asset_number</code>, <code>name</code>,
              {' '}<code>category</code> and <code>asset_type</code> are required; other columns are optional.
            </p>
            <button className="aim-btn aim-btn--ghost" onClick={downloadTemplate}>
              <Download size={14} /> {preset.label === 'consumables' ? 'Consumables template' : 'Equipment template'}
            </button>
          </div>

          <label className="aim-drop">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <FileText size={22} />
            <span>{fileName || 'Choose a CSV file'}</span>
          </label>

          {problems.length > 0 && (
            <div className={`alert ${blocking.length > 0 ? 'alert--danger' : 'alert--warning'} aim-alert`}>
              <AlertTriangle size={14} />
              <div>{problems.map((p, i) => <div key={i}>{p}</div>)}</div>
            </div>
          )}

          {rows.length > 0 && blocking.length === 0 && (
            <>
              <div className="aim-summary">
                <CheckCircle2 size={14} />
                <span>{rows.length} row{rows.length === 1 ? '' : 's'} ready</span>
                {localIssues.length > 0 && (
                  <span className="aim-summary-bad">{localIssues.length} with problems</span>
                )}
              </div>

              <div className="aim-preview">
                <table className="aim-table">
                  <thead>
                    <tr>
                      <th>Line</th><th>Asset no.</th><th>Name</th><th>Category</th>
                      {/* Consumables live or die on stock figures; equipment on type. */}
                      {mode === 'consumable'
                        ? <><th>Unit</th><th>Stock</th><th>Cost</th></>
                        : <th>Type</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 8).map(r => (
                      <tr key={r.row_number}>
                        <td>{r.row_number}</td>
                        <td>{r.asset_number || <em>missing</em>}</td>
                        <td>{r.name || <em>missing</em>}</td>
                        <td>{r.category || <em>missing</em>}</td>
                        {mode === 'consumable' ? (
                          <>
                            <td>{r.unit_of_measure ?? '—'}</td>
                            <td>{r.current_stock ?? '—'}</td>
                            <td>{r.cost_per_unit ?? '—'}</td>
                          </>
                        ) : (
                          <td>{r.asset_type || <em>missing</em>}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 8 && <div className="aim-more">…and {rows.length - 8} more</div>}
              </div>
            </>
          )}

          {(localIssues.length > 0 || serverErrors.length > 0) && (
            <div className="aim-errors">
              <div className="aim-errors-title">Rows that need fixing</div>
              <ul>
                {[...localIssues, ...serverErrors].slice(0, 12).map((e, i) => (
                  <li key={i}><strong>Line {e.row_number}:</strong> {e.errors.join('; ')}</li>
                ))}
              </ul>
              {[...localIssues, ...serverErrors].length > 12 && (
                <div className="aim-more">…and {[...localIssues, ...serverErrors].length - 12} more</div>
              )}
              <label className="aim-checkbox">
                <input
                  type="checkbox"
                  checked={skipInvalid}
                  onChange={(e) => setSkipInvalid(e.target.checked)}
                />
                Import the valid rows anyway and skip these
              </label>
            </div>
          )}
        </div>

        <div className="aim-actions">
          <button className="aim-btn aim-btn--ghost" onClick={onClose} disabled={importing}>Cancel</button>
          <button className="aim-btn aim-btn--primary" onClick={handleImport} disabled={!canImport || importing}>
            {importing
              ? <><Loader2 size={14} className="aim-spin" /> Importing…</>
              : <><Upload size={14} /> Import {rows.length > 0 ? `${skipInvalid ? rows.length - localIssues.length : rows.length} assets` : ''}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
