// components/pro/SiteSeasonChart.jsx — your site against its region, by vintage.
//
// The chart IS the product claim. A single line of site values would be a
// prettier version of a number the subscriber could eyedrop off the Atlas; what
// they are paying for is the context — where their site sits inside the spread
// of real vineyards around it.
//
// So the regional background is drawn as a BAND (p10..p90 across planted cells)
// with the mean inside it, and the site sits on top. "Warmer than the regional
// mean" is a weak statement that is true of half the region; "above the range
// 90% of the region sits in" is the one worth paying for, and only the band can
// say it.
//
// FROST IS THE EXCEPTION. For frost metrics the server sends the regional mean
// and nothing else — no site value, no band — because the 500 m surfaces model
// no cold-air drainage, and a site drawn inside or outside a regional spread is
// exactly the site-versus-neighbour claim they cannot support. This component
// reads `series.regional_only` rather than inferring it from null values, so a
// genuinely missing value and a deliberately withheld one stay distinguishable.
//
// The band is two datasets with a fill between them, which is Chart.js's only
// way to express one. They are hidden from the legend and from the tooltip
// individually — a reader wants "the region", not "regional p10" and "regional
// p90" as separate series.
import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import 'chart.js/auto';
import '../../utils/chartDefaults';
import './SiteCharts.css';

const SITE_COLOUR = '#3d4632';
const ZONE_COLOUR = '#8a9a5b';
const BAND_FILL = 'rgba(138, 154, 91, 0.18)';

function SiteSeasonChart({ series, siteLabel = 'Your site', zoneName, height = 320 }) {
  const points = series?.points || [];
  const hasZone = points.some((p) => p.zone_mean != null);
  const regionalOnly = Boolean(series?.regional_only);

  const data = useMemo(() => {
    const labels = points.map((p) => p.vintage);
    const datasets = [];

    if (hasZone && !regionalOnly) {
      // Lower edge first, then upper filling back to it. Order matters:
      // `fill: '-1'` targets the PREVIOUS dataset.
      datasets.push({
        label: 'p10',
        data: points.map((p) => p.zone_p10),
        borderColor: 'transparent',
        pointRadius: 0,
        fill: false,
        order: 3,
      });
      datasets.push({
        label: 'p90',
        data: points.map((p) => p.zone_p90),
        borderColor: 'transparent',
        backgroundColor: BAND_FILL,
        pointRadius: 0,
        fill: '-1',
        order: 3,
      });
    }

    if (hasZone) {
      datasets.push({
        label: zoneName ? `${zoneName} average` : 'Regional average',
        data: points.map((p) => p.zone_mean),
        borderColor: ZONE_COLOUR,
        borderDash: [5, 4],
        borderWidth: 1.6,
        pointRadius: 0,
        fill: false,
        order: 2,
      });
    }

    if (!regionalOnly) {
      datasets.push({
        label: siteLabel,
        data: points.map((p) => p.value),
        borderColor: SITE_COLOUR,
        backgroundColor: SITE_COLOUR,
        borderWidth: 2.2,
        pointRadius: 2,
        pointHoverRadius: 5,
        fill: false,
        order: 1,
      });
    }

    return { labels, datasets };
  }, [points, hasZone, regionalOnly, siteLabel, zoneName]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        // The two band edges are scaffolding, not series.
        labels: { filter: (item) => item.text !== 'p10' && item.text !== 'p90' },
      },
      tooltip: {
        callbacks: {
          // Collapse the band into one line so the tooltip reads as a place
          // rather than as four numbers.
          label: (ctx) => {
            if (ctx.dataset.label === 'p10') return null;
            if (ctx.dataset.label === 'p90') {
              const lo = ctx.chart.data.datasets[0].data[ctx.dataIndex];
              const hi = ctx.parsed.y;
              if (lo == null || hi == null) return null;
              return `Regional range  ${lo.toFixed(0)}–${hi.toFixed(0)}`;
            }
            const v = ctx.parsed.y;
            return `${ctx.dataset.label}  ${v == null ? '—' : v.toFixed(1)}`;
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxTicksLimit: 12 } },
      y: {
        title: { display: Boolean(series?.unit), text: series?.unit || '' },
        grid: { color: 'rgba(0,0,0,0.06)' },
      },
    },
  }), [series?.unit]);

  if (!points.length) {
    return <p className="site-chart__empty">No values for this metric yet.</p>;
  }

  return (
    <div className="site-chart" style={{ height }}>
      <Line data={data} options={options} />
      {regionalOnly && (
        // The reason travels with the payload rather than being restated here,
        // so the API and the page cannot end up giving two different accounts
        // of why the site's own line is missing.
        <p className="site-chart__note">
          {series.regional_only_reason}
        </p>
      )}
      {!hasZone && (
        // Not an error: Pro is not wine-only, and a site outside every zone has
        // no regional background to sit against. Saying so beats a chart that
        // silently shows one line where others show three.
        <p className="site-chart__note">
          This site sits outside every mapped wine region, so there is no
          regional background to compare against.
        </p>
      )}
    </div>
  );
}

export default SiteSeasonChart;
