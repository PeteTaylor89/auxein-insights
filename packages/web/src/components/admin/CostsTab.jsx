// components/admin/CostsTab.jsx — pay rates and cost settings.
//
// Two ideas drive the whole screen, and both come from the same place: a cost
// figure that looks complete but isn't is worse than no figure at all.
//
//   1. Nothing here shows a zero where it means "unknown". A staff member with
//      no rate reads "Not set", never "$0.00", because the second is a claim
//      that someone works for nothing.
//   2. Gaps are shown as consequences, not as empty fields. The server returns
//      plain-language `gaps` — "contractors on a DAILY rate cannot be costed"
//      — and they are rendered at the top rather than left for an admin to
//      infer from a blank input.
//
// A pay rate is recorded FROM A DATE and never edited in place for a pay
// change. That is what stops a rise in September re-pricing June's pruning.
import { useCallback, useEffect, useState } from 'react';
import {
  DollarSign, Plus, History, AlertTriangle, Save, X, Trash2, Info, Loader2,
} from 'lucide-react';
import { costsService } from '@vineyard/shared';
import HelpTip from '../HelpTip';
import './CostsTab.css';

const money = (v, currency = 'NZD') => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return `${currency === 'NZD' ? '$' : `${currency} `}${n.toFixed(2)}`;
};

const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fmtDate = (iso) => (iso ? String(iso).slice(0, 10) : '—');

const SOURCE_LABEL = {
  pay_rate: null,               // their own rate; no annotation needed
  company_default: 'company default',
  none: null,
};

