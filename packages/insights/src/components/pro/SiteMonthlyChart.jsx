// components/pro/SiteMonthlyChart.jsx — month by month against your own normal.
//
// The season chart answers "how does my site compare to the region". This one
// answers "how is my site behaving against itself", which is the question a
// grower actually asks mid-season: warmer or cooler than normal, and by how
// much.
//
// **The anomaly is server-computed and not re-derived here.** The API applies
// ONE baseline to the site normal and the regional normal, and a chart that
// recomputed the anomaly from whatever it happened to have loaded could easily
// difference against a different period than the one labelled underneath it.
//
// Bars diverge from zero because an anomaly has a sign and a magnitude and
// nothing else; a line would imply continuity between a warm January and the
// cool February after it, which is not a trend, just two months.
import { useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import 'chart.js/auto';
import '../../utils/chartDefaults';
import './SiteCharts.css';

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

function SiteMonthlyChart({ payload, height = 300 }) {
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
          // The anomaly on its own is not readable without the value it came
          // from and the normal it was measured against.
          afterBody: (items) => {
            const p = points[items[0].dataIndex];
            if (!p) return '';
            const lines = [];
            if (p.value != null) lines.push(`Value        ${p.value.toFixed(1)}`);
            if (p.site_normal != null) lines.push(`Your normal  ${p.site_normal.toFixed(1)}`);
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
      y: { grid: { color: 'rgba(0,0,0,0.06)' },
           title: { display: true, text: 'difference from normal' } },
    },
  }), [points]);

  if (!all.length) return <p className="site-chart__empty">Nothing to show yet.</p>;

  return (
    <div className="site-monthly">
      <div className="site-monthly__windows" role="group" aria-label="Period">
        {WINDOWS.map((w) => (
          <button
            key={w.key}
            type="button"
            className={`site-monthly__window${w.key === window ? ' is-active' : ''}`}
            onClick={() => setWindow(w.key)}
          >
            {w.label}
          </button>
        ))}
      </div>
      <div className="site-chart" style={{ height }}>
        <Bar data={data} options={options} />
      </div>
      <p className="site-chart__note">
        Measured against this site&rsquo;s own {payload?.meta?.baseline} average.
        {payload?.meta?.regional_comparison
          ? ' The same period is used for the regional figure in the tooltip, so the two are directly comparable.'
          : ' This site sits outside every mapped wine region, so there is no regional figure.'}
      </p>
    </div>
  );
}

export default SiteMonthlyChart;
