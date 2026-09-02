// components/csv/CsvSyncModal.jsx — export → edit in Excel → upload, for any
// register that can be represented as flat rows.
//
// Generalised from the asset-only importer. Three things make this a round-trip
// tool rather than a one-way import:
//
//   - it exports what is already there, keyed on something the user recognises
//     (an asset number, a block name) rather than a database id, so the file
//     they edit is the register itself and every column means something;
//   - it shows a change preview before writing — how many records would be
//     created, updated and left alone, and field-by-field what moves;
//   - a blank cell in a column that IS in the file clears that field, so the
//     sheet and the database agree afterwards. See utils/csvIo.js.
//
// Nothing here deletes. A record missing from the file is untouched, because a
// spreadsheet row deleted by accident must never take a record with it.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  X, Upload, FileText, AlertTriangle, CheckCircle2, Download,
  Loader2, ArrowRight, Table2,
} from 'lucide-react';
import { useToast } from '../ToastProvider';
import {
  parseCsvWithSpec, diffRows, buildPayloadRows, buildCsv, downloadCsv, datedFileName,
  decorateRecords, resolveLookups,
} from '../../utils/csvIo';
import './CsvSyncModal.css';

const PREVIEW_LIMIT = 10;

const shown = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));

/**
 * @param {object}   props.spec           entity definition (see csvSpecs.js)
 * @param {Function} props.fetchRecords   async () => full record list, or
 *   `{ records, notice }` when something about the set is worth saying — e.g.
 *   blocks with no name, which cannot appear in a name-keyed file. Used for
 *   BOTH the export and the diff baseline, so it must return everything, not
 *   the page currently on screen — a diff against a truncated list would call
 *   real records "not in this list".
 * @param {Function} [props.fetchContext] async () => ({ properties: [...] }) —
 *   the option lists behind any lookup column. These are the user's VISIBLE
 *   sets, which is what stops a spreadsheet naming another company's property:
 *   there is no id to type, and an unknown name is a per-line error.
 * @param {Function} props.submit         async ({ rows, skip_invalid }) => result
 * @param {Function} props.onApplied      called after a committed write
 */
