// components/climate/PropertySeasonChart.jsx — this property against its region,
// by vintage. Ported from the Insights Pro page's SiteSeasonChart on 2026-09-23;
// same payload, same rules, so the two products cannot tell a grower two
// different stories about the same 500 m cell.
//
// The regional background is a BAND (p10..p90 across planted cells) with the
// mean inside it, and the property's own line on top. "Warmer than the regional
// mean" is true of half the region; "above the range 90% of the region sits in"
// is the statement worth reading, and only the band can make it.
//
// FROST IS THE EXCEPTION. For frost metrics the server sends the regional mean
// and nothing else — no site value, no band — because the 500 m surfaces model
// no cold-air drainage, and a point drawn inside or outside a regional spread is
// exactly the site-versus-neighbour claim they cannot support. This reads
// `series.regional_only` rather than inferring it from nulls, so a withheld
// value and a missing one stay distinguishable.
//
// The band is two datasets with a fill between them, which is Chart.js's only
// way to express one. Both are hidden from the legend and collapsed into a
// single tooltip line: a reader wants "the region", not "p10" and "p90".
import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import 'chart.js/auto';
import '../../utils/chartDefaults';
import './PropertyCharts.css';

const SITE_COLOUR = '#3d4632';
const ZONE_COLOUR = '#8a9a5b';
const BAND_FILL = 'rgba(138, 154, 91, 0.18)';

// A day-of-year is stored as a number and MEANS a date. 288 is not a quantity
// anybody recognises; "15 Oct" is. The axis, the tooltip and the range all go
// through this, so the chart never shows the raw ordinal.
//
// A non-leap reference year: these are climatological average days, so the
// leap-day offset is noise against their spread.
function doyLabel(doy) {
  if (doy == null) return '—';
  const d = new Date(Date.UTC(2001, 0, 1));
  d.setUTCDate(d.getUTCDate() + Math.round(doy) - 1);
  return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

const isDoy = (series) => series?.metric === 'last_spring_frost_doy';

function PropertySeasonChart({ series, propertyName = 'This property',
                               zoneName, height = 320 }) {
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
        label: propertyName,
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
  }, [points, hasZone, regionalOnly, propertyName, zoneName]);

  const options = useMemo(() => {
    const dates = isDoy(series);
    const show = (v) => (v == null ? '—' : (dates ? doyLabel(v) : v.toFixed(1)));
    return {
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
            label: (ctx) => {
              if (ctx.dataset.label === 'p10') return null;
              if (ctx.dataset.label === 'p90') {
                const lo = ctx.chart.data.datasets[0].data[ctx.dataIndex];
                const hi = ctx.parsed.y;
                if (lo == null || hi == null) return null;
                return dates
                  ? `Regional range  ${doyLabel(lo)} – ${doyLabel(hi)}`
                  : `Regional range  ${lo.toFixed(0)}–${hi.toFixed(0)}`;
              }
              return `${ctx.dataset.label}  ${show(ctx.parsed.y)}`;
            },
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 12 } },
        y: {
          // A date axis reads as dates. The unit title is dropped with it —
          // "day of year" over an axis of months is the label contradicting
          // the ticks.
          title: {
            display: Boolean(series?.unit) && !dates,
            text: dates ? '' : (series?.unit || ''),
          },
          grid: { color: 'rgba(0,0,0,0.06)' },
          ticks: dates ? { callback: (v) => doyLabel(v) } : undefined,
        },
      },
    };
  }, [series]);

  if (!points.length) {
    return <p className="pch-empty">No values for this metric yet.</p>;
  }

  // Nothing drawable is not the same as nothing to say. A frost metric at a
  // property outside every mapped region withholds the site's own values AND
  // has no regional average to fall back on, which drew an empty 0-to-1 axis
  // above two paragraphs explaining why. The paragraphs are the answer.
  const drawable = data.datasets.some((d) => d.data.some((v) => v != null));
  if (!drawable) {
    return (
      <>
        {regionalOnly && <p className="pch-note">{series.regional_only_reason}</p>}
        <p className="pch-note">
          There is nothing to chart for this metric at this property: its own
          values are withheld and it sits outside every mapped wine region, so
          there is no regional average to show instead.
        </p>
      </>
    );
  }

  // The notes sit OUTSIDE the sized box. `.pch-chart` carries an explicit
  // height for the canvas to fill, so anything rendered inside it is laid over
  // the chart — which is exactly what happened on 2026-09-23: the
  // outside-every-region note landed on top of the r99p note beneath it.
  return (
    <>
      <div className="pch-chart" style={{ height }}>
        <Line data={data} options={options} />
      </div>
      {regionalOnly && (
        // The reason travels with the payload rather than being restated here,
        // so the API and the page cannot give two accounts of why this
        // property's own line is missing.
        <p className="pch-note">{series.regional_only_reason}</p>
      )}
      {!hasZone && (
        <p className="pch-note">
          This property&rsquo;s point sits outside every mapped wine region, so
          there is no regional background to compare against.
        </p>
      )}
    </>
  );
}

export default PropertySeasonChart;
