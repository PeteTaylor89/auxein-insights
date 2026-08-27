// src/pages/QcDashboard.jsx - Daily QC monitoring
//
// The page answers three questions, in this order, because that is the order in
// which they can go wrong:
//
//   1. Is QC running at all?      -> the health banner and the coverage strip,
//                                    both read from `weather_qc_run`
//   2. What is it finding?        -> checks fired, and the ones that did not
//   3. Who keeps failing?         -> offenders, ranked by RATE not by count
//
// Question 1 is the one that did not exist before. A pass that examines 750
// station-days and finds nothing writes no finding, so a stalled QC stage and a
// clean network produced identical output: silence. Everything above the fold
// here comes from the run table for that reason.
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  AlertTriangle,
  ShieldAlert,
  HelpCircle,
  RefreshCw,
  Clock,
  ListChecks,
  Siren,
  History,
  CalendarCheck,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import adminService from '../services/adminService';
import './admin.css';

const WINDOWS = [7, 14, 30, 90];
const FINDINGS_PAGE = 50;

// Health status -> the badge classes admin.css already defines. `attention`
// borrows the offline styling deliberately: an aborted or failed pass means
// nothing was cleaned, which is the same practical state as no pass at all.
const HEALTH = {
  healthy:   { cls: 'status-healthy', icon: ShieldCheck,  label: 'Running' },
  stale:     { cls: 'status-stale',   icon: Clock,        label: 'Overdue' },
  attention: { cls: 'status-offline', icon: ShieldAlert,  label: 'Needs attention' },
  unknown:   { cls: 'status-pending', icon: HelpCircle,   label: 'Never run' },
};

const RUN_BADGE = {
  complete: 'badge-green',
  aborted:  'badge-yellow',
  failed:   'badge-red',
  running:  'badge-blue',
};

const StatsCard = ({ title, value, subtitle, icon: Icon, color = 'blue' }) => (
  <div className={`stats-card ${color}`}>
    <div className="stats-card-content">
      <div>
        <p className="stats-card-title">{title}</p>
        <p className="stats-card-value">{value}</p>
        {subtitle && <p className="stats-card-subtitle">{subtitle}</p>}
      </div>
      <div className="stats-card-icon"><Icon size={24} /></div>
    </div>
  </div>
);

