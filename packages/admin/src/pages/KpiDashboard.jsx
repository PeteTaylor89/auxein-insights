// src/pages/KpiDashboard.jsx — platform KPIs, monthly.
//
// Scoped in docs/plans/KPI_DASHBOARD_SCOPE_2026-09-15.md.
//
// Three things this screen has to get right, all of them about not misleading:
//
//  1. STOCK vs FLOW. A level (users, hectares) and an increment (tasks completed
//     this month) are different readings and are labelled differently. A flow
//     tile leads with the month's own number and shows cumulative underneath.
//  2. THE MANUAL SEAM. Three series were hand-tracked before automation. Where a
//     series switches method the chart marks it, because a method change that
//     looks like a step change is the classic way these charts lie.
//  3. ABSOLUTE NUMBERS BESIDE PERCENTAGES. With 5 real companies and 9 real Grow
//     users, one new customer moves every ratio sharply. A percentage on its own
//     at this scale is not informative.
import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, Minus, PenLine, AlertTriangle } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import kpiService from '../services/kpiService';
import './kpi-dashboard.css';

const GROUP_ORDER = ['Insights', 'Data', 'Grow'];

function formatValue(value, unit) {
  if (value === null || value === undefined) return '—';
  if (unit === 'percent') return `${Number(value).toFixed(1)}%`;
  if (unit === 'hectares') return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })} ha`;
  return Number(value).toLocaleString();
}

/** Inline sparkline. No chart library for twelve points and one path. */
function Sparkline({ series, unit }) {
  const points = series.filter((p) => p.value !== null && p.value !== undefined);
  if (points.length < 2) return <div className="kpi-spark kpi-spark-empty">no history yet</div>;

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const W = 150;
  const H = 34;

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * W;
    const y = H - ((p.value - min) / span) * (H - 4) - 2;
    return [x, y];
  });

  const path = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  // Where the series stops being hand-kept and starts being computed.
  const seamIndex = points.findIndex((p, i) => i > 0 && points[i - 1].source === 'manual' && p.source !== 'manual');

  return (
    <svg className="kpi-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
         aria-label={`Trend: ${formatValue(points[0].value, unit)} to ${formatValue(points[points.length - 1].value, unit)}`}>
      {seamIndex > 0 && (
        <line x1={coords[seamIndex][0]} y1="0" x2={coords[seamIndex][0]} y2={H}
              className="kpi-spark-seam" />
      )}
      <path d={path} className="kpi-spark-line" />
      <circle cx={coords[coords.length - 1][0]} cy={coords[coords.length - 1][1]} r="2.5"
              className="kpi-spark-dot" />
    </svg>
  );
}

function Delta({ pct }) {
  if (pct === null || pct === undefined) return <span className="kpi-delta kpi-delta-flat"><Minus size={12} /> —</span>;
  if (pct === 0) return <span className="kpi-delta kpi-delta-flat"><Minus size={12} /> 0%</span>;
  const up = pct > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`kpi-delta ${up ? 'kpi-delta-up' : 'kpi-delta-down'}`}>
      <Icon size={12} /> {up ? '+' : ''}{pct}%
    </span>
  );
}

function MetricTile({ metric }) {
  const { label, unit, kind, latest, delta_pct: delta, series, computed } = metric;
  const isFlow = kind === 'flow';
  const isManual = latest?.source === 'manual';

  // A flow metric leads with the month's own count, not the cumulative total —
  // "47 tasks completed this month" is the reading someone wants; the running
  // total is context.
  const headline = isFlow && latest?.period_value !== null && latest?.period_value !== undefined
    ? latest.period_value
    : latest?.value;

  return (
    <div className="kpi-tile">
      <div className="kpi-tile-head">
        <span className="kpi-label">{label}</span>
        {isManual && (
          <span className="kpi-badge kpi-badge-manual" title="Hand-tracked, not computed">
            <PenLine size={11} /> manual
          </span>
        )}
        {!computed && !isManual && (
          <span className="kpi-badge kpi-badge-warn" title="No metric function computes this yet">
            <AlertTriangle size={11} /> seeded
          </span>
        )}
      </div>

      <div className="kpi-value-row">
        <span className="kpi-value">{formatValue(headline, unit)}</span>
        <Delta pct={delta} />
      </div>

      <div className="kpi-sub">
        {isFlow
          ? <>this month · <strong>{formatValue(latest?.value, unit)}</strong> all time</>
          : <>as at {latest?.date ?? '—'}</>}
      </div>

      <Sparkline series={series} unit={unit} />
    </div>
  );
}

export default function KpiDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    kpiService.list()
      .then(setData)
      .catch((e) => setError(e.message || 'Could not load KPIs.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const latestMonth = useMemo(() => {
    const dates = (data?.metrics || [])
      .map((m) => m.latest?.date)
      .filter(Boolean)
      .sort();
    return dates.length ? dates[dates.length - 1] : null;
  }, [data]);

  const recompute = async () => {
    if (!latestMonth) return;
    const month = latestMonth.slice(0, 7);
    setBusy(true);
    try {
      await kpiService.recompute(month);
      load();
    } catch (e) {
      setError(e.message || 'Recompute failed.');
    } finally {
      setBusy(false);
    }
  };

  const grouped = useMemo(() => {
    const out = {};
    (data?.metrics || []).forEach((m) => {
      (out[m.group] = out[m.group] || []).push(m);
    });
    return out;
  }, [data]);

  const hasAny = (data?.metrics || []).some((m) => m.series.length > 0);

  return (
    <AdminLayout
      title="Platform KPIs"
      subtitle={latestMonth ? `Latest snapshot ${latestMonth}` : 'Monthly snapshots'}
    >
      <div className="kpi-page">
        <div className="kpi-toolbar">
          <p className="kpi-note">
            Snapshots are taken on the 1st and describe the month just ended. Grow figures
            exclude internal companies (<code>companies.is_internal</code>).
          </p>
          <button type="button" className="kpi-recompute" onClick={recompute}
                  disabled={busy || !latestMonth}>
            <RefreshCw size={14} className={busy ? 'kpi-spin' : ''} />
            {busy ? 'Recomputing…' : `Recompute ${latestMonth ? latestMonth.slice(0, 7) : ''}`}
          </button>
        </div>

        {error && <div className="kpi-error">{error}</div>}

        {loading && <div className="kpi-loading"><RefreshCw size={20} className="kpi-spin" /> Loading…</div>}

        {!loading && !hasAny && !error && (
          <div className="kpi-empty">
            <h2>No snapshots yet</h2>
            <p>
              Run the backfill to build the history, then the monthly job keeps it current:
            </p>
            <pre>python scripts/backfill_kpi_snapshots.py --apply</pre>
            <p className="kpi-empty-note">
              It is a dry run by default — nothing is written without <code>--apply</code>.
            </p>
          </div>
        )}

        {!loading && hasAny && GROUP_ORDER.filter((g) => grouped[g]).map((group) => (
          <section className="kpi-group" key={group}>
            <h2 className="kpi-group-title">{group}</h2>
            <div className="kpi-grid">
              {grouped[group].map((m) => <MetricTile key={m.key} metric={m} />)}
            </div>
          </section>
        ))}
      </div>
    </AdminLayout>
  );
}
