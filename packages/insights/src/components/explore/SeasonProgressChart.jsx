// components/explore/SeasonProgressChart.jsx — this season against the normal.
//
// Phase 4 of docs/plans/COUNTRY_INDUSTRY_REGIONS_2026-08-24.md.
//
// THREE STATES, and the one that ships today is `not_started`. From May to
// August the season a grower is thinking about has not begun, which is a third
// of every year including 24 August. An empty chart then reads as a broken
// page; "starts in 8 days" reads as an answer. The server decides the state —
// this component never infers it from an empty array.
//
// The normal is drawn for the WHOLE season, not just up to today, so the
// reference line runs ahead of the actual and the reader can see where the
// season is heading rather than where it has been. That is why the payload
// carries `normal_curve` separately from the per-point `gdd10_normal`: the
// aligned values make the tooltip honest, the full curve makes the chart useful.
//
// Chart.js, not ECharts. The platform plan named ECharts but the codebase runs
// Chart.js everywhere (`SiteSeasonChart`, `DiseasePressureExplorer`), it is
// already in the bundle, and adding a second charting library for two charts
// would cost more than it buys. Flagged in the plan rather than done silently.
import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import 'chart.js/auto';
import { CalendarClock, Info } from 'lucide-react';
import './explore.css';

const AXIS = 'rgba(110, 106, 98, 0.9)';   // --text-muted
const GRID = 'rgba(228, 226, 219, 0.7)';  // --border

function Empty({ icon: Icon, children }) {
  return (
    <p className="block__absent">
      <Icon size={15} aria-hidden="true" />
      {children}
    </p>
  );
}