export default function CostsTab() {
  const [settings, setSettings] = useState(null);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [historyFor, setHistoryFor] = useState(null);   // staff row
  const [addFor, setAddFor] = useState(null);           // staff row

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [s, rows] = await Promise.all([
        costsService.getSettings(),
        costsService.getStaffRates(),
      ]);
      setSettings(s);
      setStaff(Array.isArray(rows) ? rows : []);
    } catch (err) {
      console.error('Failed to load cost settings', err);
      setError(
        err?.response?.status === 403
          ? 'Costs are restricted to company admins.'
          : (err?.response?.data?.detail || 'Failed to load cost settings'),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(''), 4000); };

  if (loading) return <p className="ca-loading">Loading cost settings…</p>;
  if (error) {
    return (
      <div className="ca-section">
        <div className="alert alert--danger"><AlertTriangle size={14} /><div>{error}</div></div>
      </div>
    );
  }

  const currency = settings?.currency || 'NZD';
  const unrated = staff.filter(s => s.source === 'none').length;

  return (
    <div className="ca-section">
      <div className="ca-section-header">
        <h2 className="ca-section-title help-tip-head">
          Costs<HelpTip topic="manage.costs" />
        </h2>
      </div>
      <p className="ca-section-desc">
        What labour costs, and what to assume where a figure is missing. Visible to company
        admins only — a task cost plus its hours reveals an hourly rate.
      </p>

      {notice && (
        <div className="alert alert--success ct-alert"><Save size={14} /><div>{notice}</div></div>
      )}

      {/* Gaps first: what isn't configured, and what each gap actually costs. */}
      {settings?.gaps?.length > 0 && (
        <div className="alert alert--warning ct-alert ct-gaps">
          <AlertTriangle size={14} />
          <div>
            <strong>Not costed yet</strong>
            <ul>{settings.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
          </div>
        </div>
      )}

      <SettingsForm
        settings={settings}
        onSaved={(s) => { setSettings(s); flash('Cost settings saved'); }}
        onError={setError}
      />

      <div className="ct-subhead">
        <h3>Staff rates</h3>
        <span className="ca-muted">
          {staff.length} active
          {unrated > 0 && <> · <strong>{unrated} with no rate</strong></>}
        </span>
      </div>
      <p className="ca-hint">
        A rate applies <strong>from a date</strong>. Recording a new one closes the previous
        one the day before, so what a task cost last season does not change when someone gets
        a rise. To correct a mistake, open the history and edit the row instead.
      </p>

      {staff.length === 0 ? (
        <p className="ca-empty">No active staff.</p>
      ) : (
        <table className="ca-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Hourly rate</th>
              <th>From</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {staff.map(row => (
              <tr key={row.user_id}>
                <td style={{ fontWeight: 500 }}>{row.user_name}</td>
                <td className="ca-muted">{(row.user_type || '').replace(/_/g, ' ')}</td>
                <td>
                  {row.current_rate === null || row.current_rate === undefined ? (
                    // NOT $0.00 — a missing rate is unknown, not free.
                    <span className="ct-unset">Not set</span>
                  ) : (
                    <>
                      <span className="ct-rate">{money(row.current_rate, row.currency)}</span>
                      {SOURCE_LABEL[row.source] && (
                        <span className="ct-source">{SOURCE_LABEL[row.source]}</span>
                      )}
                    </>
                  )}
                </td>
                <td className="ca-muted">
                  {row.source === 'pay_rate' ? fmtDate(row.current_from) : '—'}
                </td>
                <td>
                  <div className="ct-actions">
                    <button className="ca-chip-btn" onClick={() => setAddFor(row)}>
                      <Plus size={12} /> New rate
                    </button>
                    <button
                      className="ca-chip-btn"
                      onClick={() => setHistoryFor(row)}
                      disabled={!row.history_count}
                      title={row.history_count ? 'Rate history' : 'No rates recorded yet'}
                    >
                      <History size={12} /> History{row.history_count ? ` (${row.history_count})` : ''}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <EquipmentRates currency={currency} onError={setError} onSaved={flash} />

      {addFor && (
        <AddRateModal
          staff={addFor}
          currency={currency}
          onClose={() => setAddFor(null)}
          onSaved={() => { setAddFor(null); load(); flash('Rate recorded'); }}
        />
      )}

      {historyFor && (
        <RateHistoryModal
          staff={historyFor}
          onClose={() => setHistoryFor(null)}
          onChanged={() => load()}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * What an hour of each machine costs to run.
 *
 * Here rather than on the asset form because an operating rate is cost data —
 * a depreciation and maintenance position that, multiplied by task hours, says
 * what a job cost. It belongs behind the same door as pay rates.
 *
 * `current_hours` is shown next to it because it is the number that tells an
 * admin whether a rate is worth setting at all: an implement with 4 hours on it
 * moves no total, a tractor with 900 does.
 */
function EquipmentRates({ currency, onError, onSaved }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState({});
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await costsService.getEquipmentRates();
      setRows(Array.isArray(list) ? list : []);
      setDrafts({});
    } catch (err) {
      console.error('Failed to load equipment rates', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (row) => {
    const raw = drafts[row.asset_id];
    // '' clears the rate. Clearing returns the machine to uncosted, not to a
    // rate of zero — the API and the costing service both treat those apart.
    const value = raw === '' ? null : Number(raw);
    if (raw !== '' && !Number.isFinite(value)) return;

    setBusyId(row.asset_id);
    try {
      await costsService.setEquipmentRate(row.asset_id, value);
      await load();
      onSaved(value === null ? `${row.asset_name} is no longer costed` : 'Rate saved');
    } catch (err) {
      onError(err?.response?.data?.detail || 'Failed to save rate');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <p className="ca-loading">Loading equipment…</p>;

  const unrated = rows.filter(r => r.hourly_operating_rate === null
    || r.hourly_operating_rate === undefined).length;

  return (
    <>
      <div className="ct-subhead">
        <h3>Equipment rates</h3>
        <span className="ca-muted">
          {rows.length} item{rows.length === 1 ? '' : 's'}
          {unrated > 0 && <> · <strong>{unrated} with no rate</strong></>}
        </span>
      </div>
      <p className="ca-hint">
        What an hour of each machine costs to run — fuel, wear and its share of maintenance.
        Machine hours are recorded when a task is completed. Changing a rate does not restate
        past task costs; recompute a task to pick up a new one.
      </p>

      {rows.length === 0 ? (
        <p className="ca-empty">No equipment registered.</p>
      ) : (
        <table className="ca-table">
          <thead>
            <tr>
              <th>Equipment</th>
              <th>Hours run</th>
              <th>Rate per hour</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const stored = row.hourly_operating_rate;
              const draft = drafts[row.asset_id];
              const dirty = draft !== undefined
                && String(draft) !== String(stored ?? '');
              return (
                <tr key={row.asset_id}>
                  <td style={{ fontWeight: 500 }}>
                    {row.asset_name}
                    {row.asset_number && <span className="ct-source">{row.asset_number}</span>}
                  </td>
                  <td className="ca-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {row.current_hours ? `${Number(row.current_hours).toFixed(1)} h` : '—'}
                  </td>
                  <td>
                    <input
                      className="ca-inline-input"
                      style={{ maxWidth: 110 }}
                      type="number" step="0.50" min="0"
                      /* Placeholder, not a 0 value: an unrated machine is
                         uncosted, and showing 0.00 would claim it runs free. */
                      placeholder="not set"
                      value={draft !== undefined ? draft : (stored ?? '')}
                      onChange={e => setDrafts(d => ({ ...d, [row.asset_id]: e.target.value }))}
                    />
                  </td>
                  <td>
                    {dirty && (
                      <button
                        className="ca-chip-btn"
                        onClick={() => save(row)}
                        disabled={busyId === row.asset_id}
                      >
                        {busyId === row.asset_id
                          ? <Loader2 size={12} className="ct-spin" />
                          : <><Save size={12} /> Save</>}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

function SettingsForm({ settings, onSaved, onError }) {
  const [form, setForm] = useState({
    on_cost_multiplier: settings?.on_cost_multiplier ?? '',
    standard_day_hours: settings?.standard_day_hours ?? '',
    default_hourly_rate: settings?.default_hourly_rate ?? '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      // Empty string means "clear this", which the API distinguishes from the
      // field being absent. Sending all three is correct here because the form
      // owns all three.
      const payload = {
        on_cost_multiplier: form.on_cost_multiplier === '' ? null : Number(form.on_cost_multiplier),
        standard_day_hours: form.standard_day_hours === '' ? null : Number(form.standard_day_hours),
        default_hourly_rate: form.default_hourly_rate === '' ? null : Number(form.default_hourly_rate),
      };
      onSaved(await costsService.updateSettings(payload));
    } catch (err) {
      console.error('Failed to save cost settings', err);
      onError(err?.response?.data?.detail || 'Failed to save cost settings');
    } finally {
      setSaving(false);
    }
  };

  const pct = form.on_cost_multiplier === '' ? null
    : Math.round((Number(form.on_cost_multiplier) - 1) * 100);

  return (
    <div className="ct-settings">
      <div className="ct-subhead"><h3>Assumptions</h3></div>

      <div className="ct-fields">
        <label className="ct-field">
          <span className="ct-label">On-cost multiplier</span>
          <input
            className="ca-inline-input" type="number" step="0.01" min="1" max="2"
            placeholder="1.18"
            value={form.on_cost_multiplier}
            onChange={e => set('on_cost_multiplier', e.target.value)}
          />
          <span className="ct-help">
            Holiday pay, ACC and KiwiSaver on top of the wage.
            {pct !== null && Number.isFinite(pct) && <> Currently <strong>+{pct}%</strong>.</>}
            {' '}Leave blank and wages count at the bare rate, which understates the real cost.
          </span>
        </label>

        <label className="ct-field">
          <span className="ct-label">Standard day</span>
          <input
            className="ca-inline-input" type="number" step="0.25" min="0.25" max="24"
            placeholder="8"
            value={form.standard_day_hours}
            onChange={e => set('standard_day_hours', e.target.value)}
          />
          <span className="ct-help">
            Hours in a working day, used only to cost contractors on a <em>daily</em> rate.
            Without it those assignments stay uncosted rather than being divided by a guess.
          </span>
        </label>

        <label className="ct-field">
          <span className="ct-label">Default hourly rate</span>
          <input
            className="ca-inline-input" type="number" step="0.50" min="0"
            placeholder="none"
            value={form.default_hourly_rate}
            onChange={e => set('default_hourly_rate', e.target.value)}
          />
          <span className="ct-help">
            Fallback for anyone with no rate on file. Leave blank and their tasks report as
            incompletely costed instead of being costed too low.
          </span>
        </label>
      </div>

      <button className="ca-btn-primary" onClick={save} disabled={saving}>
        {saving ? <><Loader2 size={14} className="ct-spin" /> Saving…</> : <><Save size={14} /> Save assumptions</>}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function AddRateModal({ staff, currency, onClose, onSaved }) {
  const [rate, setRate] = useState('');
  const [from, setFrom] = useState(isoToday());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const valid = rate !== '' && Number(rate) >= 0 && from;
  const backdated = from < isoToday();

  const save = async () => {
    setSaving(true);
    setErr('');
    try {
      await costsService.createRate({
        user_id: staff.user_id,
        hourly_rate: Number(rate),
        effective_from: from,
        notes: notes.trim() || null,
      });
      onSaved();
    } catch (e) {
      console.error('Failed to record rate', e);
      setErr(e?.response?.data?.detail || 'Failed to record rate');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ct-backdrop" onClick={onClose}>
      <div className="ct-modal" onClick={e => e.stopPropagation()}>
        <div className="ct-modal-head">
          <h3><DollarSign size={16} /> New rate — {staff.user_name}</h3>
          <button className="ct-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="ct-modal-body">
          <label className="ct-field">
            <span className="ct-label">Hourly rate ({currency})</span>
            <input
              className="ca-inline-input" type="number" step="0.50" min="0" autoFocus
              value={rate} onChange={e => setRate(e.target.value)} placeholder="32.00"
            />
          </label>

          <label className="ct-field">
            <span className="ct-label">Applies from</span>
            <input
              className="ca-inline-input" type="date"
              value={from} onChange={e => setFrom(e.target.value)}
            />
            <span className="ct-help">
              Their previous rate is closed the day before this one. Anything already costed
              before this date keeps the rate that applied then.
            </span>
          </label>

          {backdated && (
            <div className="alert alert--warning ct-alert">
              <Info size={14} />
              <div>
                This is backdated. Tasks completed on or after {fmtDate(from)} were costed at the
                old rate and will not change on their own — they need a recompute.
              </div>
            </div>
          )}

          <label className="ct-field">
            <span className="ct-label">Note (optional)</span>
            <input
              className="ca-inline-input" type="text" maxLength={200}
              value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Annual review"
            />
          </label>

          {err && <div className="alert alert--danger ct-alert"><AlertTriangle size={14} /><div>{err}</div></div>}
        </div>

        <div className="ct-modal-actions">
          <button className="ca-btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="ca-btn-primary" onClick={save} disabled={!valid || saving}>
            {saving ? <><Loader2 size={14} className="ct-spin" /> Saving…</> : 'Record rate'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function RateHistoryModal({ staff, onClose, onChanged }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await costsService.getRates(staff.user_id));
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Failed to load rate history');
    } finally {
      setLoading(false);
    }
  }, [staff.user_id]);

  useEffect(() => { load(); }, [load]);

  const remove = async (id) => {
    setBusyId(id);
    setErr('');
    try {
      await costsService.deleteRate(id);
      await load();
      onChanged();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Failed to delete rate');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="ct-backdrop" onClick={onClose}>
      <div className="ct-modal ct-modal--wide" onClick={e => e.stopPropagation()}>
        <div className="ct-modal-head">
          <h3><History size={16} /> Rate history — {staff.user_name}</h3>
          <button className="ct-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="ct-modal-body">
          {loading ? <p className="ca-loading">Loading…</p> : rows.length === 0 ? (
            <p className="ca-empty">No rates recorded.</p>
          ) : (
            <table className="ca-table">
              <thead>
                <tr><th>Rate</th><th>From</th><th>To</th><th>Note</th><th /></tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td className="ct-rate">{money(r.hourly_rate, r.currency)}</td>
                    <td>{fmtDate(r.effective_from)}</td>
                    <td>{r.effective_to ? fmtDate(r.effective_to) : <span className="ct-current">current</span>}</td>
                    <td className="ca-muted">{r.notes || '—'}</td>
                    <td>
                      <button
                        className="ca-btn-icon" title="Delete this rate"
                        onClick={() => remove(r.id)} disabled={busyId === r.id}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p className="ca-hint">
            Deleting a rate does not extend the one before it — that would leave two rates
            covering the same day. If a gap opens up, record a replacement.
          </p>

          {err && <div className="alert alert--danger ct-alert"><AlertTriangle size={14} /><div>{err}</div></div>}
        </div>

        <div className="ct-modal-actions">
          <button className="ca-btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
