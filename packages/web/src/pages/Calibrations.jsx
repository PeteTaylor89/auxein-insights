// pages/Calibrations.jsx — Unified table of pending schedules + completed events.
// Pending rows come from /calibration-schedules (status=pending). Completed rows
// come from /calibrations (status in pass/out_of_tolerance). Merged client-side
// because the two are quite different shapes and unioning at the API would just
// shift the same complexity to the backend.

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { Sliders, Search, AlertTriangle, CheckCircle, XCircle, Clock, ExternalLink, ArrowLeft } from 'lucide-react';
import { assetService } from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';
import './Calibrations.css';

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'due', label: 'Due' },
  { value: 'pass', label: 'Passed' },
  { value: 'out_of_tolerance', label: 'Failed' },
];

export default function Calibrations() {
  const [schedules, setSchedules] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    document.body.classList.add('primary-bg');
    return () => document.body.classList.remove('primary-bg');
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const [s, e] = await Promise.all([
          assetService.calibration.listSchedules({ pending_only: true, limit: 500 }),
          assetService.calibration.listCalibrations({ limit: 500 }),
        ]);
        if (cancelled) return;
        setSchedules(Array.isArray(s) ? s : []);
        setEvents(Array.isArray(e) ? e : []);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load calibrations:', err);
        setError('Failed to load calibrations');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Build a unified list. Each row carries a `kind` discriminator and a `sortDate`
  // (due_date for pending, calibration_date for completed) for sorting.
  const rows = useMemo(() => {
    const today = dayjs().startOf('day');
    const pending = schedules.map(s => {
      const due = dayjs(s.due_date);
      const isOverdue = due.isBefore(today);
      return {
        kind: 'pending',
        id: `s-${s.id}`,
        scheduleId: s.id,
        assetId: s.asset_id,
        assetName: s.asset_name || `Asset #${s.asset_id}`,
        type: s.calibration_type,
        parameter: s.parameter_name,
        unit: s.unit_of_measure,
        target: s.target_value,
        toleranceMin: s.tolerance_min,
        toleranceMax: s.tolerance_max,
        date: s.due_date,
        sortDate: s.due_date,
        status: isOverdue ? 'overdue' : 'due',
        reading: null,
        within: null,
      };
    });
    const completed = events.map(e => ({
      kind: 'completed',
      id: `e-${e.id}`,
      eventId: e.id,
      assetId: e.asset_id,
      assetName: e.asset_name || e.asset?.name || `Asset #${e.asset_id}`,
      type: e.calibration_type,
      parameter: e.parameter_name,
      unit: e.unit_of_measure,
      target: e.target_value,
      toleranceMin: e.tolerance_min,
      toleranceMax: e.tolerance_max,
      date: e.calibration_date,
      sortDate: e.calibration_date,
      status: e.status,
      reading: e.measured_value,
      within: e.within_tolerance,
    }));

    let merged = [...pending, ...completed];

    // Filter — search across asset name + parameter
    const q = search.trim().toLowerCase();
    if (q) {
      merged = merged.filter(r =>
        (r.assetName || '').toLowerCase().includes(q) ||
        (r.parameter || '').toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') {
      merged = merged.filter(r => r.status === statusFilter);
    }
    if (typeFilter !== 'all') {
      merged = merged.filter(r => r.type === typeFilter);
    }

    // Sort: overdue first, then due (soonest first), then completed (most recent first)
    const statusRank = { overdue: 0, due: 1, out_of_tolerance: 2, pass: 3 };
    merged.sort((a, b) => {
      const ra = statusRank[a.status] ?? 9;
      const rb = statusRank[b.status] ?? 9;
      if (ra !== rb) return ra - rb;
      // Within same status group: pending sorts ASC by date (oldest overdue first),
      // completed sorts DESC (most recent first).
      const da = dayjs(a.sortDate);
      const db = dayjs(b.sortDate);
      if (a.kind === 'pending' && b.kind === 'pending') return da.diff(db);
      return db.diff(da);
    });

    return merged;
  }, [schedules, events, search, statusFilter, typeFilter]);

  // Build a list of unique types for the type filter dropdown
  const allTypes = useMemo(() => {
    const set = new Set();
    schedules.forEach(s => s.calibration_type && set.add(s.calibration_type));
    events.forEach(e => e.calibration_type && set.add(e.calibration_type));
    return Array.from(set).sort();
  }, [schedules, events]);

  const overdueCount = rows.filter(r => r.status === 'overdue').length;
  const dueCount = rows.filter(r => r.status === 'due').length;
  const failCount = rows.filter(r => r.status === 'out_of_tolerance').length;

  return (
    <div className="page-container cal-page">
      <div className="cal-header">
        <Link to="/assets" className="cal-back">
          <ArrowLeft size={14} /> Back to Assets
        </Link>
        <div className="cal-title-row">
          <Sliders size={22} />
          <h1>Calibrations</h1>
        </div>
        <div className="cal-stats">
          <StatChip color="danger" icon={AlertTriangle} label="Overdue" value={overdueCount} />
          <StatChip color="warning" icon={Clock} label="Due" value={dueCount} />
          <StatChip color="danger" icon={XCircle} label="Failed (history)" value={failCount} />
          <StatChip color="muted" icon={CheckCircle} label="Total events" value={events.length} />
        </div>
      </div>

      <div className="cal-filter-bar">
        <div className="cal-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search by asset or parameter..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="cal-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          {STATUS_FILTERS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select className="cal-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">All types</option>
          {allTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select>
      </div>

      {error && <div className="cal-error"><AlertTriangle size={16} /> {error}</div>}

      <div className="cal-table-wrap">
        <table className="cal-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Type</th>
              <th>Parameter</th>
              <th>Tolerance</th>
              <th>Date</th>
              <th>Status</th>
              <th>Reading</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="cal-empty">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="cal-empty">No calibrations match.</td></tr>
            ) : rows.map(r => (
              <tr key={r.id} className={`cal-row cal-row--${r.status}`}>
                <td>
                  <Link to={`/assets/equipment/${r.assetId}/edit`} className="cal-asset-link">
                    {r.assetName} <ExternalLink size={12} />
                  </Link>
                </td>
                <td>{(r.type || '').replace(/_/g, ' ') || '—'}</td>
                <td>{r.parameter || '—'}</td>
                <td>
                  {r.toleranceMin != null && r.toleranceMax != null
                    ? `${r.toleranceMin} – ${r.toleranceMax} ${r.unit || ''}`.trim()
                    : '—'}
                </td>
                <td>
                  {dayjs(r.date).format('DD MMM YYYY')}
                  {r.kind === 'pending' && r.status === 'overdue' && (
                    <span className="cal-overdue-tag"> · {dayjs().diff(dayjs(r.date), 'day')}d</span>
                  )}
                </td>
                <td><StatusBadge status={r.status} /></td>
                <td>
                  {r.reading != null
                    ? <span className={r.within === false ? 'cal-reading cal-reading--bad' : 'cal-reading'}>
                        {r.reading} {r.unit || ''}
                      </span>
                    : '—'}
                </td>
                <td>
                  {r.kind === 'pending'
                    ? <span className="cal-hint">Field worker action</span>
                    : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="cal-footnote">
        Pending rows come from scheduled calibration tickets. Completed rows are immutable event history.
        Field workers complete pending calibrations from the mobile app — that consumes the schedule and
        auto-spawns the next one (asset interval on pass, 7-day recheck on fail).
      </p>

      <MobileNavigation />
    </div>
  );
}

function StatChip({ color, icon: Icon, label, value }) {
  return (
    <div className={`cal-stat cal-stat--${color}`}>
      <Icon size={14} />
      <span className="cal-stat-value">{value}</span>
      <span className="cal-stat-label">{label}</span>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    overdue:          { label: 'Overdue',  cls: 'cal-badge--danger' },
    due:              { label: 'Due',      cls: 'cal-badge--warning' },
    pass:             { label: 'Pass',     cls: 'cal-badge--success' },
    out_of_tolerance: { label: 'Failed',   cls: 'cal-badge--danger' },
  };
  const m = map[status] || { label: status, cls: 'cal-badge--default' };
  return <span className={`cal-badge ${m.cls}`}>{m.label}</span>;
}