const fmtAgo = (hours) => {
  if (hours === null || hours === undefined) return 'never';
  if (hours < 1) return `${Math.round(hours * 60)}m ago`;
  if (hours < 48) return `${hours.toFixed(1)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

const fmtNum = (v) => (v === null || v === undefined ? '—' : v.toLocaleString());

const QcDashboard = () => {
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [runs, setRuns] = useState([]);

  // Findings are fetched separately so changing a filter does not re-run the
  // summary's six aggregate queries.
  const [findings, setFindings] = useState(null);
  const [filters, setFilters] = useState({ severity: '', check_name: '', station_id: '', run_id: '' });
  const [offset, setOffset] = useState(0);

  const fetchTop = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, r] = await Promise.all([
        adminService.qc.getSummary(days),
        adminService.qc.getRuns(25),
      ]);
      setSummary(s);
      setRuns(r.runs || []);
    } catch (err) {
      console.error('Failed to load QC summary:', err);
      setError('Could not load the QC summary. Try again.');
    } finally {
      setLoading(false);
    }
  }, [days]);

  const fetchFindings = useCallback(async () => {
    try {
      const params = { days, limit: FINDINGS_PAGE, offset };
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      setFindings(await adminService.qc.getFindings(params));
    } catch (err) {
      console.error('Failed to load QC findings:', err);
    }
  }, [days, offset, filters]);

  useEffect(() => { fetchTop(); }, [fetchTop]);
  useEffect(() => { fetchFindings(); }, [fetchFindings]);

  const setFilter = (key, value) => {
    setOffset(0);
    setFilters((f) => ({ ...f, [key]: value }));
  };

  if (loading && !summary) {
    return (
      <AdminLayout title="Daily QC" subtitle="Loading…">
        <div className="loading-container"><div className="loading-spinner"><RefreshCw size={32} /></div></div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title="Daily QC">
        <div className="error-container">
          <p className="error-text">{error}</p>
          <button onClick={fetchTop} className="btn btn-primary mt-2">Try again</button>
        </div>
      </AdminLayout>
    );
  }

  const h = summary?.health;
  const cfg = HEALTH[h?.status] || HEALTH.unknown;
  const HealthIcon = cfg.icon;
  const last = h?.last_run;
  const notExamined = (summary?.coverage || []).filter((c) => !c.examined);

  return (
    <AdminLayout
      title="Daily QC"
      subtitle="Whether the checks ran, what they found, and which stations keep failing"
    >
      {/* window + refresh */}
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <div className="flex gap-2 items-center">
          <span className="text-sm text-muted">Window</span>
          {WINDOWS.map((d) => (
            <button
              key={d}
              onClick={() => { setDays(d); setOffset(0); }}
              className={`btn ${d === days ? 'btn-primary' : 'btn-secondary'}`}
            >
              {d}d
            </button>
          ))}
        </div>
        <button onClick={fetchTop} className="btn btn-secondary">
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {/* ---- 1. Is it running? ------------------------------------------- */}
      <section className="mb-6">
        <div className="card">
          <div className="card-body">
            <div className="flex justify-between items-center flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <span className={`status-badge ${cfg.cls}`}>
                  <HealthIcon size={16} /> {cfg.label}
                </span>
                <div>
                  <p className="font-medium">
                    {last
                      ? <>Last pass {fmtAgo(h.hours_since_last_run)} · <span className="font-mono text-sm">{last.run_id}</span></>
                      : 'No QC pass has ever been recorded.'}
                  </p>
                  <p className="text-sm text-muted">
                    Expected every {h?.expected_interval_hours}h.
                    {last && <> Judged {last.window_start} → {last.window_end}
                      {last.n_station_days != null && <> across {fmtNum(last.n_station_days)} station-days</>}.</>}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {h?.n_stuck > 0 && (
                  <span className="badge badge-red">{h.n_stuck} pass never finished</span>
                )}
                {h?.n_failed > 0 && <span className="badge badge-red">{h.n_failed} failed</span>}
                {h?.n_aborted > 0 && <span className="badge badge-yellow">{h.n_aborted} aborted</span>}
              </div>
            </div>

            {/* An abort means the reject-rate guard refused to act, so nothing
                was quarantined and nothing was cleaned. Worth spelling out —
                the run "succeeded" in the sense that it did not crash. */}
            {last?.status === 'aborted' && (
              <p className="text-sm text-yellow mt-3">
                The most recent pass aborted: its reject rate
                ({last.reject_rate != null ? `${(last.reject_rate * 100).toFixed(2)}%` : '—'})
                exceeded the guard ({last.max_reject_rate != null ? `${(last.max_reject_rate * 100).toFixed(0)}%` : '—'}),
                so it recorded findings but quarantined nothing. A rule that suddenly
                rejects a large share of the network is usually a broken rule.
              </p>
            )}
            {last?.error && (
              <p className="text-sm text-red mt-3 font-mono">{last.error}</p>
            )}
            {last?.n_late_enforced > 0 && (
              <p className="text-sm text-muted mt-3">
                {fmtNum(last.n_late_enforced)} late-arriving row(s) were re-quarantined by a
                standing window — a quarantine is a one-time update, so without this they
                would have flowed straight back into the daily table.
              </p>
            )}
          </div>
        </div>

        <div className="stats-grid mt-4">
          <StatsCard
            title="Passes" value={fmtNum(h?.n_runs)}
            subtitle={`${h?.n_complete || 0} complete in ${days}d`}
            icon={History} color="blue"
          />
          <StatsCard
            title="Days examined"
            value={`${(summary?.coverage || []).length - notExamined.length}/${(summary?.coverage || []).length}`}
            subtitle={notExamined.length ? `${notExamined.length} never checked` : 'full coverage'}
            icon={CalendarCheck} color={notExamined.length ? 'yellow' : 'green'}
          />
          <StatsCard
            title="Findings" value={fmtNum(summary?.n_findings)}
            subtitle={`${fmtNum(summary?.n_flag)} flagged, ${fmtNum(summary?.n_reject)} rejected`}
            icon={ListChecks} color="purple"
          />
          <StatsCard
            title="Stations affected" value={fmtNum(summary?.n_stations)}
            subtitle={`${(summary?.offenders || []).filter((o) => o.persistent).length} persistent`}
            icon={Siren} color="indigo"
          />
        </div>
      </section>

      {/* ---- coverage strip ---------------------------------------------- */}
      <section className="mb-6">
        <div className="section-header">
          <h2 className="section-title"><CalendarCheck size={20} /> Coverage</h2>
        </div>
        <div className="card">
          <div className="card-body">
            <p className="text-sm text-muted mb-3">
              A day counts as examined only if a completed pass covered it. This cannot be
              derived from the findings — an unchecked day and a clean day both produce none.
            </p>
            <div className="qc-coverage-strip">
              {(summary?.coverage || []).map((c) => (
                <div
                  key={c.date}
                  className={`qc-coverage-day ${c.examined ? 'examined' : 'missing'}`}
                  title={`${c.date} — ${c.examined ? `${c.n_runs} pass(es)` : 'never examined'}`}
                >
                  <span className="qc-coverage-label">{c.date.slice(8)}</span>
                </div>
              ))}
            </div>
            {notExamined.length > 0 && (
              <p className="text-sm text-yellow mt-3">
                Never examined: {notExamined.map((c) => c.date).join(', ')}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ---- 2. What fired ----------------------------------------------- */}
      <section className="mb-6">
        <div className="section-header">
          <h2 className="section-title"><ListChecks size={20} /> Checks</h2>
        </div>
        <div className="card">
          <div className="table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Check</th><th>Severity</th><th>Findings</th><th>Stations</th><th></th>
                </tr>
              </thead>
              <tbody>
                {(summary?.checks || []).map((c) => (
                  <tr key={`${c.check_name}-${c.severity}`}>
                    <td className="font-mono">{c.check_name}</td>
                    <td>
                      <span className={`badge ${c.severity === 'reject' ? 'badge-red' : 'badge-yellow'}`}>
                        {c.severity}
                      </span>
                    </td>
                    <td className="font-medium">{c.n}</td>
                    <td className="text-muted">{c.n_stations}</td>
                    <td>
                      <button className="btn btn-secondary"
                              onClick={() => setFilter('check_name', c.check_name)}>
                        Show
                      </button>
                    </td>
                  </tr>
                ))}
                {!(summary?.checks || []).length && (
                  <tr><td colSpan={5} className="text-muted">No findings in this window.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Listing the silent checks is the point of the `checks` column on
              the run row: a check dropped in a refactor must not look like a
              check that is passing. */}
          {(summary?.silent_checks || []).length > 0 && (
            <div className="card-body">
              <p className="text-sm text-muted">
                <span className="font-medium">Ran and found nothing ({summary.silent_checks.length}):</span>{' '}
                <span className="font-mono">{summary.silent_checks.join(', ')}</span>
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ---- 3. Who keeps failing ---------------------------------------- */}
      <section className="mb-6">
        <div className="section-header">
          <h2 className="section-title"><Siren size={20} /> Repeat offenders</h2>
          <Link to="/admin/weather" className="section-link">Station health →</Link>
        </div>
        <div className="card">
          <div className="card-body">
            <p className="text-sm text-muted">
              Ranked by how often a station trips, not by how many findings it has. One
              neighbour rejection is a thunderstorm; the same station on most of the days it
              was examined is a source fault the fit-time screen cannot repair.
            </p>
          </div>
          <div className="table-container scrollable-table">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Station</th><th>Source</th><th>Trip rate</th><th>Findings</th>
                  <th>Rejected</th><th>Checks</th><th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {(summary?.offenders || []).map((o) => (
                  <tr key={o.station_id}>
                    <td>
                      <Link to={`/admin/weather/${o.station_id}`} className="table-link font-medium">
                        {o.station_name || o.station_code || `Station ${o.station_id}`}
                      </Link>
                      {o.persistent && <span className="badge badge-red mt-1">persistent</span>}
                    </td>
                    <td className="text-muted">{o.data_source || '—'}</td>
                    <td className="font-medium">
                      {(o.trip_rate * 100).toFixed(0)}%
                      <span className="text-xs text-muted"> ({o.n_days}/{o.n_days_examined}d)</span>
                    </td>
                    <td>{o.n_findings}</td>
                    <td className={o.n_reject ? 'text-red font-medium' : 'text-muted'}>{o.n_reject}</td>
                    <td className="text-xs font-mono truncate">{(o.checks || []).join(', ')}</td>
                    <td className="text-muted text-sm">{o.last_seen}</td>
                  </tr>
                ))}
                {!(summary?.offenders || []).length && (
                  <tr><td colSpan={7} className="text-muted">No station tripped a check in this window.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ---- run log ------------------------------------------------------ */}
      <section className="mb-6">
        <div className="section-header">
          <h2 className="section-title"><History size={20} /> Run log</h2>
        </div>
        <div className="card">
          <div className="table-container scrollable-table">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Run</th><th>Status</th><th>Window judged</th><th>Station-days</th>
                  <th>Findings</th><th>Quarantined</th><th>Late re-applied</th><th></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.run_id}>
                    <td className="font-mono text-xs">{r.run_id}</td>
                    <td><span className={`badge ${RUN_BADGE[r.status] || 'badge-gray'}`}>{r.status}</span></td>
                    <td className="text-sm">{r.window_start} → {r.window_end}</td>
                    {/* A null station-day count is the marker of a run
                        reconstructed by backfill_qc_runs.py, not a pass that
                        examined nothing. */}
                    <td className={r.n_station_days == null ? 'text-muted' : ''}>
                      {r.n_station_days == null
                        ? <span title="Reconstructed from findings — the denominator was never recorded">rebuilt</span>
                        : fmtNum(r.n_station_days)}
                    </td>
                    <td>{fmtNum(r.n_findings)}
                      {r.n_reject > 0 && <span className="text-red"> ({r.n_reject} reject)</span>}
                    </td>
                    <td className="text-muted">{fmtNum(r.n_quarantined_rows)}</td>
                    <td className={r.n_late_enforced > 0 ? 'font-medium' : 'text-muted'}>
                      {fmtNum(r.n_late_enforced)}
                    </td>
                    <td>
                      <button className="btn btn-secondary"
                              onClick={() => setFilter('run_id', r.run_id)}>
                        Findings
                      </button>
                    </td>
                  </tr>
                ))}
                {!runs.length && (
                  <tr><td colSpan={8} className="text-muted">No runs recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ---- findings ----------------------------------------------------- */}
      <section>
        <div className="section-header">
          <h2 className="section-title"><AlertTriangle size={20} /> Findings</h2>
        </div>

        <div className="filters-panel mb-4">
          <div className="filters-grid">
            <div className="filter-group">
              <label className="form-label">Severity</label>
              <select className="form-select" value={filters.severity}
                      onChange={(e) => setFilter('severity', e.target.value)}>
                <option value="">All</option>
                <option value="reject">Rejected (acted on)</option>
                <option value="flag">Flagged (left in place)</option>
              </select>
            </div>
            <div className="filter-group">
              <label className="form-label">Check</label>
              <select className="form-select" value={filters.check_name}
                      onChange={(e) => setFilter('check_name', e.target.value)}>
                <option value="">All</option>
                {[...new Set([...(summary?.checks || []).map((c) => c.check_name),
                              ...(summary?.silent_checks || [])])].sort().map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label className="form-label">Station ID</label>
              <input className="form-input" type="number" value={filters.station_id}
                     placeholder="any"
                     onChange={(e) => setFilter('station_id', e.target.value)} />
            </div>
            <div className="filter-group">
              <label className="form-label">Run</label>
              <input className="form-input" value={filters.run_id} placeholder="any"
                     onChange={(e) => setFilter('run_id', e.target.value)} />
            </div>
          </div>
          {Object.values(filters).some(Boolean) && (
            <button className="filters-clear"
                    onClick={() => { setOffset(0); setFilters({ severity: '', check_name: '', station_id: '', run_id: '' }); }}>
              Clear filters
            </button>
          )}
        </div>

        <div className="card">
          <div className="table-container scrollable-table">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Day</th><th>Station</th><th>Variable</th><th>Check</th>
                  <th>Severity</th><th>Value</th><th>Expected</th><th>Action</th><th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {(findings?.findings || []).map((f) => (
                  <tr key={f.id}>
                    <td className="text-sm">{f.date}</td>
                    <td>
                      <Link to={`/admin/weather/${f.station_id}`} className="table-link">
                        {f.station_name || f.station_code || f.station_id}
                      </Link>
                    </td>
                    <td className="font-mono text-xs">{f.variable}</td>
                    <td className="font-mono text-xs">{f.check_name}</td>
                    <td>
                      <span className={`badge ${f.severity === 'reject' ? 'badge-red' : 'badge-yellow'}`}>
                        {f.severity}
                      </span>
                    </td>
                    <td className="font-medium">{f.value ?? '—'}</td>
                    <td className="text-muted">
                      {f.expected == null ? '—' : Number(f.expected).toFixed(2)}
                    </td>
                    <td className="text-muted text-xs">{f.action}</td>
                    {/* detail is JSONB and deliberately not commensurable
                        between checks — a neighbour test carries distances and a
                        robust z, a flatline test carries a repeat count. */}
                    <td className="text-xs font-mono truncate">
                      {f.detail
                        ? Object.entries(f.detail).map(([k, v]) => `${k}=${v}`).join('  ')
                        : '—'}
                    </td>
                  </tr>
                ))}
                {!(findings?.findings || []).length && (
                  <tr><td colSpan={9} className="text-muted">No findings match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {findings && findings.total > FINDINGS_PAGE && (
            <div className="pagination">
              <span className="pagination-info">
                {offset + 1}–{Math.min(offset + FINDINGS_PAGE, findings.total)} of {findings.total}
              </span>
              <div className="pagination-controls">
                <button className="pagination-btn" disabled={offset === 0}
                        onClick={() => setOffset(Math.max(0, offset - FINDINGS_PAGE))}>
                  Previous
                </button>
                <button className="pagination-btn"
                        disabled={offset + FINDINGS_PAGE >= findings.total}
                        onClick={() => setOffset(offset + FINDINGS_PAGE)}>
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </AdminLayout>
  );
};

export default QcDashboard;
