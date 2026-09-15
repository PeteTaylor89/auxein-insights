// src/pages/JobsDashboard.jsx - Every scheduled job, day by day
//
// The dashboard panel answers "is anything broken right now". This page answers
// the question that panel structurally cannot: "has anything been broken", and
// the difference is not academic.
//
// When the 18:00 pipeline went dark for three days in August 2026, the restart
// repaired the newest day first. From that moment the freshness check was green
// — newest row, one day old, healthy — while three days of zone rollups,
// disease and phenology were simply missing behind it. Nothing on the platform
// could see that hole, because nothing counted days. This page counts days.
//
// So the unit here is one cell per job per day, and the states are deliberately
// four rather than two:
//
//   produced  the job wrote rows for that day, and enough of them
//   short     it wrote rows, but fewer than a complete day reaches. This is the
//             silent failure mode — three of four surface variables, twelve of
//             twenty-two zones. The job succeeds; the product is wrong.
//   pending   inside the job's designed data lag. The daily fit TARGETS D-2, so
//             today and yesterday are empty on a perfectly healthy day and
//             painting them red would teach everyone to ignore the page.
//   missing   nothing, and no excuse. A hole.
import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Clock,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import adminService from '../services/adminService';
import './admin.css';

const WINDOWS = [14, 21, 30, 60, 90];

const JOB_STATUS = {
  ok:      { icon: CheckCircle2,  color: '#16a34a', label: 'Healthy' },
  late:    { icon: Clock,         color: '#ca8a04', label: 'Late' },
  stale:   { icon: AlertTriangle, color: '#dc2626', label: 'Stale' },
  never:   { icon: XCircle,       color: '#dc2626', label: 'Never produced' },
  unknown: { icon: HelpCircle,    color: '#6b7280', label: 'Check failed' },
};

