// components/climate/PropertyMonthlyChart.jsx — month by month against this
// property's own normal. Ported from the Insights Pro page's SiteMonthlyChart on
// 2026-09-23.
//
// The season chart answers "how does this property compare with its region".
// This one answers "how is it behaving against itself", which is the question
// asked mid-season: warmer or cooler than normal, and by how much.
//
// **The anomaly is server-computed and never re-derived here.** The API applies
// ONE baseline to the property's normal and to the regional normal, and a chart
// that recomputed it from whatever it happened to have loaded could difference
// against a different period than the one printed underneath.
//
// Bars diverge from zero because an anomaly has a sign and a magnitude and
// nothing else. A line would imply continuity between a warm January and the
// cool February after it, which is two months, not a trend.
import { useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import 'chart.js/auto';
import '../../utils/chartDefaults';
import './PropertyCharts.css';

const WARM = 'rgba(214, 96, 60, 0.85)';
const COOL = 'rgba(70, 116, 168, 0.85)';
const WET = 'rgba(42, 122, 190, 0.85)';
const DRY = 'rgba(190, 150, 60, 0.85)';

// How many recent months to show by default. The full record is 456 bars, which
// on a phone is a texture rather than a chart; the whole span stays reachable.
const WINDOWS = [
  { key: 60, label: 'Last 5 years' },
  { key: 120, label: 'Last 10 years' },
  { key: 0, label: 'Whole record' },
];

function PropertyMonthlyChart({ payload, height = 300 }) {
  const [window, setWindow] = useState(60);
  const all = payload?.points || [];
  const isRain = payload?.variable === 'rainfall';

  const points = useMemo(
    () => (window > 0 ? all.slice(-window) : all),
    [all, window],
  );

  const data = useMemo(() => ({
    labels: points.map((p) => p.valid_at),
    datasets: [{
      label: `Difference from the ${payload?.meta?.baseline || ''} normal`,
      data: points.map((p) => p.anomaly),
      backgroundColor: points.map((p) => {
        if (p.anomaly == null) return 'rgba(0,0,0,0.1)';
        if (isRain) return p.anomaly >= 0 ? WET : DRY;
        return p.anomaly >= 0 ? WARM : COOL;
      }),
      borderWidth: 0,
      barPercentage: 1.0,
      categoryPercentage: 0.92,
    }],
  }), [points, isRain, payload?.meta?.baseline]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          // The anomaly alone is not readable without the value it came from and
          // the normal it was measured against.
          afterBody: (items) => {
            const p = points[items[0].dataIndex];
            if (!p) return '';
            const lines = [];
            if (p.value != null) lines.push(`Value        ${p.value.toFixed(1)}`);
            if (p.site_normal != null) lines.push(`Its normal   ${p.site_normal.toFixed(1)}`);
            if (p.zone_normal != null) lines.push(`Region       ${p.zone_normal.toFixed(1)}`);
            return lines.join('\n');
          },
          label: (ctx) => {
            const v = ctx.parsed.y;
            if (v == null) return 'No surface for this month';
            return `${v > 0 ? '+' : ''}${v.toFixed(2)}`;
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxTicksLimit: 10, autoSkip: true } },
      y: {
        grid: { color: 'rgba(0,0,0,0.06)' },
        title: { display: true, text: 'difference from normal' },
      },
    },
  }), [points]);

  if (!all.length) return <p className="pch-empty">Nothing to show yet.</p>;

  return (
    <div className="pch-monthly">
      <div className="pch-windows" role="group" aria-label="Period">
        {WINDOWS.map((w) => (
          <button
            key={w.key}
            type="button"
            className={`pch-window${w.key === window ? ' is-active' : ''}`}
            onClick={() => setWindow(w.key)}
          >
            {w.label}
          </button>
        ))}
      </div>
      <div className="pch-chart" style={{ height }}>
        <Bar data={data} options={options} />
      </div>
      <p className="pch-note">
        Measured against this property&rsquo;s own {payload?.meta?.baseline} average.
        {payload?.meta?.regional_comparison
          ? ' The same period is used for the regional figure in the tooltip, so the two are directly comparable.'
          : ' Its point sits outside every mapped wine region, so there is no regional figure.'}
      </p>
    </div>
  );
}

export default PropertyMonthlyChart;
