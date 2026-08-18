// components/reports/ReportPrimitives.jsx — the shared furniture every report uses.
//
// Kept in one file so the ten reports read as one product rather than ten
// people's ideas of a table. Anything here is presentation only; a report
// component decides WHAT to show, these decide how it looks.
import { Download } from 'lucide-react';

/** Section wrapper with a title and an actions slot. */
export function ReportSection({ title, actions, children }) {
  return (
    <div className="report-section">
      <div className="report-section-header">
        <h3>{title}</h3>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>{actions}</div>
      </div>
      {children}
    </div>
  );
}

/**
 * A headline figure.
 *
 * `tone` drives colour: 'danger' for a number that means someone has to act
 * (unnotified WorkSafe events, overdue work), 'warn' for something to watch.
 * Zero is deliberately NOT toned — a green zero and a red zero both say "none",
 * and the red one teaches people to ignore the colour.
 */
export function Stat({ value, label, tone, suffix }) {
  const toned = tone && value ? ` report-stat-value--${tone}` : '';
  return (
    <div className="report-stat">
      <div className={`report-stat-value${toned}`}>
        {value}{suffix || ''}
      </div>
      <div className="report-stat-label">{label}</div>
    </div>
  );
}

export function StatGrid({ children }) {
  return <div className="report-stats-grid">{children}</div>;
}

/** Horizontal bar breakdown, as used by the original task report. */
export function BarList({ title, items, total, accent = false }) {
  if (!items || items.length === 0) return null;
  const max = total || items.reduce((n, i) => Math.max(n, i.count), 0) || 1;
  return (
    <div className="report-breakdown">
      <h4>{title}</h4>
      <div className="report-bar-list">
        {items.map((i) => (
          <div key={i.key} className="report-bar-item">
            <span className="report-bar-label">{String(i.key).replace(/_/g, ' ')}</span>
            <div className="report-bar-track">
              <div
                className={`report-bar-fill${accent ? ' report-bar-fill--accent' : ''}`}
                style={{ width: `${(i.count / max) * 100}%` }}
              />
            </div>
            <span className="report-bar-count">{i.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * A table.
 *
 * `columns` is [{ key, label, align, render }]. Long tables scroll inside their
 * own container rather than pushing the page sideways — a report with 300 blocks
 * in it should not make the filters unreachable.
 */
export function ReportTable({ title, columns, rows, empty = 'Nothing to show', maxHeight = 460 }) {
  return (
    <div className="report-breakdown">
      {title && <h4>{title}</h4>}
      {(!rows || rows.length === 0) ? (
        <div className="report-empty">{empty}</div>
      ) : (
        <div className="report-table-scroll" style={{ maxHeight, overflow: 'auto' }}>
          <table className="report-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} style={{ textAlign: c.align || 'left' }}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id ?? r.key ?? i}>
                  {columns.map((c) => (
                    <td key={c.key} style={{ textAlign: c.align || 'left' }}>
                      {c.render ? c.render(r) : (r[c.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Small coloured pill, for statuses and risk levels. */
export function Pill({ children, tone = 'neutral' }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

/**
 * A note explaining why a number is what it is.
 *
 * Used where the data itself is the finding — "0 hours because nothing is
 * logged against tasks" is a very different message from "0 hours worked", and
 * a report that cannot tell them apart will be mistrusted the first time
 * someone spots it.
 */
export function ReportNote({ children }) {
  return (
    <div className="report-note">
      {children}
    </div>
  );
}

export function LoadingBlock({ label }) {
  return <div className="report-loading">Loading {label}…</div>;
}

export function ErrorBlock({ label, onRetry }) {
  return (
    <div className="report-empty">
      Unable to load {label}.
      {onRetry && (
        <button className="btn-ghost" onClick={onRetry} style={{ marginLeft: 8 }}>
          <Download size={14} style={{ transform: 'rotate(180deg)' }} /> Retry
        </button>
      )}
    </div>
  );
}

/** Turn a [{status|category|key, count}] list into BarList items. */
export function toItems(list, keyField) {
  return (list || []).map((r) => ({ key: r[keyField], count: r.count }));
}

export const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-NZ', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
};

export const fmtNum = (n, dp = 1) =>
  (n === null || n === undefined) ? '—' : Number(n).toFixed(dp);