const fmtAge = (h) => {
  if (h === null || h === undefined) return 'never';
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${Math.round(h / 24)}d`;
};

// Dates are handled as plain YYYY-MM-DD strings throughout. Parsing them into
// Date objects would apply the browser's timezone to a value that is already a
// calendar day, and in NZ that shifts every cell by one — the exact class of
// bug this platform keeps finding in its own pipeline.
const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + n * 86400000;
  return new Date(t).toISOString().slice(0, 10);
};

const spanDays = (start, end) => {
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
};

const dayLabel = (iso) => iso.slice(8, 10);

/**
 * One job's window as a strip of day cells.
 *
 * `lagDays` comes from the job's own `max_age_hours` — the same allowance the
 * freshness check makes — so the two views can never disagree about whether
 * today counts as missing.
 */
const DayStrip = ({ job, days, lagDays }) => {
  const byDay = new Map((job.days || []).map((d) => [d.day, d.count]));
  const today = days[days.length - 1];
  const firstPending = addDays(today, -(lagDays - 1));

  return (
    <div className="job-strip">
      {days.map((iso) => {
        const count = byDay.get(iso);
        const pending = iso >= firstPending;
        let state = 'missing';
        if (count !== undefined) {
          state = job.expected && count < job.expected ? 'short' : 'produced';
        } else if (pending) {
          state = 'pending';
        }
        const title = count !== undefined
          ? `${iso} — ${count.toLocaleString()} ${job.unit || 'rows'}`
              + (job.expected ? ` of ${job.expected}` : '')
          : `${iso} — nothing${pending ? ' yet (inside the designed lag)' : ''}`;
        return (
          <span key={iso} className={`job-cell job-cell--${state}`} title={title}>
            {dayLabel(iso)}
          </span>
        );
      })}
    </div>
  );
};

const JobsDashboard = () => {
  const [days, setDays] = useState(21);
  const [status, setStatus] = useState(null);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Both in one go: the strip needs `max_age_hours` from the status payload
      // to know which trailing days are legitimately empty, so a page that
      // rendered history alone would paint every healthy job red.
      const [s, h] = await Promise.all([
        adminService.jobs.getStatus(),
        adminService.jobs.getHistory(days),
      ]);
      setStatus(s);
      setHistory(h);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const statusByKey = new Map((status?.jobs || []).map((j) => [j.key, j]));
  const calendar = history ? spanDays(history.start, history.end) : [];
  const overall = JOB_STATUS[status?.overall] || JOB_STATUS.unknown;
  const OverallIcon = overall.icon;

  // Counted here rather than served, because "a hole" is a statement about the
  // calendar the caller drew, and the API deliberately does not draw one.
  const holesFor = (job) => {
    if (!job || job.error) return null;
    const s = statusByKey.get(job.key);
    const lagDays = Math.max(1, Math.ceil((s?.max_age_hours ?? 24) / 24));
    const cutoff = addDays(history.end, -(lagDays - 1));
    const have = new Set((job.days || []).map((d) => d.day));
    const missing = calendar.filter((d) => d < cutoff && !have.has(d));
    const short = (job.days || []).filter(
      (d) => job.expected && d.count < job.expected).map((d) => d.day);
    return { missing, short, lagDays };
  };

  return (
    <AdminLayout
      title="Scheduled jobs"
      subtitle="What every automated job produced, day by day — not whether it reported success"
    >
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <div className="flex gap-2 items-center">
          <span className="text-sm text-muted">Window</span>
          {WINDOWS.map((d) => (
            <button
              key={d}
              className={`btn btn-sm ${d === days ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setDays(d)}
            >
              {d}d
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          {status && (
            <span className="job-health-overall" style={{ color: overall.color }}>
              <OverallIcon size={16} /> {overall.label}
            </span>
          )}
          <button className="btn btn-sm btn-secondary" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : undefined} /> Refresh
          </button>
        </div>
      </div>

      {error && <div className="job-health-error">{error}</div>}

      {history && (
        <section className="mb-6">
          <div className="section-header">
            <h2 className="section-title"><Activity size={20} /> Daily production</h2>
            <span className="text-sm text-muted">
              {history.start} → {history.end}
            </span>
          </div>

          <div className="job-history-list">
            {history.jobs.map((job) => {
              const s = statusByKey.get(job.key);
              const st = JOB_STATUS[s?.status] || JOB_STATUS.unknown;
              const Icon = st.icon;
              const h = holesFor(job);
              return (
                <div key={job.key} className="job-history-row">
                  <div className="job-history-head">
                    <span className="job-dot" style={{ color: st.color }}>
                      <Icon size={15} />
                    </span>
                    <div className="job-name">
                      <b>{job.name}</b>
                      <span>
                        {s ? `${s.runs_on} · ${s.cadence}` : job.key}
                        {' · '}
                        {/* A gap in a "run" job is a missed run; a gap in a
                            "data" job is missing data. They are different
                            failures and the page says which it is showing. */}
                        {job.axis === 'run' ? 'by run day' : 'by data day'}
                        {job.expected ? ` · ${job.expected} ${job.unit} = complete` : ''}
                      </span>
                    </div>
                    <div className="job-age">
                      <b style={{ color: st.color }}>{fmtAge(s?.age_hours)}</b>
                      <span>of {fmtAge(s?.max_age_hours)}</span>
                    </div>
                    <div className="job-history-verdict">
                      {job.error ? (
                        <span className="job-detail-err">{job.error}</span>
                      ) : h && (h.missing.length || h.short.length) ? (
                        <span className="job-detail-err">
                          {h.missing.length ? `${h.missing.length} day(s) missing` : ''}
                          {h.missing.length && h.short.length ? ' · ' : ''}
                          {h.short.length ? `${h.short.length} incomplete` : ''}
                        </span>
                      ) : (
                        <span className="job-detail-muted">no gaps</span>
                      )}
                    </div>
                  </div>

                  <DayStrip
                    job={job}
                    days={calendar}
                    lagDays={h ? h.lagDays : 1}
                  />

                  {h && h.missing.length > 0 && (
                    <div className="job-history-holes">
                      Missing: {h.missing.join(', ')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="job-strip-legend">
            <span><i className="job-cell job-cell--produced" /> produced</span>
            <span><i className="job-cell job-cell--short" /> incomplete</span>
            <span><i className="job-cell job-cell--pending" /> inside the designed lag</span>
            <span><i className="job-cell job-cell--missing" /> nothing</span>
          </div>

          <p className="job-health-foot">
            A cell is what the job PRODUCED for that day, never whether it
            reported success — a green run that wrote nothing has been this
            platform's signature failure three separate times. Trailing days are
            grey rather than red because several jobs target D-2 by design; the
            allowance is each job's own freshness threshold, so this page and the
            dashboard banner can never disagree.
          </p>
        </section>
      )}
    </AdminLayout>
  );
};

export default JobsDashboard;