export default function CsvSyncModal({
  open, onClose, spec, fetchRecords, fetchContext, submit, onApplied,
}) {
  const fileRef = useRef(null);
  const toast = useToast();

  const [records, setRecords] = useState([]);
  const [notice, setNotice] = useState('');
  const [context, setContext] = useState({});
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState([]);
  const [problems, setProblems] = useState([]);
  const [diff, setDiff] = useState(null);
  const [serverErrors, setServerErrors] = useState([]);
  const [skipInvalid, setSkipInvalid] = useState(false);
  const [working, setWorking] = useState(false);

  const resetFile = () => {
    setFileName(''); setParsed([]); setProblems([]); setDiff(null);
    setServerErrors([]); setSkipInvalid(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const load = useCallback(async () => {
    setLoadingRecords(true);
    setLoadError('');
    try {
      const [result, ctx] = await Promise.all([
        fetchRecords(),
        fetchContext ? fetchContext() : Promise.resolve({}),
      ]);
      setContext(ctx || {});
      const list = Array.isArray(result) ? result : (result?.records || []);
      setNotice(Array.isArray(result) ? '' : (result?.notice || ''));
      // Lookup columns are stored as ids and shown as names, so decorate before
      // anything exports or diffs — both work in the user's terms, not the DB's.
      setRecords(decorateRecords(list, spec.columns, ctx || {}));
    } catch (err) {
      console.error(`Failed to load ${spec.label} for CSV sync:`, err);
      setLoadError(`Could not load your current ${spec.label}. Close and try again — uploading without them would report every row as unknown.`);
    } finally {
      setLoadingRecords(false);
    }
  }, [fetchRecords, fetchContext, spec.columns, spec.label]);

  useEffect(() => {
    if (open) { load(); } else { resetFile(); setRecords([]); setContext({}); setNotice(''); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleFile = async (file) => {
    if (!file) return;
    setServerErrors([]);
    setFileName(file.name);
    const text = await file.text();
    const { rows: raw, problems: found } = parseCsvWithSpec(text, spec.columns);
    // Names -> ids before diffing, so an out-of-scope property is caught on the
    // line that names it rather than as a 400 after the user hits Save.
    const rows = resolveLookups(raw, spec.columns, context);
    setParsed(rows);
    setProblems(found);
    setDiff(rows.length
      ? diffRows(rows, records, spec.columns, {
          allowCreate: spec.allowCreate !== false,
          entityLabel: spec.entityLabel || 'record',
          matchOn: spec.matchOn,
        })
      : null);
  };

  const exportData = () => {
    if (records.length === 0) {
      toast.error(`Nothing to export yet — there are no ${spec.label} in this view.`);
      return;
    }
    downloadCsv(datedFileName(spec.fileStem), buildCsv(spec.columns, records));
  };

  const exportBlank = () => {
    // The blank template keeps the sample rows: an empty file with only headers
    // gives a first-time user no idea what belongs in `category` or `asset_type`.
    const header = spec.columns.map(c => c.header).join(',');
    downloadCsv(`auxein-${spec.fileStem}-template.csv`, `${header}\n${(spec.sampleRows || []).join('\n')}\n`);
  };

  const handleApply = async () => {
    setWorking(true);
    setServerErrors([]);
    try {
      const rows = buildPayloadRows(parsed, diff.results, spec.columns);
      const result = await submit({ rows, skip_invalid: skipInvalid });

      if (!result.committed) {
        setServerErrors(result.errors || []);
        toast.error(`${result.failed} row${result.failed === 1 ? '' : 's'} need fixing — nothing was saved`);
        return;
      }

      const bits = [];
      if (result.created) bits.push(`${result.created} added`);
      if (result.updated) bits.push(`${result.updated} updated`);
      if (result.failed) bits.push(`${result.failed} skipped`);
      toast.success(bits.length ? `${spec.title}: ${bits.join(', ')}` : 'Nothing changed');

      onApplied?.();
      resetFile();
      onClose?.();
    } catch (err) {
      console.error(`${spec.label} CSV upload failed:`, err);
      const detail = err?.response?.data?.detail;
      toast.error(Array.isArray(detail) ? (detail[0]?.msg || 'Upload failed') : (detail || 'Upload failed'));
    } finally {
      setWorking(false);
    }
  };

  if (!open) return null;

  const matchOn = spec.matchOn || [];
  const keyHeaders = matchOn
    .map(k => spec.columns.find(c => c.key === k)?.header || k)
    .join(' + ');
  const hasDates = spec.columns.some(c => c.type === 'date' && !c.readOnly);
  const blocking = problems.filter(p => p.startsWith('Missing'));
  const totals = diff?.totals;
  const rowErrors = (diff?.results || []).filter(r => r.errors.length > 0);
  const allErrors = [
    ...rowErrors.map(r => ({ row_number: r.line_number, errors: r.errors })),
    ...serverErrors,
  ];
  const willWrite = (totals?.create || 0) + (totals?.update || 0);
  const canApply = !!diff && blocking.length === 0 && willWrite > 0
    && (rowErrors.length === 0 || skipInvalid);

  const changed = (diff?.results || []).filter(r => r.action === 'create' || r.action === 'update');

  return (
    <div className="csvm-backdrop" onClick={onClose}>
      <div className="csvm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="csvm-head">
          <h3 className="csvm-title"><Table2 size={18} /> {spec.title} — spreadsheet</h3>
          <button className="csvm-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="csvm-body">
          {/* ---- Step 1: get a file ---- */}
          <div className="csvm-step">
            <div className="csvm-step-n">1</div>
            <div className="csvm-step-body">
              <div className="csvm-step-title">Download</div>
              <p className="csvm-hint">
                Export your {spec.label} to edit them in Excel and upload the changes back, or
                start from a blank template.
              </p>
              <div className="csvm-btn-row">
                <button className="csvm-btn csvm-btn--accent" onClick={exportData} disabled={loadingRecords}>
                  <Download size={14} />
                  {loadingRecords ? 'Loading…' : `Export ${records.length} ${spec.label}`}
                </button>
                <button className="csvm-btn csvm-btn--ghost" onClick={exportBlank}>
                  <FileText size={14} /> Blank template
                </button>
              </div>
              {/* Says why a count is lower than the user expects, rather than
                  letting "22 blocks, 1 exported" read as a bug. */}
              {notice && (
                <div className="alert alert--warning csvm-alert csvm-notice">
                  <AlertTriangle size={14} /><div>{notice}</div>
                </div>
              )}
            </div>
          </div>

          {/* ---- Step 2: upload it back ---- */}
          <div className="csvm-step">
            <div className="csvm-step-n">2</div>
            <div className="csvm-step-body">
              <div className="csvm-step-title">Upload</div>
              <p className="csvm-hint">
                <code>{keyHeaders}</code> is how each line finds its {spec.entityLabel || 'record'}
                {spec.allowCreate !== false
                  ? `, so a line with a new one adds a new ${spec.entityLabel || 'record'} rather than renaming an existing one — rename in the app.`
                  : `. New ${spec.label} cannot be added here.`}
                {' '}An empty cell <strong>clears</strong> that field; to leave a field alone,
                delete its whole column. Nothing is ever deleted by leaving a line out.
              </p>
              {/* Excel rewrites the exported ISO dates into the local format on
                  save, so the rule has to be stated rather than assumed. */}
              {hasDates && (
                <p className="csvm-hint">
                  Dates can be <code>01/08/2011</code> or <code>2011-08-01</code> — the month is
                  always the middle number, so US-style <code>08/01/2011</code> is refused rather
                  than read as the wrong day.
                </p>
              )}

              <label className="csvm-drop">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                <FileText size={22} />
                <span>{fileName || 'Choose a CSV file'}</span>
              </label>
            </div>
          </div>

          {loadError && (
            <div className="alert alert--danger csvm-alert">
              <AlertTriangle size={14} /><div>{loadError}</div>
            </div>
          )}

          {problems.length > 0 && (
            <div className={`alert ${blocking.length > 0 ? 'alert--danger' : 'alert--warning'} csvm-alert`}>
              <AlertTriangle size={14} />
              <div>{problems.map((p, i) => <div key={i}>{p}</div>)}</div>
            </div>
          )}

          {/* ---- Step 3: what would change ---- */}
          {totals && blocking.length === 0 && (
            <div className="csvm-step">
              <div className="csvm-step-n">3</div>
              <div className="csvm-step-body">
                <div className="csvm-step-title">Check the changes</div>

                <div className="csvm-totals">
                  <span className="csvm-pill csvm-pill--add">{totals.create} to add</span>
                  <span className="csvm-pill csvm-pill--edit">{totals.update} to update</span>
                  <span className="csvm-pill">{totals.unchanged} unchanged</span>
                  {totals.error > 0 && <span className="csvm-pill csvm-pill--bad">{totals.error} with problems</span>}
                </div>

                {changed.length > 0 ? (
                  <div className="csvm-changes">
                    {changed.slice(0, PREVIEW_LIMIT).map(r => (
                      <div key={r.line_number} className="csvm-change">
                        <div className="csvm-change-head">
                          <span className={`csvm-tag csvm-tag--${r.action}`}>
                            {r.action === 'create' ? 'New' : 'Edit'}
                          </span>
                          <span className="csvm-change-label">
                            Line {r.line_number}{r.label ? ` · ${r.label}` : ''}
                          </span>
                        </div>
                        <ul className="csvm-change-list">
                          {r.changes.slice(0, 6).map(c => (
                            <li key={c.key}>
                              <span className="csvm-field">{c.header}</span>
                              {r.action === 'update' && <><span className="csvm-from">{shown(c.from)}</span><ArrowRight size={11} /></>}
                              <span className="csvm-to">{shown(c.to)}</span>
                            </li>
                          ))}
                          {r.changes.length > 6 && <li className="csvm-muted">…and {r.changes.length - 6} more fields</li>}
                        </ul>
                      </div>
                    ))}
                    {changed.length > PREVIEW_LIMIT && (
                      <div className="csvm-more">…and {changed.length - PREVIEW_LIMIT} more lines</div>
                    )}
                  </div>
                ) : (
                  <div className="csvm-summary">
                    <CheckCircle2 size={14} />
                    <span>Nothing to save — the file matches what is already stored.</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {allErrors.length > 0 && (
            <div className="csvm-errors">
              <div className="csvm-errors-title">Lines that need fixing</div>
              <ul>
                {allErrors.slice(0, 12).map((e, i) => (
                  <li key={i}><strong>Line {e.line_number}:</strong> {e.errors.join('; ')}</li>
                ))}
              </ul>
              {allErrors.length > 12 && <div className="csvm-more">…and {allErrors.length - 12} more</div>}
              {willWrite > 0 && (
                <label className="csvm-checkbox">
                  <input type="checkbox" checked={skipInvalid} onChange={(e) => setSkipInvalid(e.target.checked)} />
                  Save the good lines anyway and skip these
                </label>
              )}
            </div>
          )}
        </div>

        <div className="csvm-actions">
          <button className="csvm-btn csvm-btn--ghost" onClick={onClose} disabled={working}>Cancel</button>
          <button className="csvm-btn csvm-btn--primary" onClick={handleApply} disabled={!canApply || working}>
            {working
              ? <><Loader2 size={14} className="csvm-spin" /> Saving…</>
              : <><Upload size={14} /> {willWrite > 0 ? `Save ${willWrite} change${willWrite === 1 ? '' : 's'}` : 'Save'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