function SeasonProgressChart({ season, metric = 'gdd10' }) {
  const isGdd = metric === 'gdd10';

  const data = useMemo(() => {
    if (!season?.available) return null;

    const actualKey = isGdd ? 'gdd10_cumulative' : 'rain_cumulative';
    const normalKey = isGdd ? 'gdd10_cumulative' : 'rain_cumulative';

    // One shared x-axis of day_of_vintage keeps the two series aligned without
    // the component having to reason about dates. The normal is the longer of
    // the two, so it defines the axis.
    const labels = season.normal_curve.map((p) => p.day_of_vintage);
    const byDoy = new Map(season.series.map((p) => [p.day_of_vintage, p]));

    // The +/- 1 SD band around the normal, but ONLY for GDD — it is the
    // year-to-year spread of season-to-date GDD and there is no equivalent
    // stored for rainfall.
    //
    // It arrives at MONTH ENDS, because `climate_zone_surface_monthly` is the
    // finest per-year record that exists. Interpolating linearly between them
    // is honest at this scale: the spread grows smoothly through a season, and
    // drawing it only at eight points would read as a decoration rather than a
    // band.
    const spread = isGdd ? (season.gdd10_spread || []) : [];
    const bandAt = (doy) => {
      if (spread.length < 2) return null;
      if (doy <= spread[0].day_of_vintage) return spread[0].sd;
      for (let i = 1; i < spread.length; i += 1) {
        const a = spread[i - 1];
        const b = spread[i];
        if (doy <= b.day_of_vintage) {
          const t = (doy - a.day_of_vintage) / (b.day_of_vintage - a.day_of_vintage);
          return a.sd + t * (b.sd - a.sd);
        }
      }
      return spread[spread.length - 1].sd;
    };

    const bandUpper = spread.length
      ? season.normal_curve.map((p) => {
        const sd = bandAt(p.day_of_vintage);
        return sd === null ? null : p[normalKey] + sd;
      }) : null;
    const bandLower = spread.length
      ? season.normal_curve.map((p) => {
        const sd = bandAt(p.day_of_vintage);
        return sd === null ? null : p[normalKey] - sd;
      }) : null;

    return {
      labels,
      datasets: [
        // Band first so it sits behind both lines. Two datasets with a fill
        // between them is Chart.js's only way to express one, and they are kept
        // out of the legend — a reader wants "the usual range", not "upper" and
        // "lower" as separate things to recombine.
        ...(bandUpper ? [{
          label: 'Band upper',
          data: bandUpper,
          borderColor: 'transparent',
          backgroundColor: 'rgba(110, 106, 98, 0.10)',
          fill: '+1',
          pointRadius: 0,
          tension: 0.25,
          order: 4,
        }, {
          label: 'Band lower',
          data: bandLower,
          borderColor: 'transparent',
          fill: false,
          pointRadius: 0,
          tension: 0.25,
          order: 4,
        }] : []),
        {
          label: `1986-2005 normal`,
          data: season.normal_curve.map((p) => p[normalKey]),
          borderColor: 'rgba(110, 106, 98, 0.75)',
          borderDash: [5, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.25,
          fill: false,
        },
        {
          label: `${season.vintage} season`,
          // Nulls past today break the line rather than dragging it to zero,
          // which is what `spanGaps: false` is for. A cumulative series that
          // returns to the axis is a lie about the season ending.
          data: labels.map((doy) => byDoy.get(doy)?.[actualKey] ?? null),
          borderColor: 'rgba(91, 104, 48, 1)',   // --primary, olive
          backgroundColor: 'rgba(91, 104, 48, 0.10)',
          borderWidth: 2.5,
          pointRadius: 0,
          tension: 0.25,
          fill: true,
          spanGaps: false,
        },
      ],
    };
  }, [season, isGdd]);

  if (!season) return null;

  if (season.state === 'not_started') {
    return (
      <div className="block__pending">
        <CalendarClock size={18} aria-hidden="true" />
        <div>
          <strong>{season.reason}</strong>
          <span>
            {season.days_until} day{season.days_until === 1 ? '' : 's'} away.
            {season.normal_available
              ? ' The long-run normal is ready to compare against.'
              : ''}
          </span>
        </div>
      </div>
    );
  }

  if (!season.available) {
    return <Empty icon={Info}>{season.reason}</Empty>;
  }

  const unit = isGdd ? 'GDD' : 'mm';
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'bottom',
        labels: { boxWidth: 12, boxHeight: 2, usePointStyle: false,
                  color: AXIS, font: { size: 12 },
                  filter: (item) => !item.text.startsWith('Band ') },
      },
      tooltip: {
        callbacks: {
          // day_of_vintage means nothing to a reader. The actual series carries
          // real dates; the normal does not, so the title falls back to the day
          // number only when there is no observation to name it by.
          title: (items) => {
            const doy = Number(items[0]?.label);
            const pt = season.series.find((p) => p.day_of_vintage === doy);
            if (!pt) return `Day ${doy} of the season`;
            return new Date(pt.date).toLocaleDateString('en-NZ',
              { day: 'numeric', month: 'short', year: 'numeric' });
          },
          label: (item) => {
            if (item.dataset.label.startsWith('Band ')) return null;
            return `${item.dataset.label}: ${
              item.parsed.y === null ? '—' : `${Math.round(item.parsed.y)} ${unit}`}`;
          },
          // The band is one fact, so it is stated once at the foot of the
          // tooltip rather than as two mystery series inside it.
          afterBody: (items) => {
            if (!isGdd || !(season.gdd10_spread || []).length) return '';
            const doy = Number(items[0]?.label);
            const sp = season.gdd10_spread;
            const near = sp.reduce((best, p) => (
              Math.abs(p.day_of_vintage - doy) < Math.abs(best.day_of_vintage - doy)
                ? p : best), sp[0]);
            return `Shaded: ±1 SD across ${near.n_years} baseline seasons`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: AXIS, maxTicksLimit: 8,
          // Sep-Apr, so the month is the only label worth printing.
          callback(value) {
            const doy = this.getLabelForValue(value);
            const d = new Date(Date.UTC(2000, 6, 1));
            d.setUTCDate(d.getUTCDate() + Number(doy) - 1);
            return d.toLocaleDateString('en-NZ', { month: 'short' });
          },
        },
      },
      y: {
        beginAtZero: true,
        grid: { color: GRID },
        ticks: { color: AXIS },
        title: { display: true, color: AXIS,
                 text: isGdd ? 'Cumulative GDD (base 10)' : 'Cumulative rainfall (mm)' },
      },
    },
  };

  return (
    <div className="block__chart">
      <Line data={data} options={options} />
    </div>
  );
}

export default SeasonProgressChart;
